import { CONTACT_DISTANCE } from "./types";

// The one place a third dimension earns its keep. Exactly one ball is ever off
// the plane, so the arrangement stays coplanar and the packing stays a packing —
// which is what keeps the published optima the right target. Modelling the rules
// in 3D would break that: under a squeeze the balls would ride up over each
// other, and a pile is not a circle packing.

/**
 * Height at which a ball is clear of every neighbour. Two balls touch at
 * CONTACT_DISTANCE, so lifting one that far clears it completely; anything less
 * would leave a carried ball still shouldering its way through.
 */
export const CARRY_HEIGHT = CONTACT_DISTANCE;

/**
 * The fastest a ball is pushed across the plane, in radii per second. It sets
 * how long a shove takes to travel, never what it settles to, so it is a feel
 * constant and nothing else. At 4 a ball shoved a full diameter takes half a
 * second, which is slow enough to see one ball push another push a third.
 *
 * It lives here rather than at the edge because the fall below is timed against
 * it, and two constants that have to agree should not be in two files.
 */
export const MAX_SPEED = 4;

/**
 * Downward acceleration, in radii per second squared --- derived rather than
 * dialled in.
 *
 * A ball dropped squarely on a neighbour has to shove it a full diameter, and a
 * shoved ball travels at MAX_SPEED, so that shove takes CARRY_HEIGHT/MAX_SPEED
 * seconds. The fall is timed to take exactly as long: the ball lands at the
 * moment its neighbour arrives. Falling any faster means landing on a ball that
 * has not finished getting out of the way, and what has not been resolved by
 * then is shared out on landing --- which shows up as the drop sliding off the
 * spot the player chose.
 */
const FALL_SECONDS = CARRY_HEIGHT / MAX_SPEED;
const GRAVITY = (2 * CARRY_HEIGHT) / (FALL_SECONDS * FALL_SECONDS);

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
  // The square is the contact distance, not the carry height. They are equal
  // today, and they are not the same quantity: one is when two balls touch, the
  // other is how far up a drag lifts. Raise the carry height for feel and this
  // law has to stay written in terms of contact.
  return Math.sqrt(CONTACT_DISTANCE * CONTACT_DISTANCE - h * h);
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
