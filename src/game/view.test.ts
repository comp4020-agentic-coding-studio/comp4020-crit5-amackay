import { describe, expect, it } from "vitest";
import {
  ballAt,
  fitView,
  FALLBACK_SCALE,
  screenToWorld,
  viewBounds,
  worldToScreen,
} from "./view";
import { BALL_RADIUS, WALL_WIDTH } from "./types";

describe("fitView", () => {
  it("puts the world origin at the centre of the surface", () => {
    const view = fitView(10, 800, 600);
    expect(view.originX).toBe(400);
    expect(view.originY).toBe(300);
  });

  it("fits the box inside the shorter axis", () => {
    const view = fitView(10, 800, 600);
    expect(10 * view.scale).toBeLessThanOrEqual(600);
  });

  it("leaves room outside the box for a ball shed over a wall", () => {
    // This is the contract the margin exists for, and it is what stops the
    // box being able to expel a ball off the edge of the screen. The old
    // fill-fraction this replaced said nothing about it.
    for (const side of [2, 6, 8, 14]) {
      const view = fitView(side, 800, 600);
      const bounds = viewBounds(view, 800, 600)!;
      // A ball shed over a wall rests against the wall's outer face, so its
      // centre is a whole wall plus a radius past the box's inner face.
      const shed = side / 2 + WALL_WIDTH + BALL_RADIUS;
      expect(bounds.y, `side ${side}`).toBeGreaterThanOrEqual(shed);
      expect(bounds.x, `side ${side}`).toBeGreaterThanOrEqual(shed);
    }
  });

  it("reports no bounds at all for an unlaid-out surface", () => {
    // Bounds of zero would clamp every ball onto the origin, and jsdom reports
    // every element as zero-sized.
    const view = fitView(10, 0, 0);
    expect(viewBounds(view, 0, 0)).toBeNull();
    expect(viewBounds(view, 800, 0)).toBeNull();
    expect(viewBounds(view, 0, 600)).toBeNull();
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
