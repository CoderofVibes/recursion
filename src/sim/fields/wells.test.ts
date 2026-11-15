import { describe, expect, it } from 'vitest';
import vectors from '../../../tools/studies/s5/vectors.json';
import type { FieldInstanceSpec, TruthWorld } from '../../contracts/truth/index.ts';
import * as quat from '../../lib/quat.ts';
import * as v3 from '../../lib/vec3.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { createShipSystemsState, loadShipDefinition, stepShipSystems } from '../../ship/index.ts';
import { createSimulation } from '../simulation.ts';
import { actuators, asteroid, body, makeWorld, massProps, thrust } from '../test-helpers.ts';
import {
  accumulateWellWork,
  createWellRegistry,
  DEFAULT_WELL_PROFILE,
  evaluateWell,
  readWellParameters,
  sampleWell,
  segmentWellCrossings,
  validateWellSpecs,
  wellFactory,
  wellSpec,
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
