import { worldToScreen, type ViewTransform } from "../game/view";
import { BALL_RADIUS, type Ball, type Side } from "../game/types";

// Rendering writes and never reads back. Nothing here measures an element, so a
// rule bug and a rendering bug cannot be confused for one another.

export interface Surface {
  box: HTMLElement;
  balls: HTMLElement[];
  container: HTMLElement;
}

export function createSurface(container: HTMLElement): Surface {
  container.replaceChildren();
  const box = container.ownerDocument.createElement("div");
  box.className = "box";
  container.append(box);
  return { container, box, balls: [] };
}

/** Bring the number of ball elements into line with the arrangement. */
function reconcile(surface: Surface, count: number): void {
  const doc = surface.container.ownerDocument;
  while (surface.balls.length < count) {
    const ball = doc.createElement("div");
    ball.className = "ball";
    surface.container.append(ball);
    surface.balls.push(ball);
  }
  while (surface.balls.length > count) {
    surface.balls.pop()?.remove();
  }
}

export function render(
  surface: Surface,
  balls: readonly Ball[],
  side: Side,
  view: ViewTransform,
  held: number | null,
): void {
  reconcile(surface, balls.length);

  // One ball radius in screen pixels, published to CSS so shadow and rim
  // widths are stated in radii and survive the level-change zoom. A shadow
  // sized in em would be pinned to the root font size and would come adrift
  // from the ball it belongs to the moment the view rescaled.
  surface.container.style.setProperty("--r", `${BALL_RADIUS * view.scale}px`);

  const diameter = 2 * BALL_RADIUS * view.scale;
  for (let i = 0; i < balls.length; i++) {
    const screen = worldToScreen(view, balls[i]!);
    const element = surface.balls[i]!;
    element.style.width = `${diameter}px`;
    element.style.height = `${diameter}px`;
    element.style.transform = `translate(${screen.x - diameter / 2}px, ${screen.y - diameter / 2}px)`;
    element.classList.toggle("held", i === held);
    // A carried ball is above the arrangement, so it draws above it too.
    element.style.zIndex = i === held ? "2" : "1";
  }

  const boxPx = side * view.scale;
  const corner = worldToScreen(view, { x: -side / 2, y: side / 2 });
  surface.box.style.width = `${boxPx}px`;
  surface.box.style.height = `${boxPx}px`;
  surface.box.style.transform = `translate(${corner.x}px, ${corner.y}px)`;
}
