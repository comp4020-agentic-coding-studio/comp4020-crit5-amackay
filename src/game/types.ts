// All lengths in this game are in ball radii, which is the convention the
// published circle-packing tables use, so a score compares to them directly.
export const BALL_RADIUS = 1;

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
