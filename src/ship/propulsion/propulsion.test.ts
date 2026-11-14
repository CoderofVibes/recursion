import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { computeMassProperties } from '../massprops/massprops.ts';
import { preparePropulsion, stepPropulsion } from './propulsion.ts';

const env: EnvironmentEffects = {
  t: 0,
  kinematics: { position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, attitude: 0, angularRate: 0 },
  specificForce: { x: 0, y: 0 },
  targets: [],
  intensity: {},
  fieldSignals: {},
};
const definition = loadShipDefinition();
function burning(id = 'main-engine', throttle = 1): ShipSystemsState {
  const initial = createShipSystemsState(definition);
  return {
    ...initial,
    burns: [{ thruster: id, throttle, until: 1000 }],
    equipment: {
      ...initial.equipment,
      [id]: {
        ...initial.equipment[id]!,
        mode: id.startsWith('rcs') ? 'fire-one' : 'firing',
        powerDraw: id.startsWith('rcs') ? 40 : 180,
      },
    },
  };
}

describe('propulsion (C02, C10)', () => {
  it('keeps an individually inhibited pod out of attitude control despite available valve power', () => {
    const initial = createShipSystemsState(definition);
    const pod = initial.equipment['rcs-forward-left']!;
    const cpu = initial.equipment['flight-cpu-a']!;
    const state = preparePropulsion(
      {
        ...initial,
        attitudeTarget: { reference: 'inertial', angle: 0.3 },
        equipment: {
          ...initial.equipment,
          [pod.id]: { ...pod, powerDraw: 40, values: { ...pod.values, controlInhibited: 1 } },
          [cpu.id]: { ...cpu, powerDraw: 120 },
        },
      },
      definition,
      env,
    );
    expect(state.equipment[pod.id]!.mode).toBe('ready');
    const result = stepPropulsion(state, definition, env, 1);
    expect(result.thrusts.some((thrust) => thrust.source === pod.id)).toBe(false);
    expect(result.state.equipment[pod.id]!.values.pendingImpulse).toBe(0);
  });

  it('conserves propellant and agrees with the rocket equation over a finite burn', () => {
    let state = burning();
    const initialMass = state.massProperties.mass;
    let integratedDeltaV = 0;
    const dt = 0.5;
    for (let i = 0; i < 200; i++) {
      const result = stepPropulsion(state, definition, env, dt);
      const force = result.thrusts[0]!.force;
      const impulse = Math.hypot(force.x, force.y) * dt;
      const consumed = state.tanks['main-propellant']! - result.state.tanks['main-propellant']!;
      expect(consumed).toBeCloseTo(impulse / (320 * baseline.constants.g0.value), 10);
      integratedDeltaV +=
        impulse / ((state.massProperties.mass + result.state.massProperties.mass) / 2);
      state = { ...result.state, t: state.t + dt };
    }
    const expectedDeltaV =
      320 * baseline.constants.g0.value * Math.log(initialMass / state.massProperties.mass);
    expect(integratedDeltaV).toBeCloseTo(expectedDeltaV, 5);
    expect(state.tanks['main-propellant']).toBeCloseTo(
      6000 - (24000 * 100) / (320 * baseline.constants.g0.value),
      8,
    );
  });
  it('limits a final partial impulse to remaining propellant and reports depletion once', () => {
    const start = burning();
    const state = { ...start, tanks: { ...start.tanks, 'main-propellant': 0.01 } };
    const result = stepPropulsion(state, definition, env, 1);
    const force = result.thrusts[0]!.force;
    expect(Math.hypot(force.x, force.y)).toBeCloseTo(0.01 * 320 * baseline.constants.g0.value, 10);
    expect(result.state.tanks['main-propellant']).toBe(0);
    expect(result.events.filter((event) => event.kind === 'propellant-depleted')).toHaveLength(1);
    const next = stepPropulsion(result.state, definition, env, 1);
    expect(next.thrusts).toHaveLength(0);
    expect(next.events).toHaveLength(0);
  });
  it('accumulates sub-minimum RCS demand into real impulses and balances tank draw', () => {
    let state = burning('rcs-forward-left', 0.01);
    const original = structuredClone(state);
    for (let i = 0; i < 4; i++) {
      const result = stepPropulsion(state, definition, env, 1);
      expect(result.thrusts).toHaveLength(0);
      state = { ...result.state, t: i + 1 };
    }
    const result = stepPropulsion(state, definition, env, 1);
    expect(Math.hypot(result.thrusts[0]!.force.x, result.thrusts[0]!.force.y)).toBeCloseTo(10, 10);
    expect(result.state.tanks['rcs-left']).toBe(result.state.tanks['rcs-right']);
    expect(original.equipment['rcs-forward-left']!.values.pendingImpulse).toBeUndefined();
  });
  it('gates thrust on warm readiness, supplied power and permanent condition', () => {
    const state = burning('rcs-forward-left');
    const equipment = state.equipment['rcs-forward-left']!;
    for (const changed of [
      { ...equipment, temperature: 280 },
      { ...equipment, powerDraw: 15 },
      { ...equipment, condition: 0 },
      { ...equipment, values: { ...equipment.values, readyTime: 0, bank: 1 } },
    ]) {
      const result = stepPropulsion(
        { ...state, equipment: { ...state.equipment, [equipment.id]: changed } },
        definition,
        env,
        1,
      );
      expect(result.thrusts).toHaveLength(0);
      expect(result.state.tanks['rcs-left']).toBe(150);
    }
  });
  it('outputs mount forces with misalignment and gimbal limits rather than an invented pure torque', () => {
    const state = burning();
    const current = state.equipment['main-engine']!;
    const tilted = {
      ...state,
      equipment: {
        ...state.equipment,
        'main-engine': { ...current, values: { ...current.values, misalignment: 0.2 } },
      },
    };
    const result = stepPropulsion(tilted, definition, env, 1);
    expect(result.torque).toBe(0);
    expect(result.thrusts[0]!.point).toEqual({ x: -7, y: 0.08 });
    expect(Math.atan2(result.thrusts[0]!.force.y, result.thrusts[0]!.force.x)).toBeCloseTo(
      0.18,
      12,
    );
    expect(result.state.equipment['main-engine']!.values.gimbal).toBe(-0.02);
  });
  it('uses finite RCS force and propellant for attitude hold and is deterministic', () => {
    const initial = createShipSystemsState(definition);
    let state = preparePropulsion(
      { ...initial, attitudeTarget: { reference: 'inertial', angle: 0.3 } },
      definition,
      env,
    );
    const equipment = { ...state.equipment };
    for (const spec of definition.equipment) {
      if (spec.kind === 'rcs-thruster')
        equipment[spec.id] = { ...equipment[spec.id]!, powerDraw: 40 };
      if (spec.id === 'flight-cpu-a')
        equipment[spec.id] = { ...equipment[spec.id]!, powerDraw: 120 };
    }
    state = { ...state, equipment, massProperties: computeMassProperties(state, definition) };
    const before = structuredClone(state);
    const result = stepPropulsion(state, definition, env, 1);
    expect(result).toEqual(stepPropulsion(state, definition, env, 1));
    expect(state).toEqual(before);
    expect(result.thrusts).toHaveLength(4);
    expect(result.torque).toBe(0);
    expect(result.state.tanks['rcs-left']).toBeLessThan(150);
    const sum = result.thrusts.reduce(
      (v, force) => ({ x: v.x + force.force.x, y: v.y + force.force.y }),
      { x: 0, y: 0 },
    );
    expect(sum.x).toBeCloseTo(0, 10);
    expect(sum.y).toBeCloseTo(0, 10);
  });
});
