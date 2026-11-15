import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type { Command } from '../../contracts/commands.ts';
import type { EquipmentState, ShipSystemsState } from '../../contracts/truth/ship.ts';
import { cross, sub, type Vec3 } from '../../lib/vec3.ts';
import { applyCommands } from '../commands.ts';
import { loadShipDefinition } from '../definition.ts';
import { computeMassProperties } from '../massprops/massprops.ts';
import { createShipSystemsState } from '../state.ts';
import { environment } from '../test-helpers.ts';
import { stepShipSystems } from '../index.ts';
import { preparePropulsion, stepPropulsion, tiltDirection } from './propulsion.ts';

const definition = loadShipDefinition();
const main = baseline.propulsion.main;
const env = environment(createShipSystemsState(definition));

/** A ship with the main engine burning and powered, as the power step would leave it. */
function burning(
  values: Record<string, number> = {},
  tanks: Record<string, number> = {},
): ShipSystemsState {
  const initial = createShipSystemsState(definition);
  const engine = initial.equipment['main-engine']!;
  const state: ShipSystemsState = {
    ...initial,
    tanks: { ...initial.tanks, ...tanks },
    burns: [{ thruster: 'main-engine', throttle: 1, until: 1000 }],
    equipment: {
      ...initial.equipment,
      'main-engine': {
        ...engine,
        mode: 'firing',
        powerDraw: 180,
        values: { ...engine.values, ...values },
      },
    },
  };
  return { ...state, massProperties: computeMassProperties(state, definition) };
}
/** Run the burn for `seconds` in steps of `dt`; returns the last step. */
function run(start: ShipSystemsState, seconds: number, dt = 1) {
  let state = start;
  let result = stepPropulsion(state, definition, env, dt);
  for (let t = dt; t < seconds - 1e-9; t += dt) {
    state = { ...result.state, t: state.t + dt };
    result = stepPropulsion(state, definition, env, dt);
  }
  return result;
}
/** Torque of the engine's thrust about the centre of mass the step started with. */
const torqueAbout = (state: ShipSystemsState, point: Vec3, force: Vec3): Vec3 =>
  cross(sub(point, computeMassProperties(state, definition).centerOfMass), force);
const norm = (v: Vec3) => Math.hypot(v.x, v.y, v.z);

describe('main engine: two-axis gimbal and mount (C02)', () => {
  it('tilts a thrust direction about +z (yaw) and about −y (pitch)', () => {
    const x = { x: 1, y: 0, z: 0 };
    // Yaw tilts a forward thrust toward +y; with no pitch it is the planar rotation exactly.
    expect(tiltDirection(x, 0.2, 0)).toEqual({ x: Math.cos(0.2), y: Math.sin(0.2), z: 0 });
    // Pitch tilts it toward +z.
    const pitched = tiltDirection(x, 0, 0.1);
    expect(pitched.x).toBeCloseTo(Math.cos(0.1), 15);
    expect(pitched.y).toBe(0);
    expect(pitched.z).toBeCloseTo(Math.sin(0.1), 15);
    // Both: azimuth 0.2 and elevation 0.1 of the thrust.
    const both = tiltDirection(x, 0.2, 0.1);
    expect(Math.atan2(both.y, both.x)).toBeCloseTo(0.2, 14);
    expect(Math.asin(both.z)).toBeCloseTo(0.1, 14);
    expect(norm(both)).toBeCloseTo(1, 14);
    // A vertical jet is not moved by a yaw error.
    expect(tiltDirection({ x: 0, y: 0, z: 1 }, 0.3, 0)).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('aims the thrust line through a centre of mass that is off the axis in y and in z', () => {
    const state = burning();
    const com = state.massProperties.centerOfMass;
    // The engine sits at (−7, 0.08, 0); the centre of mass is 2 mm left of the axis and 105 mm
    // below it, so the thrust must point 11.7 mrad to the right and 15.7 mrad down.
    expect(com.y).toBeCloseTo(0.0021, 4);
    expect(com.z).toBeCloseTo(-0.1047, 4);
    const result = run(state, 3);
    const thrust = result.thrusts[0]!;
    expect(thrust.point).toEqual({ x: -7, y: 0.08, z: 0 });
    const values = result.state.equipment['main-engine']!.values;
    const dx = com.x + 7;
    // (The centre of mass moves a few tenths of a millimetre as the burn drains the tank.)
    expect(values.gimbal).toBeCloseTo(Math.atan2(com.y - 0.08, dx) - main.mountMisalignment, 4);
    expect(values.gimbalPitch).toBeCloseTo(Math.atan2(com.z, Math.hypot(dx, com.y - 0.08)), 4);
    expect(values.gimbalPitch).toBeLessThan(-0.015);
    // No torque about the centre of mass (to the few N·m the moving propellant leaves), where
    // an ungimballed 24 kN engine would give 24 kN × 0.13 m ≈ 3 kN·m.
    expect(norm(thrust.force)).toBeCloseTo(24000, 6);
    expect(
      norm(torqueAbout({ ...result.state, tanks: state.tanks }, thrust.point, thrust.force)),
    ).toBeLessThan(40);
    expect(thrust.force.z / norm(thrust.force)).toBeCloseTo(com.z / Math.hypot(dx, com.z), 3);
  });

  it('takes out a mount error about either axis, up to the gimbal limit', () => {
    // The hidden mount errors (thruster.main-engine.misalignment and .misalignment-pitch reach
    // the ship as these values) are cancelled by the gimbal while it has travel.
    for (const [misalignment, misalignmentPitch] of [
      [0.012, 0],
      [0, 0.012],
      [-0.01, 0.015],
    ] as const) {
      const state = burning({ misalignment, misalignmentPitch });
      const result = run(state, 5);
      const thrust = result.thrusts[0]!;
      const values = result.state.equipment['main-engine']!.values;
      expect(Math.abs(values.gimbal!)).toBeLessThanOrEqual(main.gimbalLimit);
      expect(Math.abs(values.gimbalPitch!)).toBeLessThanOrEqual(main.gimbalLimit);
      expect(
        norm(torqueAbout({ ...result.state, tanks: state.tanks }, thrust.point, thrust.force)),
      ).toBeLessThan(60);
    }
    // A pitch mount error tilts the thrust toward +z when the gimbal cannot follow: with the
    // gimbal on its stop the leftover shows as torque about body y.
    const beyond = burning({ misalignmentPitch: 0.08 });
    const stuck = run(beyond, 6);
    const values = stuck.state.equipment['main-engine']!.values;
    expect(values.gimbalPitch).toBe(-main.gimbalLimit);
    const force = stuck.thrusts[0]!.force;
    expect(Math.asin(force.z / norm(force))).toBeCloseTo(0.08 - main.gimbalLimit, 10);
    const torque = torqueAbout(
      { ...stuck.state, tanks: beyond.tanks },
      stuck.thrusts[0]!.point,
      force,
    );
    // Thrust tilted up, acting 6.7 m aft of the centre of mass: nose down (+y torque).
    expect(torque.y).toBeGreaterThan(5000);
  });

  it('moves each gimbal axis no faster than its rate', () => {
    const state = burning({ misalignment: 0.2, misalignmentPitch: -0.2 });
    let previous = { gimbal: 0, gimbalPitch: 0 };
    let current = state;
    for (let step = 0; step < 30; step++) {
      const result = stepPropulsion(current, definition, env, 0.1);
      const values = result.state.equipment['main-engine']!.values;
      expect(Math.abs(values.gimbal! - previous.gimbal)).toBeLessThanOrEqual(
        main.gimbalRate * 0.1 + 1e-15,
      );
      expect(Math.abs(values.gimbalPitch! - previous.gimbalPitch)).toBeLessThanOrEqual(
        main.gimbalRate * 0.1 + 1e-15,
      );
      previous = { gimbal: values.gimbal!, gimbalPitch: values.gimbalPitch! };
      current = { ...result.state, t: current.t + 0.1 };
    }
    // Both axes end on their stops, on opposite sides.
    expect(previous.gimbal).toBeCloseTo(-main.gimbalLimit, 12);
    expect(previous.gimbalPitch).toBeCloseTo(main.gimbalLimit, 12);
  });

  it('follows the centre of mass as the tanks drain', () => {
    const full = run(burning(), 3).state.equipment['main-engine']!.values;
    const light = burning({}, { 'main-propellant': 300, 'rcs-left': 0 });
    const drained = run(light, 3).state.equipment['main-engine']!.values;
    // Less main propellant on the axis leaves the low-slung equipment weighing more, and the
    // empty left RCS tank moves the centre to the right: both gimbal angles change.
    expect(drained.gimbalPitch).toBeLessThan(full.gimbalPitch! - 0.002);
    expect(drained.gimbal).not.toBeCloseTo(full.gimbal!, 4);
    const com = computeMassProperties(light, definition).centerOfMass;
    expect(drained.gimbalPitch).toBeCloseTo(Math.atan2(com.z, com.x + 7), 3);
  });
});

describe('RCS pods in three dimensions (C10)', () => {
  const step = (state: ShipSystemsState, commands: readonly Command[], dt = 1) =>
    stepShipSystems(state, definition, commands, environment(state), dt);

  it('fires any of a pod’s five jets by hand, in its own direction', () => {
    const pod = 'rcs-aft-left';
    const expected: Record<string, Vec3> = {
      'jet-0': { x: 1, y: 0, z: 0 },
      'jet-1': { x: 0, y: -1, z: 0 },
      'jet-2': { x: -1, y: 0, z: 0 },
      'jet-3': { x: 0, y: 0, z: 1 },
      'jet-4': { x: 0, y: 0, z: -1 },
    };
    for (const [mode, direction] of Object.entries(expected)) {
      const state = createShipSystemsState(definition);
      const result = step(state, [
        { kind: 'mode', equipment: pod, mode },
        { kind: 'burn', thruster: pod, duration: 1, throttle: 1 },
      ]);
      expect(result.events.filter((e) => e.kind === 'command-rejected')).toHaveLength(0);
      expect(result.actuators.thrusts).toHaveLength(1);
      const thrust = result.actuators.thrusts[0]!;
      expect(thrust.source).toBe(pod);
      expect(thrust.point).toEqual({ x: -5, y: 2, z: 0 });
      // 200 N along the jet, turned 2 mrad about z by the nominal mount error.
      const nominal = tiltDirection(direction, baseline.propulsion.rcs.mountMisalignment, 0);
      expect(thrust.force.x).toBeCloseTo(200 * nominal.x, 9);
      expect(thrust.force.y).toBeCloseTo(200 * nominal.y, 9);
      expect(thrust.force.z).toBeCloseTo(200 * nominal.z, 9);
    }
    // A jet the pod does not have is not a mode.
    const state = createShipSystemsState(definition);
    const rejected = applyCommands(state, definition, [
      { kind: 'mode', equipment: pod, mode: 'jet-5' },
    ]);
    expect(rejected.events).toHaveLength(1);
    expect(rejected.state).toEqual(state);
  });

  it('opens two valves in a pod with fire-two power and one with fire-one power', () => {
    // A push forward and up asks the forward-left pod for its aft and down jets together.
    const initial = createShipSystemsState(definition);
    const flown = applyCommands(initial, definition, [
      {
        kind: 'fly',
        input: { translate: { x: 1, y: 0, z: 1 }, yaw: 0, pitch: 0, throttle: 0 },
      },
    ]).state;
    const prepared = preparePropulsion(flown, definition, env);
    const pod = 'rcs-forward-left';
    expect(prepared.equipment[pod]!.mode).toBe('fire-two');
    const asked = (
      prepared.ext?.['propulsion.control'] as unknown as Record<string, Record<string, number>>
    )[pod]!;
    expect(Object.keys(asked).sort()).toEqual(['0', '3']);
    const powered = (watts: number): ShipSystemsState => {
      const equipment: Record<string, EquipmentState> = { ...prepared.equipment };
      for (const spec of definition.equipment) {
        if (spec.kind === 'rcs-thruster')
          equipment[spec.id] = { ...equipment[spec.id]!, powerDraw: watts };
        if (spec.id === 'flight-cpu-a')
          equipment[spec.id] = { ...equipment[spec.id]!, powerDraw: 120 };
      }
      return { ...prepared, equipment };
    };
    const forceOf = (state: ShipSystemsState) =>
      stepPropulsion(state, definition, env, 1).thrusts.find((t) => t.source === pod)!.force;
    // 65 W: both jets, so the pod pushes forward and up.
    const two = forceOf(powered(65));
    expect(two.x).toBeGreaterThan(150);
    expect(two.z).toBeGreaterThan(150);
    // 40 W: one valve only, kept by the jet asked for most.
    const one = forceOf(powered(40));
    const favoured = asked['0']! >= asked['3']! ? 'x' : 'z';
    expect(one[favoured]).toBeGreaterThan(150);
    expect(one[favoured === 'x' ? 'z' : 'x']).toBeCloseTo(0, 0);
    // Below fire-one power nothing fires.
    expect(
      stepPropulsion(powered(15), definition, env, 1).thrusts.some((t) => t.source === pod),
    ).toBe(false);
    // Heat follows the jets that fired: valve power plus 100 W of chemical heat per jet.
    const heat = stepPropulsion(powered(65), definition, env, 1).state.equipment[pod]!.values.heat!;
    expect(heat).toBeGreaterThan(65 + 150);
    expect(heat).toBeLessThanOrEqual(65 + 200 + 1e-9);
  });

  it('fires whole minimum bits only, each jet keeping its own count', () => {
    // A small yaw rate error asks the lateral couple for a duty of a few percent: nothing
    // fires until 10 N·s is owed, then both jets fire one bit in the same step.
    let state: ShipSystemsState = {
      ...createShipSystemsState(definition),
      attitudeTarget: { reference: 'rate', rate: { x: 0, y: 0, z: 0.0006 } },
    };
    const fired: number[] = [];
    for (let tick = 0; tick < 8; tick++) {
      const result = step(state, []);
      if (result.actuators.thrusts.length > 0) {
        fired.push(tick);
        expect(result.actuators.thrusts.map((t) => t.source)).toEqual([
          'rcs-forward-right',
          'rcs-aft-left',
        ]);
        for (const thrust of result.actuators.thrusts)
          expect(Math.hypot(thrust.force.x, thrust.force.y, thrust.force.z)).toBeCloseTo(10, 9);
      }
      state = result.state;
    }
    // 0.0006 rad/s × 0.4 /s × 325,049 kg·m² = 78 N·m: 3.9% duty on the 2000 N·m couple, so
    // 7.8 N·s a second and a bit on every second step or so.
    expect(fired.length).toBeGreaterThanOrEqual(3);
    expect(fired[0]).toBe(1);
    const pulses = state.ext?.['propulsion.pulses'] as unknown as Record<
      string,
      { pending: number }
    >;
    expect(Object.keys(pulses).sort()).toEqual(
      expect.arrayContaining(['rcs-aft-left-a-1', 'rcs-forward-right-a-1']),
    );
    // A cutoff forgets what was owed; nothing fires late.
    const cut = applyCommands(state, definition, [{ kind: 'cutoff', thruster: 'all' }]).state;
    expect(cut.ext?.['propulsion.pulses']).toEqual({});
  });
});
