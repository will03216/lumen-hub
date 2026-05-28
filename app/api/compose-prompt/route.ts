import { NextRequest, NextResponse } from "next/server";
import { BytePlusError, composePrompt } from "@/lib/byteplus";
import { logBytePlusError, logRouteError } from "@/lib/server-log";

export const runtime = "nodejs";
export const maxDuration = 30;

type ComposeBody = {
  goal?: string;
  targetModel?: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  temperature?: number;
  maxTokens?: number;
  extraInstruction?: string;
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as ComposeBody;
    const targetModel = body.targetModel ?? "generic";
    if (!["seedream", "seedance", "generic"].includes(targetModel)) {
      return NextResponse.json({ error: "Invalid targetModel" }, { status: 400 });
    }
    const result = await composePrompt({
      goal: body.goal,
      targetModel: targetModel as "seedream" | "seedance" | "generic",
      text: body.text,
      imageUrl: body.imageUrl,
      videoUrl: body.videoUrl,
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      maxTokens: typeof body.maxTokens === "number" ? body.maxTokens : undefined,
      extraInstruction: body.extraInstruction,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BytePlusError) {
      logBytePlusError("compose-prompt", err, startedAt);
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("compose-prompt", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
