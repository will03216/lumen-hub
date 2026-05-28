"use client";

import dynamic from "next/dynamic";

/**
 * Client-only loader for the React Flow canvas.
 *
 * Next.js 16 disallows `dynamic({ ssr: false })` inside Server Components,
 * so this thin wrapper is the bridge: page.tsx stays a Server Component
 * (we keep `metadata` working), while the heavy canvas chunk is fetched
 * lazily and never SSR'd.
 *
 * React Flow brings ~250 KB gz of JS plus its own CSS — without this
 * boundary the bundle would land in every other route's shared chunk.
 */
const StudioCanvas = dynamic(() => import("./studio-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">
      Loading canvas …
    </div>
  ),
});

export default function StudioCanvasLoader({
  projectId,
}: {
  projectId: string;
}) {
  return <StudioCanvas projectId={projectId} />;
}
