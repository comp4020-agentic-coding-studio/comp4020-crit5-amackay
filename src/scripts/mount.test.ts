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
  for (let i = 0; i < frames; i++) game.step(1 / 60);
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
    game.step(1 / 60);
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
    game.step(1 / 60);
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

  it("settles the neighbours apart once the ball is let go", () => {
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
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 - 1e-3);
    game.destroy();
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
});

describe("real pointer events", () => {
  it("reaches the game through a dispatched pointerdown", () => {
    // The listener path the spec test greps for, exercised rather than assumed.
    const game = mount([{ x: 0, y: 0 }]);
    const origin = at(game, { x: 0, y: 0 });
    const target = at(game, { x: 2, y: 1 });

    container.dispatchEvent(pointer("pointerdown", origin.x, origin.y));
    container.dispatchEvent(pointer("pointermove", target.x, target.y));
    game.step(1 / 60);
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
    game.step(1 / 60);
    expect(game.session.balls).not.toEqual(before);
    game.destroy();
  });

  it("reaches the same arrangement whatever the delta was", () => {
    // Settling is a fixed number of passes a frame, so no score can depend on
    // the frame rate.
    const start: Ball[] = [
      { x: -0.4, y: 0.1 },
      { x: 0.4, y: -0.1 },
      { x: 0, y: 0.5 },
    ];
    const slow = mount(start.map((b) => ({ ...b })));
    const fast = mount(start.map((b) => ({ ...b })));
    for (let i = 0; i < 50; i++) slow.step(1 / 10);
    for (let i = 0; i < 50; i++) fast.step(1 / 240);
    expect(slow.session.balls).toEqual(fast.session.balls);
    slow.destroy();
    fast.destroy();
  });
});

/** jsdom has no PointerEvent; a MouseEvent carries everything mount.ts reads. */
function pointer(type: string, x: number, y: number): MouseEvent {
  const event = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}
