# S2 — Borrowed Spin: hardware, sensing and the ship

**Recommendation: a 255 kg dorsal retrofit with a closing rail grapple, 500 m nonconductive line, 3 kW winch, passive friction brake, independent ship-side release/cutters, and measured load/payout/line direction.** `[ASSUMED]` This is a concrete architecture for owner review, not approved hardware or an implemented encounter. The nominal working maneuver is a velocity-matched capture at 20–50 m, controlled payout at about 6 kN, and cassette release after the player has acquired useful momentum from the moving structure.

The ship has no tether today. This study proposes new physical equipment; it does not treat Black Box software as a way to create it. All changes are confined to S2 study/reference/handoff paths on `st/s2-tether-hardware`. The baseline, shared contracts and production code remain unchanged.

## Read and rerun

- [Hardware and operation](hardware.md): assembly budgets, 3D mount and geometry, four configurations, mass/torque, power/thermal/wear coupling, six player commands, six requested failure cases, and smaller/full-model tradeoffs.
- [Proposed assembly JSON](hardware-fragment.json): 1C equipment record format, plus explicitly marked new 3D/dynamic fields and thermal nodes. This is a proposal fragment, **not** a directly compatible baseline patch.
- [Sensing and integration](sensing-and-integration.md): noise and cadence, sample packet, P7/P11 boundaries, A5 calibration ageing, contracts, screens, estimated code scope and acceptance tests.
- [Precedents and source register](precedents.md): TSS-1/TSS-1R, YES2, SEDS-1/2, NASA MXER and ESA e.Deorbit; flight findings separated from unflown studies. Grapple/harpoon/net comparison.
- [Deterministic reference](../../../tools/studies/s2/reference.py) and [generated JSON vectors](../../../tools/studies/s2/reference-vectors.json): arithmetic, budgets and conservation checks, including input SHA-256 hashes.
- [Integrator handoff](../../handoffs/s2.md): concise requests and unresolved decisions.

From this worktree, with the provided Python 3.14 and numpy:

```text
python tools/studies/s2/reference.py
```

The command writes only `tools/studies/s2/reference-vectors.json`. It uses no network, downloads or optional packages. It checks assembly schema/reference integrity, mass partitions in all four configurations, 3D inertia/rotation covariance, torque, reel/brake power and heat, launch and cassette separation momentum/energy, partial/full payout release and monotonic wear. It is not S1's tether solver, a sensor implementation or an end-to-end capture test.

## What the numbers support

All physical ratings below are `[ASSUMED]`; the stated arithmetic is `[DEMONSTRATED: reference.py]`.

| Result | Why it matters |
| --- | --- |
| 255 kg added to 30,374 kg; full main-only ideal Δv falls 690.61 → 684.18 m/s | Modest inventory penalty, real cost across the run; no hidden baseline mass subtraction |
| 6 kN gives about 0.196 m/s² | Tether motion is measurable with existing accelerometers; gravity is still inferred from tracking |
| Locked 50 m elastic line at 0.5 m/s has a 12.37 kN undamped screening peak | A nominally gentle capture can exceed the 8 kN working load; payout/braking is necessary |
| 6 kN reeling at 0.3 m/s needs 2.5 kW; motor heat 700 W | Electrical allocation changes achievable movement, not just a UI bar |
| Payout at 6 kN and 0.5 m/s deposits 3 kW; 60 s raises brake/frame 3 K adiabatically | The hot brake must have a local state; 4 kW friction power cannot be rejected indefinitely |
| 2° alignment error produces about 666 N m; main depletion makes a fixed +z load produce about 2,539 N m | Real 3D attitude authority and current COM matter; old planar RCS numbers cannot certify control |
| Successful release consumes 40 kg of head/line/carrier inventory | One successful swing per supplied cassette; a miss may be recovered, a released head does not return magically |
| 9 kJ elastic energy at 6 kN / 500 m; 0.1 s longitudinal wave travel | A 1 s tick cannot honestly resolve cut/recoil peaks; full simulation needs converged event/substep treatment |

[ASSUMED] The combination is plausible enough to implement and test, but the decisive feasibility checks remain S1/S3 work: a finite-inertia target that actually supplies useful momentum, launch/payout drag, rail retention and load-path strength, out-of-plane attitude control, actual capture/release timing, and a route benefit greater than its preparation/propellant/risk cost. The 500 m length is a hardware candidate, not an encounter size decision. No route, capture probability or winning procedure is demonstrated here.

[DEMONSTRATED: reference.py] An ideal fixed-point 500 m / 6 kN swing would rotate at 0.0198 rad/s, above the current 0.01 rad/s hands-on request and star-tracker limits. Start validation at lower load or a compatible moving-target geometry; the proposed hardware rating does not certify that control sequence.

## Baseline and scientific boundaries

[ASSUMED] This branch starts at `baf65e0`. Its checked ship data are 1C's planar numerical baseline plus 2G step-1 shared 3D contracts. The reference retains that scaffold's isotropic **total yaw inertia** for the old hull while calculating kit offsets, torques and transformations in 3D. Its pitch/roll inertia is provisional. Recompute against 2G's completed physical 3D baseline before adoption; do not overwrite 2G's work from this fragment. The one-player crew decision in DECISIONS outranks stale four-crew wording in 1C's data.

[FICTIONAL: P4] Gravity remains `a = (GM/r0²)(r0/r)^2.5`, one shared `r0 = 1,000,000 m`, consistently applied to relevant moving bodies. No other fictional mechanism is needed for tether momentum exchange. `[ESTABLISHED: S2-MXER]` Rotating-tether momentum transfer is a studied mechanism; that source does not qualify this hardware. `[ASSUMED]` This particular line, head, mount, dimensions and limits are estimates.

[ASSUMED, P7/P11] Specific force includes tether/contact reactions as well as thrust. A payout counter measures material length, not target range. A passive head supplies no remote telemetry. The model gets acquired noisy measurements, local switch reports and declared engineering priors; it never receives true capture state, line shape, remaining strength or target inertia. P6 remains: forecast the player's commands, do not select a release plan. A5 wear and uncertainty carry forward; A9/P8 recurrence restores physical hardware while preserving evidence. A12 forbids pausing to manage capture.

## What building it takes

[ASSUMED] Beyond S1's numerical dynamics/contact solver, budget roughly **2,350–4,100 nonblank TypeScript lines**, plus **1,000–1,800 test lines**, spread across typed contracts, ship kit state and energy budgets, sensors, belief/model forecasts, Black Box and the 2D thread's instrument/3D views. This is a scope estimate, not a deadline. The module-by-module plan and acceptance checks are in [sensing-and-integration.md](sensing-and-integration.md#build-requests-and-approximate-scope).

[ASSUMED] Best version: a massive flexible 3D line with contact/wrapping, finite-speed latch/release, spool transfer and distributed damage, plus honest sensed geometry and player-command forecasts. Smaller version: the same real hardware/energy budget and two-body reaction with a unilateral elastic span and measured local state, authored clear of complex entanglement. It loses resolved whip, distributed abrasion and wrapping forecasts; it must detect unsupported contact and stop pretending to predict it. Removing the brake, independent release or load sensing saves hardware by removing essential engineering behavior and is not recommended.

## Questions for the owner

These are decisions for the integrator to present separately; this study does not adopt any of them.

1. **Install the kit on the starting ship?** Recommend yes, as the explicit 255 kg proposal, conditional on S1/S3 demonstrating a useful optional route. It must be present before Borrowed Spin; no hardware appears at encounter entry.
2. **Consume one cassette/head on a successful release?** Recommend yes: one supplied cassette, 40 kg departing hardware, recoverable misses only. Multiple swings in one run need an explicitly budgeted spare/reloading design.
3. **Require a compatible structural rail?** Recommend yes. Make suitability an observable geometry/load-path question; defer arbitrary-surface harpoons and multi-contact nets.
4. **Build flexible-line contact detail immediately?** Recommend implement the full physics boundary and conservation tests, first proving a clear-span scenario; add wrapping/whip before authoring geometry that depends on them. Do not promise a low-cost decorative tether with equivalent gameplay.

The integrator must additionally reconcile the accepted S1 dynamics, S2 hardware envelope and S3 target scale before committing production interfaces. Existing hardware mechanics should be a known ship capability; unknown target properties still need measurement. That modeling recommendation is discussed in the sensing document, not an automatic new rule adoption.
