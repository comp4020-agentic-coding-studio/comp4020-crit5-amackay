import { BALL_RADIUS, type Ball, type Side } from "./types";

// Quasi-static settling. Per pass: compute every force, sum per ball, then move
// every ball. Nothing moves mid-pass, so a ball with several contacts gets one
// coherent displacement rather than being shoved sequentially by each
// neighbour, and a symmetric arrangement stays symmetric.

const CONTACT_DISTANCE = 2 * BALL_RADIUS;

/** Ramp width on either side of a wall line, per IDEA.md. */
const RAMP = BALL_RADIUS;

/** Below this, two centres count as coincident and need a jitter direction. */
const DEGENERATE = 1e-9;

/**
 * Displacement per unit of net force, before the contact-count division.
 * At 0.5 an isolated overlapping pair resolves exactly in one pass, which is
 * what pins this constant: it is derived, not dialled in.
 */
const ALPHA = 0.5;

const DEFAULT_TOLERANCE = 1e-6;
const DEFAULT_MAX_ITERATIONS = 400;

/** A point that pushes balls but is not pushed back — a fingertip. */
export interface Pusher {
  x: number;
  y: number;
}

export interface SettleOptions {
  side: Side;
  /** Index of a ball that exerts force but receives none: the one being held. */
  held?: number | null;
  /** Dragging on empty background bumps balls aside. */
  pusher?: Pusher | null;
  tolerance?: number;
  maxIterations?: number;
}

export interface Measurement {
  /**
   * How badly the arrangement fails to fit, in radii: the deepest ball-ball
   * overlap or wall penetration, whichever is worse. Zero means it fits.
   */
  residual: number;
  /** Total inward force the walls are exerting — the pressure readout. */
  wallForce: number;
}

export interface SettleResult extends Measurement {
  balls: Ball[];
  iterations: number;
  converged: boolean;
}

/**
 * A deterministic direction for separating coincident balls. Keyed on the pair
 * so it is stable across passes and across runs; nothing in this module reaches
 * for Math.random, which is what makes "compacting twice gives the same number"
 * a property rather than a hope.
 */
function jitterDirection(i: number, j: number): { x: number; y: number } {
  const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  const angle = (h - Math.floor(h)) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

interface Accumulation extends Measurement {
  fx: Float64Array;
  fy: Float64Array;
  contacts: Int32Array;
}

/**
 * Every force acting on every ball, summed but not yet applied. Contact force
 * is linear in overlap along the line of centres; a wall behaves the same way,
 * pushing inward on any ball that has come inside its ramp.
 */
function accumulate(balls: readonly Ball[], opts: SettleOptions): Accumulation {
  const n = balls.length;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const contacts = new Int32Array(n);
  let residual = 0;
  let wallForce = 0;

  // Ball against ball. Fixed index order, so the summation order is fixed too:
  // float addition is not associative, and that is all the order affects here.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = balls[j]!.x - balls[i]!.x;
      const dy = balls[j]!.y - balls[i]!.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= CONTACT_DISTANCE) continue;

      const overlap = CONTACT_DISTANCE - distance;
      let ux: number;
      let uy: number;
      if (distance < DEGENERATE) {
        const jitter = jitterDirection(i, j);
        ux = jitter.x;
        uy = jitter.y;
      } else {
        ux = dx / distance;
        uy = dy / distance;
      }

      fx[i]! -= ux * overlap;
      fy[i]! -= uy * overlap;
      fx[j]! += ux * overlap;
      fy[j]! += uy * overlap;
      contacts[i]!++;
      contacts[j]!++;
      if (overlap > residual) residual = overlap;
    }
  }

  // Ball against wall. The ramp is the whole wall model: there is no hard
  // collision, so a ball driven past a wall is pushed back rather than clipped,
  // and the force keeps growing beyond the ramp so it always comes back.
  const half = opts.side / 2;
  for (let i = 0; i < n; i++) {
    const ball = balls[i]!;
    const penetrations = [
      { axis: 0, depth: ball.x + BALL_RADIUS - half, sign: -1 },
      { axis: 0, depth: -half - (ball.x - BALL_RADIUS), sign: 1 },
      { axis: 1, depth: ball.y + BALL_RADIUS - half, sign: -1 },
      { axis: 1, depth: -half - (ball.y - BALL_RADIUS), sign: 1 },
    ];
    for (const { axis, depth, sign } of penetrations) {
      if (depth <= 0) continue;
      if (axis === 0) fx[i]! += sign * depth;
      else fy[i]! += sign * depth;
      contacts[i]!++;
      wallForce += depth;
      if (depth > residual) residual = depth;
    }
  }

  // The fingertip: a phantom ball that pushes and is never pushed back.
  const pusher = opts.pusher;
  if (pusher) {
    for (let i = 0; i < n; i++) {
      const dx = balls[i]!.x - pusher.x;
      const dy = balls[i]!.y - pusher.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= CONTACT_DISTANCE) continue;
      const overlap = CONTACT_DISTANCE - distance;
      const direction =
        distance < DEGENERATE ? jitterDirection(i, i) : { x: dx / distance, y: dy / distance };
      fx[i]! += direction.x * overlap;
      fy[i]! += direction.y * overlap;
      contacts[i]!++;
    }
  }

  return { fx, fy, contacts, residual, wallForce };
}

/** What the arrangement measures right now, moving nothing. */
export function measure(balls: readonly Ball[], opts: SettleOptions): Measurement {
  const { residual, wallForce } = accumulate(balls, opts);
  return { residual, wallForce };
}

export interface PassResult extends Measurement {
  balls: Ball[];
  /** Largest distance any one ball moved: the convergence signal. */
  maxDisplacement: number;
}

/** One accumulate-then-apply pass. */
export function settleOnce(balls: readonly Ball[], opts: SettleOptions): PassResult {
  const { fx, fy, contacts, residual, wallForce } = accumulate(balls, opts);
  const held = opts.held ?? null;
  const moved: Ball[] = [];
  let maxDisplacement = 0;

  for (let i = 0; i < balls.length; i++) {
    const ball = balls[i]!;
    if (i === held) {
      moved.push({ x: ball.x, y: ball.y });
      continue;
    }
    // Dividing by the contact count keeps a pass non-expansive inside a dense
    // cluster while leaving the isolated pair exact.
    const alpha = ALPHA / Math.max(1, contacts[i]!);
    const dx = alpha * fx[i]!;
    const dy = alpha * fy[i]!;
    const displacement = Math.hypot(dx, dy);
    if (displacement > maxDisplacement) maxDisplacement = displacement;
    moved.push({ x: ball.x + dx, y: ball.y + dy });
  }

  return { balls: moved, maxDisplacement, residual, wallForce };
}

/** Passes until nothing is moving, or the cap is hit. */
export function settle(balls: readonly Ball[], opts: SettleOptions): SettleResult {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const cap = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  let current: Ball[] = balls.map((ball) => ({ x: ball.x, y: ball.y }));
  let iterations = 0;
  let converged = false;

  while (iterations < cap) {
    const pass = settleOnce(current, opts);
    current = pass.balls;
    iterations++;
    if (pass.maxDisplacement < tolerance) {
      converged = true;
      break;
    }
  }

  // Measured after the last move, so it describes what the caller is handed.
  const { residual, wallForce } = measure(current, opts);
  return { balls: current, iterations, converged, residual, wallForce };
}
