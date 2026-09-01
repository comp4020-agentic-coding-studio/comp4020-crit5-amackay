// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createChrome,
  renderAdvance,
  renderGoal,
  renderLevels,
  renderScreen,
} from "./chrome";
import { histogramRows } from "../game/histogram";
import { play, playTo } from "../game/progress.test-helper";
import { newSession } from "../game/session";
import { MAX_LEVEL } from "../game/types";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("createChrome", () => {
  it("creates the elements when the page has none", () => {
    const { screen, levels, advance: button } = createChrome(document);
    expect(screen.id).toBe("screen");
    expect(levels.id).toBe("levels");
    expect(levels.parentElement).toBe(screen);
    expect(levels.getAttribute("aria-label")).toBe("Levels");
    expect(button.className).toBe("advance");
    expect(button.hidden).toBe(true);
  });

  it("adopts elements the page already server-rendered", () => {
    document.body.innerHTML = `<div id="screen"><nav id="levels"><a class="level"></a></nav></div>
      <button class="advance"></button>`;
    const { screen, levels } = createChrome(document);
    expect(document.querySelectorAll("#levels").length).toBe(1);
    expect(levels.querySelectorAll("a.level").length).toBe(1);
    expect(levels.parentElement).toBe(screen);
  });

  it("wires a click onto the server-rendered row, not just fresh ones", () => {
    document.body.innerHTML = `<nav id="levels"><a class="level" data-n="1"></a></nav>`;
    const { levels } = createChrome(document);
    const onSelect = vi.fn();
    renderLevels(levels, histogramRows(playTo(3)), { onSelect });
    levels.querySelector<HTMLElement>("a.level")!.click();
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});

describe("renderLevels", () => {
  it("shows one row per level in the game", () => {
    const { levels } = createChrome(document);
    renderLevels(levels, histogramRows(playTo(4)), { onSelect: () => {} });
    expect(levels.querySelectorAll("a.level")).toHaveLength(MAX_LEVEL);
  });

  it("marks the rows past the frontier as locked", () => {
    const { levels } = createChrome(document);
    renderLevels(levels, histogramRows(playTo(4)), { onSelect: () => {} });
    const locked = levels.querySelectorAll<HTMLElement>("a.level.is-locked");
    expect([...locked].map((el) => el.dataset.n)).toEqual(
      Array.from({ length: MAX_LEVEL - 4 }, (_, i) => String(i + 5)),
    );
  });

  it("takes no click on a locked row", () => {
    const { levels } = createChrome(document);
    const onSelect = vi.fn();
    renderLevels(levels, histogramRows(playTo(2)), { onSelect });
    levels.querySelector<HTMLElement>("a.level.is-locked")!.click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("reconciles a row back out of locked when the level is reached", () => {
    const { levels } = createChrome(document);
    renderLevels(levels, histogramRows(playTo(2)), { onSelect: () => {} });
    const third = () => levels.querySelectorAll<HTMLElement>("a.level")[2]!;
    expect(third().classList.contains("is-locked")).toBe(true);
    renderLevels(levels, histogramRows(playTo(4)), { onSelect: () => {} });
    expect(third().classList.contains("is-locked")).toBe(false);
  });

  it("writes no text into the nav at any level count", () => {
    const { levels } = createChrome(document);
    renderLevels(levels, histogramRows(newSession(20)), { onSelect: () => {} });
    expect(levels.textContent?.trim()).toBe("");
  });

  it("takes a row's bar width from the recorded best", () => {
    const { levels } = createChrome(document);
    const session = playTo(3);
    renderLevels(levels, histogramRows(session), { onSelect: () => {} });
    const first = levels.querySelector<HTMLElement>("a.level")!;
    expect(first.style.getPropertyValue("--bar")).not.toBe("");
    const frontier = levels.querySelectorAll<HTMLElement>("a.level")[2]!;
    expect(frontier.style.getPropertyValue("--bar")).toBe("");
  });

  it("calls onSelect with the level a clicked row stands for", () => {
    const { levels } = createChrome(document);
    const onSelect = vi.fn();
    renderLevels(levels, histogramRows(playTo(4)), { onSelect });
    levels.querySelectorAll<HTMLElement>("a.level")[2]!.click();
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("marks the current row with aria-current", () => {
    const { levels } = createChrome(document);
    renderLevels(levels, histogramRows(playTo(3)), { onSelect: () => {} });
    const current = levels.querySelectorAll<HTMLElement>("a.level[aria-current]");
    expect(current).toHaveLength(1);
    expect(current[0]!.dataset.n).toBe("3");
  });
});

describe("renderAdvance", () => {
  it("toggles the button's visibility", () => {
    const { advance: button } = createChrome(document);
    renderAdvance(button, true);
    expect(button.hidden).toBe(false);
    renderAdvance(button, false);
    expect(button.hidden).toBe(true);
  });
});

describe("the goal row", () => {
  it("draws the level being played and nothing else", () => {
    const { goal } = createChrome(document);
    const rows = histogramRows(playTo(3));
    renderGoal(goal, rows.find((row) => row.current));
    const drawn = goal.querySelectorAll(".level");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.getAttribute("data-n")).toBe("3");
    expect(goal.textContent?.trim()).toBe("");
  });

  it("takes its bar from the box on screen, not from a recorded best", () => {
    const { goal } = createChrome(document);
    const session = playTo(3);
    const row = histogramRows(session).find((r) => r.current)!;
    renderGoal(goal, row);
    const drawn = goal.querySelector<HTMLElement>(".level")!;
    expect(row.bestFraction).toBeNull();
    expect(drawn.style.getPropertyValue("--bar")).toBe(`${row.nowFraction}`);
  });

  it("marks the bar when what is in the box does not fit it", () => {
    const { goal } = createChrome(document);
    const opened = histogramRows(playTo(3)).find((r) => r.current)!;
    renderGoal(goal, opened);
    expect(goal.querySelector(".level")!.classList.contains("is-unfit")).toBe(true);
    renderGoal(goal, histogramRows(play(playTo(3))).find((r) => r.current)!);
    expect(goal.querySelector(".level")!.classList.contains("is-unfit")).toBe(false);
  });

  it("marks exactly one notch as the goal", () => {
    const { goal } = createChrome(document);
    renderGoal(goal, histogramRows(playTo(3)).find((r) => r.current));
    expect(goal.querySelectorAll(".notch.is-goal")).toHaveLength(1);
  });
});

describe("renderScreen", () => {
  it("swaps the way in for the way out", () => {
    const chrome = createChrome(document);
    renderScreen(chrome, false);
    expect(chrome.screen.hidden).toBe(true);
    expect(chrome.pick.hidden).toBe(false);
    expect(chrome.back.hidden).toBe(true);
    expect(chrome.goal.hidden).toBe(false);

    renderScreen(chrome, true);
    expect(chrome.screen.hidden).toBe(false);
    expect(chrome.pick.hidden).toBe(true);
    expect(chrome.back.hidden).toBe(false);
    // The screen carries a row for the current level itself.
    expect(chrome.goal.hidden).toBe(true);
  });
});
