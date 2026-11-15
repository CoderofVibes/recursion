# A16 twenty-fence physical qualification

The declared **100 kg local RCS ceiling** is one third of the actual 300 kg fresh
load. This qualification flies the authored twenty-fence route through the
production ship systems and simulation. It does not give the player the route or
demonstrate that the player has acquired every opening. [ASSUMED: budget;
DEMONSTRATED: `qualification-runner.mjs`, `qualification-results.json`]

## Authored geometry and controls

Twenty finite 400 m square sheets are spaced 400 m apart, from x=0 to x=7600 m.
Pitch remains 80 m, influence radius 4 m and peak 20 U. Later sheets retain normal
rotations up to 8 degrees on each yaw/pitch axis and in-plane rotations up to 12 degrees; they are not
twenty coplanar grids. The opening centres wind around a 32 m radius transverse
loop, a 64 m phase variation on each transverse axis. Four catalogue entries
rigidly place that geometry in three dimensions. [ASSUMED: `layout.ts`]

The entry starts at the real content arrival: structural datum (-500,0,0), forward
speed 2 m/s, normal ship inventory and radiator configuration. Commands deploy
the solar arrays, enable Thread processing and brake toward 1.4 m/s. A quintic
entry joins the smooth loop with continuous position, velocity and acceleration.
Another quintic joins the final opening to the forward exit at (7950,40,40).
Maintaining lateral momentum between openings avoids nineteen artificial stop
and restart manoeuvres. [DEMONSTRATED: `chain-link.test.ts`]

The truth-side oracle computes a bounded position/velocity feedback demand and
sends ordinary `fly` commands. Every 0.1 s step runs the actual pulse/force/torque
allocator, tank consumption, power dispatch, thermal solver, deployment, sensor
acquisition, recorder scheduling and rigid-body simulation. It passes the same
midstep mass tensor used by the game loop. Attitude changes and correction consume
real jet authority; no position, velocity, attitude or inventory is reset during
flight. Main thrust is zero. All 160 real rocks remain present for collision,
shadow and camera occlusion tests. [DEMONSTRATED: `qualification.ts`]

## Continuous clearance certificate

The checked occupied geometry is exactly the production hull union, every actual
moving appendage prism and each compact assembly's declared mount point, from
`latticePoseFromShip`. Sampled clearance is the minimum distance from those solids
and points to any finite strand, minus its support radius. The physical flight
samples every 2.5 s and includes both endpoints. [DEMONSTRATED: helper]

For each 0.1 s simulation step, the helper bounds every material point's speed by
the sum of:

- Current COM speed plus `|force| * dt / mass`.
- Angular speed bound times the maximum actual body-point reach.
- Maximum vertex/mount deployment speed and COM-offset change speed.

The angular bound uses `3 * (Imax * |omega0| + |torque| * dt) / Imin`, with the
**actual constant midpoint inertia tensor used by that simulation step**. The
factor three encloses the simulator's five principal-axis rotation stages, whose
durations sum to three timesteps. Free rotations preserve angular-momentum norm;
the torque kicks increase it by at most `|torque| * dt`. This also bounds the
shortest quaternion interpolation between endpoints. Vertex/mount deployment is
linear in the production geometry model. The field does not accelerate the ship;
the authored world's only gravity source has GM=0. The helper rejects a nonzero
GM source, rather than omitting its acceleration from this bound.

Distance to the static field is one-Lipschitz in material displacement. Therefore
for consecutive samples a and b, a continuous lower bound is
`min(clearance(a), clearance(b)) - maximumSpeed(a..b) * (b-a)/2`.
Every intermediate time is within half that interval of an endpoint. The reported
minimum is the smallest such bound over the complete flight. Positive clearance
therefore establishes zero field dose without invoking a nonzero-exposure damage
solver. The independent geometric regression retains its original **>16 m**
assertion for all four catalogue frames and every sampled occupied shape.

## Measured flights

Final results are recorded in `qualification-results.json`. Each case starts from
seed `a16-twenty-controlled` and the indicated catalogue frame. The JSON contains
full-precision values; this report's table rounds for reading.

| Catalogue | Flight s | Actual RCS kg | RCS left kg | Continuous field clearance m | Simulated rock clearance m |
|---|---:|---:|---:|---:|---:|
| 0 | 6023.3 | 25.316773 | 274.683227 | 21.621496 | 21.977798 |
| 1 | 6023.2 | 25.288962 | 274.711038 | 21.681229 | 21.986732 |
| 2 | 6023.4 | 25.469730 | 274.530270 | 21.629307 | 21.958652 |
| 3 | 6023.3 | 25.395569 | 274.604431 | 21.622729 | 21.963275 |

All four complete flights stay below **25.470 kg RCS**, leaving at least
**74.530 kg within the declared 100 kg local allowance**, and at least 274.530 kg
in the ship. Entry braking, the real 56.6 m transverse entry alignment, deployment,
all twenty fences, attitude correction and the exit leg are included. Flight time
is 100.39 minutes at the 1.4 m/s informed cruise setting. [DEMONSTRATED: four runs]

Every case has zero contacts, faults or rejected commands and zero main-propellant
use. Worst sampled tracking departure is 0.289173 m; maximum sampled attitude departure is
0.009268 rad (0.531 degrees). The largest material-speed bound is 2.337986 m/s.
The field-clearance certificate's worst value, **21.621496 m**, exceeds the
unchanged 16 m requirement. These clearances concern the declared production
geometry, as qualified below.

The active camera/processor/recorder consume a measured minimum **200/1000/35 W**
from t=35 s onward, after normal optical readiness. The initial readiness interval
still pays the real ship loads and consumes actual resources; no frames are
invented during warmup. Each run completes **9,989 recorded feature frames**,
with **246,706,176–246,714,368 bytes** consumed in normal Thread recording. This
is about 3.1% of the real 8 GB capacity, not a claim that fresh storage is tight.
Maximum node temperatures are cabin/service 295 K, external loop 285.000462 K
and interface heat exchanger 292.705471 K. Fuel-cell use is at most 0.357611 kg
hydrogen and 2.860882 kg oxygen; total power, conversion and heat costs come from
the actual solver. These values establish healthy sustained acquisition resources,
not measured reconstruction coverage.

## Reproduction and evidence limits

From the worktree root, using installed dependencies:

```sh
node src/content/chain-link/qualification-runner.mjs 0
node src/content/chain-link/qualification-runner.mjs 1
node src/content/chain-link/qualification-runner.mjs 2
node src/content/chain-link/qualification-runner.mjs 3
node src/content/chain-link/qualification-runner.mjs --combine
npx vitest run src/content/chain-link/chain-link.test.ts src/content/chain-link/qualification.test.ts
```

The four numbered commands are independent and may run concurrently. Each flies
every production timestep to the actual exit. The runner fingerprints production
sim/ship/lib/contracts/data sources, game environment/truth-step and the four
content/qualification modules before and after the flight; source changes reject
the result. Combining requires four complete cases with the same current source
fingerprint. Routine tests validate the recorded full-flight evidence and run a
fresh 60 s production entry/deployment regression; they do not rerun all four
100-minute flights on every check.

These are healthy, fresh, known-geometry physical flights in four rigid catalogue
placements, not a human playtest, a blind-survival probability, 1,000 seeds, a
carried damaged/hot arrival, a fully costed exterior route, or a whole-expedition
reserve proof. Completed frame counts prove actual acquisition/recording under
the paid power schedule; they do **not** prove association, parallax, reconstruction
or safe-gap coverage. The remaining local RCS allowance is available for survey
and correction, but the measured-data controller and its survey schedule still
need separate qualification. The helper is never imported by player-facing code.

S17's proposed camera/antenna/engine-bell guard boxes are not production baseline
geometry yet. Compact electronics therefore retain the explicitly declared
mount-point approximation; no certificate here claims those proposed guard
volumes were silently installed. A baseline geometry change requires a rerun.

Two deterministic straight negative controls are checked: nominal y=z=0 hits the
entry strand, while y=z=40 clears the entry and hits a later sheet. This requires
navigation on those two paths; it does not rule out every straight line or prove
a player's likelihood of loss. All finite sheet edges remain real alternatives.
