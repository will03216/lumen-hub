"use client";

/**
 * Secondary references — PRD §5C, multi-image fusion and sketch-to-image.
 *
 * The base image is what gets edited. Everything added here is context: a
 * product to composite in, a style to borrow, a rough sketch to render from.
 *
 * The ROLE is the whole feature. Seedream receives several images in one
 * array with no inherent labelling, so without a role the model has to guess
 * which is the subject and which is a style hint — and it guesses wrong often
 * enough to matter. The role turns into a prose line telling the model how to
 * use each one, which is the difference between "fuse these" working and
 * producing a collage.
 *
 * Order is load-bearing too: the base ref goes first in the wire array
 * because Seedream treats the first entry as the subject. That ordering lives
 * in buildEditRequest, not here — this panel only ever appends.
 */

import * as React from "react";
import { Globe, Layers, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IMAGE_ACCEPT_ATTR } from "@/lib/media/upload-formats";
import { MAX_REF_IMAGES } from "@/lib/studio/models";
import { patchRef, removeRef } from "@/lib/edit/sessions";
import { addReferenceToSession } from "@/lib/edit/start-session";
import type { EditRefRole, EditReference } from "@/lib/edit/types";
import { cn } from "@/lib/utils";

/** Base is excluded — it is the image being edited, not a reference to it. */
const ROLES: Array<{ id: EditRefRole; label: string; hint: string }> = [
  {
    id: "subject",
    label: "Subject",
    hint: "Composite this object into the scene",
  },
  { id: "style", label: "Style", hint: "Borrow the look, not the content" },
  { id: "sketch", label: "Sketch", hint: "Use as a layout guide to render from" },
];

export function ReferencesPanel({
  sessionId,
  refs,
}: {
  sessionId: string;
  refs: EditReference[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [urlMode, setUrlMode] = React.useState(false);
  const [url, setUrl] = React.useState("");
  const [role, setRole] = React.useState<EditRefRole>("subject");
  const fileRef = React.useRef<HTMLInputElement>(null);

  const extras = refs.filter((r) => r.role !== "base");
  // The cap counts the base image too — it occupies a slot in the same array.
  const atCap = refs.length >= MAX_REF_IMAGES;

  const add = React.useCallback(
    async (source: File | string) => {
      setBusy(true);
      setError(null);
      try {
        await addReferenceToSession(sessionId, source, role);
        setUrl("");
        setUrlMode(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [sessionId, role],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          References
        </span>
        <span className="font-mono text-[10px] text-ink-mute">
          {refs.length}/{MAX_REF_IMAGES}
        </span>
      </div>

      {extras.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-ink-mute">
          Add an image to fuse in, borrow a style from, or render a sketch into.
        </p>
      ) : (
        <div className="space-y-1.5">
          {extras.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-[8px] border border-border p-1.5"
            >
              <div className="size-8 shrink-0 overflow-hidden rounded-[4px] bg-[var(--bg)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- remote
                    CDN hosts aren't in the image optimizer's allow-list. */}
                <img src={r.url} alt="" className="size-full object-cover" />
              </div>
              <select
                value={r.role}
                onChange={(e) =>
                  patchRef(sessionId, r.id, {
                    role: e.target.value as EditRefRole,
                  })
                }
                className="min-w-0 flex-1 bg-transparent font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim outline-none"
                aria-label="Reference role"
              >
                {ROLES.map((o) => (
                  <option key={o.id} value={o.id} className="bg-panel">
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => removeRef(sessionId, r.id)}
                title="Remove reference"
                className="shrink-0 text-ink-mute transition-colors hover:text-[oklch(0.72_0.22_15)]"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Role is chosen BEFORE adding, so the model is told how to use the
          image from the first render rather than after a wasted one. */}
      {!atCap && (
        <>
          <div className="flex items-center gap-1 rounded-full border border-border p-1">
            {ROLES.map((o) => (
              <button
                key={o.id}
                onClick={() => setRole(o.id)}
                title={o.hint}
                className={cn(
                  "flex-1 rounded-full px-2 py-1 font-mono text-[9px] uppercase tracking-[0.1em] transition-colors",
                  role === o.id
                    ? "bg-ink text-[var(--bg)]"
                    : "text-ink-mute hover:text-ink",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void add(f);
            }}
          />

          {urlMode ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (url.trim()) void add(url);
              }}
              className="flex gap-1"
            >
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setUrlMode(false);
                }}
                placeholder="https://…"
                className="min-w-0 flex-1 rounded-full border border-border bg-transparent px-2.5 py-1 text-[12px] text-ink outline-none placeholder:text-ink-mute focus:border-ink-dim"
              />
              <Button type="submit" size="sm" variant="primary" disabled={busy}>
                Add
              </Button>
            </form>
          ) : (
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="default"
                disabled={busy}
                className="flex-1"
                onClick={() => fileRef.current?.click()}
              >
                <Layers className="mr-1 size-3" />
                {busy ? "Adding…" : "Add image"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setUrlMode(true)}
                title="Paste an image URL"
              >
                <Globe className="size-3" />
              </Button>
            </div>
          )}
        </>
      )}

      {atCap && (
        <p className="text-[11px] leading-relaxed text-ink-mute">
          Reference limit reached. Remove one to add another.
        </p>
      )}

      {error && (
        <p className="text-[11px] leading-relaxed text-[oklch(0.72_0.22_15)]">
          {error}
        </p>
      )}
    </div>
  );
}
