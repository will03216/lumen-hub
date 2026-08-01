import { describe, expect, it } from "vitest";
import { findTemplate } from "./templates";

describe("Reference Creative Package template", () => {
  it("builds a reference URL plus own-product creative package graph", () => {
    const template = findTemplate("reference-creative-package");
    expect(template?.name).toBe("Reference Creative Package");

    const canvas = template!.build();
    const types = canvas.nodes.map((node) => node.type);

    expect(types).toContain("webExtract");
    expect(types).toContain("asset");
    expect(types).toContain("videoStyleExtract");
    expect(types.filter((type) => type === "textPrompt")).toHaveLength(3);
    expect(types).toContain("styleTransfer");
    expect(types.filter((type) => type === "imageGen")).toHaveLength(2);
    expect(types).toContain("videoGen");
    expect(types.filter((type) => type === "preview")).toHaveLength(4);

    const promptText = canvas.nodes
      .filter((node) => node.type === "textPrompt")
      .map((node) => {
        const data = node.data as { form?: { text?: string } };
        return data.form?.text ?? "";
      })
      .join("\n\n");

    expect(promptText).toContain("hero poster");
    expect(promptText).toContain("square poster variant");
    expect(promptText).toContain("vertical story poster");
    expect(promptText).toContain("No CTA");
    expect(promptText).not.toMatch(/Shop Now/i);

    expect(
      canvas.edges.some(
        (edge) =>
          edge.sourceHandle === "images" && edge.targetHandle === "style",
      ),
    ).toBe(true);
    expect(
      canvas.edges.some(
        (edge) => edge.sourceHandle === "url" && edge.targetHandle === "content",
      ),
    ).toBe(true);
    expect(
      canvas.edges.some(
        (edge) => edge.sourceHandle === "url" && edge.targetHandle === "image",
      ),
    ).toBe(true);
    expect(
      canvas.edges.some(
        (edge) =>
          edge.sourceHandle === "prompt" &&
          edge.targetHandle === "prompt" &&
          canvas.nodes.find((node) => node.id === edge.target)?.type ===
            "videoGen",
      ),
    ).toBe(true);
    expect(
      canvas.edges.some(
        (edge) =>
          edge.sourceHandle === "prompt" &&
          edge.targetHandle === "prompt" &&
          canvas.nodes.find((node) => node.id === edge.source)?.type ===
            "videoStyleExtract" &&
          canvas.nodes.find((node) => node.id === edge.target)?.type ===
            "videoGen",
      ),
    ).toBe(true);
  });
});

describe("Garment Shot Package template", () => {
  const canvas = findTemplate("garment-shot-package")!.build();
  const typeOf = (id: string) =>
    canvas.nodes.find((node) => node.id === id)?.type;
  const heroId = canvas.nodes.find(
    (node) =>
      node.type === "imageGen" &&
      canvas.edges.some(
        (edge) => edge.target === node.id && typeOf(edge.source) === "asset",
      ),
  )!.id;

  it("feeds three uploaded garment views into one hero image", () => {
    expect(canvas.nodes.filter((n) => n.type === "asset")).toHaveLength(3);

    // All three uploads must land on the SAME imageGen `image` port — the
    // runner joins them with "\n" and Image Gen splits them into a multi-ref
    // array, which is what keeps the hero faithful to the real garment.
    const assetEdges = canvas.edges.filter(
      (edge) => typeOf(edge.source) === "asset",
    );
    expect(assetEdges).toHaveLength(3);
    expect(assetEdges.every((e) => e.target === heroId)).toBe(true);
    expect(assetEdges.every((e) => e.targetHandle === "image")).toBe(true);
    expect(new Set(assetEdges.map((e) => e.source)).size).toBe(3);
  });

  it("fans the hero out into exactly 8 shots, each with its own prompt", () => {
    const fanOutEdges = canvas.edges.filter(
      (edge) =>
        edge.source === heroId &&
        edge.targetHandle === "image" &&
        typeOf(edge.target) === "imageGen",
    );
    expect(fanOutEdges).toHaveLength(8);

    // 1 hero + 8 fan-outs; 1 hero brief + 8 shot prompts; 1 + 8 previews.
    expect(canvas.nodes.filter((n) => n.type === "imageGen")).toHaveLength(9);
    expect(canvas.nodes.filter((n) => n.type === "textPrompt")).toHaveLength(9);
    expect(canvas.nodes.filter((n) => n.type === "preview")).toHaveLength(9);

    for (const edge of fanOutEdges) {
      const prompts = canvas.edges.filter(
        (e) => e.target === edge.target && e.targetHandle === "prompt",
      );
      expect(prompts).toHaveLength(1);
      expect(typeOf(prompts[0].source)).toBe("textPrompt");
    }
  });

  it("covers the eight shot types from the tshirt-2 fan-out reference", () => {
    const text = canvas.nodes
      .filter((n) => n.type === "textPrompt")
      .map((n) => (n.data as { form?: { text?: string } }).form?.text ?? "")
      .join("\n\n")
      .toLowerCase();

    for (const phrase of [
      "three-quarter angle",
      "mid-stride",
      "hands in pockets",
      "low camera angle",
      "waist up",
      "from directly behind",
      "fabric texture",
      "printed graphic",
    ]) {
      expect(text).toContain(phrase);
    }
    // Every fan-out re-uses the hero garment rather than inventing one.
    expect(text).toContain("same garment");
    expect(text).toContain("no watermark");
  });

  it("gives every generated image a preview and no dangling nodes", () => {
    for (const node of canvas.nodes) {
      if (node.type === "preview") continue;
      expect(
        canvas.edges.some(
          (e) => e.source === node.id || e.target === node.id,
        ),
      ).toBe(true);
    }
    for (const gen of canvas.nodes.filter((n) => n.type === "imageGen")) {
      expect(
        canvas.edges.some(
          (e) => e.source === gen.id && typeOf(e.target) === "preview",
        ),
      ).toBe(true);
    }
  });

  it("returns fresh node ids on every build", () => {
    const again = findTemplate("garment-shot-package")!.build();
    const a = canvas.nodes.map((n) => n.id);
    const b = again.nodes.map((n) => n.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
    expect(a).toHaveLength(b.length);
  });
});

describe("Asset Scene Package template", () => {
  const canvas = findTemplate("asset-scene-package")!.build();
  const typeOf = (id: string) =>
    canvas.nodes.find((node) => node.id === id)?.type;

  it("composes text + an uploaded asset into one still", () => {
    expect(canvas.nodes.filter((n) => n.type === "asset")).toHaveLength(1);

    const sceneId = canvas.edges.find(
      (e) => typeOf(e.source) === "asset" && e.targetHandle === "image",
    )!.target;
    expect(typeOf(sceneId)).toBe("imageGen");

    // That same still node must also take a text prompt — "text AND assets".
    expect(
      canvas.edges.some(
        (e) =>
          e.target === sceneId &&
          e.targetHandle === "prompt" &&
          typeOf(e.source) === "textPrompt",
      ),
    ).toBe(true);
  });

  it("fans that still out into both a video and a second image", () => {
    const sceneId = canvas.edges.find(
      (e) => typeOf(e.source) === "asset" && e.targetHandle === "image",
    )!.target;

    const downstream = canvas.edges.filter(
      (e) => e.source === sceneId && e.targetHandle === "image",
    );
    expect(downstream.map((e) => typeOf(e.target)).sort()).toEqual([
      "imageGen",
      "videoGen",
    ]);

    // Each branch is steered by its own prompt, not the scene prompt.
    for (const edge of downstream) {
      expect(
        canvas.edges.some(
          (e) =>
            e.target === edge.target &&
            e.targetHandle === "prompt" &&
            typeOf(e.source) === "textPrompt",
        ),
      ).toBe(true);
    }
    expect(canvas.nodes.filter((n) => n.type === "textPrompt")).toHaveLength(3);
    expect(canvas.nodes.filter((n) => n.type === "preview")).toHaveLength(3);
  });

  it("keeps the source product recognisable in every prompt", () => {
    const text = canvas.nodes
      .filter((n) => n.type === "textPrompt")
      .map((n) => (n.data as { form?: { text?: string } }).form?.text ?? "")
      .join("\n\n")
      .toLowerCase();
    expect(text).toContain("reference");
    expect(text).toContain("no watermark");
  });
});
