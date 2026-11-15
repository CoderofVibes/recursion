# S6 — Paired openings (system X)

**Thread:** GPT/Codex · **Branch:** `st/s6-paired-openings` · **Read:** [the study rules](README.md), then `docs/design/expedition.md` (system X, Petal Gallery, Homeward Reach, the opening and Earth), `regions.md` (Petal Gallery, Turning Rim, Passage, Familiar Sky, Far Aperture), DECISIONS A3, A6, A9–A13 and P11, and `docs/physics/derivation.md`.

## Question
Petal Gallery, Turning Rim and the Passage home share one fiction: authored pairs of finite openings that connect two places in space, which the ship can see through and, at full size, fly through. Specify the simplest version that is coherent, deterministic, honest to the model, and spectacular.

## Deliver
In `docs/studies/s6/`, with a Python reference in `tools/studies/s6/`:
1. **Kinematics:**
   - each opening is a finite moving boundary with its own pose and motion;
   - the mapping of position, velocity, attitude and spin from one side to the other;
   - a stationary pair (Petal Gallery) and a moving, rotating pair (Turning Rim, the Passage).
2. **Crossing:**
   - a whole ship partly through, with clearance against the rim for the full hull and its appendages;
   - what happens to forces and thrust on each side mid-crossing;
   - what a collision with the rim means.

   It must stay physically coherent and deterministic (P2).
3. **Gravity and light across the pair:**
   - Do bodies on the far side pull through the opening?
   - What does the window show through it (A3: light only; P11)?
   - What can the ship's sensors measure through it?
4. **The model:**
   - how forecasts cross the opening;
   - how the opening's motion is measured from rim points;
   - what the player adopts as a rule, versus fitted numbers.
5. **Play:**
   - the observation-only tiny openings first, which give the later ship-sized passage its weight;
   - repeated windows on a deterministic cycle;
   - what Recall and loss mean at the Passage (A9);
   - why it stays tense on a familiar run.
6. **Reference vectors:**
   - a clean crossing;
   - a partial crossing that clips the rim;
   - a sightline through a moving pair;
   - a forecast across the boundary.
