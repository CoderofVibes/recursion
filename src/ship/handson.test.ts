import { describe, expect, it } from 'vitest';
import baselineData from '../../data/ship-baseline.json';
import { HANDS_ON_NEUTRAL, type Command, type HandsOnInput } from '../contracts/commands.ts';
import type {
  EnvironmentEffects,
  ShipKinematics,
  ShipStepResult,
  ShipSystemsState,
} from '../contracts/truth/ship.ts';
import { angleBetween, axisX, fromYaw } from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { applyCommands, HANDS_ON_TURN_RATE } from './commands.ts';
import {
  createShipSystemsState,
  handsOnBodyRate,
  loadShipDefinition,
  stepShipSystems,
} from './index.ts';
import { controlSettings } from './propulsion/control.ts';
import { fly as flight, netWrench, rcsPropellant, RESTING } from './test-helpers.ts';

const definition = loadShipDefinition();
const settings = controlSettings(definition);
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
const yawTorque = (result: ShipStepResult): number => netWrench(result).torque.z;

describe('hands-on flying (fly command)', () => {
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
    // Translation is the jets' work, not a timed burn.
    expect(result.state.burns).toHaveLength(0);
    // No negative zero reaches the state, so a JSON save is the same state.
    expect(rateTarget(result.state).y).toBe(0);
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
    // The input is the caller's; the state does not share it.
    expect(result.state.ext?.handsOn).not.toBe(input);
  });

  it('turns a yaw and pitch demand into the rate target, and the jets act on yaw', () => {
    const state = createShipSystemsState(definition);
    const commanded = applyCommands(state, definition, [fly({ yaw: 0.5, pitch: -0.8 })]).state;
    // Roll is not the player's: its rate target is always zero.
    expect(rateTarget(commanded)).toEqual({
      x: 0,
      y: 0.8 * HANDS_ON_TURN_RATE,
      z: 0.5 * HANDS_ON_TURN_RATE,
    });
    // Yaw and pitch together are one turn: never faster than the turn rate (the stub asked
    // for 1.41 times it on a diagonal, over the star trackers' limit).
    const diagonal = rateTarget(
      applyCommands(state, definition, [fly({ yaw: 1, pitch: -1 })]).state,
    );
    expect(Math.hypot(diagonal.y, diagonal.z)).toBeCloseTo(HANDS_ON_TURN_RATE, 15);
    expect(diagonal.y).toBeCloseTo(diagonal.z, 15);
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
      handsOnHold: eased.ext?.handsOnHold,
    };
    expect(JSON.parse(JSON.stringify(written))).toEqual(written);
  });

  it('stops the engine and, the ship being steady, holds its attitude when the controls are released', () => {
    let state = step(createShipSystemsState(definition), [fly({ throttle: 1, yaw: 1 })]).state;
    state = step(state).state;
    const released = step(state, [{ kind: 'fly', input: HANDS_ON_NEUTRAL }]);
    expect(released.events.filter((e) => e.kind === 'command-rejected')).toHaveLength(0);
    expect(mainBurns(released.state)).toHaveLength(0);
    expect(mainFires(released)).toBe(false);
    // The scene's rates are zero, so the rates are already nulled: the attitude the ship has
    // (the scene's, yaw 0) becomes the target at once.
    expect(released.state.attitudeTarget).toEqual({ reference: 'inertial', attitude: fromYaw(0) });
    expect(released.state.ext?.handsOnHold).toBe('held');
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

describe('hands-on flying in three dimensions (rigid body integrated in the test)', () => {
  // `flight` (test-helpers.ts) steps the ship and integrates its attitude and velocity from the
  // forces it puts out, with semi-implicit Euler at dt = 1 s.
  const startWith = (input: Partial<HandsOnInput>) => (k: number) => (k === 0 ? [fly(input)] : []);

  it('translates along each body axis without turning the ship', () => {
    const cases: [Vec3, number][] = [
      [{ x: 1, y: 0, z: 0 }, 800],
      [{ x: -1, y: 0, z: 0 }, 800],
      [{ x: 0, y: 1, z: 0 }, 400],
      [{ x: 0, y: -1, z: 0 }, 400],
      // The centre of mass is 0.33 m aft of the pods' centre, so the forward pods throttle
      // back to keep a vertical push from pitching the ship: 750 N of the 800 N installed.
      [{ x: 0, y: 0, z: 1 }, 750],
      [{ x: 0, y: 0, z: -1 }, 750],
    ];
    for (const [translate, newtons] of cases) {
      const run = flight(definition, { duration: 60, commands: startWith({ translate }) });
      const speed = run.kinematics.velocity;
      const along = speed.x * translate.x + speed.y * translate.y + speed.z * translate.z;
      // Acceleration = force / mass, within the minimum-bit quantisation.
      expect(along).toBeGreaterThan((0.97 * newtons * 60) / 30374);
      expect(along).toBeLessThan((1.01 * newtons * 60) / 30374);
      // Nothing sideways, and the attitude stays inside the hold's band.
      expect(Math.hypot(speed.x, speed.y, speed.z) - along).toBeLessThan(0.002);
      expect(angleBetween(run.kinematics.attitude, RESTING.attitude)).toBeLessThan(0.01);
      expect(run.peakRate).toBeLessThan(3 * settings.rateDeadband);
      // Propellant: thrust / (Isp g0), about 0.37 kg/s for the four jets of x or z.
      const expected = ((along * 30374) / 60 / (220 * 9.80665)) * 60;
      expect(run.rcsUsed).toBeGreaterThan(0.99 * expected);
      expect(run.rcsUsed).toBeLessThan(1.35 * expected);
    }
  });

  it('half a deflection is half the push', () => {
    const half = flight(definition, {
      duration: 60,
      commands: startWith({ translate: { x: 0.5, y: 0, z: 0 } }),
    });
    expect(half.kinematics.velocity.x).toBeGreaterThan((0.95 * 400 * 60) / 30374);
    expect(half.kinematics.velocity.x).toBeLessThan((1.02 * 400 * 60) / 30374);
  });

  it('yaws left and right and pitches up and down at the stated rate, with no roll', () => {
    for (const [input, axis, sign] of [
      [{ yaw: 1 }, 'z', 1],
      [{ yaw: -1 }, 'z', -1],
      [{ pitch: 1 }, 'y', -1], // nose up is a negative rate about body +y
      [{ pitch: -1 }, 'y', 1],
      [{ yaw: 1, pitch: 1 }, 'both', 1], // full deflection of both: still one turn rate
    ] as const) {
      const run = flight(definition, { duration: 60, commands: startWith(input) });
      const w = run.kinematics.angularVelocity;
      if (axis === 'both') {
        expect(Math.hypot(w.y, w.z)).toBeGreaterThan(
          HANDS_ON_TURN_RATE - 2 * settings.rateDeadband,
        );
        expect(Math.hypot(w.y, w.z)).toBeLessThan(HANDS_ON_TURN_RATE + 2 * settings.rateDeadband);
        expect(Math.abs(w.x)).toBeLessThan(2 * settings.rateDeadband);
      } else {
        expect(sign * w[axis]).toBeGreaterThan(HANDS_ON_TURN_RATE - 1.5 * settings.rateDeadband);
        expect(sign * w[axis]).toBeLessThan(HANDS_ON_TURN_RATE + 1.5 * settings.rateDeadband);
        // The other two rates, roll among them, stay nulled.
        for (const other of ['x', 'y', 'z'] as const)
          if (other !== axis) expect(Math.abs(w[other])).toBeLessThan(2 * settings.rateDeadband);
      }
      // A turn keeps the star trackers' fix.
      expect(run.peakRate).toBeLessThan(0.01);
      // Nose left for yaw > 0 (toward +y), nose up for pitch > 0 (toward +z).
      const nose = axisX(run.kinematics.attitude);
      if ('yaw' in input) expect(Math.sign(nose.y)).toBe(Math.sign(input.yaw));
      if ('pitch' in input) expect(Math.sign(nose.z)).toBe(Math.sign(input.pitch));
      // Spinning up takes a fraction of a kilogram of RCS propellant.
      expect(run.rcsUsed).toBeGreaterThan(0.1);
      expect(run.rcsUsed).toBeLessThan(0.6);
    }
  });

  it('released controls null the rates and then hold the attitude the ship has at that moment', () => {
    let captured: ShipKinematics | undefined;
    let releasedAt = -1;
    const run = flight(definition, {
      duration: 600,
      commands: (k) =>
        k === 0
          ? [fly({ yaw: 1, pitch: 0.5 })]
          : k === 120
            ? [{ kind: 'fly', input: HANDS_ON_NEUTRAL }]
            : [],
      each: (k, state, kinematics) => {
        if (k < 120) expect(state.ext?.handsOnHold ?? null).toBeNull();
        if (k >= 120 && !captured) {
          if (state.attitudeTarget.reference === 'inertial') {
            captured = kinematics;
            releasedAt = k;
            expect(state.ext?.handsOnHold).toBe('held');
          } else {
            // Still nulling: a zero rate target, waiting for the ship to steady.
            expect(state.attitudeTarget).toEqual({
              reference: 'rate',
              rate: { x: 0, y: 0, z: 0 },
            });
            expect(state.ext?.handsOnHold).toBe('pending');
          }
        }
      },
    });
    // The rates were nulled within seconds of the release, and only then was an attitude held.
    expect(releasedAt).toBeGreaterThan(120);
    expect(releasedAt).toBeLessThan(140);
    const target = run.state.attitudeTarget;
    if (target.reference !== 'inertial') throw new Error('expected a held attitude');
    // The held attitude is where the ship was when it steadied, not where it was released.
    expect(angleBetween(target.attitude, RESTING.attitude)).toBeGreaterThan(0.8);
    // Eight minutes later the ship is still there, steady.
    expect(angleBetween(run.kinematics.attitude, target.attitude)).toBeLessThan(0.012);
    expect(run.peakRate).toBeLessThan(0.01);
    const w = run.kinematics.angularVelocity;
    expect(Math.hypot(w.x, w.y, w.z)).toBeLessThan(3 * settings.rateDeadband);
    expect(JSON.parse(JSON.stringify(run.state))).toEqual(run.state);
  });

  it('keeps a held attitude while only the translation or the throttle changes', () => {
    const state = createShipSystemsState(definition);
    const held = step(state, [{ kind: 'fly', input: HANDS_ON_NEUTRAL }]).state;
    expect(held.attitudeTarget.reference).toBe('inertial');
    const pushed = applyCommands(held, definition, [
      fly({ translate: { x: 1, y: 0, z: 0 } }),
    ]).state;
    expect(pushed.attitudeTarget).toEqual(held.attitudeTarget);
    expect(pushed.ext?.handsOnHold).toBe('held');
    // Turning takes the attitude back from the hold; a commanded attitude ends it too.
    const turned = applyCommands(pushed, definition, [fly({ pitch: 1 })]).state;
    expect(rateTarget(turned).y).toBe(-HANDS_ON_TURN_RATE);
    expect(turned.ext?.handsOnHold).toBeNull();
    const commanded = applyCommands(held, definition, [
      { kind: 'attitude', target: { reference: 'inertial', attitude: fromYaw(0.5) } },
    ]).state;
    expect(commanded.ext?.handsOnHold).toBeNull();
  });

  it('a cutoff of everything stops the translation as well', () => {
    let state = createShipSystemsState(definition);
    const pushing = step(state, [fly({ translate: { x: 0, y: 0, z: 1 } })]);
    expect(pushing.actuators.thrusts.length).toBeGreaterThan(0);
    state = pushing.state;
    const cut = step(state, [{ kind: 'cutoff', thruster: 'all' }]);
    expect(cut.actuators.thrusts).toHaveLength(0);
    expect(cut.state.ext?.handsOn).toEqual(HANDS_ON_NEUTRAL);
    expect(cut.state.attitudeTarget).toEqual({ reference: 'free' });
    const propellant = rcsPropellant(cut.state);
    state = cut.state;
    for (let tick = 0; tick < 30; tick++) state = step(state).state;
    expect(rcsPropellant(state)).toBe(propellant);
  });
});

describe('hands-on body rate, for a navigator', () => {
  it('is the rate the ship turns to: yaw about +z, pitch about -y, a diagonal capped', () => {
    const definition = loadShipDefinition();
    const rate = baselineData.propulsion.attitudeControl.handsOnTurnRate;
    expect(handsOnBodyRate(definition, { yaw: 1, pitch: 0 })).toEqual({ x: 0, y: 0, z: rate });
    expect(handsOnBodyRate(definition, { yaw: 0, pitch: 1 })).toEqual({ x: 0, y: -rate, z: 0 });
    const diagonal = handsOnBodyRate(definition, { yaw: 1, pitch: 1 });
    expect(Math.hypot(diagonal.y, diagonal.z)).toBeCloseTo(rate, 15);
  });
});
