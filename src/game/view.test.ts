import { describe, expect, it } from "vitest";
import {
  ballAt,
  fitView,
  FALLBACK_SCALE,
  maxSideIn,
  screenToWorld,
  viewBounds,
  worldToScreen,
} from "./view";
import { BALL_RADIUS, WALL_WIDTH } from "./types";

/** A laid-out play area, and the one jsdom actually reports. */
const PLAY = { width: 800, height: 600 };
const ZERO = { width: 0, height: 0 };

describe("fitView", () => {
  it("puts the world origin at the centre of the surface", () => {
    const view = fitView(10, PLAY);
    expect(view.originX).toBe(400);
    expect(view.originY).toBe(300);
  });

  it("fits the box inside the shorter axis", () => {
    const view = fitView(10, PLAY);
    expect(10 * view.scale).toBeLessThanOrEqual(600);
  });

  it("frames the widest box the handle can reach, exactly", () => {
    // maxSideIn is defined as the side whose outer wall faces land on the
    // frame's edge, so this is the definition read back off the transform
    // rather than a number written in a comment.
    for (const naive of [2, 6, 8, 14]) {
      const view = fitView(naive, PLAY);
      const outer = (maxSideIn(naive) / 2 + WALL_WIDTH) * view.scale;
      expect(2 * outer, `naive ${naive}`).toBeCloseTo(Math.min(PLAY.width, PLAY.height), 9);
    }
  });

  it("keeps every place a ball can sit inside the box within the bounds", () => {
    // The contract that replaced "room for a ball shed over a wall". A ball
    // resting against the inner face has its centre a radius in from it, and
    // the bounds are inset by a radius, so this is only true with room to
    // spare --- 0.22 radii of it, which is the wall's own width and is what
    // the margin is now sized for.
    for (const naive of [2, 6, 8, 14]) {
      const view = fitView(naive, PLAY);
      const bounds = viewBounds(view, PLAY)!;
      const against = maxSideIn(naive) / 2 - BALL_RADIUS;
      expect(bounds.x, `naive ${naive}`).toBeGreaterThanOrEqual(against);
      expect(bounds.y, `naive ${naive}`).toBeGreaterThanOrEqual(against);
    }
  });

  it("reports no bounds at all for an unlaid-out surface", () => {
    // Bounds of zero would clamp every ball onto the origin, and jsdom reports
    // every element as zero-sized.
    const view = fitView(10, ZERO);
    expect(viewBounds(view, ZERO)).toBeNull();
    expect(viewBounds(view, { width: 800, height: 0 })).toBeNull();
    expect(viewBounds(view, { width: 0, height: 600 })).toBeNull();
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
      const view = fitView(10, { width: w!, height: h! });
      expect(view.scale).toBe(FALLBACK_SCALE);
      expect(Number.isFinite(view.originX)).toBe(true);
      expect(Number.isFinite(view.originY)).toBe(true);
    }
  });
});

describe("round trips", () => {
  it("maps screen and world back onto each other", () => {
    for (const view of [fitView(10, PLAY), fitView(6, ZERO)]) {
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
    const view = fitView(10, PLAY);
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
