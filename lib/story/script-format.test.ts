/**
 * Script format parser + validator.
 *
 * The two worked examples from the format spec are used verbatim as fixtures —
 * if the parser can't handle the documented examples, nothing else matters.
 */

import { describe, expect, it } from "vitest";
import {
  looksLikeScript,
  parseScript,
  renderScenePrompt,
  spokenWordCount,
  validateScript,
  type DialogueBeat,
} from "./script-format";
import { splitStoryIntoScenes, splitScriptIntoScenes } from "./scene-split";

// Example 1 from the spec.
const EXAMPLE_1 = `《Rebirth: It's Still Her》
Outline: A surgeon relives the day he lost everything.
Character Bios:
Jack, 30, Surgeon, calm personality, highly disciplined lifestyle.
Emily, 28, Florist, warm and direct.

Episode 1

1-1 Day EXT. Riverside Plaza

Characters: Jack, Emily

△ Jack and Emily sit together on a bench in the riverside plaza. Jack hands Emily a milk tea.

Jack (Happy): I didn't expect to run into you here.

Emily (Relaxed): I come here often. The breeze by the river is really nice.`;

// Example 2 from the spec — no Characters line, a bare VO speaker, a
// transition, and an inline (Monologue/OS).
const EXAMPLE_2 = `Episode 1: Crisis on Camera

Scene 1-1 Hospital Office/Corridor Day INT.

Carter, wearing a white coat, stares intently at the computer screen. The background noise of a busy hospital office surrounds him.

VO: Dr. Carter, the patient in bed 3 has a slight fever post-op.

Carter (Calm): Apply physical cooling and observe for two hours. I'll be right there.

Cut to: Fast-cut montage. Dr. Carter doing ward rounds, consulting patients, working out after work, reading at home, and sleeping. A highly disciplined and monotonous life.

Carter (Flat): (Monologue/OS) If time could turn back, I would never believe I'd get involved in something like that.`;

describe("front matter", () => {
  it("reads the title from 《 》 marks", () => {
    expect(parseScript(EXAMPLE_1).title).toBe("Rebirth: It's Still Her");
  });

  it("accepts a plain Title: label too", () => {
    expect(parseScript("Title: Plain Heading\n\nEpisode 1").title).toBe("Plain Heading");
  });

  it("reads the outline and character bios", () => {
    const s = parseScript(EXAMPLE_1);
    expect(s.outline).toBe("A surgeon relives the day he lost everything.");
    expect(s.characterBios.map((b) => b.name)).toEqual(["Jack", "Emily"]);
    expect(s.characterBios[0].bio).toContain("Surgeon");
  });
});

describe("scene structure", () => {
  it("parses episode, scene number and slugline (example 1)", () => {
    const [scene] = parseScript(EXAMPLE_1).scenes;
    expect(scene.episode).toBe(1);
    expect(scene.number).toBe("1-1");
    expect(scene.slugline.setting).toBe("EXT.");
    expect(scene.slugline.timeOfDay).toBe("Day");
    expect(scene.slugline.location).toBe("Riverside Plaza");
  });

  it("handles the alternate ordering and a Scene prefix (example 2)", () => {
    const [scene] = parseScript(EXAMPLE_2).scenes;
    expect(scene.number).toBe("1-1");
    expect(scene.episodeTitle).toBe("Crisis on Camera");
    expect(scene.slugline.setting).toBe("INT.");
    expect(scene.slugline.timeOfDay).toBe("Day");
    expect(scene.slugline.location).toBe("Hospital Office/Corridor");
  });

  it("reads the Characters line, splitting on , and 、", () => {
    expect(parseScript(EXAMPLE_1).scenes[0].characters).toEqual(["Jack", "Emily"]);
    const cn = parseScript("Episode 1\n1-1 Day INT. Room\nCharacters: Jack、Emily、Bystander A\n△ x\n");
    expect(cn.scenes[0].characters).toEqual(["Jack", "Emily", "Bystander A"]);
  });

  it("strips the △ lead-in from action", () => {
    const [scene] = parseScript(EXAMPLE_1).scenes;
    const action = scene.beats.find((b) => b.kind === "action")!;
    expect(action.text.startsWith("Jack and Emily sit")).toBe(true);
    expect(action.text).not.toContain("△");
  });
});

describe("dialogue", () => {
  const beats = (src: string) =>
    parseScript(src).scenes[0].beats.filter((b): b is DialogueBeat => b.kind === "dialogue");

  it("captures character, emotion and text", () => {
    const [first] = beats(EXAMPLE_1);
    expect(first.character).toBe("Jack");
    expect(first.emotion).toBe("Happy");
    expect(first.text).toBe("I didn't expect to run into you here.");
  });

  it("treats a bare VO: speaker as voice-over", () => {
    const vo = beats(EXAMPLE_2).find((b) => b.character === "VO")!;
    expect(vo.delivery).toBe("VO");
    expect(vo.text).toContain("bed 3");
  });

  it("pulls an inline (Monologue/OS) out of the text", () => {
    const os = beats(EXAMPLE_2).find((b) => b.delivery === "OS")!;
    expect(os.character).toBe("Carter");
    expect(os.emotion).toBe("Flat");
    expect(os.text.startsWith("If time could turn back")).toBe(true);
    expect(os.text).not.toContain("Monologue");
  });

  it("does not mistake a transition for dialogue", () => {
    const scene = parseScript(EXAMPLE_2).scenes[0];
    expect(beats(EXAMPLE_2).some((b) => /cut to/i.test(b.character))).toBe(false);
    const cut = scene.beats.find((b) => b.kind === "action" && b.transition);
    expect(cut).toBeDefined();
  });

  it("does not mistake prose containing a colon for dialogue", () => {
    const src = "Episode 1\n1-1 Day INT. Lab\nCharacters: Ann\nShe reads the sign. It said: keep out.\n";
    expect(beats(src)).toHaveLength(0);
  });

  it("emotion is optional", () => {
    const src = "Episode 1\n1-1 Day INT. Lab\nCharacters: Ann\n△ x\nAnn: Just words.\n";
    const [b] = beats(src);
    expect(b.character).toBe("Ann");
    expect(b.emotion).toBeNull();
    expect(b.text).toBe("Just words.");
  });
});

describe("flashback sequences", () => {
  it("marks scenes inside paired markers", () => {
    const src = [
      "Episode 1",
      "【Flashback】",
      "1-1 Night INT. Old House",
      "Characters: Jack",
      "△ Jack stands in the dark.",
      "Jack (Sad): It was here.",
      "【Flashback】",
      "1-2 Day EXT. Street",
      "Characters: Jack",
      "△ Jack walks on.",
      "Jack (Calm): Now.",
    ].join("\n");
    const { scenes } = parseScript(src);
    expect(scenes[0].sequence).toBe("flashback");
    expect(scenes[1].sequence).toBeNull();
  });
});

describe("validation", () => {
  it("passes a well-formed script with no errors", () => {
    const errors = validateScript(parseScript(EXAMPLE_1)).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("flags the missing Characters line in example 2", () => {
    const issues = validateScript(parseScript(EXAMPLE_2));
    expect(issues.some((i) => i.field === "characters" && i.severity === "error")).toBe(true);
  });

  it("names each missing slugline element separately", () => {
    const src = "Episode 1\n1-1 Riverside Plaza\nCharacters: Jack\n△ x\nJack: hi\n";
    const fields = validateScript(parseScript(src)).map((i) => i.field);
    expect(fields).toContain("slugline.time");
    expect(fields).toContain("slugline.setting");
  });

  it("reports a missing title as an error and a missing outline as a warning", () => {
    const issues = validateScript(parseScript(EXAMPLE_2));
    expect(issues.find((i) => i.field === "title")?.severity).toBe("error");
    expect(issues.find((i) => i.field === "outline")?.severity).toBe("warning");
  });

  it("catches duplicate scene numbers and cites the first use", () => {
    const src = [
      "《T》", "Episode 1",
      "1-1 Day INT. A", "Characters: X", "△ a", "X: hi",
      "1-1 Day INT. B", "Characters: X", "△ b", "X: yo",
    ].join("\n");
    const dup = validateScript(parseScript(src)).find((i) => i.field === "sceneNumber")!;
    expect(dup.severity).toBe("error");
    expect(dup.message).toMatch(/already used on line/);
  });

  it("warns when a speaker is missing from the Characters list", () => {
    const src = "《T》\nEpisode 1\n1-1 Day INT. A\nCharacters: Jack\n△ a\nEmily: who am I?\n";
    const issue = validateScript(parseScript(src)).find((i) => /Emily/.test(i.message))!;
    expect(issue.severity).toBe("warning");
  });

  it("does not warn about OS/VO narrators absent from the list", () => {
    const src = "《T》\nEpisode 1\n1-1 Day INT. A\nCharacters: Jack\n△ a\nVO: narration here\n";
    expect(validateScript(parseScript(src)).some((i) => /VO/.test(i.message))).toBe(false);
  });

  it("errors clearly when there are no scenes at all", () => {
    const issue = validateScript(parseScript("just some prose")).find((i) => i.field === "scene")!;
    expect(issue.severity).toBe("error");
    expect(issue.message).toMatch(/No scenes found/);
  });

  it("orders issues by line so the list reads like the file", () => {
    const lines = validateScript(parseScript(EXAMPLE_2))
      .map((i) => i.line ?? 0)
      .filter(Boolean);
    expect([...lines]).toEqual([...lines].sort((a, b) => a - b));
  });
});

describe("looksLikeScript", () => {
  it("recognises both spec examples", () => {
    expect(looksLikeScript(EXAMPLE_1)).toBe(true);
    expect(looksLikeScript(EXAMPLE_2)).toBe(true);
  });

  it("does not claim freeform prose is a script", () => {
    expect(looksLikeScript("A lone astronaut walks the canyon rim at golden hour.")).toBe(false);
    expect(looksLikeScript("Episode 1 of my life was boring. Day after day.")).toBe(false);
  });
});

describe("rendering and splitting", () => {
  it("puts setting, cast, action then dialogue into the prompt", () => {
    const prompt = renderScenePrompt(parseScript(EXAMPLE_1).scenes[0]);
    expect(prompt.indexOf("EXT.")).toBeLessThan(prompt.indexOf("Characters:"));
    expect(prompt.indexOf("Characters:")).toBeLessThan(prompt.indexOf("Jack and Emily sit"));
    expect(prompt).toContain("Jack (Happy): I didn't expect");
  });

  it("labels off-screen delivery so the model does not lip-sync it", () => {
    expect(renderScenePrompt(parseScript(EXAMPLE_2).scenes[0])).toContain("(VO)");
  });

  it("produces exactly one scene per authored scene", () => {
    const src = [
      "《T》", "Episode 1",
      "1-1 Day INT. A", "Characters: X", "△ a", "X: one",
      "1-2 Night EXT. B", "Characters: X", "△ b", "X: two",
      "1-3 Day INT. C", "Characters: X", "△ c", "X: three",
    ].join("\n");
    expect(splitScriptIntoScenes(src, 60, false)).toHaveLength(3);
  });

  it("routes a formatted script through the structured path", () => {
    // The heuristic splitter would cut example 1 into several paragraph
    // chunks; the script has exactly one scene.
    expect(splitStoryIntoScenes(EXAMPLE_1, 60, false)).toHaveLength(1);
  });

  it("still uses the heuristic splitter for freeform prose", () => {
    const prose = "First beat happens.\n\nSecond beat happens.\n\nThird beat happens.";
    expect(splitStoryIntoScenes(prose, 60, false).length).toBeGreaterThan(1);
  });

  it("keeps every scene duration inside the 5–15 s window", () => {
    for (const s of splitStoryIntoScenes(EXAMPLE_1, 60, false)) {
      expect(s.duration).toBeGreaterThanOrEqual(5);
      expect(s.duration).toBeLessThanOrEqual(15);
    }
  });

  it("counts only spoken words for pacing", () => {
    const scene = parseScript(EXAMPLE_1).scenes[0];
    // Dialogue only — the long action paragraph must not inflate this.
    expect(spokenWordCount(scene)).toBeLessThan(30);
    expect(spokenWordCount(scene)).toBeGreaterThan(10);
  });
});
