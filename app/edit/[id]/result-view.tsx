"use client";

/**
 * The result surface: what you get back, next to what you started with.
 *
 * The compare slider is the demo. The whole pitch of scoped editing is
 * "only the marked region changed" — and a lone output image cannot show
 * that, because the viewer has nothing to check it against. Wiping between
 * source and result is what makes the claim visible in one gesture.
 *
 * The marks overlay is the other half of the same argument: it puts the
 * regions you *asked* to change on top of what actually changed. Those two
 * toggles together are the difference between "here is an image" and "here
 * is proof the edit was surgical".
 *
 * ── Why the display box is measured rather than sized in CSS ──────────────
 *
 * The workspace gives this component a FIXED height and clips overflow. So
 * anything here that sizes itself against the viewport instead of against
 * that box gets silently cropped: `max-h-[60vh]` on the image was taller
 * than the available area on any window over ~1060px, and the bottom of
 * every result — plus this toolbar — was cut off. The compare slider has the
 * same problem from the other direction: it is `width:100%` with an
 * `aspect-ratio`, so on a square image it wanted a square 850px box inside a
 * 610px one.
 *
 * CSS cannot express "fit this ratio inside both dimensions" for a
 * non-replaced element — `aspect-ratio` clamped by `max-height` breaks the
 * ratio rather than shrinking the other axis. So the container is measured
 * and the box computed. One fitted rect then serves both branches, which is
 * also what keeps the marks overlay registered with the image: the SVG and
 * the picture are the same rect by construction, not by two independent
 * `object-contain` calculations that agree only by luck.
 */

import * as React from "react";
import { Download, Eye, EyeOff, RotateCcw, Columns2 } from "lucide-react";
import { SliderOverlay } from "@/app/compare/slider-overlay";
import { resolveSafeUrl } from "@/lib/edit/same-origin";
import { markColor, type Annotation, type EditVersion } from "@/lib/edit/types";
import { cn } from "@/lib/utils";

export function ResultView({
  version,
  sourceUrl,
  sourceWidth,
  sourceHeight,
  annotations,
  onRestore,
}: {
  version: EditVersion;
  sourceUrl: string | null;
  sourceWidth: number;
  sourceHeight: number;
  /** The marks that produced THIS version, not whatever is on the canvas
   *  now — otherwise the overlay lies about what was asked for. */
  annotations: Annotation[];
  onRestore: () => void;
}) {
  const [compare, setCompare] = React.useState(false);
  const [showMarks, setShowMarks] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const output = version.outputs[0];
  // The rendered size when upstream reported one, the requested size
  // otherwise, and the source as a last resort — a wrong ratio here shows up
  // as letterboxing inside the frame, never as a crop.
  const aspect = parseAspect(output?.size ?? version.size) ??
    (sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 1);
  const { ref: fitRef, box } = useFittedBox(aspect);

  const url = output?.url;
  if (!url) return null;

  const canCompare = Boolean(sourceUrl);
  const hasMarks = annotations.length > 0;

  async function download() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await downloadImage(url!, version.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex size-full flex-col">
      <div
        ref={fitRef}
        className="relative flex min-h-0 flex-1 items-center justify-center p-4"
      >
        <div
          className="relative max-h-full max-w-full"
          style={box ? { width: box.w, height: box.h } : undefined}
        >
          {compare && sourceUrl ? (
            <SliderOverlay
              aUrl={url}
              bUrl={sourceUrl}
              aLabel="Edited"
              bLabel="Original"
              size={output?.size ?? version.size}
            />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- remote
                  CDN hosts aren't in the image optimizer's allow-list. */}
              <img
                src={url}
                alt="Edited result"
                className="size-full object-contain"
              />
              {showMarks && hasMarks && (
                <MarksOverlay
                  annotations={annotations}
                  width={sourceWidth}
                  height={sourceHeight}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-t border-border px-3 py-2">
        <ToolbarButton
          active={compare}
          disabled={!canCompare}
          onClick={() => {
            setCompare((v) => !v);
            setShowMarks(false); // the overlay can't track the wipe
          }}
          title={
            canCompare
              ? "Wipe between the original and the result"
              : "No original to compare against"
          }
        >
          <Columns2 className="size-3.5" />
          Compare
        </ToolbarButton>

        <ToolbarButton
          active={showMarks}
          disabled={compare || !hasMarks}
          onClick={() => setShowMarks((v) => !v)}
          title={
            hasMarks
              ? "Show the regions this render was asked to change"
              : "This render had no marks"
          }
        >
          {showMarks ? (
            <EyeOff className="size-3.5" />
          ) : (
            <Eye className="size-3.5" />
          )}
          Marks
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton onClick={onRestore} title="Put the session back into the state that produced this version — instruction and marks">
            <RotateCcw className="size-3.5" />
            Restore
          </ToolbarButton>
          <ToolbarButton onClick={() => void download()} disabled={busy}>
            <Download className="size-3.5" />
            {busy ? "Saving…" : "Download"}
          </ToolbarButton>
        </div>
      </div>

      {error && (
        <div className="px-3 pb-2 text-[12px] text-[oklch(0.72_0.22_15)]">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * The largest box of a given aspect ratio that fits the measured container.
 *
 * Returns null until the first measurement lands, and the caller falls back
 * to `max-h-full max-w-full` for that frame — so the pre-measure paint is
 * bounded too rather than briefly overflowing.
 */
function useFittedBox(aspect: number) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const measure = (w: number, h: number) => {
      if (w <= 0 || h <= 0 || !Number.isFinite(aspect) || aspect <= 0) return;
      // Fit inside BOTH axes. Taking the smaller of the two candidate widths
      // is the whole calculation; getting it backwards is how you crop.
      const width = Math.min(w, h * aspect);
      setBox({ w: width, h: width / aspect });
    };

    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) measure(r.width, r.height);
    });
    ro.observe(el);
    // ResizeObserver fires on observe in every engine that ships it, but the
    // first frame is measured here as well so the box is right even if a
    // polyfill doesn't.
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    measure(
      rect.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
      rect.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
    );
    return () => ro.disconnect();
  }, [aspect]);

  return { ref, box };
}

/** "1360x1360" → 1, or null when there is nothing usable to parse. */
function parseAspect(size: string | undefined): number | null {
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec(size ?? "");
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? w / h : null;
}

/**
 * The marks, drawn over the result.
 *
 * An SVG with `viewBox` set to the SOURCE dimensions and the same
 * object-contain fit as the image means annotation coordinates — which are
 * stored in source-image pixels — land correctly with no arithmetic here,
 * even though the render usually comes back at a different resolution.
 * Scaling by hand would need the displayed size, which changes with the
 * viewport.
 */
function MarksOverlay({
  annotations,
  width,
  height,
}: {
  annotations: Annotation[];
  width: number;
  height: number;
}) {
  if (!width || !height) return null;
  // Stroke widths are in source-pixel units, so scale them off the image's
  // own size or they vanish on a large source and overwhelm a small one.
  const unit = Math.max(width, height) / 320;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 size-full"
      aria-hidden
    >
      {annotations
        .filter((a) => !a.hidden)
        .map((a) => {
          // Same rule as the canvas: vector marks are drawn in the display
          // colour, raster marks in the one that was burned into the pixels.
          const stroke = markColor(a);
          if (a.kind === "point") {
            return (
              <circle
                key={a.id}
                cx={a.at.x}
                cy={a.at.y}
                r={unit * 2}
                fill={stroke}
                stroke="#000"
                strokeWidth={unit * 0.3}
              />
            );
          }
          if (a.kind === "box") {
            return (
              <rect
                key={a.id}
                x={a.rect.x}
                y={a.rect.y}
                width={a.rect.w}
                height={a.rect.h}
                fill="none"
                stroke={stroke}
                strokeWidth={unit}
                strokeDasharray={`${unit * 3} ${unit * 2}`}
              />
            );
          }
          if (a.kind === "brush") {
            return (
              <polyline
                key={a.id}
                points={pairs(a.points)}
                fill="none"
                stroke={stroke}
                strokeWidth={a.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.7}
              />
            );
          }
          if (a.kind === "text") {
            return (
              <text
                key={a.id}
                x={a.at.x}
                y={a.at.y}
                fontSize={a.size}
                fontWeight={700}
                fill={stroke}
                dominantBaseline="hanging"
              >
                {a.text}
              </text>
            );
          }
          return (
            <line
              key={a.id}
              x1={a.from.x}
              y1={a.from.y}
              x2={a.to.x}
              y2={a.to.y}
              stroke={stroke}
              strokeWidth={unit}
              markerEnd=""
            />
          );
        })}
    </svg>
  );
}

function pairs(flat: number[]): string {
  const out: string[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push(`${flat[i]},${flat[i + 1]}`);
  return out.join(" ");
}

/**
 * Download via blob rather than a bare `<a download>`.
 *
 * The `download` attribute is ignored cross-origin — the browser navigates
 * to the image instead of saving it, which looks like the button is broken.
 * Fetching through the canvas-safe URL and saving an object URL works for
 * both same-origin and proxied images.
 */
async function downloadImage(url: string, versionId: string): Promise<void> {
  const safe = resolveSafeUrl(url);
  const res = await fetch(safe.url);
  if (!res.ok) throw new Error(`Could not fetch the image (${res.status}).`);
  const blob = await res.blob();

  const ext = (blob.type.split("/")[1] ?? "png").replace("jpeg", "jpg");
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `edit-${versionId}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking immediately can cancel the save in some browsers; one tick is
  // enough for the download to have been handed off.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function ToolbarButton({
  children,
  onClick,
  active = false,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors disabled:opacity-30",
        active
          ? "bg-ink text-[var(--bg)]"
          : "text-ink-mute hover:text-ink disabled:hover:text-ink-mute",
      )}
    >
      {children}
    </button>
  );
}
