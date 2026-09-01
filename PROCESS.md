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
