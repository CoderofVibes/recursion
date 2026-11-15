import type { ShipDefinition } from '../contracts/ship.ts';
import type { EquipmentState, ShipSystemsStep } from '../contracts/truth/ship.ts';
import { applyCommands } from './commands.ts';
import { prepareConfiguration, stepConfiguration } from './config/index.ts';
import { computeMassProperties } from './massprops/index.ts';
import { stepPower } from './power/index.ts';
import { preparePropulsion, stepPropulsion } from './propulsion/index.ts';
import { stepSensors } from './sensors/index.ts';
import { stepThermal } from './thermal/index.ts';

export { loadShipDefinition } from './definition.ts';
export { createShipSystemsState } from './state.ts';
export { computeMassProperties } from './massprops/index.ts';
// Thrust as designed, for drawing it without reading truth (see README § Drawing thrust).
export {
  handsOnFirings,
  nominalJets,
  type NominalFiring,
  type NominalJet,
} from './propulsion/nominal.ts';

import type { HandsOnInput } from '../contracts/commands.ts';
import type { Vec3 } from '../lib/vec3.ts';
import { controlSettings, handsOnRate } from './propulsion/control.ts';

/**
 * The body rate (rad/s) the ship's flight software turns to for a hands-on yaw and pitch
 * demand: yaw about +z, pitch about −y, roll zero, scaled so a diagonal never exceeds the
 * hands-on turn rate. The same law the ship step uses, so a navigator can follow a stick the
 * moment it moves instead of waiting for the next star-tracker fix.
 */
export const handsOnBodyRate = (
  definition: ShipDefinition,
  input: Pick<HandsOnInput, 'yaw' | 'pitch'>,
): Vec3 => handsOnRate(input, controlSettings(definition));

const SENSING_KINDS = new Set(['optical-tracker', 'accelerometer', 'star-tracker', 'gyro']);
const sensorIdTables = new WeakMap<ShipDefinition, readonly string[]>();
/** Ids of the instruments the sensor step owns, found once per definition. */
function sensorIdsOf(definition: ShipDefinition): readonly string[] {
  let ids = sensorIdTables.get(definition);
  if (!ids) {
    ids = definition.equipment.filter((e) => SENSING_KINDS.has(e.kind)).map((e) => e.id);
    sensorIdTables.set(definition, ids);
  }
  return ids;
}

/** Pure contract entry point. Resource integration is over [t,t+dt]; scene samples are valid at t. */
export const stepShipSystems: ShipSystemsStep = (input, definition, commands, environment, dt) => {
  if (!Number.isFinite(dt) || dt <= 0)
    throw new RangeError('Ship systems dt must be finite and positive.');
  if (
    !Number.isFinite(input.t) ||
    !Number.isFinite(environment.t) ||
    Math.abs(input.t - environment.t) > 1e-6
  ) {
    throw new RangeError('Environment snapshot must be at the current ship systems time.');
  }
  const commanded = applyCommands(input, definition, commands);
  const prepared = preparePropulsion(
    prepareConfiguration(commanded.state, definition),
    definition,
    environment,
  );
  const power = stepPower(prepared, definition, environment, dt);

  // Never label an end-of-step tank/temperature/charge reading as a start-of-step scene sample.
  // PowerDraw/output are the just-dispatched interval rates; physical inventory readings use t.
  // (A record is copied only where its start-of-step reading differs from the dispatched one.)
  const atStart: Record<string, EquipmentState> = {};
  for (const [id, e] of Object.entries(power.state.equipment)) {
    const before = input.equipment[id];
    const temperature = before?.temperature ?? e.temperature;
    const charge =
      e.values.charge === undefined ? undefined : (before?.values.charge ?? e.values.charge);
    atStart[id] =
      temperature === e.temperature && charge === e.values.charge
        ? e
        : {
            ...e,
            temperature,
            values: charge === undefined ? e.values : { ...e.values, charge },
          };
  }
  const sampled = stepSensors(
    {
      ...power.state,
      tanks: input.tanks,
      thermal: input.thermal,
      massProperties: input.massProperties,
      equipment: atStart,
    },
    definition,
    environment,
    dt,
  );
  // Only the instruments keep what the sensor step did to them (readiness, biases).
  const dispatched = { ...power.state.equipment };
  for (const id of sensorIdsOf(definition)) {
    const sensed = sampled.state.equipment[id];
    if (sensed && dispatched[id]) dispatched[id] = sensed;
  }
  const configured = stepConfiguration(
    {
      ...power.state,
      recorder: sampled.state.recorder,
      rng: sampled.state.rng,
      ext: sampled.state.ext,
      equipment: dispatched,
    },
    definition,
    dt,
  );
  const propulsion = stepPropulsion(configured.state, definition, environment, dt);
  const thermal = stepThermal(propulsion.state, definition, environment, dt);
  const state = {
    ...thermal.state,
    t: input.t + dt,
    massProperties: computeMassProperties(thermal.state, definition),
  };
  return {
    state,
    actuators: {
      thrusts: propulsion.thrusts,
      torque: propulsion.torque,
      massProperties: state.massProperties,
    },
    measurements: sampled.measurements,
    events: [
      ...commanded.events,
      ...power.events,
      ...sampled.events,
      ...configured.events,
      ...propulsion.events,
      ...thermal.events,
    ].sort((a, b) => a.t - b.t),
  };
};

/** Short alias for the ShipSystemsStep contract used by the game loop. */
export const step = stepShipSystems;
