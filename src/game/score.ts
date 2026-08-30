import { optimum } from "./optima";

/**
 * The naive square grid: ceil(sqrt(N)) balls to a row, each 2 radii across.
 * This is the arrangement a player reaches without thinking about it, so it is
 * the bar the first star is set at.
 */
export function par(n: number): number {
  return 2 * Math.ceil(Math.sqrt(n));
}

// Star thresholds are all set relative to the optimum, as a fraction of it.
// Playtest-tunable: these decide whether the difficulty ramp is fair, and only
// a played game can answer that.
export const THREE_STAR_TOLERANCE = 0.02;
export const TWO_STAR_TOLERANCE = 0.06;
export const ONE_STAR_TOLERANCE = 0.12;

// Sizes are compared with a little slack so a float-exact optimum still counts.
const EPS = 1e-9;

export interface Thresholds {
  one: number;
  two: number;
  three: number;
}

/**
 * The largest size that still earns each star count.
 *
 * One star can never be harder than the grid, which is what keeps the ramp
 * ordered at the perfect squares (N = 1, 4, 9, 16), where the grid *is* the
 * optimum and a bare `size <= par` rule would make one star harder to earn
 * than three.
 */
export function thresholds(n: number): Thresholds {
  const best = optimum(n);
  return {
    three: best * (1 + THREE_STAR_TOLERANCE),
    two: best * (1 + TWO_STAR_TOLERANCE),
    one: Math.max(par(n), best * (1 + ONE_STAR_TOLERANCE)),
  };
}

export type Stars = 0 | 1 | 2 | 3;

/** How many stars a box of this size earns at level N. */
export function stars(n: number, size: number): Stars {
  const t = thresholds(n);
  if (size <= t.three + EPS) return 3;
  if (size <= t.two + EPS) return 2;
  if (size <= t.one + EPS) return 1;
  return 0;
}

/** A level is complete once it has been beaten at all. */
export function isComplete(n: number, size: number): boolean {
  return stars(n, size) > 0;
}
