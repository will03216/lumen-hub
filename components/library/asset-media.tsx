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

import { useCallback, useRef, useState } from "react";
import type { Asset } from "@/lib/library/assets";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { mirrorAsset } from "@/lib/library/mirror";

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

  // Recovery for the un-mirrored asset. `mirrorAsset` fires once, fire-and-
  // forget, at the moment the render is committed; if that single attempt
  // lost (offline, server restart mid-request, a burst that outran the
  // 3-slot limiter) nothing ever tried again, and the record was left
  // pointing at a BytePlus signed URL with a 24h `X-Amz-Expires` on it.
  // The failure then surfaces days later as a 403 from /api/media, at which
  // point the bytes are unreachable for good.
  //
  // Loading is the natural second chance: it happens while the user still
  // cares about the asset, and often still inside the signature's lifetime.
  // Retry exactly once per mount — a mirror that fails here has either
  // expired (retrying can't fix it) or hit a server-side fault (retrying in
  // a render loop would hammer it).
  const [dead, setDead] = useState(false);
  const [posterDead, setPosterDead] = useState(false);
  const retried = useRef(false);

  // Grid cells remount per asset (keyed by id), but the single-slot callers —
  // the Asset Node's selected preview, the detail drawer — swap the `asset`
  // prop in place. Without this reset, picking a healthy asset after a broken
  // one would inherit `dead` and render "unavailable" over a perfectly good
  // image. Resetting during render is the sanctioned pattern for this; the
  // re-render happens before anything is committed to the DOM.
  const lastId = useRef(asset.id);
  if (lastId.current !== asset.id) {
    lastId.current = asset.id;
    retried.current = false;
    setDead(false);
    setPosterDead(false);
  }

  const onError = useCallback(() => {
    // The still-image branch below prefers `thumbUrl` over `url`. That is a
    // second signed URL on its own expiry clock, and mirroring `asset.url`
    // would repair the wrong one — so a poster failure demotes to the full
    // asset first, and only its failure counts as a real one.
    //
    // Videos are excluded deliberately: a <video>'s onError fires for the
    // media resource, never for a poster that failed to decode. Demoting
    // here would swallow a real media error and, because `src` is unchanged
    // by it, no second error would ever arrive to reach the mirror retry.
    if (asset.kind !== "video" && poster && !posterDead) {
      setPosterDead(true);
      return;
    }
    // A mirror URL is same-origin and static: if it 404s the file is gone,
    // and re-mirroring from an almost-certainly-expired source won't help.
    if (asset.mirrorUrl || retried.current) {
      setDead(true);
      return;
    }
    retried.current = true;
    // `mirrorAsset` writes `mirrorUrl` back to the store on success, which
    // re-renders this component through the asset subscription. On failure
    // it records `mirrorStatus: "failed"` and we show the placeholder.
    void mirrorAsset(asset).then((patched) => {
      if (!patched?.mirrorUrl) setDead(true);
    });
  }, [asset, poster, posterDead]);

  if (dead) {
    return (
      <div
        className={`grid place-items-center bg-panel text-center font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute ${className ?? ""}`}
        title={`${altFallback} — source expired and no local copy was mirrored`}
      >
        unavailable
      </div>
    );
  }

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
        onError={onError}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={posterDead ? url : (poster ?? url)}
      alt={altFallback}
      loading={variant === "thumb" ? "lazy" : undefined}
      className={className}
      onError={onError}
    />
  );
}
