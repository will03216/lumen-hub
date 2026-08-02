"use client";

/**
 * Normalise an uploaded image into something the BytePlus vision endpoint
 * will actually accept.
 *
 * Measured against the live API (Seed 2.0 Pro, /responses):
 *
 *   accepted   image/png  image/jpeg  image/jpg  image/webp  image/gif  image/heic
 *   rejected   image/avif, image/svg+xml
 *   rejected   ANY mime with an uppercase letter — the check is case-sensitive,
 *              so "image/PNG" fails with InvalidParameter.UnsupportedImageFormat
 *   rejected   images under 14px on either side
 *
 * `<input accept="image/*">` happily yields AVIF, SVG, BMP and TIFF, and the
 * browser's reported type is whatever the OS says — so passing the raw
 * FileReader data URI straight through produces a cryptic upstream 400.
 *
 * Rather than maintain a blocklist, decode the file with the browser (which
 * handles every format it can display) and re-encode to JPEG. That normalises
 * the mime, bounds the pixel size, and shrinks the data URI — which matters
 * because up to 6 of these ride along in a single request.
 */

import {
  ACCEPTED_IMAGE_MIMES,
  isAcceptedImageSource,
  MIN_IMAGE_DIMENSION,
} from "./image-format";

export { ACCEPTED_IMAGE_MIMES, isAcceptedImageSource, MIN_IMAGE_DIMENSION };

/** Cap on the long edge. Reference images do not need to be huge, and a 4K
 *  data URI would dominate the request body. */
const MAX_DIMENSION = 1280;

const JPEG_QUALITY = 0.9;

export class ImageNormalizeError extends Error {}

/**
 * Decode → downscale → re-encode as JPEG.
 *
 * Transparency is flattened onto white: JPEG has no alpha, and the alternative
 * (PNG) produces data URIs several times larger. Reference images are
 * photographic in practice, so this is the right trade.
 */
export async function normalizeImageForModel(file: File): Promise<string> {
  const bitmap = await decode(file);

  const { width, height } = bitmap;
  if (width < MIN_IMAGE_DIMENSION || height < MIN_IMAGE_DIMENSION) {
    close(bitmap);
    throw new ImageNormalizeError(
      `Image is ${width}×${height}. Minimum is ${MIN_IMAGE_DIMENSION}×${MIN_IMAGE_DIMENSION}.`,
    );
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const w = Math.max(MIN_IMAGE_DIMENSION, Math.round(width * scale));
  const h = Math.max(MIN_IMAGE_DIMENSION, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    close(bitmap);
    throw new ImageNormalizeError("Could not read the image (no canvas context).");
  }
  // Flatten alpha onto white before drawing — without this, transparent
  // regions encode as black in JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h);
  close(bitmap);

  const uri = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  if (!uri.startsWith("data:image/jpeg;base64,")) {
    throw new ImageNormalizeError("Could not re-encode the image.");
  }
  return uri;
}

/** createImageBitmap where available; an <img> element otherwise (Safari, and
 *  the path that handles HEIC when the OS can decode it). */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through — some browsers refuse formats they can still render.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () =>
        reject(new ImageNormalizeError("That file isn't an image this browser can read."));
      img.src = url;
    });
  } finally {
    // Revoked after load: the bitmap has already been rasterised by the time
    // the promise settles, and leaking the URL would retain the file.
    URL.revokeObjectURL(url);
  }
}

function close(b: ImageBitmap | HTMLImageElement): void {
  if (typeof ImageBitmap !== "undefined" && b instanceof ImageBitmap) b.close();
}
