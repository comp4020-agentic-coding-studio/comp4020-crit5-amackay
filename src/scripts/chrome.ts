import type { HistogramRow } from "../game/histogram";

// The furniture around the stage: the level-select screen, the one row that
// stays on the game screen, and the buttons. Like render.ts, this writes and
// never reads back, and it writes no text anywhere except the finish slot ---
// every name a screen reader needs is an aria-label, which is an attribute and
// so never appears on screen.

export interface Chrome {
  /** The level-select screen: the game's title and every level in it. */
  screen: HTMLElement;
  /** The list of levels inside that screen. */
  levels: HTMLElement;
  /** The current level's row, which stays on the game screen. */
  goal: HTMLElement;
  /** Opens the level-select screen. */
  pick: HTMLButtonElement;
  /** Closes it again. */
  back: HTMLButtonElement;
  advance: HTMLButtonElement;
}

/**
 * Find the chrome elements, creating and appending any that are missing. The
 * real page server-renders them all so they are adopted in place with no
 * reflash; a bare test container has none, so they are made on the spot.
 */
export function createChrome(doc: Document): Chrome {
  const screen =
    doc.querySelector<HTMLElement>("#screen") ?? appendTo(doc, doc.body, "div", "screen");
  screen.hidden = true;

  const levels =
    doc.querySelector<HTMLElement>("#levels") ?? appendTo(doc, screen, "nav", "levels");
  levels.setAttribute("aria-label", "Levels");

  const goal =
    doc.querySelector<HTMLElement>("#goal") ?? appendTo(doc, doc.body, "div", "goal");

  const pick = button(doc, "pick", "Levels");
  const back = button(doc, "back", "Back to the game");
  const advance = button(doc, "advance", "Next level");
  advance.hidden = true;

  return { screen, levels, goal, pick, back, advance };
}

/** Find or make one of the chrome's buttons, and name it for a screen reader. */
function button(doc: Document, className: string, label: string): HTMLButtonElement {
  let el = doc.querySelector<HTMLButtonElement>(`button.${className}`);
  if (!el) {
    el = doc.createElement("button");
    el.className = className;
    el.type = "button";
    doc.body.append(el);
  }
  el.setAttribute("aria-label", label);
  return el;
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

/** Bring the screen's rows into line with the histogram: one <a> per row. */
export function renderLevels(
  nav: HTMLElement,
  rows: readonly HistogramRow[],
  handlers: LevelHandlers,
): void {
  const doc = nav.ownerDocument;

  for (let have = nav.querySelectorAll("a.level").length; have < rows.length; have++) {
    nav.append(makeRow(doc, "a"));
  }
  const existing = [...nav.querySelectorAll<HTMLElement>("a.level")];
  for (const extra of existing.slice(rows.length)) extra.remove();

  const live = nav.querySelectorAll<HTMLElement>("a.level");
  rows.forEach((row, i) => {
    const anchor = live[i]!;
    fillRow(anchor, row);
    anchor.setAttribute(
      "aria-label",
      row.locked ? `Level ${row.n}, locked` : `Level ${row.n}`,
    );
    // Set fresh every render rather than added once, so an anchor that arrived
    // server-rendered is wired too and no listener ever stacks up. A locked
    // level takes no click: it is shown so the game's length is visible, not
    // so it can be jumped to.
    anchor.onclick = row.locked ? null : () => handlers.onSelect(row.n);
  });
}

/**
 * The one row that stays on the game screen: the level being played, with the
 * notch it is aiming at picked out from the other two. Not an anchor --- the
 * level you are on is not somewhere to navigate to, and on level one selecting
 * it would start the level over.
 */
export function renderGoal(el: HTMLElement, row: HistogramRow | undefined): void {
  if (!row) {
    el.replaceChildren();
    return;
  }
  let track = el.querySelector<HTMLElement>(".level");
  if (!track) {
    track = makeRow(el.ownerDocument, "div");
    el.replaceChildren(track);
  }
  fillRow(track, row);
  // The game screen's row is a gauge, not a record: its bar is the box as it
  // is now, read against the notch it is being closed towards.
  if (row.nowFraction == null) track.style.removeProperty("--bar");
  else track.style.setProperty("--bar", `${row.nowFraction}`);
  // A bar shorter than the mark means the box is small enough --- but only if
  // what is in it fits. Marked, so the gauge cannot read as won when the
  // circles are still overlapping.
  track.classList.toggle("is-unfit", !row.fits);
  track.setAttribute("aria-label", `Level ${row.n}`);
}

function makeRow(doc: Document, tag: "a" | "div"): HTMLElement {
  const row = doc.createElement(tag);
  row.className = "level";
  row.append(makeSpan(doc, "bar"));
  for (let i = 0; i < 3; i++) row.append(makeSpan(doc, "notch"));
  row.append(makeSpan(doc, "lock"));
  return row;
}

/** Everything a row draws, shared by the screen's rows and the goal row. */
function fillRow(el: HTMLElement, row: HistogramRow): void {
  el.dataset.n = String(row.n);
  if (row.bestFraction == null) el.style.removeProperty("--bar");
  else el.style.setProperty("--bar", `${row.bestFraction}`);
  el.classList.toggle("is-current", row.current);
  el.classList.toggle("is-locked", row.locked);
  if (row.current) el.setAttribute("aria-current", "step");
  else el.removeAttribute("aria-current");

  const notches = el.querySelectorAll<HTMLElement>(".notch");
  const at = [row.notches.three, row.notches.two, row.notches.one];
  notches.forEach((notch, k) => {
    notch.style.setProperty("--at", `${at[k]}`);
    // The goal is one of these three, so it is marked rather than drawn twice.
    notch.classList.toggle("is-goal", row.goal != null && at[k] === row.goal);
  });
}

/** Show or hide the next-level button. The click listener is mount.ts's, so it
 * can be taken off again on destroy. */
export function renderAdvance(button: HTMLButtonElement, visible: boolean): void {
  button.hidden = !visible;
}

/**
 * Open or close the level-select screen. Everything under it stays running ---
 * only what would be read *through* it is taken down, which is the goal row:
 * the screen has a row for the current level of its own.
 */
export function renderScreen(chrome: Chrome, open: boolean): void {
  chrome.screen.hidden = !open;
  chrome.back.hidden = !open;
  chrome.pick.hidden = open;
  chrome.goal.hidden = open;
}

function makeSpan(doc: Document, className: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = className;
  return span;
}
