import { CARRY_HEIGHT, MAX_SPEED, nearestGap, stepDescent } from "../game/descent";
import { histogramRows } from "../game/histogram";
import { settleOnce } from "../game/settle";
import { compact, fitsNow } from "../game/compact";
import {
  advance,
  enterLevel,
  levelComplete,
  newSession,
  openSide,
  record,
  type Session,
} from "../game/session";
import { ballAt, fitView, screenToWorld, viewBounds, VIEW_MARGIN, type ViewTransform } from "../game/view";
import { BALL_RADIUS, MAX_LEVEL, WALL_WIDTH, type Ball, type Side } from "../game/types";
import { createChrome, renderAdvance, renderFinish, renderLevels, type Chrome } from "./chrome";
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

/**
 * How far a descending ball's reach bites into its nearest neighbour. Derived:
 * `alpha` is 0.5 for a ball with one contact, so an overlap of twice a step is
 * exactly what it takes to move that neighbour a full step and no more. Bite
 * less and the descent waits on a neighbour it is barely pushing; bite more and
 * the cap throws the extra away.
 */
const DESCENT_BITE = 2 * MAX_STEP;

/**
 * The shortest a landing may take, in seconds — so dropping a ball into clear
 * space reads as a beat rather than a teleport.
 */
const BEAT_SECONDS = 0.1;
const MAX_DROP = CARRY_HEIGHT / (BEAT_SECONDS * FRAME_RATE * PASSES_PER_STEP);

/**
 * And the longest, expressed as a floor on how far the ball comes down each
 * pass. Derived: a height falling at MAX_STEP is a ball coming down exactly as
 * fast as a shoved ball travels sideways, so a landing can never take longer
 * than the shove it would cause at full stretch — half a second, and only when
 * something is genuinely in the way the whole distance.
 *
 * Without a floor a drop onto a ball jammed against a wall hangs in the air for
 * ever, because the gap it is waiting on never opens. Measured: the height
 * stalled at 0.384 and stayed there.
 */
const MIN_DROP = MAX_STEP;

/**
 * The floor a handle drag may squeeze the box to. A UI clamp on the control,
 * not a rule about the box: nothing in src/game/ needs a side to stay above
 * this, it just keeps the handle from being dragged to zero or negative.
 */
const MIN_SIDE = 2 * BALL_RADIUS;

/**
 * How far the pointer may move, in screen pixels, before a handle gesture
 * counts as a drag rather than a click. Screen space rather than world space
 * because it is about what the gesture looked like to the finger, which does
 * not change with the view's zoom.
 */
const CLICK_THRESHOLD_PX = 4;

/**
 * How many frames a level-change zoom takes. A fixed count, not a duration:
 * a frame is a tick here (see FRAME_RATE), so the zoom advances one step per
 * frame like the fall and the close, and the hand-off from the zoom to the
 * new ball's drop lands on a tick boundary rather than at a wall-clock time.
 * Eighteen is ~0.3s at 60fps --- long enough to read as the camera pulling
 * back, short enough not to be a wait.
 */
const ZOOM_TICKS = 18;

/** Ease in and out, so the zoom starts and stops gently. Pure. */
function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function lerp(from: number, to: number, k: number): number {
  return from + (to - from) * k;
}

/**
 * What the screen says once the core sequence is done. A fragment, not a
 * sentence, and clear of the instruction words the spec forbids --- the whole
 * of the game's visible-prose budget is twenty words and the histogram spends
 * none, so this is where they go. Placeholder wording pending the owner's.
 */
const FINISH_TEXT = "ten levels, tighter";

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
  /** The handle: the box's one control surface. Same screen-pixel input. */
  handleDown(x: number, y: number): void;
  handleMove(x: number, y: number): void;
  handleUp(): void;
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

/**
 * A grab on the handle rather than on a ball. `moved` is what tells
 * `handleUp` whether this was a click (compact) or a drag (the side was
 * already applied live, move by move).
 */
interface Resize {
  downScreen: { x: number; y: number };
  moved: boolean;
}

/**
 * A click's compact (or de-compact) playing out. `target`/`finalBalls` are
 * compact()'s own exact, instantaneous answer — computed once, up front, so
 * what eventually gets recorded never depends on the frame rate. `contained`
 * says which balls the animation may touch; the rest are physically inert for
 * its whole duration, which is what "ignore the balls outside the box" means
 * on screen rather than just in the rule.
 */
interface Closing {
  target: Side;
  finalBalls: Ball[];
  contained: boolean[];
}

export interface GameOptions {
  session?: Session;
  /** Overrides the measured surface size; tests pass one, the page does not. */
  size?: { width: number; height: number };
}

export function createGame(container: HTMLElement, opts: GameOptions = {}): Game {
  const surface: Surface = createSurface(container);
  const chrome: Chrome = createChrome(container.ownerDocument);
  let session: Session = opts.session ?? newSession();
  let grab: Grab | null = null;
  let resize: Resize | null = null;
  let closing: Closing | null = null;
  /**
   * The released ball on its way back down, and how far it has left to fall.
   * Only ever one ball is off the plane, so this and a carried ball are the same
   * slot seen twice, and never both at once.
   */
  let falling: { index: number; height: number } | null = null;
  /**
   * A level-change zoom in progress: the scale it started from and how many
   * frames it has run. The target is always the current level's fit, recomputed
   * every frame, so a mid-zoom window resize is handled for free.
   */
  let zooming: { fromScale: number; tick: number } | null = null;
  let view: ViewTransform = fitView(openSide(session.level), 0, 0);

  function measureSurface(): { width: number; height: number } {
    if (opts.size) return opts.size;
    const rect = container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  let bounds: { x: number; y: number } | null = null;
  /**
   * The largest side a drag on the handle may reach. The view is fitted to
   * `openSide(level) + 2 * VIEW_MARGIN`, so that is exactly the box's outer
   * footprint (side + 2 * WALL_WIDTH) at the point it would fill the frame --
   * a drag beyond this would push the box, and its corner, off screen.
   */
  let maxSide: Side = openSide(session.level) + 2 * VIEW_MARGIN - 2 * WALL_WIDTH;

  /**
   * Fit to the level's opening side, not the live one --- so closing the box
   * changes what fills the frame, never the frame itself. The handle already
   * grows the side above the opening size on a drag out; the view has to stay
   * put through that too, which is why this is the level's fixed size and not
   * a running max.
   */
  function refreshView(): void {
    const { width, height } = measureSurface();
    const target = fitView(openSide(session.level), width, height);
    // Only the scale is eased; the origin is just the surface centre, so it is
    // always taken live. maxSide and bounds jump straight to the new level ---
    // safe because the arrangement is at rest through a zoom, and a looser
    // early bound never clamps anything.
    view = zooming
      ? {
          originX: target.originX,
          originY: target.originY,
          scale: lerp(zooming.fromScale, target.scale, smoothstep(zooming.tick / ZOOM_TICKS)),
        }
      : target;
    bounds = viewBounds(view, width, height);
    maxSide = openSide(session.level) + 2 * VIEW_MARGIN - 2 * WALL_WIDTH;
  }

  /** Start easing the view to the current level's fit. The level has already moved. */
  function beginZoom(): void {
    zooming = { fromScale: view.scale, tick: 0 };
  }

  function draw(): void {
    render(surface, session.balls, session.side, view, raisedBall());
    renderLevels(chrome.levels, histogramRows(session), { onSelect: goToLevel });
    renderAdvance(chrome.advance, canAdvance());
    renderFinish(chrome.finish, session.finished, FINISH_TEXT);
  }

  /**
   * The next-level button shows only where it means something: at the frontier
   * level, once par has been beaten, and never at the last level. Revisiting an
   * earlier level via the histogram is not the frontier, so the histogram is
   * how a player moves around then.
   */
  function canAdvance(): boolean {
    return (
      session.level === session.reached &&
      session.level < MAX_LEVEL &&
      levelComplete(session)
    );
  }

  /** Jump to a level already reached, restoring its best arrangement. */
  function goToLevel(n: number): void {
    const before = session.level;
    session = enterLevel(session, n);
    if (session.level !== before) beginZoom();
    refreshView();
    draw();
  }

  /** Move past a beaten frontier level: one more ball, a bigger box. */
  function advanceLevel(): void {
    const before = session.level;
    session = advance(session);
    if (session.level !== before) beginZoom();
    refreshView();
    draw();
  }

  /** The ball off the plane right now: carried by the pointer, or still falling. */
  function raisedBall(): { index: number; height: number } | null {
    if (grab?.ball != null) return { index: grab.ball, height: CARRY_HEIGHT };
    return falling ? { index: falling.index, height: falling.height } : null;
  }

  function step(): void {
    // The zoom is a view event, not a settle, so it advances once per frame
    // rather than once per pass.
    if (zooming) {
      zooming.tick++;
      if (zooming.tick >= ZOOM_TICKS) zooming = null;
    }
    refreshView();
    for (let pass = 0; pass < PASSES_PER_STEP; pass++) {
      // The fall is advanced once per pass rather than once per frame, so the
      // arrangement reacts to the room the ball needs as it needs it rather
      // than after the fact.
      if (falling) {
        const height = stepDescent(
          falling.height,
          nearestGap(session.balls, falling.index),
          DESCENT_BITE,
          MIN_DROP,
          MAX_DROP,
        );
        falling = height > 0 ? { index: falling.index, height } : null;
      }
      if (closing) {
        // The side moves at the same one dial as everything else the player
        // watches, and only the contained balls are ever handed to the settle
        // pass --- an outside ball is never even in the array, so it cannot
        // move and cannot be pushed against.
        const remaining = closing.target - session.side;
        const delta = Math.sign(remaining) * Math.min(Math.abs(remaining), MAX_STEP);
        const side = session.side + delta;
        const containedIndex: number[] = [];
        for (let i = 0; i < session.balls.length; i++) {
          if (closing.contained[i]) containedIndex.push(i);
        }
        const sub = containedIndex.map((i) => session.balls[i]!);
        const result = settleOnce(sub, { side, maxStep: MAX_STEP, bounds });
        const balls = session.balls.slice();
        containedIndex.forEach((originalIndex, k) => {
          balls[originalIndex] = result.balls[k]!;
        });
        session = { ...session, side, balls };
        if (side === closing.target) {
          // Finalise with compact()'s own exact numbers, not whatever this
          // frame's live settle happened to land on --- that is what keeps
          // the recorded score frame-rate-independent. Still only a record if
          // every ball is actually back inside: fitsNow scores the whole
          // array, so a ball left outside keeps failing it, and compacting
          // just the interior stays a real, visible result without being a
          // scoreable one until the box comes back out far enough to hold it.
          session = { ...session, side: closing.target, balls: closing.finalBalls };
          if (fitsNow(closing.finalBalls, closing.target)) {
            session = record(session, closing.target, closing.finalBalls);
          }
          closing = null;
        }
        continue;
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
    if (grab?.ball != null) falling = { index: grab.ball, height: CARRY_HEIGHT };
    grab = null;
  }

  function handleDown(x: number, y: number): void {
    resize = { downScreen: { x, y }, moved: false };
  }

  function handleMove(x: number, y: number): void {
    if (!resize) return;
    const traveled = Math.hypot(x - resize.downScreen.x, y - resize.downScreen.y);
    if (traveled > CLICK_THRESHOLD_PX) resize = { ...resize, moved: true };
    // Live, and nothing else: no settle, no clipping. That is what lets a drag
    // tighter than the arrangement fits leave balls overlapping the wall
    // instead of being clipped away, and what makes a drag larger a guaranteed
    // no-op on the balls --- this path never touches session.balls at all.
    const world = screenToWorld(view, x, y);
    const side = Math.min(maxSide, Math.max(MIN_SIDE, 2 * Math.max(Math.abs(world.x), Math.abs(world.y))));
    session = { ...session, side };
    draw();
  }

  function handleUp(): void {
    if (!resize) return;
    if (!resize.moved) {
      // A click: work out exactly where compacting (or de-compacting, if the
      // balls it contains do not currently fit) lands, then let step() play
      // that out at the same MAX_STEP everything else obeys.
      const result = compact(session.balls, session.side);
      closing = { target: result.side, finalBalls: result.balls, contained: result.contained };
    }
    resize = null;
    draw();
  }

  const onDown = (event: PointerEvent) => {
    // Stops the browser starting a native drag or a text selection on what is,
    // to it, a plain div — either of which swallows the pointermove stream and
    // leaves a drag dead halfway through.
    event.preventDefault();
    if (container.setPointerCapture) container.setPointerCapture(event.pointerId);
    pointerDown(event.clientX, event.clientY);
  };
  const onHandleDown = (event: PointerEvent) => {
    // Stopped before it reaches the container: the handle is its own control,
    // never also a ball grab or a background bump on the same gesture.
    event.preventDefault();
    event.stopPropagation();
    if (container.setPointerCapture) container.setPointerCapture(event.pointerId);
    handleDown(event.clientX, event.clientY);
  };
  const onMove = (event: PointerEvent) => {
    if (resize) handleMove(event.clientX, event.clientY);
    else pointerMove(event.clientX, event.clientY);
  };
  const onUp = () => {
    if (resize) handleUp();
    else pointerUp();
  };
  const onAdvance = (event: Event) => {
    event.preventDefault();
    if (canAdvance()) advanceLevel();
  };

  // Move and release listen on the window, not the surface: a drag that leaves
  // the element, or one the browser never gave us pointer capture for, still
  // has to keep tracking and still has to end.
  const view_ = container.ownerDocument.defaultView ?? window;
  container.addEventListener("pointerdown", onDown);
  surface.handle.addEventListener("pointerdown", onHandleDown);
  view_.addEventListener("pointermove", onMove);
  view_.addEventListener("pointerup", onUp);
  view_.addEventListener("pointercancel", onUp);
  container.addEventListener("dragstart", preventNativeDrag);
  chrome.advance.addEventListener("click", onAdvance);

  refreshView();
  draw();

  return {
    step,
    pointerDown,
    pointerMove,
    pointerUp,
    handleDown,
    handleMove,
    handleUp,
    get session() {
      return session;
    },
    get view() {
      return view;
    },
    destroy() {
      container.removeEventListener("pointerdown", onDown);
      surface.handle.removeEventListener("pointerdown", onHandleDown);
      view_.removeEventListener("pointermove", onMove);
      view_.removeEventListener("pointerup", onUp);
      view_.removeEventListener("pointercancel", onUp);
      container.removeEventListener("dragstart", preventNativeDrag);
      chrome.advance.removeEventListener("click", onAdvance);
      container.replaceChildren();
      chrome.levels.replaceChildren();
      chrome.advance.hidden = true;
      chrome.finish.textContent = "";
    },
  };
}

function preventNativeDrag(event: Event): void {
  event.preventDefault();
}
