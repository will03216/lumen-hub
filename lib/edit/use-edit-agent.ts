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
import {
  describeSession,
  planToolCall,
  requiresApproval,
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
 * Claude's high-resolution vision tier tops out at 2576px on the long edge.
 * Beyond it the image is downscaled server-side anyway, and we would have
 * base64'd the extra pixels for nothing.
 */
const VISION_LONG_EDGE = 2576;

/** Stop runaway loops. Each iteration is a paid model call. */
const MAX_TURNS = 12;

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
  opts: { onRender: () => Promise<void> },
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
  const onRenderRef = React.useRef(opts.onRender);
  onRenderRef.current = opts.onRender;

  const push = React.useCallback((e: ChatEntryInput) => {
    setEntries((prev) => [...prev, { ...e, id: newEditId() }]);
  }, []);

  /**
   * Downscale the base image to the vision tier.
   *
   * maxPixels is derived from the long edge rather than passed directly:
   * a 4000x1000 image is only 4 MP, so a pixel-count cap alone would leave
   * its long edge at 4000 and blow the tier.
   */
  const snapshot = React.useCallback(async () => {
    const session = getEditSession(sessionId);
    const ref = session?.refs[0];
    if (!session || !ref) return null;
    const dataUrl = await toVisionImage(
      ref.safeUrl ?? ref.url,
      ref.width,
      ref.height,
    );
    return { dataUrl, scale: visionScale(ref.width, ref.height), session };
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
    async (plan: ToolPlan, scale: number): Promise<ToolOutcome> => {
      const session = getEditSession(sessionId);
      if (!session) return { text: "The session no longer exists." };

      switch (plan.kind) {
        case "inspect":
          return { text: JSON.stringify(describeSession(session, scale)) };

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
          // Measured lazily by the canvas; 0x0 would break sizing, so refuse
          // rather than store an unmeasured ref.
          const created = addRef(sessionId, {
            url: plan.url,
            width: 0,
            height: 0,
            role: plan.role,
          });
          return {
            text: created
              ? `Added reference ${created.id}. It will be measured when it loads.`
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

        case "separate_layers":
          return { text: "Layer separation isn't available yet in this build." };

        case "ask_user":
          return {
            text: "Asked the user; their reply will arrive as the next message.",
          };
      }
    },
    [sessionId],
  );

  const runLoop = React.useCallback(
    async (scale: number) => {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const res = await fetch("/api/edit/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: wireRef.current }),
        });
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

        if (calls.length === 0 || data.finishReason !== "tool_calls") return;

        const session = getEditSession(sessionId);
        if (!session) return;

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

          const planned = planToolCall(name, input, { session, scale });
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
            const outcome = await apply(planned.plan, scale);
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
        // OpenAI-compatible shape BytePlus speaks — unlike Anthropic, results
        // are NOT batched into a single user turn, and every tool_call_id in
        // the assistant turn must be answered or the next request is rejected.
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

        // The image goes in once, on the opening turn, and stays in the
        // transcript from there. Re-attaching it every turn would re-bill the
        // same pixels on each round trip of a multi-step edit.
        const first = wireRef.current.length === 0;
        wireRef.current = [
          ...wireRef.current,
          {
            role: "user",
            content: first
              ? [
                  { type: "image_url", image_url: { url: snap.dataUrl } },
                  { type: "text", text: trimmed },
                ]
              : [{ type: "text", text: trimmed }],
          },
        ];

        await runLoop(snap.scale);
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

  return { entries, send, busy, pending, resolveApproval, needsKey };
}
