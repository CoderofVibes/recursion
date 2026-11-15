# S3 — Borrowed Spin: encounter, model and interaction

**Recommendation `[ASSUMED]`:** build Borrowed Spin as an optional, hands-on 3D momentum-exchange route from Unseen Cathedral to Stillwater. Treat the tether as known equipment physics with unknown parameters, not a P5 rule to unlock. Forecast the player's capture/load/release choices with explicit event uncertainty and local horizons; never choose or execute them. Keep the direct Stillwater bypass.

This is a study for owner/integrator review. No source code, shared contract, decision or expedition file is changed. Physics/hardware feasibility remains S1/S2 work; full-route performance and first-player comprehension remain integration/playtest work.

## Deliverables

| File | Purpose |
|---|---|
| [encounter.md](encounter.md) | Complete encounter template, arrival and approach, capture/swing/release, useful exit, variation, tenth-run pressure and no-pause operation |
| [model-addendum.md](model-addendum.md) | Known-mechanics recommendation, observations/fits, mode-aware forecasts, horizons, persistence and estimator-spec changes |
| [interaction.md](interaction.md) | Phase-by-phase FLIGHT/CONSOLE behavior, nonverbal failure comprehension and 2D acceptance fixtures |
| [numerical-checks.md](numerical-checks.md) | Assumptions, 3D kinematics/covariance, stale-sensing and release sensitivity, observability and demonstrated limits |
| [implementation.md](implementation.md) | Modules/contracts/data, rough code scope, tests and separate owner decisions |
| [generate.py](../../../tools/studies/s3/generate.py) / [vectors.json](../../../tools/studies/s3/vectors.json) | Deterministic reference and generated JSON; no package installation |
| [handoff](../../handoffs/s3.md) | Verification, dependency snapshot and requests to the integrator |

From `.worktrees/s3`:

```text
python tools/studies/s3/generate.py
python tools/studies/s3/generate.py --check
git diff --check
```

The reference checks algebra and sensing/geometry examples, not tether conservation, structural safety or route playability. `[DEMONSTRATED: generate.py]` For its explicitly assumed 500 m / 0.02 rad/s geometry, an attachment moves 10 m/s and sweeps almost 10 m per second. The example's 3σ contact-position uncertainty reaches a 2 m radial tolerance after 16.4467 s without new fixes. A ±2 s release error in the separate 600 m / 12 m/s circular surrogate changes velocity by 0.480 m/s and produces about 288 m separation after a common 600 s comparison. **Neither speed is a net momentum gain or saved propellant.**

## S1/S2 reconciliation

Committed-branch inspection at **2026-11-14 16:21 PST**:

| Dependency | Commit inspected | Committed study outputs |
|---|---|---|
| `st/s1-tether-physics` | `baf65e00d8f0566d2d30ad0493f467bfbf5cae0a` | None under `docs/studies/s1/`, `tools/studies/s1/` or `docs/handoffs/s1.md` |
| `st/s2-tether-hardware` | `baf65e00d8f0566d2d30ad0493f467bfbf5cae0a` | None under `docs/studies/s2/`, `tools/studies/s2/` or `docs/handoffs/s2.md` |

These are snapshots of committed branches, not claims about work in progress. S3 deliberately uses placeholders; it does not wait for parallel studies or assume their approval. The handoff refreshes the snapshot before commit if either branch advances. Do not merge or copy their uncommitted work into S3.

| Replaceable dependency | S3 consumer and reconciliation rule |
|---|---|
| `S1.structureMassInertia`, `.attachmentRadius`, `.spin`, `.tensionLaw`, `.elasticTimescale` | Replace example scale and content envelope; retain finite-inertia reaction, off-axis torque and event/convergence requirements. Re-evaluate whether the visible spin change exceeds sensor uncertainty |
| `S1.captureLaw`, `.releaseLaw`, slack/wrap and line collision model | Forecast the same modes/maps independently; remove unsupported conditional paths, not just their uncertainty. Select actual abort and released-line behavior |
| `S2.mountGeometry`, `.captureEnvelope`, `.capture.geometry` / `Vcapture` | Replace pad-relative approach and device limits; verify full ship/appendage/line clearance. A contact-width calculation cannot set a safe capture speed |
| `S2.lineRatings`, `.reelLimits`, `.releaseLatency`, hardware failure/protection | Replace equipment thresholds, delay distributions, allowable payout and controls; include measured execution delay in release uncertainty |
| `S2.sensorCadenceNoise`, `.rotation.*`, burst power/storage | Replace idealized pose/metric/noise inputs with actual sensor products. If metric reconstruction is unavailable, keep capture uncertain; do not grant the structure a known size |
| S2 masses/power/heat/consumables and actual ship configurations | Recompute arrival/abort budgets and the direct-vs-tether Stillwater comparison; never patch the baseline from this study |

The normalized authoring ranges and provisional exit corridor are starting points for a deterministic sweep. A failed feasibility check requires changing the proposed content or scope, not tuning the forecast to hide the failure. A10's inertia-variation conflict is explicit: recommend fixed-mass internal configurations subject to approval; otherwise hold inertia fixed.

## Evidence and authority

Use the [creative brief](../../CREATIVE_BRIEF.md), [decisions](../../DECISIONS.md), [study rules](../../build-plan/studies/README.md), [S3 assignment](../../build-plan/studies/S3-borrowed-spin-encounter.md), [region proposal](../../handoffs/region-proposal/README.md), [estimator specification](../../model/estimator-spec.md), [2C handoff](../../handoffs/2C.md) and [3D contracts](../../../src/contracts/README.md). Older planar, paused-preparation and branch-return wording is superseded by A11–A13, not an instruction to reproduce it.

External sources support mechanisms and interface principles only; none validates the game geometry or candidate ratings:

- `[ESTABLISHED: NASA MXER capture study]` Sorensen, Canfield and Norris, *Design Rules and Analysis of a Capture Mechanism for Rendezvous between a Space Tether and Payload* (2006), [NTRS 20070001536](https://ntrs.nasa.gov/citations/20070001536). Capture/carry/release and capture-error geometry are substantive engineering problems.
- `[ESTABLISHED: NASA Tethers in Space Handbook]` [NTRS 19980018321](https://ntrs.nasa.gov/api/citations/19980018321/downloads/19980018321.pdf), cited in the model addendum for ordinary tether momentum exchange; S1 owns the detailed derivation and conservation check.
- `[ESTABLISHED: Deng et al., 2022]` *Motion Estimation of Non-Cooperative Space Objects Based on Monocular Sequence Images*, [Applied Sciences 12(24), 12625](https://www.mdpi.com/2076-3417/12/24/12625). Feature sequences support rotation estimation under observability conditions; this does not establish metric camera accuracy in Recursion.
- `[ESTABLISHED: DD01]` [NASA Crew Interfaces](https://www.nasa.gov/reference/10-0-crew-interfaces-vol-2/), already in the project bibliography. Supports timely feedback and awareness; S3's control choices remain proposed.

`[FICTIONAL]` P4's inverse-2.5 gravity and Black Box's recurrence persistence remain the project departures. Tether elasticity, mechanics and the fact that accelerometers sense line force are ordinary physics. All content ranges, code estimates, UI designs and acceptance thresholds in this package remain `[ASSUMED]` unless a named executed check is attached.
