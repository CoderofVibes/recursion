# S5 — Inverse wells and the lattice in 3D

**Thread:** GPT/Codex · **Branch:** `st/s5-wells-lattice` · **Read:** [the study rules](README.md), then `docs/CREATIVE_BRIEF.md` §6–§7, `docs/physics/derivation.md` §8–§9, `docs/model/estimator-spec.md` §6.5, `src/sim/fields/README.md` and `regions.md` (Well Garden, Hinge, Unseen Cathedral, Missing Room, Braided Crossing).

## Question
The brief's two signature fictions were derived for a plane. What are they in a 3D volume, and what exactly must a code thread build?

## Deliver
In `docs/studies/s5/`, with a Python reference in `tools/studies/s5/`:
1. **Inverse wells in 3D:** generalise 1B's bounded local thrust fiction, including its recommended smooth annulus.
   - The radial propulsion response reverses inside a well; tangential propulsion, gravity and coasting do not.
   - Cover: spherical regions; overlapping or neighbouring wells; Hinge's near-zero-response band; event handling at boundaries under fixed steps (P2); energy bookkeeping for the field's extra work.
2. **The lattice in 3D:**
   - finite, tilted, staggered sheets of strands with clear centres;
   - steep proximity exposure;
   - cumulative per-component electrical effects;
   - whole-ship swept-volume clearance, including deployed appendages;
   - reconstruction through the existing sensors.

   No hit counters or random survival rolls.
3. **The model:** how each one shows up in the evidence, and what the model fits.
   - Is the well's response a rule the player adopts (spec §6.5)?
   - What does the lattice's reconstruction carry into belief?
   - What would the spec need?
4. **The sim interface:** a proposed field interface for `src/sim/fields/` in 3D (2G owns `src/sim/` now, so propose; don't write it), with the tests a code thread must pass.
5. **Reference vectors** for each field. Cover: a burn across a well boundary; a coast through one; a pass through a lattice opening with a deployed radiator; a glancing exposure.
