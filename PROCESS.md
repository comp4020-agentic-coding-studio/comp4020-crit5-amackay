# Process overview

A circle-packing puzzle. Each level adds a ball and asks for the smallest square
that still holds them all, scored against the published best-known packings.
Balls carry over, nothing resets, and the box's single handle is the whole
interface.

## Gravity, built and then deleted

The descent began as a real fall --- a `GRAVITY` constant derived from the carry
height and a fixed duration ([`362a89d`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-amackay/commit/362a89d)). Correct, and wrong:
a clock-paced fall takes the same half second whether or not anything is in the
way, so a drop into open space was half a second of nothing happening.

Rather than tune the duration, the concept went. The fall is slaved to the
arrangement now: a released ball presses down until its reach bites its nearest
neighbour, and that bite *is* the shove, so the descent advances exactly as fast
as the shove it causes. Measured in the browser rather than asserted:
0.1s into clear space, 0.25s half-blocked, 0.5s dropped squarely onto another,
against a flat 0.5s before. [`62b9a5b`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-amackay/commit/62b9a5b)

## Two harness rules deleted

Growing `CLAUDE.md` is the week's work; two of its rules grew the wrong way. A
twenty-word visible-prose budget was a proxy for the spec's no-instructions
line, and outlived it --- spreading into the spec tests, both design docs and six
source comments. Separately, *"it can be lost"* was read literally, so the agent
kept reporting the missing failure state and proposing ways to add one; for a
puzzle, the struggle to reach the threshold is the losable part.

Both were deleted rather than argued with each time they surfaced: a note left
in the harness is one the agent keeps re-deriving from. The spec test came out
in its own commit, ahead of the prose changes; the two checks carrying the real
spec line --- no instruction-shaped copy, no sentences on screen --- stayed, on
the built page and the mounted game both.
[`b6f673d...db60cb0`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-amackay/compare/b6f673d...db60cb0)

## The HUD, sized against a measurement rather than an impression

A UX review, played at both marked sizes with the geometry read out of the DOM,
found the game drawn at 196--429px on a 1920x1080 screen and 71--155px on a
390x844 one. The cause was in the camera, not the art: the view framed
`openSide(N) + 2*VIEW_MARGIN` --- `par(N) + 9` radii --- around a box that is
usually a quarter of that. It now frames `par(N) + 3`, the square the level
asks you to beat, and the box doubles on both screens.
[`697228e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-amackay/commit/697228e)

That paid for a HUD. Two bars take the top and bottom and the game gets the
band between them; the top bar carries the stars won and a size bar drawn at
the box's *own* scale, its left edge on the box's centre, so the mark sits at
the same screen x as the box's right face and a dotted line draws the link.
Checked by reading both back in the same frame: 1334.39 against 1334.40.
[`7cd6374...6c23335`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-amackay/compare/7cd6374...6c23335)

Two things the review found that the tests could not. `stars()` had been
computed, stored and never drawn, so a three-star packing and a one-star one
looked identical. And a handle drag set the box without recording it, so
squeezing it tight by hand beat a level --- `levelComplete` reads the live box
--- while leaving that level's row on the screen empty. Both were green all
week.

## The art pass: a diagram, which made a rule visible

The subdued 3D look --- carpet, cardboard tray, lit glass balls --- went for a
geometry diagram: ruled paper, two inks, no light. Ink is the figure and red is
measurement and the hand, so nothing on screen is ambiguous about whether it is
part of the packing or part of the reading of it.

The paper is ruled at one ball radius and phased on the world origin, which
makes it the game's own unit rather than texture: a naive packing's ball centres
land on intersections, a level's opening box has its faces on lines, and the
ruler in the top bar graduates at the same pitch.

The payoff was not planned. Circles drawn as outlines with a translucent wash
overlap as crossing arcs and a darker lens, so *"these do not fit"* is now said
on the circles themselves --- which was an open item, and which the old opaque
discs could not say at all. Two level-screen faults surfaced with it: three star
sizes drawn on one centre line were a single blot at the early levels, and the
padlock on a locked row had been drawn on top of that row's numeral.
[`7b243eb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit5-amackay/commit/7b243eb)
