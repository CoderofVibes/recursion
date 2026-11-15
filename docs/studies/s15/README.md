# S15 — speed on a modest laptop

Measured 2026-11-14 Pacific in `.worktrees/s15`, branch `st/s15-modest-laptop`. This is a study of the local production build, before 2G's full 3D merge. No source or root configuration was edited. Nothing was installed and the live site was not loaded.

**Recommendation:** prioritize the cost of ship-system ticks and the scene/DOM work that continues while the console is open. Loading is already reasonably quick on the chosen proxy. Do not promise that selecting 2000× delivers 2000 ship seconds per wall second. Keep the proposed line-buffer patch as an experiment: it passed correctness checks but did not demonstrate a consistent speed gain.

## Evidence and scope

- [Complete load/frame/saturation tables and profile functions](baseline-tables.md).
- [Runner and exact methodology](../../../tools/studies/s15/README.md); [raw summary](../../../tools/studies/s15/baseline.json), [all frame/status vectors](../../../tools/studies/s15/baseline-frames.json.gz), [derived statistics](../../../tools/studies/s15/baseline-summary.json).
- [Main-thread CPU profile](../../../tools/studies/s15/baseline-profiles/worst-main.cpuprofile.gz), [model-worker CPU profile](../../../tools/studies/s15/baseline-profiles/worst-worker-0.cpuprofile.gz), [DevTools trace](../../../tools/studies/s15/baseline-profiles/worst-trace.json.gz), [profiled screen](../../../tools/studies/s15/baseline-profiles/worst.jpg). Decompression/import instructions are in the runner README. Hidden source maps in the same folder retain the measured source.
- [SYSTEMS 1× hitch CPU profile](../../../tools/studies/s15/baseline-profiles/hitch-main.cpuprofile.gz) and [trace](../../../tools/studies/s15/baseline-profiles/hitch-trace.json.gz) cover the separate case with the largest single baseline frame.
- [Ranked experiment and patch](line-buffer-experiment.md); [checks after 2G merges](after-3d-merge.md); [handoff](../../handoffs/s15.md).

[DEMONSTRATED: baseline.json] Source commit `cdbaa751b988334b4c7efb530ac0cf17208ea932`; `src` tree `f48dbf0c75035230c8b3a5eda4f8b7d19fa3dbcd`; `data` tree `8fe01542697fc8afeaf876544328e382de722b86`. These identities matter more than later documentation commits on this branch. Build-file SHA-256 hashes are retained. The baseline is the planar checkpoint carried in 3D types, not the forthcoming full 3D model/physics.

[DEMONSTRATED: recorded host/CDP metadata] Windows 10.0.26200, Intel Core i7-14700HX, 28 logical CPUs, 34,049,155,072 bytes physical memory; Node 24.22.1; installed Chrome 157.0.8103.51. Chrome rendered through **Intel UHD Graphics / ANGLE D3D11**, despite an RTX 4050 also being installed. The viewport and drawing buffer were 1366×768, DPR 1. Headless Chrome used the GPU; no software-renderer fallback was reported. CPU throttling is a proxy on this host, not a measurement of every judge's laptop or its thermals.

[ASSUMED] Profiles: native CPU 1× with no network throttle; modest CPU **4×**, **10 Mbit/s down / 1 Mbit/s up / 40 ms latency**, no packet loss. These are explicit broadband test settings, not a measured population average. GPU speed was not throttled.

[DEMONSTRATED: baseline vectors] There were five cold/warm load pairs per profile and two 8-second trials per view/warp/profile: **20 loads and 72 frame trials**, including SHIP as an extra view. Each frame trial starts fresh, enters the encounter, coasts, selects its view, and warms for 1.2 seconds. All timed cases remained visible, unpaused, in the intended view/page and one operating attempt. The largest mean sampler overhead was 0.078 ms per frame. No uncaught browser exceptions were recorded. No test/build ran concurrently with timed samples; normal host scheduling and thermal variation were not controlled.

The fixture has no previous completed attempts, committed maneuver forecast, selected two-attempt comparison, populated mission plan, or local MAP-region zoom. It measures every requested page in a reproducible fresh/coasting state. It does **not** establish the worst cost of an arbitrarily long expedition, populated comparisons or a busy held-out model fit. Those cases are explicit post-merge checks.

## Load and build size

[DEMONSTRATED: npm run build and baseline.json] All emitted files, in bytes. Gzip is deterministic gzip level 9, separately applied to every file. This includes the copied favicon that Vite's summary does not list.

| File | Raw bytes | Gzip bytes | Contents |
| --- | ---: | ---: | --- |
| `assets/index-SA2aPNzo.js` | 1,284,271 | 368,887 | React, Three.js/addons, all views, app/game/ship/simulation, and the model's in-thread fallback |
| `assets/worker-CbG4mADN.js` | 83,216 | 29,300 | Dedicated model worker: RPC, service, estimator/solver, dynamics, forecasting, extensions and reports |
| `assets/index-CkPRR0hR.css` | 30,254 | 5,050 | App, instruments and console styles |
| `index.html` | 510 | 310 | Entry document |
| `favicon.svg` | 420 | 277 | Project favicon |
| **Total** | **1,398,671** | **403,824** | **1.40 MB raw / 403.8 kB gzip** |

[DEMONSTRATED: hidden source-map attribution] The main chunk contains approximately 629,634 generated characters from Three.js/addons (49%), 219,075 from React/DOM/scheduler (17%), 90,073 from `view3d`, 66,164 from `console`, 31,533 from `theme`, and 82,288 from `model`. The rest includes game/ship/simulation, libraries, contracts, entry code and unmapped bundler scaffolding. These are source-map spans in generated **characters**, not independently gzipped module sizes. The model source is present both in the worker and on the main thread because `client.ts` statically imports the local fallback. No external font/image asset download was emitted; room textures are painted at runtime.

[DEMONSTRATED: Resource Timing and response headers] Vite preview already served gzip for JS/CSS. Cold navigation plus resource transfers totaled **406,672 bytes**; the warm revalidated navigation/resources reported **1,500 bytes** in aggregate Resource Timing transfer sizes. The server's compressed body sizes differ slightly from the level-9 inventory. Compression is working in this local test; recommending “enable gzip” would not explain its remaining delay.

| Profile/cache | First interaction median | Largest of five | Console fully ready median |
| --- | ---: | ---: | ---: |
| Native/cold | 0.529 s | 1.172 s | 1.364 s |
| Native/warm | 0.576 s | 0.662 s | 1.401 s |
| Modest/cold | **2.104 s** | **2.372 s** | **3.011 s** |
| Modest/warm | **1.822 s** | **1.944 s** | **2.717 s** |

[DEMONSTRATED: load trials] “First interaction” is navigation start to a paint opportunity after a trusted `3` key changes the production room to CONSOLE. The room-ready lower-bound medians were 0.510/0.553 s native cold/warm and 1.991/1.719 s modest cold/warm. Key-to-mode acknowledgement medians were 4.6/4.6 ms and 39.9/33.9 ms respectively. Console-ready includes the deliberate 0.8-second camera travel and UI activation. This is a task-specific input/readiness measurement, not Lighthouse TTI or INP. FCP mostly reflects the early loading shell and is not substituted for interaction.

Cold clears the HTTP cache, but the browser process and GPU caches can remain warm. The first native cold trial was the 1.172-second outlier; subsequent native cold trials were 0.499–0.542 s. With five samples, the largest observation is more honest than a claimed stable population p95. Native warm being slightly slower than the cold median is run variation, not evidence that caching hurts. The modest cold-to-warm median saving was 0.282 s, while the cache-revalidated page still spent 1.822 s reaching the interaction mark: startup CPU/scene work deserves more attention than bundle naming alone.

## Frames, saturation and actual time acceleration

[DEMONSTRATED: baseline-tables.md] The complete table reports median, nearest-rank p95 and maximum **rAF interval**, separately for room, each of MISSION/PLAN/MODEL/BLACK BOX/SYSTEMS, FLIGHT, MAP and the extra SHIP view, at 1× and 2000× under both profiles. The second table conditions those measurements on the simulation's actual `saturated` flag. Quantiles pool both runs by samples; individual trials and their variability remain in JSON. These are frame-delivery intervals, not GPU execution durations; the host was not forced to 60 Hz.

- At native 1×, every view's pooled p95 was 12.2–18.0 ms; the largest frame was 24.3 ms.
- At modest 1×, pooled p95 was 18.1–30.2 ms. **SYSTEMS had a 333.4 ms maximum**, versus 90.8 ms in its other trial. Median smoothness does not excuse that hitch. No 1× sample reported saturation. Ship-time quantization and the app's wall-delta clamp make short-run achieved rates approximate; SYSTEMS advanced 15 ship seconds over about 16 wall seconds across its two trials.
- At native 2000×, pooled achieved rate ranged from **1,700.8** ship s/wall s in SYSTEMS to about **2,000** in several pages. Saturation fractions included SYSTEMS 26.5%, room 15.2%, MAP 6.7% and FLIGHT 3.3%; one MODEL frame saturated too. Selected warp alone is not delivered speed, even unthrottled.
- At modest 2000×, **99.8–100%** of sampled frames saturated in every view. Pooled achieved rates were **269.8–491.6 ship s/wall s**, only **13.5–24.6%** of the request. Room was 322.4, FLIGHT 285.1 and MAP 371.0. Pooled p95 was 30.5–84.8 ms, with BLACK BOX 84.8 ms and SYSTEMS 78.8 ms.
- The highest individual p95 was modest BLACK BOX at 2000×: **133.3 ms**, maximum **181.7 ms**, achieved **132.4 ship s/wall s**. Its second trial had 36.5 ms p95 and 434.2 ship s/wall s. This substantial spread is retained, not averaged away into a claim of a stable single-device score.

[ESTABLISHED: measured source, `src/game/session.ts:356` and `src/app/loop.ts:101`] The simulation checks its default 10 ms frame budget every eight fixed ticks, drops remaining debt when limited, and reports saturation. The app caps its incoming wall delta at 0.1 seconds. A long tick batch can overshoot the nominal budget; a long frame can lose wall-time progress without the 1× saturation flag becoming true. Raising either limit is not a free optimization and would risk responsiveness. Preserve the physical step and deterministic dynamics.

**Alert handling:** the bounded top-warp sample reselects the requested warp through the existing control after any automatic drop, while logging the drop. No alert, model error or physics function is suppressed. There were no drops *during* the final baseline's timed windows; a small earlier smoke did drop to 1× on `luDecompose: singular matrix`, and the focused patch run captured one such drop during sampling. [Preflight evidence](../../../tools/studies/s15/fault-smoke.json) records that a nominal 2000× UI choice actually ran at 1×. The baseline profile screenshot also retains the footer's earlier “warp to 1× · model fault” note. The getter was clear at the ends of the final baseline samples, which **does not prove there were no transient/setup faults**. This is why the stress policy and post-merge model-fault recheck are explicit.

## Where the time goes

[DEMONSTRATED: separate CPU/trace repeat] The runner selected modest BLACK BOX/2000× by largest individual p95 and profiled a fresh repeat. The profiled repeat had **30.4 / 54.5 / 67.0 ms** median/p95/maximum, **238.5 ship s/wall s**, and 100% saturation. It did not reproduce the original 181.7 ms maximum or the separate SYSTEMS 333.4 ms hitch. The profile diagnoses sustained work in the selected slow case, not the exact cause of those earlier outliers.

| Main-thread function/path | Inclusive sampled ms | Share of 8,609.5 ms sampled duration |
| --- | ---: | ---: |
| `GameSession.advance` → `tickOnce` | 3,860.5 | 44.8% |
| `stepShipSystems` | 3,418.4 | 39.7% |
| `stepPower` → `dispatchPower` / `update` | 1,868.5 | 21.7% |
| `getGeometry` | 616.7 | 7.2% |
| `computeMassProperties` | 549.5 | 6.4% |
| `RoomView.frame` | 2,105.0 | 24.4% |
| Three.js `renderBufferDirect` | 911.2 | 10.6% |
| Three.js `setProgram` | 597.2 | 6.9% |

Inclusive paths overlap; do not add the percentages. Highest source-mapped **self** costs included `dispatchPower` 669.4 ms, `stepPower` 372.8 ms, its `update` helper 369.4 ms, `getGeometry` 363.0 ms, `stepThermal` 226.4 ms and Three.js `updateMatrixWorld` 214.8 ms. The sampler attributed 1,972.1 ms to `(program)` and 132.6 ms to GC; `(program)` must not be relabelled as GPU time. Main-thread model/React/debrief calculations were not the dominant sampled cost in this repeat. The dedicated model worker was **98.6% idle** (8,570.2 of 8,690.6 ms); its small busy interval was mainly dynamics/solver refresh. That says nothing about the cost of a populated held-out test.

[DEMONSTRATED: timeline] The trace recorded 37 layout events totaling **449.4 ms**, median **11.4 ms**, p95 **18.8 ms**. Main-thread scene work plus periodic layout is therefore a useful 2D target even on a console page. GPU-process task spans totaled 458.3 ms; these trace spans are **not GPU timer-query execution time** and cannot establish the GPU's exact utilization.

[DEMONSTRATED: supplemental `hitch-*` profile/trace] The separate SYSTEMS/1× repeat produced **24.3 / 121.0 / 254.4 ms** median/p95/maximum with no saturation. It did not repeat the exact 333.4 ms baseline maximum, but did reproduce large stalls in that case. Its trace contained **18 layout events totaling 1,294.3 ms, maximum 185.3 ms**. In 9,050.7 ms of main-thread samples, `RoomView.frame` accounted for 4,039.9 ms inclusive and `EffectComposer.render` for 3,116.1 ms inclusive; `whole` number formatting at `src/console/format.ts:40` took 258.6 ms self. Instrumentation adds overhead, so these are diagnosis values, not another uninstrumented matrix trial. Rendering and layout work can cause ordinary-speed hitches even with almost no simulation work; do not diagnose every slow frame as simulation saturation.

[DEMONSTRATED: one post-sample diagnostic frame per trial] Whole-composer draw submissions were **239–240** in the room, **95** on every console page, **171–172** in FLIGHT, **139–140** in MAP and **160** in SHIP. Console pages still drew 12,678 triangles per diagnostic frame behind the screen. Room draws were 18,702–19,488 triangles plus 3,200 star points. Thus a console takeover has substantial continuing scene submission, not just DOM work.

The room inventory contained 30 material texture objects, largest **1536×840**, with 19,267,584 base-level RGBA bytes if each listed image were independent. This excludes sharing, mipmaps and render targets, so it is **not VRAM consumption**. The renderer reported 37 allocated textures in the initial room, including effects; bloom has five mip levels, starting at 683×384 for this viewport. There were 225–227 resident geometries in room/FLIGHT diagnostics. These counts are not evidence of oversized downloaded textures or a geometry-volume bottleneck. Avoid sacrificing legibility before profiling actual GPU pressure at higher DPR.

## Fixes ranked by gain against risk

[ASSUMED] Priorities, code-size estimates and acceptance thresholds below are recommendations. Profile shares are measured opportunity bounds, not promised speedups. None changes the gravity law, fixed step, recorder data, forecast meaning or encounter time rules. No shared contract/data change is proposed by this study.

| Rank | Owner and concrete work | Expected gain and risk | Scope/size estimate | Measurement and checks that would prove it |
| --- | --- | --- | --- | --- |
| 1 | **2G:** reduce repeated per-tick ship work; pass/reuse valid geometry within a tick and pre-index immutable equipment/configuration definitions | Largest measured target: ship systems occupy 39.7% inclusive time. Halving that work is an optimistic ≈20% sampled-wall opportunity, not a delivered prediction. **Medium risk:** stale deployment/mass values or changed event ordering | `src/ship/{config,massprops,power,thermal,propulsion}`, possibly internal step context in `src/game/truth-step.ts`; roughly 120–300 lines. No public contract/data change intended | Same fixed 10,000-tick command tape: identical states, measurements and ledger results; all determinism/physics/GMAT and ship checks pass. Demonstrate ≥20% lower ship-step cost and improved top-warp ship s/wall s without worse p95. Reprofile after 3D first |
| 2 | **2D:** remove the synchronous per-frame size read and reduce costly repeated console layout; also evaluate a reused number formatter | BLACK BOX layout costs 449.4 ms/trace; the SYSTEMS trace has a 185.3 ms layout event. `whole` formatting is another 258.6 ms self in that SYSTEMS profile. **Low risk** for cached dimensions/formatter, **medium** for columns/charts. Moving layout to another task alone is not a gain | `RoomView.resize`, `src/console/{console.css,format.ts}`, chart/instrument layout; 30–120 lines | Compare forced-layout stacks, total layout/formatting time and BLACK BOX/SYSTEMS tails at the same record counts. Resize from zero/hidden to visible and change DPR; preserve panel order, overflow, typography and exact formatted values, including negative zero and non-finite values |
| 3 | **2D:** reduce redundant scene work in a settled console view; skip hidden label work, batch compatible static room objects, evaluate render-on-demand only where coverage/motion makes it correct | `RoomView.frame` accounts for 24.4% inclusive time in BLACK BOX and 44.6% in the SYSTEMS profile; console still makes 95 submissions. **Low-to-medium risk** for hidden labels/batching, **medium** for demand rendering because borders, light easing, resize, transitions and loss can remain visible | `src/view3d/room/RoomView.ts`, `shell.ts`, `dress.ts`, `src/app/loop.ts`; about 50–250 lines. Use existing theme and game snapshots | Reduce draw/submission work and console p95 at equal ship progress; verify unchanged rendered appearance, hotspot picking, view transitions, loss/recall, resize and alerts. Keep game/recorder running every frame. Do not simply freeze the entire loop |
| 4 | **2D:** defer SHIP/MAP construction and optional page code until first use, retaining an honest first-open transition | Can reduce CPU/geometry initialization and memory at startup; **gain unmeasured** without an initialization profile. Three.js and the room's flight hologram are needed initially, so they cannot all be deferred. **Medium risk:** first-open blank state/disposal races | `RoomView` constructor, SHIP/MAP modules and console page imports; 100–250 lines, no game/model change | Re-run cold/warm interaction tests and first-open latency for every view. Require lower startup median and no first-open >100 ms hitch/blank interaction; check relative worker/chunk paths and recurrence |
| 5 | **2G**, with **integrator** reviewing emitted chunks: lazy-load the in-thread model fallback used by tests/SSR | At most the main chunk's ≈82k model characters are exposed as opportunity; other imports may retain some. Worker bytes remain necessary. An 83k raw/29k gzip-equivalent chunk is only about 23 ms of ideal transfer at 10 Mbit/s. **Medium risk:** async initialization/termination order | `src/model/client.ts`, possibly a separate local adapter; 40–100 lines. Integrator owns any Vite chunk config | Verify actual initial JS/request reduction, cold interaction improvement, worker RPC behavior and non-worker test/SSR parity. Preserve error and terminate semantics. Naming a vendor chunk without deferring its request is not a load-time fix |
| 6 | **2D:** reuse fat-line buffers when the segment count is unchanged — supplied experimental patch | 210/240 deterministic transitions reused buffers with identical outputs, but focused browser runs showed **no consistent gain** and some worse tails. **Hold back** pending evidence. Low-to-medium rendering risk | `src/view3d/gfx.ts`, 30 added lines; no theme/contract/model/data changes | See [experiment](line-buffer-experiment.md). Require repeated improvement at identical fixture/load plus geometry/picking/dash/disposal checks; passing type/equivalence tests alone does not prove speed |
| 7 | **2D/theme:** texture/geometry reductions or a lower-resolution/bloom option only after GPU evidence | Current downloads contain no raster textures and current geometry is modest. **Benefit unproved; presentation risk meaningful.** Likely more relevant at DPR 2 or on a weaker GPU | `src/theme`, room textures, renderer/effects; roughly 40–150 lines depending on option | Real GPU timing and frame comparisons at DPR 1/2; preserve instrument text, coverage/uncertainty lines, window rocks and visual direction. Record runtime texture/render-target memory rather than treating gzip as VRAM |

**Integrator/build recommendation:** keep the current configuration until a source-level lazy boundary or caching experiment proves a benefit. The oversized-chunk warning is real; increasing the warning threshold fixes no user experience. Compression is already active in this preview, and splitting the initial Three.js dependency without deferring work does not remove its bytes. Any build change belongs to the integrator and must be delivered/reviewed separately.

## Owner decision and next build

[ASSUMED] One decision for the owner through the integrator: adopt the modest profile as a repeatable release check, with cold interaction median ≤2.5 s, 1× p95 ≤33.3 ms per view and investigation of >100 ms frames. Recommend **yes**, plus a real modest-laptop check; CPU throttling alone is insufficient. Report actual warp throughput honestly instead of making 2000× a required physical speed on every machine. The current load medians meet the proposed budget; the SYSTEMS hitch and top-warp tails need work. S15 does not update `docs/DECISIONS.md`.

The best next pass combines the 3D rebaseline, bounded ship-step optimization, console draw/layout work, populated model/archive tests and a real integrated-GPU laptop. A smaller pass can take the 3D rebaseline plus the first two measured targets; it would leave high-DPR and long-archive costs uncharacterized. The detailed [post-merge checklist](after-3d-merge.md) assigns each check and preserves A1, A11, A12, P2 and P11.
