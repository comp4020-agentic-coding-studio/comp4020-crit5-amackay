import { CARRY_HEIGHT, MAX_SPEED, release, stepDescent, type Descent } from "../game/descent";
import { settleOnce } from "../game/settle";
import { newSession, type Session } from "../game/session";
import { ballAt, fitView, screenToWorld, viewBounds, type ViewTransform } from "../game/view";
import type { Ball } from "../game/types";
import { createSurface, render, type Surface } from "./render";

// The edge: DOM, pointers and the frame loop. Everything the rules need is a
// call into src/game; nothing in there knows this file exists.

/**
 * The frame rate the simulation assumes, whatever the display actually manages.
 *
 * Nothing here is timed and nothing is scored on the clock, so a frame is just
 * a tick: the game advances one step per frame and takes the delta on trust.
 * That buys back the whole variable-frame-rate apparatus --- no accumulator, no
 * leftover, no catch-up budget --- and makes every run of the same input
 * identical, which is a stronger guarantee than pacing by a wall clock ever
 * gave. The cost is that a 120Hz display settles at twice the speed of a 60Hz
 * one; for a puzzle with no timer that is a difference in how brisk it feels
 * and in nothing else.
 */
const FRAME_RATE = 60;

/**
 * Settling passes run per frame. Deliberately a count rather than a function of
 * the elapsed time: scores come from compact(), which runs to convergence in a
 * single call, so no score anywhere depends on the frame rate. This number only
 * decides how finely a frame is resolved.
 */
const PASSES_PER_STEP = 6;

/**
 * The furthest a ball may be pushed in one pass. Everything the player watches
 * move is paced by this and by nothing else --- it is the one dial for how the
 * game feels in motion.
 */
const MAX_STEP = MAX_SPEED / FRAME_RATE / PASSES_PER_STEP;

export interface Game {
  /**
   * Advance by one frame. The caller owns requestAnimationFrame, not this, and
   * a frame is a tick rather than a duration --- see FRAME_RATE.
   */
  step(): void;
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
    render(surface, session.balls, session.side, view, raisedBall());
  }

  /** The ball off the plane right now: carried by the pointer, or still falling. */
  function raisedBall(): { index: number; height: number } | null {
    if (grab?.ball != null) return { index: grab.ball, height: CARRY_HEIGHT };
    return falling ? { index: falling.index, height: falling.height } : null;
  }

  function step(): void {
    refreshView();
    for (let pass = 0; pass < PASSES_PER_STEP; pass++) {
      // The fall is advanced once per pass rather than once per frame, so the
      // arrangement reacts to the room the ball needs as it needs it rather
      // than after the fact.
      if (falling) {
        const next = stepDescent(falling, 1 / FRAME_RATE / PASSES_PER_STEP);
        falling = next.height > 0 ? { index: falling.index, ...next } : null;
      }
      const result = settleOnce(session.balls, {
        side: session.side,
        maxStep: MAX_STEP,
        raised: raisedBall(),
        pusher: grab && grab.ball === null ? grab.world : null,
        bounds,
      });
      session = { ...session, balls: result.balls };
      // A still arrangement is only finished if nothing is still coming down.
      if (result.maxDisplacement === 0 && !falling) break;
    }
    draw();
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
