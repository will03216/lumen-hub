#!/usr/bin/env node
/**
 * The variant bench — PRD §10.5, the runner half.
 *
 * The scoring and aggregation live in lib/video-edit/bench.ts, pure and tested.
 * This is the shell that produces the renders to score and turns a filled-in
 * score sheet into the table that goes in measured-defaults.ts.
 *
 * Three phases, deliberately separate so the expensive one runs once:
 *
 *   1. --render   Submit every clip × every variant. Writes results.json with
 *                 output URLs and failure causes. COSTS REAL MONEY: 12 clips ×
 *                 5 variants is 60 renders.
 *   2. (human)    Score the outputs BLIND — the sheet is shuffled and the
 *                 variant column is withheld, because a scorer who knows which
 *                 variant they are looking at scores the hypothesis.
 *   3. --score    Read the filled sheet, aggregate, print the report and the
 *                 table to paste into measured-defaults.ts.
 *
 * Usage:
 *   npx tsx scripts/video-edit-bench.ts --render --manifest bench/clips.json --confirm
 *   npx tsx scripts/video-edit-bench.ts --sheet   --results bench/results.json
 *   npx tsx scripts/video-edit-bench.ts --score   --results bench/results.json
 *
 * The manifest is an array of BenchClip (see lib/video-edit/bench.ts). It is
 * NOT committed — the clips are customer footage or licensed stock, and the
 * point of a fixed bench is that everyone runs the same one, which is a
 * conversation to have before adding 200MB of video to the repo.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EDIT_CLASSES,
  formatReport,
  measuredDefaultsFrom,
  type BenchClip,
  type BenchResult,
} from "../lib/video-edit/bench";
import type { PromptVariantId } from "../lib/video-edit/types";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const VARIANTS: PromptVariantId[] = ["A", "B", "C", "D", "E"];

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const arg = (f: string) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;
}

function writeJson(path: string, data: unknown) {
  const full = join(ROOT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2), "utf8");
}

// ─────────────────────────── render ───────────────────────────────────────

/**
 * Why this phase is a stub rather than a driver.
 *
 * A bench run has to go through the SAME pipeline a user does — grab a frame,
 * edit it through Seedream, ingest it, compile the prompt, submit. That
 * pipeline is client code: it needs a DOM for frame capture and the browser's
 * decoder for an accurate timestamp. Reimplementing it headlessly would mean
 * benching a second pipeline that is not the one that ships, which measures
 * the wrong thing.
 *
 * So the honest runner drives the real app. Until that harness exists, this
 * prints the run matrix and the manifest it would use, which is enough to run
 * it by hand and paste the URLs in.
 */
function renderPhase(manifestPath: string, confirm: boolean) {
  const clips = readJson<BenchClip[]>(manifestPath);

  console.log(`\nBench matrix: ${clips.length} clips × ${VARIANTS.length} variants = ${clips.length * VARIANTS.length} renders\n`);

  for (const cls of EDIT_CLASSES) {
    const inClass = clips.filter((c) => c.editClass === cls);
    const withPeople = inClass.filter((c) => c.hasPerson).length;
    console.log(`  ${cls}: ${inClass.length} clips (${withPeople} with a person on screen)`);
  }

  const people = clips.filter((c) => c.hasPerson).length;
  if (people < 4) {
    // A bench without faces measures the easy case: privacy moderation only
    // fires on people, and it is the failure most likely to decide a variant.
    console.log(
      `\n  ⚠ Only ${people} clips have a person on screen. §10.5 calls for at least 4 —\n` +
        `    moderation failures are variant-specific and a bench without faces misses them.`,
    );
  }

  if (!confirm) {
    console.log("\nDRY RUN. Add --confirm once the app harness is wired up.\n");
    return;
  }

  console.log(
    "\nThe render phase drives the real client pipeline (frame capture needs a\n" +
      "browser decoder — see the note in this file). Run each row in the app with\n" +
      "the variant pinned in the prompt bar, then record the output URLs in\n" +
      "results.json as BenchResult entries.\n",
  );

  const skeleton: BenchResult[] = clips.flatMap((c) =>
    VARIANTS.map((v) => ({ clipId: c.id, editClass: c.editClass, variant: v })),
  );
  writeJson("bench/results.json", skeleton);
  console.log("Wrote bench/results.json with an empty row per render.\n");
}

// ─────────────────────────── sheet ────────────────────────────────────────

/**
 * A blind scoring sheet.
 *
 * The variant column is withheld and the rows are shuffled. A scorer who can
 * see which variant produced a clip scores the hypothesis, not the clip — and
 * the person scoring is usually the person who wrote §10.3.
 */
function sheetPhase(resultsPath: string) {
  const results = readJson<BenchResult[]>(resultsPath);
  const rows = results.map((r, i) => ({ ref: `r${i}`, clipId: r.clipId }));

  // Deterministic shuffle from the row's own index, so a re-run produces the
  // same sheet and a half-finished scoring pass is not invalidated.
  const shuffled = rows
    .map((row, i) => ({ row, key: (i * 2654435761) % 4294967296 }))
    .sort((a, b) => a.key - b.key)
    .map(({ row }) => row);

  console.log("ref,clipId,editFidelity,editPersistence,sourceFidelity,motionQuality");
  for (const row of shuffled) console.log(`${row.ref},${row.clipId},,,,`);
  console.log(
    "\n# Score 1-5 on each axis. The variant is deliberately not shown.\n" +
      "# Map ref -> variant afterwards with --score.",
  );
}

// ─────────────────────────── score ────────────────────────────────────────

function scorePhase(resultsPath: string) {
  const results = readJson<BenchResult[]>(resultsPath);
  const scored = results.filter((r) => r.score).length;

  console.log(`\n${scored} of ${results.length} rows scored.\n`);
  console.log(formatReport(results));

  const defaults = measuredDefaultsFrom(results);
  const measured = Object.keys(defaults).length;

  if (measured === 0) {
    console.log(
      "No class produced a verdict. measured-defaults.ts stays empty, and the\n" +
        "§10.3 heuristic stays in force — which is the correct outcome for a bench\n" +
        "that did not separate the variants.\n",
    );
    return;
  }

  console.log("\nPaste into lib/video-edit/measured-defaults.ts:\n");
  console.log(`export const MEASURED_DEFAULTS: MeasuredDefaults = ${JSON.stringify(defaults, null, 2)};`);
  console.log(
    `export const MEASURED_AGAINST = { model: "<the model id you benched>", date: "<today>" };\n`,
  );
  console.log(
    `${measured} of ${EDIT_CLASSES.length} classes have a verdict. The rest keep the heuristic.\n`,
  );
}

// ─────────────────────────── main ─────────────────────────────────────────

function main() {
  const manifest = arg("--manifest") ?? "bench/clips.json";
  const results = arg("--results") ?? "bench/results.json";

  if (has("--render")) {
    if (!existsSync(join(ROOT, manifest))) {
      console.error(
        `No manifest at ${manifest}. It is an array of BenchClip — see lib/video-edit/bench.ts.`,
      );
      process.exit(1);
    }
    renderPhase(manifest, has("--confirm"));
    return;
  }
  if (has("--sheet")) return sheetPhase(results);
  if (has("--score")) return scorePhase(results);

  console.log("Pick a phase: --render, --sheet or --score. See the header.");
}

main();
