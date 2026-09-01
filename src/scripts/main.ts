import { createGame } from "./mount";
import { deserialise, newSession, serialise } from "../game/session";

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
  const session = saved ? deserialise(saved) : newSession();

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
