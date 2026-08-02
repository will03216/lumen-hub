"use client";

/**
 * CreationRow — a single horizontal row in the Creations feed.
 *
 * Replaces the per-tab Drafts/Saved bands inside each Generator. One row
 * shape covers image / video / audio + pending in-flight states. Layout
 * mirrors Freepik: prompt + meta on the top line, media tile + corner
 * badges below, hover reveals pin/delete chips at the bottom-right.
 *
 * Click anywhere on the tile opens the media URL in a new tab (handy for
 * downloading or sharing); pin/delete sit on their own chips so the user
 * has explicit affordances and can't fat-finger them while scrolling.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  Download,
  Heart,
  Pencil,
  RotateCw,
  Trash2,
  Video,
} from "lucide-react";
import type { Asset } from "@/lib/library/assets";
import { removeAsset, updateAsset } from "@/lib/library/assets";
import { startEditSessionFromUrl } from "@/lib/edit/start-session";
import type { CreationEntry } from "@/lib/library/feed";
import { AssetMedia } from "@/components/library/asset-media";
import { BrandLogo, resolveModelBrand } from "@/components/ui/brand-logo";
import { relativeTime } from "@/lib/library/time";
import { cn } from "@/lib/utils";

// ─────────────────────────── Row dispatcher ─────────────────────────────

export function CreationRow({ entry }: { entry: CreationEntry }) {
  if (entry.type === "asset") return <AssetRow asset={entry.asset} />;
  if (entry.type === "pending-image") return <PendingRow kind="image" prompt={entry.pending.prompt} size={entry.pending.size} />;
  return <PendingRow kind="video" prompt={entry.pending.prompt} size={entry.pending.ratio} />;
}

// ─────────────────────────── Saved asset row ────────────────────────────

function AssetRow({ asset }: { asset: Asset }) {
  const router = useRouter();
  const [busyPin, setBusyPin] = React.useState(false);
  const [busyDelete, setBusyDelete] = React.useState(false);
  const [busyEdit, setBusyEdit] = React.useState(false);

  /**
   * Create an edit session seeded with this asset, then soft-navigate to it.
   *
   * Async because the session needs the image's intrinsic dimensions before
   * it exists — coordinate normalization and output sizing both derive from
   * them, so a ref without them is only half usable.
   *
   * Prefers the local mirror when there is one: it's same-origin, which is
   * what the canvas needs once compositing lands, and it doesn't expire the
   * way a signed CDN URL does.
   */
  async function onEdit(e: React.MouseEvent) {
    e.stopPropagation();
    if (busyEdit) return;
    setBusyEdit(true);
    try {
      const session = await startEditSessionFromUrl({
        url: asset.mirrorUrl ?? asset.url,
        assetId: asset.id,
        name: asset.title,
      });
      // Soft-nav, unlike onReusePrompt's hard navigation — /edit/[id] reads
      // its state from the store, not from query params, so there's nothing
      // for a full page load to hydrate.
      router.push(`/edit/${session.id}`);
    } catch {
      // Measuring failed (expired signed URL, blocked host). Re-enable so
      // the user can retry rather than being left with a dead control.
      setBusyEdit(false);
    }
  }

  function onTogglePin(e: React.MouseEvent) {
    e.stopPropagation();
    if (busyPin) return;
    setBusyPin(true);
    updateAsset(asset.id, { pinned: !asset.pinned });
    // Optimistic; subscribeAssets will re-render.
    setTimeout(() => setBusyPin(false), 200);
  }

  function onDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (busyDelete) return;
    if (!confirm("Delete this creation? This cannot be undone.")) return;
    setBusyDelete(true);
    removeAsset(asset.id);
  }

  const [copied, setCopied] = React.useState(false);
  function onCopyPrompt(e: React.MouseEvent) {
    e.stopPropagation();
    if (!asset.prompt) return;
    void navigator.clipboard?.writeText(asset.prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  function onReusePrompt(e: React.MouseEvent) {
    e.stopPropagation();
    // Hard navigate so `hydrateFromQuery` on the server reseeds the
    // matching Generator with a fresh mount. A soft router.push would
    // update the URL but the already-mounted generator's useState
    // initializer wouldn't re-fire, leaving the form unchanged.
    const url = reuseUrlForAsset(asset);
    if (typeof window !== "undefined") {
      window.location.href = url;
    }
  }

  const meta = formatMeta(asset);
  // `asset.kind` is narrowed to feed-kinds by `buildCreationsFeed`'s
  // `isFeedKind` guard; the cast keeps TypeScript happy without a
  // runtime check the feed already performed.
  const tileClass = tileClassForKind(
    asset.kind as "image" | "video" | "audio",
  );

  return (
    <article className="group rounded-[14px] border border-border bg-panel/40 transition-colors hover:border-[var(--line-strong)]">
      {/* Top strip — Freepik-style: prompt → copy/reuse icons → ratio
          pill → model pill → heart → divider → time. The pills stay
          visible always so a glance through the feed surfaces what
          each row was rendered with; the icons are a touch dimmer so
          they don't shout. */}
      <header className="flex items-center gap-2.5 px-4 pt-3">
        <p
          className="min-w-0 flex-1 truncate text-[13px] leading-snug text-ink"
          title={asset.prompt}
        >
          {asset.prompt || (
            <span className="text-ink-dim italic">no prompt</span>
          )}
        </p>

        <IconButton
          label={copied ? "Copied!" : "Copy prompt"}
          onClick={onCopyPrompt}
          disabled={!asset.prompt}
        >
          <Copy className="size-3.5" />
        </IconButton>
        <IconButton label="Reuse prompt" onClick={onReusePrompt}>
          <RotateCw className="size-3.5" />
        </IconButton>

        {meta.ratio && <Pill>{meta.ratio}</Pill>}
        {meta.model && <Pill emphasised>{meta.model}</Pill>}

        <IconButton
          label={asset.pinned ? "Unfavorite" : "Favorite"}
          active={asset.pinned}
          disabled={busyPin}
          onClick={onTogglePin}
        >
          <Heart
            className={cn(
              "size-3.5",
              asset.pinned && "fill-accent text-accent",
            )}
          />
        </IconButton>

        <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
        <span className="shrink-0 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
          {relativeTime(asset.createdAt)}
        </span>
      </header>

      {/* Media body — tile floats left, room to grow above 1fr.
          - Image: wrapped in a button that opens the original on click.
          - Video: native controls so the user can play / pause / seek
                   inline. The wrapper button is dropped because the
                   click would otherwise race the video element for
                   focus and either steal the play interaction or
                   navigate away mid-scrub.
          - Audio: handled by `<AudioTile>` which carries its own
                   native controls.
          The relative container is one layer above the tile so the
          absolutely-positioned overlays (brand badge bottom-left,
          action stack top-right) sit on top of the media without
          interfering with the click target. */}
      <div className="px-4 pb-3 pt-2.5">
        <div className={`relative ${tileClass}`}>
          {asset.kind === "video" ? (
            <div className="absolute inset-0 block overflow-hidden rounded-[10px] border border-border bg-black">
              <AssetMedia
                asset={asset}
                // "detail" gives the <video> element controls + no
                // autoplay, which is the right inline-feed default —
                // user clicks play when they want, and the row stays
                // quiet while scrolling past it.
                variant="detail"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          ) : asset.kind === "audio" ? (
            <div className="absolute inset-0 block overflow-hidden rounded-[10px] border border-border bg-black">
              <AudioTile asset={asset} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => window.open(asset.url, "_blank", "noopener")}
              className="absolute inset-0 block overflow-hidden rounded-[10px] border border-border bg-black"
              title="Open original"
            >
              <AssetMedia
                asset={asset}
                variant="thumb"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </button>
          )}

          {/* Bottom-left badge — brand mark + resolution. The badge sits
              above the media button via `pointer-events-none` on the
              wrapper so clicks still pass through to "Open original". */}
          <div className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-2 rounded-full bg-bg/85 px-2 py-1 backdrop-blur-sm">
            <BrandLogo
              brand={resolveModelBrand(asset.model ?? "", asset.params?.provider as string | undefined)}
              size="sm"
            />
            {resolutionLabel(asset) && (
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                {resolutionLabel(asset)}
              </span>
            )}
          </div>

          {/* Top-right utility stack on the media — download + delete
              only. Heart moved to the header to mirror Freepik's row
              chrome; copy / reuse also live there. Hover-revealed to
              keep the media area clean while skimming the feed. */}
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-bg/85 p-1 opacity-0 transition-opacity backdrop-blur-sm group-hover:opacity-100 focus-within:opacity-100">
            <IconButton
              label="Download"
              onClick={(e) => {
                e.stopPropagation();
                onDownload(asset);
              }}
            >
              <Download className="size-3.5" />
            </IconButton>
            <IconButton
              label="Delete"
              disabled={busyDelete}
              onClick={onDelete}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>

          {/* Bottom-right action pills — Edit + Create Video. Image kind
              only: Edit opens this asset in the /edit canvas; Create Video
              hard-navigates to the Video tab with this image seeded
              into the i2v starting-frame slot. Sits on a separate row
              from the brand badge so they don't visually compete. */}
          {asset.kind === "image" && (
            <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-bg/85 p-1 opacity-0 transition-opacity backdrop-blur-sm group-hover:opacity-100 focus-within:opacity-100">
              <IconButton
                label={busyEdit ? "Opening editor…" : "Edit"}
                disabled={busyEdit}
                onClick={(e) => {
                  void onEdit(e);
                }}
              >
                <Pencil className="size-3.5" />
              </IconButton>
              <IconButton
                label="Create Video"
                onClick={(e) => {
                  e.stopPropagation();
                  // Soft-navigate so the right-hand feed keeps its
                  // scroll position. `scroll: false` blocks Next's
                  // default scroll-to-top; the GenerateShell +
                  // VideoGenerator both watch the URL for the new
                  // tab and firstFrame and update in place.
                  router.push(createVideoUrlFromAsset(asset), {
                    scroll: false,
                  });
                }}
              >
                <Video className="size-3.5" />
              </IconButton>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────── Header pill ────────────────────────────────

function Pill({
  children,
  emphasised = false,
}: {
  children: React.ReactNode;
  emphasised?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-[6px] px-2 font-mono text-[10px] tracking-[0.04em]",
        emphasised
          ? "bg-bg-2 text-ink"
          : "bg-bg-2/60 text-ink-dim",
      )}
    >
      {children}
    </span>
  );
}

// ─────────────────────────── Action helpers ─────────────────────────────

function IconButton({
  label,
  onClick,
  children,
  active = false,
  disabled = false,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-full transition-colors",
        active
          ? "text-accent hover:bg-accent-soft"
          : "text-ink-dim hover:bg-bg-2 hover:text-ink",
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {children}
    </button>
  );
}

/** Build a `/generate?...` URL that, when hard-navigated to, will
 *  hydrate the matching Generator with this asset's prompt + model +
 *  size/ratio. Uses the existing `hydrateFromQuery` contract in
 *  `lib/reels/preset-bridge.ts` — keep param names aligned. */
function reuseUrlForAsset(asset: Asset): string {
  const sp = new URLSearchParams();
  const tab =
    asset.kind === "video"
      ? "video"
      : asset.kind === "audio"
        ? "audio"
        : "image";
  sp.set("tab", tab);
  if (asset.prompt) sp.set("prompt", asset.prompt);
  if (asset.model) sp.set("model", asset.model);
  if (asset.kind === "image" && asset.size) sp.set("size", asset.size);
  if (asset.kind === "video") {
    if (asset.ratio) sp.set("ratio", asset.ratio);
    const p = asset.params as
      | { resolution?: string; mode?: string }
      | undefined;
    if (p?.resolution) sp.set("resolution", p.resolution);
    if (p?.mode) sp.set("mode", p.mode);
    if (asset.duration) sp.set("duration", String(asset.duration));
  }
  return `/generate?${sp.toString()}`;
}

/** Build a Video-tab hydration URL that seeds the i2v starting frame
 *  with this image. Prefers the local mirror URL when present (same-
 *  origin, persistent) and falls back to the upstream CDN URL.
 *
 *  The Video tab's `hydrateFromQuery` requires both `prompt` and
 *  `model` to engage the hydration path — we satisfy that by carrying
 *  this image's prompt over plus a sensible default video model so
 *  the user lands on a ready-to-render form, not an empty one. */
function createVideoUrlFromAsset(asset: Asset): string {
  const sp = new URLSearchParams();
  sp.set("tab", "video");
  sp.set("mode", "i2v");
  // Use the image's prompt verbatim — the user usually wants the video
  // to extend the same scene; they can edit before rendering anyway.
  sp.set("prompt", asset.prompt ?? "");
  // Default to Seedance 2.0 — supports i2v + audio out of the box.
  sp.set("model", "dreamina-seedance-2-0-260128");
  if (asset.size) {
    const [w, h] = asset.size.split("x").map(Number);
    if (w && h) {
      // Map image size to closest video ratio so the frame doesn't
      // get letterboxed; Video tab coerces unrecognised values to 16:9.
      const r = w === h ? "1:1" : w > h ? "16:9" : "9:16";
      sp.set("ratio", r);
    }
  }
  sp.set("firstFrame", asset.mirrorUrl ?? asset.url);
  return `/generate?${sp.toString()}`;
}

/** Trigger a same-origin download. Falls back to opening the URL in a
 *  new tab for cross-origin sources the browser won't honour the
 *  `download` attribute on (BytePlus signed URLs strip it). */
function onDownload(asset: Asset): void {
  const url = asset.mirrorUrl ?? asset.url;
  const a = document.createElement("a");
  a.href = url;
  a.download = "";
  a.rel = "noopener";
  // Cross-origin URLs will trigger a navigate instead of a download —
  // open in a new tab so the user can right-click → Save As.
  if (!url.startsWith("/") && !url.startsWith(window.location.origin)) {
    a.target = "_blank";
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ─────────────────────────── Pending row ────────────────────────────────

function PendingRow({
  kind,
  prompt,
  size,
}: {
  kind: "image" | "video";
  prompt: string;
  size: string;
}) {
  const tileClass = tileClassForKind(kind);
  return (
    <article className="rounded-[14px] border border-accent/40 bg-accent-soft/30">
      <header className="flex items-start justify-between gap-4 px-4 pt-3">
        <p className="min-w-0 flex-1 truncate text-[13px] leading-snug text-ink">
          {prompt}
        </p>
        <div className="flex shrink-0 items-center gap-2 font-mono text-[10px] uppercase tracking-[0.10em] text-accent">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent animate-pulse" />
            Rendering…
          </span>
        </div>
      </header>
      <div className="px-4 pb-3 pt-2.5">
        <div
          className={`relative block overflow-hidden rounded-[10px] border border-accent/30 bg-panel ${tileClass} animate-pulse`}
        >
          <span className="absolute bottom-2 left-2 inline-flex h-5 items-center rounded-full bg-bg/85 px-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim backdrop-blur-sm">
            {size}
          </span>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────── Tile helpers ───────────────────────────────

function tileClassForKind(kind: "image" | "video" | "audio"): string {
  // Width-bounded tiles so very wide / very tall renders don't blow up
  // the row. Aspect ratios match the dominant content kind.
  if (kind === "audio") return "h-[80px] w-full";
  if (kind === "video") return "aspect-video w-full max-w-[480px]";
  return "aspect-square w-full max-w-[280px]";
}

/** Coarse resolution label for the bottom-left badge.
 *  - Image: derives a 1K/2K/4K bucket from `asset.size` ("WxH").
 *  - Video: trusts `params.resolution` ("720p" / "1080p" / "4K") if set,
 *    falling back to the ratio.
 *  - Audio: omitted (the audio player already shows duration). */
function resolutionLabel(asset: Asset): string | null {
  if (asset.kind === "video") {
    const res = (asset.params as { resolution?: string } | undefined)
      ?.resolution;
    if (res) return res.toUpperCase().replace("P", "p");
    return null;
  }
  if (asset.kind === "image" && asset.size) {
    const [w, h] = asset.size.split("x").map(Number);
    const max = Math.max(w || 0, h || 0);
    if (max >= 3000) return "4K";
    if (max >= 2000) return "2K";
    if (max >= 1024) return "1K";
    return asset.size;
  }
  return null;
}

function AudioTile({ asset }: { asset: Asset }) {
  // Inline player — Freepik shows a waveform; we keep it minimal until
  // the asset record carries a peak-array. Native controls give play /
  // scrubber / volume without extra code.
  return (
    <div className="absolute inset-0 flex items-center px-3">
      <audio
        src={asset.mirrorUrl ?? asset.url}
        controls
        preload="metadata"
        className="h-10 w-full"
      />
    </div>
  );
}

// ─────────────────────────── Meta formatter ─────────────────────────────

function formatMeta(asset: Asset): { ratio?: string; model?: string } {
  const ratio = asset.ratio ?? (asset.size ? sizeToRatio(asset.size) : undefined);
  // Strip the long endpoint suffix on BytePlus model ids so the chip
  // stays narrow ("seedream 5 lite" instead of "seedream-5-0-lite-260128").
  const model = asset.model ? shortModelLabel(asset.model) : undefined;
  return { ratio, model };
}

function sizeToRatio(size: string): string | undefined {
  const [w, h] = size.split("x").map(Number);
  if (!w || !h) return undefined;
  return `${w}:${h}`;
}

function shortModelLabel(id: string): string {
  // Cosmetic only — keeps the pill narrow. Lowercase Freepik-style.
  if (id.includes("seedream-5-0-lite")) return "seedream 5 lite";
  if (id.includes("seedream-5")) return "seedream 5";
  if (id.includes("seedream-4")) return "seedream 4.5";
  if (id.includes("openai/gpt-image")) return "gpt image 2";
  if (id.includes("seedance-2-0-fast")) return "seedance 2.0 fast";
  if (id.includes("seedance-2-0")) return "seedance 2.0";
  if (id.includes("seedance-1-5")) return "seedance 1.5 pro";
  if (id.includes("Hailuo")) return "hailuo 2.3";
  if (id.includes("Director")) return "t2v director";
  if (id.includes("speech")) return "minimax speech";
  return id.slice(0, 24).toLowerCase();
}

