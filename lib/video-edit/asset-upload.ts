"use client";

/**
 * Keyframe → BytePlus asset. PRD §9.
 *
 * This is a CORRECTNESS feature, not plumbing. Real footage contains people,
 * and a plain HTTPS URL of a human frame handed to Seedance comes back as
 * `InputImageSensitiveContentDetected.PrivacyInformation` — rejected at the
 * input stage, before a token of the prompt is read. Ingesting through the
 * Assets API makes the platform treat the image as an authorized creation-flow
 * upload and the check passes.
 *
 * ── Every keyframe is uploaded. Unconditionally. ─────────────────────────
 *
 * There is no face detector and there should not be one. A detector adds a
 * failure mode whose false negatives are exactly the case that breaks, and buys
 * nothing: ingest is a few seconds and idempotent per session.
 *
 * ── The chain, and why the TOS hop is not optional ───────────────────────
 *
 *   frame bytes → /api/modelark/groups        → groupId  (once per session)
 *               → /api/modelark/assets/upload → TOS public URL + assetId
 *               → poll /api/modelark/assets/:id → Active
 *
 * `CreateAsset` fetches the URL from BytePlus's own network. `/library-cache/…`
 * is a path on our container — not resolvable from ModelArk, and possibly not
 * public at all. Skipping the TOS hop produces a `Failed` asset with an opaque
 * message, which is the single easiest way to lose an afternoon here.
 *
 * The PRD specified a new TOS route for this. It turned out not to be needed:
 * `/api/modelark/assets/upload` already does TOS + CreateAsset in one call, so
 * the chain reuses it and the feature ships with no new server surface at all.
 * It costs one round-trip of the bytes through the browser, which is the right
 * trade against a second route doing what an existing one already does.
 */

import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import {
  ASSET_ASPECT_MAX,
  ASSET_ASPECT_MIN,
  ASSET_IMAGE_MAX_SIDE,
  ASSET_IMAGE_MIN_SIDE,
  REF_VIDEO_MAX_BYTES,
} from "./types";

/** GetAsset settles in 2–10s typically. Past this it is stuck, and the user is
 *  better served by a warning they can act on than by an indefinite spinner. */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 20; // 60s

export type IngestResult = {
  assetId: string;
  /** The asset's own URL, as GetAsset reports it. This — not the library URL —
   *  is what a bookend variant puts on the wire, because `image_url` takes a
   *  URL and not an `asset://` ref. */
  assetUrl?: string;
};

// ─────────────────────────── Pre-flight ───────────────────────────────────

export type BoundsCheck = { ok: boolean; reason?: string };

/**
 * Reject a frame the Assets API will reject anyway, with a reason the user can
 * act on.
 *
 * The API's own error for an out-of-bounds image arrives asynchronously, on a
 * `Failed` asset, minutes after the grab that caused it — by which point the
 * user has moved on. Checking at grab time turns that into "this crop is too
 * wide to upload" while they are still looking at the crop.
 */
export function checkAssetImageBounds(
  width: number,
  height: number,
): BoundsCheck {
  if (!width || !height) {
    return { ok: false, reason: "The frame has no dimensions." };
  }
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  if (short < ASSET_IMAGE_MIN_SIDE) {
    return {
      ok: false,
      reason: `Frames must be at least ${ASSET_IMAGE_MIN_SIDE}px on every side — this one is ${short}px.`,
    };
  }
  if (long > ASSET_IMAGE_MAX_SIDE) {
    return {
      ok: false,
      reason: `Frames cap at ${ASSET_IMAGE_MAX_SIDE}px per side — this one is ${long}px.`,
    };
  }
  const aspect = width / height;
  if (aspect < ASSET_ASPECT_MIN || aspect > ASSET_ASPECT_MAX) {
    return {
      ok: false,
      reason: `The asset library accepts aspect ratios from ${ASSET_ASPECT_MIN} to ${ASSET_ASPECT_MAX}; this frame is ${aspect.toFixed(2)}.`,
    };
  }
  return { ok: true };
}

// ─────────────────────────── The chain ────────────────────────────────────

/** Upload a data URI (or fetchable URL) to our own cache, returning a
 *  same-origin URL. Shared with the image editor's upload path. */
export async function uploadFrameToLibrary(
  dataUrl: string,
  filename: string,
): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("file", new File([blob], filename, { type: blob.type || "image/jpeg" }));

  const res = await fetch("/api/library/upload", { method: "POST", body: form });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? `Frame upload failed (${res.status})`);
  }
  return data.url;
}

/**
 * Create the session's asset group. Called once, lazily.
 *
 * Name is capped at 64 chars because that is the API's own limit and a session
 * name is free text — a long one would fail the whole chain at its first step.
 */
export async function createGroup(name: string): Promise<string> {
  const res = await fetch("/api/modelark/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: name.slice(0, 64),
      description: "Keyframes from a Lumen Hub smart video edit",
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    byteplusGroupId?: string;
    error?: string;
  };
  if (!res.ok || !data.byteplusGroupId) {
    throw new Error(data.error ?? `Could not create an asset group (${res.status})`);
  }
  return data.byteplusGroupId;
}

/**
 * Push bytes to TOS and register them as an asset, in one call.
 *
 * Returns before the asset is usable — ingest is asynchronous and starts in
 * `Processing`. The returned `assetUrl` is the TOS public URL, which is what a
 * bookend variant puts on the wire (`image_url` takes a URL, not `asset://`).
 */
export async function uploadAndRegister(
  blob: Blob,
  filename: string,
  groupId: string,
  signal?: AbortSignal,
): Promise<IngestResult> {
  const form = new FormData();
  form.append(
    "file",
    new File([blob], filename, { type: blob.type || "image/jpeg" }),
  );
  form.append("groupId", groupId);

  const res = await fetch("/api/modelark/assets/upload", {
    method: "POST",
    body: form,
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as {
    assetId?: string;
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.assetId) {
    throw new Error(data.error ?? `Asset registration failed (${res.status})`);
  }
  return { assetId: data.assetId, assetUrl: data.url };
}

export async function pollUntilActive(
  assetId: string,
  signal?: AbortSignal,
): Promise<IngestResult> {
  for (let i = 0; i < POLL_MAX_TRIES; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const res = await fetch(`/api/modelark/assets/${assetId}`, { signal });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      url?: string;
      errorMessage?: string;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? `Asset poll failed (${res.status})`);
    }
    if (data.status === "Active") {
      return { assetId, assetUrl: data.url };
    }
    if (data.status === "Failed") {
      // The upstream message is the useful part — it says whether the frame was
      // rejected for size, format or content, and each has a different fix.
      throw new Error(
        data.errorMessage ??
          "The asset library rejected this frame. Try a different frame or crop.",
      );
    }
  }
  throw new Error(
    "The frame is still processing after 60s. It may still land — check the keyframe again shortly.",
  );
}

/**
 * The whole chain for one frame: fetch → upload → register → wait for Active.
 *
 * Takes a URL rather than bytes so it serves every caller — a fresh grab
 * (already on /library-cache/), a Seedream output (an https CDN URL), or a
 * retry of either. It deliberately does not touch the store: a hook, a retry
 * button and the agent's executor all need this chain, and three copies of the
 * write-back logic would drift.
 *
 * The fetch goes through the media proxy when the URL is a BytePlus CDN one —
 * without it the browser cannot read the bytes back out cross-origin, and the
 * failure surfaces as an opaque "Failed to fetch".
 */
export async function ingestFrame(opts: {
  url: string;
  groupId: string;
  filename?: string;
  signal?: AbortSignal;
}): Promise<IngestResult> {
  const res = await fetch(mediaProxyUrl(opts.url), { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`Could not read the frame back for upload (${res.status})`);
  }
  const blob = await res.blob();

  const registered = await uploadAndRegister(
    blob,
    opts.filename ?? "keyframe.jpg",
    opts.groupId,
    opts.signal,
  );
  const settled = await pollUntilActive(registered.assetId, opts.signal);
  // Prefer the TOS URL we uploaded to. GetAsset's own URL field is not
  // consistently populated across asset types, and an undefined here would
  // silently push a bookend back onto the un-ingested library URL.
  return { assetId: settled.assetId, assetUrl: registered.assetUrl ?? settled.assetUrl };
}

/**
 * The same chain for the source CLIP.
 *
 * Separate from `ingestFrame` because the limits are different and much
 * tighter — a reference video must be 2–15s, 480p or 720p, ≤50 MB — and
 * because a failure here means something different: an image that will not
 * ingest costs one reference, a clip that will not ingest costs the whole
 * "re-render my video" premise.
 */
export async function ingestVideo(opts: {
  url: string;
  groupId: string;
  filename?: string;
  signal?: AbortSignal;
}): Promise<IngestResult> {
  const res = await fetch(mediaProxyUrl(opts.url), { signal: opts.signal });
  if (!res.ok) {
    throw new Error(`Could not read the clip back for upload (${res.status})`);
  }
  const blob = await res.blob();

  if (blob.size > REF_VIDEO_MAX_BYTES) {
    throw new Error(
      `The clip is ${(blob.size / 1024 / 1024).toFixed(0)} MB and a reference video caps at 50 MB. Export it smaller or trim it.`,
    );
  }

  const registered = await uploadAndRegister(
    blob,
    opts.filename ?? "source.mp4",
    opts.groupId,
    opts.signal,
  );
  const settled = await pollUntilActive(registered.assetId, opts.signal);
  return {
    assetId: settled.assetId,
    assetUrl: registered.assetUrl ?? settled.assetUrl,
  };
}
