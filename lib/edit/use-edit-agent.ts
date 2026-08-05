"use client";

/**
 * The agent loop. Runs on the CLIENT — see app/api/edit/agent/route.ts for why.
 *
 * The shape in one line: the canvas is the agent's memory. Every tool call
 * mutates the same store a human gesture mutates, so an agent-placed mark is
 * an ordinary annotation the user can drag, re-note, or delete, and there is
 * no parallel state to drift out of sync.
 *
 * ── What the model is shown ──────────────────────────────────────────────
 *
 * A CLEAN downscaled snapshot of the base image, plus the existing marks as
 * structured data via inspect_session. Deliberately not a snapshot with the
 * marks drawn on: the model would then have to distinguish our magenta
 * overlay from content that is genuinely in the picture, and it would start
 * describing its own annotations as things to edit.
 *
 * ── The rescale ──────────────────────────────────────────────────────────
 *
 * The snapshot is downscaled to the model's vision tier, so every coordinate
 * it returns is in snapshot space and has to be divided by that scale factor
 * to land in image-intrinsic space. planToolCall owns that arithmetic and
 * describeSession reports dimensions in the same space, so the model is never
 * aiming at a coordinate system nobody told it about. Getting this wrong
 * produces marks that are consistently, subtly offset — which reads as model
 * imprecision rather than a bug, and is why it lives in one tested place.
 */

import * as React from "react";
import type { ChatMessage, ChatToolCall } from "@/lib/byteplus";
import { MAX_REF_IMAGES } from "@/lib/studio/models";
import {
  describeSession,
  planToolCall,
  requiresApproval,
  type ScaleMap,
  type ToolPlan,
} from "./agent-tools";
import { buildAnnotation } from "./annotations";
import { renderComposite } from "./composite";
import { resolveSafeUrl } from "./same-origin";
import { measureImage } from "./start-session";
import {
  addRef,
  getEditSession,
  newEditId,
  removeAnnotation,
  updateEditSession,
  upsertAnnotation,
} from "./sessions";
import { buildEditRequest } from "./use-edit-render";
import { MARKER_COLOR } from "./types";

/**
 * Long-edge budget for the snapshot we show the model.
 *
 * 2576px is the high-resolution vision tier boundary of the frontier models
 * this was first prototyped against, and it remains a sensible ceiling for
 * seed-2-0-pro: past it a vision encoder downscales anyway, and we would have
 * base64'd the extra pixels through our own request for nothing. Lower it and
 * fine marks get mushy; raise it and every turn costs more for no gain.
 */
const VISION_LONG_EDGE = 2576;

/** Stop runaway loops. Each iteration is a paid model call. */
const MAX_TURNS = 12;

/**
 * How many references the model is shown.
 *
 * Each is ~4,800 input tokens on the turn it is attached. Four covers a base
 * plus a subject, a style and a sketch — the fusion cases §5C is built for —
 * without turning a ten-reference session into a 50k-token opening turn.
 */
const MAX_VISION_REFS = 4;

/** Give up on one turn rather than showing "Thinking…" indefinitely. The
 *  route allows 300s; a turn that has taken two minutes is not coming back
 *  with anything useful. */
const TURN_TIMEOUT_MS = 120_000;

/**
 * How much to shrink an image so its long edge fits the vision tier.
 *
 * Derived from the LONG EDGE, not the pixel count: a 4000x1000 image is only
 * 4 MP, so a pixel-count cap alone would happily leave its long edge at 4000
 * and blow the tier. Every coordinate the model returned would then be scaled
 * against a factor we never applied.
 */
function visionScale(w: number, h: number): number {
  return Math.min(1, VISION_LONG_EDGE / (Math.max(w, h) || 1));
}

/**
 * The sentence that goes with a fresh batch of attachments.
 *
 * Without it the model gets N pictures and no way to tell which is the base
 * and which is the style reference — it would have to guess from content, and
 * on a re-attach it would not know why it is being shown them again. Says what
 * it cannot see, too: silence about the hidden ones reads as "that is
 * everything".
 */
function describeAttachments(
  images: Array<{ index: number; role: string; label?: string }>,
  hidden: number,
  isUpdate: boolean,
): string {
  const list = images
    .map(
      (im) =>
        `image ${im.index} — ${im.role}${im.label ? ` (${im.label})` : ""}`,
    )
    .join("; ");
  const lead = isUpdate
    ? "The references changed. These are the current ones, replacing what you were shown before:"
    : "Attached:";
  const tail =
    hidden > 0
      ? ` ${hidden} further reference${hidden === 1 ? " is" : "s are"} attached to the request but not shown to you.`
      : "";
  return `${lead} ${list}. Coordinates for each are in that image's own pixel space.${tail}`;
}

/** Re-encode an image at vision scale. Clean — no markup burned in. */
async function toVisionImage(
  url: string,
  width: number,
  height: number,
): Promise<string> {
  const safe = resolveSafeUrl(url);
  const s = visionScale(width, height);
  const { dataUrl } = await renderComposite({
    url: safe.url,
    crossOrigin: safe.crossOrigin,
    width,
    height,
    annotations: [], // marks travel as data, see the docblock
    maxPixels: width * height * s * s,
    mimeType: "image/jpeg",
    quality: 0.85,
  });
  return dataUrl;
}

// ─────────────────────────── Transcript ───────────────────────────────────

/**
 * A transcript entry before it has an id.
 *
 * Kept separate from ChatEntry rather than reached for with
 * `Omit<ChatEntry, "id">`: Omit over a discriminated union collapses it to a
 * single non-union member, so every `kind`-specific field stops type-checking.
 */
export type ChatEntryInput =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | {
      kind: "tool";
      name: string;
      summary: string;
      status: "done" | "rejected" | "awaiting" | "error";
    }
  | { kind: "error"; text: string };

export type ChatEntry = ChatEntryInput & { id: string };

type PendingApproval = {
  toolUseId: string;
  name: string;
  plan: ToolPlan;
  summary: string;
};

/**
 * The result of running one tool.
 *
 * `image` exists so a tool can hand back something to LOOK at rather than
 * only something to read. It is delivered as a separate user turn after the
 * tool results, because the tool-result slot is text-only on this wire
 * format — there is nowhere in it to put a picture.
 */
type ToolOutcome = { text: string; image?: string };

/** What the route hands back for one turn. */
type AgentTurn = {
  content?: string | null;
  toolCalls?: ChatToolCall[];
  finishReason?: string | null;
  error?: string;
};

export function useEditAgent(
  sessionId: string,
  opts: {
    onRender: () => Promise<void>;
    /** Undefined when §5B is switched off — the tool then reports that
     *  honestly rather than appearing to work.
     *
     *  Returns the outcome. It used to return void, which meant the agent was
     *  told "separation finished, the layers are in the panel" even when the
     *  call 402'd or separated nothing — and it relayed that to the user. */
    onSeparateLayers?: (
      maxLayers: number,
      opts: { refId?: string; mode?: "auto" | "region" },
    ) => Promise<{ ok: boolean; message: string }>;
  },
) {
  const [entries, setEntries] = React.useState<ChatEntry[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<PendingApproval | null>(null);
  const [needsKey, setNeedsKey] = React.useState(false);

  // The wire conversation, kept separate from the display transcript: it
  // holds the assistant's tool_calls and the tool results the user never sees.
  const wireRef = React.useRef<ChatMessage[]>([]);
  // Resolver for the approval gate — the loop awaits this promise.
  const approvalRef = React.useRef<((ok: boolean) => void) | null>(null);
  /** Signature of the image set the model has actually been shown. */
  const shownRef = React.useRef<string | null>(null);
  const onRenderRef = React.useRef(opts.onRender);
  onRenderRef.current = opts.onRender;
  const onSeparateRef = React.useRef(opts.onSeparateLayers);
  onSeparateRef.current = opts.onSeparateLayers;

  const push = React.useCallback((e: ChatEntryInput) => {
    setEntries((prev) => [...prev, { ...e, id: newEditId() }]);
  }, []);

  /**
   * Downscale EVERY reference to the vision tier.
   *
   * It used to be the base image only, which meant the agent could read that a
   * style reference existed and describe its role, but never see it — it could
   * not tell you the bottle in reference 2 is the wrong shade, and any mark it
   * placed there was aimed blind.
   *
   * Each image keeps its OWN scale factor, because a 4000px base and a 600px
   * subject reference downscale by wildly different amounts and one shared
   * factor would land every mark on the second image in the wrong place.
   *
   * maxPixels is derived from the long edge rather than passed directly:
   * a 4000x1000 image is only 4 MP, so a pixel-count cap alone would leave
   * its long edge at 4000 and blow the tier.
   */
  const snapshot = React.useCallback(async () => {
    const session = getEditSession(sessionId);
    if (!session || session.refs.length === 0) return null;

    // Every attached image is ~4,800 input tokens on the turn it goes in, so
    // the set is capped. Beyond the cap the model is told what it cannot see
    // rather than being left to assume it has seen everything.
    const shown = session.refs.slice(0, MAX_VISION_REFS);
    const images = await Promise.all(
      shown.map(async (ref, i) => ({
        refId: ref.id,
        index: i + 1,
        role: ref.role,
        label: ref.label,
        dataUrl: await toVisionImage(
          ref.safeUrl ?? ref.url,
          ref.width,
          ref.height,
        ),
      })),
    );

    const scales: Record<string, number> = {};
    for (const ref of shown) {
      scales[ref.id] = visionScale(ref.width, ref.height);
    }

    return {
      images,
      scales,
      session,
      hidden: session.refs.length - shown.length,
      /** Identity of the image set, so a changed base or a new reference
       *  re-attaches instead of leaving the model looking at last week's
       *  picture. */
      signature: shown.map((r) => `${r.id}:${r.url}:${r.width}x${r.height}`).join("|"),
    };
  }, [sessionId]);

  /**
   * Same downscale, for an image whose dimensions we don't already hold —
   * a render output, which comes back as a bare URL.
   */
  const downscaleForVision = React.useCallback(async (url: string) => {
    const { width, height } = await measureImage(resolveSafeUrl(url).url);
    return toVisionImage(url, width, height);
  }, []);

  /** Apply one planned tool call. Returns the text handed back to the model. */
  const apply = React.useCallback(
    async (plan: ToolPlan, scales: ScaleMap): Promise<ToolOutcome> => {
      const session = getEditSession(sessionId);
      if (!session) return { text: "The session no longer exists." };

      switch (plan.kind) {
        case "inspect":
          return { text: JSON.stringify(describeSession(session, scales)) };

        case "preview_prompt":
          return { text: buildEditRequest(session).prompt || "(empty)" };

        case "annotation.add": {
          const ref = session.refs.find((r) => r.id === plan.refId);
          if (!ref) return { text: `No reference ${plan.refId}.` };
          const ann = buildAnnotation(plan.draft, ref.annotations, {
            id: newEditId(),
            now: Date.now(),
            color: MARKER_COLOR,
          });
          // Same cap a human hits, reported the same way — the agent must not
          // be able to route around a limit the UI enforces.
          if (!upsertAnnotation(sessionId, plan.refId, ann)) {
            return {
              text: `That reference is already at the maximum number of marks. Remove one before adding another.`,
            };
          }
          return { text: `Added ${ann.label}.` };
        }

        case "annotation.remove": {
          for (const id of plan.ids) removeAnnotation(sessionId, plan.refId, id);
          return { text: `Removed ${plan.ids.length} mark(s).` };
        }

        case "session.patch":
          updateEditSession(sessionId, plan.patch);
          return { text: "Instruction updated." };

        case "reference.add": {
          // The same ceiling the references panel enforces. It lived only in
          // the UI, so the agent could walk straight past it and build a
          // request the model rejects.
          if (session.refs.length >= MAX_REF_IMAGES) {
            return {
              text: `This session already has the maximum of ${MAX_REF_IMAGES} references. Remove one before adding another.`,
            };
          }

          // Measure BEFORE storing. Nothing measures a ref after the fact, so
          // a 0x0 ref stays 0x0 — and width/height feed sizeForEdit and every
          // coordinate normalisation, so it would silently corrupt the whole
          // request rather than fail loudly.
          let width: number;
          let height: number;
          try {
            const safe = resolveSafeUrl(plan.url);
            ({ width, height } = await measureImage(safe.url));
          } catch {
            return {
              text: `Could not load ${plan.url} to measure it, so it was not added. The URL may be unreachable or blocked.`,
            };
          }

          // Re-check after the measure: it can take seconds, and `addRef`
          // itself has no cap, so a reference added by hand in the meantime
          // would otherwise push the session one over.
          if ((getEditSession(sessionId)?.refs.length ?? 0) >= MAX_REF_IMAGES) {
            return {
              text: `This session reached the maximum of ${MAX_REF_IMAGES} references while that image was loading, so it was not added.`,
            };
          }

          const created = addRef(sessionId, {
            url: plan.url,
            width,
            height,
            role: plan.role,
          });
          return {
            text: created
              ? `Added reference ${created.id} (${width}x${height}, role ${plan.role}).`
              : "Could not add that reference.",
          };
        }

        case "restore_version": {
          const v = session.versions.find((x) => x.id === plan.versionId);
          if (!v) return { text: `No version ${plan.versionId}.` };
          updateEditSession(sessionId, { instruction: v.instruction });
          return { text: `Restored the instruction from that version.` };
        }

        case "render": {
          // Checked here as well as in the render hook so the model gets a
          // corrective it can act on, rather than a generic failure after the
          // approval chip has already been through the user.
          if (!session.instruction.trim()) {
            return {
              text: "There is no instruction set, so nothing was rendered. Call set_instruction with the edit you want, then render.",
            };
          }
          await onRenderRef.current();
          const after = getEditSession(sessionId);
          const last = after?.versions.at(-1);
          const url = last?.outputs[0]?.url;
          if (last?.status !== "done" || !url) {
            return { text: `Render failed: ${last?.error ?? "unknown error"}.` };
          }

          // Hand the RESULT back as an image, not just as a sentence.
          //
          // Without this the agent is write-only: it can act but never see
          // what it produced, so it cannot say "the cap changed but its
          // reflection didn't" or decide whether another pass is warranted.
          // That judgement is half the reason to have an agent at all.
          //
          // A failure to fetch it is not a failed render — the image exists
          // and is on screen. Degrade to the text-only answer rather than
          // telling the model something went wrong.
          try {
            const shot = await downscaleForVision(url);
            return {
              text: "Render finished. The result is attached — check it against what was asked.",
              image: shot,
            };
          } catch {
            return {
              text: "Render finished and is on screen, but I could not attach it for you to inspect.",
            };
          }
        }

        case "separate_layers": {
          const run = onSeparateRef.current;
          if (!run) {
            return {
              text: "Layer separation is switched off in this build. Tell the user rather than retrying.",
            };
          }
          // refId and mode were parsed, validated, and then thrown away here:
          // every call ran auto mode on refs[0] whatever the model asked for,
          // so region mode was unreachable through the agent.
          const outcome = await run(plan.maxLayers ?? 10, {
            refId: plan.refId,
            mode: plan.mode,
          });
          return { text: outcome.message };
        }

        case "ask_user":
          return {
            text: "Asked the user; their reply will arrive as the next message.",
          };
      }
    },
    [sessionId],
  );

  const runLoop = React.useCallback(
    async (scales: ScaleMap) => {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        let res: Response;
        try {
          res = await fetch("/api/edit/agent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: wireRef.current }),
            // A turn that never comes back leaves "Thinking…" on screen
            // forever, which is indistinguishable from a hung app. The route
            // itself allows 300s; this gives up first and says so.
            signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
          });
        } catch (e) {
          const timedOut = e instanceof DOMException && e.name === "TimeoutError";
          push({
            kind: "error",
            text: timedOut
              ? `The model did not answer within ${Math.round(TURN_TIMEOUT_MS / 1000)}s. Ask again, or make the request smaller.`
              : `Could not reach the agent: ${e instanceof Error ? e.message : String(e)}`,
          });
          return;
        }
        const data = (await res.json().catch(() => ({}))) as AgentTurn;

        if (res.status === 402) {
          setNeedsKey(true);
          push({
            kind: "error",
            text: "Add your BytePlus API key in Settings to use the agent.",
          });
          return;
        }
        if (!res.ok || data.error) {
          push({ kind: "error", text: data.error ?? `Request failed (${res.status})` });
          return;
        }

        const calls = data.toolCalls ?? [];

        // Echo the assistant turn back verbatim. The tool_calls have to be in
        // the transcript or the follow-up tool results have nothing to attach
        // to and the model rejects the next request.
        wireRef.current = [
          ...wireRef.current,
          { role: "assistant", content: data.content ?? null, tool_calls: calls },
        ];

        if (data.content?.trim()) {
          push({ kind: "assistant", text: data.content.trim() });
        }

        // A turn with no tool calls is normally just the agent answering, and
        // the assistant line above already said it. Every OTHER way of
        // arriving here used to `return` in silence, leaving the panel exactly
        // as it was — no reply, no error, nothing to act on. That is what
        // "the agent is stuck" looks like from the outside, and it is worth
        // more words than it costs.
        if (calls.length === 0 || data.finishReason !== "tool_calls") {
          if (calls.length > 0) {
            push({
              kind: "error",
              text: `The model began ${calls.length} tool call${calls.length === 1 ? "" : "s"} but its turn ended early (${data.finishReason ?? "no reason given"}), so nothing was run. Try asking for one change at a time.`,
            });
          } else if (!data.content?.trim()) {
            push({
              kind: "error",
              text:
                data.finishReason === "length"
                  ? "The model hit its output limit before saying anything. Ask for one change at a time."
                  : `The model returned nothing to act on (${data.finishReason ?? "no finish reason"}). Say what you'd like changed and I'll try again.`,
            });
          }
          return;
        }

        const session = getEditSession(sessionId);
        if (!session) {
          // Silent before. The session is read fresh each turn, so a store
          // that briefly cannot be read stopped the agent mid-conversation
          // with no explanation at all.
          push({
            kind: "error",
            text: "Lost track of this session while working. Reload the page and try again.",
          });
          return;
        }

        const results: ChatMessage[] = [];
        /** Images a tool produced for the model to look at. */
        const followUpImages: string[] = [];

        for (const call of calls) {
          const name = call.function.name;
          // Arguments arrive as a JSON *string*, so a malformed one is a
          // normal outcome to report back rather than an exception to throw.
          let input: unknown;
          try {
            input = JSON.parse(call.function.arguments || "{}");
          } catch {
            const msg = `Arguments for ${name} were not valid JSON. Send them again as a JSON object.`;
            push({ kind: "tool", name, summary: msg, status: "error" });
            results.push({ role: "tool", tool_call_id: call.id, content: msg });
            continue;
          }

          const planned = planToolCall(name, input, { session, scales });
          if (!planned.ok) {
            push({ kind: "tool", name, summary: planned.error, status: "error" });
            results.push({
              role: "tool",
              tool_call_id: call.id,
              content: planned.error,
            });
            continue;
          }

          if (requiresApproval(name)) {
            const summary = `${name} — needs your approval`;
            push({ kind: "tool", name, summary, status: "awaiting" });
            const approved = await new Promise<boolean>((resolve) => {
              approvalRef.current = resolve;
              setPending({
                toolUseId: call.id,
                name,
                plan: planned.plan,
                summary,
              });
            });
            setPending(null);
            approvalRef.current = null;

            if (!approved) {
              setEntries((prev) =>
                prev.map((e) =>
                  e.kind === "tool" && e.status === "awaiting"
                    ? { ...e, status: "rejected", summary: `${name} — declined` }
                    : e,
                ),
              );
              results.push({
                role: "tool",
                tool_call_id: call.id,
                content:
                  "The user declined to run this. Do not retry it; ask what they would like changed instead.",
              });
              continue;
            }
          }

          try {
            const outcome = await apply(planned.plan, scales);
            const text = outcome.text;
            if (outcome.image) followUpImages.push(outcome.image);
            setEntries((prev) =>
              prev.map((e) =>
                e.kind === "tool" && e.status === "awaiting"
                  ? { ...e, status: "done", summary: text }
                  : e,
              ),
            );
            if (!requiresApproval(name)) {
              push({ kind: "tool", name, summary: text, status: "done" });
            }
            results.push({ role: "tool", tool_call_id: call.id, content: text });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            push({ kind: "tool", name, summary: msg, status: "error" });
            results.push({ role: "tool", tool_call_id: call.id, content: msg });
          }
        }

        // One `role: "tool"` message per call, in call order. This is the
        // OpenAI-compatible shape BytePlus speaks: results are NOT batched
        // into a single user turn the way the Anthropic wire format wants
        // them, and every tool_call_id in the assistant turn must be answered
        // or the next request is rejected.
        wireRef.current = [...wireRef.current, ...results];

        // Anything a tool produced to LOOK at goes in as its own user turn,
        // after the results. It cannot ride inside a tool result — that slot
        // is text-only on this wire format — and it must come after them,
        // because every tool_call_id has to be answered before the next turn
        // is valid.
        if (followUpImages.length > 0) {
          wireRef.current = [
            ...wireRef.current,
            {
              role: "user",
              content: [
                ...followUpImages.map((url) => ({
                  type: "image_url" as const,
                  image_url: { url },
                })),
                {
                  type: "text" as const,
                  text: "This is the render that just completed. Compare it against what was asked and say plainly whether it worked. If something is off, say what and propose the smallest fix — do not start another render without being asked.",
                },
              ],
            },
          ];
        }
      }

      push({
        kind: "error",
        text: "Stopped after too many steps. Tell me what to do next.",
      });
    },
    [sessionId, apply, push],
  );

  const send = React.useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      push({ kind: "user", text: trimmed });

      try {
        const snap = await snapshot();
        if (!snap) {
          push({ kind: "error", text: "Add an image before asking for an edit." });
          return;
        }

        // Images go in when they are new, not on every turn: re-attaching the
        // same pixels each round trip would re-bill them on a multi-step edit.
        // But "once, ever" was wrong — swap the base image mid-conversation
        // and the model kept answering about the picture it saw first, with
        // nothing on screen to suggest it was looking at the wrong thing.
        const changed = shownRef.current !== snap.signature;
        shownRef.current = snap.signature;

        const preamble = changed
          ? describeAttachments(snap.images, snap.hidden, wireRef.current.length > 0)
          : "";

        wireRef.current = [
          ...wireRef.current,
          {
            role: "user",
            content: changed
              ? [
                  ...snap.images.map((im) => ({
                    type: "image_url" as const,
                    image_url: { url: im.dataUrl },
                  })),
                  { type: "text" as const, text: `${preamble}\n\n${trimmed}` },
                ]
              : [{ type: "text" as const, text: trimmed }],
          },
        ];

        await runLoop(snap.scales);
      } catch (e) {
        push({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      } finally {
        setBusy(false);
      }
    },
    [busy, push, runLoop, snapshot],
  );

  const resolveApproval = React.useCallback((ok: boolean) => {
    approvalRef.current?.(ok);
  }, []);

  /**
   * Start over.
   *
   * The transcript is the model's whole memory, and it grows monotonically —
   * every mark it placed, every render it judged, every correction. On a long
   * session that is both expensive and a liability: a conversation that has
   * gone somewhere unhelpful stays gone until the page is reloaded. Clearing
   * `shownRef` too means the next message re-attaches the images, so the fresh
   * conversation starts from what is on the canvas NOW.
   */
  const reset = React.useCallback(() => {
    wireRef.current = [];
    shownRef.current = null;
    approvalRef.current = null;
    setEntries([]);
    setPending(null);
    setBusy(false);
  }, []);

  return { entries, send, busy, pending, resolveApproval, reset, needsKey };
}
