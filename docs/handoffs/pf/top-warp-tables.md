# top-warp — generated measurement tables

[DEMONSTRATED: docs/handoffs/pf/top-warp.json and top-warp-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

No load trials in this focused run.

| Region | Profile | View | Requested warp | Frames | Median | Pooled p95 | Per-run p95 median [min–max] | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gravity-range | modest | room | 2000× | 131 | 121.2 | 188.0 | 193.9 [169.7–218.2] | 248.6 | 65.9 | 100.0 | 0 |
| gravity-range | modest | mission | 2000× | 270 | 54.5 | 115.1 | 109.0 [84.8–133.2] | 206.0 | 138.1 | 100.0 | 0 |
| gravity-range | modest | plan | 2000× | 419 | 30.3 | 78.7 | 66.7 [42.5–90.9] | 145.4 | 305.4 | 100.0 | 0 |
| gravity-range | modest | model | 2000× | 247 | 54.5 | 133.3 | 124.2 [96.9–151.5] | 236.3 | 133.3 | 100.0 | 0 |
| gravity-range | modest | blackbox | 2000× | 258 | 54.6 | 115.1 | 106.0 [84.7–127.2] | 194.0 | 132.5 | 100.0 | 0 |
| gravity-range | modest | systems | 2000× | 241 | 54.6 | 133.3 | 121.2 [90.9–151.5] | 163.7 | 122.9 | 100.0 | 0 |
| gravity-range | modest | flight | 2000× | 122 | 133.2 | 206.0 | 206.2 [169.9–242.4] | 254.5 | 62.5 | 100.0 | 0 |
| gravity-range | modest | map | 2000× | 128 | 109.2 | 218.1 | 196.9 [151.5–242.3] | 351.4 | 64.7 | 100.0 | 0 |
| gravity-range | modest | ship | 2000× | 105 | 145.4 | 236.3 | 242.4 [230.2–254.6] | 284.9 | 52.6 | 100.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| modest | room | 2000× | 131 | 121.2 | 188.0 | 248.6 | 66.5 |
| modest | mission | 2000× | 270 | 54.5 | 115.1 | 206.0 | 137.5 |
| modest | plan | 2000× | 419 | 30.3 | 78.7 | 145.4 | 305.2 |
| modest | model | 2000× | 247 | 54.5 | 133.3 | 236.3 | 133.5 |
| modest | blackbox | 2000× | 258 | 54.6 | 115.1 | 194.0 | 132.7 |
| modest | systems | 2000× | 241 | 54.6 | 133.3 | 163.7 | 122.8 |
| modest | flight | 2000× | 122 | 133.2 | 206.0 | 254.5 | 62.2 |
| modest | map | 2000× | 128 | 109.2 | 218.1 | 351.4 | 64.6 |
| modest | ship | 2000× | 105 | 145.4 | 236.3 | 284.9 | 52.7 |

## worst-main.cpuprofile.gz

Sampled duration: 10051.6 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 2319.7 | 2319.7 |
| targetVisibility | src/game/environment.ts:145 | 306.4 | 308.0 |
| dispatchPower | src/ship/power/index.ts:180 | 287.1 | 412.8 |
| setProgram | node_modules/three/build/three.module.js:18220 | 260.1 | 887.0 |
| cloudWindow | src/content/gravity-range/clouds.ts:223 | 202.6 | 446.9 |
| crescentIntensity | src/content/gravity-range/clouds.ts:121 | 173.5 | 173.5 |
| (garbage collector) | native/runtime:— | 166.8 | 166.8 |
| stepThermal | src/ship/thermal/index.ts:53 | 166.5 | 234.6 |
| (anonymous) | src/game/belief/standin-model.ts:909 | 164.6 | 164.6 |
| store | src/sim/simulation.ts:506 | 150.9 | 154.0 |
| stepShipSystems | src/ship/index.ts:50 | 143.9 | 1297.2 |
| load | src/sim/simulation.ts:376 | 142.9 | 164.6 |
| sensorTargets | src/sim/snapshot.ts:49 | 123.5 | 123.5 |
| bindVertexArray | native/runtime:— | 115.1 | 115.1 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 91.4 | 91.4 |
| step | src/game/truth-step.ts:331 | 87.0 | 2760.6 |
| allocate | src/ship/power/index.ts:445 | 84.5 | 84.5 |
| pull | src/game/belief/standin-model.ts:256 | 84.4 | 85.6 |
| renderObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:225 | 80.9 | 131.2 |
| stepPower | src/ship/power/index.ts:113 | 80.8 | 502.4 |

## worst-worker-0.cpuprofile.gz

Sampled duration: 10306.5 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 10167.7 | 10167.7 |
| simulate | src/model/dynamics.ts:693 | 54.0 | 73.9 |
| (garbage collector) | native/runtime:— | 11.8 | 11.8 |
| resolve | src/model/dynamics.ts:637 | 8.6 | 9.1 |
| accel | src/model/dynamics.ts:825 | 6.2 | 6.2 |
| residuals | src/model/dynamics.ts:1033 | 4.8 | 70.6 |
| rk4 | src/model/dynamics.ts:890 | 4.6 | 10.7 |
| luDecompose | src/model/linalg.ts:102 | 4.3 | 4.3 |
| compileArc | src/model/dynamics.ts:449 | 4.2 | 4.2 |
| normal | src/model/solve.ts:495 | 3.2 | 3.2 |
| buildOnce | src/model/engine.ts:919 | 3.1 | 124.6 |
| re | src/model/dynamics.ts:913 | 2.8 | 2.8 |
| ut | src/model/solve.ts:167 | 2.7 | 5.4 |
| solve | src/model/solve.ts:404 | 2.5 | 94.1 |
| arcFit | src/model/engine.ts:583 | 1.7 | 87.4 |
| historyVariance | src/model/aging.ts:222 | 1.7 | 1.7 |
| residualAndJacobian | src/model/solve.ts:228 | 1.7 | 77.8 |
| inverse | src/model/linalg.ts:161 | 1.6 | 6.5 |
| stagedFit | src/model/solve.ts:542 | 1.6 | 85.7 |
| (anonymous) | src/model/engine.ts:446 | 1.6 | 1.6 |
