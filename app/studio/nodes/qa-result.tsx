"use client";

/**
 * QA result badge — renders the Forge critic verdict stored on a guarded
 * generator's outputs (qaScore / qaPass / qaReason / qaAttempts / qaChecksJson).
 * Shown inline on the Video Gen and Image Gen nodes. Renders nothing when the
 * node wasn't run under a QA rubric.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { NodeOutputs } from "../types";

type Check = { check: string; pass: boolean; reason: string };

export function QABadge({ outputs }: { outputs: NodeOutputs }) {
  const [open, setOpen] = useState(false);

  const score = outputs.qaScore;
  const passStr = outputs.qaPass;
  const reason = outputs.qaReason;
  const attempts = outputs.qaAttempts;
  const mode = outputs.qaMode;

  // Critic unavailable / not run with a verdict.
  if (!score && !reason) return null;

  // Critic couldn't run (e.g. missing BytePlus key) — score absent, reason set.
  if (!score) {
    return (
      <div className="flex items-center gap-1.5 rounded-[8px] border border-amber-400/30 bg-amber-400/5 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-amber-300/90">
        <ShieldQuestion className="size-3" />
        {reason}
      </div>
    );
  }

  const pass = passStr === "true";
  let checks: Check[] = [];
  try {
    checks = outputs.qaChecksJson ? (JSON.parse(outputs.qaChecksJson) as Check[]) : [];
  } catch {
    checks = [];
  }

  return (
    <div
      className={[
        "rounded-[8px] border px-2 py-1.5",
        pass ? "border-ok/40 bg-ok/5" : "border-red-900 bg-red-950/30",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="nodrag flex w-full items-center justify-between gap-2"
      >
        <span className={["flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em]", pass ? "text-ok" : "text-red-400"].join(" ")}>
          {pass ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
          QA {score} {pass ? "✓" : "✗ needs review"}
        </span>
        <span className="flex items-center gap-1.5 font-mono text-[9px] text-ink-mute">
          {attempts && <span>{attempts} {attempts === "1" ? "try" : "tries"}</span>}
          {outputs.qaConfidence && outputs.qaConfidence !== "1.00" && (
            <span title="Critic confidence (lower = samples disagreed)">conf {outputs.qaConfidence}</span>
          )}
          {mode && <span className="rounded-full border border-border px-1.5 py-0.5">{mode}</span>}
          {checks.length > 0 && (open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />)}
        </span>
      </button>

      {reason && !open && (
        <div className="mt-1 line-clamp-2 text-[10px] leading-snug text-ink-dim">{reason}</div>
      )}

      {open && checks.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1">
          {checks.map((c, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] leading-snug">
              <span className={c.pass ? "text-ok" : "text-red-400"}>{c.pass ? "✓" : "✗"}</span>
              <span className="text-ink-dim">
                <span className="font-mono text-ink">{c.check}</span>
                {c.reason ? ` — ${c.reason}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
