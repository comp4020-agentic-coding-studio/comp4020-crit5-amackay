// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChrome, renderAdvance, renderFinish, renderLevels } from "./chrome";
import { histogramRows } from "../game/histogram";
import { playTo } from "../game/progress.test-helper";
import { newSession } from "../game/session";

beforeEach(() => {
  document.body.replaceChildren();
});

describe("createChrome", () => {
  it("creates the three elements when the page has none", () => {
    const { levels, advance: button, finish } = createChrome(document);
    expect(levels.id).toBe("levels");
    expect(levels.getAttribute("aria-label")).toBe("Levels");
    expect(button.className).toBe("advance");
    expect(button.hidden).toBe(true);
    expect(finish.id).toBe("finish");
  });

  it("adopts elements the page already server-rendered", () => {
    document.body.innerHTML = `<nav id="levels"><a class="level"></a></nav>
      <button class="advance"></button><div id="finish"></div>`;
    const { levels } = createChrome(document);
    expect(document.querySelectorAll("#levels").length).toBe(1);
    expect(levels.querySelectorAll("a.level").length).toBe(1);
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
  it("shows one row per level reached and none beyond", () => {
    const { levels } = createChrome(document);
    renderLevels(levels, histogramRows(playTo(4)), { onSelect: () => {} });
    expect(levels.querySelectorAll("a.level")).toHaveLength(4);
  });

  it("reconciles the row count down when a shorter session is drawn", () => {
    const { levels } = createChrome(document);
    renderLevels(levels, histogramRows(playTo(4)), { onSelect: () => {} });
    renderLevels(levels, histogramRows(playTo(2)), { onSelect: () => {} });
    expect(levels.querySelectorAll("a.level")).toHaveLength(2);
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
    const frontier = levels.querySelector<HTMLElement>("a.level:last-of-type")!;
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

describe("renderAdvance and renderFinish", () => {
  it("toggles the button's visibility", () => {
    const { advance: button } = createChrome(document);
    renderAdvance(button, true);
    expect(button.hidden).toBe(false);
    renderAdvance(button, false);
    expect(button.hidden).toBe(true);
  });

  it("sets the finish text only once finished, and clears it otherwise", () => {
    const { finish } = createChrome(document);
    renderFinish(finish, false, "done");
    expect(finish.textContent).toBe("");
    renderFinish(finish, true, "done");
    expect(finish.textContent).toBe("done");
  });
});
