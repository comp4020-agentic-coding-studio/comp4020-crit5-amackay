import { describe, expect, it } from "vitest";
import { BAR_MAX, histogramRows } from "./histogram";
import { optimum } from "./optima";
import { thresholds } from "./score";
import { beat, playTo } from "./progress.test-helper";
import { advance, enterLevel, newSession, record, type Session } from "./session";
import { CORE_SEQUENCE } from "./types";

describe("histogramRows", () => {
  it("has one row per level reached and none beyond", () => {
    const rows = histogramRows(playTo(4));
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4]);
  });

  it("does not grow when the player drops back to an earlier level", () => {
    const rows = histogramRows(enterLevel(playTo(4), 2));
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4]);
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
    const row = histogramRows(newSession(3)).at(-1)!;
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

  it("leaves only the frontier row without a best", () => {
    const rows = histogramRows(playTo(5));
    for (const row of rows.slice(0, -1)) {
      expect(row.complete, `level ${row.n}`).toBe(true);
      expect(row.bestFraction, `level ${row.n}`).not.toBeNull();
    }
    const frontier = rows.at(-1)!;
    expect(frontier.n).toBe(5);
    expect(frontier.complete).toBe(false);
    expect(frontier.bestFraction).toBeNull();
  });

  it("carries every core-sequence row once the game is finished", () => {
    let session = playTo(CORE_SEQUENCE);
    session = beat(session);
    const rows = histogramRows(session);
    expect(rows).toHaveLength(CORE_SEQUENCE + 1);
    expect(rows.every((r) => r.notches.three > 0)).toBe(true);
  });
});
