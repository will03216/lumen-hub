"use client";

import { useCallback, useRef, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

/**
 * ReferenceImageInput — drop zone + URL paste for Seedream I2I references.
 *
 * Values are stored as strings: either a full URL or a base64 data URI. The
 * BytePlus `/images/generations` endpoint accepts both shapes verbatim, so
 * downstream code doesn't need to care which is which.
 *
 * File constraints (enforced here, to keep bad uploads off the wire):
 *  - ≤ 10 MB each (BytePlus hard cap)
 *  - image/* only
 *  - caller-controlled count cap via `maxCount` (default 10, which is the
 *    safest floor across the 4.5 / 5.0 Lite multi-ref docs)
 */

export type RefImage = {
  /** For URL/file kinds: URL or data URI — passed verbatim to BytePlus
   *  as part of the `image[]` request field.
   *  For the "prompt" kind: the style-description text itself; submit
   *  appends it to the user-written prompt rather than to image[]. */
  value: string;
  /** Discriminator. "url" / "file" → image-shaped ref (sent to BytePlus
   *  as image[]). "prompt" → text-only style preset (§68), appended to
   *  the prompt text on render. */
  kind: "url" | "file" | "prompt";
  /** Optional display label — filename for files, truncated URL for
   *  links, "#name" for Style-picker refs. */
  label?: string;
  /** Asset id when this ref came from the §67 References picker's
   *  Library-backed panels (History / Style / Character). Used by
   *  the picker for "is this asset already selected?" dedup so a
   *  data-URI conversion on the wire value doesn't lose identity. */
  assetId?: string;
};

export type ReferenceImageInputProps = {
  value: RefImage[];
  onChange: (next: RefImage[]) => void;
  maxCount?: number;
  /** Compact variant — smaller thumbs, tighter padding. */
  dense?: boolean;
  className?: string;
};

const MAX_BYTES = 10 * 1024 * 1024;

export function ReferenceImageInput({
  value,
  onChange,
  maxCount = 10,
  dense,
  className,
}: ReferenceImageInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const add = useCallback(
    (next: RefImage[]) => {
      const merged = [...value, ...next].slice(0, maxCount);
      onChange(merged);
    },
    [value, maxCount, onChange],
  );

  const readFiles = useCallback(
    async (files: FileList | File[]) => {
      setErr(null);
      const remaining = maxCount - value.length;
      if (remaining <= 0) {
        setErr(`Max ${maxCount} reference images`);
        return;
      }
      const picked = Array.from(files).slice(0, remaining);
      const results: RefImage[] = [];
      for (const f of picked) {
        if (!f.type.startsWith("image/")) {
          setErr(`${f.name}: not an image`);
          continue;
        }
        if (f.size > MAX_BYTES) {
          setErr(`${f.name}: > 10 MB`);
          continue;
        }
        const dataUri = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = () => reject(r.error);
          r.readAsDataURL(f);
        });
        results.push({ value: dataUri, kind: "file", label: f.name });
      }
      if (results.length) add(results);
    },
    [value.length, maxCount, add],
  );

  const addUrl = useCallback(() => {
    const u = urlDraft.trim();
    if (!u) return;
    // Very permissive URL check — BytePlus rejects broken URLs server-side
    // and we surface that error elsewhere. We just guard against pure garbage.
    if (!/^https?:\/\//i.test(u) && !u.startsWith("data:image/")) {
      setErr("URL must start with http(s):// or data:image/");
      return;
    }
    setErr(null);
    add([
      {
        value: u,
        kind: "url",
        label: u.startsWith("data:") ? "data URI" : u.replace(/^https?:\/\//, ""),
      },
    ]);
    setUrlDraft("");
  }, [urlDraft, add]);

  const remove = useCallback(
    (idx: number) => {
      onChange(value.filter((_, i) => i !== idx));
    },
    [value, onChange],
  );

  const canAddMore = value.length < maxCount;
  const thumbSize = dense ? "size-11" : "size-14";

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* Drop zone */}
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!canAddMore) return;
          if (e.dataTransfer.files?.length) void readFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-[10px] border border-dashed bg-bg-2 p-3 text-center transition-colors",
          dragging && canAddMore
            ? "border-accent bg-accent-soft"
            : "border-border",
          !canAddMore && "opacity-50",
        )}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void readFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!canAddMore}
          className="font-mono text-[11px] uppercase tracking-[0.10em] text-ink-dim hover:text-ink disabled:cursor-not-allowed"
        >
          Drop images · or <span className="text-ink underline">browse</span>
        </button>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
          {value.length}/{maxCount} · png jpg webp · ≤ 10 mb
        </div>
      </div>

      {/* URL paste row */}
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          placeholder="or paste an image URL…"
          disabled={!canAddMore}
          className="h-9 flex-1 rounded-[10px] border border-border bg-panel px-3 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors disabled:opacity-50"
        />
        <Chip onClick={addUrl} accent={!!urlDraft.trim()} disabled={!canAddMore}>
          Add
        </Chip>
      </div>

      {/* Error surface */}
      {err && (
        <div className="rounded-[8px] border border-[oklch(0.7_0.2_25)]/30 bg-[oklch(0.7_0.2_25)]/5 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
          {err}
        </div>
      )}

      {/* Thumbnails */}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((ref, i) => (
            <li key={i} className="group relative">
              <div
                className={cn(
                  "overflow-hidden rounded-[8px] border border-border bg-panel",
                  thumbSize,
                )}
                title={ref.label ?? ref.value}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ref.value}
                  alt={ref.label ?? `ref ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ref ${i + 1}`}
                className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full border border-border bg-bg text-[10px] leading-none text-ink-dim opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
              >
                ×
              </button>
              <span className="absolute left-0.5 bottom-0.5 font-mono text-[8px] uppercase tracking-[0.10em] text-ink/80">
                {i + 1}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
