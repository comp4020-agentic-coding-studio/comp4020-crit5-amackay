import { createSurface, render } from "./render";
import { still } from "./still";
import { WALL_WIDTH } from "../game/types";

// Draws one still into #stage, for the two pages the share card and the tab
// icon are shot from. It reads its arrangement and its framing off the stage's
// data attributes, so the pages themselves carry no drawing code.
//
// The view is built here rather than by fitView(), whose VIEW_MARGIN is 2.5
// radii of clearance for a ball shed over a wall --- room the game needs and a
// picture does not. A still has nothing outside the box, so it frames the box
// and its walls and stops.

const stage = document.querySelector<HTMLElement>("#stage");

if (stage) {
  const n = Number(stage.dataset.n);
  const margin = Number(stage.dataset.margin);
  const { balls, side } = still(n);

  const surface = createSurface(stage);
  // The handle is the game's one control, and neither picture is of a game in
  // progress. Removed rather than hidden from the page's stylesheet: Astro
  // scopes a component's CSS by an attribute it stamps on the markup it
  // compiled, and this element is made at runtime, so a scoped `.handle` rule
  // never matches it. The gate caught that; it would have shipped otherwise.
  surface.handle.remove();
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  const framed = side + 2 * WALL_WIDTH + 2 * margin;
  const scale = Math.min(width, height) / framed;

  render(surface, balls, side, { originX: width / 2, originY: height / 2, scale }, null);

  // The shooter waits on this rather than on a timer: a screenshot taken a
  // frame early is a picture of an empty carpet, and nothing downstream can
  // tell that from a deliberate one.
  stage.dataset.ready = "true";
}
