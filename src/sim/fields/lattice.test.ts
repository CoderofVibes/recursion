import { describe, expect, it } from 'vitest';
import vectors from '../../../tools/studies/s5/vectors.json';
import { createFieldRegistry } from '../../contracts/truth/fields.ts';
import type { HullPrism } from '../../contracts/ship.ts';
import { IDENTITY, fromAxisAngle, fromYaw, multiply, rotate } from '../../lib/quat.ts';
import { add, type Vec3 } from '../../lib/vec3.ts';
import {
  closestSegments,
  createLatticeField,
  createLatticeLayer,
  latticeFieldFactory,
  pointSegmentDistance,
  sampleLatticeComponent,
  segmentPrismDistance,
  sweepLatticeExposure,
  type LatticeComponent,
  type LatticeLayer,
  type LatticePose,
} from './lattice.ts';

const v = (x: number, y = 0, z = 0): Vec3 => ({ x, y, z });
const point: LatticeComponent = { id: 'sensor', shapes: [{ kind: 'point', point: v(0) }] };
const single = (y = 0, id = 'sheet'): LatticeLayer => ({
  id,
  radius: 4,
  peakIntensity: 20,
  strands: [{ id: `${id}:strand`, a: v(0, y, -200), b: v(0, y, 200) }],
});
const field = createLatticeField('lattice', { layers: [single()] });
const pose = (position: Vec3, components: readonly LatticeComponent[] = [point]): LatticePose => ({
  position,
  attitude: IDENTITY,
  centerOfMass: v(0),
  components,
});
const prism = (
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): HullPrism => ({
  outline: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  zMin: z0,
  zMax: z1,
});
const grid = createLatticeField('s5', {
  layers: [
    createLatticeLayer({
      id: 's5',
      center: v(0),
      u: v(0, 1),
      v: v(0, 0, 1),
      halfU: 200,
      halfV: 200,
      pitchU: 80,
      pitchV: 80,
      phaseU: 40,
      phaseV: 40,
      radius: 4,
      peakIntensity: 20,
    }),
  ],
});

describe('finite 3D lattice geometry', () => {
  it('registers the factory and leaves centre openings and the finite exterior exactly empty', () => {
    const registry = createFieldRegistry([latticeFieldFactory]);
    const loaded = registry.create({
      id: 'test',
      kind: 'lattice',
      params: JSON.parse(JSON.stringify({ layers: grid.layers })),
    });
    expect(loaded.intensity!(v(0), 0)).toBe(0);
    expect(loaded.intensity!(v(0, 40, 0), 0)).toBe(20);
    expect(loaded.intensity!(v(0, 40, 205), 0)).toBe(0);
    expect(loaded.intensity!(v(0, 40, 202), 0)).toBeCloseTo(6.328125, 12);
  });
  it('counts a same-sheet junction once and sums different sheets', () => {
    expect(grid.intensity(v(0, 40, 40))).toBe(20);
    const twice = createLatticeField('twice', {
      layers: [...grid.layers, { ...grid.layers[0]!, id: 'second' }],
    });
    expect(twice.intensity(v(0, 40, 40))).toBe(40);
  });
  it('preserves finite geometry under an inclined rigid transform at expedition coordinates', () => {
    const q = fromAxisAngle(v(1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)), 1.19),
      offset = v(1e6, -2e6, 4e5);
    const transformed = createLatticeField('rotated', {
      layers: grid.layers.map((l) => ({
        ...l,
        strands: l.strands.map((s) => ({
          ...s,
          a: add(offset, rotate(q, s.a)),
          b: add(offset, rotate(q, s.b)),
        })),
      })),
    });
    for (const p of [v(0, 40, 0), v(2, 40, 0), v(0, 40, 202), v(0)])
      expect(transformed.intensity(add(offset, rotate(q, p)))).toBeCloseTo(grid.intensity(p), 7);
  });
  it('handles crossing, degenerate, parallel and almost parallel finite segments', () => {
    expect(closestSegments(v(-1), v(1), v(0, -1), v(0, 1)).distance).toBe(0);
    expect(closestSegments(v(0), v(0), v(2), v(2)).distance).toBe(2);
    expect(closestSegments(v(-1), v(1), v(-1, 3), v(1, 3)).distance).toBe(3);
    expect(closestSegments(v(-1e6), v(1e6), v(-1e6, -0.001), v(1e6, 0.001)).distance).toBeLessThan(
      1e-10,
    );
    expect(pointSegmentDistance(v(0, 0, 9), v(-1), v(1))).toBe(9);
  });
  it('rejects malformed geometry rather than producing invisible safety', () => {
    expect(() => createLatticeField('bad', { layers: [{ ...single(), radius: 0 }] })).toThrow();
    expect(() => createLatticeField('bad', { layers: [single(), single()] })).toThrow();
    expect(() =>
      createLatticeLayer({
        id: 'bad',
        center: v(0),
        u: v(1),
        v: v(1),
        halfU: 1,
        halfV: 1,
        pitchU: 1,
        pitchV: 1,
        radius: 1,
        peakIntensity: 1,
      }),
    ).toThrow();
  });
});

describe('whole component solids', () => {
  it('detects a strand through a face interior while every vertex is clear', () => {
    const panel = prism(-5, 5, -5, 5, -0.1, 0.1);
    for (const p of panel.outline)
      expect(pointSegmentDistance({ ...p, z: 0.1 }, v(0, 0, -100), v(0, 0, 100))).toBeGreaterThan(
        4,
      );
    expect(segmentPrismDistance(v(0, 0, -100), v(0, 0, 100), panel).distance).toBe(0);
    const sample = sampleLatticeComponent(field, pose(v(0)), {
      id: 'radiator',
      shapes: [{ kind: 'prism', prism: panel }],
    });
    expect(sample.lower).toBe(20);
    expect(sample.upper).toBe(20);
    expect(sample.clearance).toBe(-4);
  });
  it('gets face, edge, corner and finite endpoint distances', () => {
    const box = prism(-1, 1, -1, 1, -1, 1);
    expect(segmentPrismDistance(v(-4, 3), v(4, 3), box).distance).toBe(2);
    expect(segmentPrismDistance(v(-4, 3, 4), v(4, 3, 4), box).distance).toBeCloseTo(
      Math.sqrt(13),
      12,
    );
    expect(segmentPrismDistance(v(3, 3, 3), v(4, 4, 4), box).distance).toBeCloseTo(
      Math.sqrt(12),
      12,
    );
    expect(segmentPrismDistance(v(0, 0, 3), v(0, 0, 4), box).distance).toBe(2);
  });
  it('maximizes the sum at one actual point rather than summing separate layer maxima', () => {
    const mixed = createLatticeField('mixed', { layers: [single(-3, 'left'), single(3, 'right')] });
    const part: LatticeComponent = {
      id: 'wide',
      shapes: [{ kind: 'prism', prism: prism(-0.1, 0.1, -3, 3, -0.1, 0.1) }],
    };
    const sample = sampleLatticeComponent(mixed, pose(v(0)), part, {
      intensityTolerance: 1e-5,
      maxCells: 10000,
    });
    expect(sample.lower).toBeCloseTo(20, 9);
    expect(sample.upper).toBeLessThanOrEqual(20.00001);
    expect(sample.resolved).toBe(true);
  });
  it('reports an unresolved spatial enclosure when its budget is insufficient', () => {
    const mixed = createLatticeField('mixed', { layers: [single(-3, 'left'), single(3, 'right')] });
    const sample = sampleLatticeComponent(
      mixed,
      pose(v(0)),
      { id: 'wide', shapes: [{ kind: 'prism', prism: prism(-0.1, 0.1, -3, 3, -0.1, 0.1) }] },
      { maxCells: 1 },
    );
    expect(sample.lower).toBe(20);
    expect(sample.upper).toBe(40);
    expect(sample.resolved).toBe(false);
  });
  it('finds a simultaneous-sheet maximum between the two individually strongest points', () => {
    const mixed = createLatticeField('mixed', { layers: [single(-1, 'left'), single(1, 'right')] });
    const sample = sampleLatticeComponent(
      mixed,
      pose(v(0)),
      {
        id: 'wide',
        shapes: [{ kind: 'prism', prism: prism(-0.01, 0.01, -2, 2, -0.01, 0.01) }],
      },
      { intensityTolerance: 1e-5, maxCells: 20000 },
    );
    const expected = 40 * (15 / 16) ** 4;
    expect(Math.abs(sample.lower - expected)).toBeLessThan(1e-5);
    expect(sample.upper - expected).toBeLessThanOrEqual(1e-5);
    expect(sample.resolved).toBe(true);
  });
  it('subtracts the current body COM before rotating geometry', () => {
    const q = fromYaw(Math.PI / 2),
      p = pose(v(20, 1), [{ id: 'sensor', shapes: [{ kind: 'point', point: v(5) }] }]);
    const moved = { ...p, attitude: q, centerOfMass: v(4) };
    const sample = sampleLatticeComponent(field, moved, moved.components[0]!);
    expect(sample.clearance).toBeCloseTo(Math.hypot(20, 2) - 4, 12);
  });
});

describe('swept exposure and chronological threshold intervals', () => {
  for (const reference of vectors.lattice.analytic_crossings)
    it(`matches independent S5 point dose at b=${reference.impact_m}`, () => {
      const result = sweepLatticeExposure(field, {
        start: -3,
        end: 3,
        maxPointSpeed: 2,
        poseAt: (t) => pose(v(2 * t, reference.impact_m)),
      })[0]!;
      expect(Math.abs(result.dose - reference.analytic_exposure_Us)).toBeLessThan(1e-5);
      expect(result.doseLower).toBeLessThanOrEqual(reference.analytic_exposure_Us + 1e-12);
      expect(result.doseUpper).toBeGreaterThanOrEqual(reference.analytic_exposure_Us - 1e-12);
      expect(result.resolved).toBe(true);
    });
  it('catches a full crossing inside a single tick whose endpoints are clear', () => {
    const result = sweepLatticeExposure(field, {
      start: 0,
      end: 1,
      maxPointSpeed: 20,
      poseAt: (t) => pose(v(-10 + 20 * t)),
    })[0]!;
    expect(result.dose).toBeCloseTo(3.25079365079365, 7);
    expect(result.clearanceLower).toBeLessThanOrEqual(-4);
    expect(result.clearanceUpper).toBe(-4);
    expect(result.doseCertified).toBe(false); // a converged estimate is not a narrow rigorous enclosure
    expect(result.doseErrorBound).toBeGreaterThan(1e-6);
    const interval = result.thresholds.filter((i) => i.status === 'above');
    const dwell = interval.reduce((sum, i) => sum + i.end - i.start, 0);
    const exact = (2 * 4 * Math.sqrt(1 - Math.pow(0.5, 0.25))) / 20;
    expect(Math.abs(dwell - exact)).toBeLessThan(0.001);
  });
  for (const reference of vectors.lattice.passes)
    it(`matches S5 capsule envelopes: ${reference.id}`, () => {
      const components: LatticeComponent[] = Object.entries(reference.components).map(
        ([id, c]) => ({
          id,
          shapes: [
            {
              kind: 'capsule',
              a: v(...(c.capsule_body_m[0] as [number, number, number])),
              b: v(...(c.capsule_body_m[1] as [number, number, number])),
              radius: c.capsule_radius_m,
            },
          ],
        }),
      );
      const results = sweepLatticeExposure(grid, {
        start: 0,
        end: 16,
        maxPointSpeed: 2,
        poseAt: (t) => pose(v(-16 + 2 * t, reference.start_com_m[1]!), components),
      });
      for (const result of results) {
        const expected =
          reference.components[result.component as keyof typeof reference.components];
        expect(
          Math.abs(result.dose - expected.raw_exposure_Us_dt_0_125_0_0625_0_03125[2]!),
        ).toBeLessThan(1e-4);
        expect(result.clearanceLower).toBeLessThanOrEqual(expected.minimum_clearance_m + 1e-9);
        expect(result.clearanceUpper).toBeGreaterThanOrEqual(expected.minimum_clearance_m - 1e-9);
      }
    });
  it('matches S17 finite prism dose independently: a 5 m chord extends a central contact', () => {
    const radiator: LatticeComponent = {
      id: 'radiator',
      shapes: [{ kind: 'prism', prism: prism(-2.5, 2.5, -1, 1, -0.1, 0.1) }],
    };
    const result = sweepLatticeExposure(field, {
      start: -6,
      end: 6,
      maxPointSpeed: 2,
      poseAt: (t) => pose(v(2 * t), [radiator]),
    })[0]!;
    // S17 independently integrates this solid; plateau I0*chord/speed plus S5 point wings.
    expect(Math.abs(result.dose - 82.5079365079365)).toBeLessThan(1e-5);
  });
  it('sweeps rotating appendages whose beginning and end poses both clear', () => {
    const boom: LatticeComponent = {
      id: 'boom',
      shapes: [{ kind: 'capsule', a: v(0, 3), b: v(0, 34), radius: 0.5 }],
    };
    const at = (t: number) => ({ ...pose(v(0, 5), [boom]), attitude: fromYaw(-0.6 + 1.2 * t) });
    expect(sampleLatticeComponent(grid, at(0), boom).clearance).toBeGreaterThan(15);
    expect(sampleLatticeComponent(grid, at(1), boom).clearance).toBeGreaterThan(15);
    const result = sweepLatticeExposure(grid, {
      start: 0,
      end: 1,
      maxPointSpeed: 41.4,
      poseAt: at,
    })[0]!;
    expect(result.clearanceLower).toBeLessThan(-3.49);
    expect(result.dose).toBeGreaterThan(0);
  });
  it('sweeps intermediate deployment and does not substitute the requested configuration for a jam', () => {
    const at = (t: number) =>
      pose(v(0, 24), [
        {
          id: 'radiator',
          shapes: [{ kind: 'prism', prism: prism(-1, 1, 3, 5 + 15 * Math.min(t, 0.8), -0.1, 0.1) }],
        },
      ]);
    const jammed = at(0.8).components[0]!;
    expect(sampleLatticeComponent(grid, at(0), at(0).components[0]!).lower).toBe(0);
    expect(sampleLatticeComponent(grid, at(1), jammed).lower).toBe(20);
    const result = sweepLatticeExposure(grid, {
      start: 0,
      end: 1,
      maxPointSpeed: 15,
      poseAt: at,
    })[0]!;
    expect(result.dose).toBeGreaterThan(4);
    expect(result.clearanceUpper).toBe(-4);
  });
  it('retains separate above-threshold intervals across a dip and is deterministic', () => {
    const f = createLatticeField('two', {
      layers: [
        single(),
        { ...single(0, 'second'), strands: [{ id: 'b', a: v(20, 0, -100), b: v(20, 0, 100) }] },
      ],
    });
    const sweep = {
      start: 0,
      end: 3,
      maxPointSpeed: 10,
      poseAt: (t: number) => pose(v(-5 + 10 * t)),
    };
    const a = sweepLatticeExposure(f, sweep),
      b = sweepLatticeExposure(f, sweep);
    expect(a).toEqual(b);
    expect(a[0]!.thresholds.filter((i) => i.status === 'above')).toHaveLength(2);
  });
  it('flags temporal budget exhaustion and never classifies the crossing as clear', () => {
    const result = sweepLatticeExposure(
      field,
      { start: 0, end: 1, maxPointSpeed: 20, poseAt: (t) => pose(v(-10 + 20 * t)) },
      { maxDepth: 0 },
    )[0]!;
    expect(result.resolved).toBe(false);
    expect(result.clearanceLower).toBeLessThan(0);
    expect(result.doseUpper).toBeGreaterThan(0);
  });
  it('rejects invalid numerical controls and empty component geometry', () => {
    const sweep = { start: 0, end: 1, maxPointSpeed: 2, poseAt: (t: number) => pose(v(2 * t)) };
    expect(() => sweepLatticeExposure(field, { ...sweep, maxPointSpeed: -1 })).toThrow();
    expect(() => sweepLatticeExposure(field, sweep, { maxDepth: Infinity })).toThrow();
    expect(() => sweepLatticeExposure(field, sweep, { doseTolerance: 0 })).toThrow();
    expect(() => sweepLatticeExposure(field, sweep, { thresholds: [NaN] })).toThrow();
    expect(() =>
      sampleLatticeComponent(field, pose(v(0)), { id: 'missing', shapes: [] }),
    ).toThrow();
  });
  it('captures repeated nonlinear crossings even when endpoint, middle and quarter poses all clear', () => {
    const at = (t: number) => pose(v(8 * Math.cos(4 * Math.PI * t)));
    for (const t of [0, 0.25, 0.5, 0.75, 1]) expect(field.intensity(at(t).position)).toBe(0);
    const result = sweepLatticeExposure(field, {
      start: 0,
      end: 1,
      maxPointSpeed: 32 * Math.PI,
      poseAt: at,
    })[0]!;
    expect(result.thresholds.filter((i) => i.status === 'above')).toHaveLength(4);
    expect(result.dose).toBeGreaterThan(0);
    expect(result.doseLower).toBeLessThanOrEqual(result.dose);
    expect(result.doseUpper).toBeGreaterThanOrEqual(result.dose);
  });
  it('is frame invariant through rotation, translation and COM subtraction', () => {
    const q = fromAxisAngle(v(0, 1), 0.9),
      offset = v(5000, -200, 900);
    const transformed = createLatticeField('rotated', {
      layers: field.layers.map((l) => ({
        ...l,
        strands: l.strands.map((s) => ({
          ...s,
          a: add(offset, rotate(q, s.a)),
          b: add(offset, rotate(q, s.b)),
        })),
      })),
    });
    const original = sweepLatticeExposure(field, {
      start: -3,
      end: 3,
      maxPointSpeed: 2,
      poseAt: (t) => pose(v(2 * t, 2)),
    })[0]!;
    const moved = sweepLatticeExposure(transformed, {
      start: -3,
      end: 3,
      maxPointSpeed: 2,
      poseAt: (t) => ({
        ...pose(add(offset, rotate(q, v(2 * t, 2)))),
        attitude: multiply(q, IDENTITY),
      }),
    })[0]!;
    expect(moved.dose).toBeCloseTo(original.dose, 8);
  });
});
