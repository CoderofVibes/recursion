import baseline from '../../../data/ship-baseline.json';
import type { Measurement, ShipEvent } from '../../contracts/measurements.ts';
import type { EquipmentSpec, ShipDefinition } from '../../contracts/ship.ts';
import type {
  EquipmentState,
  EnvironmentEffects,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import { createRng, type RngState } from '../../lib/rng.ts';
import { wrapAngle } from '../../lib/vec2.ts';

type Sensing = typeof baseline.sensing;
type Recorder = typeof baseline.recorder;
interface Pointing {
  readonly target: string | null;
  readonly angle?: number;
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

/** Names are stable across saves; no stream is seeded during a step. */
export function sensorStreamNames(definition: ShipDefinition): string[] {
  return definition.equipment
    .filter((e) => ['optical-tracker', 'accelerometer', 'gyro', 'star-tracker'].includes(e.kind))
    .map((e) => `sensors.${e.id}`);
}

function available(e: EquipmentState | undefined): e is EquipmentState {
  return !!e && e.condition > 0 && !e.tripped && e.mode !== 'off' && e.powerDraw > 0;
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
  const rate = available(recording)
    ? Math.min(state.recorder.sampleRate, supportedRecorderRate(recording.powerDraw, definition))
    : 0;
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
      (!available(e) || e.powerDraw < sensing.camera.minTrackingPower)
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
  const due = rate > 0 && capacityAvailable && env.t + 1e-10 >= (memory.nextRecorderAt ?? env.t);

  if (due) {
    for (const spec of definition.equipment) {
      const e = equipment[spec.id];
      if (!available(e)) continue;
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
      const condition = clamp(e.condition, Number.EPSILON, 1);
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
          const boresight = locked
            ? Math.atan2(locked.relativePosition.y, locked.relativePosition.x)
            : (aim?.angle ??
              env.kinematics.attitude +
                Math.atan2(spec.mount?.direction.y ?? 0, spec.mount?.direction.x ?? 1));
          for (const target of env.targets) {
            if (
              (aim?.target && target.id !== aim.target) ||
              scene.visibility?.[target.id] === false
            )
              continue;
            const bearing = Math.atan2(target.relativePosition.y, target.relativePosition.x);
            const range = Math.hypot(target.relativePosition.x, target.relativePosition.y);
            // C14: target drift can smear even when the ship is not rotating. A target
            // lock selects boresight; this stub does not assume a perfect slew servo.
            const apparentRate =
              range > 0
                ? (target.relativePosition.x * target.relativeVelocity.y -
                    target.relativePosition.y * target.relativeVelocity.x) /
                    (range * range) -
                  env.kinematics.angularRate
                : 0;
            if (Math.abs(apparentRate) * exposure > c.maxSmearAngle) continue;
            const quality = opticalQuality(
              e.powerDraw,
              range,
              condition,
              exposure,
              wrapAngle(bearing - boresight),
              halfAngle,
              definition,
            );
            if (!quality) continue;
            emit(
              'bearing',
              [wrapAngle(noise.normal(bearing, quality.angularSigma))],
              [quality.angularSigma],
              target.id,
            );
            if (scene.knownSizeTargets?.includes(target.id)) {
              const sigmaRange = Math.max(c.rangeFloor, c.rangePriorFraction * range) / condition;
              emit('range', [noise.normal(range, sigmaRange)], [sigmaRange], target.id);
            }
          }
        }
      } else if (spec.kind === 'accelerometer' || spec.kind === 'gyro') {
        if (e.powerDraw + 1e-9 >= modePower(spec, e, definition)) {
          const biasX = e.values.biasX ?? noise.normal(0, sensing.imu.accelerationBias);
          const biasY = e.values.biasY ?? noise.normal(0, sensing.imu.accelerationBias);
          const gyroBias = e.values.gyroBias ?? noise.normal(0, sensing.imu.gyroBias);
          equipment[spec.id] = { ...e, values: { ...e.values, biasX, biasY, gyroBias } };
          if (spec.kind === 'accelerometer') {
            const sigma = sensing.imu.accelerationSigma / condition;
            // EnvironmentEffects already supplies COM specific force; no gravity or position read.
            emit(
              'accel',
              [
                noise.normal(env.specificForce.x + biasX, sigma),
                noise.normal(env.specificForce.y + biasY, sigma),
              ],
              [sigma, sigma],
            );
          }
          const sigma = sensing.imu.gyroSigma / condition;
          emit('rate', [noise.normal(env.kinematics.angularRate + gyroBias, sigma)], [sigma]);
        }
      } else if (
        spec.kind === 'star-tracker' &&
        scene.starsVisible !== false &&
        Math.abs(env.kinematics.angularRate) <= sensing.starTracker.maxAngularRate &&
        e.powerDraw + 1e-9 >= modePower(spec, e, definition)
      ) {
        const sigma = sensing.starTracker.angularSigma / condition;
        emit('attitude', [wrapAngle(noise.normal(env.kinematics.attitude, sigma))], [sigma]);
      }
      rng[streamName] = noise.getState();
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
      telemetry(e.id, 'condition', e.condition);
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

  return {
    state: {
      ...state,
      equipment,
      rng,
      recorder: {
        ...state.recorder,
        bytesUsed: state.recorder.bytesUsed + (due ? recorder.bytesPerSample : 0),
      },
      ext: {
        ...state.ext,
        sensors: {
          nextRecorderAt: due
            ? nextCadence(memory.nextRecorderAt, env.t, rate)
            : (memory.nextRecorderAt ?? env.t),
          nextSampleAt,
          capacityWarning,
        },
      },
    },
    measurements,
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
