# S16 — The Well Garden's layout

**Thread:** GPT/Codex · **Branch:** `st/s16-well-garden` · **Worktree:** `.worktrees/s16` · **Read:**
- [the study rules](README.md);
- DECISIONS A10, A11, A13 and A15 (Q01–Q05 answered);
- `docs/CREATIVE_BRIEF.md` §7;
- `docs/studies/s5/` (`wells.md` and its reference) and `tools/studies/s5/`;
- S4's Well Garden (P03) and Hinge (R02) pages in `docs/design/regions/`;
- `docs/studies/s8/`, whose seed method is a model for this one;
- the 3D ship: `data/ship-baseline.json` and `docs/handoffs/2G.md` § Ship.

## Question
A15 fixes how a well behaves:
- inside a well, the radial part of the ship's push is reversed;
- its edge is S5's smooth band (40–50 km) around a 1 km core;
- it adds no torque;
- wells don't overlap, for now;
- there are enough wells that a first-time player can't simply dodge them all.

Where do the wells go, so that three things hold?
- The garden can't be crossed without meeting a well.
- An informed player can cross it with a stated propellant margin.
- A player flying on the old belief sees a forecast that's visibly wrong before it's lethal.

## Deliver
In `docs/studies/s16/`, with a deterministic Python reference in `tools/studies/s16/`:
1. **A layout:**
   - the number of wells, with their positions and radii in the garden's frame;
   - the garden's entry, its exit and the arrival geometry;
   - why each well sits where it does.
2. **Unavoidable:** show that every route across within the ship's propellant meets at least one well's influence. If some routes don't, give their share and say how to close the gap. Avoiding every well must cost more than the ship carries.
3. **Fair:**
   - an informed crossing, with its stated margin;
   - the wrong-belief forecast drifting visibly (a measurable residual) before contact or loss;
   - no seed lethal on arrival;
   - more than one way through.
4. **Seeds (A10):**
   - which variations from run to run keep item 3 true, such as arrival direction and small offsets;
   - rejection rules a generator can apply, and the share of seeds they reject.
5. **Reference vectors** that 3B can port as tests:
   - a burn inside a well: radial push reversed, tangential unchanged;
   - a crossing of the edge band;
   - an informed crossing;
   - a rejected seed.

Phase 3's 3B (Claude) builds the wells and reads your layout and vectors. Don't edit `src/`. Commit on `st/s16-well-garden`, and write your handoff to `docs/handoffs/s16.md` using the template.
