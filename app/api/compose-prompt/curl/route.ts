import { NextRequest, NextResponse } from "next/server";
import { buildComposeCurl, type ComposePromptParams } from "@/lib/byteplus";

export const runtime = "nodejs";
export const maxDuration = 5;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<ComposePromptParams>;
    const targetModel = body.targetModel ?? "generic";
    if (!["seedream", "seedance", "generic"].includes(targetModel)) {
      return NextResponse.json({ error: "Invalid targetModel" }, { status: 400 });
    }
    const curl = buildComposeCurl(body as ComposePromptParams);
    return NextResponse.json({ curl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
