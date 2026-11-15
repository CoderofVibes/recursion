# cache — generated measurement tables

[DEMONSTRATED: docs/handoffs/pf/cache.json and cache-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

| Region | Profile | Cache | Ready median / max | First interaction median / max | Console ready median / max |
| --- | --- | --- | ---: | ---: | ---: |
| gravity-range | modest | cold | 5984.4 / 5984.4 | 6377.3 / 6377.3 | 7379.0 / 7379.0 |
| gravity-range | modest | warm | 5157.1 / 5157.1 | 5543.2 / 5543.2 | 6650.9 / 6650.9 |

| Region | Profile | View | Requested warp | Frames | Median | Pooled p95 | Per-run p95 median [min–max] | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gravity-range | modest | room | 1× | 273 | 54.6 | 97.0 | 93.9 [72.7–115.0] | 157.5 | 1.0 | 0.0 | 0 |
| gravity-range | modest | systems | 1× | 1487 | 6.1 | 30.3 | 33.4 [18.3–48.5] | 115.2 | 1.0 | 0.0 | 0 |
| gravity-range | modest | flight | 1× | 307 | 48.5 | 90.9 | 94.0 [85.0–103.0] | 175.4 | 1.0 | 0.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |

## worst-main.cpuprofile.gz

Sampled duration: 9120.6 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 2099.6 | 2099.6 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 408.1 | 488.1 |
| setProgram | node_modules/three/build/three.module.js:18220 | 393.9 | 1618.9 |
| projectObject | node_modules/three/build/three.module.js:17696 | 251.9 | 743.5 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 234.1 | 2763.9 |
| (anonymous) | src/game/belief/standin-model.ts:909 | 233.3 | 233.3 |
| bindVertexArray | native/runtime:— | 221.1 | 221.1 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 182.8 | 182.8 |
| update | node_modules/three/build/three.module.js:242 | 150.4 | 387.3 |
| copyArray | node_modules/three/build/three.module.js:4860 | 123.8 | 123.8 |
| renderObject | node_modules/three/build/three.module.js:17991 | 112.4 | 3009.3 |
| uniformMatrix4fv | native/runtime:— | 109.7 | 109.7 |
| drawElements | native/runtime:— | 104.8 | 104.8 |
| bufferData | native/runtime:— | 102.4 | 102.4 |
| renderObjects | node_modules/three/build/three.module.js:17964 | 99.6 | 3120.7 |
| setMaterial | node_modules/three/build/three.module.js:10205 | 90.3 | 178.4 |
| setValueM4 | node_modules/three/build/three.module.js:5066 | 86.0 | 308.3 |
| setValueV3f | node_modules/three/build/three.module.js:4941 | 74.2 | 142.7 |
| frame | src/view3d/room/RoomView.ts:393 | 72.7 | 5946.7 |
| (garbage collector) | native/runtime:— | 70.8 | 70.8 |

## worst-worker-0.cpuprofile.gz

Sampled duration: 9254.6 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 9254.6 | 9254.6 |
| (root) | native/runtime:— | 0.0 | 9254.6 |
