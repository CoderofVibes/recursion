# S3 numerical checks: geometry, measurement age and release timing

**Recommendation [ASSUMED]:** make fresh attachment tracking and release timing visible operating problems. A kilometre-scale rotating structure can make seconds and metres consequential without adding a new fictional law. Use a capture-specific uncertainty limit as well as the distant-body gravity horizon. These calculations explain that recommendation; they do not establish a playable encounter, a safe capture speed, a hardware rating or a momentum-exchange gain.

## Reproduce

From the S3 worktree root, with the installed Python 3.14 and numpy:

```text
python tools/studies/s3/generate.py
python tools/studies/s3/generate.py --check
```

The first command writes [vectors.json](../../../tools/studies/s3/vectors.json) next to [generate.py](../../../tools/studies/s3/generate.py). The second makes no changes and checks byte-identical regeneration after all assertions. No random draws, package installation, external downloads or game imports are used. The JSON contains inputs, outputs, units, numerical tolerances and every check. Runtime elapsed time and machine-specific paths are absent.

**[DEMONSTRATED: `python tools/studies/s3/generate.py --check`]** All 26 checks pass and the generated JSON reproduces identically on Python 3.14.2 in this worktree. The checks exercise rigid-motion derivatives, frame rotation, covariance derivatives and positivity, the illustrative age horizon, release geometry, held-out feature tracking, an ambiguous observation case and independent torque-free Euler dynamics.

## Assumptions and dependency boundary

All entries in this table are **[ASSUMED]**, chosen to expose S3's measurement and interaction scales. Replace them with S1/S2's accepted values before authoring final content; none is a substitute for their load, hardware or sensor models.

| Quantity | Example | Dependency |
| --- | ---: | --- |
| Attachment distance from structure CoM | 500 m | `S1.structure.attachmentRadius` |
| Structure spin magnitude | 0.02 rad/s | `S1.structure.spin` |
| Inertial spin-axis unit vector | (1, 2, 2)/3 | S3 inclined geometry example |
| Structure CoM velocity | (1, −0.5, 0.25) m/s | S3 local frame example |
| Current pose error, one sigma | 0.05° per small-angle axis | `S2.rotation.poseSigma` |
| Spin error, one sigma | 0.00005 rad/s per axis | `S2.rotation.rateSigma` |
| Centre / landmark position error | 0.25 / 0.15 m per axis | `S2.rotation.positionSigma` |
| Effective capture-position tolerance | 2 m | `S2.capture.geometry` after whole-device geometry |
| Release timing surrogate | 600 m radius, 0.02 rad/s | S3 sensitivity example; **not** an S1 swing |
| Comparison coast duration | 600 s | S3 diagnostic example; **not** Stillwater's distance |

Initial dependency snapshot: both `st/s1-tether-physics` and `st/s2-tether-hardware` were at `baf65e0`, with no committed files in their study directories. The S3 handoff records the final reconciliation snapshot. The vector's initial snapshot stays reproducible rather than changing when another branch advances.

## Attachment motion and covariance

**[DEMONSTRATED: `attachment-speed`, `velocity-matches-position-derivative`, `rigid-rotation-equivariance`]** With inertial structure centre `c`, inertial rate `ω`, body-to-inertial attitude `R` and body-frame landmark `a`, use `p = c + R a`, `v = v_c + ω × (R a)`. The example's point moves 10 m/s relative to the structure centre and the spin period is 314.159 s. Its inertial velocity is `(3.981424, 5.462848, −7.203560) m/s`: the approach cannot be reduced to a screen-plane intercept. If the contract supplies body-frame angular velocity, rotate it to inertial before using this equation.

**[DEMONSTRATED: `covariance-jacobian-finite-difference`, `joint-covariance-is-positive-semidefinite`, `position-velocity-cross-covariance-retained`]** The example propagates a single joint covariance for endpoint position and velocity. Let `r = R a`, and let `[x]×` mean the cross-product matrix. For perturbations ordered as centre position, landmark position, inertial pose error and inertial rate error, the first-order Jacobians are:

```text
Jp = [ I    I       −[r]×           0    ]
Jv = [ 0   [ω]×   −[ω]×[r]×      −[r]× ]
P_endpoint = [Jp; Jv] P_input [Jp; Jv]ᵀ
```

The position major-axis sigma is **0.524772 m** and velocity major-axis sigma **0.0251794 m/s** for these inputs. The position–velocity cross block is nonzero. Discarding it would change later predicted clearance. The illustrative input errors are independent; the production estimator must retain fitted cross-correlations, common camera scale error, ship navigation error and camera/ship attitude uncertainty. These example sigmas assume the endpoint is already metrically reconstructed and do not demonstrate that the baseline camera can achieve them.

## How old is too old for this capture?

**[DEMONSTRATED: `capture-width-horizon-root`]** A one-direction, first-order transverse error budget is

```text
σ_perp(t)² = σ_centre² + σ_landmark² + radius²(σ_phase² + t² σ_rate²)
```

**[ASSUMED]** This example has independent phase and rate errors, a known stable axis, no unmodelled torque, no new fixes, and uses `3 σ_perp <= 2 m` as an illustrative geometry comparison. It is neither a capture probability nor a universal safety threshold. Production geometry must combine both bodies and the capture-device geometry, use full covariance, and account for correlated errors and observed spin change.

| Age of last fix | One sigma transverse error | Three sigma |
| ---: | ---: | ---: |
| 0 s | 0.525 m | 1.574 m |
| 10 s | 0.581 m | 1.744 m |
| 20 s | 0.725 m | 2.175 m |
| 60 s | 1.589 m | 4.767 m |

**[DEMONSTRATED: generated capture table]** The illustrative three-sigma width crosses 2 m after **16.4467 s**. A gravity horizon measured against a distant body's radius can remain long after this local contact prediction has become unusable. Show the loss of usable contact confidence at the contact event; a free-flight coast forecast can continue separately.

**[DEMONSTRATED: `one-second-contact-sweep-exceeds-capture-width`]** The point sweeps **9.99983 m** in a single second. Continuous/event-resolved capture tests are needed for this geometry; a test only at the ends of a 1 s game step can skip contact. S1 chooses the actual substep/event integrator.

**[DEMONSTRATED: generated transverse crossing windows]** In a local straight crossing of a 2 m radius capture region, a relative transverse speed of 0.5 m/s gives an 8 s full window; 2 m/s gives 2 s. These are geometry alone. They say nothing about whether line loading or the grapple survives. Absolute arm-tip speed is not the speed the latch feels: player motion and launch-device motion contribute to the relative velocity.

## Release sensitivity

**[ASSUMED]** For this one check only, the ship rides a constant-rate circular arc of radius 600 m and speed 12 m/s, then follows a straight coast. There is no finite structure inertia, tether stretch, gravity, recoil, attitude control or resource integration here. Thus **12 m/s is the example's instantaneous speed, not borrowed Δv or saved propulsion**. S1 supplies momentum exchange and the actual release state.

**[DEMONSTRATED: `release-velocity-chord-*`, `common-time-release-sensitivity`]** A release-time error `δt` changes the velocity direction by `ω δt` and its vector by `2 v |sin(ω δt / 2)|`. Compare every case at the same instant, nominal release plus 600 s:

| Release error | Direction change | Velocity-vector change | Position difference at common comparison time |
| ---: | ---: | ---: | ---: |
| −5 s | 5.730° | 1.1995 m/s | 722.70 m |
| −2 s | 2.292° | 0.47997 m/s | 288.46 m |
| +2 s | 2.292° | 0.47997 m/s | 287.50 m |
| +5 s | 5.730° | 1.1995 m/s | 716.70 m |

The local sensitivity is **144 m of downstream position per second of release timing** in this surrogate. That is enough to justify visible release geometry in the interaction proposal, but does not establish a Stillwater corridor or a required timing tolerance. A production release forecast must start from the measured coupled state and include subsequent gravity and any real recoil impulse supported by S1/S2.

## What rotation measurements do and do not determine

**[DEMONSTRATED: `tracked-feature-spin-fit`, `held-out-feature-prediction`, `wrong-spin-sign-fails-held-out`]** Given metric landmark reconstruction, axis/frame and feature correspondence, fit phase and constant rate from synthetic feature positions at 0, 10, 20 and 30 s. The fitted rate is 0.02 rad/s. Predict withheld observations at 40, 50 and 60 s without refitting: error is below `1e−10 m` for the noise-free correct model. Reversing the spin sign misses by 717–932 m. This is a transparent algebra/held-out-partition check, not a realistic sensor performance demonstration or a replacement for §7's statistical validation.

**[DEMONSTRATED: `symmetric-arm-spin-alias`]** If only an unlabeled symmetric two-ended arm is observed every 20 s, rates `0.02` and `0.02 + π/20 = 0.177080 rad/s` produce identical endpoint sets at every sample. A single narrow covariance around one rate would hide a real ambiguity. Keep distinct hypotheses or end the operational forecast until asymmetric features, cadence or another view resolve correspondence. More copies of the same ambiguous sample do not resolve it.

**[ASSUMED]** The inertia check uses torque-free rigid bodies with body-frame principal inertia tensors `diag(1.2, 1.6, 2.0)×10¹⁰` and `diag(6.0, 5.0, 8.0)×10¹⁰ kg m²`. Both are positive and satisfy the principal-moment triangle inequalities. Their common initial body z axis points along the example's measured inertial spin axis; body x points at the landmark. These tensors are independent illustrative cases, not candidates for the encounter's approved per-run variation.

**[DEMONSTRATED: `free-spin-does-not-identify-inertia`, `euler-principal-axis-matches-independent-rodrigues`]** Integrate each tensor through Euler's equation `I omegaDot = −omega × (I omega)` and matrix kinematics `Rdot = R [omega]×`, using RK4 at 0.1 s. Starting at body rate `(0, 0, 0.02) rad/s`, both produce the same principal-axis feature track through 60 s. The independent closed-form Rodrigues track agrees within `8×10⁻¹¹ m`. Thus the observed steady principal-axis spin does not determine the spin-axis inertia magnitude, despite actually using different inertias in the dynamical equations.

**[DEMONSTRATED: `euler-negative-control-responds-to-inertia-ratios`, `euler-torque-free-angular-momentum`, `euler-torque-free-energy`]** A negative control starts both bodies at `(0.006, 0.009, 0.02) rad/s`: the differing inertia ratios now produce a **6.25378 m** feature-position separation after 60 s. Across the four runs, relative angular-momentum error is below `4.4×10⁻¹⁴` and relative rotational-energy error below `4.5×10⁻¹⁵`. This shows the calculation responds to inertia when excited; it is not two copies of the same prescribed rotation. Tumbling can constrain ratios but still does not establish absolute inertia scale. To estimate load response, S1/S2 need independently measured applied force/torque, attachment lever arm and angular acceleration, with remaining degeneracies disclosed.

## Limits and next implementation checks

**[ASSUMED]** Keep these vectors as unit-level reference cases for 2C/2D; add noisy geometry, occlusion, sensor bias and changing-rate cases when S2 specifies measurement production. Independent TypeScript tests should match the endpoint covariance and release geometry within the JSON tolerances, preserve the frozen issued forecast, and retain both hypotheses in the symmetric case. The game-side capture test should verify the swept contact missed by endpoint-only sampling.

No simulated full-ship clearance, successful tether capture, structural margin, useful transfer, energy ledger, sustained sensing budget, thermal margin, hardware lifetime or route playability is demonstrated here. Submillimetre numerical residuals in the noise-free checks are numerical verification precision; they are far too small to be a useful gameplay signal. The metres, seconds and tenths of a metre per second in the illustrative geometry are the signals worth testing with players.
