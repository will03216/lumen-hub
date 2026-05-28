"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Panel } from "@/components/ui/panel";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_IMAGE_SIZE,
  IMAGE_SUGGESTIONS,
  VIDEO_SUGGESTIONS,
  imageModeLabel,
  intersectVideoCaps,
  type VideoMode,
  type VideoRatio,
  type VideoResolution,
} from "@/lib/studio/models";
import { type RefImage } from "@/components/ui/reference-image-input";
import {
  type CompareKind,
  type CompareQuery,
  modelKind,
  serializeQuery,
} from "@/lib/compare/pairs";
import { useSavedPairs } from "@/lib/compare/use-saved-pairs";
import { useCompareShortcuts } from "@/lib/compare/use-compare-shortcuts";
import type { HistoryItem } from "@/lib/compare/saved-history";
import {
  ComparePanel,
  type ComparePanelParams,
  type PanelResult,
} from "./compare-panel";
import { SliderOverlay } from "./slider-overlay";
import { CompareLightbox } from "./compare-lightbox";
import { FirstVisitGuide } from "./first-visit-guide";
import { ErrorLegend } from "./error-legend";
import { PairChipRow } from "./pair-chip-row";
import { ImageControls } from "./image-controls";
import { VideoControls } from "./video-controls";
import { findImageModel, findVideoModel } from "@/lib/studio/models";
import {
  composeImagePair,
  composeVideoPair,
  downloadBlob,
} from "@/lib/compare/export";

/**
 * CompareShell — the page-level client component.
 *
 * Owns shared inputs for both kinds (image pair or video pair), keeps the URL
 * synced via router.replace. Each ComparePanel owns its own render state +
 * polling; the shell just snapshots inputs on "Render both" and bumps a tick.
 *
 * Kind is derived from `modelKind(a)` so clicking a pair chip switches the
 * entire UI (image → video or vice versa) in one step.
 *
 * Embedded mode
 * -------------
 * `/compare` mounts this as the page; `/generate?tab=compare` mounts it
 * inside Generator's tab content. The latter passes `embedded` so the
 * URL-sync effect doesn't navigate the user away from `/generate` on
 * every keystroke. Saved-pair history and shareable links survive in
 * the standalone route.
 */
export function CompareShell({
  initial,
  embedded = false,
}: {
  initial: CompareQuery;
  embedded?: boolean;
}) {
  const router = useRouter();

  // ── Core shared state ───────────────────────────────────────────────────
  const [prompt, setPrompt] = useState(initial.prompt);
  const [a, setA] = useState(initial.a);
  const [b, setB] = useState(initial.b);
  // Seed lives in form state as a string ("" = "random"), but the URL
  // and the run snapshot want a number — see the boundary conversions
  // in the URL-sync effect, the run() callbacks, and onCopyLink. The
  // string-typed input is the source of truth so a half-typed value
  // ("12") doesn't get rejected by Number()'s NaN sniffing on every keystroke.
  const [seed, setSeed] = useState<string>(
    initial.seed !== undefined ? String(initial.seed) : "",
  );

  const kind: CompareKind = useMemo(() => modelKind(a) ?? "image", [a]);

  // ── Image-specific shared state ─────────────────────────────────────────
  const [size, setSize] = useState<string>(DEFAULT_IMAGE_SIZE);
  const [refs, setRefs] = useState<RefImage[]>([]);

  // ── Video-specific shared state ─────────────────────────────────────────
  const [videoMode, setVideoMode] = useState<VideoMode>("t2v");
  const [resolution, setResolution] = useState<VideoResolution>("720p");
  const [duration, setDuration] = useState<number>(5);
  const [ratio, setRatio] = useState<VideoRatio>("16:9");
  const [cameraFixed, setCameraFixed] = useState(false);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [startFrame, setStartFrame] = useState<string | null>(null);

  // Video caps intersection — every shared video control is scoped to this.
  const videoCaps = useMemo(() => intersectVideoCaps(a, b), [a, b]);

  // When the pair changes, clamp video state to the new intersection so we
  // never submit a value one side doesn't accept.
  useEffect(() => {
    if (kind !== "video") return;
    if (!videoCaps.resolutions.includes(resolution)) {
      setResolution(videoCaps.resolutions[0] ?? "720p");
    }
    if (!videoCaps.durations.includes(duration)) {
      setDuration(videoCaps.durations[0] ?? 5);
    }
    if (!videoCaps.audio && generateAudio) setGenerateAudio(false);
  }, [videoCaps, kind, resolution, duration, generateAudio]);

  // ── Render trigger ──────────────────────────────────────────────────────
  const [renderTick, setRenderTick] = useState(0);
  const [renderedWith, setRenderedWith] = useState<ComparePanelParams | null>(
    null,
  );

  // Panel-published results — the panels call onResult on success / null on
  // reset. We aggregate both sides here to drive the Export chip.
  const [resultA, setResultA] = useState<PanelResult | null>(null);
  const [resultB, setResultB] = useState<PanelResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Video refs — panels forward these to their internal <video>. On export we
  // read each element's current frame, so the user gets whatever moment they
  // scrolled to (副歌, 转场, 表情顶点, whatever). Decoupled from result state
  // because the <video> DOM node outlives a single render/state transition.
  const videoRefA = useRef<HTMLVideoElement | null>(null);
  const videoRefB = useRef<HTMLVideoElement | null>(null);

  // Memoize the onResult callbacks so panels' effect deps stay stable —
  // otherwise every shell render would re-publish, creating a feedback loop
  // with the panel's own effect.
  const handleResultA = useCallback((r: PanelResult | null) => setResultA(r), []);
  const handleResultB = useCallback((r: PanelResult | null) => setResultB(r), []);

  // Numeric form of the form's seed-as-string. Hoisted so the URL effect,
  // onRender, and onCopyLink all read from one source — if the parsing
  // rules ever change (e.g. accept hex), they change in one place.
  // serializeQuery still gates positive-integer-only on emit, so the cast
  // here can stay loose.
  const seedNum = useMemo(
    () => (seed ? Number(seed) : undefined),
    [seed],
  );

  // 🎲 chip handler — pin a fresh positive int within the safe-integer
  // range BytePlus accepts. Centralised in the shell so a future "save
  // with this exact seed" flow has one source for what the dice rolled.
  // 2^31 - 1 keeps it well under Number.MAX_SAFE_INTEGER and matches the
  // int32 range BytePlus's seed parameter is documented to accept.
  const onRandomizeSeed = useCallback(() => {
    setSeed(String(Math.floor(Math.random() * 2147483647) + 1));
  }, []);

  // URL sync — pair + prompt + seed (when pinned); kind is implicit in `a`.
  // Dedupe on the serialized querystring so router.replace doesn't fire on
  // every keystroke when the visible URL is already what we'd write — Next
  // 15's app router is fine with redundant replaces but it's wasted work and
  // bloats the perf marks. The previous-qs ref starts undefined so the first
  // sync after mount always runs (even if the URL already matches initial).
  const lastUrlRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Embedded inside /generate?tab=compare → don't sync to URL, that
    // would clobber Generator's own route. The standalone /compare
    // page still gets shareable URLs.
    if (embedded) return;
    const qs = serializeQuery({ a, b, prompt, seed: seedNum }).toString();
    const next = qs ? `/compare?${qs}` : "/compare";
    if (lastUrlRef.current === next) return;
    lastUrlRef.current = next;
    router.replace(next, { scroll: false });
  }, [a, b, prompt, seedNum, router, embedded]);

  // Kind switch resets previous results — the snapshot shape no longer
  // matches, and the panels should show idle on the new axis.
  useEffect(() => {
    setRenderedWith(null);
    setResultA(null);
    setResultB(null);
    setExportError(null);
  }, [kind]);

  const onRender = useCallback(() => {
    if (!prompt.trim()) return;

    if (kind === "image") {
      let image: string | string[] | undefined;
      if (refs.length === 1) image = refs[0].value;
      else if (refs.length > 1) image = refs.map((r) => r.value);
      setRenderedWith({
        kind: "image",
        prompt,
        size,
        seed: seedNum,
        image,
      });
    } else {
      // Guard: i2v requires a starting frame.
      if (videoMode === "i2v" && !startFrame) return;
      setRenderedWith({
        kind: "video",
        prompt,
        mode: videoMode,
        resolution,
        duration,
        ratio,
        seed: seedNum,
        camerafixed: cameraFixed,
        audio: videoCaps.audio ? generateAudio : undefined,
        startFrame: videoMode === "i2v" ? startFrame ?? undefined : undefined,
      });
    }
    setRenderTick((n) => n + 1);
  }, [
    kind,
    prompt,
    size,
    seedNum,
    refs,
    videoMode,
    resolution,
    duration,
    ratio,
    cameraFixed,
    generateAudio,
    videoCaps.audio,
    startFrame,
  ]);

  const applyPreset = useCallback((presetA: string, presetB: string) => {
    setA(presetA);
    setB(presetB);
  }, []);

  // ── Restore-from-history ────────────────────────────────────────────────
  // The ⟲ corner on a history thumb repopulates the Compare form with that
  // frame's snapshot — prompt is shell-wide, model is per-side, and the
  // kind-specific inputs (size / ratio / resolution / duration / mode) are
  // shared across both sides. The item's model drives kind via modelKind()
  // since kind itself is derived from side A's model; restoring a video
  // item onto side A flips the whole UI to video. Seed + refs + startFrame
  // aren't carried — re-uploading refs is the point of iterating, and the
  // random-seed default is almost always what the user wants.
  const restoreFromHistory = useCallback(
    (side: "A" | "B", item: HistoryItem) => {
      setPrompt(item.prompt);
      if (side === "A") setA(item.model);
      else setB(item.model);
      if (item.kind === "image") {
        if (item.size) setSize(item.size);
      } else {
        setRatio(item.ratio as VideoRatio);
        setResolution(item.resolution);
        setDuration(item.duration);
        setVideoMode(item.mode);
      }
    },
    [],
  );
  const onRestoreA = useCallback(
    (item: HistoryItem) => restoreFromHistory("A", item),
    [restoreFromHistory],
  );
  const onRestoreB = useCallback(
    (item: HistoryItem) => restoreFromHistory("B", item),
    [restoreFromHistory],
  );

  // ── Saved pairs (localStorage-backed) ──────────────────────────────────
  const {
    savedPairs,
    save: onSaveCurrentPair,
    remove: onRemoveSavedPair,
    canSave: pairCanSave,
    alreadyPresent: pairAlreadyPresent,
  } = useSavedPairs(a, b);

  // ── Copy link ──────────────────────────────────────────────────────────
  // Builds a shareable URL from state rather than reading window.location —
  // router.replace is scheduled, so window.location may briefly lag one
  // keystroke behind what's visible in the chip's current render scope.
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCopyLink = useCallback(async () => {
    // Mirror the URL-sync effect — same source for `seedNum` so the link
    // can never disagree with what the URL bar already shows.
    const qs = serializeQuery({ a, b, prompt, seed: seedNum }).toString();
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/compare${qs ? `?${qs}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Non-secure contexts (http://) or old browsers: fall back to a
      // window.prompt so the user can still copy manually. Not pretty but
      // preserves the feature for teammates on local-LAN previews.
      if (typeof window !== "undefined") window.prompt("Copy link:", url);
      return;
    }
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1800);
  }, [a, b, prompt, seedNum]);
  // Clean up the pending timeout if the shell unmounts mid-flip.
  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );


  const canRender =
    prompt.trim().length > 0 &&
    (kind === "image" || videoMode === "t2v" || !!startFrame);

  // Export eligibility — both sides landed AND the axis-specific source is
  // ready. For video we also need both <video> elements mounted; the refs
  // attach as soon as `state.status === "success"` in the panel, which is
  // exactly when resultA/B go non-null, so the video check happens at click.
  const canExport =
    (kind === "image" &&
      resultA?.kind === "image" &&
      resultB?.kind === "image") ||
    (kind === "video" &&
      resultA?.kind === "video" &&
      resultB?.kind === "video");

  // ── Full-screen inspector (both kinds, both sides loaded) ─────────────
  // Shell-owned because the dialog needs both A and B's data — a tile
  // can't reach up for its sibling. The onInspect prop we pass to
  // panels below is `undefined` until both sides land; tiles render the
  // 🔍 chip only when the prop is defined, so the affordance
  // automatically appears / disappears with the export chip.
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const onInspect = useCallback(() => setLightboxOpen(true), []);
  const onLightboxClose = useCallback(() => setLightboxOpen(false), []);

  // ── A/B slider overlay (image kind only) ───────────────────────────────
  // Video doesn't fit this pattern — two independent timelines can't be
  // revealed through a single clip-path, and the scrub-to-compare flow
  // for video is already covered by the panel-level controls. Toggle
  // defaults on once the second side lands, because if both renders
  // finished the user almost certainly wants to compare them. We don't
  // precompute a `sliderVisible` bool because TS wouldn't carry the
  // kind-narrowing through it — the render block inlines the guard.
  const [sliderOn, setSliderOn] = useState(true);

  const onExport = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      if (
        kind === "image" &&
        resultA?.kind === "image" &&
        resultB?.kind === "image"
      ) {
        const aLabel = findImageModel(a)?.label ?? a;
        const bLabel = findImageModel(b)?.label ?? b;
        const blob = await composeImagePair({
          aUrl: resultA.url,
          bUrl: resultB.url,
          aLabel,
          bLabel,
          aSubtitle: resultA.size,
          bSubtitle: resultB.size,
          prompt,
        });
        downloadBlob(blob, `lumen-compare-${stamp}.png`);
        return;
      }

      if (
        kind === "video" &&
        resultA?.kind === "video" &&
        resultB?.kind === "video"
      ) {
        const aEl = videoRefA.current;
        const bEl = videoRefB.current;
        if (!aEl || !bEl) {
          throw new Error("Video element not mounted yet — try again.");
        }
        const aLabel = findVideoModel(a)?.label ?? a;
        const bLabel = findVideoModel(b)?.label ?? b;
        const blob = await composeVideoPair({
          aVideo: aEl,
          bVideo: bEl,
          aLabel,
          bLabel,
          // "16:9 · 00:03.500" — ratio plus the exact moment captured, so
          // the export is auditable. `formatTimestamp` is defined below.
          aSubtitle: `${resultA.ratio} · ${formatTimestamp(aEl.currentTime)}`,
          bSubtitle: `${resultB.ratio} · ${formatTimestamp(bEl.currentTime)}`,
          prompt,
        });
        downloadBlob(blob, `lumen-compare-${stamp}.png`);
        return;
      }
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }, [kind, a, b, resultA, resultB, prompt]);

  // ── Keyboard shortcuts (page-global) ───────────────────────────────────
  useCompareShortcuts({
    canRender,
    onRender,
    canSave: pairCanSave,
    alreadyPresent: pairAlreadyPresent,
    onSave: onSaveCurrentPair,
    onCopyLink,
  });

  const suggestions = kind === "image" ? IMAGE_SUGGESTIONS : VIDEO_SUGGESTIONS;
  const modeLabel =
    kind === "image"
      ? imageModeLabel(refs.length, 1)
      : videoMode === "t2v"
        ? "T2V · text-only"
        : "I2V · 1 starting frame";

  return (
    <>
      {/* Header strip — pair chips auto-switch kind. Embedded mode (used
          by /generate?tab=compare) skips the giant title + share-link
          chrome since Generator already provides that page-level chrome;
          we still expose the PairChipRow because it's the actual
          functional control for picking sides. */}
      {embedded ? (
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 pb-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
            § Compare · two engines, one prompt
          </span>
          <PairChipRow
            activeA={a}
            activeB={b}
            onPick={applyPreset}
            activeKind={kind}
            savedPairs={savedPairs}
            onSaveCurrent={onSaveCurrentPair}
            onRemoveSaved={onRemoveSavedPair}
            canSave={pairCanSave}
            alreadyPresent={pairAlreadyPresent}
          />
        </div>
      ) : (
        <div className="border-b border-border">
          <div className="mx-auto grid w-full max-w-[1440px] grid-cols-1 items-end gap-5 px-4 pb-6 pt-8 md:grid-cols-[1fr_auto_1fr] md:gap-6 md:px-7 md:pt-10">
            <div>
              <span className="plate inline-flex">§ COMPARE · SESSION 0422</span>
              <h1
                className="font-serif mt-3 text-ink"
                style={{
                  fontSize: "clamp(40px, 6vw, 80px)",
                  letterSpacing: "-0.02em",
                  lineHeight: 0.95,
                }}
              >
                Two engines, <span className="italic">one prompt.</span>
              </h1>
            </div>
            <div className="md:justify-self-center">
              <PairChipRow
                activeA={a}
                activeB={b}
                onPick={applyPreset}
                activeKind={kind}
                savedPairs={savedPairs}
                onSaveCurrent={onSaveCurrentPair}
                onRemoveSaved={onRemoveSavedPair}
                canSave={pairCanSave}
                alreadyPresent={pairAlreadyPresent}
              />
            </div>
            {/* At <md the header is stacked (one column), so we justify-start to
                align Copy link with the title rather than leaving it floating
                right against an empty edge. Shortcut hint is desktop-only — on
                a touch device there's no keyboard to shortcut with anyway. */}
            <div className="flex items-center justify-start gap-3 md:justify-end">
              <span
                className="hidden font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim md:inline"
                aria-label="Keyboard shortcuts"
              >
                ⌘↵ render · ⌘S save · ⌘⇧L copy
              </span>
              {/* Error-legend popover — a "?" reference for the eight
                  categories the classifier surfaces. Sits to the left of
                  Copy link so it reads as a help affordance, not a share
                  affordance. Self-contained; safe to drop anywhere. */}
              <ErrorLegend />
              {/* URL-backed permalink — pair + prompt + (when pinned) seed.
                  Refs and start frames stay session-local on purpose (see
                  pairs.ts comment). Always visible: sharing a link is the
                  single most-wanted affordance on mobile, where ⌘⇧L isn't
                  reachable. */}
              <Chip
                onClick={onCopyLink}
                accent={copied}
                title={
                  seedNum !== undefined
                    ? `Copy shareable link (⌘⇧L) — recipient hits seed ${seedNum}`
                    : "Copy shareable link (⌘⇧L) — recipient re-rolls (no seed pinned)"
                }
              >
                {copied ? "Link copied ✓" : "Copy link ↗"}
              </Chip>
            </div>
          </div>
        </div>
      )}

      {/* First-visit onboarding strip — self-gated on a localStorage flag,
          so returning users never see it. Skipped in embedded mode since
          Generator's host page already orients the user. */}
      {!embedded && <FirstVisitGuide />}

      {/* Body — embedded mode skips the outer max-width / padding because
          Generator's tab content already provides them; doubling would
          add visible margin. */}
      <div
        className={
          embedded
            ? ""
            : "mx-auto w-full max-w-[1440px] px-7 pb-24 pt-8"
        }
      >
        <div className="grid gap-7 lg:grid-cols-[380px_1fr]">
          {/* Shared controls — kind-branched */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
            <Panel index="01" title="Prompt">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                // ⌘↵ is handled by the page-global keydown listener above —
                // no textarea-scoped binding needed here. Shift+↵ still
                // inserts a newline; Enter alone still breaks lines.
                placeholder={
                  kind === "image"
                    ? "Describe the frame. Same words hit both engines."
                    : "Describe the motion. Same words, two engines render it."
                }
                rows={5}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <Chip key={i} onClick={() => setPrompt(s)}>
                    try #{i + 1}
                  </Chip>
                ))}
              </div>
            </Panel>

            {kind === "image" ? (
              <ImageControls
                refs={refs}
                onRefsChange={setRefs}
                size={size}
                onSizeChange={setSize}
                seed={seed}
                onSeedChange={setSeed}
                onRandomizeSeed={onRandomizeSeed}
              />
            ) : (
              <VideoControls
                videoMode={videoMode}
                onVideoModeChange={setVideoMode}
                startFrame={startFrame}
                onStartFrameChange={setStartFrame}
                resolutions={videoCaps.resolutions}
                durations={videoCaps.durations}
                audioSupported={videoCaps.audio}
                resolution={resolution}
                onResolutionChange={setResolution}
                duration={duration}
                onDurationChange={setDuration}
                ratio={ratio}
                onRatioChange={setRatio}
                seed={seed}
                onSeedChange={setSeed}
                onRandomizeSeed={onRandomizeSeed}
                cameraFixed={cameraFixed}
                onCameraFixedChange={setCameraFixed}
                generateAudio={generateAudio}
                onGenerateAudioChange={setGenerateAudio}
              />
            )}

            {/* Mode chip — derived, identical for both sides */}
            <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-bg-2 px-3 py-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
                Mode
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
                {modeLabel}
              </span>
            </div>

            <Button
              onClick={onRender}
              disabled={!canRender}
              variant="primary"
              size="lg"
              className="w-full"
            >
              Render both{" "}
              <span className="font-serif italic text-[15px] leading-none">
                ↵
              </span>
            </Button>

            {/* Export chip — appears once both sides have landed. Image kind
             *  uses the result URLs; video kind captures each <video>'s current
             *  frame via the forwarded refs. Composes a 1920px PNG either way. */}
            {canExport && (
              <Button
                onClick={onExport}
                disabled={exporting}
                variant="secondary"
                size="md"
                className="w-full"
              >
                {exporting
                  ? "Composing…"
                  : kind === "image"
                    ? "Export side-by-side ↓"
                    : "Capture frames ↓"}
              </Button>
            )}
            {kind === "video" && canExport && !exporting && (
              <p className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
                Scrub each side to the moment you want — export captures
                the current frames.
              </p>
            )}
            {/* Slider toggle — only for image kind, only once both sides
                landed. Side-by-side stays available below regardless so
                the user can still swap models, inspect history, etc. */}
            {kind === "image" && canExport && (
              <Chip
                onClick={() => setSliderOn((v) => !v)}
                accent={sliderOn}
                title="Overlay both sides with a draggable split (arrow keys nudge ±2%, Shift ±10%)"
              >
                {sliderOn ? "Hide A/B slider" : "Show A/B slider"}
              </Chip>
            )}
            {exportError && (
              <p className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-[oklch(0.78_0.18_25)]">
                Export failed · {exportError}
              </p>
            )}

            <p className="font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
              {kind === "image"
                ? "Two parallel calls against BytePlus ModelArk. URL carries prompt + pair."
                : "Two parallel Seedance tasks — each side polls independently. Typical render: 1–3 min per side at 720p/5s."}
            </p>
          </aside>

          {/* Right column — optional A/B slider hero above the two
              per-side panels. The panels stay mounted so the user can
              still swap models / inspect history / re-render while the
              slider is showing; the overlay is additive, not a mode. */}
          <div className="flex flex-col gap-4">
            {sliderOn &&
              kind === "image" &&
              resultA?.kind === "image" &&
              resultB?.kind === "image" && (
                <SliderOverlay
                  aUrl={resultA.url}
                  bUrl={resultB.url}
                  aLabel={findImageModel(a)?.label ?? a}
                  bLabel={findImageModel(b)?.label ?? b}
                  size={resultA.size}
                />
              )}
            <div className="grid gap-4 md:grid-cols-2">
              <ComparePanel
                side="A"
                modelId={a}
                onModelChange={setA}
                kind={kind}
                trigger={renderTick}
                params={renderedWith}
                onResult={handleResultA}
                videoRef={videoRefA}
                onRestore={onRestoreA}
                onInspect={canExport ? onInspect : undefined}
              />
              <ComparePanel
                side="B"
                modelId={b}
                onModelChange={setB}
                kind={kind}
                trigger={renderTick}
                params={renderedWith}
                onResult={handleResultB}
                videoRef={videoRefB}
                onRestore={onRestoreB}
                onInspect={canExport ? onInspect : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Foot strip */}
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-7 py-4 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-dim">
          <span>Two parallel renders · shared inputs · kind auto-switches</span>
          <span className="hidden md:inline">
            Phase 2 · image + video (T2V/I2V) · R2V on the roadmap
          </span>
        </div>
      </div>

      {/* Full-screen inspector. Gated on `open && canExport` rather than
          just `open` so a stale `lightboxOpen=true` (e.g. user clicks
          Reset on one side while the dialog's mid-mount) doesn't try to
          feed the dialog half a pair. Labels pull from findImageModel /
          findVideoModel so the in-dialog badges stay in sync with the
          engine picker above. */}
      {kind === "image" &&
        resultA?.kind === "image" &&
        resultB?.kind === "image" && (
          <CompareLightbox
            open={lightboxOpen}
            onClose={onLightboxClose}
            prompt={prompt}
            kind="image"
            a={{
              url: resultA.url,
              label: findImageModel(a)?.label ?? a,
              size: resultA.size,
            }}
            b={{
              url: resultB.url,
              label: findImageModel(b)?.label ?? b,
              size: resultB.size,
            }}
          />
        )}
      {kind === "video" &&
        resultA?.kind === "video" &&
        resultB?.kind === "video" && (
          <CompareLightbox
            open={lightboxOpen}
            onClose={onLightboxClose}
            prompt={prompt}
            kind="video"
            a={{
              url: resultA.url,
              label: findVideoModel(a)?.label ?? a,
              ratio: resultA.ratio,
            }}
            b={{
              url: resultB.url,
              label: findVideoModel(b)?.label ?? b,
              ratio: resultB.ratio,
            }}
          />
        )}
    </>
  );
}

/** "00:03.500" style timestamp for export subtitles. Pads minutes + seconds
 *  so outputs align in the export. */
function formatTimestamp(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  const whole = Math.floor(s);
  const frac = Math.round((s - whole) * 1000);
  return `${String(m).padStart(2, "0")}:${String(whole).padStart(2, "0")}.${String(
    frac,
  ).padStart(3, "0")}`;
}

