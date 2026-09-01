// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGame, type Game } from "./mount";
import { advance, bestAt, newSession, openSide, record } from "../game/session";
import { optimum } from "../game/optima";
import { play, playTo } from "../game/progress.test-helper";
import { fitsNow } from "../game/compact";
import { fitView, VIEW_MARGIN, worldToScreen } from "../game/view";
import { WALL_WIDTH, type Ball } from "../game/types";

// jsdom has no layout, so the surface is given its size explicitly rather than
// measured. Everything below drives the game through screen pixels, the same
// path a real pointer takes.
const SIZE = { width: 800, height: 600 };

let container: HTMLElement;

beforeEach(() => {
  document.body.replaceChildren();
  container = document.createElement("div");
  document.body.append(container);
});

/**
 * Deliberately far bigger than any arrangement here needs. These tests are
 * about what the pointer does, and a box tight enough for the walls to join in
 * would leave every assertion answering two questions at once. Walls have their
 * own tests, in settle.test.ts.
 */
const ROOMY_SIDE = 40;

/**
 * The view is fit to the level's own opening side, not the live one (that is
 * the point of this milestone's fix), so a fabricated `side` far past its
 * level's opening size draws a box the view cannot show all of. Fine for
 * these tests: the balls above sit within a couple of radii of the origin,
 * nowhere near ROOMY_SIDE's own wall, so nothing here needs it in frame.
 */
function mount(balls?: Ball[], side = ROOMY_SIDE): Game {
  const session = balls ? { ...newSession(balls.length), balls, side } : undefined;
  return createGame(container, { session, size: SIZE });
}

/** Where on screen a world point currently sits. */
function at(game: Game, point: Ball): { x: number; y: number } {
  return worldToScreen(game.view, point);
}

/** Where on screen the handle sits right now, at the box's outer corner. */
function handleAt(game: Game): { x: number; y: number } {
  const h = game.session.side / 2 + WALL_WIDTH;
  return at(game, { x: h, y: -h });
}

function settleFrames(game: Game, frames = 200): void {
  for (let i = 0; i < frames; i++) game.step();
}

describe("mounting", () => {
  it("renders one element per ball, and a box", () => {
    const game = mount([
      { x: -2, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 2 },
    ]);
    expect(container.querySelectorAll(".ball")).toHaveLength(3);
    expect(container.querySelectorAll(".box")).toHaveLength(1);
    expect(container.querySelectorAll(".handle")).toHaveLength(1);
    game.destroy();
  });

  it("follows the ball count across a level change", () => {
    const game = mount();
    expect(container.querySelectorAll(".ball")).toHaveLength(1);
    const next = advance(record(newSession(), 2, newSession().balls));
    const second = createGame(container, { session: next, size: SIZE });
    expect(container.querySelectorAll(".ball")).toHaveLength(2);
    game.destroy();
    second.destroy();
  });

  it("writes a finite position for every ball", () => {
    // The NaN this guards against would render nothing and throw nothing.
    const game = mount([{ x: 1, y: -1 }]);
    game.step();
    const transform = container.querySelector<HTMLElement>(".ball")!.style.transform;
    expect(transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\)$/);
    game.destroy();
  });
});

describe("dragging a ball", () => {
  it("carries the grabbed ball to where the pointer is released", () => {
    const game = mount([
      { x: -3, y: 0 },
      { x: 3, y: 0 },
    ]);
    const from = at(game, { x: -3, y: 0 });
    const to = at(game, { x: -1, y: 2 });

    game.pointerDown(from.x, from.y);
    game.pointerMove(to.x, to.y);
    game.step();
    game.pointerUp();

    expect(game.session.balls[0]!.x).toBeCloseTo(-1, 6);
    expect(game.session.balls[0]!.y).toBeCloseTo(2, 6);
    game.destroy();
  });

  it("carries a ball over its neighbours without disturbing them", () => {
    // The arrangement the player has built must survive a ball being moved
    // across it: nothing is shoved until the ball is released.
    const game = mount([
      { x: -3, y: 0 },
      { x: 3, y: 0 },
    ]);
    const from = at(game, { x: -3, y: 0 });
    const onto = at(game, { x: 3, y: 0 });

    game.pointerDown(from.x, from.y);
    game.pointerMove(onto.x, onto.y);
    settleFrames(game, 30);

    expect(game.session.balls[0]!.x).toBeCloseTo(3, 6);
    expect(game.session.balls[1]).toEqual({ x: 3, y: 0 });
    game.destroy();
  });

  it("keeps the released ball put and shoves the neighbour off it", () => {
    // The dropped ball's position in plan is what the player chose; it is the
    // arrangement that has to make room, not the drop that gets nudged off
    // target.
    const game = mount([
      { x: -3, y: 0 },
      { x: 3, y: 0 },
    ]);
    const from = at(game, { x: -3, y: 0 });
    const onto = at(game, { x: 3, y: 0 });

    game.pointerDown(from.x, from.y);
    game.pointerMove(onto.x, onto.y);
    game.pointerUp();
    settleFrames(game);

    const [a, b] = game.session.balls as [Ball, Ball];
    // Not exact, and it cannot be: the descent ends when the ball lands, not
    // when the arrangement has finished getting out of the way, so whatever
    // overlap the last airborne frame left over is shared between the pair the
    // moment the ball rejoins them. How much that is depends on the frame rate,
    // so a precision is the wrong thing to assert.
    //
    // A hundredth of a radius is the bar instead, because that is below what
    // anyone can see: at the zoom a level-3 box is drawn at, it is under one
    // pixel. What matters is that the ball is where it was dropped rather than
    // shunted off it.
    const INVISIBLE = 0.01;
    expect(Math.hypot(a.x - 3, a.y - 0)).toBeLessThan(INVISIBLE);
    // Which way the neighbour goes is not a fact about the game: dropped
    // exactly on top of it, the separation direction comes from the seeded
    // jitter. That it moved a long way, and that they end up touching, is.
    expect(Math.hypot(b.x - 3, b.y)).toBeGreaterThan(1.5);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 - 1e-3);
    game.destroy();
  });

  it("lands a falling ball the moment another is picked up", () => {
    // Only ever one ball is off the plane, so a grab has to resolve a fall that
    // is still in progress. It lands where it had got to rather than staying
    // airborne with nothing tracking its height.
    const game = mount([
      { x: -3, y: 0 },
      { x: 3, y: 0 },
      { x: 9, y: 0 },
    ]);
    const from = at(game, { x: -3, y: 0 });
    const onto = at(game, { x: 3, y: 0 });
    game.pointerDown(from.x, from.y);
    game.pointerMove(onto.x, onto.y);
    game.pointerUp();
    game.step(); // mid-fall, nowhere near landed

    game.pointerDown(at(game, { x: 9, y: 0 }).x, at(game, { x: 9, y: 0 }).y);
    game.pointerMove(at(game, { x: 9, y: 4 }).x, at(game, { x: 9, y: 4 }).y);
    game.pointerUp();
    settleFrames(game);

    // The interrupted ball is an ordinary member again: it has been let go of
    // by the fall, so its neighbour has finished pushing it clear.
    const [a, b] = game.session.balls as [Ball, Ball];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 - 1e-3);
    game.destroy();
  });

  it("carries a ball by the point it was grabbed by", () => {
    // Grabbing the edge of a ball and snapping its centre to the pointer makes
    // every pick-up start with a jump.
    const game = mount([{ x: 0, y: 0 }]);
    const edge = at(game, { x: 0.8, y: 0 });
    const to = at(game, { x: 4.8, y: 2 });

    game.pointerDown(edge.x, edge.y);
    game.pointerMove(to.x, to.y);
    game.step();

    // Moved by the pointer's displacement, not to the pointer.
    expect(game.session.balls[0]!.x).toBeCloseTo(4, 6);
    expect(game.session.balls[0]!.y).toBeCloseTo(2, 6);
    game.destroy();
  });

  it("releases a descending ball once its neighbours have made room", () => {
    // The descent is self-terminating: no clock, and afterwards the ball is an
    // ordinary member of the arrangement again.
    const game = mount([
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
    ]);
    const from = at(game, { x: 0, y: 0 });
    game.pointerDown(from.x, from.y);
    game.pointerUp();
    settleFrames(game);

    const [a, b] = game.session.balls as [Ball, Ball];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(2, 3);

    // Now that it has landed, a wall can move it like any other ball. Its own
    // level's opening side, not ROOMY_SIDE: the view only frames as far as
    // openSide(level), so a push has to stay inside that to reach the wall
    // rather than be caught by the screen-edge clamp first.
    const wallSide = openSide(1);
    const walled = mount([{ x: 0, y: 0 }], wallSide);
    const grab = at(walled, { x: 0, y: 0 });
    const push = at(walled, { x: wallSide / 2 - 0.5, y: 0 });
    walled.pointerDown(grab.x, grab.y);
    walled.pointerMove(push.x, push.y);
    walled.pointerUp();
    settleFrames(walled);
    expect(walled.session.balls[0]!.x).toBeCloseTo(wallSide / 2 - 1, 3);
    game.destroy();
    walled.destroy();
  });
});

describe("dragging the background", () => {
  it("bumps balls aside without picking one up", () => {
    const game = mount([{ x: 2, y: 0 }]);
    const empty = at(game, { x: -4, y: 0 });
    const into = at(game, { x: 1.2, y: 0 });

    game.pointerDown(empty.x, empty.y);
    game.pointerMove(into.x, into.y);
    settleFrames(game, 60);

    // Shoved outward, not teleported to the pointer.
    expect(game.session.balls[0]!.x).toBeGreaterThan(2);
    game.destroy();
  });

  it("never lets the pointer end up inside a ball, however fast it moves", () => {
    // The reason the fingertip is a constraint and not a force: a pointer
    // crosses the box far faster than a capped ball can travel, so as a force
    // it is simply outrun — the ball sinks into it and pops out behind. Swept
    // across a row in four big jumps, which is what a flick of the wrist looks
    // like at 60fps.
    const game = mount([
      { x: -2, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    for (const x of [-6, -2, 1, 4, 8]) {
      const p = at(game, { x, y: 0 });
      if (x === -6) game.pointerDown(p.x, p.y);
      else game.pointerMove(p.x, p.y);
      game.step();
      for (let i = 0; i < game.session.balls.length; i++) {
        const ball = game.session.balls[i]!;
        expect(Math.hypot(ball.x - x, ball.y), `ball ${i} at pointer x = ${x}`)
          .toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
    game.pointerUp();
    game.destroy();
  });
});

describe("the handle", () => {
  it("a click compacts and records a size", () => {
    // One ball in a box bigger than it needs, but nowhere near ROOMY_SIDE:
    // closing is now paced at MAX_STEP, so a starting side chosen for other
    // tests' clearance would take thousands of frames to arrive.
    const game = mount([{ x: 0, y: 0 }], 10);
    const before = game.session.side;
    const handle = handleAt(game);

    game.handleDown(handle.x, handle.y);
    game.handleUp();
    // The close plays out over several frames, capped at the same MAX_STEP as
    // everything else --- not one instantaneous jump.
    settleFrames(game);

    expect(game.session.side).toBeLessThan(before);
    expect(bestAt(game.session, 1)).toBeDefined();
    game.destroy();
  });

  it("closes the box gradually, never in a single step", () => {
    const game = mount([{ x: 0, y: 0 }]);
    const before = game.session.side;
    const handle = handleAt(game);

    game.handleDown(handle.x, handle.y);
    game.handleUp();
    game.step();

    expect(game.session.side).toBeLessThan(before);
    expect(game.session.side).toBeGreaterThan(2);
    game.destroy();
  });

  it("a drag to a smaller side leaves balls overlapping the wall rather than clipping them", () => {
    const game = mount([
      { x: -3, y: 0 },
      { x: 3, y: 0 },
    ]);
    const before = game.session.balls.map((b) => ({ ...b }));
    const handle = handleAt(game);
    // Nowhere near either ball's own screen position, so this is squarely a
    // handle drag rather than something a hit-test on a ball could confuse it
    // with.
    const tighter = at(game, { x: 0.5, y: -0.5 });

    game.handleDown(handle.x, handle.y);
    game.handleMove(tighter.x, tighter.y);

    expect(game.session.side).toBeLessThan(ROOMY_SIDE);
    expect(fitsNow(game.session.balls, game.session.side)).toBe(false);
    // Not clipped, not moved: the balls are exactly where they were.
    expect(game.session.balls).toEqual(before);

    game.handleUp();
    // A drag, not a click: releasing it does not compact or record.
    expect(bestAt(game.session, 2)).toBeUndefined();
    game.destroy();
  });

  it("a drag larger never moves a ball", () => {
    const game = mount([{ x: 0, y: 0 }], 5);
    const before = game.session.balls.map((b) => ({ ...b }));
    const beforeSide = game.session.side;
    const handle = handleAt(game);
    const looser = at(game, { x: 4, y: -4 });

    game.handleDown(handle.x, handle.y);
    game.handleMove(looser.x, looser.y);

    expect(game.session.side).toBeGreaterThan(beforeSide);
    expect(game.session.balls).toEqual(before);
    game.destroy();
  });

  it("a drag cannot grow the box past what the view can show", () => {
    // The view is fit to the level's opening side plus its own margin, so
    // that framed extent — minus the walls, which stand outside `side` — is
    // exactly the largest side a drag may reach without pushing the box, and
    // the handle sitting on its corner, off screen.
    const game = mount([{ x: 0, y: 0 }], 5);
    const maxSide = openSide(1) + 2 * VIEW_MARGIN - 2 * WALL_WIDTH;
    const handle = handleAt(game);
    const farOff = at(game, { x: 1000, y: -1000 });

    game.handleDown(handle.x, handle.y);
    game.handleMove(farOff.x, farOff.y);

    expect(game.session.side).toBeCloseTo(maxSide, 5);
    game.destroy();
  });

  it("a click de-compacts a drag left too tight to fit", () => {
    const game = mount([
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ], 10);
    const handle = handleAt(game);
    const tooTight = at(game, { x: 0.6, y: -0.6 });

    game.handleDown(handle.x, handle.y);
    game.handleMove(tooTight.x, tooTight.y);
    expect(fitsNow(game.session.balls, game.session.side)).toBe(false);
    const dragged = game.session.side;
    game.handleUp();
    // The drag's own release does not compact or de-compact; a click does.
    game.handleDown(handle.x, handle.y);
    game.handleUp();
    settleFrames(game);

    expect(game.session.side).toBeGreaterThan(dragged);
    expect(fitsNow(game.session.balls, game.session.side)).toBe(true);
    expect(bestAt(game.session, 2)).toBeDefined();
    game.destroy();
  });

  it("a click ignores a ball left outside the box, and still closes around the rest", () => {
    const game = mount([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ], 10);
    const handle = handleAt(game);
    // Drag the second ball out past where the box is about to close to; the
    // first is left to be the "rest" compacting still has to close around.
    const origin = at(game, { x: 3, y: 0 });
    const outside = at(game, { x: 8, y: 8 });
    game.pointerDown(origin.x, origin.y);
    game.pointerMove(outside.x, outside.y);
    game.pointerUp();
    settleFrames(game);
    const strandedBall = game.session.balls[1]!;

    game.handleDown(handle.x, handle.y);
    game.handleUp();
    settleFrames(game);

    // The stray ball never moved, and closing was not blocked by it.
    expect(game.session.balls[1]).toEqual(strandedBall);
    expect(game.session.side).toBeLessThan(10);
    // No ball is actually inside, so nothing is worth recording yet.
    expect(bestAt(game.session, 2)).toBeUndefined();
    game.destroy();
  });
});

describe("level select and advancing", () => {
  /** A session sitting on a beaten frontier level, N balls carried in. */
  function beatenAt(level: number): Game {
    // A genuinely beaten level: the arrangement has to fit the box, not just
    // be listed in `bests`, before the game will offer the way onward.
    const session = play(playTo(level));
    return createGame(container, { session, size: SIZE });
  }

  it("shows one nav row per level reached and none beyond", () => {
    const game = createGame(container, { session: newSession(4), size: SIZE });
    game.step();
    expect(document.querySelectorAll("#levels a.level")).toHaveLength(4);
    game.destroy();
  });

  it("advances past a beaten frontier level, then re-enters an earlier one from the nav", () => {
    const game = beatenAt(1);
    document.querySelector<HTMLButtonElement>("button.advance")!.click();
    settleFrames(game);
    expect(game.session.level).toBe(2);
    expect(game.session.balls).toHaveLength(2);

    document.querySelectorAll<HTMLElement>("#levels a.level")[0]!.click();
    expect(game.session.level).toBe(1);
    game.destroy();
  });

  it("eases the view to the new level's fit over several frames, not in one jump", () => {
    const game = beatenAt(1);
    const startScale = game.view.scale;
    const target = fitView(openSide(2), SIZE.width, SIZE.height).scale;
    expect(target).not.toBeCloseTo(startScale, 2);

    document.querySelector<HTMLButtonElement>("button.advance")!.click();
    expect(game.view.scale).toBeCloseTo(startScale, 6); // nothing has moved yet

    game.step();
    const afterOne = game.view.scale;
    expect(afterOne).not.toBeCloseTo(startScale, 6);
    expect(afterOne).not.toBeCloseTo(target, 6); // still mid-zoom

    settleFrames(game, 40);
    expect(game.view.scale).toBeCloseTo(target, 6);
    game.destroy();
  });

  it("holds the arrived ball at carry height through the zoom, then drops it", () => {
    const game = beatenAt(1);
    const heightOf = (i: number) =>
      Number(container.querySelectorAll<HTMLElement>(".ball")[i]!.style.getPropertyValue("--h"));

    document.querySelector<HTMLButtonElement>("button.advance")!.click();
    expect(game.session.balls).toHaveLength(2);
    expect(heightOf(1)).toBe(1); // arrived, held

    for (let i = 0; i < 10; i++) game.step(); // still inside the zoom
    expect(heightOf(1)).toBe(1);

    settleFrames(game); // zoom ends, ball drops, no wall-clock time involved
    expect(heightOf(1)).toBe(0);
    const target = fitView(openSide(2), SIZE.width, SIZE.height).scale;
    expect(game.view.scale).toBeCloseTo(target, 6);
    game.destroy();
  });

  it("runs the whole advance --- zoom and drop --- the same way every time", () => {
    const play = () => {
      const game = beatenAt(1);
      document.querySelector<HTMLButtonElement>("button.advance")!.click();
      settleFrames(game);
      const balls = game.session.balls.map((b) => ({ ...b }));
      game.destroy();
      return balls;
    };
    expect(play()).toEqual(play());
  });

  it("runs the zoom the same way every time", () => {
    const play = () => {
      const game = beatenAt(1);
      document.querySelector<HTMLButtonElement>("button.advance")!.click();
      const scales: number[] = [];
      for (let i = 0; i < 20; i++) {
        game.step();
        scales.push(game.view.scale);
      }
      game.destroy();
      return scales;
    };
    expect(play()).toEqual(play());
  });

  it("offers the button wherever the box counts, frontier or not", () => {
    const button = () => document.querySelector<HTMLButtonElement>("button.advance")!;
    const fresh = createGame(container, { session: newSession(2), size: SIZE });
    fresh.step();
    expect(button().hidden).toBe(true); // open box, nothing beaten yet
    fresh.destroy();

    const won = beatenAt(3);
    won.step();
    expect(button().hidden).toBe(false);

    // Back to level 2 from the nav: already beaten, so the way onward is still
    // offered --- picking an earlier level up is not starting it again.
    document.querySelectorAll<HTMLElement>("#levels a.level")[1]!.click();
    expect(won.session.level).toBe(2);
    expect(button().hidden).toBe(false);

    // Level one is the exception: it hands back the opening state, so it has
    // to be beaten again. This is what lets the device be handed to someone
    // else without the save being thrown away.
    document.querySelectorAll<HTMLElement>("#levels a.level")[0]!.click();
    expect(won.session.level).toBe(1);
    expect(button().hidden).toBe(true);
    won.destroy();
  });
});

describe("persisting the session", () => {
  it("commits after a completing compact", () => {
    const onCommit = vi.fn();
    const game = createGame(container, {
      session: { ...newSession(1), balls: [{ x: 0, y: 0 }], side: 6 },
      size: SIZE,
      onCommit,
    });
    const h = game.session.side / 2 + WALL_WIDTH;
    const handle = worldToScreen(game.view, { x: h, y: -h });
    game.handleDown(handle.x, handle.y);
    game.handleUp();
    settleFrames(game);
    expect(onCommit).toHaveBeenCalled();
    expect(bestAt(onCommit.mock.lastCall![0], 1)).toBeDefined();
    game.destroy();
  });

  it("commits on a level change", () => {
    const onCommit = vi.fn();
    let session = newSession(1);
    session = record(session, optimum(1), session.balls);
    const game = createGame(container, { session, size: SIZE, onCommit });
    onCommit.mockClear();
    document.querySelector<HTMLButtonElement>("button.advance")!.click();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.lastCall![0].level).toBe(2);
    game.destroy();
  });

  it("does not commit a frame that changed nothing", () => {
    const onCommit = vi.fn();
    const game = createGame(container, {
      session: { ...newSession(1), balls: [{ x: 0, y: 0 }], side: 6 },
      size: SIZE,
      onCommit,
    });
    settleFrames(game, 5);
    onCommit.mockClear();
    settleFrames(game, 20);
    expect(onCommit).not.toHaveBeenCalled();
    game.destroy();
  });
});

describe("real pointer events", () => {
  it("reaches the game through a dispatched pointerdown", () => {
    // The listener path the spec test greps for, exercised rather than assumed.
    const game = mount([{ x: 0, y: 0 }]);
    const origin = at(game, { x: 0, y: 0 });
    const target = at(game, { x: 2, y: 1 });

    container.dispatchEvent(pointer("pointerdown", origin.x, origin.y));
    container.dispatchEvent(pointer("pointermove", target.x, target.y));
    game.step();
    container.dispatchEvent(pointer("pointerup", target.x, target.y));

    expect(game.session.balls[0]!.x).toBeCloseTo(2, 6);
    expect(game.session.balls[0]!.y).toBeCloseTo(1, 6);
    game.destroy();
  });

  it("stops listening once destroyed", () => {
    const game = mount([{ x: 0, y: 0 }]);
    const origin = at(game, { x: 0, y: 0 });
    game.destroy();
    container.dispatchEvent(pointer("pointerdown", origin.x, origin.y));
    expect(game.session.balls[0]).toEqual({ x: 0, y: 0 });
  });
});

describe("the frame loop", () => {
  it("advances only when stepped", () => {
    // rAF does not tick under jsdom, and nothing in the rules may depend on it.
    const game = mount([
      { x: -0.4, y: 0 },
      { x: 0.4, y: 0 },
    ]);
    const before = game.session.balls.map((b) => ({ ...b }));
    expect(game.session.balls).toEqual(before);
    game.step();
    expect(game.session.balls).not.toEqual(before);
    game.destroy();
  });

  it("runs the same way every time", () => {
    // The loop takes a frame as a tick rather than a duration, so there is no
    // delta left for a machine to vary — what used to be a frame-rate property
    // is now plain determinism, and it is the stronger of the two. Two games
    // given the same input must agree to the last bit, drop and all.
    const start: Ball[] = [
      { x: -0.4, y: 0.1 },
      { x: 0.4, y: -0.1 },
      { x: 0, y: 0.5 },
    ];
    const play = () => {
      const game = mount(start.map((b) => ({ ...b })));
      const from = at(game, start[2]!);
      const onto = at(game, { x: 0.2, y: -0.2 });
      game.pointerDown(from.x, from.y);
      game.pointerMove(onto.x, onto.y);
      game.pointerUp();
      settleFrames(game);
      const balls = game.session.balls.map((b) => ({ ...b }));
      game.destroy();
      return balls;
    };
    expect(play()).toEqual(play());
  });
});

/** jsdom has no PointerEvent; a MouseEvent carries everything mount.ts reads. */
function pointer(type: string, x: number, y: number): MouseEvent {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}
