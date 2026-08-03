/**
 * /api/image/[id] — poll an image generation job.
 *
 * Mirrors /api/video/[id]. Returns:
 *   200 { status: "running" }                      still generating
 *   200 { status: "succeeded", data: [...] , ... }  the ImageGenResponse
 *   4xx/5xx { error, ... }                          terminal failure, upstream
 *                                                   status forwarded 1:1
 *   404                                             unknown / expired / not yours
 *
 * Scoped to the calling user (see getImageJob) so one user can't poll
 * another's job.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getImageJob } from "@/lib/server/image-jobs";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  const job = getImageJob(id, userId);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  if (job.status === "running") {
    return NextResponse.json({ status: "running" });
  }
  if (job.status === "failed") {
    return NextResponse.json(job.error.body, { status: job.error.status });
  }
  // succeeded — spread the ImageGenResponse (data[], created, usage) so callers
  // read `data.data` exactly as they did off the old synchronous route.
  return NextResponse.json({ status: "succeeded", ...(job.result as object) });
}
