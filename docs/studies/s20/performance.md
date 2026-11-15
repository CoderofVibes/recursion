# S15 after the 3D merge

**Recommendation: keep S15's CPU/layout priorities and do not clear the release performance gate yet.** The recheck uses the same local production methodology and retains every sample. An independent host workload prevents attributing timing changes solely to 3D. A quiet-host repeat and the owner's real modest-laptop check remain necessary.

[ESTABLISHED: DECISIONS A18(7), `393b5a8`] The owner approved S15's release check: modest-profile cold load within 2.5 s, ordinary 1× p95 within 33 ms in every view, investigate frames over 100 ms, and check a real modest laptop. This direction postdates the frozen code baseline; the source/data trees are identical between `19a9ada` and `393b5a8`. These are approved thresholds, not new S20 proposals.

## Evidence and limits

[DEMONSTRATED: `tools/studies/s20/recheck.json`] The measured source is `19a9adafdf9c9e430fd2505ce087ace60065f554`, source tree `e933bee0bbdd6af423144cad6088aa2205178222`, data tree `c5a09fa693bf2132c89251682a05c9f567a49a8f`, clean application/build inputs, branch `st/s20-3d-recheck`. `npm run build` passed with Vite's existing chunk-size warning. No source, package, configuration or public deployment was changed.

[DEMONSTRATED: recorded metadata] Chrome 157.0.8103.51 and Node 24.22.1 match S15. Rendering uses Intel UHD Graphics through ANGLE D3D11 on the same i7-14700HX host. The canvas is 1366×768 at DPR 1. Native and modest settings match S15: the latter is 4× CPU slowdown, 10 Mbit/s down / 1 Mbit/s up, 40 ms latency. The GPU is not throttled; this is not the requested real modest-laptop test.

[DEMONSTRATED: `tools/studies/s20/measurement-context.json`] S20 paused its own UI sampling and tests before measurement. A read-only host inventory found two unrelated Vitest trees; they were not stopped. The inventory was bounded by clock reads at 05:18:17–05:27:29 UTC but was not separately timestamped. A second inventory at **05:33:02.2425593 UTC** recorded **24.39 CPU seconds across 19 Vitest-related processes in two wall seconds**, approximately 12 busy logical cores. This establishes active contention during that interval. Complete workload history, host thermals and power state were not controlled. **Host isolation is not established.** Preserve this matrix as an observed build/workload result; do not call the before/after difference an isolated 3D regression, an optimization effect, or a release certificate.

The [runner instructions](../../../tools/studies/s20/README.md) document exact commands, privacy scrubbing and unchanged S15 fixture semantics. [All generated tables](recheck-tables.md), [comparison tables](performance-comparison.md), [raw results](../../../tools/studies/s20/recheck.json), [frame/status vectors](../../../tools/studies/s20/recheck-frames.json.gz) and [derived statistics](../../../tools/studies/s20/recheck-summary.json) preserve the complete matrix and individual trials. Profiles and traces are separate instrumented repeats, excluded from ordinary frame quantiles.

## Results against S15 and A18

[DEMONSTRATED: `recheck-summary.json`, `baseline-summary.json`] All 72 frame trials were valid: intended view/page, one operating attempt, visible and unpaused. There were zero browser exceptions, zero sampled model errors and zero warp reselections during timed windows. Largest average sampler cost was 0.206 ms per frame. This excludes neither unobserved setup errors nor healthy-looking model refusal; see the health diagnostic below.

| Metric | S15 | S20 full matrix | Interpretation |
| --- | ---: | ---: | --- |
| Modest cold interaction median / largest | 2.104 / 2.372 s | **4.639 / 5.147 s** | A18 load gate not cleared |
| Modest warm interaction median / largest | 1.822 / 1.944 s | 3.334 / 4.522 s | Cache saves transfer but does not remove startup work |
| Modest cold console-ready median | 3.011 s | 5.963 s | Includes deliberate camera travel |
| Modest ordinary 1× pooled p95, range across views | 18.1–30.2 ms | **54.6–333.3 ms** | All nine views miss 33 ms in this run |
| Modest SYSTEMS 1× p95 / maximum | 30.2 / 333.4 ms | **333.3 / 460.5 ms** | S15's ordinary-speed hitch remains important; achieved time was only 0.7 ship s/wall s, with no saturation flag |
| Modest 2000× achieved speed, range across views | 269.8–491.6 ship s/wall s | **60.0–178.8 ship s/wall s** | 3.0–8.9% of requested speed; 100% of sampled frames saturated |
| Modest SYSTEMS 2000× p95 / maximum | 78.8 / 242.4 ms | 424.3 / 533.3 ms | Largest new matrix tail |

[DEMONSTRATED: full matrix] Native 1× p95 was 18.2–30.3 ms across views. Native 2000× achieved 845.1–1,297.7 ship s/wall s across views, with 68.9–99.6% saturation. Full per-view values and trial variation are retained in the comparison, including modest SYSTEMS 2000× trial speeds of 87.3 and 33.0 ship s/wall s. Neither the hardware proxy nor these host-confounded differences supports a universal laptop claim.

[DEMONSTRATED: `quiet-confirmation.json` and `measurement-context.json`] After a timestamped inventory at 05:37:57.2476861 UTC found **no Vitest-related processes**, a focused repeat measured five modest cold/warm pairs and two room trials per warp. Its name is `quiet-confirmation`; it does **not** establish complete host isolation. Cold interaction median/largest remained **3.733 / 6.406 s**; warm median was **3.531 s**. Room 1× pooled p95/maximum was **85.2 / 181.8 ms**, while room 2000× achieved **87.6 ship s/wall s** with 100% saturation. The gate miss therefore persists in this bounded follow-up. Do not replace the full matrix with these four trials or claim other views were repeated under the later conditions. [Focused tables](quiet-confirmation-tables.md) retain all values.

[DEMONSTRATED: build inventory and Resource Timing] All output totals **1,513,143 raw / 444,444 gzip bytes**, versus S15's 1,398,671 / 403,824. S20 includes 19,417 raw / 5,482 gzip bytes of release notices that S15 did not inventory; the remaining runtime assets total 1,493,726 / 438,962. Main JavaScript is 1,354,358 raw / 394,336 gzip bytes; worker JavaScript is 108,184 / 38,990. The local cold navigation/resource transfer is **441,817 bytes** versus S15's 406,672; revalidated warm transfer remains **1,500 bytes**. Gzip is already working. Notices are not fetched by the initial page. All file hashes remain in the JSON.

## Profile evidence and model health

[DEMONSTRATED: separate `recheck-profiles/worst-*` repeat] The worst selected cell was modest SYSTEMS/2000×. Its instrumented repeat had 145.4 / 430.2 / 448.3 ms median/p95/maximum, 40.3 ship s/wall s and 100% saturation. In 10,464.3 ms of main-thread CPU samples, truth-step work accounted for 2,565.3 ms inclusive, `RoomView.frame` 1,906.1 ms, ship systems 1,603.7 ms and power 828.1 ms. These overlap; do not add them. `resize` took 454.7 ms self, and console whole-number formatting 284.9 ms self. The trace had **21 layout events totaling 2,092.7 ms, maximum 235.1 ms**. This supports investigating S15's layout/formatting and hidden-scene work, even though the measured load is not isolated. It does not prove a future fix's gain.

[DEMONSTRATED: same profile/inventory] The worker was **98.8% idle** in this bounded fresh coast. The main profile attributes 4,341.3 ms to `(program)`; this is not GPU time. Each console diagnostic still made **95 whole-composer draw calls** and drew **38,118 triangles**, versus S15's 95 calls / 12,678 triangles. These samples run outside timed windows. No GPU timer query or VRAM measurement was taken; texture quality cuts are not justified by these counts alone.

[DEMONSTRATED: `recheck.json`, profile `health`, post-profile read] The fresh MODEL/2000× diagnostic returned `fitFailure: null`, `modelError: null`, one eligible attempt (`used: true`), 32 coast fixes and no listed missing requirements. **Model version was still 0.** This demonstrates a readable eligible fresh record and no reported refusal at that instant; it does not demonstrate a newly learned model or held-out adoption. `report()` was read after the timed sample and profilers stopped, with no forced fit or truth injection. S20's claim ledger separately records the learning-loop proof and its limits.

## What this fixture covers

[ESTABLISHED: unchanged S15 probe and runner] Every cell starts with fresh storage, the shipped arrival seed, enters the encounter, coasts, selects a view and warms for 1.2 seconds. It records two 8-second trials in room, MISSION, PLAN, MODEL, BLACK BOX, SYSTEMS, FLIGHT, MAP and SHIP at 1× and 2000× for each profile. Five cold/warm load pairs per profile give 20 loads and 72 frame trials. “Cold” clears HTTP cache, not all process/GPU caches. “Interaction” is trusted key `3` to a paint opportunity after console-mode acknowledgement, measured from navigation start; console-ready additionally includes camera travel. It is not Lighthouse TTI or INP.

[ESTABLISHED: `src/game/session.ts`, `src/app/loop.ts`] The 10 ms simulation frame budget still checks every eight fixed ticks and drops remaining debt; incoming wall delta still clamps at 100 ms. The probe reselects requested top warp after an automatic drop and retains each drop. Ordinary 1× can lose clock progress through the wall-delta clamp without reporting simulation saturation. Requested 2000× remains a request, not delivered throughput.

The fixture has no two-completed-attempt overlay, committed maneuver/uncertainty tube, local-map selection, isolated ship system or large archive. These populated states and hands-on yaw/pitch/roll-hold cost need separate measurement. The inherited probe reports `modelError`, which does **not** expose 3D's `report().fitFailure` or excluded coverage. A separate post-profile health read addresses a bounded fresh coast only; it cannot certify the full held-out/adoption path.

[ESTABLISHED: `src/content/gravity-range/world.ts` at `cdbaa75` and `19a9ada`] The authored workload changed too: S15 constructs 14 Alpha disc rocks, 2 dipping rocks and 4 Beta rocks; S20 constructs the same 16 Alpha candidates plus 320 Beta belt rocks. These are **20 versus 336 candidates before the arrival-clear filter**, not a count of currently visible contacts. Both filter candidates within 60 km plus rock radius of arrival. Consequently, even a quiet-host repeat of the same fresh/coasting procedure compares the shipped release experience with changed content and model/ship behavior; it does not isolate pure 3D arithmetic overhead.

## Post-merge checklist disposition

[ASSUMED] “Partial” below means the named release owner still has a specific verification task. The matrix alone does not satisfy every S15 acceptance request.

| S15 item | S20 coverage | Remaining owner/action |
| --- | --- | --- |
| 1. New baseline before optimizing | Full original matrix, hashes and source identities retained; host isolation failed | Integrator: quiet-host repeat before interpreting timing deltas or clearing A18 |
| 2. Known model fault and real adoption | Errors/drops retained in matrix; separate read-only model health diagnostic; S20 claim ledger reports targeted validation separately | 2C: prove healthy bounded two-attempt fit/test/adopt and unusable-attempt explanations; do not use a refusing fit as a speed gain |
| 3. Real 3D simulation work | Production 3D world, original physical step/seed, saturation, actual progress and separate CPU profile | 2G: profile hands-on attitude/translation, inclined encounters and long bounded model work; use a quiet host |
| 4. Unchanged physics after optimization | No optimization applied by S20; proof scope is recorded in the refreshed claim ledger | Integrator/2G: full deterministic/physics/ship/model checks for each optimization, including changing geometry and depleted/damaged states |
| 5. Every populated screen | All nine views covered in fresh/coasting state | 2D: forecasts/tubes, comparison/debrief, local MAP, isolated SHIP, growing archive and input latency during worker jobs |
| 6. 3D graphics and correctness | Whole-composer draw/inventory samples after each timing window; production 3D renderer | 2D: orbit/zoom/picking, out-of-plane contacts, sensor cones, clipping, deployment, repeated disposal; CPU traces are not GPU timer queries |
| 7. Real laptop and density | Original DPR 1 proxy only | 2D/integrator: real modest laptop, 1920×1080/DPR 2, power-saving/resize/first shader visits; no quality reduction justified by this proxy alone |
| 8. Time and alerts | Status, pauses, hidden frames and automatic warp drops logged | 2D/2F: ordinary UI hide/show, caution-to-1×, hands-on, Recall/loss acceptance without the stress harness reselecting warp; see S20 walkthrough |
| 9. Delivery | Production output hashes, local resource sizes/compression, hidden-map byte identity and worker loading | Integrator: frozen deployment/subpath verification; source-level deferred-loading experiment only if it improves measured startup and first-open latency |

## Recommended work

[ASSUMED] The best next pass combines a quiet-host repetition, a real modest laptop, then the populated cases above. The smaller pass is the quiet-host modest matrix plus SYSTEMS/BLACK BOX profile; it leaves high-DPR graphics and long-archive costs unknown.

1. **2D:** investigate ordinary-speed SYSTEMS and BLACK BOX tails, repeated layout/formatting, and continuing room rendering behind the console. Candidate modules remain `src/view3d/room/RoomView.ts`, `src/app/loop.ts`, `src/console/console.css` and `src/console/format.ts`; approximately 30–250 lines depending on the demonstrated cause. Preserve game/recording time, resize, transitions, alerts and legible charts. Verify lower quiet-host p95 and layout cost at equal ship progress; never infer a gain from reducing the work recorded.
2. **2G:** profile ship/power/thermal, geometry/mass and sensing/collision work at actual 3D top warp before extending caches. Approximately 100–300 lines across ship internals and `src/game/truth-step.ts`, with deterministic command-tape and ledger/geometry transition checks. Existing 2G memoization means S15's earlier opportunity size cannot simply be carried forward.
3. **Integrator/2D:** retain actual load/initial-request measurement when considering deferred SHIP/MAP construction or model fallback imports. Roughly 40–250 lines depending on the boundary. There is no proposed contract/data/physics change. Verify first-open latency, worker initialization and subpath hosting as well as bundle bytes.

Owner decision through the integrator: **no new performance budget is needed; apply A18's approved gate.** Recommend withholding performance sign-off until the quiet-host modest matrix and real-laptop check pass. The integrator owns acceptance; S20 does not edit decisions.
