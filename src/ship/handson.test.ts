import { describe, expect, it } from 'vitest';
import { HANDS_ON_NEUTRAL, type Command, type HandsOnInput } from '../contracts/commands.ts';
import type {
  EnvironmentEffects,
  ShipStepResult,
  ShipSystemsState,
} from '../contracts/truth/ship.ts';
import { fromYaw } from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { applyCommands, HANDS_ON_TURN_RATE } from './commands.ts';
import { createShipSystemsState, loadShipDefinition, stepShipSystems } from './index.ts';

const definition = loadShipDefinition();
const dt = 0.1;
const env = (state: ShipSystemsState): EnvironmentEffects => ({
  t: state.t,
  kinematics: {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    attitude: fromYaw(0),
    angularVelocity: { x: 0, y: 0, z: 0 },
  },
  specificForce: { x: 0, y: 0, z: 0 },
  targets: [],
  intensity: {},
  fieldSignals: {},
  sunlight: { direction: { x: 1, y: 0, z: 0 }, irradiance: 0 },
});
const fly = (input: Partial<HandsOnInput>): Command => ({
  kind: 'fly',
  input: { ...HANDS_ON_NEUTRAL, ...input },
});
const step = (state: ShipSystemsState, commands: readonly Command[] = []): ShipStepResult =>
  stepShipSystems(state, definition, commands, env(state), dt);
const rateTarget = (state: ShipSystemsState): Vec3 => {
  const target = state.attitudeTarget;
  if (target.reference !== 'rate')
    throw new Error(`expected a rate target, got ${target.reference}`);
  return target.rate;
};
const mainBurns = (state: ShipSystemsState) =>
  state.burns.filter((burn) => burn.thruster === 'main-engine');
const mainFires = (result: ShipStepResult): boolean =>
  result.actuators.thrusts.some((thrust) => thrust.source === 'main-engine');
/** Torque about body z of this step's thrusts, about the centre of mass. */
const yawTorque = (result: ShipStepResult): number => {
  const com = result.actuators.massProperties.centerOfMass;
  return result.actuators.thrusts.reduce(
    (total, thrust) =>
      total + (thrust.point.x - com.x) * thrust.force.y - (thrust.point.y - com.y) * thrust.force.x,
    0,
  );
};

describe('hands-on flying (fly command, stub)', () => {
  it('accepts the controls and stores them as plain JSON', () => {
    const state = createShipSystemsState(definition);
    const input: HandsOnInput = {
      translate: { x: 0.25, y: -1, z: 0.5 },
      yaw: 0.5,
      pitch: 0,
      throttle: 0,
    };
    const result = applyCommands(state, definition, [{ kind: 'fly', input }]);
    expect(result.events).toHaveLength(0);
    expect(result.state.ext?.handsOn).toEqual(input);
    // Translation is stored but not yet acted on: nothing fires for it.
    expect(result.state.burns).toHaveLength(0);
    // No negative zero reaches the state, so a JSON save is the same state.
    expect(rateTarget(result.state).y).toBe(0);
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
    // The input is the caller's; the state does not share it.
    expect(result.state.ext?.handsOn).not.toBe(input);
  });

  it('turns a yaw and pitch demand into the rate target, and the jets act on yaw', () => {
    const state = createShipSystemsState(definition);
    const commanded = applyCommands(state, definition, [fly({ yaw: 0.5, pitch: -1 })]).state;
    expect(rateTarget(commanded)).toEqual({
      x: 0,
      y: HANDS_ON_TURN_RATE,
      z: 0.5 * HANDS_ON_TURN_RATE,
    });
    for (const yaw of [1, -1]) {
      let current = createShipSystemsState(definition);
      let torque = 0;
      for (let tick = 0; tick < 10; tick++) {
        const result = step(current, tick === 0 ? [fly({ yaw })] : []);
        expect(result.events.filter((e) => e.kind === 'command-rejected')).toHaveLength(0);
        expect(mainFires(result)).toBe(false);
        torque += yawTorque(result);
        current = result.state;
      }
      expect(rateTarget(current).z).toBe(yaw * HANDS_ON_TURN_RATE);
      expect(Math.sign(torque)).toBe(yaw);
    }
  });

  it('hands control back to pods an individual cutoff had inhibited', () => {
    const state = createShipSystemsState(definition);
    const cut = applyCommands(state, definition, [
      { kind: 'cutoff', thruster: 'rcs-forward-left' },
      { kind: 'cutoff', thruster: 'main-engine' },
    ]).state;
    expect(cut.equipment['rcs-forward-left']!.values.controlInhibited).toBe(1);
    const flown = applyCommands(cut, definition, [fly({ yaw: 1, throttle: 1 })]).state;
    expect(flown.equipment['rcs-forward-left']!.values.controlInhibited).toBe(0);
    expect(flown.equipment['main-engine']!.values.controlInhibited).toBe(0);
  });

  it('fires the main engine at the throttle until the controls change', () => {
    let state = createShipSystemsState(definition);
    const first = step(state, [fly({ throttle: 1 })]);
    expect(first.events.filter((e) => e.kind === 'command-rejected')).toHaveLength(0);
    expect(mainFires(first)).toBe(true);
    expect(mainBurns(first.state)).toHaveLength(1);
    expect(mainBurns(first.state)[0]!.throttle).toBe(1);
    expect(Number.isFinite(mainBurns(first.state)[0]!.until)).toBe(true);
    state = first.state;
    // Still burning long after any timed pulse would have ended, with no further command.
    let last = first;
    for (let tick = 0; tick < 100; tick++) {
      last = step(state);
      state = last.state;
    }
    expect(mainFires(last)).toBe(true);
    expect(mainBurns(state)).toHaveLength(1);
    expect(state.tanks['main-propellant']).toBeLessThan(first.state.tanks['main-propellant']!);
    // A new throttle replaces the burn rather than adding one.
    const eased = applyCommands(state, definition, [fly({ throttle: 0.5, yaw: 0.2 })]).state;
    expect(mainBurns(eased)).toHaveLength(1);
    expect(mainBurns(eased)[0]!.throttle).toBe(0.5);
    // What the command wrote is plain JSON (the burn has a finite end).
    const written = {
      burns: eased.burns,
      attitudeTarget: eased.attitudeTarget,
      handsOn: eased.ext?.handsOn,
      handsOnBurnUntil: eased.ext?.handsOnBurnUntil,
    };
    expect(JSON.parse(JSON.stringify(written))).toEqual(written);
  });

  it('stops the engine and nulls the rate demand when the controls are released', () => {
    let state = step(createShipSystemsState(definition), [fly({ throttle: 1, yaw: 1 })]).state;
    state = step(state).state;
    const released = step(state, [{ kind: 'fly', input: HANDS_ON_NEUTRAL }]);
    expect(released.events.filter((e) => e.kind === 'command-rejected')).toHaveLength(0);
    expect(mainBurns(released.state)).toHaveLength(0);
    expect(mainFires(released)).toBe(false);
    expect(released.state.attitudeTarget).toEqual({
      reference: 'rate',
      rate: { x: 0, y: 0, z: 0 },
    });
    expect(released.state.ext?.handsOn).toEqual(HANDS_ON_NEUTRAL);
    const propellant = released.state.tanks['main-propellant'];
    state = released.state;
    for (let tick = 0; tick < 20; tick++) {
      const result = step(state);
      expect(mainFires(result)).toBe(false);
      state = result.state;
    }
    expect(state.tanks['main-propellant']).toBe(propellant);
  });

  it('closing the throttle keeps the turn and leaves a timed burn commanded since alone', () => {
    const state = createShipSystemsState(definition);
    const turning = applyCommands(state, definition, [
      fly({ throttle: 1, yaw: 1 }),
      fly({ throttle: 0, yaw: 1 }),
    ]).state;
    expect(mainBurns(turning)).toHaveLength(0);
    expect(rateTarget(turning).z).toBe(HANDS_ON_TURN_RATE);
    const timed = applyCommands(state, definition, [
      fly({ throttle: 1 }),
      { kind: 'burn', thruster: 'main-engine', duration: 5, throttle: 1 },
      { kind: 'fly', input: HANDS_ON_NEUTRAL },
    ]);
    expect(timed.events).toHaveLength(0);
    expect(mainBurns(timed.state)).toEqual([{ thruster: 'main-engine', throttle: 1, until: 5 }]);
  });

  it('does not wake a main engine that is switched off', () => {
    const state = createShipSystemsState(definition);
    const off = applyCommands(state, definition, [
      { kind: 'mode', equipment: 'main-engine', mode: 'off' },
      fly({ throttle: 1, yaw: 1 }),
    ]);
    expect(mainBurns(off.state)).toHaveLength(0);
    expect(off.state.equipment['main-engine']!.mode).toBe('off');
    expect(rateTarget(off.state).z).toBe(HANDS_ON_TURN_RATE);
    expect(mainFires(step(off.state))).toBe(false);
  });

  it('rejects non-finite and out-of-range controls without changing the state', () => {
    const state = createShipSystemsState(definition);
    const commands: Command[] = [
      fly({ yaw: NaN }),
      fly({ yaw: 1.01 }),
      fly({ pitch: -1.5 }),
      fly({ pitch: Infinity }),
      fly({ throttle: -0.1 }),
      fly({ throttle: 1.2 }),
      fly({ throttle: NaN }),
      fly({ translate: { x: 0, y: 2, z: 0 } }),
      fly({ translate: { x: 0, y: 0, z: -Infinity } }),
    ];
    const result = applyCommands(state, definition, commands);
    expect(result.events).toHaveLength(commands.length);
    expect(result.events.every((e) => e.kind === 'command-rejected')).toBe(true);
    expect(result.state).toEqual(state);
    // The limits themselves are allowed.
    const edge = applyCommands(state, definition, [
      fly({ translate: { x: -1, y: 1, z: 1 }, yaw: -1, pitch: 1, throttle: 1 }),
    ]);
    expect(edge.events).toHaveLength(0);
  });
});
