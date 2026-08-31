import { measure, settle, type SettleOptions } from "./settle";
import type { Ball, Side } from "./types";

// Closing the box. The box is centred and square, so the side is the only
// variable and this is a one-dimensional search: shrink, settle, and accept the
// new side if the arrangement still fits.

/** How much to try taking off the side to begin with, in ball radii. */
const FIRST_STEP = 0.25;

/** Stop refining once the step is finer than this; it is the score's accuracy. */
const PRECISION = 0.001;

/** An arrangement fits if nothing overlaps or overhangs by more than this. */
const FIT_TOLERANCE = 1e-4;

/** A settle inside compacting is run to well below the fit tolerance. */
const SETTLE_TOLERANCE = 1e-9;

export interface CompactOptions {
  precision?: number;
  fitTolerance?: number;
}

export interface CompactResult {
  balls: Ball[];
  side: Side;
  /** How many candidate sides were tried. */
  attempts: number;
  /**
   * Which balls, by original index, took part in the search. A ball whose
   * centre had already left the box is not the box's to move, so it is
   * carried through unchanged and flagged false here.
   */
  contained: boolean[];
}

function fits(balls: readonly Ball[], side: Side, fitTolerance: number): Ball[] | null {
  const options: SettleOptions = { side, tolerance: SETTLE_TOLERANCE };
  const settled = settle(balls, options);
  if (!settled.converged) return null;
  return settled.residual <= fitTolerance ? settled.balls : null;
}

/** Whether a ball's centre lies within the square, the same test rimAt makes. */
function isContained(ball: Ball, side: Side): boolean {
  const half = side / 2;
  return Math.abs(ball.x) <= half && Math.abs(ball.y) <= half;
}

/**
 * Grow the side outward from `startSide`, which does not fit, until `balls`
 * fits again. Bracket first (doubling the step on every miss, from the same
 * starting point a shrink takes), then bisect the bracket down to
 * `precision` — the mirror image of the shrink search below, widening instead
 * of narrowing.
 */
function growToFit(
  balls: readonly Ball[],
  startSide: Side,
  precision: number,
  fitTolerance: number,
): { balls: Ball[]; side: Side; attempts: number } {
  let low = startSide;
  let lowBalls = balls.map((ball) => ({ x: ball.x, y: ball.y }));
  let step = FIRST_STEP;
  let high = startSide + step;
  let highBalls = fits(lowBalls, high, fitTolerance);
  let attempts = 1;

  while (!highBalls) {
    step *= 2;
    high = startSide + step;
    highBalls = fits(lowBalls, high, fitTolerance);
    attempts++;
  }

  while (high - low > precision) {
    const mid = (low + high) / 2;
    attempts++;
    const settled = fits(lowBalls, mid, fitTolerance);
    if (settled) {
      high = mid;
      highBalls = settled;
    } else {
      low = mid;
    }
  }

  return { balls: highBalls, side: high, attempts };
}

/**
 * Close the box as far as it will go, and report the side it reached — or, if
 * the balls it contains do not fit at the side it started from, open it back
 * out until they do.
 *
 * A ball outside the box (its centre past the wall) takes no part in either
 * search and is returned exactly where it was; the search only ever concerns
 * itself with the balls the box actually contains.
 *
 * Deterministic all the way down: settling is deterministic and the step
 * sequence is fixed, so compacting an unchanged arrangement twice returns the
 * identical number. That is what makes pressing the control repeatedly not a
 * strategy.
 */
export function compact(
  balls: readonly Ball[],
  startSide: Side,
  opts: CompactOptions = {},
): CompactResult {
  const precision = opts.precision ?? PRECISION;
  const fitTolerance = opts.fitTolerance ?? FIT_TOLERANCE;

  const containedIndex: number[] = [];
  const outsideIndex: number[] = [];
  for (let i = 0; i < balls.length; i++) {
    (isContained(balls[i]!, startSide) ? containedIndex : outsideIndex).push(i);
  }
  const containedBalls = containedIndex.map((i) => balls[i]!);

  // Settle where we are first, so the search starts from an arrangement that
  // fits rather than from wherever the player let go — but only if it does not
  // already fit. Re-settling a settled arrangement would relax it by a hair
  // every time, and enough presses of an untouched arrangement would eventually
  // creep it across a precision step. Skipping the no-op keeps compacting
  // idempotent by construction rather than to within a tolerance.
  const alreadyFits = measure(containedBalls, { side: startSide }).residual <= fitTolerance;
  let bestBalls: Ball[] = alreadyFits
    ? containedBalls.map((ball) => ({ x: ball.x, y: ball.y }))
    : settle(containedBalls, { side: startSide, tolerance: SETTLE_TOLERANCE }).balls;
  let bestSide = startSide;
  let attempts = 0;

  if (fits(bestBalls, bestSide, fitTolerance)) {
    let step = FIRST_STEP;
    while (step >= precision) {
      const candidate = bestSide - step;
      attempts++;
      const settled = candidate > 0 ? fits(bestBalls, candidate, fitTolerance) : null;
      if (settled) {
        bestBalls = settled;
        bestSide = candidate;
      } else {
        // Too far. Halve the step and try a shallower bite from the same side.
        step /= 2;
      }
    }
  } else {
    const grown = growToFit(bestBalls, bestSide, precision, fitTolerance);
    bestBalls = grown.balls;
    bestSide = grown.side;
    attempts += grown.attempts;
  }

  const resultBalls: Ball[] = new Array(balls.length);
  const contained: boolean[] = new Array(balls.length).fill(false);
  containedIndex.forEach((originalIndex, k) => {
    resultBalls[originalIndex] = bestBalls[k]!;
    contained[originalIndex] = true;
  });
  outsideIndex.forEach((originalIndex) => {
    const ball = balls[originalIndex]!;
    resultBalls[originalIndex] = { x: ball.x, y: ball.y };
  });

  return { balls: resultBalls, side: bestSide, attempts, contained };
}

/** What the current arrangement measures without moving anything. */
export function fitsNow(balls: readonly Ball[], side: Side): boolean {
  return measure(balls, { side }).residual <= FIT_TOLERANCE;
}
