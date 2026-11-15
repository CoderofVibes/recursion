# Handoff: VX â€” Window and sky visuals

Thread: GPT/Codex Â· Branch: `p3/vx-visuals` Â· Worktree: `.worktrees/vx` Â· Date: 2026-11-15 (Pacific).

## Delivered

- `src/view3d/sky/`: a fixed celestial atlas with an edge-on galaxy, torn dust lane, dim emission knots, a cold star cloud, the tilted Ember Wheel, seeded point stars with a steep brightness distribution, and a small sun driven by `WindowView.sun`. The static galaxy shader is baked once to a 512-pixel-per-face HDR cubemap; gameplay samples that cache. No downloaded or generated images. The sky follows the eye without walking parallax and turns with the ship.
- `src/view3d/fx/`: pooled cloud-bank sprites, luminous funnel contours with white throats, and static dotted precursors that join continuously as reported birth brightness increases. All geometry comes from optical directions; no true ranges, radiation intensity, field catalogue, or guessed forces enter the renderer.
- `outside.ts`: mounts the sky and both optical effects. Bridges R38's typed `funnel` entry to the earlier `inverse-well` plugin envelope; consumes `cloud-bank` patches directly. Custom opening scenery replaces the entire arrival sky. Missing channels retire their visuals.
- `RoomView.ts`: two window-only calls keep the dome centred on the live/scripted camera. No changes to controls, loss sequences, lighting, or the other overnight lanes.
- `src/view3d/opening/`: blue ocean, muted land, polar ice, white clouds, directional terminator and a thin blue atmospheric limb. Earth's S23 size (2.92Â°) and phase (83.24Â°), OP's lens trajectory, sequence timings and title opacity schedule remain. Earth is sampled on the original ray so the lens never duplicates it. The title gets wider tracking and a responsive, lighter weight using existing theme tokens.

The ART files are not yet on this branch's main base. This pass read ART's current `art-bible.md`, `selections.md` and `window-prompts.md` in its worktree. It follows the selected edge-on Galaxy, second spiral, white-to-violet funnels, and translucent cloud curtain. The universe atlas stays fixed across runs as the art bible requires; its seeded stars never twinkle.

## Verification

- `npm run check`: typecheck, lint, 1,239 passing tests / one skipped, plus the separate passing performance test on the final source at `936fc56`.
- `npm run build`: passes. Existing Vite chunk-size / ineffective-dynamic-import warnings remain.
- `node docs/handoffs/vx/capture.mjs after`: serves the actual production build on 4186; audits browser exceptions, `console.error`, browser log errors, and the model error in Twin Deeps, Well Garden and Unseen Cathedral. [Console evidence](vx/after-console.json).
- `node docs/handoffs/vx/capture-optics.mjs before` and `after`: compile the actual room and optical renderers with controlled light-only fixtures on 4187. The before variant loads the three replaced renderers from `0ee3d1c`; the after variant uses this branch. It covers active/end-on/precursor funnels, clouds, Earth, lens and title; title fits 360 px. [Fixture console evidence](vx/after-optics-console.json).
- Six integration tests in `src/view3d/fx/light.test.ts` exercise the promoted optical contract, stale/malformed observations, precursor joining, invalid/absent cloud patches, complete scenery replacement/disposal, and eye-centred placement under a rotated parent. The existing funnel/window and opening tests also pass.

## Performance — release gate still fails

[DEMONSTRATED: S15 production runs, `performance.json`] Final measured source: `936fc56` (`src` tree `02218477705bdb2850169387cefe094e155b10f3`). Installed headless Chrome, Intel UHD / ANGLE D3D11, 1366 × 768, DPR 1, 4× CPU throttle, 10/1 Mbit/s and 40 ms latency. One eight-second sample per view at 1× after the cache optimization, two cold/warm load pairs, followed by CPU/timeline profiles of FLIGHT and MODEL. No build, test or other VX browser ran during this final timed matrix. Other threads and host contention were not controlled.

| View | Frame p95 (ms) | Worst frame (ms) |
|---|---:|---:|
| Room | 54.7 | 114.9 |
| Mission | 18.1 | 48.5 |
| Plan | 30.3 | 78.8 |
| Model | 12.2 | 163.5 |
| Black Box | 18.0 | 78.7 |
| Systems | 42.3 | 96.9 |
| Flight | 109.1 | 169.6 |
| Map | 72.8 | 109.1 |
| Ship | 97.0 | 115.2 |

Cold room readiness was **3,406 / 2,405 ms**; first interaction paint was **3,570 / 2,532 ms**. This does **not** pass A18's 2.5 s / 33 ms release gate. A real modest-laptop check remains unperformed. All samples stayed in the intended view, reached 1× without saturation, and reported no model error.

**Hitch investigation.** The initial room profile put 169 ms of its eight-second capture in cloud transforms; that prompted the bounded upload cadence. The final FLIGHT profile put 86 ms there and still spent substantial time in Three's program setup/draw submission and belief-side snapshot helpers (`standin-model.ts`). These are self-time samples from different views, not an apples-to-apples speedup claim. Room, Flight, Map and Ship all recorded browser long tasks, not only late presentation timestamps. The 164 ms MODEL long task was investigated with a separate MODEL profile; it did not reproduce (maximum frame 78.9 ms), while the belief-side snapshot helpers dominated named application samples. The remaining broad room/hologram/snapshot cost and the intermittent MODEL hitch need the integrator's quiet-machine follow-up; VX does not claim their causes are completely isolated.

The expensive static dust shader now executes once into a cubemap. Room p95 in the un-cached matrix was 103.0 / 200.1 ms, compared with 54.7 ms in the final run, but the host was uncontrolled, so treat this as an observation rather than a controlled causal result. The exploratory pre-change two-view run overlapped screenshot capture and is retained only as context, not a valid comparative benchmark.

[Portable measurements and profile attribution](vx/performance.json) retain all three runs. Raw frame/status vectors are in [the final compressed sample](vx/cached-frames.json.gz). Temporary absolute-path profiles and source maps were not committed. The final application grew by about 11.4 kB raw / 3.7 kB gzip in its main chunk versus the base; no optical image asset is downloaded.

Reproduce from this worktree (use a fresh run name):

```sh
npm run build
node tools/studies/s15/measure.mjs --phase all --views room,mission,plan,model,blackbox,systems,flight,map,ship --profiles modest --warps 1 --repeats 1 --seconds 8 --load-repeats 2 --no-build --run vx-release
node tools/studies/s15/measure.mjs --phase profile --profiles modest --warps 1 --seconds 8 --no-build --run vx-release --profile-case modest:model:1 --profile-label model-hitch
```

Port 4175 was left to S15's runner; nothing was installed. Checkpoints: `1e54ba5` (visuals and window integration), `936fc56` (cached sky, bounded cloud uploads and robust malformed-arc handling).

## Before and after

Actual production app, same 1366 Ã— 768 viewport and camera position. The default Twin Deeps view shows the deep sky and live cloud-bank channel behind the flight display.

| Before | After |
|---|---|
| ![Before: production Twin Deeps window](vx/before-deep-sky.png) | ![After: production Twin Deeps window](vx/after-deep-sky.png) |

Controlled optical fixtures below use the production-compiled room and window renderer, with the hologram hidden to inspect the window. **These are synthetic optical inputs, not evidence that the Well Garden publishes its optics.**

| Subject | Before | After |
|---|---|---|
| Deep field | ![Before sky](vx/before-fixture-sky.png) | ![After sky](vx/after-fixture-sky.png) |
| Typed funnel channel | ![Before funnels](vx/before-fixture-funnels.png) | ![After funnels](vx/after-fixture-funnels.png) |
| Cloud curtain | ![Before clouds](vx/before-fixture-clouds.png) | ![After clouds](vx/after-fixture-clouds.png) |
| Home / Earth | ![Before Earth](vx/before-fixture-home.png) | ![After Earth](vx/after-fixture-home.png) |
| Title | ![Before title](vx/before-fixture-title.png) | ![After title](vx/after-fixture-title.png) |

## Claims and limits

- [DEMONSTRATED: production browser audit] All three region URLs load without a console error or model fault. Twin Deeps supplies 1,118 optical cloud patches at its initial frame. The window consumes them; the lattice remains invisible to the unaided eye.
- [DEMONSTRATED: controlled optical fixture] All three supplied funnels render (side-on, end-on, precursor), with 1,116 segments in the chosen test view. The old typed-channel input displayed none. This is a rendering test, not a navigation or admission result.
- [ASSUMED] The atlas orientation and local theme-derived optical palette are presentation choices. Nothing in the sky adds a simulated nearby body, force or collision shape. `sky/style.ts` collects the local extensions for adoption by the theme owner.
- [FICTIONAL] Violet light from funnels and radiation clouds follows the approved art direction, not ordinary radiation physics. The renderer does not reveal dose or a safe route.
- [DEMONSTRATED: tests and code] The funnel renderer keeps 2D's bounded double-buffer scheduler and 60,000-segment ceiling. Its decimation joins only connected optical segments, never gaps removed by upstream occlusion clipping. Clouds use one draw, a fixed 4,096-patch buffer, rear-hemisphere culling, at most 15 buffer uploads per real second, and no time-dependent shimmer. Neither effect accelerates with warp.

## Requests outside VX's ownership

1. **3B / game integration: publish Well Garden optical data (R31/R38).** On the merged base, `createInverseWells()` does not supply `EncounterSetup.window`, and the actual production Well Garden supplies no `WindowView.fields`. `projectFunnelOptics` exists but has no caller there. The window integration is now complete for `WindowFunnel` entries (`kind: 'funnel'`, schema `well-optical-v1`, current `observedAt`, visible arcs, phase and brightness). Connect the truth-side producer with occlusion, lifecycle and source LOD; do not send catalogue geometry to VX or fabricate funnels in `outside.ts`. This is the remaining reason actual Well Garden screenshots have no funnels.
2. **NIGHT owns the opening mount and R44.** This branch's app still does not mount the opening. The opening images above verify its renderer independently. Keep NIGHT's once-per-browser gate and fully still reduced-motion sky / plain fade when merging. VX adds no motion or flash cadence.
3. **Theme owner:** adopt `sky/style.ts` optical colour derivatives and the title treatment if desired. No shared theme file was changed.

## Merge notes

Keep NIGHT's `RoomView.ts` changes and VX's two `outside.followEye(...)` calls. Use VX's `outside.ts` and `sky/`, `fx/`, `opening/` updates together. 3B can reuse `funnelLightMaterial()` for an optical preview; it expects `color`, `along` and `coverage` attributes. The instrument view remains 3B's lane.

The preview entry is not imported by the application and does not ship in the normal build. Rebuild the normal app after the fixture capture before running S15. All committed evidence uses repository-relative paths.
