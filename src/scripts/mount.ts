import { settleOnce } from "../game/settle";
import { newSession, type Session } from "../game/session";
import { ballAt, fitView, screenToWorld, type ViewTransform } from "../game/view";
import type { Ball } from "../game/types";
import { createSurface, render, type Surface } from "./render";

// The edge: DOM, pointers and the frame loop. Everything the rules need is a
// call into src/game; nothing in there knows this file exists.

/**
 * Settling passes run per frame. Deliberately a count rather than a function of
 * the elapsed time: scores come from compact(), which runs to convergence in a
 * single call, so no score anywhere depends on the frame rate. This number only
 * decides how quickly a settle is seen to happen.
 */
const PASSES_PER_FRAME = 6;

export interface Game {
  /** Advance by a frame. The caller owns requestAnimationFrame, not this. */
  step(deltaSeconds: number): void;
  /** Drive input without a layout: coordinates are in screen pixels. */
  pointerDown(x: number, y: number): void;
  pointerMove(x: number, y: number): void;
  pointerUp(): void;
  readonly session: Session;
  readonly view: ViewTransform;
  destroy(): void;
}

interface Grab {
  /** The ball being carried, or null when the drag is bumping the background. */
  ball: number | null;
  world: Ball;
}

export interface GameOptions {
  session?: Session;
  /** Overrides the measured surface size; tests pass one, the page does not. */
  size?: { width: number; height: number };
}

export function createGame(container: HTMLElement, opts: GameOptions = {}): Game {
  const surface: Surface = createSurface(container);
  let session: Session = opts.session ?? newSession();
  let grab: Grab | null = null;
  let view: ViewTransform = fitView(session.side, 0, 0);

  function measureSurface(): { width: number; height: number } {
    if (opts.size) return opts.size;
    const rect = container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function refreshView(): void {
    const { width, height } = measureSurface();
    view = fitView(session.side, width, height);
  }

  function draw(): void {
    render(surface, session.balls, session.side, view, grab?.ball ?? null);
  }

  function step(_deltaSeconds: number): void {
    refreshView();
    for (let pass = 0; pass < PASSES_PER_FRAME; pass++) {
      const result = settleOnce(session.balls, {
        side: session.side,
        held: grab?.ball ?? null,
        pusher: grab && grab.ball === null ? grab.world : null,
      });
      session = { ...session, balls: result.balls };
      if (result.maxDisplacement === 0) break;
    }
    draw();
  }

  function pointerDown(x: number, y: number): void {
    refreshView();
    const world = screenToWorld(view, x, y);
    // A drag on empty background does not pick a ball up, but does bump balls
    // aside — which is what teaches the affordance in the first place.
    grab = { ball: ballAt(session.balls, world), world };
    draw();
  }

  function pointerMove(x: number, y: number): void {
    if (!grab) return;
    const world = screenToWorld(view, x, y);
    grab = { ...grab, world };
    if (grab.ball !== null) {
      // A held ball is lifted clear, so it moves to the pointer regardless of
      // what is in the way; the neighbours are shoved as it comes back down.
      const balls = session.balls.map((ball, i) => (i === grab!.ball ? { ...world } : ball));
      session = { ...session, balls };
    }
  }

  function pointerUp(): void {
    grab = null;
  }

  const onDown = (event: PointerEvent) => {
    if (container.setPointerCapture) container.setPointerCapture(event.pointerId);
    pointerDown(event.clientX, event.clientY);
  };
  const onMove = (event: PointerEvent) => pointerMove(event.clientX, event.clientY);
  const onUp = () => pointerUp();

  container.addEventListener("pointerdown", onDown);
  container.addEventListener("pointermove", onMove);
  container.addEventListener("pointerup", onUp);
  container.addEventListener("pointercancel", onUp);

  refreshView();
  draw();

  return {
    step,
    pointerDown,
    pointerMove,
    pointerUp,
    get session() {
      return session;
    },
    get view() {
      return view;
    },
    destroy() {
      container.removeEventListener("pointerdown", onDown);
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerup", onUp);
      container.removeEventListener("pointercancel", onUp);
      container.replaceChildren();
    },
  };
}
