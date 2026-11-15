# S1 — Borrowed Spin: tether physics

**Thread:** GPT/Codex · **Branch:** `st/s1-tether-physics` · **Read:** [the study rules](README.md), then `regions.md` § Borrowed Spin, DECISIONS A6, `docs/physics/derivation.md` (§2–3 and §7) and `data/ship-baseline.json`.

## Question
The ship catches a rotating abandoned structure with a tether, rides the line while it takes load, and lets go onto a new trajectory, borrowing momentum the way a slingshot borrows it from a planet (A6). Is this physically coherent, simulable deterministically, and large enough to matter in play?

## Deliver
1. **A derivation** (`docs/studies/s1/tether.md`), covering:
   - **The bodies:** two rigid bodies in 3D, the ship (mass properties from the baseline) and the structure (size, mass, inertia and spin as play values you propose), joined by a tether attached off each body's centre.
   - **The tether's life:** slack, taut, stretch, damping, and a break at a structural limit, from capture through release.
   - **Exchange:** momentum, angular momentum and energy passing between the two bodies, near a body under the P4 law.
2. **Numbers:**
   - the Δv the ship can borrow, set against its budget (about 690 m/s main engine, 300 kg RCS);
   - peak tension and acceleration on the crew and the ship's assemblies;
   - tether loads against real materials such as Dyneema and Zylon, with sources;
   - comparison with NASA's momentum-exchange tether studies (MXER, rotovators).
3. **Integration:**
   - A taut tether is stiff. Recommend a scheme compatible with the game's fixed-step determinism (P2, dt = 1 s), such as substeps or a constraint formulation, and report its energy and momentum drift.
   - Say what an event (capture, snap, release) does to the step.
4. **A Python reference** (`tools/studies/s1/`) with vectors covering:
   - a clean capture and release;
   - a capture too fast that breaks the tether;
   - a slack wrap;
   - a release at the wrong phase.

   Check each against conservation laws.
5. **Play read:**
   - what the player controls (capture speed, reel-in and pay-out, attitude, release time);
   - what makes it skilful rather than scripted;
   - whether it stays dangerous on the tenth run (A9).
