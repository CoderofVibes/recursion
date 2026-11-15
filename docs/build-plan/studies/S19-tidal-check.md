# S19 — Tidal Orchard: is the effect real?

**Thread:** GPT/Codex · **Branch:** `st/s19-tidal-check` · **Worktree:** `.worktrees/s19` · **Read:**
- [the study rules](README.md);
- DECISIONS A8 (roll is held), A10, A13, A15 (Q21: check the size first), P4 and P16;
- `docs/physics/derivation.md`, especially §11 on gravity gradients;
- S4's Tidal Orchard page in `docs/design/regions/`, and `docs/handoffs/region-proposal/regions.md`;
- the 3D ship: mass properties, attitude control and roll hold, in `data/ship-baseline.json`, the `src/ship/` READMEs and `docs/handoffs/2G.md` § Ship.

## Question
Tidal Orchard depends on P4 gravity, spread across the ship's length, twisting the ship in ways a player can see and use. 2G found no gravity-gradient torque worth modelling at 400 km (at most 0.21 N·m). Near the Orchard's bodies, under P4, on the actual ship with roll held: is the effect big enough to see, and big enough to matter?

## Deliver
In `docs/studies/s19/`, with a deterministic Python reference in `tools/studies/s19/`:
1. **Torque and attitude response** across the body masses and distances that A10 and P16 allow.
2. **Against the ship:**
   - the attitude controller's authority;
   - sensor noise;
   - how long it takes to observe;
   - whether roll hold cancels it.
3. **A recommendation:** build the region, resize it, or defer it. Never multiply the effect artificially (S11).
4. **Reference vectors**, if the effect is real.

Don't edit `src/`. Commit on `st/s19-tidal-check`, and write your handoff to `docs/handoffs/s19.md` using the template.
