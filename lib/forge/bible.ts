/**
 * Forge — Production Bible (per-project continuity memory).
 *
 * The Bible is the project's "world model": an append-only log of continuity
 * facts (characters, locations, props, wardrobe, palette, LUT, time-of-day)
 * plus the seed/ref used per approved shot. Each approval appends an event;
 * subsequent planning/prompting reads the *current* derived state. This is what
 * gives cross-shot continuity — the single biggest anti-drift lever after
 * frame-chaining.
 *
 * v1 stores the event log in localStorage (user-scoped), mirroring
 * lib/studio/projects.ts. A `productions`/`production_bibles` table is included
 * in the schema for the durable, multi-device path; wiring the cloud
 * write-through is a follow-up.
 */

import { userKey } from "@/lib/storage-user";

export type BibleEntityKind =
  | "character"
  | "location"
  | "prop"
  | "wardrobe"
  | "palette"
  | "lut"
  | "time_of_day"
  | "brand";

/** An append-only continuity event. */
export type BibleEvent = {
  id: string;
  at: number;
  /** Shot this fact was established/approved on (if any). */
  shotId?: string;
  kind: BibleEntityKind;
  /** Canonical handle, e.g. "avatar_maya", "loft_interior". */
  key: string;
  /** Human description of the locked attributes. */
  description: string;
  /** Locked seed used when this entity's look was approved. */
  seed?: number;
  /** Reference handles/urls anchoring this entity. */
  refs?: string[];
};

export type ProductionBible = {
  productionId: string;
  templateId: string;
  events: BibleEvent[];
};

/** Current derived state: latest event wins per (kind,key). */
export type BibleState = Record<string, BibleEvent>;

const KEY = (productionId: string) => userKey(`lumen.forge.bible.${productionId}.v1`);

function read(productionId: string): ProductionBible {
  if (typeof window === "undefined") {
    return { productionId, templateId: "", events: [] };
  }
  try {
    const raw = localStorage.getItem(KEY(productionId));
    if (!raw) return { productionId, templateId: "", events: [] };
    return JSON.parse(raw) as ProductionBible;
  } catch {
    return { productionId, templateId: "", events: [] };
  }
}

function write(bible: ProductionBible): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(bible.productionId), JSON.stringify(bible));
  } catch {
    // best-effort
  }
}

export function getBible(productionId: string): ProductionBible {
  return read(productionId);
}

/** Append a continuity event (called when a shot is approved at a gate). */
export function appendBibleEvent(
  productionId: string,
  templateId: string,
  event: Omit<BibleEvent, "id" | "at">,
): ProductionBible {
  const bible = read(productionId);
  bible.templateId = templateId || bible.templateId;
  bible.events.push({
    ...event,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    at: Date.now(),
  });
  write(bible);
  return bible;
}

/** Reduce the event log to current continuity state (latest wins per key). */
export function deriveBibleState(bible: ProductionBible): BibleState {
  const state: BibleState = {};
  for (const e of bible.events) {
    const k = `${e.kind}:${e.key}`;
    const prev = state[k];
    if (!prev || e.at >= prev.at) state[k] = e;
  }
  return state;
}

/** Render the current Bible state as a compact briefing block the Planner can
 *  read on subsequent productions/shots to maintain continuity. */
export function renderBibleForPlanner(bible: ProductionBible): string {
  const state = deriveBibleState(bible);
  const entries = Object.values(state);
  if (entries.length === 0) return "";
  const lines = entries.map(
    (e) =>
      `- [${e.kind}] ${e.key}: ${e.description}` +
      (e.seed != null ? ` (seed ${e.seed})` : "") +
      (e.refs?.length ? ` (refs: ${e.refs.join(", ")})` : ""),
  );
  return ["PRODUCTION BIBLE — keep these CONSTANT:", ...lines].join("\n");
}
