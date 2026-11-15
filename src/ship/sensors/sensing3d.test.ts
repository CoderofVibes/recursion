import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import { isotropicInertia } from '../../contracts/ship.ts';
import type {
  EnvironmentEffects,
  EquipmentState,
  ShipKinematics,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import {
  angleBetween,
  fromAxisAngle,
  fromRotationVector,
  fromYaw,
  IDENTITY,
  multiply,
  yawOf,
  type Quat,
} from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import { wrapAngle } from '../../lib/vec2.ts';
import { fromAzEl, type Vec3 } from '../../lib/vec3.ts';
import { loadShipDefinition } from '../definition.ts';
import { environment, RESTING, target } from '../test-helpers.ts';
import {
  apparentRate,
  outOfPlaneStream,
  sensorStreamNames,
  separation,
  stepSensors,
} from './index.ts';

const definition = loadShipDefinition();
const camera = baseline.sensing.camera;
const SEED = 'sensing-3d';
const deg = Math.PI / 180;

/** Every instrument powered and ready, with fresh noise streams from `seed`. */
function initial(seed = SEED): ShipSystemsState {
  const equipment = Object.fromEntries(
    definition.equipment.map((spec): [string, EquipmentState] => [
      spec.id,
      {
        id: spec.id,
        mode: spec.defaultMode,
        allocation: spec.ratedPower,
        powerDraw: spec.id === 'camera' ? 120 : spec.id === 'black-box' ? 35 : spec.ratedPower,
        condition: 1,
        tripped: false,
        temperature: 293,
        faults: [],
        values: { readyAt: 0 },
      },
    ]),
  );
  return {
    t: 100,
    configuration: definition.defaultConfiguration,
    equipment,
    tanks: {},
    thermal: { cabin: 293, service: 293 },
    recorder: { sampleRate: 10, bytesUsed: 0, capacity: baseline.recorder.capacity },
    exposure: {},
    attitudeTarget: { reference: 'free' },
    burns: [],
    massProperties: {
      mass: 30374,
      centerOfMass: { x: 0, y: 0, z: 0 },
      inertia: isotropicInertia(1),
      hull: [],
    },
    rng: Object.fromEntries(
      sensorStreamNames(definition).map((name) => [name, createRng(seed).stream(name).getState()]),
    ),
  };
}
const scene = (
  kinematics: Partial<ShipKinematics>,
  extra: Partial<EnvironmentEffects> = {},
): EnvironmentEffects => environment(initial(), { ...RESTING, ...kinematics }, extra);
const sense = (env: EnvironmentEffects, state = initial()) =>
  stepSensors(state, definition, env, 0.02);
const of = (result: ReturnType<typeof stepSensors>, kind: string, source?: string) =>
  result.measurements.filter((m) => m.kind === kind && (!source || m.source === source));
const pitchUp = (angle: number): Quat => fromAxisAngle({ x: 0, y: -1, z: 0 }, angle);
/** The planar stream of an instrument, as a generator starting where the state starts. */
const planarStream = (id: string) => createRng(SEED).stream(`sensors.${id}`);

describe('camera in three dimensions (C01, C14)', () => {
  it('reports a bearing as azimuth and elevation with an isotropic pointing error', () => {
    // A target 40° to the left and 25° up, 20 km away, with the camera pointed at it.
    const line = fromAzEl(40 * deg, 25 * deg, 20000);
    const state = {
      ...initial(),
      ext: { sensorPointing: { camera: { target: 'rock', settleUntil: 0 } } },
    };
    const bearing = of(sense(scene({}, { targets: [target('rock', line)] }), state), 'bearing')[0]!;
    const sigma = camera.nominalAngularSigma; // 120 W, reference exposure, on boresight
    expect(bearing.sigma[1]).toBe(sigma);
    expect(bearing.sigma[0]).toBeCloseTo(sigma / Math.cos(25 * deg), 15);
    expect(Math.abs(bearing.value[0]! - 40 * deg)).toBeLessThan(5 * bearing.sigma[0]!);
    expect(Math.abs(bearing.value[1]! - 25 * deg)).toBeLessThan(5 * bearing.sigma[1]!);
    // The two components come from different streams and are not the truth.
    expect(bearing.value[0]).not.toBe(40 * deg);
    expect(bearing.value[1]).not.toBe(25 * deg);
    // Straight overhead the azimuth is undefined: its sigma is huge but finite.
    const overhead = of(
      sense(scene({}, { targets: [target('rock', { x: 0, y: 0, z: 5000 })] }), state),
      'bearing',
    )[0]!;
    expect(Number.isFinite(overhead.sigma[0])).toBe(true);
    expect(overhead.sigma[0]).toBeGreaterThan(1);
    expect(overhead.value[1]).toBeLessThanOrEqual(Math.PI / 2);
    expect(overhead.value[1]).toBeGreaterThan(Math.PI / 2 - 5 * sigma);
  });

  it('sees a cone about its boresight, which the ship’s attitude carries in 3D', () => {
    const halfAngle = camera.fovHalfAngle;
    expect(halfAngle).toBeCloseTo(30 * deg, 12);
    const at = (azimuth: number, elevation: number) => [
      target('rock', fromAzEl(azimuth * deg, elevation * deg, 10000)),
    ];
    const seen = (targets: ReturnType<typeof at>, attitude: Quat = IDENTITY) =>
      of(sense(scene({ attitude }, { targets })), 'bearing').length;
    // Level ship, boresight along +x: inside the cone up, down, left and right, and outside it.
    expect(seen(at(0, 25))).toBe(1);
    expect(seen(at(0, -25))).toBe(1);
    expect(seen(at(25, 0))).toBe(1);
    expect(seen(at(0, 35))).toBe(0);
    expect(seen(at(0, -35))).toBe(0);
    // A cone, not a box: 25° left and 25° up is 34.8° off the axis.
    expect(separation(fromAzEl(25 * deg, 25 * deg), { x: 1, y: 0, z: 0 })).toBeGreaterThan(
      halfAngle,
    );
    expect(seen(at(25, 25))).toBe(0);
    // Pitch the nose up 60° and the camera sees what is up there, not what is ahead.
    expect(seen(at(0, 60), pitchUp(60 * deg))).toBe(1);
    expect(seen(at(0, 0), pitchUp(60 * deg))).toBe(0);
    // The error grows toward the edge of the field: twice the on-axis sigma at the edge.
    const off = of(sense(scene({}, { targets: at(0, 15) })), 'bearing')[0]!;
    expect(off.sigma[1]).toBeCloseTo(camera.nominalAngularSigma * 1.5, 12);
  });

  it('points along a 3D direction or locks onto an object anywhere', () => {
    const rock = target('rock', fromAzEl(-120 * deg, -50 * deg, 8000));
    const env = scene({}, { targets: [rock, target('other', { x: 9000, y: 0, z: 0 })] });
    // Unpointed: only what the nose sees.
    expect(of(sense(env), 'bearing').map((m) => m.target)).toEqual(['other']);
    // Along a direction (any length): what lies that way.
    const along = {
      ...initial(),
      ext: {
        sensorPointing: {
          camera: {
            target: null,
            direction: { ...fromAzEl(-118 * deg, -48 * deg, 7) },
            settleUntil: 0,
          },
        },
      },
    };
    expect(of(sense(env, along), 'bearing').map((m) => m.target)).toEqual(['rock']);
    // Locked: the object alone, at the on-axis sigma.
    const locked = {
      ...initial(),
      ext: { sensorPointing: { camera: { target: 'rock', settleUntil: 0 } } },
    };
    const fix = of(sense(env, locked), 'bearing');
    expect(fix.map((m) => m.target)).toEqual(['rock']);
    expect(fix[0]!.sigma[1]).toBe(camera.nominalAngularSigma);
    expect(Math.abs(fix[0]!.value[1]! + 50 * deg)).toBeLessThan(5 * fix[0]!.sigma[1]!);
  });

  it('smears on the apparent angular rate in three dimensions', () => {
    const limit = camera.maxSmearAngle / camera.referenceExposure; // 0.002 rad/s
    const line = { x: 10000, y: 0, z: 0 };
    const still = { x: 0, y: 0, z: 0 };
    // Across the line of sight, in or out of the plane: speed over range.
    expect(apparentRate(line, { x: 0, y: 30, z: 0 }, 10000, still)).toBeCloseTo(0.003, 15);
    expect(apparentRate(line, { x: 0, y: 0, z: 30 }, 10000, still)).toBeCloseTo(0.003, 15);
    expect(apparentRate(line, { x: 0, y: 18, z: 24 }, 10000, still)).toBeCloseTo(0.003, 15);
    // Along the line of sight: none.
    expect(apparentRate(line, { x: 500, y: 0, z: 0 }, 10000, still)).toBe(0);
    // The ship turning about an axis across the line of sight smears; about the line of sight
    // itself it only rolls the picture.
    expect(apparentRate(line, still, 10000, { x: 0, y: 0.004, z: 0 })).toBeCloseTo(0.004, 15);
    expect(apparentRate(line, still, 10000, { x: 0.004, y: 0, z: 0 })).toBe(0);
    // The ship turning with the target cancels its drift.
    expect(apparentRate(line, { x: 0, y: 30, z: 0 }, 10000, { x: 0, y: 0, z: 0.003 })).toBeCloseTo(
      0,
      15,
    );
    // And the camera obeys it.
    const seen = (velocity: Vec3, angularVelocity: Vec3 = still) =>
      of(
        sense(scene({ angularVelocity }, { targets: [target('rock', line, velocity)] })),
        'bearing',
      ).length;
    expect(limit).toBeCloseTo(0.002, 12);
    expect(seen({ x: 0, y: 0, z: 10 })).toBe(1);
    expect(seen({ x: 0, y: 0, z: 30 })).toBe(0);
    expect(seen(still, { x: 0, y: 0.004, z: 0 })).toBe(0);
    expect(seen(still, { x: 0.004, y: 0, z: 0 })).toBe(1);
    // Body rates are turned into the inertial frame by the attitude: with the nose up 90°,
    // a body-x rate is about inertial z and crosses a target that lies along inertial y.
    const overhead = [target('rock', { x: 0, y: 10000, z: 0 })];
    const aim = {
      ...initial(),
      ext: { sensorPointing: { camera: { target: 'rock', settleUntil: 0 } } },
    };
    const rolling = scene(
      { attitude: pitchUp(90 * deg), angularVelocity: { x: 0.004, y: 0, z: 0 } },
      { targets: overhead },
    );
    expect(of(sense(rolling, aim), 'bearing')).toHaveLength(0);
  });
});

describe('inertial unit and star trackers in three dimensions (C05)', () => {
  it('senses specific force and rate on three body axes, each with its own bias', () => {
    const force = { x: 0.3, y: -0.2, z: 0.5 };
    const rate = { x: 0.001, y: -0.002, z: 0.003 };
    const env = scene({ angularVelocity: rate }, { specificForce: force });
    const first = sense(env);
    const imu = baseline.sensing.imu;
    for (const source of ['imu-a', 'imu-b']) {
      const accel = of(first, 'accel', source)[0]!;
      const gyro = of(first, 'rate', source)[0]!;
      const values = first.state.equipment[source]!.values;
      // Persistent biases on every axis, drawn once.
      for (const key of ['biasX', 'biasY', 'biasZ'])
        expect(Math.abs(values[key]!)).toBeLessThan(5 * imu.accelerationBias);
      for (const key of ['gyroBias', 'gyroBiasX', 'gyroBiasY'])
        expect(Math.abs(values[key]!)).toBeLessThan(5 * imu.gyroBias);
      expect(values.biasZ).not.toBe(0);
      (['x', 'y', 'z'] as const).forEach((axis, i) => {
        const bias = values[['biasX', 'biasY', 'biasZ'][i]!]!;
        const gyroBias = values[['gyroBiasX', 'gyroBiasY', 'gyroBias'][i]!]!;
        expect(Math.abs(accel.value[i]! - force[axis] - bias)).toBeLessThan(
          5 * imu.accelerationSigma,
        );
        expect(Math.abs(gyro.value[i]! - rate[axis] - gyroBias)).toBeLessThan(5 * imu.gyroSigma);
      });
      expect(accel.sigma).toEqual([
        imu.accelerationSigma,
        imu.accelerationSigma,
        imu.accelerationSigma,
      ]);
      expect(gyro.sigma).toEqual([imu.gyroSigma, imu.gyroSigma, imu.gyroSigma]);
    }
    // The biases stay: a later sample differs from the first only by noise.
    const later = stepSensors(first.state, definition, { ...env, t: 100.02 }, 0.02);
    expect(later.state.equipment['imu-a']!.values.biasZ).toBe(
      first.state.equipment['imu-a']!.values.biasZ,
    );
    // A bias the game set (a hidden parameter) is used, not drawn.
    const set = initial();
    const given: ShipSystemsState = {
      ...set,
      equipment: {
        ...set.equipment,
        'imu-a': { ...set.equipment['imu-a']!, values: { readyAt: 0, biasZ: 0.01 } },
      },
    };
    const biased = of(sense(scene({}), given), 'accel', 'imu-a')[0]!;
    expect(biased.value[2]).toBeCloseTo(0.01, 3);
    // Gravity is not sensed on any axis (P7): a different orbit, the same reading.
    const elsewhere = sense({
      ...env,
      kinematics: {
        ...env.kinematics,
        position: { x: 1e8, y: -3e7, z: 5e7 },
        velocity: { x: 900, y: 100, z: -700 },
      },
    });
    expect(of(elsewhere, 'accel')).toEqual(of(first, 'accel'));
  });

  it('fixes the attitude as a rotation vector with an error about each body axis', () => {
    const attitude = multiply(
      fromYaw(1.1),
      multiply(pitchUp(0.4), fromAxisAngle({ x: 1, y: 0, z: 0 }, -0.7)),
    );
    const result = sense(scene({ attitude }));
    const sigma = baseline.sensing.starTracker.angularSigma;
    const fixes = of(result, 'attitude');
    expect(fixes).toHaveLength(2);
    for (const fix of fixes) {
      expect(fix.sigma).toEqual([sigma, sigma, sigma]);
      const measured = fromRotationVector({ x: fix.value[0]!, y: fix.value[1]!, z: fix.value[2]! });
      // Within a few sigma of the truth on three axes, and not the truth itself.
      const error = angleBetween(measured, attitude);
      expect(error).toBeGreaterThan(0);
      expect(error).toBeLessThan(5 * sigma * Math.sqrt(3));
    }
    // The two heads err independently.
    expect(fixes[0]!.value).not.toEqual(fixes[1]!.value);
    // A planar attitude still reads [~0, ~0, yaw].
    const planar = of(sense(scene({ attitude: fromYaw(-2.5) })), 'attitude')[0]!;
    expect(Math.abs(planar.value[0]!)).toBeLessThan(5 * sigma * 2);
    expect(Math.abs(planar.value[1]!)).toBeLessThan(5 * sigma * 2);
    expect(Math.abs(planar.value[2]! + 2.5)).toBeLessThan(5 * sigma);
  });

  it('loses the stars on the magnitude of the angular velocity, about any axis', () => {
    const limit = baseline.sensing.starTracker.maxAngularRate;
    const count = (angularVelocity: Vec3) =>
      of(sense(scene({ angularVelocity })), 'attitude').length;
    expect(count({ x: 0, y: 0, z: 0.99 * limit })).toBe(2);
    expect(count({ x: 0, y: 1.01 * limit, z: 0 })).toBe(0);
    expect(count({ x: 1.01 * limit, y: 0, z: 0 })).toBe(0);
    // Each axis under the limit, the total over it.
    expect(count({ x: 0.7 * limit, y: 0.7 * limit, z: 0.3 * limit })).toBe(0);
    expect(count({ x: 0.5 * limit, y: 0.5 * limit, z: 0.5 * limit })).toBe(2);
  });
});

describe('seeded noise: the planar components keep their streams (P2)', () => {
  it('has one more stream per instrument for the out-of-plane components', () => {
    const names = sensorStreamNames(definition);
    for (const id of ['camera', 'imu-a', 'imu-b', 'star-tracker-a', 'star-tracker-b']) {
      expect(names).toContain(`sensors.${id}`);
      expect(names).toContain(outOfPlaneStream(id));
    }
    expect(names).toHaveLength(10);
    expect(new Set(names).size).toBe(10);
    // A state without them is not silently reseeded.
    const state = initial();
    const { [outOfPlaneStream('imu-a')]: _dropped, ...rest } = state.rng;
    expect(() => sense(scene({}), { ...state, rng: rest })).toThrow(/sensors\.imu-a\/3d/);
  });

  it('draws azimuth, range, x–y acceleration, yaw rate and the yaw error exactly as the planar ship did', () => {
    // A planar scene: target, velocity, force, attitude and rate all in the x–y plane.
    const line = { x: 9000, y: 2500, z: 0 };
    const env = scene(
      { attitude: fromYaw(0.2), angularVelocity: { x: 0, y: 0, z: 0.0015 } },
      {
        targets: [target('known', line, { x: 0, y: 5, z: 0 })],
        specificForce: { x: 0.4, y: -0.1, z: 0 },
        fieldSignals: { 'ship-environment': { knownSizeTargets: ['known'] } },
      },
    );
    const result = sense(env);

    // Camera: one normal for the azimuth, then one for the range, from `sensors.camera`,
    // with the planar ship's formulas (2B): azimuth = atan2(y, x), off-axis angle the
    // difference of azimuths, range = hypot(x, y).
    const optical = planarStream('camera');
    const azimuth = Math.atan2(line.y, line.x);
    const offAxis = Math.abs(wrapAngle(azimuth - yawOf(fromYaw(0.2))));
    const sigma = camera.nominalAngularSigma * (1 + offAxis / camera.fovHalfAngle);
    const range = Math.hypot(line.x, line.y);
    const bearing = of(result, 'bearing')[0]!;
    expect(bearing.sigma[0]).toBe(sigma);
    expect(bearing.value[0]).toBe(wrapAngle(optical.normal(azimuth, sigma)));
    const sigmaRange = Math.max(camera.rangeFloor, camera.rangePriorFraction * range);
    expect(of(result, 'range')[0]!.value[0]).toBe(optical.normal(range, sigmaRange));
    expect(result.state.rng['sensors.camera']).toEqual(optical.getState());
    // The elevation of an in-plane target is noise about zero, from the other stream.
    expect(bearing.value[1]).not.toBe(0);
    expect(Math.abs(bearing.value[1]!)).toBeLessThan(5 * sigma);

    // Inertial unit: bias x, bias y, gyro bias, then acceleration x, y, then the yaw rate.
    const imu = baseline.sensing.imu;
    const inertial = planarStream('imu-a');
    const biasX = inertial.normal(0, imu.accelerationBias);
    const biasY = inertial.normal(0, imu.accelerationBias);
    const gyroBias = inertial.normal(0, imu.gyroBias);
    const accel = of(result, 'accel', 'imu-a')[0]!;
    expect(accel.value[0]).toBe(inertial.normal(0.4 + biasX, imu.accelerationSigma));
    expect(accel.value[1]).toBe(inertial.normal(-0.1 + biasY, imu.accelerationSigma));
    expect(of(result, 'rate', 'imu-a')[0]!.value[2]).toBe(
      inertial.normal(0.0015 + gyroBias, imu.gyroSigma),
    );
    expect(result.state.rng['sensors.imu-a']).toEqual(inertial.getState());

    // Star tracker: one normal for the error about body z. The fix's z component is the yaw
    // plus that error, to the second order of the errors about x and y (below 1e-8 rad).
    const stars = planarStream('star-tracker-a');
    const errorZ = stars.normal(0, baseline.sensing.starTracker.angularSigma);
    const fix = of(result, 'attitude', 'star-tracker-a')[0]!;
    expect(fix.value[2]).toBeCloseTo(0.2 + errorZ, 8);
    expect(result.state.rng['sensors.star-tracker-a']).toEqual(stars.getState());
  });

  it('leaves the planar streams and planar readings alone when the scene leaves the plane', () => {
    const flat = scene(
      { angularVelocity: { x: 0, y: 0, z: 0.001 } },
      {
        specificForce: { x: 0.4, y: -0.1, z: 0 },
        targets: [target('rock', { x: 9000, y: 500, z: 0 })],
      },
    );
    const lifted = scene(
      { angularVelocity: { x: 0.0005, y: -0.0008, z: 0.001 } },
      {
        specificForce: { x: 0.4, y: -0.1, z: 0.7 },
        targets: [target('rock', { x: 9000, y: 500, z: 2000 })],
      },
    );
    const a = sense(flat);
    const b = sense(lifted);
    for (const source of ['imu-a', 'imu-b']) {
      const accelA = of(a, 'accel', source)[0]!;
      const accelB = of(b, 'accel', source)[0]!;
      expect(accelB.value[0]).toBe(accelA.value[0]);
      expect(accelB.value[1]).toBe(accelA.value[1]);
      expect(accelB.value[2]! - accelA.value[2]!).toBeCloseTo(0.7, 12);
      const rateA = of(a, 'rate', source)[0]!;
      const rateB = of(b, 'rate', source)[0]!;
      expect(rateB.value[2]).toBe(rateA.value[2]);
      expect(rateB.value[0]! - rateA.value[0]!).toBeCloseTo(0.0005, 12);
      expect(rateB.value[1]! - rateA.value[1]!).toBeCloseTo(-0.0008, 12);
    }
    expect(of(a, 'bearing')).toHaveLength(1);
    expect(of(b, 'bearing')).toHaveLength(1);
    // Every stream has advanced by the same draws in both scenes.
    expect(b.state.rng).toEqual(a.state.rng);
    // And the two families of streams are independent: reseeding the 3D ones changes no
    // planar component.
    const reseeded = initial();
    const other = initial('another-seed');
    const mixed: ShipSystemsState = {
      ...reseeded,
      rng: Object.fromEntries(
        Object.entries(reseeded.rng).map(([name, value]) => [
          name,
          name.endsWith('/3d') ? other.rng[name]! : value,
        ]),
      ),
    };
    const c = sense(lifted, mixed);
    expect(of(c, 'bearing')[0]!.value[0]).toBe(of(b, 'bearing')[0]!.value[0]);
    expect(of(c, 'bearing')[0]!.value[1]).not.toBe(of(b, 'bearing')[0]!.value[1]);
    expect(of(c, 'accel', 'imu-a')[0]!.value[0]).toBe(of(b, 'accel', 'imu-a')[0]!.value[0]);
    expect(of(c, 'accel', 'imu-a')[0]!.value[2]).not.toBe(of(b, 'accel', 'imu-a')[0]!.value[2]);
  });
});
