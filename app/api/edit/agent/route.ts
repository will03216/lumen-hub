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
  EDIT_MODEL,
  chatWithTools,
  type ChatMessage,
} from "@/lib/byteplus";
import { toOpenAIToolDefs } from "@/lib/edit/agent-tools";
import {
  logBytePlusError,
  logRouteError,
  logRouteOutcome,
} from "@/lib/server-log";
import { getUserKeys, keyErrorResponse } from "@/lib/server/user-keys";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Output ceiling for one turn.
 *
 * Raised from 4096: the tool schemas are long, and a model that narrates
 * before calling a tool can spend the whole budget on prose and get truncated
 * mid-tool-call. Upstream then returns `finish_reason: "length"` with a
 * half-formed call, the client drops the turn, and the agent looks stuck
 * having said nothing. Output tokens bill as used, so a higher ceiling costs
 * nothing on the turns that do not need it.
 */
const MAX_TOKENS = 8192;

const SYSTEM = `You drive an image editor for a designer. They describe a change in plain language; you make it happen by calling tools.

The editor sends edits to Seedream 5.0 Pro, an image model that edits a marked region and leaves everything else alone.

## How marks reach the model

Two of the marking tools are precise and two are approximate. Prefer the precise ones.

- place_point and place_box are EXACT. They become numeric coordinates in the request, so the model edits precisely that spot.
- place_arrow is approximate. It gets drawn onto the picture and described in words, which the model interprets loosely. It carries direction, and nothing else well.

A move needs BOTH. "Move this there" says which thing and where to, and only the second half is directional — so box the subject and draw the arrow from inside that box to the destination. The box states the subject exactly; the arrow then only has to carry the direction, which is the one thing a box cannot express. An arrow on its own leaves the subject identified by nothing but where its tail happened to land, so a tail that is slightly off changes what gets moved.

Never place a lone arrow when the thing at its tail could have been boxed.

Anything you do not mark is preserved. That is the default; you do not need to ask for it. Mention it in the instruction only where a change could bleed into a neighbouring surface.

## Coordinates

Every coordinate you send is in the pixel space of the image as you were shown it. inspect_session reports the dimensions in that same space. Use those numbers; do not assume a canvas size.

## Writing the instruction

set_instruction holds the sentence sent to the image model. Write it as a direct imperative describing the desired end state — "replace the tabletop with dark walnut, keep the existing lighting and shadows" — not a description of what is currently wrong. When different regions need different changes, attach a note to each mark rather than writing one long sentence covering everything.

## Where things are

You have two sources of position and they are not equally good.

- MEASURED — a box from separate_layers. It comes back named, in the coordinates you send: "cap spans x 680-950, y 940-1200". inspect_session lists them again under each layer set as \`located\`, so they stay available in later turns.
- ESTIMATED — your own reading of the picture. This is the weakest signal you have, and it is the one that has already put a mark in the wrong place.

When a measured box exists for the thing you are marking, use its numbers as they are. Do not nudge them toward what looks right: that throws away the measurement and puts back the estimate it replaced.

## Checking your work

You place marks from an estimate of where things are, and adding one tells you nothing about where it landed. preview_marks returns the image with your marks drawn on it over a labelled coordinate grid — that is the only way to find out a box is beside the cap rather than on it.

Call it after placing marks and before render.

FIX IT IN THE SAME TURN. If the preview shows a mark is wrong, call clear_annotations and place_* again immediately. Do not end your turn having described a correction without making it — a plan the user has to read and approve is not a correction, and they cannot place the mark for you.

Read the position off the grid, do not estimate it twice. The grid lines are labelled with the coordinates you send. Say which lines the object sits between — "the cap spans the lines at 680 and 950 across, 940 and 1200 down" — and use those numbers directly. An estimate that was wrong once will be wrong again if you make it the same way.

If a second attempt still misses, stop estimating — a third guess made the same way lands no better. Say the placement is not converging by eye and offer separate_layers to measure the object's actual box. It costs money and waits for approval, so offer it rather than assuming; but a measured box is the only thing that ends this loop.

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
  // FIRST STATEMENT IN THE HANDLER, before any await.
  //
  // This line previously sat after getUserKeys(), which is precisely where
  // the handler was hanging — so a stalled request produced no log at all and
  // was indistinguishable from one that never left the browser. A start log
  // is only worth anything if nothing can hang in front of it.
  console.log(
    JSON.stringify({ event: "route_enter", route: "edit.agent" }),
  );
  try {
    const keys = await getUserKeys();

    const body = (await req.json()) as AgentRequest;
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json(
        { error: "messages is required" },
        { status: 400 },
      );
    }

    // Logged BEFORE the upstream call, not only after it.
    //
    // `logRouteOutcome` below runs once the model has answered, so a turn that
    // hangs upstream produces no line at all — indistinguishable in the logs
    // from a request that never left the browser. Those two have completely
    // different causes and completely different fixes, and telling them apart
    // was costing a reproduction each time. One line at the start settles it.
    console.log(
      JSON.stringify({
        event: "route_start",
        route: "edit.agent",
        model: EDIT_MODEL,
        turn_messages: body.messages.length,
        approx_payload_kb: Math.round(
          JSON.stringify(body.messages).length / 1024,
        ),
      }),
    );

    // The system turn is prepended here, not trusted from the client — it is
    // what constrains the agent, so it must not be caller-editable.
    const result = await chatWithTools(
      {
        messages: [{ role: "system", content: SYSTEM }, ...body.messages],
        tools: toOpenAIToolDefs(),
        // Pinned, not inherited. chatWithTools defaults to PROMPT_MODEL, which
        // falls back to the LITE model and is shared with story prompts — so
        // on a stock deployment this agent was quietly running on Lite while
        // every doc and comment said Pro. Twelve tools and coordinate
        // arithmetic are not a Lite workload.
        model: EDIT_MODEL,
        maxTokens: MAX_TOKENS,
      },
      keys.byteplus,
    );

    // Logged on the way out, not only on failure: a turn that returns 200
    // with nothing usable is exactly the case that reads as "the agent is
    // stuck", and it is invisible in the logs otherwise.
    logRouteOutcome("edit.agent", startedAt, {
      model: EDIT_MODEL,
      finish_reason: result.finishReason,
      tool_calls: result.toolCalls?.length ?? 0,
      has_content: Boolean(result.content?.trim()),
      turn_messages: body.messages.length,
      usage: result.usage,
    });

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
