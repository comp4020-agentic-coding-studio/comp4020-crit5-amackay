import { CONTACT_DISTANCE, type Ball } from "./types";

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
 * Everything the player watches move is paced by this and nothing else — the
 * fall below included, which is why it lives here rather than at the edge.
 */
export const MAX_SPEED = 4;

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

/** The height at which a ball reaches exactly this far across — exclusionAt, back. */
export function heightFor(exclusion: number): number {
  const e = Math.min(CONTACT_DISTANCE, Math.max(0, exclusion));
  return Math.sqrt(CONTACT_DISTANCE * CONTACT_DISTANCE - e * e);
}

/**
 * How close the nearest other ball is, in plan. Infinite when the ball is alone,
 * which is level 1 and also any drop into open space.
 *
 * Walls are not counted: a ball off the plane is over the box rather than in it,
 * and the wall gets its turn the moment it lands.
 */
export function nearestGap(balls: readonly Ball[], index: number): number {
  const self = balls[index];
  if (!self) return Infinity;
  let nearest = Infinity;
  for (let i = 0; i < balls.length; i++) {
    if (i === index) continue;
    const gap = Math.hypot(balls[i]!.x - self.x, balls[i]!.y - self.y);
    if (gap < nearest) nearest = gap;
  }
  return nearest;
}

/**
 * One step of the fall.
 *
 * No gravity and no velocity: a released ball comes down as fast as the
 * arrangement will let it, and nothing else paces it. It presses until its reach
 * bites `bite` into its nearest neighbour, and that bite is the force shoving
 * the neighbour clear — so the descent advances exactly as fast as the shove it
 * causes, which is already capped. Dropped into a gap it is clear of, there is
 * nothing to wait for and it lands.
 *
 * A clock paced this before, and the wait it produced was the wrong shape: half
 * a second whether or not anything was in the way, which on a drop into open
 * space is half a second of watching nothing happen.
 *
 * Two bounds hold it, and only those. `maxDrop` is the quickest it may come
 * down, so a landing stays a beat the eye can follow rather than a teleport.
 * `minDrop` is the slowest, and it is what stops a ball hanging in the air for
 * ever: a neighbour jammed against a wall or another ball never opens the gap,
 * so waiting on it never ends. A real ball would stay up there resting on the
 * pile, but only one ball is ever off the plane here — a ball perched on two
 * others is not a circle packing — so it has to come down and squeeze in.
 */
export function stepDescent(
  height: number,
  gap: number,
  bite: number,
  minDrop: number,
  maxDrop: number,
): number {
  const allowed = heightFor(gap + bite);
  const paced = Math.max(allowed, height - maxDrop); // no quicker than the beat
  const forced = Math.min(paced, height - minDrop); // and no slower than this
  return Math.max(0, Math.min(height, forced));
}
