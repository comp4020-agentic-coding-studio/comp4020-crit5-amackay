import { BALL_RADIUS, type Ball, type Side } from "./types";

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
 * Clear space kept outside the box on the shorter screen axis, in ball radii.
 * A ball pushed over a wall rests one radius past the line and occupies one
 * more, so anything under 2 would let the box expel a ball off screen. The
 * extra half is so a ball out there does not sit flush against the edge.
 */
export const VIEW_MARGIN = 2.5;

/**
 * Fit a box of the given side into a surface of the given pixel size.
 *
 * The box is centred on the world origin and the origin sits at the centre of
 * the surface, so this is one scale factor and nothing else.
 */
export function fitView(side: Side, widthPx: number, heightPx: number): ViewTransform {
  const usableWidth = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : 0;
  const usableHeight = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : 0;
  const shorter = Math.min(usableWidth, usableHeight);
  const framed = side + 2 * VIEW_MARGIN;
  const scale = shorter > 0 && framed > 0 ? shorter / framed : FALLBACK_SCALE;
  return {
    originX: usableWidth / 2,
    originY: usableHeight / 2,
    scale,
  };
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
 * Half-extents of the visible area in world units, inset by a ball radius so a
 * ball resting on the bound is fully on screen.
 *
 * Returns null when the surface has not been laid out. A zero-sized surface
 * would otherwise yield bounds of zero and clamp every ball onto the origin —
 * which is exactly what jsdom reports, so this is the difference between the
 * rules being testable and every test collapsing the arrangement to a point.
 */
export function viewBounds(
  view: ViewTransform,
  widthPx: number,
  heightPx: number,
): { x: number; y: number } | null {
  if (!(widthPx > 0) || !(heightPx > 0) || !(view.scale > 0)) return null;
  return {
    x: Math.max(0, widthPx / (2 * view.scale) - BALL_RADIUS),
    y: Math.max(0, heightPx / (2 * view.scale) - BALL_RADIUS),
  };
}
