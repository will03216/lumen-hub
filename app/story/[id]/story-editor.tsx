"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/ui/panel";
import { SceneAssetPicker } from "@/components/story/scene-asset-picker";
import { StoryboardView } from "@/components/story/storyboard-view";
import { AudioControls } from "@/components/story/audio-controls";
import {
  getStory,
  updateStory,
  deleteStory,
  newSceneId,
  type Story,
  type Scene,
  type SceneAssets,
} from "@/lib/story/stories";
import { splitStoryIntoScenes } from "@/lib/story/scene-split";
import { looksLikeScript, parseScript, validateScript } from "@/lib/story/script-format";
import { useStoryGeneration } from "@/lib/story/use-story-generation";
import { DEFAULT_VIDEO_MODEL_ID } from "@/lib/studio/models";
import { cn } from "@/lib/utils";

type EditorView = "script" | "storyboard";

export function StoryEditor({ storyId }: { storyId: string }) {
  const router = useRouter();
  const [story, setStory] = React.useState<Story | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [view, setView] = React.useState<EditorView>("script");
  const [isStitching, setIsStitching] = React.useState(false);
  const [finalVideoUrl, setFinalVideoUrl] = React.useState<string | null>(null);
  const [stitchError, setStitchError] = React.useState<string | null>(null);
  const [isGeneratingPrompts, setIsGeneratingPrompts] = React.useState(false);
  const [isBreakingDown, setIsBreakingDown] = React.useState(false);
  const [promptError, setPromptError] = React.useState<string | null>(null);

  const sceneRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  const { genMap, generateScene, generateAll, cancelScene } =
    useStoryGeneration(storyId);

  React.useEffect(() => {
    const s = getStory(storyId);
    if (!s) setNotFound(true);
    else setStory(s);
  }, [storyId]);

  // Keep local state in sync when the generation hook writes back to the store.
  React.useEffect(() => {
    if (!story) return;
    const updated = getStory(storyId);
    if (updated) setStory(updated);
    // Re-run when genMap changes (i.e. after each poll write-back).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genMap]);

  // ── Persistence helpers ────────────────────────────────────────────────

  function save(patch: Partial<Omit<Story, "id" | "createdAt">>) {
    if (!story) return;
    const next = updateStory(story.id, patch);
    if (next) setStory(next);
  }

  function handleSceneChange(sceneId: string, patch: Partial<Scene>) {
    if (!story) return;
    save({ scenes: story.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) });
  }

  function handleApprove(sceneId: string, approved: boolean) {
    handleSceneChange(sceneId, { approved });
  }

  function handleAddScene() {
    if (!story) return;
    const newScene: Scene = {
      id: newSceneId(),
      index: story.scenes.length,
      duration: 8,
      script: "",
      assets: {},
      audio: story.globalAudio,
      clipStatus: "idle",
      approved: false,
    };
    save({ scenes: [...story.scenes, newScene].map((s, i) => ({ ...s, index: i })) });
  }

  function handleRemoveScene(sceneId: string) {
    if (!story) return;
    save({
      scenes: story.scenes
        .filter((s) => s.id !== sceneId)
        .map((s, i) => ({ ...s, index: i })),
    });
  }

  function handleMoveScene(sceneId: string, dir: "up" | "down") {
    if (!story) return;
    const arr = [...story.scenes];
    const idx = arr.findIndex((s) => s.id === sceneId);
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= arr.length) return;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    save({ scenes: arr.map((s, i) => ({ ...s, index: i })) });
  }

  const scriptDetected = React.useMemo(
    () => (story ? looksLikeScript(story.prompt) : false),
    [story],
  );

  function handleBreakIntoScenes() {
    if (!story) return;
    save({ scenes: splitStoryIntoScenes(story.prompt, story.targetDuration, story.globalAudio) });
  }

  function handleSelectScene(sceneId: string) {
    setView("script");
    setTimeout(() => {
      sceneRefs.current[sceneId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);
  }

  function handleDelete() {
    if (!story) return;
    deleteStory(story.id);
    router.push("/story");
  }

  // ── Generation ─────────────────────────────────────────────────────────

  function handleGenerate(scene: Scene) {
    void generateScene(scene, DEFAULT_VIDEO_MODEL_ID);
  }

  function handleGenerateAll() {
    if (!story) return;
    void generateAll(story.scenes, DEFAULT_VIDEO_MODEL_ID);
  }

  // ── AI breakdown (one click: cut + write) ──────────────────────────────

  /**
   * Hand the whole story to the Seed model and take back a finished shot list.
   *
   * The local splitter cuts on paragraphs, which says nothing about where a
   * beat ends, and then a second call writes prompts for fragments it had no
   * part in choosing. One call that decides the cut AND writes the prompt
   * gives the model the context to do both coherently — and gives the user one
   * button instead of two.
   */
  async function handleAiBreakdown() {
    if (!story || story.prompt.trim().length < 10) return;
    setIsBreakingDown(true);
    setPromptError(null);
    try {
      const res = await fetch(`/api/story/${storyId}/breakdown`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story: story.prompt,
          targetDuration: story.targetDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);

      const returned = data.scenes as Array<{
        index: number;
        duration: number;
        prompt: string;
        heading?: string;
      }>;
      if (!returned?.length) throw new Error("The model returned no scenes.");

      // Reuse the existing scene rows where possible so per-scene assets,
      // approvals and generated clips survive a re-run. Only the first N
      // survive; extra scenes beyond the new count are dropped.
      const previous = story.scenes;
      save({
        scenes: returned.map((s, i) => {
          const kept = previous[i];
          return kept
            ? { ...kept, index: i, script: s.prompt, duration: s.duration }
            : {
                id: newSceneId(),
                index: i,
                duration: s.duration,
                script: s.prompt,
                assets: {},
                audio: story.globalAudio,
                clipStatus: "idle" as const,
                approved: false,
              };
        }),
      });
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsBreakingDown(false);
    }
  }

  // ── Prompt generation ──────────────────────────────────────────────────

  async function handleGeneratePrompts() {
    if (!story || story.scenes.length === 0) return;
    setIsGeneratingPrompts(true);
    setPromptError(null);
    try {
      const res = await fetch(`/api/story/${storyId}/generate-prompts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          story: story.prompt,
          scenes: story.scenes.map((s) => ({
            index: s.index,
            script: s.script,
            duration: s.duration,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      const generated = data.scenes as Array<{ index: number; prompt: string }>;
      // Merge generated prompts back — only overwrite scenes the model returned.
      const lookup = Object.fromEntries(generated.map((g) => [g.index, g.prompt]));
      save({
        scenes: story.scenes.map((s) =>
          lookup[s.index] !== undefined ? { ...s, script: lookup[s.index] } : s,
        ),
      });
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsGeneratingPrompts(false);
    }
  }

  // ── Stitching ──────────────────────────────────────────────────────────

  async function handleStitch() {
    if (!story) return;
    const approved = story.scenes.filter((s) => s.approved && s.clipUrl);
    if (approved.length === 0) return;

    setIsStitching(true);
    setStitchError(null);
    try {
      const res = await fetch(`/api/story/${storyId}/stitch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clips: approved.map((s) => s.clipUrl!),
          backgroundAudioUrl: story.backgroundAudioUrl ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Stitch failed (${res.status})`);
      setFinalVideoUrl(data.url as string);
    } catch (e) {
      setStitchError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsStitching(false);
    }
  }

  // ── Guard states ───────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-32 text-center">
        <p className="font-mono text-[12px] uppercase tracking-[0.16em] text-ink-mute">Story not found</p>
        <Link href="/story" className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim hover:text-ink transition-colors">
          ← Back to stories
        </Link>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex items-center justify-center py-32">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-mute animate-pulse">Loading…</span>
      </div>
    );
  }

  const totalDuration = story.scenes.reduce((sum, s) => sum + s.duration, 0);
  const approvedCount = story.scenes.filter((s) => s.approved).length;
  const approvedDuration = story.scenes.filter((s) => s.approved).reduce((sum, s) => sum + s.duration, 0);
  const doneCount = story.scenes.filter((s) => s.clipStatus === "done").length;

  return (
    <div className="mx-auto w-full max-w-[1440px] px-7 pb-20">
      {/* Breadcrumb + name + view toggle */}
      <div className="flex items-center gap-3 border-b border-border py-3">
        <Link href="/story" className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute hover:text-ink-dim transition-colors shrink-0">
          ← Stories
        </Link>
        <span className="font-mono text-[10px] text-ink-mute">/</span>
        <input
          value={story.name}
          onChange={(e) => save({ name: e.target.value })}
          className="min-w-0 flex-1 bg-transparent font-serif italic text-[15px] text-ink focus:outline-none placeholder:text-ink-mute"
          placeholder="Story name…"
        />

        {/* View toggle */}
        <div className="flex items-center rounded-full border border-border p-0.5 shrink-0">
          {(["script", "storyboard"] as EditorView[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                view === v ? "bg-ink text-[var(--bg)]" : "text-ink-dim hover:text-ink",
              )}
            >
              {v}
            </button>
          ))}
        </div>

        <button onClick={handleDelete} className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute hover:text-[oklch(0.72_0.22_15)] transition-colors">
          Delete
        </button>
      </div>

      {/* ── STORYBOARD VIEW ── */}
      {view === "storyboard" && (
        <div className="mt-8 flex flex-col gap-4">
          {stitchError && (
            <div className="rounded-[10px] border border-[oklch(0.72_0.22_15)]/30 bg-[oklch(0.72_0.22_15)]/5 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
              Stitch error: {stitchError}
            </div>
          )}
          <StoryboardView
            scenes={story.scenes}
            genMap={genMap}
            model={DEFAULT_VIDEO_MODEL_ID}
            isStitching={isStitching}
            finalVideoUrl={finalVideoUrl}
            onGenerate={handleGenerate}
            onCancelGenerate={cancelScene}
            onApprove={handleApprove}
            onSelectScene={handleSelectScene}
            onStitch={handleStitch}
            onGenerateAll={handleGenerateAll}
          />
        </div>
      )}

      {/* ── SCRIPT VIEW ── */}
      {view === "script" && (
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          {/* Left */}
          <div className="flex flex-col gap-6">
            <Panel index="01" title="Story">
              <div className="flex flex-col gap-3">
                <Textarea
                  value={story.prompt}
                  onChange={(e) => save({ prompt: e.target.value })}
                  placeholder="Write your story or script here. Each paragraph will become a scene — or write one block and let the splitter group it into beats."
                  className="min-h-[200px]"
                />
                {promptError && (
                  <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">
                    Prompt error: {promptError}
                  </p>
                )}
                <ScriptFormatReport source={story.prompt} />
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-ink-mute mr-auto">
                    {story.prompt.trim().split(/\s+/).filter(Boolean).length} words
                    {scriptDetected && " · screenplay detected"}
                  </span>
                  {/* Secondary: the offline splitter. Instant and free, but it
                      cuts on paragraphs — keep it for when you want manual
                      control or have no API key. */}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleBreakIntoScenes}
                    disabled={isBreakingDown || story.prompt.trim().length < 10}
                    title="Split locally on paragraph and sentence boundaries — no AI, no cost"
                  >
                    Quick split
                  </Button>
                  {story.scenes.length > 0 && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleGeneratePrompts}
                      disabled={isGeneratingPrompts || isBreakingDown || story.prompt.trim().length < 10}
                      title="Rewrite the existing scenes' prompts without re-cutting them"
                    >
                      {isGeneratingPrompts ? "Generating…" : "✦ Rewrite prompts"}
                    </Button>
                  )}
                  {/* Primary: one click — the model decides the cut and writes
                      every prompt in a single pass. */}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleAiBreakdown}
                    disabled={isBreakingDown || isGeneratingPrompts || story.prompt.trim().length < 10}
                    title="The Seed model chooses the shots, their lengths, and writes each Seedance prompt"
                  >
                    {isBreakingDown ? "Breaking down…" : "✦ Break down with AI →"}
                  </Button>
                </div>
              </div>
            </Panel>

            {story.scenes.length > 0 && (
              <Panel index="02" title="Scenes">
                <div className="flex flex-col gap-3">
                  {story.scenes.map((scene, i) => (
                    <SceneCard
                      key={scene.id}
                      scene={scene}
                      isFirst={i === 0}
                      isLast={i === story.scenes.length - 1}
                      genStatus={genMap[scene.id]?.status ?? "idle"}
                      cardRef={(el) => { sceneRefs.current[scene.id] = el; }}
                      onChange={(patch) => handleSceneChange(scene.id, patch)}
                      onAssetChange={(assets) => handleSceneChange(scene.id, { assets })}
                      onRemove={() => handleRemoveScene(scene.id)}
                      onMove={(dir) => handleMoveScene(scene.id, dir)}
                      onGenerate={() => handleGenerate(scene)}
                      onApprove={(approved) => handleApprove(scene.id, approved)}
                    />
                  ))}
                  <button
                    onClick={handleAddScene}
                    className="flex items-center justify-center gap-2 rounded-[10px] border border-dashed border-border py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-mute hover:border-border-strong hover:text-ink-dim transition-colors"
                  >
                    + Add scene
                  </button>
                </div>
              </Panel>
            )}

            {story.scenes.length === 0 && story.prompt.trim().length >= 10 && (
              <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-border py-10 text-center">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-mute">Ready to break into scenes</p>
                <Button variant="primary" size="sm" onClick={handleBreakIntoScenes}>Break into scenes →</Button>
              </div>
            )}
          </div>

          {/* Right sidebar */}
          <div className="flex flex-col gap-4">
            <Panel index="03" title="Settings">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">Scene target</label>
                    <span className="font-mono text-[9px] text-ink-mute">· used when splitting</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {[30, 45, 60, 90].map((d) => (
                      <button
                        key={d}
                        onClick={() => save({ targetDuration: d })}
                        className={cn(
                          "flex-1 rounded-[8px] border py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                          story.targetDuration === d
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border text-ink-dim hover:border-border-strong hover:text-ink",
                        )}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>

                {story.scenes.length > 0 && (
                  <div className="space-y-2 rounded-[10px] border border-border bg-panel-2 p-3">
                    <StatRow label="Scenes" value={String(story.scenes.length)} />
                    <StatRow label="Timeline" value={`${totalDuration}s`} />
                    <StatRow label="Generated" value={`${doneCount} / ${story.scenes.length}`} />
                    <StatRow label="Approved" value={`${approvedCount} / ${story.scenes.length} · ${approvedDuration}s`} ok={approvedCount > 0} />
                  </div>
                )}

                {/* Global audio default */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-border">
                  <label className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
                    Audio defaults
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={story.globalAudio}
                      onClick={() => {
                        const next = !story.globalAudio;
                        // Also flip all existing scenes that haven't been individually changed.
                        save({
                          globalAudio: next,
                          scenes: story.scenes.map((s) => ({ ...s, audio: next })),
                        });
                      }}
                      className={cn(
                        "relative h-5 w-9 rounded-full border transition-colors shrink-0",
                        story.globalAudio ? "bg-accent border-accent" : "bg-panel-2 border-border",
                      )}
                    >
                      <span className={cn("absolute top-0.5 left-0.5 size-3.5 rounded-full bg-white transition-transform", story.globalAudio ? "translate-x-4" : "translate-x-0")} />
                    </button>
                    <span className="font-mono text-[10px] text-ink-dim">
                      AI audio on all scenes
                    </span>
                  </label>
                </div>

                {/* Background audio */}
                <div className="flex flex-col gap-1.5 pt-1 border-t border-border">
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
                    Background music
                  </span>
                  <AudioControls
                    value={{ audio: false, audioUrl: story.backgroundAudioUrl }}
                    onChange={({ audioUrl }) => save({ backgroundAudioUrl: audioUrl })}
                  />
                </div>
              </div>
            </Panel>

            {/* What's next checklist */}
            <div className="rounded-[14px] border border-dashed border-border p-4 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-mute">What&apos;s next</p>
              <ol className="space-y-1.5 list-none">
                {[
                  { done: story.prompt.length > 10, label: "Write the story" },
                  { done: story.scenes.length > 0, label: "Break into scenes" },
                  { done: story.scenes.some((s) => Object.keys(s.assets).length > 0), label: "Add reference images" },
                  { done: doneCount > 0, label: "Generate clips" },
                  { done: approvedCount > 0, label: "Approve clips" },
                  { done: !!finalVideoUrl, label: "Stitch final video" },
                ].map(({ done, label }) => (
                  <li key={label} className={cn("flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em]", done ? "text-ok" : "text-ink-mute")}>
                    <span>{done ? "✓" : "·"}</span>
                    {label}
                  </li>
                ))}
              </ol>
            </div>

            {/* Generate all / stitch shortcuts */}
            {story.scenes.length > 0 && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setView("storyboard"); handleGenerateAll(); }}
                  className="rounded-[14px] border border-border bg-panel p-3 text-left transition-colors hover:border-border-strong"
                >
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">Generate all scenes →</div>
                  <div className="mt-1 text-[11px] text-ink-mute">Kick off Seedance for every scene in parallel.</div>
                </button>

                {approvedCount > 0 && (
                  <button
                    onClick={() => { setView("storyboard"); void handleStitch(); }}
                    disabled={isStitching}
                    className="rounded-[14px] border border-accent/40 bg-accent/5 p-3 text-left transition-colors hover:border-accent/60 disabled:opacity-50"
                  >
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-accent">
                      {isStitching ? "Stitching…" : `Stitch ${approvedCount} clip${approvedCount !== 1 ? "s" : ""} → ~${approvedDuration}s`}
                    </div>
                    <div className="mt-1 text-[11px] text-ink-mute">Concatenate into final video with FFmpeg.</div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Scene Card ───────────────────────────────────

function SceneCard({
  scene, isFirst, isLast, genStatus, cardRef,
  onChange, onAssetChange, onRemove, onMove, onGenerate, onApprove,
}: {
  scene: Scene;
  isFirst: boolean;
  isLast: boolean;
  genStatus: string;
  cardRef: (el: HTMLDivElement | null) => void;
  onChange: (patch: Partial<Scene>) => void;
  onAssetChange: (assets: SceneAssets) => void;
  onRemove: () => void;
  onMove: (dir: "up" | "down") => void;
  onGenerate: () => void;
  onApprove: (approved: boolean) => void;
}) {
  const [expanded, setExpanded] = React.useState(true);
  const [assetsOpen, setAssetsOpen] = React.useState(false);
  const isBusy = genStatus === "submitting" || genStatus === "polling";
  const hasClip = !!scene.clipUrl;
  const assetCount = Object.values(scene.assets).filter(Boolean).length;

  return (
    <div
      ref={cardRef}
      className={cn(
        "rounded-[10px] border bg-panel-2 overflow-hidden",
        scene.approved ? "border-ok/30" : "border-border",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <div className="flex flex-col gap-0.5 shrink-0">
          <button onClick={() => onMove("up")} disabled={isFirst} aria-label="Move up" className="font-mono text-[9px] text-ink-mute hover:text-ink disabled:opacity-20 leading-none">▲</button>
          <button onClick={() => onMove("down")} disabled={isLast} aria-label="Move down" className="font-mono text-[9px] text-ink-mute hover:text-ink disabled:opacity-20 leading-none">▼</button>
        </div>

        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim w-16 shrink-0">
          Scene {scene.index + 1}
        </span>

        {/* Clip status indicator */}
        {isBusy && (
          <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-accent animate-pulse">
            {genStatus === "submitting" ? "Submitting…" : "Generating…"}
          </span>
        )}
        {scene.clipStatus === "done" && !isBusy && (
          <span className={cn("font-mono text-[9px] uppercase tracking-[0.10em]", scene.approved ? "text-ok" : "text-ink-dim")}>
            {scene.approved ? "✓ Approved" : "Clip ready"}
          </span>
        )}
        {scene.clipStatus === "failed" && !isBusy && (
          <span className="font-mono text-[9px] uppercase tracking-[0.10em] text-[oklch(0.78_0.18_25)]">Failed</span>
        )}

        {/* Asset dots */}
        <button
          onClick={() => setAssetsOpen((p) => !p)}
          className="ml-auto flex items-center gap-1 hover:opacity-80 transition-opacity"
          title="Toggle reference images"
        >
          {(["character", "background", "prop"] as const).map((k) => (
            <span key={k} className={cn("size-1.5 rounded-full transition-colors", scene.assets[k] ? "bg-ok" : "bg-border")} />
          ))}
          <span className="ml-0.5 font-mono text-[8px] uppercase tracking-[0.10em] text-ink-mute">{assetsOpen ? "↑" : "refs"}</span>
        </button>

        {/* Duration */}
        <div className="flex items-center gap-1">
          <button onClick={() => onChange({ duration: Math.max(5, scene.duration - 1) })} className="size-5 rounded-full border border-border font-mono text-[10px] text-ink-dim hover:border-border-strong hover:text-ink transition-colors flex items-center justify-center shrink-0">−</button>
          <span className="w-12 text-center font-mono text-[11px] text-ink shrink-0">{scene.duration}s</span>
          <button onClick={() => onChange({ duration: Math.min(15, scene.duration + 1) })} className="size-5 rounded-full border border-border font-mono text-[10px] text-ink-dim hover:border-border-strong hover:text-ink transition-colors flex items-center justify-center shrink-0">+</button>
        </div>

        <button onClick={() => setExpanded((p) => !p)} aria-label="Toggle" className="font-mono text-[10px] text-ink-mute hover:text-ink transition-colors px-1 shrink-0">{expanded ? "↑" : "↓"}</button>
        <button onClick={onRemove} aria-label="Remove" className="font-mono text-[10px] text-ink-mute hover:text-[oklch(0.72_0.22_15)] transition-colors shrink-0">✕</button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="flex flex-col gap-3 p-3">
          <Textarea
            value={scene.script}
            onChange={(e) => onChange({ script: e.target.value })}
            placeholder={`Scene ${scene.index + 1} — describe what happens in this shot…`}
            className="min-h-[80px] bg-transparent border-border-strong text-[13px]"
          />

          {assetsOpen && (
            <div className="flex flex-col gap-3 rounded-[8px] border border-border bg-panel p-3">
              <div>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">Reference images</p>
                <SceneAssetPicker assets={scene.assets} onChange={onAssetChange} />
              </div>
              <div className="border-t border-border pt-3">
                <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-ink-mute">Audio</p>
                <AudioControls
                  value={{ audio: scene.audio, audioUrl: scene.audioUrl }}
                  onChange={({ audio, audioUrl }) =>
                    onChange({ audio, audioUrl })
                  }
                />
              </div>
            </div>
          )}

          {/* Clip preview + actions */}
          {hasClip && (
            <div className="rounded-[8px] border border-border overflow-hidden">
              <video src={scene.clipUrl} controls className="w-full" style={{ maxHeight: 160 }} preload="metadata" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onGenerate}
              disabled={isBusy}
              className={cn(
                "flex-1 rounded-full border py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors disabled:opacity-40",
                hasClip ? "border-border text-ink-mute hover:border-border-strong hover:text-ink" : "border-accent bg-accent/10 text-accent hover:bg-accent/20",
              )}
            >
              {isBusy ? (genStatus === "submitting" ? "Submitting…" : "Generating…") : hasClip ? "Regenerate" : "Generate clip"}
            </button>
            {hasClip && (
              <button
                onClick={() => onApprove(!scene.approved)}
                className={cn(
                  "flex-1 rounded-full border py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                  scene.approved
                    ? "border-ok/50 bg-ok/10 text-ok hover:bg-ok/20"
                    : "border-border text-ink-mute hover:border-ok/40 hover:text-ok",
                )}
              >
                {scene.approved ? "✓ Approved" : "Approve"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Helpers ──────────────────────────────────────

/**
 * Formatting problems in a screenplay, with line numbers.
 *
 * Only shown once the text actually reads as a script — nagging someone who
 * pasted freeform prose about a missing slugline would be noise. Errors are
 * fields the parser needs; warnings are things that degrade the output but
 * still produce scenes.
 */
function ScriptFormatReport({ source }: { source: string }) {
  const issues = React.useMemo(() => {
    if (!looksLikeScript(source)) return null;
    return validateScript(parseScript(source));
  }, [source]);

  if (!issues) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  if (errors.length === 0 && warnings.length === 0) {
    return (
      <p className="font-mono text-[9px] uppercase tracking-[0.10em] text-ok">
        ✓ Script format valid
      </p>
    );
  }

  return (
    <div className="rounded-[10px] border border-border bg-panel px-3 py-2">
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-dim">
        Script format
        {errors.length > 0 && (
          <span className="ml-1.5 text-[oklch(0.78_0.18_25)]">
            {errors.length} error{errors.length > 1 ? "s" : ""}
          </span>
        )}
        {warnings.length > 0 && (
          <span className="ml-1.5 text-[oklch(0.78_0.18_70)]">
            {warnings.length} warning{warnings.length > 1 ? "s" : ""}
          </span>
        )}
      </p>
      <ul className="flex flex-col gap-1">
        {issues.slice(0, 12).map((issue, i) => (
          <li key={i} className="flex gap-2 text-[11px] leading-snug">
            <span
              className={
                issue.severity === "error"
                  ? "shrink-0 font-mono text-[9px] text-[oklch(0.78_0.18_25)]"
                  : "shrink-0 font-mono text-[9px] text-[oklch(0.78_0.18_70)]"
              }
            >
              {issue.line ? `L${issue.line}` : "—"}
            </span>
            <span className="text-ink-dim">{issue.message}</span>
          </li>
        ))}
      </ul>
      {issues.length > 12 && (
        <p className="mt-1 font-mono text-[9px] text-ink-mute">
          +{issues.length - 12} more
        </p>
      )}
    </div>
  );
}

function StatRow({ label, value, warn, ok }: { label: string; value: string; warn?: boolean; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
      <span className="text-ink-dim">{label}</span>
      <span className={warn ? "text-[oklch(0.78_0.18_70)]" : ok ? "text-ok" : "text-ink"}>{value}</span>
    </div>
  );
}
