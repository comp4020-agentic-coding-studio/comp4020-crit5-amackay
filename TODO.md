# TODO — crit 5

The repo owner's working list. Ordered by what the cutoff (Wed 07:00) forces,
not by what is most interesting. Kept current as decisions are made.

## Now — nothing else counts until these are done

- [ ] **Play it at 390x844.** A fully marked viewport that nothing here tests.
      This is also the route to the spec's "one change that came from playing
      the finished game", which is currently unevidenced. The site is live now,
      so this can be done on the phone against the real URL.

## Next

- [ ] **Decide what to do about the overlap at every level opening.** A level
      now opens at the previous level's box with one more circle in the middle,
      so the circles start overlapping and stay overlapping until the box is
      grown. That makes the open "no-overlap should be prioritised over
      compression pressure" item much more visible than it was --- it is now the
      first thing seen at every transition, not an edge case.

## If there is time

- [ ] **The visual-state pass, as one change**: flat colours after the Wikipedia
      circle-packing diagrams (per instruction: not the subdued 3D look the art
      pass currently has), walls tinted when the arrangement overlaps, and the
      handle arrow reading in / out / both according to whether the box can
      still close. These are one visual language, cheaper together than apart,
      and the largest destabilising diff on the list.

## Needs a decision before any code

### From the UX review, not taken up in the HUD rebuild

- [ ] **A compact click is a no-op when the box is already at `compact()`'s own
      fixed point.** At level five, reached by the obvious route, clicking the
      handle does nothing at all --- six clicks running, byte-identical state ---
      and the handle is simultaneously covered by a ball
      (`elementFromPoint` at its centre returns `.ball`). The game's hardest
      moment is where its only control appears broken. Options: make a refusal
      visible, keep the handle reachable, or both.
- [ ] **Overlap is not signalled on the circles themselves.** The only "does
      not fit" cue is the size bar's hollow fill. Overlapping spheres are
      physically impossible, so saying it on the circles is the wordless
      teaching moment --- and it is where the player is already looking. Folds
      into the visual-state pass above.
- [ ] **The dominant strategy skips the puzzle.** Levels 3, 4, 6, 7, 8, 9 and
      10 all cleared with *zero* circle drags: open the handle, click once,
      2--3 stars. `advance` unlocks at one star, which is the naive grid, which
      the solver clears unaided. Making a close a commitment rather than a free
      probe is the change that would make the arrangement matter; gating
      `advance` at two stars only narrows the gap. Not a tuning problem.
- [ ] **The handle's hit area is still under 44px on a phone** --- 28px at level
      twenty --- because it is sized in world units and shrinks as the packing
      tightens. Wants a screen-space floor on the hit area while the drawing
      stays in world units. (Owner's call: fix later.)
- [ ] **The game writes `localStorage` about 60 times a second at idle,
      forever.** Measured: 180 writes in 3s with no input. The arrangement never
      reaches `maxDisplacement === 0` --- four of eleven balls were still moving
      after 3s idle --- so `commit()`'s string-equality guard never fires and
      every frame serialises the whole session. Side effect: the game cannot be
      reset by clearing site data while its tab is open, because it rewrites
      within a frame. The real bug is a quasi-static model that never rests.
- [ ] **Locked rows dominate the level screen on a first run** --- eighteen
      near-identical padlocked bars. Numbers help; the wall of them is still
      the first thing a new player sees on that screen.
- [ ] **Bar length is inverted against every progress bar a player has seen:**
      longer means a bigger box, which is worse. Worth deciding whether the
      fill should run the other way.
- [ ] **No keyboard path into the game at all.** The only focusable things are
      the chrome buttons and, since this week, the level rows; nothing moves a
      circle or drives the box. See the deprioritised note below --- this is the
      evidence for it, not a new item.

### Standing

- [ ] **Does the descent survive?** Adding the new ball in the centre removes
      the reason `src/game/descent.ts` exists, and the drop was deliberately
      made its own beat two commits ago. Half-keeping it is the bad outcome.
- [ ] **Is the visual-state pass in or out for tonight?**
- [ ] **No-overlap prioritised over compression.** A settled arrangement that
      visibly overlaps is misreporting its own score, so this is probably right
      — but it is a change to the settling model, it invalidates recorded bests,
      and it is the highest-risk item here. Options and a recommendation before
      anything is written.
- [ ] **Simulated equilibrium search for the star thresholds.** The 2/6/12%
      tolerances in `src/game/score.ts` are recorded as guesses. A search over
      equilibria, with jitter to separate stable from unstable, would settle
      them properly. Its whole output is three constants, and a playtest answers
      "is this too hard" faster.

## Deprioritised, on the owner's call

- **Keyboard controls.** Not a C5 spec line: the spec names no input method.
  Keyboard appears only in the assessment page's general craft criterion
  ("holds up under use it wasn't designed for"). Noted as possibly useful for
  driving an agent playtest.
- **The agent playtest brief.** Expected to need more iteration than it returns
  before the cutoff.

## Closed

- **Level select as its own screen.** A menu button opens a sheet of all twenty
  levels, locked ones disabled with a drawn padlock, each row numbered and
  drawn at one shared scale. Both looked at in a browser at 1920x1080 and
  390x844, not just tested. The goal row it originally shipped with, on the
  game screen, has since been replaced by the size bar and the star display.

- **The HUD, as two bars and the play space between them.** The view frames the
  level's naive grid rather than a box three times the size of the one on
  screen; the top bar carries the menu, the stars won and a size bar drawn at
  the box's own scale and tied to its right face; the bottom bar carries the
  next-level button and reserves its height whether or not it is showing. The
  title moved to the level screen and the ending caption went.

- **Level entry semantics, and the level-1 start.** The box carries over on
  progression with the new circle in the middle; level select re-enters at the
  size that beat the level and offers the next-level button there; selecting
  level one hands back the opening state. Completion is read live rather than
  from `bests`. Verified in the browser: 1 -> 2 -> grow -> compact -> beaten,
  then level select both ways, then a reload.
- **The stored session survives it.** The box is persisted now (it is part of
  the answer, not a function of the level); a store written before that falls
  back to the level's opening size. Key is still `tighter/v1` --- renaming it
  would throw away real progress for nothing.

- **The share card, the tab icon, and the head metadata.** Both pictures are
  screenshots of `/card.html` and `/icon.html`, which draw a compacted
  arrangement with the game's own stylesheet and `render.ts`; `pnpm images`
  re-takes them and `scripts/check-images.ts` says when they are stale. The
  game is named Bounding Box in the title, the `h1` and the description.

- **Shipped.** Repo public, Pages enabled as a workflow site, `checks` green
  (`check` and `deploy` both), live at
  <https://comp4020-agentic-coding-studio.github.io/comp4020-crit5-amackay/>
  with its css and js resolving under the base path.
- `PROCESS.md` written, `reflections/crit-5.md` committed, `check:evidence`
  green.

- Loss and failure conditions: not being pursued. The puzzle has a goal and you
  can struggle to reach it; that is the whole of it.
- The visible word-count budget: test and supporting notes deleted.
