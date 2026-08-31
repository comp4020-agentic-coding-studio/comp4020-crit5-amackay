import { createGame } from "./mount";
import { deserialise, newSession, serialise } from "../game/session";

// TEMPORARY, for playtesting only: with no stored session the game opens on
// three balls rather than one, so settling against neighbours is something a
// player can feel before a level has been completed. Revert to 1 at M9, once
// the level-select and the next-level button make the early levels reachable
// on their own.
const PLAYTEST_START_LEVEL = 3;

// The page entry: find the stage, build the game, own the frame loop. This is
// the only file that touches requestAnimationFrame, which is what lets a test
// advance time by calling step directly.

const KEY = "tighter/v1";

/** Stored progress, or null if there is none or it cannot be read. */
function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

const stage = document.querySelector<HTMLElement>("#stage");

if (stage) {
  const saved = stored();
  const session = saved ? deserialise(saved) : newSession(PLAYTEST_START_LEVEL);

  const game = createGame(stage, {
    session,
    onCommit(next) {
      try {
        localStorage.setItem(KEY, serialise(next));
      } catch {
        // Private browsing or storage disabled: the game still plays, it just
        // does not remember between visits.
      }
    },
  });

  const frame = () => {
    game.step();
    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
