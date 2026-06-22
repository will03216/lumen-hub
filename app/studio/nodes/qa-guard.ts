/**
 * Forge inner loop — the critic→regen guard shared by the generator nodes.
 *
 * When a generator carries a QA rubric (`qaChecks`) + regen budget (`regenCap`)
 * this wraps single-shot generation in the bounded inner loop:
 *
 *     generate → VLM critic (Seed 2.0 Pro) scores vs. the rubric
 *              → pass? stop : reflexion-revise the prompt + vary the right lever
 *                + bump seed → regenerate, up to regenCap
 *
 * It folds in the seven improvements:
 *   1. Reflexion — on failure the prompt is re-optimized from the critic's
 *      per-check feedback (/api/forge/revise), not string-appended.
 *   2. Best-of-N — returns the highest-scoring attempt, not the last.
 *   3. Lever mapping — some failures map to a parameter change (e.g. camera
 *      stability), applied via `generate(prompt, seed, overrides)`.
 *   4. Early-stop — bail out when the score stops improving.
 *   5. Calibration — sample the critic `criticSamples`× and take the median
 *      (+ a confidence from the spread).
 *   6. Deterministic pre-checks — aspect/duration/fps are enforced by the spec
 *      params, so they auto-pass in code and never burn a VLM judgement.
 *   7. Observability — every attempt is traced (qaTrace output + console +
 *      best-effort /api/forge/trace persistence).
 *
 * Lives inside a node's execute() so the topological runner needs no changes;
 * non-Forge nodes (empty qaChecks) are untouched. Browser-only.
 */

import { sampleFrames } from "@/lib/studio/video-frame";

export type QAFields = {
  qaChecks?: string[];
  qaMinScore?: number;
  regenCap?: number;
  /** Critic passes per attempt; >1 medians the score for calibration. */
  criticSamples?: number;
};

export type QAOutputs = {
  qaScore?: string;
  qaPass?: string;
  qaReason?: string;
  qaAttempts?: string;
  qaChecksJson?: string;
  qaMode?: string;
  /** 0–1 critic confidence (1 when single-sample; lower as samples disagree). */
  qaConfidence?: string;
  /** JSON array of per-attempt {attempt,score,pass,fixHint,mode,confidence}. */
  qaTrace?: string;
};

type Check = { check: string; pass: boolean; reason: string };
type Verdict = { score: number; pass: boolean; checks: Check[]; fixHint: string; mode: string; confidence: number };
type TraceEntry = { attempt: number; score: number; pass: boolean; fixHint: string; mode: string; confidence: number };

export type ParamOverrides = Record<string, unknown>;

export type GuardArgs = {
  kind: "image" | "video";
  basePrompt: string;
  qa: QAFields;
  signal: AbortSignal;
  onProgress?: (msg: string) => void;
  baseSeed?: number;
  /** Generation mode (drives the reviser's doctrine selection). */
  mode?: "t2v" | "i2v" | "r2v";
  aspect?: string;
  /** Trace metadata. */
  label?: string;
  projectId?: string;
  templateId?: string;
  /** Forge Claude key (read from localStorage by the node) for the reviser. */
  claudeKey?: string;
  generate: (prompt: string, seed: number | undefined, overrides?: ParamOverrides) => Promise<string>;
};

/** Checks the spec params already guarantee — judged in code, not by the VLM. */
const DETERMINISTIC_CHECKS = new Set([
  "aspect_ok",
  "aspect_duration_ok",
  "duration_ok",
  "fps_ok",
]);

const NO_IMPROVE_LIMIT = 2; // stop after this many attempts with no gain
const IMPROVE_EPSILON = 0.02;

export function isGuarded(qa: QAFields): boolean {
  return (qa.qaChecks?.length ?? 0) > 0;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, b) => a + (b - m) ** 2, 0) / nums.length);
}

/**
 * #3 Lever mapping table. Each rule matches a failure signature (check id or
 * the critic's reason text) and applies the right lever:
 *   - `params`  → a generation-parameter change (video only; contract-safe knobs
 *                 like camera stability / native audio — NOT aspect/duration,
 *                 which are locked by the spec and auto-passed deterministically).
 *   - `hint`    → a targeted instruction handed to the reviser so it applies the
 *                 correct Seedance doctrine for that dimension, beyond the
 *                 critic's free-text hint.
 * Extend by adding rows — both functions below are driven entirely by this table.
 */
type LeverRule = { test: RegExp; params?: ParamOverrides; hint?: string };

const LEVER_RULES: LeverRule[] = [
  {
    test: /camera|motion|shak|stable|stabil|\bblur|jitter|wobble/,
    params: { cameraFixed: true },
    hint: "Specify ONE smooth, named camera move (e.g. slow dolly-in) and avoid conflicting movements; keep motion legible.",
  },
  {
    test: /audio|lip[\s-]?sync|voice|sound|music|speak|dialog/,
    params: { audio: true },
    hint: "Describe the spoken line or audio beat explicitly and align lip-sync/timing to it.",
  },
  {
    test: /light|expos|\bdark\b|washed|overblown|bright|shadow|backlit/,
    hint: "Name a stronger, specific light source and its direction (e.g. hard rim light from camera-back) and fix exposure in the Lighting component.",
  },
  {
    test: /colou?r|palette|brand[_\s-]?color|grade|grading|\btone\b|teal|saturation/,
    hint: "State the exact brand colours and where they appear, and add a concrete colour-grade reference.",
  },
  {
    test: /composit|framing|\blogo\b|placement|crop|off[\s-]?cent|rule of thirds/,
    hint: "Restate framing and element placement explicitly in Constraints (e.g. 'logo locked to lower-third, fully visible, unclipped').",
  },
  {
    test: /identity|character|\bface\b|consistency|avatar|likeness|wardrobe/,
    hint: "Re-pin the subject's identity verbatim (clothing, distinguishing features, hair) so it stays constant; do not re-describe it as a new person.",
  },
  {
    test: /hook|first[_\s]?2s|first2s|pacing|too slow|rush|tempo|watch[\s-]?through/,
    hint: "Front-load the payoff into the first 2 seconds; specify the opening beat and overall tempo.",
  },
  {
    test: /continuity|cross[_\s-]?shot|drift|mismatch/,
    hint: "Carry the prior shot's wardrobe, props, and lighting forward verbatim; describe only what changes this shot.",
  },
  {
    test: /\btext\b|caption|readable|legib|typo|garbled/,
    hint: "Specify the on-screen caption text, its placement, and legibility; avoid garbled or clipped lettering.",
  },
  {
    test: /product|fidelity|geometry|material|shape/,
    hint: "Preserve the product's exact geometry, material, and logo; vary only the scene, lighting, and composition around it.",
  },
  {
    test: /background|clean|clutter|distract/,
    hint: "State the background explicitly (clean seamless vs. specified set) and remove distracting elements via positive description.",
  },
];

/** Build the haystack a rule matches against: check ids + their reasons. */
function failureSignature(failed: Check[]): string {
  return failed.map((c) => `${c.check} ${c.reason}`).join(" ").toLowerCase();
}

/** Derive contract-safe parameter overrides from the failing checks (video only). */
export function deriveParamOverrides(kind: "image" | "video", failed: Check[]): ParamOverrides {
  if (kind !== "video") return {};
  const hay = failureSignature(failed);
  let o: ParamOverrides = {};
  for (const rule of LEVER_RULES) {
    if (rule.params && rule.test.test(hay)) o = { ...o, ...rule.params };
  }
  return o;
}

/** Derive targeted reviser hints from the failing checks (video + image). */
export function deriveReviserHints(failed: Check[]): string[] {
  const hay = failureSignature(failed);
  const hints: string[] = [];
  for (const rule of LEVER_RULES) {
    if (rule.hint && rule.test.test(hay)) hints.push(rule.hint);
  }
  return hints;
}

type CriticCall = { score: number; checks: Check[]; fixHint: string; mode: string };

/** One critic call to the route. Returns null on transport/critic failure. */
async function criticOnce(
  args: GuardArgs,
  semanticChecks: string[],
  minScore: number,
  url: string,
  frames: string[],
): Promise<{ ok: true; value: CriticCall } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    kind: args.kind,
    prompt: args.basePrompt,
    mustChecks: semanticChecks,
    minScore,
  };
  if (args.kind === "video") {
    body.videoUrl = url;
    body.frames = frames;
  } else {
    body.imageUrl = url;
  }
  const res = await fetch("/api/forge/critic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: args.signal,
  });
  const json = (await res.json()) as { verdict?: { score: number; checks: Check[]; fixHint: string; mode: string }; error?: string };
  if (!res.ok || !json.verdict) return { ok: false, error: json.error ?? `HTTP ${res.status}` };
  return { ok: true, value: json.verdict };
}

/** #5 Calibration: sample the critic N times, median the score, majority-vote
 *  each check, and derive a confidence from the score spread. */
async function scoreCalibrated(
  args: GuardArgs,
  semanticChecks: string[],
  minScore: number,
  url: string,
  frames: string[],
  samples: number,
): Promise<{ ok: true; value: { score: number; checks: Check[]; fixHint: string; mode: string; confidence: number } } | { ok: false; error: string }> {
  const calls: CriticCall[] = [];
  let firstError = "";
  for (let i = 0; i < samples; i++) {
    if (args.signal.aborted) throw new DOMException("aborted", "AbortError");
    const r = await criticOnce(args, semanticChecks, minScore, url, frames);
    if (r.ok) calls.push(r.value);
    else if (i === 0) firstError = r.error; // first sample failing ⇒ critic unavailable
  }
  if (calls.length === 0) return { ok: false, error: firstError || "critic unavailable" };

  const scores = calls.map((c) => c.score);
  const score = median(scores);
  const confidence = samples > 1 ? Math.max(0, 1 - 2 * stdev(scores)) : 1;

  // Majority vote per check id; keep the first failing reason.
  const checkIds = new Set<string>();
  calls.forEach((c) => c.checks.forEach((ch) => checkIds.add(ch.check)));
  const checks: Check[] = [...checkIds].map((id) => {
    const votes = calls.map((c) => c.checks.find((ch) => ch.check === id)).filter(Boolean) as Check[];
    const passes = votes.filter((v) => v.pass).length;
    const pass = passes * 2 >= votes.length;
    const reason = votes.find((v) => !v.pass)?.reason ?? votes[0]?.reason ?? "";
    return { check: id, pass, reason };
  });
  // Fix hint from the lowest-scoring sample (the worst case to fix).
  const worst = calls.reduce((a, b) => (b.score < a.score ? b : a));
  return { ok: true, value: { score, checks, fixHint: worst.fixHint, mode: calls[0].mode, confidence } };
}

/** #1 Reflexion: ask the reviser route for a corrected prompt. Returns null on
 *  any failure so the caller can fall back to a simple note-append retry. */
async function revisePrompt(
  args: GuardArgs,
  currentPrompt: string,
  failed: Check[],
  fixHint: string,
  hints: string[],
): Promise<string | null> {
  try {
    const res = await fetch("/api/forge/revise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: args.basePrompt,
        currentPrompt,
        failed: failed.map((f) => ({ check: f.check, reason: f.reason })),
        fixHint,
        hints,
        kind: args.kind,
        mode: args.mode ?? "t2v",
        aspect: args.aspect,
        claudeApiKey: args.claudeKey || undefined,
      }),
      signal: args.signal,
    });
    const json = (await res.json()) as { prompt?: string; error?: string };
    if (!res.ok || !json.prompt?.trim()) return null;
    return json.prompt.trim();
  } catch {
    return null;
  }
}

/** #7 Best-effort trace persistence (never throws). */
function persistTrace(args: GuardArgs, trace: TraceEntry[]): void {
  try {
    // eslint-disable-next-line no-console
    console.info("[forge.qa]", { label: args.label, kind: args.kind, template: args.templateId, trace });
    void fetch("/api/forge/trace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: args.projectId,
        templateId: args.templateId,
        kind: args.kind,
        label: args.label,
        attempts: trace,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* swallow */
  }
}

function outputsFor(best: { score: number; verdict: Verdict }, attempts: number, trace: TraceEntry[]): QAOutputs {
  return {
    qaScore: best.score.toFixed(2),
    qaPass: best.verdict.pass ? "true" : "false",
    qaReason: best.verdict.fixHint,
    qaAttempts: String(attempts),
    qaChecksJson: JSON.stringify(best.verdict.checks ?? []),
    qaMode: best.verdict.mode,
    qaConfidence: best.verdict.confidence.toFixed(2),
    qaTrace: JSON.stringify(trace),
  };
}

export async function runCriticLoopGuard(args: GuardArgs): Promise<{ url: string; outputs: QAOutputs }> {
  const all = args.qa.qaChecks ?? [];
  const deterministic = all.filter((c) => DETERMINISTIC_CHECKS.has(c)); // #6
  const semantic = all.filter((c) => !DETERMINISTIC_CHECKS.has(c));
  const minScore = args.qa.qaMinScore ?? 0.85;
  const regenCap = Math.max(0, args.qa.regenCap ?? 0);
  const samples = Math.max(1, Math.min(3, args.qa.criticSamples ?? 1));

  let attempt = 0;
  let prompt = args.basePrompt;
  let seed = args.baseSeed;
  let overrides: ParamOverrides = {};
  const trace: TraceEntry[] = [];
  let best: { url: string; score: number; verdict: Verdict } | null = null;
  let noImprove = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    args.onProgress?.(`Generating · attempt ${attempt + 1}/${regenCap + 1}…`);
    const url = await args.generate(prompt, seed, overrides);

    args.onProgress?.(samples > 1 ? `Scoring with Seed critic ×${samples}…` : "Scoring with Seed critic…");
    let frames: string[] = [];
    if (args.kind === "video") {
      try {
        frames = await sampleFrames(url, 3, args.signal);
      } catch {
        frames = [];
      }
    }

    const scored = await scoreCalibrated(args, semantic, minScore, url, frames, samples);
    if (!scored.ok) {
      // Critic unavailable — keep the best so far (or this render) and stop.
      args.onProgress?.(`Critic unavailable: ${scored.error}`);
      const chosen = best ?? { url, score: 0, verdict: undefined as unknown as Verdict };
      const outputs: QAOutputs = best
        ? outputsFor(best, trace.length || 1, trace)
        : { qaReason: `critic unavailable: ${scored.error}`, qaTrace: JSON.stringify(trace) };
      return { url: chosen.url, outputs };
    }

    // #6 merge the deterministic auto-passes back into the displayed verdict.
    const mergedChecks: Check[] = [
      ...deterministic.map((c) => ({ check: c, pass: true, reason: "enforced by spec params" })),
      ...scored.value.checks,
    ];
    const anyMustFailed = semantic.some(
      (c) => scored.value.checks.find((x) => x.check === c)?.pass === false,
    );
    const pass = scored.value.score >= minScore && !anyMustFailed;
    const verdict: Verdict = {
      score: scored.value.score,
      pass,
      checks: mergedChecks,
      fixHint: scored.value.fixHint,
      mode: scored.value.mode,
      confidence: scored.value.confidence,
    };

    trace.push({ attempt: attempt + 1, score: verdict.score, pass, fixHint: verdict.fixHint, mode: verdict.mode, confidence: verdict.confidence });
    args.onProgress?.(
      `QA ${verdict.score.toFixed(2)} ${pass ? "✓" : "✗"} (try ${attempt + 1}/${regenCap + 1}` +
        (samples > 1 ? `, conf ${verdict.confidence.toFixed(2)}` : "") +
        `)` +
        (verdict.fixHint ? ` — ${verdict.fixHint}` : ""),
    );

    // #2 track best-of-N.
    if (!best || verdict.score > best.score + IMPROVE_EPSILON) {
      best = { url, score: verdict.score, verdict };
      noImprove = 0;
    } else {
      noImprove++;
    }

    if (pass) {
      best = { url, score: verdict.score, verdict };
      break;
    }
    if (attempt >= regenCap) break;
    // #4 early-stop when the score plateaus.
    if (noImprove >= NO_IMPROVE_LIMIT) {
      args.onProgress?.(`Stopping early — no improvement over ${NO_IMPROVE_LIMIT} tries`);
      break;
    }

    // ── prepare the next attempt ──
    attempt++;
    seed = (seed ?? Math.floor(Math.random() * 1_000_000_000)) + 1;
    const failed = scored.value.checks.filter((c) => !c.pass);
    overrides = { ...overrides, ...deriveParamOverrides(args.kind, failed) }; // #3 param levers
    const hints = deriveReviserHints(failed); // #3 prompt-doctrine levers

    args.onProgress?.("Revising prompt from critic feedback…");
    const revised = await revisePrompt(args, prompt, failed, verdict.fixHint, hints); // #1
    prompt =
      revised ??
      args.basePrompt + (verdict.fixHint ? `\n\nRevision note — fix on this pass: ${verdict.fixHint}` : "");
  }

  const chosen = best!;
  persistTrace(args, trace); // #7
  return { url: chosen.url, outputs: outputsFor(chosen, trace.length, trace) };
}
