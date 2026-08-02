/**
 * What the BytePlus vision endpoint accepts, measured against the live API
 * (Seed 2.0 Pro, /responses):
 *
 *   accepted   image/png  image/jpeg  image/jpg  image/webp  image/gif  image/heic
 *   rejected   image/avif, image/svg+xml
 *   rejected   ANY mime containing an uppercase letter — the check is
 *              case-sensitive, so "image/PNG" fails with
 *              InvalidParameter.UnsupportedImageFormat
 *   rejected   images under 14px on either side
 *
 * No DOM here: the server route validates with the same rules the uploader
 * enforces, so a bad value is rejected with a clear message rather than
 * becoming an opaque upstream 400.
 */

/** Formats the upstream accepts, lowercase. */
export const ACCEPTED_IMAGE_MIMES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
] as const;

/** Upstream rejects anything smaller on either side. */
export const MIN_IMAGE_DIMENSION = 14;

/** Is this string something the vision endpoint will accept? */
export function isAcceptedImageSource(value: string): boolean {
  const v = value.trim();
  if (/^https?:\/\//i.test(v)) return true;

  const m = /^data:([^;,]+)[;,]/.exec(v);
  if (!m) return false;
  // Case-sensitive on purpose: the upstream rejects "image/PNG".
  return (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(m[1]);
}

/**
 * Can the UPSTREAM RENDERER fetch this itself?
 *
 * The video model renders server-side and downloads each reference, so unlike
 * the prompt model it cannot take a data URI — and a same-origin
 * `/library-cache/...` URL is equally useless because BytePlus cannot reach
 * localhost. Both fail with InvalidParameter.UnsupportedImageFormat, which
 * reads like a format problem and is really a reachability one.
 */
export function isPubliclyFetchable(value: string): boolean {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return false; // data:, blob:, relative paths
  return !/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(v);
}
