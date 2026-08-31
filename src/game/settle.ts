import { exclusionAt } from "./descent";
import { BALL_RADIUS, CONTACT_DISTANCE, WALL_WIDTH, type Ball, type Side } from "./types";

// Quasi-static settling. Per pass: compute every force, sum per ball, then move
// every ball. Nothing moves mid-pass, so a ball with several contacts gets one
// coherent displacement rather than being shoved sequentially by each
// neighbour, and a symmetric arrangement stays symmetric.

/**
 * How close the fingertip may come to a ball's centre. A radius, so the pointer
 * is never inside a ball it is pushing.
 */
const PUSHER_REACH = BALL_RADIUS;

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
  /**
   * The one ball that is off the plane, and how high, in radii.
   *
   * Its position in plan is set by something other than the solver — the
   * pointer while it is carried, the descent while it is coming down — so it
   * receives no force at all, from its neighbours or from a wall. What it
   * *exerts* follows its height: it reaches its neighbours only as far as
   * `exclusionAt` allows, which is nothing at all at 2 and a full diameter at 0.
   *
   * One number for what used to be three states. Carried is 2, mid-descent is
   * anything between, and 0 is an ordinary member of the arrangement — so a
   * height of 0 here means the same thing as no raised ball at all.
   */
  raised?: { index: number; height: number } | null;
  /**
   * Dragging on empty background bumps balls aside.
   *
   * A hard constraint rather than a force, for the same reason the screen edge
   * is: a fingertip crosses the box far faster than a capped ball can travel,
   * so as a force it would be outrun --- balls would sink into the pointer and
   * pop out behind it, and fine adjustment would feel like pushing through
   * treacle. As a constraint the ball is simply never inside the pointer, and
   * what it displaces resolves at the capped rate like everything else.
   */
  pusher?: Pusher | null;
  /**
   * Half-extents of the visible area, in world units. Unlike a wall, this is a
   * hard stop and not a ridge: a ball may be pushed out of the box, but losing
   * one off the edge of the screen has to be impossible rather than merely
   * unlikely, so it is a clamp on position rather than another force to
   * overcome. Omitted where there is no view to speak of, which includes every
   * test of the rules on their own.
   */
  bounds?: { x: number; y: number } | null;
  /**
   * The furthest any one ball may move in a single pass, in radii.
   *
   * Overdamped settling resolves a large overlap exponentially, with nearly all
   * the movement in the first two passes, so a shove arrives all at once
   * instead of propagating from the ball that caused it. A cap makes it travel
   * at a constant rate and ease out at the end.
   *
   * Capping only shortens a step; it never turns one. The fixed points are
   * exactly where the net force is zero either way, so a capped settle reaches
   * the same arrangement as an uncapped one, and symmetry survives too: the cap
   * keys on the displacement's magnitude, which two balls related by a symmetry
   * of the arrangement share.
   *
   * The edge sets it from the frame's delta; nothing that produces a score
   * does, so no score is capped and none moves.
   */
  maxStep?: number | null;
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


/**
 * Where a point stands relative to the box boundary: the signed distance to it
 * (negative inside, positive outside) and the unit vector pointing outward
 * across it.
 *
 * This is the standard signed-distance function for an axis-aligned square, and
 * every case a ball near a corner can be in falls out of it rather than having
 * to be enumerated:
 *
 * - beside one edge: pushed square-on to that edge
 * - outside, diagonally past a corner: pushed radially away from the corner
 *   point, because the nearest part of the box *is* that point
 * - outside one edge but not past the corner: pushed away from the edge it is
 *   outside of
 * - inside: pushed away from whichever edge is nearest, and diagonally when two
 *   are equally near
 */
function rimAt(point: Ball, half: number): { distance: number; nx: number; ny: number } {
  const sx = point.x >= 0 ? 1 : -1;
  const sy = point.y >= 0 ? 1 : -1;
  const qx = Math.abs(point.x) - half;
  const qy = Math.abs(point.y) - half;

  if (qx > 0 || qy > 0) {
    // Outside. The nearest point of the box is a corner when both are positive
    // and a point on an edge otherwise; either way this is the vector to it.
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const length = Math.hypot(ox, oy);
    return { distance: length, nx: (sx * ox) / length, ny: (sy * oy) / length };
  }

  // Inside: distance to the nearest edge, and out across it.
  const distance = Math.max(qx, qy);
  if (Math.abs(qx - qy) < DEGENERATE) {
    // Equally near two edges — on a diagonal of the box, so out is diagonal.
    const diagonal = Math.SQRT1_2;
    return { distance, nx: sx * diagonal, ny: sy * diagonal };
  }
  return qx > qy
    ? { distance, nx: sx, ny: 0 }
    : { distance, nx: 0, ny: sy };
}

/**
 * Which ball, if any, is off the plane. A height of 0 is a ball that has landed
 * and is an ordinary member again, so it is not raised at all — which makes the
 * end of a descent a boundary case that resolves itself rather than one every
 * caller has to remember.
 */
function raisedIndex(opts: SettleOptions): number {
  return opts.raised && opts.raised.height > 0 ? opts.raised.index : -1;
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

  const raised = raisedIndex(opts);
  // How far the raised ball reaches. At carry height this is exactly 0, so the
  // pair is skipped before anything else happens and a carried ball disturbs
  // nothing — not even a neighbour it is sitting precisely on top of, since a
  // distance of 0 is still not less than a reach of 0.
  const reach = opts.raised ? exclusionAt(opts.raised.height) : CONTACT_DISTANCE;

  // Ball against ball. Fixed index order, so the summation order is fixed too:
  // float addition is not associative, and that is all the order affects here.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const contact = i === raised || j === raised ? reach : CONTACT_DISTANCE;
      const dx = balls[j]!.x - balls[i]!.x;
      const dy = balls[j]!.y - balls[i]!.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= contact) continue;

      const overlap = contact - distance;
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
      // A ball in the air is not the box's to contain, so it is left out of the
      // residual entirely — the same rule the wall loop below follows. Counted
      // here it would be measured against its own shrunken reach and report an
      // overlap smaller than the one two balls in the plane would have.
      if (i !== raised && j !== raised && overlap > residual) residual = overlap;
    }
  }

  // Ball against box. The wall is the square ring between its two faces, from
  // side/2 out to side/2 + WALL_WIDTH, and a ball rests one radius from it --- so
  // its surface touches whichever face it is against. The terrain falls away a
  // radius beyond each face, so the wall is a ridge a ball can be pushed over
  // rather than a fence it stops at.
  //
  // The ring's signed distance is the standard subtraction, max(outer, -inner):
  // outside the box the outer face is nearest, inside the box the inner face
  // is, and within the wall itself whichever is nearer wins, which puts the
  // crest down the middle of the wall.
  //
  // Offsetting one square by half a wall instead would be wrong in exactly one
  // place, and it is the place that showed: offsetting a square outward rounds
  // its corners, so a ball settling diagonally outside a corner came to rest
  // 0.046 radii inside the wall it was supposed to be leaning on.
  const half = opts.side / 2;
  const outerHalf = half + WALL_WIDTH;
  for (let i = 0; i < n; i++) {
    // A ball off the plane is over the box, not in it: no wall reaches it, and
    // it is not the box's to contain until it lands.
    if (i === raised) continue;

    // Containment is a separate question from force: the box does not hold a
    // ball whose centre is within a radius of the inner face or beyond it,
    // however the wall happens to be pushing, and compacting must never call
    // that a fit.
    const inner = rimAt(balls[i]!, half);
    const overhang = inner.distance + BALL_RADIUS;
    if (overhang > residual) residual = overhang;

    const outer = rimAt(balls[i]!, outerHalf);
    // Ties go to the inner face, so a ball balanced exactly on the crest falls
    // inward --- IDEA.md asks for an exact alignment to be broken, and inward is
    // the kinder of the two.
    const takeOuter = outer.distance + inner.distance > DEGENERATE;
    const distance = takeOuter ? outer.distance : -inner.distance;
    if (distance >= BALL_RADIUS) continue;

    const magnitude = BALL_RADIUS - distance;
    // Away from the wall: outward across the outer face, inward across the
    // inner one.
    const nx = takeOuter ? outer.nx : -inner.nx;
    const ny = takeOuter ? outer.ny : -inner.ny;
    fx[i]! += nx * magnitude;
    fy[i]! += ny * magnitude;
    contacts[i]!++;
    wallForce += magnitude;
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
  const raised = raisedIndex(opts);
  const maxStep = opts.maxStep ?? null;
  const pusher = opts.pusher ?? null;
  const moved: Ball[] = [];

  let maxDisplacement = 0;

  const bounds = opts.bounds ?? null;

  for (let i = 0; i < balls.length; i++) {
    const ball = balls[i]!;
    // A ball off the plane is moved by the pointer or by its own fall, not by
    // us: its position in plan is fixed while everything else gets out of its
    // way. It is still held on screen.
    let x = ball.x;
    let y = ball.y;
    if (i !== raised) {
      // Dividing by the contact count keeps a pass non-expansive inside a dense
      // cluster while leaving the isolated pair exact.
      const alpha = ALPHA / Math.max(1, contacts[i]!);
      let dx = alpha * fx[i]!;
      let dy = alpha * fy[i]!;
      if (maxStep !== null && maxStep >= 0) {
        const step = Math.hypot(dx, dy);
        if (step > maxStep) {
          dx = (dx / step) * maxStep;
          dy = (dy / step) * maxStep;
        }
      }
      x += dx;
      y += dy;
    }
    // The fingertip, before the screen edge: a ball may be shoved into the edge
    // and stopped there, but never out through it, so the edge has the last
    // word of the two.
    if (pusher && i !== raised) {
      const dx = x - pusher.x;
      const dy = y - pusher.y;
      const gap = Math.hypot(dx, dy);
      if (gap < PUSHER_REACH) {
        const direction =
          gap < DEGENERATE ? jitterDirection(i, i) : { x: dx / gap, y: dy / gap };
        x = pusher.x + direction.x * PUSHER_REACH;
        y = pusher.y + direction.y * PUSHER_REACH;
      }
    }
    if (bounds) {
      x = Math.min(bounds.x, Math.max(-bounds.x, x));
      y = Math.min(bounds.y, Math.max(-bounds.y, y));
    }
    // Measured after the clamp, so a ball pinned against the edge reads as
    // settled rather than as forever moving.
    const displacement = Math.hypot(x - ball.x, y - ball.y);
    if (displacement > maxDisplacement) maxDisplacement = displacement;
    moved.push({ x, y });
  }

  return { balls: moved, maxDisplacement, residual, wallForce };
}

/** Passes until nothing is moving, or the cap is hit. */
export function settle(balls: readonly Ball[], opts: SettleOptions): SettleResult {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const cap = opts.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  // Running to convergence is not a thing a speed cap has any business in, and
  // letting one through here would be worse than pointless: convergence is
  // judged on the largest step any ball took, which the cap is shortening, so a
  // cap below the tolerance would report success on the first pass with the
  // arrangement still overlapping — and compact() would take that as a fit.
  // Stripped rather than merely documented, because every score comes down this
  // path and a convention is one absent-minded argument away from being broken.
  const uncapped: SettleOptions = { ...opts, maxStep: null };

  let current: Ball[] = balls.map((ball) => ({ x: ball.x, y: ball.y }));
  let iterations = 0;
  let converged = false;

  while (iterations < cap) {
    const pass = settleOnce(current, uncapped);
    current = pass.balls;
    iterations++;
    if (pass.maxDisplacement < tolerance) {
      converged = true;
      break;
    }
  }

  // Measured after the last move, so it describes what the caller is handed.
  const { residual, wallForce } = measure(current, uncapped);
  return { balls: current, iterations, converged, residual, wallForce };
}
