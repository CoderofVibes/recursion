# baseline — generated measurement tables

[DEMONSTRATED: docs/handoffs/pf/baseline.json and baseline-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

| Region | Profile | Cache | Ready median / max | First interaction median / max | Console ready median / max |
| --- | --- | --- | ---: | ---: | ---: |
| gravity-range | modest | cold | 8189.7 / 8251.8 | 8963.0 / 8984.3 | 10401.5 / 10725.7 |
| gravity-range | modest | warm | 7313.0 / 7390.5 | 7861.7 / 8036.6 | 9355.0 / 9404.0 |
| inverse-wells | modest | cold | 8756.6 / 10561.8 | 9182.5 / 11104.6 | 10731.5 / 12569.7 |
| inverse-wells | modest | warm | 8701.7 / 10168.2 | 9230.4 / 10683.9 | 10428.8 / 12696.3 |
| chain-link | modest | cold | 8767.2 / 9494.9 | 9238.6 / 10162.1 | 10549.1 / 11957.0 |
| chain-link | modest | warm | 7394.7 / 7449.9 | 7929.0 / 8103.1 | 9401.8 / 9845.3 |

| Region | Profile | View | Requested warp | Frames | Median | Pooled p95 | Per-run p95 median [min–max] | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gravity-range | modest | room | 1× | 159 | 96.9 | 145.4 | 145.4 [133.3–157.5] | 218.2 | 0.9 | 0.0 | 0 |
| gravity-range | modest | mission | 1× | 627 | 18.3 | 60.5 | 57.6 [54.6–60.7] | 96.9 | 1.0 | 0.0 | 0 |
| gravity-range | modest | plan | 1× | 784 | 18.2 | 48.6 | 51.3 [48.2–54.4] | 103.3 | 1.0 | 0.0 | 0 |
| gravity-range | modest | model | 1× | 603 | 18.4 | 60.7 | 63.6 [60.5–66.7] | 127.3 | 1.0 | 0.0 | 0 |
| gravity-range | modest | blackbox | 1× | 448 | 24.5 | 84.8 | 78.9 [66.7–91.0] | 151.5 | 1.0 | 0.0 | 0 |
| gravity-range | modest | systems | 1× | 730 | 18.1 | 66.8 | 69.6 [48.3–90.9] | 127.2 | 1.0 | 0.0 | 0 |
| gravity-range | modest | flight | 1× | 184 | 66.7 | 193.8 | 169.6 [115.1–224.2] | 248.5 | 0.8 | 0.0 | 0 |
| gravity-range | modest | map | 1× | 168 | 90.8 | 157.4 | 154.4 [139.2–169.7] | 230.4 | 0.9 | 0.0 | 0 |
| gravity-range | modest | ship | 1× | 193 | 72.7 | 157.7 | 163.6 [133.3–193.9] | 333.2 | 0.8 | 0.0 | 0 |
| inverse-wells | modest | room | 1× | 251 | 42.4 | 163.5 | 124.2 [72.7–175.8] | 218.3 | 0.8 | 0.0 | 0 |
| inverse-wells | modest | mission | 1× | 1955 | 6.1 | 18.2 | 18.3 [6.4–30.1] | 96.9 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | plan | 1× | 2000 | 6.1 | 18.1 | 15.2 [12.2–18.3] | 78.8 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | model | 1× | 2199 | 6.1 | 12.3 | 15.0 [11.8–18.2] | 78.8 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | blackbox | 1× | 2105 | 6.1 | 12.3 | 12.3 [12.2–12.4] | 72.8 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | systems | 1× | 1947 | 6.1 | 18.2 | 18.2 [18.1–18.2] | 103.0 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | flight | 1× | 351 | 36.4 | 96.9 | 97.1 [60.6–133.5] | 218.3 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | map | 1× | 329 | 48.2 | 84.8 | 81.8 [66.7–97.0] | 157.6 | 1.0 | 0.0 | 0 |
| inverse-wells | modest | ship | 1× | 267 | 48.4 | 127.3 | 109.1 [72.8–145.4] | 163.6 | 0.9 | 0.0 | 0 |
| chain-link | modest | room | 1× | 294 | 48.6 | 103.0 | 99.9 [72.6–127.3] | 199.8 | 1.0 | 0.0 | 0 |
| chain-link | modest | mission | 1× | 1994 | 6.1 | 18.2 | 18.3 [18.2–18.3] | 54.6 | 1.0 | 0.0 | 0 |
| chain-link | modest | plan | 1× | 1627 | 6.1 | 24.3 | 24.4 [12.3–36.4] | 96.9 | 1.0 | 0.0 | 0 |
| chain-link | modest | model | 1× | 2076 | 6.1 | 18.1 | 18.2 [12.1–24.2] | 72.6 | 1.0 | 0.0 | 0 |
| chain-link | modest | blackbox | 1× | 1991 | 6.1 | 18.2 | 18.2 [18.1–18.2] | 72.8 | 1.0 | 0.0 | 0 |
| chain-link | modest | systems | 1× | 1723 | 6.1 | 24.3 | 24.4 [18.4–30.4] | 96.7 | 1.0 | 0.0 | 0 |
| chain-link | modest | flight | 1× | 236 | 66.4 | 109.0 | 109.0 [108.9–109.1] | 230.3 | 1.0 | 0.0 | 0 |
| chain-link | modest | map | 1× | 441 | 30.4 | 66.6 | 63.7 [60.7–66.7] | 115.2 | 1.0 | 0.0 | 0 |
| chain-link | modest | ship | 1× | 314 | 42.3 | 115.1 | 97.0 [60.6–133.4] | 145.4 | 1.0 | 0.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |

## worst-main.cpuprofile.gz

Sampled duration: 9267.8 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (program) | native/runtime:— | 1998.7 | 1998.7 |
| (anonymous) | src/game/belief/standin-model.ts:866 | 397.3 | 712.8 |
| updateMatrixWorld | node_modules/three/build/three.core.js:13071 | 319.3 | 391.7 |
| setProgram | node_modules/three/build/three.module.js:18220 | 304.4 | 1153.3 |
| (anonymous) | src/game/belief/standin-model.ts:878 | 264.3 | 264.3 |
| massProperties | src/game/belief/standin-model.ts:311 | 252.8 | 430.7 |
| (anonymous) | src/game/belief/standin-model.ts:903 | 230.0 | 230.0 |
| renderBufferDirect | node_modules/three/build/three.module.js:17023 | 155.7 | 2078.8 |
| bindVertexArray | native/runtime:— | 133.2 | 133.2 |
| projectObject | node_modules/three/build/three.module.js:17696 | 119.9 | 536.5 |
| multiplyMatrices | node_modules/three/build/three.core.js:10564 | 113.7 | 113.7 |
| update | node_modules/three/build/three.module.js:242 | 101.7 | 294.6 |
| (garbage collector) | native/runtime:— | 96.6 | 96.6 |
| equipmentStatus | src/game/belief/standin-model.ts:864 | 88.7 | 801.6 |
| getBindingState | node_modules/three/build/three.module.js:1680 | 84.5 | 96.7 |
| update | src/view3d/fx/clouds.ts:92 | 83.8 | 119.0 |
| renderObject | node_modules/three/examples/jsm/renderers/CSS2DRenderer.js:225 | 76.7 | 129.8 |
| renderObject | node_modules/three/build/three.module.js:17991 | 73.8 | 2222.6 |
| drawElements | native/runtime:— | 73.5 | 73.5 |
| bufferData | native/runtime:— | 72.9 | 72.9 |

## worst-worker-0.cpuprofile.gz

Sampled duration: 9554.8 ms. Inclusive entries overlap; do not add them.

| Function | Original location | Self ms | Inclusive ms |
| --- | --- | ---: | ---: |
| (idle) | native/runtime:— | 9554.8 | 9554.8 |
| (root) | native/runtime:— | 0.0 | 9554.8 |
