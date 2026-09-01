import { describe, expect, it } from "vitest";
import { BAR_MAX, histogramRows } from "./histogram";
import { levels } from "./optima";
import { thresholds } from "./score";
import { beat, playTo } from "./progress.test-helper";
import { advance, enterLevel, newSession, record } from "./session";
import { CORE_SEQUENCE, MAX_LEVEL } from "./types";

describe("histogramRows", () => {
  it("has one row per level in the game, reached or not", () => {
    const rows = histogramRows(playTo(4));
    expect(rows.map((r) => r.n)).toEqual(
      Array.from({ length: MAX_LEVEL }, (_, i) => i + 1),
    );
  });

  it("locks every level past the one reached, and none before it", () => {
    // Showing the levels ahead is what makes the game's length visible; the
    // lock is what says they are not somewhere to go yet.
    const rows = histogramRows(playTo(4));
    expect(rows.filter((r) => !r.locked).map((r) => r.n)).toEqual([1, 2, 3, 4]);
    expect(rows.filter((r) => r.locked).map((r) => r.n)).toEqual(
      Array.from({ length: MAX_LEVEL - 4 }, (_, i) => i + 5),
    );
  });

  it("does not unlock more when the player drops back to an earlier level", () => {
    const rows = histogramRows(enterLevel(playTo(4), 2));
    expect(rows.filter((r) => !r.locked).map((r) => r.n)).toEqual([1, 2, 3, 4]);
    expect(rows.find((r) => r.current)?.n).toBe(2);
  });

  it("takes a row's bar from the recorded best, as a fraction of the fixed span", () => {
    let session = record(newSession(), 2, newSession().balls);
    session = advance(session);
    session = record(session, 3.4, session.balls);
    const rows = histogramRows(session);
    expect(rows[0]!.bestFraction).toBeCloseTo(2 / BAR_MAX, 12);
    expect(rows[1]!.bestFraction).toBeCloseTo(3.4 / BAR_MAX, 12);
  });

  it("puts the notches at the star thresholds, tightest first", () => {
    const row = histogramRows(newSession(3)).find((r) => r.current)!;
    const t = thresholds(3);
    expect(row!.notches.three).toBeCloseTo(t.three / BAR_MAX, 12);
    expect(row!.notches.two).toBeCloseTo(t.two / BAR_MAX, 12);
    expect(row!.notches.one).toBeCloseTo(t.one / BAR_MAX, 12);
    expect(row!.notches.three).toBeLessThan(row!.notches.two);
    expect(row!.notches.two).toBeLessThanOrEqual(row!.notches.one);
  });

  it("marks the current level and only it", () => {
    const rows = histogramRows(playTo(3));
    expect(rows.filter((r) => r.current).map((r) => r.n)).toEqual([3]);
  });

  it("leaves the frontier row and every locked one without a best", () => {
    const rows = histogramRows(playTo(5));
    for (const row of rows.slice(0, 4)) {
      expect(row.complete, `level ${row.n}`).toBe(true);
      expect(row.bestFraction, `level ${row.n}`).not.toBeNull();
    }
    for (const row of rows.slice(4)) {
      expect(row.complete, `level ${row.n}`).toBe(false);
      expect(row.bestFraction, `level ${row.n}`).toBeNull();
    }
  });

  it("gives every row its notches, played or not", () => {
    const session = beat(playTo(CORE_SEQUENCE));
    expect(histogramRows(session).every((r) => r.notches.three > 0)).toBe(true);
  });

  it("keeps every bar and every star inside the one span all the rows share", () => {
    // One scale for the whole stack is what makes the rows comparable, so the
    // span has to be the widest thing any of them can draw --- which is the
    // loosest one-star size in the game, not the naive grid at the last level.
    for (const n of levels()) {
      const row = histogramRows(newSession(n)).find((r) => r.n === n)!;
      expect(row.notches.one, `level ${n}`).toBeLessThanOrEqual(1);
      expect(row.notches.three, `level ${n}`).toBeGreaterThan(0);
    }
    expect(Math.max(...levels().map((n) => thresholds(n).one))).toBeCloseTo(BAR_MAX, 12);
  });
});
