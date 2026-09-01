// Shared by the tests that need a session several levels in. Not a test file
// and not shipped: nothing in src/ imports it.
//
// A level is beaten when the box on screen is small enough *and* the
// arrangement fits it, so a helper cannot fake a win by writing a number into
// `bests`. It has to lay the balls out and close the box, the way a player
// does.
import { compact } from "./compact";
import { par } from "./score";
import { advance, newSession, record, type Session } from "./session";
import type { Ball } from "./types";

/**
 * The naive square grid: what a player reaches without thinking about it. It
 * fits par(n) by construction, and one star is never harder than par, so
 * playing this way always beats the level --- which a helper that merely
 * compacted whatever was already on the board would not, because a box carried
 * over from the level before is a local minimum a player has to drag out of.
 */
export function grid(n: number): Ball[] {
  const columns = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / columns);
  return Array.from({ length: n }, (_, i) => ({
    x: ((i % columns) - (columns - 1) / 2) * 2,
    y: (Math.floor(i / columns) - (rows - 1) / 2) * 2,
  }));
}

/** Lay the level out, close the box, record the size. */
export function play(session: Session): Session {
  const { balls, side } = compact(grid(session.level), par(session.level));
  return record({ ...session, balls, side }, side, balls);
}

/** Play the level and move on. */
export function beat(session: Session): Session {
  return advance(play(session));
}

/** A session sitting at the given level, every level before it beaten. */
export function playTo(level: number): Session {
  let session = newSession();
  while (session.level < level) session = beat(session);
  return session;
}
