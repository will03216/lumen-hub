"use client";

/**
 * The frame-edit loop — annotations on one keyframe → Seedream → a clean
 * edited frame → the asset library.
 *
 * This is the cheap half of the two-render design (PRD §6). A frame render is
 * seconds and cents; a video render is minutes and real money. The user
 * converges on a still they believe in here, and only then spends a clip.
 *
 * ── Reuse, not fork ──────────────────────────────────────────────────────
 *
 * Everything about compiling marks into a Seedream request already exists and
 * is tested: compileAnnotationPrompt for the prompt and the `<point>`/`<bbox>`
 * tags, toWireImage for the composite-and-inline pass, requestImage for the
 * route. This hook is the wiring between those and the keyframe ledger — it
 * introduces no new compilation logic, which is why the two editors cannot
 * drift in what they send.
 *
 * ── The invariant this hook is responsible for ───────────────────────────
 *
 * ⚠ `editedFrameUrl` IS ONLY EVER WRITTEN FROM A RENDER RESPONSE.
 *
 * The composite — the copy with the magenta brush and arrow markup burned into
 * it — exists in this file, one variable away from the ledger. Writing it there
 * would send animated scribbles to Seedance, and the failure would look like a
 * model defect rather than a bug. The composite is passed to requestImage and
 * never anywhere else.
 */

import * as React from "react";
import { classifyError, type ErrorClass } from "@/lib/compare/error-class";
import { requestImage } from "@/lib/compare/request-image";
import { compileAnnotationPrompt } from "@/lib/edit/annotation-prompt";
import { toWireImage } from "@/lib/edit/use-edit-render";
import { sizeForEdit } from "@/lib/edit/size";
import { stageGeneratedImage } from "@/lib/library/auto-save";
import { modelMaxPixels, DEFAULT_IMAGE_MODEL_ID } from "@/lib/studio/models";
import type { EditReference } from "@/lib/edit/types";
import { createGroup, ingestFrame } from "./asset-upload";
import {
  getVideoEditSession,
  patchKeyframe,
  updateVideoEditSession,
} from "./sessions";
import type { Keyframe } from "./types";

export type FrameEditState = {
  status: "idle" | "rendering" | "uploading" | "success" | "error";
  keyframeId?: string;
  error?: ErrorClass;
  missingKey?: boolean;
  warnings?: string[];
};

const IDLE: FrameEditState = { status: "idle" };

/**
 * A keyframe, shaped as the EditReference the image-editor machinery expects.
 *
 * The two records carry the same information under different names; converting
 * at the boundary is what lets the canvas, the compiler and the compositor be
 * used verbatim instead of being taught about keyframes.
 */
export function keyframeAsReference(kf: Keyframe): EditReference {
  return {
    id: kf.id,
    url: kf.sourceFrameUrl,
    width: kf.width,
    height: kf.height,
    role: "base",
    annotations: kf.annotations,
    label: `Frame @ ${kf.t.toFixed(2)}s`,
  };
}

export function useFrameEdit(sessionId: string) {
  const [state, setState] = React.useState<FrameEditState>(IDLE);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  /**
   * Ingest a frame into the asset library, creating the session's group on
   * first use.
   *
   * Runs unconditionally on every rendered frame — there is no face detector
   * and there should not be one (PRD §9). Failure is recorded on the keyframe
   * rather than thrown: an un-ingested frame still has a usable edited image,
   * and the compiler will refuse the variants that need an asset id with a
   * specific reason. Losing the whole render because the upload failed would be
   * a worse trade.
   */
  const ingest = React.useCallback(
    async (keyframeId: string, url: string, signal?: AbortSignal) => {
      patchKeyframe(sessionId, keyframeId, {
        assetStatus: "uploading",
        assetError: undefined,
      });
      try {
        const session = getVideoEditSession(sessionId);
        const kf = session?.keyframes.find((k) => k.id === keyframeId);
        if (!session || !kf) return;

        let groupId = session.assetGroupId;
        if (!groupId) {
          groupId = await createGroup(`lumen-video-edit-${session.name}`);
          updateVideoEditSession(sessionId, { assetGroupId: groupId });
        }

        const { assetId, assetUrl } = await ingestFrame({
          url,
          groupId,
          filename: `keyframe-${keyframeId}.jpg`,
          signal,
        });
        patchKeyframe(sessionId, keyframeId, {
          assetId,
          assetUrl,
          assetStatus: "active",
        });

        // The ORIGINAL frame, as its own asset.
        //
        // Only variant B reads it — that variant shows the model both states
        // and names the difference, so the "before" has to be a bindable
        // reference in its own right. It is ingested here rather than at grab
        // time because a frame nobody edited is a frame no variant can use,
        // and here we know this one was worth the round trip.
        //
        // Failure is deliberately quiet: it costs variant B and nothing else,
        // and the compiler already refuses that variant with a specific reason
        // when the id is missing. Failing the whole edit over it would be a
        // much worse trade.
        if (!kf.sourceAssetId) {
          try {
            const source = await ingestFrame({
              url: kf.sourceFrameUrl,
              groupId,
              filename: `keyframe-${keyframeId}-source.jpg`,
              signal,
            });
            patchKeyframe(sessionId, keyframeId, {
              sourceAssetId: source.assetId,
            });
          } catch {
            // Left unset. Variant B will say so; every other variant is fine.
          }
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        patchKeyframe(sessionId, keyframeId, {
          assetStatus: "failed",
          assetError: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [sessionId],
  );

  const renderFrame = React.useCallback(
    async (keyframeId: string) => {
      const session = getVideoEditSession(sessionId);
      const kf = session?.keyframes.find((k) => k.id === keyframeId);
      if (!session || !kf) return;

      if (!kf.instruction.trim()) {
        setState({
          status: "error",
          keyframeId,
          error: classifyError(400, "Describe the change to this frame first."),
        });
        return;
      }

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const model = DEFAULT_IMAGE_MODEL_ID;
      const ref = keyframeAsReference(kf);

      const compiled = compileAnnotationPrompt({
        instruction: kf.instruction.trim(),
        refs: [
          {
            index: 1,
            refId: ref.id,
            width: ref.width,
            height: ref.height,
            role: ref.role,
            label: ref.label,
            annotations: ref.annotations,
          },
        ],
      });

      patchKeyframe(sessionId, keyframeId, {
        editStatus: "rendering",
        editError: undefined,
      });
      setState({ status: "rendering", keyframeId, warnings: compiled.warnings });

      try {
        // The composite lives here and goes exactly one place. See the header.
        const plan = compiled.plans.find((p) => p.refId === ref.id);
        const image = await toWireImage(ref, {
          maxPixels: modelMaxPixels(model) ?? 4_194_304,
          annotations: plan?.transport === "composite" ? ref.annotations : [],
        });
        if (ctrl.signal.aborted) return;

        const res = await requestImage(
          {
            prompt: compiled.prompt,
            model,
            // Same size out as in. An edit that silently upscales resamples the
            // whole frame every round trip, and a keyframe that no longer
            // matches its source's dimensions breaks the splice.
            size: sizeForEdit({
              width: ref.width,
              height: ref.height,
              modelId: model,
              aspectRatio: "source",
              qualityId: "source",
            }),
            image,
          },
          ctrl.signal,
        );

        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
        if (ctrl.signal.aborted) return;

        if (!res.ok) {
          const message =
            (data as { error?: string }).error ?? `Request failed (${res.status})`;
          patchKeyframe(sessionId, keyframeId, {
            editStatus: "failed",
            editError: message,
          });
          setState({
            status: "error",
            keyframeId,
            error: classifyError(res.status, message),
            missingKey: res.status === 402,
            warnings: compiled.warnings,
          });
          return;
        }

        const url = (data as { data?: Array<{ url?: string }> }).data?.[0]?.url;
        if (!url) {
          patchKeyframe(sessionId, keyframeId, {
            editStatus: "failed",
            editError: "Model returned no image.",
          });
          setState({
            status: "error",
            keyframeId,
            error: classifyError(502, "Model returned no image."),
          });
          return;
        }

        // The ONLY write of editedFrameUrl in the codebase, and it takes the
        // render response's URL.
        patchKeyframe(sessionId, keyframeId, {
          editedFrameUrl: url,
          editStatus: "done",
          editError: undefined,
        });

        stageGeneratedImage({
          url,
          prompt: kf.instruction.trim(),
          model,
          size: `${ref.width}x${ref.height}`,
        });

        setState({ status: "uploading", keyframeId, warnings: compiled.warnings });
        await ingest(keyframeId, url, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setState({ status: "success", keyframeId, warnings: compiled.warnings });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        const message = e instanceof Error ? e.message : String(e);
        patchKeyframe(sessionId, keyframeId, {
          editStatus: "failed",
          editError: message,
        });
        setState({
          status: "error",
          keyframeId,
          error: classifyError(undefined, message),
        });
      } finally {
        if (abortRef.current === ctrl) abortRef.current = null;
      }
    },
    [sessionId, ingest],
  );

  const retryIngest = React.useCallback(
    async (keyframeId: string) => {
      const kf = getVideoEditSession(sessionId)?.keyframes.find(
        (k) => k.id === keyframeId,
      );
      if (!kf?.editedFrameUrl) return;
      await ingest(keyframeId, kf.editedFrameUrl);
    },
    [sessionId, ingest],
  );

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(IDLE);
  }, []);

  return { state, renderFrame, retryIngest, reset };
}
