import { fitsNow } from "./compact";
import { isComplete, par, stars, type Stars } from "./score";
import { CORE_SEQUENCE, MAX_LEVEL, type Ball, type Side } from "./types";

// Progression. Positions carry over between levels, and so does the box:
// completing one adds a single extra ball in the middle of what is already
// there and the next begins around it, so nothing ever resets and every level
// starts from the arrangement that beat the one before.
//
// Level one is the exception, and only through the histogram. Selecting it is
// the game's one way back to the beginning --- a device handed to someone else
// opens where a new player opens --- so it hands back the opening state rather
// than the best one. Nothing is discarded to do that: the bests and the levels
// reached are untouched, so it is a way in, not a reset.

/**
 * How much room the box opens to when a level has to be furnished from
 * nothing. Two radii clear of the naive grid, which is a radius of visible
 * tray on every side --- and inside `maxSideIn(par(n))`, the widest the frame
 * can draw, which is what stops the opening state overflowing its own view.
 */
export function openSide(n: number): Side {
  return par(n) + 2;
}

/** Gap between balls in a starting layout, in radii: clear, but not scattered. */
const START_SPACING = 2.4;

/**
 * A loose grid of n balls, clear of each other and well inside the open box.
 * Used when a level has to be furnished from nothing rather than carried into.
 */
export function startingBalls(n: number): Ball[] {
  const columns = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / columns);
  return Array.from({ length: n }, (_, i) => ({
    x: ((i % columns) - (columns - 1) / 2) * START_SPACING,
    y: (Math.floor(i / columns) - (rows - 1) / 2) * START_SPACING,
  }));
}

export interface Best {
  side: Side;
  stars: Stars;
  balls: Ball[];
}

export interface Session {
  /** The level being played: also the number of balls. */
  level: number;
  /** The highest level reached, which is what level select offers. */
  reached: number;
  balls: Ball[];
  side: Side;
  bests: Record<number, Best>;
  /** Set once the core sequence has been finished. */
  finished: boolean;
}

export function newSession(level = 1): Session {
  const start = Math.min(MAX_LEVEL, Math.max(1, level));
  return {
    level: start,
    reached: start,
    balls: startingBalls(start),
    side: openSide(start),
    bests: {},
    finished: false,
  };
}

/** The best result recorded at a level, if it has ever been beaten. */
export function bestAt(session: Session, n: number): Best | undefined {
  return session.bests[n];
}

/**
 * Whether the box on screen right now counts: small enough for a star at this
 * level, and actually holding the arrangement.
 *
 * Read live rather than from the recorded best, which is what lets level one
 * be re-entered at its opening size and still have to be beaten again before
 * it can be left. The `fitsNow` half is not a formality: a level begins at the
 * previous level's size with one more ball in it, and that size is often
 * already under the threshold while the balls are still overlapping.
 */
export function levelComplete(session: Session): boolean {
  return (
    isComplete(session.level, session.side) && fitsNow(session.balls, session.side)
  );
}

/**
 * Record what closing the box achieved. A worse attempt never overwrites a
 * better one, and a result that does not beat par is not a completion.
 */
export function record(session: Session, side: Side, balls: readonly Ball[]): Session {
  const earned = stars(session.level, side);
  const next: Session = { ...session, side, balls: balls.map((b) => ({ ...b })) };
  if (!isComplete(session.level, side)) return next;

  const previous = bestAt(session, session.level);
  if (previous && previous.side <= side) return next;

  return {
    ...next,
    bests: {
      ...session.bests,
      [session.level]: { side, stars: earned, balls: balls.map((b) => ({ ...b })) },
    },
  };
}

/**
 * Move to the next level. The box stays exactly the size it was just closed
 * to, every ball already placed stays where it was, and one more arrives in
 * the middle of them --- so a level opens as the previous level's answer with
 * a ball too many in it, and the first move is making room.
 */
export function advance(session: Session): Session {
  if (!levelComplete(session) || session.level >= MAX_LEVEL) return session;
  const level = session.level + 1;
  return {
    ...session,
    level,
    reached: Math.max(session.reached, level),
    balls: [...session.balls.map((b) => ({ ...b })), { x: 0, y: 0 }],
    side: session.side,
    finished: session.finished || session.level >= CORE_SEQUENCE,
  };
}

/** Levels the player may return to. */
export function reachableLevels(session: Session): number[] {
  return Array.from({ length: session.reached }, (_, i) => i + 1);
}

/**
 * Return to a level already reached, at the box size it was beaten at and with
 * the arrangement that beat it --- so revisiting a level is picking your own
 * work back up, not starting it again.
 *
 * Level one is the exception: it hands back the opening state instead, which
 * is what makes selecting it the way to start the game over for someone else.
 */
export function enterLevel(session: Session, n: number): Session {
  if (n < 1 || n > session.reached) return session;
  if (n === 1) return { ...session, level: 1, balls: startingBalls(1), side: openSide(1) };

  const best = bestAt(session, n);
  if (best) {
    return { ...session, level: n, balls: best.balls.map((b) => ({ ...b })), side: best.side };
  }
  if (session.level === n) return session;
  return { ...session, level: n, balls: startingBalls(n), side: openSide(n) };
}

// Persistence lives at the edge; these two are the pure halves of it.

export interface StoredSession {
  reached: number;
  level: number;
  balls: Ball[];
  /**
   * The box, which is now part of the answer rather than a function of the
   * level: a level is entered at whatever size the one before it closed to, so
   * re-deriving it on load would hand back a different game from the one that
   * was saved. Absent in anything written before that was true, which is why
   * reading it falls back to the level's opening size rather than failing.
   */
  side?: Side;
  bests: Record<number, Best>;
  finished: boolean;
}

export function serialise(session: Session): string {
  const stored: StoredSession = {
    reached: session.reached,
    level: session.level,
    balls: session.balls,
    side: session.side,
    bests: session.bests,
    finished: session.finished,
  };
  return JSON.stringify(stored);
}

/** Anything unreadable starts a fresh session rather than throwing at a player. */
export function deserialise(raw: string | null): Session {
  if (!raw) return newSession();
  try {
    const stored = JSON.parse(raw) as Partial<StoredSession>;
    const level = clampLevel(stored.level);
    const reached = Math.max(level, clampLevel(stored.reached));
    const balls = Array.isArray(stored.balls) ? stored.balls.filter(isBall) : [];
    if (balls.length !== level) return newSession();
    return {
      level,
      reached,
      balls,
      side: readSide(stored.side, level),
      bests: readBests(stored.bests),
      finished: stored.finished === true,
    };
  } catch {
    return newSession();
  }
}

/** A stored box size, or the level's opening size if there isn't a usable one. */
function readSide(value: unknown, level: number): Side {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return openSide(level);
  }
  return value;
}

function clampLevel(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return 1;
  return Math.min(MAX_LEVEL, Math.max(1, value));
}

function isBall(value: unknown): value is Ball {
  const ball = value as Ball | null;
  return (
    typeof ball === "object" &&
    ball !== null &&
    Number.isFinite(ball.x) &&
    Number.isFinite(ball.y)
  );
}

function readBests(value: unknown): Record<number, Best> {
  if (typeof value !== "object" || value === null) return {};
  const bests: Record<number, Best> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(key);
    const best = entry as Partial<Best> | null;
    if (!Number.isInteger(n) || n < 1 || n > MAX_LEVEL) continue;
    if (!best || !Number.isFinite(best.side) || !Array.isArray(best.balls)) continue;
    const balls = best.balls.filter(isBall);
    if (balls.length !== n) continue;
    bests[n] = { side: best.side as number, stars: stars(n, best.side as number), balls };
  }
  return bests;
}
