# Design — build order and testing milestones

`IDEA.md` settles *what* the game is. This file is the *how* and *in what
order*: the module seam, the conventions fixed before any code, and a milestone
sequence where each step ends green and committable.

It is a live document. A section retires in the same commit as the milestone it
describes; what survives to the end is the seam and the conventions.

## The seam

The rules are plain functions over plain data. Rendering and input sit at the
edge and are the only things that touch the DOM, pixels, or the clock.

```
src/game/            pure, no DOM, no clock, no Math.random
  types.ts           Ball, Box, GameState, Level
  optima.ts          the packing table (hand-authored JSON + provenance line)
  score.ts           par, stars, size-in-radii
  settle.ts          one relaxation pass over balls and walls
  compact.ts         squeeze the box until it stops making progress
  session.ts         levels, carry-over, bests, level-select reachability
  view.ts            world <-> screen transform (pure; the client rect is read
                     at the edge and passed in)

src/scripts/         the edge
  mount.ts           builds the DOM, wires pointer events, owns the rAF loop
  render.ts          state -> DOM writes, no reads back

src/pages/index.astro   markup shell: nav landmark, h1, the empty stage
```

Two rules make this seam real rather than decorative:

- **The loop is a function.** `mount.ts` owns `requestAnimationFrame`; the thing
  it calls is `step(state, dtSeconds) -> state`. Nothing in `src/game/` reads
  `performance.now()` or `Date`. A test advances time by calling `step` with a
  delta, because rAF does not tick under jsdom.
- **The view transform is injected.** Drag needs client coordinates, so the edge
  reads one `getBoundingClientRect()` per frame and passes the resulting
  `{originX, originY, scale}` into pure `view.ts` helpers. Under jsdom that rect
  is zero-sized, so a test supplies its own transform and drives a drag with no
  layout at all. Never divide by a measured size inside `src/game/`.

## Conventions fixed before any code

- **Units are ball radii.** Ball radius is exactly 1. Box side, par values and
  scores are all in radii, which is the convention the published packing tables
  use, so scores compare to them directly with no conversion.
- **The box is an axis-aligned square centred on the world origin**, which is
  the centre of the screen. Its entire state is one number, the side; it never
  moves and never tracks the arrangement. Compacting therefore herds a drifted
  arrangement back toward the middle instead of closing around wherever it
  happens to sit — which is also how the game says, without a word, that the
  centre is where it happens.
- **The boundary is a wall with a thickness, and a ridge rather than a fence.**
  `side` is the *interior* clear span — what the published tables mean by the
  side of the square — and the wall stands outside it, from `side/2` to
  `side/2 + WALL_WIDTH`. The terrain falls away a radius beyond each of its two
  faces, so a ball rests touching the face it is against and rolls off downhill
  either way. There is no hard collision anywhere: the wall is a hill a ball can
  be pushed over. Two signed distances to two squares do it, which is what makes
  the corners fall out instead of being enumerated (see `rimAt`). The wall is
  measured as the *ring* between its two faces — `max(outer, -inner)`, the
  standard subtraction — and never as one square offset by half a wall, because
  offsetting a square outward rounds its corners: a ball settling diagonally
  outside a corner came to rest 0.046 radii inside the wall it was leaning on.
  Containment is a separate question and stays on the inner face. Written this
  way the inward force is algebraically identical to a zero-thickness wall's, so
  giving the wall a body moved nothing inside the box.
- **`WALL_WIDTH` is a rule, not a drawing.** It lives in `types.ts` and
  `render.ts` publishes it to CSS. The stylesheet holding its own copy is what
  let every settled ball bury an eighth of a radius in the wall it was resting
  on, unnoticed by a green suite.
- **The screen edge and the fingertip are the two hard stops.** Both are clamps
  on position rather than forces, and for the same reason: a force can be
  outrun. A ball must never be lost off screen — a guarantee, not a tendency —
  and a pointer crosses the box far faster than a capped ball can travel, so as
  a force it would let balls sink into the fingertip and pop out behind it,
  which is what made nudging feel like pushing through treacle. The fingertip
  is applied first and the edge last, so a ball can be shoved against the edge
  and stopped there but never through it. The edge clamp is omitted when the
  surface has no measured size, which is every jsdom element: bounds of zero
  would collapse the arrangement onto the origin.
- **Determinism is a contract, not a nicety.** No `Math.random` anywhere in
  `src/game/`. Degeneracy jitter comes from a seeded PRNG keyed on ball index,
  so compacting an unchanged arrangement twice returns the identical number.
  `IDEA.md` states this as a design promise; it is enforceable only if the
  randomness is addressable.
- **Forces are accumulated, then applied** — the model is below. This closes
  the first of `IDEA.md`'s open questions.
- **Unit tests live beside the code** (`src/game/settle.test.ts`). `spec/` is
  reserved for tests that encode a published spec line; a solver test is not
  one. Both run under `pnpm check`.

## The settling model

Per iteration: compute every force, sum per ball, then move every ball. Nothing
moves until all forces are known, so a ball with several contacts gets one
coherent displacement instead of being shoved sequentially by each neighbour in
turn — which is the regime a packing game lives in almost all of the time.

- **Contact force is linear in overlap**, along the line of centres for a pair
  (`reach - distance`, where positive, and `reach` is 2 unless one of them is off
  the plane) and across the wall for the boundary (`REACH - |distance to the
  centreline|`, downhill). A nonlinear contact law would buy nothing here.
- **Displacement is proportional to net force**: `dx = alpha * F`, overdamped,
  no velocity and no momentum carried between iterations. That is `IDEA.md`'s
  "the balls settle, they do not fly" stated as code rather than as a hope.
- **`alpha = 0.5 / max(1, contacts)`** for each ball. An isolated overlapping
  pair then resolves exactly in a single iteration, and dividing by the contact
  count keeps a pass non-expansive inside a dense cluster. This is the model's
  one constant and it is derived, not dialled in.
- **One ball at a time is off the plane, and its height is the whole story.**
  Two balls touch at centre distance 2, so one raised to `h` reaches only
  `sqrt(4 - h²)` across: nothing at carry height, a full diameter on the plane.
  Carried, descending and settled are that one number at 2, in between, and 0 —
  and because 0 means an ordinary ball, the end of a descent needs no special
  case. Only one ball ever has a height, so the arrangement stays coplanar and
  the packing stays a packing, which is what keeps the published optima the
  right target. Modelling the rules in 3D would break exactly that: under a
  squeeze the balls would ride up over each other, and a pile is not a circle
  packing.
- **Symmetry survives**, and this is the real reason to accumulate rather than
  resolve in place. Because nothing moves mid-pass, a symmetric arrangement
  settles symmetrically: N = 4 and N = 9 compact square instead of drifting on
  whatever order the pairs happened to be visited in. A sequential solver cannot
  promise that, and it would break it at exactly the grid levels `IDEA.md` calls
  restful.
- **Determinism still needs a fixed summation order**, since floating-point
  addition is not associative, plus the seeded jitter above. Order now affects
  the last bits rather than the outcome, which is a much easier thing to hold.
- **Convergence** is measured on the largest per-ball displacement, under an
  iteration cap. Residual is the separate quantity that answers whether the
  arrangement actually *fits*, and it is the worst of the ball-ball overlaps
  **and the distance past the boundary**. Overlap alone is not enough: at N = 1 there are
  no pairs, so an overlap-only residual would call any box, however small, a
  perfect fit and compacting would close it to nothing.
- **Total rim force is a pressure readout**, free from this model and a
  smoother stopping signal for compacting than residual overlap alone.

## What is built

The seam above, and with it: the packing table and star thresholds
(`optima.ts`, `score.ts`); settling (`settle.ts`); compacting by bisection on
the side (`compact.ts`); levels, carry-over and bests (`session.ts`); and the
edge — DOM balls, pointer drag, the frame loop (`mount.ts`, `render.ts`).
`spec/crit-5.test.ts` is green in full.

What the milestones left behind, all still true and none obvious from the code:

- **The fall is paced by the arrangement, not by a clock.** There is no gravity
  and no velocity: a released ball presses down until its reach bites into its
  nearest neighbour, and that bite is the force shoving the neighbour clear, so
  the descent advances exactly as fast as the shove it causes — which `MAX_SPEED`
  already caps. Dropped into a gap it is clear of, there is nothing to wait for.
  Measured: 0.1s into clear space, 0.25s with a ball half in the way, 0.5s
  dropped squarely onto one. A clock-paced fall was 0.5s for all three, and the
  half-second of watching nothing happen was the whole complaint.
- **Two bounds hold the fall, and both earn their place.** The floor on how
  quickly it may come down is so a landing reads as a beat rather than a
  teleport. The floor on how *slowly* is what stops a ball hanging in the air
  for ever: a neighbour jammed against a wall never opens the gap, so waiting on
  it never ends — measured, the height stalled at 0.384 and stayed. A real ball
  would rest on the pile, but only one ball is ever off the plane here, so it
  has to come down and squeeze in. That floor is `MAX_STEP`, so a landing never
  takes longer than the shove it would cause at full stretch.
- **A frame is a tick, not a duration.** The loop assumes a constant frame rate
  and advances one step per frame, so no delta reaches the rules at all. This is
  not laziness about frame pacing, it is the only cheap way to keep a score off
  the clock: an unconfined arrangement has a whole family of rest states and the
  path picks one, so once a pass was scaled by a real delta, which rest the
  arrangement fell into depended on the frame rate and so did the score — the
  same drop compacted to 3.9785 at 10fps and 3.9746 at 240fps. With no delta
  there is no path to vary, and what was a frame-rate property becomes plain
  determinism. The price is that a 120Hz display settles twice as briskly as a
  60Hz one, which for a game with no timer is a difference in nothing that is
  scored.
- **A speed cap must never reach `settle()`.** Convergence is judged on the
  largest step any ball took, which is precisely the quantity a cap shrinks, so
  a cap below the tolerance reports a converged fit on the first pass with the
  balls still overlapping. `settle()` strips it rather than trusting callers,
  because every score comes down that path.
- **Compacting skips its entry settle when the arrangement already fits.**
  Re-settling a settled arrangement relaxes it by ~1e-13 a time, and enough
  presses would creep it across a precision step, which would make pressing the
  control repeatedly a strategy. Idempotence is structural, not approximate.
- **Persistence is written and tested but not wired.** `serialise` /
  `deserialise` are pure and covered; nothing calls `localStorage` yet, because
  nothing is worth persisting until a level can be completed. It lands with the
  handle.

## What is left

Each milestone is a commit or a short range, ends with `pnpm check` green, and
adds the tests named under it.

### M7 — the box handle

One handle: click compacts, drag resizes, including tighter than currently fits
so balls overflow. This is the whole control surface of the game.

*Tests:* a click on the handle runs a compact and records a size; a drag to a
smaller side leaves balls overlapping the ramp rather than clipping them; a drag
larger never moves a ball.

**Playtest ask.** The first ten seconds of level 1, cold, with no words on
screen: is the handle obviously a thing to grab? Does the failure — the box
stopping short of par — read as failure?

### M8 — level select, zoom, drop

The level-select histogram doubles as the `nav` landmark the invariants require,
which is why the shell has a `nav` with nothing in it yet. Level change
zooms the view, then drops the new ball as a separate beat.

*Tests:* the nav contains one row per reached level and none beyond; a row's bar
length is derived from the recorded best; the drop is a state transition that
can be stepped to completion without wall-clock time.

**Playtest ask.** Does 1 -> 2 read as "one more ball arrived", or as a reset?
Does the N = 5 tear-down land as a difficulty spike or as a puzzle?

### M9 — ship

Replace `public/card.png`, write `PROCESS.md` as a reading guide with resolving
commit citations, run `pnpm check:evidence`. Revert the three-ball
playtest start in `main.ts`.

*Playtest ask, the one that matters.* A stranger, cold, at 390x844 and at
1920x1080: core sequence to completion in about five minutes. The phone is where
a size-dependent design breaks and where drag targets are decided.

## Two collisions to expect

**The word budget is not yet measuring the right text.** Headings are now
excluded from the count (`c41359f`); the instruction regex and the sentence
check still read them, because "How to play" is telling wherever it is set.

That buys the title back, not the level select — twenty histogram rows are
twenty words on their own. And underneath that sits the larger problem:
`spec/crit-5.test.ts` reads `dist/index.html` statically, so a game that builds
its DOM at runtime would pass the prose tests because the built page is empty,
not because it is quiet. Both halves resolve at M8:

- **Server-render the opening state** in `index.astro` — level 1, one ball, a
  nav with one row — and hydrate from there. The built HTML then really does
  contain what a first-time player sees, which is the state the no-prose spec
  line is about, and the static budget starts measuring something again.
- **Add a mounted-DOM prose sensor** that builds the game in jsdom, walks it to
  level 20 and to the ending, and applies the same regex to the text that
  actually appears on screen. That is where the level select gets read, and it
  makes the static budget a floor rather than the whole check.

Raising the number itself is the last resort, not the first move: the count is
the crude half of that test and the regex is the half that encodes the spec.

**Keyboard input is not on this path.** `IDEA.md` leaves it open and untested.
It is accessibility, not the intended mode, and the marked phone viewport has no
keyboard at all, so it lands after M8 or not this week — and by hand, since
nothing here can judge it.

## Still open after this plan

- How the box-closing animation is rendered (decided in M7, from what the
  handle turns out to feel like).
- The star tolerance widths, fixed as numbers in `score.ts` but only a
  playtest around M9 can judge as difficulty.
- `MAX_SPEED`, and with it the fall, which is derived from it. Half a second for
  a full diameter is a guess at "slow enough to watch, fast enough not to
  wait", and only hands on the game can settle it.
