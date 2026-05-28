"use client";

/**
 * Asset Node — pulls a Library asset or BytePlus registered asset onto
 * the canvas as a source node.
 *
 * Two output ports:
 *   url     — resolved CDN / mirror URL (backward-compatible)
 *   assetId — BytePlus asset_id; wire this to Video Gen's `reference` input
 *             to use Seedance 2.0 R2V with stable BytePlus-managed assets.
 *
 * Picker is two-panel when BytePlus groups exist:
 *   Left  — group list (BytePlus) + "Local library" fallback
 *   Right — assets in selected group, or flat local picker
 */

import { memo, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import {
  type Asset,
  getAssetsServerSnapshot,
  getAssetsSnapshot,
  subscribeAssets,
} from "@/lib/library/assets";
import {
  type AssetGroup,
  getAssetGroupsServerSnapshot,
  getAssetGroupsSnapshot,
  subscribeAssetGroups,
} from "@/lib/library/asset-groups";
import { AssetMedia } from "@/components/library/asset-media";
import { NodeShell } from "./node-shell";
import type { NodeTypeSpec, StudioNodeData } from "../types";
import type { AssetInfo } from "@/lib/modelark";

export type AssetForm = {
  /** Local library asset id. Empty until the user picks one. */
  assetId: string;
  /** BytePlus asset_id (from a BytePlus group asset). May differ from assetId. */
  byteplusAssetId: string;
  /** Public URL for preview when the selected asset is a BytePlus-only asset (no local record). */
  previewUrl: string;
  /** "Image" | "Video" — stored so execute can encode the type in the wire value. */
  assetType: "Image" | "Video" | "";
};

export const AssetNode = memo(function AssetNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<AssetForm>;
  const [pickerOpen, setPickerOpen] = useState(false);

  const localAssets = useSyncExternalStore(
    subscribeAssets,
    getAssetsSnapshot,
    getAssetsServerSnapshot,
  );
  const groups = useSyncExternalStore(
    subscribeAssetGroups,
    getAssetGroupsSnapshot,
    getAssetGroupsServerSnapshot,
  );

  const selectedAsset = useMemo(
    () => (d.form.assetId ? localAssets.find((a) => a.id === d.form.assetId) : null),
    [d.form.assetId, localAssets],
  );

  const setPick = useCallback(
    (assetId: string, byteplusAssetId: string, previewUrl = "", assetType: "Image" | "Video" | "" = "") => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<AssetForm>;
          return {
            ...n,
            data: { ...prev, form: { ...prev.form, assetId, byteplusAssetId, previewUrl, assetType } },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const hasByteplusId = !!d.form.byteplusAssetId;

  return (
    <NodeShell id={id} spec={assetSpec} data={d} selected={selected ?? false}>
      {selectedAsset ? (
        <SelectedAssetPreview
          asset={selectedAsset}
          byteplusAssetId={d.form.byteplusAssetId}
          onChange={(e) => { e.stopPropagation(); setPickerOpen(true); }}
          onClear={(e) => { e.stopPropagation(); setPick("", "", ""); }}
        />
      ) : d.form.byteplusAssetId ? (
        <ByteplusAssetPreview
          assetId={d.form.byteplusAssetId}
          previewUrl={d.form.previewUrl}
          onChange={(e) => { e.stopPropagation(); setPickerOpen(true); }}
          onClear={(e) => { e.stopPropagation(); setPick("", "", ""); }}
        />
      ) : (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setPickerOpen(true); }}
          className="nodrag flex h-32 w-full items-center justify-center rounded-[8px] border border-dashed border-border bg-panel text-[12px] text-ink-dim transition-colors hover:border-accent hover:text-accent"
        >
          Pick from Library →
        </button>
      )}

      <div className="flex items-center justify-between">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute">
          {localAssets.length} local · {groups.length} group{groups.length === 1 ? "" : "s"}
        </div>
        {hasByteplusId && (
          <span className="rounded-full bg-ok/20 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.08em] text-ok">
            BytePlus ✓
          </span>
        )}
      </div>

      {pickerOpen && createPortal(
        <AssetPicker
          localAssets={localAssets}
          groups={groups}
          selectedLocalId={d.form.assetId}
          selectedByteplusId={d.form.byteplusAssetId}
          onPick={(assetId, byteplusAssetId, previewUrl, assetType) => {
            setPick(assetId, byteplusAssetId, previewUrl, assetType);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />,
        document.body,
      )}
    </NodeShell>
  );
});

// ─────────────────────────── Selected preview ────────────────────────────

function SelectedAssetPreview({
  asset,
  byteplusAssetId,
  onChange,
  onClear,
}: {
  asset: Asset;
  byteplusAssetId: string;
  onChange: (e: React.MouseEvent) => void;
  onClear: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-[8px] border border-border bg-black">
        <AssetMedia asset={asset} variant="thumb" className="block h-32 w-full object-cover" />
      </div>
      {byteplusAssetId && (
        <div className="flex items-center gap-1 rounded-[6px] border border-ok/30 bg-ok/10 px-2 py-1">
          <span className="font-mono text-[8px] text-ok">asset_id:</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-ink-dim">{byteplusAssetId}</span>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(byteplusAssetId)}
            className="shrink-0 font-mono text-[8px] text-ink-mute hover:text-ink"
          >
            copy
          </button>
        </div>
      )}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={onChange}
          className="nodrag flex-1 rounded-[6px] border border-border bg-panel px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim hover:border-accent hover:text-accent"
        >
          Change
        </button>
        <button
          type="button"
          onClick={onClear}
          className="nodrag rounded-[6px] border border-border bg-panel px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim hover:border-accent hover:text-accent"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── BytePlus-only preview ───────────────────────

function ByteplusAssetPreview({
  assetId,
  previewUrl,
  onChange,
  onClear,
}: {
  assetId: string;
  previewUrl: string;
  onChange: (e: React.MouseEvent) => void;
  onClear: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-hidden rounded-[8px] border border-border bg-black">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/proxy-image?url=${encodeURIComponent(previewUrl)}`}
            alt=""
            className="block h-32 w-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="flex h-32 items-center justify-center font-mono text-[10px] text-ink-mute">
            BytePlus asset
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 rounded-[6px] border border-ok/30 bg-ok/10 px-2 py-1">
        <span className="font-mono text-[8px] text-ok">asset_id:</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-ink-dim">{assetId}</span>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(assetId)}
          className="shrink-0 font-mono text-[8px] text-ink-mute hover:text-ink"
        >
          copy
        </button>
      </div>
      <div className="flex gap-1">
        <button type="button" onClick={onChange} className="nodrag flex-1 rounded-[6px] border border-border bg-panel px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim hover:border-accent hover:text-accent">Change</button>
        <button type="button" onClick={onClear} className="nodrag rounded-[6px] border border-border bg-panel px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim hover:border-accent hover:text-accent">Clear</button>
      </div>
    </div>
  );
}

// ─────────────────────────── Picker ──────────────────────────────────────

type PanelMode = "local" | string; // "local" or a byteplusGroupId

function AssetPicker({
  localAssets,
  groups,
  selectedLocalId,
  selectedByteplusId,
  onPick,
  onClose,
}: {
  localAssets: Asset[];
  groups: AssetGroup[];
  selectedLocalId: string;
  selectedByteplusId: string;
  onPick: (assetId: string, byteplusAssetId: string, previewUrl?: string, assetType?: "Image" | "Video" | "") => void;
  onClose: () => void;
}) {
  const [panel, setPanel] = useState<PanelMode>("local");
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video" | "reference">("all");
  const [remoteAssets, setRemoteAssets] = useState<AssetInfo[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Load BytePlus group assets when panel switches to a group
  useEffect(() => {
    if (panel === "local") return;
    const group = groups.find((g) => g.id === panel);
    if (!group) return;
    setLoadingRemote(true);
    setRemoteAssets([]);
    fetch(`/api/modelark/groups/${group.byteplusGroupId}/assets`)
      .then((r) => r.json())
      .then((d) => setRemoteAssets((d.assets as AssetInfo[]) ?? []))
      .catch(() => {})
      .finally(() => setLoadingRemote(false));
  }, [panel, groups]);

  const filteredLocal = useMemo(
    () => kindFilter === "all" ? localAssets : localAssets.filter((a) => a.kind === kindFilter),
    [localAssets, kindFilter],
  );

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[75vh] max-h-[780px] w-[90vw] max-w-[900px] overflow-hidden rounded-[12px] border border-border bg-bg text-ink">

        {/* Left panel — group list */}
        <div className="flex w-44 shrink-0 flex-col border-r border-border">
          <div className="border-b border-border px-3 py-3">
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink-dim">Source</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            <PanelButton
              label="Local Library"
              count={localAssets.length}
              active={panel === "local"}
              onClick={() => setPanel("local")}
            />
            {groups.length > 0 && (
              <div className="mt-2 px-3 pb-1">
                <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-mute">
                  BytePlus Groups
                </span>
              </div>
            )}
            {groups.map((g) => (
              <PanelButton
                key={g.id}
                label={g.name}
                active={panel === g.id}
                onClick={() => setPanel(g.id)}
              />
            ))}
          </div>
        </div>

        {/* Right panel — assets */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              § Pick from {panel === "local" ? "Library" : (groups.find((g) => g.id === panel)?.name ?? "Group")}
            </span>
            <button type="button" onClick={onClose} className="rounded-full px-2 py-1 font-mono text-[11px] text-ink-dim hover:text-ink" aria-label="Close">✕</button>
          </header>

          {/* Kind filter — local only */}
          {panel === "local" && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2">
              {(["all", "image", "video", "reference"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setKindFilter(f)}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.10em] transition-colors ${
                    kindFilter === f ? "border-ink bg-ink text-bg" : "border-border text-ink-dim hover:border-ink-dim hover:text-ink"
                  }`}
                >
                  {f}
                </button>
              ))}
              <span className="ml-auto font-mono text-[9px] text-ink-mute">{filteredLocal.length} asset{filteredLocal.length === 1 ? "" : "s"}</span>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {panel === "local" ? (
              filteredLocal.length === 0 ? (
                <p className="py-12 text-center text-[13px] text-ink-dim">
                  No assets yet. Render something first — every successful render is saved to the Library.
                </p>
              ) : (
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {filteredLocal.map((a) => (
                    <li key={a.id}>
                      <LocalThumb
                        asset={a}
                        active={a.id === selectedLocalId}
                        onClick={() => onPick(a.id, a.byteplusAssetId ?? "", undefined, a.kind === "video" ? "Video" : "Image")}
                      />
                    </li>
                  ))}
                </ul>
              )
            ) : loadingRemote ? (
              <p className="py-12 text-center text-[13px] text-ink-dim">Loading…</p>
            ) : remoteAssets.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-ink-dim">
                No assets in this group. Go to Library → BytePlus Groups to upload some.
              </p>
            ) : (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {remoteAssets.map((a) => (
                  <li key={a.assetId}>
                    <RemoteThumb
                      asset={a}
                      active={a.assetId === selectedByteplusId}
                      onClick={() => onPick("", a.assetId, a.url, (a.assetType as "Image" | "Video") ?? "")}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelButton({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
        active ? "bg-accent/10 text-accent" : "text-ink-dim hover:bg-panel hover:text-ink"
      }`}
    >
      <span className="min-w-0 truncate font-mono text-[10px]">{label}</span>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-[9px] text-ink-mute">{count}</span>
      )}
    </button>
  );
}

function LocalThumb({ asset, active, onClick }: { asset: Asset; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative block aspect-square w-full overflow-hidden rounded-[8px] border bg-panel transition-colors ${
        active ? "border-accent" : "border-border hover:border-ink-dim"
      }`}
    >
      <AssetMedia asset={asset} variant="thumb" className="absolute inset-0 h-full w-full object-cover bg-black" />
      {asset.byteplusAssetId && (
        <span className="absolute left-1 top-1 rounded-full bg-ok/80 px-1 font-mono text-[7px] text-white">BP</span>
      )}
      {active && (
        <span className="absolute inset-0 grid place-items-center bg-accent/30 font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
          ✓
        </span>
      )}
    </button>
  );
}

function RemoteThumb({ asset, active, onClick }: { asset: AssetInfo; active: boolean; onClick: () => void }) {
  const isActive = asset.status === "Active";
  return (
    <button
      type="button"
      onClick={isActive ? onClick : undefined}
      disabled={!isActive}
      className={`group relative block aspect-square w-full overflow-hidden rounded-[8px] border bg-panel transition-colors ${
        active ? "border-accent" : isActive ? "border-border hover:border-ink-dim" : "border-border opacity-50 cursor-not-allowed"
      }`}
    >
      {asset.url && asset.assetType === "Video" ? (
        <video
          src={asset.url}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          autoPlay
          loop
          playsInline
          preload="metadata"
          onError={(e) => { (e.currentTarget as HTMLVideoElement).style.display = "none"; }}
        />
      ) : asset.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/proxy-image?url=${encodeURIComponent(asset.url)}`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-mono text-[9px] text-ink-mute">
          {asset.status}
        </div>
      )}
      {active && (
        <span className="absolute inset-0 grid place-items-center bg-accent/30 font-mono text-[10px] uppercase tracking-[0.12em] text-ink">✓</span>
      )}
    </button>
  );
}

// ─────────────────────────── Spec ────────────────────────────────────────

export const assetSpec: NodeTypeSpec<AssetForm> = {
  type: "asset",
  label: "Asset",
  description: "Pull a Library asset or BytePlus registered asset onto the canvas.",
  inputs: [],
  outputs: [
    { id: "url", label: "url" },
    { id: "assetId", label: "assetId" },
  ],
  defaults: { assetId: "", byteplusAssetId: "", previewUrl: "", assetType: "" },
  hashInputs: (form) => `a:${form.assetId}:${form.byteplusAssetId}:${form.assetType}`,
  execute: async ({ form }) => {
    // Encode assetType in the wire value so consumers can set the correct
    // "type" field in the BytePlus references array ("image" vs "video").
    // Format: "<assetId>|video" for videos, plain "<assetId>" otherwise.
    // The "|" separator is safe — BytePlus asset IDs never contain it.
    function encode(id: string, isVideo: boolean): string {
      return isVideo ? `${id}|video` : id;
    }

    // Case 1: BytePlus group asset selected — resolve via assetId only
    if (form.byteplusAssetId) {
      const { getAsset } = await import("@/lib/library/assets");
      const local = form.assetId ? getAsset(form.assetId) : null;
      const isVideo = form.assetType === "Video" || local?.kind === "video";
      return {
        url: local?.mirrorUrl ?? local?.url ?? form.previewUrl ?? "",
        assetId: encode(form.byteplusAssetId, isVideo),
      };
    }

    // Case 2: local library asset selected
    if (!form.assetId) {
      throw new Error("Pick a Library asset to wire");
    }
    const { getAsset } = await import("@/lib/library/assets");
    const asset = getAsset(form.assetId);
    if (!asset) {
      throw new Error("Selected asset is no longer in the Library — pick a new one");
    }
    return {
      url: asset.mirrorUrl ?? asset.url,
      assetId: encode(asset.byteplusAssetId ?? "", asset.kind === "video"),
    };
  },
};
