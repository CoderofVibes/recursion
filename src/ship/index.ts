import type { ShipSystemsStep } from '../contracts/truth/ship.ts';
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
  const sampled = stepSensors(
    {
      ...power.state,
      tanks: input.tanks,
      thermal: input.thermal,
      massProperties: input.massProperties,
      equipment: Object.fromEntries(
        Object.entries(power.state.equipment).map(([id, e]) => [
          id,
          {
            ...e,
            temperature: input.equipment[id]?.temperature ?? e.temperature,
            values:
              e.values.charge === undefined
                ? e.values
                : { ...e.values, charge: input.equipment[id]?.values.charge ?? e.values.charge },
          },
        ]),
      ),
    },
    definition,
    environment,
    dt,
  );
  const sensingKinds = new Set(['optical-tracker', 'accelerometer', 'star-tracker', 'gyro']);
  const sensorIds = new Set(
    definition.equipment.filter((e) => sensingKinds.has(e.kind)).map((e) => e.id),
  );
  const configured = stepConfiguration(
    {
      ...power.state,
      recorder: sampled.state.recorder,
      rng: sampled.state.rng,
      ext: sampled.state.ext,
      equipment: Object.fromEntries(
        Object.entries(power.state.equipment).map(([id, e]) => [
          id,
          sensorIds.has(id) ? sampled.state.equipment[id]! : e,
        ]),
      ),
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
