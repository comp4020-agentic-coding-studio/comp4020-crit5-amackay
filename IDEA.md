# Circle Packing Game — settled design

COMP4020 Crit 05 ("A game"). A gamified version of the
[circle packing in a square](https://en.wikipedia.org/wiki/Circle_packing_in_a_square)
problem. Level N is about packing N balls into the smallest square you can.

This document records decisions that are settled. Anything not listed here is
either still open (see the end) or an implementation detail deliberately left
to be worked out during the build.

## Concept

The player has N balls in an open, boxless space. They drag the balls into an
arrangement, then close a square box around them. The size the box reaches is
the score for that level. Beating par completes the level.

The interest comes from the problem itself: optimal packings for small N are
irregular and surprising, and they change character completely as N grows, so
the player cannot settle into a single strategy.

## Level structure

- Levels are N = 1, 2, 3, ... Level 1 is a single ball.
- The core sequence runs to N = 10. Completing it shows a congratulations
  message. Implement levels up to N = 20 for playtesting purposes.
- Positions carry over between levels. On completing a level, nothing resets —
  one extra ball drops into the space and the next level begins.
- The best result for each level is remembered.
- Level select lets the player return to any level reached so far. Re-entering
  a level restores the player's best arrangement for it.
- There is no reset button. Leaving to level select and coming back is the
  closest equivalent, and it restores the best arrangement rather than a blank
  one.

The N = k² levels (4, 9) have grid optima and are restful. The N = k²+1 levels
(2, 5, 10) require tearing the whole arrangement down. This rhythm comes free
from the mathematics and the carry-over mechanic is what makes it felt.

## Scoring

- A 1/2/3 star system, matching the familiar mobile-puzzle convention.
- One star, at minimum, means beating a naive square grid arrangement — side
  2⌈√N⌉ in units of ball radius. For N = 1, 4, 9 the grid is optimal, so those
  levels ask the player to match it rather than beat it.
- Three stars is tied to the known optimum for that N, with a tolerance.
- Sizes are reported in units of ball radius, matching the published tables.

## Balls and movement

The visual language is balls, not circles: rendered in 3D, viewed
orthographically from above.

- Dragging a ball lifts it clear of the others, so it moves freely without
  collision.
- Releasing a ball fixes its position in plan and lowers it back down, pushing
  its neighbours aside as it descends.
- A new ball arriving at the start of a level is dropped in, and reads as a
  drop.
- Dragging on empty background does not pick up a ball, but does bump balls
  aside — useful for fine adjustment, and it teaches the physical affordance
  immediately.
- No multi-select. Marquee selection cannot be taught without words, and the
  background bump covers most of what it would be for.

## Physics

Quasi-static: the balls settle, they do not fly. No momentum in the model that
determines scores.

The one exception is degeneracy. Small jitter is applied only where an exact
alignment would otherwise persist — a dropped ball balancing precisely on top
of another, or exactly on a wall. There is no jitter in ordinary settling: if
the player's arrangement is stuck in an aligned configuration, nudging it apart
is the player's job.

As a consequence, closing the box on an unchanged arrangement always produces
the same result, so repeatedly pressing the control is never a strategy.

## Closing the box

The box is always square.

Two interactions, on a single visible handle at the box edge:

1. **Compact.** Clicking the handle closes the box as far as it will go and
   reports the size achieved.
2. **Resize.** Dragging the handle puts the walls wherever the player wants,
   including smaller than currently fits. Set it a little tighter than your
   current best and it becomes a target to work towards. Push it further and
   the balls start to overflow, which will usually wreck the arrangement — but
   it is fun to do, and it is how the rule teaches itself.

Walls are ramped, as a virtual incline on either side of the wall rather than actual geometry: a ball
overlapping a wall is pushed away from it. With ball radius 1 the incline width on either side
is 1, so to the player it simply looks like overlapping balls being shoved away from the wall.

## Presentation

- On a level change, the view zooms to give the new N enough room. The new ball
  drops in after the zoom settles, so the drop reads as an event of its own.
- Level select is a vertical histogram: one row per N, horizontal extent
  showing the player's best size, with the target sizes marked. It doubles as a
  picture of how the optimum grows with N.

## Constraints this is built against

- A first-time player should be able to finish the core sequence in about five
  minutes.
- No tutorial and no instructional text. Everything is taught by the affordances
  themselves: level 1 is one ball and one handle, which demonstrates the whole
  game.
- There is a real failure state. Closing the box and watching it stop short of
  par is a per-attempt, unambiguous failure.

## Not settled yet

- Par values and star tolerances for each level.
- The exact tuning of the settling model, including whether it accumulates
  forces per ball or resolves contacts pairwise.
- Keyboard controls are for accessibility rather than the intended input mode.
  The shape is tab to cycle and pick up a ball, arrow keys to carry it, tab
  again to drop it, and tab onto the box handle to drive it with arrows — but
  it has not been tested.
- How the box-closing animation is rendered.
