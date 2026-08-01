/**
 * Screenplay script format — parser and validator.
 *
 * Implements the standard short-drama script format: front matter (title,
 * outline, character bios) followed by a body of episodes and scenes, where
 * each scene carries a slugline, a character list, action lines and dialogue.
 *
 * Two jobs, deliberately separated:
 *
 *   parseScript()     — lenient. Extracts whatever structure is present and
 *                       never throws. A malformed script still yields usable
 *                       scenes, because refusing to parse leaves the user with
 *                       nothing to fix.
 *   validateScript()  — strict. Reports every missing required field with a
 *                       line number, so the UI can point at the problem.
 *
 * Required fields (marked * in the spec): title, episode number, scene number,
 * slugline (location + time + INT./EXT.), characters, action, dialogue.
 */

// ─────────────────────────── Types ────────────────────────────────────────

export type Setting = "INT." | "EXT.";
export type TimeOfDay = "Day" | "Night";

export type Slugline = {
  /** Where the scene happens, with the time/setting tokens removed. */
  location: string;
  timeOfDay: TimeOfDay | null;
  setting: Setting | null;
  /** The heading exactly as written, for round-tripping and error messages. */
  raw: string;
};

/** Off-screen vs voice-over. Both are heard without the speaker on camera;
 *  OS is the character's own inner voice, VO is narration. */
export type Delivery = "OS" | "VO";

export type ActionBeat = {
  kind: "action";
  text: string;
  /** A transition line ("Cut to:", "Fade out.") rather than staged action. */
  transition: boolean;
  line: number;
};

export type DialogueBeat = {
  kind: "dialogue";
  character: string;
  /** Parenthetical emotion tag — optional per the spec. */
  emotion: string | null;
  delivery: Delivery | null;
  text: string;
  line: number;
};

export type Beat = ActionBeat | DialogueBeat;

/** A memory or dream sequence, opened and closed by paired markers. */
export type SequenceKind = "flashback" | "flash-forward";

export type ParsedScene = {
  /** Episode this scene belongs to. */
  episode: number;
  episodeTitle: string | null;
  /** "Episode-Scene" identifier, e.g. "1-1". */
  number: string;
  slugline: Slugline;
  characters: string[];
  beats: Beat[];
  /** Set when the scene sits inside a 【Flashback】/【Flash Forward】 block. */
  sequence: SequenceKind | null;
  line: number;
};

export type CharacterBio = { name: string; bio: string };

export type IssueSeverity = "error" | "warning";

export type Issue = {
  severity: IssueSeverity;
  /** Which required field is at fault — lets the UI group by cause. */
  field: string;
  message: string;
  line: number | null;
  /** Scene identifier when the issue is scene-scoped. */
  scene: string | null;
};

export type ParsedScript = {
  title: string | null;
  outline: string | null;
  characterBios: CharacterBio[];
  scenes: ParsedScene[];
};

// ─────────────────────────── Patterns ─────────────────────────────────────

// Title marks are 《》 in the spec; a plain "Title:" label is accepted too
// because that is what people type when the marks are awkward to enter.
const TITLE_MARKS = /^\s*《\s*(.+?)\s*》\s*$/;
const TITLE_LABEL = /^\s*title\s*[:：]\s*(.+)$/i;
const OUTLINE_LABEL = /^\s*outline\s*[:：]?\s*(.*)$/i;
const BIOS_LABEL = /^\s*character\s+bios?\s*[:：]?\s*(.*)$/i;

// "Episode 1" or "Episode 1: Crisis on Camera".
const EPISODE = /^\s*episode\s+(\d+)\s*[:：]?\s*(.*)$/i;

// "1-1 Day EXT. Riverside Plaza" or "Scene 1-1 Hospital Office Day INT."
const SCENE_HEADER = /^\s*(?:scene\s+)?(\d+\s*[-–—]\s*\d+)\s+(.+)$/i;

// Both ASCII and ideographic separators, per the spec.
const CHARACTERS_LABEL = /^\s*characters?\s*[:：]\s*(.+)$/i;
const NAME_SEPARATORS = /[,，、;；]/;

const SETTING_TOKEN = /\b(INT|EXT)\b\.?/i;
const TIME_TOKEN = /\b(day|night)\b/i;

/** △ leads into action; the spec allows action without it. */
const ACTION_LEAD = /^\s*[△▲]\s*/;

const FLASHBACK_OPEN = /【\s*flash\s*back\s*】|【\s*回忆\s*】/i;
const FLASHFORWARD_OPEN = /【\s*flash\s*forward\s*】|【\s*闪前\s*】/i;
const SEQUENCE_MARKER = /【\s*(?:flash\s*back|flash\s*forward|回忆|闪前)\s*】/gi;

/**
 * "Name (Emotion): text", emotion optional.
 *
 * The name is bounded to keep a prose sentence containing a colon from being
 * mistaken for dialogue, and must not contain sentence punctuation.
 */
const DIALOGUE = /^\s*([^:：()【】]{1,40}?)\s*(?:\(([^)]*)\))?\s*[:：]\s*(.+)$/;

/** Transitions read like dialogue ("Cut to: …") but are action. */
const TRANSITIONS = [
  "cut to", "cut back to", "smash cut", "smash cut to", "match cut",
  "match cut to", "fade in", "fade out", "fade to", "dissolve to",
  "jump cut", "jump cut to", "wipe to", "intercut", "back to scene",
  "title", "montage", "end montage", "flashback", "end flashback",
];

/** Inline "(Monologue/OS)" or a bare "OS:" / "VO:" speaker. */
const INLINE_DELIVERY = /\(([^)]*\b(?:OS|VO)\b[^)]*)\)\s*/i;

// ─────────────────────────── Parsing ──────────────────────────────────────

type Line = { text: string; n: number };

/**
 * Parse a script into structured scenes. Never throws — anything it cannot
 * classify becomes an action beat, so no content is silently dropped.
 */
export function parseScript(source: string): ParsedScript {
  const lines: Line[] = source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((text, i) => ({ text, n: i + 1 }));

  const firstEpisode = lines.findIndex((l) => EPISODE.test(l.text));
  const frontLines = firstEpisode === -1 ? lines : lines.slice(0, firstEpisode);
  const bodyLines = firstEpisode === -1 ? [] : lines.slice(firstEpisode);

  const front = parseFrontMatter(frontLines);
  const scenes = parseBody(bodyLines);

  return { ...front, scenes };
}

function parseFrontMatter(lines: Line[]): Omit<ParsedScript, "scenes"> {
  let title: string | null = null;
  const outlineParts: string[] = [];
  const characterBios: CharacterBio[] = [];
  let section: "none" | "outline" | "bios" = "none";

  for (const { text } of lines) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const marked = TITLE_MARKS.exec(trimmed);
    if (marked) { title = marked[1].trim(); section = "none"; continue; }

    const labelled = TITLE_LABEL.exec(trimmed);
    if (labelled) { title = labelled[1].trim(); section = "none"; continue; }

    const outline = OUTLINE_LABEL.exec(trimmed);
    if (outline) {
      section = "outline";
      if (outline[1].trim()) outlineParts.push(outline[1].trim());
      continue;
    }

    const bios = BIOS_LABEL.exec(trimmed);
    if (bios) {
      section = "bios";
      if (bios[1].trim()) pushBio(characterBios, bios[1].trim());
      continue;
    }

    if (section === "bios") pushBio(characterBios, trimmed);
    else if (section === "outline") outlineParts.push(trimmed);
    // Untitled leading prose before any label: treat as outline, since that's
    // what a one-line summary at the top of a file almost always is.
    else if (title !== null) outlineParts.push(trimmed);
  }

  return {
    title,
    outline: outlineParts.length ? outlineParts.join(" ") : null,
    characterBios,
  };
}

function pushBio(into: CharacterBio[], raw: string): void {
  const line = raw.replace(/^[-–—*•]\s*/, "").trim();
  if (!line) return;
  // "Jack, 30, Surgeon, calm personality" → name is the first field.
  const [name, ...rest] = line.split(NAME_SEPARATORS);
  into.push({
    name: name.trim(),
    bio: rest.join(",").trim() || line,
  });
}

function parseBody(lines: Line[]): ParsedScene[] {
  const scenes: ParsedScene[] = [];
  let episode = 0;
  let episodeTitle: string | null = null;
  let sequence: SequenceKind | null = null;
  let current: ParsedScene | null = null;

  for (const { text, n } of lines) {
    const trimmed = text.trim();
    if (!trimmed) continue;

    const ep = EPISODE.exec(trimmed);
    if (ep) {
      episode = Number(ep[1]);
      episodeTitle = ep[2].trim() || null;
      continue;
    }

    const header = SCENE_HEADER.exec(trimmed);
    if (header) {
      current = {
        episode,
        episodeTitle,
        number: header[1].replace(/\s+/g, "").replace(/[–—]/g, "-"),
        slugline: parseSlugline(header[2]),
        characters: [],
        beats: [],
        sequence,
        line: n,
      };
      scenes.push(current);
      continue;
    }

    // Sequence markers toggle; they can share a line with other content.
    if (SEQUENCE_MARKER.test(trimmed)) {
      SEQUENCE_MARKER.lastIndex = 0;
      const opening = FLASHBACK_OPEN.test(trimmed)
        ? "flashback"
        : FLASHFORWARD_OPEN.test(trimmed)
          ? "flash-forward"
          : null;
      // Paired markers: the first occurrence opens, the next closes.
      sequence = sequence ? null : opening;
      if (current) current.sequence = current.sequence ?? sequence;
      const remainder = trimmed.replace(SEQUENCE_MARKER, "").trim();
      SEQUENCE_MARKER.lastIndex = 0;
      if (!remainder) continue;
      if (current) current.beats.push(actionBeat(remainder, n));
      continue;
    }

    if (!current) continue; // stray line before any scene header

    const chars = CHARACTERS_LABEL.exec(trimmed);
    if (chars) {
      current.characters = chars[1]
        .split(NAME_SEPARATORS)
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }

    const dialogue = parseDialogue(trimmed, n);
    if (dialogue) { current.beats.push(dialogue); continue; }

    current.beats.push(actionBeat(trimmed, n));
  }

  return scenes;
}

function actionBeat(raw: string, line: number): ActionBeat {
  const text = raw.replace(ACTION_LEAD, "").trim();
  const head = text.toLowerCase().replace(/[:：].*$/, "").trim();
  return { kind: "action", text, transition: TRANSITIONS.includes(head), line };
}

function parseDialogue(raw: string, line: number): DialogueBeat | null {
  const m = DIALOGUE.exec(raw);
  if (!m) return null;

  const speakerRaw = m[1].trim();
  if (!speakerRaw) return null;
  // A transition is not a speaker.
  if (TRANSITIONS.includes(speakerRaw.toLowerCase())) return null;
  // Prose that happens to contain a colon: a speaker has no sentence marks.
  if (/[.!?。！？]/.test(speakerRaw)) return null;

  let text = m[3].trim();
  let delivery: Delivery | null = null;

  // Bare "VO:" / "OS:" speaker — narration with no named character.
  const bare = /^(OS|VO)$/i.exec(speakerRaw);
  if (bare) {
    delivery = bare[1].toUpperCase() as Delivery;
    return { kind: "dialogue", character: bare[1].toUpperCase(), emotion: null, delivery, text, line };
  }

  // Trailing "(OS)" on the name, or a leading "(Monologue/OS)" on the text.
  const emotion = m[2]?.trim() || null;
  if (emotion && /\b(OS|VO)\b/i.test(emotion)) {
    delivery = /\bVO\b/i.test(emotion) ? "VO" : "OS";
  }
  const inline = INLINE_DELIVERY.exec(text);
  if (inline) {
    delivery = /\bVO\b/i.test(inline[1]) ? "VO" : "OS";
    text = text.replace(INLINE_DELIVERY, "").trim();
  }

  return {
    kind: "dialogue",
    character: speakerRaw,
    emotion: emotion && !/^\s*(OS|VO)\s*$/i.test(emotion) ? emotion : null,
    delivery,
    text,
    line,
  };
}

function parseSlugline(raw: string): Slugline {
  const text = raw.trim();

  const settingMatch = SETTING_TOKEN.exec(text);
  const setting: Setting | null = settingMatch
    ? (settingMatch[1].toUpperCase() + ".") as Setting
    : null;

  const timeMatch = TIME_TOKEN.exec(text);
  const timeOfDay: TimeOfDay | null = timeMatch
    ? ((timeMatch[1][0].toUpperCase() + timeMatch[1].slice(1).toLowerCase()) as TimeOfDay)
    : null;

  // Whatever remains once the time/setting tokens are removed is the location.
  const location = text
    .replace(SETTING_TOKEN, " ")
    .replace(TIME_TOKEN, " ")
    .replace(/[,，]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { location, timeOfDay, setting, raw: text };
}

// ─────────────────────────── Validation ───────────────────────────────────

/**
 * Report every missing required field. Ordered by line so the list reads
 * top-to-bottom like the file itself.
 */
export function validateScript(script: ParsedScript): Issue[] {
  const issues: Issue[] = [];

  if (!script.title) {
    issues.push({
      severity: "error",
      field: "title",
      message: "Missing title. Put the full title in 《 》 marks on the first line.",
      line: 1,
      scene: null,
    });
  }
  if (!script.outline) {
    issues.push({
      severity: "warning",
      field: "outline",
      message: "No outline found. A 1–3 sentence summary improves shot generation.",
      line: null,
      scene: null,
    });
  }
  if (script.characterBios.length === 0) {
    issues.push({
      severity: "warning",
      field: "characterBios",
      message: "No character bios found. Bios help keep characters consistent across shots.",
      line: null,
      scene: null,
    });
  }

  if (script.scenes.length === 0) {
    issues.push({
      severity: "error",
      field: "scene",
      message:
        'No scenes found. Each scene needs an "Episode N" line and a scene number like "1-1" followed by the heading.',
      line: null,
      scene: null,
    });
    return sortIssues(issues);
  }

  const seen = new Map<string, number>();

  for (const scene of script.scenes) {
    const at = scene.line;
    const id = scene.number;

    if (!scene.episode) {
      issues.push({
        severity: "error",
        field: "episode",
        message: `Scene ${id} is not inside an episode. Add an "Episode N" line above it.`,
        line: at,
        scene: id,
      });
    }

    const prior = seen.get(id);
    if (prior !== undefined) {
      issues.push({
        severity: "error",
        field: "sceneNumber",
        message: `Duplicate scene number ${id} (already used on line ${prior}). Every scene needs a unique identifier.`,
        line: at,
        scene: id,
      });
    } else {
      seen.set(id, at);
    }

    // All three slugline elements are required; order is not.
    if (!scene.slugline.location) {
      issues.push({
        severity: "error",
        field: "slugline.location",
        message: `Scene ${id} has no location in its heading.`,
        line: at,
        scene: id,
      });
    }
    if (!scene.slugline.timeOfDay) {
      issues.push({
        severity: "error",
        field: "slugline.time",
        message: `Scene ${id} heading is missing the time — add Day or Night.`,
        line: at,
        scene: id,
      });
    }
    if (!scene.slugline.setting) {
      issues.push({
        severity: "error",
        field: "slugline.setting",
        message: `Scene ${id} heading is missing the setting — add INT. or EXT.`,
        line: at,
        scene: id,
      });
    }

    if (scene.characters.length === 0) {
      issues.push({
        severity: "error",
        field: "characters",
        message: `Scene ${id} has no "Characters:" line listing who appears.`,
        line: at,
        scene: id,
      });
    }

    const actions = scene.beats.filter((b) => b.kind === "action" && !b.transition);
    if (actions.length === 0) {
      issues.push({
        severity: "error",
        field: "action",
        message: `Scene ${id} has no action or visual description.`,
        line: at,
        scene: id,
      });
    }

    const dialogue = scene.beats.filter((b): b is DialogueBeat => b.kind === "dialogue");
    if (dialogue.length === 0) {
      issues.push({
        severity: "warning",
        field: "dialogue",
        message: `Scene ${id} has no dialogue. Silent scenes are valid, but check the "Name (Emotion): text" format if you expected some.`,
        line: at,
        scene: id,
      });
    }

    // A speaker who never appears in the Characters line is usually a typo —
    // except OS/VO narration, which is off-screen by definition.
    if (scene.characters.length > 0) {
      const known = new Set(scene.characters.map(normalizeName));
      for (const beat of dialogue) {
        if (beat.delivery) continue;
        if (!known.has(normalizeName(beat.character))) {
          issues.push({
            severity: "warning",
            field: "characters",
            message: `"${beat.character}" speaks in scene ${id} but is not in its Characters list.`,
            line: beat.line,
            scene: id,
          });
        }
      }
    }
  }

  return sortIssues(issues);
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
}

// ─────────────────────────── Detection ────────────────────────────────────

/**
 * Does this text look like a formatted script rather than freeform prose?
 *
 * Used to decide whether to structure-parse or fall back to the heuristic
 * splitter. Deliberately conservative: mis-detecting prose as a screenplay
 * would produce one giant scene, which is worse than a naive split.
 */
export function looksLikeScript(source: string): boolean {
  const hasEpisode = EPISODE.test(source) || /^\s*episode\s+\d+/im.test(source);
  const hasSceneNumber = /^\s*(?:scene\s+)?\d+\s*[-–—]\s*\d+\s+\S/im.test(source);
  const hasSlugline = SETTING_TOKEN.test(source) && TIME_TOKEN.test(source);
  const hasCharacters = /^\s*characters?\s*[:：]/im.test(source);

  // Episode + scene numbering is the strongest signal; a slugline or a
  // Characters line corroborates it.
  return hasEpisode && hasSceneNumber && (hasSlugline || hasCharacters);
}

// ─────────────────────────── Rendering ────────────────────────────────────

/**
 * Flatten a parsed scene into the single prompt string the video model sees.
 *
 * Order matters: setting first so the model establishes the frame, then who is
 * present, then action, then dialogue. OS/VO are labelled so the model knows
 * the speaker is off-camera rather than lip-syncing.
 */
export function renderScenePrompt(scene: ParsedScene): string {
  const parts: string[] = [];

  const { location, timeOfDay, setting } = scene.slugline;
  const heading = [setting, location, timeOfDay].filter(Boolean).join(" · ");
  if (heading) parts.push(heading);

  if (scene.sequence) {
    parts.push(scene.sequence === "flashback" ? "(Flashback)" : "(Flash forward)");
  }
  if (scene.characters.length) parts.push(`Characters: ${scene.characters.join(", ")}`);

  for (const beat of scene.beats) {
    if (beat.kind === "action") {
      parts.push(beat.text);
      continue;
    }
    const label = beat.delivery ? ` (${beat.delivery})` : "";
    const emotion = beat.emotion ? ` (${beat.emotion})` : "";
    parts.push(`${beat.character}${emotion}${label}: ${beat.text}`);
  }

  return parts.join("\n");
}

/** Spoken words only — what actually has to be delivered in the clip. */
export function spokenWordCount(scene: ParsedScene): number {
  return scene.beats
    .filter((b): b is DialogueBeat => b.kind === "dialogue")
    .reduce((sum, b) => sum + countWords(b.text), 0);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
