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
}

function fits(balls: readonly Ball[], side: Side, fitTolerance: number): Ball[] | null {
  const options: SettleOptions = { side, tolerance: SETTLE_TOLERANCE };
  const settled = settle(balls, options);
  if (!settled.converged) return null;
  return settled.residual <= fitTolerance ? settled.balls : null;
}

/**
 * Close the box as far as it will go, and report the side it reached.
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

  // Settle where we are first, so the search starts from an arrangement that
  // fits rather than from wherever the player let go — but only if it does not
  // already fit. Re-settling a settled arrangement would relax it by a hair
  // every time, and enough presses of an untouched arrangement would eventually
  // creep it across a precision step. Skipping the no-op keeps compacting
  // idempotent by construction rather than to within a tolerance.
  const alreadyFits = measure(balls, { side: startSide }).residual <= fitTolerance;
  let bestBalls: Ball[] = alreadyFits
    ? balls.map((ball) => ({ x: ball.x, y: ball.y }))
    : settle(balls, { side: startSide, tolerance: SETTLE_TOLERANCE }).balls;
  let bestSide = startSide;
  let step = FIRST_STEP;
  let attempts = 0;

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

  return { balls: bestBalls, side: bestSide, attempts };
}

/** What the current arrangement measures without moving anything. */
export function fitsNow(balls: readonly Ball[], side: Side): boolean {
  return measure(balls, { side }).residual <= FIT_TOLERANCE;
}
