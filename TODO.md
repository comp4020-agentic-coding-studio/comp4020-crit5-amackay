# TODO — crit 5

The repo owner's working list. Ordered by what the cutoff (Wed 07:00) forces,
not by what is most interesting. Kept current as decisions are made.

## Now — nothing else counts until these are done

- [ ] **Play it at 390x844.** A fully marked viewport that nothing here tests.
      This is also the route to the spec's "one change that came from playing
      the finished game", which is currently unevidenced. The site is live now,
      so this can be done on the phone against the real URL.
- [ ] **`FINISH_TEXT`** in `src/scripts/mount.ts` is the placeholder
      `"ten levels, tighter"`. Owner's wording; it is the last thing a marker
      reads.

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
- [ ] **The ending wording.** `FINISH_TEXT` is the last of the rename; the
      title, `h1` and `description` are done.

## Needs a decision before any code

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

- **Level select as its own screen, and the goal indicator.** A menu button
  opens a sheet of all twenty levels, locked ones greyed with a drawn padlock;
  the game screen keeps one row for the current level, its bar the box as it
  stands and its bold notch the next star. Both looked at in a browser at
  1920x1080 and 390x844, not just tested.

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
