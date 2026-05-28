"use client";

import { memo, useCallback, useState } from "react";
import { useReactFlow, type NodeProps } from "@xyflow/react";
import { NodeShell } from "./node-shell";
import { stageImportedAsset } from "@/lib/library/auto-save";
import type { NodeTypeSpec, StudioNodeData } from "../types";

export type SelectedMediaItem = { url: string; type: "image" | "video" };

export type WebExtractForm = {
  url: string;
  /** Editable copy of the extracted page text. */
  editedText: string;
  /** All currently selected images/videos. Multi-select. */
  selectedMedia: SelectedMediaItem[];
};

type ExtractState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; images: string[]; videos: string[] }
  | { status: "error"; message: string };

export const WebExtractNode = memo(function WebExtractNode({
  id,
  data,
  selected,
}: NodeProps) {
  const { setNodes } = useReactFlow();
  const d = data as StudioNodeData<WebExtractForm>;
  const [extractState, setExtractState] = useState<ExtractState>({ status: "idle" });
  // Track images that fail the 300×300 minimum — BytePlus rejects smaller refs.
  const [tooSmall, setTooSmall] = useState<Set<string>>(new Set());

  const update = useCallback(
    (patch: Partial<WebExtractForm>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<WebExtractForm>;
          return { ...n, data: { ...prev, form: { ...prev.form, ...patch } } };
        }),
      );
    },
    [id, setNodes],
  );

  // Write selected image URLs directly into outputs.images so downstream nodes
  // can use them immediately without clicking Run (no API call needed for raw URLs).
  const applySelection = useCallback(
    (nextMedia: SelectedMediaItem[]) => {
      const imageUrls = nextMedia
        .filter((m) => m.type === "image")
        .map((m) => m.url)
        .join("\n");
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== id) return n;
          const prev = n.data as StudioNodeData<WebExtractForm>;
          return {
            ...n,
            data: {
              ...prev,
              form: { ...prev.form, selectedMedia: nextMedia },
              outputs: { ...prev.outputs, images: imageUrls },
            },
          };
        }),
      );
    },
    [id, setNodes],
  );

  const handleExtract = useCallback(async () => {
    const url = d.form.url.trim();
    if (!url) return;
    setExtractState({ status: "loading" });
    try {
      const res = await fetch(`/api/web-extract?url=${encodeURIComponent(url)}`);
      const json = (await res.json()) as {
        error?: string;
        text?: string;
        images?: string[];
        videos?: string[];
      };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setExtractState({
        status: "done",
        images: json.images ?? [],
        videos: json.videos ?? [],
      });
      setTooSmall(new Set());
      applySelection([]);
      update({ editedText: json.text ?? "" });
    } catch (err) {
      setExtractState({
        status: "error",
        message: err instanceof Error ? err.message : "extract failed",
      });
    }
  }, [d.form.url, update, applySelection]);

  const toggleMedia = useCallback(
    (url: string, type: "image" | "video") => {
      const current = d.form.selectedMedia ?? [];
      const exists = current.some((m) => m.url === url);
      applySelection(
        exists ? current.filter((m) => m.url !== url) : [...current, { url, type }],
      );
    },
    [d.form.selectedMedia, applySelection],
  );

  // Prefer live-fetched media lists; fall back to the last Run's cached output
  const images: string[] =
    extractState.status === "done"
      ? extractState.images
      : d.outputs.images
        ? (d.outputs.images as string).split("\n").filter(Boolean)
        : [];

  const videos: string[] =
    extractState.status === "done"
      ? extractState.videos
      : [];

  const hasMedia = images.length > 0 || videos.length > 0;
  const hasText = d.form.editedText.length > 0;
  const selectedMedia = d.form.selectedMedia ?? [];
  const selectedUrls = new Set(selectedMedia.map((m) => m.url));
  const assetIdOutput = typeof d.outputs.assetId === "string" ? d.outputs.assetId : "";
  const uploadedCount = assetIdOutput ? assetIdOutput.split("\n").filter(Boolean).length : 0;

  return (
    <NodeShell
      id={id}
      spec={webExtractSpec}
      data={d}
      selected={selected ?? false}
      width={340}
    >
      {/* ── URL input ──────────────────────────────────────────────── */}
      <div className="flex gap-1.5">
        <input
          type="url"
          value={d.form.url}
          onChange={(e) => {
            update({ url: e.target.value, editedText: "", selectedMedia: [] });
            setExtractState({ status: "idle" });
          }}
          onKeyDown={(e) => { if (e.key === "Enter") void handleExtract(); }}
          placeholder="https://example.com/article"
          className="nodrag nowheel min-w-0 flex-1 rounded-[8px] border border-border bg-panel px-2 py-1 text-[12px] text-ink placeholder:text-ink-mute transition-colors focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void handleExtract()}
          disabled={!d.form.url.trim() || extractState.status === "loading"}
          className="nodrag shrink-0 rounded-[8px] border border-border bg-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
        >
          {extractState.status === "loading" ? "…" : "Extract"}
        </button>
      </div>

      {/* ── Error ──────────────────────────────────────────────────── */}
      {extractState.status === "error" && (
        <div className="rounded-[8px] border border-[oklch(0.65_0.22_25)]/40 bg-panel px-2 py-1.5 font-mono text-[10px] text-[oklch(0.65_0.22_25)]">
          {extractState.message}
        </div>
      )}

      {/* ── Editable page content ──────────────────────────────────── */}
      {hasText && (
        <label className="block">
          <span className="mb-1 block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
            Page Content · edit before wiring
          </span>
          <textarea
            rows={6}
            value={d.form.editedText}
            onChange={(e) => update({ editedText: e.target.value })}
            className="nodrag nowheel w-full resize-none rounded-[8px] border border-border bg-panel px-2 py-1.5 text-[11px] leading-[1.45] text-ink transition-colors focus:border-accent focus:outline-none"
          />
        </label>
      )}

      {/* ── Media picker ──────────────────────────────────────────── */}
      {hasMedia && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
              References · click to select multiple
            </span>
            {selectedUrls.size > 0 && (
              <span className="font-mono text-[9px] text-accent">
                {selectedUrls.size} selected
              </span>
            )}
          </div>

          {/* Images */}
          {images.length > 0 && (
            <div className="nodrag grid grid-cols-4 gap-1">
              {images.map((src) => {
                const isSel = selectedUrls.has(src);
                const isSmall = tooSmall.has(src);
                return (
                  <button
                    key={src}
                    type="button"
                    disabled={isSmall}
                    onClick={() => !isSmall && toggleMedia(src, "image")}
                    title={isSmall ? "Too small (< 300px) — BytePlus would reject this" : src}
                    className={[
                      "nodrag relative aspect-square overflow-hidden rounded-[6px] border-2 transition-all",
                      isSmall
                        ? "cursor-not-allowed opacity-30 border-transparent"
                        : isSel
                          ? "border-accent ring-2 ring-accent/40"
                          : "border-transparent hover:border-accent/40",
                    ].join(" ")}
                  >
                    <img
                      src={src}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                      onLoad={(e) => {
                        const img = e.currentTarget as HTMLImageElement;
                        if (img.naturalWidth < 300 || img.naturalHeight < 300) {
                          setTooSmall((prev) => new Set([...prev, src]));
                          // Deselect if already selected
                          if (selectedUrls.has(src)) {
                            applySelection((d.form.selectedMedia ?? []).filter((m) => m.url !== src));
                          }
                        }
                      }}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                    {isSel && !isSmall && (
                      <div className="absolute inset-0 flex items-center justify-center bg-accent/20">
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[8px] font-bold text-white">
                          ✓
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Videos */}
          {videos.length > 0 && (
            <div className="flex flex-col gap-1">
              {videos.map((src) => {
                const isSel = selectedUrls.has(src);
                const label = src.split("/").pop()?.split("?")[0] ?? src;
                return (
                  <button
                    key={src}
                    type="button"
                    onClick={() => toggleMedia(src, "video")}
                    title={src}
                    className={[
                      "nodrag flex items-center gap-1.5 truncate rounded-[6px] border px-2 py-1 text-left font-mono text-[10px] transition-colors",
                      isSel
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-border bg-panel text-ink-dim hover:border-accent/60 hover:text-ink",
                    ].join(" ")}
                  >
                    <span className="shrink-0 text-[8px]">{isSel ? "▶" : "○"}</span>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Select all / clear */}
          {images.length > 1 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() =>
                  applySelection(
                    images
                      .filter((url) => !tooSmall.has(url))
                      .map((url) => ({ url, type: "image" as const })),
                  )
                }
                className="nodrag font-mono text-[9px] text-ink-dim hover:text-accent"
              >
                Select all images
              </button>
              {selectedUrls.size > 0 && (
                <button
                  type="button"
                  onClick={() => applySelection([])}
                  className="nodrag font-mono text-[9px] text-ink-dim hover:text-[oklch(0.65_0.22_25)]"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Upload status (shown after a successful Run) ───────────── */}
      {uploadedCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-[8px] border border-ok/40 bg-panel px-2 py-1.5 font-mono text-[10px] text-ok">
          <span>✓</span>
          <span className="truncate">
            {uploadedCount === 1
              ? `Uploaded · ${assetIdOutput}`
              : `Uploaded ${uploadedCount} assets`}
          </span>
        </div>
      )}

      {/* ── Idle hint ─────────────────────────────────────────────── */}
      {extractState.status === "idle" && !hasText && !hasMedia && (
        <div className="rounded-[8px] border border-border bg-panel p-2 font-mono text-[10px] leading-[1.6] text-ink-dim">
          Paste a URL → <span className="text-ink">Extract</span> → edit text → select one or more images → <span className="text-ink">Run</span> to upload as BytePlus assets and emit <span className="text-ink">assetId</span>.
        </div>
      )}
    </NodeShell>
  );
});

export const webExtractSpec: NodeTypeSpec<WebExtractForm> = {
  type: "webExtract",
  label: "Web Extract",
  description: "Scrape a URL — review/edit text, pick multiple images/videos, upload as BytePlus assets.",
  inputs: [],
  outputs: [
    { id: "text", label: "text" },
    { id: "images", label: "images (urls)" },
    { id: "assetId", label: "assetId" },
  ],
  defaults: { url: "", editedText: "", selectedMedia: [] },
  hashInputs: (form) => {
    const mediaKey = (form.selectedMedia ?? []).map((m) => m.url).join(",");
    return `wx4:${form.url}|${mediaKey}|${form.editedText.length}:${form.editedText.slice(0, 80)}`;
  },
  execute: async ({ form, signal, onProgress }) => {
    const url = form.url.trim();
    if (!url) throw new Error("Enter a URL to extract content from");

    // Fetch text if not already edited
    let text = form.editedText.trim();
    if (!text) {
      onProgress?.("Fetching page…");
      const res = await fetch(`/api/web-extract?url=${encodeURIComponent(url)}`, { signal });
      const json = (await res.json()) as { error?: string; text?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      text = json.text ?? "";
    }

    const selectedMedia = form.selectedMedia ?? [];

    // Emit raw image URLs immediately (no upload needed for reference use)
    const selectedImageUrls = selectedMedia
      .filter((m) => m.type === "image")
      .map((m) => m.url)
      .join("\n");

    // No media selected — emit text + raw urls only
    if (selectedMedia.length === 0) {
      return { text, images: "", assetId: "" };
    }

    // Upload all selected media in parallel → BytePlus asset library
    onProgress?.(`Uploading ${selectedMedia.length} item${selectedMedia.length > 1 ? "s" : ""}…`);
    const uploads = await Promise.all(
      selectedMedia.map(async (item) => {
        const uploadRes = await fetch("/api/web-extract/upload-media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.url, kind: item.type, pageUrl: form.url }),
          signal,
        });
        const uploadJson = (await uploadRes.json()) as {
          error?: string;
          assetId?: string;
          tosUrl?: string;
          groupId?: string;
        };
        if (!uploadRes.ok) throw new Error(uploadJson.error ?? `Upload failed: ${item.url}`);
        if (!uploadJson.assetId || !uploadJson.tosUrl) {
          throw new Error(`Upload response missing assetId: ${item.url}`);
        }

        const title = item.url.split("/").pop()?.split("?")[0] ?? "web-extract";
        stageImportedAsset({
          kind: item.type,
          url: uploadJson.tosUrl,
          title,
          tags: ["web-extract"],
          byteplusAssetId: uploadJson.assetId,
          byteplusGroupId: uploadJson.groupId,
        });

        return { assetId: uploadJson.assetId, tosUrl: uploadJson.tosUrl };
      }),
    );

    const assetIds = uploads.map((u) => u.assetId).join("\n");

    return {
      text,
      images: selectedImageUrls,
      assetId: assetIds,
    };
  },
};
