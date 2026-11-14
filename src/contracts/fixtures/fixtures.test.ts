import { describe, expect, it } from 'vitest';
import { hashState } from '../../lib/hash.ts';
import * as q from '../../lib/quat.ts';
import { fromPrincipal } from '../../lib/sym3.ts';
import type { Vec2 } from '../../lib/vec2.ts';
import * as v from '../../lib/vec3.ts';
import {
  covEllipse,
  covEllipsoid,
  isoCov2,
  isoCov3,
  projectCov3,
  varianceAlong,
} from '../estimates.ts';
import type { Hull } from '../ship.ts';
import { hullReach } from '../ship.ts';
import { issueForecast } from '../forecast.ts';
import { createFieldRegistry } from '../truth/index.ts';
import { buildFixtures, fixtures } from './index.ts';
import { mockEncounter, mockEnvironmentEffects, mockTruthTracks, mockTruthWorld } from './truth.ts';

const signedArea = (poly: readonly Vec2[]): number =>
  poly.reduce((s, p, i) => {
    const n = poly[(i + 1) % poly.length] as Vec2;
    return s + p.x * n.y - p.y * n.x;
  }, 0) / 2;

/** Every prism: a counter-clockwise convex outline with some height. */
const expectWellFormedHull = (hull: Hull): void => {
  expect(hull.length).toBeGreaterThan(0);
  for (const prism of hull) {
    expect(signedArea(prism.outline)).toBeGreaterThan(0);
    expect(prism.zMax).toBeGreaterThan(prism.zMin);
    const n = prism.outline.length;
    for (let i = 0; i < n; i++) {
      const a = prism.outline[i] as Vec2;
      const b = prism.outline[(i + 1) % n] as Vec2;
      const c = prism.outline[(i + 2) % n] as Vec2;
      expect((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)).toBeGreaterThanOrEqual(0);
    }
  }
};

describe('fixtures', () => {
  it('build deterministically', () => {
    expect(hashState(buildFixtures())).toBe(hashState(fixtures));
  });

  it('survive a JSON round trip (Black Box persistence shape)', () => {
    const json = JSON.parse(JSON.stringify(fixtures.archive));
    expect(json).toEqual(JSON.parse(JSON.stringify(json)));
    expect(json.attempts).toHaveLength(2);
  });

  it('issue frozen forecasts', () => {
    const forecast = fixtures.attempts[0].forecasts[0];
    expect(forecast).toBeDefined();
    expect(Object.isFrozen(forecast)).toBe(true);
    expect(Object.isFrozen(forecast?.samples[0]?.position)).toBe(true);
    expect(() => {
      (forecast as unknown as { modelVersion: number }).modelVersion = 99;
    }).toThrow();
  });

  it('copies drafts on issue, so later edits to the draft cannot change the forecast', () => {
    const draft = structuredClone(fixtures.attempts[0].forecasts[0]) as unknown as Parameters<
      typeof issueForecast
    >[0];
    const issued = issueForecast(draft);
    (draft as { horizon: number }).horizon = 1;
    expect(issued.horizon).toBe(1800);
  });

  it('keep measurements well formed and time-ordered', () => {
    for (const attempt of fixtures.attempts) {
      let last = -Infinity;
      for (const m of attempt.measurements) {
        expect(m.t).toBeGreaterThanOrEqual(last);
        last = m.t;
        expect(m.sigma).toHaveLength(m.value.length);
        if (m.kind === 'bearing' || m.kind === 'range') expect(m.target).toBeDefined();
        if (m.kind === 'telemetry') expect(m.channel).toBeDefined();
      }
      const kinds = new Set(attempt.measurements.map((m) => m.kind));
      expect([...kinds].sort()).toEqual(['accel', 'attitude', 'bearing', 'range', 'telemetry']);
    }
  });

  it('show a Newtonian forecast that starts right and drifts (the Gravity range premise)', () => {
    const attempt = fixtures.attempts[0];
    const forecast = attempt.forecasts[0];
    const trail = fixtures.trails[attempt.id] ?? [];
    const errorAt = (t: number): number => {
      const f = forecast?.samples.find((s) => s.t === t);
      const p = trail.find((s) => s.t === t);
      if (!f || !p) throw new Error(`no sample at ${t}`);
      return v.distance(f.position, p.position);
    };
    expect(errorAt(60)).toBeLessThan(1500);
    expect(errorAt(1800)).toBeGreaterThan(5 * errorAt(60));
    expect(forecast?.samples.some((s) => s.extrapolating)).toBe(true);
  });

  it('end attempt 2 at a collision with a-07 where the trail meets it', () => {
    const attempt = fixtures.attempts[1];
    expect(attempt.outcome).toEqual({ kind: 'lost', t: 1500, cause: 'collision' });
    const truthEnd = mockTruthTracks['attempt-0002'].at(-1);
    const a07 = mockTruthWorld.asteroids.find((a) => a.id === 'a-07');
    expect(truthEnd?.t).toBe(1500);
    expect(a07).toBeDefined();
  });

  it('provide a consistent view snapshot', () => {
    const snap = fixtures.viewSnapshot;
    expect(snap.trail.every((p) => p.t <= snap.t)).toBe(true);
    expectWellFormedHull(snap.ship.hull);
    expect(snap.world.modelVersion).toBe(2);
    expect(snap.forecasts).toHaveLength(1);
    expect(fixtures.viewSnapshotCompare.compare).toHaveLength(2);
    for (const c of fixtures.shipDefinition.configurations) expectWellFormedHull(c.hull);
  });

  it('are three-dimensional where views need it (A11)', () => {
    const snap = fixtures.viewSnapshot;
    // Asteroids sit off the bodies' plane; a-07 comes in from above.
    expect(snap.world.asteroids.some((a) => Math.abs(a.position.z) > 5e3)).toBe(true);
    expect(mockTruthWorld.asteroids.find((a) => a.id === 'a-07')?.velocity.z).toBeLessThan(0);
    // The camera's cone, the objective and the sun have a real direction in space.
    const cone = snap.coverage.cones[0];
    expect(cone).toBeDefined();
    expect(v.length(cone?.axis ?? v.ZERO)).toBeCloseTo(1, 12);
    expect(fixtures.briefing.objectives[0]?.region?.center.z).not.toBe(0);
    expect(mockTruthWorld.sun?.direction.z).toBeGreaterThan(0);
    // Uncertainty is an ellipsoid: longest along the direction of travel.
    const sample = snap.forecasts[0]?.samples[10];
    expect(sample).toBeDefined();
    if (!sample) return;
    const ellipsoid = covEllipsoid(sample.positionCov);
    expect(ellipsoid.radii[0]).toBeGreaterThan(1.5 * ellipsoid.radii[1]);
    expect(Math.abs(v.dot(ellipsoid.axes[0], v.normalize(sample.velocity)))).toBeCloseTo(1, 6);
    // The ship has height: a hull with z extent, equipment off the x–y plane, and a full
    // inertia whose roll moment is the smallest.
    const mp = snap.world.ship.massProperties;
    expect(hullReach(mp.hull, mp.centerOfMass)).toBeGreaterThan(7);
    expect(fixtures.shipDefinition.equipment.some((e) => e.position.z !== 0)).toBe(true);
    expect(mp.centerOfMass.z).not.toBe(0);
    const tensor = fromPrincipal(mp.inertia.moments, mp.inertia.axes);
    expect(tensor[0]).toBeLessThan(tensor[3]);
    expect(tensor[0]).toBeLessThan(tensor[5]);
    expect(q.norm(mp.inertia.axes)).toBeCloseTo(1, 12);
    // The deployed configuration is concave, so it is more than one prism.
    const deployed = fixtures.shipDefinition.configurations.find(
      (c) => c.id === 'radiators-deployed',
    );
    expect(deployed?.hull.length).toBe(3);
  });

  it('give attitude fixes as rotation vectors and bearings as azimuth and elevation', () => {
    const attempt = fixtures.attempts[0];
    const fix = attempt.measurements.find((m) => m.kind === 'attitude');
    expect(fix?.value).toHaveLength(3);
    // The mock ship flies nose along its velocity, in the x–y plane: a yaw, within the noise.
    expect(Math.abs(fix?.value[0] ?? 1)).toBeLessThan(1e-3);
    expect(Math.abs(fix?.value[1] ?? 1)).toBeLessThan(1e-3);
    const bearing = attempt.measurements.find((m) => m.kind === 'bearing');
    expect(bearing?.value).toHaveLength(2);
    expect(attempt.measurements.find((m) => m.kind === 'accel')?.value).toHaveLength(3);
  });

  it('carry no truth in belief-side data', () => {
    const text = JSON.stringify([fixtures.viewSnapshot, fixtures.archive, fixtures.models]);
    expect(text).not.toContain('"gm"');
    expect(text).not.toContain('"referenceRadius"');
    expect(text).not.toContain('"hidden"');
    expect(text).not.toContain('"kinematics"');
  });

  it('keep model covariances square and symmetric', () => {
    for (const model of Object.values(fixtures.models)) {
      const n = model.covariance.ids.length;
      expect(model.covariance.values).toHaveLength(n * n);
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++)
          expect(model.covariance.values[i * n + j]).toBe(model.covariance.values[j * n + i]);
    }
  });
});

describe('truth fixtures', () => {
  it('use the inverse-2.5 law and match the briefing ship', () => {
    expect(mockEncounter.world.law.exponent).toBe(2.5);
    expect(mockEncounter.ship).toBe(fixtures.shipDefinition);
    expect(mockEncounter.world.ship.systems.massProperties.mass).toBeCloseTo(
      fixtures.attempts[0].forecasts[0]?.inputs.massProperties.mass ?? 0,
      6,
    );
  });

  it('give equal Newtonian and true gravity at the reference radius', () => {
    const alpha = mockTruthWorld.bodies[0];
    expect(alpha).toBeDefined();
    if (!alpha) return;
    const { exponent: n, referenceRadius: r0 } = mockTruthWorld.law;
    const ship = mockTruthWorld.ship.kinematics.position;
    expect(v.distance(ship, alpha.position)).toBeCloseTo(r0, 6);
    const muPrior = fixtures.briefing.priors.find((p) => p.id === 'body.alpha.mu')?.value ?? 0;
    expect(alpha.gm / (r0 * r0)).toBeCloseTo(muPrior / (r0 * r0), 12);
    // Beta, farther than r0, pulls less than its Newtonian GM suggests: the drift to discover.
    const beta = mockTruthWorld.bodies[1];
    if (!beta) return;
    const rb = v.distance(ship, beta.position);
    expect((beta.gm / (r0 * r0)) * Math.pow(r0 / rb, n)).toBeLessThan(beta.gm / (rb * rb));
  });
});

describe('sunlight fixtures', () => {
  it('light the arrival ship: it is outside every body shadow', () => {
    const sun = mockTruthWorld.sun;
    expect(sun).toBeDefined();
    if (!sun) return;
    expect(v.length(sun.direction)).toBeCloseTo(1, 12);
    const ship = mockTruthWorld.ship.kinematics.position;
    for (const b of mockTruthWorld.bodies) {
      // A body's shadow is a cylinder of its radius behind it, along the light.
      const r = v.sub(ship, b.position);
      const behind = v.dot(r, sun.direction) < 0;
      const offAxis = v.length(v.cross(r, sun.direction));
      expect(behind && offAxis < b.radius).toBe(false);
    }
    expect(mockEnvironmentEffects.sunlight.irradiance).toBe(sun.irradiance);
  });
});

describe('calibration fixtures (1G spec §5.4)', () => {
  it('show the clue: under the Newtonian model, measured strength falls with distance', () => {
    const profile = fixtures.models.massOnly.calibration[0];
    expect(profile?.windows.length).toBe(3);
    const scales = profile?.scale ?? [];
    for (let i = 1; i < scales.length; i++) {
      expect(scales[i]).toBeLessThan(scales[i - 1] as number);
    }
    expect(profile?.inflation).toBeGreaterThan(1);
  });

  it('flatten once the distance law is adopted, and record what each forecast used', () => {
    for (const s of fixtures.models.distanceLaw.calibration[0]?.scale ?? []) {
      expect(Math.abs(s - 1)).toBeLessThan(0.01);
    }
    expect(fixtures.attempts[0].forecasts[0]?.inputs.calibration).toHaveLength(0);
    expect(fixtures.attempts[1].forecasts[0]?.inputs.calibration).toHaveLength(1);
  });
});

describe('field registry', () => {
  it('creates registered kinds and rejects unknown ones', () => {
    const registry = createFieldRegistry([
      {
        kind: 'uniform',
        create: (spec) => ({ id: spec.id, kind: spec.kind, acceleration: () => v.vec3(0, -1, 0) }),
      },
    ]);
    expect(registry.kinds()).toEqual(['uniform']);
    const field = registry.create({ id: 'u1', kind: 'uniform', params: null });
    expect(field.acceleration?.(v.ZERO, 0)).toEqual({ x: 0, y: -1, z: 0 });
    expect(() => registry.create({ id: 'x', kind: 'lattice', params: null })).toThrow();
    expect(() => registry.register({ kind: 'uniform', create: () => field })).toThrow();
  });
});

describe('estimate helpers', () => {
  it('compute covariance ellipses', () => {
    const e = covEllipse(isoCov2(3), 2);
    expect(e.major).toBeCloseTo(6, 12);
    expect(e.minor).toBeCloseTo(6, 12);
    const tilted = covEllipse([4, 0, 1]);
    expect(tilted.major).toBeCloseTo(2, 12);
    expect(tilted.minor).toBeCloseTo(1, 12);
    expect(tilted.angle).toBeCloseTo(0, 12);
  });

  it('compute covariance ellipsoids, variances along a direction and planar projections', () => {
    const iso = covEllipsoid(isoCov3(3), 2);
    expect(iso.radii[0]).toBeCloseTo(6, 12);
    expect(iso.radii[2]).toBeCloseTo(6, 12);
    // Sigmas 3, 2 and 1 along x, y and z.
    const boxy = covEllipsoid([9, 0, 0, 4, 0, 1]);
    expect(boxy.radii[0]).toBeCloseTo(3, 12);
    expect(boxy.radii[1]).toBeCloseTo(2, 12);
    expect(boxy.radii[2]).toBeCloseTo(1, 12);
    expect(Math.abs(boxy.axes[0].x)).toBeCloseTo(1, 12);
    expect(Math.abs(boxy.axes[2].z)).toBeCloseTo(1, 12);
    // Sigma 5 along the diagonal of the x–z plane and 1 across it.
    const d = Math.SQRT1_2;
    const diagonal = { x: d, y: 0, z: d };
    const tilted: [number, number, number, number, number, number] = [13, 0, 12, 1, 0, 13];
    expect(varianceAlong(tilted, diagonal)).toBeCloseTo(25, 10);
    const e = covEllipsoid(tilted);
    expect(e.radii[0]).toBeCloseTo(5, 10);
    expect(Math.abs(v.dot(e.axes[0], diagonal))).toBeCloseTo(1, 10);
    expect(projectCov3(tilted, v.UNIT_X, v.UNIT_Y)).toEqual([13, 0, 1]);
    expect(projectCov3(tilted, v.UNIT_X, v.UNIT_Z)).toEqual([13, 12, 13]);
  });
});
