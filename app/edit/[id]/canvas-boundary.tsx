"use client";

/**
 * Error boundary around the annotation canvas.
 *
 * A crash inside Konva currently takes the whole workspace down to Next's
 * generic "Application error: a client-side exception has occurred", which
 * says nothing, loses the transcript and the version rail, and — in front of
 * a customer — looks like the product died. The canvas is the one subtree
 * where that is likely: it is third-party, imperative, and driven by pointer
 * gestures, so it is exactly the code most likely to throw in a way static
 * review misses.
 *
 * Two jobs:
 *
 * · Contain the failure. Everything outside the canvas — the agent, the
 *   marks, the versions, the prompt bar — keeps working, and the session is
 *   in localStorage either way, so nothing is lost.
 *
 * · SHOW THE ERROR. Not "something went wrong": the actual message and the
 *   component stack, on screen, selectable. A user reporting "it crashes"
 *   cannot be acted on; a user reading back one line can.
 *
 * Note what this does NOT catch: React error boundaries only see errors
 * thrown during render, in lifecycles, and in effects. An exception inside a
 * pointer or drag HANDLER never reaches here — React logs it and carries on.
 * So if the workspace visibly dies, the fault is in the render phase, and
 * this will have the detail. That distinction is itself a diagnosis.
 */

import * as React from "react";

type Props = { children: React.ReactNode };
type State = { error: Error | null; info: string | null };

export class CanvasBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Also to the console, with the stack intact, for anyone with DevTools
    // open. The on-screen copy is for everyone else.
    console.error("[edit canvas] crashed", error, info.componentStack);
    this.setState({ info: info.componentStack ?? null });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex size-full flex-col gap-3 overflow-auto p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-[oklch(0.72_0.22_15)]">
          The canvas crashed
        </div>
        <p className="text-[13px] leading-relaxed text-ink-dim">
          Your session is safe — it is stored locally and nothing was lost.
          Reload the canvas to carry on. If it keeps happening, this is the
          detail worth reporting:
        </p>
        <pre className="max-h-[220px] overflow-auto rounded-[10px] border border-border bg-[var(--bg)] p-3 font-mono text-[11px] leading-relaxed text-ink selection:bg-accent-soft">
          {error.message}
          {info ? `\n${info}` : ""}
        </pre>
        <div>
          <button
            onClick={() => this.setState({ error: null, info: null })}
            className="rounded-full border border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim transition-colors hover:border-border-strong hover:text-ink"
          >
            Reload the canvas
          </button>
        </div>
      </div>
    );
  }
}
