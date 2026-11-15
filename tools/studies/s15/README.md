# S15 runner

Run from this worktree, with the repository's **existing** dependencies and installed Chrome:

```powershell
node tools/studies/s15/measure.mjs --run baseline
node tools/studies/s15/summarize.mjs baseline
```

The first command runs the exact `npm run build` package script, inventories every emitted file, starts Vite preview on **127.0.0.1:4175**, launches installed Chrome with a unique temporary profile, measures loads and frames, profiles the slowest measured case, and closes its own browser and server. Nothing is installed. It does not open the public site or use your existing Chrome profile. Set `S15_CHROME` only if the installed executable is elsewhere. The sandbox on the study machine required approval to launch Chrome; the successful runner uses the same isolated profile and loopback server outside that sandbox.

The script uses Node built-ins plus the already installed project packages `vite` and `@jridgewell/trace-mapping`. Patch verification additionally uses the installed `typescript`. Node 24.22.1 and Chrome 157.0.8103.51 were used for the recorded run. Native WebSocket support is required.

The fixed scenario order and inputs make the procedure reproducible; timing values depend on the machine and current load. Run benchmark processes sequentially, without concurrent builds or tests. The full default run includes 20 loads, 72 frame trials, and a separately instrumented profile. It takes several minutes. A fresh profile, HTTP-cache clearing, and isolated browser contexts protect existing records; each frame trial starts with no retained attempts. These results describe the current arrival/coasting fixture, not a complete expedition or the S9 two-dive experiment.

## Settings and meaning

PF update: room/game trials inject `recursion:opening-seen=1` with
`Page.addScriptToEvaluateOnNewDocument`, before application scripts. Add `--opening`
to also measure fresh-opening cold/warm loads (storage is cleared between them),
the first draw to the opening canvas plus its next paint opportunity, and the
19.5-second sequence's handoff to the room. These are separate from room readiness;
the authored sequence duration is never counted as a cold-load failure.

Use `--regions gravity-range,inverse-wells,chain-link` for the three-region matrix;
the default remains `gravity-range`. `--output docs/handoffs/pf` keeps PF evidence
and profiles together. The matching summary command is
`node tools/studies/s15/summarize.mjs RUN docs/handoffs/pf`.
`--profile-case REGION:PROFILE:VIEW:WARP` selects a region explicitly (the older
three-part form still works). Each trial records a one-second host CPU occupancy
sample before navigation. Aggregate occupancy >=20% flags possible contention;
even low occupancy is not evidence of a quiet GPU or scheduler. Other threads
are uncontrolled, so compare repeats and report their spread. The release gate
is **33 ms**, not a rounded 30 Hz interval. JSON and compressed diagnostics are
scrubbed of local account/workspace paths before being written.

Use `--phase profile --profile-startup opening --profile-label opening-startup`
for a separate instrumented cold load through the opening handoff, or
`--profile-startup room` for direct room setup. These profiles include startup,
shader setup and scene replacement; their instrumented timings are not substituted
for uninstrumented load or frame trials. CPU profiles do not measure GPU execution.

- Native: CPU 1×, no network throttle.
- Modest proxy: `Emulation.setCPUThrottlingRate` rate 4; `Network.emulateNetworkConditions` 40 ms latency, 1,250,000 bytes/s down, 125,000 bytes/s up, no packet loss. The broadband values are an assumed test profile, not a claim about all judges' connections. GPU speed is unchanged.
- Both: 1366×768 CSS pixels, DPR 1, installed headless Chrome with GPU enabled. Actual renderer, GPU details, OS, CPU, RAM, Chrome flags and versions are recorded in JSON. No software-renderer or physical-laptop claim is inferred from CPU throttling.
- Cold means HTTP cache cleared before navigation in a new isolated context. Warm means a second navigation in the same context with the HTTP cache retained and saved game data cleared. Chrome's process and GPU shader caches can stay warm across trials. The first process-cold observation is retained among the five trials. Do not silently equate a cold HTTP cache with a new OS/browser process.
- First-interaction opportunity: after the production room/game attaches and an animation frame runs, CDP sends a trusted `3` key. A mutation observer timestamps CONSOLE mode acknowledgement; two rAF callbacks provide a conservative paint opportunity. `interaction.paint` is navigation-start to that opportunity, `ready` is the lower bound before input, and `consoleReady` includes the intentional camera travel. This is a task-specific interaction metric, **not Lighthouse TTI, INP, or a physical display scanout measurement**. Node transport/polling can add delay, never make input acknowledgement earlier.
- Frame time: consecutive foreground rAF timestamps. The runner waits 1.2 wall seconds after view selection and samples for 8 seconds, twice per cell, with profiles reversed on the second repeat. Raw interval vectors are retained. Nearest-rank median/p95 and maximum are reported; pooling is by samples. The host's refresh interval is not forced to 60 Hz.
- Simulation: existing production `game.status()` is read through React's attached fibre. No developer build or `window.__recursion` handle is used. Keys and clicks enter the encounter and select views. The status reader and renderer inventory are internal diagnostic access, so this is not a black-box user test.
- **Top warp is a bounded stress test.** A warning can automatically reduce warp under A12. During the sample, the harness reselects the requested 2000× through the existing `setWarp` control after a drop, recording every drop and model error. Alerts, step size, frame budget, visibility, forecasts and saturation logic are unchanged. `warpsObserved` is the status after that frame (and may include the automatic 1×); achieved ship-time rate uses the actual clock. This does not establish uninterrupted 2000× gameplay. The warm-up can also have dropped warp; start/end ship times are retained.
- Saturation uses the game's real flag. There is no synthetic CPU stall or fabricated saturation. Rows for saturated intervals include their own quantiles and achieved rate. No saturated intervals at 1× is reported as such, rather than inventing a saturated 1× scenario.
- Allocation/draw inventory runs **after** the timed sample. One diagnostic frame disables `renderer.info.autoReset` to count the complete composer, then restores it. Timed frames do not have draw-call instrumentation. Scene geometry includes invisible objects; texture dimensions are not a VRAM measurement.
- Main and dedicated-worker CPU profiles and a DevTools trace are taken in a separate repeat of the highest individual p95 cell. Sampling and tracing add overhead. CPU self samples identify work; inclusive entries overlap and must not be summed. Trace event durations can also overlap across threads. They are not GPU timer queries.

## Outputs

`baseline.json` has build hashes, size inventory, source identities, machine/profile settings, load timing/resource entries, per-trial frame summaries, warnings, and source-mapped CPU samples. `baseline-frames.json.gz` retains every interval and status. `baseline-summary.json` and `docs/studies/s15/baseline-tables.md` are derived by `summarize.mjs`.

`baseline-profiles/` holds the raw main/worker `.cpuprofile.gz`, `worst-trace.json.gz`, a screenshot, and hidden source maps. A second Vite build generates maps **in memory**; the runner verifies byte-for-byte equality of mapped main chunks to the measured files. Maps are not served or counted as production output. The worker's emitted filename ties its map to the corresponding bundle. Source maps retain the source as measured, allowing future readers to inspect the pre-merge profile.

To open a compressed profile in DevTools, decompress a copy locally; for example:

```powershell
node --input-type=module -e 'import fs from "node:fs"; import {gunzipSync} from "node:zlib"; fs.writeFileSync("tools/studies/s15/.scratch/worst-main.cpuprofile", gunzipSync(fs.readFileSync("tools/studies/s15/baseline-profiles/worst-main.cpuprofile.gz")));'
```

Create `.scratch/` first if absent. Import the `.cpuprofile` into Chrome's JavaScript Profiler, or import the decompressed `worst-trace.json` into the Performance panel. The generated tables resolve minified names without requiring a browser source-map server.

## Focused runs and patch evaluation

```powershell
node tools/studies/s15/measure.mjs --run quick --views room,flight --profiles modest --repeats 1 --seconds 3 --load-repeats 1
node tools/studies/s15/measure.mjs --run baseline --phase profile --no-build
node tools/studies/s15/measure.mjs --run baseline --phase profile --profile-case modest:systems:1 --profile-label hitch --no-build
node tools/studies/s15/make-line-patch.mjs
node tools/studies/s15/verify-patch.mjs
node tools/studies/s15/measure.mjs --run line-buffers --phase frames --patch docs/studies/s15/reuse-line-buffers.patch --views room,flight --profiles modest
node tools/studies/s15/summarize.mjs line-buffers
```

`--phase` accepts `all`, `load`, `frames`, or `profile`. `--views`, `--profiles`, `--warps`, `--seconds`, `--repeats`, and `--load-repeats` narrow the matrix. `--run` chooses a separate evidence set; a phase run replaces that phase's previous observations. `--no-build` requires the correct existing production output. No patch is applied to `src/`: the optional patch is parsed strictly and supplied to Vite/TypeScript in memory; its generated build goes under the ignored `.scratch/` directory. Baseline `dist/` is preserved during a patch experiment. Do not compare runs from different source/input hashes as though they isolate the patch.

`--profile-case PROFILE:VIEW:WARP` selects an existing matrix case explicitly, and `--profile-label NAME` keeps its profile beside the default `worst-*` files. The delivered `hitch-*` files cover SYSTEMS/1×, the cell with the largest single baseline frame; the default `worst-*` files cover the highest individual p95. Both are instrumented repeats and are excluded from the 72-trial timing table. Focused line-buffer/control runs retain their vectors and summaries; their redundant generated source maps are not committed because no CPU profile was collected in those runs.

`verify-patch.mjs` checks the complete app/test TypeScript program using the source overlay, then compares original and proposed line positions, dash distances, instance counts and picking bounds through deterministic 3D motion and changing/empty point counts. It also proves buffer reuse where sizes match. It does not replace the owning lane's flight interaction, picking, disposal and visual regression checks after merging 3D.
