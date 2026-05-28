"use client";

/**
 * ImageGenerator — sidebar-only controls for the §03 Image tab on /generate.
 *
 * Pre-redesign this component owned both the controls and a right-side
 * results panel (Drafts band + Saved band). After the Freepik-style
 * rework, the right side moved to the shared `<CreationsFeed>` so all
 * three kinds share one chronological feed. This file is therefore
 * reduced to: prompt, references, engine picker, format, mode chip,
 * Generate button. State subscriptions stay (in-flight queue still
 * powers the loading label on the button) — they're just no longer
 * responsible for rendering a grid.
 */

import { useState, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/ui/chip";
import { NumberInput } from "@/components/ui/number-input";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import {
  addInFlightImage,
  getInFlightImagesServerSnapshot,
  listInFlightImages,
  removeInFlightImage,
  subscribeInFlight,
} from "@/lib/library/in-flight";
import { type RefImage } from "@/components/ui/reference-image-input";
import { ReferencesRow } from "@/components/references/references-row";
import {
  ReferencePicker,
  type ReferencePickerTab,
} from "@/components/references/reference-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModelDropdown } from "@/components/ui/model-dropdown";
import { stageGeneratedImage } from "@/lib/library/auto-save";
import type { ImagePresetState } from "@/lib/reels/preset-bridge";
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_IMAGE_QUALITY_ID,
  DEFAULT_IMAGE_ASPECT_RATIO,
  IMAGE_ASPECTS,
  IMAGE_MODELS as MODELS,
  IMAGE_QUALITIES,
  IMAGE_SUGGESTIONS as SUGGESTIONS,
  MAX_REF_IMAGES,
  MAX_SEQ_IMAGES,
  findClosestAspectQuality,
  findImageAspect,
  findImageQuality,
  imageModeLabel,
  pickImageSize,
  type ImageAspect,
  type ImageOrientation,
  type ImageQualityId,
} from "@/lib/studio/models";

/** Cap parallel renders at the BytePlus practical-burst limit. Six is
 *  enough to fill a hero grid in one click without flooding the API
 *  rate limiter. */
const MAX_BATCH = 6;

/** Button label when not rendering. Composes "Render N images" /
 *  "Render N frames" / "Render N×M tiles" depending on whether batch
 *  variants and / or sequential count are engaged. */
function idleLabel(variants: number, count: number): string {
  if (variants > 1 && count > 1) return `Render ${variants}×${count} tiles`;
  if (variants > 1) return `Render ${variants} variants`;
  if (count > 1) return `Render ${count} frames`;
  return "Render image";
}

/** Single-shot render — one /api/image POST with the supplied params.
 *  Hoisted out of the component so the batch path can call it N times
 *  in parallel without re-binding closures. Returns the list of URLs
 *  the route shipped (one for single-shot, N for sequential mode). */
type GenImage = { url: string; size?: string };

async function runOneRender(params: {
  prompt: string;
  model: string;
  size: string;
  seed: number | undefined;
  image: string | string[] | undefined;
  count: number;
}): Promise<GenImage[]> {
  const res = await fetch("/api/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: params.prompt,
      model: params.model,
      size: params.size,
      seed: params.seed,
      image: params.image,
      sequential: params.count > 1,
      max_images: params.count > 1 ? params.count : undefined,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return (data.data ?? [])
    .filter((d: { url?: string }) => d.url)
    .map((d: { url: string; size?: string }) => ({
      url: d.url,
      size: d.size,
    }));
}

export function ImageGenerator({ initial }: { initial?: ImagePresetState }) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [model, setModel] = useState<string>(
    initial?.model ?? DEFAULT_IMAGE_MODEL_ID,
  );
  // §66 — size is no longer chosen directly. It's derived at render
  // time from (aspectRatio, qualityId). When a preset / Reels hand-off
  // ships a literal `initial.size` string, we back-map it to the
  // closest aspect + quality so the toolbar lands on something sane.
  const hydratedFromSize = initial?.size
    ? findClosestAspectQuality(initial.size)
    : null;
  const [aspectRatio, setAspectRatio] = useState<string>(
    hydratedFromSize?.aspect.ratio ?? DEFAULT_IMAGE_ASPECT_RATIO,
  );
  const [qualityId, setQualityId] = useState<ImageQualityId>(
    hydratedFromSize?.quality.id ?? DEFAULT_IMAGE_QUALITY_ID,
  );
  const aspect: ImageAspect =
    findImageAspect(aspectRatio) ?? IMAGE_ASPECTS[1];
  const quality =
    findImageQuality(qualityId) ?? IMAGE_QUALITIES[0];
  const size = pickImageSize(aspect, quality);
  const [seed, setSeed] = useState<string>("");
  const [refs, setRefs] = useState<RefImage[]>([]);
  // §67 ReferencePicker modal — opened by the three buttons in the new
  // ReferencesRow. `pickerTab` controls the initial panel (Style /
  // Character / + Add → History).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] =
    useState<ReferencePickerTab>("history");
  const [count, setCount] = useState<number>(1);
  /** Number of parallel renders fired per click. 1 = single-shot
   *  (existing behaviour). >1 = batch — each variant uses an
   *  independently rolled random seed so they explore different rolls
   *  of the same prompt. Combines with `count` (sequential mode) by
   *  multiplication: variants × count tiles total. */
  const [batchVariants, setBatchVariants] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);
  // §65 image-to-prompt: track in-flight captioning + drag-over visual
  // state. Captioning blocks Render so we don't fire on a half-replaced
  // prompt; drag-over flips the textarea ring so users see the affordance.
  const [captioning, setCaptioning] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // In-flight queue lives in a module-level store so tab switches
  // (Image ↔ Video) don't drop the visual indicator. Subscribed for the
  // Generate button's loading label; the actual "rendering…" tile is
  // rendered by the shared `<CreationsFeed>` on the right.
  const inFlightImages = useSyncExternalStore(
    subscribeInFlight,
    listInFlightImages,
    getInFlightImagesServerSnapshot,
  );
  const inflight = inFlightImages.length;
  const loading = inflight > 0;

  // BytePlus enforces refs.length + max_images ≤ 15. We cap refs at 10 and
  // max_images at MAX_SEQ_IMAGES so the raw dials can't violate it, but guard
  // anyway — users with small max_images + a lot of refs would still exceed.
  const modeLabel = imageModeLabel(refs.length, count);
  const combinedOverflow = refs.length + count > 15;

  const selectedModel = MODELS.find((m) => m.id === model) ?? MODELS[0];

  async function onGenerate() {
    if (!prompt.trim()) return;
    if (combinedOverflow) {
      setError(
        `Too many inputs: refs + frames (${refs.length} + ${count}) exceeds 15`,
      );
      return;
    }
    setError(null);

    // §68 — split refs by kind. Image-shaped refs flow into BytePlus's
    // `image[]` field as before; prompt-style refs (text-only) get
    // appended to the user-written prompt with a comma separator. The
    // appended chunk is treated as part of the prompt for the purposes
    // of model rolling — fresh seeds still roll independently of the
    // style text.
    const imageRefs = refs.filter((r) => r.kind !== "prompt");
    const promptStyleRefs = refs.filter((r) => r.kind === "prompt");

    let image: string | string[] | undefined;
    if (imageRefs.length === 1) image = imageRefs[0].value;
    else if (imageRefs.length > 1) image = imageRefs.map((r) => r.value);

    const effectivePrompt =
      promptStyleRefs.length > 0
        ? [prompt.trim(), ...promptStyleRefs.map((r) => r.value.trim())]
            .filter(Boolean)
            .join(", ")
        : prompt;

    // Build the seed list. With a fixed seed + variants > 1 we offset
    // each request by its index so users still get N distinct rolls
    // ("seed 1234, 1235, 1236") with the determinism they asked for —
    // a fixed seed broadcast to N requests would just return N copies
    // of the same image. Empty seed = each variant rolls independently.
    const baseSeedNum = seed ? Number(seed) : null;
    const seedFor = (i: number): number | undefined => {
      if (baseSeedNum !== null && Number.isFinite(baseSeedNum)) {
        return baseSeedNum + i;
      }
      return undefined; // server picks
    };

    const variants = Math.max(1, Math.min(MAX_BATCH, batchVariants));
    const burstId = Date.now();

    // Fire all variants in parallel; results stream into the grid as
    // each settles. Failures are per-variant — one slow seed shouldn't
    // discard the others. The overall `error` slot surfaces only when
    // every variant failed.
    const results = await Promise.allSettled(
      Array.from({ length: variants }, (_, i) => {
        const inFlightId = `vif_${burstId}_${i}`;
        const variantSeed = seedFor(i);
        addInFlightImage({
          id: inFlightId,
          startedAt: Date.now(),
          // Store the full effective prompt (user prompt + appended
          // style descriptions) so the pending tile + asset record
          // surface what was actually sent to the model.
          prompt: effectivePrompt,
          model,
          size,
          seed: variantSeed,
        });
        return runOneRender({
          prompt: effectivePrompt,
          model,
          size,
          seed: variantSeed,
          image,
          count,
        })
          .then((urls) => {
            // Drafts is the source of truth for the just-rendered grid
            // (see drafts useMemo above); stageGeneratedImage triggers
            // a snapshot change which re-renders the band automatically.
            for (const u of urls) {
              stageGeneratedImage({
                url: u.url,
                prompt: effectivePrompt,
                model,
                size: u.size ?? size,
                seed: variantSeed,
              });
            }
            return urls;
          })
          .finally(() => {
            // Drop the pending tile whether the variant succeeded
            // or failed — keeping a failed pending tile around would
            // never resolve.
            removeInFlightImage(inFlightId);
          });
      }),
    );

    const failures = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    if (failures.length === results.length) {
      const first = failures[0];
      setError(
        first.reason instanceof Error
          ? first.reason.message
          : String(first.reason),
      );
    } else if (failures.length > 0) {
      // Partial — keep the surface optimistic but flag what fell off.
      setError(`${failures.length}/${results.length} variants failed`);
    }
  }

  // §65 image-to-prompt — drop a local image OR an image dragged from
  // another tab/page onto the prompt area; send it to Seed 2.0 Lite,
  // replace the textarea with the returned line. Belt-and-suspenders:
  // reject non-images and oversize files client-side so we don't burn
  // a roundtrip just to get a 4xx back.
  const MAX_IMG_BYTES = 6 * 1024 * 1024;

  /** Resolve a dropped image to a data URL we can pass to /api/caption.
   *  Two paths:
   *   - File drop (OS file from finder / explorer): FileReader → data URL.
   *   - URL drop (image dragged from another page/tab): fetch the URL
   *     client-side and convert the blob to data URL. CORS-limited; if
   *     the upstream blocks cross-origin reads we surface a clean error. */
  async function imageDropToDataUrl(
    dt: DataTransfer,
  ): Promise<{ dataUrl: string } | { error: string }> {
    const file = dt.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        return { error: `Not an image (${file.type || "unknown"})` };
      }
      if (file.size > MAX_IMG_BYTES) {
        return {
          error: `Image too large — ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds 6MB`,
        };
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("Failed to read file"));
        r.onload = () => resolve(String(r.result ?? ""));
        r.readAsDataURL(file);
      });
      return { dataUrl };
    }
    // Page-image drop: most browsers populate "text/uri-list" or
    // "text/html"; we sniff for an https URL in either.
    const uri = dt.getData("text/uri-list");
    const html = dt.getData("text/html");
    const urlCandidate =
      (uri && uri.split("\n").find((l) => /^https?:\/\//i.test(l.trim()))) ||
      html.match(/src\s*=\s*"([^"]+)"/i)?.[1];
    if (!urlCandidate) {
      return { error: "Drop a local image file or drag an image from another page" };
    }
    try {
      const res = await fetch(urlCandidate, { mode: "cors" });
      if (!res.ok) return { error: `Failed to fetch image: HTTP ${res.status}` };
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        return { error: `Not an image (${blob.type || "unknown"})` };
      }
      if (blob.size > MAX_IMG_BYTES) {
        return {
          error: `Image too large — ${(blob.size / 1024 / 1024).toFixed(1)}MB exceeds 6MB`,
        };
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onerror = () => reject(new Error("Failed to read fetched image"));
        r.onload = () => resolve(String(r.result ?? ""));
        r.readAsDataURL(blob);
      });
      return { dataUrl };
    } catch (e) {
      return {
        error:
          e instanceof Error
            ? `Could not load dropped image: ${e.message}. Cross-origin sites may block this — save the image locally and drag the file.`
            : String(e),
      };
    }
  }

  async function onPromptDrop(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const resolved = await imageDropToDataUrl(e.dataTransfer);
    if ("error" in resolved) {
      setError(resolved.error);
      return;
    }
    setError(null);
    setCaptioning(true);
    try {
      const res = await fetch("/api/caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: resolved.dataUrl }),
      });
      const data = (await res.json()) as { caption?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Captioning failed");
      if (!data.caption) throw new Error("No caption returned");
      // Replace — matches the "I dropped a new image" mental model. If
      // a user prefers append we'll add a Cmd-modified drop later.
      setPrompt(data.caption);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCaptioning(false);
    }
  }

  /** Always-preventDefault dragover so the browser knows we accept the
   *  drop, regardless of whether the source is a file or a page image.
   *  The textarea's native "drop text here" behaviour does NOT call
   *  preventDefault for file drags — without this the drop event would
   *  never fire on either the textarea or our wrapper. */
  function onPromptDragOver(e: React.DragEvent<HTMLElement>) {
    e.preventDefault();
    setDragOver(true);
  }
  function onPromptDragLeave(e: React.DragEvent<HTMLElement>) {
    // Only clear when actually leaving the wrapper, not when entering a
    // child. relatedTarget is the element being entered; if it's still
    // inside currentTarget, the leave is internal and we ignore it.
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragOver(false);
  }

  return (
    <>
    <ReferencePicker
      open={pickerOpen}
      initialTab={pickerTab}
      value={refs}
      maxCount={MAX_REF_IMAGES}
      onChange={setRefs}
      onClose={() => setPickerOpen(false)}
    />
    <div className="flex flex-col gap-4">
      <Panel index="01" title="Prompt">
          <div
            // §65 drop zone — handlers are attached to BOTH the wrapper
            // and the inner textarea so neither can swallow a file drag.
            // Native textareas don't accept file drops by default, and
            // without preventDefault on dragover the drop event never
            // fires — that was the original "drop does nothing" bug.
            className={cn(
              "relative rounded-[10px] transition-all",
              dragOver &&
                "ring-2 ring-accent ring-offset-2 ring-offset-panel",
            )}
            onDragEnter={onPromptDragOver}
            onDragOver={onPromptDragOver}
            onDragLeave={onPromptDragLeave}
            onDrop={onPromptDrop}
          >
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // ⌘↵ (macOS) / Ctrl+↵ (Win/Linux) → generate. Shift+↵ still
                // inserts a newline, plain Enter still breaks lines.
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  if (
                    !loading &&
                    !captioning &&
                    prompt.trim() &&
                    !combinedOverflow
                  ) {
                    void onGenerate();
                  }
                }
              }}
              // Mirror the drag handlers onto the textarea itself —
              // bubbling alone isn't reliable across browsers because
              // the textarea may early-return on file drags without
              // ever propagating the dragover.
              onDragEnter={onPromptDragOver}
              onDragOver={onPromptDragOver}
              onDragLeave={onPromptDragLeave}
              onDrop={onPromptDrop}
              placeholder="Describe the frame. Be specific about lens, light, stock, era."
              rows={5}
              disabled={captioning}
            />
            {captioning && (
              <div className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-[6px] bg-black/60 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                <Loader2 className="size-3 animate-spin" />
                Reading image…
              </div>
            )}
            {dragOver && !captioning && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-[10px] bg-accent-soft/80 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">
                Drop to auto-prompt
              </div>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s, i) => (
                <Chip key={i} onClick={() => setPrompt(s)}>
                  try #{i + 1}
                </Chip>
              ))}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
              ⇣ drop image to auto-prompt
            </span>
          </div>
        </Panel>

        <Panel index="02" title="References">
          <ReferencesRow
            value={refs}
            maxCount={MAX_REF_IMAGES}
            onOpen={(tab) => {
              setPickerTab(tab);
              setPickerOpen(true);
            }}
            onRemove={(idx) =>
              setRefs(refs.filter((_, i) => i !== idx))
            }
          />
          <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
            Skip for T2I. Add 1 ref for I2I edits; multi-ref composes or locks
            identity across frames.
          </p>
        </Panel>

        <Panel index="03" title="Engine">
          <ModelDropdown items={MODELS} value={model} onChange={setModel} />
        </Panel>

        <Panel index="04" title="Format">
          {/* §66 compact toolbar — count stepper + aspect + quality.
              Mirrors the Freepik/Midjourney pattern: three small chips
              in a single row that open richer dropdowns on click.
              Sequential Count and Seed (less commonly touched) live in
              the Advanced disclosure below. */}
          <div className="flex flex-wrap items-center gap-2">
            <CountStepper
              value={batchVariants}
              onChange={setBatchVariants}
              min={1}
              max={MAX_BATCH}
              title="Parallel renders — each variant rolls a different seed"
            />
            <AspectDropdown value={aspectRatio} onChange={setAspectRatio} />
            <QualityDropdown
              value={qualityId}
              onChange={(v) => setQualityId(v as ImageQualityId)}
            />
          </div>

          {/* Derived size hint — small, informational, so users can see
              what aspect+quality resolves to on the wire. "adaptive"
              shows for the Auto sentinel. */}
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.10em] text-ink-dim">
            Renders at <span className="text-ink">{size}</span>
          </div>

          <details className="mt-3 group">
            <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim hover:text-ink list-none [&::-webkit-details-marker]:hidden">
              <span className="inline-block transition-transform group-open:rotate-90 mr-1">▸</span>
              Advanced
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-2 block">Seed</Label>
                <NumberInput
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                  placeholder="random"
                />
              </div>
              <div>
                <Label className="mb-2 block">Sequential frames</Label>
                <input
                  type="number"
                  value={count}
                  min={1}
                  max={MAX_SEQ_IMAGES}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n))
                      setCount(Math.max(1, Math.min(MAX_SEQ_IMAGES, n)));
                  }}
                  className="h-10 w-full rounded-[10px] border border-border bg-panel px-3 text-[13px] text-ink focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                  title="Identity-locked sequential frames (Seedream)"
                />
              </div>
            </div>
            <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-ink-dim">
              Sequential frames &gt; 1 enables Seedream's identity-locked
              generation. Hard rule: refs + frames ≤ 15.
            </p>
          </details>
        </Panel>

        {/* Mode chip — derived from refs + count, updates live */}
        <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-bg-2 px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">
            Mode
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
            {modeLabel}
          </span>
        </div>

        {/* The Generate button stays clickable while previous renders
            are still in flight — each click fires a fresh burst that
            joins the in-flight queue. Disabled state is reserved for
            "the request would be invalid" (empty prompt / ref+seq cap
            violation), not "busy". The spinner + queue counter on the
            label gives visual feedback without locking the surface. */}
        <Button
          onClick={onGenerate}
          disabled={!prompt.trim() || combinedOverflow || captioning}
          variant="primary"
          size="lg"
          className="w-full"
        >
          {loading && (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          {idleLabel(batchVariants, count)}
          {loading && (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-80">
              · {inflight} in queue
            </span>
          )}{" "}
          <span className="font-serif italic text-[15px] leading-none">↵</span>
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
          . Images render server-side via BytePlus ModelArk. Download before URLs
          expire.
        </p>
    </div>
    </>
  );
}

// ─────────────────────────── §66 Format toolbar atoms ──────────────────

/** Inline `[- N +]` stepper, clamped to [min, max]. */
function CountStepper({
  value,
  onChange,
  min,
  max,
  title,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  title?: string;
}) {
  function step(delta: number) {
    onChange(Math.max(min, Math.min(max, value + delta)));
  }
  return (
    <div
      className="inline-flex h-9 items-center rounded-[10px] border border-border bg-panel"
      title={title}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= min}
        className="grid h-full w-7 place-items-center text-ink-dim hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Decrease"
      >
        −
      </button>
      <span className="min-w-[28px] text-center font-mono text-[13px] text-ink">
        {value}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={value >= max}
        className="grid h-full w-7 place-items-center text-ink-dim hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

/** Small SVG that hints at the aspect's orientation. Square for 1:1,
 *  wide rectangle for landscape, tall rectangle for portrait, special
 *  symbol for "auto". Kept inline rather than in a separate icon file
 *  because the geometry depends on (w, h) at runtime. */
function AspectIcon({
  orientation,
  className,
}: {
  orientation: ImageOrientation;
  className?: string;
}) {
  if (orientation === "auto") {
    return (
      <svg
        viewBox="0 0 14 14"
        width="14"
        height="14"
        className={className}
        aria-hidden
      >
        <rect x="2" y="2" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
      </svg>
    );
  }
  // Generic frame: 12×12 box; portrait = narrow vertical, landscape =
  // wide horizontal, square = full. Doesn't need to match exact ratio
  // pixel-perfectly — it's an at-a-glance affordance.
  const dims =
    orientation === "portrait"
      ? { x: 4, y: 1, w: 6, h: 12 }
      : orientation === "landscape"
        ? { x: 1, y: 3, w: 12, h: 8 }
        : { x: 2, y: 2, w: 10, h: 10 };
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      className={className}
      aria-hidden
    >
      <rect
        x={dims.x}
        y={dims.y}
        width={dims.w}
        height={dims.h}
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function AspectDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const selected =
    IMAGE_ASPECTS.find((a) => a.ratio === value) ?? IMAGE_ASPECTS[1];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto gap-2 rounded-[10px] px-2.5 font-mono text-[12px] tracking-[0.06em] text-ink">
        <span className="flex items-center gap-2">
          <AspectIcon orientation={selected.orientation} />
          <SelectValue>{selected.ratio}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent className="min-w-[220px]">
        {IMAGE_ASPECTS.map((a) => (
          <SelectItem key={a.ratio} value={a.ratio} className="py-1.5">
            <span className="flex items-center gap-3">
              <AspectIcon
                orientation={a.orientation}
                className="text-ink-dim"
              />
              <span className="font-mono text-[12px] tracking-[0.06em] text-ink w-12">
                {a.ratio}
              </span>
              <span className="text-[13px] text-ink-dim">{a.label}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function QualityDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const selected =
    IMAGE_QUALITIES.find((q) => q.id === value) ?? IMAGE_QUALITIES[0];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto gap-2 rounded-[10px] px-2.5 font-mono text-[12px] tracking-[0.06em] text-ink">
        <span className="flex items-center gap-2">
          {/* Reuses the landscape icon — small stacked-frames hint
              that the option scales the image, not its shape. */}
          <AspectIcon orientation="landscape" />
          <SelectValue>{selected.label}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent className="min-w-[140px]">
        {IMAGE_QUALITIES.map((q) => (
          <SelectItem key={q.id} value={q.id} className="py-1.5">
            <span className="flex items-center gap-3">
              <span className="font-mono text-[12px] tracking-[0.06em] text-ink w-8">
                {q.label}
              </span>
              <span className="font-mono text-[11px] tracking-[0.06em] text-ink-dim">
                {q.estimate}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

