import { describe, expect, it } from "vitest";
import { measure, settle, settleOnce } from "./settle";
import type { Ball } from "./types";

const ROOMY = 40;

// Convergence stops when no ball moved further than the tolerance, so the
// geometry is only ever as accurate as the tolerance allows. Where a test
// asserts a position rather than a behaviour, it asks for a tighter settle
// rather than pretending the default one is exact.
const PRECISE = 1e-13;

function distance(a: Ball, b: Ball): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("one pass", () => {
  it("resolves an isolated overlapping pair exactly, in a single pass", () => {
    // This is the alpha calibration. If the constant drifts, this fails first.
    const pass = settleOnce(
      [
        { x: -0.9, y: 0 },
        { x: 0.9, y: 0 },
      ],
      { side: ROOMY },
    );
    expect(distance(pass.balls[0]!, pass.balls[1]!)).toBeCloseTo(2, 12);
  });

  it("moves nothing that is already resolved", () => {
    const balls: Ball[] = [
      { x: -3, y: 0 },
      { x: 3, y: 0 },
    ];
    const pass = settleOnce(balls, { side: ROOMY });
    expect(pass.maxDisplacement).toBe(0);
    expect(pass.balls).toEqual(balls);
  });

  it("accumulates rather than applying in place", () => {
    // The direct test of the model: permuting the balls must permute the
    // result and change nothing else. An accidental in-place write inside the
    // force loop is invisible to every other test here and fails this one.
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.2, y: 0.3 },
      { x: 0.4, y: 1.1 },
      { x: -1.0, y: 0.6 },
      { x: 0.2, y: -1.3 },
    ];
    const order = [3, 0, 4, 1, 2];
    const straight = settle(balls, { side: ROOMY });
    const permuted = settle(
      order.map((i) => balls[i]!),
      { side: ROOMY },
    );
    for (let slot = 0; slot < order.length; slot++) {
      const original = straight.balls[order[slot]!]!;
      expect(permuted.balls[slot]!.x).toBeCloseTo(original.x, 12);
      expect(permuted.balls[slot]!.y).toBeCloseTo(original.y, 12);
    }
  });

  it("keeps a symmetric arrangement symmetric", () => {
    // N = 4 and N = 9 are the levels IDEA.md calls restful; a solver that
    // resolved in place would drift them on whatever order the pairs came in.
    const balls: Ball[] = [
      { x: -0.6, y: -0.6 },
      { x: 0.6, y: -0.6 },
      { x: -0.6, y: 0.6 },
      { x: 0.6, y: 0.6 },
    ];
    const result = settle(balls, { side: ROOMY, tolerance: PRECISE });
    const [a, b, c, d] = result.balls as [Ball, Ball, Ball, Ball];
    expect(a.x).toBeCloseTo(-b.x, 12); // a and b mirror in x
    expect(a.y).toBeCloseTo(b.y, 12);
    expect(a.x).toBeCloseTo(c.x, 12); // a and c mirror in y
    expect(a.y).toBeCloseTo(-c.y, 12);
    expect(d.x).toBeCloseTo(-a.x, 12); // d is a through the origin
    expect(d.y).toBeCloseTo(-a.y, 12);
    expect(Math.abs(a.x)).toBeCloseTo(Math.abs(a.y), 12); // and on the diagonal
  });
});

describe("walls", () => {
  it("pushes a ball inside the ramp back out to the wall line", () => {
    const side = 10;
    const result = settle([{ x: 4.5, y: 0 }], { side, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(side / 2 - 1, 6);
  });

  it("brings a ball driven right outside the box back in", () => {
    const side = 10;
    const result = settle([{ x: 20, y: -14 }], { side, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(side / 2 - 1, 6);
    expect(result.balls[0]!.y).toBeCloseTo(-(side / 2) + 1, 6);
  });

  it("leaves every ball inside a box that comfortably fits them", () => {
    const side = 12;
    const balls: Ball[] = [
      { x: -1, y: 0 },
      { x: 0.5, y: 0.2 },
      { x: 0, y: -1.4 },
    ];
    const result = settle(balls, { side });
    for (const ball of result.balls) {
      expect(Math.abs(ball.x)).toBeLessThanOrEqual(side / 2 - 1 + 1e-6);
      expect(Math.abs(ball.y)).toBeLessThanOrEqual(side / 2 - 1 + 1e-6);
    }
  });

  it("reports residual as the worse of overlap and wall penetration", () => {
    // With one ball there are no pairs at all, so a residual that only counted
    // overlaps would call any box however small a perfect fit.
    expect(measure([{ x: 0, y: 0 }], { side: 1.5 }).residual).toBeCloseTo(0.25, 12);
    expect(measure([{ x: 0, y: 0 }], { side: 2 }).residual).toBe(0);
  });
});

describe("determinism", () => {
  it("gives bit-identical output for the same input twice", () => {
    const balls: Ball[] = [
      { x: 0.1, y: -0.2 },
      { x: 0.9, y: 0.4 },
      { x: -0.7, y: 0.8 },
    ];
    const a = settle(balls, { side: 8 });
    const b = settle(balls, { side: 8 });
    expect(a.balls).toEqual(b.balls);
    expect(a.iterations).toBe(b.iterations);
  });

  it("separates coincident balls, the same way every time", () => {
    const stacked: Ball[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ];
    const a = settle(stacked, { side: ROOMY, tolerance: PRECISE });
    const b = settle(stacked, { side: ROOMY, tolerance: PRECISE });
    expect(a.converged).toBe(true);
    expect(distance(a.balls[0]!, a.balls[1]!)).toBeCloseTo(2, 6);
    expect(a.balls).toEqual(b.balls);
  });
});

describe("held and pushed", () => {
  it("leaves a held ball where it is and moves its neighbours", () => {
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0 },
    ];
    const result = settle(balls, { side: ROOMY, held: 0, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 0, y: 0 });
    expect(result.balls[1]!.x).toBeCloseTo(2, 6);
  });

  it("bumps balls away from a pusher without moving the pusher", () => {
    const balls: Ball[] = [{ x: 0.3, y: 0 }];
    const result = settle(balls, { side: ROOMY, pusher: { x: 0, y: 0 }, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(2, 6);
    expect(result.balls[0]!.y).toBeCloseTo(0, 6);
  });
});

describe("convergence", () => {
  it("settles a crowded pile inside the iteration cap", () => {
    const balls: Ball[] = Array.from({ length: 10 }, (_, i) => ({
      x: Math.cos(i) * 0.5,
      y: Math.sin(i) * 0.5,
    }));
    const result = settle(balls, { side: 20 });
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1e-4);
  });
});
