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
- **Wall ramps, not geometry.** A ball whose centre is within 1 radius outside
  a wall line is pushed inward by the overlap. There is no hard collision with a
  wall — the ramp is the whole wall model.
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

- **Contact force is linear in overlap**, along the line of centres. For a pair,
  overlap is `2 - distance` where positive; for a wall, it is how far the ball's
  centre has come inside the 1-radius ramp, directed inward. A nonlinear contact
  law would buy nothing here.
- **Displacement is proportional to net force**: `dx = alpha * F`, overdamped,
  no velocity and no momentum carried between iterations. That is `IDEA.md`'s
  "the balls settle, they do not fly" stated as code rather than as a hope.
- **`alpha = 0.5 / max(1, contacts)`** for each ball. An isolated overlapping
  pair then resolves exactly in a single iteration, and dividing by the contact
  count keeps a pass non-expansive inside a dense cluster. This is the model's
  one constant and it is derived, not dialled in.
- **A held ball exerts force and receives none.** That is what `IDEA.md`'s
  "lifts clear of the others" is, in the model.
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
  iteration cap. Largest residual overlap is a separate quantity, and it is the
  one that answers whether the arrangement actually *fits*.
- **Total inward wall force is a pressure readout**, free from this model and a
  smoother stopping signal for compacting than residual overlap alone.

## Build order

Each milestone is a commit or a short range, ends with `pnpm check` green, and
adds the tests named under it. Milestones 0–4 need no browser at all.

### M0 — strip the template

Replace the placeholder page with the shell: `nav`, one `h1`, an empty stage
element, no copy. Replace the `description` meta with a real sentence.

*Lands green:* the three prose tests in `spec/crit-5.test.ts` — the template
paragraph is what currently fails the sentence and word-budget checks. The
pointer and script tests stay red on purpose until M5; a stub listener added
here to green them would be gaming a sensor.

### M1 — the numbers

`optima.ts`, `score.ts`. Par is the naive grid, side `2*ceil(sqrt(N))`. The
optimum table is hand-authored for N = 1..20 with one provenance line citing its
source; three stars is the optimum plus a tolerance, two stars sits between.

*Tests:* par matches the formula for N = 1..20; the table is non-decreasing in
N; `optimum(N) <= par(N)` for every N, with equality at N = 1, 4, 9; star
thresholds are ordered and star count is monotone in achieved size. Those four
catch a transcription slip in the table without needing to trust any single
figure.

*Closes:* `IDEA.md`'s open question on par values and star tolerances.

### M2 — settling

`settle.ts`: one pass and a converge-to-residual wrapper with an iteration cap.

*Tests:* two overlapping balls end exactly touching after **one** iteration —
that is the `alpha` calibration, so it fails loudly if the constant drifts; a
ball inside the wall ramp ends on the wall line; an already-resolved
arrangement is unchanged (idempotence); the same input twice gives bit-identical
output; two coincident balls separate rather than hanging, and separate the same
way every time; settling never pushes a ball outside the box; a held ball does
not move while its neighbours do.

Two more exist only because the model accumulates, and they are the ones worth
writing first: a symmetric arrangement stays symmetric through a full settle,
and permuting the ball indices permutes the result and changes nothing else. The
second is the direct test of the accumulate-then-apply property — an accidental
in-place write inside the force loop is invisible to every other test here and
fails that one immediately.

### M3 — compacting

`compact.ts`. The box is centred and square, so the side is the only variable
and compacting is a one-dimensional search. `compactStep` shrinks the side a
little, settles, and reports wall pressure and residual overlap; the box backs
off to the last side that settled under tolerance. `compact` runs it to
completion for tests.

*Tests:* N = 1 compacts to side 2; N = 4 from a rough grid reaches 4 within
tolerance; N = 2 from a diagonal start reaches 2 + sqrt(2); compacting an
already-compacted arrangement returns the identical side — the "pressing the
control repeatedly is never a strategy" promise, and the reason M2 bought
determinism; a scattered start terminates inside the iteration cap.

One more the centred box makes checkable: the same arrangement translated well
off-centre compacts to the same side. It is the test that the ramps really do
herd a drifted arrangement in, rather than the player being quietly punished for
building in the wrong part of the screen.

### M4 — session and progression

`session.ts`: completing a level drops one ball in and advances; positions carry
over; best size and best arrangement per level; level-select reachability; the
core sequence ends at N = 10 with levels to 20 available for playtesting.

*Tests:* positions carry across a level change; re-entering a level restores its
best arrangement, not a blank one; a worse attempt does not overwrite a best;
completing 10 flags the sequence complete; there is no code path that clears an
arrangement, which is how "no reset button" is held as a contract rather than a
missing button.

### M5 — the edge: render, drag, loop

`mount.ts`, `render.ts`. Balls are DOM elements — one per ball, radial-gradient
sphere plus a drop shadow, positioned by `transform`. Chosen over canvas
because at N <= 20 the cost is irrelevant, the level-change zoom becomes one
transform on the container, and the balls exist as elements a jsdom test can
find. Rendering only writes; it never reads geometry back.

*Lands green:* the remaining `spec/crit-5.test.ts` checks — a real script ships
and a real `pointerdown` handler exists.

*Tests:* mounting level N produces N ball elements; a synthetic
pointerdown/move/up sequence through an injected view transform moves the
grabbed ball to the released position; a drag on empty background bumps
neighbours without picking one up; `step` is callable with a delta and the
module never references `performance` or `Date`.

**Playtest ask.** Does dragging feel like pushing a ball, or like moving a
cursor with a ball attached? Does releasing read as the ball settling *down*?

### M6 — the box handle

One handle: click compacts, drag resizes, including tighter than currently fits
so balls overflow. This is the whole control surface of the game.

*Tests:* a click on the handle runs a compact and records a size; a drag to a
smaller side leaves balls overlapping the ramp rather than clipping them; a drag
larger never moves a ball.

**Playtest ask.** The first ten seconds of level 1, cold, with no words on
screen: is the handle obviously a thing to grab? Does the failure — the box
stopping short of par — read as failure?

### M7 — level select, zoom, drop

The level-select histogram doubles as the `nav` landmark the invariants require,
which is why the shell in M0 has a `nav` with nothing in it yet. Level change
zooms the view, then drops the new ball as a separate beat.

*Tests:* the nav contains one row per reached level and none beyond; a row's bar
length is derived from the recorded best; the drop is a state transition that
can be stepped to completion without wall-clock time.

**Playtest ask.** Does 1 -> 2 read as "one more ball arrived", or as a reset?
Does the N = 5 tear-down land as a difficulty spike or as a puzzle?

### M8 — ship

Replace `public/card.png`, write `PROCESS.md` as a reading guide with resolving
commit citations, run `pnpm check:evidence`.

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
not because it is quiet. Both halves resolve at M7:

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
keyboard at all, so it lands after M7 or not this week — and by hand, since
nothing here can judge it.

## Still open after this plan

- How the box-closing animation is rendered (decided in M6, from what the
  handle turns out to feel like).
- The star tolerance widths, which M1 fixes as numbers but only a playtest
  around M8 can judge as difficulty.
