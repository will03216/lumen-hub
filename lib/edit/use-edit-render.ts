"use client";

/**
 * The render loop for the editor.
 *
 * Wraps /api/image rather than forking it. That route already carries strict
 * BYOK (402 on a missing key), 1:1 upstream status forwarding so the error
 * classifier can dispatch on it, the fal branch, and a 300s maxDuration. A
 * parallel "edit" route would duplicate all of that and drift from it.
 *
 * Three stages, split so the first is pure and testable:
 *
 *   buildEditRequest   session -> prompt + per-ref transport plan   (pure)
 *   resolveWireImages  plan -> the actual image[] payload           (async, DOM)
 *   render             fetch, patch the version, stage to Library   (hook)
 *
 * The version record is written BEFORE the request goes out, as `pending`,
 * and patched on settle. That ordering is what lets a render survive a
 * refresh mid-flight: the row is already in the store, so the workspace shows
 * it as failed rather than losing the instruction and compiled prompt that
 * produced it.
 */

import * as React from "react";
import { classifyError, type ErrorClass } from "@/lib/compare/error-class";
import { stageGeneratedImage } from "@/lib/library/auto-save";
import { modelMaxPixels } from "@/lib/studio/models";
import {
  compileAnnotationPrompt,
  type CompiledRefPlan,
} from "./annotation-prompt";
import { renderComposite } from "./composite";
import { resolveSafeUrl } from "./same-origin";
import {
  appendVersion,
  getEditSession,
  newEditId,
  patchVersion,
} from "./sessions";
import { sizeForEdit } from "./size";
import type { EditReference, EditSession, EditVersion } from "./types";

/**
 * Ceiling for what we send *in*. There is no point feeding the model more
 * detail than it can emit, and an un-downscaled 6000×4000 composite base64s
 * to tens of megabytes of JSON. Falls back for models with no declared
 * ceiling (the fal-hosted one).
 */
function maxInputPixels(modelId: string): number {
  return modelMaxPixels(modelId) ?? 4_194_304;
}

// ─────────────────────────── Request building ─────────────────────────────

export type EditRequest = {
  prompt: string;
  model: string;
  size: string;
  seed?: number;
  /** Refs in wire order — parallel to the eventual image[] array. */
  orderedRefs: EditReference[];
  refIds: string[];
  plans: CompiledRefPlan[];
  warnings: string[];
};

/**
 * Pure: session -> everything about the request that doesn't need the DOM.
 *
 * The prompt includes the compiled `<point>` / `<bbox>` coordinate tags. The
 * plans say, per reference, whether the clean image will do or whether the
 * hand-drawn markup has to be burned into a copy first.
 */
export function buildEditRequest(session: EditSession): EditRequest {
  // Base ref first: it is the image being edited, and Seedream treats the
  // first entry of image[] as the subject when several are supplied.
  const orderedRefs = [
    ...session.refs.filter((r) => r.role === "base"),
    ...session.refs.filter((r) => r.role !== "base"),
  ];
  const base = orderedRefs[0];

  const compiled = compileAnnotationPrompt({
    instruction: session.instruction.trim(),
    refs: orderedRefs.map((r, i) => ({
      index: i + 1, // 1-based, matching the wire array
      refId: r.id,
      width: r.width,
      height: r.height,
      role: r.role,
      label: r.label,
      annotations: r.annotations,
    })),
  });

  return {
    prompt: compiled.prompt,
    model: session.model,
    size: sizeForEdit({
      width: base?.width ?? 0,
      height: base?.height ?? 0,
      modelId: session.model,
      aspectRatio: session.aspectRatio,
      qualityId: session.qualityId,
    }),
    seed: session.seed,
    orderedRefs,
    refIds: orderedRefs.map((r) => r.id),
    plans: compiled.plans,
    warnings: compiled.warnings,
  };
}

/**
 * Turn the plan into the actual `image` payload.
 *
 * Two things force this to be more than "send the URLs":
 *
 * · A ref carrying brush or arrow markup has to be rasterised, because those
 *   annotations have no representation in the prompt.
 *
 * · A local URL (`/library-cache/…`) is same-origin to *us* and unreachable
 *   from BytePlus's servers. Anything not absolute-http must be inlined as a
 *   data URI or the upstream fetch silently gets nothing. This is the whole
 *   reason uploads can't just be passed through by path.
 *
 * Remote https URLs are passed through untouched — letting the model fetch
 * them directly avoids base64-ing megabytes through our own request.
 */
export async function resolveWireImages(
  req: EditRequest,
): Promise<string | string[] | undefined> {
  const cap = maxInputPixels(req.model);

  const images = await Promise.all(
    req.orderedRefs.map(async (ref) => {
      const plan = req.plans.find((p) => p.refId === ref.id);
      const needsComposite = plan?.transport === "composite";
      const isRemote = /^https?:/i.test(ref.url);

      if (!needsComposite && isRemote) return ref.url;

      const safe = resolveSafeUrl(ref.safeUrl ?? ref.url);
      const { dataUrl } = await renderComposite({
        url: safe.url,
        crossOrigin: safe.crossOrigin,
        width: ref.width,
        height: ref.height,
        // Passing an empty list still gets us the downscale-and-inline pass,
        // which is exactly what a local clean image needs.
        annotations: needsComposite ? ref.annotations : [],
        maxPixels: cap,
      });
      return dataUrl;
    }),
  );

  if (images.length === 0) return undefined;
  return images.length === 1 ? images[0] : images;
}

// ─────────────────────────── Hook ─────────────────────────────────────────

export type EditRenderStatus = "idle" | "running" | "success" | "error";

export type EditRenderState = {
  status: EditRenderStatus;
  versionId?: string;
  error?: ErrorClass;
  /** Set when the failure was a missing BYOK key, so the UI can link to
   *  Settings instead of offering a pointless Retry. */
  missingKey?: boolean;
  /** Non-fatal compiler notes (a demoted box, a dropped mark over the cap). */
  warnings?: string[];
  elapsedMs?: number;
};

const IDLE: EditRenderState = { status: "idle" };

export function useEditRender(sessionId: string) {
  const [state, setState] = React.useState<EditRenderState>(IDLE);
  const abortRef = React.useRef<AbortController | null>(null);

  // An in-flight render outliving the workspace would patch a version for a
  // session nobody is looking at, and leak the controller.
  React.useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const cancel = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE);
  }, []);

  const render = React.useCallback(async () => {
    const session = getEditSession(sessionId);
    if (!session) return;

    const req = buildEditRequest(session);
    if (!req.prompt.trim()) {
      setState({
        status: "error",
        error: classifyError(400, "Describe the edit you want before rendering."),
      });
      return;
    }

    // Supersede any run already in flight rather than racing it.
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const startedAt = Date.now();
    const versionId = newEditId();
    appendVersion(sessionId, {
      id: versionId,
      createdAt: startedAt,
      parentId: session.versions.at(-1)?.id,
      instruction: session.instruction,
      compiledPrompt: req.prompt,
      model: req.model,
      size: req.size,
      seed: req.seed,
      refIds: req.refIds,
      annotationsSnapshot: Object.fromEntries(
        session.refs.map((r) => [r.id, r.annotations]),
      ),
      outputs: [],
      status: "pending",
    } satisfies EditVersion);
    setState({ status: "running", versionId, warnings: req.warnings });

    try {
      // Rasterising happens before the fetch so a compositing failure — the
      // tainted-canvas case — is reported as itself rather than as an
      // upstream error about a missing image.
      const image = await resolveWireImages(req);
      if (ctrl.signal.aborted) return;

      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: req.prompt,
          model: req.model,
          size: req.size,
          seed: req.seed,
          image,
        }),
        signal: ctrl.signal,
      });

      const data = await res.json().catch(() => ({}) as Record<string, unknown>);

      if (!res.ok) {
        const message =
          (data as { error?: string }).error ?? `Request failed (${res.status})`;
        // 402 is the strict-BYOK signal, not a model failure. Retrying it
        // without adding a key just reproduces it.
        const missingKey = res.status === 402;
        patchVersion(sessionId, versionId, {
          status: "failed",
          error: message,
          elapsedMs: Date.now() - startedAt,
        });
        setState({
          status: "error",
          versionId,
          error: classifyError(res.status, message),
          missingKey,
          warnings: req.warnings,
        });
        return;
      }

      const outputs = (
        (data as { data?: Array<{ url?: string; size?: string }> }).data ?? []
      )
        .filter((d): d is { url: string; size?: string } => Boolean(d.url))
        .map((d) => ({ url: d.url, size: d.size }));

      const elapsedMs = Date.now() - startedAt;
      patchVersion(sessionId, versionId, {
        status: outputs.length > 0 ? "done" : "failed",
        outputs,
        error: outputs.length > 0 ? undefined : "Model returned no image.",
        elapsedMs,
      });

      // Into the Library + Creations feed, exactly like any other render.
      for (const out of outputs) {
        stageGeneratedImage({
          url: out.url,
          prompt: req.prompt,
          model: req.model,
          size: out.size ?? req.size,
          seed: req.seed,
          derivedFrom: session.refs[0]?.assetId,
        });
      }

      setState(
        outputs.length > 0
          ? { status: "success", versionId, elapsedMs, warnings: req.warnings }
          : {
              status: "error",
              versionId,
              error: classifyError(502, "Model returned no image."),
              warnings: req.warnings,
            },
      );
    } catch (e) {
      // Abort is the "user pressed Render again" path, not a failure.
      if (e instanceof DOMException && e.name === "AbortError") return;
      const message = e instanceof Error ? e.message : String(e);
      patchVersion(sessionId, versionId, {
        status: "failed",
        error: message,
        elapsedMs: Date.now() - startedAt,
      });
      setState({
        status: "error",
        versionId,
        error: classifyError(undefined, message),
        warnings: req.warnings,
      });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [sessionId]);

  return { state, render, cancel };
}
