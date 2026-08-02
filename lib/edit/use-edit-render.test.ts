/**
 * buildEditRequest — the pure half of the render hook.
 *
 * Testing the request builder separately from the fetch loop is the point of
 * splitting it out: the ordering rule below (base ref first) is invisible in
 * the response, so a regression here produces a subtly wrong edit rather than
 * an error. Seedream treats the first entry of `image` as the subject; put a
 * style reference there instead and the model edits the wrong picture.
 *
 * The array-vs-string branch matters for the same reason — `image` is
 * `string | string[]` on the wire, and a single-element array is a different
 * request shape than a bare string.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isSizeAllowed } from "@/lib/studio/models";
import { buildEditRequest } from "./use-edit-render";
import {
  __resetForTests,
  addRef,
  createEditSession,
  getEditSession,
  updateEditSession,
} from "./sessions";

const PRO = "dola-seedream-5-0-pro-260628";

beforeEach(() => __resetForTests());
afterEach(() => __resetForTests());

function session(instruction = "make it walnut") {
  const s = createEditSession({
    baseRef: { url: "/library-cache/base.png", width: 1920, height: 1080 },
    model: PRO,
    instruction,
  });
  return getEditSession(s.id)!;
}

describe("buildEditRequest", () => {
  it("sends a single ref as a bare string, not a one-element array", () => {
    const req = buildEditRequest(session());
    expect(req.image).toBe("/library-cache/base.png");
    expect(Array.isArray(req.image)).toBe(false);
  });

  it("puts the base ref first regardless of insertion order", () => {
    const s = session();
    // A style ref added after the base must not displace it.
    addRef(s.id, {
      url: "/style.png",
      width: 512,
      height: 512,
      role: "style",
    });
    const withStyle = getEditSession(s.id)!;

    const req = buildEditRequest(withStyle);
    expect(req.image).toEqual(["/library-cache/base.png", "/style.png"]);
    expect(req.refIds[0]).toBe(withStyle.refs[0].id);
  });

  it("omits image entirely when there are no refs", () => {
    const s = createEditSession({ instruction: "a candle", model: PRO });
    const req = buildEditRequest(getEditSession(s.id)!);
    expect(req.image).toBeUndefined();
    expect(req.refIds).toEqual([]);
  });

  it("trims the instruction into the prompt", () => {
    const req = buildEditRequest(session("   make it walnut   "));
    expect(req.prompt).toBe("make it walnut");
  });

  it("sizes from the base ref and stays legal for the model", () => {
    const req = buildEditRequest(session());
    expect(isSizeAllowed(req.size, PRO)).toBe(true);
    // 1920x1080 source → landscape output.
    const [w, h] = req.size.split("x").map(Number);
    expect(w).toBeGreaterThan(h);
  });

  it("honours an aspect override stored on the session", () => {
    const s = session();
    updateEditSession(s.id, { aspectRatio: "9:16" });
    const req = buildEditRequest(getEditSession(s.id)!);
    const [w, h] = req.size.split("x").map(Number);
    expect(h).toBeGreaterThan(w);
  });

  it("carries the seed through when set, and omits it when not", () => {
    const s = session();
    expect(buildEditRequest(getEditSession(s.id)!).seed).toBeUndefined();
    updateEditSession(s.id, { seed: 42 });
    expect(buildEditRequest(getEditSession(s.id)!).seed).toBe(42);
  });
});
