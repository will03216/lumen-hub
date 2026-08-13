/**
 * The Seedance prompt compiler — PRD §10, and the highest test-value module
 * in the feature.
 *
 * Turns the keyframe ledger plus the user's stated intent into (a) one plain
 * text prompt and (b) the wire plan that goes with it. Five strategies, each a
 * different theory of how an edit should reach the model; which one actually
 * wins is an empirical question the §10.5 bench answers, so all five are
 * implemented and selectable rather than one being guessed at now.
 *
 * ── What this module is NOT ──────────────────────────────────────────────
 *
 * It is not a writer. It does not invent lighting, style or atmosphere — that
 * needs a model, and /api/video/enhance-prompt already exists for it. This is
 * the deterministic layer: scaffold, reference tagging, duration, constraints,
 * anti-slop, integrity. Deterministic means testable, and testable is what
 * makes "the prompt is compiled, not typed" a claim we can keep.
 *
 * ── The invariant that will bite if it's ever broken ─────────────────────
 *
 * ⚠ NO COORDINATE TAGS. `<point>` / `<bbox>` are a *Seedream* contract,
 * reverse-engineered from that model's own demo. Seedance has no published
 * equivalent. Emitting them into a video prompt is at best inert and at worst
 * renders literal angle brackets on screen. Spatial intent reaches Seedance as
 * prose and as the pixels of an already-edited keyframe — nothing else. There
 * is a test asserting no output of this module ever contains one.
 */

import type {
  AudioMode,
  Keyframe,
  PromptVariantId,
  VideoEditSession,
} from "./types";
import {
  CAMERA_MOVE_RE,
  computeDuration,
  estimateBeats,
  estimateDialogueWords,
  type DurationBasis,
} from "./duration-calc";

// ─────────────────────────── Wire plan ────────────────────────────────────

/**
 * The two transports, and why they can't be collapsed.
 *
 * `content[].image_url` takes a URL and is the only way to pin a first or last
 * frame. `references[]` takes a BytePlus asset_id and is the only way to bind
 * a subject reference. Neither accepts the other's form — see
 * app/studio/nodes/video-gen-node.tsx:466. Getting this backwards either fails
 * at submit or, worse, silently drops the reference and renders a video that
 * looks like the model ignored the edit.
 */
export type VideoWirePlan = {
  images: Array<{ url: string; role: "first_frame" | "last_frame" | "reference_image" }>;
  videos: Array<{ url: string; role: "reference_video" }>;
  references: Array<{ type: "image" | "video"; role: "subject"; asset_id: string }>;
};

export type CompiledVideoPrompt = {
  prompt: string;
  variant: PromptVariantId;
  plan: VideoWirePlan;
  duration: number;
  durationBasis: string;
  /** Which keyframe each `[imageN]` tag refers to, in wire order. Drives the
   *  disclosure — "what is image2?" is otherwise unanswerable. */
  tagMap: Array<{ tag: string; keyframeId?: string; description: string }>;
  /** Non-fatal notes. The render proceeds. */
  warnings: string[];
  /** Integrity failures. The render is BLOCKED — every one of these produces a
   *  request that is either rejected upstream or silently wrong. */
  errors: string[];
};

// ─────────────────────────── Anti-slop ────────────────────────────────────

/**
 * Mood words from claude_skill/references/safety.md.
 *
 * Deleted rather than replaced. The skill's rule is that anti-slop trades
 * vague intensity for CONCRETE intensity — but inventing the concrete
 * replacement is a writing job (see the header), so the deterministic pass
 * removes the noise and the warning tells the user what to add back.
 *
 * `cinematic` is only slop when it stands alone; "cinematic lighting" is
 * already caught by the lighting check, and "35mm cinematic tone" is signal.
 * Matching on a word boundary and warning rather than silently rewriting is
 * the conservative side of that line.
 */
const BANNED_MOOD_WORDS = [
  "epic",
  "stunning",
  "breathtaking",
  "incredible",
  "amazing",
  "beautiful",
  "masterpiece",
  "8k ultra-real",
  "8k",
  "ultra-real",
  "photorealistic masterpiece",
] as const;

/** Bare emotion adjectives — the skill directs these to be written as physical
 *  behaviour instead. Warned about, never auto-rewritten: replacing "sad" with
 *  a guess at what sad looks like is exactly the kind of invention this module
 *  refuses to do. */
const EMOTION_ADJECTIVES = [
  "emotional",
  "very sad",
  "happy expression",
  "angry expression",
  "excited",
] as const;

/** Camera brands are a documented integrity failure; film stock and focal
 *  length are signal and must survive. */
const CAMERA_BRANDS = ["arri", "alexa", "red komodo", "sony venice", "blackmagic"] as const;

export function stripSlop(text: string): { text: string; removed: string[] } {
  let out = text;
  const removed: string[] = [];
  for (const word of BANNED_MOOD_WORDS) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (re.test(out)) {
      removed.push(word);
      out = out.replace(re, "");
    }
  }
  // Collapse the double spaces and orphaned commas a deletion leaves behind,
  // so the result still reads as prose rather than as redacted prose.
  out = out
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*[,.]\s*/, "")
    .trim();
  return { text: out, removed };
}

// ─────────────────────────── Constraint lines ─────────────────────────────

/**
 * The portrait stability line from safety.md. Measurably reduces face-swapping
 * and jitter on character shots, and is a *constraint* rather than slop — it
 * names a concrete failure to avoid, which is why the anti-slop pass keeps it.
 *
 * Deliberately not appended to product or landscape work, where it adds noise.
 */
export const PORTRAIT_CONSTRAINT =
  "Stable face without deformation, clear facial features, normal body proportions, natural and fluid movement, no stiffness, no flicker, no frame stutter.";

/** The trimmed clause for non-portrait shots. */
export const MOTION_CONSTRAINT =
  "Natural and fluid movement, no flicker, no frame stutter.";

// ─────────────────────────── Compiler ─────────────────────────────────────

export type CompileInput = {
  session: VideoEditSession;
  variant: PromptVariantId;
  /** Whether a person is on screen. Drives the constraint line, and is a
   *  user-set flag rather than a detector: a wrong guess here either adds
   *  noise to a product shot or drops the stability line from a face shot,
   *  and the user knows which one they have. */
  hasPerson?: boolean;
};

export function compileVideoPrompt(input: CompileInput): CompiledVideoPrompt {
  const { session, variant } = input;
  const warnings: string[] = [];
  const errors: string[] = [];

  const usable = session.keyframes.filter((k) => Boolean(k.editedFrameUrl));
  const unrendered = session.keyframes.length - usable.length;
  if (unrendered > 0) {
    warnings.push(
      `${unrendered} keyframe${unrendered === 1 ? " has" : "s have"} no rendered edit yet — ${unrendered === 1 ? "it is" : "they are"} not in this request.`,
    );
  }

  const { text: intent, removed } = stripSlop(session.intent.trim());
  if (removed.length > 0) {
    warnings.push(
      `Removed mood words with no visual meaning: ${removed.join(", ")}. Replace them with something the camera can see — a light source, a material, a movement.`,
    );
  }
  if (!intent) {
    errors.push("Describe the change you want before rendering.");
  }
  for (const adj of EMOTION_ADJECTIVES) {
    if (new RegExp(`\\b${adj}\\b`, "i").test(intent)) {
      warnings.push(
        `"${adj}" is an emotion adjective — direct it as physical behaviour instead (what the face and body actually do).`,
      );
    }
  }
  for (const brand of CAMERA_BRANDS) {
    // Quote what the USER wrote, not the lowercase constant we matched on. An
    // error that says `remove "arri"` when they typed "ARRI" reads as being
    // about a different string than the one on their screen.
    const hit = intent.match(new RegExp(`\\b${brand}\\b`, "i"));
    if (hit) {
      errors.push(
        `Remove the camera brand "${hit[0]}" — film stock and focal length are fine, brand names are not.`,
      );
    }
  }

  const constraint = input.hasPerson ? PORTRAIT_CONSTRAINT : MOTION_CONSTRAINT;

  const built = buildForVariant({
    variant,
    session,
    keyframes: usable,
    intent,
    constraint,
    warnings,
    errors,
  });

  const duration = resolveDuration(session, intent, built.shots);

  // The last gate, and the one that exists because getting it wrong is
  // invisible: a coordinate tag reaching a video model. Checked on the final
  // string rather than per-fragment, so no assembly path can route around it.
  if (/<\/?(?:point|bbox)>/i.test(built.prompt)) {
    errors.push(
      "Internal: coordinate tags reached the video prompt. They are a Seedream contract and must never go to Seedance.",
    );
  }

  return {
    prompt: built.prompt,
    variant,
    plan: built.plan,
    duration: session.duration || duration.seconds,
    durationBasis: duration.basis,
    tagMap: built.tagMap,
    warnings,
    errors,
  };
}

// ─────────────────────────── Variants ─────────────────────────────────────

type BuildArgs = {
  variant: PromptVariantId;
  session: VideoEditSession;
  keyframes: Keyframe[];
  intent: string;
  constraint: string;
  warnings: string[];
  errors: string[];
};

type BuiltPrompt = {
  prompt: string;
  plan: VideoWirePlan;
  tagMap: CompiledVideoPrompt["tagMap"];
  shots: number;
};

function buildForVariant(args: BuildArgs): BuiltPrompt {
  switch (args.variant) {
    case "A":
      return buildFirstFrame(args);
    case "B":
      return buildTaggedDelta(args);
    case "C":
      return buildMotionTransfer(args);
    case "D":
      return buildShotList(args);
    case "E":
      return buildBookend(args);
  }
}

const EMPTY_PLAN = (): VideoWirePlan => ({ images: [], videos: [], references: [] });

/**
 * Variant A — untagged first frame (pure I2V).
 *
 * A single UNTAGGED image is treated by Seedance as a literal first frame. That
 * behaviour is the whole variant: pin the edited frame at the start, then
 * describe only what moves. The absence of a `[image1]` tag is load-bearing —
 * adding one converts it into a styled subject reference and the frame stops
 * being the opening.
 */
function buildFirstFrame(args: BuildArgs): BuiltPrompt {
  const { keyframes, intent, constraint, errors } = args;
  const first = keyframes[0];
  const plan = EMPTY_PLAN();

  if (!first) {
    errors.push("Variant A needs one edited keyframe to pin as the first frame.");
  } else {
    const url = bookendUrl(first, args);
    if (url) plan.images.push({ url, role: "first_frame" });
  }

  // I2V rule: never restate what the image already shows. The prompt is motion,
  // camera and light evolution only — the intent is carried in as the movement
  // instruction, not as a description of the scene.
  const prompt = joinBlocks([
    intent,
    "The change already visible in the first frame holds for the entire clip.",
    constraint,
  ]);

  return {
    prompt,
    plan,
    tagMap: first
      ? [{ tag: "(untagged first frame)", keyframeId: first.id, description: `edited frame at ${first.t.toFixed(2)}s` }]
      : [],
    shots: 1,
  };
}

/**
 * Variant B — tagged delta.
 *
 * Show both states and name the change. Binds the edit as a semantic
 * instruction rather than a pixel constraint, which leaves Seedance free to
 * re-render the motion — better for appearance changes that must hold, worse
 * for compositional adds and removes where the model may render the "before".
 */
function buildTaggedDelta(args: BuildArgs): BuiltPrompt {
  const { keyframes, intent, constraint, errors } = args;
  const plan = EMPTY_PLAN();
  const tagMap: CompiledVideoPrompt["tagMap"] = [];
  const first = keyframes[0];

  if (!first) {
    errors.push("Variant B needs at least one edited keyframe.");
    return { prompt: joinBlocks([intent, constraint]), plan, tagMap, shots: 1 };
  }

  // Source frame first, edited frame second — the tag numbers follow argument
  // order, so [image1] is "before" and [image2] is "after" and the prose below
  // depends on exactly that.
  const beforeId = requireAsset(first, args, "the original frame");
  const afterId = requireAsset(first, args, "the edited frame", "edited");

  if (beforeId) {
    plan.references.push({ type: "image", role: "subject", asset_id: beforeId });
    tagMap.push({ tag: "[image1]", keyframeId: first.id, description: `original frame at ${first.t.toFixed(2)}s` });
  }
  if (afterId) {
    plan.references.push({ type: "image", role: "subject", asset_id: afterId });
    tagMap.push({ tag: `[image${plan.references.length}]`, keyframeId: first.id, description: `edited frame at ${first.t.toFixed(2)}s` });
  }

  const beforeTag = beforeId ? "[image1]" : "";
  const afterTag = afterId ? `[image${plan.references.length}]` : "";

  const prompt = joinBlocks([
    beforeId && afterId
      ? `The scene continues exactly as framed in ${beforeTag}, with one change already made, shown in ${afterTag}: ${lowerFirst(intent)}`
      : intent,
    "Keep the framing, background, lighting and everything else unchanged.",
    constraint,
  ]);

  return { prompt, plan, tagMap, shots: 1 };
}

/**
 * Variant C — motion-preserving V2V.
 *
 * The source clip already contains the right motion, camera and timing. Pass it
 * as a reference video, pass the edited keyframe as the appearance reference,
 * and ask for a transfer. Closest thing to an actual edit — and the most
 * constrained, because a reference video has to be 2–15s and ≤720p.
 */
function buildMotionTransfer(args: BuildArgs): BuiltPrompt {
  const { session, keyframes, intent, constraint, errors, warnings } = args;
  const plan = EMPTY_PLAN();
  const tagMap: CompiledVideoPrompt["tagMap"] = [];
  const look = keyframes[0];

  const windowLength = session.window.end - session.window.start;
  if (windowLength > 15) {
    errors.push(
      `Variant C passes the clip as a reference video, which caps at 15s — the working window is ${windowLength.toFixed(1)}s. Shorten the window or pick another variant.`,
    );
  }
  if (!session.source.byteplusAssetId && !/^https?:/i.test(session.source.url)) {
    errors.push(
      "Variant C needs the source clip at a publicly fetchable URL. Upload it to the asset library first.",
    );
  }

  if (session.source.byteplusAssetId) {
    plan.references.push({
      type: "video",
      role: "subject",
      asset_id: session.source.byteplusAssetId,
    });
    tagMap.push({ tag: "[video1]", description: "the source clip" });
  } else if (/^https?:/i.test(session.source.url)) {
    plan.videos.push({ url: session.source.url, role: "reference_video" });
    tagMap.push({ tag: "[video1]", description: "the source clip" });
    warnings.push(
      "The source clip is going up as a plain URL. If it contains a face, ingest it through the asset library first or the request may be rejected.",
    );
  }

  if (!look) {
    errors.push("Variant C needs an edited keyframe to take the new appearance from.");
  } else {
    const assetId = requireAsset(look, args, "the edited frame", "edited");
    if (assetId) {
      plan.references.push({ type: "image", role: "subject", asset_id: assetId });
      tagMap.push({
        tag: "[image1]",
        keyframeId: look.id,
        description: `edited frame at ${look.t.toFixed(2)}s`,
      });
    }
  }

  const prompt = joinBlocks([
    "Keep the camera move, the motion and the shot timing of [video1] exactly as they are.",
    look ? `Apply the appearance shown in [image1]: ${lowerFirst(intent)}` : intent,
    "Everything else in [video1] — the background, the lighting and the framing — stays unchanged.",
    constraint,
  ]);

  return { prompt, plan, tagMap, shots: 1 };
}

/**
 * Variant D — multi-keyframe shot list.
 *
 * Several keyframes at different timestamps are a shot list. `Shot N:` labels
 * are the model's cut points; bare timestamp blocks are a weaker signal and
 * long unlabelled prose renders as one continuous take.
 *
 * The shot budget is a hard rule, not a style preference: ≈4–6s per shot, max
 * 3 shots per call. Four keyframes is two calls, not one crowded one.
 */
function buildShotList(args: BuildArgs): BuiltPrompt {
  const { keyframes, intent, constraint, errors, warnings } = args;
  const plan = EMPTY_PLAN();
  const tagMap: CompiledVideoPrompt["tagMap"] = [];

  if (keyframes.length < 2) {
    errors.push("Variant D needs at least two edited keyframes to build a shot list.");
  }

  const used = keyframes.slice(0, 3);
  if (keyframes.length > 3) {
    warnings.push(
      `Only the first 3 keyframes are in this call — the shot budget is 3 per render. Chain the remaining ${keyframes.length - 3} as a second render.`,
    );
  }

  used.forEach((kf, i) => {
    const assetId = requireAsset(kf, args, `keyframe ${i + 1}`, "edited");
    if (assetId) {
      plan.references.push({ type: "image", role: "subject", asset_id: assetId });
      tagMap.push({
        tag: `[image${plan.references.length}]`,
        keyframeId: kf.id,
        description: `edited frame at ${kf.t.toFixed(2)}s`,
      });
    }
  });

  // The earliest keyframe also pins the opening, so the sequence starts where
  // the user's edit starts rather than wherever the model decides to open.
  const firstUrl = used[0] ? bookendUrl(used[0], args) : undefined;
  if (firstUrl) plan.images.push({ url: firstUrl, role: "first_frame" });

  const shots = used.map((kf, i) => {
    const tag = tagMap[i]?.tag;
    const note = kf.instruction.trim();
    return `Shot ${i + 1}: ${note ? lowerFirst(stripSlop(note).text) : "the action continues"}${tag ? ` ${tag}` : ""}.`;
  });

  const prompt = joinBlocks([
    intent,
    ...shots,
    "Hold the same lighting, grade and framing contract across every shot.",
    constraint,
  ]);

  return { prompt, plan, tagMap, shots: Math.max(1, used.length) };
}

/**
 * Variant E — bookend chain.
 *
 * Pin both ends and let Seedance solve only the middle. The tightest control
 * available, and the natural fit when the user edited two timestamps.
 *
 * Chain at SETTLED poses. Motion momentum does not carry across a call, so two
 * frames grabbed mid-movement produce a smear between them — which reads as a
 * model quality problem rather than as a badly chosen pair of frames.
 */
function buildBookend(args: BuildArgs): BuiltPrompt {
  const { keyframes, intent, constraint, errors } = args;
  const plan = EMPTY_PLAN();
  const tagMap: CompiledVideoPrompt["tagMap"] = [];

  const first = keyframes[0];
  const last = keyframes.length > 1 ? keyframes[keyframes.length - 1] : undefined;

  if (!first || !last) {
    errors.push(
      "Variant E needs two edited keyframes — one for the first frame, one for the last.",
    );
  } else {
    const firstUrl = bookendUrl(first, args);
    const lastUrl = bookendUrl(last, args);
    if (firstUrl) plan.images.push({ url: firstUrl, role: "first_frame" });
    // Order matters on the wire: last_frame without a preceding first_frame is
    // not a valid pairing.
    if (lastUrl) plan.images.push({ url: lastUrl, role: "last_frame" });
    tagMap.push(
      { tag: "(first frame)", keyframeId: first.id, description: `edited frame at ${first.t.toFixed(2)}s` },
      { tag: "(last frame)", keyframeId: last.id, description: `edited frame at ${last.t.toFixed(2)}s` },
    );
  }

  // Only the transition. Restating either end's content is the I2V mistake, and
  // here it is doubly wrong: both ends are already pinned as pixels.
  const prompt = joinBlocks([
    `Between the two pinned frames: ${lowerFirst(intent)}`,
    "Single continuous take, no cuts.",
    constraint,
  ]);

  return { prompt, plan, tagMap, shots: 1 };
}

// ─────────────────────────── Shared helpers ───────────────────────────────

/**
 * The URL a bookend frame goes up as.
 *
 * `image_url` takes a URL, not an `asset://` ref — so the asset's own returned
 * URL is preferred over the raw library one: it has already been through
 * ingest, which is the whole reason §9 exists. Falling back to the library URL
 * is what happens before ingest completes, and it is exactly the case that can
 * trip privacy moderation on a face, so it warns.
 */
function bookendUrl(kf: Keyframe, args: BuildArgs): string | undefined {
  if (kf.assetUrl) return kf.assetUrl;
  if (kf.editedFrameUrl) {
    if (kf.assetStatus !== "active") {
      args.warnings.push(
        `The frame at ${kf.t.toFixed(2)}s is pinned by URL and has not finished uploading to the asset library. If it contains a person, the request may be rejected.`,
      );
    }
    return kf.editedFrameUrl;
  }
  args.errors.push(`The frame at ${kf.t.toFixed(2)}s has no rendered edit to pin.`);
  return undefined;
}

/**
 * The asset id a tagged reference needs, or an error explaining its absence.
 *
 * `references[]` accepts asset ids ONLY. A missing id is not something to warn
 * about and proceed past: the reference would be dropped from the request and
 * the render would come back looking like the model ignored the edit.
 */
function requireAsset(
  kf: Keyframe,
  args: BuildArgs,
  label: string,
  which: "source" | "edited" = "source",
): string | undefined {
  // NO FALLBACK between the two ids. An earlier version read
  // `kf.sourceAssetId ?? kf.assetId`, which meant variant B — the one variant
  // whose entire premise is showing the model a before AND an after — sent the
  // EDITED frame as both, with prose insisting they differed. The model would
  // have resolved that however it liked, and the result would have read as
  // "the edit didn't take". A missing id has to block.
  const id = which === "edited" ? kf.assetId : kf.sourceAssetId;
  if (id) return id;
  args.errors.push(
    `The ${which === "edited" ? "edited" : "original"} frame for ${label} at ${kf.t.toFixed(2)}s has not finished uploading to the asset library yet.`,
  );
  return undefined;
}

function resolveDuration(
  session: VideoEditSession,
  intent: string,
  shots: number,
): DurationBasis {
  return computeDuration({
    beats: estimateBeats(intent),
    dialogueWords: estimateDialogueWords(intent),
    hasCameraMove: CAMERA_MOVE_RE.test(intent),
    shots,
    windowSeconds: session.window.end - session.window.start,
  });
}

/** Blocks joined by a blank line, empties dropped. Plain text only — never
 *  JSON, never bullet lists; both degrade the model's parse. */
function joinBlocks(blocks: Array<string | undefined | false>): string {
  return blocks
    .map((b) => (typeof b === "string" ? b.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

/** Whole seconds read as whole seconds — "2-4", not "2.0-4.0", matching the
 *  vendor's example. Fractions survive when they carry information. */
function fmtSec(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ─────────────────────────── Audio ────────────────────────────────────────

/**
 * Whether the source's own audio can be muxed back over the output.
 *
 * `preserve` is only honest when the output is the same length as the window it
 * replaces. A mismatch means the audio drifts against the picture, and lips out
 * of sync is a worse outcome than silence — so the caller is told to pick
 * again rather than shipping the drift.
 */
export function audioModeIsValid(
  mode: AudioMode,
  windowSeconds: number,
  duration: number,
): { ok: boolean; reason?: string } {
  if (mode !== "preserve") return { ok: true };
  if (Math.abs(windowSeconds - duration) < 0.5) return { ok: true };
  return {
    ok: false,
    reason: `The original audio is ${windowSeconds.toFixed(1)}s and the render is ${duration}s — muxing them would drift. Match the duration to the window, or switch to generated or silent audio.`,
  };
}

// ─────────────────────── Segment prompts (timeline mode) ──────────────────

/**
 * The prompt for ONE segment of a timeline plan.
 *
 * This is the timestamp-aware compiler. The five variants above answer "how
 * does an edit reach the model"; this answers "how does a piece of a longer
 * film reach it, with its edits placed in time".
 *
 * ── Why timestamps AND labels ────────────────────────────────────────────
 *
 * prompt-guidance.md is explicit that `Shot N:` labels are the model's cut
 * points and that bare timestamp blocks are a weaker signal. But a beat that
 * happens partway through a shot is a timing instruction, not a cut — writing
 * it as its own shot would insert a cut the user never asked for.
 *
 * So both, at different levels: labels carry the cuts, and a beat inside a
 * shot carries its time ("at 2.5s, ..."). That matches how the skill's own
 * worked examples read, where timestamps appear inside a labelled shot as
 * pacing hints and never as the skeleton.
 *
 * ── Times are RELATIVE to the segment ────────────────────────────────────
 *
 * The model is rendering 8 seconds; it has no idea this is 0:42 of a
 * two-minute film. A beat written as "at 44.5s" in an 8-second render is
 * either ignored or, worse, interpreted — and the change lands nowhere near
 * where it was asked for.
 */
export function compileSegmentPrompt(input: {
  session: VideoEditSession;
  segment: {
    index: number;
    start: number;
    end: number;
    duration: number;
    openingKeyframeId?: string;
    beats: Array<{ keyframeId: string; relT: number; instruction: string }>;
    chainFromPrevious: boolean;
  };
  /** Total segments, so the prose can say where this one sits. */
  totalSegments: number;
  hasPerson?: boolean;
}): { prompt: string; warnings: string[] } {
  const { session, segment } = input;
  const warnings: string[] = [];
  const { text: intent } = stripSlop(session.intent.trim());

  const byId = new Map(session.keyframes.map((k) => [k.id, k]));
  const opening = segment.openingKeyframeId
    ? byId.get(segment.openingKeyframeId)
    : undefined;

  const blocks: string[] = [];

  // The shared contract, repeated VERBATIM in every segment. Paraphrasing it
  // between calls is self-inflicted drift — continuity-and-editing.md calls
  // the shared preamble the cheapest continuity tool there is.
  if (intent) blocks.push(intent);

  // What the opening frame already shows must not be restated: it is pinned as
  // pixels, and describing it again crowds out the motion.
  if (opening) {
    blocks.push(
      `The change visible in the opening frame holds throughout this ${segment.duration}-second take.`,
    );
  } else if (segment.chainFromPrevious) {
    blocks.push(
      "This continues directly from the previous shot with no cut. Keep the same subject, wardrobe, background, lighting and grade; carry the motion forward from where it left off.",
    );
  }

  // Timed beats, written as RANGES — `2-4 seconds: …`.
  //
  // This is the vendor's own convention, not an invention. BytePlus's
  // reference request for 2.5 is written exactly this way ("2-4 seconds: fast
  // cuts, your hand drops apple chunks into a shaker; 4-6 seconds: …"), and
  // matching the format a model's own documented example uses is the same
  // reasoning that keeps the <point>/<bbox> block byte-identical to Seedream's
  // demo: the vendor's example is the closest thing to evidence about what the
  // model was tuned on.
  //
  // An earlier version wrote instants ("At 2.5s, …"). A range says how long a
  // beat occupies, which is what the model needs in order to pace it — an
  // instant leaves the duration of every action unstated.
  if (segment.beats.length > 0) {
    const lines = segment.beats
      .map((b, i) => {
        const body = stripSlop(b.instruction.trim()).text;
        if (!body) {
          warnings.push(
            `The edit at ${b.relT.toFixed(1)}s into segment ${segment.index + 1} has no instruction, so it is not described in the prompt.`,
          );
          return null;
        }
        // Each beat runs until the next one, or to the end of the take.
        const next = segment.beats[i + 1];
        const until = next ? next.relT : segment.duration;
        return `${fmtSec(b.relT)}-${fmtSec(until)} seconds: ${lowerFirst(body)}`;
      })
      .filter((l): l is string => Boolean(l));
    if (lines.length > 0) {
      // A leading range for whatever happens before the first beat, so the
      // opening seconds are not left undescribed.
      const first = segment.beats[0];
      const opener =
        first.relT > 0.4
          ? `0-${fmtSec(first.relT)} seconds: the action already underway continues; `
          : "";
      blocks.push(
        `${opener}${lines.join("; ")}. These times are within this take, which runs ${segment.duration} seconds. The action is continuous across them — do not cut.`,
      );
    }
  }

  // A segment with no beats and no opening edit is pure continuation, and the
  // one thing it must not do is invent a new event to fill the time.
  if (segment.beats.length === 0 && !opening) {
    blocks.push(
      "Nothing new happens in this take — the action already underway simply continues at the same pace.",
    );
  }

  blocks.push(
    input.hasPerson ? PORTRAIT_CONSTRAINT : MOTION_CONSTRAINT,
  );

  const prompt = joinBlocks(blocks);

  // Same invariant as the variant compiler, checked on the final string so no
  // assembly path can route around it.
  if (/<\/?(?:point|bbox)>/i.test(prompt)) {
    warnings.push(
      "Internal: coordinate tags reached a segment prompt. They are a Seedream contract and must never go to Seedance.",
    );
  }

  return { prompt, warnings };
}
