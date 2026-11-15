# S3 — Borrowed Spin: the encounter and the model

**Thread:** GPT/Codex · **Branch:** `st/s3-borrowed-spin` · **Read:** [the study rules](README.md), then `regions.md` § Borrowed Spin, `docs/model/estimator-spec.md` (§3, §6–§9), `docs/handoffs/2C.md`, `docs/design/encounter-template.md` and DECISIONS A2, A4–A6, A9, A10 and A12. S1 and S2 run alongside you: use placeholders for their numbers, and reconcile in your handoff with whatever they have committed.

## Question
How does Borrowed Spin play as an encounter, and how does the predictive model forecast and learn a tethered swing without ever planning it (P6)?

## Deliver
In `docs/studies/s3/`:
1. **The encounter**, on the template:
   - arrival;
   - the approach to a rotating structure in 3D;
   - capture, the swing and release onto a useful trajectory;
   - where it rejoins (Stillwater, A13);
   - its objective;
   - what failure teaches and what Black Box keeps;
   - the per-run variation ranges (A10: spin axis, attachment points, structure inertia, arrival state);
   - why it stays dangerous on the tenth run (A9);
   - how it plays with no pause inside the encounter (A12).
2. **The model:**
   - Is the tether known physics with numbers to fit (stiffness, damping, the structure's inertia and spin) or a rule the player adopts (P5)? Recommend one.
   - What the forecast and its envelope show before capture, while the line is taut, and after release.
   - Where the horizon falls.
   - How the structure's rotation is measured.
   - What the spec (`estimator-spec.md`) would need as an addendum.
3. **The interaction:** what the player sees and does in the FLIGHT view and on the console at each phase, written as a spec for the 2D screen thread (not built here).
4. **Legibility:** how a first-time player understands what happened when it goes wrong, without explanatory text.
