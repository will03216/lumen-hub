"use client";

/**
 * The agent chat panel.
 *
 * Two things about this UI are load-bearing rather than decorative:
 *
 * · Tool calls are shown, not hidden. The agent's marks land on the canvas as
 *   ordinary annotations, so the user needs to see which ones it made and be
 *   able to correct them. A chat that only showed prose would leave them
 *   guessing why a box moved.
 *
 * · Paid actions block on an explicit approval. `render` costs money and takes
 *   up to a minute, so the loop pauses and waits here rather than spending on
 *   the user's behalf. Declining sends a reason back to the model so it asks
 *   what to change instead of retrying the same call.
 */

import * as React from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditAgent, type ChatEntry } from "@/lib/edit/use-edit-agent";
import { cn } from "@/lib/utils";

export function AgentPanel({
  sessionId,
  onRender,
  onSeparateLayers,
}: {
  sessionId: string;
  onRender: () => Promise<void>;
  onSeparateLayers?: (
    maxLayers: number,
    opts: { refId?: string; mode?: "auto" | "region" },
  ) => Promise<{ ok: boolean; message: string }>;
}) {
  const { entries, send, busy, pending, resolveApproval, needsKey } =
    useEditAgent(sessionId, { onRender, onSeparateLayers });
  const [draft, setDraft] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Keep the newest turn in view without yanking the page around it.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, pending]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft;
    setDraft("");
    void send(text);
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-ink-mute" />
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          Agent
        </span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-[180px] flex-1 space-y-2 overflow-y-auto rounded-[10px] border border-border bg-[var(--bg)] p-2"
      >
        {entries.length === 0 && !busy && (
          <p className="p-2 text-[12px] leading-relaxed text-ink-mute">
            Describe the change in plain language — “remove the crumpled paper
            on the left and make the table dark walnut”. I&apos;ll place the
            marks, write the prompt, and ask before spending a render.
          </p>
        )}

        {entries.map((e) => (
          <Entry key={e.id} entry={e} />
        ))}

        {busy && !pending && (
          <div className="flex items-center gap-2 p-2 text-[12px] text-ink-mute">
            <Loader2 className="size-3 animate-spin" />
            Thinking…
          </div>
        )}

        {pending && (
          <div className="rounded-[8px] border border-[var(--accent)] bg-accent-soft p-2">
            <p className="text-[12px] leading-snug text-ink">
              {pending.name === "render"
                ? "Run this render? It uses your BytePlus credits."
                : `Run ${pending.name}?`}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => resolveApproval(true)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => resolveApproval(false)}
              >
                Decline
              </Button>
            </div>
          </div>
        )}
      </div>

      {needsKey ? (
        <Link
          href="/settings"
          className="rounded-[8px] border border-border px-3 py-2 text-center text-[12px] text-ink-dim hover:border-border-strong hover:text-ink"
        >
          Add your BytePlus API key in Settings →
        </Link>
      ) : (
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={draft}
            onChange={(ev) => setDraft(ev.target.value)}
            disabled={busy}
            placeholder="Ask for an edit…"
            className="min-w-0 flex-1 rounded-full border border-border bg-transparent px-3 py-2 text-[13px] text-ink outline-none placeholder:text-ink-mute focus:border-ink-dim disabled:opacity-50"
          />
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={busy || !draft.trim()}
          >
            Send
          </Button>
        </form>
      )}
    </div>
  );
}

function Entry({ entry }: { entry: ChatEntry }) {
  if (entry.kind === "user") {
    return (
      <div className="rounded-[8px] bg-panel p-2 text-[12px] leading-relaxed text-ink">
        {entry.text}
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div className="p-2 text-[12px] leading-relaxed text-ink-dim">
        {entry.text}
      </div>
    );
  }

  if (entry.kind === "error") {
    return (
      <div className="rounded-[8px] px-2 py-1.5 text-[12px] leading-snug text-[oklch(0.72_0.22_15)]">
        {entry.text}
      </div>
    );
  }

  // Tool call — compact, monospaced, and colour-coded by outcome so a
  // declined or failed step is obvious while skimming.
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-2 py-1 font-mono text-[10px] leading-snug",
        entry.status === "error" && "text-[oklch(0.72_0.22_15)]",
        entry.status === "rejected" && "text-ink-mute line-through",
        entry.status === "awaiting" && "text-[var(--accent)]",
        entry.status === "done" && "text-ink-mute",
      )}
    >
      <span className="shrink-0">▸</span>
      <span className="min-w-0">
        <span className="text-ink-dim">{entry.name}</span>
        {entry.summary && <span> · {entry.summary}</span>}
      </span>
    </div>
  );
}
