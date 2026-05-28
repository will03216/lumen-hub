"use client";

/**
 * VideoGenerator — sidebar-only controls for the §03 Video tab.
 *
 * Pre-redesign this component owned both controls and a right-side
 * results panel (Pending / Drafts / Saved bands). After the Freepik-
 * style rework, the right panel moved to the shared `<CreationsFeed>`.
 * This file keeps everything that drives the render request (mode,
 * model picker, frames, resolution, duration, audio toggle, Generate
 * button) and the polling lifecycle (jobs state + in-flight queue) —
 * both still needed so the button can show "Rendering 2/3…" and so a
 * tab switch doesn't drop the polling promise.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { VideoPresetState } from "@/lib/reels/preset-bridge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/ui/chip";
import { NumberInput } from "@/components/ui/number-input";
import { Panel } from "@/components/ui/panel";
import { ModeBtn } from "@/components/ui/mode-btn";
import { Toggle } from "@/components/ui/toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModelDropdown } from "@/components/ui/model-dropdown";
import { cn } from "@/lib/utils";
import { stageGeneratedVideo } from "@/lib/library/auto-save";
import {
  addInFlightVideo,
  getInFlightVideosServerSnapshot,
  listInFlightVideos,
  patchInFlightVideo,
  removeInFlightVideo,
  subscribeInFlight,
} from "@/lib/library/in-flight";

type Mode = "t2v" | "i2v" | "first_last" | "reference";
type RefRole = "subject" | "environment" | "motion";
type RefItem = { url: string; role: RefRole };

// Seedance 2.0 family — both variants share the same JSON-body schema and
// constraints (480p/720p, 4–15s, native audio). Fast trades a bit of fidelity
// for ~25% cheaper tokens and a faster queue.
const SEEDANCE_2_STANDARD = "dreamina-seedance-2-0-260128";
const SEEDANCE_2_FAST = "dreamina-seedance-2-0-fast-260128";
const SEEDANCE_2_IDS = new Set<string>([SEEDANCE_2_STANDARD, SEEDANCE_2_FAST]);

// Minimax overseas family — different upstream, fewer modes (T2V/I2V only,
// no first-last, no multi-ref), constrained resolutions, prompt-side camera
// control via [Pan left] / [Zoom in] syntax on the Director model.
const MINIMAX_HAILUO_ID = "MiniMax-Hailuo-2.3";
const MINIMAX_T2V_DIRECTOR_ID = "T2V-01-Director";
const MINIMAX_IDS = new Set<string>([MINIMAX_HAILUO_ID, MINIMAX_T2V_DIRECTOR_ID]);
const isMinimax = (id: string) => MINIMAX_IDS.has(id);

const MODELS = [
  {
    id: SEEDANCE_2_STANDARD,
    label: "Seedance 2.0",
    hint: "Native audio · 4–15s · multi-ref",
  },
  {
    id: SEEDANCE_2_FAST,
    label: "Seedance 2.0 Fast",
    hint: "~25% cheaper · faster queue",
  },
  {
    id: "seedance-1-5-pro-251215",
    label: "Seedance 1.5 Pro",
    hint: "Up to 1080p · 5/10s · stable",
  },
  {
    id: MINIMAX_HAILUO_ID,
    label: "MiniMax Hailuo 2.3",
    hint: "T2V / I2V · 6 or 10s · 1080P",
  },
  {
    id: MINIMAX_T2V_DIRECTOR_ID,
    label: "MiniMax T2V Director",
    hint: "[Pan left] [Zoom in] · 720P · 6s",
  },
] as const;

// Seedance 2.0 supports any integer 4–15. Surface a useful subset.
const DURATIONS_V2 = [4, 5, 6, 8, 10, 12, 15] as const;
const DURATIONS_V1 = [5, 10] as const;
const DURATIONS_MX_HAILUO = [6, 10] as const;
const DURATIONS_MX_T2V_DIRECTOR = [6] as const;
const RESOLUTIONS_V2 = ["480p", "720p"] as const;
const RESOLUTIONS_V1 = ["480p", "720p", "1080p"] as const;
const RESOLUTIONS_MX_HAILUO = ["768p", "1080p"] as const;
const RESOLUTIONS_MX_T2V_DIRECTOR = ["768p"] as const;

const REF_ROLES: Array<{ value: RefRole; label: string }> = [
  { value: "subject", label: "Subject" },
  { value: "environment", label: "Environment" },
  { value: "motion", label: "Motion" },
];

const MAX_REFS = 9;

type Job = {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  createdAt: number;
  prompt: string;
  model: string;
  mode: Mode;
  resolution: string;
  duration: number;
  ratio: string;
  seed: string;
  videoUrl?: string;
  error?: string;
};

const SUGGESTIONS = [
  "Motorcycle rider carving through a neon-soaked Tokyo tunnel at night, anamorphic flare, cinematic dolly",
  "Hummingbird hovering over a blooming desert cactus, ultra slow motion, macro lens, golden hour",
  "Tracking shot of a woman walking along a windswept cliff, flowing red dress, ocean mist, IMAX",
];

export function VideoGenerator({ initial }: { initial?: VideoPresetState }) {
  const [model, setModel] = useState<string>(initial?.model ?? MODELS[0].id);
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "t2v");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");

  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];
  const is20 = SEEDANCE_2_IDS.has(model);
  const isMx = isMinimax(model);
  const isMxDirector = model === MINIMAX_T2V_DIRECTOR_ID;
  // Per-family resolution / duration option lists. Minimax has its own
  // gates because its schema is narrower than either Seedance family's
  // — Director in particular locks to 720P / 6s only.
  const resolutionOptions: readonly string[] = isMx
    ? isMxDirector
      ? RESOLUTIONS_MX_T2V_DIRECTOR
      : RESOLUTIONS_MX_HAILUO
    : is20
      ? RESOLUTIONS_V2
      : RESOLUTIONS_V1;
  const durationOptions: readonly number[] = isMx
    ? isMxDirector
      ? DURATIONS_MX_T2V_DIRECTOR
      : DURATIONS_MX_HAILUO
    : is20
      ? DURATIONS_V2
      : DURATIONS_V1;
  const [resolution, setResolution] = useState<
    "480p" | "720p" | "768p" | "1080p"
  >(initial?.resolution ?? "720p");
  const [duration, setDuration] = useState<number>(initial?.duration ?? 5);
  const [ratio, setRatio] = useState<
    "16:9" | "9:16" | "1:1" | "4:3" | "3:4" | "21:9"
  >(initial?.ratio ?? "16:9");
  const [seed, setSeed] = useState<string>("");
  const [cameraFixed, setCameraFixed] = useState(initial?.cameraFixed ?? false);

  // `initial.firstFrame` ships as a same-origin URL when the user
  // arrives here via the Creations "Create Video" button. The video
  // submit path accepts either data URIs or URLs, so we drop it
  // straight in without re-encoding.
  const [firstFrame, setFirstFrame] = useState<string | null>(
    initial?.firstFrame ?? null,
  );
  const [lastFrame, setLastFrame] = useState<string | null>(null);

  // Soft navigation can deliver a *new* `initial.firstFrame` without
  // remounting this component (Creations → Create Video on a second
  // image). The state initializer only fires on first mount, so we
  // mirror future changes from props into state — and bump the mode
  // back to "i2v" since that's the user's clear intent.
  useEffect(() => {
    const next = initial?.firstFrame;
    if (next && next !== firstFrame) {
      setFirstFrame(next);
      setMode("i2v");
    }
    // `firstFrame` intentionally omitted — only outside-driven
    // changes should override what the user might have edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial?.firstFrame]);

  // 2.0-only: references + audio
  const [references, setReferences] = useState<RefItem[]>([
    { url: "", role: "subject" },
  ]);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [generateAudio, setGenerateAudio] = useState(initial?.generateAudio ?? true);

  // In-flight queue lives module-level so tab switches don't drop the
  // pending tiles (the polling itself keeps running in the background).
  const inFlightVideos = useSyncExternalStore(
    subscribeInFlight,
    listInFlightVideos,
    getInFlightVideosServerSnapshot,
  );

  // `jobs` carries active-session lifecycle (queued / running / failed /
  // cancelled). Successful renders are committed directly into Library
  // (see auto-save.ts) and removed from `jobs`. The `<CreationsFeed>`
  // on the right reads from the shared assets + in-flight stores.
  const [jobs, setJobs] = useState<Job[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pending jobs = in-flight (queued/running/submitting) merged from
  // the module store + session-only failed/cancelled jobs. Used by the
  // polling effect below to drive /api/video/<id> requests.
  const pendingJobs = useMemo<Job[]>(() => {
    const synthesised: Job[] = inFlightVideos.map((vif) => ({
      id: vif.id,
      status: vif.status === "submitting" ? "queued" : (vif.status as Job["status"]),
      createdAt: vif.startedAt,
      prompt: vif.prompt,
      model: vif.model,
      mode: vif.mode as Mode,
      resolution: vif.resolution,
      duration: vif.duration,
      ratio: vif.ratio,
      seed: vif.seed != null ? String(vif.seed) : "random",
    }));
    const seen = new Set(synthesised.map((j) => j.id));
    return [...synthesised, ...jobs.filter((j) => !seen.has(j.id))];
  }, [inFlightVideos, jobs]);

  function onModelChange(next: string) {
    setModel(next);
    const nextIs20 = SEEDANCE_2_IDS.has(next);
    const nextIsMx = isMinimax(next);
    const nextIsMxDirector = next === MINIMAX_T2V_DIRECTOR_ID;
    if (nextIsMx) {
      // Minimax: no first-last / reference modes; T2V or I2V only.
      if (mode === "reference" || mode === "first_last") setMode("t2v");
      // Hailuo accepts 6 or 10s; Director only 6s. Director also only 720P.
      const allowedDur = nextIsMxDirector
        ? DURATIONS_MX_T2V_DIRECTOR
        : DURATIONS_MX_HAILUO;
      if (!(allowedDur as readonly number[]).includes(duration)) {
        setDuration(allowedDur[0]);
      }
      const allowedRes = nextIsMxDirector
        ? RESOLUTIONS_MX_T2V_DIRECTOR
        : RESOLUTIONS_MX_HAILUO;
      if (!(allowedRes as readonly string[]).includes(resolution)) {
        setResolution(allowedRes[0] as "480p" | "720p" | "768p" | "1080p");
      }
    } else if (!nextIs20) {
      // 1.5 Pro can't do reference mode, only 5/10s, but supports 1080p.
      if (mode === "reference") setMode("t2v");
      if (!(DURATIONS_V1 as readonly number[]).includes(duration)) {
        setDuration(5);
      }
    } else {
      // 2.0 caps at 720p — drop down if the user was on 1080p.
      if (resolution === "1080p") setResolution("720p");
    }
  }

  async function onSubmit() {
    if (!prompt.trim()) return;
    if ((mode === "i2v" || mode === "first_last") && !firstFrame) {
      setError("Please upload a starting frame for this mode.");
      return;
    }
    const trimmedRefs = references
      .map((r) => ({ ...r, url: r.url.trim() }))
      .filter((r) => r.url);
    if (mode === "reference" && trimmedRefs.length === 0) {
      setError("Add at least one reference URL.");
      return;
    }
    setSubmitting(true);
    setError(null);

    // Register a tentative in-flight tile right away so the user sees
    // the panel react to their click. The temp id swaps to the real
    // BytePlus task id once submit lands.
    const tmpId = `tmp_${Date.now()}`;
    addInFlightVideo({
      id: tmpId,
      status: "submitting",
      startedAt: Date.now(),
      prompt,
      model,
      ratio,
      duration,
      resolution,
      mode,
      seed: seed ? Number(seed) : undefined,
    });

    const images: Array<{ url: string; role?: "first_frame" | "last_frame" }> =
      [];
    if (mode === "i2v" && firstFrame) {
      images.push({ url: firstFrame });
    }
    if (mode === "first_last") {
      if (firstFrame) images.push({ url: firstFrame, role: "first_frame" });
      if (lastFrame) images.push({ url: lastFrame, role: "last_frame" });
    }

    const apiReferences =
      mode === "reference"
        ? [
            ...trimmedRefs.map((r) => ({
              type: "image" as const,
              role: r.role,
              url: r.url,
            })),
            ...(generateAudio && audioUrl.trim()
              ? [
                  {
                    type: "audio" as const,
                    role: "audio" as const,
                    url: audioUrl.trim(),
                  },
                ]
              : []),
          ]
        : undefined;

    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model,
          resolution,
          duration,
          ratio,
          seed: seed ? Number(seed) : undefined,
          camerafixed: cameraFixed,
          audio: is20 ? generateAudio : undefined,
          images: images.length ? images : undefined,
          references: apiReferences,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      // Promote the temp in-flight tile to the real BytePlus task id +
      // queued status. The polling loop picks it up via the merged
      // pendingJobs list on the next render tick.
      patchInFlightVideo(tmpId, { id: data.id, status: "queued" });
      setJobs((prev) => [
        {
          id: data.id,
          status: "queued",
          createdAt: Date.now(),
          prompt,
          model,
          mode,
          resolution,
          duration,
          ratio,
          seed: seed || "random",
        },
        ...prev,
      ]);
    } catch (e) {
      // Submit failed before the task was queued — drop the tentative
      // tile so the user doesn't see a stuck "submitting" indicator.
      removeInFlightVideo(tmpId);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // Poll pending jobs — covers fresh submits AND in-flight tasks that
  // were running when the panel last unmounted (the in-flight store
  // hydrates `pendingJobs` for those).
  const pollingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const job of pendingJobs) {
      if (
        (job.status === "queued" || job.status === "running") &&
        !pollingRef.current.has(job.id)
      ) {
        pollingRef.current.add(job.id);
        // Pass the full job so the success branch can auto-save without
        // a stale-closure read of `jobs`. The job's input params don't
        // mutate after submit, so a captured snapshot is correct.
        pollJob(job);
      }
    }
    async function pollJob(job: Job) {
      const id = job.id;
      let tries = 0;
      while (tries < 200) {
        await new Promise((r) => setTimeout(r, 3000));
        tries++;
        try {
          // Forward the model so the route can dispatch on provider
          // (BytePlus vs Minimax). Absent → server falls back to
          // BytePlus, preserving pre-§62 behaviour.
          const res = await fetch(
            `/api/video/${id}?model=${encodeURIComponent(job.model)}`,
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "poll failed");
          // Patch both the local jobs list AND the module in-flight
          // store so the visual indicator stays consistent across
          // tab switches.
          if (data.status === "running" || data.status === "queued") {
            patchInFlightVideo(id, { status: data.status });
          }
          setJobs((prev) =>
            prev.map((j) =>
              j.id === id
                ? {
                    ...j,
                    status: data.status ?? j.status,
                    videoUrl: data.content?.video_url,
                    error: data.error?.message,
                  }
                : j,
            ),
          );
          if (data.status === "succeeded" && data.content?.video_url) {
            // Stage as a draft. Idempotent by task id so the poll
            // firing the success branch twice (rare but possible under
            // React strict-mode effect double-invocation) leaves a
            // single record. The user moves it into Library via the
            // Save chip; Discard drops it without ever touching cloud.
            stageGeneratedVideo({
              taskId: id,
              videoUrl: data.content.video_url,
              prompt: job.prompt,
              model: job.model,
              ratio: job.ratio,
              duration: job.duration,
              resolution: job.resolution,
              mode: job.mode,
              seed:
                job.seed && job.seed !== "random"
                  ? Number(job.seed)
                  : undefined,
            });
          }
          if (
            data.status === "succeeded" ||
            data.status === "failed" ||
            data.status === "cancelled"
          ) {
            // Terminal state — drop from in-flight + session jobs. The
            // succeeded one now lives in the Drafts store; failed and
            // cancelled disappear from the queue entirely.
            removeInFlightVideo(id);
            pollingRef.current.delete(id);
            if (data.status === "succeeded") {
              setJobs((prev) => prev.filter((j) => j.id !== id));
            }
            return;
          }
        } catch (e) {
          setJobs((prev) =>
            prev.map((j) =>
              j.id === id
                ? {
                    ...j,
                    status: "failed",
                    error: e instanceof Error ? e.message : String(e),
                  }
                : j,
            ),
          );
          removeInFlightVideo(id);
          pollingRef.current.delete(id);
          return;
        }
      }
      // Polling timeout — same cleanup so the tile doesn't stay stuck.
      removeInFlightVideo(id);
      pollingRef.current.delete(id);
    }
  }, [pendingJobs]);

  return (
    <div className="flex flex-col gap-4">
      <Panel index="01" title="Engine">
          <ModelDropdown items={MODELS} value={model} onChange={onModelChange} />
        </Panel>

        <Panel index="02" title="Mode">
          <div
            className={cn(
              "grid gap-2",
              is20 ? "grid-cols-4" : "grid-cols-3",
            )}
          >
            <ModeBtn
              active={mode === "t2v"}
              onClick={() => setMode("t2v")}
              glyph="T"
              label="Text"
              sub="to video"
            />
            <ModeBtn
              active={mode === "i2v"}
              onClick={() => setMode("i2v")}
              glyph="I"
              label="Image"
              sub="to video"
            />
            <ModeBtn
              active={mode === "first_last"}
              onClick={() => setMode("first_last")}
              glyph="F"
              label="First+Last"
              sub="keyframes"
            />
            {is20 && (
              <ModeBtn
                active={mode === "reference"}
                onClick={() => setMode("reference")}
                glyph="R"
                label="Ref"
                sub="multimodal"
              />
            )}
          </div>

          {(mode === "i2v" || mode === "first_last") && (
            <div
              className={cn(
                "mt-3 grid gap-3",
                mode === "first_last" ? "grid-cols-2" : "grid-cols-1",
              )}
            >
              <FrameSlot
                label={mode === "i2v" ? "Starting frame" : "First frame"}
                value={firstFrame}
                onChange={setFirstFrame}
              />
              {mode === "first_last" && (
                <FrameSlot
                  label="Last frame"
                  value={lastFrame}
                  onChange={setLastFrame}
                />
              )}
            </div>
          )}

          {mode === "reference" && (
            <ReferencePanel
              references={references}
              onChange={setReferences}
              audioUrl={audioUrl}
              onAudioUrlChange={setAudioUrl}
              generateAudio={generateAudio}
            />
          )}
        </Panel>

        <Panel index="03" title="Prompt">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder={
              mode === "reference"
                ? "Use @Image1 as subject, @Image2 as environment…"
                : mode === "t2v"
                  ? "Action, camera, mood, pace…"
                  : "Describe the motion you want between frames…"
            }
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s, i) => (
              <Chip key={i} onClick={() => setPrompt(s)}>
                try #{i + 1}
              </Chip>
            ))}
          </div>
        </Panel>

        <Panel index="04" title="Parameters">
          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <Label className="mb-2 block">Res</Label>
              <Select
                value={resolution}
                onValueChange={(v) => setResolution(v as typeof resolution)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {resolutionOptions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Duration</Label>
              <Select
                value={String(duration)}
                onValueChange={(v) => setDuration(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} s
                    </SelectItem>
                  ))}
                  {is20 && <SelectItem value="-1">Auto</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Ratio</Label>
              <Select
                value={ratio}
                onValueChange={(v) => setRatio(v as typeof ratio)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                  <SelectItem value="4:3">4:3</SelectItem>
                  <SelectItem value="3:4">3:4</SelectItem>
                  <SelectItem value="21:9">21:9</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-3">
            <Label className="mb-2 block">Seed</Label>
            <NumberInput
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              placeholder="random"
            />
          </div>

          <div
            className={cn(
              "mt-3 grid gap-2",
              is20 ? "grid-cols-2" : "grid-cols-1",
            )}
          >
            <Toggle
              checked={cameraFixed}
              onChange={setCameraFixed}
              label="Fixed camera"
              hint="Disable pan / push-in"
            />
            {is20 && (
              <Toggle
                checked={generateAudio}
                onChange={setGenerateAudio}
                label="Generate audio"
                hint="Native soundtrack"
              />
            )}
          </div>
        </Panel>

        <Button
          onClick={onSubmit}
          disabled={submitting || !prompt.trim()}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Submitting...
            </>
          ) : (
            <>
              Render video{" "}
              <span className="font-serif italic text-[15px] leading-none">
                ↵
              </span>
            </>
          )}
        </Button>

        {error && (
          <div className="rounded-[10px] border border-[oklch(0.7_0.2_25)]/30 bg-[oklch(0.7_0.2_25)]/5 p-3 font-mono text-[11px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
            {error}
          </div>
        )}

        <p className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
          ENGINE:{" "}
          <span className="text-ink normal-case tracking-normal">
            {selectedModel.label}
          </span>
          . {selectedModel.hint}. Renders run async — typically 1–3 min for 5s @
          720p.
        </p>
    </div>
  );
}

function FrameSlot({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }
  return (
    <div>
      <Label className="mb-2 block">{label}</Label>
      <label className="group relative flex aspect-video cursor-pointer items-center justify-center overflow-hidden rounded-[10px] border border-dashed border-[var(--line-strong)] bg-panel transition-colors hover:border-ink">
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt={label}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onChange(null);
              }}
              className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/70 text-ink hover:bg-black/85"
            >
              <X className="size-3" />
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-ink-dim">
            <span className="font-serif text-[34px] leading-none">+</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.14em]">
              Upload frame
            </span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="absolute inset-0 cursor-pointer opacity-0"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>
    </div>
  );
}

function ReferencePanel({
  references,
  onChange,
  audioUrl,
  onAudioUrlChange,
  generateAudio,
}: {
  references: RefItem[];
  onChange: (refs: RefItem[]) => void;
  audioUrl: string;
  onAudioUrlChange: (v: string) => void;
  generateAudio: boolean;
}) {
  function update(i: number, patch: Partial<RefItem>) {
    onChange(references.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function add() {
    if (references.length >= MAX_REFS) return;
    onChange([...references, { url: "", role: "subject" }]);
  }
  function remove(i: number) {
    onChange(references.filter((_, idx) => idx !== i));
  }
  return (
    <div className="mt-3 space-y-3 rounded-[10px] border border-border bg-bg-2 p-3">
      <div className="flex items-center justify-between">
        <Label>References</Label>
        <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-ink-dim">
          {references.length}/{MAX_REFS} · tag as @Image{"{n}"}
        </span>
      </div>
      <div className="grid gap-2">
        {references.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-[44px_1fr_110px_28px] items-center gap-1.5"
          >
            <span className="font-mono text-[10px] text-ink-dim">
              @Image{i + 1}
            </span>
            <input
              type="url"
              value={r.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="https://image.url/…"
              className="h-9 min-w-0 rounded-[8px] border border-border bg-panel px-2.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent transition-colors"
            />
            <Select
              value={r.role}
              onValueChange={(v) => update(i, { role: v as RefRole })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REF_ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={references.length === 1}
              className="flex size-7 items-center justify-center rounded-full border border-border text-ink-dim hover:border-ink hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        disabled={references.length >= MAX_REFS}
        className="flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-dashed border-[var(--line-strong)] bg-transparent py-2 font-mono text-[11px] uppercase tracking-[0.10em] text-ink-dim hover:text-ink hover:border-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        <Plus className="size-3.5" /> Add reference
      </button>
      {generateAudio && (
        <div>
          <Label className="mb-1.5 block">
            Audio reference (optional URL)
          </Label>
          <input
            type="url"
            value={audioUrl}
            onChange={(e) => onAudioUrlChange(e.target.value)}
            placeholder="https://audio.url/clip.mp3 — leave blank for auto"
            className="h-9 w-full rounded-[8px] border border-border bg-panel px-2.5 text-[12px] text-ink placeholder:text-ink-mute focus:outline-none focus:border-accent transition-colors"
          />
        </div>
      )}
      <p className="font-mono text-[9px] uppercase tracking-[0.10em] leading-relaxed text-ink-dim">
        BytePlus requires publicly reachable URLs · data URLs may be rejected
      </p>
    </div>
  );
}

