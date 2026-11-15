# S15 — Speed on a modest laptop

**Thread:** GPT/Codex · **Branch:** `st/s15-modest-laptop` · **Worktree:** `.worktrees/s15` · **Read:**
- [the study rules](README.md);
- `README.md`, `package.json` and `vite.config.ts`;
- `src/app/`, the entry point and the loop;
- `src/view3d/README.md` and `src/theme/README.md`;
- DECISIONS P2 and A12 (warp from 1× to 2000×, and the `saturated` flag);
- `docs/studies/s9/browser-observations.md`.

## Question
Judges will open the live site on whatever laptop they have. On a modest machine:
- How fast does Recursion load, and how smoothly does it run?
- Where does the time go?
- What are the cheapest fixes that change nothing about the game?

## Deliver
In `docs/studies/s15/`, with a deterministic, re-runnable measurement script in `tools/studies/s15/`. The script uses Node and the Chrome already on this machine, driven over the DevTools protocol. Install nothing.

1. **Load:**
   - the size of everything `npm run build` emits, raw and gzipped, and what each large chunk contains;
   - the time to first interaction for the production build served locally with `vite preview`, with a cold cache and a warm one.

   Measure both unthrottled and on a modest-laptop profile: the CPU throttled 4× through DevTools, plus a typical broadband network profile. State the profiles you used.
2. **Frames:** frame time (median, 95th percentile and worst) in each of these views, at 1× and at top warp, under both profiles:
   - the room;
   - each console page;
   - FLIGHT;
   - MAP.

   Say when the simulation reports `saturated`, and how much ship time per wall second it actually reaches.
3. **Where the time goes:** a profile of the worst case, naming the functions or draw calls responsible.
4. **Fixes, ranked by gain against risk.** Give each fix:
   - its owner's lane: 2D for `src/view3d`, `src/theme` and `src/console`; 2G for the simulation, model and game; the integrator for build config;
   - the measurement that would prove it.

   Candidates include code splitting, lazy-loading views, texture and geometry sizes, and rendering on demand. Deliver any concrete change as a patch file under `docs/studies/s15/`. Never commit it to `src/` or config.
5. **What to recheck after 2G's 3D merge.** The 3D model and simulation will change the cost of each step.

Measure only the local build, and don't load the live site repeatedly. Never commit changes to `src/` or root config, and install nothing. Commit on `st/s15-modest-laptop`, and write your handoff to `docs/handoffs/s15.md` using the template.
