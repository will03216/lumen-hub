import { describe, expect, it } from "vitest";
import { findTemplate } from "./templates";
import {
  DEFAULT_IMAGE_MODEL_ID,
  DEFAULT_VIDEO_MODEL_ID,
} from "./models";

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

describe("Adtech · Upload → Video template", () => {
  it("wires an uploaded asset plus a text prompt into a Seedance 2.0 720p video", () => {
    const template = findTemplate("adtech-upload-to-video");
    expect(template?.name).toBe("Adtech · Upload → Video");

    const canvas = template!.build();
    const types = canvas.nodes.map((node) => node.type);

    expect(types).toContain("asset");
    expect(types.filter((type) => type === "textPrompt")).toHaveLength(1);
    expect(types).toContain("videoGen");
    expect(types).toContain("preview");

    const videoGen = canvas.nodes.find((node) => node.type === "videoGen");
    const form = (videoGen?.data as { form?: { model?: string; resolution?: string } })
      .form;
    expect(form?.model).toBe(DEFAULT_VIDEO_MODEL_ID);
    expect(form?.resolution).toBe("720p");

    // Uploaded asset feeds the first frame; text prompt drives the motion.
    expect(
      canvas.edges.some((edge) => {
        const source = canvas.nodes.find((n) => n.id === edge.source);
        return source?.type === "asset" && edge.targetHandle === "image";
      }),
    ).toBe(true);
    expect(
      canvas.edges.some((edge) => {
        const source = canvas.nodes.find((n) => n.id === edge.source);
        return source?.type === "textPrompt" && edge.targetHandle === "prompt";
      }),
    ).toBe(true);
  });
});

describe("Adtech · Product + Model → Video template", () => {
  it("generates a Seedream 5.0 Pro still that feeds a Seedance 2.0 720p video", () => {
    const template = findTemplate("adtech-product-model-to-video");
    expect(template?.name).toBe("Adtech · Product + Model → Video");

    const canvas = template!.build();
    const types = canvas.nodes.map((node) => node.type);

    expect(types.filter((type) => type === "textPrompt")).toHaveLength(2);
    expect(types).toContain("imageGen");
    expect(types).toContain("videoGen");
    expect(types).toContain("preview");

    const imageGen = canvas.nodes.find((node) => node.type === "imageGen");
    expect(
      (imageGen?.data as { form?: { model?: string } }).form?.model,
    ).toBe(DEFAULT_IMAGE_MODEL_ID);

    const videoGen = canvas.nodes.find((node) => node.type === "videoGen");
    const form = (videoGen?.data as { form?: { model?: string; resolution?: string } })
      .form;
    expect(form?.model).toBe(DEFAULT_VIDEO_MODEL_ID);
    expect(form?.resolution).toBe("720p");

    // The generated still feeds the video's first frame.
    expect(
      canvas.edges.some((edge) => {
        const source = canvas.nodes.find((n) => n.id === edge.source);
        const target = canvas.nodes.find((n) => n.id === edge.target);
        return (
          source?.type === "imageGen" &&
          target?.type === "videoGen" &&
          edge.targetHandle === "image"
        );
      }),
    ).toBe(true);
  });
});
