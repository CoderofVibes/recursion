# S2 — Borrowed Spin: hardware, sensing and the ship

**Thread:** GPT/Codex · **Branch:** `st/s2-tether-hardware` · **Read:** [the study rules](README.md), then `regions.md` § Borrowed Spin, `docs/engineering/` (1C's ship baseline and couplings), `data/ship-baseline.json`, `src/ship/README.md` and DECISIONS P7 and A5.

## Question
The ship has no tether today. What is the smallest real hardware that makes Borrowed Spin possible, and how does it fit the ship's power, thermal, mass, configuration, sensing and damage model?

## Deliver
In `docs/studies/s2/`:
1. **The hardware:**
   - the capture device (grapple, harpoon or net: compare them);
   - the tether, winch, brake and cutter;
   - masses, power draw, heat, mounting point on the hull, and stowed versus deployed geometry.

   Write it as new assemblies in the baseline's own format (a proposed JSON fragment, not an edit to `data/ship-baseline.json`).
2. **Couplings:**
   - what deploying and loading it does to the centre of mass, inertia and the four deployment configurations;
   - what draws from which bus;
   - what heats up;
   - how wear and damage (A5) change it.
3. **Sensing:**
   - how the ship knows the line's state without being told truth (P7: accelerometers sense tension as non-gravitational acceleration; a load cell, payout counter or camera on the attachment);
   - what the measurements look like, with noise.
4. **Commands:** what the player can order (arm, fire, reel, brake, release, cut) and what each costs.
5. **Failure modes** with consequences:
   - a miss;
   - a snag;
   - a slack snap-back;
   - recoil on release;
   - a cut under load;
   - a broken winch.
6. **Precedents with sources:**
   - TSS-1 and TSS-1R (the tethered satellite missions);
   - YES2;
   - SEDS;
   - NASA's MXER;
   - ESA's e.Deorbit capture studies.

   Say what each teaches about what goes wrong.
