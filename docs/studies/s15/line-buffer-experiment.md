# S15 — fat-line allocation experiment

**Recommendation: do not merge this patch for performance on the present evidence.** It is a concrete, reviewable 2D experiment, delivered only as [reuse-line-buffers.patch](reuse-line-buffers.patch). The final baseline is unmodified.

[ESTABLISHED: measured `src/view3d/gfx.ts`] `setFat` and `setFatSegs` dispose and reconstruct a geometry every update. The patch reuses the existing Float32 position buffer when its segment count matches, marks it for upload, and recomputes picking bounds and dash distances. A changed count retains the original rebuilding path. It still recomputes distance attributes; this is not a claim that all line allocation is removed. The patch adds 30 lines, with no shared contract, theme, model, simulation, data or build-config change.

[DEMONSTRATED: patch-verification.json] `git apply --check` passed without applying it. A full app/test TypeScript program typechecked with the patch supplied in memory. **240 deterministic comparisons** covered polyline/segment geometry through 3D motion, growth, shrinkage and empty input. Positions, dash distances, bounding box/sphere and instance counts matched the original exactly; **210 cases** reused geometry and position-buffer identity. These checks support correctness of the helper behavior; they do not establish GPU benefit, picking interaction or a complete visual/disposal regression pass.

[DEMONSTRATED: focused browser experiments] Both variants used the production build, installed Chrome, the modest profile and two 8-second trials per cell. The proposed source was supplied to Vite through an in-memory overlay, emitted to the study's ignored scratch folder and served by Vite preview. `src/`, root config and baseline `dist/` stayed unchanged. The comparison ran the candidate and then a matching fresh-browser control sequentially; it was not randomized, and warm-up, GC, model scheduling and host variation remain possible confounders. Each version starts from the same fresh/coasting fixture and uses actual ship-time progress.

| View / warp | Control median / p95 / worst ms | Patch median / p95 / worst ms | Control → patch ship s/wall s |
| --- | ---: | ---: | ---: |
| Room 1× | 12.2 / 18.3 / 30.5 | 12.3 / 24.2 / 30.3 | 1.0 → 1.0 |
| FLIGHT 1× | 18.1 / 30.2 / 48.5 | 12.4 / 24.2 / 36.3 | 1.0 → 1.0 |
| Room 2000× | 30.3 / 48.3 / 66.5 | 36.2 / 54.5 / 78.9 | 295.8 → 242.2 |
| FLIGHT 2000× | 30.3 / 42.5 / 72.7 | 30.3 / 48.4 / 66.7 | 273.8 → 272.3 |

[DEMONSTRATED: line-buffers.json] The candidate's first room/top-warp sample also logged one automatic drop due to `luDecompose: singular matrix` at ship t=185, which the stress harness reselected to 2000×. That confounds a clean causal interpretation of the room regression. The control and other timed candidate cells had no logged in-sample drop; all ended with the model-error getter clear. Top-warp saturation remained 100% in these focused runs. There were no uncaught browser exceptions or invalid view/hidden/paused intervals.

These results show neither a consistent speedup nor a defensible estimate that the patch caused all of the regressions. A faster 1× FLIGHT cell is insufficient to justify adoption when top-warp p95 does not improve. The candidate also adds **516 raw / 147 level-9 gzip bytes** to total output. Keep it below ship stepping, scene submission and layout in the priority queue.

Owner: **2D**. Before adoption, rebase the patch onto the merged 3D helper, run the equivalence/type checks, and compare interleaved baseline/candidate trials with the model fault resolved. Include forecast/trail growth, changing clipping counts, camera picking, dashes, recurrence, repeated view changes and geometry disposal. Require repeatable p95/CPU/allocation improvement without a loss in achieved ship time. Until then, the safe shipped choice is the existing helper.

Evidence: [control tables](line-control-tables.md), [candidate tables](line-buffers-tables.md), [control vectors](../../../tools/studies/s15/line-control-frames.json.gz), [candidate vectors](../../../tools/studies/s15/line-buffers-frames.json.gz), [verification result](../../../tools/studies/s15/patch-verification.json). Exact generation, verification and overlay-run commands are in the [runner README](../../../tools/studies/s15/README.md).
