import baseline from '../../../data/ship-baseline.json';
import type { Measurement, ShipEvent } from '../../contracts/measurements.ts';
import type { EquipmentSpec, ShipDefinition } from '../../contracts/ship.ts';
import type {
  EquipmentState,
  EnvironmentEffects,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import { fromRotationVector, multiply, rotate, toRotationVector } from '../../lib/quat.ts';
import { createRng, type RngState } from '../../lib/rng.ts';
import { wrapAngle } from '../../lib/vec2.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { stepLatticeAcquisition } from './lattice.ts';
import { latticeDiagnosticSchedule, stepLatticeDiagnostic } from './lattice-diagnostic.ts';
import { sensorFunctionAvailable } from './function-available.ts';

type Sensing = typeof baseline.sensing;
type Recorder = typeof baseline.recorder;
interface Pointing {
  readonly target: string | null;
  /** Inertial direction to look along when no target is locked (need not be unit length). */
  readonly direction?: Vec3;
  readonly settleUntil?: number;
}
interface Scene {
  readonly starsVisible?: boolean;
  readonly opticsValid?: boolean;
  readonly visibility?: Readonly<Record<string, boolean>>;
  readonly knownSizeTargets?: readonly string[];
}
interface SensorMemory {
  readonly nextRecorderAt?: number;
  readonly nextSampleAt?: Readonly<Record<string, number>>;
  readonly capacityWarning?: boolean;
  /** Recorder dictionary state: repeated telemetry uses a channel reference, not another payload. */
  readonly packetValues?: Readonly<Record<string, readonly number[]>>;
  readonly nextPhysicalPacketAt?: number;
}

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));
const sensingOf = (definition?: ShipDefinition): Sensing =>
  (definition?.systems?.sensing as unknown as Sensing | undefined) ?? baseline.sensing;
const recorderOf = (definition?: ShipDefinition): Recorder =>
  (definition?.systems?.recorder as unknown as Recorder | undefined) ?? baseline.recorder;

/** C06: interpolated electrical cost, bounded by the 1C recorder operating points. */
export function requestedRecorderPower(rate: number, definition?: ShipDefinition): number {
  const r = recorderOf(definition);
  if (rate <= 0) return 0;
  if (rate <= r.minimumSampleRate) return r.powerMinimum;
  if (rate <= r.normalSampleRate) {
    return (
      r.powerMinimum +
      ((rate - r.minimumSampleRate) / (r.normalSampleRate - r.minimumSampleRate)) *
        (r.powerNormal - r.powerMinimum)
    );
  }
  return (
    r.powerNormal +
    ((Math.min(rate, r.highSampleRate) - r.normalSampleRate) /
      (r.highSampleRate - r.normalSampleRate)) *
      (r.powerHigh - r.powerNormal)
  );
}

/** Maximum acquisition cadence supported by actual recorder draw (not commanded watts). */
export function supportedRecorderRate(power: number, definition?: ShipDefinition): number {
  const r = recorderOf(definition);
  if (power < r.powerMinimum) return 0;
  if (power <= r.powerNormal) {
    return (
      r.minimumSampleRate +
      ((power - r.powerMinimum) / (r.powerNormal - r.powerMinimum)) *
        (r.normalSampleRate - r.minimumSampleRate)
    );
  }
  return (
    r.normalSampleRate +
    ((Math.min(power, r.powerHigh) - r.powerNormal) / (r.powerHigh - r.powerNormal)) *
      (r.highSampleRate - r.normalSampleRate)
  );
}

/**
 * The stream an instrument's out-of-plane components draw from: elevation, the z accelerometer
 * axis and its bias, the x and y gyro axes and their biases, the x and y parts of an attitude
 * fix. The planar components keep the instrument's own stream (`sensors.<id>`) in their old
 * order, so a planar flight records the same azimuths, ranges, x–y accelerations and yaw rates
 * as before the ship was three-dimensional.
 */
export const outOfPlaneStream = (id: string): string => `sensors.${id}/3d`;

/** Names are stable across saves; no stream is seeded during a step. */
export function sensorStreamNames(definition: ShipDefinition): string[] {
  const instruments = definition.equipment.filter((e) =>
    ['optical-tracker', 'accelerometer', 'gyro', 'star-tracker'].includes(e.kind),
  );
  return [
    ...instruments.map((e) => `sensors.${e.id}`),
    ...instruments.map((e) => outOfPlaneStream(e.id)),
  ];
}

/** Cosine below which an elevation counts as at the pole when widening the azimuth sigma. */
const POLE_COSINE = 1e-6;

/** Length of v. In-plane vectors use the planar form, which keeps planar ranges bit for bit. */
const lengthOf = (v: Vec3): number =>
  v.z === 0 ? Math.hypot(v.x, v.y) : Math.hypot(v.x, v.y, v.z);

/**
 * Angle between two directions, in [0, π]. A pair in the inertial x–y plane uses the
 * difference of their azimuths, as the planar ship did, which keeps planar records bit for bit.
 */
export function separation(a: Vec3, b: Vec3): number {
  if (a.z === 0 && b.z === 0)
    return Math.abs(wrapAngle(Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x)));
  const cx = a.y * b.z - a.z * b.y;
  const cy = a.z * b.x - a.x * b.z;
  const cz = a.x * b.y - a.y * b.x;
  return Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), a.x * b.x + a.y * b.y + a.z * b.z);
}

/**
 * Rate (rad/s) at which a target's image crosses the camera: the line of sight's angular
 * velocity minus the ship's, less any part about the line of sight itself (which turns the
 * image without moving a point target).
 */
export function apparentRate(
  relativePosition: Vec3,
  relativeVelocity: Vec3,
  range: number,
  shipRate: Vec3,
): number {
  if (!(range > 0)) return 0;
  const r = relativePosition;
  const v = relativeVelocity;
  const r2 = range * range;
  const wx = (r.y * v.z - r.z * v.y) / r2 - shipRate.x;
  const wy = (r.z * v.x - r.x * v.z) / r2 - shipRate.y;
  const wz = (r.x * v.y - r.y * v.x) / r2 - shipRate.z;
  const along = (wx * r.x + wy * r.y + wz * r.z) / r2;
  const px = wx - along * r.x;
  const py = wy - along * r.y;
  const pz = wz - along * r.z;
  return Math.sqrt(px * px + py * py + pz * pz);
}

function available(e: EquipmentState | undefined, t: number): e is EquipmentState {
  return sensorFunctionAvailable(e, t) && e.powerDraw > 0;
}

function nextCadence(previous: number | undefined, t: number, rate: number): number {
  const scheduled = previous ?? t;
  return scheduled + (Math.floor(Math.max(0, (t - scheduled) * rate) + 1e-9) + 1) / rate;
}

/** C01/C14: angular error and its range-dependent transverse projection. */
export function opticalQuality(
  power: number,
  range: number,
  condition: number,
  exposure: number,
  pointingError = 0,
  halfAngle = Math.PI / 6,
  definition?: ShipDefinition,
): { angularSigma: number; transverseSigma: number; exposure: number } | undefined {
  const c = sensingOf(definition).camera;
  if (
    power < c.minTrackingPower ||
    condition <= 0 ||
    range <= 0 ||
    Math.abs(pointingError) > halfAngle
  ) {
    return undefined;
  }
  const actualExposure = clamp(exposure, c.minExposure, c.maxExposure);
  const angularSigma =
    (Math.max(
      c.angularFloor,
      c.nominalAngularSigma *
        Math.sqrt(c.referenceTrackingPower / Math.min(power, c.maxUsefulPower)) *
        Math.sqrt(c.referenceExposure / actualExposure),
    ) /
      Math.min(1, condition)) *
    (1 + Math.abs(pointingError) / halfAngle);
  return { angularSigma, transverseSigma: range * angularSigma, exposure: actualExposure };
}

/**
 * C01/C05/C06: acquire one timestamped snapshot when the recorder and instrument are due.
 * The environment describes only one instant. A long step never fabricates intermediate
 * observations; requested cadence therefore requires a sufficiently small game timestep.
 */
export function stepSensors(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
): { state: ShipSystemsState; measurements: Measurement[]; events: ShipEvent[] } {
  const sensing = sensingOf(definition);
  const recorder = recorderOf(definition);
  const memory = (state.ext?.sensors as unknown as SensorMemory | undefined) ?? {};
  const pointing =
    (state.ext?.sensorPointing as unknown as Record<string, Pointing> | undefined) ?? {};
  const scene = (env.fieldSignals['ship-environment'] as unknown as Scene | undefined) ?? {};
  const equipment: Record<string, EquipmentState> = { ...state.equipment };
  const rng: Record<string, RngState> = { ...state.rng };
  const nextSampleAt = { ...memory.nextSampleAt };
  const measurements: Measurement[] = [];
  const events: ShipEvent[] = [];
  const recording = equipment[recorder.equipmentId];
  const physicalRate = available(recording, env.t)
    ? supportedRecorderRate(recording.powerDraw, definition)
    : 0;
  const rate = Math.min(state.recorder.sampleRate, physicalRate);
  const latticeAvailable = Object.values(env.fieldSignals).some(
    (signal) =>
      !!signal &&
      typeof signal === 'object' &&
      'kind' in signal &&
      signal.kind === 'lattice-scene-v1',
  );
  const diagnostic = latticeAvailable
    ? latticeDiagnosticSchedule(state, definition, env)
    : { due: false, rate: 0 };
  const physicalPacketReady =
    !latticeAvailable || env.t + 1e-10 >= (memory.nextPhysicalPacketAt ?? env.t);
  const scienceCapacity = Math.max(0, state.recorder.capacity - recorder.reservedEventCapacity);
  const capacityAvailable = state.recorder.bytesUsed + recorder.bytesPerSample <= scienceCapacity;
  const capacityWarning = !capacityAvailable;
  if (capacityWarning && !memory.capacityWarning) {
    events.push({
      kind: 'equipment-fault',
      t: env.t,
      equipment: recorder.equipmentId,
      fault: 'Recorder acquisition capacity exhausted; retained records unchanged.',
    });
  }

  // Restart readiness after power loss, even when no recording packet is due.
  for (const spec of definition.equipment) {
    const e = equipment[spec.id];
    if (
      spec.kind === 'optical-tracker' &&
      e &&
      (e.condition <= 0 ||
        e.tripped ||
        e.mode === 'off' ||
        e.powerDraw < sensing.camera.minTrackingPower)
    ) {
      equipment[spec.id] = {
        ...e,
        values: {
          ...e.values,
          readyAt: env.t + dt + sensing.camera.warmupTime + sensing.camera.calibrationTime,
        },
      };
    }
  }
  const due =
    rate > 0 &&
    capacityAvailable &&
    physicalPacketReady &&
    env.t + 1e-10 >= (memory.nextRecorderAt ?? env.t);
  const packetDue =
    capacityAvailable &&
    physicalPacketReady &&
    (due || (diagnostic.due && physicalRate >= diagnostic.rate));
  const attitude = env.kinematics.attitude;
  /** Body rates (what the gyros sense) and the same angular velocity in the inertial frame. */
  const bodyRate = env.kinematics.angularVelocity;
  const inertialRate = rotate(attitude, bodyRate);
  const rateMagnitude = Math.sqrt(
    bodyRate.x * bodyRate.x + bodyRate.y * bodyRate.y + bodyRate.z * bodyRate.z,
  );

  if (due) {
    for (const spec of definition.equipment) {
      const e = equipment[spec.id];
      if (!available(e, env.t)) continue;
      const temperature =
        (spec.thermalNode ? state.thermal[spec.thermalNode] : undefined) ?? e.temperature;
      if (
        temperature !== undefined &&
        (temperature < (spec.params.tempMin ?? -Infinity) ||
          temperature >= (spec.params.tempMax ?? Infinity))
      )
        continue;
      let sampleRate = 0;
      if (spec.kind === 'optical-tracker')
        sampleRate = Math.min(rate, e.powerDraw / sensing.camera.referenceTrackingPower);
      if (spec.kind === 'accelerometer' || spec.kind === 'gyro')
        sampleRate = sensing.imu.sampleRate;
      if (spec.kind === 'star-tracker') sampleRate = sensing.starTracker.sampleRate;
      if (sampleRate <= 0 || env.t + 1e-10 < (nextSampleAt[spec.id] ?? env.t)) continue;
      nextSampleAt[spec.id] = nextCadence(nextSampleAt[spec.id], env.t, sampleRate);
      const streamName = `sensors.${spec.id}`;
      const saved = rng[streamName];
      if (!saved) throw new Error(`Missing initialized sensor RNG stream: ${streamName}`);
      const noise = createRng(0);
      noise.setState(saved);
      // The out-of-plane components draw from their own stream (see `outOfPlaneStream`).
      const streamName3d = outOfPlaneStream(spec.id);
      const saved3d = rng[streamName3d];
      if (!saved3d) throw new Error(`Missing initialized sensor RNG stream: ${streamName3d}`);
      const noise3d = createRng(0);
      noise3d.setState(saved3d);
      const condition = clamp(e.condition, Number.EPSILON, 1);
      // A diagnosed condition is an instrument belief, not a free report of hidden damage.
      const reportedCondition = clamp(e.values.reportedCondition ?? e.condition, Number.EPSILON, 1);
      const emit = (
        kind: Measurement['kind'],
        value: number[],
        sigma: number[],
        target?: string,
      ) => {
        measurements.push({ kind, t: env.t, source: spec.id, target, value, sigma });
      };

      if (spec.kind === 'optical-tracker') {
        const c = sensing.camera;
        const aim = pointing[spec.id];
        const exposure = clamp(
          e.values.exposure ?? c.referenceExposure,
          c.minExposure,
          c.maxExposure,
        );
        const halfAngle = spec.params.fovHalfAngle ?? Math.PI / 6;
        const valid =
          env.t >= (e.values.readyAt ?? 0) &&
          env.t >= (aim?.settleUntil ?? 0) &&
          scene.opticsValid !== false;
        if (valid) {
          const locked = aim?.target
            ? env.targets.find((target) => target.id === aim.target)
            : undefined;
          // Where the camera looks, inertial: at its locked target, along the commanded
          // direction, or along its mount's boresight carried by the ship's attitude.
          const boresight = locked
            ? locked.relativePosition
            : (aim?.direction ?? rotate(attitude, spec.mount?.direction ?? { x: 1, y: 0, z: 0 }));
          for (const target of env.targets) {
            if (
              (aim?.target && target.id !== aim.target) ||
              scene.visibility?.[target.id] === false
            )
              continue;
            const line = target.relativePosition;
            const bearing = Math.atan2(line.y, line.x);
            const elevation = Math.atan2(line.z, Math.hypot(line.x, line.y));
            const range = lengthOf(line);
            // C14: target drift can smear even when the ship is not rotating. A target
            // lock selects boresight; this stub does not assume a perfect slew servo.
            if (
              apparentRate(line, target.relativeVelocity, range, inertialRate) * exposure >
              c.maxSmearAngle
            )
              continue;
            // The field of view is a cone about the boresight.
            const quality = opticalQuality(
              e.powerDraw,
              range,
              condition,
              exposure,
              separation(line, boresight),
              halfAngle,
              definition,
            );
            if (!quality) continue;
            const reportedQuality =
              reportedCondition === condition
                ? quality
                : opticalQuality(
                    e.powerDraw,
                    range,
                    reportedCondition,
                    exposure,
                    separation(line, boresight),
                    halfAngle,
                    definition,
                  )!;
            // An isotropic pointing error on the sphere: the same angle in elevation and across
            // it, which is 1 / cos(elevation) wider in azimuth (guarded at the poles).
            const sigmaAzimuth = quality.angularSigma / Math.max(Math.cos(elevation), POLE_COSINE);
            emit(
              'bearing',
              [
                wrapAngle(noise.normal(bearing, sigmaAzimuth)),
                clamp(noise3d.normal(elevation, quality.angularSigma), -Math.PI / 2, Math.PI / 2),
              ],
              [
                reportedQuality.angularSigma / Math.max(Math.cos(elevation), POLE_COSINE),
                reportedQuality.angularSigma,
              ],
              target.id,
            );
            if (scene.knownSizeTargets?.includes(target.id)) {
              const sigmaRange = Math.max(c.rangeFloor, c.rangePriorFraction * range) / condition;
              emit(
                'range',
                [noise.normal(range, sigmaRange)],
                [Math.max(c.rangeFloor, c.rangePriorFraction * range) / reportedCondition],
                target.id,
              );
            }
          }
        }
      } else if (spec.kind === 'accelerometer' || spec.kind === 'gyro') {
        if (e.powerDraw + 1e-9 >= modePower(spec, e, definition)) {
          // Persistent biases, drawn once: the x and y accelerometer axes and the z gyro from
          // the instrument's own stream (as the planar ship did), the rest from the 3D stream.
          const biasX = e.values.biasX ?? noise.normal(0, sensing.imu.accelerationBias);
          const biasY = e.values.biasY ?? noise.normal(0, sensing.imu.accelerationBias);
          const gyroBias = e.values.gyroBias ?? noise.normal(0, sensing.imu.gyroBias);
          const biasZ = e.values.biasZ ?? noise3d.normal(0, sensing.imu.accelerationBias);
          const gyroBiasX = e.values.gyroBiasX ?? noise3d.normal(0, sensing.imu.gyroBias);
          const gyroBiasY = e.values.gyroBiasY ?? noise3d.normal(0, sensing.imu.gyroBias);
          equipment[spec.id] = {
            ...e,
            values: { ...e.values, biasX, biasY, gyroBias, biasZ, gyroBiasX, gyroBiasY },
          };
          if (spec.kind === 'accelerometer') {
            const sigma = sensing.imu.accelerationSigma / condition;
            // EnvironmentEffects already supplies COM specific force; no gravity or position read.
            emit(
              'accel',
              [
                noise.normal(env.specificForce.x + biasX, sigma),
                noise.normal(env.specificForce.y + biasY, sigma),
                noise3d.normal(env.specificForce.z + biasZ, sigma),
              ],
              Array(3).fill(sensing.imu.accelerationSigma / reportedCondition) as number[],
            );
          }
          const sigma = sensing.imu.gyroSigma / condition;
          emit(
            'rate',
            [
              noise3d.normal(bodyRate.x + gyroBiasX, sigma),
              noise3d.normal(bodyRate.y + gyroBiasY, sigma),
              noise.normal(bodyRate.z + gyroBias, sigma),
            ],
            Array(3).fill(sensing.imu.gyroSigma / reportedCondition) as number[],
          );
        }
      } else if (
        spec.kind === 'star-tracker' &&
        scene.starsVisible !== false &&
        rateMagnitude <= sensing.starTracker.maxAngularRate &&
        e.powerDraw + 1e-9 >= modePower(spec, e, definition)
      ) {
        const sigma = sensing.starTracker.angularSigma / condition;
        // The measured attitude is the true one turned by a small independent error about each
        // body axis; the fix is its rotation vector (a yaw ψ about inertial +z is [0, 0, ψ]).
        const errorZ = noise.normal(0, sigma);
        const error = { x: noise3d.normal(0, sigma), y: noise3d.normal(0, sigma), z: errorZ };
        const fix = toRotationVector(multiply(attitude, fromRotationVector(error)));
        emit(
          'attitude',
          [fix.x + 0, fix.y + 0, fix.z + 0],
          Array(3).fill(sensing.starTracker.angularSigma / reportedCondition) as number[],
        );
      }
      rng[streamName] = noise.getState();
      rng[streamName3d] = noise3d.getState();
    }

    const telemetry = (owner: string, quantity: string, value: number, source = owner) => {
      measurements.push({
        kind: 'telemetry',
        t: env.t,
        source,
        channel: `${owner}.${quantity}`,
        value: [value],
        sigma: [0],
      });
    };
    for (const e of Object.values(equipment)) {
      telemetry(e.id, 'power', e.powerDraw);
      telemetry(e.id, 'allocation', e.allocation);
      telemetry(e.id, 'condition', e.values.reportedCondition ?? e.condition);
      if (e.values.charge !== undefined) telemetry(e.id, 'charge', e.values.charge);
      if (e.values.output !== undefined) telemetry(e.id, 'output', e.values.output);
      if (e.values.generatedPower !== undefined)
        telemetry(e.id, 'generated-power', e.values.generatedPower);
      if (e.values.unmetPower !== undefined) telemetry(e.id, 'unmet-power', e.values.unmetPower);
    }
    for (const [tank, mass] of Object.entries(state.tanks))
      telemetry(tank, 'propellant', mass, recorder.equipmentId);
    for (const [node, temperature] of Object.entries(state.thermal))
      telemetry(node, 'temperature', temperature, recorder.equipmentId);
    const power = state.ext?.power as
      { readonly buses?: Record<string, Record<string, number>> } | undefined;
    for (const [bus, ledger] of Object.entries(power?.buses ?? {})) {
      for (const [quantity, value] of Object.entries(ledger)) {
        if (Number.isFinite(value)) telemetry(bus, quantity, value, recorder.equipmentId);
      }
    }
    telemetry(recorder.equipmentId, 'bytes', state.recorder.bytesUsed + recorder.bytesPerSample);
    telemetry(recorder.equipmentId, 'sample-rate', Math.min(rate, 1 / dt));
  }

  const packetValues = latticeAvailable ? { ...memory.packetValues } : undefined;
  let ordinaryBytes = 64;
  if (packetValues)
    for (const m of measurements) {
      const key = `${m.source}/${m.kind}/${m.channel ?? ''}/${m.target ?? ''}`;
      const payload = [...m.value, ...m.sigma];
      const previous = packetValues[key];
      const unchanged =
        previous?.length === payload.length && payload.every((v, i) => v === previous[i]);
      // Fixed channel dictionaries and repeated-value references are lossless. New readings retain
      // all Float64 values and every nonzero declared sigma; no quantization buys extra coverage.
      ordinaryBytes += unchanged
        ? 2
        : 8 + 8 * m.value.length + (m.sigma.some((s) => s !== 0) ? 8 * m.sigma.length : 0);
      packetValues[key] = payload;
    }
  const ordinaryState: ShipSystemsState = {
    ...state,
    equipment,
    rng,
    recorder: {
      ...state.recorder,
      bytesUsed: state.recorder.bytesUsed + (packetDue ? recorder.bytesPerSample : 0),
    },
    ext: {
      ...state.ext,
      sensors: {
        nextRecorderAt: due
          ? nextCadence(memory.nextRecorderAt, env.t, rate)
          : (memory.nextRecorderAt ?? env.t),
        nextSampleAt,
        capacityWarning,
        ...(packetValues ? { packetValues } : {}),
        ...(latticeAvailable
          ? {
              nextPhysicalPacketAt: packetDue
                ? env.t + 1 / physicalRate
                : (memory.nextPhysicalPacketAt ?? env.t),
            }
          : {}),
      },
    },
  };
  // Packet dictionaries identify the fixed housekeeping channels. Numeric values/sigmas and
  // a timestamp/source header still consume real capacity before optional frame fragments.
  const spareBytes = packetDue ? Math.max(0, recorder.bytesPerSample - ordinaryBytes) : 0;
  const tile =
    latticeAvailable && packetDue
      ? stepLatticeDiagnostic(ordinaryState, definition, env, spareBytes)
      : { state: ordinaryState, measurements: [], bytes: 0 };
  const lattice = latticeAvailable
    ? stepLatticeAcquisition(
        tile.state,
        definition,
        env,
        dt,
        Math.max(0, spareBytes - tile.bytes),
        rate,
      )
    : { state: tile.state, measurements: [] };
  return {
    state: lattice.state,
    measurements: [...measurements, ...tile.measurements, ...lattice.measurements],
    events,
  };
}

function modePower(spec: EquipmentSpec, e: EquipmentState, definition: ShipDefinition): number {
  const hardware =
    (definition.systems?.equipment as unknown as typeof baseline.equipment | undefined) ??
    baseline.equipment;
  const modes = hardware.find((entry) => entry.id === spec.id)?.modes as
    Record<string, { power: number }> | undefined;
  return modes?.[e.mode]?.power ?? spec.ratedPower;
}
