"use client";

/**
 * SceneAssetPicker — three named image slots (Character, Background, Prop)
 * for a single scene.
 *
 * Each slot holds exactly one image (file upload or URL paste). The image is
 * stored as a data URI or a remote URL string, matching the shape the BytePlus
 * multi-reference video endpoint expects in Phase 3.
 *
 * UX: clicking an empty slot opens the file picker; clicking a filled slot
 * shows a tiny action row (Replace / Clear) without leaving the card.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { SceneAssets } from "@/lib/story/stories";

export type SceneAssetPickerProps = {
  assets: SceneAssets;
  onChange: (next: SceneAssets) => void;
  className?: string;
};

type SlotKey = keyof SceneAssets;

const SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: "character", label: "Character", hint: "Main character" },
  { key: "background", label: "Background", hint: "Scene environment" },
  { key: "prop", label: "Prop", hint: "Key object / prop" },
];

const MAX_BYTES = 10 * 1024 * 1024;

export function SceneAssetPicker({
  assets,
  onChange,
  className,
}: SceneAssetPickerProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {SLOTS.map((slot) => (
        <AssetSlot
          key={slot.key}
          label={slot.label}
          hint={slot.hint}
          value={assets[slot.key]}
          onSet={(url) => onChange({ ...assets, [slot.key]: url })}
          onClear={() => {
            const next = { ...assets };
            delete next[slot.key];
            onChange(next);
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────── Single slot ──────────────────────────────────

function AssetSlot({
  label,
  hint,
  value,
  onSet,
  onClear,
}: {
  label: string;
  hint: string;
  value: string | undefined;
  onSet: (url: string) => void;
  onClear: () => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [urlMode, setUrlMode] = React.useState(false);
  const [urlDraft, setUrlDraft] = React.useState("");

  async function handleFiles(files: FileList | File[]) {
    setErr(null);
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) { setErr("Not an image"); return; }
    if (file.size > MAX_BYTES) { setErr("> 10 MB"); return; }
    const uri = await readAsDataURI(file);
    onSet(uri);
  }

  function handleAddUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u) && !u.startsWith("data:image/")) {
      setErr("Need http(s):// URL");
      return;
    }
    onSet(u);
    setUrlDraft("");
    setUrlMode(false);
    setErr(null);
  }

  // ── Filled state ──
  if (value) {
    return (
      <div className="flex flex-col gap-1">
        <SlotLabel label={label} />
        <div className="group relative aspect-square overflow-hidden rounded-[8px] border border-border bg-panel-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt={label}
            className="h-full w-full object-cover"
          />
          {/* Hover actions */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-border/60 bg-bg/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink hover:border-ink"
            >
              Replace
            </button>
            <button
              onClick={onClear}
              className="rounded-full border border-border/60 bg-bg/80 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim hover:text-[oklch(0.72_0.22_15)]"
            >
              Clear
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    );
  }

  // ── Empty state ──
  return (
    <div className="flex flex-col gap-1">
      <SlotLabel label={label} />
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "aspect-square rounded-[8px] border border-dashed flex flex-col items-center justify-center gap-1.5 transition-colors cursor-pointer",
          dragging ? "border-accent bg-accent-soft" : "border-border bg-panel-2 hover:border-border-strong",
        )}
        onClick={() => {
          if (!urlMode) fileRef.current?.click();
        }}
        title={hint}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="font-mono text-[16px] text-ink-mute">+</span>
        <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-mute text-center px-1 leading-tight">
          {hint}
        </span>
      </div>

      {/* URL toggle */}
      {!urlMode ? (
        <button
          onClick={(e) => { e.stopPropagation(); setUrlMode(true); }}
          className="font-mono text-[8px] uppercase tracking-[0.12em] text-ink-mute hover:text-ink-dim transition-colors text-center"
        >
          Paste URL
        </button>
      ) : (
        <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            type="text"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddUrl();
              if (e.key === "Escape") { setUrlMode(false); setUrlDraft(""); setErr(null); }
            }}
            placeholder="https://…"
            className="h-7 w-full rounded-[6px] border border-border bg-panel px-2 text-[10px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent"
          />
          <div className="flex gap-1">
            <button
              onClick={handleAddUrl}
              className="flex-1 rounded-[6px] border border-accent bg-accent/10 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-accent hover:bg-accent/20"
            >
              Add
            </button>
            <button
              onClick={() => { setUrlMode(false); setUrlDraft(""); setErr(null); }}
              className="flex-1 rounded-[6px] border border-border py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-ink-mute hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {err && (
        <span className="font-mono text-[8px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
          {err}
        </span>
      )}
    </div>
  );
}

function SlotLabel({ label }: { label: string }) {
  return (
    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
      {label}
    </span>
  );
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function readAsDataURI(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
