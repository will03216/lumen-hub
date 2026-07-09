import { NextRequest, NextResponse } from "next/server";
import { composePrompt } from "@/lib/byteplus";
import { logRouteError } from "@/lib/server-log";
import { getUserKeys } from "@/lib/server/user-keys";
import {
  buildEnhancedPromptInstruction,
  buildEnhancedPromptPlan,
  fidelityTemperature,
  type EnhancedPromptFidelity,
} from "@/lib/studio/video-style";

export const runtime = "nodejs";
export const maxDuration = 45;
export const dynamic = "force-dynamic";

type EnhancePromptBody = {
  styleBrief?: string;
  productContext?: string;
  basePrompt?: string;
  fidelity?: string;
};

function resolveFidelity(raw?: string): EnhancedPromptFidelity {
  if (raw === "faithful" || raw === "balanced" || raw === "rewrite") return raw;
  return "faithful";
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = (await req.json()) as EnhancePromptBody;
    const styleBrief = body.styleBrief?.trim();
    const product = body.productContext?.trim();
    const basePrompt = body.basePrompt?.trim();
    const fidelity = resolveFidelity(body.fidelity);

    if (!styleBrief) {
      return NextResponse.json({ error: "styleBrief is required" }, { status: 400 });
    }
    if (!product) {
      return NextResponse.json({ error: "productContext is required" }, { status: 400 });
    }

    const { byteplus } = await getUserKeys();
    const plan = buildEnhancedPromptPlan({ styleBrief, productContext: product, basePrompt });
    const extraInstruction = buildEnhancedPromptInstruction(product, fidelity);

    const out = await composePrompt({
      targetModel: "seedance",
      goal: `Create a Seedance-ready video prompt for ${product}. Use the analyzed style brief only as motion, camera, lighting, pacing, and composition direction.`,
      text: plan,
      temperature: fidelityTemperature(fidelity),
      maxTokens: 1000,
      extraInstruction,
    }, byteplus);

    return NextResponse.json({ enhancedPrompt: out.prompt });
  } catch (err) {
    logRouteError("video.enhance-prompt", err, startedAt);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
