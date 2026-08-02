"use client";

/**
 * The render loop for the editor.
 *
 * P0 scope: instruction + base image → POST /api/image. No annotations yet —
 * buildEditRequest() below is the seam the P1 compiler drops into, and it is
 * exported and pure so the request shape can be tested without the hook.
 *
 * Deliberately wraps /api/image rather than forking it. That route already
 * carries strict BYOK (402 on a missing key), 1:1 upstream status forwarding
 * so the error classifier can dispatch on it, the fal branch, and a 300s
 * maxDuration. A parallel "edit" route would duplicate all of that and drift
 * from it the first time either side changed.
 *
 * The version record is written BEFORE the request goes out, as `pending`,
 * and patched on settle. That ordering is what makes a render survive a
 * refresh mid-flight: the row is already in the store, so the workspace shows
 * it as failed rather than losing the instruction and the compiled prompt
 * that produced it.
 */

import * as React from "react";
import { classifyError, type ErrorClass } from "@/lib/compare/error-class";
import { stageGeneratedImage } from "@/lib/library/auto-save";
import {
  appendVersion,
  getEditSession,
  newEditId,
  patchVersion,
} from "./sessions";
import { sizeForEdit } from "./size";
import type { EditSession, EditVersion } from "./types";

// ─────────────────────────── Request building ─────────────────────────────

export type EditRequest = {
  prompt: string;
  model: string;
  size: string;
  seed?: number;
  /** Single URL or an array for multi-ref. Omitted for a text-only render. */
  image?: string | string[];
  /** Ref ids in the same order as `image`, for the version record. */
  refIds: string[];
};

/**
 * Pure: session → the exact body /api/image will receive.
 *
 * P1 replaces the prompt line with compileAnnotationPrompt(), which appends
 * the `<point>` / `<bbox>` coordinate tags. Everything else — ordering, the
 * base-ref-first rule, sizing — stays as it is here.
 */
export function buildEditRequest(session: EditSession): EditRequest {
  // Base ref first: it is the image being edited, and Seedream treats the
  // first entry as the subject when several are supplied.
  const ordered = [
    ...session.refs.filter((r) => r.role === "base"),
    ...session.refs.filter((r) => r.role !== "base"),
  ];
  const base = ordered[0];

  const size = sizeForEdit({
    width: base?.width ?? 0,
    height: base?.height ?? 0,
    modelId: session.model,
    aspectRatio: session.aspectRatio,
    qualityId: session.qualityId,
  });

  const urls = ordered.map((r) => r.url);

  return {
    prompt: session.instruction.trim(),
    model: session.model,
    size,
    seed: session.seed,
    image: urls.length === 0 ? undefined : urls.length === 1 ? urls[0] : urls,
    refIds: ordered.map((r) => r.id),
  };
}

// ─────────────────────────── Hook ─────────────────────────────────────────

export type EditRenderStatus = "idle" | "running" | "success" | "error";

export type EditRenderState = {
  status: EditRenderStatus;
  /** The version this run is writing into, so the UI can highlight it. */
  versionId?: string;
  error?: ErrorClass;
  /** Set when the failure was a missing BYOK key, so the UI can link to
   *  Settings instead of offering a pointless Retry. */
  missingKey?: boolean;
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
    if (!req.prompt) {
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
    const pending: EditVersion = {
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
    };
    appendVersion(sessionId, pending);
    setState({ status: "running", versionId });

    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: req.prompt,
          model: req.model,
          size: req.size,
          seed: req.seed,
          image: req.image,
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
        const error = classifyError(res.status, message);
        patchVersion(sessionId, versionId, {
          status: "failed",
          error: message,
          elapsedMs: Date.now() - startedAt,
        });
        setState({ status: "error", versionId, error, missingKey });
        return;
      }

      const outputs = ((data as { data?: Array<{ url?: string; size?: string }> })
        .data ?? [])
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
          ? { status: "success", versionId, elapsedMs }
          : {
              status: "error",
              versionId,
              error: classifyError(502, "Model returned no image."),
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
      });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }, [sessionId]);

  return { state, render, cancel };
}
