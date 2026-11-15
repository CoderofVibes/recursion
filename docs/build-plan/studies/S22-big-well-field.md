# S22 — The well field: real funnels

**Thread:** GPT/Codex · **Branch:** `st/s22-big-well-field` · **Worktree:** `.worktrees/s22` · **Read:**
- [the study rules](README.md);
- DECISIONS **A19, the owner's correction**, then A10, A11, A13 and A15 (Q01, Q02 and Q05 still hold; Q04 is superseded);
- `docs/CREATIVE_BRIEF.md` §7, with the owner's clarification under it;
- `docs/design/visual-direction.md`, the wells' funnel drawing;
- `docs/studies/s5/` and `docs/studies/s16/`, with their `tools/studies/` scripts. Treat them as tools and evidence to reuse, not as the shape to build.
- S4's Well Garden (P03) and Hinge (R02) pages in `docs/design/regions/`;
- `docs/build-plan/phase-3.md` §3B;
- `docs/studies/s15/README.md`, for frame cost.

## Question
The owner's wells are **real, long, narrow funnels**. The earlier studies built something else: invisible spheres that only reverse a burn's push. A19 sets the vision:
- **The pull:** a well pulls the ship toward its narrow end, even while coasting.
- **The trap:** inside it, the radial effect of the ship's own propulsion reverses (brief §7), so burning away can drag the ship in. Sideways burns stay ordinary, and they're the way out.
- **The crush:** the narrow throat crushes the ship.
- **The field:** wells lie at random orientations through 3D, in a big field, "destruction and beauty". New ones appear, each warned of by a precursor, and going around means going a very long way.
- **They're visible.** The player sees the funnels through the window, with striking visuals, so shape and position come from sight. What a well does (the pull, the reversal, the crush) must still be learned from evidence.

What physics, field and rules deliver that, fairly and learnably?

## Deliver
In `docs/studies/s22/`, with a deterministic Python reference in `tools/studies/s22/`:
1. **One funnel's physics.** It's fictional, so label it, and keep it deterministic (P2) and the same in every run (A10).
   - **Geometry:** an axis, a length, the mouth's radius, the throat's radius, and a smooth edge band like S5's.
   - **The pull:** its direction (down the funnel toward the throat), how its strength varies with position, and its effect on a coasting ship. Recommend whether the accelerometer feels it. Like gravity, it shouldn't (P7).
   - **The reversal inside:** say what "toward the well" means inside a funnel (toward its axis, toward its throat, or a blend), and justify it. Reuse S5's reflection, T = I − 2w eeᵀ, with that direction. A15 Q01 still holds: the accelerometer senses the reversed push.
   - **The crush:** where and how the throat destroys the ship (A9's loss), and how close a ship can come and still escape.
   - **The escape:** show that sideways burns get a ship out from where the brief says they should, and say what it costs.
2. **The field:**
   - the number of funnels, their spacing, sizes and extent through 3D, at random orientations, with no overlaps (A15 Q05);
   - proof that going around costs far more than going through. Measure it against the 6,000 kg main load and the garden's budget (1,000 kg main, 30 kg RCS), ideally beyond what a run can afford.
3. **Wells that appear.** A rule within the integrator's guardrails:
   - deterministic from the run's seed;
   - learnable across runs: a pattern, not dice;
   - preceded by a precursor the ship's sensors can detect before the well can matter. Say what the precursor is, which sensor sees it, and its lead time.
   - never switching on with the ship already inside it;
   - never overlapping another well.
4. **Fairness:**
   - informed crossings with stated margins;
   - the wrong-belief forecast visibly wrong before it's lethal;
   - more than one way through;
   - no seed lethal on arrival;
   - a first-time player who burns away by instinct gets dragged in readably, with time to try something else.
5. **Beauty:** what the field, a funnel, a precursor and a well's arrival look like:
   - **through the window:** visible light, the player's own eyes, and the encounter's showpiece;
   - **on FLIGHT,** from 1E's funnel drawing (contour rings tightening toward a long throat), pointing in random directions.

   Say what the camera can measure from what it sees (position, axis, size), and what only the ship's motion can reveal. FLIGHT draws belief-side data only (P11).
6. **Seeds:** S16's catalogue and certificate approach, applied to funnels, with rejection rules and rates.
7. **Performance:** the cost per funnel per simulation tick. Keep a large field within S15's frame budget, and use spatial indexing if it's needed.
8. **A reuse map for 3B:** what carries over unchanged from S5, S16 and 3B's current work (the reflection maths, the edge smoothing, the field registry and loading, the seed tools, the accelerometer rule), what changes, and what's new (the pull, the funnel shape, the crush, appearing wells).
9. **Reference vectors** for 3B:
   - a coasting ship pulled in;
   - an instinctive burn that drags the ship in;
   - a sideways escape;
   - a crush at the throat;
   - a pop-up with its precursor;
   - a crossing among many funnels;
   - the expensive way around;
   - a rejected seed.

3B (GPT) keeps building its mechanics and will swap in your design. Don't edit `src/`. Commit on `st/s22-big-well-field`, and write your handoff to `docs/handoffs/s22.md` using the template.
