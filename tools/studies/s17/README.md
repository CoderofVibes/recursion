# S17 reference

From the repository/worktree root:

```sh
python tools/studies/s17/generate.py
```

Python 3.14 and numpy only; no installation, network, game imports or environment
paths in output. The script resolves the baseline and output relative to itself,
so the same command with an absolute script path works from another directory.
It writes `vectors.json` beside the script, checks 34 numerical/semantic claims
and prints a small summary. Repeating it on the same inputs produces identical
JSON bytes. The input baseline SHA-256 is recorded; a changed baseline must be
reviewed, not silently accepted as the old fixture.

All geometry/time is SI. Exposure is fictional U s; profiles, sensing quality,
loss rule and console override are assumed game choices. No radiation dosimetry
or flight-qualified hardware claims are made. See the [study](../../../docs/studies/s17/README.md).

## Vector sections

| Section | Inputs / expected behavior |
|---|---|
| `assumptions` | Profile parameters, terminal rule, declared geometry, datum/COM convention and tolerances |
| `entry_cases` | Seven recommended-profile paths plus the unchanged-console comparison; per-assembly raw/weighted dose to each case's stop, exact events and state; `dose_trace` gives camera/PDU/radiator dose every 0.5 s and at the stop |
| `stack` | Eight finite sheets; matrix columns are local (normal,u,v) in world coordinates, opening centre is local origin, explicit clipped segments |
| `informed_pass` | 2 m/s path, fixed attitude, full envelope boxes, samples, continuous lower clearance bound and ideal RCS cost |
| `economical_informed_pass` | Same route at 1.4 m/s with independently evaluated sweep bound and costs |
| `reconstruction.record` | The **only** input to `reconstruct()`: timestamped anonymous slopes, estimated camera poses, uncertainty, coverage and held-out flags |
| `reconstruction.expected` | Fitted junctions, independent and shared covariance, held-out residuals and coverage eligibility |
| `reconstruction.early_six_frames` / negative cases | Unresolved partial/occluded/no-parallax results; never a demonstrated hole |
| `reconstruction.truth_for_validation_only` | Test oracle only; must never be supplied to a belief fitter or rendered by FLIGHT |
| `resources` | Delivered chain power, actual cadence, bytes, energy, heat and capacity examples |
| `verification` | Point antiderivative vs quadrature, whole-appendage plateau integral, off-state and fast crossing cases |
| `checks_passed` | Named executable assertions; duplicate route checks apply to the two different speeds |

The event list is a **truth-side condition oracle**. Convert only actually sensed
events into the game's Black Box record. Doses are mechanical test outputs, not
automatically available telemetry. The `console: hardened` override is explicit
in each proposed case; the generator never changes the baseline data file.

`raw_dose()` is exact only for these nonrotating x-directed entry paths inside
the finite first sheet. It includes the plateau while an appendage straddles
the sheet. It is not the production general swept-solid integrator. The general
finite point query is independently checked at a junction, an exterior point,
a profile point and a rigidly rotated scene. Route clearance uses a conservative
infinite-line projection bound on each occupied box, then a continuous-time
Lipschitz guard. That bound can reject real finite-edge clearances; it cannot
certify an unsafe route as clear. The production finite exterior stays passable.

The acquisition reference assumes known track associations, calibrated fictional
coverage, good recorded relative poses and a steady camera. It fits only a single
observed quadrilateral. It does not solve general correspondence, camera pose
estimation, occlusion/detection calibration, all-layer acquisition or path planning.
The powered-event reference has feed availability but no electrical/thermal
ledger. The declared route is not flown through the game controller or gravity.

## Port tolerances

- Raw/weighted dose: absolute error <=1e-5 U s on these fixtures.
- Event times: <=0.001 s, with the same event ordering and ties.
- Reconstruction position: <=0.001 m with the supplied recordings; covariance
  and held-out statistics: relative error <=1e-4, absolute <=1e-8 near zero.
- Zero-exposure route: reproduce a conservative positive continuous lower bound;
  a more exact geometry algorithm may report a larger margin. Reproducing this
  projection algorithm should match its reported bound within 1e-5 m.
- JSON numbers are rounded to ten decimal places. Do not compare floating-point
  strings across different BLAS implementations; compare at the tolerances above.

Same-seed replay, save/resume of the actual coupled state, current-versus-old run
separation, thermal/power closure, production build/lint/tests and human playability
remain builder checks listed in the study. No full-game test result is implied by
the reference assertions.
