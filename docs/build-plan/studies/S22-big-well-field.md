# S22 — The big well field

**Thread:** GPT/Codex · **Branch:** `st/s22-big-well-field` · **Worktree:** `.worktrees/s22` · **Read:**
- [the study rules](README.md);
- DECISIONS A10, A11, A13 and **A15**: Q01–Q05, including the owner's answers to S16;
- `docs/CREATIVE_BRIEF.md` §7;
- `docs/studies/s16/` and `tools/studies/s16/`: its generator, certificates and bypass analysis;
- `docs/studies/s5/`;
- S4's Well Garden (P03) and Hinge (R02) pages in `docs/design/regions/`;
- `docs/build-plan/phase-3.md` §3B;
- `docs/studies/s15/README.md`, for frame cost.

## Question
S16 placed three wells. That stops a first-time player, but a player who knows about them can go around for 727 kg of main propellant. The owner answered with more ambition:
- **a big field** of wells, "a whole gravity well field of destruction and beauty";
- **wells that appear spontaneously**, corralling the player, so going around means going a very long way around;
- **wells spread through 3D at random orientations**, not all upright as the player sees them.

What field and what rules deliver that, fairly and learnably?

## Deliver
In `docs/studies/s22/`, with a deterministic Python reference in `tools/studies/s22/` that extends S16's:
1. **The field:**
   - the number of wells, their spacing and radii, and the field's extent through all three dimensions;
   - no overlaps (A15 Q05).

   Show that the cheapest way around, from S16's upstream skirt or anywhere else, now costs far more than before. State it against the 6,000 kg main load and the garden's budget (1,000 kg main, 30 kg RCS), and ideally beyond what a run can afford.
2. **Orientation.** A spherical well looks the same from every side, so "random orientation" needs a shape. Compare these, and recommend one; the owner decides:
   - **(a)** spherical wells as now, drawn with an oriented form (such as a funnel or vortex) whose axis points in a random direction;
   - **(b)** wells with a physical axis, where the reversal depends on that axis, so the player must learn each well's orientation.

   For each, give the physics (consistent with S5 and P2), what the ship's sensors can learn of it, the cost to build and run, and what it does to play.
3. **Wells that appear.** Propose a rule for wells that switch on during the encounter. The integrator sets these guardrails, from P2, P6, P11 and A10:
   - deterministic from the run's seed;
   - learnable across runs: a pattern, not dice;
   - preceded by something the ship's sensors can detect before the well can matter, so a careful player can react;
   - never switching on with the ship already inside its core or edge band, so there are no unavoidable instant losses;
   - never overlapping an existing well.

   Propose the precursor (its physical signature, which sensor sees it, and its lead time), the rule itself, and how a player learns it.
4. **Fairness:**
   - informed crossings with stated margins, including pop-ups;
   - the wrong-belief forecast visibly wrong before it's lethal;
   - more than one way through;
   - no seed lethal on arrival.
5. **Beauty:** what the field, a precursor and a well's arrival look like to the ship's sensors and on FLIGHT. Write it as notes for 3B and the screens, using belief-side data only (P11).
6. **Seeds:** extend S16's catalogue and certificates to the big field, with rejection rules and rates.
7. **Performance:** the cost per well per simulation tick. Many wells are evaluated every step, so keep a large field within S15's frame budget, and propose spatial indexing if it's needed.
8. **Reference vectors** for 3B:
   - a pop-up with its precursor;
   - a crossing among many wells;
   - the expensive way around;
   - a rejected seed.

3B (GPT) is building the mechanics now on S16's three-well prototype, and will swap in your field. Don't edit `src/`. Commit on `st/s22-big-well-field`, and write your handoff to `docs/handoffs/s22.md` using the template.
