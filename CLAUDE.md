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
  can establish that a rule holds; only a stranger's hands can tell you whether
  the opening screen made the first move obvious, or whether the ending felt
  earned rather than arbitrary.
- **So ask for a play, and say what you want watched.** When a change affects
  how the game reads or feels — pacing, difficulty, the first ten seconds —
  stop and say so rather than reporting the tests green and moving on.
- **A level is beaten live, not from the record.** `levelComplete` asks whether
  the box on screen is small enough *and* whether the arrangement actually fits
  it --- not whether `bests` has an entry. That is what lets level one be
  re-entered at its opening size and have to be beaten again. It also means a
  test cannot fake a win by writing a number into `bests`: three helpers did,
  and when the rule changed they spun for ever instead of failing.
  `src/game/progress.test-helper.ts` is the one that actually packs, and every
  test that needs a session several levels in uses it.
- **A level opens over-compressed, by design.** The box carries over from the
  level before with one more ball dropped into the middle, so every level
  transition starts with circles overlapping and the box below its own
  threshold. `fitsNow` in `levelComplete` is what stops that reading as an
  already-beaten level.
- **Keep the rules behind a seam.** State transitions, scoring, collision and
  level entry: plain functions taking state and returning state, with
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
  `.../comp4020-crit5-amackaycard.png`; `src/layouts/Layout.astro` has the
  shape that doesn't (`.replace(/\/?$/, "/")`, then `new URL(..., Astro.site)`
  for the absolute URL `og:image` needs).
- **The invariants check the share card is *present*, not that it *resolves*.**
  A broken card URL ships green — read the built head. They also run against
  *every* `.html` in `dist/`, so a page that exists only to be screenshotted
  fails six of them; the two still pages carry `<meta name="robots"
  content="noindex">` and the invariants skip on that. Nothing a visitor can
  reach may opt out that way.
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
- **A value written in a comment is not evidence.** Evaluate the function. For
  anything in `src/game/`, the way to do that is a throwaway
  `src/game/scratch-*.test.ts` that `console.log`s the number, run with
  `pnpm vitest run <path> --reporter=verbose`, then deleted --- `node
  --experimental-strip-types` cannot resolve the extensionless imports in there,
  so it is not an option. Two of this week's bugs were a printed number
  disagreeing with a passing test.
- **"The same arrangement whatever the frame rate" is not a property this model
  has.** Walls only push inward, so any arrangement that is not jammed sits in a
  whole family of rest states and the path picks one. A test comparing positions
  across two frame rates is asserting something untrue the moment anything in
  the loop depends on the delta --- and the score follows the arrangement, so
  this is not cosmetic. Fix it by taking the delta out of the loop --- a frame is
  a tick, not a duration --- not by loosening the tolerance.
- **An Astro `<style>` block is scoped by an attribute the compiler stamps on
  the markup it compiled**, so a rule there never matches an element
  `render.ts` created at runtime. Hiding the handle in the still pages' CSS
  silently did nothing; the gate in `scripts/make-images.sh` caught it, which
  is the reason a screenshot gets a gate at all.
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
- **But a read in the same frame as the input is one frame stale.** The game's
  `requestAnimationFrame` callback is registered first and runs first, so a
  script that dispatches a pointer event and reads straight afterwards is
  reading the state computed for the *previous* pointer position. Measuring the
  pointer constraint that way reported a 0.75-radius intrusion that did not
  exist; reading on the next frame gave 1.0000 exactly.
- **They are `balls` in code and in these documents, and `circles` in anything
  a visitor reads.** The rules, the types and the notes all say ball; the
  `description` meta, `alt` text and any future on-screen wording say circle.
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
  `reflections/crit-5.md`, `PROCESS.md`'s commit citations to resolve, and both
  shipped pictures to be present, the right size, and not stale.
- **The two shipped pictures are screenshots, re-taken by `pnpm images`.**
  `public/card.png` and `public/favicon.png` come from `/card.html` and
  `/icon.html`, which draw a fixed arrangement with the site's own stylesheet
  and its own `render.ts`. Change how the game looks and the pictures go stale;
  `scripts/check-images.ts` hashes the built CSS and the scripts those pages
  load, so it says so rather than leaving you to remember. `agent-browser` is a
  tool on the machine, not a dependency --- CI never re-takes anything, it only
  checks. **It also re-encodes every run**, so the PNG bytes differ even when
  the picture does not: `git checkout public/*.png` rather than commit a no-op
  re-shoot.
- **`.githooks/pre-commit`** blocks key-shaped strings before they are pushed.
  The course API key lives in gitignored `.claude/`; keep it there.
- **Nothing here renders at the marked sizes.** The site is judged live in
  Chrome at exactly **1920×1080** and **390×844**, both fully marked, and the
  spec asks for the finished game to be played at both. The phone one is where
  a size-dependent design breaks — and a game with keyboard-only input has no
  first move there at all.
- **Write CSS breakpoints in `rem`, never a 3-digit `px`.** `spec/crit-5.test.ts`
  greps the bundled CSS for `(width|min-width): NNNpx` over 390 and calls it a
  fixed width wider than a phone — and `@media (max-width: 560px)` matches that
  regex. `35rem` does not.
- **The no-instructions checks run against the mounted game, not just the
  built page.** `spec/mounted-prose.test.ts` walks the game to level 20 and past
  the ending and holds the instruction and sentence checks against what actually
  renders; `dist/index.html` only ever shows the opening screen.

Nothing here measures accessibility, performance, or whether the game is any
good.

## This file is yours

When something bites — a convention the work has to hold to, a sensor that
keeps catching you out, a fact about Astro or the browser that is easy to get
wrong — write it down here. Growing this file is the work.
