"use client";

/**
 * /edit/[id] — the editor shell.
 *
 * P0 renders the base image in a plain <img>. P1 replaces that single element
 * with the Konva canvas, behind a dynamic({ssr:false}) loader — this file must
 * never import react-konva itself, or the client/server boundary that keeps
 * `canvas` out of the server bundle is defeated.
 *
 * Everything else here is already the shape the later phases need: the store
 * is the single source of truth, edits write through it rather than into
 * local state, and the version rail reads from the same record the render
 * hook patches.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelDropdown } from "@/components/ui/model-dropdown";
import {
  IMAGE_MODELS,
  IMAGE_QUALITIES,
  type ImageQualityId,
} from "@/lib/studio/models";
import { lastWriteError, updateEditSession } from "@/lib/edit/sessions";
import { useEditSession } from "@/lib/edit/use-edit-session";
import { buildEditRequest, useEditRender } from "@/lib/edit/use-edit-render";
import type { EditSession, EditVersion } from "@/lib/edit/types";
import { cn } from "@/lib/utils";

const ASPECTS = [
  { id: "source", label: "Source" },
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "4:5", label: "4:5" },
];

export function EditWorkspace({ sessionId }: { sessionId: string }) {
  const session = useEditSession(sessionId);
  const { state, render, cancel } = useEditRender(sessionId);

  // useSyncExternalStore returns null on the server and on the first client
  // render, which is indistinguishable from "no such session". Waiting for
  // mount avoids flashing "not found" at someone whose session is fine.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [showCompiled, setShowCompiled] = React.useState(false);
  const [viewVersionId, setViewVersionId] = React.useState<string | null>(null);

  if (!mounted) {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-ink-dim" />
      </Centered>
    );
  }

  if (!session) {
    return (
      <Centered>
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
          Session not found
        </div>
        <p className="max-w-[360px] text-center text-[14px] text-ink-dim">
          It may have been deleted, or created in a different browser — edit
          sessions are stored locally.
        </p>
        <Button asChild variant="primary" size="md">
          <Link href="/edit">Back to Edit</Link>
        </Button>
      </Centered>
    );
  }

  const base = session.refs[0];
  const latestDone = [...session.versions].reverse().find(
    (v) => v.status === "done" && v.outputs.length > 0,
  );
  const viewing =
    session.versions.find((v) => v.id === viewVersionId) ?? latestDone;
  const displayUrl = viewing?.outputs[0]?.url ?? base?.url;
  const busy = state.status === "running";
  const writeError = lastWriteError();

  return (
    <div className="mx-auto w-full max-w-[1440px] px-7 pb-16 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/edit"
            className="shrink-0 text-ink-mute transition-colors hover:text-ink"
            aria-label="Back to sessions"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <input
            value={session.name}
            onChange={(e) =>
              updateEditSession(sessionId, { name: e.target.value })
            }
            className="min-w-0 flex-1 truncate bg-transparent font-serif text-[20px] italic text-ink outline-none"
            aria-label="Session name"
          />
        </div>
        {base && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
            {base.width}×{base.height}
          </span>
        )}
      </div>

      {writeError && (
        <div className="mt-4 rounded-[10px] border border-[oklch(0.72_0.22_15_/_0.4)] bg-[oklch(0.72_0.22_15_/_0.08)] px-4 py-3 text-[13px] text-ink">
          Local storage is full — this session is not being saved. Delete a few
          older sessions to free space.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        {/* Viewport. P1 swaps this block for the Konva canvas loader. */}
        <div className="flex min-h-[420px] items-center justify-center rounded-[14px] border border-border bg-panel p-4">
          {displayUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote CDN
            // hosts aren't in the image optimizer's allow-list.
            <img
              src={displayUrl}
              alt={viewing ? "Edited result" : "Source image"}
              className="max-h-[70vh] w-auto max-w-full rounded-[8px] object-contain"
            />
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
              No image
            </span>
          )}
        </div>

        {/* Version rail */}
        <aside className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
            Versions
          </div>
          {session.versions.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-ink-mute">
              No renders yet. Describe a change below and hit Render.
            </p>
          ) : (
            <div className="space-y-2">
              {[...session.versions].reverse().map((v, i) => (
                <VersionRow
                  key={v.id}
                  version={v}
                  n={session.versions.length - i}
                  active={viewing?.id === v.id}
                  onClick={() => setViewVersionId(v.id)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Prompt bar */}
      <div className="mt-6 space-y-3 rounded-[14px] border border-border bg-panel p-4">
        <textarea
          value={session.instruction}
          onChange={(e) =>
            updateEditSession(sessionId, { instruction: e.target.value })
          }
          placeholder="Describe the edit — e.g. “replace the tabletop with dark walnut, keep the candle and the lighting unchanged”"
          rows={2}
          className="w-full resize-none bg-transparent text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-mute"
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[200px]">
            <ModelDropdown
              value={session.model}
              onChange={(model) => updateEditSession(sessionId, { model })}
              items={IMAGE_MODELS}
            />
          </div>

          <ChipGroup
            options={ASPECTS}
            value={session.aspectRatio}
            onChange={(aspectRatio) =>
              updateEditSession(sessionId, { aspectRatio })
            }
          />

          <ChipGroup
            options={IMAGE_QUALITIES.map((q) => ({ id: q.id, label: q.label }))}
            value={session.qualityId}
            onChange={(id) =>
              updateEditSession(sessionId, { qualityId: id as ImageQualityId })
            }
          />

          <div className="ml-auto flex items-center gap-2">
            {busy && (
              <Button variant="ghost" size="sm" onClick={cancel}>
                Cancel
              </Button>
            )}
            <Button
              variant="primary"
              size="md"
              disabled={busy || !session.instruction.trim()}
              onClick={() => {
                setViewVersionId(null);
                void render();
              }}
            >
              {busy ? "Rendering…" : "Render →"}
            </Button>
          </div>
        </div>

        {state.status === "error" && state.error && (
          <div className="rounded-[10px] border border-[oklch(0.72_0.22_15_/_0.4)] bg-[oklch(0.72_0.22_15_/_0.08)] px-3 py-2 text-[13px] text-ink">
            <span className="font-medium">{state.error.title}</span>{" "}
            <span className="text-ink-dim">{state.error.detail}</span>
            {state.missingKey && (
              <>
                {" "}
                <Link href="/settings" className="underline hover:text-ink">
                  Add your key in Settings →
                </Link>
              </>
            )}
          </div>
        )}

        {/* The disclosure exists because "what did it actually send?" is the
            first question whenever a render surprises someone in a demo. */}
        <div>
          <button
            onClick={() => setShowCompiled((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:text-ink-dim"
          >
            {showCompiled ? "▾" : "▸"} show compiled prompt
          </button>
          {showCompiled && <CompiledPrompt session={session} />}
        </div>
      </div>
    </div>
  );
}

function CompiledPrompt({ session }: { session: EditSession }) {
  const req = React.useMemo(() => buildEditRequest(session), [session]);
  return (
    <pre className="mt-2 max-h-[240px] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-[var(--bg)] p-3 font-mono text-[11px] leading-relaxed text-ink-dim">
      {req.prompt || "(empty)"}
      {"\n\n"}
      {`model: ${req.model}\nsize:  ${req.size}${
        req.seed !== undefined ? `\nseed:  ${req.seed}` : ""
      }\nimage: ${
        Array.isArray(req.image)
          ? `${req.image.length} refs`
          : (req.image ?? "none")
      }`}
    </pre>
  );
}

function VersionRow({
  version,
  n,
  active,
  onClick,
}: {
  version: EditVersion;
  n: number;
  active: boolean;
  onClick: () => void;
}) {
  const thumb = version.outputs[0]?.url;
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] border p-2 text-left transition-colors",
        active
          ? "border-border-strong bg-[var(--bg)]"
          : "border-border hover:border-border-strong",
      )}
    >
      <div className="size-10 shrink-0 overflow-hidden rounded-[6px] bg-[var(--bg)]">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- see above
          <img src={thumb} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center">
            {version.status === "pending" ? (
              <Loader2 className="size-3 animate-spin text-ink-mute" />
            ) : (
              <span className="font-mono text-[9px] text-ink-mute">—</span>
            )}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          v{n} · {version.status}
        </div>
        <div className="truncate text-[12px] text-ink-mute">
          {version.instruction || "—"}
        </div>
      </div>
    </button>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full border border-border p-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors",
            value === o.id
              ? "bg-ink text-[var(--bg)]"
              : "text-ink-mute hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      {children}
    </div>
  );
}
