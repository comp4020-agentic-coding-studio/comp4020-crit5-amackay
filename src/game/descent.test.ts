import { describe, expect, it } from "vitest";
import { CARRY_HEIGHT, exclusionAt, heightFor, nearestGap, stepDescent } from "./descent";

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
  // The numbers the frame loop uses, so these read as the game does.
  const BITE = 2 * (4 / 60 / 6);
  const MAX_DROP = CARRY_HEIGHT / (0.1 * 60 * 6);
  const MIN_DROP = 4 / 60 / 6;
  const CLEAR = Infinity;

  it("lands at once when there is nothing in the way", () => {
    // The complaint this answers: a clock-paced fall waited half a second
    // whether or not anything was under the ball, and a drop into open space
    // was half a second of watching nothing happen. Now the only thing keeping
    // it in the air is the beat.
    let h = CARRY_HEIGHT;
    let passes = 0;
    while (h > 0 && passes < 1000) {
      h = stepDescent(h, CLEAR, BITE, MIN_DROP, MAX_DROP);
      passes++;
    }
    expect(h).toBe(0);
    // Exactly the beat: 0.1s at 60fps and six passes a frame.
    expect(passes).toBe(36);
  });

  it("waits on a neighbour it has to shove, and only on that", () => {
    // Held up by a ball it is dropped squarely onto: it can only come down as
    // the gap opens, so the descent takes exactly as long as the shove.
    const heldUp = stepDescent(CARRY_HEIGHT, 0, BITE, MIN_DROP, MAX_DROP);
    expect(heldUp).toBeGreaterThan(CARRY_HEIGHT - MAX_DROP);
    expect(heldUp).toBeLessThan(CARRY_HEIGHT);

    // Half clear, so it comes a good way down in one step but not all the way.
    const partly = stepDescent(CARRY_HEIGHT, 1.5, BITE, 0, 99);
    expect(partly).toBeCloseTo(heightFor(1.5 + BITE), 12);
    expect(partly).toBeLessThan(1.4);
  });

  it("bites into the neighbour rather than resting on it", () => {
    // The bite is the force: without it the ball would settle onto whatever it
    // was dropped on and never push it aside at all.
    const h = stepDescent(CARRY_HEIGHT, 0.5, BITE, 0, 99);
    expect(exclusionAt(h)).toBeCloseTo(0.5 + BITE, 12);
    expect(exclusionAt(h)).toBeGreaterThan(0.5);
  });

  it("never rises, however the arrangement moves under it", () => {
    // A neighbour crowding back in must not push the ball back up: the fall is
    // one-way, which is what makes it terminate.
    let h = stepDescent(CARRY_HEIGHT, CLEAR, BITE, MIN_DROP, MAX_DROP);
    h = stepDescent(h, CLEAR, BITE, MIN_DROP, MAX_DROP);
    const crowded = stepDescent(h, 0, BITE, MIN_DROP, MAX_DROP);
    expect(crowded).toBeLessThanOrEqual(h);
  });

  it("lands even when the neighbour it is waiting on cannot move", () => {
    // The defect this closes: a ball dropped on a neighbour jammed against a
    // wall waits on a gap that never opens, and hangs in the air for ever.
    // Measured in the browser before the floor went in, the height stalled at
    // 0.384 and stayed there.
    let h = CARRY_HEIGHT;
    let passes = 0;
    while (h > 0 && passes < 10000) {
      h = stepDescent(h, 0, BITE, MIN_DROP, MAX_DROP); // gap never opens
      passes++;
    }
    expect(h).toBe(0);
    // Never longer than the shove it would cause at full stretch: half a
    // second, plus the pass it actually lands on — the floor takes a fixed bite
    // each pass and the last one overshoots zero.
    expect(passes).toBeLessThanOrEqual(0.5 * 60 * 6 + 1);
  });

  it("comes down no faster than the beat", () => {
    // Otherwise a drop into clear space is a teleport rather than a landing.
    let h = CARRY_HEIGHT;
    for (let i = 0; i < 10; i++) {
      const next = stepDescent(h, CLEAR, BITE, MIN_DROP, MAX_DROP);
      expect(h - next).toBeLessThanOrEqual(MAX_DROP + 1e-12);
      h = next;
    }
  });

  it("reads a gap of infinity for a ball with nothing near it", () => {
    expect(nearestGap([{ x: 0, y: 0 }], 0)).toBe(Infinity);
    expect(nearestGap([{ x: 0, y: 0 }, { x: 3, y: 4 }], 0)).toBeCloseTo(5, 12);
    expect(
      nearestGap([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 0, y: 1.5 }], 0),
    ).toBeCloseTo(1.5, 12);
  });

  it("is the inverse of the reach it is asked for", () => {
    for (const e of [0, 0.4, 1, 1.7, 2]) {
      expect(exclusionAt(heightFor(e)), `reach ${e}`).toBeCloseTo(e, 12);
    }
  });
});
