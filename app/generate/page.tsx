import { SiteHeader } from "@/components/site-header";
import { GenerateTabs } from "./tabs";
import { hydrateFromQuery, hydratePreset } from "@/lib/reels/preset-bridge";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    preset?: string;
    // Compare → Studio handoff params (see lib/reels/preset-bridge.ts ·
    // hydrateFromQuery). All optional; presence of `prompt + model` is the
    // signal to use this path instead of `?preset=`.
    prompt?: string;
    model?: string;
    size?: string;
    ratio?: string;
    resolution?: string;
    duration?: string;
    mode?: string;
    // §65 — Creations feed "Create Video" handoff hands an image URL
    // off to the i2v starting-frame slot.
    firstFrame?: string;
  }>;
}) {
  const sp = await searchParams;

  // Hydration priority: ?preset=<id> wins (template-backed, drives the
  // breadcrumb), then raw ?prompt+model (Compare handoff, no breadcrumb),
  // then nothing (vanilla Studio at the requested ?tab).
  const hydrated = hydratePreset(sp.preset) ?? hydrateFromQuery(sp);
  // §64 — Compare Tab no longer embedded in /generate; the standalone
  // /compare route is the canonical destination. Older share links that
  // still carry `?tab=compare` coerce to "image" inside GenerateShell.
  const initialTab: "image" | "video" | "audio" = hydrated
    ? hydrated.kind === "image" || hydrated.kind === "video"
      ? hydrated.kind
      : "image"
    : sp.tab === "video"
      ? "video"
      : sp.tab === "audio"
        ? "audio"
        : "image";

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <GenerateTabs initialTab={initialTab} hydrated={hydrated} />
      </main>
    </>
  );
}
