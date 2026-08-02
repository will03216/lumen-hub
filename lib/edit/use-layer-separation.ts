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
import { maxInputPixels, toWireImage } from "./use-edit-render";

/**
 * Viewer state for one separation.
 *
 * Lives here rather than in the panel so the dependency runs lib -> app-free:
 * a hook under lib/ importing a type out of app/ would make the shared layer
 * depend on a route's component tree.
 */
export type LayerState = {
  status: "idle" | "running" | "ready" | "failed";
  /** Which reference this result describes. The hook holds ONE slot, and the
   *  agent can target any reference, so without this a separation of ref B
   *  would silently sit under ref A's heading in the panel. */
  refId: string | null;
  layers: NormalizedLayer[];
  warnings: string[];
  error?: string;
  /** Hidden layers, by index. Local to the viewer — visibility is a way of
   *  looking at the result, not a change to it. */
  hidden: Set<number>;
};

const EMPTY: LayerState = {
  status: "idle",
  refId: null,
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

  /**
   * Returns an outcome rather than only setting state.
   *
   * The agent awaits this. Swallowing failures into setState and resolving
   * anyway meant the model was told "separation finished, the layers are in
   * the panel" on a 402, an empty split, or a missing reference — and then
   * relayed that to the user while the panel showed red. That is the one
   * seam where the model can be actively lied to.
   */
  const separate = React.useCallback(
    async (
      maxLayers: number,
      opts: { refId?: string; mode?: "auto" | "region" } = {},
    ): Promise<{ ok: boolean; message: string }> => {
      const session = getEditSession(sessionId);
      const ref = opts.refId
        ? session?.refs.find((r) => r.id === opts.refId)
        : session?.refs[0];
      if (!session || !ref) {
        const message = opts.refId
          ? `No reference ${opts.refId} in this session.`
          : "Add an image before separating layers.";
        setState({
          ...EMPTY,
          status: "failed",
          refId: opts.refId ?? null,
          error: message,
        });
        return { ok: false, message };
      }

      const mode = opts.mode ?? "auto";
      // Region mode's prompt says "the element inside the red box" by name,
      // so the boxes have to be visible in the pixels. Sending the clean
      // image would ask the model to find markup that isn't there.
      const boxes = ref.annotations.filter(
        (a) => a.kind === "box" && !a.hidden,
      );
      if (mode === "region" && boxes.length === 0) {
        const message =
          "Region mode needs at least one box mark on the image; there are none.";
        setState({ ...EMPTY, status: "failed", refId: ref.id, error: message });
        return { ok: false, message };
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState({ ...EMPTY, status: "running", refId: ref.id });

      try {
        // NOT ref.url. A /library-cache/… path is same-origin to us and
        // unreachable from BytePlus's servers; posting it raw failed every
        // call on the two commonest entry paths. Shared with the render path
        // precisely so this cannot diverge again.
        const image = await toWireImage(ref, {
          maxPixels: maxInputPixels(session.model),
          annotations: mode === "region" ? boxes : [],
          drawBoxes: mode === "region",
        });
        if (ctrl.signal.aborted) return { ok: false, message: "Cancelled." };

        const res = await fetch("/api/edit/layers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image,
            mode,
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
        if (ctrl.signal.aborted) return { ok: false, message: "Cancelled." };

        if (!res.ok) {
          // 402 is a missing key; 403/404 from upstream usually means the
          // capability is not enabled on this account rather than that
          // anything is broken. Say which, so the user doesn't debug the
          // wrong thing.
          const message =
            res.status === 402
              ? "Add your BytePlus API key in Settings to use layer separation."
              : res.status === 403 || res.status === 404
                ? "Layer separation isn't enabled for this BytePlus key. It's a preview feature and is granted per account."
                : (data.error ?? `Layer separation failed (${res.status}).`);
          setState({ ...EMPTY, status: "failed", refId: ref.id, error: message });
          return { ok: false, message };
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

        const ok = layers.length > 0;
        setState({
          status: ok ? "ready" : "failed",
          refId: ref.id,
          layers,
          warnings,
          hidden: new Set(),
          error: ok ? undefined : "Nothing was separated out of this image.",
        });
        return {
          ok,
          message: ok
            ? `Separated into ${layers.length} layer${layers.length === 1 ? "" : "s"}: ${layers
                .map((l) => (l.zIndex === 0 ? "background" : (l.name ?? `layer ${l.zIndex}`)))
                .join(", ")}. They are listed in the Layers panel.`
            : "Nothing was separated out of this image.",
        };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return { ok: false, message: "Cancelled." };
        }
        const message = e instanceof Error ? e.message : String(e);
        setState({ ...EMPTY, status: "failed", refId: ref.id, error: message });
        return { ok: false, message };
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
