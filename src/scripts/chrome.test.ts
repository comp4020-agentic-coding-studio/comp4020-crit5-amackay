// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createChrome,
  renderAdvance,
  flyStar,
  renderGauge,
  renderStars,
  renderLevels,
  renderScreen,
} from "./chrome";
import { histogramRows } from "../game/histogram";
import { playTo } from "../game/progress.test-helper";
import { thresholds } from "../game/score";
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

describe("the star display", () => {
  it("fills from the left, one slot per star won", () => {
    const { stars } = createChrome(document);
    const won = () => [...stars.querySelectorAll(".star")].map((s) => s.classList.contains("is-won"));
    renderStars(stars, 0);
    expect(won()).toEqual([false, false, false]);
    renderStars(stars, 2);
    expect(won()).toEqual([true, true, false]);
    renderStars(stars, 3);
    expect(won()).toEqual([true, true, true]);
  });

  it("empties again when a fresh level is entered", () => {
    const { stars } = createChrome(document);
    renderStars(stars, 3);
    renderStars(stars, 0);
    expect(stars.querySelectorAll(".star.is-won")).toHaveLength(0);
  });

  it("flies nothing when there is no layout to fly across", () => {
    // jsdom reports every rect as zero-sized. A flight from nowhere to nowhere
    // would leave a star parked at the top left corner for half a second.
    const chrome = createChrome(document);
    flyStar(chrome, 3);
    expect(document.querySelectorAll(".fly")).toHaveLength(0);
  });
});

describe("the size bar", () => {
  const SCALE = 40;

  function gauge(side: number, level = 3, fits = true) {
    const t = thresholds(level);
    return {
      scale: SCALE,
      side,
      thresholds: [t.three, t.two, t.one] as const,
      fits,
      boxTop: 300 - (side / 2) * SCALE,
      barBottom: 72,
    };
  }

  it("puts the mark at the box's half-width in pixels, which is where the box's face is", () => {
    // The whole point of the bar: its left edge is the box's centre and it runs
    // at the box's own scale, so `--now` is the same screen offset the right
    // interior face is drawn at. Not a resemblance --- the same number.
    const { gauge: el, tie } = createChrome(document);
    renderGauge(el, tie, gauge(6));
    expect(el.style.getPropertyValue("--now")).toBe(`${(6 / 2) * SCALE}px`);
    expect(tie.style.getPropertyValue("--at")).toBe(`${(6 / 2) * SCALE}px`);
  });

  it("puts each star at the size that earns it, tightest first and leftmost", () => {
    const { gauge: el, tie } = createChrome(document);
    renderGauge(el, tie, gauge(6));
    const t = thresholds(3);
    const at = [...el.querySelectorAll<HTMLElement>(".tick")].map((tick) =>
      Number.parseFloat(tick.style.getPropertyValue("--at")),
    );
    expect(at).toEqual([t.three, t.two, t.one].map((size) => (size / 2) * SCALE));
    expect(at[0]).toBeLessThan(at[1]!);
    expect(at[1]).toBeLessThan(at[2]!);
  });

  it("hollows the fill out when what is in the box does not fit it", () => {
    const { gauge: el, tie } = createChrome(document);
    renderGauge(el, tie, gauge(6, 3, false));
    expect(el.classList.contains("is-unfit")).toBe(true);
    renderGauge(el, tie, gauge(6, 3, true));
    expect(el.classList.contains("is-unfit")).toBe(false);
  });

  it("runs the tie from the bar down to the box and no further", () => {
    const { gauge: el, tie } = createChrome(document);
    renderGauge(el, tie, gauge(6));
    expect(tie.style.getPropertyValue("--top")).toBe("72px");
    expect(tie.style.getPropertyValue("--length")).toBe(`${300 - 3 * SCALE - 72}px`);
  });

  it("never gives the tie a negative length", () => {
    // A box taller than the play space cannot happen, but a zero-sized surface
    // under jsdom puts boxTop above the bar, and a negative height is a CSS
    // value the browser silently drops rather than an error anyone would see.
    const { gauge: el, tie } = createChrome(document);
    renderGauge(el, tie, { ...gauge(6), boxTop: 0 });
    expect(tie.style.getPropertyValue("--length")).toBe("0px");
  });

  it("writes no text", () => {
    const { gauge: el, tie } = createChrome(document);
    renderGauge(el, tie, gauge(6));
    expect(el.textContent?.trim()).toBe("");
  });
});

describe("renderScreen", () => {
  it("swaps the way in for the way out", () => {
    const chrome = createChrome(document);
    renderScreen(chrome, false);
    expect(chrome.screen.hidden).toBe(true);
    expect(chrome.pick.hidden).toBe(false);
    expect(chrome.back.hidden).toBe(true);
    expect(chrome.gauge.hidden).toBe(false);

    renderScreen(chrome, true);
    expect(chrome.screen.hidden).toBe(false);
    expect(chrome.pick.hidden).toBe(true);
    expect(chrome.back.hidden).toBe(false);
    // The screen carries a row for the current level itself.
    expect(chrome.gauge.hidden).toBe(true);
  });
});
