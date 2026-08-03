/**
 * The bug this pins: dragging a mark moved the CAMERA, not the mark.
 *
 * Konva bubbles `dragend` from the dragged shape up to the Stage, so the
 * canvas's Stage-level handler ran for every box and arrow drag with
 * `e.target` set to the mark. It folded that node's position into the pan, so
 * dragging a box at image (425, 913) set the camera to (425, 913) and the
 * picture left the viewport entirely. The canvas went blank — reported, quite
 * reasonably, as "it crashes".
 *
 * These tests drive a REAL Konva stage rather than asserting against a mock,
 * because the whole point is that Konva's bubbling is the thing that surprised
 * us. A mock would encode the misunderstanding instead of catching it.
 *
 * happy-dom has no 2D context, so Konva gets a no-op one. Nothing here draws;
 * the assertions are about event routing.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { isStageDrag } from "./stage-drag";

function installFakeCanvasContext() {
  const make = (canvas: HTMLCanvasElement) => {
    const target: Record<string, unknown> = {
      canvas,
      measureText: () => ({ width: 10 }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createPattern: () => ({}),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
      putImageData: () => {},
      createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    };
    return new Proxy(target, {
      get: (t, prop) => (prop in t ? t[prop as string] : () => undefined),
      set: (t, prop, v) => {
        t[prop as string] = v;
        return true;
      },
    });
  };
  (
    HTMLCanvasElement.prototype as unknown as {
      getContext: () => unknown;
    }
  ).getContext = function (this: HTMLCanvasElement) {
    return make(this);
  };
}

async function scene() {
  const Konva = (await import("konva")).default;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const stage = new Konva.Stage({ container, width: 400, height: 300 });
  const layer = new Konva.Layer();
  stage.add(layer);
  const box = new Konva.Rect({
    x: 425,
    y: 913,
    width: 100,
    height: 80,
    draggable: true,
  });
  layer.add(box);
  return { stage, layer, box };
}

describe("stage-level dragend", () => {
  beforeAll(installFakeCanvasContext);

  it("fires for a MARK's drag, with the mark as the target", async () => {
    // The behaviour that caused the bug. If Konva ever stops bubbling, this
    // test failing is the signal that the guard is no longer load-bearing.
    const { stage, box } = await scene();
    const targets: unknown[] = [];
    stage.on("dragend", (e) => targets.push(e.target));

    box.startDrag();
    box.position({ x: 500, y: 950 });
    box.stopDrag();

    expect(targets).toHaveLength(1);
    expect(targets[0]).toBe(box);
    expect(targets[0]).not.toBe(stage);
  });

  it("rejects a mark's drag and accepts the stage's own", async () => {
    const { stage, box } = await scene();
    expect(isStageDrag(box)).toBe(false);
    expect(isStageDrag(stage)).toBe(true);
  });

  it("throws the camera across the image without the guard", async () => {
    // The regression itself, spelled out: the handler as it was written
    // adopted the MARK's coordinates as the camera position. A box near the
    // bottom of a 1364px image moved the viewport ~900px, which puts the
    // picture entirely outside a 720px-tall canvas — a blank rectangle.
    const { stage, box } = await scene();
    let pan = { x: 0, y: 0 };
    stage.on("dragend", (e) => {
      pan = { x: e.target.x(), y: e.target.y() }; // no isStageDrag check
    });

    box.startDrag();
    box.position({ x: 500, y: 950 });
    box.stopDrag();

    expect(pan).toEqual({ x: 500, y: 950 });
    expect(Math.abs(pan.y)).toBeGreaterThan(720);
  });

  it("keeps the camera still while a mark is dragged", async () => {
    // The end-to-end shape of the fix: the same handler the canvas uses,
    // driven by a real mark drag, must not move the camera.
    const { stage, box } = await scene();
    let pan = { x: 0, y: 0 };
    stage.on("dragend", (e) => {
      if (!isStageDrag(e.target)) return;
      pan = { x: e.target.x(), y: e.target.y() };
    });

    box.startDrag();
    box.position({ x: 500, y: 950 });
    box.stopDrag();
    expect(pan).toEqual({ x: 0, y: 0 });

    // …and still follows the stage when the stage is what moved.
    stage.draggable(true);
    stage.startDrag();
    stage.position({ x: -40, y: -25 });
    stage.stopDrag();
    expect(pan).toEqual({ x: -40, y: -25 });
  });

  it("is safe on a detached node", async () => {
    // getStage() is null for a node with no stage; the guard must say "not
    // the stage" rather than throw.
    const Konva = (await import("konva")).default;
    expect(isStageDrag(new Konva.Rect({}))).toBe(false);
    expect(isStageDrag(null)).toBe(false);
    expect(isStageDrag(undefined)).toBe(false);
  });
});
