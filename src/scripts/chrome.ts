import type { HistogramRow } from "../game/histogram";

// The furniture around the stage: the level-select histogram in the nav, the
// next-level button, and the slot the finish fragment lands in. Like render.ts,
// this writes and never reads back, and it writes no text anywhere except the
// finish slot --- every name a screen reader needs is an aria-label, which is an
// attribute and costs nothing against the visible-prose budget.

export interface Chrome {
  levels: HTMLElement;
  advance: HTMLButtonElement;
  finish: HTMLElement;
}

/**
 * Find the three chrome elements, creating and appending any that are missing.
 * The real page server-renders all three so they are adopted in place with no
 * reflash; a bare test container has none, so they are made on the spot.
 */
export function createChrome(doc: Document): Chrome {
  const levels =
    doc.querySelector<HTMLElement>("#levels") ?? appendTo(doc, doc.body, "nav", "levels");
  levels.setAttribute("aria-label", "Levels");

  let advance = doc.querySelector<HTMLButtonElement>("button.advance");
  if (!advance) {
    advance = doc.createElement("button");
    advance.className = "advance";
    doc.body.append(advance);
  }
  advance.setAttribute("aria-label", "Next level");
  advance.hidden = true;

  const finish =
    doc.querySelector<HTMLElement>("#finish") ?? appendTo(doc, doc.body, "div", "finish");

  return { levels, advance, finish };
}

function appendTo(
  doc: Document,
  parent: HTMLElement,
  tag: string,
  id: string,
): HTMLElement {
  const el = doc.createElement(tag);
  el.id = id;
  parent.append(el);
  return el;
}

export interface LevelHandlers {
  onSelect(n: number): void;
}

/** Bring the nav's rows into line with the histogram: one <a> per row. */
export function renderLevels(
  nav: HTMLElement,
  rows: readonly HistogramRow[],
  handlers: LevelHandlers,
): void {
  const doc = nav.ownerDocument;

  for (let have = nav.querySelectorAll("a.level").length; have < rows.length; have++) {
    const anchor = doc.createElement("a");
    anchor.className = "level";
    anchor.append(makeSpan(doc, "bar"));
    for (let i = 0; i < 3; i++) anchor.append(makeSpan(doc, "notch"));
    nav.append(anchor);
  }
  const existing = [...nav.querySelectorAll<HTMLElement>("a.level")];
  for (const extra of existing.slice(rows.length)) extra.remove();

  const live = nav.querySelectorAll<HTMLElement>("a.level");
  rows.forEach((row, i) => {
    const anchor = live[i]!;
    anchor.dataset.n = String(row.n);
    // Set fresh every render rather than added once, so an anchor that arrived
    // server-rendered is wired too and no listener ever stacks up.
    anchor.onclick = () => handlers.onSelect(row.n);
    if (row.bestFraction == null) anchor.style.removeProperty("--bar");
    else anchor.style.setProperty("--bar", `${row.bestFraction}`);
    anchor.classList.toggle("is-current", row.current);
    if (row.current) anchor.setAttribute("aria-current", "step");
    else anchor.removeAttribute("aria-current");

    const notches = anchor.querySelectorAll<HTMLElement>(".notch");
    const at = [row.notches.three, row.notches.two, row.notches.one];
    notches.forEach((notch, k) => notch.style.setProperty("--at", `${at[k]}`));
  });
}

/** Show or hide the next-level button. The click listener is mount.ts's, so it
 * can be taken off again on destroy. */
export function renderAdvance(button: HTMLButtonElement, visible: boolean): void {
  button.hidden = !visible;
}

/** The one place the chrome writes visible text: the finish fragment. */
export function renderFinish(el: HTMLElement, finished: boolean, text: string): void {
  el.textContent = finished ? text : "";
}

function makeSpan(doc: Document, className: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = className;
  return span;
}
