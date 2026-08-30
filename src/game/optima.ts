import { MAX_LEVEL } from "./types";

// Side of the smallest square known to hold N unit circles, in ball radii.
// Source: Erich Friedman, "Circles in Squares",
// https://erich-friedman.github.io/packing/cirinsqu/
//
// Only the first several are proven optimal; the rest are the best packings
// known. The distinction does not change the game — three stars is defined
// against the best known figure either way — so it is recorded here rather
// than carried in the data.
//
// Indexed by N, so index 0 is unused.
const SIDES: readonly number[] = [
  0,
  2, //  1  exact: 2
  3.414214, //  2  exact: 2 + sqrt(2)
  3.931852, //  3
  4, //  4  exact: 4, the 2x2 grid
  4.828427, //  5  exact: 2 + 2*sqrt(2)
  5.328201, //  6
  5.732051, //  7  exact: 4 + sqrt(3)
  5.863703, //  8
  6, //  9  exact: 6, the 3x3 grid
  6.747441, // 10
  7.022509, // 11
  7.144958, // 12
  7.463047, // 13
  7.732051, // 14  exact: 6 + sqrt(3)
  7.863703, // 15
  8, // 16  exact: 8, the 4x4 grid
  8.53266, // 17
  8.656534, // 18
  8.907011, // 19
  8.978083, // 20
];

/** The smallest square side known to hold N balls, in ball radii. */
export function optimum(n: number): number {
  const side = SIDES[n];
  if (side === undefined || n < 1 || n > MAX_LEVEL) {
    throw new RangeError(`no packing recorded for N = ${n}`);
  }
  return side;
}

/** Every N the table covers, for tests and for level select. */
export function levels(): number[] {
  return Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
}
