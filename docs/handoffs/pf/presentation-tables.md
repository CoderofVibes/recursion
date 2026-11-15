# presentation — generated measurement tables

[DEMONSTRATED: docs/handoffs/pf/presentation.json and presentation-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

| Region | Profile | Cache | Ready median / max | First interaction median / max | Console ready median / max |
| --- | --- | --- | ---: | ---: | ---: |
| gravity-range | modest | cold | 5656.8 / 6065.2 | 6015.4 / 6265.9 | 7125.8 / 7501.3 |
| gravity-range | modest | warm | 4168.5 / 6690.6 | 4707.6 / 7196.8 | 5942.6 / 8682.2 |
| inverse-wells | modest | cold | 5388.7 / 10811.2 | 5801.7 / 11594.5 | 6997.4 / 13254.6 |
| inverse-wells | modest | warm | 5180.2 / 9358.8 | 5393.3 / 9926.2 | 6649.1 / 10999.2 |
| chain-link | modest | cold | 4506.6 / 4544.0 | 4857.7 / 4907.8 | 5851.0 / 6147.3 |
| chain-link | modest | warm | 4431.6 / 4674.3 | 4881.0 / 5104.2 | 6036.1 / 6309.9 |

| Region | Profile | View | Requested warp | Frames | Median | Pooled p95 | Per-run p95 median [min–max] | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gravity-range | modest | room | 1× | 232 | 66.6 | 109.2 | 109.1 [103.1–115.1] | 205.9 | 1.0 | 0.0 | 0 |
| gravity-range | modest | mission | 1× | 1707 | 6.1 | 24.2 | 24.3 [12.2–36.4] | 109.2 | 1.0 | 0.0 | 0 |
| gravity-range | modest | plan | 1× | 1890 | 6.1 | 18.2 | 18.2 [18.1–18.3] | 91.0 | 1.0 | 0.0 | 0 |
| gravity-range | modest | model | 1× | 1995 | 6.1 | 18.1 | 15.3 [12.3–18.2] | 60.7 | 1.0 | 0.0 | 0 |
| gravity-range | modest | blackbox | 1× | 1953 | 6.1 | 18.2 | 18.2 [18.2–18.2] | 78.8 | 1.0 | 0.0 | 0 |
| gravity-range | modest | systems | 1× | 1862 | 6.1 | 18.2 | 18.3 [12.3–24.4] | 84.7 | 1.0 | 0.0 | 0 |
| gravity-range | modest | flight | 1× | 282 | 48.6 | 97.0 | 103.1 [90.9–115.2] | 236.4 | 1.0 | 0.0 | 0 |
| gravity-range | modest | map | 1× | 254 | 60.5 | 115.1 | 115.1 [115.1–115.1] | 212.1 | 1.0 | 0.0 | 0 |
| gravity-range | modest | ship | 1× | 260 | 54.5 | 114.9 | 118.3 [103.2–133.4] | 194.0 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | room | 1× | 263 | 54.6 | 103.1 | 103.1 [103.1–103.1] | 133.3 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | mission | 1× | 2251 | 6.1 | 12.1 | 9.3 [6.3–12.3] | 96.9 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | plan | 1× | 2388 | 6.1 | 12.0 | 9.2 [6.3–12.1] | 85.0 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | model | 1× | 2343 | 6.1 | 12.1 | 12.2 [6.3–18.1] | 90.9 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | blackbox | 1× | 2018 | 6.1 | 18.1 | 18.2 [12.1–24.2] | 103.0 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | systems | 1× | 1648 | 6.1 | 24.3 | 30.4 [18.2–42.5] | 151.6 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | flight | 1× | 485 | 36.3 | 54.5 | 54.5 [54.5–54.5] | 78.8 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | map | 1× | 479 | 30.4 | 60.6 | 57.6 [48.5–66.6] | 109.1 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | ship | 1× | 308 | 42.5 | 96.9 | 90.9 [60.6–121.3] | 181.8 | 1.0 | 0.0 | 0 |
| chain-link | modest | room | 1× | 193 | 78.8 | 133.2 | 133.3 [133.2–133.3] | 193.9 | 0.9 | 0.0 | 0 |
| chain-link | modest | mission | 1× | 2071 | 6.1 | 18.2 | 18.1 [18.0–18.2] | 109.3 | 1.0 | 0.0 | 0 |
| chain-link | modest | plan | 1× | 2248 | 6.1 | 12.2 | 12.2 [12.2–12.2] | 121.2 | 1.0 | 0.0 | 0 |
| chain-link | modest | model | 1× | 2202 | 6.1 | 12.2 | 15.1 [12.1–18.2] | 60.6 | 1.0 | 0.0 | 0 |
| chain-link | modest | blackbox | 1× | 2025 | 6.1 | 18.2 | 18.2 [12.2–24.2] | 102.9 | 1.0 | 0.0 | 0 |
| chain-link | modest | systems | 1× | 2001 | 6.1 | 18.2 | 18.2 [12.2–24.2] | 72.7 | 1.0 | 0.0 | 0 |
| chain-link | modest | flight | 1× | 211 | 66.6 | 151.3 | 133.3 [115.1–151.6] | 230.2 | 0.9 | 0.0 | 0 |
| chain-link | modest | map | 1× | 313 | 42.4 | 109.1 | 97.0 [66.8–127.1] | 157.5 | 1.0 | 0.0 | 0 |
| chain-link | modest | ship | 1× | 375 | 42.3 | 78.7 | 78.9 [60.7–97.0] | 139.4 | 1.0 | 0.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |

## console-hitch-main.cpuprofile.gz

Sampled duration: 9419.4 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 5610.0 | 5610.0 |
| (idle) | native/runtime:— | 2171.4 | 2171.4 |
| requestAnimationFrame | native/runtime:— | 61.7 | 61.7 |
| E | src/app/loop.ts:143 | 58.8 | 881.5 |
| updateProperties | node_modules/react-dom/cjs/react-dom-client.production.js:15035 | 54.4 | 91.7 |
| status | src/game/session.ts:602 | 35.7 | 46.5 |
| believedWorld | src/game/belief/standin-model.ts:1183 | 35.7 | 214.3 |
| (garbage collector) | native/runtime:— | 28.6 | 28.6 |
| (anonymous) | native/runtime:— | 27.7 | 27.7 |
| estimate | src/game/belief/standin-model.ts:860 | 27.5 | 38.6 |
| commitMutationEffectsOnFiber | node_modules/react-dom/cjs/react-dom-client.production.js:10497 | 26.9 | 138.3 |
| renderWithHooks | node_modules/react-dom/cjs/react-dom-client.production.js:4627 | 26.6 | 198.1 |
| buildWindowView | src/game/window.ts:23 | 26.6 | 50.0 |
| O | src/app/loop.ts:265 | 25.8 | 950.2 |
| setProp | node_modules/react-dom/cjs/react-dom-client.production.js:14406 | 23.7 | 32.4 |
| W | src/console/format.ts:55 | 22.9 | 22.9 |
| beginWork | node_modules/react-dom/cjs/react-dom-client.production.js:7768 | 22.1 | 344.8 |
| (anonymous) | src/content/inverse-wells/lifecycle.ts:99 | 21.6 | 40.9 |
| (anonymous) | src/game/belief/standin-model.ts:359 | 20.5 | 20.5 |
| snapshot | src/game/session.ts:625 | 19.5 | 325.6 |

## console-hitch-worker-0.cpuprofile.gz

Sampled duration: 9485.4 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 9482.4 | 9482.4 |
| (garbage collector) | native/runtime:— | 1.2 | 1.2 |
| (anonymous) | src/model/engine.ts:1079 | 0.8 | 0.8 |
| arcsFromRecord | src/model/adapt.ts:721 | 0.5 | 0.9 |
| pe | src/model/adapt.ts:349 | 0.2 | 0.2 |
| fe | src/model/adapt.ts:307 | 0.2 | 0.2 |
| allAttempts | src/model/service.ts:118 | 0.1 | 0.1 |
| (root) | native/runtime:— | 0.0 | 9485.4 |
| di.onmessage | src/model/worker.ts:17 | 0.0 | 1.8 |
| dispatch | src/model/rpc.ts:36 | 0.0 | 1.8 |
| refresh | src/model/service.ts:193 | 0.0 | 1.8 |
| build | src/model/service.ts:122 | 0.0 | 1.8 |
| buildModel | src/model/engine.ts:881 | 0.0 | 1.7 |
| attempt | src/model/engine.ts:882 | 0.0 | 1.7 |
| buildOnce | src/model/engine.ts:919 | 0.0 | 1.7 |
| tierGProblem | src/model/engine.ts:304 | 0.0 | 0.9 |

## gravity-range-worst-main.cpuprofile.gz

Sampled duration: 10262.1 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 2968.7 | 2968.7 |
| setProgram | node_modules/three/build/three.module.js:18220 | 472.9 | 1691.3 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 317.1 | 399.0 |
| (anonymous) | src/game/belief/standin-model.ts:909 | 270.3 | 270.3 |
| bindVertexArray | native/runtime:— | 192.5 | 192.5 |
| renderObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:225 | 186.3 | 253.3 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 168.5 | 168.5 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 156.6 | 2823.5 |
| update | src/view3d/fx/clouds.ts:92 | 119.7 | 193.2 |
| projectObject | node_modules/three/build/three.module.js:17696 | 118.7 | 537.4 |
| drawElements | native/runtime:— | 111.7 | 111.7 |
| update | node_modules/three/build/three.module.js:242 | 110.2 | 261.4 |
| uniformMatrix4fv | native/runtime:— | 103.9 | 103.9 |
| renderObjects | node_modules/three/build/three.module.js:17964 | 101.8 | 3140.2 |
| getBindingState | node_modules/three/build/three.module.js:1680 | 91.8 | 107.2 |
| renderObject | node_modules/three/build/three.module.js:17991 | 88.8 | 3021.9 |
| needsUpdate | node_modules/three/build/three.module.js:1759 | 83.3 | 83.3 |
| bindTexture | native/runtime:— | 81.0 | 81.0 |
| (garbage collector) | native/runtime:— | 70.1 | 70.1 |
| setValueV3f | node_modules/three/build/three.module.js:4941 | 70.1 | 142.5 |

## gravity-range-worst-worker-0.cpuprofile.gz

Sampled duration: 10411.2 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 10411.2 | 10411.2 |
| (root) | native/runtime:— | 0.0 | 10411.2 |

## inverse-startup-main.cpuprofile.gz

Sampled duration: 9840.9 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| onFirstUse | node_modules/three/build/three.module.js:6799 | 3063.0 | 3120.3 |
| (program) | native/runtime:— | 838.3 | 838.3 |
| (idle) | native/runtime:— | 445.2 | 445.2 |
| boundsTree | src/sim/fields/wells.ts:658 | 345.7 | 543.7 |
| (anonymous) | native/runtime:— | 206.7 | 313.0 |
| (anonymous) | src/sim/fields/wells.ts:674 | 191.1 | 191.1 |
| (garbage collector) | native/runtime:— | 113.8 | 113.8 |
| (anonymous) | src/view3d/room/dress.ts:199 | 95.3 | 109.8 |
| makeBuffer | src/view3d/fx/funnels.ts:138 | 93.0 | 105.2 |
| createBuffer | node_modules/three/build/three.module.js:66 | 68.6 | 78.4 |
| (anonymous) | src/view3d/room/textures.ts:17 | 57.7 | 64.2 |
| create | src/sim/fields/wells.ts:955 | 56.4 | 74.5 |
| (anonymous) | src/view3d/room/textures.ts:56 | 56.1 | 62.3 |
| intersectsBounds | src/sim/fields/wells.ts:643 | 53.4 | 53.4 |
| e | node_modules/three/build/three.core.js:11954 | 53.1 | 65.6 |
| setProgram | node_modules/three/build/three.module.js:18220 | 50.5 | 3597.3 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 50.3 | 3848.0 |
| panel | src/view3d/room/textures.ts:96 | 49.1 | 49.1 |
| WebGLShader | node_modules/three/build/three.module.js:5976 | 46.5 | 46.5 |
| (anonymous) | src/view3d/room/textures.ts:203 | 44.9 | 44.9 |

## inverse-wells-worst-main.cpuprofile.gz

Sampled duration: 19722.0 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 4420.0 | 4420.0 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 1041.3 | 1292.3 |
| setProgram | node_modules/three/build/three.module.js:18220 | 952.2 | 3682.2 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 646.1 | 6569.8 |
| bindVertexArray | native/runtime:— | 546.5 | 546.5 |
| projectObject | node_modules/three/build/three.module.js:17696 | 401.2 | 1483.3 |
| renderObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:225 | 400.3 | 588.0 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 399.6 | 399.6 |
| update | node_modules/three/build/three.module.js:242 | 342.7 | 687.5 |
| renderObject | node_modules/three/build/three.module.js:17991 | 310.3 | 7120.2 |
| drawElements | native/runtime:— | 214.7 | 214.7 |
| uniformMatrix4fv | native/runtime:— | 209.5 | 209.5 |
| renderObjects | node_modules/three/build/three.module.js:17964 | 206.0 | 7359.4 |
| setValueV3f | node_modules/three/build/three.module.js:4941 | 183.3 | 438.6 |
| setMaterial | node_modules/three/build/three.module.js:10205 | 182.0 | 415.3 |
| getBindingState | node_modules/three/build/three.module.js:1680 | 180.5 | 213.4 |
| uniform3f | native/runtime:— | 169.1 | 169.1 |
| hideObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:213 | 162.8 | 162.8 |
| (idle) | native/runtime:— | 162.3 | 162.3 |
| bindTexture | native/runtime:— | 157.2 | 157.2 |

## inverse-wells-worst-worker-0.cpuprofile.gz

Sampled duration: 19910.2 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 19905.8 | 19905.8 |
| (garbage collector) | native/runtime:— | 1.3 | 1.3 |
| (program) | native/runtime:— | 1.0 | 1.0 |
| buildOnce | src/model/engine.ts:919 | 0.7 | 1.5 |
| pe | src/model/adapt.ts:349 | 0.4 | 0.4 |
| di.onmessage | src/model/worker.ts:17 | 0.3 | 2.2 |
| modelSpec | src/model/engine.ts:147 | 0.3 | 0.3 |
| postMessage | native/runtime:— | 0.2 | 0.2 |
| fe | src/model/adapt.ts:307 | 0.2 | 0.2 |
| allAttempts | src/model/service.ts:118 | 0.1 | 0.1 |
| (root) | native/runtime:— | 0.0 | 19910.2 |
| dispatch | src/model/rpc.ts:36 | 0.0 | 1.7 |
| refresh | src/model/service.ts:193 | 0.0 | 1.7 |
| build | src/model/service.ts:122 | 0.0 | 1.7 |
| buildModel | src/model/engine.ts:881 | 0.0 | 1.5 |
| attempt | src/model/engine.ts:882 | 0.0 | 1.5 |
| tierGProblem | src/model/engine.ts:304 | 0.0 | 0.6 |
| arcsFromRecord | src/model/adapt.ts:721 | 0.0 | 0.6 |

## opening-startup-main.cpuprofile.gz

Sampled duration: 25652.1 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 5971.0 | 5971.0 |
| (idle) | native/runtime:— | 3749.9 | 3749.9 |
| onFirstUse | node_modules/three/build/three.module.js:6799 | 2214.6 | 2305.0 |
| setProgram | node_modules/three/build/three.module.js:18220 | 505.0 | 5816.5 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 391.5 | 7925.1 |
| bindVertexArrayObject | node_modules/three/build/three.module.js:1668 | 375.3 | 375.3 |
| setValueM4 | node_modules/three/build/three.module.js:5066 | 323.2 | 497.9 |
| render | node_modules/three/build/three.module.js:4079 | 272.3 | 275.1 |
| setValueV3f | node_modules/three/build/three.module.js:4941 | 268.7 | 273.2 |
| projectObject | node_modules/three/build/three.module.js:17696 | 240.1 | 896.7 |
| (garbage collector) | native/runtime:— | 227.7 | 227.7 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 226.9 | 226.9 |
| compose | node_modules/three/build/three.core.js:11024 | 214.8 | 214.8 |
| bindTexture | node_modules/three/build/three.module.js:10370 | 212.5 | 212.5 |
| makeBuffer | src/view3d/fx/funnels.ts:138 | 201.2 | 212.7 |
| (anonymous) | src/view3d/room/dress.ts:199 | 197.3 | 243.4 |
| show | src/app/opening/OpeningGate.tsx:56 | 188.8 | 191.9 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 188.3 | 581.3 |
| setValueM3 | node_modules/three/build/three.module.js:5039 | 186.2 | 235.7 |
| requestAnimationFrame | native/runtime:— | 164.3 | 164.3 |

## worst-main.cpuprofile.gz

Sampled duration: 9317.5 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 2671.4 | 2671.4 |
| setProgram | node_modules/three/build/three.module.js:18220 | 389.2 | 1468.0 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 351.8 | 441.3 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 174.1 | 2535.5 |
| bindVertexArray | native/runtime:— | 168.2 | 168.2 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 153.4 | 153.4 |
| projectObject | node_modules/three/build/three.module.js:17696 | 120.4 | 561.5 |
| update | node_modules/three/build/three.module.js:242 | 118.0 | 332.7 |
| (garbage collector) | native/runtime:— | 109.2 | 109.2 |
| renderObject | node_modules/three/build/three.module.js:17991 | 100.8 | 2735.4 |
| renderObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:225 | 99.0 | 151.6 |
| pointPrism | src/sim/geometry.ts:373 | 88.2 | 88.2 |
| uniformMatrix4fv | native/runtime:— | 86.0 | 86.0 |
| (idle) | native/runtime:— | 85.0 | 85.0 |
| bufferData | native/runtime:— | 81.9 | 81.9 |
| copyArray | node_modules/three/build/three.module.js:4860 | 77.8 | 77.8 |
| setMaterial | node_modules/three/build/three.module.js:10205 | 76.5 | 174.9 |
| renderObjects | node_modules/three/build/three.module.js:17964 | 76.4 | 2829.7 |
| getBindingState | node_modules/three/build/three.module.js:1680 | 75.5 | 83.9 |
| setValueV3f | node_modules/three/build/three.module.js:4941 | 70.6 | 134.4 |

## worst-worker-0.cpuprofile.gz

Sampled duration: 9531.9 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 9526.9 | 9526.9 |
| (garbage collector) | native/runtime:— | 2.5 | 2.5 |
| pe | src/model/adapt.ts:349 | 2.3 | 2.3 |
| fe | src/model/adapt.ts:307 | 0.2 | 0.2 |
| di.onmessage | src/model/worker.ts:17 | 0.1 | 2.6 |
| (root) | native/runtime:— | 0.0 | 9531.9 |
| dispatch | src/model/rpc.ts:36 | 0.0 | 2.5 |
| refresh | src/model/service.ts:193 | 0.0 | 2.5 |
| build | src/model/service.ts:122 | 0.0 | 2.5 |
| buildModel | src/model/engine.ts:881 | 0.0 | 2.5 |
| attempt | src/model/engine.ts:882 | 0.0 | 2.5 |
| buildOnce | src/model/engine.ts:919 | 0.0 | 2.5 |
| tierGProblem | src/model/engine.ts:304 | 0.0 | 2.5 |
| arcsFromRecord | src/model/adapt.ts:721 | 0.0 | 2.5 |
