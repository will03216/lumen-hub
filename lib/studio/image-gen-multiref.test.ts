/**
 * Image Gen multi-reference wiring.
 *
 * The runner joins every edge landing on a port with "\n" (app/studio/runner.ts),
 * so an `image` port fed by several upstream nodes arrives as a multi-line
 * string. Seedream takes `image` as `string | string[]`; sending the joined
 * string straight through would put a newline-mangled URL on the wire.
 *
 * The Garment Shot Package template depends on this: three uploaded garment
 * views all land on one Image Gen `image` port to produce the hero.
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { imageGenSpec } from "@/app/studio/nodes/image-gen-node";
import { requestImage } from "@/lib/compare/request-image";

vi.mock("@/lib/compare/request-image", () => ({ requestImage: vi.fn() }));

const A = "https://cdn.example.com/front.png";
const B = "https://cdn.example.com/back.png";
const C = "https://cdn.example.com/detail.jpg";

let sent: Record<string, unknown>;

function run(image: string | undefined) {
  return imageGenSpec.execute({
    form: { model: "seedream-4-5-251128", size: "2048x2048", seed: "" },
    inputs: { prompt: "a garment hero shot", image },
    signal: new AbortController().signal,
  });
}

beforeEach(() => {
  sent = {};
  // The node now hands the request body straight to requestImage (submit +
  // poll transport), so capture its first arg instead of a stringified fetch
  // body. Same assertions — this is the object the node put on the wire.
  (requestImage as Mock).mockImplementation(async (body: Record<string, unknown>) => {
    sent = body;
    return {
      ok: true,
      json: async () => ({ data: [{ url: "https://cdn.example.com/out.png" }] }),
    } as unknown as Response;
  });
});
afterEach(() => vi.clearAllMocks());

describe("imageGen image port", () => {
  it("sends a single wired image as a plain string", async () => {
    await run(A);
    expect(sent.image).toBe(A);
  });

  it("splits a runner-joined multi-line value into a string[]", async () => {
    await run([A, B, C].join("\n"));
    expect(sent.image).toEqual([A, B, C]);
  });

  it("omits image entirely when nothing is wired", async () => {
    await run(undefined);
    expect("image" in sent).toBe(false);
  });

  it("ignores blank lines and surrounding whitespace", async () => {
    await run(`  ${A}  \n\n ${B} \n`);
    expect(sent.image).toEqual([A, B]);
  });

  it("collapses to a string when only one non-empty line survives", async () => {
    await run(`\n  ${A}  \n`);
    expect(sent.image).toBe(A);
  });

  it("caps refs at the documented safe bound of 10", async () => {
    const many = Array.from({ length: 14 }, (_, i) => `https://cdn.example.com/${i}.png`);
    await run(many.join("\n"));
    expect(sent.image).toHaveLength(10);
    expect(sent.image).toEqual(many.slice(0, 10));
  });
});
