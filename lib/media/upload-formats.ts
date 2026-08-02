/**
 * Which image formats an upload accepts — the single source of truth.
 *
 * This exists as its own module so the client can check a file BEFORE
 * uploading it without importing the route handler (which pulls in fs, path
 * and crypto, and has no business in a browser bundle). Keeping two copies in
 * sync by hand is how you end up with a picker that accepts a file the server
 * then rejects with a raw 415.
 *
 * That mismatch was real: the editor's drop zone accepted `image/*`, so an
 * iPhone HEIC — the platform default — passed every client check and failed
 * server-side with an unhelpful "Unsupported file type: image/heic".
 *
 * Deliberately dependency-free: no next/server, no node builtins, nothing
 * that would make it unsafe to import from a "use client" module.
 */

/** Image MIME types the upload route will store. */
export const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Seedream accepts bmp and tiff as edit inputs, so refusing them at upload
  // would block a format the model itself supports.
  "image/bmp",
  "image/tiff",
]);

export const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

/** MIME -> on-disk extension. */
export const UPLOAD_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

/** 50 MB, matched on both sides of the upload. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/** A file input `accept` string that matches what the server will take. */
export const IMAGE_ACCEPT_ATTR = [...ALLOWED_IMAGE_MIME].join(",");

/** Short human list for UI copy — "PNG, JPEG, WebP…". */
export function imageFormatLabel(): string {
  return "PNG, JPEG, WebP, GIF, BMP or TIFF";
}
