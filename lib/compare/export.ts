/**
 * Compare — export a side-by-side comparison as a shareable PNG.
 *
 * Pure browser Canvas composition. Two public entry points:
 *   - composeImagePair — loads both URLs as CORS-anonymous <img> and draws
 *   - composeVideoPair — uses live <video> elements to capture their current
 *     frames (so the user can scrub to an interesting moment before exporting)
 *
 * Both funnel through a shared `composePair` core that handles layout.
 * `downloadBlob` wires the browser download.
 *
 * Design choices:
 *  - 1920px wide export. Social-friendly, covers Twitter / X preview, IG
 *    carousels, Notion embeds. Two square frames at 960×960 fit with gap.
 *  - Aspect ratio is respected per-side — the panel computes its own height
 *    then we use the taller of the two for the row so the layout never
 *    crops. Lets a 16:9 + 1:1 pair export cleanly (relevant when sides
 *    happen to pick different sizes, or for mixed video ratios).
 *  - Header + footer chrome match the in-app aesthetic (dark bg, mono
 *    uppercase labels, side accents) so the export reads as "from Lumen".
 */

// ── Public input types ───────────────────────────────────────────────────

export type ImagePairExportInput = {
  aUrl: string;
  bUrl: string;
  aLabel: string;
  bLabel: string;
  /** Tiny subtitle under each side's label — e.g. "2048×2048". Optional. */
  aSubtitle?: string;
  bSubtitle?: string;
  /** User prompt — wraps across the footer. */
  prompt: string;
};

export type VideoPairExportInput = {
  aVideo: HTMLVideoElement;
  bVideo: HTMLVideoElement;
  aLabel: string;
  bLabel: string;
  /** Recommended format: "16:9 · 00:03.5" (ratio + currentTime). */
  aSubtitle?: string;
  bSubtitle?: string;
  prompt: string;
};

// ── Theme constants — mirror globals.css so exports feel on-brand ────────
const BG = "#05050a";
const BG_2 = "#0a0a10";
const INK = "#f2f0e8";
const INK_DIM = "#8a8880";
const LINE = "rgba(242, 240, 232, 0.14)";
const SIDE_A = "hsl(28 90% 55%)";
const SIDE_B = "hsl(200 80% 60%)";

// ── Layout constants ─────────────────────────────────────────────────────
const EXPORT_WIDTH = 1920;
const PAD_X = 64;
const PAD_TOP = 72;
const PAD_BOTTOM = 96;
const HEADER_H = 56;
const GAP_BELOW_HEADER = 40;
const GAP_COLUMNS = 32;
const LABEL_H = 64;
const GAP_BELOW_LABEL = 16;
const GAP_ABOVE_FOOTER = 40;
const FOOTER_LINE_H = 34;
const FOOTER_MAX_LINES = 4;

// ── Public entry points ──────────────────────────────────────────────────

/** Compose an image pair export. Loads both URLs CORS-anonymous. */
export async function composeImagePair(
  input: ImagePairExportInput,
): Promise<Blob> {
  const [imgA, imgB] = await Promise.all([
    loadCorsImage(input.aUrl),
    loadCorsImage(input.bUrl),
  ]);
  return composePair({
    aSource: imgA,
    bSource: imgB,
    aLabel: input.aLabel,
    bLabel: input.bLabel,
    aSubtitle: input.aSubtitle,
    bSubtitle: input.bSubtitle,
    prompt: input.prompt,
  });
}

/** Compose a video pair export. Captures each <video> at its current frame
 *  (HAVE_CURRENT_DATA or better). Caller is responsible for keeping the
 *  elements alive through the await. */
export async function composeVideoPair(
  input: VideoPairExportInput,
): Promise<Blob> {
  // Sanity: both videos must have decoded a frame before we can draw them.
  // readyState ≥ 2 (HAVE_CURRENT_DATA) means the current frame is available.
  if (input.aVideo.readyState < 2 || input.bVideo.readyState < 2) {
    throw new Error(
      "Video not ready — give both sides a moment to load the frame.",
    );
  }
  // videoWidth / videoHeight are 0 until metadata loads. Guard against that
  // too so the layout math doesn't divide by zero.
  if (
    !input.aVideo.videoWidth ||
    !input.aVideo.videoHeight ||
    !input.bVideo.videoWidth ||
    !input.bVideo.videoHeight
  ) {
    throw new Error("Video dimensions unavailable — try again in a second.");
  }
  return composePair({
    aSource: input.aVideo,
    bSource: input.bVideo,
    aLabel: input.aLabel,
    bLabel: input.bLabel,
    aSubtitle: input.aSubtitle,
    bSubtitle: input.bSubtitle,
    prompt: input.prompt,
  });
}

/** Ask the user's browser to download the blob as a PNG. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a tick to register before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Shared compose core ──────────────────────────────────────────────────

type DrawableSource = HTMLImageElement | HTMLVideoElement;

type ComposePairInput = {
  aSource: DrawableSource;
  bSource: DrawableSource;
  aLabel: string;
  bLabel: string;
  aSubtitle?: string;
  bSubtitle?: string;
  prompt: string;
};

async function composePair(input: ComposePairInput): Promise<Blob> {
  const { aSource, bSource } = input;
  const aW = sourceWidth(aSource);
  const aH = sourceHeight(aSource);
  const bW = sourceWidth(bSource);
  const bH = sourceHeight(bSource);

  // Column width — equal halves minus the gap.
  const colWidth = Math.floor(
    (EXPORT_WIDTH - PAD_X * 2 - GAP_COLUMNS) / 2,
  );

  // Each column's image height keeps native aspect ratio. The row height is
  // the taller of the two so neither side crops.
  const hA = Math.round((aH / aW) * colWidth);
  const hB = Math.round((bH / bW) * colWidth);
  const imgH = Math.max(hA, hB);

  // Derive canvas total height — use the char-count wrap heuristic since we
  // don't have a ctx yet; precise wrap happens during drawing.
  const footerLines = Math.min(
    wrapLines(input.prompt, colWidth * 2 + GAP_COLUMNS).length,
    FOOTER_MAX_LINES,
  );
  const footerH = footerLines * FOOTER_LINE_H;

  const totalH =
    PAD_TOP +
    HEADER_H +
    GAP_BELOW_HEADER +
    LABEL_H +
    GAP_BELOW_LABEL +
    imgH +
    GAP_ABOVE_FOOTER +
    footerH +
    PAD_BOTTOM;

  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Background — solid fill matching the in-app dark plate.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, EXPORT_WIDTH, totalH);

  // ── Header row ──────────────────────────────────────────────────────────
  let y = PAD_TOP;
  drawHeader(ctx, PAD_X, y, EXPORT_WIDTH - PAD_X * 2);
  y += HEADER_H + GAP_BELOW_HEADER;

  // ── Side labels (A and B) ──────────────────────────────────────────────
  const colAX = PAD_X;
  const colBX = PAD_X + colWidth + GAP_COLUMNS;
  drawSideLabel(ctx, "A", input.aLabel, input.aSubtitle, colAX, y, colWidth, SIDE_A);
  drawSideLabel(ctx, "B", input.bLabel, input.bSubtitle, colBX, y, colWidth, SIDE_B);
  y += LABEL_H + GAP_BELOW_LABEL;

  // ── Tiles ──────────────────────────────────────────────────────────────
  drawTile(ctx, aSource, aW, aH, colAX, y, colWidth, imgH);
  drawTile(ctx, bSource, bW, bH, colBX, y, colWidth, imgH);
  y += imgH + GAP_ABOVE_FOOTER;

  // ── Footer (prompt) ────────────────────────────────────────────────────
  drawPromptFooter(
    ctx,
    input.prompt,
    PAD_X,
    y,
    EXPORT_WIDTH - PAD_X * 2,
  );

  // ── Encode ──────────────────────────────────────────────────────────────
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/png",
    );
  });
}

// ── Source-type shims ────────────────────────────────────────────────────

function isVideo(s: DrawableSource): s is HTMLVideoElement {
  return (s as HTMLVideoElement).videoWidth !== undefined;
}
function sourceWidth(s: DrawableSource): number {
  return isVideo(s) ? s.videoWidth : s.naturalWidth;
}
function sourceHeight(s: DrawableSource): number {
  return isVideo(s) ? s.videoHeight : s.naturalHeight;
}

// ── Canvas helpers ───────────────────────────────────────────────────────

/** Load an <img> with CORS credentials so we can draw it into a canvas
 *  without tainting. BytePlus CDN sends `access-control-allow-origin: *`
 *  so anonymous mode is sufficient. */
function loadCorsImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error(`Failed to load image for export: ${url}`));
    img.src = url;
  });
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
) {
  // Small plate on the left — "§ LUMEN · COMPARE"
  ctx.save();
  ctx.fillStyle = INK;
  ctx.font =
    '500 20px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';
  ctx.textBaseline = "middle";
  const plateText = `§ LUMEN · COMPARE`;
  ctx.fillText(plateText, x, y + 18);

  // Right-aligned date chip
  ctx.fillStyle = INK_DIM;
  ctx.textAlign = "right";
  const d = new Date();
  const ymd =
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`;
  ctx.fillText(`SESSION · ${ymd}`, x + w, y + 18);

  // Underline
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + 40);
  ctx.lineTo(x + w, y + 40);
  ctx.stroke();
  ctx.restore();
}

function drawSideLabel(
  ctx: CanvasRenderingContext2D,
  side: "A" | "B",
  label: string,
  subtitle: string | undefined,
  x: number,
  y: number,
  w: number,
  accent: string,
) {
  ctx.save();
  // Side badge (accent square with letter)
  const badge = 44;
  ctx.fillStyle = accent;
  roundRect(ctx, x, y, badge, badge, 10);
  ctx.fill();
  ctx.fillStyle = BG;
  ctx.font =
    'italic 600 26px "Instrument Serif", ui-serif, Georgia, serif';
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(side, x + badge / 2, y + badge / 2 + 2);

  // Text stack to the right of the badge
  const textX = x + badge + 16;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK_DIM;
  ctx.font =
    '500 13px ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';
  ctx.fillText(`ENGINE · SIDE ${side}`, textX, y + 16);

  ctx.fillStyle = INK;
  ctx.font = '500 22px "Inter Tight", ui-sans-serif, Inter, sans-serif';
  const maxLabelW = w - badge - 16;
  ctx.fillText(truncate(ctx, label, maxLabelW), textX, y + 40);

  if (subtitle) {
    ctx.fillStyle = INK_DIM;
    ctx.font =
      '400 12px ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';
    ctx.fillText(subtitle, textX, y + 58);
  }
  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  source: DrawableSource,
  sourceW: number,
  sourceH: number,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  ctx.save();
  // Background plate for letterboxing when aspect differs from the row.
  ctx.fillStyle = BG_2;
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();

  // Contain-fit so we never crop.
  const scale = Math.min(w / sourceW, h / sourceH);
  const drawW = sourceW * scale;
  const drawH = sourceH * scale;
  const drawX = x + (w - drawW) / 2;
  const drawY = y + (h - drawH) / 2;

  ctx.save();
  roundRectPath(ctx, x, y, w, h, 12);
  ctx.clip();
  // `drawImage` accepts both HTMLImageElement and HTMLVideoElement. For a
  // video element it captures the current frame (no extra work needed).
  ctx.drawImage(source, drawX, drawY, drawW, drawH);
  ctx.restore();

  // Thin border to match the in-app tiles
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 12);
  ctx.stroke();
  ctx.restore();
}

function drawPromptFooter(
  ctx: CanvasRenderingContext2D,
  prompt: string,
  x: number,
  y: number,
  w: number,
) {
  ctx.save();
  ctx.fillStyle = INK_DIM;
  ctx.font =
    '500 13px ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';
  ctx.textBaseline = "alphabetic";
  ctx.fillText("PROMPT", x, y);

  ctx.fillStyle = INK;
  ctx.font =
    'italic 400 22px "Instrument Serif", ui-serif, Georgia, serif';
  const lines = wrapLines(prompt, w, ctx).slice(0, FOOTER_MAX_LINES);
  lines.forEach((ln, i) => {
    ctx.fillText(ln, x, y + 28 + i * FOOTER_LINE_H);
  });
  ctx.restore();
}

/** Break `text` into lines that fit `maxWidth` using the current ctx font.
 *  If `ctx` is omitted (used during height estimation), falls back to
 *  character-count heuristic calibrated for the footer font size. */
function wrapLines(
  text: string,
  maxWidth: number,
  ctx?: CanvasRenderingContext2D,
): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return [""];

  // Heuristic sans-ctx path (only used for canvas height sizing).
  if (!ctx) {
    const approxCharWidth = 11; // ~ Instrument Serif 22px average
    const perLine = Math.floor(maxWidth / approxCharWidth);
    const out: string[] = [];
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > perLine && line) {
        out.push(line);
        line = w;
      } else {
        line = (line + " " + w).trim();
      }
    }
    if (line) out.push(line);
    return out.length ? out : [""];
  }

  // Precise ctx path for actual drawing.
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      out.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ell = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ell).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  roundRectPath(ctx, x, y, w, h, r);
}
