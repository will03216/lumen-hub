/**
 * Edit presets — the copy that closes the skill gap.
 *
 * WHY THIS FILE IS PRODUCT, NOT CONFIG.
 *
 * PRD §2 names three gaps; the one this file exists for is the *skill* gap.
 * Interactive editing works, but only if the sentence going to Seedream is
 * phrased the way the model expects — end-state imperatives, an explicit
 * preservation clause, and a literal value where the model supports one. That
 * phrasing is a learned skill, and it is exactly the skill a prospect watching
 * a demo does not have. §4's first conclusion is blunt about the consequence:
 * both competitive leaders open with loaded examples rather than an empty box,
 * so **presets are the demo**. A preset's job is therefore not to set a flag —
 * it is to *write the instruction*, and the instruction is what ships.
 *
 * Four groups, and the split is by what the user already knows:
 *
 *   · `task`    — the four canonical Lumina demos (remove / recolour / replace
 *                 a surface / move along an arrow). These are the "what can
 *                 this thing even do" answer, so they lead.
 *   · `colour`  — exact hex response. The instruction states the hex LITERALLY
 *                 because that is the capability under demonstration: a model
 *                 that honours `#C8102E` and not merely "a red" is the claim,
 *                 and a preset that said "brand red" would silently stop
 *                 testing it. The swatch is the UI; the hex is the payload.
 *   · `material`— surface substitution with structure held fixed. Every one of
 *                 these instructions ends in the same preservation clause,
 *                 deliberately: the failure mode for a material edit is the
 *                 model re-modelling the object rather than re-skinning it.
 *   · `text`    — multilingual rendering, ten scripts. Each carries REAL
 *                 sample text plus the per-script property most likely to be
 *                 mangled (Arabic joining, Devanagari's shirorekha, Thai's
 *                 stacked marks). "Render some Chinese" is not a test; "render
 *                 晨光咖啡 with these exact glyphs" is.
 *
 * THREE RULES THE COPY FOLLOWS, because they are what makes the difference
 * between a preset and a placeholder:
 *
 * 1. Describe the END STATE, never the current fault. "Recolour the sofa to
 *    exactly #002FA7" outperforms "the sofa is the wrong colour" — the second
 *    leaves the model to infer a target it was never given.
 * 2. Say what must NOT change. Region tags scope *where* the edit lands; only
 *    prose scopes *what about it* may move. Without "keeping its existing
 *    material, texture, reflections and shading" a recolour comes back as a
 *    different object that happens to be the right colour.
 * 3. Read correctly with no subject. `instruction()` is called with no
 *    argument the moment a user clicks a chip before typing anything, so every
 *    fallback noun phrase is written to stand on its own rather than emitting
 *    a hole. Nothing here may ever interpolate `undefined` into the prompt box.
 *
 * `needsMark` is honest rather than uniform. It is true only where the sentence
 * is *meaningless* without a region — you cannot remove "it", and text has to
 * land somewhere. Colour and material fall back to the dominant subject, which
 * is a real one-click demo on a bare canvas and the reason the strip is not
 * entirely greyed out on first load.
 *
 * Pure data and pure functions: no React, no store, no provider import. The
 * strip renders it, the agent's `set_instruction` could just as easily consume
 * it, and both get the same string.
 */

export type EditPreset = {
  id: string;
  group: "colour" | "material" | "text" | "task";
  label: string;
  /** One line shown under the label. */
  hint: string;
  /** Produces the instruction to place in the prompt box. `subject` is what
   *  the user's mark refers to; when absent the copy must still read well. */
  instruction: (subject?: string) => string;
  /** Hex, for the colour group — rendered as a swatch. */
  swatch?: string;
  /** True when the preset only makes sense with a mark already placed. */
  needsMark?: boolean;
};

/**
 * Words that already determine a noun phrase.
 *
 * A caller may hand us either "sofa" (from a label) or "the sofa" (from typed
 * prose), and gluing an article onto the second produces "the the sofa". Cheap
 * to detect, and the alternative — demanding a normalized subject from every
 * call site — pushes the problem onto the agent, which will not comply.
 */
const DETERMINED =
  /^(the|a|an|this|that|these|those|my|your|his|her|its|our|their|all|both|each|every)\b/i;

/**
 * The noun phrase the instruction talks about.
 *
 * The fallback is per-preset rather than global because "the marked object"
 * and "the marked surface" are not interchangeable in a sentence about
 * replacing a material, and a preset that reads awkwardly is a preset the
 * demoer edits by hand — which is the friction this whole file removes.
 */
function subjectPhrase(subject: string | undefined, fallback: string): string {
  const s = subject?.trim().replace(/\s+/g, " ");
  if (!s) return fallback;
  return DETERMINED.test(s) ? s : `the ${s}`;
}

/** Appended to every colour and material instruction. See rule 2 above. */
const KEEP_LIGHTING =
  "Keep the existing lighting, shadows and reflections, and leave the rest of the image unchanged.";

// ─────────────────────────── Task ─────────────────────────────────────────

const TASK_PRESETS: EditPreset[] = [
  {
    id: "task-remove",
    group: "task",
    label: "Remove object",
    hint: "Delete it and rebuild what was behind",
    needsMark: true,
    instruction: (s) =>
      `Remove ${subjectPhrase(s, "the marked object")} completely. Rebuild the area it occupied from the surrounding scene so it looks like the object was never there, matching the neighbouring texture, perspective, lighting and cast shadows. Everything else in the image stays exactly as it is.`,
  },
  {
    id: "task-recolour",
    group: "task",
    label: "Recolour",
    hint: "Change colour, keep the material",
    needsMark: true,
    instruction: (s) =>
      // A concrete colour rather than a placeholder: the sentence has to be
      // renderable the instant it lands in the prompt box, and two words are
      // faster to overtype than a bracketed blank is to notice and fill.
      `Change the colour of ${subjectPhrase(s, "the marked object")} to a deep forest green, keeping its existing material, texture, reflections and shading exactly as they are. No other colour in the image changes. ${KEEP_LIGHTING}`,
  },
  {
    id: "task-replace-surface",
    group: "task",
    label: "Replace surface",
    hint: "Swap the material, hold the shape",
    needsMark: true,
    instruction: (s) =>
      `Replace the surface of ${subjectPhrase(s, "the marked surface")} with smooth dark walnut with a fine straight grain and a satin finish. Hold the shape, edges, proportions and perspective identical — this is a change of surface only. ${KEEP_LIGHTING}`,
  },
  {
    id: "task-move-along-arrow",
    group: "task",
    label: "Move to arrow",
    hint: "Relocate where the arrow points",
    needsMark: true,
    instruction: (s) =>
      `Move ${subjectPhrase(s, "the marked object")} to the position the arrow points to. Keep its identity, proportions and orientation, rescale it for its new distance from the camera, and give it a contact shadow consistent with the scene's light direction. Rebuild the area it vacated from the surrounding background. ${KEEP_LIGHTING}`,
  },
];

// ─────────────────────────── Colour ───────────────────────────────────────

/**
 * Ten swatches, chosen for demo legibility rather than palette theory: two
 * saturated reds and three blues because those are the hues a viewer can
 * eyeball against a physical brand reference, one warm and one deep green as
 * the hues models most often drift on, and three neutrals because "exactly
 * #3C3F41, not black" is the hardest and most convincing case in the set.
 */
const COLOURS: Array<{ id: string; label: string; hex: string; hint: string }> =
  [
    {
      id: "signal-red",
      label: "Signal Red",
      hex: "#C8102E",
      hint: "Deep brand red",
    },
    {
      id: "scarlet",
      label: "Scarlet",
      hex: "#FF2800",
      hint: "Hot orange-red",
    },
    {
      id: "klein-blue",
      label: "Klein Blue",
      hex: "#002FA7",
      hint: "Dense ultramarine",
    },
    {
      id: "cobalt",
      label: "Cobalt",
      hex: "#0057B8",
      hint: "Clean mid blue",
    },
    {
      id: "cyan",
      label: "Process Cyan",
      hex: "#00A3E0",
      hint: "Bright sky cyan",
    },
    {
      id: "racing-green",
      label: "Racing Green",
      hex: "#004225",
      hint: "Dark British green",
    },
    {
      id: "saffron",
      label: "Saffron",
      hex: "#FFB81C",
      hint: "Warm golden yellow",
    },
    {
      id: "bone",
      label: "Bone White",
      hex: "#F2EFE6",
      hint: "Off-white, warm",
    },
    {
      id: "graphite",
      label: "Graphite",
      hex: "#3C3F41",
      hint: "Neutral dark grey",
    },
    { id: "jet", label: "Jet Black", hex: "#101012", hint: "Near-black" },
  ];

const COLOUR_PRESETS: EditPreset[] = COLOURS.map((c) => ({
  id: `colour-${c.id}`,
  group: "colour",
  label: c.label,
  hint: c.hint,
  swatch: c.hex,
  // Not gated on a mark: with no region the sentence still names a target, and
  // a one-click colour change on a freshly loaded image is the fastest proof
  // the editor works at all.
  instruction: (s) =>
    // The hex is stated literally, twice-over explicit ("exactly", "this exact
    // colour code"), because exact-colour response is the capability on trial.
    // An approximation is a failed demo that looks like a success.
    `Recolour ${subjectPhrase(s, "the main subject")} to exactly ${c.hex}, this exact colour code and no approximation of it. Keep its existing material, texture, reflections and shading — only the hue changes. No other colour in the image is affected. ${KEEP_LIGHTING}`,
}));

// ─────────────────────────── Material ─────────────────────────────────────

/**
 * Each entry carries the *descriptive* material phrase, not the label. "Dark
 * walnut" is what the button says; "dark walnut with a fine straight grain and
 * a satin finish" is what the model needs, because the grain and the finish are
 * what stop it returning generic brown wood.
 */
const MATERIALS: Array<{
  id: string;
  label: string;
  hint: string;
  described: string;
}> = [
  {
    id: "brushed-steel",
    label: "Brushed steel",
    hint: "Fine parallel grain",
    described:
      "brushed stainless steel with a fine parallel grain and soft, stretched anisotropic highlights",
  },
  {
    id: "dark-walnut",
    label: "Dark walnut",
    hint: "Straight grain, satin",
    described:
      "dark walnut with a fine straight grain, subtle figure and a satin finish",
  },
  {
    id: "frosted-glass",
    label: "Frosted glass",
    hint: "Translucent, diffusing",
    described:
      "frosted glass that is translucent and softly diffuses whatever sits behind it, with clean polished edges and a faint edge highlight",
  },
  {
    id: "matte-ceramic",
    label: "Matte ceramic",
    hint: "Even, no specular",
    described:
      "matte glazed ceramic with an even, slightly powdery finish and almost no specular highlight",
  },
  {
    id: "polished-marble",
    label: "Polished marble",
    hint: "Grey veining, mirror finish",
    described:
      "polished white marble with fine grey veining and a mirror-smooth surface that picks up soft reflections",
  },
  {
    id: "brushed-brass",
    label: "Brushed brass",
    hint: "Warm gold, circular grain",
    described:
      "brushed brass with a warm gold tone, a fine circular grain and slightly darkened recesses",
  },
  {
    id: "worn-leather",
    label: "Worn leather",
    hint: "Pores, creasing, low sheen",
    described:
      "worn full-grain leather with visible pores, soft natural creasing at the stress points and a low sheen",
  },
  {
    id: "concrete",
    label: "Concrete",
    hint: "Board-formed, dry matte",
    described:
      "board-formed concrete with a fine aggregate speckle, faint form lines and a dry matte surface",
  },
];

const MATERIAL_PRESETS: EditPreset[] = MATERIALS.map((m) => ({
  id: `material-${m.id}`,
  group: "material",
  label: m.label,
  hint: m.hint,
  instruction: (s) =>
    // "Change of surface only" is load-bearing. Without it the model treats a
    // material swap as licence to redesign the object into something that
    // would plausibly be made of that material.
    `Change the surface of ${subjectPhrase(s, "the main surface")} to ${m.described}. Hold the object's shape, edges, proportions, scale and perspective exactly as they are — this is a change of surface material only, not a change of object. ${KEEP_LIGHTING}`,
}));

// ─────────────────────────── Text ─────────────────────────────────────────

/**
 * Ten scripts, each with real sample text and the property that script fails
 * on first.
 *
 * `pitfall` is the whole value of this group. Every image model can put
 * *something* Arabic-looking on a sign; the ones worth demoing preserve
 * right-to-left order and cursive joining. Naming the failure in the prompt is
 * both a better instruction and a scoring rubric for whoever is watching.
 */
const SCRIPTS: Array<{
  id: string;
  label: string;
  script: string;
  sample: string;
  pitfall: string;
}> = [
  {
    id: "latin",
    label: "Latin",
    script: "Latin",
    sample: "MORNING LIGHT COFFEE",
    pitfall: "letterforms, casing and even letter spacing",
  },
  {
    id: "hans",
    label: "简体中文",
    script: "Simplified Chinese",
    sample: "晨光咖啡",
    pitfall: "simplified forms, stroke counts and stroke order",
  },
  {
    id: "japanese",
    label: "日本語",
    script: "Japanese",
    sample: "朝の光 コーヒー",
    pitfall:
      "the mix of kanji, hiragana and katakana, each character kept in its own script",
  },
  {
    id: "korean",
    label: "한국어",
    script: "Korean",
    sample: "아침빛 커피",
    pitfall: "hangul syllable-block composition and jamo placement",
  },
  {
    id: "arabic",
    label: "العربية",
    script: "Arabic",
    sample: "قهوة ضوء الصباح",
    pitfall:
      "right-to-left order, cursive letter joining and correct initial, medial and final letter forms",
  },
  {
    id: "devanagari",
    label: "हिन्दी",
    script: "Devanagari",
    sample: "सुबह की रोशनी कॉफ़ी",
    pitfall:
      "conjunct clusters, matra placement and an unbroken shirorekha headline",
  },
  {
    id: "cyrillic",
    label: "Кириллица",
    script: "Cyrillic",
    sample: "УТРЕННИЙ СВЕТ КОФЕ",
    pitfall:
      "true Cyrillic letterforms — no Latin lookalikes substituted for Я, Д or И",
  },
  {
    id: "thai",
    label: "ไทย",
    script: "Thai",
    sample: "กาแฟแสงเช้า",
    pitfall:
      "vowel and tone marks stacked correctly above and below the baseline, and no word spaces inserted",
  },
  {
    id: "hebrew",
    label: "עברית",
    script: "Hebrew",
    sample: "קפה אור הבוקר",
    pitfall: "right-to-left order and correct final letter forms",
  },
  {
    id: "greek",
    label: "Ελληνικά",
    script: "Greek",
    sample: "ΚΑΦΕΣ ΠΡΩΙΝΟ ΦΩΣ",
    pitfall: "Greek letterforms and accent placement",
  },
];

const TEXT_PRESETS: EditPreset[] = SCRIPTS.map((t) => ({
  id: `text-${t.id}`,
  group: "text",
  label: t.label,
  hint: `${t.script} sample text`,
  // Text has to land somewhere specific. Without a region the model chooses,
  // and it chooses the middle of the frame — which reads as a broken feature
  // rather than an unscoped request.
  needsMark: true,
  instruction: (s) =>
    `Render the ${t.script} text "${t.sample}" onto ${subjectPhrase(s, "the marked region")}. Reproduce it character for character with exact spelling and exact glyph shapes, preserving ${t.pitfall}. Do not invent, garble, drop or add characters, and do not translate or transliterate it. Fit the text to the surface's own perspective, curvature and lighting, and leave everything else in the image unchanged.`,
}));

// ─────────────────────────── Registry ─────────────────────────────────────

/**
 * Declaration order is display order, and `task` leads on purpose: PRD §4 says
 * the demo opens on a loaded example, so the first thing under the prompt bar
 * should be a whole canonical edit rather than a colour chip.
 */
export const EDIT_PRESETS: readonly EditPreset[] = [
  ...TASK_PRESETS,
  ...COLOUR_PRESETS,
  ...MATERIAL_PRESETS,
  ...TEXT_PRESETS,
];

export function presetsByGroup(group: EditPreset["group"]): EditPreset[] {
  return EDIT_PRESETS.filter((p) => p.group === group);
}

export function findPreset(id: string): EditPreset | undefined {
  return EDIT_PRESETS.find((p) => p.id === id);
}
