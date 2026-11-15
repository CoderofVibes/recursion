# recheck — generated measurement tables

[DEMONSTRATED: tools/studies/s20/recheck.json and recheck-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

| Profile | Cache | Ready median / max | First interaction median / max | Console ready median / max |
| --- | --- | ---: | ---: | ---: |
| native | cold | 816.1 / 2593.3 | 852.2 / 2622.4 | 1710.2 / 3474.7 |
| native | warm | 761.3 / 1043.1 | 791.4 / 1131.4 | 1616.7 / 1909.7 |
| modest | cold | 4110.6 / 4886.5 | 4638.5 / 5147.1 | 5962.6 / 6262.9 |
| modest | warm | 3134.4 / 4125.5 | 3333.6 / 4521.7 | 4398.9 / 5762.0 |

| Profile | View | Requested warp | Frames | Median | p95 | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| native | room | 1× | 934 | 18.2 | 24.2 | 36.4 | 1.0 | 0.0 | 0 |
| native | mission | 1× | 1032 | 12.3 | 18.3 | 48.5 | 1.0 | 0.0 | 0 |
| native | plan | 1× | 1093 | 12.2 | 18.3 | 48.5 | 1.0 | 0.0 | 0 |
| native | model | 1× | 1060 | 12.2 | 18.3 | 30.4 | 1.0 | 0.0 | 0 |
| native | blackbox | 1× | 1061 | 12.2 | 18.3 | 30.3 | 1.0 | 0.0 | 0 |
| native | systems | 1× | 1061 | 12.2 | 24.3 | 42.5 | 1.0 | 0.0 | 0 |
| native | flight | 1× | 884 | 18.2 | 24.3 | 30.4 | 1.0 | 0.0 | 0 |
| native | map | 1× | 1250 | 12.1 | 18.2 | 18.5 | 1.0 | 0.0 | 0 |
| native | ship | 1× | 958 | 18.0 | 30.3 | 48.7 | 1.0 | 0.0 | 0 |
| native | room | 2000× | 661 | 24.2 | 42.5 | 60.6 | 859.7 | 97.9 | 0 |
| native | mission | 2000× | 701 | 18.2 | 42.4 | 78.8 | 911.6 | 99.6 | 0 |
| native | plan | 2000× | 739 | 18.2 | 42.4 | 54.6 | 939.9 | 97.6 | 0 |
| native | model | 2000× | 777 | 18.2 | 36.3 | 54.5 | 1171.1 | 93.8 | 0 |
| native | blackbox | 2000× | 833 | 18.2 | 30.3 | 54.6 | 1271.4 | 88.4 | 0 |
| native | systems | 2000× | 607 | 24.3 | 42.5 | 60.6 | 845.1 | 94.4 | 0 |
| native | flight | 2000× | 822 | 18.2 | 24.3 | 42.4 | 1111.6 | 98.8 | 0 |
| native | map | 2000× | 909 | 18.2 | 24.2 | 36.3 | 1226.1 | 97.2 | 0 |
| native | ship | 2000× | 941 | 18.1 | 24.4 | 60.4 | 1297.7 | 68.9 | 0 |
| modest | room | 1× | 215 | 66.7 | 121.5 | 188.0 | 0.9 | 0.0 | 0 |
| modest | mission | 1× | 434 | 36.3 | 66.6 | 145.6 | 1.0 | 0.0 | 0 |
| modest | plan | 1× | 586 | 24.1 | 54.6 | 78.8 | 1.0 | 0.0 | 0 |
| modest | model | 1× | 458 | 30.4 | 60.5 | 127.2 | 1.0 | 0.0 | 0 |
| modest | blackbox | 1× | 314 | 42.3 | 121.3 | 181.8 | 0.9 | 0.0 | 0 |
| modest | systems | 1× | 199 | 42.5 | 333.3 | 460.5 | 0.7 | 0.0 | 0 |
| modest | flight | 1× | 275 | 54.6 | 84.8 | 133.3 | 1.0 | 0.0 | 0 |
| modest | map | 1× | 363 | 42.5 | 66.7 | 85.0 | 1.0 | 0.0 | 0 |
| modest | ship | 1× | 268 | 54.5 | 97.1 | 133.3 | 1.0 | 0.0 | 0 |
| modest | room | 2000× | 183 | 78.9 | 133.3 | 242.4 | 92.7 | 100.0 | 0 |
| modest | mission | 2000× | 259 | 60.5 | 91.0 | 157.5 | 129.7 | 100.0 | 0 |
| modest | plan | 2000× | 356 | 42.4 | 66.5 | 115.1 | 178.8 | 100.0 | 0 |
| modest | model | 2000× | 177 | 84.9 | 187.9 | 327.2 | 88.9 | 100.0 | 0 |
| modest | blackbox | 2000× | 155 | 91.2 | 193.9 | 254.4 | 78.0 | 100.0 | 0 |
| modest | systems | 2000× | 120 | 84.8 | 424.3 | 533.3 | 60.0 | 100.0 | 0 |
| modest | flight | 2000× | 193 | 72.8 | 145.5 | 187.9 | 97.9 | 100.0 | 0 |
| modest | map | 2000× | 134 | 115.2 | 175.8 | 266.7 | 67.5 | 100.0 | 0 |
| modest | ship | 2000× | 127 | 121.3 | 187.9 | 266.7 | 63.9 | 100.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| native | room | 2000× | 647 | 24.2 | 42.5 | 60.6 | 848.6 |
| native | mission | 2000× | 698 | 18.2 | 42.4 | 78.8 | 909.3 |
| native | plan | 2000× | 721 | 18.2 | 42.4 | 54.6 | 926.6 |
| native | model | 2000× | 729 | 18.2 | 36.3 | 54.5 | 1135.6 |
| native | blackbox | 2000× | 736 | 18.2 | 30.3 | 54.6 | 1205.2 |
| native | systems | 2000× | 573 | 24.3 | 42.5 | 60.6 | 815.0 |
| native | flight | 2000× | 812 | 18.2 | 24.3 | 42.4 | 1104.7 |
| native | map | 2000× | 884 | 18.2 | 24.2 | 36.3 | 1210.3 |
| native | ship | 2000× | 648 | 18.2 | 30.3 | 60.4 | 1099.6 |
| modest | room | 2000× | 183 | 78.9 | 133.3 | 242.4 | 91.8 |
| modest | mission | 2000× | 259 | 60.5 | 91.0 | 157.5 | 129.6 |
| modest | plan | 2000× | 356 | 42.4 | 66.5 | 115.1 | 178.5 |
| modest | model | 2000× | 177 | 84.9 | 187.9 | 327.2 | 88.9 |
| modest | blackbox | 2000× | 155 | 91.2 | 193.9 | 254.4 | 77.8 |
| modest | systems | 2000× | 120 | 84.8 | 424.3 | 533.3 | 59.9 |
| modest | flight | 2000× | 193 | 72.8 | 145.5 | 187.9 | 97.9 |
| modest | map | 2000× | 134 | 115.2 | 175.8 | 266.7 | 67.1 |
| modest | ship | 2000× | 127 | 121.3 | 187.9 | 266.7 | 63.7 |

## health-main.cpuprofile.gz

Sampled duration: 20016.7 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 5431.8 | 5431.8 |
| dispatchPower | src/ship/power/index.ts:107 | 1088.9 | 1652.6 |
| stepPower | src/ship/power/index.ts:36 | 667.5 | 2335.2 |
| targetVisibility | src/game/environment.ts:105 | 605.0 | 607.3 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 412.7 | 492.6 |
| stepShipSystems | src/ship/index.ts:50 | 363.2 | 4508.0 |
| load | src/sim/simulation.ts:376 | 358.8 | 391.1 |
| setProgram | node_modules/three/build/three.module.js:18220 | 307.4 | 1330.2 |
| (garbage collector) | native/runtime:— | 300.8 | 300.8 |
| stepThermal | src/ship/thermal/index.ts:16 | 300.7 | 404.6 |
| store | src/sim/simulation.ts:506 | 299.3 | 314.5 |
| sensorTargets | src/sim/snapshot.ts:49 | 264.6 | 264.6 |
| stepPropulsion | src/ship/propulsion/propulsion.ts:232 | 240.0 | 888.5 |
| projectObject | node_modules/three/build/three.module.js:17696 | 211.4 | 388.3 |
| allocate | src/ship/power/index.ts:332 | 203.8 | 203.8 |
| computeAccelerations | src/sim/simulation.ts:619 | 178.9 | 178.9 |
| (anonymous) | src/game/belief/standin-model.ts:866 | 168.1 | 279.1 |
| preparePropulsion | src/ship/propulsion/propulsion.ts:118 | 158.9 | 302.0 |
| build | src/ship/massprops/massprops.ts:25 | 158.2 | 318.3 |
| advance | src/sim/simulation.ts:836 | 156.9 | 478.9 |

## health-worker-0.cpuprofile.gz

Sampled duration: 20324.0 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 19788.9 | 19788.9 |
| simulate | src/model/dynamics.ts:682 | 160.2 | 335.6 |
| accel | src/model/dynamics.ts:808 | 78.2 | 90.7 |
| rk4 | src/model/dynamics.ts:868 | 55.0 | 145.7 |
| residuals | src/model/dynamics.ts:1011 | 39.9 | 361.5 |
| (garbage collector) | native/runtime:— | 32.0 | 32.0 |
| resolve | src/model/dynamics.ts:626 | 21.7 | 23.0 |
| h | src/lib/quat.ts:119 | 16.1 | 16.1 |
| solve | src/model/solve.ts:404 | 10.3 | 419.1 |
| normal | src/model/solve.ts:495 | 7.6 | 7.6 |
| V | src/model/dynamics.ts:891 | 7.4 | 7.4 |
| scaleOf | src/model/dynamics.ts:744 | 6.5 | 6.5 |
| luDecompose | src/model/linalg.ts:102 | 6.1 | 6.1 |
| pull | src/model/dynamics.ts:741 | 6.0 | 6.0 |
| priorTerms | src/model/solve.ts:350 | 5.8 | 5.8 |
| compileArc | src/model/dynamics.ts:439 | 5.5 | 7.9 |
| luSolve | src/model/linalg.ts:139 | 4.7 | 4.7 |
| val | src/model/dynamics.ts:584 | 4.6 | 4.6 |
| rotateBy | src/model/dynamics.ts:314 | 3.8 | 3.8 |
| residualAndJacobian | src/model/solve.ts:228 | 3.5 | 366.1 |

## worst-main.cpuprofile.gz

Sampled duration: 10464.3 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 4341.3 | 4341.3 |
| resize | src/view3d/room/RoomView.ts:493 | 454.7 | 454.7 |
| dispatchPower | src/ship/power/index.ts:107 | 367.6 | 584.4 |
| ze | src/console/format.ts:40 | 284.9 | 284.9 |
| stepPower | src/ship/power/index.ts:36 | 237.4 | 828.1 |
| targetVisibility | src/game/environment.ts:105 | 178.5 | 255.4 |
| setProgram | node_modules/three/build/three.module.js:18220 | 143.3 | 438.5 |
| load | src/sim/simulation.ts:376 | 125.8 | 137.4 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 125.6 | 153.6 |
| store | src/sim/simulation.ts:506 | 122.4 | 125.7 |
| stepShipSystems | src/ship/index.ts:50 | 112.1 | 1603.7 |
| stepPropulsion | src/ship/propulsion/propulsion.ts:232 | 98.8 | 331.0 |
| stepThermal | src/ship/thermal/index.ts:16 | 98.8 | 142.1 |
| (garbage collector) | native/runtime:— | 96.9 | 96.9 |
| (anonymous) | src/game/belief/standin-model.ts:866 | 91.2 | 122.1 |
| sensorTargets | src/sim/snapshot.ts:49 | 89.9 | 89.9 |
| computeAccelerations | src/sim/simulation.ts:619 | 71.7 | 71.7 |
| allocate | src/ship/power/index.ts:332 | 66.0 | 66.0 |
| gravity | src/game/belief/standin-model.ts:262 | 64.2 | 169.0 |
| inShadow | src/game/environment.ts:35 | 63.0 | 63.0 |

## worst-worker-0.cpuprofile.gz

Sampled duration: 11263.9 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 11125.8 | 11125.8 |
| simulate | src/model/dynamics.ts:682 | 36.5 | 66.0 |
| me | src/model/adapt.ts:349 | 17.2 | 17.2 |
| residuals | src/model/dynamics.ts:1011 | 12.8 | 68.6 |
| accel | src/model/dynamics.ts:808 | 8.1 | 12.7 |
| rk4 | src/model/dynamics.ts:868 | 6.1 | 18.7 |
| (garbage collector) | native/runtime:— | 4.9 | 4.9 |
| V | src/model/dynamics.ts:891 | 4.7 | 4.7 |
| resolve | src/model/dynamics.ts:626 | 4.3 | 6.1 |
| arcFit | src/model/engine.ts:580 | 3.5 | 77.6 |
| buildOnce | src/model/engine.ts:851 | 3.2 | 131.2 |
| pull | src/model/dynamics.ts:741 | 3.1 | 3.1 |
| briefingBodiesAt | src/model/engine.ts:237 | 3.0 | 6.3 |
| residualAndJacobian | src/model/solve.ts:228 | 2.6 | 78.0 |
| visit | src/lib/hash.ts:73 | 2.0 | 3.3 |
| (anonymous) | src/model/engine.ts:451 | 1.7 | 1.7 |
| vr.onmessage | src/model/worker.ts:17 | 1.6 | 133.2 |
| directed | src/model/solve.ts:271 | 1.6 | 1.6 |
| luSolve | src/model/linalg.ts:139 | 1.6 | 1.6 |
| luDecompose | src/model/linalg.ts:102 | 1.6 | 1.6 |
