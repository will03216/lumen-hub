/**
 * Staging helpers — funnel every successful render directly into Library.
 *
 * History
 * -------
 * - Pre-§60: renders went straight to Library (`addAsset` + mirror). Worked
 *   but every batch roll cluttered the permanent collection.
 * - §60 (deprecated): renders staged to Drafts (`addDraft`) first, user
 *   curated, then `commitDraft` upgraded keepers. Removed because the
 *   Freepik-style redesign aggregates everything into a chronological
 *   Creations feed where pin/delete on each row is sufficient curation.
 * - Now: renders go to Library immediately, mirror fires, Creations feed
 *   shows them at the top of "Today". Drafts store stays in the codebase
 *   for legacy code paths (Canvas Preview pending state) but the
 *   Generators no longer write into it.
 *
 * Idempotency
 * -----------
 * Image id is a stable URL hash, video id is the BytePlus task id. The
 * Library store upserts by id so a polling loop firing twice for the
 * same task — or React strict-mode double-firing an event handler —
 * leaves a single record.
 *
 * Mirror
 * ------
 * `mirrorAsset` runs fire-and-forget after the commit. Failures record
 * `mirrorStatus: "failed"` on the asset; the row still displays via the
 * upstream signed URL until the latter expires.
 */

import { addAsset, type Asset } from "./assets";
import { mirrorAsset } from "./mirror";

// ─────────────────────────── Image ──────────────────────────────────────

export type GeneratedImageInput = {
  url: string;
  prompt: string;
  model: string;
  size: string;
  seed?: number;
  /** Asset lineage — set when this image was produced by remixing another
   *  Library asset. The Library detail drawer can later surface the chain. */
  derivedFrom?: string;
  /** Studio project id when produced from a Canvas Preview node. */
  projectId?: string;
};

export function stageGeneratedImage(input: GeneratedImageInput): void {
  commitAndMirror({
    id: urlAssetId(input.url),
    kind: "image",
    url: input.url,
    source: "generated",
    prompt: input.prompt,
    model: input.model,
    size: input.size,
    seed: input.seed,
    derivedFrom: input.derivedFrom,
    projectId: input.projectId,
  });
}

// ─────────────────────────── Video ──────────────────────────────────────

export type GeneratedVideoInput = {
  /** BytePlus task id — used as the deterministic asset id so the polling
   *  loop firing once vs twice produces the same single record. */
  taskId: string;
  videoUrl: string;
  prompt: string;
  model: string;
  ratio: string;
  duration: number;
  resolution?: string;
  seed?: number;
  mode?: string;
  derivedFrom?: string;
  projectId?: string;
};

export function stageGeneratedVideo(input: GeneratedVideoInput): void {
  commitAndMirror({
    id: `task_${input.taskId}`,
    kind: "video",
    url: input.videoUrl,
    source: "generated",
    prompt: input.prompt,
    model: input.model,
    ratio: input.ratio,
    duration: input.duration,
    seed: input.seed,
    derivedFrom: input.derivedFrom,
    projectId: input.projectId,
    params: {
      ...(input.mode && { mode: input.mode }),
      ...(input.resolution && { resolution: input.resolution }),
    },
  });
}

// ─────────────────────────── Audio (§63) ────────────────────────────────

export type GeneratedAudioInput = {
  /** Same-origin URL produced by /api/audio (e.g. "/library-cache/audio-tts-<hash>.mp3"). */
  url: string;
  /** TTS script. Used as the `prompt` field on the asset for searchability. */
  text: string;
  voiceId: string;
  model: string;
  durationSec: number;
  speed?: number;
  volume?: number;
  pitch?: number;
  emotion?: string;
};

export function stageGeneratedAudio(input: GeneratedAudioInput): void {
  commitAndMirror({
    id: urlAssetId(input.url),
    kind: "audio",
    url: input.url,
    source: "generated",
    prompt: input.text,
    model: input.model,
    duration: input.durationSec,
    params: {
      voice_id: input.voiceId,
      ...(input.speed != null && { speed: input.speed }),
      ...(input.volume != null && { volume: input.volume }),
      ...(input.pitch != null && { pitch: input.pitch }),
      ...(input.emotion && { emotion: input.emotion }),
    },
  });
}

// ─────────────────────────── Imported (Web Extract) ─────────────────────

export type ImportedAssetInput = {
  kind: "image" | "video";
  url: string;
  title?: string;
  tags?: string[];
  byteplusAssetId?: string;
  byteplusGroupId?: string;
};

export function stageImportedAsset(input: ImportedAssetInput): void {
  commitAndMirror({
    kind: input.kind,
    url: input.url,
    source: "imported",
    tags: input.tags ?? ["web-extract"],
    title: input.title,
    byteplusAssetId: input.byteplusAssetId,
    byteplusGroupId: input.byteplusGroupId,
    byteplusStatus: input.byteplusAssetId ? "active" : undefined,
  });
}

// ─────────────────────────── Helpers ────────────────────────────────────

/** Commit to Library and kick off mirror in the background. Mirror runs
 *  fire-and-forget — its own status is recorded on the asset record. */
function commitAndMirror(
  input: Parameters<typeof addAsset>[0],
): Asset {
  const asset = addAsset(input);
  if (typeof window !== "undefined") {
    void mirrorAsset(asset).catch(() => {
      // mirrorAsset records its own failure status.
    });
  }
  return asset;
}

/** FNV-1a 32-bit hash → base36 → `gen_xxxx`. Stable per URL so re-fires
 *  upsert. Non-cryptographic — collision risk for thousands of URLs is
 *  negligible and the cost would be a clobber, not corruption. */
function urlAssetId(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) {
    h ^= url.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `gen_${h.toString(36)}`;
}
