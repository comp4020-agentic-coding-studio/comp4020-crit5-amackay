import { describe, expect, it } from "vitest";
import { BAR_MAX, goalFor, histogramRows } from "./histogram";
import { optimum } from "./optima";
import { thresholds } from "./score";
import { beat, play, playTo } from "./progress.test-helper";
import { advance, enterLevel, newSession, record, type Session } from "./session";
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
});

describe("the goal", () => {
  it("names the tightest threshold the box has not reached yet", () => {
    const t = thresholds(3);
    expect(goalFor(3, t.one + 1, true)).toBe(t.one);
    expect(goalFor(3, t.one, true)).toBe(t.two);
    expect(goalFor(3, t.two, true)).toBe(t.three);
  });

  it("is gone once the box is inside the last of them", () => {
    expect(goalFor(3, thresholds(3).three, true)).toBeNull();
    expect(goalFor(3, optimum(3), true)).toBeNull();
  });

  it("aims at the first star while the arrangement does not fit", () => {
    // A level opens under every threshold with its circles overlapping. On
    // size alone that would read as nothing left to aim for.
    expect(goalFor(3, optimum(3), false)).toBe(thresholds(3).one);
  });

  it("is read from the box on screen, not from the recorded best", () => {
    // A re-entered level one is back at its opening size and has to be beaten
    // again, so a goal taken from `bests` would call it finished.
    const back = enterLevel(playTo(4), 1);
    const row = histogramRows(back).find((r) => r.current)!;
    expect(row.n).toBe(1);
    expect(row.complete).toBe(true);
    expect(row.goal).toBeCloseTo(thresholds(1).one / BAR_MAX, 12);
  });

  it("is set on the row being played and on no other", () => {
    const rows = histogramRows(playTo(4));
    expect(rows.filter((r) => r.goal != null).map((r) => r.n)).toEqual([4]);
  });

  it("reports the arrangement not fitting at a level's opening", () => {
    // The box carried over from the level before is usually smaller than this
    // level's first threshold, so the gauge would otherwise read as already
    // past it while the circles are still overlapping.
    const opened = playTo(4);
    const row = histogramRows(opened).find((r) => r.current)!;
    expect(row.fits).toBe(false);
    expect(row.nowFraction!).toBeLessThan(row.goal!);
  });

  it("reports it fitting once the level has been played", () => {
    const row = histogramRows(play(playTo(4))).find((r) => r.current)!;
    expect(row.fits).toBe(true);
  });
});
