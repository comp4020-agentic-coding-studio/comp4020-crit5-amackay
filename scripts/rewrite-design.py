# One-off: retire the landed milestones from DESIGN.md and insert the motion one.
import pathlib, re

p = pathlib.Path("DESIGN.md")
s = p.read_text()

# 1. The wall convention is now the rim, not per-axis ramps.
s = s.replace("""- **Wall ramps, not geometry.** A ball whose centre is within 1 radius outside
  a wall line is pushed inward by the overlap. There is no hard collision with a
  wall — the ramp is the whole wall model.""",
"""- **The boundary is a rim, not four walls.** A raised rim follows the square's
  outline, corners included, and the terrain falls away a radius either side of
  it, so a ball rolls off it downhill — inward if inside, outward if outside.
  There is no hard collision anywhere: the rim is a hill a ball can be pushed
  over. It is the signed distance to the square, which is what makes the corners
  fall out instead of being enumerated (see `rimAt`).
- **The screen edge is the one hard stop.** A clamp on position, not a force,
  because a ball must never be lost off screen — a guarantee, not a tendency.
  Omitted when the surface has no measured size, which is every jsdom element:
  bounds of zero would collapse the arrangement onto the origin.""")

# 2. Replace the whole build order through M5 with a "landed" summary.
start = s.index("## Build order")
end = s.index("### M6 — the box handle")
s = s[:start] + """## What is built

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

""" + s[end:]

# 3. The collisions section referred to M7 for level select; it is M8 now.
s = s.replace("not because it is quiet. Both halves resolve at M7:",
              "not because it is quiet. Both halves resolve at M8:")
s = s.replace("keyboard at all, so it lands after M7 or not this week",
              "keyboard at all, so it lands after M8 or not this week")

# 4. Renumber the remaining milestones, last first so nothing collides.
for old, new in [("### M8 — ship", "### M9 — ship"),
                 ("### M7 — level select, zoom, drop", "### M8 — level select, zoom, drop"),
                 ("### M6 — the box handle", "### M7 — the box handle")]:
    assert s.count(old) == 1, old
    s = s.replace(old, new)

s = s.replace("which is why the shell in M0 has a `nav` with nothing in it yet",
              "which is why the shell has a `nav` with nothing in it yet")
s = s.replace("- How the box-closing animation is rendered (decided in M6, from what the\n  handle turns out to feel like).",
              "- How the box-closing animation is rendered (decided in M7, from what the\n  handle turns out to feel like).")
s = s.replace("- The star tolerance widths, which M1 fixes as numbers but only a playtest\n  around M8 can judge as difficulty.",
              "- The star tolerance widths, fixed as numbers in `score.ts` but only a\n  playtest around M9 can judge as difficulty.")
s = s.replace("run `pnpm check:evidence`.", "run `pnpm check:evidence`. Revert the three-ball\nplaytest start in `main.ts`.")

p.write_text(s)
print("ok")
