import { thresholds } from "./score";
import { bestAt, type Session } from "./session";
import { levels } from "./optima";

// The level-select histogram, as pure geometry. One row per level in the game,
// reached or not; each row's bar is the recorded best and its notches are the
// star sizes, all as fractions of a single fixed span --- one scale for the
// whole stack, so the rows read against each other as a picture of how the
// packing tightens with N. That comparability is why the rows are not drawn at
// each level's own scale the way the game screen's size bar is.
//
// Each row carries its level number, which the bar cannot say: a bar's length
// is a size, and which level it belongs to is a different fact.

/**
 * The span every bar and star is measured against, in ball radii: the widest
 * any row can ever need, which is the loosest one-star threshold in the game.
 * Derived rather than set, so no row can run off the end of its own track ---
 * par(MAX_LEVEL) alone is 10 and level twenty's one-star size is 10.055.
 */
export const BAR_MAX = Math.max(...levels().map((n) => thresholds(n).one));

export interface HistogramRow {
  /** The level, which is also the ball count. */
  n: number;
  /** This is the level being played right now. */
  current: boolean;
  /** This level has been beaten at least once. */
  complete: boolean;
  /** Not reached yet, so it cannot be entered. */
  locked: boolean;
  /**
   * The recorded best for this level as a fraction of BAR_MAX, or null if it
   * has never been beaten — which can only be the frontier row, since every
   * earlier level was completed on the way past it.
   */
  bestFraction: number | null;
  /** Star sizes as fractions of BAR_MAX, tightest (three) first. */
  notches: { one: number; two: number; three: number };
}

/** One row per level in the game, in order. */
export function histogramRows(session: Session): HistogramRow[] {
  return levels().map((n) => {
    const best = bestAt(session, n);
    const t = thresholds(n);
    return {
      n,
      current: n === session.level,
      complete: best !== undefined,
      locked: n > session.reached,
      bestFraction: best ? best.side / BAR_MAX : null,
      notches: {
        one: t.one / BAR_MAX,
        two: t.two / BAR_MAX,
        three: t.three / BAR_MAX,
      },
    };
  });
}
