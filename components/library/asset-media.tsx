"use client";

/**
 * AssetMedia — render an `<img>` or `<video>` for a Library asset with
 * the canonical URL fallback chain (mirror → proxied original).
 *
 * Why a shared component
 * ----------------------
 * Four sites used to repeat the same render with subtle drift:
 * `app/library/asset-card.tsx`, `app/library/asset-detail.tsx`, and the
 * `SelectedAssetPreview` + `PickerThumb` inside
 * `app/studio/nodes/asset-node.tsx`. Each computed
 * `asset.mirrorUrl ?? mediaProxyUrl(asset.url)` and branched on
 * `asset.kind === "video"` with the same alt-fallback chain. When the
 * mirror lifecycle gains a "retry on failed" path, four files would
 * have to update in lockstep.
 *
 * Variants drive the behavioural differences (`controls` for the
 * detail view, `autoPlay` for the showcase hero, neither for the grid
 * thumbs). The render shape stays one place.
 */

import type { Asset } from "@/lib/library/assets";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";

export type AssetMediaVariant =
  /** Static thumbnail — no controls, no autoplay. Grid cells, picker. */
  | "thumb"
  /** Looping muted preview — autoplays for video, no controls. Asset
   *  Node selected preview. */
  | "preview"
  /** Detail view — full controls for video, normal img for image. */
  | "detail";

export function AssetMedia({
  asset,
  variant,
  className,
}: {
  asset: Asset;
  variant: AssetMediaVariant;
  className?: string;
}) {
  // Prefer the local mirror once §48 has streamed it onto disk — it
  // outlives the BytePlus signed URL and skips the proxy hop. Falls
  // through to the proxy while the mirror is in flight or skipped.
  const url = asset.mirrorUrl ?? mediaProxyUrl(asset.url);
  const poster = asset.thumbUrl ? mediaProxyUrl(asset.thumbUrl) : undefined;
  const altFallback = asset.title || asset.prompt || "asset";

  if (asset.kind === "video") {
    return (
      <video
        src={url}
        poster={poster}
        // Variants flip the user-facing behaviour — the underlying
        // element type stays one. `preload="metadata"` keeps the grid
        // thumb path light; the detail view's controls escalate to a
        // full download anyway.
        controls={variant === "detail"}
        autoPlay={variant === "preview"}
        muted={variant !== "detail"}
        loop={variant !== "detail"}
        playsInline
        preload="metadata"
        className={className}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={poster ?? url}
      alt={altFallback}
      loading={variant === "thumb" ? "lazy" : undefined}
      className={className}
    />
  );
}
