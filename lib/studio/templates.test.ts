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
