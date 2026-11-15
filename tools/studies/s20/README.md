# S20 local performance recheck

From the S20 worktree, with the repository's existing dependencies and installed Chrome:

```powershell
node tools/studies/s20/measure.mjs --run recheck
node tools/studies/s20/measure.mjs --run recheck --phase profile --profile-case modest:model:2000 --profile-label health --no-build
node tools/studies/s20/measure.mjs --run quiet-confirmation --profiles modest --views room --no-build
node tools/studies/s20/sanitize.mjs
node tools/studies/s20/summarize.mjs recheck
node tools/studies/s20/summarize.mjs quiet-confirmation
node tools/studies/s20/compare.mjs
node tools/studies/s20/audit-evidence.mjs
```

The benchmark is S15's measurement script with only these changes: outputs go under S20; the local preview port is **4176**; S15's unchanged `cdp.mjs`, `page-probe.js` and optional patch overlay are imported from their original folder; diagnostic JSON is scrubbed before it reaches disk. The summarizer's output links and destination point at S20. No application source is instrumented or edited. See [S15's runner](../s15/README.md) for all measurement definitions and caveats.

An additional read-only diagnostic runs **after** the profile/trace has stopped: it records `report().fitFailure`, coverage eligibility/reasons and model version. This does not prove a populated two-attempt held-out/adoption path. The original S15 sampler only records `lastError`; a null value there does not prove that the estimator accepted the available data. A separately labelled `health` profile supplies this diagnostic for the delivered matrix, whose original `worst` profile predates the additive diagnostic:

```powershell
node tools/studies/s20/measure.mjs --run recheck --phase profile --profile-case modest:model:2000 --profile-label health --no-build
```

The command builds the production application, verifies an in-memory hidden-source-map build has identical output, records file hashes, runs five cold/warm load pairs per profile and two 8-second trials in nine views at 1× and 2000× in native and modest profiles: **20 loads, 72 frame trials**. It then takes a separate profile/trace of the case with the largest individual p95. The installed Chrome process uses an isolated temporary profile that the runner deletes only after checking its resolved location and unique prefix. The script closes its own preview server and browser. Do not run a second animated browser or tests/builds during timed samples.

The S20 run used `npm run build` followed by `node tools/studies/s20/measure.mjs --run recheck --no-build`; together these execute the same measurement path. The initial sandbox launch could not expose Chrome DevTools; an approved launch outside the sandbox succeeded. No package was installed; no public deployment was loaded.

The modest profile remains 4× CPU throttle, 10 Mbit/s down / 1 Mbit/s up, 40 ms network latency, 1366×768, DPR 1. CPU throttling does not throttle the GPU or reproduce a whole laptop. Cold clears the HTTP cache but may retain browser/GPU caches. The first process-cold sample remains included. Top warp is a bounded stress measurement that logs and reselects warp after automatic alert drops; it is not proof that gameplay remains at that warp continuously.

`privacy.mjs` recursively removes the current user-home and workspace path from JSON strings/keys before writing plain JSON, compressed JSON, traces, CPU profiles and source maps. It preserves numeric samples. Browser screenshots contain only the game. No raw local paths or account names should be committed. Final verification must scan both plain and decompressed outputs.

Timing values vary. Inputs, view order and calculations are deterministic; `recheck-frames.json.gz` retains every sampled interval and status, and `recheck.json` retains all trials, model errors, build identities and host settings. `recheck-summary.json`, [tables](../../../docs/studies/s20/recheck-tables.md) and [comparison](../../../docs/studies/s20/performance-comparison.md) regenerate from them.

**Host isolation was not achieved.** S20's own test/UI work was stopped before the timed samples, but a read-only process inventory bounded by clock reads at 05:18:17–05:27:29 UTC observed two unrelated Vitest trees. The inventory itself was not timestamped. They were left running. [Measurement context](measurement-context.json) preserves the observation without local paths. The matrix is a measurement of this build under the observed host conditions, not an isolated attribution of any change to 3D. A quiet-host repeat remains necessary for a release performance gate.

A later two-second CPU-delta inventory at 05:33:02.2425593 UTC established active unrelated test work (24.39 CPU seconds). At 05:37:57.2476861 UTC a further inventory found no Vitest processes. The `quiet-confirmation` follow-up ran after that observation and still missed the load and room-frame gates. It contains ten loads and four room trials, plus a separate profile; its name does not certify a controlled host. No complete second matrix or real-laptop test is claimed.
