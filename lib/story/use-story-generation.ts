"use client";

/**
 * useStoryGeneration — manages concurrent per-scene video generation.
 *
 * Each scene gets its own AbortController + polling loop so scenes can
 * run in parallel. The hook owns a local `genMap` (sceneId → SceneGenState)
 * for UI responsiveness, and writes durable results back into the
 * localStorage story store via updateStory so they survive a page refresh.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getStory, resolveSceneAssets, updateStory } from "@/lib/story/stories";
import { isPubliclyFetchable } from "@/lib/story/image-format";
import type { Scene } from "@/lib/story/stories";
import { DEFAULT_VIDEO_MODEL_ID, findVideoModel, VIDEO_MODELS } from "@/lib/studio/models";

// ─────────────────────────── Types ────────────────────────────────────────

export type SceneGenStatus = "idle" | "submitting" | "polling" | "done" | "failed";

export type SceneGenState = {
  status: SceneGenStatus;
  taskId?: string;
  elapsedMs: number;
  error?: string;
};

export type StoryGenMap = Record<string, SceneGenState>;

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 200; // ~10 min ceiling

// ─────────────────────────── Hook ─────────────────────────────────────────

export function useStoryGeneration(storyId: string) {
  const [genMap, setGenMap] = useState<StoryGenMap>({});

  const abortMap = useRef<Record<string, AbortController>>({});
  const tickMap = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // ── Helpers ──────────────────────────────────────────────────────────

  function patchGen(sceneId: string, patch: Partial<SceneGenState>) {
    setGenMap((prev) => ({
      ...prev,
      [sceneId]: { ...{ status: "idle" as SceneGenStatus, elapsedMs: 0 }, ...prev[sceneId], ...patch },
    }));
  }

  function startTick(sceneId: string, startedAt: number) {
    clearInterval(tickMap.current[sceneId]);
    tickMap.current[sceneId] = setInterval(() => {
      setGenMap((prev) => {
        const s = prev[sceneId];
        if (!s || s.status !== "polling") return prev;
        return { ...prev, [sceneId]: { ...s, elapsedMs: Date.now() - startedAt } };
      });
    }, 1000);
  }

  function stopTick(sceneId: string) {
    clearInterval(tickMap.current[sceneId]);
    delete tickMap.current[sceneId];
  }

  function abortInFlight(sceneId: string) {
    abortMap.current[sceneId]?.abort();
    delete abortMap.current[sceneId];
    stopTick(sceneId);
  }

  /** Write a partial Scene patch back into the durable store. */
  function persistScene(sceneId: string, patch: Partial<Scene>) {
    const story = getStory(storyId);
    if (!story) return;
    updateStory(storyId, {
      scenes: story.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)),
    });
  }

  // ── generateScene ─────────────────────────────────────────────────────

  const generateScene = useCallback(
    async (scene: Scene, model = DEFAULT_VIDEO_MODEL_ID) => {
      const sceneId = scene.id;
      abortInFlight(sceneId);

      const ctrl = new AbortController();
      abortMap.current[sceneId] = ctrl;
      const startedAt = Date.now();

      patchGen(sceneId, { status: "submitting", elapsedMs: 0, error: undefined, taskId: undefined });

      // Two different mechanisms, deliberately kept apart:
      //
      //   references — WHO/WHAT should appear (subject, environment). The
      //                model reads identity from these.
      //   images     — literal frames. first_frame/last_frame pin the clip's
      //                endpoints and the model interpolates between them;
      //                reference_image is loose visual guidance.
      //
      // Sending a character portrait as a first_frame would force the clip to
      // literally open on that portrait, which is not what the slot means.
      // Resolve against the story-wide defaults at generation time rather than
      // reading scene.assets directly — that is what lets a character set once
      // on the story apply to every scene, and lets editing it later actually
      // take effect on scenes that never overrode it.
      const assets = resolveSceneAssets(scene.assets, getStory(storyId)?.defaultAssets);

      // The renderer downloads every reference, so only publicly fetchable
      // URLs can go on the wire. A data URI here is a hard 400 that kills the
      // whole scene — dropping it costs the reference but still produces a
      // clip, and `skipped` tells the user why.
      let skipped = 0;
      const usable = (url: string | undefined): string | null => {
        const u = url?.trim();
        if (!u) return null;
        if (isPubliclyFetchable(u)) return u;
        skipped++;
        return null;
      };

      const references: Array<{ type: "image"; role: "subject" | "environment"; url: string }> = [];
      const character = usable(assets.character);
      const background = usable(assets.background);
      const prop = usable(assets.prop);
      if (character) references.push({ type: "image", role: "subject", url: character });
      if (background) references.push({ type: "image", role: "environment", url: background });
      if (prop) references.push({ type: "image", role: "subject", url: prop });

      const images: Array<{ url: string; role: "first_frame" | "last_frame" | "reference_image" }> = [];
      const first = usable(assets.firstFrame);
      const last = usable(assets.lastFrame);
      if (first) images.push({ url: first, role: "first_frame" });
      if (last) images.push({ url: last, role: "last_frame" });
      for (const raw of assets.refImages ?? []) {
        const u = usable(raw);
        if (u) images.push({ url: u, role: "reference_image" });
      }

      // Clamp duration to the nearest value the selected model accepts.
      const caps = findVideoModel(model)?.caps;
      const validDurations = caps?.durations ?? VIDEO_MODELS[0].caps.durations;
      const duration = validDurations.reduce((best, d) =>
        Math.abs(d - scene.duration) < Math.abs(best - scene.duration) ? d : best,
      );

      const body: Record<string, unknown> = {
        prompt: scene.script.trim() || `Scene ${scene.index + 1}`,
        model,
        duration,
        ratio: "16:9",
        watermark: false,
        audio: scene.audio ?? false,
        ...(references.length > 0 ? { references } : {}),
        ...(images.length > 0 ? { images } : {}),
      };

      function fail(msg: string) {
        stopTick(sceneId);
        patchGen(sceneId, { status: "failed", error: msg, elapsedMs: Date.now() - startedAt });
        persistScene(sceneId, { clipStatus: "failed" });
      }

      try {
        // ── Submit ──
        const res = await fetch("/api/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const data = await res.json();

        if (!res.ok || !data.id) {
          fail(data.error ?? `Submit failed (${res.status})`);
          return;
        }
        if (skipped > 0) {
          patchGen(sceneId, {
            error: `${skipped} reference image${skipped > 1 ? "s" : ""} skipped — re-upload them so they get a public URL`,
          });
        }

        const taskId = data.id as string;
        patchGen(sceneId, { status: "polling", taskId, elapsedMs: Date.now() - startedAt });
        startTick(sceneId, startedAt);
        persistScene(sceneId, { clipTaskId: taskId, clipStatus: "running" });

        // ── Poll ──
        for (let i = 0; i < POLL_MAX_TRIES; i++) {
          await sleep(POLL_INTERVAL_MS, ctrl.signal);
          if (ctrl.signal.aborted) return;

          const pr = await fetch(
            `/api/video/${taskId}?model=${encodeURIComponent(model)}`,
            { signal: ctrl.signal },
          );
          const pd = await pr.json();

          if (!pr.ok) { fail(pd.error ?? `Poll failed (${pr.status})`); return; }

          const st = pd.status as string | undefined;
          if (st === "succeeded") {
            stopTick(sceneId);
            const clipUrl = pd.content?.video_url as string | undefined;
            if (!clipUrl) { fail("Succeeded but no video_url"); return; }
            patchGen(sceneId, { status: "done", elapsedMs: Date.now() - startedAt });
            persistScene(sceneId, { clipStatus: "done", clipUrl, approved: false });
            return;
          }
          if (st === "failed" || st === "cancelled") {
            fail(pd.error?.message ?? (st === "cancelled" ? "Task cancelled" : "Task failed"));
            return;
          }
          // queued / running — continue
        }
        fail("Polling timed out after ~10 min");
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          stopTick(sceneId);
          patchGen(sceneId, { status: "idle", elapsedMs: 0 });
          return;
        }
        fail(e instanceof Error ? e.message : String(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storyId],
  );

  // ── generateAll ───────────────────────────────────────────────────────

  const generateAll = useCallback(
    (scenes: Scene[], model = DEFAULT_VIDEO_MODEL_ID) => {
      scenes.forEach((s) => { void generateScene(s, model); });
    },
    [generateScene],
  );

  const cancelScene = useCallback((sceneId: string) => {
    abortInFlight(sceneId);
    patchGen(sceneId, { status: "idle", elapsedMs: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount.
  useEffect(() => {
    const ids = abortMap.current;
    return () => { Object.keys(ids).forEach((id) => ids[id]?.abort()); };
  }, []);

  return { genMap, generateScene, generateAll, cancelScene };
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}
