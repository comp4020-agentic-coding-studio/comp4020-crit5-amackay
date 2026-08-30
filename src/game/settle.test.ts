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

  it("sheds a ball off the inner slope back into the box", () => {
    // A wall is a ridge with an incline a radius wide on each side, both sides
    // pushing away from the line. Inside the line, away means in.
    const side = 10;
    for (const x of [4.05, 4.4, 4.9, 4.99]) {
      const result = settle([{ x, y: 0 }], { side, tolerance: PRECISE });
      expect(result.balls[0]!.x, `from x = ${x}`).toBeCloseTo(side / 2 - 1, 6);
    }
  });

  it("sheds a ball off the outer slope right out of the box", () => {
    // Outside the line, away means out. This is the half that makes a wall a
    // hill rather than a fence, and it is what lets a box dragged too tight
    // throw balls out instead of merely refusing to close.
    const side = 10;
    for (const x of [5.01, 5.4, 5.9, 5.99]) {
      const result = settle([{ x, y: 0 }], { side, tolerance: PRECISE });
      expect(result.balls[0]!.x, `from x = ${x}`).toBeCloseTo(side / 2 + 1, 6);
    }
  });

  it("drops a ball balanced exactly on the ridge inward", () => {
    // IDEA.md asks for an exact alignment to be broken rather than to persist.
    const result = settle([{ x: 5, y: 0 }], { side: 10, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(4, 6);
  });

  it("leaves a ball well clear of the ridge alone", () => {
    const outside = { x: 20, y: -14 };
    const result = settle([outside], { side: 10, tolerance: PRECISE });
    expect(result.balls[0]).toEqual(outside);
  });

  it("still counts an escaped ball as not fitting", () => {
    // No force on it, but the box plainly does not contain it, and compacting
    // must never call that a fit.
    expect(measure([{ x: 20, y: 0 }], { side: 10 }).residual).toBeGreaterThan(2);
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
  it("lifts a carried ball clear, disturbing nothing it passes over", () => {
    // IDEA.md: a dragged ball "moves freely without collision". It is out of
    // the arrangement entirely while carried, so a neighbour it is sitting on
    // top of must not move at all.
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0 },
    ];
    const result = settle(balls, { side: ROOMY, lifted: 0, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 0, y: 0 });
    expect(result.balls[1]).toEqual({ x: 1.0, y: 0 });
  });

  it("ignores the walls for a carried ball too", () => {
    const balls: Ball[] = [{ x: 40, y: 40 }];
    const result = settle(balls, { side: 6, lifted: 0, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 40, y: 40 });
  });

  it("shoves the neighbours aside the moment it is let go", () => {
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0 },
    ];
    const result = settle(balls, { side: ROOMY, tolerance: PRECISE });
    expect(distance(result.balls[0]!, result.balls[1]!)).toBeCloseTo(2, 6);
  });

  it("holds a descending ball still and moves everything out of its way", () => {
    // IDEA.md: releasing "fixes its position in plan and lowers it back down,
    // pushing its neighbours aside as it descends". Being pinned is a third
    // state, not the same as being carried: carried disturbs nothing,
    // descending disturbs everything and is itself immovable.
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0 },
      { x: -1.0, y: 0 },
    ];
    const result = settle(balls, { side: ROOMY, pinned: 0, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 0, y: 0 });
    expect(result.balls[1]!.x).toBeCloseTo(2, 6);
    expect(result.balls[2]!.x).toBeCloseTo(-2, 6);
  });

  it("does not let a wall move a descending ball either", () => {
    const result = settle([{ x: 4.5, y: 0 }], { side: 10, pinned: 0, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 4.5, y: 0 });
  });

  it("bumps balls away from a pusher without moving the pusher", () => {
    const balls: Ball[] = [{ x: 0.3, y: 0 }];
    const result = settle(balls, { side: ROOMY, pusher: { x: 0, y: 0 }, tolerance: PRECISE });
    // Shoved just clear of the pointer, which is a point and not a ball.
    expect(result.balls[0]!.x).toBeCloseTo(1, 6);
    expect(result.balls[0]!.y).toBeCloseTo(0, 6);
  });

  it("does not reach a ball the pointer is not touching", () => {
    // A pointer treated as a ball of its own nudges things from a radius away,
    // which reads as pushing with an invisible object rather than a fingertip.
    const balls: Ball[] = [{ x: 1.5, y: 0 }];
    const result = settle(balls, { side: ROOMY, pusher: { x: 0, y: 0 }, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 1.5, y: 0 });
  });
});

describe("the edge of the screen", () => {
  const bounds = { x: 8, y: 5 };

  it("never lets a ball past the bound, however hard it is pushed", () => {
    const balls: Ball[] = [
      { x: 7.9, y: 4.9 },
      { x: 7.9, y: 4.9 },
      { x: 7.9, y: 4.9 },
    ];
    const result = settle(balls, { side: 4, bounds, tolerance: PRECISE });
    for (const ball of result.balls) {
      expect(Math.abs(ball.x)).toBeLessThanOrEqual(bounds.x);
      expect(Math.abs(ball.y)).toBeLessThanOrEqual(bounds.y);
    }
  });

  it("hauls a ball already outside the bound back to it", () => {
    const result = settle([{ x: 40, y: -40 }], { side: 4, bounds, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: bounds.x, y: -bounds.y });
  });

  it("holds a carried ball on screen too", () => {
    const result = settleOnce([{ x: 40, y: 0 }], { side: 4, bounds, lifted: 0 });
    expect(result.balls[0]!.x).toBe(bounds.x);
  });

  it("still converges with balls jammed against the edge", () => {
    // A clamped ball must read as settled, not as forever moving, or nothing
    // that waits on convergence would ever finish.
    const balls: Ball[] = Array.from({ length: 6 }, (_, i) => ({ x: 7.5 + i * 0.1, y: 4.5 }));
    const result = settle(balls, { side: 30, bounds });
    expect(result.converged).toBe(true);
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
