"use client";

/**
 * Asset detail drawer — slides in from the right when a card is clicked.
 *
 * Holds the heavy actions the grid intentionally hides: send-to-Generator
 * handoff, copy link, pin/unpin, delete. Native `<dialog>` with backdrop
 * for focus trap + Esc dismissal — no useEffect spider-web.
 *
 * Send-to-Generator URL params follow the existing `hydrateFromQuery`
 * contract in `lib/reels/preset-bridge.ts` (prompt, model, size, ratio,
 * resolution, duration, mode) so the Generator hydrates without any
 * Library-specific code path on the receiving end.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  type Asset,
  removeAsset,
  updateAsset,
} from "@/lib/library/assets";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { AssetMedia } from "@/components/library/asset-media";
import { Chip } from "@/components/ui/chip";
import { Button } from "@/components/ui/button";

export function AssetDetailDrawer({
  asset,
  onClose,
}: {
  asset: Asset;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Open / close mirror — driven by the parent's selected state.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    return () => {
      if (dlg.open) dlg.close();
    };
  }, []);

  // Esc / backdrop click → propagate close to parent.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handler = () => onClose();
    dlg.addEventListener("close", handler);
    return () => dlg.removeEventListener("close", handler);
  }, [onClose]);

  // Same fallback chain as the grid card — local mirror first, then
  // proxy, so the detail view stays alive even after the BytePlus
  // signature expires.
  const previewUrl = asset.mirrorUrl ?? mediaProxyUrl(asset.url);
  const generatorHref = buildGeneratorHref(asset);

  return (
    <dialog
      ref={dialogRef}
      // Right-side sheet — fills viewport height, max width 480 on desktop.
      // Native dialog backdrop handled by browser; we style it here.
      className="ml-auto h-full max-h-none w-full max-w-[480px] border-l border-border bg-bg p-0 text-ink backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <form method="dialog" className="contents">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              § Asset · {asset.kind}
            </span>
            <button
              type="submit"
              className="rounded-full px-2 py-1 font-mono text-[11px] text-ink-dim hover:text-ink"
              aria-label="Close"
              formNoValidate
            >
              ✕
            </button>
          </div>

          {/* Preview */}
          <div className="border-b border-border bg-bg-2 p-5">
            <div className="overflow-hidden rounded-[12px] border border-border bg-black">
              <AssetMedia
                asset={asset}
                variant="detail"
                className="block w-full"
              />
            </div>
          </div>

          {/* Metadata + actions — flexes to fill so actions sit at bottom. */}
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
            {asset.prompt && (
              <Field label="Prompt">
                <p className="text-[13px] leading-relaxed text-ink">
                  {asset.prompt}
                </p>
              </Field>
            )}

            <div className="grid grid-cols-2 gap-4">
              {asset.model && <Field label="Model"><Mono>{asset.model}</Mono></Field>}
              {asset.size && <Field label="Size"><Mono>{asset.size}</Mono></Field>}
              {asset.ratio && <Field label="Ratio"><Mono>{asset.ratio}</Mono></Field>}
              {typeof asset.duration === "number" && (
                <Field label="Duration"><Mono>{asset.duration}s</Mono></Field>
              )}
              {typeof asset.seed === "number" && (
                <Field label="Seed"><Mono>{asset.seed}</Mono></Field>
              )}
              <Field label="Source"><Mono>{asset.source}</Mono></Field>
            </div>

            <Field label="Created">
              <Mono>{new Date(asset.createdAt).toLocaleString()}</Mono>
            </Field>

            {asset.mirrorStatus && (
              <Field label="Local cache">
                <Mono>{mirrorStatusLabel(asset.mirrorStatus)}</Mono>
              </Field>
            )}

            {/* Action row */}
            <div className="mt-auto flex flex-col gap-3 pt-4">
              <div className="flex flex-wrap gap-1.5">
                <Chip
                  active={asset.pinned}
                  onClick={() =>
                    updateAsset(asset.id, { pinned: !asset.pinned })
                  }
                >
                  {asset.pinned ? "★ Pinned" : "☆ Pin"}
                </Chip>
                <Chip
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      navigator.clipboard?.writeText(asset.url);
                    }
                  }}
                  title="Copy original URL"
                >
                  ↗ Copy URL
                </Chip>
                {/* Anchor styled as a chip — Chip is a <button>, but we
                    need an actual <a download> for the browser to honor
                    the save-as behavior. Same-origin via the proxy means
                    `download` actually fires (see /api/media). */}
                <a
                  href={previewUrl}
                  download
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.10em] text-ink-dim transition-all hover:border-[var(--line-strong)] hover:text-ink"
                >
                  ↓ Download
                </a>
                {confirmDelete ? (
                  <Chip
                    accent
                    onClick={() => {
                      removeAsset(asset.id);
                      onClose();
                    }}
                  >
                    Confirm delete
                  </Chip>
                ) : (
                  <Chip onClick={() => setConfirmDelete(true)}>✕ Delete</Chip>
                )}
              </div>

              {generatorHref && (
                <Button asChild variant="primary" className="w-full">
                  <Link href={generatorHref}>Send to Generator →</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </form>
    </dialog>
  );
}

// ─────────────────────────── Sub-bits ─────────────────────────────────

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[12px] text-ink">{children}</span>
  );
}

function mirrorStatusLabel(status: NonNullable<Asset["mirrorStatus"]>): string {
  if (status === "mirrored") return "✓ on disk · stays alive";
  if (status === "pending") return "syncing…";
  return "✗ failed · using upstream";
}

// ─────────────────────────── URL builder ──────────────────────────────

/** Build a `/generate?...` URL that hydrates the Generator with this
 *  asset's params. Returns null when we don't have enough metadata to
 *  populate the form (e.g. uploaded references with no prompt). */
function buildGeneratorHref(asset: Asset): string | null {
  if (!asset.prompt || !asset.model) return null;
  const params = new URLSearchParams();
  params.set("prompt", asset.prompt);
  params.set("model", asset.model);
  if (asset.size) params.set("size", asset.size);
  if (asset.ratio) params.set("ratio", asset.ratio);
  if (typeof asset.duration === "number") {
    params.set("duration", String(asset.duration));
  }
  // The hydrateFromQuery bridge maps `kind === "video"` by inferring it
  // from the model id, and we don't currently track Generator's `mode`
  // enum — leave to default ("t2v" for videos). The user can switch
  // modes in the form if needed.
  const tab = asset.kind === "video" ? "video" : "image";
  params.set("tab", tab);
  return `/generate?${params.toString()}`;
}
