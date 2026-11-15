# S18 — Three fixed-mass layouts, and what measures them

**[ASSUMED recommendation]** Use `compact`, `spread`, and `cross`. A named seeded run stream chooses among the three explicit layouts once at the expedition epoch. Save that choice in truth and never resample it during an encounter. Total mass, structural envelope, rail catalogue, material laws and spin magnitude do not reroll. Starting pose/phase and approach geometry can vary under A10. The reference fixes pose/phase to isolate the inertia effect; it does not certify all possible seeded approaches.

## Exact mass distribution

**[ASSUMED]** Target body axes are a persistent structural frame. All layouts contain:

- A uniform spherical hub, mass 100,000 kg, radius 50 m, centred at the datum.
- Four uniform rectangular **mass-equivalent** arms, each 25,000 kg and 3,000 m long with 2×2 m equivalent cross section: one along each ±x and ±y direction. Their centres are `(±1500,0,0)` and `(0,±1500,0)` m. Long-axis intrinsic moment is `m(2²+2²)/12`; transverse moments are `m(3000²+2²)/12`. These prescribe mass moments, not the stiffness of a literal thin beam; the real distributed frame/rails must reproduce the moments and meet [structural requirements](mechanics.md).
- Eight equal spherical ballast modules, 225,000 kg each, radius 20 m. Their centres occupy all eight sign combinations `(±a, ±b, ±100)` m. They remain mechanically locked throughout a run. Each intrinsic tensor is `0.4 m (20 m)² Identity`.

The common authoring envelope contains the ±3,000 m arm tips and all ballast arrangements; its z extent includes the ballast at ±100 m with 20 m radius. Internal rails/bracing must be included in the fixed-frame mass allowance and represented with equivalent moments. Do not draw a moving ballast system with unbudgeted frame mass. The 15 kg grapple and half of the paid rope are **additional captured hardware**, with their own contribution to target CoM and tensor; the table is the *bare*, fixed-mass target.

**[DEMONSTRATED: `configurations`]** Every layout has mass exactly **2,000,000 kg**, CoM `(0,0,0)`, positive principal moments satisfying triangle inequalities, and zero products of inertia in this structural frame:

| Layout | a, b (m) | Ixx (kg m²) | Iyy (kg m²) | Izz (kg m²) |
| --- | --- | ---: | ---: | ---: |
| Compact | 200, 200 | 240,388,050,000 | 240,388,050,000 | 444,388,033,333.333 |
| Spread | 600, 600 | 816,388,050,000 | 816,388,050,000 | 1,596,388,033,333.333 |
| Cross | 1000, 400 | 456,388,050,000 | 1,968,388,050,000 | 2,388,388,033,333.333 |

These rows specify the full tensors `diag(Ixx,Iyy,Izz)`, not scalar yaw approximations. In inertial space use `R I Rᵀ`; the provided inclined vectors have nontrivial inertial products. The full ship tensor remains non-diagonal even in its body frame.

**[ASSUMED]** The initial body rate is `(0,0,0.004)` rad/s, a stable maximum-moment principal spin in every layout. It is a common geometric starting speed, not a common angular momentum or energy. Each run's complete initial energy follows its selected physical layout; no ballast moves or motor replenishes spin during the encounter. Changing inertia at fixed angular momentum midway through a run is a different mechanism and is not allowed by these definitions.

## How the layouts look and how the instruments respond

**[ASSUMED]** All use identical visible module shells and asymmetric fixed landmark patterns, with no colour-coded hidden answer. Compact's eight shells cluster near the hub, Spread's form a much wider square, and Cross is elongated along the structural x arms. The two z levels let a changed viewpoint distinguish true depth from a projected overlap. An unresolved silhouette is not a configuration measurement; label the current layout uncertain until enough module positions are tracked.

**[ESTABLISHED: rigid-body scale ambiguity; demonstrated also in S3]** Steady torque-free rotation obeys the same pose history for all three tensors when spun about z. Even a rich free tumble is invariant under `I → lambda I`: it can constrain ratios, not absolute inertia. A visible layout identifies a *geometric class*. It does not weigh hidden ballast or establish a new target's absolute tensor.

**[ASSUMED]** Use the existing camera with acquired feature IDs, commanded pointing, multiple views and the star/gyro solution. The current camera implementation can point at a selected target after settling; it is not limited to the default forward boresight once commanded. Resolve metric geometry using a tracked ship baseline and, once connected and confirmed straight/taut, the calibrated line length plus measured strain correction and local direction. The payout count alone is not range while slack. Use distant asymmetric arm landmarks as well as the nearby rail so a tiny image patch is not mistaken for full target pose. Darkness, occlusion, poor scale or spin aliasing can keep the configuration ambiguous.

The model may reuse an earlier **measured, tested configuration-specific** inertia calibration after matching visible module positions this run. It carries that calibration's uncertainty and provenance. It cannot receive the current configuration ID, exact ballast masses or tensor from the seed. When matching evidence is absent, maintain alternative layouts and broad inertia estimates; changing an unobserved truth layout must leave an issued forecast unchanged.

## An absolute-inertia experiment that fits the kit

**[ASSUMED recommendation]** Offer an optional single-cassette diagnostic: acquire a 120 s unloaded feature arc, make a short approximately tangential pull, disconnect, and track for another 120 s. It consumes the cassette and, if using emergency cut, damages the return cartridge; the player can continue on the direct route. It needs neither a death nor a second hidden cassette. A player can instead perform the gentle turning manoeuvre with a wider forecast and gain weaker calibration. Prior matched-layout measurements can make a dedicated trial unnecessary.

**[DEMONSTRATED: `diagnostic_pulls`]** The diagnostic uses the same full 3D ship/target, 30 m line and buffer, but an initially trailing tangential line (`angle = -pi/2`), 0.25 m/s normal take-up and execution of disconnection at 4 s. It is a **different player-chosen approach**, not an instantaneous rotation of the loaded nominal geometry. Ship rate remains 0.004 rad/s; the line reaches 0.01022 rad/s only briefly, while its angle relative to the mount stays under 0.72°. The ship need not follow that instantaneous line rate. Main engine and RCS do no work in this short fixture.

| Layout | Diagnostic peak T | Target spin change from the pull, approximately | Inferred Izz design uncertainty (1σ) |
| --- | ---: | ---: | ---: |
| Compact | 3.501 kN | −5.61×10⁻⁵ rad/s | 6.38% |
| Spread | 4.135 kN | −2.17×10⁻⁵ rad/s | 11.38% |
| Cross | 4.242 kN | −1.52×10⁻⁵ rad/s | 15.47% |

**[ASSUMED observation design, DEMONSTRATED sensitivity arithmetic]** These uncertainties assume one target-pose estimate every 10 s with 0.0002 rad white phase error, a separately acquired 120 s pre-pull arc, and a **correlated 5% torque/metric-scale error floor**. Fit initial phase and initial spin as nuisance variables:

```text
phi(t) = phi0 + omega0 t + (1/Izz) integral_0^t (t-u) tau_z(u) du
tau = measured_attachment_lever_arm × measured_tension_direction_force
```

The generator calculates the information matrix and recovers Izz from synthetic phase/torque observations of the integrated trajectory. The 5% systematic error never shrinks with sample count. The uncertainties are **conditional design requirements**, not achieved camera performance or a noise-realistic estimator test. A single pose product carries correlated feature/ship errors; do not additionally count its constituent feature observations as independent evidence. A nearly planar pull identifies principally Izz; orthogonal components remain layout-prior dependent. Full six-component estimation needs independent noncoplanar excitations.

**[DEMONSTRATED]** Without the unloaded pre-pull arc, a short initial impulse can be absorbed into fitted initial spin and gives very poor inertia information. Likewise the gentle radial swing is a poor inertia experiment even with pretracking: its conditional fractional errors are about **22%, 55%, 77%**. The dedicated tangential pull, visible ballast positions and retained class-specific evidence address that weakness. Do not silently tighten all three layouts after one ordinary swing. If metric scale or load calibration cannot reach the assumed 5% floor, report an inconclusive result.

**[ASSUMED]** Keep calibration/held-out records distinct under A15 Q03. The synthetic fit above is an identifiability demonstration, not a held-out validation. A production validation must freeze the measured fit and predict a separate subsequent load segment or later independent attempt of the same observed class. Never fit and validate on the same phase samples, and never demand an arbitrary number of deaths or experiments.

## How much variation actually matters

**[DEMONSTRATED: the three `cases`]** At identical 400 s release and 420 s comparison, useful Δv differs by only **0.041 m/s**, tension by **5.2 N** and RCS consumption by **0.21 kg** between layouts. Spread versus Cross is particularly close in this gentle manoeuvre. Those differences are too small to carry dramatic gameplay difficulty by themselves. Do not amplify them in truth or pretend they radically change the departure.

**[DEMONSTRATED]** Their target spin-energy changes are respectively **−12.15 kJ, +11.38 kJ, +7.68 kJ**. The exchanges oscillate; late in an otherwise useful turn the ship may return spin energy to the target. The target's finite translation also reacts. Positive speed reward is not a conservation law.

**[ASSUMED]** The configurations matter more to the short forced-response experiment and to extrapolation outside the gentle envelope. Keeping three physically different, recognizable arrangements satisfies Q17 without manufacturing a hidden “difficulty multiplier.” Fresh phase, approach, release timing, clearance and the ship's inherited state remain the main repeat-run challenges. The proposed inertia distribution is an authored content version; future tuning must rerun these vectors and revalidate existing measured class calibrations explicitly.
