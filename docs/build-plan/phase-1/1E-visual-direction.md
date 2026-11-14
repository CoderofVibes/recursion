# 1E — Visual direction

**Thread:** Claude, working live with the owner (~1 hour) · **Branch:** `p1/1e-visual` (worktree) · **Phase:** 1 (parallel)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026. The owner is the creative decision-maker and wants to establish the visual direction in the first hour of the build. Read first:
- `docs/CREATIVE_BRIEF.md`, especially §10 (presentation and controls), §6 (lattice reconstruction look), §7 (wells as long narrow funnels), §3 (Black Box presence).
- `docs/DECISIONS.md`, especially P1 (planar flight, 3D presentation), P10 (display semantics), P6 (forecast with honest uncertainty).
- `docs/build-plan/README.md` § Conventions.

## Goal
Agree a visual direction with the owner and capture it as tokens, rules and a working prototype that the console (2D) and 3D view (2E) threads can build from.

## You own
`prototypes/visual/` (standalone; its own `index.html`, Three.js from a pinned CDN version, no dependency on the main app), `docs/design/visual-direction.md`, `src/theme/` (design tokens as TypeScript constants: colour, type, line weights, motion durations).

## How to work
1. Show the owner two or three distinct directions quickly as running prototypes, not descriptions. Each should show: the dim compartment and command table, the integrated display, the live 3D sensor view, one or two instruments, and Black Box's presence.
2. Let the owner pick and steer. Refine one direction.
3. Then cover the rendering semantics the game depends on:
   - issued forecast (dotted, frozen) vs measured trail (solid), uncertainty envelope widening into unsampled space;
   - sensor coverage: unsensed regions shown honestly, not filled in;
   - ship footprint and orientation ticks (body axis, thrust direction), distinct from velocity;
   - the flight plane in 3D with depth cues;
   - well funnels; lattice reconstruction (intense strands fading to clear centres);
   - two-attempt comparison overlay;
   - restrained feedback: alerts, damage, success, without explanatory prose.

## Deliverables
1. `prototypes/visual/`: the chosen direction, running.
2. `docs/design/visual-direction.md`: palette, typography, materials and lighting, instrument styles, motion rules, the rendering semantics above, and what to avoid.
3. `src/theme/`: tokens matching the doc.

## Done when
The owner has signed off on a direction (record it in your handoff as a request for `docs/DECISIONS.md`).

## Out of scope
Wiring to the real app or simulation. Console panel implementation.

## Handoff
Write `docs/handoffs/1E.md` from `docs/handoffs/TEMPLATE.md`, with screenshots in `docs/design/img/`.
