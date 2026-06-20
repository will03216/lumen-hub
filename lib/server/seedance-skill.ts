/**
 * Server-side loader for the bundled Seedance Claude skill's reference docs
 * (`claude_skill/references/*.md`). It replicates the skill's "MUST-READ
 * table": a core set is always loaded, and extra docs are loaded conditionally
 * based on what the raw brief mentions — so the single optimization call is
 * grounded in the same authoritative guidance an agent running the skill would
 * read, not just the model's priors.
 *
 * Docs are static, so reads are memoized. If the directory is absent (e.g. a
 * deploy that didn't ship `claude_skill/`), every read fails gracefully and the
 * route falls back to the embedded condensed prompt.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { readFile } from "fs/promises";
import { join } from "path";

const REFS_DIR = join(process.cwd(), "claude_skill", "references");

/** Memoized doc cache. `null` = confirmed-missing, so we don't re-stat it. */
const docCache = new Map<string, string | null>();

async function readDoc(name: string): Promise<string | null> {
  const cached = docCache.get(name);
  if (cached !== undefined) return cached;
  try {
    const content = await readFile(join(REFS_DIR, `${name}.md`), "utf8");
    docCache.set(name, content);
    return content;
  } catch {
    docCache.set(name, null);
    return null;
  }
}

/** Always-loaded craft + safety docs — the universal backbone of any prompt. */
const CORE_DOCS = [
  "prompt-guidance",
  "prompt-prose-craft",
  "duration-calculus",
  "shot-design",
  "safety",
] as const;

/** Conditional docs, mirroring seedance.md's MUST-READ table. */
const CONDITIONAL_DOCS: { doc: string; test: RegExp }[] = [
  { doc: "audio", test: /\b(say|says|said|speak|speaks|dialogue|voice|voiceover|lip[- ]?sync|sing|sings|song|music|narrat|whisper|shout|chant)\b/i },
  { doc: "performance-direction", test: /\b(cry|cries|crying|tears?|smile|smiles|laugh|angry|anger|fear|afraid|sad|sorrow|emotion|emotional|expression|grief|joy|reacts?|trembl)\b/i },
  { doc: "character-card", test: /\b(character|hero|heroine|protagonist|recurring|same (man|woman|person|girl|boy)|mascot)\b/i },
  { doc: "narrative-design", test: /\b(story|storyline|commercial|advert|advertisement|\bad\b|episode|narrative|trailer|sequence|chapter)\b/i },
  { doc: "color-design", test: /\b(colou?r|palette|grade|grading|teal|orange|monochrome|sepia|tone|hue|saturation)\b/i },
  { doc: "genre-grammar", test: /\b(horror|noir|romance|romantic|thriller|documentary|sci[- ]?fi|science fiction|western|fantasy|action|comedy|drama|cyberpunk|war film)\b/i },
  { doc: "visual-language", test: /\b(motif|symbol|symbolic|metaphor|\bpov\b|point of view|blocking|foreground|background depth|mirror|reflection|silhouette)\b/i },
  { doc: "production-design", test: /\b(period|vintage|retro|1920|1930|1940|1950|1960|1970|1980|1990|medieval|victorian|futuristic|prop|props|costume|wardrobe|set design|era)\b/i },
  { doc: "aspect-ratio", test: /\b(9:16|16:9|1:1|4:3|21:9|2\.39|vertical|portrait|landscape|widescreen|aspect|ratio|tiktok|reels?|shorts?|billboard)\b/i },
  { doc: "continuity-and-editing", test: /\b(montage|match cut|j[- ]?cut|l[- ]?cut|cross[- ]?cut|180|screen direction|pacing|rhythm|scene change)\b/i },
  { doc: "assets", test: /\b(portrait|face|reference image|headshot|selfie|photo of|likeness)\b/i },
];

export type SkillDoc = { name: string; content: string };

export type LoadedSkill = {
  /** Always-on docs (stable across requests → cacheable prefix). */
  core: SkillDoc[];
  /** Brief-specific docs (varies per request). */
  conditional: SkillDoc[];
  /** Doc names selected, for logging / debug. */
  selected: string[];
};

/**
 * Resolve the doc set for a brief and read it from disk. Multi-shot briefs and
 * non-T2V modes pull extra docs the keyword scan might miss.
 */
export async function loadSkillDocs(
  rawPrompt: string,
  mode: string,
  shotCount: number,
  hasReferences = false,
): Promise<LoadedSkill> {
  const hay = rawPrompt.toLowerCase();

  const conditionalNames = new Set<string>();
  for (const { doc, test } of CONDITIONAL_DOCS) {
    if (test.test(hay)) conditionalNames.add(doc);
  }
  // Structural triggers independent of wording.
  if (shotCount > 1) conditionalNames.add("continuity-and-editing");
  if (hasReferences || mode === "i2v" || mode === "r2v" || mode === "v2v") {
    conditionalNames.add("assets");
  }

  const core: SkillDoc[] = [];
  for (const name of CORE_DOCS) {
    const content = await readDoc(name);
    if (content) core.push({ name, content });
  }

  const conditional: SkillDoc[] = [];
  for (const name of conditionalNames) {
    const content = await readDoc(name);
    if (content) conditional.push({ name, content });
  }

  return {
    core,
    conditional,
    selected: [...core.map((d) => d.name), ...conditional.map((d) => d.name)],
  };
}

/** Render a doc list into one delimited text block for a system message. */
export function renderDocsBlock(docs: SkillDoc[]): string {
  return docs
    .map((d) => `===== SEEDANCE REFERENCE: ${d.name} =====\n\n${d.content.trim()}`)
    .join("\n\n");
}

const DOCS_PREAMBLE =
  "The following are the authoritative Seedance reference documents. Apply every relevant rule; a rule you cannot point to as applied is a rule you did not use.\n\n";

/**
 * Build a system message that grounds an Anthropic call in the skill's docs:
 *   block 1: the caller's base prompt (preset / directive)
 *   block 2: CORE docs — static across requests → marked as the cached prefix
 *   block 3: brief-specific conditional docs (varies → uncached)
 *
 * Returns the base prompt as a plain string (no array) when the docs directory
 * is unavailable, so callers degrade gracefully to their embedded prompt.
 */
export async function buildGroundedSystem(
  baseSystemPrompt: string,
  opts: { brief: string; mode?: string; shotCount?: number; hasReferences?: boolean },
): Promise<{ system: string | Anthropic.TextBlockParam[]; selectedDocs: string[] }> {
  const skill = await loadSkillDocs(
    opts.brief,
    opts.mode ?? "t2v",
    opts.shotCount ?? 1,
    opts.hasReferences ?? false,
  );
  if (skill.core.length === 0) {
    return { system: baseSystemPrompt, selectedDocs: [] };
  }
  const blocks: Anthropic.TextBlockParam[] = [
    { type: "text", text: baseSystemPrompt },
    {
      type: "text",
      text: DOCS_PREAMBLE + renderDocsBlock(skill.core),
      cache_control: { type: "ephemeral" },
    },
  ];
  if (skill.conditional.length > 0) {
    blocks.push({ type: "text", text: renderDocsBlock(skill.conditional) });
  }
  return { system: blocks, selectedDocs: skill.selected };
}
