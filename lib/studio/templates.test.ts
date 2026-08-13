import { describe, expect, it } from "vitest";
import { findVideoModel, VIDEO_RATIOS } from "./models";
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

describe("F1 Vertical Feed Ad template", () => {
  const canvas = findTemplate("vertical-feed-ad")!.build();
  const typeOf = (id: string) =>
    canvas.nodes.find((node) => node.id === id)?.type;
  const formOf = (id: string) =>
    (canvas.nodes.find((node) => node.id === id)?.data as {
      form?: Record<string, unknown>;
    }).form ?? {};

  it("composes an uploaded product photo into a vertical key visual", () => {
    expect(canvas.nodes.filter((n) => n.type === "asset")).toHaveLength(1);

    const kvId = canvas.edges.find(
      (e) => typeOf(e.source) === "asset" && e.targetHandle === "image",
    )!.target;
    expect(typeOf(kvId)).toBe("imageGen");
    // 9:16, and inside the default model's 4,624,220 px ceiling.
    expect(formOf(kvId).size).toBe("1440x2560");
  });

  it("runs a Branding lane off the key visual and a Performing lane on text", () => {
    const videos = canvas.nodes.filter((n) => n.type === "videoGen");
    expect(videos).toHaveLength(2);

    const kvId = canvas.edges.find(
      (e) => typeOf(e.source) === "asset" && e.targetHandle === "image",
    )!.target;

    // Exactly one video takes the still as its first frame (I2V, Branding);
    // the other is pure T2V so its 1-second hook isn't pinned to a product
    // shot.
    const i2v = videos.filter((v) =>
      canvas.edges.some(
        (e) => e.source === kvId && e.target === v.id && e.targetHandle === "image",
      ),
    );
    expect(i2v).toHaveLength(1);

    // Both are still prompt-driven and both end in a preview.
    for (const v of videos) {
      expect(
        canvas.edges.some(
          (e) =>
            e.target === v.id &&
            e.targetHandle === "prompt" &&
            typeOf(e.source) === "textPrompt",
        ),
      ).toBe(true);
      expect(
        canvas.edges.some(
          (e) => e.source === v.id && typeOf(e.target) === "preview",
        ),
      ).toBe(true);
    }
  });

  it("pins Seedance 2.5 at 9:16 with a duration the model accepts", () => {
    const model = findVideoModel("dreamina-seedance-2-5-260628")!;
    for (const v of canvas.nodes.filter((n) => n.type === "videoGen")) {
      const form = formOf(v.id);
      expect(form.model).toBe(model.id);
      expect(form.ratio).toBe("9:16");
      expect(form.audio).toBe(true);
      expect(model.caps.durations).toContain(form.duration as number);
      expect(model.caps.resolutions).toContain(form.resolution as string);
    }
  });

  it("keeps the Branding cut CTA-free and the Performing cut hook-to-CTA", () => {
    const textOf = (id: string) =>
      ((formOf(id).text as string) ?? "").toLowerCase();
    const prompts = canvas.nodes
      .filter((n) => n.type === "textPrompt")
      .map((n) => textOf(n.id));

    // F1's dividing line: Branding carries no price and no CTA; Performing
    // states the selling point and closes on one.
    const branding = prompts.find((t) => t.includes("no cta"))!;
    expect(branding).toBeDefined();
    expect(branding).not.toContain("shop now");
    const performing = prompts.find((t) => t.includes("shop now"))!;
    expect(performing).toBeDefined();

    // No real brand names — the plan's own moderation warning.
    const all = prompts.join("\n");
    for (const brand of ["glossier", "cerave", "nivea", "l'oréal", "the ordinary"]) {
      expect(all).not.toContain(brand);
    }
  });

  it("returns fresh node ids on every build", () => {
    const again = findTemplate("vertical-feed-ad")!.build();
    const a = canvas.nodes.map((n) => n.id);
    const b = again.nodes.map((n) => n.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
    expect(a).toHaveLength(b.length);
  });
});

describe("Creative URL Pipeline template", () => {
  const canvas = findTemplate("creative-url-pipeline")!.build();
  const typeOf = (id: string) =>
    canvas.nodes.find((node) => node.id === id)?.type;
  const formOf = (id: string) =>
    ((canvas.nodes.find((node) => node.id === id)?.data as {
      form?: Record<string, unknown>;
    }).form ?? {}) as Record<string, unknown>;

  it("ships with a real reference page pre-filled", () => {
    const we = canvas.nodes.find((n) => n.type === "webExtract")!;
    expect(formOf(we.id).url).toMatch(/^https:\/\/www\.rhodeskin\.com\//);
  });

  it("puts the scraped page on style and the user's product on content", () => {
    const st = canvas.nodes.find((n) => n.type === "styleTransfer")!;
    const styleEdge = canvas.edges.find(
      (e) => e.target === st.id && e.targetHandle === "style",
    )!;
    expect(typeOf(styleEdge.source)).toBe("webExtract");
    expect(styleEdge.sourceHandle).toBe("images");

    const contentEdge = canvas.edges.find(
      (e) => e.target === st.id && e.targetHandle === "content",
    )!;
    expect(typeOf(contentEdge.source)).toBe("asset");
  });

  it("fans the hero out into 1:1, 9:16 and 16:9 stills", () => {
    const st = canvas.nodes.find((n) => n.type === "styleTransfer")!;
    const fanOut = canvas.edges.filter(
      (e) =>
        e.source === st.id &&
        e.targetHandle === "image" &&
        typeOf(e.target) === "imageGen",
    );
    expect(fanOut).toHaveLength(3);
    expect(fanOut.map((e) => formOf(e.target).size as string).sort()).toEqual([
      "1440x2560",
      "2048x2048",
      "2560x1440",
    ]);

    // Each crop is steered by its own brief and lands in its own preview.
    for (const edge of fanOut) {
      expect(
        canvas.edges.some(
          (e) =>
            e.target === edge.target &&
            e.targetHandle === "prompt" &&
            typeOf(e.source) === "textPrompt",
        ),
      ).toBe(true);
      expect(
        canvas.edges.some(
          (e) => e.source === edge.target && typeOf(e.target) === "preview",
        ),
      ).toBe(true);
    }
  });

  it("borrows direction from the reference without copying its identity", () => {
    const text = canvas.nodes
      .filter((n) => n.type === "textPrompt")
      .map((n) => (n.data as { form?: { text?: string } }).form?.text ?? "")
      .join("\n\n")
      .toLowerCase();
    expect(text).toContain("n°7 glossy pink lipstick");
    expect(text).toContain("do not copy the reference's logo");
    expect(text).toContain("no watermark");
    expect(text).not.toContain("rhode");
  });

  it("returns fresh node ids on every build", () => {
    const again = findTemplate("creative-url-pipeline")!.build();
    const a = canvas.nodes.map((n) => n.id);
    expect(a.some((id) => again.nodes.map((n) => n.id).includes(id))).toBe(false);
  });
});

describe("TikTok Reference Clip template", () => {
  const canvas = findTemplate("tiktok-reference-clip")!.build();
  const typeOf = (id: string) =>
    canvas.nodes.find((node) => node.id === id)?.type;
  const formOf = (id: string) =>
    ((canvas.nodes.find((node) => node.id === id)?.data as {
      form?: Record<string, unknown>;
    }).form ?? {}) as Record<string, unknown>;

  it("ships with a real TikTok post and the user's product as context", () => {
    const vse = canvas.nodes.find((n) => n.type === "videoStyleExtract")!;
    expect(formOf(vse.id).videoUrl).toMatch(/^https:\/\/www\.tiktok\.com\//);
    expect(formOf(vse.id).productContext).toBe("N°7 glossy pink lipstick");
  });

  it("drives both video lanes from the one extracted prompt", () => {
    const vse = canvas.nodes.find((n) => n.type === "videoStyleExtract")!;
    const driven = canvas.edges.filter(
      (e) =>
        e.source === vse.id &&
        e.sourceHandle === "prompt" &&
        e.targetHandle === "prompt" &&
        typeOf(e.target) === "videoGen",
    );
    expect(driven).toHaveLength(2);
    expect(canvas.nodes.filter((n) => n.type === "videoGen")).toHaveLength(2);
  });

  it("grounds exactly one lane on a still of the user's own product", () => {
    const frame = canvas.nodes.find((n) => n.type === "imageGen")!;
    // The still itself is built from the uploaded asset.
    expect(
      canvas.edges.some(
        (e) =>
          e.target === frame.id &&
          e.targetHandle === "image" &&
          typeOf(e.source) === "asset",
      ),
    ).toBe(true);
    expect(formOf(frame.id).size).toBe("1440x2560");

    const grounded = canvas.edges.filter(
      (e) =>
        e.source === frame.id &&
        e.targetHandle === "image" &&
        typeOf(e.target) === "videoGen",
    );
    expect(grounded).toHaveLength(1);
  });

  it("pins Seedance 2.5 at 9:16 with settings the model accepts", () => {
    const model = findVideoModel("dreamina-seedance-2-5-260628")!;
    for (const v of canvas.nodes.filter((n) => n.type === "videoGen")) {
      const form = formOf(v.id);
      expect(form.model).toBe(model.id);
      expect(form.ratio).toBe("9:16");
      expect(model.caps.durations).toContain(form.duration as number);
      expect(model.caps.resolutions).toContain(form.resolution as string);
    }
  });

  it("previews every generated node and leaves nothing dangling", () => {
    for (const node of canvas.nodes) {
      if (node.type === "preview") continue;
      expect(
        canvas.edges.some((e) => e.source === node.id || e.target === node.id),
      ).toBe(true);
    }
    for (const gen of canvas.nodes.filter(
      (n) => n.type === "videoGen" || n.type === "imageGen",
    )) {
      expect(
        canvas.edges.some(
          (e) => e.source === gen.id && typeOf(e.target) === "preview",
        ),
      ).toBe(true);
    }
  });
});

describe("F2 Feed Video Set template", () => {
  const canvas = findTemplate("feed-video-set")!.build();
  const typeOf = (id: string) =>
    canvas.nodes.find((node) => node.id === id)?.type;
  const formOf = (id: string) =>
    ((canvas.nodes.find((node) => node.id === id)?.data as {
      form?: Record<string, unknown>;
    }).form ?? {}) as Record<string, unknown>;

  it("covers all six F2 cuts, each with its own prompt and preview", () => {
    const videos = canvas.nodes.filter((n) => n.type === "videoGen");
    expect(videos).toHaveLength(6);
    expect(canvas.nodes.filter((n) => n.type === "textPrompt")).toHaveLength(6);
    expect(canvas.nodes.filter((n) => n.type === "preview")).toHaveLength(6);

    for (const v of videos) {
      const prompts = canvas.edges.filter(
        (e) => e.target === v.id && e.targetHandle === "prompt",
      );
      expect(prompts).toHaveLength(1);
      expect(typeOf(prompts[0].source)).toBe("textPrompt");
      expect(
        canvas.edges.some(
          (e) => e.source === v.id && typeOf(e.target) === "preview",
        ),
      ).toBe(true);
    }
  });

  it("carries one product upload into every cut as a reference asset", () => {
    const assets = canvas.nodes.filter((n) => n.type === "asset");
    expect(assets).toHaveLength(1);

    const refEdges = canvas.edges.filter(
      (e) => e.source === assets[0].id,
    );
    expect(refEdges).toHaveLength(6);
    // assetId → references, not url → image: the product persists through the
    // cut rather than pinning its first frame.
    expect(refEdges.every((e) => e.sourceHandle === "assetId")).toBe(true);
    expect(refEdges.every((e) => e.targetHandle === "references")).toBe(true);
    expect(refEdges.every((e) => typeOf(e.target) === "videoGen")).toBe(true);
  });

  it("uses feed-safe ratios the engine actually offers", () => {
    const ratios = canvas.nodes
      .filter((n) => n.type === "videoGen")
      .map((n) => formOf(n.id).ratio as string);
    // F2's 4:5 has no enum value; 3:4 is the nearest supported portrait.
    expect(ratios.filter((r) => r === "3:4")).toHaveLength(5);
    expect(ratios.filter((r) => r === "1:1")).toHaveLength(1);
    for (const r of ratios) {
      expect(VIDEO_RATIOS).toContain(r);
      // 9:16 gets cropped in a Meta feed — the thing F2 exists to avoid.
      expect(r).not.toBe("9:16");
    }
  });

  it("pins Seedance 2.5 with durations the model accepts", () => {
    const model = findVideoModel("dreamina-seedance-2-5-260628")!;
    for (const v of canvas.nodes.filter((n) => n.type === "videoGen")) {
      const form = formOf(v.id);
      expect(form.model).toBe(model.id);
      expect(form.audio).toBe(true);
      expect(model.caps.durations).toContain(form.duration as number);
      expect(model.caps.resolutions).toContain(form.resolution as string);
    }
  });

  it("keeps the Branding cuts CTA-free and the Performing cuts closing on one", () => {
    const texts = canvas.nodes
      .filter((n) => n.type === "textPrompt")
      .map((n) => ((formOf(n.id).text as string) ?? "").toLowerCase());

    const branding = texts.filter((t) => t.includes("no cta"));
    const performing = texts.filter((t) => t.includes("shop now"));
    expect(branding).toHaveLength(3);
    expect(performing).toHaveLength(3);
    // No cut is both.
    expect(branding.some((t) => t.includes("shop now"))).toBe(false);

    // No real brand names — the plan's own moderation warning.
    const all = texts.join("\n");
    for (const brand of [
      "estée lauder",
      "estee lauder",
      "fenty",
      "la mer",
      "olay",
      "neutrogena",
      "garnier",
    ]) {
      expect(all).not.toContain(brand);
    }
  });

  it("returns fresh node ids on every build", () => {
    const again = findTemplate("feed-video-set")!.build();
    const a = canvas.nodes.map((n) => n.id);
    const b = again.nodes.map((n) => n.id);
    expect(a.some((id) => b.includes(id))).toBe(false);
    expect(a).toHaveLength(b.length);
  });
});

describe("Heckler Cinematic AI Prompt Engine templates", () => {
  const CASES = [
    { id: "heckler-doors-rise", sheets: 2 },
    { id: "heckler-slow-motion-crowd", sheets: 1 },
    { id: "heckler-traffic-light-cascade", sheets: 1 },
  ];

  for (const { id, sheets } of CASES) {
    describe(id, () => {
      const canvas = findTemplate(id)!.build();
      const typeOf = (nodeId: string) =>
        canvas.nodes.find((n) => n.id === nodeId)?.type;
      const formOf = (nodeId: string) =>
        ((canvas.nodes.find((n) => n.id === nodeId)?.data as {
          form?: Record<string, unknown>;
        }).form ?? {}) as Record<string, unknown>;
      const textOf = (nodeId: string) => (formOf(nodeId).text as string) ?? "";

      it("locks the look as square contact sheets before the clip", () => {
        const gens = canvas.nodes.filter((n) => n.type === "imageGen");
        expect(gens).toHaveLength(sheets);
        // The 2x3 grid only reads at 1:1, and every paste-block says so.
        for (const g of gens) expect(formOf(g.id).size).toBe("2048x2048");
      });

      it("hands every sheet to the clip as a URL reference, not a first frame", () => {
        const video = canvas.nodes.find((n) => n.type === "videoGen")!;
        const refs = canvas.edges.filter(
          (e) => e.target === video.id && e.targetHandle === "refImages",
        );
        expect(refs).toHaveLength(sheets);
        expect(refs.every((e) => typeOf(e.source) === "imageGen")).toBe(true);
        // Cut 1 of every case opens on something the sheet doesn't show.
        expect(
          canvas.edges.some(
            (e) => e.target === video.id && e.targetHandle === "image",
          ),
        ).toBe(false);
      });

      it("lets an uploaded reference photo steer every sheet", () => {
        const assets = canvas.nodes.filter((n) => n.type === "asset");
        expect(assets).toHaveLength(1);
        const fed = canvas.edges.filter(
          (e) => e.source === assets[0].id && e.targetHandle === "image",
        );
        expect(fed).toHaveLength(sheets);
        expect(fed.every((e) => typeOf(e.target) === "imageGen")).toBe(true);
      });

      it("renders 16:9 / 15s on Seedance 2.0 with native audio off", () => {
        const video = canvas.nodes.find((n) => n.type === "videoGen")!;
        const form = formOf(video.id);
        const model = findVideoModel(form.model as string)!;
        expect(form.ratio).toBe("16:9");
        expect(form.duration).toBe(15);
        // No prompt carries audio direction — the doc drops audio notes.
        expect(form.audio).toBe(false);
        expect(model.caps.durations).toContain(15);
        expect(model.caps.resolutions).toContain(form.resolution as string);
      });

      it("carries the NO TEXT rule verbatim in every prompt", () => {
        const prompts = canvas.nodes.filter((n) => n.type === "textPrompt");
        expect(prompts).toHaveLength(sheets + 1);
        for (const p of prompts) {
          expect(textOf(p.id)).toContain(
            "Absolutely no text, no lettering, no signage, no words, no numbers, no UI labels, no typography of any kind",
          );
        }
      });

      it("keeps the exclusion list on the sheets and the format line last", () => {
        const videoPromptId = canvas.edges.find(
          (e) =>
            e.targetHandle === "prompt" &&
            typeOf(e.target) === "videoGen",
        )!.source;

        for (const p of canvas.nodes.filter((n) => n.type === "textPrompt")) {
          const text = textOf(p.id);
          if (p.id === videoPromptId) {
            // "End on format — the last thing the model reads biases
            // composition."
            expect(text.trimEnd().endsWith("16:9 widescreen. 15 seconds.")).toBe(
              true,
            );
          } else {
            expect(text).toContain("Avoid: blurry, oversaturated");
            expect(text.trimEnd().endsWith("1:1 square format.")).toBe(true);
            // The per-panel NO FACE instruction the doc calls a key learning.
            expect(text).toContain("2-row by 3-column grid");
          }
        }
      });

      it("keeps lens and aperture numbers, which change the output", () => {
        const all = canvas.nodes
          .filter((n) => n.type === "textPrompt")
          .map((n) => textOf(n.id))
          .join("\n");
        expect(all).toMatch(/\d{2}mm f\/\d/);
      });

      it("previews every generated node and leaves nothing dangling", () => {
        for (const node of canvas.nodes) {
          if (node.type === "preview") continue;
          expect(
            canvas.edges.some(
              (e) => e.source === node.id || e.target === node.id,
            ),
          ).toBe(true);
        }
        for (const gen of canvas.nodes.filter(
          (n) => n.type === "imageGen" || n.type === "videoGen",
        )) {
          expect(
            canvas.edges.some(
              (e) => e.source === gen.id && typeOf(e.target) === "preview",
            ),
          ).toBe(true);
        }
      });

      it("returns fresh node ids on every build", () => {
        const again = findTemplate(id)!.build();
        const a = canvas.nodes.map((n) => n.id);
        const b = again.nodes.map((n) => n.id);
        expect(a.some((nodeId) => b.includes(nodeId))).toBe(false);
        expect(a).toHaveLength(b.length);
      });
    });
  }

  it("gives each case its own distinct clip", () => {
    const clips = CASES.map((c) => {
      const canvas = findTemplate(c.id)!.build();
      const videoPromptId = canvas.edges.find(
        (e) =>
          e.targetHandle === "prompt" &&
          canvas.nodes.find((n) => n.id === e.target)?.type === "videoGen",
      )!.source;
      return (
        (canvas.nodes.find((n) => n.id === videoPromptId)?.data as {
          form?: { text?: string };
        }).form?.text ?? ""
      );
    });
    expect(new Set(clips).size).toBe(3);
    // Each case's signature beat survived into its prompt.
    expect(clips[0]).toContain("shooting upward like a portcullis");
    expect(clips[1]).toContain("dancer-like glide of Fred Astaire");
    expect(clips[2]).toContain("Vertigo compression effect");
  });
});
