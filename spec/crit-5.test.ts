// C5 "A game" — contract tests for the week's published spec.
// These run against the BUILT site, the same as the invariants, so they check
// what actually ships. Both are red until the game exists; that is the point.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const DIST = resolve("dist");
const html = readFileSync(join(DIST, "index.html"), "utf8");
const doc = new JSDOM(html).window.document;

function visibleText(): string {
  const body = doc.body.cloneNode(true) as HTMLElement;
  for (const el of body.querySelectorAll("script, style, template, noscript")) {
    el.remove();
  }
  return (body.textContent ?? "").replace(/\s+/g, " ").trim();
}

// The word budget is about prose, and a heading is a name rather than prose:
// the invariants already hold the page to exactly one h1, and calling the game
// something is naming it. The instruction regex below still reads headings —
// "How to play" is telling whether or not it is set as one.
function textWithoutHeadings(): string {
  const body = doc.body.cloneNode(true) as HTMLElement;
  for (const el of body.querySelectorAll(
    "script, style, template, noscript, h1, h2, h3, h4, h5, h6",
  )) {
    el.remove();
  }
  return (body.textContent ?? "").replace(/\s+/g, " ").trim();
}

// Spec: "it teaches itself: no instructions anywhere, on screen or off".
// A test cannot tell whether the opening screen invites the first move — the
// pod settles that. What it can hold is the negative half: that the page never
// resorts to telling. Naming a game, a level or a score is not telling.
describe("no prose beyond naming things", () => {
  const words = textWithoutHeadings().split(" ").filter(Boolean);

  it("carries no instruction-shaped copy", () => {
    const telling =
      /\b(press|click|tap|use the|move the|arrow keys?|wasd|spacebar|how to play|instructions?|tutorial|your goal|objective is|in order to|try to)\b/i;
    const found = telling.exec(visibleText());
    expect(
      found?.[0],
      `the page tells the player something instead of showing it: "${found?.[0]}"`,
    ).toBeUndefined();
  });

  it("has no sentences on screen", () => {
    // Titles, labels, scores and endings are fragments. A full stop followed by
    // another word is prose, and prose here is a tutorial wearing a disguise.
    expect(visibleText()).not.toMatch(/[.!?]\s+\S/);
  });

  it("keeps the visible word count to a naming budget", () => {
    expect(
      words.length,
      `${words.length} words on screen: ${textWithoutHeadings().slice(0, 200)}`,
    ).toBeLessThanOrEqual(20);
  });
});

// Spec: "a stranger can pick it up and reach an ending inside five minutes",
// judged live at 1920x1080 AND 390x844. A phone has no keyboard, so a
// keyboard-only game has no first move at one of the two marked viewports.
// Structural only: it cannot tell you the touch target is big enough or the
// pacing is fair.
describe("playable at both marked viewports", () => {
  const scripts = [...doc.querySelectorAll("script[src]")]
    .map((el) => el.getAttribute("src") ?? "")
    .map((src) => src.replace(/^.*\//, ""))
    .map((name) => {
      try {
        return readFileSync(join(DIST, "_astro", name), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");

  const inline = [...doc.querySelectorAll("script:not([src])")]
    .map((el) => el.textContent ?? "")
    .join("\n");

  const code = `${scripts}\n${inline}`;

  it("ships a script at all", () => {
    expect(code.trim()).not.toBe("");
  });

  it("accepts pointer or touch input, not keyboard alone", () => {
    expect(
      /pointerdown|pointerup|touchstart|"click"|'click'|`click`/.test(code),
      "nothing in the shipped script listens for a pointer, so 390x844 has no first move",
    ).toBe(true);
  });

  it("declares a mobile-legible playing surface", () => {
    // A fixed-pixel stage wider than a phone is the size-dependent break the
    // marked 390x844 viewport exists to catch.
    const css = [...doc.querySelectorAll('link[rel="stylesheet"]')]
      .map((el) => (el.getAttribute("href") ?? "").replace(/^.*\//, ""))
      .map((name) => {
        try {
          return readFileSync(join(DIST, "_astro", name), "utf8");
        } catch {
          return "";
        }
      })
      .join("\n");
    const wideFixed = /(?:width|min-width)\s*:\s*(\d{3,})px/g;
    const offenders = [...css.matchAll(wideFixed)]
      .map((m) => Number(m[1]))
      .filter((px) => px > 390);
    expect(offenders, `fixed widths wider than a phone: ${offenders}`).toEqual([]);
  });
});
