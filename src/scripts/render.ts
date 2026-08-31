import { worldToScreen, type ViewTransform } from "../game/view";
import { CARRY_HEIGHT } from "../game/descent";
import { BALL_RADIUS, WALL_WIDTH, type Ball, type Side } from "../game/types";

// Rendering writes and never reads back. Nothing here measures an element, so a
// rule bug and a rendering bug cannot be confused for one another.

/** Handle diameter, in ball radii --- bigger than a ball, for an easy grab. */
const HANDLE_RADII = 1.4;

export interface Surface {
  box: HTMLElement;
  handle: HTMLElement;
  balls: HTMLElement[];
  container: HTMLElement;
}

export function createSurface(container: HTMLElement): Surface {
  container.replaceChildren();
  const box = container.ownerDocument.createElement("div");
  box.className = "box";
  container.append(box);
  const handle = container.ownerDocument.createElement("div");
  handle.className = "handle";
  container.append(handle);
  return { container, box, handle, balls: [] };
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
  /** The ball that is off the plane, and how high, or null. */
  raised: { index: number; height: number } | null,
): void {
  reconcile(surface, balls.length);

  // One ball radius in screen pixels, published to CSS so shadow and wall
  // widths are stated in radii and survive the level-change zoom. A shadow
  // sized in em would be pinned to the root font size and would come adrift
  // from the ball it belongs to the moment the view rescaled.
  surface.container.style.setProperty("--r", `${BALL_RADIUS * view.scale}px`);
  // The wall is simulated, not decorative, so its width comes from the rules
  // rather than from the stylesheet. Drawn and settled against the same number.
  surface.container.style.setProperty("--wall", `${WALL_WIDTH * view.scale}px`);

  const diameter = 2 * BALL_RADIUS * view.scale;
  for (let i = 0; i < balls.length; i++) {
    const screen = worldToScreen(view, balls[i]!);
    const element = surface.balls[i]!;
    element.style.width = `${diameter}px`;
    element.style.height = `${diameter}px`;
    element.style.transform = `translate(${screen.x - diameter / 2}px, ${screen.y - diameter / 2}px)`;
    // How high this ball is, from 0 on the plane to 1 at carry height. The view
    // is orthographic, so height cannot change a ball's size --- the shadow is
    // the only thing that can say how far off the plane it is, which is why the
    // palette went light enough for a shadow to show in the first place.
    const height = raised && raised.index === i ? raised.height / CARRY_HEIGHT : 0;
    element.style.setProperty("--h", `${height}`);
    // A ball off the plane is above the arrangement, so it draws above it too.
    element.style.zIndex = height > 0 ? "2" : "1";
  }

  // The element is the box's interior exactly: its edge is the wall's inner
  // face, which is where a settled ball's surface comes to rest. CSS hangs the
  // wall slab off the outside of it.
  const boxPx = side * view.scale;
  const corner = worldToScreen(view, { x: -side / 2, y: side / 2 });
  surface.box.style.width = `${boxPx}px`;
  surface.box.style.height = `${boxPx}px`;
  surface.box.style.transform = `translate(${corner.x}px, ${corner.y}px)`;

  // The handle sits on the tray's outer corner, bottom-right, past the wall's
  // own outer face --- the one control surface of the game, kept off the balls
  // and off the box body so it never competes with either for a grab.
  const handleWorld = side / 2 + WALL_WIDTH;
  const handlePx = HANDLE_RADII * view.scale;
  const handleScreen = worldToScreen(view, { x: handleWorld, y: -handleWorld });
  surface.handle.style.width = `${handlePx}px`;
  surface.handle.style.height = `${handlePx}px`;
  surface.handle.style.transform = `translate(${handleScreen.x - handlePx / 2}px, ${handleScreen.y - handlePx / 2}px)`;
}
