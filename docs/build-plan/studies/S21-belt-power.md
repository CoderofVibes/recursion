# S21 — The Gravity range's belt and power

**Thread:** GPT/Codex · **Branch:** `st/s21-belt-power` · **Worktree:** `.worktrees/s21` · **Read:**
- [the study rules](README.md);
- DECISIONS A6, A10, A12, **A18**, P13, P14 and P16;
- `docs/studies/s8/` and `tools/studies/s8/`: the ring, the routes and the pass table;
- `docs/handoffs/2G.md`: the slingshot study, the belt, and the open questions on power and RCS;
- `src/content/gravity-range/`, read only;
- `data/ship-baseline.json` and the `src/ship/` READMEs, for power and loads;
- `docs/studies/s15/README.md`: rocks cost frame time.

## Question
A18 asks for two things in the Gravity range:
- **The belt corrals the player.** A pass that goes round it must be impractical, so the slingshot goes through the field. Today a wide pass at 1,100–1,570 km misses the ring and still leaves fast enough.
- **Running out of power kills the player,** so power has to be balanced as a real constraint. Today, with the arrays stowed, the fuel cells run dry at about 41 h of the 64 h slingshot, and nothing happens.

What belt, and what power balance, make both true and keep the encounter fair?

## Deliver
In `docs/studies/s21/`, with a deterministic Python reference in `tools/studies/s21/`:
1. **The belt.** Compare the owner's two options and recommend one:
   - widen the belt outward, so that any pass outside it leaves below the exit gate;
   - or bank its outer edge with striking radiation clouds. These are fictional, so say so, and give an exposure rule consistent with P13 and the lattice's (3C).

   For the chosen option, give:
   - its radii, rock count and density profile, with S15's frame cost per rock;
   - S8-style tables showing that outside passes fail, informed threading succeeds with a stated margin, and blind passes fail readably;
   - confirmation that S8's seed rules still hold.
2. **Power:**
   - the energy budget across the encounter: fuel cells, arrays and loads;
   - where power runs out, with the arrays deployed and without.

   Recommend values such that:
   - an informed player who deploys and points the arrays has a stated margin;
   - a player who ignores power dies, with warning time the screens can show (A12: a caution drops warp to 1×);
   - both hold for hand-flown and planned routes.

   Say which values belong to the ship's baseline (`data/`, `src/ship/`) and which to the encounter's content.
3. **Reference vectors** for 2F:
   - a power death;
   - an informed run with the arrays;
   - an outside pass that fails the gate;
   - an informed thread through the belt.

2F builds the mechanisms now and applies your values when they land. Don't edit `src/`. Commit on `st/s21-belt-power`, and write your handoff to `docs/handoffs/s21.md` using the template.
