import { describe, expect, it } from "vitest";
import { optimum } from "./optima";
import { par } from "./score";
import {
  advance,
  bestAt,
  deserialise,
  enterLevel,
  levelComplete,
  newSession,
  reachableLevels,
  record,
  serialise,
  type Session,
} from "./session";
import { CORE_SEQUENCE, MAX_LEVEL } from "./types";

/** Play a level to the given size and move on. */
function beat(session: Session, side = optimum(session.level)): Session {
  return advance(record(session, side, session.balls));
}

function playTo(level: number): Session {
  let session = newSession();
  while (session.level < level) session = beat(session);
  return session;
}

describe("a new session", () => {
  it("starts at one ball", () => {
    const session = newSession();
    expect(session.level).toBe(1);
    expect(session.balls).toHaveLength(1);
    expect(levelComplete(session)).toBe(false);
  });

  it("can be opened at any level, for playtesting", () => {
    for (const level of [1, 3, 10, MAX_LEVEL]) {
      const session = newSession(level);
      expect(session.level).toBe(level);
      expect(session.reached).toBe(level);
      expect(session.balls).toHaveLength(level);
    }
    expect(newSession(0).level).toBe(1);
    expect(newSession(MAX_LEVEL + 5).level).toBe(MAX_LEVEL);
  });

  it("lays its balls out clear of each other and inside the box", () => {
    // A starting layout that overlapped would settle explosively on the first
    // frame, which would read as the game malfunctioning rather than starting.
    for (const level of [1, 2, 3, 4, 9, 10, MAX_LEVEL]) {
      const { balls, side } = newSession(level);
      const half = side / 2;
      for (const ball of balls) {
        expect(Math.abs(ball.x), `N = ${level}`).toBeLessThanOrEqual(half - 1);
        expect(Math.abs(ball.y), `N = ${level}`).toBeLessThanOrEqual(half - 1);
      }
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i]!;
          const b = balls[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y), `N = ${level}`).toBeGreaterThan(2);
        }
      }
    }
  });
});

describe("advancing", () => {
  it("refuses to advance a level that has not been beaten", () => {
    const session = newSession();
    expect(advance(session)).toBe(session);
  });

  it("carries every position over and adds exactly one ball", () => {
    const session = record(newSession(), 2, [{ x: 0.5, y: -0.25 }]);
    const next = advance(session);
    expect(next.level).toBe(2);
    expect(next.balls).toHaveLength(2);
    expect(next.balls[0]).toEqual({ x: 0.5, y: -0.25 });
  });

  it("opens the box to give the new ball room", () => {
    const next = advance(record(newSession(), 2, newSession().balls));
    expect(next.side).toBeGreaterThan(par(2));
  });

  it("never shortens an arrangement, whatever the transition", () => {
    // The structural form of "there is no reset button": no function here
    // hands back fewer balls than it was given.
    let session = newSession();
    for (let level = 1; level < CORE_SEQUENCE; level++) {
      const before = session.balls.length;
      session = record(session, optimum(session.level), session.balls);
      expect(session.balls.length).toBeGreaterThanOrEqual(before);
      session = advance(session);
      expect(session.balls.length).toBeGreaterThan(before);
      for (const n of reachableLevels(session)) {
        expect(enterLevel(session, n).balls.length).toBe(n);
      }
    }
  });

  it("flags the core sequence finished on leaving level ten", () => {
    let session = playTo(CORE_SEQUENCE);
    expect(session.finished).toBe(false);
    session = beat(session);
    expect(session.finished).toBe(true);
  });
});

describe("bests", () => {
  it("does not record a result that fails to beat par", () => {
    const session = record(newSession(), par(1) * 2, newSession().balls);
    expect(bestAt(session, 1)).toBeUndefined();
    expect(levelComplete(session)).toBe(false);
  });

  it("keeps the smaller of two results", () => {
    let session = record(newSession(), 2.5, [{ x: 0, y: 0 }]);
    session = record(session, 2.1, [{ x: 0.1, y: 0 }]);
    expect(bestAt(session, 1)?.side).toBe(2.1);
    session = record(session, 2.4, [{ x: 0.2, y: 0 }]);
    expect(bestAt(session, 1)?.side).toBe(2.1);
    expect(bestAt(session, 1)?.balls[0]).toEqual({ x: 0.1, y: 0 });
  });

  it("holds a copy, not a reference to the live arrangement", () => {
    const balls = [{ x: 0, y: 0 }];
    const session = record(newSession(), 2, balls);
    balls[0]!.x = 99;
    expect(bestAt(session, 1)?.balls[0]!.x).toBe(0);
  });
});

describe("level select", () => {
  it("offers every level reached and none beyond", () => {
    const session = playTo(4);
    expect(reachableLevels(session)).toEqual([1, 2, 3, 4]);
    expect(enterLevel(session, 5)).toBe(session);
    expect(enterLevel(session, 0)).toBe(session);
  });

  it("restores the best arrangement rather than a blank one", () => {
    let session = record(newSession(), 2, [{ x: 0.4, y: 0.4 }]);
    session = advance(session);
    session = record(session, optimum(2), [
      { x: -1, y: -1 },
      { x: 1, y: 1 },
    ]);
    const back = enterLevel(session, 1);
    expect(back.level).toBe(1);
    expect(back.balls).toEqual([{ x: 0.4, y: 0.4 }]);
  });

  it("opens the box on re-entry, so the level can be played again", () => {
    const session = enterLevel(playTo(3), 2);
    expect(session.side).toBeGreaterThan(optimum(2));
  });
});

describe("persistence", () => {
  it("round-trips a played session", () => {
    const session = playTo(5);
    const restored = deserialise(serialise(session));
    expect(restored.level).toBe(session.level);
    expect(restored.reached).toBe(session.reached);
    expect(restored.balls).toEqual(session.balls);
    expect(bestAt(restored, 3)?.side).toBe(bestAt(session, 3)?.side);
  });

  it("starts fresh on anything it cannot read", () => {
    for (const raw of [null, "", "{", "[]", '{"level":99}', '{"level":3,"balls":[]}']) {
      const restored = deserialise(raw);
      expect(restored.level, `from ${raw}`).toBe(1);
      expect(restored.balls, `from ${raw}`).toHaveLength(1);
    }
  });

  it("does not trust a stored star count", () => {
    // A hand-edited store should not be able to claim stars the size never won.
    const forged = JSON.stringify({
      level: 1,
      reached: 1,
      balls: [{ x: 0, y: 0 }],
      bests: { 1: { side: par(1), stars: 3, balls: [{ x: 0, y: 0 }] } },
      finished: false,
    });
    expect(bestAt(deserialise(forged), 1)?.stars).toBe(3); // par(1) is the optimum
    const loose = JSON.stringify({
      level: 1,
      reached: 1,
      balls: [{ x: 0, y: 0 }],
      bests: { 1: { side: 2.5, stars: 3, balls: [{ x: 0, y: 0 }] } },
      finished: false,
    });
    expect(bestAt(deserialise(loose), 1)?.stars).toBeLessThan(3);
  });
});
