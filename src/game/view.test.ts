import { describe, expect, it } from "vitest";
import { ballAt, fitView, FALLBACK_SCALE, screenToWorld, worldToScreen } from "./view";

describe("fitView", () => {
  it("puts the world origin at the centre of the surface", () => {
    const view = fitView(10, 800, 600);
    expect(view.originX).toBe(400);
    expect(view.originY).toBe(300);
  });

  it("fits the box inside the shorter axis", () => {
    const view = fitView(10, 800, 600);
    expect(10 * view.scale).toBeLessThanOrEqual(600);
    expect(10 * view.scale).toBeGreaterThan(400);
  });

  it("never returns a zero scale for an unlaid-out surface", () => {
    // jsdom reports every element as zero-sized. A scale of 0 would put a
    // division by zero in screenToWorld and propagate NaN into the rules
    // silently, so the whole test suite below depends on this one case.
    for (const [w, h] of [
      [0, 0],
      [800, 0],
      [0, 600],
      [Number.NaN, Number.NaN],
    ]) {
      const view = fitView(10, w!, h!);
      expect(view.scale).toBe(FALLBACK_SCALE);
      expect(Number.isFinite(view.originX)).toBe(true);
      expect(Number.isFinite(view.originY)).toBe(true);
    }
  });
});

describe("round trips", () => {
  it("maps screen and world back onto each other", () => {
    for (const view of [fitView(10, 800, 600), fitView(6, 0, 0)]) {
      for (const point of [
        { x: 0, y: 0 },
        { x: 2.5, y: -1.25 },
        { x: -3, y: 4 },
      ]) {
        const screen = worldToScreen(view, point);
        const back = screenToWorld(view, screen.x, screen.y);
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
      }
    }
  });

  it("puts world y up and screen y down", () => {
    const view = fitView(10, 800, 600);
    expect(worldToScreen(view, { x: 0, y: 1 }).y).toBeLessThan(view.originY);
  });
});

describe("ballAt", () => {
  const balls = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ];

  it("finds a ball the point lands on", () => {
    expect(ballAt(balls, { x: 0.5, y: 0.3 })).toBe(0);
    expect(ballAt(balls, { x: 3.8, y: 0 })).toBe(1);
  });

  it("returns null for empty background", () => {
    expect(ballAt(balls, { x: 2, y: 0 })).toBeNull();
    expect(ballAt([], { x: 0, y: 0 })).toBeNull();
  });

  it("prefers the nearer of two overlapping balls", () => {
    const stacked = [
      { x: 0, y: 0 },
      { x: 0.8, y: 0 },
    ];
    expect(ballAt(stacked, { x: 0.7, y: 0 })).toBe(1);
    expect(ballAt(stacked, { x: 0.1, y: 0 })).toBe(0);
  });
});
