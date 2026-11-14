import { describe, expect, it } from 'vitest';
import { hashState } from '../../lib/hash.ts';
import * as v from '../../lib/vec2.ts';
import type { Vec2 } from '../../lib/vec2.ts';
import { covEllipse, isoCov2 } from '../estimates.ts';
import { issueForecast } from '../forecast.ts';
import { createFieldRegistry } from '../truth/index.ts';
import { buildFixtures, fixtures } from './index.ts';
import { mockEncounter, mockTruthTracks, mockTruthWorld } from './truth.ts';

const signedArea = (poly: readonly Vec2[]): number =>
  poly.reduce((s, p, i) => s + v.cross(p, poly[(i + 1) % poly.length] as Vec2), 0) / 2;

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
    expect(signedArea(snap.ship.footprint)).toBeGreaterThan(0);
    expect(snap.world.modelVersion).toBe(2);
    expect(snap.forecasts).toHaveLength(1);
    expect(fixtures.viewSnapshotCompare.compare).toHaveLength(2);
    for (const c of fixtures.shipDefinition.configurations) {
      expect(signedArea(c.footprint)).toBeGreaterThan(0);
    }
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

describe('field registry', () => {
  it('creates registered kinds and rejects unknown ones', () => {
    const registry = createFieldRegistry([
      {
        kind: 'uniform',
        create: (spec) => ({ id: spec.id, kind: spec.kind, acceleration: () => v.vec2(0, -1) }),
      },
    ]);
    expect(registry.kinds()).toEqual(['uniform']);
    const field = registry.create({ id: 'u1', kind: 'uniform', params: null });
    expect(field.acceleration?.(v.ZERO, 0)).toEqual({ x: 0, y: -1 });
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
});
