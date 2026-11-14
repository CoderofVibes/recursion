export type { Vec3 } from './vec3.ts';
/** 3D vector helpers as a namespace: v3.add(a, b), v3.cross(a, b), ... */
export * as v3 from './vec3.ts';
export type { Quat } from './quat.ts';
/** Attitude quaternions as a namespace: quat.rotate(q, v), quat.fromYaw(angle), ... */
export * as quat from './quat.ts';
export type { Sym3, PrincipalAxes } from './sym3.ts';
/** Symmetric 3×3 helpers (covariances, inertia) as a namespace: sym3.principalAxes(m), ... */
export * as sym3 from './sym3.ts';
export type { Vec2 } from './vec2.ts';
/** 2D vector helpers, for planar data only (hull outlines, plots): v2.add(a, b), ... */
export * as v2 from './vec2.ts';
export * from './rng.ts';
export * from './clock.ts';
export * from './hash.ts';
export * from './freeze.ts';
