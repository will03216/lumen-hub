/**
 * No shipped template may request more pixels than its own model allows.
 *
 * Seedream rejects an oversized request with a 400 the client cannot recover
 * from — "image area must be at most 4624220 pixels" — so a template that
 * picks a too-large preset is broken on every single run, for every user, from
 * the moment it ships. That happened twice: once in Garment Shot Package and
 * once in Reference Creative Package, both by choosing a size from IMAGE_SIZES
 * without checking it against the model.
 *
 * This walks every template's built canvas rather than trusting a comment.
 */

import { describe, expect, it } from "vitest";
import { TEMPLATES } from "./templates";
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_MODEL_MAX_PIXELS,
  IMAGE_SIZES,
} from "./models";

/** Ceiling per model id. Only the default model's figure is measured from a
 *  real API rejection; the others come from the model docs and are the reason
 *  a template may legitimately opt into a bigger size by pinning a model. */
const MAX_PIXELS: Record<string, number> = {
  "dola-seedream-5-0-pro-260628": DEFAULT_MODEL_MAX_PIXELS, // 2K
  "seedream-5-0-lite-260128": 3072 * 3072, // 3K
  "seedream-4-5-251128": 4096 * 4096, // 4K
};

function pixels(size: string): number | null {
  const m = /^(\d+)x(\d+)$/.exec(size);
  return m ? Number(m[1]) * Number(m[2]) : null;
}

type NodeForm = { model?: unknown; size?: unknown };

/** Every image-producing node across every template, with its model + size. */
function imageNodes() {
  const out: { template: string; type: string; model: string; size: string }[] = [];
  for (const t of TEMPLATES) {
    for (const node of t.build().nodes) {
      if (node.type !== "imageGen" && node.type !== "styleTransfer") continue;
      const form = (node.data as { form?: NodeForm } | undefined)?.form ?? {};
      out.push({
        template: t.id,
        type: node.type,
        model: typeof form.model === "string" ? form.model : DEFAULT_IMAGE_MODEL_ID,
        size: typeof form.size === "string" ? form.size : "2048x2048",
      });
    }
  }
  return out;
}

describe("template image sizes vs model pixel caps", () => {
  it("finds image nodes to check (guards against a vacuous pass)", () => {
    expect(imageNodes().length).toBeGreaterThan(10);
  });

  it("keeps every node inside its own model's ceiling", () => {
    const violations = imageNodes().filter((n) => {
      const px = pixels(n.size);
      const cap = MAX_PIXELS[n.model];
      return px !== null && cap !== undefined && px > cap;
    });
    expect(
      violations.map((v) => `${v.template}: ${v.type} ${v.size} on ${v.model}`),
    ).toEqual([]);
  });

  it("pins the two regressions that motivated this test", () => {
    const nodes = imageNodes();
    const tooBig = (id: string) =>
      nodes
        .filter((n) => n.template === id && n.model === DEFAULT_IMAGE_MODEL_ID)
        .filter((n) => (pixels(n.size) ?? 0) > DEFAULT_MODEL_MAX_PIXELS);

    // Both shipped with 2160x3840 (8,294,400 px) on the default model.
    expect(tooBig("garment-shot-package")).toEqual([]);
    expect(tooBig("reference-creative-package")).toEqual([]);
  });

  it("every size used is a parseable WxH string", () => {
    for (const n of imageNodes()) expect(pixels(n.size)).not.toBeNull();
  });

  it("documents that most presets are unsafe on the default model", () => {
    // Not a rule templates must follow — a fact that makes picking blind from
    // IMAGE_SIZES dangerous, and the reason this file exists.
    const unsafe = IMAGE_SIZES.filter(
      (s) => (pixels(s) ?? 0) > DEFAULT_MODEL_MAX_PIXELS,
    );
    expect(unsafe).toEqual([
      "3072x3072",
      "4096x4096",
      "3840x2160",
      "2160x3840",
    ]);
  });
});
