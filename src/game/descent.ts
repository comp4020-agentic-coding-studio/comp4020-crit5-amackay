import { BALL_RADIUS } from "./types";

// The one place a third dimension earns its keep. Exactly one ball is ever off
// the plane, so the arrangement stays coplanar and the packing stays a packing —
// which is what keeps the published optima the right target. Modelling the rules
// in 3D would break that: under a squeeze the balls would ride up over each
// other, and a pile is not a circle packing.

/** Height at which a ball is clear of every neighbour: two radii up. */
export const CARRY_HEIGHT = 2 * BALL_RADIUS;

/**
 * Downward acceleration, in radii per second squared. Sets the whole feel of a
 * release and nothing else; at 40 the fall from carry height takes about 0.32 s.
 * Playtest-tunable.
 */
const GRAVITY = 40;

export interface Descent {
  /** Height above the plane, in radii. Falls to 0, which is landed. */
  height: number;
  /** Downward speed, in radii per second. */
  speed: number;
}

/**
 * How far a ball at this height holds a coplanar neighbour's centre from its
 * own.
 *
 * Two unit spheres touch at centre distance 2, so one raised to `h` reaches only
 * `sqrt(4 - h²)` across: nothing at all at `h = 2`, a full diameter at `h = 0`.
 * Lowering `h` is therefore IDEA.md's "lowers it back down, pushing its
 * neighbours aside as it descends" taken literally rather than approximated —
 * and it is what dissolves carried, descending and settled into one number.
 */
export function exclusionAt(height: number): number {
  const h = Math.min(CARRY_HEIGHT, Math.max(0, height));
  return Math.sqrt(CARRY_HEIGHT * CARRY_HEIGHT - h * h);
}

/**
 * One step of the fall, by a delta rather than by a clock — rAF does not tick
 * under test, and nothing in the rules may ask what time it is.
 */
export function stepDescent(descent: Descent, dtSeconds: number): Descent {
  const dt = Math.max(0, dtSeconds);
  const speed = descent.speed + GRAVITY * dt;
  return { height: Math.max(0, descent.height - speed * dt), speed };
}

/** A ball dropped from carry height, not yet moving. */
export function release(): Descent {
  return { height: CARRY_HEIGHT, speed: 0 };
}
