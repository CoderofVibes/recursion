/** TRUTH content. S17's finite sheets; never import this module from a screen/model. */
import type { Quat } from '../../lib/quat.ts';
import { fromAxisAngle, fromYaw, multiply, rotate } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import { add, type Vec3 } from '../../lib/vec3.ts';
import type { LatticeLayer } from '../../sim/fields/lattice.ts';

export const CONTENT_VERSION = 'cathedral-s17-1';
export const PROFILE = { pitch: 80, radius: 4, peakIntensity: 20, halfExtent: 200 } as const;
export const REFERENCE_CENTRES: readonly Vec3[] = [
  { x: 0, y: 40, z: 40 },
  { x: 300, y: 68, z: 22 },
  { x: 600, y: 36, z: 60 },
  { x: 900, y: 68, z: 40 },
  { x: 1200, y: 40, z: 12 },
  { x: 1500, y: 12, z: 40 },
  { x: 1800, y: 44, z: 68 },
  { x: 2100, y: 20, z: 40 },
];

export interface ChainLinkExit {
  readonly id: 'forward' | 'cross-transfer';
  readonly destination: 'C04' | 'P03';
  readonly center: Vec3;
  readonly radius: number;
}

export interface ChainLinkLayout {
  readonly version: string;
  readonly catalogueIndex: number;
  readonly orientation: Quat;
  readonly layers: readonly LatticeLayer[];
  readonly openingCentres: readonly Vec3[];
  readonly exits: readonly ChainLinkExit[];
  /** Authoring coordinates. Not acquired waypoints and never handed to the player. */
  point(local: Vec3): Vec3;
}

const ORIGIN: Vec3 = { x: 1800, y: 800, z: 0 };
// [ASSUMED] Finite catalogue of rigid placements. These preserve S17's relative
// geometry; arbitrary independent phase draws await route/authority qualification.
const CATALOGUE = [
  [0, 0],
  [24, 8],
  [-31, -7],
  [53, 11],
] as const;
const radians = (degrees: number): number => (degrees * Math.PI) / 180;

export function createChainLinkLayout(seed: string, catalogueIndex?: number): ChainLinkLayout {
  const index =
    catalogueIndex ??
    createRng(seed)
      .stream('content.chain-link.geometry')
      .int(0, CATALOGUE.length - 1);
  const angles = CATALOGUE[index];
  if (!angles) throw new RangeError('unknown Cathedral geometry catalogue entry');
  const orientation = multiply(
    fromYaw(radians(angles[0])),
    fromAxisAngle({ x: 0, y: 1, z: 0 }, radians(angles[1])),
  );
  const point = (local: Vec3): Vec3 => add(ORIGIN, rotate(orientation, local));
  const openingCentres = REFERENCE_CENTRES.map(point);
  const layers: LatticeLayer[] = REFERENCE_CENTRES.map((center, i) => {
    const yaw = i === 0 ? 0 : ((i % 3) - 1) * 8;
    const pitch = i === 0 ? 0 : (((i + 1) % 3) - 1) * 8;
    const roll = i === 0 ? 0 : ((i % 3) - 1) * 12;
    const basis = multiply(
      fromYaw(radians(yaw)),
      multiply(
        fromAxisAngle({ x: 0, y: 1, z: 0 }, radians(pitch)),
        fromAxisAngle({ x: 1, y: 0, z: 0 }, radians(roll)),
      ),
    );
    const endpoint = (local: Vec3): Vec3 => point(add(center, rotate(basis, local)));
    return {
      id: `sheet-${i}`,
      radius: PROFILE.radius,
      peakIntensity: PROFILE.peakIntensity,
      strands: [-200, -120, -40, 40, 120, 200].flatMap((q, j) => [
        {
          id: `sheet-${i}-u-${j}`,
          a: endpoint({ x: 0, y: q, z: -200 }),
          b: endpoint({ x: 0, y: q, z: 200 }),
        },
        {
          id: `sheet-${i}-v-${j}`,
          a: endpoint({ x: 0, y: -200, z: q }),
          b: endpoint({ x: 0, y: 200, z: q }),
        },
      ]),
    };
  });
  return {
    version: CONTENT_VERSION,
    catalogueIndex: index,
    orientation,
    point,
    layers,
    openingCentres,
    exits: [
      { id: 'forward', destination: 'C04', center: point({ x: 2450, y: 20, z: 40 }), radius: 120 },
      {
        id: 'cross-transfer',
        destination: 'P03',
        center: point({ x: -400, y: -500, z: 80 }),
        radius: 120,
      },
    ],
  };
}

/** S17 prescribed path, for qualification only. No steering/planning API exposes it. */
export function referenceDatum(x: number): Vec3 {
  if (x <= 0) return { x, y: 40, z: 40 };
  if (x >= 2100) return { x, y: 20, z: 40 };
  const i = Math.floor(x / 300);
  const a = REFERENCE_CENTRES[i]!;
  const b = REFERENCE_CENTRES[i + 1]!;
  const u = (x - a.x) / 300;
  const h = u * u * u * (10 - 15 * u + 6 * u * u);
  return { x, y: a.y + (b.y - a.y) * h, z: a.z + (b.z - a.z) * h };
}

/** Real finite exterior alternative; a truth-side cost probe, not a secret wall. */
export const EXTERIOR_PROBE: readonly Vec3[] = [
  { x: -500, y: 0, z: 0 },
  { x: -320, y: -350, z: -80 },
  { x: 2320, y: -350, z: -80 },
  { x: 2450, y: 20, z: 40 },
];
