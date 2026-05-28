"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square, Trash2 } from "lucide-react";

/**
 * Top bar: project name (click to rename), status counter, Run all / Stop / Clear.
 *
 * Keeps zero local execution state — the canvas owns `running` and the
 * counters derive directly from `nodes.length` / `edges.length`. This
 * keeps the "single AbortController" model honest (no toolbar can sneak
 * in a concurrent run).
 *
 * The only local state is the rename editor's draft buffer, scoped to a
 * single in-place input that commits on blur or Enter.
 */
export function Toolbar({
  projectName,
  onRename,
  nodeCount,
  edgeCount,
  running,
  runningNodeId,
  onRunAll,
  onCancel,
  onClear,
}: {
  projectName: string;
  onRename: (next: string) => void;
  nodeCount: number;
  edgeCount: number;
  running: boolean;
  runningNodeId: string | null;
  onRunAll: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex h-12 items-center gap-3 border-b border-border bg-bg-2 px-4">
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-dim">
        § Studio ·
      </span>
      <NameEditor value={projectName} onCommit={onRename} />
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
        {nodeCount} node{nodeCount === 1 ? "" : "s"} · {edgeCount} edge
        {edgeCount === 1 ? "" : "s"}
        {running && (
          <span className="ml-2 inline-flex items-center gap-1 text-accent">
            <Loader2 className="size-2.5 animate-spin" />
            running{runningNodeId ? ` · ${runningNodeId.slice(0, 8)}` : ""}
          </span>
        )}
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          disabled={running || nodeCount === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-[var(--line-strong)] hover:text-ink disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-border disabled:hover:text-ink-dim"
        >
          <Trash2 className="size-3" /> Clear
        </button>
        {running ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink hover:border-accent hover:text-accent"
          >
            <Square className="size-3 fill-current" /> Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={onRunAll}
            disabled={nodeCount === 0}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-accent-ink transition-colors hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="size-3 fill-current" /> Run all
          </button>
        )}
      </div>
    </div>
  );
}

/** Click-to-edit project name. Span ↔ input swap on click; commits on
 *  blur or Enter, cancels on Escape.
 *
 * `value` is the source of truth; the editor only allocates a draft
 * buffer while the input is mounted. Re-mounting the input on every
 * `editing` flip (instead of syncing draft via an effect) keeps us out
 * of the "setState in effect" trap and means external renames can't
 * trample a concurrent edit. */
function NameEditor({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex max-w-[280px] items-baseline gap-1.5 rounded-md px-1.5 py-0.5 text-left text-[13px] font-medium text-ink transition-colors hover:bg-panel"
        title="Rename project"
      >
        <span className="truncate font-serif italic">{value}</span>
        <span className="opacity-0 transition-opacity group-hover:opacity-60 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-dim">
          edit
        </span>
      </button>
    );
  }

  return (
    <NameInput
      initial={value}
      onCommit={(next) => {
        onCommit(next);
        setEditing(false);
      }}
      onCancel={() => setEditing(false)}
    />
  );
}

/** Mounted only while the user is editing. Owns its own draft buffer so
 *  the parent's `value` never has to be mirrored across re-renders. */
function NameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const next = draft.trim() || "Untitled";
    onCommit(next);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      maxLength={80}
      className="w-[280px] rounded-md border border-accent bg-panel px-1.5 py-0.5 text-[13px] font-medium text-ink focus:outline-none"
    />
  );
}
