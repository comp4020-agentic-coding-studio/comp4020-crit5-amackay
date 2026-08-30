import { describe, expect, it } from "vitest";
import { levels, optimum } from "./optima";
import { par, stars, thresholds } from "./score";

const ALL = levels();

function isPerfectSquare(n: number): boolean {
  const root = Math.round(Math.sqrt(n));
  return root * root === n;
}

// The point of these four is that they catch a mistyped digit in the packing
// table without anyone having to trust any single figure in it.
describe("the packing table", () => {
  it("gives a size for every level and nothing outside", () => {
    for (const n of ALL) expect(optimum(n)).toBeGreaterThan(0);
    expect(() => optimum(0)).toThrow();
    expect(() => optimum(ALL.length + 1)).toThrow();
  });

  it("never shrinks as a ball is added", () => {
    for (const n of ALL.slice(1)) {
      expect(optimum(n), `optimum(${n})`).toBeGreaterThanOrEqual(optimum(n - 1));
    }
  });

  it("never beats the naive grid", () => {
    for (const n of ALL) {
      expect(optimum(n), `optimum(${n}) vs par ${par(n)}`).toBeLessThanOrEqual(par(n));
    }
  });

  it("ties the grid exactly at the perfect squares and nowhere else", () => {
    for (const n of ALL) {
      expect(optimum(n) === par(n), `N = ${n}`).toBe(isPerfectSquare(n));
    }
  });
});

describe("par", () => {
  it("is a square grid of ceil(sqrt(N)) balls a side", () => {
    expect(ALL.map(par)).toEqual([
      2, 4, 4, 4, 6, 6, 6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 10, 10, 10, 10,
    ]);
  });
});

describe("stars", () => {
  it("orders its thresholds at every level, squares included", () => {
    for (const n of ALL) {
      const t = thresholds(n);
      expect(t.three, `N = ${n}`).toBeLessThanOrEqual(t.two);
      expect(t.two, `N = ${n}`).toBeLessThanOrEqual(t.one);
    }
  });

  it("never awards more stars for a bigger box", () => {
    for (const n of ALL) {
      let previous = 3;
      for (let size = optimum(n); size < par(n) * 1.5; size += 0.01) {
        const awarded = stars(n, size);
        expect(awarded, `N = ${n}, size ${size}`).toBeLessThanOrEqual(previous);
        previous = awarded;
      }
    }
  });

  it("gives three stars for reaching the optimum", () => {
    for (const n of ALL) expect(stars(n, optimum(n)), `N = ${n}`).toBe(3);
  });

  it("gives at least one star for matching the grid", () => {
    for (const n of ALL) expect(stars(n, par(n)), `N = ${n}`).toBeGreaterThanOrEqual(1);
  });

  it("gives none for a box loose enough to be no arrangement at all", () => {
    for (const n of ALL) expect(stars(n, par(n) * 1.5), `N = ${n}`).toBe(0);
  });
});
