# S17 — The lattice's first contact

**Thread:** GPT/Codex · **Branch:** `st/s17-lattice-first-contact` · **Worktree:** `.worktrees/s17` · **Read:**
- [the study rules](README.md);
- DECISIONS A9, A10, A12, A13 and **A16, the owner's vision for this encounter**, plus P8, P11, P12 and P13;
- `docs/CREATIVE_BRIEF.md` §6;
- `docs/studies/s5/`, especially the lattice and model/interface parts;
- S4's Unseen Cathedral (N03) and Missing Room (R03) pages in `docs/design/regions/`;
- the ship's components, power and sensors: `data/ship-baseline.json`, the `src/ship/` READMEs and `docs/handoffs/2G.md` § Ship;
- the recorder: `src/blackbox/README.md` and `docs/model/estimator-spec.md`;
- `docs/handoffs/2D.md`, R7: recording isn't yet felt as a resource.

## Question
A16 describes the encounter:
- The player enters what looks like an ordinary rock field.
- Heavy radiation strikes without warning, frying electrics and instruments. A first-time player likely dies fast.
- The way through is the Black Box's function. Switched on, it records what the sensors see, and FLIGHT shows the lattice rebuilt from that data, so the player can navigate through its centres.

What numbers and rules make that land, honestly and learnably?

## Deliver
In `docs/studies/s17/`, with a deterministic Python reference in `tools/studies/s17/`:
1. **The first pass:**
   - the lattice's geometry at the entry (from S5);
   - the dose each component takes along a few natural entry paths;
   - which systems fail first, and in what order;
   - how long a first-time ship survives.

   Aim for fast but readable: the player sees instruments fail before the loss sequence plays.
2. **The clue:** what the player can find afterwards in the records of the loss, from the ship's own instruments before they failed, that points at something unseen and structured.
3. **The Black Box function:**
   - what it is physically: which sensors, at what rate, in what processing mode;
   - what it costs in power, storage and heat;
   - why it hasn't mattered until now (P12, R7);
   - how the rebuilt lattice grows from its data, with its uncertainty;
   - what FLIGHT shows: rebuilt strands, unknown space shown as unknown and never as a gap (S5).
4. **Threading:**
   - the gaps' size against the ship's full envelope, including deployed parts;
   - how precise a pass must be;
   - the exposure an informed pass takes, with its margin.
5. **Carry-over:**
   - what the Black Box keeps across a loss (P8), and how much that speeds the next attempt;
   - whether the lattice should vary per run (A10) so that a remembered map doesn't trivialise it. Say which, and why.
6. **Reference vectors** that 3C can port as tests:
   - a component's dose along a path;
   - the failure order;
   - a reconstruction from a short recording;
   - an informed pass.
7. **Requests** for 2C (Black Box and recorder), 3A (component faults) and the screens (2D, later 3F).

Phase 3's 3C (Claude) builds the lattice alongside you, starting with the field and exposure, and takes your numbers when they land. Don't edit `src/`. Commit on `st/s17-lattice-first-contact`, and write your handoff to `docs/handoffs/s17.md` using the template.
