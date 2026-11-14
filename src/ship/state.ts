import baseline from '../../data/ship-baseline.json';
import type { ShipDefinition } from '../contracts/ship.ts';
import type { EquipmentState, ShipSystemsState } from '../contracts/truth/ship.ts';
import { createRng } from '../lib/rng.ts';
import { loadShipDefinition } from './definition.ts';
import { computeMassProperties } from './massprops/index.ts';

/** A fresh physical arrival. Recurrence/archive ownership remains with the game layer. */
export function createShipSystemsState(
  definition: ShipDefinition = loadShipDefinition(),
  seed: string | number = 'recursion-ship',
): ShipSystemsState {
  const data = (definition.systems ?? baseline) as unknown as typeof baseline;
  const thermal = Object.fromEntries(
    data.thermalNodes.map((node) => [node.id, node.initialTemperature]),
  );
  const equipment = Object.fromEntries(
    definition.equipment.map((e): [string, EquipmentState] => {
      const values: Record<string, number> = {};
      if (e.kind === 'battery') values.charge = data.generation.battery.initialEnergyPerPack;
      if (e.kind === 'power-source') values.output = data.generation.fuelCell.initialPowerPerStack;
      if (e.kind === 'optical-tracker')
        values.readyAt = data.sensing.camera.warmupTime + data.sensing.camera.calibrationTime;
      if (e.kind === 'rcs-thruster')
        Object.assign(values, {
          readyTime: data.propulsion.rcs.warmupTime,
          bank: 0,
          selectedJet: 0,
        });
      if (e.id === 'main-engine') values.gimbal = 0;
      const deployment = definition.configurations.find(
        (c) => c.id === definition.defaultConfiguration,
      )?.paramOverrides?.[`${e.id}.deployment`];
      if (deployment !== undefined) values.deployment = deployment;
      return [
        e.id,
        {
          id: e.id,
          mode: e.defaultMode,
          allocation: e.ratedPower,
          powerDraw: 0,
          condition: 1,
          tripped: false,
          temperature: e.thermalNode ? thermal[e.thermalNode] : undefined,
          faults: [],
          values,
        },
      ];
    }),
  );
  const root = createRng(seed);
  const streams = definition.equipment
    .filter((e) => ['optical-tracker', 'accelerometer', 'star-tracker', 'gyro'].includes(e.kind))
    .map((e) => `sensors.${e.id}`);
  const state: ShipSystemsState = {
    t: 0,
    configuration: definition.defaultConfiguration,
    equipment,
    tanks: Object.fromEntries(
      [...data.propellant, ...data.reactants].map((tank) => [tank.id, tank.initialMass]),
    ),
    thermal,
    recorder: {
      sampleRate: data.recorder.normalSampleRate,
      bytesUsed: 0,
      capacity: data.recorder.capacity,
    },
    exposure: {},
    attitudeTarget: { reference: 'free' },
    burns: [],
    massProperties: { mass: 0, centerOfMass: { x: 0, y: 0 }, inertia: 0, footprint: [] },
    rng: Object.fromEntries(streams.map((name) => [name, root.stream(name).getState()])),
    ext: {},
  };
  return { ...state, massProperties: computeMassProperties(state, definition) };
}
