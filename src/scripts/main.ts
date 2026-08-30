import { createGame } from "./mount";

// The page entry: find the stage, build the game, own the frame loop. This is
// the only file that touches requestAnimationFrame, which is what lets a test
// advance time by calling step directly.

const stage = document.querySelector<HTMLElement>("#stage");

if (stage) {
  const game = createGame(stage);
  let previous = performance.now();

  const frame = (now: number) => {
    const delta = Math.min((now - previous) / 1000, 0.1);
    previous = now;
    game.step(delta);
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
