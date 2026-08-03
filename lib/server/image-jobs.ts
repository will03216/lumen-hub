/**
 * In-memory async job store for image generation.
 *
 * BytePlus image generation is synchronous upstream (no task API, unlike
 * video's /contents/generations/tasks), and a slow model+size — e.g. Seedream
 * 5.0 Pro at 2048² — can take longer than the BytePlus ALB's ~60s response
 * timeout. When it does, the ALB returns a 504 the app never even sees
 * (the request is still running). Holding the HTTP request open is the whole
 * problem. So POST /api/image submits the generation here and returns a job id
 * immediately; the client polls GET /api/image/[id].
 *
 * The generation runs as a floating promise in this long-lived Node process
 * (ECS, a real server — not serverless), so it completes after the response is
 * already sent and no gateway timeout applies. Jobs live in a Map on
 * globalThis (survives dev module reloads), scoped by userId, swept after a
 * TTL so finished jobs don't leak.
 *
 * Trade-off (accepted, see the async-image decision): a container restart
 * mid-generation loses in-flight jobs — the client poll then 404s and the user
 * retries. Fine for single-container prod and second-to-minute generations.
 * Move to a DB table if you ever run multiple replicas.
 */

import { randomUUID } from "crypto";
import { BytePlusError } from "@/lib/byteplus";
import { FalError } from "@/lib/fal";
import { MissingKeyError } from "@/lib/server/missing-key";
import {
  logBytePlusError,
  logFalError,
  logRouteError,
  type RouteTag,
} from "@/lib/server-log";

/** A terminal failure, pre-shaped into the status + JSON body the old
 *  synchronous route used to return, so the poll endpoint can echo it 1:1. */
export type ImageJobError = { status: number; body: Record<string, unknown> };

export type ImageJob =
  | { userId: string; status: "running"; createdAt: number }
  | {
      userId: string;
      status: "succeeded";
      createdAt: number;
      finishedAt: number;
      result: unknown;
    }
  | {
      userId: string;
      status: "failed";
      createdAt: number;
      finishedAt: number;
      error: ImageJobError;
    };

/** Logging context, so a background failure still lands in container logs
 *  (the sync route logged inline; we mustn't lose that when we defer). */
export type ImageJobMeta = {
  label: RouteTag;
  model?: string;
  promptLen: number;
  startedAt: number;
};

/** Keep finished jobs pollable this long after they settle, then sweep. */
const TTL_MS = 5 * 60_000;

function store(): Map<string, ImageJob> {
  const g = globalThis as unknown as { __imageJobs?: Map<string, ImageJob> };
  if (!g.__imageJobs) g.__imageJobs = new Map();
  return g.__imageJobs;
}

function sweep(jobs: Map<string, ImageJob>): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== "running" && now - job.finishedAt > TTL_MS) {
      jobs.delete(id);
    }
  }
}

/** Map a thrown generation error to the exact status+body the sync route
 *  returned, and log it (BytePlus/fal/route) so failures stay visible. */
function toJobError(err: unknown, meta: ImageJobMeta): ImageJobError {
  if (err instanceof MissingKeyError) {
    return {
      status: 402,
      body: {
        error: "missing_api_key",
        provider: err.provider,
        message: `No ${err.provider} API key found. Add your key in Settings.`,
        settingsUrl: "/settings",
      },
    };
  }
  if (err instanceof BytePlusError) {
    logBytePlusError(meta.label, err, meta.startedAt, {
      prompt_len: meta.promptLen,
      model: meta.model,
    });
    return { status: err.status, body: { error: err.message, code: err.statusText } };
  }
  if (err instanceof FalError) {
    logFalError(meta.label, err, meta.startedAt, {
      prompt_len: meta.promptLen,
      model: meta.model,
    });
    return { status: err.status, body: { error: err.message, code: err.statusText } };
  }
  logRouteError(meta.label, err, meta.startedAt, {
    prompt_len: meta.promptLen,
    model: meta.model,
  });
  const message = err instanceof Error ? err.message : String(err);
  return { status: 500, body: { error: message } };
}

/** Kick off a generation in the background. Returns the job id right away. */
export function submitImageJob(
  userId: string,
  run: () => Promise<unknown>,
  meta: ImageJobMeta,
): string {
  const jobs = store();
  sweep(jobs);
  const id = randomUUID();
  jobs.set(id, { userId, status: "running", createdAt: Date.now() });

  void run()
    .then((result) => {
      const job = jobs.get(id);
      if (job && job.status === "running") {
        jobs.set(id, {
          userId,
          status: "succeeded",
          createdAt: job.createdAt,
          finishedAt: Date.now(),
          result,
        });
      }
    })
    .catch((err) => {
      const job = jobs.get(id);
      if (job && job.status === "running") {
        jobs.set(id, {
          userId,
          status: "failed",
          createdAt: job.createdAt,
          finishedAt: Date.now(),
          error: toJobError(err, meta),
        });
      }
    });

  return id;
}

/** Look up a job, scoped to its owner. Returns null for a missing job or one
 *  owned by another user (so a poll for someone else's id is a plain 404). */
export function getImageJob(id: string, userId: string): ImageJob | null {
  const job = store().get(id);
  if (!job || job.userId !== userId) return null;
  return job;
}
