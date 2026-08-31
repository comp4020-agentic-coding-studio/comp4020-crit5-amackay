// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createGame, type Game } from "./mount";
import { advance, newSession, record } from "../game/session";
import { worldToScreen } from "../game/view";
import type { Ball } from "../game/types";

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

function mount(balls?: Ball[]): Game {
  const session = balls
    ? { ...newSession(balls.length), balls, side: ROOMY_SIDE }
    : undefined;
  return createGame(container, { session, size: SIZE });
}

/** Where on screen a world point currently sits. */
function at(game: Game, point: Ball): { x: number; y: number } {
  return worldToScreen(game.view, point);
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

    // Now that it has landed, a wall can move it like any other ball.
    const walled = mount([{ x: 0, y: 0 }]);
    const grab = at(walled, { x: 0, y: 0 });
    walled.pointerDown(grab.x, grab.y);
    walled.pointerMove(at(walled, { x: 19.5, y: 0 }).x, at(walled, { x: 19.5, y: 0 }).y);
    walled.pointerUp();
    settleFrames(walled);
    expect(walled.session.balls[0]!.x).toBeCloseTo(ROOMY_SIDE / 2 - 1, 3);
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
