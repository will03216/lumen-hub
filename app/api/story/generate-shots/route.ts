import { NextRequest, NextResponse } from "next/server";
import { BytePlusError, generateShots } from "@/lib/byteplus";
import { logBytePlusError, logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";
export const maxDuration = 30;

type Body = {
  concept?: string;
  shotCount?: number;
  durationEach?: number;
  referenceImageCount?: number;
  hasFirstFrame?: boolean;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as Body;
    const concept = body.concept?.trim();
    if (!concept) {
      return NextResponse.json({ error: "concept is required" }, { status: 400 });
    }
    const shotCount = typeof body.shotCount === "number" ? Math.min(Math.max(body.shotCount, 1), 12) : 6;
    const durationEach = typeof body.durationEach === "number" ? body.durationEach : 10;
    const referenceImageCount = typeof body.referenceImageCount === "number" ? body.referenceImageCount : 0;
    const hasFirstFrame = body.hasFirstFrame === true;

    const result = await generateShots({ concept, shotCount, durationEach, referenceImageCount, hasFirstFrame });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BytePlusError) {
      logBytePlusError("story.generate-shots", err, startedAt);
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("story.generate-shots", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
