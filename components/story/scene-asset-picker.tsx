"use client";

/**
 * SceneAssetPicker — every image input a scene can carry.
 *
 * Two groups, because they do genuinely different things:
 *
 *   Subject references (Character / Background / Prop)
 *     Sent as `references` with a semantic role. The model reads IDENTITY
 *     from these — who the person is, what the place looks like.
 *
 *   Frames (First / Last) + extra references
 *     Sent as `images` with roles first_frame / last_frame / reference_image.
 *     The frames pin the literal endpoints of the clip and the model
 *     interpolates between them; this is how you bridge two shots or land on
 *     an exact pose. Setting a character portrait as a first frame would make
 *     the clip literally open on that portrait — a different thing entirely.
 *
 * Each slot holds one image (file upload or URL paste), stored as a data URI
 * or a remote URL string.
 *
 * UX: clicking an empty slot opens the file picker; clicking a filled slot
 * shows a tiny action row (Replace / Clear) without leaving the card.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { SceneAssets } from "@/lib/story/stories";
import { isAcceptedImageSource } from "@/lib/story/image-format";
import { normalizeImageForModel } from "@/lib/story/image-normalize";

export type SceneAssetPickerProps = {
  assets: SceneAssets;
  onChange: (next: SceneAssets) => void;
  className?: string;
};

/** Only the single-image string slots — refImages is an array, handled apart. */
type SlotKey = "character" | "background" | "prop" | "firstFrame" | "lastFrame";

const SUBJECT_SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: "character", label: "Character", hint: "Who appears — identity reference" },
  { key: "background", label: "Background", hint: "Where it happens" },
  { key: "prop", label: "Prop", hint: "Key object / prop" },
];

const FRAME_SLOTS: { key: SlotKey; label: string; hint: string }[] = [
  { key: "firstFrame", label: "First frame", hint: "Clip opens on this exact image" },
  { key: "lastFrame", label: "Last frame", hint: "Clip lands on this exact image" },
];

/** Beyond this the model starts ignoring the tail, and cost climbs for nothing. */
const MAX_REF_IMAGES = 4;

const MAX_BYTES = 10 * 1024 * 1024;

export function SceneAssetPicker({
  assets,
  onChange,
  className,
}: SceneAssetPickerProps) {
  const set = (key: SlotKey, url: string) => onChange({ ...assets, [key]: url });
  const clear = (key: SlotKey) => {
    const next = { ...assets };
    delete next[key];
    onChange(next);
  };

  const refImages = assets.refImages ?? [];
  const setRef = (i: number, url: string) => {
    const next = [...refImages];
    next[i] = url;
    onChange({ ...assets, refImages: next });
  };
  const clearRef = (i: number) => {
    const next = refImages.filter((_, j) => j !== i);
    onChange({ ...assets, refImages: next.length ? next : undefined });
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Group label="Subject references" hint="identity — who and where">
        <div className="grid grid-cols-3 gap-2">
          {SUBJECT_SLOTS.map((slot) => (
            <AssetSlot
              key={slot.key}
              label={slot.label}
              hint={slot.hint}
              value={assets[slot.key]}
              onSet={(url) => set(slot.key, url)}
              onClear={() => clear(slot.key)}
            />
          ))}
        </div>
      </Group>

      <Group label="Frames" hint="pins the clip's exact start / end">
        <div className="grid grid-cols-3 gap-2">
          {FRAME_SLOTS.map((slot) => (
            <AssetSlot
              key={slot.key}
              label={slot.label}
              hint={slot.hint}
              value={assets[slot.key]}
              onSet={(url) => set(slot.key, url)}
              onClear={() => clear(slot.key)}
            />
          ))}
          {/* Third cell keeps the grid aligned with the row above. */}
          <div />
        </div>
      </Group>

      <Group
        label="Extra references"
        hint={`style / palette / secondary subjects · ${refImages.length}/${MAX_REF_IMAGES}`}
      >
        <div className="grid grid-cols-3 gap-2">
          {refImages.map((url, i) => (
            <AssetSlot
              key={`ref-${i}`}
              label={`Ref ${i + 1}`}
              hint="Loose visual guidance"
              value={url}
              onSet={(next) => setRef(i, next)}
              onClear={() => clearRef(i)}
            />
          ))}
          {refImages.length < MAX_REF_IMAGES && (
            <AssetSlot
              key={`ref-new-${refImages.length}`}
              label="Add reference"
              hint="Optional"
              value={undefined}
              onSet={(url) => onChange({ ...assets, refImages: [...refImages, url] })}
              onClear={() => {}}
            />
          )}
        </div>
      </Group>
    </div>
  );
}

function Group({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          {label}
        </span>
        <span className="font-mono text-[9px] text-ink-mute">{hint}</span>
      </div>
      {children}
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
  const [busy, setBusy] = React.useState(false);

  async function handleFiles(files: FileList | File[]) {
    setErr(null);
    const file = Array.from(files).find((f) => f.type.startsWith("image/"));
    if (!file) { setErr("Not an image"); return; }
    if (file.size > MAX_BYTES) { setErr("> 10 MB"); return; }
    setBusy(true);
    try {
      // 1. Re-encode. `accept="image/*"` yields AVIF, SVG and uppercase mimes,
      //    none of which the upstream accepts.
      const dataUri = await normalizeImageForModel(file);

      // 2. Host it publicly. The prompt model reads data URIs fine, but the
      //    VIDEO model fetches the image itself — a data URI (or a localhost
      //    URL) fails there. Uploading once here means everything downstream
      //    gets a URL that works.
      const url = await uploadReference(dataUri);
      onSet(url ?? dataUri);
      if (!url) {
        setErr("Saved locally — add TOS keys in Settings to use it for video");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read that image");
    } finally {
      setBusy(false);
    }
  }

  function handleAddUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (!isAcceptedImageSource(u)) {
      setErr("Need an http(s) URL or a png/jpeg/webp/gif data URI");
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

/**
 * Upload a normalised data URI to public storage, returning its URL.
 *
 * Returns null when the upload can't happen (no TOS keys yet, network down).
 * The caller then keeps the data URI: prompts still work, only video
 * generation needs the public URL — so a missing bucket degrades one feature
 * instead of blocking the upload entirely.
 */
async function uploadReference(dataUri: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUri)).blob();
    const form = new FormData();
    form.append("file", new File([blob], "reference.jpg", { type: blob.type || "image/jpeg" }));
    const res = await fetch("/api/story/upload-reference", { method: "POST", body: form });
    if (!res.ok) return null;
    const { url } = (await res.json()) as { url?: string };
    return typeof url === "string" && /^https?:\/\//i.test(url) ? url : null;
  } catch {
    return null;
  }
}
