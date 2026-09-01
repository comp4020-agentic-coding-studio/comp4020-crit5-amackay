import { compact } from "../game/compact";
import { openSide } from "../game/session";
import { CONTACT_DISTANCE, type Ball, type Side } from "../game/types";

// Fixed arrangements for the pictures the repo ships: the share card and the
// tab icon. Not part of the game --- nothing here is reachable from play ---
// but built out of the game's own rules, so a change to how balls settle moves
// the pictures too rather than leaving them describing an older model.
//
// A still is seeded as a regular ring and then compacted. The ring is only a
// starting configuration, chosen because it takes one number to specify; what
// gets drawn is whatever the compaction derives from it, which for a ring of
// more than three is not a ring any more.

export interface Still {
  balls: Ball[];
  side: Side;
}

/**
 * N ball centres on a circle, with one of them at `firstAngle` and adjacent
 * centres exactly touching. Angles run anticlockwise in world space, where y
 * is up, so pi/4 puts a ball up and to the right.
 */
export function ring(n: number, firstAngle: number): Ball[] {
  const step = (2 * Math.PI) / n;
  // The chord between neighbours is 2 * R * sin(step / 2); setting that equal
  // to a contact gives the radius, so no two seeded balls overlap.
  const radius = CONTACT_DISTANCE / (2 * Math.sin(step / 2));
  return Array.from({ length: n }, (_, i) => {
    const angle = firstAngle + i * step;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

/** A ring of n, closed down as far as it goes. Deterministic, like compact(). */
export function still(n: number): Still {
  const { balls, side } = compact(ring(n, Math.PI / 4), openSide(n));
  return { balls, side };
}

/** Five balls, seeded as a pentagon: the share card. */
export const CARD_BALLS = 5;

/** Three balls, seeded as a triangle: the tab icon. */
export const ICON_BALLS = 3;
