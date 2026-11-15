# baseline — generated measurement tables

[DEMONSTRATED: tools/studies/s15/baseline.json and baseline-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

| Profile | Cache | Ready median / max | First interaction median / max | Console ready median / max |
| --- | --- | ---: | ---: | ---: |
| native | cold | 509.7 / 1155.1 | 529.1 / 1171.7 | 1363.9 / 1995.4 |
| native | warm | 552.5 / 627.1 | 575.6 / 661.8 | 1401.1 / 1471.7 |
| modest | cold | 1991.0 / 2255.5 | 2103.9 / 2371.8 | 3010.8 / 3279.8 |
| modest | warm | 1718.7 / 1827.6 | 1822.3 / 1943.7 | 2716.9 / 2879.7 |

| Profile | View | Requested warp | Frames | Median | p95 | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| native | room | 1× | 1440 | 12.1 | 18.0 | 18.5 | 1.0 | 0.0 | 0 |
| native | mission | 1× | 1738 | 11.9 | 12.3 | 18.1 | 1.0 | 0.0 | 0 |
| native | plan | 1× | 1737 | 11.9 | 12.3 | 18.1 | 1.0 | 0.0 | 0 |
| native | model | 1× | 1723 | 11.9 | 12.3 | 18.3 | 1.0 | 0.0 | 0 |
| native | blackbox | 1× | 1723 | 11.9 | 12.2 | 18.3 | 1.0 | 0.0 | 0 |
| native | systems | 1× | 1706 | 11.9 | 12.3 | 18.4 | 1.0 | 0.0 | 0 |
| native | flight | 1× | 1509 | 12.1 | 18.0 | 24.3 | 1.0 | 0.0 | 0 |
| native | map | 1× | 1941 | 6.1 | 12.2 | 18.1 | 1.0 | 0.0 | 0 |
| native | ship | 1× | 1852 | 6.2 | 12.2 | 18.3 | 1.0 | 0.0 | 0 |
| native | room | 2000× | 1223 | 12.2 | 18.3 | 27.3 | 1870.0 | 15.2 | 0 |
| native | mission | 2000× | 1672 | 11.9 | 12.3 | 24.3 | 1999.9 | 0.0 | 0 |
| native | plan | 2000× | 1737 | 11.9 | 12.3 | 18.3 | 1999.9 | 0.0 | 0 |
| native | model | 2000× | 1738 | 11.9 | 12.3 | 24.2 | 1999.3 | 0.1 | 0 |
| native | blackbox | 2000× | 1676 | 12.0 | 12.3 | 24.1 | 2000.2 | 0.0 | 0 |
| native | systems | 2000× | 810 | 18.2 | 30.5 | 54.6 | 1700.8 | 26.5 | 0 |
| native | flight | 2000× | 1308 | 12.1 | 18.2 | 18.4 | 1986.0 | 3.3 | 0 |
| native | map | 2000× | 1795 | 6.2 | 12.3 | 30.4 | 1956.7 | 6.7 | 0 |
| native | ship | 2000× | 1767 | 6.4 | 12.3 | 18.4 | 2000.5 | 0.0 | 0 |
| modest | room | 1× | 1056 | 12.3 | 18.4 | 42.5 | 1.0 | 0.0 | 0 |
| modest | mission | 1× | 1591 | 12.0 | 18.1 | 36.5 | 1.0 | 0.0 | 0 |
| modest | plan | 1× | 1543 | 12.0 | 18.1 | 24.3 | 1.0 | 0.0 | 0 |
| modest | model | 1× | 1228 | 12.1 | 24.4 | 48.5 | 1.0 | 0.0 | 0 |
| modest | blackbox | 1× | 1355 | 12.1 | 18.3 | 42.4 | 1.0 | 0.0 | 0 |
| modest | systems | 1× | 1093 | 12.1 | 30.2 | 333.4 | 0.9 | 0.0 | 0 |
| modest | flight | 1× | 961 | 18.1 | 24.3 | 48.6 | 1.0 | 0.0 | 0 |
| modest | map | 1× | 1317 | 12.1 | 18.3 | 30.5 | 1.0 | 0.0 | 0 |
| modest | ship | 1× | 1129 | 12.2 | 18.4 | 36.3 | 1.0 | 0.0 | 0 |
| modest | room | 2000× | 521 | 30.3 | 42.2 | 103.2 | 322.4 | 100.0 | 0 |
| modest | mission | 2000× | 584 | 24.4 | 36.5 | 60.5 | 372.3 | 100.0 | 0 |
| modest | plan | 2000× | 632 | 24.3 | 30.5 | 42.3 | 491.6 | 99.8 | 0 |
| modest | model | 2000× | 612 | 24.3 | 36.4 | 79.0 | 452.6 | 100.0 | 0 |
| modest | blackbox | 2000× | 445 | 24.4 | 84.8 | 181.7 | 283.9 | 100.0 | 0 |
| modest | systems | 2000× | 422 | 30.3 | 78.8 | 242.4 | 269.8 | 100.0 | 0 |
| modest | flight | 2000× | 527 | 30.3 | 42.4 | 60.7 | 285.1 | 100.0 | 0 |
| modest | map | 2000× | 601 | 24.3 | 36.4 | 54.5 | 371.0 | 100.0 | 0 |
| modest | ship | 2000× | 563 | 30.1 | 36.5 | 66.7 | 322.7 | 100.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| native | room | 2000× | 186 | 18.2 | 24.2 | 27.3 | 1370.9 |
| native | model | 2000× | 1 | 18.2 | 18.2 | 18.2 | 1758.2 |
| native | systems | 2000× | 215 | 24.3 | 42.5 | 54.6 | 1155.0 |
| native | flight | 2000× | 43 | 18.2 | 18.3 | 18.4 | 1670.2 |
| native | map | 2000× | 121 | 12.2 | 18.3 | 30.4 | 1615.1 |
| modest | room | 2000× | 521 | 30.3 | 42.2 | 103.2 | 322.3 |
| modest | mission | 2000× | 584 | 24.4 | 36.5 | 60.5 | 372.3 |
| modest | plan | 2000× | 631 | 24.3 | 30.5 | 42.3 | 490.8 |
| modest | model | 2000× | 612 | 24.3 | 36.4 | 79.0 | 452.7 |
| modest | blackbox | 2000× | 445 | 24.4 | 84.8 | 181.7 | 282.2 |
| modest | systems | 2000× | 422 | 30.3 | 78.8 | 242.4 | 269.7 |
| modest | flight | 2000× | 527 | 30.3 | 42.4 | 60.7 | 285.5 |
| modest | map | 2000× | 601 | 24.3 | 36.4 | 54.5 | 370.7 |
| modest | ship | 2000× | 563 | 30.1 | 36.5 | 66.7 | 322.7 |

## hitch-main.cpuprofile.gz

Sampled duration: 9050.7 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 3597.6 | 3597.6 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 450.9 | 561.4 |
| ze | src/console/format.ts:40 | 258.6 | 258.6 |
| projectObject | node_modules/three/build/three.module.js:17696 | 222.8 | 407.2 |
| (anonymous) | src/game/belief/standin-model.ts:430 | 189.5 | 269.3 |
| setProgram | node_modules/three/build/three.module.js:18220 | 185.0 | 1053.7 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 167.5 | 1745.5 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 166.0 | 166.0 |
| resize | src/view3d/room/RoomView.ts:493 | 152.7 | 152.7 |
| bindVertexArray | native/runtime:— | 116.1 | 116.1 |
| update | node_modules/three/build/three.module.js:242 | 94.5 | 138.5 |
| hideObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:213 | 85.3 | 85.3 |
| (idle) | native/runtime:— | 78.5 | 78.5 |
| drawElements | native/runtime:— | 72.7 | 72.7 |
| renderObjects | node_modules/three/build/three.module.js:17964 | 71.3 | 1947.4 |
| render | node_modules/three/build/three.module.js:17464 | 69.9 | 2879.6 |
| bindTexture | native/runtime:— | 69.6 | 69.6 |
| (anonymous) | src/game/belief/standin-model.ts:442 | 64.4 | 64.4 |
| (garbage collector) | native/runtime:— | 63.6 | 63.6 |
| renderObject | node_modules/three/build/three.module.js:17991 | 62.9 | 1876.5 |

## hitch-worker-0.cpuprofile.gz

Sampled duration: 9224.2 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 9224.2 | 9224.2 |
| (root) | native/runtime:— | 0.0 | 9224.2 |

## worst-main.cpuprofile.gz

Sampled duration: 8609.5 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 1972.1 | 1972.1 |
| dispatchPower | src/ship/power/index.ts:97 | 669.4 | 1482.4 |
| stepPower | src/ship/power/index.ts:26 | 372.8 | 1868.5 |
| update | src/ship/power/index.ts:125 | 369.4 | 369.4 |
| getGeometry | src/ship/config/configuration.ts:66 | 363.0 | 616.7 |
| stepThermal | src/ship/thermal/index.ts:16 | 226.4 | 326.2 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 214.8 | 254.5 |
| computeMassProperties | src/ship/massprops/massprops.ts:19 | 184.6 | 549.5 |
| stepShipSystems | src/ship/index.ts:15 | 157.9 | 3418.4 |
| setProgram | node_modules/three/build/three.module.js:18220 | 144.8 | 597.2 |
| (garbage collector) | native/runtime:— | 132.6 | 132.6 |
| resize | src/view3d/room/RoomView.ts:493 | 131.1 | 131.1 |
| stepPropulsion | src/ship/propulsion/propulsion.ts:126 | 123.4 | 689.7 |
| allocate | src/ship/power/index.ts:333 | 109.8 | 109.8 |
| projectObject | node_modules/three/build/three.module.js:17696 | 104.2 | 202.6 |
| convexHull | src/ship/config/configuration.ts:20 | 96.7 | 198.2 |
| (anonymous) | src/game/belief/standin-model.ts:430 | 88.6 | 145.7 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 84.6 | 911.2 |
| d | src/ship/power/index.ts:112 | 66.3 | 66.3 |
| stepSensors | src/ship/sensors/index.ts:131 | 59.6 | 85.4 |

## worst-worker-0.cpuprofile.gz

Sampled duration: 8690.6 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 8570.2 | 8570.2 |
| accel | src/model/dynamics.ts:491 | 30.4 | 30.4 |
| (garbage collector) | native/runtime:— | 13.8 | 13.8 |
| simulate | src/model/dynamics.ts:439 | 10.8 | 58.6 |
| rk4 | src/model/dynamics.ts:574 | 10.3 | 40.7 |
| predict | src/model/dynamics.ts:684 | 7.6 | 59.9 |
| zeros | src/model/linalg.ts:16 | 5.8 | 5.8 |
| val | src/model/dynamics.ts:359 | 4.6 | 4.6 |
| resolve | src/model/dynamics.ts:401 | 3.9 | 4.9 |
| solve | src/model/solve.ts:277 | 3.6 | 76.6 |
| residualAndJacobian | src/model/solve.ts:209 | 2.8 | 63.5 |
| stagedFit | src/model/solve.ts:406 | 2.5 | 42.7 |
| buildModel | src/model/engine.ts:694 | 1.8 | 106.2 |
| priorTerms | src/model/solve.ts:240 | 1.7 | 5.9 |
| agingClass | src/model/aging.ts:28 | 1.7 | 1.7 |
| (anonymous) | src/model/dynamics.ts:343 | 1.7 | 1.7 |
| arcFit | src/model/engine.ts:539 | 1.7 | 44.3 |
| fitWindows | src/model/engine.ts:746 | 1.7 | 26.6 |
| luDecompose | src/model/linalg.ts:102 | 1.7 | 1.7 |
| localFitDetailed | src/model/tierL.ts:389 | 1.6 | 18.6 |
