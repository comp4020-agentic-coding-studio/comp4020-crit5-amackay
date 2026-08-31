import { CARRY_HEIGHT, MAX_SPEED, release, stepDescent, type Descent } from "../game/descent";
import { settleOnce } from "../game/settle";
import { newSession, type Session } from "../game/session";
import { ballAt, fitView, screenToWorld, viewBounds, type ViewTransform } from "../game/view";
import type { Ball } from "../game/types";
import { createSurface, render, type Surface } from "./render";

// The edge: DOM, pointers and the frame loop. Everything the rules need is a
// call into src/game; nothing in there knows this file exists.

/**
 * The slice of time the simulation advances in. A frame hands over however long
 * it happened to take, and that is spent in whole slices of this size, with the
 * remainder carried to the next frame.
 *
 * A fixed slice rather than the frame's own delta, because the speed cap made
 * the delta matter: an arrangement relaxes into whichever rest state its path
 * reaches, and once the path depended on the frame rate, so did the score taken
 * from it. Measured before this landed: the same drop compacted to 3.9785 at
 * 10fps and 3.9746 at 240fps. Small, and still a player's hardware showing up
 * in their score.
 */
const STEP_SECONDS = 1 / 120;

/**
 * The most simulated time one frame may make up, so a tab that was backgrounded
 * for a minute resumes rather than grinding through a minute of settling.
 */
const MAX_CATCHUP = 0.25;

/**
 * Settling passes run per slice. Deliberately a count rather than a function of
 * the elapsed time: scores come from compact(), which runs to convergence in a
 * single call, so no score anywhere depends on the frame rate. This number only
 * decides how finely a slice is resolved.
 */
const PASSES_PER_STEP = 6;

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
  /** Current pointer position, in world units. */
  world: Ball;
  /**
   * Ball centre minus pointer, fixed at the moment of the grab. A ball is
   * carried by the point it was picked up by; snapping its centre to the
   * pointer would make every grab start with a jump.
   */
  offset: Ball;
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
  /**
   * The released ball on its way back down, and how far it has left to fall.
   * Only ever one ball is off the plane, so this and a carried ball are the same
   * slot seen twice, and never both at once.
   */
  let falling: (Descent & { index: number }) | null = null;
  let view: ViewTransform = fitView(session.side, 0, 0);

  function measureSurface(): { width: number; height: number } {
    if (opts.size) return opts.size;
    const rect = container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  let bounds: { x: number; y: number } | null = null;

  function refreshView(): void {
    const { width, height } = measureSurface();
    view = fitView(session.side, width, height);
    bounds = viewBounds(view, width, height);
  }

  function draw(): void {
    render(surface, session.balls, session.side, view, grab?.ball ?? null);
  }

  /** Time handed over by frames but not yet simulated, in seconds. */
  let pending = 0;

  function step(deltaSeconds: number): void {
    refreshView();
    pending = Math.min(pending + Math.max(0, deltaSeconds), MAX_CATCHUP);
    while (pending >= STEP_SECONDS) {
      pending -= STEP_SECONDS;
      advance(STEP_SECONDS);
    }
    draw();
  }

  function advance(dt: number): void {
    // The fall is advanced once per settling pass, not once per slice. Dropping
    // the ball a whole slice's worth and only then letting the arrangement
    // react leaves whatever overlap that jump created to be shared out the
    // instant the ball lands, which pushes the drop off the spot the player
    // chose. Interleaved, the fall stays quasi-static like everything else.
    const descentStep = dt / PASSES_PER_STEP;
    // Only the frame loop caps: compacting runs the solver uncapped, so no
    // score is touched by this.
    const maxStep = (MAX_SPEED * dt) / PASSES_PER_STEP;

    for (let pass = 0; pass < PASSES_PER_STEP; pass++) {
      if (falling) {
        const next = stepDescent(falling, descentStep);
        falling = next.height > 0 ? { index: falling.index, ...next } : null;
      }
      const result = settleOnce(session.balls, {
        side: session.side,
        maxStep,
        raised:
          grab?.ball != null
            ? { index: grab.ball, height: CARRY_HEIGHT }
            : falling
              ? { index: falling.index, height: falling.height }
              : null,
        pusher: grab && grab.ball === null ? grab.world : null,
        bounds,
      });
      session = { ...session, balls: result.balls };
      // A still arrangement is only finished if nothing is still coming down.
      if (result.maxDisplacement === 0 && !falling) break;
    }
  }

  function pointerDown(x: number, y: number): void {
    refreshView();
    const world = screenToWorld(view, x, y);
    // A drag on empty background does not pick a ball up, but does bump balls
    // aside — which is what teaches the affordance in the first place.
    const ball = ballAt(session.balls, world);
    const centre = ball === null ? world : session.balls[ball]!;
    grab = {
      ball,
      world,
      offset: { x: centre.x - world.x, y: centre.y - world.y },
    };
    // Only ever one ball is off the plane, so picking one up ends any fall in
    // progress — its own, which is back in the air, or another's, which lands
    // where it had got to.
    if (ball !== null) falling = null;
    draw();
  }

  function pointerMove(x: number, y: number): void {
    if (!grab) return;
    const world = screenToWorld(view, x, y);
    grab = { ...grab, world };
    if (grab.ball !== null) {
      // Carried by the point it was grabbed by, and lifted clear, so it moves
      // wherever the pointer goes regardless of what is in the way.
      const target = { x: world.x + grab.offset.x, y: world.y + grab.offset.y };
      const balls = session.balls.map((ball, i) => (i === grab!.ball ? target : ball));
      session = { ...session, balls };
    }
  }

  function pointerUp(): void {
    // Releasing fixes the ball where it is and drops it: from here it pushes its
    // neighbours aside as it falls, reaching further across as it gets lower,
    // and is moved by nothing until it lands.
    if (grab?.ball != null) falling = { index: grab.ball, ...release() };
    grab = null;
  }

  const onDown = (event: PointerEvent) => {
    // Stops the browser starting a native drag or a text selection on what is,
    // to it, a plain div — either of which swallows the pointermove stream and
    // leaves a drag dead halfway through.
    event.preventDefault();
    if (container.setPointerCapture) container.setPointerCapture(event.pointerId);
    pointerDown(event.clientX, event.clientY);
  };
  const onMove = (event: PointerEvent) => pointerMove(event.clientX, event.clientY);
  const onUp = () => pointerUp();

  // Move and release listen on the window, not the surface: a drag that leaves
  // the element, or one the browser never gave us pointer capture for, still
  // has to keep tracking and still has to end.
  const view_ = container.ownerDocument.defaultView ?? window;
  container.addEventListener("pointerdown", onDown);
  view_.addEventListener("pointermove", onMove);
  view_.addEventListener("pointerup", onUp);
  view_.addEventListener("pointercancel", onUp);
  container.addEventListener("dragstart", preventNativeDrag);

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
      view_.removeEventListener("pointermove", onMove);
      view_.removeEventListener("pointerup", onUp);
      view_.removeEventListener("pointercancel", onUp);
      container.removeEventListener("dragstart", preventNativeDrag);
      container.replaceChildren();
    },
  };
}

function preventNativeDrag(event: Event): void {
  event.preventDefault();
}
