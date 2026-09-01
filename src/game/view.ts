import { BALL_RADIUS, WALL_WIDTH, type Ball, type Side } from "./types";

// The world <-> screen mapping. Pure: the one getBoundingClientRect call lives
// at the edge and its result is passed in here, so a test can supply its own
// transform and drive a drag with no layout at all.

export interface ViewTransform {
  /** Screen pixel position of the world origin. */
  originX: number;
  originY: number;
  /** Screen pixels per ball radius. */
  scale: number;
}

/**
 * Fallback scale for when the surface has not been laid out. jsdom reports
 * every element as zero-sized, and a scale of 0 would put a division by zero in
 * every screenToWorld call and propagate NaN silently through the rules.
 */
export const FALLBACK_SCALE = 10;

/**
 * Clear space kept outside the *naive* box on the shorter screen axis, in ball
 * radii, measured from that box's inner face. The view is fitted to the naive
 * grid --- the square the level asks you to beat --- so the frame is a fixed
 * `par(N) + 2 * VIEW_MARGIN` whatever the box on screen is currently doing.
 *
 * At 1.5 the box at `maxSideIn` has its outer wall faces exactly on the frame's
 * edge, which is what makes that the widest the handle may drag to. It is not
 * enough room for a ball shed over a wall to come to rest outside it --- that
 * needs `WALL_WIDTH + 2`, and it was what the old 2.5 bought. Given up
 * deliberately: the frame was three times the box it contained, and a ball held
 * against the frame edge overlapping the wall is a better failure than a ball
 * lost on the carpet with nothing saying so.
 */
export const VIEW_MARGIN = 1.5;

/** A surface's pixel size. */
export interface Extent {
  width: number;
  height: number;
}

/** The square the view frames for a level whose naive grid is `naive` radii. */
export function framedSize(naive: Side): Side {
  return naive + 2 * VIEW_MARGIN;
}

/**
 * The widest the box may be drawn in that frame: the side at which its outer
 * wall faces land exactly on the frame's edge. A UI clamp on the handle rather
 * than a rule --- nothing in here needs a side to stay under it.
 */
export function maxSideIn(naive: Side): Side {
  return framedSize(naive) - 2 * WALL_WIDTH;
}

/**
 * Fit the frame for a naive box of the given side into `play`, and put the
 * world origin at the centre of `stage`.
 *
 * The two are separate because the play space is the stage inset by the chrome
 * bars: the scale has to come from the room actually left for the game, while
 * the origin stays the centre of the surface the balls are drawn on. The bars
 * are equal top and bottom and the horizontal inset is symmetric, so in
 * practice the two centres coincide --- but that is a fact about the layout,
 * not something this function should assume.
 */
export function fitView(naive: Side, play: Extent, stage: Extent = play): ViewTransform {
  const playWidth = usable(play.width);
  const playHeight = usable(play.height);
  const shorter = Math.min(playWidth, playHeight);
  const framed = framedSize(naive);
  const scale = shorter > 0 && framed > 0 ? shorter / framed : FALLBACK_SCALE;
  return {
    originX: usable(stage.width) / 2,
    originY: usable(stage.height) / 2,
    scale,
  };
}

function usable(px: number): number {
  return Number.isFinite(px) && px > 0 ? px : 0;
}

/** Screen y grows downward; world y grows upward. */
export function worldToScreen(view: ViewTransform, point: Ball): { x: number; y: number } {
  return {
    x: view.originX + point.x * view.scale,
    y: view.originY - point.y * view.scale,
  };
}

export function screenToWorld(view: ViewTransform, x: number, y: number): Ball {
  return {
    x: (x - view.originX) / view.scale,
    y: (view.originY - y) / view.scale,
  };
}

/**
 * The ball under a world point, or null. Hit testing is done in world space
 * against the ball's own radius — never with elementFromPoint, which needs a
 * layout, and never against a rendered element's box.
 */
export function ballAt(balls: readonly Ball[], point: Ball): number | null {
  let closest: number | null = null;
  let closestDistance = BALL_RADIUS;
  for (let i = 0; i < balls.length; i++) {
    const distance = Math.hypot(balls[i]!.x - point.x, balls[i]!.y - point.y);
    if (distance <= closestDistance) {
      closest = i;
      closestDistance = distance;
    }
  }
  return closest;
}

/**
 * Half-extents of the play area in world units, inset by a ball radius so a
 * ball resting on the bound is fully inside it.
 *
 * The play area, not the whole surface: the chrome bars are the game's own
 * edges now, so a ball is held between them rather than sliding under them.
 *
 * Returns null when the surface has not been laid out. A zero-sized surface
 * would otherwise yield bounds of zero and clamp every ball onto the origin —
 * which is exactly what jsdom reports, so this is the difference between the
 * rules being testable and every test collapsing the arrangement to a point.
 */
export function viewBounds(
  view: ViewTransform,
  play: Extent,
): { x: number; y: number } | null {
  if (!(play.width > 0) || !(play.height > 0) || !(view.scale > 0)) return null;
  return {
    x: Math.max(0, play.width / (2 * view.scale) - BALL_RADIUS),
    y: Math.max(0, play.height / (2 * view.scale) - BALL_RADIUS),
  };
}
