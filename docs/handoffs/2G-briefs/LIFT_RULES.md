# 2G lift rules (step 1 of the 3D conversion) — read fully before editing

Repository: `C:\Dev\Recursion NASA Hackathon\.worktrees\2g` (branch `p2/2g-3d-flight`). Work only in this folder. Never `cd` to the project root, never touch other worktrees, never run `git stash`, **never commit, never switch branch**: the lead (2G) commits. Several workers edit this same tree at once, each in its own folders, so touch only the paths your prompt lists. Do not install anything.

## What is going on

The owner decided flight is three-dimensional (docs/DECISIONS.md A11). The **contracts are already converted** (`src/contracts/*.ts`, `src/contracts/truth/*.ts`) and new maths modules exist in `src/lib/` (`vec3.ts`, `quat.ts`, `sym3.ts`). Everything else still expects the old planar types and no longer compiles.

**This step is a lift, not the 3D conversion.** Make your folders compile against the new contracts and keep **every existing test passing with unchanged expected values**, by keeping the internals planar and converting at the boundary: every value has z = 0 and every rotation is about +z. Real 3D behaviour comes in later steps by other workers. Fast and mechanical beats clever. Do not start the real 3D work.

Mark every place where you kept a planar shortcut with a comment starting `// LIFT(2G):` saying what is still planar (one line). Later steps find them with grep.

## The new contract shapes (read the files; summary here)

- `Vec3 {x,y,z}` from `src/lib/vec3.ts` (namespace `v3` from `src/lib/index.ts`): `v3.vec3(x, y)` gives z = 0. `Vec2` and `v2` still exist, for hull outlines and plots only.
- `Quat {w,x,y,z}` from `src/lib/quat.ts` (namespace `quat`): attitude is a unit quaternion, **body to inertial**. Planar attitude ψ ↔ `quat.fromYaw(ψ)` / `quat.yawOf(q)`. Also `rotate`, `rotateInverse`, `axisX`, `pointAlong(current, direction)` ("roll held" pointing), `fromRotationVector`, `toRotationVector`.
- Angular velocity is a `Vec3` in the **body frame** (`angularVelocity`, was scalar `angularRate`). Planar rate ω ↔ `{x: 0, y: 0, z: ω}`.
- `Cov3 = [xx, xy, xz, yy, yz, zz]` (was `Cov2 = [xx, xy, yy]`). **Index trap: yy moved from [2] to [3].** Planar → 3D: `cov3FromPlanar([xx, xy, yy])` (from `src/contracts/index.ts`); 3D → planar: `[c[0], c[1], c[3]]`. `isoCov3(sigma)` exists.
- `Inertia { moments: Vec3; axes: Quat }` (principal moments and axes; was one scalar). Lift: `isotropicInertia(Izz)` builds one; the planar yaw inertia to use is `sym3.fromPrincipal(inertia.moments, inertia.axes)[5]` (the body-frame zz term; equals `moments.z` exactly when `axes` is the identity).
- Hull: `MassProperties.hull`, `ConfigurationSpec.hull`, `ShipView.hull` are `Hull = HullPrism[]`, each `{ outline: Vec2[] (convex, CCW, body x–y), zMin, zMax, part? }` (was `footprint: Vec2[]`). Lift: one prism holding the old polygon: `prismHull(polygon, zMin, zMax)`. Planar code uses `hull[0]?.outline ?? []`. `hullReach(hull, centerOfMass)` gives the farthest corner.
- `MassProperties.centerOfMass`, `EquipmentSpec.position`, `Mount.position/direction`, `TankSpec.position`, `structureCenterOfMass`: `Vec3` (z = 0 in the lift).
- `ShipKinematics { position: Vec3; velocity: Vec3; attitude: Quat; angularVelocity: Vec3 }`.
- `ShipEstimate`: `position`, `velocity`: Vec3; `positionCov`, `velocityCov`: Cov3; `attitude: Quat`; `attitudeSigma`; `angularVelocity: Vec3`.
- `ActuatorOutput.torque: Vec3` (body frame); `ThrustOutput.point/force: Vec3`. `EnvironmentEffects.specificForce: Vec3`, `sunlight.direction: Vec3`, `SensorTarget.relativePosition/relativeVelocity: Vec3`. `Sun.direction: Vec3`. Field methods take and return `Vec3`. `SimEvent` impact `point: Vec3`.
- **Measurement layouts** (`src/contracts/measurements.ts`):
  - `bearing`: `[azimuth, elevation]`, sigma `[σ_az, σ_el]`. Lift: elevation exactly 0, sigma `[σ, σ]`.
  - `range`: `[ρ]` (unchanged).
  - `relative-position`: `[x, y, z]`. Lift: z = 0.
  - `accel`: `[ax, ay, az]` body frame. Lift: az = 0, sigma `[σ, σ, σ]`.
  - `attitude`: rotation vector `[φx, φy, φz]`. Lift: `[0, 0, ψ]`, sigma `[σ, σ, σ]`.
  - `rate`: `[ωx, ωy, ωz]` body frame. Lift: `[0, 0, ω]`, sigma `[σ, σ, σ]`.
  - **No extra random draws** for the new components in the lift: seeded noise streams must produce exactly the same numbers as before, so the planar components are bit-identical.
- **Commands** (`src/contracts/commands.ts`):
  - `AttitudeTarget`: `{reference:'inertial', attitude: Quat}` (was `angle`); new `{reference:'direction', direction: Vec3}`; `prograde`, `retrograde`, `toward`, `away` have **no `offset` any more**; `{reference:'rate', rate: Vec3}` (body frame); `free`. Old `{reference:'inertial', angle: a}` ↔ `{reference:'inertial', attitude: quat.fromYaw(a)}`.
  - `point` command: `direction?: Vec3` (was `angle`). Old angle a ↔ `v3.fromAzEl(a)`.
  - New `{kind:'fly', input: HandsOnInput}` with `HandsOnInput { translate: Vec3 (−1..1 body axes), yaw (−1..1, + nose left), pitch (−1..1, + nose up), throttle (0..1) }`, `HANDS_ON_NEUTRAL`, `isHandsOnNeutral`. In force until the next `fly`.
  - `ProcedureCondition`: Vec3 position/velocity, Cov3, `attitude: Quat`.
- `Objective.region.center: Vec3`. `TrailPoint.position: Vec3`. `ThrustTick.point/direction: Vec3`. `ForecastSample.position/velocity: Vec3`, `positionCov: Cov3`; object tracks likewise.
- `SensorCoverage { cones: SensorCone[] }`, `SensorCone { sensor, axis: Vec3 (inertial unit), halfAngle, range, quality }` (was `sectors` with `center` angle and `halfWidth`). Lift: `axis = v3.fromAzEl(center)`, `halfAngle = halfWidth`.
- `DeepReadonly` now keeps tuple shapes, so a frozen `Forecast`'s covariances are tuples.

## Rules

1. Do not edit `src/contracts/` (types or fixtures) or `src/lib/`; the lead owns them and is converting the fixtures (`src/contracts/fixtures/`) right now. If you need a contract or lib change, say so in your final report; do not work around it silently. Tests that import fixtures may fail until the lead finishes; say which in your report rather than chasing them.
2. Tests: change only what the new types force (add `z: 0`, `quat.fromYaw(...)`, the new measurement layouts, `hull` instead of `footprint`, `[3]` instead of `[2]` for yy, and so on). **Do not change expected values, tolerances or what a test checks.** If a test cannot pass without changing an expectation, stop and report it with the numbers.
3. No behaviour change: same arithmetic in the same order wherever a result is compared or hashed. Determinism tests compare runs bit for bit.
4. Keep the P11 boundary: `src/model`, `src/blackbox` never import `src/sim` or `src/contracts/truth`.
5. Style: strict TypeScript, no `any`, Prettier formatting (run `npx prettier --write <your files>` at the end), ESLint clean (`npx eslint <your folders>`).
6. Check your own work with:
   - `npx tsc -p tsconfig.app.json --noEmit 2>&1 | grep "src/<your folder>/"` (errors elsewhere belong to other workers; ignore them);
   - `npx vitest run src/<your folder>` (vitest does not type-check, so it runs even while other folders are red).
7. Final report (short): what you changed per file in one line each, the `LIFT(2G)` shortcuts you left, test results (counts), anything you could not do, and any contract or lib change you need.
