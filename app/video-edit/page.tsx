import { Suspense } from "react";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { VIDEO_EDIT_ENABLED } from "@/lib/video-edit/flag";
import { VideoEditDashboard } from "./video-edit-dashboard";

export const metadata = {
  title: "Video Edit — Lumen Hub",
  description:
    "Pause a clip, mark up the frame, and Seedance re-renders the video with the change.",
};

export default function VideoEditPage() {
  // 404 rather than an empty page when the flag is off: a route that exists
  // and does nothing is worse than one that isn't there.
  if (!VIDEO_EDIT_ENABLED) notFound();
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        {/*
          The dashboard reads `?src=` to accept a clip handed over from
          elsewhere, and useSearchParams opts a route out of static rendering
          unless it sits behind a boundary. Without this the page cannot be
          prerendered at all — the build fails rather than degrading, which is
          how this was caught.
        */}
        <Suspense fallback={null}>
          <VideoEditDashboard />
        </Suspense>
      </main>
    </>
  );
}
