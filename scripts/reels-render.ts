#!/usr/bin/env node
/**
 * Reels render queue.
 *
 * Reads `lib/reels/templates.ts`, finds entries with `status: "stub"` and a
 * non-empty prompt, and renders them through the BytePlus video / image APIs.
 * Output lands at `public/reels/<industry>/<id>.<ext>`.
 *
 * Usage:
 *   pnpm reels:render                                    # dry-run summary
 *   pnpm reels:render --only ecom-turntable-360
 *   pnpm reels:render --industry advertising
 *   pnpm reels:render --status stub --confirm            # actually render
 *   pnpm reels:render --only <id> --confirm
 *
 * Flags:
 *   --only <id>          Restrict to a single template id
 *   --industry <slug>    Restrict to one industry
 *   --status <s>         Restrict by status (live | stub | draft) — default stub
 *   --confirm            Actually call the API. Without this it's a dry-run.
 *   --force              Overwrite existing output files (default: skip)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEMPLATES,
  type ReelTemplate,
  type TemplateStatus,
} from "../lib/reels/templates";

// ────────────────────────────────── env ────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_ROOT = join(ROOT, "public", "reels");

function loadEnv(): Record<string, string> {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) throw new Error(".env.local not found");
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
const API_KEY = env.BYTEPLUS_API_KEY;
const BASE_URL =
  env.BYTEPLUS_BASE_URL || "https://ark.ap-southeast.bytepluses.com/api/v3";
if (!API_KEY) throw new Error("BYTEPLUS_API_KEY not set in .env.local");

// ────────────────────────────────── args ───────────────────────────────────

type Args = {
  only?: string;
  industry?: string;
  status: TemplateStatus;
  confirm: boolean;
  force: boolean;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = { status: "stub", confirm: false, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm") out.confirm = true;
    else if (a === "--force") out.force = true;
    else if (a === "--only") out.only = argv[++i];
    else if (a === "--industry") out.industry = argv[++i];
    else if (a === "--status") out.status = argv[++i] as TemplateStatus;
    else if (a === "--help" || a === "-h") {
      console.log(
        [
          "pnpm reels:render [flags]",
          "  --only <id>        Restrict to a single template id",
          "  --industry <slug>  Restrict to one industry",
          "  --status <s>       live | stub | draft (default: stub)",
          "  --confirm          Actually call the API (otherwise dry-run)",
          "  --force            Overwrite existing output files",
        ].join("\n"),
      );
      process.exit(0);
    } else {
      console.warn(`[warn] unrecognized arg: ${a}`);
    }
  }
  return out;
}

const args = parseArgs();

// ────────────────────────────────── selection ──────────────────────────────

const candidates: ReelTemplate[] = TEMPLATES.filter((t) => {
  if (args.only) return t.id === args.only;
  if (t.status !== args.status) return false;
  if (args.industry && t.industry !== args.industry) return false;
  if (!t.preset.prompt || t.preset.prompt.trim().length === 0) return false;
  return true;
});

if (candidates.length === 0) {
  console.log("Nothing to render. Check --only / --industry / --status flags.");
  process.exit(0);
}

const totalCost = candidates.reduce(
  (sum, t) => sum + (t.token_cost_estimate ?? 0),
  0,
);

const log = (...a: unknown[]) =>
  console.log(new Date().toISOString().slice(11, 19), ...a);

console.log("");
console.log("─".repeat(72));
console.log(`Reels render queue · ${candidates.length} template(s)`);
console.log("─".repeat(72));
for (const t of candidates) {
  console.log(
    `  ${t.kind === "video" ? "▶" : "◧"}  ${t.id.padEnd(36)}  ${t.model.padEnd(36)}  ~$${(t.token_cost_estimate ?? 0).toFixed(2)}`,
  );
}
console.log("─".repeat(72));
console.log(`Estimated cost: ~$${totalCost.toFixed(2)} (rough)`);
console.log(`Output root:    ${OUT_ROOT}/<industry>/<id>.<ext>`);
console.log("─".repeat(72));

if (!args.confirm) {
  console.log("\nDRY-RUN. Add --confirm to actually render.");
  process.exit(0);
}

// ────────────────────────────────── helpers ────────────────────────────────

const isSeedance2 = (m: string) => m.startsWith("dreamina-seedance-2-");
const isSeedream = (m: string) => m.startsWith("seedream-");

function outPath(t: ReelTemplate): string {
  const ext = t.kind === "video" ? "mp4" : "png";
  return join(OUT_ROOT, t.industry, `${t.id}.${ext}`);
}

function ensureDir(p: string) {
  const d = dirname(p);
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ────────────────────────────────── render: video ──────────────────────────

async function renderVideo(t: ReelTemplate): Promise<void> {
  const out = outPath(t);
  if (existsSync(out) && !args.force) {
    log(`[vid] ${t.id} → exists, skipping (use --force to overwrite)`);
    return;
  }
  ensureDir(out);

  const p = t.preset;
  let body: Record<string, unknown>;

  if (isSeedance2(t.model)) {
    body = {
      model: t.model,
      content: [{ type: "text", text: p.prompt.trim() }],
      ...(p.resolution && { resolution: p.resolution }),
      ...(p.duration !== undefined && { duration: p.duration }),
      ...(p.ratio && { ratio: p.ratio }),
      ...(p.seed !== undefined && { seed: p.seed }),
      ...(p.camerafixed !== undefined && { camerafixed: p.camerafixed }),
      ...(p.generate_audio !== undefined && {
        generate_audio: p.generate_audio,
      }),
      watermark: false,
    };
  } else {
    // Seedance 1.5 Pro: flags appended to prompt
    const parts: string[] = [p.prompt.trim()];
    if (p.resolution) parts.push(`--resolution ${p.resolution}`);
    if (p.duration !== undefined) parts.push(`--duration ${p.duration}`);
    if (p.ratio) parts.push(`--ratio ${p.ratio}`);
    if (p.seed !== undefined) parts.push(`--seed ${p.seed}`);
    parts.push(`--watermark false`);
    body = {
      model: t.model,
      content: [{ type: "text", text: parts.join(" ") }],
    };
  }

  log(`[vid] ${t.id} → submitting (${t.model}, ${p.resolution}, ${p.duration}s, ${p.ratio})…`);
  const submit = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const submitText = await submit.text();
  if (!submit.ok) {
    throw new Error(
      `submit failed [${submit.status}]: ${submitText.slice(0, 600)}`,
    );
  }
  const { id } = JSON.parse(submitText);
  log(`[vid] ${t.id} → task ${id}`);

  for (let tries = 0; tries < 240; tries++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`${BASE_URL}/contents/generations/tasks/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const pollText = await poll.text();
    if (!poll.ok) throw new Error(`poll failed: ${pollText.slice(0, 400)}`);
    const data = JSON.parse(pollText);
    if (tries % 4 === 0) {
      log(`[vid] ${t.id} · try ${tries + 1} · ${data.status}`);
    }
    if (data.status === "succeeded") {
      const url = data.content?.video_url;
      if (!url) throw new Error(`succeeded but no URL: ${pollText.slice(0, 400)}`);
      const dl = await fetch(url);
      if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      writeFileSync(out, buf);
      log(`[vid] ${t.id} → saved ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${out}`);
      return;
    }
    if (data.status === "failed" || data.status === "cancelled") {
      throw new Error(
        `task ${id} ${data.status}: ${JSON.stringify(data.error)}`,
      );
    }
  }
  throw new Error(`polling timed out for ${id}`);
}

// ────────────────────────────────── render: image ──────────────────────────

async function renderImage(t: ReelTemplate): Promise<void> {
  const out = outPath(t);
  if (existsSync(out) && !args.force) {
    log(`[img] ${t.id} → exists, skipping (use --force to overwrite)`);
    return;
  }
  ensureDir(out);

  const p = t.preset;
  const sequential = p.sequential ? "auto" : "disabled";
  const fmt = p.output_format ?? (t.model === "seedream-5-0-lite-260128" ? "png" : "jpeg");

  const body: Record<string, unknown> = {
    model: t.model,
    response_format: "url",
    size: p.size ?? "2K",
    prompt: p.prompt.trim(),
    sequential_image_generation: sequential,
    watermark: false,
  };
  // Seedream 5.0 Lite supports output_format; 4.5/4.0 ignore it (default jpeg).
  if (t.model === "seedream-5-0-lite-260128") {
    body.output_format = fmt;
  }
  if (p.sequential && p.max_images) {
    body.sequential_image_generation_options = { max_images: p.max_images };
  }

  log(`[img] ${t.id} → submitting (${t.model}, ${p.size ?? "2K"}, sequential=${sequential})…`);
  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`image gen failed [${res.status}]: ${text.slice(0, 600)}`);
  }
  const data = JSON.parse(text);
  const items: Array<{ url?: string }> = data.data ?? [];
  if (items.length === 0) {
    throw new Error(`no images in response: ${text.slice(0, 400)}`);
  }

  // Sequential output → save as <id>-1.png, <id>-2.png, etc., AND the first
  // image as the canonical preview. Single output → just <id>.png.
  const ext = fmt === "jpeg" ? "jpg" : fmt;
  for (let i = 0; i < items.length; i++) {
    const url = items[i].url;
    if (!url) continue;
    const dl = await fetch(url);
    if (!dl.ok) throw new Error(`download failed: ${dl.status}`);
    const buf = Buffer.from(await dl.arrayBuffer());
    const target =
      items.length === 1
        ? join(OUT_ROOT, t.industry, `${t.id}.${ext}`)
        : join(OUT_ROOT, t.industry, `${t.id}-${i + 1}.${ext}`);
    writeFileSync(target, buf);
    log(`[img] ${t.id} → saved ${(buf.length / 1024).toFixed(0)} KB → ${target}`);
  }
}

// ────────────────────────────────── main ───────────────────────────────────

(async () => {
  log("Reels renderer starting…");
  const t0 = Date.now();
  const results: { id: string; ok: boolean; err?: string }[] = [];

  // Videos in parallel (BytePlus polls in the background anyway).
  // Images sequentially to dodge rate-limits.
  const videos = candidates.filter((t) => t.kind === "video");
  const images = candidates.filter((t) => t.kind === "image");

  if (images.length > 0) {
    log(`[plan] ${images.length} image(s) sequentially`);
    for (const t of images) {
      try {
        await renderImage(t);
        results.push({ id: t.id, ok: true });
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        log(`[img] ✗ ${t.id}: ${err}`);
        results.push({ id: t.id, ok: false, err });
      }
    }
  }

  if (videos.length > 0) {
    log(`[plan] ${videos.length} video(s) in parallel`);
    const settled = await Promise.allSettled(videos.map((t) => renderVideo(t)));
    settled.forEach((s, i) => {
      const t = videos[i];
      if (s.status === "fulfilled") results.push({ id: t.id, ok: true });
      else {
        const err =
          s.reason instanceof Error ? s.reason.message : String(s.reason);
        log(`[vid] ✗ ${t.id}: ${err}`);
        results.push({ id: t.id, ok: false, err });
      }
    });
  }

  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log("");
  console.log("─".repeat(72));
  console.log(`Done in ${elapsed}s · ${okCount} ok · ${failCount} failed`);
  console.log("─".repeat(72));
  if (failCount > 0) {
    console.log("Failures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ✗ ${r.id} — ${r.err}`);
    }
  }
  console.log("\nNext: copy successful outputs into TEMPLATES `src` fields and");
  console.log("flip status to 'live'. (Auto-patch is on the v1.5 roadmap.)");
})();
