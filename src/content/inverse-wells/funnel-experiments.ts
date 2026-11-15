/**
 * Truth-side controlled S22 experiments for 2C/3E. Each is a fresh independent start in
 * the real content provider, never a teleport, an expedition arrival or a player procedure.
 * The normal ship, sensors and recorder must acquire the resulting observations.
 */
import type { Command } from '../../contracts/commands.ts';
import { IDENTITY, pointAlong, rotate } from '../../lib/quat.ts';
import { add, ZERO, type Vec3 } from '../../lib/vec3.ts';
import { DEFAULT_FUNNEL_PROFILE } from '../../sim/fields/wells.ts';
import { createInverseWells, type InverseWellsSetup } from './index.ts';
import { s22Layout } from './s22-layout.ts';

export interface FunnelExperiment {
  readonly id: string;
  /** Coordinates from the entrance mouth in S22's local garden frame (+x down the axis). */
  readonly offset: Vec3;
  readonly push: Vec3;
  readonly burn: boolean;
  readonly expected: 'reversed' | 'ordinary' | 'coast-pull' | 'near-zero';
}

const { length, mouthRadius, throatRadius, capLength, radialEdgeMax } = DEFAULT_FUNNEL_PROFILE;
// S22's independent projection sample, not an authored route adjustment.
const axialSample = 40_000;
const radiusAtSample =
  throatRadius + (mouthRadius - throatRadius) * (1 - axialSample / length) ** 2;
const sideHalfWeight = radiusAtSample - Math.min(radialEdgeMax, radiusAtSample / 4) / 2;
const away = { x: -1, y: 0, z: 0 };

export const FUNNEL_EXPERIMENTS: readonly FunnelExperiment[] = [
  {
    id: 'axial-away',
    offset: { x: axialSample, y: 0, z: 0 },
    push: away,
    burn: true,
    expected: 'reversed',
  },
  {
    id: 'transverse-y',
    offset: { x: axialSample, y: 0, z: 0 },
    push: { x: 0, y: 1, z: 0 },
    burn: true,
    expected: 'ordinary',
  },
  {
    id: 'transverse-z',
    offset: { x: axialSample, y: 0, z: 0 },
    push: { x: 0, y: 0, z: 1 },
    burn: true,
    expected: 'ordinary',
  },
  { id: 'outside', offset: { x: -6000, y: 0, z: 0 }, push: away, burn: true, expected: 'ordinary' },
  {
    id: 'coast',
    offset: { x: axialSample, y: 0, z: 0 },
    push: { x: 1, y: 0, z: 0 },
    burn: false,
    expected: 'coast-pull',
  },
  {
    id: 'side-halfweight',
    offset: { x: axialSample, y: sideHalfWeight, z: 0 },
    push: away,
    burn: true,
    expected: 'near-zero',
  },
  {
    id: 'mouth-halfweight',
    offset: { x: capLength / 2, y: 0, z: 0 },
    push: away,
    burn: true,
    expected: 'near-zero',
  },
];

/** [ASSUMED] Acquisition cadence: warm for 60 s, pulse for 10 s, retain the cutoff and coast. */
export const FUNNEL_EXPERIMENT_BURN_TICK = 60;
export const FUNNEL_EXPERIMENT_TICKS = 85;

export function funnelExperimentSetup(
  experiment: FunnelExperiment,
  seed = 's22-controlled-experiment-1',
): InverseWellsSetup {
  const layout = s22Layout(22000);
  const frame = layout.entrances.power.attitude;
  const first = layout.wells[0]!.funnel!;
  const kinematics = {
    position: add(first.mouth, rotate(frame, experiment.offset)),
    velocity: ZERO,
    attitude: pointAlong(IDENTITY, rotate(frame, experiment.push)),
    angularVelocity: ZERO,
  };
  return createInverseWells(seed, {
    layout: {
      ...layout,
      version: `${layout.version}-controlled-${experiment.id}`,
      entrances: { power: kinematics },
    },
  });
}

export function funnelExperimentCommands(
  experiment: FunnelExperiment,
  tick: number,
): readonly Command[] {
  if (tick === 0)
    return [
      { kind: 'recorder', sampleRate: 1 },
      { kind: 'point', sensor: 'camera', target: 'funnel-0-core' },
    ];
  return tick === FUNNEL_EXPERIMENT_BURN_TICK && experiment.burn
    ? [{ kind: 'burn', thruster: 'main-engine', throttle: 1, duration: 10 }]
    : [];
}
