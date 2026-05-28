#!/usr/bin/env node
/**
 * One-off generator for the 5 landing-page mosaic assets.
 * Calls Seedream 5.0 Lite for 3 images + Seedance 1.5 Pro for 2 videos,
 * downloads results to public/landing/.
 *
 * Run:   node scripts/generate-landing-assets.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "landing");

function loadEnv() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) throw new Error(".env.local not found");
  const env = {};
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
const IMAGE_MODEL = env.BYTEPLUS_IMAGE_MODEL || "seedream-5-0-lite-260128";
// Landing-mosaic generator targets Seedance 2.0 explicitly — the hero reel is
// the showcase surface, so it gets the new engine even if .env defaults
// elsewhere stay on 1.5 Pro for stability.
const VIDEO_MODEL = "dreamina-seedance-2-0-260128";
const isSeedance2 = (m) => m.startsWith("dreamina-seedance-2-");

if (!API_KEY) throw new Error("BYTEPLUS_API_KEY not set in .env.local");

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ----- Asset specs -----
// All five mosaic tiles are Seedance 2.0 clips with strong camera moves
// (crane, pull-back, push-in, orbit) so the landing reel reads as a
// directing showcase rather than a stills gallery. 2.0 caps at 720p so
// every tile lands at 720p; durations stretched to 6-8s where the
// camera move benefits from the extra runway (2.0 supports 4-15s).
const IMAGES = [];

const VIDEOS = [
  {
    name: "fig-01-canyon",
    resolution: "720p",
    ratio: "3:4", // closest Seedance preset to the 4:5 hero slot
    duration: 8, // pull-back reveal needs runway
    prompt:
      "Aggressive aerial pull-back reveal: camera starts tight on a lone astronaut in a sleek silver pressure suit standing at the rim of a vast crimson Martian canyon at golden hour, then rapidly cranes upward and backward, exposing the immense layered orange and rust mesa walls falling away thousands of meters below, twin pale moons rising on the horizon, dust particles catching volumetric side-light, anamorphic widescreen, cinematic 70mm film, Denis Villeneuve cinematography, A24 science fiction aesthetic, hyperreal, deep shadows, sharp focus",
  },
  {
    name: "fig-02-desert",
    resolution: "720p",
    ratio: "16:9",
    duration: 5,
    prompt:
      "A lone hooded traveler in flowing cloak strides across a windswept rust-colored sand dune at sunset, twin moons hanging in the violet sky, slow lateral tracking dolly from the side, ultra-wide cinematic, fine sand particles kicked up by each step, anamorphic lens flare, sci-fi epic, A24 aesthetic",
  },
  {
    name: "fig-03-neon",
    resolution: "720p",
    ratio: "16:9",
    duration: 6,
    prompt:
      "Neon-drenched cyberpunk Tokyo alleyway after heavy rain, holographic kanji signs flickering, a lone figure in a translucent rain jacket walks slowly toward the camera, deep puddle reflections, anamorphic lens flare, cinematic dolly push-in, Blade Runner 2049 aesthetic, color graded cyan and magenta",
  },
  {
    name: "fig-04-underwater",
    resolution: "720p",
    ratio: "16:9",
    duration: 6,
    prompt:
      "Slow majestic descending crane through a bioluminescent alien jellyfish bloom in deep abyssal water, camera glides downward past swirling cyan and emerald plankton trails, ancient submerged crystalline architecture gradually revealed far below as the bloom parts and reforms, godrays piercing the dark, IMAX underwater cinematography, color graded teal and amber, 70mm film grain, hyperreal, sharp focus",
  },
  {
    name: "fig-05-observatory",
    resolution: "720p",
    ratio: "9:16",
    duration: 8, // crane-up benefits from extra runway
    prompt:
      "Vertical crane-up climbing the facade of a futuristic crystalline observatory tower on an icy alien glacier at twilight, camera ascends slowly from the glacier base to the tower peak, a giant ringed gas giant planet rises majestically into frame behind the spire as the camera reaches the top, soft aurora ribbons in cyan and magenta drift across the lavender sky, sharp geometric architecture catching the last light, Denis Villeneuve aesthetic, IMAX science fiction, color graded teal and amber, anamorphic film grain, hyperreal",
  },
];

// ----- Image generation -----
async function genImage({ name, size, prompt }) {
  const out = join(OUT_DIR, `${name}.jpg`);
  if (existsSync(out)) {
    log(`[img] ${name}.jpg already exists, skipping`);
    return;
  }
  log(`[img] generating ${name} (${size})…`);
  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      response_format: "url",
      size,
      prompt,
      watermark: false,
    }),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Image gen failed [${res.status}]: ${text.slice(0, 500)}`);
  const data = JSON.parse(text);
  const url = data.data?.[0]?.url;
  if (!url) throw new Error(`No URL in response: ${text.slice(0, 500)}`);
  const dl = await fetch(url);
  if (!dl.ok) throw new Error(`Download failed: ${dl.status}`);
  const buf = Buffer.from(await dl.arrayBuffer());
  writeFileSync(out, buf);
  log(`[img] saved ${name}.jpg (${(buf.length / 1024).toFixed(0)} KB)`);
}

// ----- Video generation -----
async function genVideo({ name, resolution, ratio, duration, prompt }) {
  const out = join(OUT_DIR, `${name}.mp4`);
  if (existsSync(out)) {
    log(`[vid] ${name}.mp4 already exists, skipping`);
    return;
  }

  // Seedance 2.0 takes parameters as top-level JSON fields. Seedance 1.5 Pro
  // takes them as `--flag value` tokens stuffed into the prompt text.
  let body;
  if (isSeedance2(VIDEO_MODEL)) {
    body = {
      model: VIDEO_MODEL,
      content: [{ type: "text", text: prompt }],
      resolution,
      ratio,
      duration,
      watermark: false,
      // Audio off — landing tiles render `<video muted>`, so it would just
      // burn extra tokens with no payoff.
      generate_audio: false,
    };
  } else {
    const flagged = `${prompt} --resolution ${resolution} --duration ${duration} --ratio ${ratio} --watermark false`;
    body = {
      model: VIDEO_MODEL,
      content: [{ type: "text", text: flagged }],
    };
  }

  log(
    `[vid] submitting ${name} (${VIDEO_MODEL.split("-").slice(-2, -1)[0] || VIDEO_MODEL}, ${resolution}, ${duration}s, ${ratio})…`,
  );
  const submit = await fetch(`${BASE_URL}/contents/generations/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const submitText = await submit.text();
  if (!submit.ok)
    throw new Error(
      `Video submit failed [${submit.status}]: ${submitText.slice(0, 500)}`,
    );
  const { id } = JSON.parse(submitText);
  log(`[vid] ${name} task ${id} submitted`);

  for (let tries = 0; tries < 200; tries++) {
    await new Promise((r) => setTimeout(r, 5000));
    const poll = await fetch(`${BASE_URL}/contents/generations/tasks/${id}`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const pollText = await poll.text();
    if (!poll.ok) throw new Error(`Poll failed: ${pollText.slice(0, 500)}`);
    const data = JSON.parse(pollText);
    if (tries % 4 === 0)
      log(`[vid] ${name} · try ${tries + 1} · ${data.status}`);
    if (data.status === "succeeded") {
      const url = data.content?.video_url;
      if (!url)
        throw new Error(`Succeeded but no URL: ${pollText.slice(0, 500)}`);
      const dl = await fetch(url);
      const buf = Buffer.from(await dl.arrayBuffer());
      writeFileSync(out, buf);
      log(
        `[vid] saved ${name}.mp4 (${(buf.length / 1024 / 1024).toFixed(1)} MB)`,
      );
      return;
    }
    if (data.status === "failed" || data.status === "cancelled") {
      throw new Error(
        `Task ${id} ${data.status}: ${JSON.stringify(data.error)}`,
      );
    }
  }
  throw new Error(`Polling timed out for ${id}`);
}

// ----- Main -----
(async () => {
  log("Generator starting…");
  log(`  IMAGE_MODEL = ${IMAGE_MODEL}`);
  log(`  VIDEO_MODEL = ${VIDEO_MODEL}`);
  log(`  OUT_DIR     = ${OUT_DIR}`);

  // Images first (fast, sequential to avoid rate-limit), then videos in parallel.
  for (const img of IMAGES) {
    try {
      await genImage(img);
    } catch (e) {
      log(`[img] ✗ ${img.name}: ${e.message}`);
    }
  }
  log("[vid] starting video tasks in parallel…");
  await Promise.allSettled(
    VIDEOS.map((v) =>
      genVideo(v).catch((e) => log(`[vid] ✗ ${v.name}: ${e.message}`)),
    ),
  );
  log("✓ All done.");
})();
