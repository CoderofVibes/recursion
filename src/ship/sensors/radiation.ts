/** Truth-side A24 instrument. Only a single detector-point input reaches this channel. */
import type { Measurement } from '../../contracts/measurements.ts';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { createRng } from '../../lib/rng.ts';
import { functionAvailable } from '../condition/index.ts';
import { modeOf } from '../power/baseline.ts';
import { functionalPower } from './functional-power.ts';
import { encodeRadiationReading } from './radiation-observations.ts';
import { RADIATION_MONITOR as spec } from './radiation-spec.ts';

interface MonitorMemory {
  readonly at: number;
  readonly until: number;
  readonly input: number;
  readonly response: number;
  readonly readyAt: number;
  readonly nextSampleAt: number;
  /** The latest reading sensed on board (R52), recorded or not: the flight computer's. */
  readonly sensed?: Measurement;
  /** That reading was above the caution threshold (or saturated): the next one below crosses it. */
  readonly above?: boolean;
}

/** Only initialization/migration may derive a stream. Never reseed during acquisition. */
export function initializeRadiationMonitorStream(
  state: ShipSystemsState,
  seed: string | number,
): ShipSystemsState {
  if (state.rng[spec.stream]) return state;
  return {
    ...state,
    rng: { ...state.rng, [spec.stream]: createRng(seed).stream(spec.stream).getState() },
  };
}

function pointRate(env: EnvironmentEffects): number | undefined {
  const input = env.fieldSignals[spec.inputKey];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const point = input as Readonly<Record<string, JsonValue>>;
  if (
    point.kind !== 'radiation-monitor-input-v1' ||
    point.t !== env.t ||
    typeof point.rate !== 'number' ||
    !Number.isFinite(point.rate) ||
    point.rate < 0
  )
    return;
  return point.rate;
}

function enabled(state: ShipSystemsState, definition: ShipDefinition, t: number): boolean {
  const e = state.equipment[spec.host];
  const hardware = definition.equipment.find((e) => e.id === spec.host);
  if (!e || !hardware || !functionAvailable(e, t) || !['active', 'standby'].includes(e.mode))
    return false;
  const required = modeOf(definition, spec.host, e.mode).power;
  const temperature =
    (hardware.thermalNode ? state.thermal[hardware.thermalNode] : undefined) ?? e.temperature;
  return (
    required > 0 &&
    functionalPower(e) + 1e-9 >= required &&
    temperature !== undefined &&
    temperature >= (hardware.params.tempMin ?? -Infinity) &&
    temperature < (hardware.params.tempMax ?? Infinity)
  );
}

function memoryOf(state: ShipSystemsState): MonitorMemory | undefined {
  return state.ext?.radiationMonitor as unknown as MonitorMemory | undefined;
}

/** Called every actual physics sample, even when no recorder packet is due.
 * The previous point value is held only across the explicitly supplied interval.
 * A later snapshot cannot retroactively illuminate a missing interval. */
export function advanceRadiationMonitor(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
): ShipSystemsState {
  if (!(dt > 0) || !Number.isFinite(dt) || !Number.isFinite(env.t))
    throw new RangeError('Invalid monitor interval');
  const input = pointRate(env);
  const old = memoryOf(state);
  if (input === undefined || !enabled(state, definition, env.t)) {
    if (!old) return state;
    const ext = { ...state.ext };
    delete ext.radiationMonitor;
    return { ...state, ext };
  }
  const elapsed = old ? env.t - old.at : 0;
  const continuous = old && elapsed >= 0 && env.t <= old.until + 1e-9;
  const response = continuous
    ? old.response + (old.input - old.response) * -Math.expm1(-elapsed / spec.responseTime)
    : 0;
  const next: MonitorMemory = {
    at: env.t,
    until: env.t + dt,
    input,
    response,
    readyAt: continuous ? old.readyAt : env.t + spec.responseTime,
    nextSampleAt: continuous ? old.nextSampleAt : env.t + spec.responseTime,
    // The last reading stays the flight computer's latest; a gap restarts the crossing watch.
    ...(old?.sensed ? { sensed: old.sensed } : {}),
    ...(continuous && old.above ? { above: true } : {}),
  };
  return { ...state, ext: { ...state.ext, radiationMonitor: next as unknown as JsonValue } };
}

export function radiationMonitorDue(state: ShipSystemsState, t: number): boolean {
  const memory = memoryOf(state);
  return !!memory && memory.at === t && t >= memory.readyAt && t + 1e-10 >= memory.nextSampleAt;
}

/**
 * R52 (owner): which readings sensed on board go into the Black Box. Those at the player's chosen
 * recorder rate (`recorderDue`: the ordinary packet is due now, so the reading rides in it), every
 * reading above the caution threshold or saturated, and the first reading back below it, so the
 * spike before a failure stays in the record in full. The rest stay on board.
 */
export function radiationRecorded(
  reading: Measurement,
  wasAbove: boolean,
  recorderDue: boolean,
): { readonly record: boolean; readonly above: boolean } {
  const rate = reading.value[0]!;
  const above = rate > spec.hazardThreshold || reading.value[1] === 1;
  return { record: recorderDue || above || wasAbove, above };
}

/**
 * One reading sensed on board now (R52): the flight computer has it, and the session's caution
 * reads it, whether or not it is recorded. `record` says whether it goes into the record
 * (`radiationRecorded`); a packet must still take it. No backlog replay.
 */
export function senseRadiationMonitor(
  state: ShipSystemsState,
  t: number,
  recorderDue: boolean,
  /** The recorder's physical packet interval, s: the monitor senses no faster, as before R52. */
  packetInterval = 0,
): { state: ShipSystemsState; reading?: Measurement; record: boolean } {
  const memory = memoryOf(state);
  const sensed = recordRadiationMonitor(state, t);
  const reading = sensed.measurements[0];
  if (!memory || !reading) return { state, record: false };
  const policy = radiationRecorded(reading, memory.above === true, recorderDue);
  const after = memoryOf(sensed.state)!;
  return {
    state: {
      ...sensed.state,
      ext: {
        ...sensed.state.ext,
        radiationMonitor: {
          ...after,
          nextSampleAt: Math.max(after.nextSampleAt, t + packetInterval),
          sensed: reading,
          above: policy.above,
        } as unknown as JsonValue,
      },
    },
    reading,
    record: policy.record,
  };
}

/** The latest reading the monitor sensed on board (R52), recorded or not. */
export function latestRadiationReading(state: ShipSystemsState): Measurement | undefined {
  return memoryOf(state)?.sensed;
}

/**
 * One current sample only, drawn now (the monitor's sensing step; `senseRadiationMonitor` adds
 * R52's recording decision). No backlog replay.
 */
export function recordRadiationMonitor(
  state: ShipSystemsState,
  t: number,
): {
  state: ShipSystemsState;
  measurements: Measurement[];
} {
  const memory = memoryOf(state);
  if (!memory || !radiationMonitorDue(state, t)) return { state, measurements: [] };
  const saved = state.rng[spec.stream];
  if (!saved)
    throw new Error(
      'Missing radiation monitor RNG: initialize the legacy save with its known seed',
    );
  const e = state.equipment[spec.host]!;
  const nominal = Math.max(
    spec.noiseFloor,
    spec.relativeNoise * Math.min(memory.response, spec.saturationRate),
  );
  const health = (n: number) => Math.max(Number.EPSILON, Math.min(1, n));
  const noise = createRng(0);
  noise.setState(saved);
  const draw = noise.normal(memory.response, nominal / health(e.condition));
  const rate = Math.max(0, Math.min(spec.saturationRate, draw));
  // Estimate uncertainty from the readout, never encode the noiseless response in sigma.
  const sigma =
    Math.max(spec.noiseFloor, spec.relativeNoise * rate) /
    health(e.values.reportedCondition ?? e.condition);
  const reading = encodeRadiationReading({
    version: 1,
    source: spec.host,
    t,
    rate,
    sigma,
    saturated: draw >= spec.saturationRate,
    responseTime: spec.responseTime,
    saturationRate: spec.saturationRate,
    validUntil: t + spec.validity,
  });
  return {
    state: {
      ...state,
      rng: { ...state.rng, [spec.stream]: noise.getState() },
      ext: {
        ...state.ext,
        radiationMonitor: {
          ...memory,
          nextSampleAt: t + 1 / (e.mode === 'standby' ? spec.standbySampleRate : spec.sampleRate),
        } as unknown as JsonValue,
      },
    },
    measurements: [reading],
  };
}
