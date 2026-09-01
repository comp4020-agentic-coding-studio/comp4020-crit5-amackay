# TODO — crit 5

The repo owner's working list. Ordered by what the cutoff (Wed 07:00) forces,
not by what is most interesting. Kept current as decisions are made.

## Now — nothing else counts until these are done

- [ ] **`PLAYTEST_START_LEVEL` back to 1** (`src/scripts/main.ts`). One line,
      already marked TEMPORARY. Also fixes the disagreement between the
      server-rendered opening screen (level 1) and what hydration opens.
- [ ] **Play it at 390x844.** A fully marked viewport that nothing here tests.
      This is also the route to the spec's "one change that came from playing
      the finished game", which is currently unevidenced. The site is live now,
      so this can be done on the phone against the real URL.
- [ ] **`FINISH_TEXT`** in `src/scripts/mount.ts` is the placeholder
      `"ten levels, tighter"`. Owner's wording; it is the last thing a marker
      reads.

## Next

- [ ] **Level entry semantics** — one change in `src/game/session.ts`, three
      symptoms:
      - a level opened from level select should start at the box size recorded
        for it, not at `openSide(n)`; `enterLevel` restores the best balls but
        resets the side
      - the next-level button must appear for a level re-entered from level
        select, so handing the phone to someone at level 1 plays like a fresh
        game without resetting the save
      - the ball added on progression arrives in the centre, not at the top
        (blocked on the descent decision below)
- [ ] **Check a stored session survives** the level-1 revert and any session
      shape change. `deserialise` fails safe; verify rather than assume. The
      `localStorage` key is `tighter/v1` and predates the rename.

## If there is time

- [ ] **Level select as its own screen** — vertical scroll, all levels shown,
      unreached ones greyed with a lock icon. Standard convention.
- [ ] **A wordless indicator of the current goal**, the next star threshold
      being aimed at.
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
