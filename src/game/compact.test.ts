import { describe, expect, it } from "vitest";
import { compact } from "./compact";
import { optimum } from "./optima";
import type { Ball } from "./types";

// The search resolves to 0.001 radii, so a size assertion gets a little more
// slack than that.
const SLACK = 0.005;

function translate(balls: readonly Ball[], dx: number, dy: number): Ball[] {
  return balls.map((ball) => ({ x: ball.x + dx, y: ball.y + dy }));
}

describe("compacting to known optima", () => {
  it("closes to 2 around a single ball", () => {
    // No pairs exist at N = 1, so this is the case an overlap-only failure
    // signal would close all the way to nothing.
    const result = compact([{ x: 0, y: 0 }], 10);
    expect(result.side).toBeCloseTo(2, 2);
  });

  it("reaches 2 + sqrt(2) for a diagonal pair", () => {
    const result = compact(
      [
        { x: -1.2, y: -1.2 },
        { x: 1.2, y: 1.2 },
      ],
      10,
    );
    expect(result.side).toBeLessThan(optimum(2) + SLACK);
    expect(result.side).toBeGreaterThan(optimum(2) - SLACK);
  });

  it("reaches 4 for a rough two-by-two", () => {
    const result = compact(
      [
        { x: -1.1, y: -0.9 },
        { x: 1.3, y: -1.2 },
        { x: -0.8, y: 1.1 },
        { x: 1.2, y: 1.4 },
      ],
      12,
    );
    expect(result.side).toBeLessThan(optimum(4) + SLACK);
    expect(result.side).toBeGreaterThan(optimum(4) - SLACK);
  });

  it("finds only the arrangement it was given, not the best one", () => {
    // Two balls side by side compact to 4, not to 2 + sqrt(2). Nothing rotates
    // an arrangement; finding the diagonal is the player's job, and that is
    // where the game is.
    const result = compact(
      [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ],
      10,
    );
    expect(result.side).toBeCloseTo(4, 2);
  });
});

describe("the promises compacting has to keep", () => {
  it("returns the identical side when run again on its own result", () => {
    // "Pressing the control repeatedly is never a strategy", and the reason
    // settling bought determinism.
    const balls: Ball[] = [
      { x: -1.4, y: -0.3 },
      { x: 0.9, y: 1.2 },
      { x: 1.1, y: -1.3 },
    ];
    const first = compact(balls, 12);
    const second = compact(first.balls, first.side);
    expect(second.side).toBe(first.side);
    expect(second.balls).toEqual(first.balls);
  });

  it("gives the same size wherever on the screen the arrangement was built", () => {
    // The box never moves, so the ramps have to herd a drifted arrangement in
    // rather than the player being quietly punished for building off-centre.
    const balls: Ball[] = [
      { x: -1.1, y: -0.9 },
      { x: 1.3, y: -1.2 },
      { x: -0.8, y: 1.1 },
      { x: 1.2, y: 1.4 },
    ];
    const centred = compact(balls, 20);
    const drifted = compact(translate(balls, 5, -4), 20);
    expect(drifted.side).toBeCloseTo(centred.side, 2);
  });

  it("terminates on a scattered start", () => {
    const balls: Ball[] = Array.from({ length: 8 }, (_, i) => ({
      x: Math.cos(i * 2.4) * 6,
      y: Math.sin(i * 2.4) * 6,
    }));
    const result = compact(balls, 30);
    expect(result.side).toBeLessThan(30);
    expect(result.side).toBeGreaterThan(0);
    expect(result.attempts).toBeLessThan(2000);
  });

  it("never returns a side the arrangement does not fit in", () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7]) {
      const balls: Ball[] = Array.from({ length: n }, (_, i) => ({
        x: Math.cos(i * 1.7) * 3,
        y: Math.sin(i * 1.7) * 3,
      }));
      const result = compact(balls, 20);
      const half = result.side / 2;
      for (const ball of result.balls) {
        expect(Math.abs(ball.x), `N = ${n}`).toBeLessThanOrEqual(half - 1 + 1e-3);
        expect(Math.abs(ball.y), `N = ${n}`).toBeLessThanOrEqual(half - 1 + 1e-3);
      }
      for (let i = 0; i < result.balls.length; i++) {
        for (let j = i + 1; j < result.balls.length; j++) {
          const a = result.balls[i]!;
          const b = result.balls[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `N = ${n}`).toBeGreaterThan(2 - 1e-3);
        }
      }
    }
  });

  it("never claims to beat the known optimum", () => {
    // A score below the optimum would mean the solver is letting balls through
    // each other, and it would be invisible in the game itself.
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const balls: Ball[] = Array.from({ length: n }, (_, i) => ({
        x: Math.cos((i / n) * Math.PI * 2) * 2.5,
        y: Math.sin((i / n) * Math.PI * 2) * 2.5,
      }));
      const result = compact(balls, 20);
      expect(result.side, `N = ${n}`).toBeGreaterThan(optimum(n) - SLACK);
    }
  });
});

describe("balls outside the box", () => {
  it("leaves a ball outside untouched and still closes around the rest", () => {
    const outside: Ball = { x: 8, y: 8 };
    const balls: Ball[] = [{ x: -1.2, y: -1.2 }, { x: 1.2, y: 1.2 }, outside];

    const result = compact(balls, 10);

    expect(result.contained).toEqual([true, true, false]);
    expect(result.balls[2]).toEqual(outside);
    expect(result.side).toBeLessThan(optimum(2) + SLACK);
    expect(result.side).toBeGreaterThan(optimum(2) - SLACK);
  });

  it("does not let an outside ball's own overhang block the interior search", () => {
    // At the outside ball's own huge overhang, an unpartitioned residual check
    // would never read as fitting, and the search would never even attempt to
    // shrink around the other two.
    const balls: Ball[] = [{ x: -1.2, y: -1.2 }, { x: 1.2, y: 1.2 }, { x: 100, y: 100 }];
    const result = compact(balls, 10);
    expect(result.side).toBeLessThan(10);
  });
});

describe("de-compacting a box that no longer fits", () => {
  it("grows, rather than shrinks, when the contained balls do not fit", () => {
    // Two balls a diameter apart, dragged into a box far tighter than they fit.
    const balls: Ball[] = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ];
    const tooTight = 2.5;
    const result = compact(balls, tooTight);
    expect(result.side).toBeGreaterThan(tooTight);
    expect(result.contained).toEqual([true, true]);
  });

  it("never settles for a grown side the arrangement still does not fit in", () => {
    // Contained (centres well within half of the tiny starting side) but
    // heavily overlapping each other, so growing is the only way out.
    const balls: Ball[] = [
      { x: -0.3, y: 0 },
      { x: 0.3, y: 0 },
      { x: 0, y: 0.3 },
    ];
    const result = compact(balls, 1);
    const half = result.side / 2;
    for (const ball of result.balls) {
      expect(Math.abs(ball.x)).toBeLessThanOrEqual(half - 1 + 1e-3);
      expect(Math.abs(ball.y)).toBeLessThanOrEqual(half - 1 + 1e-3);
    }
    for (let i = 0; i < result.balls.length; i++) {
      for (let j = i + 1; j < result.balls.length; j++) {
        const a = result.balls[i]!;
        const b = result.balls[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 - 1e-3);
      }
    }
  });

  it("ignores an outside ball while de-compacting the rest", () => {
    const outside: Ball = { x: 50, y: 50 };
    const balls: Ball[] = [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      outside,
    ];
    const tooTight = 2.5;
    const result = compact(balls, tooTight);
    expect(result.contained).toEqual([true, true, false]);
    expect(result.balls[2]).toEqual(outside);
    expect(result.side).toBeGreaterThan(tooTight);
  });
});
