/** Committed S22 prototype content, truth only. No catalogue coordinate is acquired evidence. */
import catalogue from './s22-catalogue.json';
import type { GardenLayout, GardenWell } from './layout.ts';
import { createRng } from '../../lib/rng.ts';
import { fromMatrix, rotate } from '../../lib/quat.ts';
import { addScaled, ZERO, type Vec3 } from '../../lib/vec3.ts';

export const S22_SOURCE_COMMIT = catalogue.source.commit;
export const S22_CONTENT_VERSION = `s22-${S22_SOURCE_COMMIT.slice(0, 7)}-1`;
export const S22_CATALOGUE_SEEDS = catalogue.admitted.map((entry) => entry.seed);
export const S22_ANCHOR_OFFSET = 62_500;
export const S22_RESERVED_RADIUS = Math.hypot(62_500, 20_000);
const vec = (a: readonly number[]): Vec3 => ({ x: a[0]!, y: a[1]!, z: a[2]! });

/** Exact S22 named stream and draw order; field construction never consults player actions. */
export function s22LocalWells(seed: number): readonly GardenWell[] {
  if (!Number.isInteger(seed)) throw new Error('S22 geometry seed must be an integer');
  const rng = createRng(seed).stream('s22.geometry.v2');
  const wells: GardenWell[] = [];
  const append = (center: Vec3, axis: Vec3, birthOffset: number | null) =>
    wells.push({
      id: `funnel-${wells.length}`,
      center,
      funnel: {
        mouth: addScaled(center, axis, -S22_ANCHOR_OFFSET),
        axis,
        birthOffset,
      },
    });
  append({ x: S22_ANCHOR_OFFSET, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, null);
  for (let i = 0; i < 9; i++)
    for (let j = -8; j <= 8; j++)
      for (let k = -8; k <= 8; k++) {
        if (i === 0 && j === 0 && k === 0) continue;
        const center = {
          x: S22_ANCHOR_OFFSET + i * 160_000 + rng.range(-4000, 4000),
          y: j * 160_000 + rng.range(-4000, 4000),
          z: k * 160_000 + rng.range(-4000, 4000),
        };
        const z = rng.range(-1, 1);
        const phi = rng.range(0, 2 * Math.PI);
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        append(
          center,
          { x: r * Math.cos(phi), y: r * Math.sin(phi), z },
          wells.length % 4 === 0 ? 1200 + 600 * (i % 3) : null,
        );
      }
  return wells;
}

export interface FunnelGardenLayout extends GardenLayout {
  readonly catalogueSeed: number;
  readonly sourceCommit: string;
  readonly preparationClearanceBound: number;
}

/** [ASSUMED: S22 prototype] Mechanics admission is separate from actual ship/sensor admission. */
export function s22Layout(catalogueSeed = 22000): FunnelGardenLayout {
  const entry = catalogue.admitted.find((candidate) => candidate.seed === catalogueSeed);
  if (!entry)
    throw new Error(`S22 seed ${catalogueSeed} is not in the admitted mechanics catalogue`);
  const attitude = fromMatrix(entry.garden_to_encounter_rotation.flat());
  const transform = (p: Vec3) => rotate(attitude, p);
  return {
    version: `${S22_CONTENT_VERSION}-${catalogueSeed}`,
    status: 'funnel-prototype',
    catalogueSeed,
    sourceCommit: S22_SOURCE_COMMIT,
    preparationClearanceBound: entry.preparation_clearance_bound_m,
    wells: s22LocalWells(catalogueSeed).map((well) => ({
      id: well.id,
      center: transform(well.center),
      funnel: {
        ...well.funnel!,
        mouth: transform(well.funnel!.mouth),
        axis: transform(well.funnel!.axis),
      },
    })),
    landmarks: [], // Do not change S22's empty gravity sum.
    entrances: {
      power: {
        position: transform(vec(entry.initial.position_m)),
        velocity: transform(vec(entry.initial.velocity_m_s)),
        attitude,
        angularVelocity: ZERO,
      },
    },
    exits: [
      {
        id: 'forward',
        destination: 'P04',
        center: transform({ x: 1_450_000, y: 0, z: 0 }),
        radius: 350_000,
        outwardNormal: transform({ x: 1, y: 0, z: 0 }),
        // [ASSUMED] Interim 2F destination, entirely beyond the independent study disc.
        // Both nominal reference exits coast into it. It is not the disc itself.
        destinationRegion: { center: transform({ x: 1_801_000, y: 0, z: 0 }), radius: 350_000 },
      },
      // [ASSUMED] Optional exterior connector. N03 transit/arrival is not study-certified.
      {
        id: 'cross-transfer',
        destination: 'N03',
        center: transform({ x: 720_000, y: 1_500_000, z: 0 }),
        radius: 50_000,
      },
    ],
    sun: { direction: { x: 0, y: 0, z: 1 }, irradiance: 600 },
  };
}

export function seededS22Layout(seed: string): FunnelGardenLayout {
  return s22Layout(
    createRng(seed).stream('content.inverse-wells.s22-catalogue').pick(S22_CATALOGUE_SEEDS),
  );
}
