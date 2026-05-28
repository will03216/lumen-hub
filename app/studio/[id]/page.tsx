import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import StudioCanvasLoader from "../studio-canvas-loader";

export const metadata: Metadata = {
  title: "Studio · Project — Lumen Hub",
  description:
    "Node-graph workspace. Drop a Text Prompt, wire it into Image Gen and Video Gen, preview in place.",
};

export default async function StudioProjectPage({
  params,
}: {
  // Next.js 16 made route params async. Awaiting it once on the server is
  // the canonical pattern; downstream components stay synchronous.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <SiteHeader />
      {/* Same height calc as the dashboard — body in app/layout.tsx is
          `min-h-full flex flex-col` (a min-height, not a height) so we
          compute the canvas height directly: dynamic viewport height
          minus the SiteHeader's intrinsic 57px (py-3.5 + h-7 button + 1px
          border-b). */}
      <main className="h-[calc(100dvh-57px)] w-full overflow-hidden">
        <StudioCanvasLoader projectId={id} />
      </main>
    </>
  );
}
