/**
 * TRUTH fixtures: the mock encounter's real world at arrival, an example ship-systems state
 * and environment effects. For simulation (2A), ship systems (2B) and game-layer (2F) work.
 * Belief-side code may not import this file (lint-enforced, P11).
 */

import { createRng } from '../../lib/rng.ts';
import * as v from '../../lib/vec2.ts';
import type {
  EquipmentState,
  EnvironmentEffects,
  ShipSystemsState,
  TruthWorld,
} from '../truth/index.ts';
import type { EncounterDefinition } from '../truth/encounter.ts';
import { briefing, mockMassProperties, mockShipDefinition } from './index.ts';
import {
  ARRIVAL,
  MOCK_BODIES,
  TRUE_EXPONENT,
  TRUE_IMU_BIAS_X,
  TRUE_THRUST_SCALE,
  buildMockScenario,
  trueCoupling,
} from './generate.ts';

const SEED = 'gravity-range-mock';
const NOISE_STREAMS = ['sensors.optical', 'sensors.imu', 'sensors.star-tracker', 'telemetry'];

const dryMass =
  mockShipDefinition.structureMass + mockShipDefinition.equipment.reduce((s, e) => s + e.mass, 0);
const arrivalPropellant = ARRIVAL.mass - dryMass;

export const mockShipSystemsState: ShipSystemsState = {
  t: 0,
  configuration: 'stowed',
  equipment: Object.fromEntries(
    mockShipDefinition.equipment.map((e): [string, EquipmentState] => [
      e.id,
      {
        id: e.id,
        mode: e.defaultMode,
        allocation: e.ratedPower,
        powerDraw: e.ratedPower,
        condition: 1,
        temperature: 293,
        faults: [],
        values: e.kind === 'battery' ? { charge: 1.5e8 } : {},
      },
    ]),
  ),
  tanks: { 'tank-main': arrivalPropellant },
  thermal: { 'node-avionics': 293, 'node-power': 300, 'node-prop': 288 },
  recorder: { sampleRate: 2, bytesUsed: 0, capacity: 2e10 },
  dose: {},
  attitudeTarget: { reference: 'prograde' },
  burns: [],
  massProperties: mockMassProperties(mockShipDefinition, 'stowed', arrivalPropellant),
  rng: Object.fromEntries(
    NOISE_STREAMS.map((name) => [name, createRng(SEED).stream(name).getState()]),
  ),
};

const scenario = buildMockScenario();

export const mockTruthWorld: TruthWorld = {
  t: 0,
  law: { exponent: TRUE_EXPONENT },
  bodies: MOCK_BODIES.map((b) => ({
    id: b.id,
    name: b.name,
    coupling: trueCoupling(b),
    radius: b.radius,
    position: b.position,
    velocity: v.ZERO,
    fixed: true,
  })),
  asteroids: scenario.asteroids,
  ship: {
    kinematics: {
      position: ARRIVAL.position,
      velocity: ARRIVAL.velocity,
      attitude: ARRIVAL.attitude,
      angularRate: 0,
    },
    systems: mockShipSystemsState,
  },
  fields: [],
  hidden: {
    'thruster.main-engine.scale': TRUE_THRUST_SCALE,
    'sensor.imu.bias-x': TRUE_IMU_BIAS_X,
  },
};

export const mockEncounter: EncounterDefinition = {
  briefing,
  ship: mockShipDefinition,
  world: mockTruthWorld,
  seed: SEED,
  dt: 0.5,
};

/** Environment effects at arrival, as the game layer would build them. */
export const mockEnvironmentEffects: EnvironmentEffects = {
  t: 0,
  kinematics: mockTruthWorld.ship.kinematics,
  specificForce: v.ZERO,
  targets: [
    ...mockTruthWorld.bodies.map((b) => ({
      id: b.id,
      kind: 'body' as const,
      relativePosition: v.sub(b.position, ARRIVAL.position),
      relativeVelocity: v.sub(b.velocity, ARRIVAL.velocity),
      radius: b.radius,
    })),
    ...mockTruthWorld.asteroids
      .filter((a) => v.distance(a.position, ARRIVAL.position) < 60e3)
      .map((a) => ({
        id: a.id,
        kind: 'asteroid' as const,
        relativePosition: v.sub(a.position, ARRIVAL.position),
        relativeVelocity: v.sub(a.velocity, ARRIVAL.velocity),
        radius: a.radius,
      })),
  ],
  doseRate: {},
  fieldSignals: {},
};

/** True trajectories behind the two fixture attempts (1 s samples), for debugging and tests. */
export const mockTruthTracks = scenario.truth;
