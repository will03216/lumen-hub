"use client";

/**
 * Drives layer separation (PRD §5B) for one session.
 *
 * Kept out of the workspace component because the interesting part is not the
 * request — it is what happens when the response is not what we expect. The
 * upstream shape is preview-flagged and explicitly non-final, so this treats
 * "usable but odd" as a first-class outcome: warnings surface, unrecognised
 * entries are counted rather than dropped silently, and a run that separated
 * nothing reports that rather than rendering an empty panel.
 *
 * Deliberately NOT persisted to the session store. A layer set is a handful of
 * image URLs plus metadata, and the store already lives inside a ~5 MB
 * localStorage budget shared with the asset library; a couple of separations
 * would crowd out the annotations, which are the thing users cannot regenerate.
 */

import * as React from "react";
import type { NormalizedLayer } from "./layers-normalize";
import { getEditSession } from "./sessions";

/**
 * Viewer state for one separation.
 *
 * Lives here rather than in the panel so the dependency runs lib -> app-free:
 * a hook under lib/ importing a type out of app/ would make the shared layer
 * depend on a route's component tree.
 */
export type LayerState = {
  status: "idle" | "running" | "ready" | "failed";
  layers: NormalizedLayer[];
  warnings: string[];
  error?: string;
  /** Hidden layers, by index. Local to the viewer — visibility is a way of
   *  looking at the result, not a change to it. */
  hidden: Set<number>;
};

const EMPTY: LayerState = {
  status: "idle",
  layers: [],
  warnings: [],
  hidden: new Set(),
};

export function useLayerSeparation(sessionId: string) {
  const [state, setState] = React.useState<LayerState>(EMPTY);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => abortRef.current?.abort(), []);

  // A separation belongs to one image; switching sessions must not leave the
  // previous session's layers on screen.
  React.useEffect(() => {
    abortRef.current?.abort();
    setState(EMPTY);
  }, [sessionId]);

  const separate = React.useCallback(
    async (maxLayers: number) => {
      const ref = getEditSession(sessionId)?.refs[0];
      if (!ref) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState({ ...EMPTY, status: "running" });

      try {
        const res = await fetch("/api/edit/layers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: ref.url,
            mode: "auto",
            maxLayers,
            sourceWidth: ref.width,
            sourceHeight: ref.height,
          }),
          signal: ctrl.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          layers?: NormalizedLayer[];
          warnings?: string[];
          unknown?: unknown[];
          error?: string;
        };
        if (ctrl.signal.aborted) return;

        if (!res.ok) {
          setState({
            ...EMPTY,
            status: "failed",
            // 402 is a missing key; 403/404 from upstream usually means the
            // capability is not enabled on this account rather than that
            // anything is broken. Say which, so the user doesn't debug the
            // wrong thing.
            error:
              res.status === 402
                ? "Add your BytePlus API key in Settings to use layer separation."
                : res.status === 403 || res.status === 404
                  ? "Layer separation isn't enabled for this BytePlus key. It's a preview feature and is granted per account."
                  : (data.error ?? `Layer separation failed (${res.status}).`),
          });
          return;
        }

        const layers = data.layers ?? [];
        const warnings = [...(data.warnings ?? [])];
        if (data.unknown && data.unknown.length > 0) {
          // Surfaced rather than swallowed: the shape is non-final, so the
          // first sign of drift will be entries we could not read.
          warnings.push(
            `${data.unknown.length} entr${data.unknown.length === 1 ? "y" : "ies"} in the response could not be read — the upstream format may have changed.`,
          );
        }

        setState({
          status: layers.length > 0 ? "ready" : "failed",
          layers,
          warnings,
          hidden: new Set(),
          error:
            layers.length > 0
              ? undefined
              : "Nothing was separated out of this image.",
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setState({
          ...EMPTY,
          status: "failed",
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [sessionId],
  );

  const toggle = React.useCallback((index: number) => {
    setState((prev) => {
      const hidden = new Set(prev.hidden);
      if (hidden.has(index)) hidden.delete(index);
      else hidden.add(index);
      return { ...prev, hidden };
    });
  }, []);

  return { state, separate, toggle };
}
