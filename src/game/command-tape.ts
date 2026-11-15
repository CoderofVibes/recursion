/**
 * A fixed command tape for proving that a change to the ship or the truth step changes nothing
 * it flies: the same ten thousand ticks of the Gravity range, on three starting states, give
 * the same states, measurements, events and ledgers before and after (S15 rank 1, A11).
 *
 * The tape exercises every ship subsystem the step touches: slews to inertial attitudes and
 * rate holds (the jet allocator), hands-on translation, turns and throttle (release, rate
 * nulling, hold), timed main-engine and RCS burns with a cutoff, configuration moves that are
 * interrupted half way (half-deployed wings and radiators), battery, pod-heater, instrument and
 * standby mode changes, power allocations, camera pointing and recorder rates. The variants add
 * damaged equipment, a battery and RCS tanks run dry, a breaker trip, and an eclipse.
 *
 * Commands here are already in inertial references, as the truth step receives them (the
 * session resolves the belief-relative ones first).
 */

import type { Command } from '../contracts/commands.ts';
import type { EquipmentState, ShipSystemsState } from '../contracts/truth/ship.ts';
import { fromRotationVector } from '../lib/quat.ts';
import { computeMassProperties } from '../ship/index.ts';
import type { EncounterSetup } from './encounter.ts';
import type { DueCommand } from './truth-step.ts';

/** One entry of the tape: a command due at the start of tick `at` (t = at · dt). */
export interface TapeEntry {
  readonly at: number;
  readonly command: Command;
}

/** Ticks on the tape. */
export const TAPE_TICKS = 10_000;

const attitude = (x: number, y: number, z: number) => fromRotationVector({ x, y, z });
const fly = (
  translate: { x: number; y: number; z: number },
  yaw: number,
  pitch: number,
  throttle: number,
): Command => ({ kind: 'fly', input: { translate, yaw, pitch, throttle } });
const NEUTRAL = fly({ x: 0, y: 0, z: 0 }, 0, 0, 0);

export const COMMAND_TAPE: readonly TapeEntry[] = [
  { at: 0, command: { kind: 'recorder', sampleRate: 1 / 20 } },
  { at: 0, command: { kind: 'point', sensor: 'camera', target: 'alpha' } },
  {
    at: 10,
    command: {
      kind: 'attitude',
      target: { reference: 'inertial', attitude: attitude(0.1, -0.2, 0.5) },
    },
  },
  {
    at: 400,
    command: {
      kind: 'point',
      sensor: 'camera',
      target: null,
      direction: { x: 0.3, y: -1, z: 0.2 },
    },
  },
  { at: 600, command: { kind: 'configure', configuration: 'allDeployed' } },
  { at: 650, command: fly({ x: 0.5, y: 0, z: -0.3 }, 0.4, -0.2, 0) },
  { at: 700, command: NEUTRAL },
  {
    at: 1000,
    command: {
      kind: 'burn',
      thruster: 'main-engine',
      throttle: 0.6,
      duration: 40,
      attitude: { reference: 'inertial', attitude: attitude(0, 0.05, 0.6) },
    },
  },
  { at: 1300, command: { kind: 'mode', equipment: 'battery-a', mode: 'charge' } },
  { at: 1400, command: { kind: 'power', equipment: 'camera', allocation: 60 } },
  { at: 1500, command: { kind: 'point', sensor: 'camera', target: 'beta' } },
  { at: 1800, command: { kind: 'configure', configuration: 'radiators' } },
  // A move takes about 29 s: this one turns the wings round half way.
  { at: 1812, command: { kind: 'configure', configuration: 'solar' } },
  { at: 2200, command: fly({ x: 0, y: 0, z: 0 }, 0, 0.3, 1) },
  { at: 2230, command: NEUTRAL },
  { at: 2600, command: { kind: 'mode', equipment: 'imu-b', mode: 'off' } },
  { at: 2600, command: { kind: 'mode', equipment: 'star-tracker-a', mode: 'off' } },
  { at: 2800, command: { kind: 'mode', equipment: 'rcs-aft-left', mode: 'heater' } },
  { at: 2900, command: { kind: 'mode', equipment: 'rcs-aft-left', mode: 'ready' } },
  { at: 3000, command: { kind: 'burn', thruster: 'rcs-forward-right', throttle: 1, duration: 30 } },
  { at: 3010, command: { kind: 'cutoff', thruster: 'all' } },
  { at: 3200, command: { kind: 'recorder', sampleRate: 1 } },
  {
    at: 3600,
    command: {
      kind: 'attitude',
      target: { reference: 'rate', rate: { x: 0, y: 0.002, z: -0.003 } },
    },
  },
  { at: 3700, command: { kind: 'attitude', target: { reference: 'free' } } },
  {
    at: 3800,
    command: {
      kind: 'attitude',
      target: { reference: 'inertial', attitude: attitude(-0.3, 0.1, 1.2) },
    },
  },
  { at: 4200, command: { kind: 'mode', equipment: 'camera', mode: 'detail' } },
  { at: 4500, command: { kind: 'configure', configuration: 'stowed' } },
  { at: 4510, command: { kind: 'configure', configuration: 'radiators' } },
  { at: 5000, command: fly({ x: 0, y: -1, z: 0 }, 0, 0, 0) },
  { at: 5060, command: NEUTRAL },
  { at: 5500, command: { kind: 'mode', equipment: 'battery-a', mode: 'idle' } },
  { at: 5500, command: { kind: 'mode', equipment: 'battery-b', mode: 'discharge' } },
  { at: 6000, command: { kind: 'mode', equipment: 'flight-cpu-a', mode: 'standby' } },
  { at: 6000, command: { kind: 'mode', equipment: 'eclss-b', mode: 'standby' } },
  { at: 6500, command: { kind: 'mark', label: 'tape' } },
  { at: 7000, command: { kind: 'power', equipment: 'science-processor', allocation: 0 } },
  { at: 7000, command: { kind: 'mode', equipment: 'science-processor', mode: 'science' } },
  { at: 7500, command: { kind: 'burn', thruster: 'main-engine', throttle: 1, duration: 15 } },
  { at: 8000, command: { kind: 'recorder', sampleRate: 1 / 20 } },
  { at: 8500, command: { kind: 'configure', configuration: 'allDeployed' } },
  { at: 9000, command: { kind: 'mode', equipment: 'imu-b', mode: 'active' } },
  { at: 9000, command: { kind: 'mode', equipment: 'star-tracker-a', mode: 'active' } },
  { at: 9500, command: { kind: 'point', sensor: 'camera', target: 'alpha' } },
  {
    at: 9900,
    command: { kind: 'attitude', target: { reference: 'rate', rate: { x: 0, y: 0, z: 0 } } },
  },
];

/** The commands due at tick `tick`, in tape order, as the truth step receives them. */
export function dueAt(tick: number): DueCommand[] {
  const due: DueCommand[] = [];
  for (const entry of COMMAND_TAPE)
    if (entry.at === tick) due.push({ command: entry.command, source: 'manual' });
  return due;
}

export type TapeVariant = 'nominal' | 'worn' | 'eclipse';
export const TAPE_VARIANTS: readonly TapeVariant[] = ['nominal', 'worn', 'eclipse'];

const wear = (
  equipment: Readonly<Record<string, EquipmentState>>,
  id: string,
  change: { condition?: number; values?: Record<string, number> },
): EquipmentState => {
  const e = equipment[id];
  if (!e) throw new Error(`no equipment ${id} to wear`);
  return {
    ...e,
    ...(change.condition === undefined ? {} : { condition: change.condition }),
    values: { ...e.values, ...change.values },
  };
};

/**
 * The encounter a variant starts from:
 * - `nominal`: the Gravity range arrival as it is;
 * - `worn`: damaged pod, wings, radiator, IMU and camera, a weak main engine, fuel cell B
 *   failed and battery B nearly flat and discharging (it runs out), both RCS tanks nearly dry
 *   (they run out on the tape), and a fault drawing enough on the comms feeder to trip its
 *   breaker;
 * - `eclipse`: the sun moved behind Alpha as seen from the ship, so the ship starts in Alpha's
 *   shadow and drifts out of it.
 */
export function tapeSetup(setup: EncounterSetup, variant: TapeVariant): EncounterSetup {
  if (variant === 'nominal') return setup;
  const world = setup.definition.world;
  if (variant === 'eclipse') {
    const ship = world.ship.kinematics.position;
    const alpha = world.bodies.find((b) => b.id === 'alpha');
    if (!alpha || !world.sun) throw new Error('the eclipse variant needs Alpha and a sun');
    const dx = alpha.position.x - ship.x;
    const dy = alpha.position.y - ship.y;
    const dz = alpha.position.z - ship.z;
    const d = Math.hypot(dx, dy, dz);
    const sun = { ...world.sun, direction: { x: dx / d, y: dy / d, z: dz / d } };
    return { ...setup, definition: { ...setup.definition, world: { ...world, sun } } };
  }
  const systems: ShipSystemsState = world.ship.systems;
  const e = systems.equipment;
  const equipment = {
    ...e,
    'rcs-aft-right': wear(e, 'rcs-aft-right', { condition: 0.5 }),
    'solar-left': wear(e, 'solar-left', { condition: 0.6 }),
    'radiator-right': wear(e, 'radiator-right', { condition: 0.7 }),
    'imu-a': wear(e, 'imu-a', { condition: 0.8 }),
    camera: wear(e, 'camera', { condition: 0.9 }),
    'main-engine': wear(e, 'main-engine', { values: { thrustScale: 0.95 } }),
    'solar-right': wear(e, 'solar-right', { condition: 0.1 }),
    'fuel-cell-b': wear(e, 'fuel-cell-b', { condition: 0 }),
    'battery-b': { ...wear(e, 'battery-b', { values: { charge: 2e5 } }), mode: 'discharge' },
    comms: wear(e, 'comms', { values: { faultPower: 900 } }),
  };
  const tanks = { ...systems.tanks, 'rcs-left': 2, 'rcs-right': 2 };
  const worn = { ...systems, equipment, tanks };
  const massProperties = computeMassProperties(worn, setup.definition.ship);
  return {
    ...setup,
    definition: {
      ...setup.definition,
      world: {
        ...world,
        ship: { ...world.ship, systems: { ...worn, massProperties } },
      },
    },
  };
}
