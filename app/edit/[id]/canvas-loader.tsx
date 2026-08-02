"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type EditCanvas from "./edit-canvas";

/**
 * Client-only loader for the Konva annotation canvas.
 *
 * Two jobs, and the second is the load-bearing one:
 *
 * 1. Next.js 16 disallows `dynamic({ ssr: false })` inside Server Components,
 *    so this thin wrapper is the bridge — page.tsx stays a Server Component
 *    and the canvas chunk is fetched lazily.
 *
 * 2. It keeps `konva` out of the server bundle entirely. Konva ships two
 *    entry points and the Node one does `require("canvas")` — a native module
 *    this project does not install. A "use client" module is still *compiled*
 *    on the server for SSR, so without this boundary the bundler can resolve
 *    that entry and the build fails on a missing native dependency.
 *
 * Consequence for everyone else: `edit-canvas.tsx` is the only file in the
 * repo permitted to import react-konva, and any Konva *type* imported outside
 * it must use `import type`, which erases at compile time. A value import of
 * a Konva type silently defeats this whole arrangement.
 */
const EditCanvasDynamic = dynamic(() => import("./edit-canvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.16em] text-ink-dim">
      Loading canvas …
    </div>
  ),
});

export default function EditCanvasLoader(
  props: ComponentProps<typeof EditCanvas>,
) {
  return <EditCanvasDynamic {...props} />;
}
