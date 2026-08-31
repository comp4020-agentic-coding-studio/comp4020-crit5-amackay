import { par, thresholds } from "./score";
import { bestAt, reachableLevels, type Session } from "./session";
import { MAX_LEVEL } from "./types";

// The level-select histogram, as pure geometry. One row per level the player has
// reached; each row's bar is the recorded best and its notches are the star
// thresholds, all as fractions of a single fixed span so the rows read against
// each other as a picture of how the packing tightens with N.
//
// Nothing here is a string. The rows carry no numerals: twenty of them, each
// with an N or a size on it, would be twenty words on a screen whose whole
// visible-prose budget is twenty. Names for a screen reader live in an
// aria-label at the edge, which is an attribute and costs nothing.

/**
 * The span every bar and notch is measured against, in ball radii. Fixed at the
 * largest square the game ever asks for (the naive grid at the last level), so
 * a bar's length means the same thing in every row and on the server-rendered
 * opening screen as it does once the game is running.
 */
export const BAR_MAX = par(MAX_LEVEL);

export interface HistogramRow {
  /** The level, which is also the ball count. */
  n: number;
  /** This is the level being played right now. */
  current: boolean;
  /** This level has been beaten at least once. */
  complete: boolean;
  /**
   * The recorded best for this level as a fraction of BAR_MAX, or null if it
   * has never been beaten — which can only be the frontier row, since every
   * earlier level was completed on the way past it.
   */
  bestFraction: number | null;
  /** Star thresholds as fractions of BAR_MAX, tightest (three) first. */
  notches: { one: number; two: number; three: number };
}

/** One row per level reached, in order, none beyond. */
export function histogramRows(session: Session): HistogramRow[] {
  return reachableLevels(session).map((n) => {
    const best = bestAt(session, n);
    const t = thresholds(n);
    return {
      n,
      current: n === session.level,
      complete: best !== undefined,
      bestFraction: best ? best.side / BAR_MAX : null,
      notches: {
        one: t.one / BAR_MAX,
        two: t.two / BAR_MAX,
        three: t.three / BAR_MAX,
      },
    };
  });
}
