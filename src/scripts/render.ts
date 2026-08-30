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

  const diameter = 2 * BALL_RADIUS * view.scale;
  for (let i = 0; i < balls.length; i++) {
    const screen = worldToScreen(view, balls[i]!);
    const element = surface.balls[i]!;
    element.style.width = `${diameter}px`;
    element.style.height = `${diameter}px`;
    element.style.transform = `translate(${screen.x - diameter / 2}px, ${screen.y - diameter / 2}px)`;
    element.classList.toggle("held", i === held);
  }

  const boxPx = side * view.scale;
  const corner = worldToScreen(view, { x: -side / 2, y: side / 2 });
  surface.box.style.width = `${boxPx}px`;
  surface.box.style.height = `${boxPx}px`;
  surface.box.style.transform = `translate(${corner.x}px, ${corner.y}px)`;
}
