/**
 * Reference-tag conventions (§67).
 *
 * The §67 References picker filters the user's Library for assets that
 * play one of two roles: "Style" (visual aesthetic — film stock, palette,
 * art treatment) or "Character" (subject likeness — a face we want to
 * keep across renders). Both are submitted to BytePlus as plain entries
 * in the multi-ref `image[]` slot — the categorisation is UI-only.
 *
 * Rather than add a new column to the Asset schema, we co-opt the
 * already-existing `tags: string[]` field. Tags are namespaced with a
 * `ref:` prefix so future tag systems (user-authored hashtags, smart
 * collections) can sit alongside without collision.
 *
 * Centralising the strings here keeps the convention discoverable in
 * one place. If we ever split refs into a separate store, this file
 * is the canonical migration starting point.
 */

import type { Asset } from "./assets";

export const REF_TAG_STYLE = "ref:style";
export const REF_TAG_CHARACTER = "ref:character";
/** §68 — Style refs created via the Prompt tab carry this in addition to
 *  ref:style. They have no image; the description in `Asset.prompt` is
 *  appended to the user's prompt at render time. */
export const REF_TAG_PROMPT = "ref:prompt";

export function isStyleRef(asset: Asset): boolean {
  return asset.tags.includes(REF_TAG_STYLE);
}

export function isCharacterRef(asset: Asset): boolean {
  return asset.tags.includes(REF_TAG_CHARACTER);
}

export function isPromptStyleRef(asset: Asset): boolean {
  return asset.tags.includes(REF_TAG_PROMPT);
}
