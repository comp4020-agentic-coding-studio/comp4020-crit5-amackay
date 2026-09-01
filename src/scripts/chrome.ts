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
  /** The size bar: a half-scale ruler of the box, in the top bar. */
  gauge: HTMLElement;
  /** The dotted line tying the size bar's mark to the box's right face. */
  tie: HTMLElement;
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

  const gauge =
    doc.querySelector<HTMLElement>("#gauge") ?? appendTo(doc, doc.body, "div", "gauge");
  if (!gauge.querySelector(".track")) {
    gauge.append(makeSpan(doc, "track"), makeSpan(doc, "fill"), makeSpan(doc, "mark"));
    // Three stars, tightest first, each in a lane of its own. Not conditional
    // on them overlapping: two and three stars are 6% of the optimum apart,
    // which on a phone is four pixels at every level in the game, so a rule
    // that only stacked them when they collided would be stacking them always.
    for (const rank of [3, 2, 1]) {
      const tick = makeSpan(doc, "tick");
      tick.dataset.rank = String(rank);
      gauge.append(tick);
    }
  }

  const tie = doc.querySelector<HTMLElement>("#tie") ?? appendTo(doc, doc.body, "div", "tie");

  const pick = button(doc, "pick", "Levels");
  const back = button(doc, "back", "Back to the game");
  const advance = button(doc, "advance", "Next level");
  advance.hidden = true;

  return { screen, levels, gauge, tie, pick, back, advance };
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

export interface Gauge {
  /** Screen pixels per ball radius: the box's own scale, not the bar's. */
  scale: number;
  /** The box's interior side, in radii. */
  side: number;
  /** The three star thresholds in radii, tightest first. */
  thresholds: readonly [number, number, number];
  /** Whether the arrangement actually fits the box on screen. */
  fits: boolean;
  /** Screen y of the top of the box's interior. */
  boxTop: number;
  /** Screen y the tie starts from: the bottom of the top bar. */
  barBottom: number;
}

/**
 * The size bar. Its left edge is the viewport's centre, which is the box's
 * centre, and it runs right at exactly the box's own scale --- so it is a
 * half-scale drawing of the box's width, and the mark on it sits at the same
 * screen x as the box's right interior face. The dotted tie is that alignment
 * made visible rather than asserted.
 *
 * Everything here is written in pixels from the bar's left edge. Nothing is
 * read back: the two screen positions the tie needs are handed in, because the
 * only thing that knows them is the transform the box was drawn with.
 */
export function renderGauge(el: HTMLElement, tie: HTMLElement, g: Gauge): void {
  const now = (g.side / 2) * g.scale;
  el.style.setProperty("--now", `${now}px`);
  // A mark short of a star means the box is small enough --- but only if what
  // is in it fits. Hollowed out rather than recoloured when it does not: the
  // fill is what says "this much is settled", and nothing is.
  el.classList.toggle("is-unfit", !g.fits);

  const ticks = el.querySelectorAll<HTMLElement>(".tick");
  const at = g.thresholds;
  ticks.forEach((tick, k) => {
    tick.style.setProperty("--at", `${(at[k]! / 2) * g.scale}px`);
  });

  tie.style.setProperty("--at", `${now}px`);
  tie.style.setProperty("--top", `${g.barBottom}px`);
  tie.style.setProperty("--length", `${Math.max(0, g.boxTop - g.barBottom)}px`);
}

function makeRow(doc: Document, tag: "a"): HTMLElement {
  const row = doc.createElement(tag);
  row.className = "level";
  row.append(makeSpan(doc, "bar"));
  for (let i = 0; i < 3; i++) row.append(makeSpan(doc, "notch"));
  row.append(makeSpan(doc, "lock"));
  return row;
}

/** Everything a level-screen row draws. */
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
 *  only what would be read *through* it is taken down, which is the size bar:
 * the screen has a row for the current level of its own.
 */
export function renderScreen(chrome: Chrome, open: boolean): void {
  chrome.screen.hidden = !open;
  chrome.back.hidden = !open;
  chrome.pick.hidden = open;
  chrome.gauge.hidden = open;
  chrome.tie.hidden = open;
}

function makeSpan(doc: Document, className: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = className;
  return span;
}
