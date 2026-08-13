/**
 * Smart Video Edit — every persisted type. No runtime code lives here.
 *
 * See docs/prd-video-editor.md for the feature spec. The two invariants that
 * lib/edit/types.ts states apply here unchanged (no bytes in localStorage; all
 * geometry in image-intrinsic pixels), and this file adds two of its own:
 *
 * 3. A KEYFRAME'S TIMESTAMP IS WHAT THE DECODER REPORTED, never what the
 *    slider asked for. `video.currentTime = t` lands on the nearest decodable
 *    frame, not on `t`. Storing the requested value produces a ledger whose
 *    timestamps disagree with its own pixels — which is undetectable
 *    downstream and makes bookend chaining jump for no visible reason.
 *    frame-grab.ts reads mediaTime from requestVideoFrameCallback and that
 *    number, and only that number, lands in `t`.
 *
 * 4. `editedFrameUrl` IS ONLY EVER WRITTEN FROM A RENDER RESPONSE. Never from
 *    renderComposite(). The composite carries magenta markup; if it reaches
 *    Seedance the marks animate. The type can't enforce provenance, so the
 *    rule lives here and is asserted in video-prompt.test.ts.
 */

import type { Annotation } from "@/lib/edit/types";

// ─────────────────────────── Source clip ──────────────────────────────────

export type VideoSource = {
  /** Same-origin /library-cache/… or an https CDN URL. Never a blob: URL —
   *  those die with the page and a session outlives its tab. */
  url: string;
  /** Intrinsic frame size, measured on first load. Drives the ratio default
   *  and the asset-limit checks. */
  width: number;
  height: number;
  /** Seconds, from the decoder. */
  duration: number;
  bytes?: number;
  /** Library asset id when the clip came from the Library or a Creation. */
  assetId?: string;
  /** BytePlus asset id, once the clip itself has been ingested. */
  byteplusAssetId?: string;
};

/**
 * The segment of the source the user is actually editing.
 *
 * Seedance caps output at 15s, so a longer clip is edited through a window
 * and spliced back (PRD §5G). The window is also what bounds every keyframe:
 * a keyframe outside it has no meaning for the render.
 */
export type WorkingWindow = { start: number; end: number };

// ─────────────────────────── Keyframes ────────────────────────────────────

export type KeyframeRole = "first_frame" | "last_frame" | "reference";

export type AssetStatus = "none" | "uploading" | "pending" | "active" | "failed";

export type Keyframe = {
  id: string;
  /** Decoder-reported mediaTime, seconds, 3dp. See invariant 3. */
  t: number;
  /** The clean grab, hosted. Never a data URI in the store. */
  sourceFrameUrl: string;
  width: number;
  height: number;
  /** The marks that produced the edit. Same Annotation union the image editor
   *  uses — point/box travel as coordinate tags, brush/arrow as pixels. */
  annotations: Annotation[];
  /** What the user asked for on this frame. Feeds the Seedream edit, and is
   *  summarised into the video prompt. */
  instruction: string;
  /**
   * The frame WITH the marks drawn into it — what Seedance 2.5 is shown.
   *
   * This is the reference the chip sends. Unlike `editedFrameUrl` it is a
   * composite we produced, not a model output, so invariant 4 does not apply
   * to it: the marks are the message here, not contamination.
   */
  markedFrameUrl?: string;
  /** The same composite after asset ingest — what a frame with a face needs
   *  in order to clear privacy moderation. */
  markedAssetUrl?: string;
  /**
   * Seedream's output, from the OPTIONAL pre-render path.
   *
   * Kept as a fallback: if 2.5 turns out to ignore drawn marks, a corrected
   * still is the way back. Not on the primary path. MARKUP-FREE — see
   * invariant 4.
   */
  editedFrameUrl?: string;
  /** Set while a frame edit is in flight, so the rail can show it. */
  editStatus?: "idle" | "rendering" | "done" | "failed";
  editError?: string;
  /** BytePlus asset id for the edited frame, once Active. */
  assetId?: string;
  /**
   * BytePlus asset id for the UNEDITED grab.
   *
   * Only variant B needs it — that variant shows the model both states and
   * names the difference, so the "before" has to be a bindable reference too.
   * Uploaded lazily rather than on every grab: the other four variants never
   * look at it, and an ingest per grab would triple the traffic for nothing.
   */
  sourceAssetId?: string;
  assetStatus: AssetStatus;
  assetError?: string;
  /** The asset's own URL as returned by GetAsset. This is what a bookend
   *  variant puts on the wire, because `image_url` takes URLs and not
   *  `asset://` refs — see PRD §8 and R13. */
  assetUrl?: string;
  role: KeyframeRole;
  createdAt: number;
};

// ─────────────────────────── Prompt variants ──────────────────────────────

/**
 * The five submission strategies from PRD §10.2. Each is a different theory of
 * how an edit should reach the model, and which one wins is an empirical
 * question (§10.5) — hence a closed enum plus a selector rather than one
 * hardcoded path.
 */
export type PromptVariantId = "A" | "B" | "C" | "D" | "E";

export const PROMPT_VARIANTS: readonly {
  id: PromptVariantId;
  label: string;
  hint: string;
}[] = [
  { id: "A", label: "First frame", hint: "Pin the edit at t=0, describe only motion" },
  { id: "B", label: "Tagged delta", hint: "Show before + after, name the change" },
  { id: "C", label: "Motion transfer", hint: "Keep the source's motion, apply the new look" },
  { id: "D", label: "Shot list", hint: "Several keyframes become labelled shots" },
  { id: "E", label: "Bookend", hint: "Pin both ends, solve the middle" },
] as const;

// ─────────────────────────── Versions ─────────────────────────────────────

export type VideoEditVersionStatus = "pending" | "done" | "failed";

export type VideoEditVersion = {
  id: string;
  createdAt: number;
  parentId?: string;
  /** What the user typed as the overall intent. */
  intent: string;
  /** EXACTLY what went upstream as `prompt`. The disclosure reads this, and
   *  it is the first thing to look at when a render surprises someone. */
  compiledPrompt: string;
  variant: PromptVariantId;
  model: string;
  duration: number;
  ratio: string;
  resolution: string;
  seed?: number;
  audioMode: AudioMode;
  /** The ledger as it was at submit time — restoring a version brings back
   *  the keyframes and their marks, not just the output clip. */
  keyframesSnapshot: Keyframe[];
  /** The exact request body, minus credentials. Kept because "what did it
   *  actually send?" is the first demo question, and a reconstruction answers
   *  a different question than the real thing. */
  requestBody?: unknown;
  taskId?: string;
  outputs: Array<{ url: string; mirrorUrl?: string }>;
  status: VideoEditVersionStatus;
  error?: string;
  elapsedMs?: number;
};

// ─────────────────────────── Audio (PRD §5G) ──────────────────────────────

/**
 * Seedance returns a NEW clip, so the source's audio does not survive. For an
 * edit of the user's own footage that is almost never what they want — the
 * dialogue and room tone were fine.
 */
export type AudioMode = "preserve" | "generate" | "silent";

// ─────────────────────────── Session ──────────────────────────────────────

export type VideoEditSessionMeta = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  coverUrl?: string;
};

export type VideoEditSession = VideoEditSessionMeta & {
  source: VideoSource;
  window: WorkingWindow;
  /** Keyframes, always sorted by `t`. The store maintains the ordering so no
   *  reader has to remember to. */
  keyframes: Keyframe[];
  activeKeyframeId: string | null;
  /** Legacy free text. Superseded by `promptTokens`; read through
   *  `tokensFor()`, which falls back to this so old sessions still open. */
  intent: string;
  /**
   * The prompt as the user composed it: free text with marked frames inline.
   *
   * A chip is a reference AND a position — "make it bigger" means something
   * different before and after the mark it refers to — so the user's ordering
   * is preserved rather than flattened into a string plus a set.
   */
  promptTokens?: import("./marks-prompt").PromptToken[];
  /** null = follow the §10.3 heuristic. A set value is a user override. */
  variant: PromptVariantId | null;
  model: string;
  duration: number;
  ratio: string;
  resolution: string;
  seed?: number;
  audioMode: AudioMode;
  /**
   * A reference track for the render to follow — background music, or a beat
   * to cut against. Seedance 2.5 and later only.
   *
   * Orthogonal to `audioMode`: that decides what happens to the SOURCE clip's
   * own audio in post, this is an input the model generates against. The
   * vendor's own example passes both a reference track and generate_audio.
   */
  audioRefUrl?: string;
  /**
   * The source clip's own public URL, once ingested as a video asset.
   *
   * REQUIRED for the primary flow, not an optimisation. The render is "re-do
   * this video with these changes", and the model cannot do that without
   * being shown the video — given only a still it invents everything after
   * the first frame.
   */
  sourceVideoAssetUrl?: string;
  sourceVideoStatus?: "none" | "uploading" | "active" | "failed";
  sourceVideoError?: string;
  /** BytePlus asset group for this session's keyframes. Created once, lazily,
   *  on the first upload. */
  assetGroupId?: string;
  versions: VideoEditVersion[];
};

// ─────────────────────────── Caps ─────────────────────────────────────────

/** Three tagged references is the practical ceiling before the model starts
 *  averaging them; the ledger cap is higher so a user can stage frames and
 *  choose. */
export const MAX_KEYFRAMES = 10;

/**
 * The model this feature is built for.
 *
 * Pinned here rather than taken from DEFAULT_VIDEO_MODEL_ID, which points at
 * 2.0 for the rest of the app. 2.5 is what the timestamped-prompt design
 * targets — its own reference request is written as `2–4 seconds: …` ranges —
 * and it is the only family member that accepts audio references.
 */
export const VIDEO_EDIT_MODEL = "dreamina-seedance-2-5-260628";

/** Video sessions carry more state than image ones, and the quota is shared. */
export const MAX_VIDEO_VERSIONS = 25;

/** Seedance's own output ceiling, and therefore the working window's. Was 15
 *  until 2.5 turned out to render a single take up to 30 — the number here is
 *  a restatement of the model's cap (VIDEO_MODELS' CAPS_V25), not an
 *  independent product choice, so it moves when the model does. */
export const MAX_WINDOW_SECONDS = 30;
export const MIN_WINDOW_SECONDS = 4;

/**
 * Asset-ingest bounds for an image, from the BytePlus Assets API. Enforced
 * before upload so a frame that cannot be ingested is rejected with a reason
 * rather than sitting in `Failed` with an opaque message.
 */
export const ASSET_IMAGE_MIN_SIDE = 300;
export const ASSET_IMAGE_MAX_SIDE = 6000;
export const ASSET_ASPECT_MIN = 0.4;
export const ASSET_ASPECT_MAX = 2.5;

/**
 * Seedance 2.5's VIDEO EDITING task type, learned from the API's own rejection:
 *
 *   "Seedance identified your task as video editing based on your prompt. For
 *    this task type, the output ratio and duration follow the input video …
 *    `ratio` must be `adaptive`. `duration` must be -1."
 *
 * The model classifies the task from the PROMPT, not from a parameter, so any
 * request that reads as "edit this video" inherits these rules whether or not
 * the caller intended to opt in. That makes them a property of what we are
 * asking for rather than a setting, which is why ratio and duration stopped
 * being controls in the UI.
 */
export const EDIT_TASK_RATIO = "adaptive" as const;
/** -1 means "follow the input video". A real number is rejected outright. */
export const EDIT_TASK_DURATION = -1;
/** The input clip's own bounds for this task type — wider than the general
 *  reference-video limits, and the number the user is held to. */
export const EDIT_TASK_MIN_SECONDS = 4;
export const EDIT_TASK_MAX_SECONDS = 30;

/** Reference-video bounds — these are what gate variant C. */
export const REF_VIDEO_MAX_SECONDS = 15;
export const REF_VIDEO_MIN_SECONDS = 2;
export const REF_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
