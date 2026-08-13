/**
 * Feature flag for Smart Video Edit — PRD R16.
 *
 * Off by default. The feature has two upstream unknowns that no amount of
 * local testing settles (Seedance 2.5's model id and caps, and whether an
 * asset URL clears privacy moderation as a bookend frame), so the nav entry
 * and the route are both gated until they're answered.
 *
 * `NEXT_PUBLIC_` because the nav needs it in the browser bundle. Read through
 * a constant rather than inline `process.env` at each site so the flag can be
 * found — and removed — in one grep when it stops being needed.
 *
 * ⚠ BUILD-TIME, NOT RUNTIME. Next inlines `NEXT_PUBLIC_*` at compile time, so
 * this is baked into the bundle: set it before `next build`, and restart
 * `next dev` after changing it. Editing the env of a running server appears to
 * do nothing — verified during a local run, where removing the variable left
 * an already-compiled page still serving the enabled branch until a cold
 * start. That is Next behaving as documented, not a bug, but it is exactly the
 * kind of thing that reads as "the flag is broken".
 */
export const VIDEO_EDIT_ENABLED =
  process.env.NEXT_PUBLIC_VIDEO_EDIT === "1" ||
  process.env.NEXT_PUBLIC_VIDEO_EDIT === "true";
