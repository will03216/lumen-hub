/**
 * Scene splitter — turns a freeform story prompt into an ordered list of
 * Scenes, each with a heuristic target duration.
 *
 * Algorithm
 * ---------
 * 1. Split the prompt by double-newlines (paragraphs).
 * 2. If there's only one paragraph, split further by sentence boundaries.
 * 3. Group the resulting chunks so each scene lands in the 5–15 s window.
 *    Duration estimate: words ÷ 2.5 words-per-second, clamped to [5, 15].
 * 4. If the total of all scene durations overruns `targetDuration`, scale
 *    each proportionally (keeping the [5,15] clamp).
 *
 * This is intentionally simple — the user can edit every field after the
 * split. The goal is a useful first draft, not a perfect cut.
 */

import type { Scene } from "./stories";
import { newSceneId } from "./stories";
import {
  looksLikeScript,
  parseScript,
  renderScenePrompt,
  spokenWordCount,
  type ParsedScene,
} from "./script-format";

const MIN_DURATION = 5;
const MAX_DURATION = 15;
const WORDS_PER_SECOND = 2.5;

/**
 * One scene per authored scene, when the input is a formatted script.
 *
 * A screenplay already declares its own scene boundaries, so guessing at them
 * with paragraph and sentence heuristics throws away the structure the writer
 * supplied — and splits a single scene across several clips, which is exactly
 * what breaks shot-to-shot consistency.
 */
export function splitScriptIntoScenes(
  source: string,
  targetDuration = 60,
  audio = false,
): Scene[] {
  const parsed = parseScript(source);
  if (parsed.scenes.length === 0) return [];

  const scenes = parsed.scenes.map((scene, i) =>
    makeScene(renderScenePrompt(scene), i, estimateDuration(scene), audio),
  );
  return rebalance(scenes, targetDuration);
}

/**
 * Duration from spoken dialogue where there is any, since delivery is what
 * actually sets a shot's length. Action-only scenes fall back to their prose
 * length, which is the best signal available.
 */
function estimateDuration(scene: ParsedScene): number {
  const spoken = spokenWordCount(scene);
  const words = spoken > 0 ? spoken : wordCount(renderScenePrompt(scene));
  return clamp(Math.round(words / WORDS_PER_SECOND), MIN_DURATION, MAX_DURATION);
}

export function splitStoryIntoScenes(
  prompt: string,
  targetDuration = 60,
  audio = false,
): Scene[] {
  // A formatted script carries its own scene boundaries — honour them.
  if (looksLikeScript(prompt)) {
    const structured = splitScriptIntoScenes(prompt, targetDuration, audio);
    if (structured.length > 0) return structured;
  }

  const chunks = extractChunks(prompt.trim());
  if (chunks.length === 0) return [];

  const scenes: Scene[] = chunks.map((script, i) => {
    const words = script.trim().split(/\s+/).filter(Boolean).length;
    const duration = clamp(
      Math.round(words / WORDS_PER_SECOND),
      MIN_DURATION,
      MAX_DURATION,
    );
    return makeScene(script.trim(), i, duration, audio);
  });

  return rebalance(scenes, targetDuration);
}

// ─────────────────────────── Helpers ──────────────────────────────────────

function extractChunks(text: string): string[] {
  // Try double-newline paragraphs first.
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length >= 2) {
    // Each paragraph becomes a chunk, but if a paragraph is very long
    // (> ~37 words, i.e. > 15 s at 2.5 wps), split it by sentence too.
    return paragraphs.flatMap((p) =>
      wordCount(p) > 37 ? splitBySentence(p) : [p],
    );
  }

  // Single block — split by sentence boundary.
  const sentences = splitBySentence(text);
  if (sentences.length <= 1) return [text];

  // Group sentences into ~8-second chunks (≈20 words each).
  return groupSentences(sentences, 20);
}

function splitBySentence(text: string): string[] {
  // Split after . ! ? followed by whitespace or end-of-string.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function groupSentences(sentences: string[], targetWords: number): string[] {
  const groups: string[] = [];
  let current: string[] = [];
  let count = 0;

  for (const s of sentences) {
    const w = wordCount(s);
    if (count > 0 && count + w > targetWords) {
      groups.push(current.join(" "));
      current = [s];
      count = w;
    } else {
      current.push(s);
      count += w;
    }
  }
  if (current.length > 0) groups.push(current.join(" "));
  return groups;
}

function rebalance(scenes: Scene[], targetDuration: number): Scene[] {
  const total = scenes.reduce((sum, s) => sum + s.duration, 0);
  if (total <= targetDuration) return scenes;

  // Scale each duration proportionally, then re-clamp.
  const ratio = targetDuration / total;
  return scenes.map((s) => ({
    ...s,
    duration: clamp(Math.round(s.duration * ratio), MIN_DURATION, MAX_DURATION),
  }));
}

function makeScene(script: string, index: number, duration: number, audio = false): Scene {
  return {
    id: newSceneId(),
    index,
    duration,
    script,
    assets: {},
    audio,
    clipStatus: "idle",
    approved: false,
  };
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
