import { fitsNow } from "./compact";
import { par, thresholds } from "./score";
import { bestAt, type Session } from "./session";
import { MAX_LEVEL } from "./types";

// The level-select histogram, as pure geometry. One row per level in the game,
// reached or not; each row's bar is the recorded best and its notches are the
// star thresholds, all as fractions of a single fixed span so the rows read
// against each other as a picture of how the packing tightens with N.
//
// Nothing here is a string. The rows carry no numerals: twenty of them, each
// with an N or a size on it, would be twenty pieces of chrome saying what the
// bars already show. Names for a screen reader live in an aria-label at the
// edge, which is an attribute and costs nothing.

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
  /** Not reached yet, so it cannot be entered. */
  locked: boolean;
  /**
   * The recorded best for this level as a fraction of BAR_MAX, or null if it
   * has never been beaten — which can only be the frontier row, since every
   * earlier level was completed on the way past it.
   */
  bestFraction: number | null;
  /** Star thresholds as fractions of BAR_MAX, tightest (three) first. */
  notches: { one: number; two: number; three: number };
  /**
   * The threshold being aimed for, as a fraction of BAR_MAX: the tightest one
   * the box has not reached yet. Null on every row but the one being played,
   * and null there once the box is inside the last of them.
   */
  goal: number | null;
  /**
   * The box on screen right now, as a fraction of BAR_MAX --- so the row being
   * played reads as a gauge against its own goal, rather than as the record of
   * a result that has not happened yet. Null on every other row.
   */
  nowFraction: number | null;
  /**
   * Whether the arrangement currently fits the box. Only meaningful on the row
   * being played, and false is the ordinary state at the start of a level.
   *
   * The gauge needs it: a level opens at the previous level's box, which is
   * usually *smaller* than this level's first threshold, so a bar read against
   * a mark alone says "already past it" at exactly the moment nothing has been
   * achieved. What is missing is not size, it is room.
   */
  fits: boolean;
}

/**
 * The next star to go for, in radii, or null if the box is already inside the
 * tightest threshold with the arrangement fitting it.
 *
 * Read from the box on screen rather than from the recorded best, for the same
 * reason completion is: a re-entered level one is back at its opening size and
 * has to be beaten again, and a goal taken from `bests` would call it finished.
 * Crossing a notch steps the mark inward, which is the whole of the feedback.
 *
 * `fits` is not a detail. A level opens at the previous level's box with one
 * more ball in it, so it starts *under* every threshold while overlapping --- on
 * size alone that reads as three stars already won and nothing left to aim for,
 * which is the opposite of true. Nothing counts until the arrangement fits.
 */
export function goalFor(n: number, side: number, fits: boolean): number | null {
  const t = thresholds(n);
  if (!fits || side > t.one) return t.one;
  if (side > t.two) return t.two;
  if (side > t.three) return t.three;
  return null;
}

/** One row per level in the game, in order. */
export function histogramRows(session: Session): HistogramRow[] {
  return Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((n) => {
    const best = bestAt(session, n);
    const t = thresholds(n);
    const current = n === session.level;
    const fits = current && fitsNow(session.balls, session.side);
    const goal = current ? goalFor(n, session.side, fits) : null;
    return {
      n,
      current,
      complete: best !== undefined,
      locked: n > session.reached,
      bestFraction: best ? best.side / BAR_MAX : null,
      notches: {
        one: t.one / BAR_MAX,
        two: t.two / BAR_MAX,
        three: t.three / BAR_MAX,
      },
      goal: goal === null ? null : goal / BAR_MAX,
      // Capped: the widest square the game asks for is the naive grid at the
      // last level, and a box dragged out past that would otherwise run the
      // bar off the end of its own track.
      nowFraction: current ? Math.min(1, session.side / BAR_MAX) : null,
      fits,
    };
  });
}
