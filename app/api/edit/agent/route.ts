/**
 * POST /api/edit/agent — one turn of the editor agent. Stateless.
 *
 * Runs on seed-2-0-pro through BytePlus, the same provider as Seedream. That
 * choice is mostly about the key: BytePlus is already a REQUIRED provider in
 * this app's strict-BYOK setup, so the agent needs no new credential, no new
 * Settings field, and no second vendor for a demo product built around
 * BytePlus models. It is also far cheaper per turn than a frontier model.
 *
 * The agent loop lives on the CLIENT (lib/edit/use-edit-agent.ts). This route
 * does exactly one thing: take a conversation, call the model with the
 * editor's tool definitions, and hand the assistant turn straight back.
 *
 * That split is forced by where the data lives. An edit session is in
 * localStorage, so the server cannot read or mutate it; a server-side loop
 * would have to ship the entire canvas state up and every mutation back on
 * every turn, reimplementing the store across the wire. Keeping the loop on
 * the client means the canvas stays the single source of truth, every tool
 * call lands as a real annotation the user can drag or delete, and the
 * approval gate for paid tools sits in the same code that renders the UI.
 *
 * The tool definitions come from the server, not the request body, so a
 * caller cannot widen the agent's powers.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  BytePlusError,
  chatWithTools,
  type ChatMessage,
} from "@/lib/byteplus";
import { toOpenAIToolDefs } from "@/lib/edit/agent-tools";
import { logBytePlusError, logRouteError } from "@/lib/server-log";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TOKENS = 4096;

const SYSTEM = `You drive an image editor for a designer. They describe a change in plain language; you make it happen by calling tools.

The editor sends edits to Seedream 5.0 Pro, an image model that edits a marked region and leaves everything else alone.

## How marks reach the model

Two of the marking tools are precise and two are approximate. Prefer the precise ones.

- place_point and place_box are EXACT. They become numeric coordinates in the request, so the model edits precisely that spot.
- place_arrow is approximate. It gets drawn onto the picture and described in words, which the model interprets loosely. Use it only when the meaning is directional — "move this there", "face this way" — rather than positional.

Anything you do not mark is preserved. That is the default; you do not need to ask for it. Mention it in the instruction only where a change could bleed into a neighbouring surface.

## Coordinates

Every coordinate you send is in the pixel space of the image as you were shown it. inspect_session reports the dimensions in that same space. Use those numbers; do not assume a canvas size.

## Writing the instruction

set_instruction holds the sentence sent to the image model. Write it as a direct imperative describing the desired end state — "replace the tabletop with dark walnut, keep the existing lighting and shadows" — not a description of what is currently wrong. When different regions need different changes, attach a note to each mark rather than writing one long sentence covering everything.

## Rendering

render costs the user money and takes 15-60 seconds. It pauses for their approval, so call it when you believe the setup is right, not to explore. After a render you are shown the result and can judge it.

## How to work

Look at the image before placing anything. Call inspect_session when you need to know what is already there.

Do what was asked, at the scope asked. If something else in the image also needs attention, say so in one sentence and let them decide — do not silently widen the job.

Keep replies short: one or two sentences on what you did or found. No preamble, no restating the request, no narrating your own tool calls — the user can see them. When a render lands, lead with whether it worked.`;

type AgentRequest = {
  /** Full transcript, built by the client. Includes the canvas snapshot as an
   *  image part and any tool results from the previous turn. */
  messages?: ChatMessage[];
};

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const keys = await getUserKeys();

    const body = (await req.json()) as AgentRequest;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages is required" },
        { status: 400 },
      );
    }

    // The system turn is prepended here, not trusted from the client — it is
    // what constrains the agent, so it must not be caller-editable.
    const result = await chatWithTools(
      {
        messages: [{ role: "system", content: SYSTEM }, ...body.messages],
        tools: toOpenAIToolDefs(),
        maxTokens: MAX_TOKENS,
      },
      keys.byteplus,
    );

    return NextResponse.json({
      content: result.content,
      toolCalls: result.toolCalls,
      finishReason: result.finishReason,
      usage: result.usage,
    });
  } catch (err) {
    // Strict BYOK — a missing key is 402 so the client can point at Settings
    // rather than showing an opaque failure.
    const keyResp = keyErrorResponse(err);
    if (keyResp) return keyResp;

    if (err instanceof BytePlusError) {
      logBytePlusError("edit.agent", err, startedAt, {});
      // Forward the upstream status 1:1, same as /api/image, so the client's
      // error classifier can tell a rate limit from a bad request.
      return NextResponse.json(
        { error: err.message, code: err.statusText },
        { status: err.status },
      );
    }

    logRouteError("edit.agent", err, startedAt, {});
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
