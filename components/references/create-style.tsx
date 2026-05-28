"use client";

/**
 * CreateStyle — §68 sub-view inside the References picker.
 *
 * Two modes via a tab toggle:
 *
 *  - Reference image: drop / select an image + name → persisted as
 *    `Asset { kind:"reference", tags:["ref:style"], url:<dataURI>,
 *    title:"#<name>" }`. Behaves like a regular image ref afterwards.
 *
 *  - Prompt: write a free-form description + name → persisted as
 *    `Asset { kind:"reference", tags:["ref:style","ref:prompt"],
 *    prompt:<text>, title:"#<name>" }`. On render, the description is
 *    appended to the user's prompt (no image bytes touch BytePlus).
 *
 * The form lives inline in the picker's center column; the picker
 * wraps this in its own back-arrow header and rebinds onClose to
 * "back to grid" rather than "close modal".
 */

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { addAsset } from "@/lib/library/assets";
import { REF_TAG_PROMPT, REF_TAG_STYLE } from "@/lib/library/refs-tags";
import { cn } from "@/lib/utils";

export type CreateStyleProps = {
  onBack: () => void;
  /** Fires after a successful create. Picker can switch back to the
   *  grid and the new style will be in there via the assets snapshot. */
  onCreated: (assetId: string) => void;
};

type Mode = "image" | "prompt";

const MAX_BYTES = 10 * 1024 * 1024;

export function CreateStyle({ onBack, onCreated }: CreateStyleProps) {
  const [mode, setMode] = React.useState<Mode>("image");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [filePreview, setFilePreview] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = React.useState(false);

  function pickFile(f: File) {
    if (!f.type.startsWith("image/")) {
      setErr(`Not an image (${f.type || "unknown"})`);
      return;
    }
    if (f.size > MAX_BYTES) {
      setErr(`Image too large — ${(f.size / 1024 / 1024).toFixed(1)}MB exceeds 10MB`);
      return;
    }
    setErr(null);
    setFile(f);
    // Preview as object URL — cheap, and revoked when this component
    // unmounts or another file is picked.
    const url = URL.createObjectURL(f);
    setFilePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
  }

  React.useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
    // Cleanup only — we intentionally don't track filePreview in deps;
    // pickFile handles the revoke-on-replace path itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanName = name.trim().replace(/^#+/, "");
  const canSubmit =
    !!cleanName &&
    !busy &&
    (mode === "image" ? !!file : !!description.trim());

  async function onSubmit() {
    if (!canSubmit) return;
    setErr(null);
    setBusy(true);
    try {
      if (mode === "image" && file) {
        const dataUri = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result ?? ""));
          r.onerror = () => reject(new Error("Failed to read file"));
          r.readAsDataURL(file);
        });
        const asset = addAsset({
          kind: "reference",
          url: dataUri,
          source: "uploaded",
          title: `#${cleanName}`,
          tags: [REF_TAG_STYLE],
        });
        onCreated(asset.id);
      } else if (mode === "prompt") {
        const asset = addAsset({
          kind: "reference",
          // Text-only style — no URL bytes. Empty string keeps the
          // schema happy; consumers (picker grid, submit-time splitter)
          // gate on the ref:prompt tag.
          url: "",
          source: "imported",
          title: `#${cleanName}`,
          prompt: description.trim(),
          tags: [REF_TAG_STYLE, REF_TAG_PROMPT],
        });
        onCreated(asset.id);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex h-full flex-col overflow-hidden">
      {/* Header — Back button + title */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to styles"
          className="grid size-8 place-items-center rounded-full border border-border bg-bg-2 text-ink-dim hover:text-ink hover:border-ink cursor-pointer"
        >
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="font-serif text-[20px] text-ink">Create Style</h2>
      </div>

      {/* Body — two-column layout matching the Freepik design: left is
          the input surface (image upload or textarea), right is the tab
          toggle + name + create button + disclaimers. */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto grid max-w-[720px] grid-cols-1 gap-6 md:grid-cols-2 md:items-start">
          {/* Left column — input surface */}
          {mode === "image" ? (
            <div
              className={cn(
                "relative aspect-square w-full rounded-[14px] border border-dashed bg-bg-2 transition-colors",
                dragOver ? "border-accent bg-accent-soft" : "border-border",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) pickFile(f);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickFile(f);
                  e.target.value = "";
                }}
              />
              {filePreview ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={filePreview}
                  alt="reference preview"
                  className="absolute inset-0 h-full w-full rounded-[14px] object-cover"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 grid place-items-center text-center text-ink-dim cursor-pointer"
                >
                  <span>
                    <span className="block font-mono text-[11px] uppercase tracking-[0.14em]">
                      Drop an image or
                    </span>
                    <span className="mt-1 inline-block text-[13px] text-accent underline">
                      select a file
                    </span>
                  </span>
                </button>
              )}
              {filePreview && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    if (filePreview) URL.revokeObjectURL(filePreview);
                    setFilePreview(null);
                  }}
                  className="absolute right-2 top-2 grid size-6 place-items-center rounded-full border border-border bg-bg text-ink-dim hover:text-ink cursor-pointer"
                  aria-label="Clear image"
                >
                  ×
                </button>
              )}
            </div>
          ) : (
            <div className="flex aspect-square w-full flex-col rounded-[14px] border border-border bg-bg-2 p-3">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your new style → cinematic 35mm film, vintage, soft orange and earth tones, misty light creating a serene, ethereal glow."
                rows={9}
                className="flex-1 w-full resize-none rounded-[10px] border border-border bg-panel p-3 text-[13px] leading-[1.55] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
              />
              <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.10em] text-ink-mute">
                {description.length}/600 — appended to your prompt at render time
              </p>
            </div>
          )}

          {/* Right column — tabs + name + create */}
          <div className="flex flex-col gap-4">
            <div className="inline-flex rounded-[10px] border border-border bg-panel p-1">
              <TabBtn active={mode === "image"} onClick={() => setMode("image")}>
                Reference image
              </TabBtn>
              <TabBtn active={mode === "prompt"} onClick={() => setMode("prompt")}>
                Prompt
              </TabBtn>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.10em] leading-relaxed text-ink-dim">
              {mode === "image"
                ? "The image will be used as a style reference during generation."
                : "Write your own style description to use during generation."}
            </p>

            <label className="flex items-center gap-2 rounded-[10px] border border-border bg-panel px-3 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent transition-colors">
              <span className="font-mono text-[12px] text-ink-dim">#</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name"
                className="h-10 flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-mute focus:outline-none"
              />
            </label>

            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={!canSubmit}
              className={cn(
                "inline-flex h-11 items-center justify-center rounded-[10px] px-4 text-[14px] font-medium transition-colors cursor-pointer",
                canSubmit
                  ? "bg-accent text-white hover:opacity-90"
                  : "bg-panel text-ink-mute cursor-not-allowed",
              )}
            >
              {busy ? "Creating…" : "Create your style"}
            </button>

            <p className="text-[11px] leading-relaxed text-ink-dim">
              Your custom style and all your generations are private and will
              not be used to train any datasets.
            </p>

            {err && (
              <div className="rounded-[8px] border border-[oklch(0.7_0.2_25)]/30 bg-[oklch(0.7_0.2_25)]/5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
                {err}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-[8px] px-3.5 py-1.5 text-[12px] font-medium transition-colors cursor-pointer",
        active
          ? "bg-bg text-ink"
          : "text-ink-dim hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
