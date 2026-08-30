import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// A sensor, not a contract test: it holds the seam CLAUDE.md asks for, whatever
// the brief. The rules are plain functions over plain data, and a rule bug and a
// rendering bug must never be confusable — which only stays true if nothing in
// here can reach the DOM, the clock, or a random number.

const RULES = "src/game";

/**
 * Comments are stripped first. The seam is a property of the code, and several
 * of these modules name the thing they are forbidden to call in a comment
 * saying exactly why they do not call it.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const sources = readdirSync(RULES)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({ name, code: stripComments(readFileSync(join(RULES, name), "utf8")) }));

describe("the rules are sealed off from the edge", () => {
  it("found the rule modules", () => {
    expect(sources.length).toBeGreaterThan(3);
  });

  it("reaches for no DOM", () => {
    for (const { name, code } of sources) {
      expect(code, name).not.toMatch(/\b(document|window|HTMLElement|getBoundingClientRect)\b/);
    }
  });

  it("reaches for no clock", () => {
    // Wall-clock time must never be a dependency of a rule: rAF does not tick
    // under test, and a score that moved with the frame rate would be a bug no
    // test could see.
    for (const { name, code } of sources) {
      expect(code, name).not.toMatch(/\b(performance\.now|Date\.now|new Date|requestAnimationFrame)\b/);
    }
  });

  it("reaches for no randomness", () => {
    // Degeneracy jitter is seeded from ball indices instead, which is what makes
    // compacting an unchanged arrangement twice give the identical number.
    for (const { name, code } of sources) {
      expect(code, name).not.toMatch(/Math\.random/);
    }
  });

  it("imports nothing from the edge", () => {
    for (const { name, code } of sources) {
      expect(code, name).not.toMatch(/from\s+["'][^"']*scripts\//);
    }
  });
});
