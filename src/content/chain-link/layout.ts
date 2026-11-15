/** TRUTH content. S17's finite sheets; never import this module from a screen/model. */
import type { Quat } from '../../lib/quat.ts';
import { fromAxisAngle, fromYaw, multiply, rotate } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import { add, type Vec3 } from '../../lib/vec3.ts';
import type { LatticeLayer } from '../../sim/fields/lattice.ts';

export const CONTENT_VERSION = 'cathedral-a16-twenty-2';
export const PROFILE = { pitch: 80, radius: 4, peakIntensity: 20, halfExtent: 200 } as const;
export const FENCE_COUNT = 20;
export const FENCE_SPACING = 400;
export const STACK_LENGTH = (FENCE_COUNT - 1) * FENCE_SPACING;
export const FORWARD_EXIT_X = STACK_LENGTH + 350;
/**
 * [ASSUMED: A16] Twenty cells wind through both transverse axes. A smooth broad loop
 * retains 64 m of phase variation without paying for nineteen independent reversals.
 * The production-allocation qualification, not this geometric construction, sets the budget.
 */
export const REFERENCE_CENTRES: readonly Vec3[] = Array.from({ length: FENCE_COUNT }, (_, i) => {
  const phase = (2 * Math.PI * i) / (FENCE_COUNT - 1);
  return {
    x: i * FENCE_SPACING,
    y: i === FENCE_COUNT - 1 ? 40 : 40 + 32 * Math.sin(phase),
    z: i === FENCE_COUNT - 1 ? 40 : 40 + 32 * (1 - Math.cos(phase)),
  };
});

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
      {
        id: 'forward',
        destination: 'C04',
        center: point({ x: FORWARD_EXIT_X, y: 40, z: 40 }),
        radius: 120,
      },
      {
        id: 'cross-transfer',
        destination: 'P03',
        center: point({ x: -400, y: -500, z: 80 }),
        radius: 120,
      },
    ],
  };
}

export interface ReferencePath {
  readonly position: Vec3;
  readonly first: Vec3;
  readonly second: Vec3;
}
/** Quintic Hermite segment: value, d/dx and d²/dx² agree at each boundary. */
function hermite(
  x: number,
  start: number,
  span: number,
  a: readonly number[],
  b: readonly number[],
): readonly number[] {
  const u = (x - start) / span;
  const c0 = a[0]!,
    c1 = a[1]! * span,
    c2 = (a[2]! * span * span) / 2;
  const d = b[0]! - c0 - c1 - c2;
  const e = b[1]! * span - c1 - 2 * c2;
  const f = b[2]! * span * span - 2 * c2;
  const c3 = 10 * d - 4 * e + f / 2,
    c4 = -15 * d + 7 * e - f,
    c5 = 6 * d - 3 * e + f / 2;
  return [
    c0 + u * (c1 + u * (c2 + u * (c3 + u * (c4 + u * c5)))),
    (c1 + u * (2 * c2 + u * (3 * c3 + u * (4 * c4 + u * 5 * c5)))) / span,
    (2 * c2 + u * (6 * c3 + u * (12 * c4 + u * 20 * c5))) / (span * span),
  ];
}
/**
 * Truth-side qualification only. Continuous curvature keeps lateral momentum between
 * fences instead of spending propellant stopping and restarting at every opening.
 * This is an authoring oracle, not an acquired route or a player-facing autopilot.
 */
export function referencePath(x: number): ReferencePath {
  const k = (2 * Math.PI) / STACK_LENGTH;
  let y: readonly number[], z: readonly number[];
  if (x <= -500) {
    y = [0, 0, 0];
    z = [0, 0, 0];
  } else if (x < 0) {
    y = hermite(x, -500, 500, [0, 0, 0], [40, 32 * k, 0]);
    z = hermite(x, -500, 500, [0, 0, 0], [40, 0, 32 * k * k]);
  } else if (x <= STACK_LENGTH) {
    y = [40 + 32 * Math.sin(k * x), 32 * k * Math.cos(k * x), -32 * k * k * Math.sin(k * x)];
    z = [40 + 32 * (1 - Math.cos(k * x)), 32 * k * Math.sin(k * x), 32 * k * k * Math.cos(k * x)];
  } else if (x < FORWARD_EXIT_X) {
    y = hermite(x, STACK_LENGTH, FORWARD_EXIT_X - STACK_LENGTH, [40, 32 * k, 0], [40, 0, 0]);
    z = hermite(x, STACK_LENGTH, FORWARD_EXIT_X - STACK_LENGTH, [40, 0, 32 * k * k], [40, 0, 0]);
  } else {
    y = [40, 0, 0];
    z = [40, 0, 0];
  }
  return {
    position: { x, y: y[0]!, z: z[0]! },
    first: { x: 1, y: y[1]!, z: z[1]! },
    second: { x: 0, y: y[2]!, z: z[2]! },
  };
}
export const referenceDatum = (x: number): Vec3 => referencePath(x).position;

/** Real finite exterior alternative; a truth-side cost probe, not a secret wall. */
export const EXTERIOR_PROBE: readonly Vec3[] = [
  { x: -500, y: 0, z: 0 },
  { x: -320, y: -350, z: -80 },
  { x: STACK_LENGTH + 220, y: -350, z: -80 },
  { x: FORWARD_EXIT_X, y: 40, z: 40 },
];
