import { describe, expect, it } from 'vitest';
import baseline from '../../data/ship-baseline.json';
import type { Command } from '../contracts/commands.ts';
import type { EnvironmentEffects, ShipSystemsState } from '../contracts/truth/ship.ts';
import { fromYaw } from '../lib/quat.ts';
import { applyCommands } from './commands.ts';
import { createShipSystemsState, loadShipDefinition, stepShipSystems } from './index.ts';

const definition = loadShipDefinition();
const env = (state: ShipSystemsState): EnvironmentEffects => ({
  t: state.t,
  kinematics: {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    attitude: fromYaw(0),
    angularVelocity: { x: 0, y: 0, z: 0 },
  },
  specificForce: { x: 0, y: 0, z: 0 },
  targets: [
    {
      id: 'target',
      kind: 'body',
      relativePosition: { x: 10000, y: 0, z: 0 },
      relativeVelocity: { x: 0, y: 0, z: 0 },
      radius: 100,
    },
  ],
  intensity: {},
  fieldSignals: {},
  sunlight: { direction: { x: 1, y: 0, z: 0 }, irradiance: 0 },
});

describe('1C loader and physical arrival', () => {
  it('projects shared typed data without double counting structure or retained resources', () => {
    const state = createShipSystemsState(definition);
    expect(definition.equipment).toHaveLength(baseline.equipment.length - 1);
    expect(definition.tanks).toHaveLength(7);
    expect(state.massProperties.mass).toBe(30374);
    expect(state.massProperties.centerOfMass.x).toBeCloseTo(-0.3328504642, 8);
    expect(state.massProperties.inertia.moments.z).toBeCloseTo(325048.751, 2);
    expect(definition.equipment.find((e) => e.id === 'main-engine')?.mount?.position).toEqual({
      x: -7,
      y: 0.08,
      z: 0,
    });
    expect(definition.equipment.find((e) => e.id === 'eclss-b')?.sheddable).toBe(false);
    expect(definition.systems).toEqual(baseline);
  });

  it('returns independent JSON snapshots and independent seeded streams', () => {
    const a = createShipSystemsState(definition, 'A');
    const b = createShipSystemsState(definition, 'A');
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(createShipSystemsState(definition, 'B').rng).not.toEqual(a.rng);
    expect(a.equipment).not.toBe(b.equipment);
  });
});

describe('ordered command boundary', () => {
  it('rejects disabling the last essential chain and malformed commands visibly', () => {
    const state = createShipSystemsState(definition);
    const commands: Command[] = [
      { kind: 'mode', equipment: 'eclss-a', mode: 'off' },
      { kind: 'power', equipment: 'eclss-a', allocation: 0 },
      { kind: 'power', equipment: 'camera', allocation: NaN },
      { kind: 'burn', thruster: 'main-engine', duration: 0.01, throttle: 1 },
      { kind: 'attitude', target: { reference: 'prograde' } },
      { kind: 'configure', configuration: 'missing' },
    ];
    const result = applyCommands(state, definition, commands);
    expect(result.events).toHaveLength(commands.length);
    expect(result.events.every((e) => e.kind === 'command-rejected')).toBe(true);
    expect(result.state).toEqual(state);
  });

  it('can replace a working essential chain with a powered spare', () => {
    let state = createShipSystemsState(definition);
    state = stepShipSystems(
      state,
      definition,
      [{ kind: 'mode', equipment: 'eclss-b', mode: 'active' }],
      env(state),
      1,
    ).state;
    const result = applyCommands(state, definition, [
      { kind: 'mode', equipment: 'eclss-a', mode: 'standby' },
    ]);
    expect(result.events).toHaveLength(0);
    expect(result.state.equipment['eclss-a']?.mode).toBe('standby');
  });

  it('cutoff clears pending impulse and prevents a later uncommanded manual burn', () => {
    const state = createShipSystemsState(definition);
    const result = stepShipSystems(
      state,
      definition,
      [
        { kind: 'burn', thruster: 'main-engine', duration: 5, throttle: 1 },
        { kind: 'cutoff', thruster: 'all' },
      ],
      env(state),
      0.1,
    );
    expect(result.state.burns).toHaveLength(0);
    expect(result.actuators.thrusts).toHaveLength(0);
    expect(result.state.tanks['main-propellant']).toBe(6000);
  });

  it('points a sensor along a finite, non-zero direction of any length and rejects the rest', () => {
    const state = createShipSystemsState(definition);
    const pointed = applyCommands(state, definition, [
      { kind: 'point', sensor: 'camera', target: null, direction: { x: 3, y: 4, z: 0 } },
    ]);
    expect(pointed.events).toHaveLength(0);
    expect(pointed.state.ext?.sensorPointing).toEqual({
      camera: { target: null, direction: { x: 3, y: 4, z: 0 }, settleUntil: 5 },
    });
    const commands: Command[] = [
      { kind: 'point', sensor: 'camera', target: null },
      { kind: 'point', sensor: 'camera', target: null, direction: { x: 0, y: 0, z: 0 } },
      { kind: 'point', sensor: 'camera', target: null, direction: { x: 1, y: NaN, z: 0 } },
      { kind: 'point', sensor: 'camera', target: 'target', direction: { x: Infinity, y: 0, z: 0 } },
    ];
    const rejected = applyCommands(state, definition, commands);
    expect(rejected.events).toHaveLength(commands.length);
    expect(rejected.events.every((e) => e.kind === 'command-rejected')).toBe(true);
    expect(rejected.state).toEqual(state);
  });
});

describe('ship step integration', () => {
  it('off, heater and bank/jet switches cancel committed pulses without redirecting them', () => {
    for (const mode of ['off', 'heater', 'bank-b', 'jet-1']) {
      const initial = createShipSystemsState(definition);
      const id = 'rcs-forward-left';
      const state: ShipSystemsState = {
        ...initial,
        burns: [{ thruster: id, throttle: 1, until: 1 }],
        equipment: {
          ...initial.equipment,
          [id]: {
            ...initial.equipment[id]!,
            mode: 'fire-one',
            values: { ...initial.equipment[id]!.values, pulseRemaining: 0.03, pendingImpulse: 7 },
          },
        },
      };
      const result = stepShipSystems(
        state,
        definition,
        [{ kind: 'mode', equipment: id, mode }],
        env(state),
        0.02,
      );
      expect(result.actuators.thrusts).toHaveLength(0);
      expect(result.state.tanks['rcs-left']).toBe(150);
      expect(result.state.equipment[id]!.values.pulseRemaining).toBe(0);
      expect(result.state.equipment[id]!.values.pendingImpulse).toBe(0);
    }
  });

  it('cutoff defeats automatic thrust until the player explicitly re-enables control', () => {
    const initial = createShipSystemsState(definition);
    const state: ShipSystemsState = {
      ...initial,
      attitudeTarget: { reference: 'inertial', attitude: fromYaw(1) },
    };
    const all = stepShipSystems(
      state,
      definition,
      [{ kind: 'cutoff', thruster: 'all' }],
      env(state),
      0.1,
    );
    expect(all.actuators.thrusts).toHaveLength(0);
    expect(all.state.attitudeTarget).toEqual({ reference: 'free' });
    const one = stepShipSystems(
      state,
      definition,
      [{ kind: 'cutoff', thruster: 'rcs-forward-left' }],
      env(state),
      0.1,
    );
    expect(one.actuators.thrusts.some((t) => t.source === 'rcs-forward-left')).toBe(false);
    expect(one.actuators.thrusts.length).toBeGreaterThan(0);
    const resumed = stepShipSystems(
      one.state,
      definition,
      [{ kind: 'attitude', target: { reference: 'inertial', attitude: fromYaw(1) } }],
      env(one.state),
      0.1,
    );
    expect(resumed.actuators.thrusts.some((t) => t.source === 'rcs-forward-left')).toBe(true);
  });

  it('replays exactly through a JSON save with commands and consumes no input state', () => {
    let state = createShipSystemsState(definition, 'replay');
    const defBefore = JSON.stringify(definition);
    for (let tick = 0; tick < 350; tick++) {
      const commands: Command[] =
        tick === 10
          ? [{ kind: 'configure', configuration: 'stowed' }]
          : tick === 50
            ? [{ kind: 'burn', thruster: 'main-engine', duration: 2, throttle: 1 }]
            : tick === 300
              ? [{ kind: 'point', sensor: 'camera', target: 'target' }]
              : [];
      const before = JSON.stringify(state);
      const expected = stepShipSystems(state, definition, commands, env(state), 0.1);
      const replay = stepShipSystems(
        JSON.parse(before) as ShipSystemsState,
        definition,
        commands,
        env(state),
        0.1,
      );
      expect(replay).toEqual(expected);
      expect(JSON.stringify(state)).toBe(before);
      expect(
        expected.measurements.every((m) => m.t === state.t && m.value.length === m.sigma.length),
      ).toBe(true);
      state = expected.state;
    }
    expect(JSON.stringify(definition)).toBe(defBefore);
    expect(state.tanks['main-propellant']).toBeLessThan(6000);
    expect(state.recorder.bytesUsed).toBeGreaterThan(0);
    expect(state.configuration).toBe('stowed');
    expect(Object.values(state.thermal).every(Number.isFinite)).toBe(true);
  });

  it('guards invalid tick timing', () => {
    const state = createShipSystemsState(definition);
    for (const dt of [0, -1, Infinity, NaN])
      expect(() => stepShipSystems(state, definition, [], env(state), dt)).toThrow(RangeError);
    expect(() => stepShipSystems(state, definition, [], { ...env(state), t: 1 }, 0.1)).toThrow(
      RangeError,
    );
  });

  it('timestamps inventory at the scene boundary while returning advanced physical resources', () => {
    const state = createShipSystemsState(definition);
    const result = stepShipSystems(
      state,
      definition,
      [{ kind: 'burn', thruster: 'main-engine', duration: 1, throttle: 1 }],
      env(state),
      0.1,
    );
    const propellant = result.measurements.find((m) => m.channel === 'main-propellant.propellant');
    expect(propellant?.value).toEqual([6000]);
    expect(result.state.tanks['main-propellant']).toBeLessThan(6000);
    expect(result.state.t).toBe(0.1);
  });
});
