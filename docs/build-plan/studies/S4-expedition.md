# S4 — The expedition in 3D: regions and route

**Thread:** GPT/Codex · **Branch:** `st/s4-expedition` · **Read:** [the study rules](README.md), then `docs/design/expedition.md` (1F), `docs/design/encounter-template.md`, `docs/handoffs/1F.md`, all of `docs/handoffs/region-proposal/` and DECISIONS A6 and A8–A13.

**Ownership exception:** besides your study folders, you own `docs/design/expedition.md` and may add `docs/design/regions/`.

## Goal
Rewrite the expedition design for the owner's decisions:
- 3D flight (A11);
- the forward route with two branches, optional detours and the Braided Crossing gate that needs both signature hazards (A13);
- recurrence of the whole expedition (A9);
- geometry varied between runs (A10);
- no pause inside an encounter (A12).

GPT's region proposal is the starting point; 1F's catalogue keeps its IDs and engineering questions.

## Deliver
1. **`docs/design/expedition.md`, rewritten:**
   - **The route graph:** A13's structure, with the cross-transfer and every detour.
   - **Volumes and pockets:** which regions are distinct authored volumes, and which are pockets inside another.
   - **Pacing:** active minutes for a first run and an expert run, as estimates.
   - **The Braided Crossing gate:** how a one-branch player learns that the other branch is needed, without explanatory text.
   - **Fixed and varied:** what carries between runs and what changes.
2. **One page per region** in `docs/design/regions/`, on the encounter template:
   - arrival in 3D;
   - the question it asks;
   - its objective;
   - per-run variation ranges;
   - pressure on the tenth run;
   - the systems it uses;
   - what Black Box keeps.

   **Fix Twin Deeps:** it is the Gravity range, so its masses and sizes are fixed (A10) and its exit is the slingshot past Beta through the belt (A6).
3. **Conflicts and dependencies:**
   - every place a region depends on roll (default held, A11), on a system not yet built (wells, lattice, paired openings), or on a proposed new physics system (Countercurrent, Tidal Orchard, Borrowed Spin);
   - a build order by dependency, for the owner to choose from.
