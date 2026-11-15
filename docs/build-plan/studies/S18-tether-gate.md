# S18 — The tether's gate and run configurations

**Thread:** GPT/Codex · **Branch:** `st/s18-tether-gate` · **Worktree:** `.worktrees/s18` · **Read:**
- [the study rules](README.md);
- DECISIONS A9, A10, A13, A15 (Q11–Q19 answered) and P14;
- `docs/studies/s1/`, `s2/` and `s3/`, with their handoffs;
- S11's queue entries Q11–Q19 (`docs/studies/s11/queue.md`);
- the final 3D ship: `data/ship-baseline.json`, the `src/ship/` READMEs and `docs/handoffs/2G.md` § Ship.

## Question
A15 approves a bounded Borrowed Spin prototype, but first it must pass a gate: reconciling its loads. S1's best manoeuvre peaks at 144 kN, and S2's hardware is rated for 8 kN. A15 also makes the target's inertia vary between runs, through defined fixed-mass configurations. Can a useful tether manoeuvre work on the real 3D ship within a buildable rating? And what are the run configurations?

## Deliver
In `docs/studies/s18/`, with a deterministic Python reference in `tools/studies/s18/`:
1. **The gate.** Using the final ship's mass, inertia and control authority, find one of these:
   - manoeuvres that give a useful velocity change within a stated rating;
   - or the smallest rating that makes S1's manoeuvre buildable, with its mass, power and heat.

   Active payout and braking are allowed (Q16). Recommend pass or fail, with the numbers.
2. **If it passes:** the revised kit (Q12) and what it costs in delta-v.
3. **Run configurations (Q17):**
   - a set of fixed-mass internal layouts for the target structure, with their inertia tensors;
   - how each looks and behaves to the ship's sensors;
   - how the player tells which one this run has. S3 found that passive tracking alone can't identify absolute inertia, so say what does.
   - how much each changes the manoeuvre.
4. **Failure (Q18):** what a cable failure does to the ship at item 1's loads (mount damage, the line, recoil). An abort must leave real damage that lasts the rest of the run.
5. **Reference vectors** a future tether thread can port as tests.

Nothing builds the tether yet. This study decides whether it can be built. Don't edit `src/`. Commit on `st/s18-tether-gate`, and write your handoff to `docs/handoffs/s18.md` using the template.
