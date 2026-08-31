# A game — agent harness

A COMP4020 prototype: a tiny browser game that teaches itself. Static site,
Astro, deployed to GitHub Pages. **The deployed site is what gets judged** —
not this repo.

The brief and spec are published on the course site. Read them there; a
paraphrase here would be one more thing to keep true. `spec/README.md` says how
the checks relate to the spec.

## Two things this harness cannot do: learn the game, and feel it

This week the gap between what a test can hold and what only a person can is
the point of the exercise, so name it rather than working around it.

- **A green suite says nothing about whether the game teaches itself.** Tests
  can establish that a wrong move ends the round; only a stranger's hands can
  tell you whether the opening screen made the first move obvious, or whether
  the ending felt earned rather than arbitrary.
- **So ask for a play, and say what you want watched.** When a change affects
  how the game reads or feels — pacing, difficulty, the first ten seconds —
  stop and say so rather than reporting the tests green and moving on.
- **Keep the rules behind a seam.** State transitions, scoring, collision,
  win/loss conditions: plain functions taking state and returning state, with
  rendering and input at the edge. A rule bug and a rendering bug must never be
  confusable, and the spec's "one rule under a focused automated test" only
  works if a rule is a thing you can call.
- **jsdom has no layout**, so every `getBoundingClientRect()` is zero-sized,
  `elementFromPoint` is useless, and there is no canvas. Any client-coordinate
  arithmetic divides by zero and the `NaN` propagates silently. Anything a test
  needs to drive must be reachable without pixel geometry.
- **`requestAnimationFrame` does not tick on its own under test.** A game loop
  driven by rAF needs the step to be a callable function taking a delta, so the
  test advances time explicitly. Never make wall-clock time a dependency of a
  rule.
- **A zero-sized measurement must not become a zero-valued rule input.** The
  zero rect is not just a division hazard; anything *derived* from it is a
  plausible-looking number that quietly ruins the state. A screen bound computed
  from a zero-width surface is a bound of zero, and clamping to it collapses
  every ball onto the origin — in every test at once, with nothing throwing.
  Return null for an unmeasured surface and make the rules treat absent as
  "no constraint", never as zero.
- **A test asserting a position cannot be tighter than the solver's own
  tolerance.** Convergence stops at a max displacement, so the geometry is only
  ever that accurate. Ask for a tighter solve in the test rather than loosening
  the assertion, and never write a tolerance that merely happens to pass.
- **No instructions anywhere is a spec line, and it binds this harness too.**
  No how-to-play modal, no instructions page, nothing in the README standing in
  for either. If a change needs a sentence of explanation to be usable, the
  change is wrong.

## The stack: Astro, base path and all

`astro.config.ts` sets `base: "/comp4020-crit5-amackay"`, and the dev server
serves under it too, so a path bug reproduces locally instead of only on the
live URL. **`http://localhost:4321/` returning 404 is correct**; the site is at
`/comp4020-crit5-amackay/`. The base is re-derived for this repo — never copied
from a previous week, where it silently 404s every asset on the live site.

- **Links and asset paths must be relative, or prefixed with
  `import.meta.env.BASE_URL`.** A root-absolute `/foo.png` looks fine locally
  and 404s on Pages.
- **`BASE_URL` carries no trailing slash here.** Joining it naively yields
  `.../comp4020-crit5-amackaycard.png`.
- **The invariants check the share card is *present*, not that it *resolves*.**
  A broken card URL ships green — read the built head.
- **`public/` is fetch-by-URL only**, and jsdom has no origin to resolve a
  relative `fetch` against, so anything in there is out of reach of the spec
  tests. Data the page needs belongs in `src/`, imported.
- **A body with no height silently flattens its own background.** Every part of
  the stage is `position: fixed`, so the body's box is zero-high; a background
  on it still paints the whole canvas, but its *positioning* box has collapsed,
  so a gradient renders as one flat colour with no error anywhere. `html, body
  { height: 100% }` is what makes it a gradient again. Sample the rendered
  pixel --- the CSS looked right in the file and in DevTools both.
- **Commit `pnpm-lock.yaml` with any dependency change**; CI installs
  `--frozen-lockfile`.
- **`astro check` typechecks `scripts/` as one global scope.** A `scripts/*.ts`
  file with no import or export is a *global* script to TS, so two of them
  sharing a top-level name is a redeclaration error. End every standalone
  script with `export {};`.

## Working rules

- **Never commit a red build, typecheck, or a test that used to pass.** The one
  exception: a spec test written before the thing it describes is *meant* to be
  red. Red-to-green is the record of the work.
- **A spec test encodes the spec, not the artefact.** When the game changes
  identity, a spec test may need editing — but only where it reached for a
  detail of the old design, never to soften what the spec asks. Change it in
  its own commit, say in the body which line of the spec it still serves, and
  never let the edit and the feature that makes it pass land together.
- Run `pnpm check` before pushing, and open the page in a browser (the
  `agent-browser` CLI works). The rendered page is the truth; this week, the
  *played* page is.
- **A value written in a comment is not evidence.** Evaluate the function.
- **"The same arrangement whatever the frame rate" is not a property this model
  has.** Walls only push inward, so any arrangement that is not jammed sits in a
  whole family of rest states and the path picks one. A test comparing positions
  across two frame rates is asserting something untrue the moment anything in
  the loop depends on the delta --- and the score follows the arrangement, so
  this is not cosmetic. Fix it by taking the delta out of the loop --- a frame is
  a tick, not a duration --- not by loosening the tolerance.
- **`agent-browser eval` keeps its context between calls.** A script that
  declares anything at the top level throws `Identifier has already been
  declared` on the second run, and a bare `const top`/`const stage` collides
  with a DOM global on the first. Wrap every eval script in an IIFE.
- **A green test written from the same misreading as the code is worth
  nothing.** Three real bugs this week were covered by tests that asserted the
  wrong behaviour and passed; each was found by opening the page. When a test
  and the spec disagree, the spec wins and the test changes — in its own commit.
- **Read positions back out of the DOM, not out of a screenshot.** For anything
  geometric, `agent-browser eval` on an element's `transform` gives the exact
  number and turns "looks about right" into a figure that can be checked against
  the arithmetic. A screenshot confirms it is on screen; it cannot confirm it is
  at 5.000.
- **The `description` meta and any `alt` text are the exception to the
  no-prose rule** — the reader has not seen the page yet, so describing it
  is the whole job. Everywhere a player can already look, delete instead.
- Paths written anywhere in this repo are relative to the repo root. Absolute
  paths tie a public repo to one machine.
- **Commit as you go** — "the repo shows the process" is a spec line, so the
  history is part of the contract. `PROCESS.md` is a short reading guide citing
  commits, not an essay.
- **`reflections/crit-5.md` is the repo owner's alone.** Never draft, edit, pad
  or start it. If it is missing near the cutoff, say so — that is the whole
  intervention.

## The checks

`pnpm check` is the loop; read the failure, which names the contract. Things it
won't tell you:

- **CI is gated on the repo being public** (`!github.event.repository.private`)
  while the repo is private, so nothing runs on push until the cutoff flip.
  Once public, a run deploys `dist/` to Pages and verifies the live URL
  returns 200.
- **`pnpm check:evidence`** requires the reflection at exactly
  `reflections/crit-5.md`, `PROCESS.md`'s commit citations to resolve, and the
  share card not to be the starter one.
- **`public/card.png` ships from the template** and must be replaced, along
  with the `description` meta, before shipping.
- **`.githooks/pre-commit`** blocks key-shaped strings before they are pushed.
  The course API key lives in gitignored `.claude/`; keep it there.
- **Nothing here renders at the marked sizes.** The site is judged live in
  Chrome at exactly **1920×1080** and **390×844**, both fully marked, and the
  spec asks for the finished game to be played at both. The phone one is where
  a size-dependent design breaks — and a game with keyboard-only input has no
  first move there at all.

Nothing here measures accessibility, performance, or whether the game is any
good.

## This file is yours

When something bites — a convention the work has to hold to, a sensor that
keeps catching you out, a fact about Astro or the browser that is easy to get
wrong — write it down here. Growing this file is the work.
