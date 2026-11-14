# 1E — Visual direction, then the standing UI lane

**Thread:** Claude, working live with the owner, for the whole build · **Branch:** `p1/1e-visual` (worktree `.worktrees/1e`) · **Phase:** starts in 1, continues through 5

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The owner is the creative decision-maker. They set the visual direction in the first hour, then keep dialling in the game's look and feel in this thread while the other threads build. Read first:
- `docs/CREATIVE_BRIEF.md`, especially §10 (presentation and controls), §6 (lattice reconstruction look), §7 (wells as long narrow funnels), §3 (Black Box presence).
- `docs/DECISIONS.md`, especially P1 (planar flight, 3D presentation), P10 (display semantics), P6 (forecast with honest uncertainty), P11 (the UI shows only what the ship knows).
- `docs/build-plan/README.md` § Conventions and § UI lane.
- Once 1A has merged into your branch: `src/contracts/README.md` (especially `view.ts`) and the fixtures in `src/contracts/fixtures/index.ts`.

## Goal
Own how the game looks. The console (2D, later 3F) and 3D view (2E, later 3F) threads own *what* is on screen and how it behaves; they take every visual value and instrument primitive from `src/theme/`. So the owner's look-and-feel changes land here and show up everywhere, without editing anyone else's files.

## You own
- `prototypes/`: standalone experiments (own `index.html`, Three.js from a pinned CDN version, no dependency on the main app).
- `docs/design/visual-direction.md`, `docs/design/img/`.
- `src/theme/`:
  - **tokens**: colour, type, spacing, line weights and dash patterns, motion durations and easing;
  - **instrument primitives** (`src/theme/components/`): React components with no game logic, such as panel frame, readout, gauge or bar, trace or sparkline, toggle, alert, Black Box mark;
  - **3D styles** (`src/theme/three/`): materials, colours and line styles for forecast, trail, envelope, footprint, ticks, coverage;
  - **UI lab** (`src/theme/lab/`): a dev-only page that shows the primitives and styles on the contract fixtures. Put its entry at `src/theme/lab/index.html`; with `npm run dev` it is served at `/src/theme/lab/index.html`. It is not part of the production build.
- `src/theme/` is belief side (P11): import from `src/contracts/index.ts` and `src/contracts/fixtures/index.ts`, never from truth.

## Part 1: direction (first hour)
1. Show the owner two or three distinct directions quickly as running prototypes, not descriptions. Each should show: the dim compartment and command table, the integrated display, the live 3D sensor view, one or two instruments, and Black Box's presence.
2. Let the owner pick and steer. Refine one direction.
3. Cover the rendering semantics the game depends on:
   - issued forecast (dotted, frozen) vs measured trail (solid), uncertainty envelope widening into unsampled space;
   - sensor coverage: unsensed regions shown honestly, not filled in;
   - ship footprint and orientation ticks (body axis, thrust direction), distinct from velocity;
   - the flight plane in 3D with depth cues;
   - well funnels; lattice reconstruction (intense strands fading to clear centres);
   - two-attempt comparison overlay;
   - restrained feedback: alerts, damage, success, without explanatory prose.
4. Write `docs/design/visual-direction.md` and the first `src/theme/` tokens.
5. Commit on your branch and write `docs/handoffs/1E.md` (screenshots in `docs/design/img/`), recording the owner's sign-off as a request for `docs/DECISIONS.md`. **2D and 2E start from this handoff**, so do it as soon as the direction is agreed; polish continues in Part 2.

## Part 2: standing UI lane (rest of the build)
- Build and refine the instrument primitives, 3D styles and the UI lab with the owner, against the fixtures.
- **Pull in the latest build** whenever the integrator announces a merge: commit your work, then `git merge main` in this worktree. Once 2D and 2E have merged, run the real console and view with `npm run dev` and tune tokens and primitives against them.
- **Commit often on your branch**; the integrator merges this branch into `main` at every gate (and on request in between).
- Changes the owner wants in a panel's layout or behaviour, or in scene composition, are not yours to make: list them for the owning thread (2D/3F console, 2E/3F view) in an updated handoff note, or tell the owner to pass them on.
- Add a dated section to `docs/handoffs/1E.md` each time you finish a round, rather than a new file.

## Done when
Part 1: the owner has signed off on a direction and 1E.md exists. Part 2 never quite finishes; at each gate the lab runs, `npm test`, `npm run lint` and `npm run build` pass on your branch, and the handoff note is current.

## Out of scope
Panel layout, panel behaviour and data wiring (2D, 3F); 3D scene composition and camera (2E, 3F); game flow (2F, 3D); editing any folder you do not own.
