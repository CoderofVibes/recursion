/**
 * Truth-side validation fixtures for 2C/3E. These are independent controlled starts, not
 * buttons that teleport the player's live ship or create fake completed experiments.
 * All observations must come from the normal sensors/recorder when these plans are flown.
 */
import type { Command } from '../../contracts/commands.ts';
import { IDENTITY, pointAlong } from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { add } from '../../lib/vec3.ts';
import { createInverseWells, MECHANICS_PREVIEW, type InverseWellsSetup } from './index.ts';

export interface WellExperiment {
  readonly id: string;
  readonly offset: Vec3;
  readonly push: Vec3;
  readonly burn: boolean;
  readonly expected: 'reversed' | 'ordinary' | 'coast' | 'near-zero';
}

const radial = { x: 1, y: 0, z: 0 };
export const WELL_EXPERIMENTS: readonly WellExperiment[] = [
  {
    id: 'radial',
    offset: { x: 30_000, y: 0, z: 0 },
    push: radial,
    burn: true,
    expected: 'reversed',
  },
  {
    id: 'tangent-y',
    offset: { x: 30_000, y: 0, z: 0 },
    push: { x: 0, y: 1, z: 0 },
    burn: true,
    expected: 'ordinary',
  },
  {
    id: 'tangent-z',
    offset: { x: 30_000, y: 0, z: 0 },
    push: { x: 0, y: 0, z: 1 },
    burn: true,
    expected: 'ordinary',
  },
  {
    id: 'outside',
    offset: { x: 60_000, y: 0, z: 0 },
    push: radial,
    burn: true,
    expected: 'ordinary',
  },
  { id: 'coast', offset: { x: 30_000, y: 0, z: 0 }, push: radial, burn: false, expected: 'coast' },
  {
    id: 'edge',
    offset: { x: 45_000, y: 0, z: 0 },
    push: radial,
    burn: true,
    expected: 'near-zero',
  },
];

/** [ASSUMED] 60 s sensor warmup, 10 s bounded main-engine pulse, no attitude hold. */
export const EXPERIMENT_BURN_TICK = 60;
export const EXPERIMENT_TICKS = 85;

export function experimentSetup(
  experiment: WellExperiment,
  seed = 'well-experiment-1',
): InverseWellsSetup {
  const base = createInverseWells(seed);
  const world = base.definition.world;
  const core = world.bodies.find((body) => body.id === 'garden-a-core')!;
  const kinematics = {
    ...world.ship.kinematics,
    position: add(core.position, experiment.offset),
    velocity: { x: 0, y: 0, z: 0 },
    attitude: pointAlong(IDENTITY, experiment.push),
  };
  // A fresh standalone controlled start, not a transfer of a live expedition ship.
  return createInverseWells(seed, {
    layout: {
      ...MECHANICS_PREVIEW,
      entrances: { ...MECHANICS_PREVIEW.entrances, power: kinematics },
    },
  });
}

export function experimentCommands(experiment: WellExperiment, tick: number): readonly Command[] {
  if (tick === 0)
    return [
      { kind: 'recorder', sampleRate: 1 },
      { kind: 'point', sensor: 'camera', target: 'garden-a-core' },
    ];
  return tick === EXPERIMENT_BURN_TICK && experiment.burn
    ? [{ kind: 'burn', thruster: 'main-engine', throttle: 1, duration: 10 }]
    : [];
}
