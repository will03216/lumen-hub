import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VIDEO_EDIT_ENABLED } from "@/lib/video-edit/flag";
import { VideoWorkspace } from "./video-workspace";

export default async function VideoEditSessionPage({
  params,
}: {
  // Next 16: dynamic params arrive as a Promise.
  params: Promise<{ id: string }>;
}) {
  if (!VIDEO_EDIT_ENABLED) notFound();
  const { id } = await params;
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <VideoWorkspace sessionId={id} />
      </main>
    </>
  );
}
