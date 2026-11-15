# quiet-confirmation — generated measurement tables

[DEMONSTRATED: tools/studies/s20/quiet-confirmation.json and quiet-confirmation-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

| Profile | Cache | Ready median / max | First interaction median / max | Console ready median / max |
| --- | --- | ---: | ---: | ---: |
| modest | cold | 3392.5 / 6062.3 | 3732.8 / 6405.8 | 4936.2 / 7703.5 |
| modest | warm | 3229.4 / 3778.7 | 3531.2 / 4237.1 | 4788.3 / 5403.6 |

| Profile | View | Requested warp | Frames | Median | p95 | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| modest | room | 1× | 291 | 48.6 | 85.2 | 181.8 | 1.0 | 0.0 | 0 |
| modest | room | 2000× | 174 | 84.9 | 139.4 | 188.0 | 87.6 | 100.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| modest | room | 2000× | 174 | 84.9 | 139.4 | 188.0 | 87.7 |

## worst-main.cpuprofile.gz

Sampled duration: 10074.7 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 2298.6 | 2298.6 |
| dispatchPower | src/ship/power/index.ts:107 | 450.8 | 676.2 |
| targetVisibility | src/game/environment.ts:105 | 287.1 | 291.5 |
| stepPower | src/ship/power/index.ts:36 | 284.4 | 973.3 |
| setProgram | node_modules/three/build/three.module.js:18220 | 259.6 | 1114.1 |
| load | src/sim/simulation.ts:376 | 160.0 | 182.3 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 151.0 | 195.0 |
| bindVertexArray | native/runtime:— | 149.4 | 149.4 |
| projectObject | node_modules/three/build/three.module.js:17696 | 147.8 | 394.6 |
| stepPropulsion | src/ship/propulsion/propulsion.ts:232 | 146.6 | 436.1 |
| stepShipSystems | src/ship/index.ts:50 | 144.4 | 1896.6 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 125.3 | 2030.5 |
| (garbage collector) | native/runtime:— | 111.4 | 111.4 |
| drawElements | native/runtime:— | 110.3 | 110.3 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 109.7 | 109.7 |
| stepThermal | src/ship/thermal/index.ts:16 | 103.4 | 141.1 |
| update | node_modules/three/build/three.module.js:242 | 102.0 | 224.6 |
| build | src/ship/massprops/massprops.ts:25 | 95.3 | 164.9 |
| store | src/sim/simulation.ts:506 | 93.3 | 93.3 |
| advance | src/sim/simulation.ts:836 | 87.8 | 215.1 |

## worst-worker-0.cpuprofile.gz

Sampled duration: 10358.8 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 10177.4 | 10177.4 |
| simulate | src/model/dynamics.ts:682 | 61.4 | 89.8 |
| (garbage collector) | native/runtime:— | 15.5 | 15.5 |
| residuals | src/model/dynamics.ts:1011 | 11.1 | 95.6 |
| rk4 | src/model/dynamics.ts:868 | 10.3 | 19.9 |
| accel | src/model/dynamics.ts:808 | 9.6 | 9.6 |
| residualAndJacobian | src/model/solve.ts:228 | 6.8 | 96.1 |
| solve | src/model/solve.ts:404 | 6.2 | 121.8 |
| resolve | src/model/dynamics.ts:626 | 6.0 | 6.8 |
| buildOnce | src/model/engine.ts:851 | 4.8 | 162.6 |
| normal | src/model/solve.ts:495 | 3.7 | 3.7 |
| fitWindows | src/model/engine.ts:925 | 3.4 | 31.0 |
| st | src/model/solve.ts:167 | 3.3 | 7.6 |
| rotateBy | src/model/dynamics.ts:314 | 3.2 | 3.2 |
| compileArc | src/model/dynamics.ts:439 | 3.1 | 4.1 |
| solve | src/model/linalg.ts:157 | 2.5 | 2.5 |
| nonFinite | src/model/engine.ts:768 | 1.7 | 1.7 |
| (anonymous) | src/model/engine.ts:273 | 1.6 | 1.6 |
| luSolve | src/model/linalg.ts:139 | 1.6 | 1.6 |
| (anonymous) | src/model/dynamics.ts:735 | 1.6 | 1.6 |
