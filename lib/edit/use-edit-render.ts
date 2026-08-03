"use client";

/**
 * The render loop for the editor.
 *
 * Wraps /api/image rather than forking it. That route already carries strict
 * BYOK (402 on a missing key), 1:1 upstream status forwarding so the error
 * classifier can dispatch on it, the fal branch, and a 300s maxDuration. A
 * parallel "edit" route would duplicate all of that and drift from it.
 *
 * Three stages, split so the first is pure and testable:
 *
 *   buildEditRequest   session -> prompt + per-ref transport plan   (pure)
 *   resolveWireImages  plan -> the actual image[] payload           (async, DOM)
 *   render             fetch, patch the version, stage to Library   (hook)
 *
 * The version record is written BEFORE the request goes out, as `pending`,
 * and patched on settle. That ordering is what lets a render survive a
 * refresh mid-flight: the row is already in the store, so the workspace shows
 * it as failed rather than losing the instruction and compiled prompt that
 * produced it.
 */

import * as React from "react";
import { classifyError, type ErrorClass } from "@/lib/compare/error-class";
import { requestImage } from "@/lib/compare/request-image";
import { stageGeneratedImage } from "@/lib/library/auto-save";
import { modelMaxPixels } from "@/lib/studio/models";
import {
  compileAnnotationPrompt,
  type CompiledRefPlan,
} from "./annotation-prompt";
import { renderComposite } from "./composite";
import { dataUriBytes } from "./curl";
import { resolveSafeUrl } from "./same-origin";
import {
  appendVersion,
  getEditSession,
  newEditId,
  patchVersion,
} from "./sessions";
import { sizeForEdit } from "./size";
import type {
  Annotation,
  EditReference,
  EditSession,
  EditVersion,
} from "./types";

/**
 * Ceiling for what we send *in*. There is no point feeding the model more
 * detail than it can emit, and an un-downscaled 6000×4000 composite base64s
 * to tens of megabytes of JSON. Falls back for models with no declared
 * ceiling (the fal-hosted one).
 */
function maxInputPixels(modelId: string): number {
  return modelMaxPixels(modelId) ?? 4_194_304;
}

/**
 * Re-encode as JPEG only when the source format provably cannot carry alpha.
 *
 * Canvas readback always produces RGBA, and toDataURL("image/jpeg")
 * composites that onto BLACK. So re-encoding a transparent PNG — a logo, a
 * cut-out product shot — as JPEG hands the model a black background it will
 * faithfully preserve. The failure is silent and looks like a model artifact.
 *
 * JPEG is still worth having for photographs, where it is several times
 * smaller than PNG and the request is base64. So the rule is: only formats
 * that definitionally have no alpha channel get the smaller encoding, and
 * anything that might carry transparency keeps it.
 */
function encodingFor(url: string): "image/png" | "image/jpeg" {
  const path = (url.split("?")[0] ?? "").toLowerCase();
  if (url.startsWith("data:image/jpeg") || url.startsWith("data:image/jpg")) {
    return "image/jpeg";
  }
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  // PNG, WebP, GIF, and anything unrecognised — assume alpha is possible.
  return "image/png";
}

// ─────────────────────────── Request building ─────────────────────────────

export type EditRequest = {
  prompt: string;
  model: string;
  size: string;
  seed?: number;
  /** Refs in wire order — parallel to the eventual image[] array. */
  orderedRefs: EditReference[];
  refIds: string[];
  plans: CompiledRefPlan[];
  warnings: string[];
};

/**
 * Pure: session -> everything about the request that doesn't need the DOM.
 *
 * The prompt includes the compiled `<point>` / `<bbox>` coordinate tags. The
 * plans say, per reference, whether the clean image will do or whether the
 * hand-drawn markup has to be burned into a copy first.
 */
export function buildEditRequest(session: EditSession): EditRequest {
  // Base ref first: it is the image being edited, and Seedream treats the
  // first entry of image[] as the subject when several are supplied.
  const orderedRefs = [
    ...session.refs.filter((r) => r.role === "base"),
    ...session.refs.filter((r) => r.role !== "base"),
  ];
  const base = orderedRefs[0];

  const compiled = compileAnnotationPrompt({
    instruction: session.instruction.trim(),
    refs: orderedRefs.map((r, i) => ({
      index: i + 1, // 1-based, matching the wire array
      refId: r.id,
      width: r.width,
      height: r.height,
      role: r.role,
      label: r.label,
      annotations: r.annotations,
    })),
  });

  return {
    prompt: compiled.prompt,
    model: session.model,
    size: sizeForEdit({
      width: base?.width ?? 0,
      height: base?.height ?? 0,
      modelId: session.model,
      aspectRatio: session.aspectRatio,
      qualityId: session.qualityId,
    }),
    seed: session.seed,
    orderedRefs,
    refIds: orderedRefs.map((r) => r.id),
    plans: compiled.plans,
    warnings: compiled.warnings,
  };
}

/**
 * Turn the plan into the actual `image` payload.
 *
 * Two things force this to be more than "send the URLs":
 *
 * · A ref carrying brush or arrow markup has to be rasterised, because those
 *   annotations have no representation in the prompt.
 *
 * · A local URL (`/library-cache/…`) is same-origin to *us* and unreachable
 *   from BytePlus's servers. Anything not absolute-http must be inlined as a
 *   data URI or the upstream fetch silently gets nothing. This is the whole
 *   reason uploads can't just be passed through by path.
 *
 * Remote https URLs are passed through untouched — letting the model fetch
 * them directly avoids base64-ing megabytes through our own request.
 */
export async function resolveWireImages(
  req: EditRequest,
): Promise<string | string[] | undefined> {
  const images = (await resolveWirePayloads(req)).map((p) => p.value);
  if (images.length === 0) return undefined;
  return images.length === 1 ? images[0] : images;
}

/** One resolved reference, with enough about it to show someone. */
export type WirePayload = {
  refId: string;
  /** 1-based wire position — the number the `<bbox>` tags refer to. */
  index: number;
  label?: string;
  role: EditReference["role"];
  /** Exactly what goes into `image[]`: a URL, or a data URI. */
  value: string;
  /** Where those bytes came from — the reference's own URL. Kept beside the
   *  payload so an inspector can put the two side by side without going back
   *  to the session. */
  sourceUrl: string;
  /** Whether markup was burned into these bytes. */
  transport: "clean" | "composite";
  /** Decoded size, for a data URI. Undefined for a passed-through URL, whose
   *  bytes we never handle — BytePlus fetches it themselves. */
  bytes?: number;
};

/**
 * The wire images WITH their provenance.
 *
 * Exists so the request inspector can show the actual bytes rather than a
 * description of them — "is it sending the edited image or the clean one?" is
 * a question about this exact array, and answering it from a reimplementation
 * would answer a different question. `resolveWireImages` is a projection of
 * this, so the preview and the render cannot disagree.
 */
export async function resolveWirePayloads(
  req: EditRequest,
): Promise<WirePayload[]> {
  const cap = maxInputPixels(req.model);

  return Promise.all(
    req.orderedRefs.map(async (ref, i) => {
      const plan = req.plans.find((p) => p.refId === ref.id);
      const transport = plan?.transport ?? "clean";
      const value = await toWireImage(ref, {
        maxPixels: cap,
        annotations: transport === "composite" ? ref.annotations : [],
      });
      return {
        refId: ref.id,
        index: i + 1,
        label: ref.label,
        role: ref.role,
        value,
        sourceUrl: ref.url,
        transport,
        bytes: dataUriBytes(value),
      };
    }),
  );
}

/**
 * One reference → something BytePlus can actually consume.
 *
 * Exported because EVERY caller that sends an image upstream needs this, and
 * the one that reimplemented it got it wrong: layer separation posted
 * `/library-cache/upload-x.png` straight through, which is same-origin to us
 * and unreachable from BytePlus's servers, so the call failed every time on
 * the two commonest entry paths. Anything that builds an upstream request
 * should call this rather than reading `ref.url`.
 *
 * Remote https URLs pass through untouched — letting the model fetch them
 * directly avoids base64-ing megabytes through our own request. Everything
 * else is inlined as a data URI, downscaled to the model's own pixel ceiling,
 * with `annotations` burned in when the caller wants markup visible.
 */
export async function toWireImage(
  ref: EditReference,
  opts: {
    maxPixels: number;
    /** Marks to draw into the pixels. Empty still gets the
     *  downscale-and-inline pass, which is what a local image needs. */
    annotations?: Annotation[];
    /** Draw box marks as red rectangles — the convention layer separation's
     *  "separate the element inside the red box" prompt depends on. */
    drawBoxes?: boolean;
  },
): Promise<string> {
  const annotations = opts.annotations ?? [];
  const isRemote = /^https?:/i.test(ref.url);
  if (isRemote && annotations.length === 0 && !opts.drawBoxes) return ref.url;

  const safe = resolveSafeUrl(ref.safeUrl ?? ref.url);
  const { dataUrl } = await renderComposite({
    url: safe.url,
    crossOrigin: safe.crossOrigin,
    width: ref.width,
    height: ref.height,
    annotations,
    drawBoxes: opts.drawBoxes,
    maxPixels: opts.maxPixels,
    mimeType: encodingFor(ref.url),
  });
  return dataUrl;
}

/** The input ceiling for a model, exported for callers building their own
 *  requests (layer separation). */
export { maxInputPixels };

// ─────────────────────────── Hook ─────────────────────────────────────────

export type EditRenderStatus = "idle" | "running" | "success" | "error";

export type EditRenderState = {
  status: EditRenderStatus;
  versionId?: string;
  error?: ErrorClass;
  /** Set when the failure was a missing BYOK key, so the UI can link to
   *  Settings instead of offering a pointless Retry. */
  missingKey?: boolean;
  /** Non-fatal compiler notes (a demoted box, a dropped mark over the cap). */
  warnings?: string[];
  elapsedMs?: number;
};

const IDLE: EditRenderState = { status: "idle" };

export function useEditRender(sessionId: string) {
  const [state, setState] = React.useState<EditRenderState>(IDLE);
  const abortRef = React.useRef<AbortController | null>(null);
  /** The version row appended for the run currently in flight, so an abort
   *  can reconcile it. Cleared once the run settles it itself. */
  const pendingVersionRef = React.useRef<string | null>(null);

  /**
   * Close out the in-flight version row.
   *
   * Without this an aborted render leaves a row stuck at `pending` forever —
   * it renders a permanently spinning thumbnail, is never reconciled by
   * anything (not even a remount, since the status is persisted), and eats
   * one of the MAX_VERSIONS slots.
   */
  const settleAborted = React.useCallback(() => {
    const versionId = pendingVersionRef.current;
    if (!versionId) return;
    pendingVersionRef.current = null;
    patchVersion(sessionId, versionId, {
      status: "failed",
      error: "Cancelled.",
    });
  }, [sessionId]);

  // An in-flight render outliving the workspace would patch a version for a
  // session nobody is looking at, and leak the controller.
  const settleAbortedRef = React.useRef(settleAborted);
  settleAbortedRef.current = settleAborted;
  React.useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        settleAbortedRef.current();
      }
    };
  }, []);

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    settleAborted();
    setState(IDLE);
  }, [settleAborted]);

  const render = React.useCallback(async () => {
    const session = getEditSession(sessionId);
    if (!session) return;

    const req = buildEditRequest(session);
    if (!req.prompt.trim()) {
      setState({
        status: "error",
        error: classifyError(400, "Describe the edit you want before rendering."),
      });
      return;
    }

    // Supersede any run already in flight rather than racing it.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const startedAt = Date.now();
    const versionId = newEditId();
    appendVersion(sessionId, {
      id: versionId,
      createdAt: startedAt,
      parentId: session.versions.at(-1)?.id,
      instruction: session.instruction,
      compiledPrompt: req.prompt,
      model: req.model,
      size: req.size,
      seed: req.seed,
      refIds: req.refIds,
      annotationsSnapshot: Object.fromEntries(
        session.refs.map((r) => [r.id, r.annotations]),
      ),
      outputs: [],
      status: "pending",
    } satisfies EditVersion);
    pendingVersionRef.current = versionId;
    setState({ status: "running", versionId, warnings: req.warnings });

    try {
      // Rasterising happens before the fetch so a compositing failure — the
      // tainted-canvas case — is reported as itself rather than as an
      // upstream error about a missing image.
      const image = await resolveWireImages(req);
      if (ctrl.signal.aborted) return;

      const res = await requestImage(
        {
          prompt: req.prompt,
          model: req.model,
          size: req.size,
          seed: req.seed,
          image,
        },
        ctrl.signal,
      );

      const data = await res.json().catch(() => ({}) as Record<string, unknown>);

      // Check AFTER reading the body, not only before the fetch. An abort
      // that lands once the response has started makes res.json() reject on
      // the aborted stream; that rejection is swallowed above, res.ok is
      // still true, and without this guard the code would take the success
      // branch with zero outputs — reporting a render the model actually
      // completed (and billed) as "Model returned no image", and skipping
      // the Library write. cancel() has already settled the version row.
      if (ctrl.signal.aborted) return;

      if (!res.ok) {
        const message =
          (data as { error?: string }).error ?? `Request failed (${res.status})`;
        // 402 is the strict-BYOK signal, not a model failure. Retrying it
        // without adding a key just reproduces it.
        const missingKey = res.status === 402;
        patchVersion(sessionId, versionId, {
          status: "failed",
          error: message,
          elapsedMs: Date.now() - startedAt,
        });
        setState({
          status: "error",
          versionId,
          error: classifyError(res.status, message),
          missingKey,
          warnings: req.warnings,
        });
        return;
      }

      const outputs = (
        (data as { data?: Array<{ url?: string; size?: string }> }).data ?? []
      )
        .filter((d): d is { url: string; size?: string } => Boolean(d.url))
        .map((d) => ({ url: d.url, size: d.size }));

      const elapsedMs = Date.now() - startedAt;
      patchVersion(sessionId, versionId, {
        status: outputs.length > 0 ? "done" : "failed",
        outputs,
        error: outputs.length > 0 ? undefined : "Model returned no image.",
        elapsedMs,
      });

      // Into the Library + Creations feed, exactly like any other render.
      //
      // The user's INSTRUCTION goes here, not req.prompt. The compiled prompt
      // carries <point>/<bbox> tags and the raster prose, and asset.prompt is
      // not just display text — the feed's "Reuse prompt" action seeds the
      // Generator with it. Storing the compiled string would show coordinate
      // markup in the feed and, worse, send those tags upstream as literal
      // text on a plain text-to-image render. The compiled prompt is already
      // preserved on the version record, which is where it belongs.
      for (const out of outputs) {
        stageGeneratedImage({
          url: out.url,
          prompt: session.instruction.trim(),
          model: req.model,
          size: out.size ?? req.size,
          seed: req.seed,
          derivedFrom: session.refs[0]?.assetId,
        });
      }

      setState(
        outputs.length > 0
          ? { status: "success", versionId, elapsedMs, warnings: req.warnings }
          : {
              status: "error",
              versionId,
              error: classifyError(502, "Model returned no image."),
              warnings: req.warnings,
            },
      );
    } catch (e) {
      // Abort is the "user pressed Render again" path, not a failure.
      if (e instanceof DOMException && e.name === "AbortError") return;
      const message = e instanceof Error ? e.message : String(e);
      patchVersion(sessionId, versionId, {
        status: "failed",
        error: message,
        elapsedMs: Date.now() - startedAt,
      });
      setState({
        status: "error",
        versionId,
        error: classifyError(undefined, message),
        warnings: req.warnings,
      });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      // Only clear if this run still owns the row. A cancel will already have
      // settled and cleared it, and a superseding run will have claimed it.
      if (pendingVersionRef.current === versionId) {
        pendingVersionRef.current = null;
      }
    }
  }, [sessionId]);

  return { state, render, cancel };
}
