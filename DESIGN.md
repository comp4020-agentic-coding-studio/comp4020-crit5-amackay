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
- **The boundary is a rim, not four walls.** A raised rim follows the square's
  outline, corners included, and the terrain falls away a radius either side of
  it, so a ball rolls off it downhill — inward if inside, outward if outside.
  There is no hard collision anywhere: the rim is a hill a ball can be pushed
  over. It is the signed distance to the square, which is what makes the corners
  fall out instead of being enumerated (see `rimAt`).
- **The screen edge is the one hard stop.** A clamp on position, not a force,
  because a ball must never be lost off screen — a guarantee, not a tendency.
  Omitted when the surface has no measured size, which is every jsdom element:
  bounds of zero would collapse the arrangement onto the origin.
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
  (`2 - distance`, where positive) and across the rim for the boundary (`1 -
  |distance to the boundary|`, downhill). A nonlinear contact law would buy
  nothing here.
- **Displacement is proportional to net force**: `dx = alpha * F`, overdamped,
  no velocity and no momentum carried between iterations. That is `IDEA.md`'s
  "the balls settle, they do not fly" stated as code rather than as a hope.
- **`alpha = 0.5 / max(1, contacts)`** for each ball. An isolated overlapping
  pair then resolves exactly in a single iteration, and dividing by the contact
  count keeps a pass non-expansive inside a dense cluster. This is the model's
  one constant and it is derived, not dialled in.
- **A carried ball is out of the arrangement entirely** (`lifted`) — it exerts
  no force and receives none, so it passes over its neighbours without
  disturbing them. Anything less is not `IDEA.md`'s "lifts clear of the others":
  a ball that stays pinned but keeps pushing ploughs a furrow through the
  arrangement the player built, which is the opposite of being able to try a
  position before committing to it. A **released** ball is the mirror image
  (`pinned`): immovable, and shoving everything aside. M6 replaces both flags
  with a height.
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

Three things the milestones left behind, all still true and none obvious from
the code:

- **A ball is one of three things**, not two: carried (out of the arrangement
  entirely, disturbs nothing it passes over), descending (position in plan
  fixed, pushed by nothing including the rim, shoving neighbours aside), and
  settled. Collapsing the first two is what made a drag plough a furrow through
  the arrangement.
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

### M6 — motion: the falling descent, and a speed cap

Settling currently resolves in about four frames and reads as teleporting. The
fix is not to slow the solver down but to give the motion a reason to take time.

**The descent becomes a fall.** A released ball has a height, and only ever one
ball does, so the arrangement stays coplanar and the packing stays a packing.
Two unit spheres touch at centre distance 2, so a ball at height `h` above the
plane excludes its neighbours out to `sqrt(4 - h*h)` horizontally: nothing at
`h = 2`, a full diameter at `h = 0`. Lowering `h` over the fall is IDEA.md's
"lowers it back down, pushing its neighbours aside as it descends" taken
literally instead of approximated, and it dissolves the carried/descending/
settled enum into one number — carried is `h = 2`, settled is `h = 0`.

This is the only place a third dimension earns its keep. Modelling the *rules*
in 3D would break the game: under a squeeze the balls would ride up over each
other, and a pile is not a circle packing, so the published optima would stop
being the right target. Corners get no cheaper either — a sphere against a 3D
box corner needs the same signed distance with one more component.

**And a speed cap** for everything that is not falling: a nudge, a box squeeze.
Clamp each ball to a maximum speed per second so a big overlap resolves at a
constant rate and eases out at the end, rather than exponentially with all the
movement in the first two frames.

*Tests:* horizontal exclusion grows monotonically from 0 to 2 as `h` falls from
2 to 0; a ball at `h = 2` disturbs nothing; a landed ball is an ordinary member
of the arrangement; the fall is stepped by a delta and reaches the same resting
arrangement whatever the deltas were; a capped settle converges to the same
fixed point as an uncapped one.

*Retire with it:* the `pinned` option and the `descending` flag in `mount.ts`,
both of which become `h > 0`.

**The test this breaks, on purpose.** `mount.test.ts` asserts the same
arrangement after N steps whatever the delta was. A speed cap scaled by delta
makes that false and *should* — the honest property is that the same **resting**
arrangement is reached given enough time. Change it in its own commit, ahead of
the feature, saying which line of the spec it still serves.

*Playtest ask.* Does the drop read as a ball landing? Does the shove propagate
visibly — A pushes B pushes C — or still arrive all at once?

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
