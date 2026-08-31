import { describe, expect, it } from "vitest";
import { CARRY_HEIGHT, exclusionAt, release, stepDescent } from "./descent";

describe("how far a raised ball reaches", () => {
  it("reaches nothing at carry height and a full diameter on the plane", () => {
    // The two ends of the whole mechanism: at carry height a ball can be moved
    // across the arrangement without touching it, and on the plane it is an
    // ordinary member of it.
    expect(exclusionAt(CARRY_HEIGHT)).toBe(0);
    expect(exclusionAt(0)).toBe(2);
  });

  it("grows the whole way down, and never shrinks", () => {
    let previous = -1;
    for (let h = CARRY_HEIGHT; h >= 0; h -= 0.01) {
      const reach = exclusionAt(h);
      expect(reach, `at height ${h}`).toBeGreaterThan(previous);
      previous = reach;
    }
  });

  it("is the horizontal separation of two spheres in contact", () => {
    // The only thing this function is: two unit spheres touch at centre
    // distance 2, so one lifted to h clears its neighbour out to sqrt(4 - h^2).
    for (const h of [0.25, 0.5, 1, 1.5, 1.9]) {
      expect(Math.hypot(exclusionAt(h), h), `at height ${h}`).toBeCloseTo(2, 12);
    }
  });

  it("clamps rather than returning a NaN off either end", () => {
    // A height out of range is a caller's bug, but a silent NaN would spread
    // through every position in the arrangement before anything threw.
    expect(exclusionAt(3)).toBe(0);
    expect(exclusionAt(-1)).toBe(2);
  });
});

describe("the fall", () => {
  it("starts at carry height, at rest", () => {
    expect(release()).toEqual({ height: CARRY_HEIGHT, speed: 0 });
  });

  it("accelerates, so it covers more ground the longer it has fallen", () => {
    let descent = release();
    const drops: number[] = [];
    for (let i = 0; i < 10; i++) {
      const next = stepDescent(descent, 1 / 240);
      drops.push(descent.height - next.height);
      descent = next;
    }
    for (let i = 1; i < drops.length; i++) {
      expect(drops[i]!, `step ${i}`).toBeGreaterThan(drops[i - 1]!);
    }
  });

  it("lands, and stays landed", () => {
    let descent = release();
    for (let i = 0; i < 600; i++) descent = stepDescent(descent, 1 / 60);
    expect(descent.height).toBe(0);
  });

  it("takes the same time to land whatever the deltas were", () => {
    // Stepped by a delta and never by a clock, so the fall a player sees does
    // not depend on what frame rate their machine happens to manage.
    const timeToLand = (dt: number): number => {
      let descent = release();
      let elapsed = 0;
      while (descent.height > 0 && elapsed < 10) {
        descent = stepDescent(descent, dt);
        elapsed += dt;
      }
      return elapsed;
    };
    const reference = timeToLand(1 / 240);
    for (const dt of [1 / 120, 1 / 60, 1 / 30]) {
      // Euler integration lands a little early at a coarse step; a frame's
      // worth is the honest bound on the agreement, not a tighter number.
      expect(timeToLand(dt), `at dt = ${dt}`).toBeCloseTo(reference, 1);
    }
  });

  it("ignores a negative delta rather than falling upward", () => {
    const descent = release();
    expect(stepDescent(descent, -1).height).toBe(CARRY_HEIGHT);
  });
});
