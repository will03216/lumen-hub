"use client";

/**
 * What a past version was actually sent.
 *
 * Every version record has carried both prompts since the first render —
 * `instruction` (what the user wrote) and `compiledPrompt` (that plus the
 * `<point>`/`<bbox>` tag block and the raster prose). Nothing displayed them.
 * The disclosure below the prompt bar always rendered the LIVE session, so
 * selecting v1 and opening "show compiled prompt" showed what would be sent
 * NOW — the current instruction, the current marks, the current model.
 *
 * Which is indistinguishable, from the outside, from not storing them at all.
 * The rail's one truncated line was the only trace, and it truncates at about
 * six words.
 *
 * So: when a version is being viewed, this replaces the live view rather than
 * sitting beside it. Two prompt blocks on one screen — one hypothetical, one
 * historical — is precisely the confusion the disclosure exists to prevent.
 */

import * as React from "react";
import { Check, Copy } from "lucide-react";
import type { EditVersion } from "@/lib/edit/types";

export function VersionPrompt({
  version,
  n,
}: {
  version: EditVersion;
  /** 1-based position in the rail, so the heading matches what was clicked. */
  n: number;
}) {
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute">
          v{n} — as sent
        </span>
        <span className="font-mono text-[10px] text-ink-mute">
          {version.model} · {version.size}
          {version.seed !== undefined ? ` · seed ${version.seed}` : ""}
          {version.elapsedMs !== undefined
            ? ` · ${(version.elapsedMs / 1000).toFixed(1)}s`
            : ""}
        </span>
      </div>

      <Block
        label="Instruction"
        // An empty instruction was possible until the render guard landed;
        // older versions can still carry one, and a blank box would read as a
        // rendering fault rather than as history.
        text={version.instruction || "(none recorded)"}
      />
      <Block
        label="Compiled prompt"
        text={version.compiledPrompt || "(none recorded)"}
        hint="exactly what went upstream, tags included"
      />

      {version.error && (
        <p className="text-[11px] leading-relaxed text-[oklch(0.72_0.22_15)]">
          {version.error}
        </p>
      )}
    </div>
  );
}

function Block({
  label,
  text,
  hint,
}: {
  label: string;
  text: string;
  hint?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard refused — the text is on screen and selectable either way.
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          {label}
        </span>
        {hint && <span className="text-[10px] text-ink-mute">{hint}</span>}
        <button
          onClick={() => void copy()}
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-[10px] border border-border bg-[var(--bg)] p-3 font-mono text-[11px] leading-relaxed text-ink-dim">
        {text}
      </pre>
    </div>
  );
}
