# src/lib — shared numerical utilities

Owner: integrator (1A). Pure functions, no DOM, safe in Web Workers and on both sides of the truth/belief boundary. Request additions in your handoff note.

Import from `src/lib/index.ts`:

```ts
import { v3, quat, sym3, createRng, createFixedStepClock, hashState, deepFreeze, type Vec3, type Quat } from '../lib/index.ts';
```

| Module | What |
|---|---|
| `vec3.ts` (as `v3`) | Immutable 3D vectors (A11): `vec3(x, y, z = 0)`, `add`, `sub`, `scale`, `addScaled`, `dot`, `cross`, `length`, `distance`, `normalize`, `lerp`, `equals`, `anyPerpendicular`, `fromAzEl`, `azimuthOf`, `elevationOf`, `angleBetween`. Hot loops may unpack to scalars. |
| `quat.ts` (as `quat`) | Unit quaternions for attitude, **body to inertial**, scalar first: `rotate`, `rotateInverse`, `multiply` (applies the right one first), `conjugate`, `normalize`, `fromAxisAngle`, `fromYaw` / `yawOf` (the planar attitude), `axisX/Y/Z`, `fromRotationVector` / `toRotationVector` (how attitude fixes are stored), `angleBetween`, `shortestArc`, `pointAlong(current, direction)` (pointing with roll held; exact for planar inputs), `slerp`, `integrateBodyRate`, `toMatrix` / `fromMatrix`. |
| `sym3.ts` (as `sym3`) | Symmetric 3×3 matrices as six terms `[xx, xy, xz, yy, yz, zz]` (covariances, inertia tensors): `principalAxes` (fixed-count Jacobi; the rotation stays near the identity), `fromPrincipal`, `rotateSym3`, `pointInertia` (parallel-axis term), `mulSym3`, `quadSym3`, `addSym3`, `scaleSym3`. |
| `vec2.ts` (as `v2`) | Immutable 2D vectors, for planar data only (hull outlines, plots): `vec2`, `add`, `sub`, `scale`, `addScaled`, `dot`, `cross` (z of 3D cross), `length`, `distance`, `normalize`, `perp`, `rotate`, `fromAngle`, `angleOf`, `lerp`, `equals`, `wrapAngle`, `bodyToInertial`, `inertialToBody`. |
| `rng.ts` | Seeded random numbers with named streams (P2). `createRng(seed)`, `.stream(name)` (independent of draw order and of other streams), `next`, `range`, `int`, `normal`, `chance`, `pick`, `getState`/`setState` (four uint32 words). Never use `Math.random()` in game code. |
| `clock.ts` | Fixed-step clock (P2). `advance(realSeconds, warp)` returns whole steps to run; time is `step × dt`, so it never drifts; `alpha` for render interpolation; caps steps per frame. |
| `hash.ts` | `hashState(value)`: 16-hex-digit hash of any JSON-like value, key-order independent, bit-exact on numbers. Use in determinism tests. |
| `freeze.ts` | `deepFreeze(value)` and `DeepReadonly<T>` (tuples keep their shape). |

**Determinism limit [ASSUMED]:** results are bit-identical on the same JavaScript engine. `Math.sin`, `Math.pow` and friends are not required to be correctly rounded, so Chrome and Firefox may differ in the last bits. Replays and procedures are compared on the player's own browser, so this is acceptable; do not compare hashes across engines.
