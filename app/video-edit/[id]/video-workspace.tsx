"use client";

/**
 * The video-edit workspace, in the shape Dreamina uses.
 *
 * Player and timeline, then a prompt bar underneath. Marking a moment opens a
 * modal; saving it drops a chip into the prompt. Then one button.
 *
 * ── What this deliberately does NOT have ─────────────────────────────────
 *
 * No agent, no variant picker, no coverage toggle, no plan preview, no
 * two-render loop. An earlier build had all of them, and each was answering a
 * question Seedance 2.5 does not pose: it takes marked reference images
 * directly, so there is no intermediate still to render, nothing to choose
 * between, and one call to make.
 *
 * The modules that answered those questions still exist under lib/video-edit —
 * the five variants, the timeline planner, the Seedream pre-render — because
 * they are the fallback if 2.5 turns out not to read drawn marks. They are
 * simply not on the path the user walks.
 */

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, PenLine, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mediaProxyUrl } from "@/lib/compare/media-proxy";
import { findVideoModel } from "@/lib/studio/models";
import {
  checkAssetImageBounds,
  uploadFrameToLibrary,
} from "@/lib/video-edit/asset-upload";
import { grabFrameAt } from "@/lib/video-edit/frame-grab";
import {
  formatChipTime,
  tokensFor,
  type PromptToken,
} from "@/lib/video-edit/marks-prompt";
import { addKeyframe, updateVideoEditSession } from "@/lib/video-edit/sessions";
import { useVideoEditSession } from "@/lib/video-edit/use-video-edit-session";
import {
  buildMarksRequestBody,
  previewMarksPrompt,
  useMarksRender,
} from "@/lib/video-edit/use-marks-render";
import type { Keyframe, VideoEditSession } from "@/lib/video-edit/types";
import { cn } from "@/lib/utils";
import { MarksModal } from "./marks-modal";
import { VideoTimeline } from "./video-timeline";
import { VersionRail } from "./version-rail";

export function VideoWorkspace({ sessionId }: { sessionId: string }) {
  const session = useVideoEditSession(sessionId);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  const [grabbing, setGrabbing] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [markingId, setMarkingId] = React.useState<string | null>(null);
  const [viewingVersionId, setViewingVersionId] = React.useState<string | null>(null);
  /** Whether Generate has been pressed. Compiler errors stay hidden until it
   *  has: an empty prompt is the state every session STARTS in, and flagging
   *  it in red before the user has typed reads as a broken page. */
  const [attempted, setAttempted] = React.useState(false);

  const marks = useMarksRender(sessionId);
  const tokens = React.useMemo(() => (session ? tokensFor(session) : []), [session]);

  /**
   * Start the source-clip upload as soon as the session opens.
   *
   * It is needed by every render and takes several seconds, so doing it lazily
   * at submit time put a visible stall in front of the one action the user
   * cares about — and, before the fix above, deadlocked the button entirely.
   * Starting here means it is almost always finished by the time anyone has
   * marked a frame and typed a sentence.
   *
   * The ref guard, not the dependency array, is what makes this run once:
   * StrictMode double-mounts effects in development, and two ingests of the
   * same clip is two uploads and two assets.
   */
  const ingestStartedRef = React.useRef(false);
  React.useEffect(() => {
    if (!session || ingestStartedRef.current) return;
    if (session.sourceVideoAssetUrl || session.sourceVideoStatus === "uploading") {
      return;
    }
    ingestStartedRef.current = true;
    void marks.ensureSourceVideo();
  }, [session, marks]);

  const setTokens = React.useCallback(
    (next: PromptToken[]) => {
      updateVideoEditSession(sessionId, { promptTokens: next });
    },
    [sessionId],
  );

  /**
   * Grab the frame at the playhead and open it for marking.
   *
   * One action, not two. "Mark this moment" is what the user wants; making
   * them grab and then separately open it would be the same two-step problem
   * in miniature.
   */
  const markHere = React.useCallback(
    async (at: number) => {
      const el = videoRef.current;
      if (!el || !session) return;
      setGrabbing(true);
      setNotice(null);
      try {
        const frame = await grabFrameAt(el, at);
        const bounds = checkAssetImageBounds(frame.width, frame.height);
        if (!bounds.ok) throw new Error(bounds.reason);

        const url = await uploadFrameToLibrary(
          frame.dataUrl,
          `frame-${frame.t.toFixed(3)}.jpg`,
        );
        const created = addKeyframe(sessionId, {
          // The decoder's timestamp, never the slider's — see the invariant in
          // lib/video-edit/types.ts.
          t: frame.t,
          sourceFrameUrl: url,
          width: frame.width,
          height: frame.height,
          instruction: "",
          role: "reference",
        });
        if (!created) {
          throw new Error("This session is at its keyframe limit. Remove one first.");
        }
        setMarkingId(created.id);
        if (frame.approximate) {
          setNotice(
            `This browser can't report exact frame timestamps, so ${frame.t.toFixed(2)}s is approximate.`,
          );
        }
      } catch (e) {
        setNotice(e instanceof Error ? e.message : String(e));
      } finally {
        setGrabbing(false);
      }
    },
    [sessionId, session],
  );

  if (!session) {
    return (
      <div className="mx-auto max-w-[1440px] px-7 py-20 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute">
          Session not found
        </p>
        <Link
          href="/video-edit"
          className="mt-3 inline-block text-[13px] text-ink-dim underline"
        >
          Back to Video Edit
        </Link>
      </div>
    );
  }

  const marking = session.keyframes.find((k) => k.id === markingId) ?? null;
  const compiled = previewMarksPrompt(session);
  const viewing = session.versions.find((v) => v.id === viewingVersionId) ?? null;
  const busy =
    marks.state.status === "submitting" || marks.state.status === "polling";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 py-5">
      <div className="mb-4 flex items-center gap-3">
        <Link href="/video-edit" className="shrink-0 text-ink-mute hover:text-ink">
          <ArrowLeft className="size-4" />
        </Link>
        <input
          value={session.name}
          onChange={(e) =>
            updateVideoEditSession(sessionId, { name: e.target.value })
          }
          className="min-w-0 flex-1 truncate border-none bg-transparent font-serif text-[20px] italic text-ink outline-none"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <section className="space-y-3">
          <div className="flex justify-center overflow-hidden rounded-[14px] border border-border bg-panel">
            <video
              ref={videoRef}
              src={mediaProxyUrl(session.source.url)}
              crossOrigin="anonymous"
              playsInline
              preload="auto"
              controls
              // Capped by the SOURCE's aspect, so a 9:16 clip does not sit in
              // a 16:9 letterbox of dead black. width:auto lets the height cap
              // drive, and the flex parent centres what is left.
              style={{ aspectRatio: `${session.source.width} / ${session.source.height}` }}
              className="block max-h-[54vh] w-auto max-w-full bg-[var(--bg)]"
            />
          </div>

          <VideoTimeline
            source={session.source}
            window={session.window}
            keyframes={session.keyframes}
            videoRef={videoRef}
            grabbing={grabbing}
            onGrab={markHere}
            onWindowChange={(w) =>
              updateVideoEditSession(sessionId, { window: w })
            }
          />

          {notice && (
            <p className="text-[12px] text-[oklch(0.78_0.16_75)]">{notice}</p>
          )}

          <PromptBar
            session={session}
            tokens={tokens}
            onTokensChange={setTokens}
            onEditMarks={setMarkingId}
            compiled={compiled}
            showErrors={attempted}
            marks={marks}
            state={marks.state}
            busy={busy}
            onRender={() => {
              setAttempted(true);
              void marks.render();
            }}
            onCancel={marks.cancel}
          />
        </section>

        <aside className="space-y-4">
          {viewing?.outputs[0]?.url ? (
            <video
              src={viewing.outputs[0].url}
              controls
              playsInline
              className="w-full rounded-[8px] border border-border"
            />
          ) : marks.state.status === "success" ? (
            <video
              src={marks.state.videoUrl}
              controls
              playsInline
              className="w-full rounded-[8px] border border-border"
            />
          ) : null}

          <VersionRail
            versions={session.versions}
            viewingId={viewingVersionId}
            onView={setViewingVersionId}
            onRestore={() => setViewingVersionId(null)}
          />
        </aside>
      </div>

      {marking && (
        <MarksModal
          sessionId={sessionId}
          keyframe={marking}
          saving={marks.state.status === "saving"}
          onSave={async () => {
            await marks.saveMarks(marking.id);
            // The chip lands at the end, where someone who just marked a frame
            // expects to carry on typing.
            setTokens([...tokens, { kind: "mark", keyframeId: marking.id }]);
            setMarkingId(null);
          }}
          onClose={() => setMarkingId(null)}
        />
      )}
    </div>
  );
}

/**
 * The prompt bar: chips and text on one line, then the controls.
 *
 * Chips are atomic tokens the user can open or delete but not type inside —
 * the same affordance as Dreamina's. A contenteditable mixing real text with
 * atomic chips would be the richer implementation and a much larger one; this
 * preserves the ordering, which is the part that carries meaning.
 */
function PromptBar({
  session,
  tokens,
  onTokensChange,
  onEditMarks,
  compiled,
  showErrors,
  state,
  busy,
  marks,
  onRender,
  onCancel,
}: {
  session: VideoEditSession;
  marks: ReturnType<typeof useMarksRender>;
  tokens: PromptToken[];
  onTokensChange: (t: PromptToken[]) => void;
  onEditMarks: (keyframeId: string) => void;
  compiled: ReturnType<typeof previewMarksPrompt>;
  showErrors: boolean;
  state: ReturnType<typeof useMarksRender>["state"];
  busy: boolean;
  onRender: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [curl, setCurl] = React.useState<string | null>(null);
  const [curlBusy, setCurlBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const caps = findVideoModel(session.model)?.caps;

  const body = React.useMemo(
    () => buildMarksRequestBody(session, compiled),
    [session, compiled],
  );

  /**
   * The curl comes from the SERVER, not from string-building here.
   *
   * `buildVideoCurl` resolves the logical model id to the endpoint id the wire
   * actually carries, and that indirection is server-side. A curl assembled in
   * the browser would name a model the API has never seen — which is exactly
   * the kind of subtly-wrong artifact someone pastes into a terminal and then
   * spends an hour debugging.
   *
   * The key is a placeholder in the returned string; it is never sent here.
   */
  const loadCurl = React.useCallback(async () => {
    setCurlBusy(true);
    try {
      const res = await fetch("/api/video/curl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        curl?: string;
        error?: string;
      };
      setCurl(data.curl ?? data.error ?? "Could not build the request.");
    } catch (e) {
      setCurl(e instanceof Error ? e.message : String(e));
    } finally {
      setCurlBusy(false);
    }
  }, [body]);
  const byId = new Map(session.keyframes.map((k) => [k.id, k]));

  /** The trailing free-text token is what the input edits; earlier text
   *  renders as plain prose so the chip ordering stays legible. */
  const tailIndex = tokens.length - 1;
  const tail = tokens[tailIndex]?.kind === "text" ? tokens[tailIndex].text : "";

  const setTail = (text: string) => {
    if (tokens[tailIndex]?.kind === "text") {
      const next = tokens.slice();
      next[tailIndex] = { kind: "text", text };
      onTokensChange(next);
    } else {
      onTokensChange([...tokens, { kind: "text", text }]);
    }
  };

  return (
    <div className="space-y-2.5 rounded-[14px] border border-border p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {tokens.map((token, i) => {
          if (token.kind === "text") {
            if (i === tailIndex) return null;
            return (
              <span key={i} className="text-[13px] text-ink">
                {token.text}
              </span>
            );
          }
          const kf = byId.get(token.keyframeId);
          return (
            <Chip
              key={`${token.keyframeId}-${i}`}
              keyframe={kf}
              onOpen={() => kf && onEditMarks(kf.id)}
              onRemove={() => onTokensChange(tokens.filter((_, idx) => idx !== i))}
            />
          );
        })}

        <input
          value={tail}
          onChange={(e) => setTail(e.target.value)}
          placeholder={
            tokens.some((t) => t.kind === "mark")
              ? "…and say what should change"
              : "Describe the change, or mark a moment on the timeline"
          }
          className="min-w-[220px] flex-1 bg-transparent py-1 text-[13px] text-ink outline-none placeholder:text-ink-mute"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Pill>{findVideoModel(session.model)?.label ?? session.model}</Pill>
        {session.sourceVideoStatus === "uploading" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] text-ink-mute">
            <Loader2 className="size-3 animate-spin" />
            preparing clip
          </span>
        )}
        {session.sourceVideoStatus === "failed" && (
          <button
            onClick={() => void marks.ensureSourceVideo()}
            title={session.sourceVideoError}
            className="rounded-full border border-[oklch(0.72_0.22_15_/_0.5)] px-3 py-1.5 text-[12px] text-[oklch(0.72_0.22_15)]"
          >
            clip upload failed — retry
          </button>
        )}
        {/* Not a control any more. The render replaces the WHOLE clip, so its
            length is a fact about the source rather than a preference — and a
            dropdown that silently truncated someone's video would be the worst
            kind of default. */}
        {/* Likewise: `duration` must be -1 for this task type. The number
            shown is the clip's own length, which is what comes back. */}
        <Pill>{compiled.duration}s · full clip</Pill>
        <Select
          value={session.resolution}
          onChange={(v) => updateVideoEditSession(session.id, { resolution: v })}
          options={(caps?.resolutions ?? ["480p", "720p", "1080p"]).map((r) => ({
            value: r,
            label: r,
          }))}
        />
        {/* Not a control. In the video-editing task the output inherits the
            input clip's shape, and sending a real ratio is rejected outright:
            "`ratio` must be `adaptive`". Offering the choice would only offer
            a way to fail. */}
        <Pill>matches source</Pill>
        <Select
          value={session.audioMode}
          onChange={(v) =>
            updateVideoEditSession(session.id, {
              audioMode: v as VideoEditSession["audioMode"],
            })
          }
          options={[
            { value: "generate", label: "Generate audio" },
            { value: "preserve", label: "Keep original" },
            { value: "silent", label: "Silent" },
          ]}
        />

        <span className="flex-1" />

        {busy ? (
          <Button size="md" variant="default" onClick={onCancel}>
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            {state.status === "polling"
              ? `${Math.round(state.elapsedMs / 1000)}s`
              : "Cancel"}
          </Button>
        ) : (
          <Button
            size="md"
            variant="primary"
            disabled={compiled.errors.length > 0}
            onClick={onRender}
            title={compiled.errors[0]}
          >
            <Sparkles className="mr-1.5 size-3.5" />
            Generate
          </Button>
        )}
      </div>

      {showErrors &&
        compiled.errors.map((e) => (
          <p key={e} className="text-[12px] text-[oklch(0.72_0.22_15)]">
            {e}
          </p>
        ))}
      {compiled.warnings.map((w) => (
        <p key={w} className="text-[12px] text-[oklch(0.78_0.16_75)]">
          {w}
        </p>
      ))}
      {state.status === "error" && (
        <p className="text-[12px] text-[oklch(0.72_0.22_15)]">{state.message}</p>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute hover:text-ink-dim"
      >
        {open ? "Hide" : "Show"} what gets sent
      </button>
      {open && (
        <div className="space-y-2">
          <Field label="Prompt">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink-dim">
              {compiled.prompt || "(nothing yet)"}
            </pre>
          </Field>

          {/* Every reference, named as the prompt names it and with the URL it
              will be fetched from — "which image is Image 2?" is otherwise
              unanswerable from the prompt alone. */}
          {compiled.references.length > 0 && (
            <Field label={`References (${compiled.references.length})`}>
              <ul className="space-y-1">
                {compiled.references.map((r) => (
                  <li key={r.url} className="flex items-start gap-2">
                    <span className="shrink-0 rounded-full border border-border px-1.5 font-mono text-[9px] uppercase text-ink-mute">
                      {r.kind}
                    </span>
                    <span className="font-mono text-[10px] text-ink-dim">
                      <span className="text-ink">{r.label}</span> — {r.url}
                    </span>
                  </li>
                ))}
              </ul>
            </Field>
          )}

          <Field label="Request body">
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-ink-mute">
              {JSON.stringify(body, null, 2)}
            </pre>
          </Field>

          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadCurl()}
              disabled={curlBusy}
              className="rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute transition-colors hover:text-ink disabled:opacity-50"
            >
              {curlBusy ? "building…" : curl ? "rebuild curl" : "show curl"}
            </button>
            {curl && (
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(curl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="rounded-full border border-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute transition-colors hover:text-ink"
              >
                {copied ? "copied" : "copy"}
              </button>
            )}
          </div>

          {curl && (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[8px] border border-border p-2 font-mono text-[10px] leading-relaxed text-ink-mute">
              {curl}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({
  keyframe,
  onOpen,
  onRemove,
}: {
  keyframe: Keyframe | undefined;
  onOpen: () => void;
  onRemove: () => void;
}) {
  if (!keyframe) {
    return (
      <span className="rounded-full border border-[oklch(0.72_0.22_15_/_0.5)] px-2 py-0.5 text-[11px] text-[oklch(0.72_0.22_15)]">
        missing frame
      </span>
    );
  }
  return (
    <span
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border border-border bg-panel py-0.5 pl-0.5 pr-1.5",
        keyframe.assetStatus === "failed" &&
          "border-[oklch(0.78_0.16_75_/_0.6)]",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- CDN host isn't
          in the image allow-list; this is a 20px chip thumbnail. */}
      <img
        src={keyframe.markedFrameUrl ?? keyframe.sourceFrameUrl}
        alt=""
        className="size-5 rounded-full object-cover"
      />
      <button
        onClick={onOpen}
        title="Edit these marks"
        className="flex items-center gap-1 text-[11px] text-ink-dim hover:text-ink"
      >
        <span className="font-mono tabular-nums">{formatChipTime(keyframe.t)}</span>
        <span>Marked keyframe</span>
        <PenLine className="size-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
      <button
        onClick={onRemove}
        title="Remove from the prompt"
        className="text-ink-mute opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
      >
        <X className="size-2.5" />
      </button>
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 rounded-[8px] border border-border p-2">
      <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">
        {label}
      </span>
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border px-3 py-1.5 text-[12px] text-ink-dim">
      {children}
    </span>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-border bg-transparent px-3 py-1.5 text-[12px] text-ink-dim outline-none focus:border-ink-dim"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
