"use client";

/**
 * /edit/[id] — the editor shell.
 *
 * This file MUST NOT import react-konva, directly or via a value import of a
 * Konva type. The canvas is reached only through canvas-loader.tsx, which is
 * what keeps konva's Node entry (and its native `canvas` dependency) out of
 * the server bundle. `import type { EditTool }` below is safe precisely
 * because it erases at compile time.
 *
 * The store is the single source of truth: every edit writes through it and
 * comes back via useEditSession. Nothing here mirrors session data into local
 * state, so the canvas, the panel, and the version rail cannot disagree.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModelDropdown } from "@/components/ui/model-dropdown";
import { IMAGE_MODELS, IMAGE_QUALITIES } from "@/lib/studio/models";
import {
  lastWriteError,
  newEditId,
  removeAnnotation,
  restoreVersion,
  updateEditSession,
  upsertAnnotation,
} from "@/lib/edit/sessions";
import { buildAnnotation, type DraftAnnotation } from "@/lib/edit/annotations";
import { useEditSession } from "@/lib/edit/use-edit-session";
import { useStorageUserReady } from "@/lib/use-storage-user";
import { useLayerSeparation } from "@/lib/edit/use-layer-separation";
import { buildEditRequest, useEditRender } from "@/lib/edit/use-edit-render";
import {
  MARKER_COLOR,
  type Annotation,
  type EditQualityId,
  type EditSession,
  type EditVersion,
} from "@/lib/edit/types";
import { cn } from "@/lib/utils";
import EditCanvasLoader from "./canvas-loader";
import type { EditTool, GeometryPatch } from "./edit-canvas";
import { ToolRail } from "./tool-rail";
import { AnnotationPanel } from "./annotation-panel";
import { AgentPanel } from "./agent-panel";
import { ResultView } from "./result-view";
import { ReferencesPanel } from "./references-panel";
import { CanvasBoundary } from "./canvas-boundary";
import { LayersPanel } from "./layers-panel";
import { PresetStrip } from "./preset-strip";

/** Kill switch for §5B. Set NEXT_PUBLIC_EDIT_LAYERS=0 to hide the panel. */
const LAYERS_ENABLED = process.env.NEXT_PUBLIC_EDIT_LAYERS !== "0";

const ASPECTS = [
  { id: "source", label: "Source" },
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "4:5", label: "4:5" },
];

export function EditWorkspace({ sessionId }: { sessionId: string }) {
  const session = useEditSession(sessionId);
  const storageReady = useStorageUserReady();
  const { state, render, cancel } = useEditRender(sessionId);
  const layers = useLayerSeparation(sessionId);

  // useSyncExternalStore returns null on the server and on the first client
  // render, which is indistinguishable from "no such session". Waiting for
  // mount avoids flashing "not found" at someone whose session is fine.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [tool, setTool] = React.useState<EditTool>("box");
  const [brushWidth, setBrushWidth] = React.useState(24);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showCompiled, setShowCompiled] = React.useState(false);
  const [viewVersionId, setViewVersionId] = React.useState<string | null>(null);
  const [capWarning, setCapWarning] = React.useState<string | null>(null);

  /**
   * Which surface the viewport shows.
   *
   * This has to be explicit state. Deriving it from "is there a finished
   * version?" means it is true forever after the first successful render,
   * and the canvas becomes permanently unreachable — you can keep firing
   * blind re-renders but can never see or adjust a mark again, which kills
   * the whole mark-render-adjust loop.
   */
  const [showCanvas, setShowCanvas] = React.useState(true);

  const activeRef = session?.refs[0] ?? null;
  const activeRefId = activeRef?.id ?? null;

  // Flip to the result when a render lands, so the user sees what they asked
  // for without having to go looking for it.
  const lastShownVersion = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (state.status !== "success" || !state.versionId) return;
    if (lastShownVersion.current === state.versionId) return;
    lastShownVersion.current = state.versionId;
    setViewVersionId(state.versionId);
    setShowCanvas(false);
  }, [state.status, state.versionId]);

  const handleCommit = React.useCallback(
    (draft: DraftAnnotation) => {
      if (!activeRefId) return;
      const existing =
        session?.refs.find((r) => r.id === activeRefId)?.annotations ?? [];
      const ann = buildAnnotation(draft, existing, {
        id: newEditId(),
        now: Date.now(),
        color: MARKER_COLOR,
      });
      // The store refuses an add past the per-reference cap. Saying so beats
      // the alternative: the user drags a box, nothing appears on the canvas,
      // and there is no explanation anywhere on the page.
      if (!upsertAnnotation(sessionId, activeRefId, ann)) {
        setCapWarning(
          `That reference already has the maximum ${existing.length} marks. Delete one to add another.`,
        );
        return;
      }
      setCapWarning(null);
      setSelectedId(ann.id);
    },
    [sessionId, activeRefId, session],
  );

  /**
   * A mark was moved or resized on the canvas.
   *
   * Kind-checked before the spread: the patch is discriminated, so a box's
   * rect landing on a point is a compile error here rather than a shape with
   * two geometries in the store.
   */
  const handleGeometry = React.useCallback(
    (id: string, geometry: GeometryPatch) => {
      if (!activeRefId) return;
      const current = session?.refs
        .find((r) => r.id === activeRefId)
        ?.annotations.find((a) => a.id === id);
      if (!current || current.kind !== geometry.kind) return;
      // An exception in a pointer handler never reaches the error boundary —
      // React logs it and the gesture silently does nothing, which is
      // indistinguishable from "dragging is broken". Surface it in the slot
      // that is already on screen.
      try {
        upsertAnnotation(sessionId, activeRefId, {
          ...current,
          ...geometry,
        } as Annotation);
      } catch (e) {
        setCapWarning(
          `Could not move that mark: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    },
    [sessionId, activeRefId, session],
  );

  const handlePatch = React.useCallback(
    (id: string, patch: { note?: string; hidden?: boolean }) => {
      if (!activeRefId) return;
      const current = session?.refs
        .find((r) => r.id === activeRefId)
        ?.annotations.find((a) => a.id === id);
      if (!current) return;
      // Spread onto the concrete member, not onto the union — see the note on
      // AnnotationPanel's onPatch type.
      upsertAnnotation(sessionId, activeRefId, {
        ...current,
        ...patch,
      } as Annotation);
    },
    [sessionId, activeRefId, session],
  );

  // Called unconditionally, before any early return — these are hooks. The
  // ?? "" keeps them valid while the session is still resolving.
  const nameField = useDebouncedField(session?.name ?? "", (name) =>
    updateEditSession(sessionId, { name }),
  );
  const instructionField = useDebouncedField(
    session?.instruction ?? "",
    (instruction) => updateEditSession(sessionId, { instruction }),
  );

  // Two different "not yet"s. `mounted` is hydration; `storageReady` is Clerk
  // telling us WHOSE localStorage this is. Reading before the second one
  // resolves hits the unscoped key, so declaring the session missing there
  // would be a lie — and until this store re-read on that signal, a refresh
  // of a perfectly good session said "Session not found" permanently.
  if (!mounted || !storageReady) {
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

  const latestDone = [...session.versions]
    .reverse()
    .find((v) => v.status === "done" && v.outputs.length > 0);
  // showCanvas wins outright — without that gate `latestDone` makes `viewing`
  // permanently truthy and there is no way back to the canvas.
  const viewing = showCanvas
    ? undefined
    : (session.versions.find((v) => v.id === viewVersionId) ?? latestDone);
  const busy = state.status === "running";
  const writeError = lastWriteError();
  const annotations = activeRef?.annotations ?? [];

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
            value={nameField.value}
            onChange={(e) => nameField.onChange(e.target.value)}
            onBlur={nameField.flush}
            className="min-w-0 flex-1 truncate bg-transparent font-serif text-[20px] italic text-ink outline-none"
            aria-label="Session name"
          />
        </div>
        {activeRef && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">
            {activeRef.width}×{activeRef.height}
          </span>
        )}
      </div>

      {writeError && (
        <div className="mt-4 rounded-[10px] border border-[oklch(0.72_0.22_15_/_0.4)] bg-[oklch(0.72_0.22_15_/_0.08)] px-4 py-3 text-[13px] text-ink">
          Local storage is full — this session is not being saved. Delete a few
          older sessions to free space.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[164px_1fr_320px]">
        {/* Tools */}
        <ToolRail
          tool={tool}
          onToolChange={setTool}
          brushWidth={brushWidth}
          onBrushWidthChange={setBrushWidth}
        />

        {/* Viewport */}
        <div className="space-y-2">
          <div className="h-[min(68vh,720px)] overflow-hidden rounded-[14px] border border-border bg-panel">
            {viewing?.outputs[0]?.url ? (
              <ResultView
                version={viewing}
                sourceUrl={activeRef?.url ?? null}
                sourceWidth={activeRef?.width ?? 0}
                sourceHeight={activeRef?.height ?? 0}
                // The marks that produced THIS version, not what is on the
                // canvas now — otherwise the overlay misreports what was asked.
                annotations={
                  activeRefId
                    ? (viewing.annotationsSnapshot[activeRefId] ?? [])
                    : []
                }
                onRestore={() => {
                  restoreVersion(sessionId, viewing.id);
                  setShowCanvas(true);
                }}
              />
            ) : activeRef ? (
              <CanvasBoundary>
                <EditCanvasLoader
                  reference={activeRef}
                  annotations={annotations}
                  tool={tool}
                  brushWidth={brushWidth}
                  color={MARKER_COLOR}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onCommit={handleCommit}
                  onGeometry={handleGeometry}
                />
              </CanvasBoundary>
            ) : (
              <div className="flex size-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
                No image
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            {viewing?.outputs[0]?.url ? (
              <button
                onClick={() => setShowCanvas(true)}
                className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:text-ink"
              >
                ← Back to the canvas
              </button>
            ) : (
              latestDone && (
                <button
                  onClick={() => {
                    setViewVersionId(latestDone.id);
                    setShowCanvas(false);
                  }}
                  className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute transition-colors hover:text-ink"
                >
                  Show latest result →
                </button>
              )
            )}
            {capWarning && (
              <span className="text-[12px] text-[oklch(0.72_0.22_15)]">
                {capWarning}
              </span>
            )}
          </div>
        </div>

        {/* Agent + marks + versions */}
        <aside className="space-y-6">
          {/* The agent drives the same tools the rail does, so its marks show
              up in the panel below and can be corrected by hand. */}
          <AgentPanel
            sessionId={sessionId}
            onRender={render}
            onSeparateLayers={LAYERS_ENABLED ? layers.separate : undefined}
          />

          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              Marks
            </div>
            <AnnotationPanel
              annotations={annotations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPatch={handlePatch}
              onRemove={(id) => {
                if (activeRefId) removeAnnotation(sessionId, activeRefId, id);
                if (selectedId === id) setSelectedId(null);
              }}
            />
          </div>

          {/* §5C — fusion and sketch. Roles here become prose telling the
              model how to use each image; without them it has to guess which
              of several images is the subject. */}
          <ReferencesPanel sessionId={sessionId} refs={session.refs} />

          {/* §5B — behind a kill switch rather than an opt-in. The upstream
              API is preview-flagged and may not be enabled on a given
              BytePlus account, but that case already reports itself clearly,
              so defaulting to visible costs nothing and hiding it would mean
              a rebuild to try the feature at all. */}
          {LAYERS_ENABLED && (
            <LayersPanel
              reference={activeRef}
              state={layers.state}
              // Passes the ref explicitly rather than letting the hook
              // default to refs[0]. Today `activeRef` IS refs[0], so this
              // changes nothing — but the hook is also driven by the agent,
              // which can target any reference, and an implicit default is
              // how those two callers would quietly disagree.
              onSeparate={(maxLayers, mode) => {
                void layers.separate(maxLayers, {
                  refId: activeRef?.id,
                  mode,
                });
              }}
              onToggle={layers.toggle}
            />
          )}

          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
              Versions
            </div>
            {session.versions.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-ink-mute">
                No renders yet.
              </p>
            ) : (
              <div className="space-y-2">
                {[...session.versions].reverse().map((v, i) => (
                  <VersionRow
                    key={v.id}
                    version={v}
                    n={session.versions.length - i}
                    active={viewing?.id === v.id}
                    onClick={() => {
                      setViewVersionId(v.id);
                      setShowCanvas(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Prompt bar */}
      <div className="mt-6 space-y-3 rounded-[14px] border border-border bg-panel p-4">
        {/* §5D — presets sit directly above the instruction box because that
            is what they write into. §4's competitive read was that presets
            ARE the demo: an empty canvas is where a demo dies in the first
            thirty seconds. */}
        <PresetStrip
          // Hidden marks don't count: the compiler drops them, so a canvas
          // whose only mark is hidden sends no coordinates at all — and a
          // "remove the marked object" preset would then be a confident,
          // unscoped edit.
          hasMark={annotations.some((a) => !a.hidden)}
          onApply={(instruction) => {
            // Straight through the buffered field so the textarea updates
            // immediately, then flushed so Render doesn't read stale text
            // if it is clicked inside the debounce window.
            instructionField.onChange(instruction);
            instructionField.flush();
          }}
        />

        <textarea
          value={instructionField.value}
          onChange={(e) => instructionField.onChange(e.target.value)}
          onBlur={instructionField.flush}
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

          {/* "Source" leads and is the default: an edit should come back the
              size it went in. The presets are for deliberately going bigger. */}
          <ChipGroup
            options={[
              { id: "source", label: "Source" },
              ...IMAGE_QUALITIES.map((q) => ({ id: q.id, label: q.label })),
            ]}
            value={session.qualityId}
            onChange={(id) =>
              updateEditSession(sessionId, { qualityId: id as EditQualityId })
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
              // The buffered value, not the store's — otherwise the button
              // stays disabled for the length of the debounce after typing.
              disabled={busy || !instructionField.value.trim()}
              onClick={() => {
                // render() reads the instruction back off the store, so any
                // buffered keystrokes have to land first or it sends the
                // previous text.
                instructionField.flush();
                // Stay on the canvas while it runs; the success effect flips
                // to the result once there is one to show.
                setShowCanvas(true);
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

        {state.warnings && state.warnings.length > 0 && (
          <ul className="space-y-0.5 text-[12px] text-ink-mute">
            {state.warnings.map((w) => (
              <li key={w}>· {w}</li>
            ))}
          </ul>
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
  const transports = req.plans
    .map((p) => `ref ${p.index}: ${p.transport}`)
    .join(", ");
  return (
    <pre className="mt-2 max-h-[280px] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-[var(--bg)] p-3 font-mono text-[11px] leading-relaxed text-ink-dim">
      {req.prompt || "(empty)"}
      {"\n\n"}
      {`model: ${req.model}\nsize:  ${req.size}${
        req.seed !== undefined ? `\nseed:  ${req.seed}` : ""
      }\n${transports || "no references"}`}
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

/**
 * A text field backed by the store, buffered locally and written on a debounce.
 *
 * Writing straight through on every keystroke is what the naive version did,
 * and it is genuinely expensive: each one is a full read-modify-write of the
 * ENTIRE multi-session store — JSON.parse of every session, JSON.stringify of
 * every session, a synchronous localStorage.setItem, and a notify-all that
 * re-renders the workspace. On a legal 3-session × 50-version store that
 * serialises to ~490 KB, which is the same pattern the store's own docblock
 * forbids for the brush hot path, just at typing rate instead of 60 Hz.
 *
 * It also fixed a visible bug: on a quota failure the store still invalidates
 * its cache, so the next snapshot returns the pre-write value and a
 * write-through controlled input snaps backwards mid-sentence.
 *
 * `flush` exists because Render reads the instruction straight off the store —
 * without it, hitting Render within the debounce window would send the
 * previous text.
 */
function useDebouncedField(
  remote: string,
  commit: (value: string) => void,
  delay = 350,
): { value: string; onChange: (v: string) => void; flush: () => void } {
  const [local, setLocal] = React.useState(remote);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = React.useRef<string | null>(null);
  const commitRef = React.useRef(commit);
  commitRef.current = commit;

  // Adopt external changes only when nothing is buffered, so a write from
  // elsewhere (a version restore) shows up without fighting live typing.
  React.useEffect(() => {
    if (pending.current === null) setLocal(remote);
  }, [remote]);

  const flush = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pending.current !== null) {
      const value = pending.current;
      pending.current = null;
      commitRef.current(value);
    }
  }, []);

  // Flush on unmount rather than dropping the timer — navigating away
  // mid-word must not silently lose the last few characters.
  const flushRef = React.useRef(flush);
  flushRef.current = flush;
  React.useEffect(() => () => flushRef.current(), []);

  const onChange = React.useCallback(
    (v: string) => {
      setLocal(v);
      pending.current = v;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        const value = pending.current;
        pending.current = null;
        if (value !== null) commitRef.current(value);
      }, delay);
    },
    [delay],
  );

  return { value: local, onChange, flush };
}
