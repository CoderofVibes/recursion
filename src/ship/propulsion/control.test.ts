import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type { Command } from '../../contracts/commands.ts';
import type { ShipKinematics, ShipSystemsState } from '../../contracts/truth/ship.ts';
import {
  angleBetween,
  fromAxisAngle,
  fromYaw,
  IDENTITY,
  multiply,
  rotate,
  type Quat,
} from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { getGeometry } from '../config/configuration.ts';
import { loadShipDefinition } from '../definition.ts';
import { massDetail } from '../massprops/massprops.ts';
import { createShipSystemsState } from '../state.ts';
import { fly, inverseSym3, RESTING, rcsPropellant } from '../test-helpers.ts';
import { allocateJets, wrenchOf } from './allocator.ts';
import { attitudeError, attitudeTorque, commandedRate, controlSettings } from './control.ts';
import { activeJets } from './jets.ts';

const definition = loadShipDefinition();
const settings = controlSettings(definition);
const starLimit = baseline.sensing.starTracker.maxAngularRate;
const unit = (x: number, y: number, z: number): Vec3 => {
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
};
const pitchUp = (angle: number): Quat => fromAxisAngle({ x: 0, y: -1, z: 0 }, angle);
const hold = (attitude: Quat) => (step: number) =>
  step === 0
    ? [{ kind: 'attitude', target: { reference: 'inertial', attitude } } satisfies Command]
    : [];
const rateOf = (k: ShipKinematics) =>
  Math.hypot(k.angularVelocity.x, k.angularVelocity.y, k.angularVelocity.z);

describe('attitude controller: the law', () => {
  it('uses the play values in the baseline', () => {
    // [ASSUMED] 2B's gains (0.04 and 0.4 per second) as a rate loop, with 2F's request 3: a
    // deadband in attitude and in rate and a slew limit under the star trackers' 0.01 rad/s.
    expect(settings.rateGain).toBe(0.4);
    expect(settings.attitudeGain * settings.rateGain).toBeCloseTo(0.04, 12);
    expect(settings.slewRate).toBe(0.008);
    expect(settings.slewRate).toBeLessThan(starLimit);
    expect(settings.attitudeDeadband).toBe(0.002);
    expect(settings.rateDeadband).toBe(0.0004);
  });

  it('measures the remaining turn as a rotation vector in the body frame, the short way', () => {
    // From yaw 0.2 to yaw 0.5: 0.3 rad about body z.
    const error = attitudeError(fromYaw(0.2), fromYaw(0.5));
    expect(error.x).toBeCloseTo(0, 12);
    expect(error.y).toBeCloseTo(0, 12);
    expect(error.z).toBeCloseTo(0.3, 12);
    // Nose up by 0.4 rad is a rotation of −0.4 about body +y.
    expect(attitudeError(IDENTITY, pitchUp(0.4)).y).toBeCloseTo(-0.4, 12);
    // The error is expressed in the body frame: with the ship rolled 90° about its own x axis,
    // a turn about the inertial z axis is a turn about body y.
    const rolled = fromAxisAngle({ x: 1, y: 0, z: 0 }, Math.PI / 2);
    const turned = multiply(fromYaw(0.1), rolled);
    const inBody = attitudeError(rolled, turned);
    expect(inBody.y).toBeCloseTo(0.1, 12);
    expect(Math.abs(inBody.x) + Math.abs(inBody.z)).toBeLessThan(1e-12);
    // q and −q are one attitude; 350° one way is 10° the other.
    const far = fromYaw((350 * Math.PI) / 180);
    expect(attitudeError(IDENTITY, far).z).toBeCloseTo((-10 * Math.PI) / 180, 12);
    const negated = { w: -far.w, x: -far.x, y: -far.y, z: -far.z };
    expect(attitudeError(IDENTITY, negated).z).toBeCloseTo((-10 * Math.PI) / 180, 12);
    // A target need not be normalised.
    const scaled = { w: 3 * far.w, x: 0, y: 0, z: 3 * far.z };
    expect(attitudeError(IDENTITY, scaled).z).toBeCloseTo((-10 * Math.PI) / 180, 12);
  });

  it('asks for a rate along the error, zero inside the deadband and capped at the slew rate', () => {
    const inertial = (attitude: Quat) => ({ reference: 'inertial', attitude }) as const;
    // Inside the attitude deadband: nothing.
    expect(commandedRate(inertial(fromYaw(0.0019)), IDENTITY, settings)).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
    // Just outside: attitudeGain × (error − deadband).
    expect(commandedRate(inertial(fromYaw(0.012)), IDENTITY, settings)!.z).toBeCloseTo(
      settings.attitudeGain * 0.01,
      12,
    );
    // Far away: the slew rate, along the rotation that remains.
    const axis = unit(1, -2, 2);
    const far = commandedRate(inertial(fromAxisAngle(axis, 2)), IDENTITY, settings)!;
    expect(Math.hypot(far.x, far.y, far.z)).toBeCloseTo(settings.slewRate, 12);
    expect(far.x / settings.slewRate).toBeCloseTo(axis.x, 2);
    expect(far.y / settings.slewRate).toBeCloseTo(axis.y, 2);
    expect(far.z / settings.slewRate).toBeCloseTo(axis.z, 2);
    // A rate target is its own answer; the ship holds nothing else.
    const rate = { x: 0.001, y: -0.002, z: 0.003 };
    expect(commandedRate({ reference: 'rate', rate }, fromYaw(1), settings)).toEqual(rate);
    expect(commandedRate({ reference: 'free' }, IDENTITY, settings)).toBeUndefined();
    expect(commandedRate({ reference: 'prograde' }, IDENTITY, settings)).toBeUndefined();
  });

  it('asks for no torque inside the rate deadband, and the inertia tensor times the acceleration outside', () => {
    const state = createShipSystemsState(definition);
    const tensor = massDetail(state, definition).tensor;
    const at = (angularVelocity: Vec3): ShipKinematics => ({ ...RESTING, angularVelocity });
    const still = { reference: 'rate', rate: { x: 0, y: 0, z: 0 } } as const;
    expect(
      attitudeTorque(still, at({ x: 0.00039, y: -0.00039, z: 0.00039 }), tensor, settings),
    ).toBeUndefined();
    // Only the axis outside the band acts; the products of inertia put a little of that
    // torque on the other axes, so the acceleration is purely about z.
    const torque = attitudeTorque(still, at({ x: 0.0002, y: 0, z: 0.001 }), tensor, settings)!;
    const acceleration = {
      x:
        inverseSym3(tensor)[0] * torque.x +
        inverseSym3(tensor)[1] * torque.y +
        inverseSym3(tensor)[2] * torque.z,
      y:
        inverseSym3(tensor)[1] * torque.x +
        inverseSym3(tensor)[3] * torque.y +
        inverseSym3(tensor)[4] * torque.z,
      z:
        inverseSym3(tensor)[2] * torque.x +
        inverseSym3(tensor)[4] * torque.y +
        inverseSym3(tensor)[5] * torque.z,
    };
    expect(acceleration.x).toBeCloseTo(0, 12);
    expect(acceleration.y).toBeCloseTo(0, 12);
    expect(acceleration.z).toBeCloseTo(-settings.rateGain * 0.001, 12);
    expect(torque.z).toBeCloseTo(-settings.rateGain * 0.001 * tensor[5], 6);
    expect(torque.x).toBeCloseTo(-settings.rateGain * 0.001 * tensor[2], 6);
  });

  it('has a rate deadband wider than one minimum bit can cross, in every configuration', () => {
    // If one pair of minimum pulses changed a rate by more than the whole deadband, the jets
    // would answer each other for ever (the 12 kg/h of 2F's request 3).
    const bit = baseline.propulsion.rcs.minimumImpulsePerJet;
    const thrust = baseline.propulsion.rcs.thrustPerJet;
    const base = createShipSystemsState(definition);
    for (const configuration of definition.configurations) {
      const equipment = { ...base.equipment };
      for (const [key, value] of Object.entries(configuration.paramOverrides ?? {})) {
        const [id, param] = key.split('.');
        if (param === 'deployment')
          equipment[id!] = {
            ...equipment[id!]!,
            values: { ...equipment[id!]!.values, deployment: value },
          };
      }
      // The lightest ship turns the most per bit.
      const tanks = Object.fromEntries(Object.keys(base.tanks).map((id) => [id, 0]));
      const state: ShipSystemsState = {
        ...base,
        configuration: configuration.id,
        equipment,
        tanks,
      };
      const mass = massDetail(state, definition);
      const geometry = getGeometry(state, definition);
      const pods = definition.equipment.filter((e) => e.kind === 'rcs-thruster');
      const jets = pods.flatMap((pod, index) =>
        activeJets(definition, state, pod.id).map((jet) => ({
          pod: index,
          point: geometry.positions[pod.id]!,
          direction: jet.direction,
        })),
      );
      const inverse = inverseSym3(mass.tensor);
      for (const k of ['x', 'y', 'z'] as const) {
        const duty = allocateJets(
          jets,
          mass.properties.centerOfMass,
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0, [k]: 100 },
          { thrust, maxPerPod: 2, torquePriority: settings.torquePriority },
        );
        // Angular impulse when the busiest jet has earned one bit, and the rate it gives.
        const seconds = bit / (thrust * Math.max(...duty));
        const torque = wrenchOf(jets, duty, thrust, mass.properties.centerOfMass).torque;
        const index = { x: 0, y: 3, z: 5 }[k];
        const change = inverse[index]! * torque[k] * seconds;
        expect(change).toBeGreaterThan(0);
        expect(change).toBeLessThan(2 * settings.rateDeadband);
      }
    }
  });
});

describe('attitude controller: closed loop (rigid body integrated in the test)', () => {
  // `fly` (test-helpers.ts) steps the ship and integrates Euler's equations from the forces it
  // puts out, semi-implicit Euler at dt = 1 s. Nothing else acts on the ship.

  it('holds a quiet ship for nothing, and a drifting one for about a kilogram an hour', () => {
    const quiet = fly(definition, { duration: 3600, commands: hold(IDENTITY) });
    expect(quiet.rcsUsed).toBe(0);
    expect(quiet.kinematics.attitude).toEqual(IDENTITY);
    // Left with rates just inside the deadband on every axis (the worst a manoeuvre leaves
    // behind), the ship drifts to the edge of the band and is turned back by single bits.
    let worst = 0;
    const drifting = fly(definition, {
      duration: 7200,
      kinematics: { ...RESTING, angularVelocity: { x: 3e-4, y: -2e-4, z: 3.5e-4 } },
      commands: hold(IDENTITY),
      each: (_, __, kinematics) => {
        worst = Math.max(worst, angleBetween(kinematics.attitude, IDENTITY));
      },
    });
    // 2B's controller spent about 12 kg/h here (2F's request 3).
    expect(drifting.rcsUsed / 2).toBeGreaterThan(0.2);
    expect(drifting.rcsUsed / 2).toBeLessThan(1.5);
    // Held within about 0.6°: the attitude deadband plus the rate deadband's drift.
    expect(worst).toBeLessThan(0.012);
    expect(drifting.peakRate).toBeLessThan(0.001);
  });

  it('turns 90° and 180° in yaw and in pitch inside the star trackers’ rate limit', () => {
    const cases: [string, Quat, number, number][] = [
      // name, target, seconds allowed, kilograms allowed
      ['yaw 90°', fromYaw(Math.PI / 2), 230, 0.6],
      ['yaw −90°', fromYaw(-Math.PI / 2), 230, 0.6],
      ['yaw 180°', fromYaw(Math.PI), 430, 0.6],
      ['pitch 90°', pitchUp(Math.PI / 2), 230, 0.5],
      ['pitch 180°', pitchUp(Math.PI), 430, 0.5],
    ];
    for (const [name, target, seconds, kilograms] of cases) {
      let settledAt = Infinity;
      let usedToSettle = 0;
      let worstAfter = 0;
      const before = rcsPropellant(createShipSystemsState(definition));
      const run = fly(definition, {
        duration: 900,
        commands: hold(target),
        each: (_, state, kinematics) => {
          const error = angleBetween(kinematics.attitude, target);
          if (settledAt === Infinity && error < 0.012 && rateOf(kinematics) < 0.001) {
            settledAt = state.t;
            usedToSettle = before - rcsPropellant(state);
          }
          if (settledAt !== Infinity) worstAfter = Math.max(worstAfter, error);
        },
      });
      // 2B's controller peaked at 0.18 rad/s and spent 15–29 kg on a 180° turn.
      expect(run.peakRate, name).toBeLessThan(starLimit);
      expect(run.peakRate, name).toBeGreaterThan(0.9 * settings.slewRate);
      expect(settledAt, name).toBeLessThan(seconds);
      expect(usedToSettle, name).toBeGreaterThan(0.3);
      expect(usedToSettle, name).toBeLessThan(kilograms);
      // It stays there.
      expect(worstAfter, name).toBeLessThan(0.012);
      expect(run.rcsUsed, name).toBeLessThan(kilograms + 0.4);
    }
  });

  it('turns about an arbitrary axis on all three body axes at once', () => {
    const target = fromAxisAngle(unit(0.3, -0.6, 0.74), 2.1);
    const start: ShipKinematics = {
      ...RESTING,
      attitude: fromAxisAngle(unit(1, 1, 0), 0.4),
      angularVelocity: { x: 0.002, y: -0.003, z: 0.001 },
    };
    const run = fly(definition, { duration: 600, kinematics: start, commands: hold(target) });
    expect(angleBetween(run.kinematics.attitude, target)).toBeLessThan(0.012);
    expect(rateOf(run.kinematics)).toBeLessThan(0.001);
    expect(run.peakRate).toBeLessThan(starLimit);
    expect(run.rcsUsed).toBeLessThan(1.5);
    // The same flight at a tenth of the step agrees: the loop does not depend on dt = 1 s.
    const fine = fly(definition, {
      duration: 600,
      dt: 0.1,
      kinematics: start,
      commands: hold(target),
    });
    expect(angleBetween(fine.kinematics.attitude, target)).toBeLessThan(0.012);
    expect(fine.peakRate).toBeLessThan(starLimit);
    expect(Math.abs(fine.rcsUsed - run.rcsUsed)).toBeLessThan(0.3);
  });

  it('holds a commanded body rate on three axes', () => {
    const rate = { x: 0.002, y: -0.004, z: 0.005 };
    const run = fly(definition, {
      duration: 120,
      commands: (step) =>
        step === 0 ? [{ kind: 'attitude', target: { reference: 'rate', rate } }] : [],
    });
    const w = run.kinematics.angularVelocity;
    for (const k of ['x', 'y', 'z'] as const)
      expect(Math.abs(w[k] - rate[k])).toBeLessThan(1.5 * settings.rateDeadband);
    // The ship has really turned: about 0.8 rad in two minutes.
    expect(angleBetween(run.kinematics.attitude, IDENTITY)).toBeGreaterThan(0.6);
  });

  it('holds attitude through a main-engine burn with the gimbal carrying the thrust line', () => {
    // The hidden mount error and the off-axis centre of mass would spin the ship without the
    // gimbal; with it the jets only trim.
    const target = fromYaw(0.3);
    let burnForce: Vec3 | undefined;
    const run = fly(definition, {
      duration: 200,
      kinematics: { ...RESTING, attitude: target },
      commands: (step) =>
        step === 0
          ? [
              {
                kind: 'burn',
                thruster: 'main-engine',
                duration: 60,
                throttle: 1,
                attitude: { reference: 'inertial', attitude: target },
              },
            ]
          : [],
      each: (step, _, __, result) => {
        if (step === 30)
          burnForce = result.actuators.thrusts.find((t) => t.source === 'main-engine')?.force;
      },
    });
    expect(burnForce).toBeDefined();
    expect(angleBetween(run.kinematics.attitude, target)).toBeLessThan(0.012);
    expect(run.peakRate).toBeLessThan(0.002);
    expect(run.rcsUsed).toBeLessThan(0.5);
    // 24 kN for 60 s on about 30.1 t: 47.5 m/s, along the thrust line (1.1° off the body
    // axis, because the engine is 0.08 m to the left of and 0.10 m above the centre of mass).
    const speed = Math.hypot(
      run.kinematics.velocity.x,
      run.kinematics.velocity.y,
      run.kinematics.velocity.z,
    );
    expect(speed).toBeGreaterThan(47);
    expect(speed).toBeLessThan(48.5);
    const along = rotate(target, { x: 1, y: 0, z: 0 });
    const cosine =
      (run.kinematics.velocity.x * along.x +
        run.kinematics.velocity.y * along.y +
        run.kinematics.velocity.z * along.z) /
      speed;
    expect(Math.acos(cosine)).toBeGreaterThan(0.015);
    expect(Math.acos(cosine)).toBeLessThan(0.03);
  });

  it('replays exactly, also through a JSON save part way', () => {
    const target = fromAxisAngle(unit(0.2, 0.9, -0.4), 1.2);
    const whole = fly(definition, { duration: 300, commands: hold(target) });
    const again = fly(definition, { duration: 300, commands: hold(target) });
    expect(again.state).toEqual(whole.state);
    expect(again.kinematics).toEqual(whole.kinematics);
    const first = fly(definition, { duration: 120, commands: hold(target) });
    const resumed = fly(definition, {
      duration: 180,
      state: JSON.parse(JSON.stringify(first.state)) as ShipSystemsState,
      kinematics: JSON.parse(JSON.stringify(first.kinematics)) as ShipKinematics,
    });
    expect(resumed.state).toEqual(whole.state);
    expect(resumed.kinematics).toEqual(whole.kinematics);
    // Nothing the controller stores is lost in a save.
    expect(JSON.parse(JSON.stringify(whole.state))).toEqual(whole.state);
  });
});
