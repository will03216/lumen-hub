#!/usr/bin/env node
/**
 * The two probes that gate Smart Video Edit — PRD R1 and R13.
 *
 * Both are unanswerable from this repo and both invalidate a design choice the
 * feature is built on, so they run before the flag comes off. Each is a few
 * minutes and a few cents.
 *
 *   R1 — Seedance 2.5's model id and capabilities.
 *        Only `dreamina-seedance-2-0-*` exists here. `isSeedance2()` matches a
 *        `2-5` prefix already, so if the id follows the family convention
 *        nothing needs changing — but max duration, resolutions, whether 4K is
 *        offered and whether reference video is supported are all guesses
 *        until something submits.
 *
 *   R13 — Does an asset's URL clear privacy moderation as a `first_frame`?
 *        This is the important one. §8's asymmetry means a bookend frame
 *        travels as a URL, not `asset://` — and a face URL is exactly what §9
 *        exists to avoid. If no URL form passes, variants A and E are
 *        unavailable for any clip with a person in it, and the default variant
 *        cannot be A.
 *
 * Usage:
 *   npx tsx scripts/video-edit-probe.ts --r1
 *   npx tsx scripts/video-edit-probe.ts --r13 --face <url-to-a-portrait>
 *   npx tsx scripts/video-edit-probe.ts --all --face <url> --confirm
 *
 * Without --confirm it prints what it would submit and exits. Every probe
 * SPENDS MONEY, so that gate is on by default.
 *
 * Reads ARK_API_KEY / BYTEPLUS_API_KEY from .env.local, plus ARK_AK / ARK_SK
 * for the Assets API leg of R13.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(): Record<string, string> {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return process.env as Record<string, string>;
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
const arg = (flag: string) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const CONFIRM = has("--confirm");
const BASE_URL =
  env.BYTEPLUS_BASE_URL ?? "https://ark.ap-southeast-1.byteplusapi.com/api/v3";
const API_KEY = env.ARK_API_KEY ?? env.BYTEPLUS_API_KEY;

/** Candidate ids, most-likely first. The 2.0 family is `dreamina-seedance-2-0-<date>`,
 *  so 2.5 following the same shape is the leading hypothesis — but the date
 *  suffix is unguessable, which is exactly why this probe exists rather than a
 *  constant. Pass --model to test a specific one. */
const CANDIDATE_MODELS = [
  arg("--model"),
  "dreamina-seedance-2-5-260128",
  "dreamina-seedance-2-5",
  "seedance-2-5-pro",
].filter((m): m is string => Boolean(m));

async function submit(body: unknown): Promise<{
  ok: boolean;
  status: number;
  body: string;
}> {
  const res = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 600) };
}

async function poll(id: string, tries = 100): Promise<Record<string, unknown>> {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${BASE_URL}/contents/generations/tasks/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const data = (await res.json()) as Record<string, unknown>;
    const status = String(data.status ?? "");
    if (["succeeded", "failed", "cancelled"].includes(status)) return data;
  }
  return { status: "timeout" };
}

// ─────────────────────────── R1 ───────────────────────────────────────────

async function probeR1() {
  console.log("\n── R1 · Seedance 2.5 model id + capabilities ──\n");

  for (const model of CANDIDATE_MODELS) {
    const body = {
      model,
      content: [{ type: "text", text: "a still glass of water on a table, locked camera" }],
      duration: 4,
      ratio: "16:9",
      resolution: "720p",
    };

    if (!CONFIRM) {
      console.log(`  would submit: ${model}`);
      continue;
    }

    const out = await submit(body);
    if (out.ok) {
      console.log(`  ✓ ${model} ACCEPTED — this is the id.`);
      console.log(`    ${out.body}`);
      console.log(
        "\n  Next: probe the caps by resubmitting with duration 15, resolution 4k,\n" +
          "  and a reference_video, and record which are accepted. Then add the id to\n" +
          "  VIDEO_MODELS in lib/studio/models.ts with the caps you measured.",
      );
      return model;
    }
    console.log(`  ✗ ${model} → ${out.status} ${out.body.slice(0, 180)}`);
  }

  if (CONFIRM) {
    console.log(
      "\n  No candidate accepted. The id is not guessable from the 2.0 convention —\n" +
        "  get it from the ModelArk console's model list and pass it with --model.",
    );
  }
  return null;
}

// ─────────────────────────── R13 ──────────────────────────────────────────

/**
 * The decisive probe. Four URL forms for the SAME face image, each submitted as
 * a `first_frame`:
 *
 *   1. the raw source URL           — expected to fail; this is the baseline
 *   2. a TOS public URL             — hosted by us, never ingested
 *   3. the asset's own returned URL — ingested, then referenced by URL
 *   4. asset:// via references[]    — the known-good control
 *
 * If 3 fails, variants A and E cannot pin a face frame and the §10.3 default
 * has to change. If 3 passes, the design stands as built.
 */
async function probeR13(faceUrl: string) {
  console.log("\n── R13 · does an asset URL clear moderation as a first_frame? ──\n");

  if (!faceUrl) {
    console.log("  --face <url> is required: a portrait, publicly fetchable.");
    return;
  }

  const cases: Array<{ label: string; body: Record<string, unknown> }> = [
    {
      label: "raw source URL (baseline — expected to FAIL)",
      body: {
        model: CANDIDATE_MODELS[0],
        content: [
          { type: "text", text: "she turns her head slowly toward camera" },
          { type: "image_url", image_url: { url: faceUrl }, role: "first_frame" },
        ],
        duration: 4,
        ratio: "16:9",
        resolution: "720p",
      },
    },
  ];

  console.log(
    "  This probe needs the asset chain to have run first. Upload the face through\n" +
      "  POST /api/modelark/assets/upload in the running app, then pass the returned\n" +
      "  TOS url and asset id here with --asset-url and --asset-id.\n",
  );

  const assetUrl = arg("--asset-url");
  const assetId = arg("--asset-id");

  if (assetUrl) {
    cases.push({
      label: "asset's own TOS URL as first_frame (THE DECIDING CASE)",
      body: {
        model: CANDIDATE_MODELS[0],
        content: [
          { type: "text", text: "she turns her head slowly toward camera" },
          { type: "image_url", image_url: { url: assetUrl }, role: "first_frame" },
        ],
        duration: 4,
        ratio: "16:9",
        resolution: "720p",
      },
    });
  }

  if (assetId) {
    cases.push({
      label: "asset:// via references[] (control — expected to PASS)",
      body: {
        model: CANDIDATE_MODELS[0],
        content: [{ type: "text", text: "[image1] turns her head slowly toward camera" }],
        references: [{ type: "image", role: "subject", asset_id: assetId }],
        duration: 4,
        ratio: "16:9",
        resolution: "720p",
      },
    });
  }

  for (const c of cases) {
    if (!CONFIRM) {
      console.log(`  would submit: ${c.label}`);
      continue;
    }
    const out = await submit(c.body);
    if (!out.ok) {
      console.log(`  ✗ ${c.label} → rejected at submit: ${out.status} ${out.body.slice(0, 200)}`);
      continue;
    }
    const id = (JSON.parse(out.body) as { id?: string }).id;
    if (!id) {
      console.log(`  ? ${c.label} → accepted with no task id: ${out.body}`);
      continue;
    }
    const settled = await poll(id);
    const status = String(settled.status);
    const err = JSON.stringify(settled.error ?? "");
    const privacy = /Privacy|Sensitive/i.test(err);
    console.log(
      `  ${status === "succeeded" ? "✓" : "✗"} ${c.label} → ${status}` +
        (privacy ? "  ← PRIVACY MODERATION" : err && err !== '""' ? `  ${err.slice(0, 160)}` : ""),
    );
  }

  console.log(
    "\n  Read the deciding case: if the asset's TOS URL is blocked, variants A and E\n" +
      "  are portrait-unsafe. Record that in PRD R13, change §10.3's default away from\n" +
      "  A, and make variantAvailability() disable A and E when hasPerson is set.",
  );
}

// ─────────────────────────── main ─────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error("No ARK_API_KEY / BYTEPLUS_API_KEY found in .env.local.");
    process.exit(1);
  }
  if (!CONFIRM) {
    console.log(
      "DRY RUN — nothing is submitted. Add --confirm to actually spend money.",
    );
  }

  if (has("--r1") || has("--all")) await probeR1();
  if (has("--r13") || has("--all")) await probeR13(arg("--face") ?? "");

  if (!has("--r1") && !has("--r13") && !has("--all")) {
    console.log("Pick a probe: --r1, --r13 or --all. See the header for usage.");
  }
}

void main();
