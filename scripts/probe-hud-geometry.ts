// One-off: does "frame = par(N) + 2 radii" leave room for the box, the handle
// and the size bar at the two marked screen sizes? Numbers for the HUD plan.
import { par, thresholds } from "../src/game/score";
import { optimum } from "../src/game/optima";
import { WALL_WIDTH, BALL_RADIUS, MAX_LEVEL } from "../src/game/types";

const HANDLE_LEG = 2 * (WALL_WIDTH + BALL_RADIUS) - BALL_RADIUS * Math.SQRT2;
const BAR = 80; // assumed top/bottom bar height, px

for (const [name, W, H] of [["desktop", 1920, 1080], ["phone", 390, 844]] as const) {
  const playW = W, playH = H - 2 * BAR;
  console.log(`\n=== ${name} ${W}x${H}  play ${playW}x${playH} (bars ${BAR}) ===`);
  console.log("  N  frame  scale  box@opt  handle  bar-px-needed  bar-px-avail  star-spread-px  3v2-px");
  for (const n of [1, 2, 3, 4, 5, 9, 10, 16, 20]) {
    const frame = par(n) + 2;
    const scale = Math.min(playW, playH) / frame;
    const opt = optimum(n);
    const t = thresholds(n);
    // the size bar runs from world x=0 (screen centre) rightwards at box scale
    const needed = (frame / 2) * scale;            // to show the whole frame's half-width
    const avail = W / 2 - 24;                       // centre to right edge, less padding
    const spread = ((t.one - t.three) / 2) * scale; // 1-star icon to 3-star icon
    const threeTwo = ((t.two - t.three) / 2) * scale;
    console.log(
      `  ${String(n).padStart(2)}  ${String(frame).padStart(5)}  ${scale.toFixed(1).padStart(5)}` +
      `  ${(opt * scale).toFixed(0).padStart(7)}  ${(HANDLE_LEG * scale).toFixed(0).padStart(6)}` +
      `  ${needed.toFixed(0).padStart(13)}  ${avail.toFixed(0).padStart(12)}` +
      `  ${spread.toFixed(1).padStart(14)}  ${threeTwo.toFixed(1).padStart(6)}`,
    );
  }
  // viewBounds: does the clamp fall inside the box's own wall?
  console.log("  -- ball clamp vs wall (viewBounds uses the full viewport) --");
  for (const n of [1, 4, 10, 20]) {
    const frame = par(n) + 2;
    const scale = Math.min(playW, playH) / frame;
    const boundX = W / (2 * scale) - BALL_RADIUS;
    const boundY = H / (2 * scale) - BALL_RADIUS;
    const wall = frame / 2; // box at its largest
    console.log(`  N=${n} boundX=${boundX.toFixed(2)} boundY=${boundY.toFixed(2)} wallAt=${wall.toFixed(2)} -> clampsInsideBox=${boundX < wall}`);
  }
}
console.log(`\nMAX_LEVEL=${MAX_LEVEL} HANDLE_LEG=${HANDLE_LEG.toFixed(4)} radii`);
export {};
