"use client";

/**
 * Creating an edit session from an image — the shared path behind every
 * entry point (the /edit dashboard's drop zone, the Creations-feed pencil,
 * and later the Library action).
 *
 * Intrinsic dimensions are measured here, once, before the session exists.
 * They are not optional metadata: coordinate normalization and output sizing
 * both derive from them, so a ref without them is only half usable. Measuring
 * at creation time means the canvas never has to render an "unmeasured"
 * state, and sizeForEdit never has to guess.
 *
 * Measuring is safe on a cross-origin URL — naturalWidth/naturalHeight are
 * readable without CORS. Only canvas *readback* taints, which is the P2
 * compositing path's problem and is handled separately.
 */

import {
  ALLOWED_IMAGE_MIME,
  MAX_UPLOAD_BYTES,
  imageFormatLabel,
} from "@/lib/media/upload-formats";
import { createEditSession } from "./sessions";
import type { EditSession } from "./types";

export type StartFromUrlOpts = {
  url: string;
  name?: string;
  /** Library asset id, when starting from an existing asset. Recorded as
   *  `derivedFrom` on anything this session renders. */
  assetId?: string;
  bytes?: number;
};

/**
 * How long to wait for an image to report its dimensions.
 *
 * An HTMLImageElement settles ONLY via onload or onerror. A stalled
 * connection — a hung CDN, a captive portal, a request that simply never
 * returns — fires neither, so without this the promise stays pending for the
 * lifetime of the page. Every caller gates a `busy` flag on it, so a hang
 * doesn't just delay the work: it permanently disables the Edit button on
 * that feed row, or every control on the dashboard.
 */
const MEASURE_TIMEOUT_MS = 20_000;

/** Intrinsic size of an image URL. Rejects rather than resolving to 0×0, so
 *  callers can't accidentally persist an unmeasured ref. */
export function measureImage(
  url: string,
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Drop the handlers so a late event can't run after we've settled.
      img.onload = null;
      img.onerror = null;
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        // Cancelling the in-flight fetch; without this the browser keeps the
        // connection open behind a promise nobody is waiting on any more.
        img.src = "";
        reject(new Error("Timed out loading that image — it may be offline."));
      });
    }, MEASURE_TIMEOUT_MS);

    img.onload = () =>
      finish(() => {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (!width || !height) {
          reject(new Error("Could not read the image's dimensions."));
          return;
        }
        resolve({ width, height });
      });

    img.onerror = () =>
      finish(() =>
        reject(new Error("Could not load that image — check the URL.")),
      );

    img.src = url;
  });
}

export async function startEditSessionFromUrl(
  opts: StartFromUrlOpts,
): Promise<EditSession> {
  const { width, height } = await measureImage(opts.url);
  return createEditSession({
    name: opts.name ?? defaultName(opts.url),
    baseRef: {
      url: opts.url,
      width,
      height,
      bytes: opts.bytes,
      assetId: opts.assetId,
    },
  });
}

export async function startEditSessionFromFile(
  file: File,
): Promise<EditSession> {
  // Check against the server's own allow-list, not a loose `image/*`. An
  // iPhone HEIC is an image by that looser test, passes every client gate,
  // and then fails the upload with a raw 415 the user can do nothing with.
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    throw new Error(
      file.type
        ? `${file.name} is a ${file.type.replace("image/", "").toUpperCase()} — use ${imageFormatLabel()}.`
        : `${file.name} isn't a supported image. Use ${imageFormatLabel()}.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `${file.name} is ${formatBytes(file.size)} — the limit is 50 MB.`,
    );
  }

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/library/upload", {
    method: "POST",
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }

  // The uploaded file is now same-origin under /library-cache/, which is
  // what the canvas needs later — measuring the returned URL rather than a
  // blob: URL means the stored dimensions match the stored URL exactly.
  return startEditSessionFromUrl({
    url: data.url,
    name: stripExtension(file.name),
    bytes: file.size,
  });
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function defaultName(url: string): string {
  const tail = url.split("?")[0].split("/").pop();
  return tail ? stripExtension(tail) : "Untitled Edit";
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, "") || "Untitled Edit";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
