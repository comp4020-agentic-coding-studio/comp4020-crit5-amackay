import { describe, expect, it } from "vitest";
import { CARRY_HEIGHT, exclusionAt } from "./descent";
import { measure, settle, settleOnce } from "./settle";
import { BALL_RADIUS, WALL_WIDTH, type Ball } from "./types";

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
    // Past the crest, away means out. This is the half that makes a wall a
    // hill rather than a fence, and it is what lets a box dragged too tight
    // throw balls out instead of merely refusing to close.
    //
    // Every start is past the crest at side/2 + WALL_WIDTH/2. A ball inside it
    // is on the wall's inner half and belongs to the test above.
    const side = 10;
    for (const x of [5.2, 5.5, 6.0, 6.2]) {
      const result = settle([{ x, y: 0 }], { side, tolerance: PRECISE });
      // Rest is against the wall's outer face: the face, plus a radius.
      expect(result.balls[0]!.x, `from x = ${x}`).toBeCloseTo(
        side / 2 + WALL_WIDTH + BALL_RADIUS,
        6,
      );
    }
  });

  it("drops a ball balanced exactly on the crest inward", () => {
    // IDEA.md asks for an exact alignment to be broken rather than to persist.
    // The crest is the middle of the wall, not its inner face.
    const side = 10;
    const result = settle([{ x: side / 2 + WALL_WIDTH / 2, y: 0 }], { side, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(side / 2 - BALL_RADIUS, 6);
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

describe("the speed cap", () => {
  // The cap is what stops a big overlap resolving almost entirely in its first
  // two passes, so a shove travels instead of arriving. It must not be able to
  // change where the arrangement ends up, because that is where scores come
  // from.
  const CAP = 0.02;

  /** Passes with a cap on, which settle() deliberately will not do. */
  function settleCapped(balls: readonly Ball[], side: number, passes: number): Ball[] {
    let current = balls.map((b) => ({ ...b }));
    for (let i = 0; i < passes; i++) {
      current = settleOnce(current, { side, maxStep: CAP }).balls;
    }
    return current;
  }

  it("shortens a step without turning it", () => {
    // The whole lemma, and the reason nothing downstream can go wrong: per ball
    // the capped displacement is a positive multiple of the uncapped one. Rest
    // is where the displacement is zero, and scaling zero is still zero, so the
    // arrangements the solver may stop at are exactly the same set.
    const balls: Ball[] = [
      { x: -0.4, y: 0.1 },
      { x: 0.4, y: -0.15 },
      { x: 0, y: 0.5 },
    ];
    const free = settleOnce(balls, { side: ROOMY }).balls;
    const capped = settleOnce(balls, { side: ROOMY, maxStep: CAP }).balls;
    for (let i = 0; i < balls.length; i++) {
      const fx = free[i]!.x - balls[i]!.x;
      const fy = free[i]!.y - balls[i]!.y;
      const cx = capped[i]!.x - balls[i]!.x;
      const cy = capped[i]!.y - balls[i]!.y;
      // Parallel, same way round, and no longer than the cap.
      expect(fx * cy - fy * cx, `ball ${i} turned`).toBeCloseTo(0, 12);
      expect(fx * cx + fy * cy, `ball ${i} reversed`).toBeGreaterThan(0);
      expect(Math.hypot(cx, cy), `ball ${i} overshot`).toBeLessThanOrEqual(CAP + 1e-12);
      expect(Math.hypot(cx, cy)).toBeLessThanOrEqual(Math.hypot(fx, fy) + 1e-12);
    }
  });

  it("holds every ball to the cap while there is still force to resolve", () => {
    const balls: Ball[] = [
      { x: -0.4, y: 0 },
      { x: 0.4, y: 0 },
    ];
    // Uncapped this pair resolves exactly in one pass, which is what ALPHA is
    // pinned to; capped it may not move further than the cap.
    const pass = settleOnce(balls, { side: ROOMY, maxStep: CAP });
    for (let i = 0; i < balls.length; i++) {
      const moved = Math.hypot(pass.balls[i]!.x - balls[i]!.x, pass.balls[i]!.y - balls[i]!.y);
      expect(moved, `ball ${i}`).toBeCloseTo(CAP, 12);
    }
  });

  it("comes to rest somewhere the uncapped solver would also rest", () => {
    // It can and does change *which* rest is reached — a loose cluster has a
    // whole family of them and the path picks one — so what is worth asserting
    // is that wherever it stops, the uncapped solver is finished there too.
    // That is what makes compacting from it safe.
    const balls: Ball[] = [
      { x: -0.4, y: 0.1 },
      { x: 0.4, y: -0.1 },
      { x: 0, y: 0.5 },
      { x: 0.2, y: -0.6 },
    ];
    const rested = settleCapped(balls, ROOMY, 2000);
    const check = settleOnce(rested, { side: ROOMY });
    expect(check.maxDisplacement).toBeLessThan(1e-9);
    expect(check.residual).toBeLessThan(1e-9);
  });

  it("keeps a symmetric arrangement symmetric", () => {
    // The cap keys on the size of a displacement, and two balls related by a
    // symmetry of the arrangement have displacements of the same size — so the
    // same factor applies to both and the symmetry survives. Without that, the
    // grid levels would drift off square.
    const balls: Ball[] = [
      { x: -0.5, y: -0.5 },
      { x: 0.5, y: -0.5 },
      { x: -0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    ];
    const [a, b, c, d] = settleCapped(balls, ROOMY, 2000) as [Ball, Ball, Ball, Ball];
    expect(a.x).toBeCloseTo(-b.x, 12);
    expect(a.y).toBeCloseTo(b.y, 12);
    expect(a.x).toBeCloseTo(c.x, 12);
    expect(a.y).toBeCloseTo(-c.y, 12);
    expect(a.x).toBeCloseTo(-d.x, 12);
    expect(a.y).toBeCloseTo(-d.y, 12);
  });

  it("is refused by a settle run to convergence", () => {
    // Convergence is judged on the largest step any ball took, and a cap is
    // shortening exactly that — so a cap under the tolerance would report a
    // converged fit on the first pass with the balls still overlapping, and
    // every score comes down this path. settle() strips it; this is the guard
    // on that staying true.
    const balls: Ball[] = [
      { x: -0.9, y: 0 },
      { x: 0.9, y: 0 },
    ];
    const result = settle(balls, { side: ROOMY, maxStep: 1e-12, tolerance: 1e-9 });
    expect(result.converged).toBe(true);
    expect(result.residual).toBeLessThan(1e-9);
    expect(distance(result.balls[0]!, result.balls[1]!)).toBeCloseTo(2, 6);
  });
});

describe("corners", () => {
  // Box of side 10, so the wall runs from 5 out to 5.22 and its outer corner
  // sits at (5.22, 5.22). That outer corner is what a ball outside the box
  // leans on, and it is a corner rather than a rounded turn --- which is the
  // whole reason the wall is measured as a ring and not as one offset square.
  const side = 10;
  const INNER = side / 2;
  const OUTER = side / 2 + WALL_WIDTH;
  const CORNER = { x: OUTER, y: OUTER };

  function fromCorner(ball: Ball): number {
    return Math.hypot(ball.x - CORNER.x, ball.y - CORNER.y);
  }

  /** Distance from the wall itself: the ring between the two faces. */
  function fromWall(ball: Ball): number {
    const sd = (h: number) => {
      const qx = Math.abs(ball.x) - h;
      const qy = Math.abs(ball.y) - h;
      return qx > 0 || qy > 0
        ? Math.hypot(Math.max(qx, 0), Math.max(qy, 0))
        : Math.max(qx, qy);
    };
    return Math.max(sd(OUTER), -sd(INNER));
  }

  it("does not reach a ball level with a wall but far past its corner", () => {
    // The bug this replaces: four walls treated as four independent lines, each
    // running to infinity, so a ball nowhere near the box still felt one. The
    // rim follows the square's outline and stops at the corner.
    for (const ball of [
      { x: 5, y: 20 },
      { x: 5, y: 6.5 },
      { x: -5, y: -40 },
      { x: 12, y: 5 },
    ]) {
      const result = settle([ball], { side, tolerance: PRECISE });
      expect(result.balls[0], `from (${ball.x}, ${ball.y})`).toEqual(ball);
    }
  });

  it("pushes a ball in the outer quadrant away from the corner point", () => {
    const result = settle([{ x: 5.3, y: 5.3 }], { side, tolerance: PRECISE });
    const ball = result.balls[0]!;
    // One radius from the outer corner point, not from an offset of it: an
    // offset square has rounded corners, and resting against one left the ball
    // 0.046 radii inside the wall.
    expect(fromCorner(ball)).toBeCloseTo(BALL_RADIUS, 6);
    expect(ball.x).toBeCloseTo(ball.y, 9); // straight out along the diagonal
    expect(ball.x).toBeGreaterThan(OUTER);
  });

  it("pushes a ball in a side quadrant square off the wall it is outside", () => {
    const result = settle([{ x: 5.5, y: 2 }], { side, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(side / 2 + WALL_WIDTH + BALL_RADIUS, 6);
    expect(result.balls[0]!.y).toBeCloseTo(2, 9); // and not along the other axis
  });

  it("pushes a ball in the inner quadrant off its nearest wall", () => {
    const result = settle([{ x: 4.5, y: 3 }], { side, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(4, 6);
    expect(result.balls[0]!.y).toBeCloseTo(3, 9);
  });

  it("pushes a ball on the inner diagonal diagonally", () => {
    // Equally near two walls, so neither one alone is the answer.
    const result = settle([{ x: 4.5, y: 4.5 }], { side, tolerance: PRECISE });
    expect(result.balls[0]!.x).toBeCloseTo(4, 6);
    expect(result.balls[0]!.y).toBeCloseTo(4, 6);
  });

  it("settles a ball one radius from the wall wherever it starts", () => {
    // The rest surface is one radius clear of the wall the whole way round, on
    // both sides and corners included — a ball's surface touches whichever face
    // it is against. That is one statement about one solid, which is what the
    // ring formulation buys: the corner stops being a place where two rules
    // meet and argue.
    for (const start of [
      { x: 4.4, y: 0 },
      { x: 4.4, y: 4.4 },
      { x: 5.4, y: 5.4 },
      { x: 5.4, y: 1 },
      { x: 4.6, y: 4.9 },
      { x: 5.5, y: 5.9 },
    ]) {
      const ball = settle([start], { side, tolerance: PRECISE }).balls[0]!;
      expect(fromWall(ball), `from (${start.x}, ${start.y})`).toBeCloseTo(BALL_RADIUS, 5);
    }
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
  /** Ball 0, up at carry height: the state a drag holds it in. */
  const CARRIED = { index: 0, height: CARRY_HEIGHT };
  /** Ball 0, part-way down: still immovable, but now reaching across. */
  const MID_FALL = { index: 0, height: 0.5 };

  it("lifts a carried ball clear, disturbing nothing it passes over", () => {
    // IDEA.md: a dragged ball "moves freely without collision". It is out of
    // the arrangement entirely while carried, so a neighbour it is sitting on
    // top of must not move at all.
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0 },
    ];
    const result = settle(balls, { side: ROOMY, raised: CARRIED, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 0, y: 0 });
    expect(result.balls[1]).toEqual({ x: 1.0, y: 0 });
  });

  it("ignores the walls for a carried ball too", () => {
    const balls: Ball[] = [{ x: 40, y: 40 }];
    const result = settle(balls, { side: 6, raised: CARRIED, tolerance: PRECISE });
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
    // pushing its neighbours aside as it descends". Descending is not the same
    // as being carried, and the difference is now the height itself: carried
    // reaches nothing, descending reaches as far as its height allows and is
    // itself immovable.
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0 },
      { x: -1.0, y: 0 },
    ];
    const result = settle(balls, { side: ROOMY, raised: MID_FALL, tolerance: PRECISE });
    const reach = exclusionAt(MID_FALL.height);
    expect(result.balls[0]).toEqual({ x: 0, y: 0 });
    expect(result.balls[1]!.x).toBeCloseTo(reach, 6);
    expect(result.balls[2]!.x).toBeCloseTo(-reach, 6);
    // Still short of a full diameter: the ball has further to fall, and the
    // neighbours have further to go when it does.
    expect(reach).toBeLessThan(2);
  });

  it("does not let a wall move a descending ball either", () => {
    const result = settle([{ x: 4.5, y: 0 }], { side: 10, raised: MID_FALL, tolerance: PRECISE });
    expect(result.balls[0]).toEqual({ x: 4.5, y: 0 });
  });

  it("makes a landed ball an ordinary member of the arrangement again", () => {
    // A height of 0 is not a fourth state to remember: it is the absence of the
    // one state there is, so the end of a descent needs no special case.
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 1.0, y: 0 },
    ];
    const landed = settle(balls, {
      side: ROOMY,
      raised: { index: 0, height: 0 },
      tolerance: PRECISE,
    });
    const plain = settle(balls, { side: ROOMY, tolerance: PRECISE });
    expect(landed.balls).toEqual(plain.balls);
    // And it moved, which a raised ball never does.
    expect(landed.balls[0]!.x).not.toBe(0);
  });

  it("reaches further across the lower it gets", () => {
    // The whole of the descent, as one property: a released ball's grip on its
    // neighbours grows from nothing to a full diameter as it comes down.
    const balls: Ball[] = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
    ];
    let previous = 0;
    for (const height of [2, 1.75, 1.5, 1.0, 0.5, 0.25, 0]) {
      const result = settle(balls, {
        side: ROOMY,
        raised: { index: 0, height },
        tolerance: PRECISE,
      });
      const gap = Math.abs(result.balls[1]!.x - result.balls[0]!.x);
      expect(gap, `at height ${height}`).toBeGreaterThanOrEqual(previous);
      previous = gap;
    }
    expect(previous).toBeCloseTo(2, 6);
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
    const result = settleOnce([{ x: 40, y: 0 }], { side: 4, bounds, raised: { index: 0, height: CARRY_HEIGHT } });
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
