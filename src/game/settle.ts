import { exclusionAt } from "./descent";
import { BALL_RADIUS, WALL_WIDTH, type Ball, type Side } from "./types";

// Quasi-static settling. Per pass: compute every force, sum per ball, then move
// every ball. Nothing moves mid-pass, so a ball with several contacts gets one
// coherent displacement rather than being shoved sequentially by each
// neighbour, and a symmetric arrangement stays symmetric.

const CONTACT_DISTANCE = 2 * BALL_RADIUS;

/**
 * How far a ball comes to rest from the wall's centreline: its own radius, plus
 * the half-thickness of the wall it is up against. Its surface then touches the
 * wall's face, inside or outside, and the incline runs exactly one radius beyond
 * each face --- which is IDEA.md's "the incline width on either side is 1", now
 * that the wall has faces rather than being a line.
 */
const REACH = BALL_RADIUS + WALL_WIDTH / 2;

/** Contact distance for the fingertip: it has to actually be on a ball. */
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
  /** Dragging on empty background bumps balls aside. */
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
      if (overlap > residual) residual = overlap;
    }
  }

  // Ball against box. The wall is a slab standing outside the scored square,
  // from side/2 to side/2 + WALL_WIDTH, and it is a ridge rather than a fence:
  // the terrain falls away a radius beyond each of its faces, so a ball rolls
  // off it downhill, inward or outward. That is the hill the player can push a
  // ball over.
  //
  // Treating the four walls as four independent lines is what this replaces,
  // and it was wrong in a way only the corners showed: each line ran to
  // infinity, so a ball far past a corner still felt a wall it was nowhere
  // near.
  //
  // Two questions, two squares. Containment asks whether the ball is inside the
  // room the box encloses, so it is measured against the inner face. Force asks
  // which way off the ridge the ball is, so it is measured against the ridge's
  // own centreline, half a wall further out.
  const half = opts.side / 2;
  const mid = half + WALL_WIDTH / 2;
  for (let i = 0; i < n; i++) {
    // A ball off the plane is over the box, not in it: no wall reaches it, and
    // it is not the box's to contain until it lands.
    if (i === raised) continue;

    // Containment is a separate question from force: the box does not hold a
    // ball whose centre is within a radius of the inner face or beyond it,
    // however the wall happens to be pushing, and compacting must never call
    // that a fit.
    const overhang = rimAt(balls[i]!, half).distance + BALL_RADIUS;
    if (overhang > residual) residual = overhang;

    const rim = rimAt(balls[i]!, mid);
    if (Math.abs(rim.distance) >= REACH) continue;
    const magnitude = REACH - Math.abs(rim.distance);
    // Downhill is away from the ridge: further out if already out, further in
    // if in. Balanced exactly on the crest, a ball falls inward — IDEA.md asks
    // for an exact alignment to be broken, and inward is the kinder of the two.
    const downhill = rim.distance > DEGENERATE ? 1 : -1;
    fx[i]! += downhill * rim.nx * magnitude;
    fy[i]! += downhill * rim.ny * magnitude;
    contacts[i]!++;
    wallForce += magnitude;
  }

  // The fingertip: a phantom ball that pushes and is never pushed back.
  const pusher = opts.pusher;
  if (pusher) {
    for (let i = 0; i < n; i++) {
      if (i === raised) continue;
      const dx = balls[i]!.x - pusher.x;
      const dy = balls[i]!.y - pusher.y;
      const distance = Math.hypot(dx, dy);
      // The pointer is a point, not a ball: it has to actually be on a ball to
      // shove it, rather than nudging things from a radius away.
      if (distance >= PUSHER_REACH) continue;
      const overlap = PUSHER_REACH - distance;
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
  const raised = raisedIndex(opts);
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
      x += alpha * fx[i]!;
      y += alpha * fy[i]!;
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
