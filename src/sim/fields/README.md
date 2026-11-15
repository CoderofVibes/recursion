# src/sim/fields — environment field implementations, one file per kind. Owner: the section that builds each encounter (3B Inverse Wells, 3C Chain Link Fence).

Fields are three-dimensional (A11): the simulation asks `acceleration(position, t)` at each particle's real position and `modifyThrust(force, position, velocity, t)` with the ship's inertial thrust, position and velocity, all as `Vec3`, and uses all three components of what comes back. `modifyThrust` is not asked when there is no thrust. See `../fields.test.ts` and `../fields-3d.test.ts` for the pattern.
