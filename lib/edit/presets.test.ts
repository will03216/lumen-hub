/**
 * Presets — the tests guard the copy, because the copy is the feature.
 *
 * Everything here is a string, which is exactly why it needs assertions. A
 * broken function throws; broken preset copy renders a plausible-looking
 * sentence with a hole in it and goes upstream to a paid render. The three
 * failure modes worth catching mechanically:
 *
 *   · A missing subject interpolating as "undefined". `instruction()` is
 *     called with no argument every time a user clicks a chip before typing
 *     anything, so the no-subject path is the COMMON path, not the edge case.
 *   · A colour preset whose swatch and instruction disagree. The swatch is
 *     what the demoer looks at; the hex in the prompt is what the model acts
 *     on. If they drift, the demo silently stops testing exact-colour response
 *     — the one capability the group exists to prove (PRD §5D).
 *   · A duplicate id. `findPreset` returns the first match, so a collision
 *     doesn't error; it just makes one preset permanently unreachable.
 */

import { describe, expect, it } from "vitest";
import {
  EDIT_PRESETS,
  type EditPreset,
  findPreset,
  presetsByGroup,
} from "./presets";

const GROUPS: Array<EditPreset["group"]> = [
  "task",
  "colour",
  "material",
  "text",
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe("registry integrity", () => {
  it("has a unique id for every preset", () => {
    const ids = EDIT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only uses the four declared groups", () => {
    for (const p of EDIT_PRESETS) expect(GROUPS).toContain(p.group);
  });

  it("gives every preset a label and a one-line hint", () => {
    for (const p of EDIT_PRESETS) {
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.hint.trim().length).toBeGreaterThan(0);
      // A hint that wraps stops being one line under the label.
      expect(p.hint.length).toBeLessThanOrEqual(40);
      expect(p.hint).not.toContain("\n");
    }
  });

  it("covers every group, with enough breadth in each to be a demo", () => {
    expect(presetsByGroup("task")).toHaveLength(4);
    expect(presetsByGroup("colour").length).toBeGreaterThanOrEqual(8);
    expect(presetsByGroup("material").length).toBeGreaterThanOrEqual(8);
    expect(presetsByGroup("text").length).toBeGreaterThanOrEqual(6);
  });
});

describe("instruction()", () => {
  const SUBJECTS = [undefined, "sofa", "the tabletop", "  jacket  ", ""];

  it("produces substantial copy for every preset, with and without a subject", () => {
    for (const p of EDIT_PRESETS) {
      for (const s of SUBJECTS) {
        const text = p.instruction(s);
        expect(text.trim().length, `${p.id} / ${String(s)}`).toBeGreaterThan(
          40,
        );
      }
    }
  });

  it("never leaks undefined, null or an empty interpolation", () => {
    for (const p of EDIT_PRESETS) {
      for (const s of SUBJECTS) {
        const text = p.instruction(s);
        expect(text, p.id).not.toMatch(/undefined|null|NaN|\[object/);
        // "the  sofa" or a stranded article is what a bad fallback looks like.
        expect(text, p.id).not.toMatch(/\s{2,}/);
        expect(text, p.id).not.toMatch(/\bthe the\b/i);
      }
    }
  });

  it("uses the subject when given and a readable fallback when not", () => {
    for (const p of EDIT_PRESETS) {
      expect(p.instruction("crumpled paper ball"), p.id).toContain(
        "the crumpled paper ball",
      );
      // Already-determined phrases are not re-articled.
      expect(p.instruction("the tabletop"), p.id).toContain("the tabletop");
      // Whitespace-only is treated as absent, not as a subject.
      expect(p.instruction("   "), p.id).toBe(p.instruction());
    }
  });

  it("states what must be preserved, not just what changes", () => {
    // Rule 2 in the module docblock: region tags scope where, prose scopes
    // what. A preset with no preservation clause comes back as a new object.
    for (const p of EDIT_PRESETS) {
      expect(p.instruction(), p.id).toMatch(
        /unchanged|exactly as (they|it) (are|is)|keep|hold|preserv/i,
      );
    }
  });

  it("opens with an imperative describing the end state", () => {
    // Not "the sofa is the wrong colour" — see rule 1. Cheap proxy: the first
    // word is a verb in the imperative, and the copy never diagnoses.
    for (const p of EDIT_PRESETS) {
      expect(p.instruction(), p.id).toMatch(
        /^(Remove|Change|Replace|Move|Recolour|Render)\b/,
      );
      expect(p.instruction(), p.id).not.toMatch(/\b(is wrong|looks bad|fix)\b/i);
    }
  });
});

describe("colour group", () => {
  const colours = presetsByGroup("colour");

  it("gives every colour preset a valid #RRGGBB swatch", () => {
    for (const p of colours) {
      expect(p.swatch, p.id).toBeDefined();
      expect(p.swatch!, p.id).toMatch(HEX);
    }
  });

  it("states its own hex verbatim in its own instruction", () => {
    // The point of §5D: the model is being asked for an exact colour code, not
    // a colour name. If the hex isn't in the string, nothing is being tested.
    for (const p of colours) {
      expect(p.instruction(), p.id).toContain(p.swatch!);
      expect(p.instruction("sofa"), p.id).toContain(p.swatch!);
    }
  });

  it("uses a distinct hex per preset", () => {
    const hexes = colours.map((p) => p.swatch!.toUpperCase());
    expect(new Set(hexes).size).toBe(hexes.length);
  });

  it("does not carry another preset's hex", () => {
    // A copy-paste that duplicates a hex would still pass the "own hex is
    // present" check above while sending the wrong colour.
    for (const p of colours) {
      for (const other of colours) {
        if (other.id === p.id) continue;
        expect(p.instruction(), `${p.id} contains ${other.id}`).not.toContain(
          other.swatch!,
        );
      }
    }
  });

  it("carries no swatch outside the colour group", () => {
    for (const p of EDIT_PRESETS) {
      if (p.group !== "colour") expect(p.swatch, p.id).toBeUndefined();
    }
  });
});

describe("text group", () => {
  const texts = presetsByGroup("text");

  it("covers the scripts §5D calls out", () => {
    const ids = texts.map((p) => p.id);
    for (const id of [
      "text-latin",
      "text-hans",
      "text-japanese",
      "text-korean",
      "text-arabic",
      "text-devanagari",
      "text-cyrillic",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("carries real non-Latin sample text, not a placeholder", () => {
    const nonLatin = texts.filter((p) => p.id !== "text-latin");
    for (const p of nonLatin) {
      // At least one codepoint outside Latin-1 has to appear in the
      // instruction, or the "sample" is an English description of a script.
      expect(p.instruction(), p.id).toMatch(/[^\u0000-\u00FF]/);
    }
  });

  it("demands exact glyphs and forbids translation", () => {
    for (const p of texts) {
      expect(p.instruction(), p.id).toMatch(/exact/i);
      expect(p.instruction(), p.id).toMatch(/translate|transliterate/i);
    }
  });

  it("requires a mark, because text needs somewhere to land", () => {
    for (const p of texts) expect(p.needsMark, p.id).toBe(true);
  });
});

describe("material group", () => {
  const materials = presetsByGroup("material");

  it("covers the materials §5D lists", () => {
    const ids = materials.map((p) => p.id);
    for (const id of [
      "material-brushed-steel",
      "material-dark-walnut",
      "material-frosted-glass",
      "material-matte-ceramic",
      "material-polished-marble",
      "material-brushed-brass",
      "material-worn-leather",
      "material-concrete",
    ]) {
      expect(ids).toContain(id);
    }
  });

  it("changes only the surface, and says so", () => {
    for (const p of materials) {
      expect(p.instruction(), p.id).toMatch(/surface/i);
      expect(p.instruction(), p.id).toMatch(/shape/i);
      expect(p.instruction(), p.id).toMatch(/lighting|shadow/i);
    }
  });

  it("describes the material rather than only naming it", () => {
    // "brushed steel" alone gets generic grey metal back. The grain and the
    // highlight behaviour are what make the result recognisable.
    for (const p of materials) {
      expect(p.instruction().length, p.id).toBeGreaterThan(200);
    }
  });
});

describe("task group", () => {
  it("ships the four canonical demos, all gated on a mark", () => {
    const tasks = presetsByGroup("task");
    expect(tasks.map((p) => p.id)).toEqual([
      "task-remove",
      "task-recolour",
      "task-replace-surface",
      "task-move-along-arrow",
    ]);
    for (const p of tasks) expect(p.needsMark, p.id).toBe(true);
  });

  it("leads the strip", () => {
    expect(EDIT_PRESETS[0].group).toBe("task");
  });
});

describe("needsMark", () => {
  it("leaves colour and material usable on a bare canvas", () => {
    // Otherwise the entire strip is disabled on first load, which is the exact
    // dead end §4 says presets exist to avoid.
    for (const p of [...presetsByGroup("colour"), ...presetsByGroup("material")])
      expect(p.needsMark, p.id).toBeFalsy();
  });
});

describe("presetsByGroup", () => {
  it("partitions the registry with no overlap or loss", () => {
    const total = GROUPS.reduce((n, g) => n + presetsByGroup(g).length, 0);
    expect(total).toBe(EDIT_PRESETS.length);
  });

  it("returns only members of the requested group", () => {
    for (const g of GROUPS) {
      for (const p of presetsByGroup(g)) expect(p.group).toBe(g);
    }
  });

  it("preserves registry order within a group", () => {
    for (const g of GROUPS) {
      const filtered = presetsByGroup(g).map((p) => p.id);
      const expected = EDIT_PRESETS.filter((p) => p.group === g).map(
        (p) => p.id,
      );
      expect(filtered).toEqual(expected);
    }
  });
});

describe("findPreset", () => {
  it("finds every id in the registry", () => {
    for (const p of EDIT_PRESETS) expect(findPreset(p.id)).toBe(p);
  });

  it("returns undefined for a miss rather than throwing", () => {
    // Session state persists preset ids (EditSession.presetIds); a renamed or
    // removed preset must not break a reopened session.
    expect(findPreset("colour-does-not-exist")).toBeUndefined();
    expect(findPreset("")).toBeUndefined();
    expect(findPreset("COLOUR-SIGNAL-RED")).toBeUndefined();
  });
});
