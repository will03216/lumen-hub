/**
 * Shared time helpers for Library + Creations feed.
 *
 * Both `/library` cards and the new `/generate` Creations feed need a
 * coarse relative-time string ("25m ago") and a date bucket ("today" /
 * "yesterday" / "this week" / "older") to group entries chronologically.
 *
 * Originally lived inline in `app/library/asset-card.tsx`; hoisted here
 * so the Creations feed can reuse it without duplicating the formatter.
 *
 * Pure functions — no React, no DOM, safe to unit-test.
 */

export type DateBucket = "today" | "yesterday" | "this-week" | "older";

/** Coarse relative time. Matches the typography density of the corner
 *  badges — full date hides in the detail drawer. */
export function relativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

/** Bucket a timestamp into one of four chronological groups.
 *
 *  Day boundaries use the *local* calendar day rather than rolling 24h
 *  windows — "yesterday" is yesterday-the-date, not 24-to-48h-ago. This
 *  matches user mental model (Freepik's feed groups the same way).
 *
 *  The "this week" bucket covers everything from 2 days ago up to 7 days
 *  ago; anything older falls into "older".
 */
export function dateBucket(
  ts: number,
  now: number = Date.now(),
): DateBucket {
  const nowDate = new Date(now);
  const tsDate = new Date(ts);

  // Strip to local midnight so DST-friendly calendar-day math works.
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

  const todayStart = startOfDay(nowDate);
  const dayMs = 86_400_000;
  const daysAgo = Math.floor((todayStart - startOfDay(tsDate)) / dayMs);

  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo < 7) return "this-week";
  return "older";
}

/** Human-readable label for a bucket — used as group header text. */
export function bucketLabel(bucket: DateBucket): string {
  switch (bucket) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "this-week":
      return "This week";
    case "older":
      return "Older";
  }
}

/** Stable sort order for buckets — newest first. Used by the feed to
 *  guarantee deterministic group ordering even when a bucket is empty. */
export const BUCKET_ORDER: readonly DateBucket[] = [
  "today",
  "yesterday",
  "this-week",
  "older",
] as const;
