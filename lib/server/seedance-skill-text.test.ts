/**
 * Grounding the Seed models in the bundled Seedance skill.
 *
 * The Seed models are reached through the OpenAI-compatible /chat/completions
 * endpoint, whose `system` message is plain text — no content blocks, no
 * cache_control — so they need the flattened builder rather than the
 * Anthropic-shaped one. Both share doc selection on purpose: they write
 * prompts for the same video model, so different rules means drift.
 */

import { describe, expect, it } from "vitest";
import {
  buildGroundedSystemText,
  loadSkillDocs,
  renderDocsBlock,
} from "./seedance-skill";

const BASE = "OUTPUT ONLY VALID JSON: {\"scenes\":[]}";

describe("doc selection", () => {
  it("always loads the core craft + safety docs", async () => {
    const skill = await loadSkillDocs("a quiet shot of a street", "t2v", 1);
    expect(skill.core.map((d) => d.name)).toEqual([
      "prompt-guidance",
      "prompt-prose-craft",
      "duration-calculus",
      "shot-design",
      "safety",
    ]);
  });

  it("pulls audio guidance when the brief has spoken lines", async () => {
    const skill = await loadSkillDocs("She whispers to him across the table", "t2v", 1);
    expect(skill.selected).toContain("audio");
  });

  it("pulls continuity guidance for multi-shot work regardless of wording", async () => {
    const bland = await loadSkillDocs("a street", "t2v", 4);
    expect(bland.selected).toContain("continuity-and-editing");
  });

  it("pulls asset guidance when references are supplied", async () => {
    const skill = await loadSkillDocs("a street", "i2v", 1, true);
    expect(skill.selected).toContain("assets");
  });

  it("does not load every doc for a plain brief", async () => {
    const skill = await loadSkillDocs("a street at noon", "t2v", 1);
    // Grounding is not "send everything" — that would be pure token burn.
    expect(skill.conditional.length).toBeLessThan(5);
  });
});

describe("buildGroundedSystemText", () => {
  it("returns a plain string, not Anthropic content blocks", async () => {
    const { system } = await buildGroundedSystemText(BASE, { brief: "a street" });
    expect(typeof system).toBe("string");
  });

  it("includes the reference docs", async () => {
    const { system, selectedDocs } = await buildGroundedSystemText(BASE, { brief: "a street" });
    expect(selectedDocs).toContain("prompt-guidance");
    expect(system).toContain("SEEDANCE REFERENCE: prompt-guidance");
  });

  it("puts the caller's task LAST so the output contract is the final instruction", async () => {
    const { system } = await buildGroundedSystemText(BASE, { brief: "a street" });
    const docs = system.indexOf("SEEDANCE REFERENCE");
    const task = system.indexOf("YOUR TASK");
    expect(docs).toBeGreaterThan(-1);
    expect(task).toBeGreaterThan(docs);
    // The JSON contract must survive — it's what the caller parses.
    expect(system.trim().endsWith(BASE)).toBe(true);
  });

  it("reflects the brief in which docs get pulled", async () => {
    const plain = await buildGroundedSystemText(BASE, { brief: "a street" });
    const spoken = await buildGroundedSystemText(BASE, {
      brief: "he shouts her name as she cries",
    });
    expect(spoken.selectedDocs).toContain("audio");
    expect(spoken.selectedDocs).toContain("performance-direction");
    expect(plain.selectedDocs).not.toContain("audio");
  });

  it("is substantially larger than the bare prompt — grounding actually happened", async () => {
    const { system } = await buildGroundedSystemText(BASE, { brief: "a street" });
    expect(system.length).toBeGreaterThan(BASE.length * 100);
  });
});

describe("inflected keywords still select their doc", () => {
  // Regression: `\bwhisper\b` never matched "whispers"/"whispered", and the
  // bare stems `narrat` / `trembl` could never match at all — the trailing \b
  // sat mid-word. Briefs that plainly needed these docs silently missed them.
  const audio = ["she whispers", "he shouted", "narration over the top", "the crowd chants", "they were singing"];
  const perf = ["he laughs", "she is trembling", "he reacted", "she weeps"];

  for (const brief of audio) {
    it(`pulls audio for "${brief}"`, async () => {
      expect((await loadSkillDocs(brief, "t2v", 1)).selected).toContain("audio");
    });
  }
  for (const brief of perf) {
    it(`pulls performance-direction for "${brief}"`, async () => {
      expect((await loadSkillDocs(brief, "t2v", 1)).selected).toContain("performance-direction");
    });
  }

  it("still ignores a brief with none of those cues", async () => {
    const { selected } = await loadSkillDocs("an empty road at noon", "t2v", 1);
    expect(selected).not.toContain("audio");
    expect(selected).not.toContain("performance-direction");
  });
});

describe("renderDocsBlock", () => {
  it("labels each doc so the model can cite which rule it applied", () => {
    const out = renderDocsBlock([{ name: "shot-design", content: "body text" }]);
    expect(out).toContain("===== SEEDANCE REFERENCE: shot-design =====");
    expect(out).toContain("body text");
  });

  it("is empty for an empty list, so a missing docs dir adds no noise", () => {
    expect(renderDocsBlock([])).toBe("");
  });
});
