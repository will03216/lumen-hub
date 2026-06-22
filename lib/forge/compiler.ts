/**
 * Forge — Spec → Graph compiler.
 *
 * This is the backend of the "agent as compiler" idea: the Planner emits a
 * frozen Production Spec (the IR); this module expands it into a Studio node
 * graph ({ nodes, edges }) that `app/studio/runner.ts` executes deterministically.
 * We deliberately reuse the *existing* node registry and runner — the agent
 * never gets its own runtime. The canvas the user lands on IS the plan
 * (plan-as-canvas), editable before and after the freeze.
 *
 * Per shot we emit a tiny subgraph:
 *     textPrompt(compiled prompt) → videoGen|imageGen(locked params) → preview
 * For multi-shot video specs we add a videoStitch that joins every clip into a
 * final preview (the Finisher's assembly step).
 *
 * Frame-chaining (consistency.frameChaining): for multi-shot video the last
 * frame of clip N is extracted and wired into clip N+1's first-frame port, so
 * each clip starts where the previous ended — the single most effective
 * anti-drift technique for multi-shot work. Chained shots run I2V at render
 * time (their prompts are optimized in I2V mode upstream by the Prompt Engineer).
 *
 * Enforcement: the compiler refuses to emit any node type outside the
 * template's `toolScope`. An out-of-scope spec cannot be compiled.
 */

import type { PersistedNode, PersistedEdge, CanvasShape } from "@/lib/studio/projects";
import type { ProductionSpec, ProductionShot } from "./spec";
import type { PipelineTemplate } from "./templates/types";
import { isInScope } from "./capabilities";
import { VIDEO_RATIOS, findVideoModel, DEFAULT_VIDEO_MODEL_ID, DEFAULT_IMAGE_MODEL_ID, DEFAULT_IMAGE_SIZE } from "@/lib/studio/models";

let seq = 0;
function nid(prefix: string): string {
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}_${seq.toString(36)}`;
}

function node(
  type: string,
  position: { x: number; y: number },
  form: Record<string, unknown>,
): PersistedNode {
  return { id: nid(type), type, position, data: { form, outputs: {}, status: "idle" } };
}

function edge(
  source: string,
  target: string,
  sourceHandle: string,
  targetHandle: string,
): PersistedEdge {
  return { id: nid("e"), source, target, sourceHandle, targetHandle };
}

/** Snap an arbitrary aspect string to a ratio the video models accept. */
function resolveRatio(aspect: string): string {
  if ((VIDEO_RATIOS as readonly string[]).includes(aspect)) return aspect;
  // Common cinematic aliases.
  if (aspect === "2.39:1" || aspect === "2.35:1") return "21:9";
  return "16:9";
}

/** Clamp a requested duration to what the chosen model supports. */
function resolveDuration(modelId: string, requested: number | undefined): number {
  const caps = findVideoModel(modelId)?.caps;
  const durations = caps?.durations ?? [5];
  const want = requested ?? durations[0];
  if (durations.includes(want)) return want;
  return durations.reduce((best, d) => (Math.abs(d - want) < Math.abs(best - want) ? d : best));
}

function resolveResolution(modelId: string, requested: string | undefined): string {
  const caps = findVideoModel(modelId)?.caps;
  const resolutions = (caps?.resolutions ?? ["720p"]) as readonly string[];
  if (requested && resolutions.includes(requested)) return requested;
  return resolutions[0];
}

export type CompileResult = {
  canvas: CanvasShape;
  /** Node types that were requested but dropped for being out of tool scope. */
  droppedOutOfScope: string[];
};

/**
 * Expand a frozen (or draft) Production Spec into a runnable canvas.
 */
export function compileSpecToCanvas(
  spec: ProductionSpec,
  template: PipelineTemplate,
): CompileResult {
  seq = 0;
  const nodes: PersistedNode[] = [];
  const edges: PersistedEdge[] = [];
  const dropped = new Set<string>();

  const isVideo = spec.global.output.kind === "video";
  const generatorType = isVideo ? "videoGen" : "imageGen";

  if (!isInScope(generatorType, template.toolScope)) {
    dropped.add(generatorType);
    return { canvas: { nodes: [], edges: [] }, droppedOutOfScope: [...dropped] };
  }

  const videoModel = spec.global.models.video ?? DEFAULT_VIDEO_MODEL_ID;
  const imageModel = spec.global.models.image ?? DEFAULT_IMAGE_MODEL_ID;
  const ratio = resolveRatio(spec.global.output.aspect);

  const COL_W = 380; // horizontal gap between shot columns
  const generatorIds: string[] = [];

  // Frame-chaining is on only for multi-shot video templates that opt in AND
  // scope in the Frame Extract node.
  const frameChain =
    isVideo &&
    spec.shots.length > 1 &&
    template.consistency.frameChaining &&
    isInScope("frameExtract", template.toolScope);

  let prevGenId: string | null = null;

  spec.shots.forEach((shot: ProductionShot, i: number) => {
    const x = i * COL_W;

    // 1. Text prompt (compiled, model-ready).
    const prompt = node("textPrompt", { x, y: 0 }, { text: shot.prompt });
    nodes.push(prompt);

    // QA loop config (the inner critic→regen loop): the shot's rubric + the
    // template's regen budget. The guarded generator scores each output with
    // the Seed VLM and regenerates (targeted) up to regenCap.
    const qa = {
      qaChecks: shot.qa?.must ?? spec.qa.must,
      qaMinScore: shot.qa?.minScore ?? spec.qa.minScore,
      regenCap: spec.global.budget.regenCap,
      // Calibration: high-stakes verticals (human publish gate) sample the
      // critic multiple times and median the score; auto-publish ones use 1.
      criticSamples: template.gates.publish === "human" ? 2 : 1,
    };

    // 2. Generator with locked params.
    let genForm: Record<string, unknown>;
    if (isVideo) {
      const model = videoModel;
      genForm = {
        model,
        resolution: resolveResolution(model, shot.resolution ?? spec.global.output.resolution),
        duration: resolveDuration(model, shot.durationS ?? spec.global.output.durationS),
        ratio: shot.ratio ?? ratio,
        // Seed lock: a fixed seed makes the approved final reproducible.
        seed: template.consistency.seedLock && shot.seed != null ? String(shot.seed) : "",
        cameraFixed: false,
        audio: true,
        ...qa,
      };
    } else {
      genForm = {
        model: imageModel,
        size: spec.global.output.imageSize ?? DEFAULT_IMAGE_SIZE,
        seed: template.consistency.seedLock && shot.seed != null ? String(shot.seed) : "",
        ...qa,
      };
    }
    const gen = node(generatorType, { x, y: 330 }, genForm);
    nodes.push(gen);
    generatorIds.push(gen.id);
    edges.push(edge(prompt.id, gen.id, "prompt", "prompt"));

    // 2b. Frame chain: extract the previous clip's last frame and feed it into
    //     this clip's first-frame port (I2V continuity). `at` overshoots the
    //     clip duration; the Frame Extract node clamps to the final frame.
    if (frameChain && i > 0 && prevGenId) {
      const prevDur = spec.shots[i - 1].durationS ?? spec.global.output.durationS ?? 6;
      const fx = node("frameExtract", { x: x - 120, y: 165 }, { at: prevDur });
      nodes.push(fx);
      edges.push(edge(prevGenId, fx.id, "url", "video"));
      edges.push(edge(fx.id, gen.id, "frame", "image"));
    }
    prevGenId = gen.id;

    // 3. Per-shot preview (skip for multi-shot video — the stitch carries the
    //    final preview — but keep for image specs and single-shot video).
    if (!isVideo || spec.shots.length === 1) {
      const prev = node("preview", { x, y: 680 }, {});
      nodes.push(prev);
      edges.push(edge(gen.id, prev.id, "url", "url"));
    }
  });

  // 4. Assembly: multi-shot video → stitch every clip → final preview.
  if (isVideo && spec.shots.length > 1 && isInScope("videoStitch", template.toolScope)) {
    const midX = ((spec.shots.length - 1) * COL_W) / 2;
    const stitch = node("videoStitch", { x: midX, y: 680 }, {});
    nodes.push(stitch);
    for (const gId of generatorIds) edges.push(edge(gId, stitch.id, "url", "videos"));

    const finalPrev = node("preview", { x: midX, y: 940 }, {});
    nodes.push(finalPrev);
    edges.push(edge(stitch.id, finalPrev.id, "url", "url"));
  }

  return { canvas: { nodes, edges }, droppedOutOfScope: [...dropped] };
}
