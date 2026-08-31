// All lengths in this game are in ball radii, which is the convention the
// published circle-packing tables use, so a score compares to them directly.
export const BALL_RADIUS = 1;

/** Centre distance at which two balls touch. */
export const CONTACT_DISTANCE = 2 * BALL_RADIUS;

/** A ball's position in world space. The radius is always BALL_RADIUS. */
export interface Ball {
  x: number;
  y: number;
}

/**
 * The box is an axis-aligned square centred on the world origin, so its whole
 * state is its side length. It never moves and never tracks the arrangement.
 */
export type Side = number;

/** The core sequence a first-time player is expected to finish. */
export const CORE_SEQUENCE = 10;

/** Levels beyond the core sequence exist for playtesting. */
export const MAX_LEVEL = 20;

/**
 * Wall thickness, in radii. The wall stands *outside* the scored square: `side`
 * is the clear interior span, which is what the published packing tables mean by
 * the side of the square, so a score compares to them with no correction. The
 * slab runs from `side/2` to `side/2 + WALL_WIDTH`.
 *
 * It is here rather than in the stylesheet because the drawn wall and the
 * simulated wall have to be the same wall. render.ts publishes it to CSS.
 */
export const WALL_WIDTH = 0.22;
