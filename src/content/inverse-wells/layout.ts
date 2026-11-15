/** TRUTH-side authored content. Units are SI; no layout is a player observation. */
import type { Vec3 } from '../../lib/vec3.ts';
import type { MassiveBody, ShipKinematics, Sun } from '../../contracts/truth/index.ts';

export interface GardenWell {
  readonly id: string;
  readonly center: Vec3;
  /** A19/S22: center is the reserved-ball anchor, never the force direction. */
  readonly funnel?: {
    readonly mouth: Vec3;
    readonly axis: Vec3;
    readonly birthOffset: number | null;
  };
}

export interface GardenExit {
  readonly id: 'forward' | 'cross-transfer';
  readonly destination: 'P04' | 'N03';
  readonly center: Vec3;
  readonly radius: number;
  /** Absent for a spherical transit volume; present for an outward disc crossing. */
  readonly outwardNormal?: Vec3;
  /** Interim reach-region destination; distinct from a study's disc-crossing certificate. */
  readonly destinationRegion?: { readonly center: Vec3; readonly radius: number };
}

export interface GardenLayout {
  readonly version: string;
  readonly status: 'mechanics-preview' | 'study-layout' | 'funnel-prototype';
  readonly wells: readonly GardenWell[];
  /** Ordinary optical landmarks, independent of the fictional propulsion rule. */
  readonly landmarks: readonly MassiveBody[];
  readonly entrances: {
    readonly power: ShipKinematics;
    readonly 'cross-transfer'?: ShipKinematics;
  };
  readonly exits: readonly GardenExit[];
  readonly sun: Sun;
}

const zero: Vec3 = { x: 0, y: 0, z: 0 };
const origin = { x: 0, y: 2_000_000, z: -1_000_000 };
const p = (x: number, y: number, z: number): Vec3 => ({
  x: origin.x + x,
  y: origin.y + y,
  z: origin.z + z,
});

/**
 * [ASSUMED] Temporary integration fixture, NOT S16's Garden or an unavoidable route.
 * Three separated wells at different depths. The arrival coast has a wide core miss;
 * it is deliberately useful for nonlethal comparisons and exterior aborts.
 * S16 owns the final placement and independent route vectors.
 */
export const MECHANICS_PREVIEW: GardenLayout = {
  version: '3b-mechanics-preview-1',
  status: 'mechanics-preview',
  wells: [
    { id: 'garden-a', center: p(0, 0, 0) },
    { id: 'garden-b', center: p(120_000, 25_000, 20_000) },
    { id: 'garden-c', center: p(240_000, -20_000, -30_000) },
  ],
  landmarks: [
    {
      id: 'garden-reference',
      name: 'Reference body',
      gm: 1e10,
      radius: 10_000,
      position: zero,
      velocity: zero,
      fixed: true,
    },
  ],
  entrances: {
    power: {
      position: p(-65_000, 20_000, 5_000),
      velocity: { x: 30, y: 0, z: 0 },
      attitude: { w: 1, x: 0, y: 0, z: 0 },
      angularVelocity: zero,
    },
    'cross-transfer': {
      position: p(160_000, 90_000, 20_000),
      velocity: { x: 0, y: -20, z: 0 },
      attitude: { w: Math.SQRT1_2, x: 0, y: 0, z: -Math.SQRT1_2 },
      angularVelocity: zero,
    },
  },
  exits: [
    { id: 'forward', destination: 'P04', center: p(310_000, 20_000, 5_000), radius: 20_000 },
    {
      id: 'cross-transfer',
      destination: 'N03',
      center: p(160_000, 120_000, 20_000),
      radius: 20_000,
    },
  ],
  sun: { direction: { x: 0, y: 0, z: 1 }, irradiance: 600 },
};
