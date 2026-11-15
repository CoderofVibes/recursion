# Handoff: PF — Release performance

Thread: GPT/Codex · Current branch: `p3/pf-speed-2` · Date (Pacific): 2026-11-15

## R59 — Full render scale for recordings

Based on main's squash `f118dd2`. **The old `p3/pf-speed` branch is retired and must never be merged.** Its first-pass results below are historical; the integrator intentionally excluded 11 raw traces containing local filesystem paths.

TR: load the recording page with **`?quality=full`**, or append **`&quality=full`** to an existing query, before constructing the scene. For example, `/?encounter=gravity-range&quality=full`. Keep `?perf` off for the trailer. Reload to change the quality policy: the pin lasts for the created hook's lifetime, including opening and scripted shots.

The pin explicitly sets the composer to the renderer's native pixel ratio and prevents adaptive downscaling despite slow frames. Scale 1 retains the existing renderer DPR cap and budget-bloom policy. Missing or unrecognized quality values retain automatic adaptation. No simulation, theme or `RoomView.ts` change is needed; TV's R64 method is untouched.

[DEMONSTRATED: `src/view3d/perf/quality.test.ts`] All seven quality tests pass, covering native-DPR restoration and 30 seconds of slow frames in normal/scripted views, console/warp changes, and unchanged automatic downscaling without the exact pin. Typecheck, lint and `npm run build` pass. The unrestricted `npm run check` test stage exhausted worker memory and hit timeouts on the shared host; the complete rerun passed **1,394 tests plus the separate speed test**, with concurrency capped and all timeouts/tolerances unchanged:

```powershell
npm exec --no -- vitest run src/view3d/perf/quality.test.ts
npm exec --no -- vitest run --maxWorkers=2
npm exec --no -- vitest run --config vitest.perf.config.ts --maxWorkers=1
```

No new benchmark traces or other raw capture evidence are part of this follow-up. Changed files were scanned for absolute filesystem paths before committing; none were found. The release-performance findings below are unchanged by this recording override.

## First-pass handoff (historical)

**PF changes and evidence are delivered; the A18 (7) release gate still fails.** All cold loads and all four 3D views exceed the unchanged targets. Thirteen of 27 region/view cells pass both 1× repeats. The physical modest-laptop check remains open.

## Delivered

- `8545dca`: S15, S20 and the screenshot runner set the opening-seen marker before page scripts. S15 separately measures a fresh opening's first actual WebGL output plus a paint opportunity and its handoff to the room. It now supports all three regions, pre-trial host occupancy, repeated-cell spread and portable diagnostic files.
- `8a18ad0`: `standin-model.ts` caches immutable mass-property and equipment snapshots. Accepted commands, configuration records, tank/equipment telemetry and attempt changes invalidate the relevant cache. Arithmetic and record order stay identical. `src/view3d/perf/` contains the cache regression test, presentation governor and optional local readout.
- `4b71f42`: `RoomView.ts` changes only renderer/composer setup, associated cleanup and one frame quality hook. Default-framebuffer MSAA is disabled under the offscreen composer; bloom operates at half its former input resolution using the unchanged theme values. After sustained 1× frame overruns, the composer steps from 100% to 85% to 70%; recovery requires 15 seconds of headroom. Console instruments and CSS labels retain native resolution. `followEye`, controls, motion and simulation scheduling are unchanged.
- `docs/handoffs/pf/`: S15 source identities, bundle hashes, load/frame samples, CPU profiles, traces, source maps, derived tables, command-tape fingerprints and an unapplied scene-submission proposal.

## How to verify

[DEMONSTRATED: local checks on the delivered source] `npm run check` passed: 139 ordinary test files / 1,359 tests, plus the separate simulation speed test. The opt-in command tape is skipped by the ordinary suite. `npm run build` passed; the existing large-chunk/eager-import warnings remain. No packages were installed and no tolerances or gate values changed. Three new focused regression/policy tests are included in that count.

[DEMONSTRATED: `pf/tape-before.json`, `pf/tape-after.json`] The command-tape test was run with both modified pre-existing source files restored to `1089339`, then again with PF's changes restored and `RECURSION_TAPE_AGAINST` pointing to the first output. All 10,000 ticks of each nominal, worn and eclipse variant match exactly: truth state, ship systems, measurements and events. The cache regression also compares fresh versus cached snapshots across telemetry, configuration, equipment mode and recurrence changes, including preservation of earlier snapshots.

The initial app/data/build inputs are merged main at `1089339`; main through `ac260fb` differs only in documentation. Cache-only source is `8a18ad0`; final source is `4b71f42`. Each evidence JSON carries its exact source and emitted-file hashes. During the frozen comparison, main advanced through `a06165e`, including `94b89cc` (2F) and `5c70235` (VX). Those later simulation/visual changes are **not** included here; rerun the matrix after integration. No claim is made about their performance.

```powershell
# Baseline used this command before the two application fixes.
node tools/studies/s15/measure.mjs --run baseline --output docs/handoffs/pf --profiles modest --regions gravity-range,inverse-wells,chain-link --warps 1 --repeats 2 --load-repeats 3 --seconds 8 --opening
# After the cache alone, ROOM / SYSTEMS / FLIGHT, same frame settings:
node tools/studies/s15/measure.mjs --run cache --output docs/handoffs/pf --profiles modest --regions gravity-range --views room,systems,flight --warps 1 --repeats 2 --load-repeats 1 --seconds 8 --no-build
# Full delivered-source comparison (production dist already built):
node tools/studies/s15/measure.mjs --run presentation --output docs/handoffs/pf --profiles modest --regions gravity-range,inverse-wells,chain-link --warps 1 --repeats 2 --load-repeats 3 --seconds 8 --opening --no-build
node tools/studies/s15/summarize.mjs presentation docs/handoffs/pf
```

For a new run choose a new name; do not overwrite the evidence or compare a reused name against changed source. Run benchmarks sequentially. This thread ran no tests, builds or additional animated browsers during timed samples.

## Claims, labelled

### Measurement limits

[ASSUMED] The unchanged S15 modest proxy is CPU 4×, 10/1 Mbit/s and 40 ms network latency, 1366×768, DPR 1. [DEMONSTRATED: run JSON host/browser fields] This is an i7-14700HX, 28 logical CPUs, 32 GB, Intel UHD through ANGLE, installed headless Chrome 157 on Windows. GPU speed is unthrottled; the host refresh interval is about 6.06 ms, not a forced 60 Hz. **This is not a real modest-laptop check.**

[DEMONSTRATED: every trial's `hostLoad`] The machine was shared and frequently busy. CPU samples last one second before navigation; they include the outgoing benchmark page and other processes, rather than partitioning external contention. Aggregate occupancy >=20% flags possible contention. Low occupancy does not certify a quiet GPU/scheduler. Repeats expose the spread; changes in host load prevent attributing the entire before/after timing difference to PF. CPU profiles are separate instrumented repeats, not GPU timing queries, and their inclusive function times overlap.

[DEMONSTRATED: runner fixtures and shipped source] The matrix measures fresh arrival/coasting in Twin Deeps (`gravity-range`), Well Garden (`inverse-wells`) and Unseen Cathedral (`chain-link`), with an empty attempt archive. Well Garden includes its full 2,600 simulation sites but this source predates VX's optical producer. The Cathedral has not yet accumulated powered reconstructions. This does not establish performance for those future visuals, a populated archive or every point of a full mission.

### Release matrix

[DEMONSTRATED: `pf/baseline{,-summary}.json`, `pf/presentation{,-summary}.json` and raw frame vectors] Values below are the median of the two per-run p95s, followed by their full range, in milliseconds. **Pass** requires both repeats <=33 ms. A steady-view pass does not erase individual hitches, load failures or the missing physical-device check.

| Region        | View     |  Before p95 [range] | Delivered p95 [range] | Delivered worst | 33 ms |
| ------------- | -------- | ------------------: | --------------------: | --------------: | ----- |
| gravity-range | ROOM     | 145.4 [133.3–157.5] |   109.1 [103.1–115.1] |           205.9 | FAIL  |
| gravity-range | MISSION  |    57.6 [54.6–60.7] |      24.3 [12.2–36.4] |           109.2 | FAIL  |
| gravity-range | PLAN     |    51.3 [48.2–54.4] |      18.2 [18.1–18.3] |            91.0 | pass  |
| gravity-range | MODEL    |    63.6 [60.5–66.7] |      15.3 [12.3–18.2] |            60.7 | pass  |
| gravity-range | BLACKBOX |    78.9 [66.7–91.0] |      18.2 [18.2–18.2] |            78.8 | pass  |
| gravity-range | SYSTEMS  |    69.6 [48.3–90.9] |      18.3 [12.3–24.4] |            84.7 | pass  |
| gravity-range | FLIGHT   | 169.6 [115.1–224.2] |    103.1 [90.9–115.2] |           236.4 | FAIL  |
| gravity-range | MAP      | 154.4 [139.2–169.7] |   115.1 [115.1–115.1] |           212.1 | FAIL  |
| gravity-range | SHIP     | 163.6 [133.3–193.9] |   118.3 [103.2–133.4] |           194.0 | FAIL  |
| inverse-wells | ROOM     |  124.2 [72.7–175.8] |   103.1 [103.1–103.1] |           133.3 | FAIL  |
| inverse-wells | MISSION  |     18.3 [6.4–30.1] |        9.3 [6.3–12.3] |            96.9 | pass  |
| inverse-wells | PLAN     |    15.2 [12.2–18.3] |        9.2 [6.3–12.1] |            85.0 | pass  |
| inverse-wells | MODEL    |    15.0 [11.8–18.2] |       12.2 [6.3–18.1] |            90.9 | pass  |
| inverse-wells | BLACKBOX |    12.3 [12.2–12.4] |      18.2 [12.1–24.2] |           103.0 | pass  |
| inverse-wells | SYSTEMS  |    18.2 [18.1–18.2] |      30.4 [18.2–42.5] |           151.6 | FAIL  |
| inverse-wells | FLIGHT   |   97.1 [60.6–133.5] |      54.5 [54.5–54.5] |            78.8 | FAIL  |
| inverse-wells | MAP      |    81.8 [66.7–97.0] |      57.6 [48.5–66.6] |           109.1 | FAIL  |
| inverse-wells | SHIP     |  109.1 [72.8–145.4] |     90.9 [60.6–121.3] |           181.8 | FAIL  |
| chain-link    | ROOM     |   99.9 [72.6–127.3] |   133.3 [133.2–133.3] |           193.9 | FAIL  |
| chain-link    | MISSION  |    18.3 [18.2–18.3] |      18.1 [18.0–18.2] |           109.3 | pass  |
| chain-link    | PLAN     |    24.4 [12.3–36.4] |      12.2 [12.2–12.2] |           121.2 | pass  |
| chain-link    | MODEL    |    18.2 [12.1–24.2] |      15.1 [12.1–18.2] |            60.6 | pass  |
| chain-link    | BLACKBOX |    18.2 [18.1–18.2] |      18.2 [12.2–24.2] |           102.9 | pass  |
| chain-link    | SYSTEMS  |    24.4 [18.4–30.4] |      18.2 [12.2–24.2] |            72.7 | pass  |
| chain-link    | FLIGHT   | 109.0 [108.9–109.1] |   133.3 [115.1–151.6] |           230.2 | FAIL  |
| chain-link    | MAP      |    63.7 [60.7–66.7] |     97.0 [66.8–127.1] |           157.5 | FAIL  |
| chain-link    | SHIP     |   97.0 [60.6–133.4] |      78.9 [60.7–97.0] |           139.4 | FAIL  |

[DEMONSTRATED: the same load records] Three trials per entry. Readiness is navigation to the room/game attachment plus a frame; opening is first real output plus its paint opportunity. All values are milliseconds.

| Target        | Cache |   Before median [range] | Delivered median [range] |
| ------------- | ----- | ----------------------: | -----------------------: |
| opening       | cold  |  7319.4 [5991.8–8210.4] |   4620.6 [3456.3–5106.0] |
| opening       | warm  |  5806.7 [5576.4–6110.6] |   4180.4 [2386.1–4421.8] |
| gravity-range | cold  |  8189.7 [7036.4–8251.8] |   5656.8 [3860.9–6065.2] |
| gravity-range | warm  |  7313.0 [6974.1–7390.5] |   4168.5 [3333.4–6690.6] |
| inverse-wells | cold  | 8756.6 [8038.0–10561.8] |  5388.7 [4481.7–10811.2] |
| inverse-wells | warm  | 8701.7 [7371.0–10168.2] |   5180.2 [3714.9–9358.8] |
| chain-link    | cold  |  8767.2 [7132.1–9494.9] |   4506.6 [4426.3–4544.0] |
| chain-link    | warm  |  7394.7 [6991.6–7449.9] |   4431.6 [3097.8–4674.3] |

### Cache-only checkpoint

[DEMONSTRATED: `pf/cache-summary.json`] Same modest profile, 1.2-second warm-up and two eight-second repeats; these are Twin Deeps cells. The second renderer fix was not active. Contention and separately selected profile views limit causal comparisons.

| View    |  Before p95 [range] | Cache-only p95 [range] | Delivered p95 [range] |
| ------- | ------------------: | ---------------------: | --------------------: |
| ROOM    | 145.4 [133.3–157.5] |      93.9 [72.7–115.0] |   109.1 [103.1–115.1] |
| SYSTEMS |    69.6 [48.3–90.9] |       33.4 [18.3–48.5] |      18.3 [12.3–24.4] |
| FLIGHT  | 169.6 [115.1–224.2] |      94.0 [85.0–103.0] |    103.1 [90.9–115.2] |

[DEMONSTRATED: baseline and cache CPU profiles] The original worst FLIGHT profile sampled 9.27 seconds: Three/addons self time 3.24 seconds, game code 1.94 seconds; mass properties 431 ms inclusive and equipment status 802 ms inclusive. In the cache-only worst ROOM profile, sampled for 9.12 seconds, game self time was 629 ms and neither helper appeared in the top 50 self entries; Three/addons was 4.19 seconds. These are different views under different host load, not a controlled percentage speedup. The fresh-versus-cached regression supplies the semantic check.

[DEMONSTRATED: final validity and host records] 54 frame trials; 0 invalid trials; 0 browser exceptions; 0 model errors. Pre-frame host CPU 13.9–100.0%; 48/54 flagged for possible contention. 233 recorded frame intervals exceeded 100 ms. Maximum status-observer cost 1.09 ms/frame (baseline 4.13). Instrumentation can contribute to the tail.

### Remaining costs and hitches

[DEMONSTRATED: `pf/presentation-summary.json` and the named profiles] **A18 (7) still fails:** only 13 of 27 region/view cells passed both 1× repeats. ROOM, FLIGHT, MAP and SHIP fail in every region; Twin Deeps MISSION and Well Garden SYSTEMS each fail one repeat. Every cold-load trial exceeds 2500 ms. The worst final steady-view interval is 236.4 ms. The retained vectors identify all 233 >100 ms intervals; representative worst-view, console and startup profiles investigate their classes of cost, but do not establish the exact cause of every individual interval.

- **3D submission and transforms remain:** the final worst Cathedral FLIGHT profile sampled 9.32 s, including 3.75 s Three/addons self time; `renderBufferDirect` was 2.54 s inclusive and matrix-world updating 441 ms inclusive. Twin Deeps SHIP sampled 10.26 s with 4.13 s Three/addons self time, 2.82 s draw submission inclusive and 399 ms matrix updating inclusive. Well Garden SHIP was especially distorted by load/profiling: 19.72 s sampled, 10.45 s Three/addons self time. These overlapping inclusive costs cannot be added. The scene still submits 240 / 172 / 141 / 162 composer-wide draws for Twin Deeps ROOM / FLIGHT / MAP / SHIP. Reducing render-target pixels does not reduce that CPU work.
- **The renderer policy is not a demonstrated end-to-end win over the cache alone.** Its observed ROOM and FLIGHT p95s were slower than the cache-only focused run, with overlapping ranges under different host loads. Inventory confirms native 1366×768 output, antialias off, 70% composer dimensions in slow 3D cells and reduced bloom mips. [ASSUMED] This bounded resolution tradeoff reduces pixel work when frames overrun; there are no GPU timer measurements here. Do not quote a causal speedup for it. Console text and hologram labels remain native; inspected FLIGHT/SHIP/MAP captures retain their instruments and labels, with visible loss of 3D sharpness at 70%.
- **Cold load and handoff remain:** opening-to-room frame-gap median was 3857 ms [3139–5054] before and 2882 ms [2036–3515] after, across six observations each. These gaps include scene replacement, frame scheduling and first rendering, not just one JS task. The separate opening startup profile records 1707 ms and 1457 ms handoff long tasks; Three `onFirstUse` accounts for 2215 ms self time across the entire 25.65 s opening/startup profile. Source constructs a second RoomView/context at handoff. Scene lifetime and first-use shader work remain unresolved; prewarming would need to preserve the opening schedule and measure actual first output, not move the wait into an uncounted phase.
- **Well Garden startup has both rendering and initialization cost:** in its 9.84 s instrumented cold-room profile, shader `onFirstUse` is 3063 ms self / 3120 ms inclusive, `buildRoom` 873 ms inclusive, `createInverseWells` 954 ms inclusive and simulation `boundsTree` 346 ms self. The large main chunk is 1,471,601 bytes (437,374 gzip bytes). In the first final Twin Deeps cold trial, its HTTP response finished at 661 ms while room readiness was 6065 ms; chunk transfer alone cannot explain the failure. Region factories and view plugins are eagerly imported. A build-config split alone does not defer that work, so no cosmetic chunk-size change was made.
- **Console tails remain partly unexplained:** the Well Garden SYSTEMS follow-up did not reproduce its 151.6 ms hitch: the instrumented repeat had 12.3 ms p95 / 72.7 ms max. It sampled 437 ms game and 417 ms React/DOM self time, plus large native/runtime and idle shares. All formal trials stayed visible, operating and on one attempt with no model or browser exceptions. Host contention is a plausible contributor, not a proven cause of those exact hitches. A quiet repeat and the physical-device check remain necessary.

### Requested 2000× (R11, R18)

[DEMONSTRATED: `pf/top-warp.json`, raw vectors and worst profile] Twin Deeps, same modest proxy, two eight-second repeats per view. Every sampled interval reported saturation; all 18 trials were valid with zero model/browser errors. The runner preserves alerts and reselects requested warp after drops; this bounded stress test is not evidence of uninterrupted 2000× gameplay. Achieved rates below are actual ship seconds per wall second.

| View     | Repeat 1 | Repeat 2 | Recorded automatic drops |
| -------- | -------: | -------: | -----------------------: |
| ROOM     |     73.0 |     58.6 |                        0 |
| MISSION  |    128.8 |    147.3 |                        0 |
| PLAN     |    447.0 |    163.6 |                        0 |
| MODEL    |    185.7 |     80.7 |                        0 |
| BLACKBOX |    168.0 |     97.1 |                        0 |
| SYSTEMS  |    146.5 |     99.3 |                        0 |
| FLIGHT   |     60.6 |     64.4 |                        0 |
| MAP      |     52.5 |     76.9 |                        0 |
| SHIP     |     56.1 |     49.1 |                        0 |

[DEMONSTRATED: `pf/top-warp-summary.json`] The worst SHIP stress profile sampled 10.05 s: truth stepping 2.76 s inclusive, RoomView frame 3.18 s inclusive; `targetVisibility` 306 ms self, power dispatch 287 ms, and cloud-window construction 203 ms. These are remaining simulation/environment and presentation costs, not a reason to change the fixed step, budget, alerts or tape. No simulation patch is proposed.

### Readout and runner checks

[DEMONSTRATED: `pf/readout-check.json`, `pf/perf-readout.jpg`] The optional readout was checked from a fresh opening through room handoff into FLIGHT and SYSTEMS with reduced motion enabled: one mounted panel, no browser exceptions, stable first-draw value across the handoff and correct view/reset behavior. Its 326×322 panel fits within 1366×768 and collapses. [DEMONSTRATED: `pf/s20-smoke.json`] S20 reached the room on both cold and warm native-profile navigations with the opening bypass (3711 / 1173 ms). This is a runner smoke test, not a modest-profile gate result. The screenshot driver passed syntax validation; its complete multi-flight narrative was not rerun.

Additional reproducible S15 commands (same delivered source):

```powershell
node tools/studies/s15/measure.mjs --run presentation --phase profile --profile-startup opening --profile-label opening-startup --profiles modest --regions gravity-range --output docs/handoffs/pf --no-build
node tools/studies/s15/measure.mjs --run presentation --phase profile --profile-startup room --profile-label inverse-startup --profiles modest --regions inverse-wells --output docs/handoffs/pf --no-build
node tools/studies/s15/measure.mjs --run top-warp --phase frames --profiles modest --regions gravity-range --warps 2000 --repeats 2 --seconds 8 --output docs/handoffs/pf --no-build
node tools/studies/s15/measure.mjs --run covered-room --phase frames --patch docs/handoffs/pf/covered-room.patch --profiles modest --regions gravity-range --views map,ship --warps 1 --repeats 2 --seconds 8 --output docs/handoffs/pf
```

Use `--phase profile --profile-case REGION:modest:VIEW:1 --profile-label NAME --no-build` for a separate worst-cell profile. Delivered labels cover Cathedral FLIGHT, Twin Deeps SHIP, Well Garden SHIP and SYSTEMS; patch labels `map` and `ship` retain both visual captures. Add the same `--patch` when profiling the overlay. S20 smoke command: `node tools/studies/s20/measure.mjs --run pf-smoke --phase load --profiles native --load-repeats 1 --no-build` (its existing preview port is 4176); its output was moved into this handoff folder.

## Real modest-laptop check for the owner

This required physical-device check remains open. On the chosen laptop, record model, CPU/GPU, RAM, browser version, power mode, viewport and any other active work.

1. Build and serve the production app with `npm run build`, then `npm run preview -- --host 127.0.0.1 --port 4175 --strictPort`. Use an ordinary Chrome window at 1366×768 CSS pixels / DPR 1.
2. Open `http://127.0.0.1:4175/?perf` in a fresh browser profile for the opening; record **First draw** and observe the opening-to-room handoff. For an HTTP-cold observation disable the cache before navigating. Then reload with cache retained and the opening marker set for the returning-room observation. Do not add the authored 19.5-second sequence to the cold-load time.
3. Enter the encounter, select 1×, and visit ROOM, each of the five console pages, FLIGHT, MAP and SHIP. After the 1.2-second warm-up, stay at least eight seconds in each; record p95, worst, over-100 count, render scale and achieved ship seconds per second. Repeat. The readout resets on view/console-page/warp changes and ignores hidden time. Repeat with `?encounter=inverse-wells&perf` and `?encounter=chain-link&perf`.
4. Target **cold load <=2500 ms and 1× p95 <=33 ms in every view**; investigate every >100 ms hitch. First draw is a lower bound on readiness, not a physical display or interaction metric. The readout adds overhead; formal recorded evidence should use S15 on that laptop with `--profiles native`, and optionally the defined modest proxy. Do not call a local-server readout a throttled-network test.
5. Briefly check 2000× coasting and record achieved rate and automatic alert drops. Collapse the readout when examining the scene. Check reduced motion and that labels, targets, hazards and controls remain legible at reduced render scale.

## Requests outside my ownership

The owner/integrator was notified before the renderer checkpoint that PF would touch only renderer/composer setup and the single quality hook; ledger commit `1089339` also records that 2F and 3F were told. No direct chat to 3F was available here.

[DEMONSTRATED: `pf/covered-room.json`, profiles and `pf/covered-room.patch`] **3F, through the integrator:** consider the attached, unapplied diff that omits room/window submission behind settled MAP/SHIP’s nearly opaque veil (opacity >0.999). It retains direct scene lights and the hologram, skips transitions/loss, restores visibility in `finally`, and leaves `followEye` calls. This is beyond PF’s granted renderer/frame-hook scope, so it is only an in-memory build experiment.

| Twin Deeps | Delivered calls | Proposed calls | Delivered p95 median [range] | Proposed p95 median [range] |
| ---------- | --------------: | -------------: | ---------------------------: | --------------------------: |
| MAP        |             141 |             28 |          115.1 [115.1–115.1] |           91.0 [79.0–103.0] |
| SHIP       |             162 |             69 |          118.3 [103.2–133.4] |          115.3 [91.2–139.4] |

The deterministic saving is 113 MAP draws / 93 SHIP draws; the timing changes are observations under contention, not assured speedups. Neither cell passes. The proposal still updates the scene graph and outside transforms: its MAP profile has 724 ms inclusive matrix updating across 9.73 s sampled, and SHIP 525 ms across 10.01 s. Captures show retained holograms, labels and controls; they do not replace 3F’s transition, picking, loss and newer-field checks. Broader batching/static-transform or scene-lifetime work belongs with the view owners. No unmeasured patch or claimed saving for those changes is included.

The cold-start and handoff profiles above establish remaining work for the integrator/view owners, while the high-warp profile establishes remaining tick costs for 2F. They are limitations of this pass, not changes to apply without measurement.

## Notes for the next phase

The first-pass source is already on main through squash `f118dd2`; the older checkpoint IDs above are historical references, not merge instructions. Never merge `p3/pf-speed` again. The optional scene patch is **not applied** and needs 3F's review, especially transitions, loss, picking and supported field visuals. R48's runner fix is delivered. R49's release gate and R11/R18's physical-device follow-up must not be marked passed on this proxy evidence.
