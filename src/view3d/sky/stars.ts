import { Vector3, Color } from 'three';
import { createRng } from '../../lib/rng.ts';
import { ATLAS_SEED, atlasLandmark, landmarkRay, DEG, DEEP_POLE } from './atlas.ts';
import { skyStyle } from './style.ts';

/** A single immutable point buffer for field stars, resolved clouds and the ember rim. */
export function atlasStars() {
  const rng = createRng(ATLAS_SEED).stream('stars');
  const positions: number[] = [],
    colours: number[] = [],
    sizes: number[] = [];
  const warm = skyStyle.white.clone().lerp(skyStyle.rust, 0.32);
  const ember = skyStyle.ember.clone();
  ember.multiplyScalar(1 / Math.max(ember.r, ember.g, ember.b));
  const add = (d: Vector3, c: Color, brightness: number, size: number) => {
    positions.push(d.x * 6900, d.y * 6900, d.z * 6900);
    colours.push(c.r * brightness, c.g * brightness, c.b * brightness);
    sizes.push(size);
  };
  const galaxy = atlasLandmark('galaxy');
  for (let i = 0; i < skyStyle.starCount; i++) {
    let d: Vector3;
    const band = i < skyStyle.starCount * 0.07;
    if (band) {
      // ~8x density at the centre; the bulk of the sphere stays a quiet faint field.
      d = landmarkRay(
        galaxy,
        Math.max(-0.86, Math.min(0.86, rng.normal(0, 0.43))),
        rng.normal(0, 0.05),
      );
    } else {
      const z = rng.range(-1, 1),
        a = rng.range(0, Math.PI * 2),
        r = Math.sqrt(1 - z * z);
      d = new Vector3(r * Math.cos(a), z, r * Math.sin(a));
      // Keep a sparse base even at the dark pole, without filling it with band stars.
      if (rng.next() > 1 - 0.88 * Math.exp((d.dot(DEEP_POLE) - 1) / 0.12)) continue;
    }
    const pick = rng.next();
    const c =
      pick < 0.35
        ? skyStyle.rust
        : pick < 0.7
          ? skyStyle.cold
          : pick < 0.95
            ? skyStyle.white
            : warm;
    const brightness = 0.018 + Math.pow(rng.next(), 8) * 0.6;
    add(d, c, brightness * (band ? 0.65 : 1), 0.75 + Math.sqrt(brightness) * 0.75);
  }
  const wheel = atlasLandmark('ember-wheel');
  // Jitter individual points, not an emissive smooth ring. Extra points on the near edge.
  for (let i = 0; i < 250; i++) {
    const a = i < 165 ? rng.range(0, Math.PI * 2) : rng.range(Math.PI, Math.PI * 2);
    const r = rng.normal(0.91, 0.025);
    add(
      landmarkRay(
        wheel,
        (Math.cos(a) * r * wheel.width * DEG) / 2,
        (Math.sin(a) * r * wheel.height * DEG) / 2,
      ),
      ember,
      rng.range(0.24, 0.65),
      rng.range(1.1, 1.7),
    );
  }
  for (let i = 0; i < 65; i++) {
    const r = rng.range(0.22, 0.83);
    const a = Math.log(r + 0.035) * 3 + (i % 2) * Math.PI + rng.normal(0, 0.1);
    add(
      landmarkRay(
        wheel,
        (Math.cos(a) * r * wheel.width * DEG) / 2,
        (Math.sin(a) * r * wheel.height * DEG) / 2,
      ),
      ember,
      rng.range(0.09, 0.27),
      1.05,
    );
  }
  const cloud = atlasLandmark('blue-cloud');
  for (let i = 0; i < 170; i++)
    add(
      landmarkRay(cloud, rng.normal(0, 1.6) * DEG, rng.normal(0, 1.2) * DEG),
      skyStyle.cold,
      0.03 + rng.next() ** 5 * 0.18,
      0.85,
    );
  const needle = atlasLandmark('needle');
  add(landmarkRay(needle, needle.width * DEG * 0.46, 0), skyStyle.white, 0.48, 1.8);
  add(atlasLandmark('ember').direction, skyStyle.rust, 1.3, 2);
  return { positions, colours, sizes };
}
