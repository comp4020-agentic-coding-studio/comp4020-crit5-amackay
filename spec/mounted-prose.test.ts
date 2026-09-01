// @vitest-environment jsdom
//
// Spec: "it teaches itself: no instructions anywhere, on screen or off".
//
// spec/crit-5.test.ts holds the negative half of that line against the BUILT
// dist/index.html --- but the game builds its own DOM at runtime, so that file
// only ever sees the opening screen. This sensor builds the real game in jsdom,
// walks it through every level and past the ending, and applies the same two
// checks to the text that actually appears. The static file is the floor; this
// is the check with teeth.
import { beforeEach, describe, expect, it } from "vitest";
import { createGame, type Game } from "../src/scripts/mount";
import { play, playTo } from "../src/game/progress.test-helper";
import type { Session } from "../src/game/session";
import { CORE_SEQUENCE, MAX_LEVEL } from "../src/game/types";

const SIZE = { width: 800, height: 600 };

// Kept in sync by hand with spec/crit-5.test.ts --- the same spec line, read
// against a different surface.
const INSTRUCTION =
  /\b(press|click|tap|use the|move the|arrow keys?|wasd|spacebar|how to play|instructions?|tutorial|your goal|objective is|in order to|try to)\b/i;
const SENTENCE = /[.!?]\s+\S/;

let container: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
});

/** Everything the chrome puts on screen, as one run of text. */
function screenText(): string {
  return ["#levels", "#goal", "button.pick", "button.back", "button.advance", "#finish"]
    .map((sel) => document.querySelector(sel)?.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertQuiet(where: string): void {
  const text = screenText();
  expect(INSTRUCTION.exec(text)?.[0], `${where}: "${INSTRUCTION.exec(text)?.[0]}"`).toBeUndefined();
  expect(text, `${where}: a sentence on screen`).not.toMatch(SENTENCE);
}

/**
 * A session parked at level n with that level beaten and every level before it
 * played through. Played rather than fabricated: a level counts as beaten when
 * the arrangement actually fits the box, so a session with numbers written
 * into `bests` and the balls left where they started is not one.
 */
function sessionAt(n: number): Session {
  const session = play(playTo(n));
  return { ...session, finished: n > CORE_SEQUENCE };
}

function settleFrames(game: Game, frames = 200): void {
  for (let i = 0; i < frames; i++) game.step();
}

describe("nothing on screen tells the player anything", () => {
  it("stays quiet at every level, histogram and all", () => {
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const game = createGame(container, { session: sessionAt(n), size: SIZE });
      game.step();
      assertQuiet(`level ${n}`);
      expect(
        document.querySelectorAll("#levels a.level"),
        `level ${n}: nav rows`,
      ).toHaveLength(MAX_LEVEL);
      game.destroy();
    }
  });

  it("stays quiet through the real advance into the ending", () => {
    const game = createGame(container, { session: sessionAt(CORE_SEQUENCE), size: SIZE });
    game.step();
    const button = document.querySelector<HTMLButtonElement>("button.advance")!;
    expect(button.hidden).toBe(false);

    button.click();
    settleFrames(game);

    expect(game.session.finished).toBe(true);
    const finish = document.querySelector("#finish")!.textContent ?? "";
    expect(finish.trim(), "the ending says nothing at all").not.toBe("");
    assertQuiet("the ending");
    expect(document.querySelector("#levels")?.textContent?.trim()).toBe("");
  });

  it("stays quiet with the level screen open over the game", () => {
    // A screen of its own is a surface of its own: the rows, the lock on each
    // level not yet reached, and the way back all have to say nothing too.
    const game = createGame(container, { session: sessionAt(5), size: SIZE });
    game.step();
    document.querySelector<HTMLButtonElement>("button.pick")!.click();
    expect(document.querySelector<HTMLElement>("#levels")!.hidden).toBe(false);
    assertQuiet("the level screen");
    game.destroy();
  });

  it("lets the histogram carry the player back to an earlier level", () => {
    const game = createGame(container, { session: sessionAt(5), size: SIZE });
    game.step();
    document.querySelectorAll<HTMLElement>("#levels a.level")[2]!.click();
    expect(game.session.level).toBe(3);
    game.destroy();
  });
});
