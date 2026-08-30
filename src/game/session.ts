import { isComplete, par, stars, type Stars } from "./score";
import { BALL_RADIUS, CORE_SEQUENCE, MAX_LEVEL, type Ball, type Side } from "./types";

// Progression. Positions carry over between levels: completing one drops a
// single extra ball in and the next begins, so nothing ever resets. There is no
// function here that shortens an arrangement, which is how "no reset button"
// is held as a contract rather than as a missing button.

/** How much room the box opens to when a level begins. */
export function openSide(n: number): Side {
  return par(n) + 4;
}

/** Where a newly arrived ball comes down: the top of the open box, centred. */
export function dropPosition(n: number): Ball {
  return { x: 0, y: openSide(n) / 2 - BALL_RADIUS };
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

export function newSession(): Session {
  return {
    level: 1,
    reached: 1,
    balls: [{ x: 0, y: 0 }],
    side: openSide(1),
    bests: {},
    finished: false,
  };
}

/** The best result recorded at a level, if it has ever been beaten. */
export function bestAt(session: Session, n: number): Best | undefined {
  return session.bests[n];
}

/** A level can be left once it has been beaten at all. */
export function levelComplete(session: Session): boolean {
  return bestAt(session, session.level) !== undefined;
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
 * Move to the next level: the box opens, one more ball arrives, and every ball
 * already placed stays exactly where it was.
 */
export function advance(session: Session): Session {
  if (!levelComplete(session) || session.level >= MAX_LEVEL) return session;
  const level = session.level + 1;
  return {
    ...session,
    level,
    reached: Math.max(session.reached, level),
    balls: [...session.balls.map((b) => ({ ...b })), dropPosition(level)],
    side: openSide(level),
    finished: session.finished || session.level >= CORE_SEQUENCE,
  };
}

/** Levels the player may return to. */
export function reachableLevels(session: Session): number[] {
  return Array.from({ length: session.reached }, (_, i) => i + 1);
}

/**
 * Return to a level already reached, restoring the best arrangement recorded
 * for it. This is the closest thing to a reset the game has, and it deliberately
 * hands back the player's best work rather than a blank space.
 */
export function enterLevel(session: Session, n: number): Session {
  if (n < 1 || n > session.reached) return session;
  const best = bestAt(session, n);
  const balls = best
    ? best.balls.map((b) => ({ ...b }))
    : session.level === n
      ? session.balls.map((b) => ({ ...b }))
      : Array.from({ length: n }, (_, i) => dropPosition(n + i));
  return { ...session, level: n, balls, side: openSide(n) };
}

// Persistence lives at the edge; these two are the pure halves of it.

export interface StoredSession {
  reached: number;
  level: number;
  balls: Ball[];
  bests: Record<number, Best>;
  finished: boolean;
}

export function serialise(session: Session): string {
  const stored: StoredSession = {
    reached: session.reached,
    level: session.level,
    balls: session.balls,
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
      side: openSide(level),
      bests: readBests(stored.bests),
      finished: stored.finished === true,
    };
  } catch {
    return newSession();
  }
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
