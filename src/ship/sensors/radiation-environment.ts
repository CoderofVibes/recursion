/** TRUTH ONLY. Point input for A24's physical monitor, separate from component exposure. */
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { EnvironmentField } from '../../contracts/truth/fields.ts';
import type { EnvironmentEffects, ShipSystemsState } from '../../contracts/truth/ship.ts';
import { rotate } from '../../lib/quat.ts';
import { add, sub } from '../../lib/vec3.ts';
import { getGeometry } from '../config/index.ts';
import { RADIATION_MONITOR } from './radiation-spec.ts';

/**
 * Raw U at the detector's configured point, before instrument response/noise/saturation.
 * The ship position is its current COM, while equipment coordinates use the body datum.
 * Neither per-component maxima nor accumulated component dose are instrument inputs.
 * Missing hardware or invalid physical input is unavailable, never a fabricated zero.
 */
export function sampleRadiationAtMonitor(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  fields: readonly EnvironmentField[],
): number | undefined {
  const host = RADIATION_MONITOR.host;
  if (!state.equipment[host] || !definition.equipment.some((equipment) => equipment.id === host))
    return undefined;
  const bodyPoint = getGeometry(state, definition).positions[host];
  if (!bodyPoint || !Number.isFinite(env.t)) return undefined;
  const point = add(
    env.kinematics.position,
    rotate(env.kinematics.attitude, sub(bodyPoint, state.massProperties.centerOfMass)),
  );
  if (![point.x, point.y, point.z].every(Number.isFinite)) return undefined;
  let rate = 0;
  for (const field of fields) {
    if (!field.intensity) continue;
    const contribution = field.intensity(point, env.t);
    if (!Number.isFinite(contribution) || contribution < 0) return undefined;
    rate += contribution;
    if (!Number.isFinite(rate)) return undefined;
  }
  return rate;
}

/**
 * Supplies only one truth-side detector scalar. Sensor processing alone may make a
 * recorded measurement from it. An empty valid field list explicitly supplies zero;
 * absent hardware/invalid input removes any earlier signal instead of retaining it.
 */
export function withRadiationMonitorInput(
  env: EnvironmentEffects,
  state: ShipSystemsState,
  definition: ShipDefinition,
  fields: readonly EnvironmentField[],
): EnvironmentEffects {
  const rate = sampleRadiationAtMonitor(state, definition, env, fields);
  const key = RADIATION_MONITOR.inputKey;
  if (rate === undefined) {
    if (!(key in env.fieldSignals)) return env;
    const { [key]: _previous, ...fieldSignals } = env.fieldSignals;
    return { ...env, fieldSignals };
  }
  return {
    ...env,
    fieldSignals: {
      ...env.fieldSignals,
      [key]: { kind: 'radiation-monitor-input-v1', t: env.t, rate },
    },
  };
}
