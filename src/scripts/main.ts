import { createGame } from "./mount";
import { newSession } from "../game/session";

// TEMPORARY, for playtesting only: the game starts at level 1 with a single
// ball. Until the box handle exists there is no way to complete a level and
// reach the next, so this opens on three balls to make settling against
// neighbours something a player can actually feel. Revert to 1 once levels
// advance on their own.
const PLAYTEST_START_LEVEL = 3;

// The page entry: find the stage, build the game, own the frame loop. This is
// the only file that touches requestAnimationFrame, which is what lets a test
// advance time by calling step directly.

const stage = document.querySelector<HTMLElement>("#stage");

if (stage) {
  const game = createGame(stage, { session: newSession(PLAYTEST_START_LEVEL) });

  const frame = () => {
    game.step();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
