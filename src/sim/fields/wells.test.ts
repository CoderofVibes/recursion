import { describe, expect, it } from 'vitest';
import vectors from '../../../tools/studies/s5/vectors.json';
import gardenVectors from '../../content/inverse-wells/s16-reference.json';
import funnelVectors from '../../content/inverse-wells/s22-reference.json';
import type { FieldInstanceSpec, TruthWorld } from '../../contracts/truth/index.ts';
import * as quat from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import * as v3 from '../../lib/vec3.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { createShipSystemsState, loadShipDefinition, stepShipSystems } from '../../ship/index.ts';
import { createSimulation } from '../simulation.ts';
import { actuators, asteroid, body, makeWorld, massProps, thrust } from '../test-helpers.ts';
import {
  accumulateWellWork,
  accumulateFunnelWork,
  applyRadialResponse,
  createWellRegistry,
  createWellSpatialIndex,
  createFunnelCrushIndex,
  DEFAULT_WELL_PROFILE,
  evaluateWell,
  evaluateFunnel,
  funnelBirthGuard,
  funnelBirthGuardCenter,
  funnelBounds,
  funnelCoordinates,
  funnelCrushPoint,
  funnelCrushSegment,
  funnelSpec,
  funnelSupportBounds,
  readFunnelParameters,
  sampleFunnel,
  readWellParameters,
  sampleWell,
  segmentWellCrossings,
  smoothWellWeight,
  validateWellSpecs,
  wellFactory,
  wellSpec,
  type FunnelGeometry,
  type WellBounds,
} from './wells.ts';

const well = wellSpec('well-a', v3.ZERO);
const force = { x: -24_000, y: 0, z: 0 };
const vec = (values: readonly number[]): Vec3 => ({ x: values[0]!, y: values[1]!, z: values[2]! });
const closeVec = (actual: Vec3, expected: Vec3, places = 10): void => {
  expect(actual.x).toBeCloseTo(expected.x, places);
  expect(actual.y).toBeCloseTo(expected.y, places);
  expect(actual.z).toBeCloseTo(expected.z, places);
};
const withWells = (
  world: TruthWorld,
  fields: readonly FieldInstanceSpec[] = [well],
): TruthWorld => ({
  ...world,
  fields,
});

describe('A15 separated spherical wells', () => {
  it('validates JSON and rejects unsupported geometry before starting a flight', () => {
    expect(readWellParameters(well)).toEqual({ ...DEFAULT_WELL_PROFILE, center: v3.ZERO });
    for (const profile of [
      { coreRadius: 0, innerRadius: 40e3, outerRadius: 50e3 },
      { coreRadius: 1000, innerRadius: 1000, outerRadius: 50e3 },
      { coreRadius: 1000, innerRadius: 50e3, outerRadius: 50e3 },
      { coreRadius: 1000, innerRadius: 40e3, outerRadius: Infinity },
    ])
      expect(() => wellSpec('bad', v3.ZERO, profile)).toThrow(/radii|finite/);
    expect(() => wellSpec('', v3.ZERO)).toThrow(/ID/);
    expect(() => wellSpec('bad', { x: NaN, y: 0, z: 0 })).toThrow(/finite/);
    expect(() => wellFactory.create({ ...well, params: { center: [] } })).toThrow(/center/);
    expect(() => wellFactory.create({ ...well, kind: 'other' })).toThrow(/kind/);
    expect(() => sampleWell(well, { x: 1000, y: 0, z: 0 })).toThrow(/excluded well core/);
    expect(() => sampleWell(well, v3.ZERO)).toThrow(/excluded well core/);
    expect(() => sampleWell(well, { x: NaN, y: 0, z: 0 })).toThrow(/finite/);
  });

  it('rejects every overlap and duplicate ID independent of input order', () => {
    const near = wellSpec('well-b', { x: 99_999, y: 0, z: 0 });
    expect(() => createWellRegistry([well, near])).toThrow(/overlap/);
    expect(() => createWellRegistry([near, well])).toThrow(/overlap/);
    expect(() => validateWellSpecs([well, well])).toThrow(/duplicate/);
    const separated = wellSpec('well-b', { x: 0, y: 0, z: 101_000 });
    expect(() => validateWellSpecs([well, separated], 1000)).not.toThrow();
    expect(() => validateWellSpecs([well, separated], 1001)).toThrow(/gap/);
    expect(() => validateWellSpecs([well], -1)).toThrow(/minimumGap/);
  });

  it('matches the independent S5 off-axis projector vector', () => {
    const ref = vectors.well.projection;
    const got = evaluateWell(
      well,
      vec(ref.nominal_acceleration_m_s2),
      vec(ref.position_m),
      v3.ZERO,
    );
    closeVec(got.force, vec(ref.actual_acceleration_m_s2), 14);
    expect(v3.length(got.force)).toBeCloseTo(v3.length(vec(ref.nominal_acceleration_m_s2)), 14);
  });

  it('reverses only the radial component and preserves two independent tangents', () => {
    const p = { x: 6000, y: 8000, z: 24000 };
    const e = v3.normalize(p);
    const t1 = v3.normalize({ x: -4, y: 3, z: 0 });
    const t2 = v3.cross(e, t1);
    closeVec(evaluateWell(well, e, p, v3.ZERO).force, v3.neg(e), 14);
    for (const tangent of [t1, t2])
      closeVec(evaluateWell(well, tangent, p, v3.ZERO).force, tangent, 14);
    expect(evaluateWell(well, v3.ZERO, p, { x: 50, y: 20, z: -10 }).force).toBe(v3.ZERO);
    for (const radius of [40_000, 42_500, 45_000, 47_500, 50_000, 60_000]) {
      const r = evaluateWell(well, { x: 3, y: 5, z: -7 }, { x: radius, y: 0, z: 0 }, v3.ZERO);
      expect(v3.length(r.force)).toBeLessThanOrEqual(Math.sqrt(83) + 1e-12);
      expect(r.force.y).toBe(5);
      expect(r.force.z).toBe(-7);
    }
    expect(sampleWell(well, { x: 40e3, y: 0, z: 0 }).radialGain).toBe(-1);
    expect(sampleWell(well, { x: 45e3, y: 0, z: 0 }).radialGain).toBe(0);
    expect(sampleWell(well, { x: 50e3, y: 0, z: 0 }).radialGain).toBe(1);
    const outside = evaluateWell(well, force, { x: 50e3, y: 0, z: 0 }, v3.ZERO);
    expect(outside.force).toBe(force);
  });

  it('is covariant under a rigid 3D rotation and translation', () => {
    const q = quat.fromAxisAngle(v3.normalize({ x: 1, y: -2, z: 3 }), 1.23);
    const offset = { x: 80000, y: -26000, z: 17000 };
    const p = { x: 12000, y: 24000, z: 36000 };
    const f = { x: 1234, y: -5600, z: 7800 };
    const velocity = { x: 20, y: -9, z: 18 };
    const first = evaluateWell(well, f, p, velocity);
    const rotated = evaluateWell(
      wellSpec('rotated', offset),
      quat.rotate(q, f),
      v3.add(offset, quat.rotate(q, p)),
      quat.rotate(q, velocity),
    );
    closeVec(rotated.force, quat.rotate(q, first.force), 9);
    expect(rotated.fieldPower).toBeCloseTo(first.fieldPower, 7);
  });

  it('preserves nominal torque and reports the modified specific force in body axes', () => {
    const attitude = quat.multiply(quat.fromYaw(0.7), quat.fromAxisAngle(v3.UNIT_Y, -0.6));
    const position = { x: 6000, y: 8000, z: 24000 };
    const world = makeWorld({ position, attitude });
    const input = {
      actuators: actuators([thrust({ x: -7, y: 0.8, z: 0.4 }, { x: 2000, y: 0, z: 0 })]),
    };
    const ordinary = createSimulation(world, { dt: 0.01 });
    const altered = createSimulation(withWells(world), {
      dt: 0.01,
      registry: createWellRegistry([well]),
    });
    const a = ordinary.step(ordinary.initial, input).state;
    const b = altered.step(altered.initial, input).state;
    expect(b.world.ship.kinematics.attitude).toEqual(a.world.ship.kinematics.attitude);
    expect(b.world.ship.kinematics.angularVelocity).toEqual(
      a.world.ship.kinematics.angularVelocity,
    );
    const f = evaluateWell(
      well,
      quat.rotate(attitude, { x: 2000, y: 0, z: 0 }),
      position,
      v3.ZERO,
    ).force;
    closeVec(b.specificForce, quat.rotateInverse(attitude, v3.scale(f, 1 / 10000)), 5);
    closeVec(b.world.ship.kinematics.velocity, v3.scale(f, 0.01 / 10000), 8);
  });

  it('leaves balanced RCS couples and the full gravity coast unchanged', () => {
    const source = body('source', 1e10, 10, { x: 0, y: -2e6, z: 1e6 });
    const world = makeWorld({
      position: { x: -60e3, y: 8000, z: 6000 },
      velocity: { x: 200, y: 0, z: 0 },
      bodies: [source],
    });
    const ordinary = createSimulation(world, { dt: 1 });
    const altered = createSimulation(withWells(world), {
      dt: 1,
      registry: createWellRegistry([well]),
    });
    const couple = actuators([
      thrust({ x: 0, y: 2, z: 0 }, { x: 10, y: 0, z: 0 }, 'a'),
      thrust({ x: 0, y: -2, z: 0 }, { x: -10, y: 0, z: 0 }, 'b'),
    ]);
    for (const input of [undefined, () => ({ actuators: couple })]) {
      const a = ordinary.run(ordinary.initial, 600, { input }).state;
      const b = altered.run(altered.initial, 600, { input }).state;
      expect(b.world.ship).toEqual(a.world.ship);
      expect(b.specificForce).toEqual(a.specificForce);
      expect(b.world.ship.kinematics.velocity).not.toEqual(world.ship.kinematics.velocity);
    }
  });

  it('charges actual engine propellant, power and heat while a radial burn cancels', () => {
    const definition = loadShipDefinition();
    const systems = createShipSystemsState(definition, 'well-resource-check');
    const kinematics = makeWorld({ position: { x: 45000, y: 0, z: 0 } }).ship.kinematics;
    const ship = stepShipSystems(
      systems,
      definition,
      [{ kind: 'burn', thruster: 'main-engine', duration: 1, throttle: 1 }],
      {
        t: 0,
        kinematics,
        specificForce: v3.ZERO,
        targets: [],
        intensity: {},
        fieldSignals: {},
        sunlight: { direction: v3.UNIT_Z, irradiance: 0 },
      },
      1,
    );
    expect(ship.state.tanks['main-propellant']).toBeLessThan(systems.tanks['main-propellant']!);
    const world = { ...makeWorld(), ship: { kinematics, systems } };
    const ordinary = createSimulation(world, { dt: 1 });
    const altered = createSimulation(withWells(world), {
      dt: 1,
      registry: createWellRegistry([well]),
    });
    const input = { actuators: ship.actuators, systems: ship.state };
    const a = ordinary.step(ordinary.initial, input).state;
    const b = altered.step(altered.initial, input).state;
    expect(b.world.ship.systems).toEqual(a.world.ship.systems);
    expect(Math.abs(b.world.ship.kinematics.velocity.x)).toBeLessThan(
      Math.abs(a.world.ship.kinematics.velocity.x) / 100,
    );
    expect(b.world.ship.systems.thermal).not.toEqual(systems.thermal);
  });

  it('replays exactly through save/restore, batching and reordered separated fields', () => {
    const other = wellSpec('well-b', { x: 120e3, y: 0, z: 0 });
    const world = makeWorld({
      position: { x: 30e3, y: 6e3, z: 8e3 },
      velocity: { x: 50, y: 20, z: -2 },
    });
    const a = createSimulation(withWells(world, [well, other]), {
      dt: 1,
      registry: createWellRegistry([well, other]),
    });
    const b = createSimulation(withWells(world, [other, well]), {
      dt: 1,
      registry: createWellRegistry([other, well]),
    });
    const input = () => ({
      actuators: actuators([thrust({ x: -7, y: 0, z: 0 }, { x: 2000, y: 0, z: 0 })]),
    });
    const run = a.run(a.initial, 200, { input });
    const half = a.run(a.initial, 100, { input });
    const replay = a.run(JSON.parse(JSON.stringify(half.state)), 100, { input });
    let stepped = a.initial;
    for (let i = 0; i < 200; i++) stepped = a.step(stepped, input()).state;
    expect(replay.state).toEqual(run.state);
    expect(stepped).toEqual(run.state);
    expect(b.run(b.initial, 200, { input }).state.world.ship).toEqual(run.state.world.ship);
  });
});

describe('neutral A19 funnel geometry and spatial index', () => {
  const contains = (bounds: WellBounds, p: Vec3): boolean =>
    (['x', 'y', 'z'] as const).every(
      (axis) => bounds.min[axis] <= p[axis] && p[axis] <= bounds.max[axis],
    );

  // Independent face-plane intersection reference, not the tree's slab algorithm.
  function bruteSegment(bounds: WellBounds, from: Vec3, to: Vec3, padding: number): boolean {
    const p = { x: padding, y: padding, z: padding };
    const b = { min: v3.sub(bounds.min, p), max: v3.add(bounds.max, p) };
    if (contains(b, from) || contains(b, to)) return true;
    const d = v3.sub(to, from);
    for (const axis of ['x', 'y', 'z'] as const) {
      if (d[axis] === 0) continue;
      for (const face of [b.min[axis], b.max[axis]]) {
        const t = (face - from[axis]) / d[axis];
        if (t < 0 || t > 1) continue;
        const hit = { ...v3.addScaled(from, d, t), [axis]: face };
        if (contains(b, hit)) return true;
      }
    }
    return false;
  }

  it('offers bounded shape-independent response and smooth edge primitives without choosing a funnel law', () => {
    const rng = createRng('a19-response-primitives').stream('directions');
    for (let i = 0; i < 512; i++) {
      const e = v3.normalize({ x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1) });
      const force = { x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1) };
      const weight = rng.range(0, 1);
      const applied = applyRadialResponse(force, e, weight);
      expect(v3.length(applied)).toBeLessThanOrEqual(v3.length(force) + 1e-14);
      expect(v3.dot(applied, e)).toBeCloseTo((1 - 2 * weight) * v3.dot(force, e), 13);
      for (const tangent of [v3.anyPerpendicular(e), v3.cross(e, v3.anyPerpendicular(e))])
        closeVec(applyRadialResponse(tangent, e, weight), tangent, 13);
    }
    expect([-1, 0, 0.25, 0.5, 0.75, 1, 2].map(smoothWellWeight)).toEqual([
      1, 1, 0.896484375, 0.5, 0.103515625, 0, 0,
    ]);
    expect(() => applyRadialResponse(v3.UNIT_X, v3.ZERO, 1)).toThrow(/unit/);
    expect(() => applyRadialResponse(v3.UNIT_X, v3.UNIT_X, 2)).toThrow(/weight/);
    expect(() => applyRadialResponse({ x: NaN, y: 0, z: 0 }, v3.UNIT_X, 0)).toThrow(/finite/);
    expect(() => smoothWellWeight(NaN)).toThrow(/finite/);
    for (const edge of [Number.EPSILON, 1e-12, 1e-8, 1 - 1e-8, 1 - Number.EPSILON]) {
      const weight = smoothWellWeight(edge);
      expect(weight).toBeGreaterThanOrEqual(0);
      expect(weight).toBeLessThanOrEqual(1);
      expect(() => applyRadialResponse(v3.UNIT_X, v3.UNIT_X, weight)).not.toThrow();
    }
  });

  it('provides axial/radial coordinates without imposing a force or inside rule', () => {
    const geometry: FunnelGeometry = {
      mouth: { x: 10, y: 20, z: 30 },
      axis: v3.UNIT_Z,
      length: 1000,
      mouthRadius: 100,
      throatRadius: 5,
    };
    expect(funnelCoordinates(geometry, { x: 13, y: 24, z: 530 })).toEqual({
      axial: 500,
      axialFraction: 0.5,
      radial: { x: 3, y: 4, z: 0 },
      radialDistance: 5,
    });
    expect(funnelCoordinates(geometry, { x: 10, y: 20, z: 20 }).axialFraction).toBe(-0.01);
    const q = quat.fromAxisAngle(v3.normalize({ x: 1, y: -2, z: 3 }), 0.87);
    const rotated = {
      ...geometry,
      mouth: quat.rotate(q, geometry.mouth),
      axis: quat.rotate(q, geometry.axis),
    };
    const coordinates = funnelCoordinates(rotated, quat.rotate(q, { x: 13, y: 24, z: 530 }));
    expect(coordinates.axial).toBeCloseTo(500, 11);
    expect(coordinates.radialDistance).toBeCloseTo(5, 11);
    expect(v3.dot(coordinates.radial, rotated.axis)).toBeCloseTo(0, 11);
    expect(() => funnelCoordinates({ ...geometry, axis: v3.ZERO }, v3.ZERO)).toThrow(/unit/);
    expect(() => funnelBounds({ ...geometry, length: 0 })).toThrow(/length/);
    expect(() => funnelBounds({ ...geometry, throatRadius: -1 })).toThrow(/radii/);
  });

  it('conservatively encloses arbitrarily oriented linear and bounded sampled tapers', () => {
    const rng = createRng('a19-neutral-bounds').stream('geometry');
    for (let i = 0; i < 48; i++) {
      const axis = v3.normalize({ x: rng.range(-1, 1), y: rng.range(-1, 1), z: rng.range(-1, 1) });
      const geometry = {
        mouth: { x: rng.range(-1e6, 1e6), y: rng.range(-1e6, 1e6), z: rng.range(-1e6, 1e6) },
        axis,
        length: rng.range(20e3, 100e3),
        mouthRadius: rng.range(100, 1000),
        throatRadius: rng.range(1, 100),
      };
      const bounds = funnelBounds(geometry);
      const radialA = v3.anyPerpendicular(axis);
      const radialB = v3.cross(axis, radialA);
      const index = createWellSpatialIndex([{ id: 'envelope', bounds }]);
      for (const fraction of [0, 0.2, 0.5, 0.9, 1]) {
        for (let angle = 0; angle < 32; angle++) {
          const theta = (angle * 2 * Math.PI) / 32;
          // The larger radius everywhere is stricter than a linear taper.
          const radius = Math.max(geometry.mouthRadius, geometry.throatRadius);
          const point = v3.add(
            v3.addScaled(geometry.mouth, axis, geometry.length * fraction),
            v3.add(
              v3.scale(radialA, radius * Math.cos(theta)),
              v3.scale(radialB, radius * Math.sin(theta)),
            ),
          );
          expect(index.candidatesAt(point)).toEqual(['envelope']);
        }
      }
    }
  });

  it('matches brute-force point and padded segment queries and ignores input order', () => {
    const rng = createRng('a19-index-comparison').stream('geometry');
    const point = () => ({
      x: rng.range(-200e3, 200e3),
      y: rng.range(-200e3, 200e3),
      z: rng.range(-200e3, 200e3),
    });
    const entries = Array.from({ length: 384 }, (_, i) => ({
      id: `f-${String(i).padStart(4, '0')}`,
      bounds: funnelBounds({
        mouth: point(),
        axis: v3.normalize(point()),
        length: rng.range(10e3, 100e3),
        mouthRadius: rng.range(500, 5000),
        throatRadius: 100,
      }),
    }));
    const index = createWellSpatialIndex(entries);
    const replay = createWellSpatialIndex(JSON.parse(JSON.stringify([...entries].reverse())));
    expect(index.size).toBe(384);
    for (let i = 0; i < 2048; i++) {
      const p = i % 8 === 0 ? entries[i % entries.length]!.bounds.min : point();
      const expected = entries
        .filter((entry) => contains(entry.bounds, p))
        .map((entry) => entry.id);
      expect(index.candidatesAt(p)).toEqual(expected);
      expect(replay.candidatesAt(p)).toEqual(expected);
      if (i % 4 === 0) {
        const to = point();
        const padding = i % 16 === 0 ? 20 : 0;
        const swept = entries
          .filter((entry) => bruteSegment(entry.bounds, p, to, padding))
          .map((entry) => entry.id);
        expect(index.candidatesAlongSegment(p, to, padding)).toEqual(swept);
        expect(replay.candidatesAlongSegment(p, to, padding)).toEqual(swept);
      }
    }
  });

  it('handles boundaries, padded whole-hull broad phase and immutable index snapshots', () => {
    const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
    const entries = [{ id: 'box', bounds }];
    const index = createWellSpatialIndex(entries);
    bounds.max.x = 999;
    expect(index.candidatesAt({ x: 999, y: 0, z: 0 })).toEqual([]);
    expect(index.candidatesAlongSegment({ x: -1, y: 10, z: 10 }, { x: 11, y: 10, z: 10 })).toEqual([
      'box',
    ]);
    expect(index.candidatesAlongSegment({ x: -1, y: 11, z: 10 }, { x: 11, y: 11, z: 10 })).toEqual(
      [],
    );
    expect(
      index.candidatesAlongSegment({ x: -1, y: 11, z: 10 }, { x: 11, y: 11, z: 10 }, 1),
    ).toEqual(['box']);
    expect(index.candidatesAlongSegment(v3.ZERO, v3.ZERO)).toEqual(['box']);
    expect(
      index.candidatesInBounds({ min: { x: 10, y: 10, z: 10 }, max: { x: 20, y: 20, z: 20 } }),
    ).toEqual(['box']);
    expect(createWellSpatialIndex([]).candidatesAt(v3.ZERO)).toEqual([]);
    expect(() => createWellSpatialIndex([...entries, ...entries])).toThrow(/distinct/);
    expect(() =>
      createWellSpatialIndex([{ id: 'bad', bounds: { min: v3.UNIT_X, max: v3.ZERO } }]),
    ).toThrow(/ordered/);
    expect(() => index.candidatesAlongSegment(v3.ZERO, v3.ZERO, -1)).toThrow(/padding/);
    expect(() => index.candidatesAt({ x: NaN, y: 0, z: 0 })).toThrow(/finite/);
  });

  it('registers one indexed thrust dispatch for many sphere IDs and preserves direct factory results', () => {
    const fields = Array.from({ length: 128 }, (_, i) =>
      wellSpec(`sphere-${String(i).padStart(3, '0')}`, {
        x: (i % 16) * 110_000,
        y: Math.floor(i / 16) * 110_000,
        z: (i % 3) * 110_000,
      }),
    );
    const registry = createWellRegistry(fields);
    const registered = [...fields].reverse().map((spec) => registry.create(spec));
    const dispatchers = registered.filter((field) => field.modifyThrust);
    expect(dispatchers).toHaveLength(1);
    expect(dispatchers[0]!.id).toBe('sphere-000');
    expect(registered.map((field) => field.id)).toEqual(
      [...fields].reverse().map((field) => field.id),
    );
    const actual = dispatchers[0]!.modifyThrust!;
    for (let i = 0; i < fields.length; i++) {
      const spec = fields[i]!;
      const p = v3.add(readWellParameters(spec).center, { x: 6000, y: 8000, z: 24000 });
      const expected = wellFactory.create(spec).modifyThrust!(force, p, v3.ZERO, 0);
      expect(actual(force, p, v3.ZERO, 0)).toEqual(expected);
    }
    expect(actual(force, { x: -1e9, y: -1e9, z: -1e9 }, v3.ZERO, 0)).toBe(force);
    expect(() => registry.create(wellSpec(fields[0]!.id, { x: 1, y: 0, z: 0 }))).toThrow(
      /indexed registry/,
    );
    expect(() => registry.create(wellSpec('not-indexed', v3.ZERO))).toThrow(/indexed registry/);
    const simulation = createSimulation(
      withWells(makeWorld({ position: { x: 30e3, y: 0, z: 0 } }), fields),
      { dt: 1, registry },
    );
    expect(simulation.fields.filter((field) => field.modifyThrust)).toHaveLength(1);
  });
});

describe('well work and independent S5 powered crossing', () => {
  const ref = vectors.well.burn;
  const source = vec(ref.source_position_m);
  const potential = (p: Vec3): number =>
    (-ref.source_gm_m3_s2 * Math.sqrt(1e6)) / (1.5 * v3.distance(p, source) ** 1.5);
  const initial = ref.reference.initial;
  const rate = 24000 / (320 * 9.80665);
  function flight(dt: number) {
    const world = makeWorld({
      position: vec(initial.position_m),
      velocity: vec(initial.velocity_m_s),
      mp: massProps({ mass: initial.mass_kg }),
      bodies: [body('source', ref.source_gm_m3_s2, 1, source)],
    });
    const sim = createSimulation(withWells(world), { dt, registry: createWellRegistry([well]) });
    let state = sim.initial;
    let work = { nominalJ: 0, fieldJ: 0 };
    let transport = 0;
    const events: { surface: string; t: number }[] = [];
    for (let i = 0; i < Math.round(100 / dt); i++) {
      const before = state.world.ship.kinematics;
      const midMass = initial.mass_kg - (i + 0.5) * dt * rate;
      const next = sim.step(state, {
        actuators: actuators([thrust(v3.ZERO, force)], massProps({ mass: midMass })),
      }).state;
      const after = next.world.ship.kinematics;
      work = accumulateWellWork(
        work,
        evaluateWell(well, force, before.position, before.velocity),
        evaluateWell(well, force, after.position, after.velocity),
        dt,
      );
      transport -=
        rate *
        dt *
        0.5 *
        (0.5 * v3.lengthSq(before.velocity) +
          potential(before.position) +
          0.5 * v3.lengthSq(after.velocity) +
          potential(after.position));
      for (const event of segmentWellCrossings(well, before.position, after.position))
        events.push({ surface: event.surface, t: i * dt + event.fraction * dt });
      state = next;
    }
    const k = state.world.ship.kinematics;
    const mass = initial.mass_kg - 100 * rate;
    const finalEnergy = mass * (0.5 * v3.lengthSq(k.velocity) + potential(k.position));
    const initialEnergy =
      initial.mass_kg *
      (0.5 * v3.lengthSq(vec(initial.velocity_m_s)) + potential(vec(initial.position_m)));
    return {
      k,
      mass,
      work,
      events,
      residual: finalEnergy - initialEnergy - work.nominalJ - work.fieldJ - transport,
      positionError: v3.distance(k.position, vec(ref.reference.final.position_m)),
      velocityError: v3.distance(k.velocity, vec(ref.reference.final.velocity_m_s)),
    };
  }

  it('accounts for positive and negative field work without crediting a resource', () => {
    const p = { x: 30e3, y: 0, z: 0 };
    const inward = evaluateWell(well, force, p, { x: -100, y: 0, z: 0 });
    const outward = evaluateWell(well, force, p, { x: 100, y: 0, z: 0 });
    expect(inward.fieldPower).toBe(-4_800_000);
    expect(outward.fieldPower).toBe(4_800_000);
    expect(accumulateWellWork({ nominalJ: 10, fieldJ: 20 }, inward, outward, 1)).toEqual({
      nominalJ: 10,
      fieldJ: 20,
    });
    expect(() => accumulateWellWork({ nominalJ: 0, fieldJ: 0 }, inward, outward, -1)).toThrow();
  });

  it('converges at second order to independent Python RK4 positions and velocities', () => {
    const runs = [1, 0.5, 0.25].map(flight);
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i - 1]!.positionError / runs[i]!.positionError).toBeGreaterThan(3.9);
      expect(runs[i - 1]!.positionError / runs[i]!.positionError).toBeLessThan(4.1);
    }
    const fine = flight(1 / 64);
    expect(fine.positionError).toBeLessThan(0.01);
    expect(fine.velocityError).toBeLessThan(1e-5);
    expect(Math.abs(fine.mass - ref.reference.final.mass_kg)).toBeLessThan(1e-6);
    expect(Math.abs(fine.residual)).toBeLessThan(2);
    for (const expected of ref.reference.events) {
      const actual = fine.events.find((e) => e.surface === expected.surface)!;
      expect(Math.abs(actual.t - expected.t_s)).toBeLessThan(1e-4);
    }
    expect(Math.abs(fine.work.fieldJ - ref.reference.final.field_extra_work_J)).toBeLessThan(5);
  });
});

describe('committed S16 vectors through production simulation', () => {
  const centers = gardenVectors.layout.centers_m.map(vec);
  const fields = centers.map((center, i) => wellSpec(`s16-w${i + 1}`, center));
  const registry = createWellRegistry(fields, 10_000);
  type FlightVector = Pick<
    typeof gardenVectors.edge_band.reference,
    'initial' | 'commands' | 't_s'
  >;

  /**
   * Mechanics probe only: specified delivered inertial forces, identity attitude and no
   * actuator/sensor controller. Each powered interval uses fixed production Verlet steps.
   * Source-free coasts use one exact linear production step between command boundaries;
   * this is a test speed optimization, not a change to the game's fixed outer tick.
   */
  function flyReference(reference: FlightVector, poweredStep: number) {
    let world = withWells(
      makeWorld({
        position: vec(reference.initial.position_m),
        velocity: vec(reference.initial.velocity_m_s),
        mp: massProps({ mass: reference.initial.mass_kg }),
        bodies: centers.map((center, i) => body(`core-${i + 1}`, 0, 1000, center)),
      }),
      fields,
    );
    let mass = reference.initial.mass_kg;
    const clearance = centers.map(() => Infinity);
    const events: { well: number; surface: string; t_s: number; direction: string }[] = [];
    const cuts = [
      ...new Set([
        0,
        reference.t_s,
        ...reference.commands.flatMap((c) => [c.start_s, c.start_s + c.duration_s]),
      ]),
    ]
      .filter((t) => t <= reference.t_s)
      .sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) {
      const t0 = cuts[i - 1]!;
      const duration = cuts[i]! - t0;
      const force = reference.commands
        .filter((c) => c.start_s <= t0 && t0 < c.start_s + c.duration_s)
        .reduce((sum, c) => v3.add(sum, vec(c.force_N)), v3.ZERO);
      const powered = v3.lengthSq(force) > 0;
      const steps = powered ? Math.ceil(duration / poweredStep) : 1;
      const dt = duration / steps;
      const sim = createSimulation(world, { dt, registry });
      let state = sim.initial;
      const startMass = mass;
      const rate = v3.length(force) / (320 * 9.80665);
      for (let j = 0; j < steps; j++) {
        const before = state.world.ship.kinematics;
        const next = sim.step(
          state,
          powered
            ? {
                actuators: actuators(
                  [thrust(v3.ZERO, force)],
                  massProps({ mass: startMass - (j + 0.5) * dt * rate }),
                ),
              }
            : {},
        );
        expect(next.contacts.some((contact) => contact.impact)).toBe(false);
        const after = next.state.world.ship.kinematics;
        const delta = v3.sub(after.position, before.position);
        const lengthSquared = v3.lengthSq(delta);
        // Independent enclosing-sphere clearance, not merely the CoM or the test hull.
        // The acceleration bound makes powered chord clearance conservative. Long coasts
        // have zero curvature here; no unlocalized powered contact is certified by this.
        const curvatureBound = powered
          ? (gardenVectors.unavoidability.acceleration_bound_m_s2 * dt * dt) / 8
          : 0;
        centers.forEach((center, k) => {
          const u =
            lengthSquared === 0
              ? 0
              : Math.min(
                  1,
                  Math.max(0, v3.dot(v3.sub(center, before.position), delta) / lengthSquared),
                );
          clearance[k] = Math.min(
            clearance[k]!,
            v3.distance(center, v3.addScaled(before.position, delta, u)) -
              gardenVectors.layout.core_m -
              gardenVectors.layout.hull_bound_m -
              curvatureBound,
          );
          for (const event of segmentWellCrossings(fields[k]!, before.position, after.position))
            events.push({
              well: k + 1,
              surface: event.surface === 'zero-response' ? 'zero-gain' : event.surface,
              t_s: t0 + (j + event.fraction) * dt,
              direction: event.direction,
            });
        });
        state = next.state;
      }
      mass = startMass - duration * rate;
      world = state.world;
    }
    return {
      k: world.ship.kinematics,
      mass,
      clearance,
      events: events.sort((a, b) => a.t_s - b.t_s),
    };
  }

  it('matches S16 radial projection, both tangents and every selected smooth-edge sample', () => {
    const projection = gardenVectors.projection;
    const position = vec(projection.position_m);
    const result = evaluateWell(fields[0]!, vec(projection.nominal_force_N), position, v3.ZERO);
    expect(v3.distance(result.force, vec(projection.modified_force_N))).toBeLessThan(
      gardenVectors.port_tolerances.force_N,
    );
    const radial = v3.normalize(position);
    const tangentA = v3.normalize(v3.cross(radial, v3.UNIT_X));
    const tangentB = v3.cross(radial, tangentA);
    for (const tangent of [tangentA, tangentB])
      expect(
        v3.distance(evaluateWell(fields[0]!, tangent, position, v3.ZERO).force, tangent),
      ).toBeLessThan(1e-14);
    for (const shell of projection.shells) {
      const sample = sampleWell(fields[0]!, { x: shell.radius_m, y: 0, z: 0 });
      expect(sample.weight).toBeCloseTo(shell.weight, 14);
      expect(sample.radialGain).toBeCloseTo(shell.radial_gain, 14);
    }
  });

  it('matches the independent source-free edge burn and converges with powered step size', () => {
    const reference = gardenVectors.edge_band.reference;
    const tolerance = gardenVectors.edge_band.port_tolerances;
    const runs = [0.5, 0.25, 1 / 64].map((dt) => flyReference(reference, dt));
    const errors = runs.map((run) => v3.distance(run.k.position, vec(reference.final.position_m)));
    expect(errors[0]! / errors[1]!).toBeGreaterThan(3.9);
    expect(errors[0]! / errors[1]!).toBeLessThan(4.1);
    const fine = runs[2]!;
    expect(errors[2]).toBeLessThan(tolerance.position_m);
    expect(v3.distance(fine.k.velocity, vec(reference.final.velocity_m_s))).toBeLessThan(
      tolerance.velocity_m_s,
    );
    expect(Math.abs(fine.mass - reference.final.mass_kg)).toBeLessThan(tolerance.mass_kg);
    expect(fine.events).toHaveLength(reference.events.length);
    reference.events.forEach((expected, i) => {
      const actual = fine.events[i]!;
      expect({ well: actual.well, surface: actual.surface, direction: actual.direction }).toEqual({
        well: expected.well,
        surface: expected.surface,
        direction: expected.direction,
      });
      expect(Math.abs(actual.t_s - expected.t_s)).toBeLessThan(tolerance.event_time_s);
    });
    expect(Math.min(...fine.clearance)).toBeGreaterThan(37_900);
  });

  for (const reference of gardenVectors.informed_crossings) {
    const direction = reference.commands[0]!.force_N[2]! > 0 ? '+z' : '-z';
    it(`reproduces the informed ${direction} finite-burn route, swept clearance and coast events`, () => {
      const result = flyReference(reference, 1 / 32);
      const tolerance = gardenVectors.port_tolerances;
      expect(v3.distance(result.k.position, vec(reference.final.position_m))).toBeLessThan(
        tolerance.route_position_m,
      );
      expect(v3.distance(result.k.velocity, vec(reference.final.velocity_m_s))).toBeLessThan(
        tolerance.route_velocity_m_s,
      );
      expect(Math.abs(result.mass - reference.final.mass_kg)).toBeLessThan(tolerance.mass_kg);
      const exitCorrection =
        (gardenVectors.layout.exit.x_m - result.k.position.x) / result.k.velocity.x;
      expect(Math.abs(exitCorrection)).toBeLessThan(tolerance.coast_event_time_s);
      expect(Math.hypot(result.k.position.y, result.k.position.z)).toBeLessThan(
        gardenVectors.layout.exit.disc_radius_m,
      );
      expect(Math.min(...result.clearance)).toBeGreaterThan(4000);
      result.clearance.forEach((actual, i) =>
        expect(Math.abs(actual - reference.minimum_core_clearance_m[i]!)).toBeLessThan(0.1),
      );
      expect(result.events).toHaveLength(reference.events.length);
      reference.events.forEach((expected, i) => {
        const actual = result.events[i]!;
        expect({ well: actual.well, surface: actual.surface, direction: actual.direction }).toEqual(
          {
            well: expected.well,
            surface: expected.surface,
            direction: expected.direction,
          },
        );
        expect(Math.abs(actual.t_s - expected.t_s)).toBeLessThan(tolerance.coast_event_time_s);
      });
      expect([
        ...new Set(
          result.events.filter((event) => event.surface === 'outer').map((event) => event.well),
        ),
      ]).toEqual(reference.influences_met);
    });
  }
});

describe('S22 prototype funnels: pull, response and terminal geometry', () => {
  const funnel = funnelSpec('funnel-0', v3.ZERO, v3.UNIT_X);
  const tolerance = funnelVectors.port_tolerances;

  it('uses an explicit version, copies activation, rejects malformed profiles and all-reserved overlap', () => {
    const parsed = readFunnelParameters(funnel);
    expect(parsed.profile).toBe('s22-funnel-v1');
    expect(parsed.activation).toEqual({ phase: 'initial' });
    expect(() => readFunnelParameters(well)).toThrow(/profile/);
    expect(() => funnelSpec('bad', v3.ZERO, { x: 2, y: 0, z: 0 })).toThrow(/unit/);
    const params = funnel.params as Record<string, unknown>;
    expect(() =>
      readFunnelParameters({
        ...funnel,
        params: { ...params, capLength: 0 } as FieldInstanceSpec['params'],
      }),
    ).toThrow(/dimensions/);
    const pending = funnelSpec('pending', { x: 1000, y: 0, z: 0 }, v3.UNIT_X, { phase: 'pending' });
    expect(() => validateWellSpecs([funnel, pending])).toThrow(/overlap/);
    expect(() =>
      funnelSpec('bad', v3.ZERO, v3.UNIT_X, { phase: 'active', activeSince: Infinity }),
    ).toThrow(/finite/);
  });

  it('matches independent axial projection, transverse preservation, rear pull and half-weight edge', () => {
    const ref = funnelVectors.projection;
    const result = evaluateFunnel(
      funnel,
      vec(ref.nominal_force_N),
      vec(ref.position_m),
      v3.ZERO,
      30374,
      0,
    );
    expect(v3.distance(result.force, vec(ref.modified_force_N))).toBeLessThan(tolerance.force_N);
    expect(v3.distance(result.pull, vec(ref.pull_m_s2))).toBeLessThan(tolerance.acceleration_m_s2);
    closeVec(v3.scale(result.force, 1 / 30374), vec(ref.accelerometer_inertial_m_s2), 12);
    const edge = evaluateFunnel(
      funnel,
      vec(ref.nominal_force_N),
      vec(ref.edge_midpoint_position_m),
      v3.ZERO,
      30374,
      0,
    );
    expect(edge.weight).toBeCloseTo(ref.edge_weight, 14);
    expect(edge.force.x).toBeCloseTo(0, 10);
    expect(edge.force.y).toBe(4000);
    expect(edge.force.z).toBe(-6000);
    expect(edge.pull.x).toBeGreaterThan(0);
    closeVec(
      sampleFunnel(funnel, vec(ref.rear_cap.position_m), 0).pull,
      vec(ref.rear_cap.pull_m_s2),
      12,
    );
    for (const position of [
      { x: 0, y: 0, z: 0 },
      { x: 125000, y: 0, z: 0 },
      { x: 60000, y: 20000, z: 0 },
    ])
      expect(sampleFunnel(funnel, position, 0).weight).toBe(0);
    const rear = { x: 123000, y: 0, z: 0 };
    expect(
      createWellSpatialIndex([{ id: 'support', bounds: funnelSupportBounds(funnel) }]).candidatesAt(
        rear,
      ),
    ).toEqual(['support']);
    const field = createWellRegistry([funnel]).create(funnel);
    closeVec(field.acceleration!(rear, 0), vec(ref.rear_cap.pull_m_s2), 12);
    for (const tangent of [v3.UNIT_Y, v3.UNIT_Z])
      expect(
        evaluateFunnel(funnel, tangent, vec(ref.edge_midpoint_position_m), v3.ZERO, 1, 0).force,
      ).toEqual(tangent);
  });

  it('rotates the whole directional field and keeps nominal torque and IMU semantics', () => {
    const q = quat.fromAxisAngle(v3.normalize({ x: 1, y: 2, z: -3 }), 1.2);
    const offset = { x: 8000, y: -17000, z: 23000 };
    const rotated = funnelSpec('rotated', offset, quat.rotate(q, v3.UNIT_X));
    const p = { x: 40000, y: 1000, z: 500 };
    const f = { x: -24000, y: 4000, z: -6000 };
    const a = evaluateFunnel(funnel, f, p, { x: 20, y: 2, z: 3 }, 30374, 0);
    const b = evaluateFunnel(
      rotated,
      quat.rotate(q, f),
      v3.add(offset, quat.rotate(q, p)),
      quat.rotate(q, { x: 20, y: 2, z: 3 }),
      30374,
      0,
    );
    closeVec(b.force, quat.rotate(q, a.force), 8);
    closeVec(b.pull, quat.rotate(q, a.pull), 12);
    expect(b.pullPower).toBeCloseTo(a.pullPower, 8);
    const world = makeWorld({
      position: p,
      attitude: q,
      asteroids: [asteroid('dust', { x: 41000, y: 1200, z: 800 }, v3.ZERO, 1)],
    });
    const actual = createSimulation(withWells(world, [funnel]), {
      dt: 0.01,
      registry: createWellRegistry([funnel]),
    });
    const coast = actual.step(actual.initial).state;
    expect(coast.specificForce).toEqual(v3.ZERO);
    expect(coast.world.ship.kinematics.velocity.x).toBeGreaterThan(0);
    expect(coast.world.asteroids[0]!.velocity.x).toBeGreaterThan(0);
    const nominal = createSimulation(world, { dt: 0.01 });
    const input = {
      actuators: actuators([thrust({ x: -7, y: 0.7, z: 0.5 }, { x: 2000, y: 0, z: 0 })]),
    };
    const n = nominal.step(nominal.initial, input).state;
    const w = actual.step(actual.initial, input).state;
    expect(w.world.ship.kinematics.attitude).toEqual(n.world.ship.kinematics.attitude);
    expect(w.world.ship.kinematics.angularVelocity).toEqual(
      n.world.ship.kinematics.angularVelocity,
    );
    const expectedSpecific = quat.rotateInverse(
      q,
      v3.scale(
        applyRadialResponse(quat.rotate(q, { x: 2000, y: 0, z: 0 }), v3.UNIT_X, 1),
        1 / 10000,
      ),
    );
    closeVec(w.specificForce, expectedSpecific, 5);
    const couple = actuators([
      thrust({ x: 0, y: 2, z: 0 }, { x: 10, y: 0, z: 0 }),
      thrust({ x: 0, y: -2, z: 0 }, { x: -10, y: 0, z: 0 }),
    ]);
    expect(actual.step(actual.initial, { actuators: couple }).state.specificForce).toEqual(v3.ZERO);
  });

  it('matches birth ramp and guard vectors without scheduling, retrying or mutating a phase', () => {
    const ref = funnelVectors.popup;
    const axis = vec(ref.funnel.axis);
    const center = vec(ref.funnel.center);
    const mouth = v3.addScaled(center, axis, -62500);
    const active = funnelSpec('popup', mouth, axis, {
      phase: 'active',
      activeSince: ref.scheduled_on_s,
    });
    const p = v3.addScaled(mouth, axis, 40000);
    for (const sample of ref.samples)
      expect(sampleFunnel(active, p, sample.t_s).activationGain).toBeCloseTo(sample.force_gain, 13);
    expect(
      funnelBirthGuard(
        active,
        vec(ref.outside_state.position_m),
        vec(ref.outside_state.velocity_m_s),
        20,
      ),
    ).toBeCloseTo(ref.outside_guard_m, 7);
    expect(
      funnelBirthGuardCenter(
        center,
        vec(ref.fast_state.position_m),
        vec(ref.fast_state.velocity_m_s),
        20,
      ),
    ).toBeLessThan(0);
    expect(
      funnelBirthGuardCenter(
        center,
        vec(ref.inside_state.position_m),
        vec(ref.inside_state.velocity_m_s),
        20,
      ),
    ).toBeLessThan(0);
    for (const phase of ['pending', 'cancelled'] as const) {
      const off = funnelSpec('off', mouth, axis, { phase });
      expect(sampleFunnel(off, p, 100000).weight).toBe(0);
      expect(funnelCrushPoint(off, v3.addScaled(mouth, axis, 120000), 100000).contact).toBe(false);
    }
    expect(sampleFunnel(active, p, 0).weight).toBe(0);
    expect(sampleFunnel(JSON.parse(JSON.stringify(active)), p, 1260)).toEqual(
      sampleFunnel(active, p, 1260),
    );
  });

  it('separates bounded force continuation from point and swept absorbing-throat contact', () => {
    const throat = { x: 120000, y: 0, z: 0 };
    expect(sampleFunnel(funnel, throat, 0).terminal).toBe(true);
    expect(v3.isFinite3(evaluateFunnel(funnel, force, throat, v3.ZERO, 30000, 0).force)).toBe(true);
    expect(funnelCrushPoint(funnel, { x: 118980, y: 0, z: 0 }, 0, 20).contact).toBe(true);
    expect(funnelCrushPoint(funnel, { x: 118979, y: 0, z: 0 }, 0, 20).contact).toBe(false);
    const from = { x: 118000, y: 0, z: 0 },
      to = { x: 122000, y: 0, z: 0 };
    const crossing = funnelCrushSegment(funnel, from, to, 0, 1, 20);
    expect(crossing.firstContactFraction).toBeCloseTo(980 / 4000, 14);
    expect(crossing.clearance).toBe(-1020);
    expect(
      funnelCrushSegment(
        funnel,
        { x: 118000, y: 1020, z: 0 },
        { x: 122000, y: 1020, z: 0 },
        0,
        1,
        20,
      ).firstContactFraction,
    ).toBe(0.5);
    const born = funnelSpec('born', v3.ZERO, v3.UNIT_X, { phase: 'active', activeSince: 0.6 });
    expect(sampleFunnel(born, throat, 0.6).weight).toBe(0);
    expect(sampleFunnel(born, throat, 0.6).terminal).toBe(true);
    expect(funnelCrushSegment(born, from, to, 0, 1, 20).firstContactFraction).toBe(0.6);
    const late = funnelSpec('late', v3.ZERO, v3.UNIT_X, { phase: 'active', activeSince: 0.9 });
    expect(funnelCrushSegment(late, from, to, 0, 1, 20).contact).toBe(false);
    const index = createFunnelCrushIndex([funnel]);
    expect(
      index.candidatesAlongSegment({ x: 118000, y: 1010, z: 0 }, { x: 122000, y: 1010, z: 0 }),
    ).toEqual([]);
    expect(
      index.candidatesAlongSegment({ x: 118000, y: 1010, z: 0 }, { x: 122000, y: 1010, z: 0 }, 20),
    ).toEqual(['funnel-0']);
  });

  it('indexes all 2601 reserved funnels with one pull/thrust dispatcher and matches committed kernel vectors', () => {
    const fields = funnelVectors.nominalField.funnels.map((f) =>
      funnelSpec(
        `funnel-${f.id}`,
        v3.addScaled(vec(f.center), vec(f.axis), -62500),
        vec(f.axis),
        f.on === 0 ? { phase: 'initial' } : { phase: 'active', activeSince: f.on },
      ),
    );
    const registry = createWellRegistry(fields);
    const instances = fields.map((spec) => registry.create(spec));
    expect(instances.filter((f) => f.modifyThrust)).toHaveLength(1);
    expect(instances.filter((f) => f.acceleration)).toHaveLength(1);
    const dispatch = instances.find((f) => f.modifyThrust)!;
    for (const query of funnelVectors.kernel_queries) {
      expect(
        v3.distance(
          dispatch.modifyThrust!(vec(query.force_N), vec(query.position_m), v3.ZERO, query.t_s),
          vec(query.modified_force_N),
        ),
      ).toBeLessThan(tolerance.force_N);
      expect(
        v3.distance(dispatch.acceleration!(vec(query.position_m), query.t_s), vec(query.pull_m_s2)),
      ).toBeLessThan(tolerance.acceleration_m_s2);
    }
    const reversed = createWellRegistry([...fields].reverse());
    const leader = reversed.create(fields[0]!);
    const point = { x: 40000, y: 0, z: 0 };
    expect(leader.acceleration!(point, 5000)).toEqual(dispatch.acceleration!(point, 5000));
  });

  type Reference = {
    initial: { position_m: number[]; velocity_m_s: number[]; mass_kg: number };
    commands: { start_s: number; duration_s: number; force_N: number[] }[];
    t_s: number;
  };
  function flight(reference: Reference, dt: number) {
    let world = withWells(
      makeWorld({
        position: vec(reference.initial.position_m),
        velocity: vec(reference.initial.velocity_m_s),
        mp: massProps({ mass: reference.initial.mass_kg }),
      }),
      [funnel],
    );
    let mass = reference.initial.mass_kg;
    let work = { nominalJ: 0, fieldJ: 0, pullJ: 0 };
    let massEnergy = 0;
    let firstCrush: number | undefined;
    let minimumClearance = Infinity;
    const cuts = [
      ...new Set([
        0,
        reference.t_s,
        ...reference.commands.flatMap((c) => [c.start_s, c.start_s + c.duration_s]),
      ]),
    ]
      .filter((t) => t <= reference.t_s)
      .sort((a, b) => a - b);
    for (let k = 1; k < cuts.length; k++) {
      const begin = cuts[k - 1]!,
        span = cuts[k]! - begin;
      const steps = Math.ceil(span / dt),
        h = span / steps;
      const f = reference.commands
        .filter((c) => c.start_s <= begin && begin < c.start_s + c.duration_s)
        .reduce((sum, c) => v3.add(sum, vec(c.force_N)), v3.ZERO);
      const rate = v3.length(f) / (320 * 9.80665);
      const sim = createSimulation(world, { dt: h, registry: createWellRegistry([funnel]) });
      let state = sim.initial;
      const initialMass = mass;
      for (let i = 0; i < steps; i++) {
        const t = begin + i * h,
          before = state.world.ship.kinematics;
        const beforeMass = initialMass - i * h * rate,
          afterMass = initialMass - (i + 1) * h * rate;
        const result = sim.step(state, {
          actuators: actuators(
            [thrust(v3.ZERO, f)],
            massProps({ mass: (beforeMass + afterMass) / 2 }),
          ),
        });
        const after = result.state.world.ship.kinematics;
        work = accumulateFunnelWork(
          work,
          evaluateFunnel(funnel, f, before.position, before.velocity, beforeMass, t),
          evaluateFunnel(funnel, f, after.position, after.velocity, afterMass, t + h),
          h,
        );
        massEnergy -=
          rate * h * 0.25 * (v3.lengthSq(before.velocity) + v3.lengthSq(after.velocity));
        const contact = funnelCrushSegment(funnel, before.position, after.position, t, t + h, 20);
        minimumClearance = Math.min(minimumClearance, contact.clearance! - (1.434 * h * h) / 8);
        if (contact.firstContactFraction !== undefined && firstCrush === undefined)
          firstCrush = t + h * contact.firstContactFraction;
        state = result.state;
      }
      mass = initialMass - span * rate;
      world = state.world;
    }
    const kin = world.ship.kinematics;
    const energyChange =
      0.5 * mass * v3.lengthSq(kin.velocity) -
      0.5 * reference.initial.mass_kg * v3.lengthSq(vec(reference.initial.velocity_m_s));
    return {
      kin,
      mass,
      firstCrush,
      minimumClearance,
      work,
      residual: energyChange - work.nominalJ - work.fieldJ - work.pullJ - massEnergy,
    };
  }

  it('matches independent edge convergence and closes pull/reversal/expelled-mass work without resource credits', () => {
    const ref = funnelVectors.edge_convergence.reference;
    const coarse = flight(ref, 1),
      half = flight(ref, 0.5),
      fine = flight(ref, 1 / 64);
    const error = (r: ReturnType<typeof flight>) =>
      v3.distance(r.kin.position, vec(ref.final.position_m));
    expect(error(coarse) / error(half)).toBeGreaterThan(3.8);
    expect(error(coarse) / error(half)).toBeLessThan(4.2);
    expect(error(fine)).toBeLessThan(tolerance.position_m);
    expect(v3.distance(fine.kin.velocity, vec(ref.final.velocity_m_s))).toBeLessThan(
      tolerance.velocity_m_s,
    );
    expect(Math.abs(fine.mass - ref.final.mass_kg)).toBeLessThan(tolerance.mass_kg);
    expect(fine.work.pullJ).toBeGreaterThan(0);
    expect(fine.work.fieldJ).toBeLessThan(0);
    expect(Math.abs(fine.residual)).toBeLessThan(2);
  });

  for (const [name, ref] of [
    ['coast toward crush', funnelVectors.coast_pulled_to_crush],
    ['instinctive outward burn', funnelVectors.instinctive_burn.actual],
    ['negative transverse escape', funnelVectors.sideways_escapes[0]!],
    ['positive transverse escape', funnelVectors.sideways_escapes[1]!],
    ['delayed recovery', funnelVectors.instinctive_burn.rescue],
  ] as const) {
    it(`reproduces ${name} using production translation at 0.25 s, not an attitude-controller certificate`, () => {
      const result = flight(ref, 0.25);
      expect(v3.distance(result.kin.position, vec(ref.final.position_m))).toBeLessThan(
        tolerance.position_m,
      );
      expect(v3.distance(result.kin.velocity, vec(ref.final.velocity_m_s))).toBeLessThan(
        tolerance.velocity_m_s,
      );
      expect(Math.abs(result.mass - ref.final.mass_kg)).toBeLessThan(tolerance.mass_kg);
      if (ref.outcome === 'crush') {
        expect(result.firstCrush).toBeDefined();
        expect(Math.abs(result.firstCrush! - ref.t_s)).toBeLessThan(tolerance.crush_time_s);
      } else {
        expect(result.firstCrush).toBeUndefined();
        expect(result.minimumClearance).toBeGreaterThan(15_000);
      }
    });
  }
});

describe('boundary geometry and explicit core domain', () => {
  it('finds both crossings when endpoints are outside and assigns shared endpoints once', () => {
    const ref = vectors.well.hard_boundary_diagnostic;
    const crossings = segmentWellCrossings(well, vec(ref.start_m), vec(ref.end_m));
    const outer = crossings.filter((e) => e.surface === 'outer');
    expect(outer.map((e) => e.direction)).toEqual(['inbound', 'outbound']);
    expect(outer[0]!.fraction).toBeCloseTo(ref.event_times_s[0]!, 14);
    expect(outer[1]!.fraction).toBeCloseTo(ref.event_times_s[1]!, 14);
    expect(
      segmentWellCrossings(well, { x: 60e3, y: 0, z: 0 }, { x: 50e3, y: 0, z: 0 }).filter(
        (e) => e.surface === 'outer',
      ),
    ).toHaveLength(1);
    expect(
      segmentWellCrossings(well, { x: 50e3, y: 0, z: 0 }, { x: 49e3, y: 0, z: 0 }).filter(
        (e) => e.surface === 'outer',
      ),
    ).toHaveLength(0);
    expect(
      segmentWellCrossings(well, { x: -100, y: 50e3, z: 0 }, { x: 100, y: 50e3, z: 0 }),
    ).toEqual([{ field: 'well-a', surface: 'outer', fraction: 0.5, direction: 'touch' }]);
  });

  it('a physical core stops an engine-off sweep before the ship tunnels through', () => {
    const world = withWells(
      makeWorld({
        position: { x: -2000, y: 0, z: 0 },
        velocity: { x: 4000, y: 0, z: 0 },
        asteroids: [asteroid('core', v3.ZERO, v3.ZERO, 1000)],
      }),
    );
    const sim = createSimulation(world, { dt: 1, registry: createWellRegistry([well]) });
    const result = sim.step(sim.initial);
    expect(result.contacts.some((c) => c.impact && c.with === 'core')).toBe(true);
    expect(v3.length(result.state.world.ship.kinematics.position)).toBeGreaterThan(1000);
  });

  it('fails explicitly if retained sim asks for powered response inside the core before contact', () => {
    // Integration request: end-force currently precedes swept contact resolution in the sim.
    const world = withWells(
      makeWorld({
        position: { x: -2000, y: 0, z: 0 },
        velocity: { x: 1500, y: 0, z: 0 },
        asteroids: [asteroid('core', v3.ZERO, v3.ZERO, 1000)],
      }),
    );
    const sim = createSimulation(world, { dt: 1, registry: createWellRegistry([well]) });
    expect(() =>
      sim.step(sim.initial, { actuators: actuators([thrust(v3.ZERO, { x: 100, y: 0, z: 0 })]) }),
    ).toThrow(/excluded well core/);
  });
});
