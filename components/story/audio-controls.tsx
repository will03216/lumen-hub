"use client";

/**
 * AudioControls — per-scene audio settings.
 *
 * Two independently useful knobs:
 *   1. AI audio toggle  — passes `audio: true` to Seedance 2.0's native
 *      audio-generation feature. The model synthesises ambient sound and
 *      score that matches the video content.
 *   2. Custom audio slot — upload or paste a URL for any audio file
 *      (MP3, WAV, AAC, OGG). The file is mixed over the generated clip
 *      via FFmpeg during stitching, replacing the AI-generated audio.
 *
 * The parent is responsible for persisting changes via `onChange`.
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export type AudioControlsValue = {
  audio: boolean;
  audioUrl?: string;
};

export type AudioControlsProps = {
  value: AudioControlsValue;
  onChange: (next: AudioControlsValue) => void;
  className?: string;
};

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — generous for audio files
const ACCEPTED = "audio/mpeg,audio/wav,audio/ogg,audio/aac,audio/mp4,audio/*";

export function AudioControls({ value, onChange, className }: AudioControlsProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* AI audio toggle */}
      <label className="flex items-center gap-3 cursor-pointer group">
        <button
          type="button"
          role="switch"
          aria-checked={value.audio}
          onClick={() => onChange({ ...value, audio: !value.audio })}
          className={cn(
            "relative h-5 w-9 rounded-full border transition-colors shrink-0",
            value.audio
              ? "bg-accent border-accent"
              : "bg-panel-2 border-border group-hover:border-border-strong",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white transition-transform",
              value.audio ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            AI Audio
          </span>
          <span className="font-mono text-[9px] text-ink-mute">
            Seedance 2.0 generates ambient sound &amp; score
          </span>
        </div>
      </label>

      {/* Custom audio */}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
          Custom audio {value.audioUrl ? "· overrides AI audio" : "· optional"}
        </span>
        {value.audioUrl ? (
          <FilledAudioSlot
            url={value.audioUrl}
            onClear={() => onChange({ ...value, audioUrl: undefined })}
            onReplace={(url) => onChange({ ...value, audioUrl: url })}
          />
        ) : (
          <EmptyAudioSlot
            onSet={(url) => onChange({ ...value, audioUrl: url })}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── Filled slot ──────────────────────────────────

function FilledAudioSlot({
  url,
  onClear,
  onReplace,
}: {
  url: string;
  onClear: () => void;
  onReplace: (url: string) => void;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const isDataUri = url.startsWith("data:");
  const displayName = isDataUri ? "Custom audio file" : url.replace(/^https?:\/\//, "").slice(0, 48);

  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-border bg-panel-2 px-3 py-2">
      <span className="font-mono text-[16px] text-ink-dim">♪</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate font-mono text-[10px] text-ink">{displayName}</span>
        {!isDataUri && (
          <audio src={url} controls className="h-6 w-full opacity-80" />
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) { onReplace(await readFile(f)); }
          e.target.value = "";
        }}
      />
      <button
        onClick={() => fileRef.current?.click()}
        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute hover:text-ink transition-colors"
      >
        Replace
      </button>
      <button
        onClick={onClear}
        className="shrink-0 font-mono text-[9px] text-ink-mute hover:text-[oklch(0.72_0.22_15)] transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

// ─────────────────────────── Empty slot ───────────────────────────────────

function EmptyAudioSlot({ onSet }: { onSet: (url: string) => void }) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [urlMode, setUrlMode] = React.useState(false);
  const [urlDraft, setUrlDraft] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  async function handleFiles(files: FileList) {
    setErr(null);
    const f = files[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { setErr("> 50 MB"); return; }
    onSet(await readFile(f));
  }

  function handleAddUrl() {
    const u = urlDraft.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { setErr("Need http(s):// URL"); return; }
    onSet(u);
    setUrlDraft("");
    setUrlMode(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-[8px] border border-dashed px-3 py-2.5 transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-border bg-panel-2 hover:border-border-strong",
        )}
      >
        <input ref={fileRef} type="file" accept={ACCEPTED} className="hidden"
          onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); e.target.value = ""; }} />
        <span className="font-mono text-[14px] text-ink-mute">♪</span>
        <span className="font-mono text-[10px] text-ink-mute">
          Drop audio · or <span className="text-ink underline">browse</span>
        </span>
        <span className="ml-auto font-mono text-[8px] uppercase tracking-[0.12em] text-ink-mute">
          mp3 wav aac ogg
        </span>
      </div>

      {!urlMode ? (
        <button
          onClick={(e) => { e.stopPropagation(); setUrlMode(true); }}
          className="text-left font-mono text-[9px] uppercase tracking-[0.12em] text-ink-mute hover:text-ink-dim transition-colors"
        >
          Paste URL instead
        </button>
      ) : (
        <div className="flex gap-1.5">
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
            className="h-8 flex-1 rounded-[8px] border border-border bg-panel px-2.5 text-[11px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent"
          />
          <button onClick={handleAddUrl} className="rounded-[8px] border border-accent bg-accent/10 px-3 font-mono text-[9px] uppercase tracking-[0.12em] text-accent hover:bg-accent/20">Add</button>
          <button onClick={() => { setUrlMode(false); setErr(null); }} className="rounded-[8px] border border-border px-2.5 font-mono text-[9px] text-ink-mute hover:text-ink">✕</button>
        </div>
      )}

      {err && <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">{err}</span>}
    </div>
  );
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
