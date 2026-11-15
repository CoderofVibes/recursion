# covered-room — generated measurement tables

[DEMONSTRATED: docs/handoffs/pf/covered-room.json and covered-room-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

No load trials in this focused run.

| Region | Profile | View | Requested warp | Frames | Median | Pooled p95 | Per-run p95 median [min–max] | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gravity-range | modest | map | 1× | 337 | 42.3 | 90.8 | 91.0 [79.0–103.0] | 170.0 | 0.9 | 0.0 | 0 |
| gravity-range | modest | ship | 1× | 261 | 54.5 | 121.2 | 115.3 [91.2–139.4] | 224.1 | 0.9 | 0.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |

## map-main.cpuprofile.gz

Sampled duration: 9733.0 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 3336.5 | 3336.5 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 564.8 | 724.2 |
| (anonymous) | src/game/belief/standin-model.ts:909 | 452.6 | 452.6 |
| setProgram | node_modules/three/build/three.module.js:18220 | 231.5 | 689.4 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 173.2 | 173.2 |
| hideObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:213 | 160.1 | 160.1 |
| (garbage collector) | native/runtime:— | 133.5 | 133.5 |
| update | src/view3d/fx/clouds.ts:92 | 120.8 | 185.3 |
| renderObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:225 | 93.7 | 257.2 |
| projectObject | node_modules/three/build/three.module.js:17696 | 85.4 | 249.8 |
| bindVertexArray | native/runtime:— | 80.1 | 80.1 |
| E | src/app/loop.ts:143 | 78.0 | 5696.2 |
| believedAsteroids | src/game/belief/standin-model.ts:908 | 75.5 | 526.6 |
| frame | src/view3d/room/RoomView.ts:394 | 70.9 | 4303.4 |
| uniform1fv | native/runtime:— | 69.0 | 69.0 |
| (idle) | native/runtime:— | 68.3 | 68.3 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 67.9 | 1190.8 |
| setMaterial | node_modules/three/build/three.module.js:10205 | 61.0 | 133.4 |
| bindFramebuffer | native/runtime:— | 59.6 | 59.6 |
| renderObject | node_modules/three/build/three.module.js:17991 | 59.3 | 1309.1 |

## map-worker-0.cpuprofile.gz

Sampled duration: 9912.2 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 9912.2 | 9912.2 |
| (root) | native/runtime:— | 0.0 | 9912.2 |

## ship-main.cpuprofile.gz

Sampled duration: 10013.5 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 3177.5 | 3177.5 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 424.7 | 525.2 |
| (anonymous) | src/game/belief/standin-model.ts:909 | 401.9 | 401.9 |
| setProgram | node_modules/three/build/three.module.js:18220 | 315.3 | 896.8 |
| renderObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:225 | 199.4 | 361.5 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 145.8 | 145.8 |
| hideObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:213 | 140.8 | 140.8 |
| bindVertexArray | native/runtime:— | 131.0 | 131.0 |
| update | src/view3d/fx/clouds.ts:92 | 130.0 | 202.8 |
| bufferData | native/runtime:— | 77.2 | 77.2 |
| (garbage collector) | native/runtime:— | 75.8 | 75.8 |
| projectObject | node_modules/three/build/three.module.js:17696 | 74.5 | 375.8 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 71.6 | 1665.6 |
| drawArrays | native/runtime:— | 69.8 | 69.8 |
| getBindingState | node_modules/three/build/three.module.js:1680 | 65.9 | 76.5 |
| estimate | src/game/belief/standin-model.ts:860 | 65.7 | 73.4 |
| frame | src/view3d/room/RoomView.ts:394 | 65.5 | 4939.8 |
| update | node_modules/three/build/three.module.js:242 | 63.5 | 184.9 |
| uniform1fv | native/runtime:— | 63.2 | 63.2 |
| believedWorld | src/game/belief/standin-model.ts:1183 | 61.0 | 783.0 |

## ship-worker-0.cpuprofile.gz

Sampled duration: 10163.7 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 10163.7 | 10163.7 |
| (root) | native/runtime:— | 0.0 | 10163.7 |
