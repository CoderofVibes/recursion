import type { EnvironmentEffects } from '../../contracts/truth/ship.ts';
import { rotate } from '../../lib/quat.ts';

/**
 * Cosine of the angle between the sunlight and a body-fixed normal, 0 when the sun is behind
 * the surface or the ship is in shadow (DECISIONS A3; `env.sunlight` arrives with body shadows
 * applied).
 *
 * The normal is carried into the inertial frame by the ship's attitude and compared with the
 * direction toward the sun through their azimuths and elevations (the spherical law of
 * cosines): cos = cos el₁ · cos el₂ · cos(az₁ − az₂) + sin el₁ · sin el₂. With the sun and the
 * normal both in the inertial x–y plane this is exactly cos(sun azimuth − yaw), the planar
 * ship's formula, so in-plane flight gives the same numbers as before.
 */
export function sunIncidence(env: EnvironmentEffects, normal: readonly number[]): number {
  if (!(env.sunlight.irradiance > 0)) return 0;
  const sun = env.sunlight.direction;
  const n = rotate(env.kinematics.attitude, {
    x: normal[0] ?? 0,
    y: normal[1] ?? 0,
    z: normal[2] ?? 0,
  });
  const sunElevation = Math.atan2(sun.z, Math.hypot(sun.x, sun.y));
  const normalElevation = Math.atan2(n.z, Math.hypot(n.x, n.y));
  const cosine =
    Math.cos(sunElevation) *
      Math.cos(normalElevation) *
      Math.cos(Math.atan2(sun.y, sun.x) - Math.atan2(n.y, n.x)) +
    Math.sin(sunElevation) * Math.sin(normalElevation);
  return Math.max(0, cosine);
}
