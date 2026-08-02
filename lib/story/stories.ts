/**
 * Story Projects — local store for the story-to-video workflow.
 *
 * Mirrors the pattern in lib/studio/projects.ts exactly:
 *   - localStorage under a versioned key
 *   - useSyncExternalStore-compatible subscribe/snapshot façade
 *   - Module-level cache so React's identity check never fires spuriously
 *
 * A Story holds the raw prompt and an ordered list of Scenes. Each Scene
 * tracks its own script, target duration, per-scene reference assets, and
 * the video generation task state (clipTaskId / clipStatus / clipUrl).
 * Phases 3-6 write into those generation fields; Phase 1 only creates and
 * edits the script structure.
 */

import { userKey } from '@/lib/storage-user';

const STORAGE_KEY = () => userKey("lumen.story.projects.v1");

// ─────────────────────────── Types ────────────────────────────────────────

export type ClipStatus = "idle" | "pending" | "running" | "done" | "failed";

export type SceneAssets = {
  /** Reference image URL or data URI for the main character in this scene. */
  character?: string;
  /** Reference image URL or data URI for the background/environment. */
  background?: string;
  /** Reference image URL or data URI for a key prop. */
  prop?: string;

  // ── Frame control ────────────────────────────────────────────────────
  // Distinct from the subject references above: these pin the literal first
  // and last frames of the clip, which is how you bridge two shots or hit an
  // exact end pose. The model interpolates between them.

  /** Image the clip opens on. Sent with role "first_frame". */
  firstFrame?: string;
  /** Image the clip lands on. Sent with role "last_frame". Pairing this with
   *  the previous scene's last frame is what makes cuts continuous. */
  lastFrame?: string;

  /** Extra visual references, sent with role "reference_image". Unlike the
   *  named slots these carry no semantic role — use them for style, palette,
   *  or secondary subjects. */
  refImages?: string[];
};

/**
 * Merge story-wide defaults with a scene's own assets.
 *
 * Per-field, not all-or-nothing: a scene that sets only its own first frame
 * still inherits the story's character reference. That is what makes a
 * story-level cast usable — you set the character once and each scene only
 * overrides the one thing that differs.
 *
 * `refImages` is replaced wholesale rather than concatenated. Appending would
 * silently push past the model's reference limit as scenes accumulate, and
 * "my scene's refs plus some others I can't see" is not a useful mental model.
 */
export function resolveSceneAssets(
  scene: SceneAssets | undefined,
  defaults: SceneAssets | undefined,
): SceneAssets {
  const s = scene ?? {};
  const d = defaults ?? {};
  const pick = (a?: string, b?: string) => (a?.trim() ? a : b?.trim() ? b : undefined);

  const sceneRefs = s.refImages?.filter((u) => u?.trim());
  const defaultRefs = d.refImages?.filter((u) => u?.trim());

  const out: SceneAssets = {
    character: pick(s.character, d.character),
    background: pick(s.background, d.background),
    prop: pick(s.prop, d.prop),
    firstFrame: pick(s.firstFrame, d.firstFrame),
    lastFrame: pick(s.lastFrame, d.lastFrame),
    refImages: sceneRefs?.length ? sceneRefs : defaultRefs?.length ? defaultRefs : undefined,
  };

  // Drop undefined keys so a resolved object compares cleanly and doesn't
  // write `{"character": undefined}` noise into localStorage.
  for (const k of Object.keys(out) as (keyof SceneAssets)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

/** Which fields a scene is inheriting rather than setting itself — the UI
 *  uses this to label a slot as coming from the story defaults. */
export function inheritedAssetKeys(
  scene: SceneAssets | undefined,
  defaults: SceneAssets | undefined,
): Set<keyof SceneAssets> {
  const s = scene ?? {};
  const d = defaults ?? {};
  const keys = new Set<keyof SceneAssets>();
  for (const k of ["character", "background", "prop", "firstFrame", "lastFrame"] as const) {
    if (!s[k]?.trim() && d[k]?.trim()) keys.add(k);
  }
  if (!s.refImages?.filter((u) => u?.trim()).length && d.refImages?.filter((u) => u?.trim()).length) {
    keys.add("refImages");
  }
  return keys;
}

/** Every image a scene contributes, in the order the model should see them.
 *  Exported so the UI can show a count without duplicating the rules. */
export function sceneAssetCount(a: SceneAssets): number {
  return (
    (a.character ? 1 : 0) +
    (a.background ? 1 : 0) +
    (a.prop ? 1 : 0) +
    (a.firstFrame ? 1 : 0) +
    (a.lastFrame ? 1 : 0) +
    (a.refImages?.length ?? 0)
  );
}

export type Scene = {
  id: string;
  /** 0-based order index. */
  index: number;
  /** Target clip length in seconds (5–15). */
  duration: number;
  /** Scene-level script / shot description. Editable by user; also the
   *  target field for AI-generated prompts. */
  script: string;
  /** Per-scene reference images assigned by the user. */
  assets: SceneAssets;
  // ── Audio ──
  /** Enable Seedance 2.0 native AI audio generation for this clip. */
  audio: boolean;
  /** Custom audio file URL or data URI to mix over this clip during
   *  stitching. Takes precedence over native AI audio in the final mix. */
  audioUrl?: string;
  // ── Generation state (populated in Phase 3) ──
  /** BytePlus task id returned by POST /api/video. */
  clipTaskId?: string;
  clipStatus: ClipStatus;
  /** CDN or mirror URL of the generated clip. */
  clipUrl?: string;
  /** Storyboard image URL generated by Seedream. */
  storyboardUrl?: string;
  /** Whether the user has approved this clip for final stitching. */
  approved: boolean;
};

export type StoryMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type Story = StoryMeta & {
  /** The raw story/script the user entered. */
  prompt: string;
  /** Total target video duration in seconds (default 60). */
  targetDuration: number;
  scenes: Scene[];
  /** Background music / audio URL or data URI to mix under the final
   *  stitched video. Applied at the story level during FFmpeg stitching. */
  backgroundAudioUrl?: string;
  /** Global audio default — new scenes inherit this value. */
  globalAudio: boolean;
  /**
   * Story-wide image defaults. Every scene inherits these per-field unless it
   * sets its own, so a recurring character or a fixed location is configured
   * once instead of pasted into every scene.
   *
   * Resolved at generation time via resolveSceneAssets(), NOT copied into
   * scenes on save — copying would freeze each scene at the value that
   * happened to exist when it was created, and editing the default later
   * would silently stop applying.
   */
  defaultAssets?: SceneAssets;
};

type StoreShape = {
  version: 1;
  stories: Record<string, Story>;
};

const EMPTY_STORE: StoreShape = { version: 1, stories: {} };

// ─────────────────────────── Storage I/O ──────────────────────────────────

function readStore(): StoreShape {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY());
    if (!raw) return { version: 1, stories: {} };
    const parsed = JSON.parse(raw) as StoreShape;
    if (parsed.version !== 1 || !parsed.stories) return EMPTY_STORE;
    return parsed;
  } catch {
    return EMPTY_STORE;
  }
}

function writeStore(store: StoreShape): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY(), JSON.stringify(store));
  } catch {
    // Quota / private-mode failures are best-effort.
  }
  cachedList = null;
  listeners.forEach((cb) => cb());
}

// ─────────────────────── Subscription / cache ─────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedList: StoryMeta[] | null = null;

export function subscribeStories(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getStoriesSnapshot(): StoryMeta[] {
  if (cachedList === null) cachedList = listStories();
  return cachedList;
}

export function getStoriesServerSnapshot(): StoryMeta[] | null {
  return null;
}

// ─────────────────────────── Public API ───────────────────────────────────

export function listStories(): StoryMeta[] {
  const store = readStore();
  return Object.values(store.stories)
    .map<StoryMeta>((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getStory(id: string): Story | null {
  const store = readStore();
  return store.stories[id] ?? null;
}

export function createStory(opts: {
  name?: string;
  prompt?: string;
  targetDuration?: number;
  scenes?: Scene[];
  globalAudio?: boolean;
} = {}): Story {
  const store = readStore();
  const now = Date.now();
  const id = newId();
  const story: Story = {
    id,
    name: opts.name?.trim() || "Untitled Story",
    createdAt: now,
    updatedAt: now,
    prompt: opts.prompt ?? "",
    targetDuration: opts.targetDuration ?? 60,
    scenes: opts.scenes ?? [],
    globalAudio: opts.globalAudio ?? false,
  };
  store.stories[id] = story;
  writeStore(store);
  return story;
}

export function updateStory(
  id: string,
  patch: Partial<Omit<Story, "id" | "createdAt">>,
): Story | null {
  const store = readStore();
  const existing = store.stories[id];
  if (!existing) return null;
  const next: Story = { ...existing, ...patch, id, updatedAt: Date.now() };
  store.stories[id] = next;
  writeStore(store);
  return next;
}

export function deleteStory(id: string): void {
  const store = readStore();
  if (!store.stories[id]) return;
  delete store.stories[id];
  writeStore(store);
}

export function duplicateStory(id: string): Story | null {
  const src = getStory(id);
  if (!src) return null;
  return createStory({
    name: `${src.name} (copy)`,
    prompt: src.prompt,
    targetDuration: src.targetDuration,
    scenes: structuredClone(src.scenes).map((s) => ({
      ...s,
      id: newId(),
      clipTaskId: undefined,
      clipStatus: "idle" as ClipStatus,
      clipUrl: undefined,
      storyboardUrl: undefined,
      approved: false,
    })),
  });
}

// ─────────────────────────── Helpers ──────────────────────────────────────

export function newSceneId(): string {
  return newId();
}

function newId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
