/**
 * POST /api/edit/enhance — tighten the instruction the user has written.
 *
 * Replaces the preset chips that used to sit above the prompt box. A preset
 * writes a sentence FOR you and throws away what you typed; this takes what
 * you actually meant and says it the way the image model responds to. The
 * difference matters in a demo: presets answer "what do I type?" only for the
 * five things someone thought of in advance.
 *
 * Runs on Seed 2.0 Pro (EDIT_MODEL), the same model as the agent.
 *
 * ── The one rule this route exists to enforce ────────────────────────────
 *
 * It rewrites the INSTRUCTION only. The compiled prompt — the `<point>` /
 * `<bbox>` tag block and the raster prose — is assembled client-side from the
 * marks, and it is byte-exact against BytePlus's own demo. A model that got to
 * touch that would eventually reword it, and an ignored tag is
 * indistinguishable from a bad edit in the response. So the model never sees
 * the compiled string and its output goes back into the same box the user
 * types in, where the compiler picks it up as ordinary text.
 */

import { NextRequest, NextResponse } from "next/server";
import { BytePlusError, EDIT_MODEL, chatText } from "@/lib/byteplus";
import { logBytePlusError, logRouteError, logRouteOutcome } from "@/lib/server-log";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Long enough for a rewrite, short enough that a runaway answer is capped. */
const MAX_TOKENS = 600;

/** BytePlus's own cap is 600 WORDS; refuse well before the compiler's warning
 *  so an enhanced prompt cannot be the thing that overflows it. */
const MAX_INPUT_CHARS = 2000;

const SYSTEM = `You rewrite instructions for Seedream, an image model that edits one part of a photo and leaves the rest alone.

Rewrite the user's instruction so the model follows it precisely. Keep it to one or two sentences.

Rules:
- Describe the DESIRED END STATE, not the problem. "The tabletop is dark walnut with the original lighting" beats "the table looks wrong".
- Keep every concrete detail the user gave — colours, materials, names, counts, positions. Never drop one, never invent one.
- Name what must not change only where a change could bleed into a neighbouring surface. Unmarked regions are preserved by default; saying so everywhere is noise.
- Do not mention regions, boxes, points, arrows, marks, coordinates or reference numbers. Those are attached separately and describing them confuses the model.
- No preamble, no explanation, no quotes, no markdown. Output the rewritten instruction and nothing else.
- If the instruction is already precise, return it unchanged.`;

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const keys = await getUserKeys();

    let body: { instruction?: string; context?: string };
    try {
      body = (await req.json()) as { instruction?: string; context?: string };
    } catch {
      return bad("Request body must be JSON.");
    }

    const instruction = (body.instruction ?? "").trim();
    if (!instruction) {
      return bad("Write something to enhance first.");
    }
    if (instruction.length > MAX_INPUT_CHARS) {
      return bad(
        `That instruction is ${instruction.length} characters; enhance works on up to ${MAX_INPUT_CHARS}.`,
      );
    }

    // Context is advisory and additive — how many marks and references exist,
    // never their coordinates. The model writes better when it knows a region
    // is already marked, and worse when it is handed numbers it might repeat.
    const context = (body.context ?? "").trim().slice(0, 400);

    const enhanced = await chatText(
      {
        system: SYSTEM,
        user: context
          ? `${instruction}\n\n[context: ${context}]`
          : instruction,
        model: EDIT_MODEL,
        maxTokens: MAX_TOKENS,
        temperature: 0.4,
      },
      keys.byteplus,
    );

    if (!enhanced) {
      // A blank answer is a failure, not a rewrite. Returning it would wipe
      // what the user wrote.
      return NextResponse.json(
        { error: "The model returned nothing. Your instruction is unchanged." },
        { status: 502 },
      );
    }

    logRouteOutcome("edit.enhance", startedAt, {
      model: EDIT_MODEL,
      in_chars: instruction.length,
      out_chars: enhanced.length,
    });

    return NextResponse.json({ instruction: stripWrapping(enhanced) });
  } catch (err) {
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;
    if (err instanceof BytePlusError) {
      logBytePlusError("edit.enhance", err, startedAt, { model: EDIT_MODEL });
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }
    logRouteError("edit.enhance", err, startedAt);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/**
 * Strip the wrapping models add despite being told not to.
 *
 * Quotes and code fences are the two that show up, and both would go upstream
 * verbatim as part of the prompt — a leading `"` is not a no-op to an image
 * model. Cheap to remove here, invisible if it never happens.
 */
function stripWrapping(text: string): string {
  let out = text.trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(out);
  if (fence) out = fence[1].trim();
  if (out.length > 1 && out.startsWith('"') && out.endsWith('"')) {
    out = out.slice(1, -1).trim();
  }
  return out;
}
