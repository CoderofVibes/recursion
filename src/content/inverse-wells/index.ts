/** P03 content provider. TRUTH side; screens receive only the briefing and acquired data. */
import type { EncounterBriefing, ShipDefinition } from '../../contracts/index.ts';
import { isoCov3 } from '../../contracts/index.ts';
import type { FieldRegistry, ShipTruth, TruthWorld } from '../../contracts/truth/index.ts';
import type { EncounterSetup } from '../../game/encounter.ts';
import type { EncounterEntry } from '../../game/encounters.ts';
import { DEFAULT_PLAY } from '../../game/encounter.ts';
import { createArrivalSystems } from '../../game/arrival.ts';
import { createRng } from '../../lib/rng.ts';
import { fromRotationVector, multiply } from '../../lib/quat.ts';
import { distance } from '../../lib/vec3.ts';
import { loadShipDefinition } from '../../ship/index.ts';
import { createWellRegistry, DEFAULT_WELL_PROFILE, wellSpec } from '../../sim/fields/wells.ts';
import { hullInWorld } from '../../sim/snapshot.ts';
import { validateWorld } from '../../sim/index.ts';
import type { GardenLayout, GardenExit } from './layout.ts';
import { seededS16Layout } from './s16-layout.ts';

export { MECHANICS_PREVIEW, type GardenLayout, type GardenExit } from './layout.ts';
export { s16Layout, seededS16Layout, certifyArrival, S16_CATALOGUE_SEEDS } from './s16-layout.ts';
export const ENCOUNTER_ID = 'inverse-wells';
export const SEED = 'well-garden-1';
export const SAVE_FORMAT = 2;
export const LAW = { exponent: 2.5, referenceRadius: 1_000_000 } as const;

export interface GardenOptions {
  readonly layout?: GardenLayout;
  readonly entrance?: 'power' | 'cross-transfer';
  /** 3D supplies the actual ship in this layout's inertial frame; never repaired/refilled. */
  readonly arrival?: {
    readonly ship: ShipTruth;
    readonly definition: ShipDefinition;
    /** Actual transit acquisition, already expressed in this layout's inertial frame. */
    readonly briefing: EncounterBriefing;
  };
}

/** Uses 2F's shared setup contract; extra content descriptors do not bypass the core loop. */
export interface InverseWellsSetup extends EncounterSetup {
  /** 2F's selected name for the shared EncounterSetup registry seam. */
  readonly fields: FieldRegistry;
  /** Direct-registry compatibility for the first mechanics checkpoint and harness. */
  readonly fieldRegistry: FieldRegistry;
  readonly exits: readonly GardenExit[];
  readonly contentVersion: string;
  readonly contentStatus: GardenLayout['status'];
}

/**
 * A seeded arrival survey is acquired prior knowledge (as in the Gravity range).
 * The crew sees solid objects with uncertainty, never the field's invisible radius/profile.
 * Layout selection is a separate seeded stream; survey draws never alter geometry.
 */
function survey(world: TruthWorld, seed: string, layout: GardenLayout): EncounterBriefing {
  const rng = createRng(seed).stream('content.inverse-wells.arrival-survey');
  const k = world.ship.kinematics;
  // One surveyed primary is supported by today's navigator. A source-free layout can
  // use its first physical core as that reference without adding attractive mass.
  const observedBodies = [layout.landmarks[0] ?? world.bodies[0]!];
  const noisy = (p: typeof k.position, sigma: number) => ({
    x: rng.normal(p.x, sigma),
    y: rng.normal(p.y, sigma),
    z: rng.normal(p.z, sigma),
  });
  return {
    id: ENCOUNTER_ID,
    name:
      layout.status === 'mechanics-preview'
        ? 'Well Garden · mechanics preview'
        : 'Well Garden · prototype',
    objectives: layout.exits.map((exit) => ({
      id: exit.id,
      kind: 'reach-region',
      label: exit.id === 'forward' ? 'FORWARD TRANSIT' : 'CROSS-TRANSFER',
      region: { center: exit.center, radius: exit.radius },
    })),
    arrivalEstimate: {
      t: world.t,
      position: noisy(k.position, 100),
      velocity: noisy(k.velocity, 0.05),
      positionCov: isoCov3(100),
      velocityCov: isoCov3(0.05),
      attitude: multiply(k.attitude, fromRotationVector(noisy({ x: 0, y: 0, z: 0 }, 4e-5))),
      attitudeSigma: 4e-5,
      angularVelocity: k.angularVelocity,
    },
    arrivalConfiguration: world.ship.systems.configuration,
    // The current navigator propagates a second known body as a mutual-orbit source.
    // Static massless cores must await actual acquisition and fixed-landmark support.
    knownBodies: observedBodies.map((body) => ({
      id: body.id,
      name: body.name,
      position: noisy(body.position, 50),
      velocity: body.velocity,
      positionCov: isoCov3(50),
      radius: body.radius,
      tracked: false,
      lastFix: world.t,
    })),
    knownAsteroids: [],
    priors: [
      ...observedBodies.map((body) => ({
        id: `body.${body.id}.mu`,
        label: `${body.name} μ`,
        unit: 'm³/s²',
        value: body.gm,
        // [ASSUMED] Broad zero-pull prior for a massless reference, not a measured mass.
        sigma: body.gm === 0 ? 1e4 : body.gm * 0.1,
      })),
      {
        id: 'thruster.main-engine.scale',
        label: 'Main thrust scale',
        unit: '',
        value: 1,
        sigma: 0.05,
      },
    ],
    referenceRadius: LAW.referenceRadius,
  };
}

/** Every excluded core is a real solid collision object, with no invented gravity. */
export function createInverseWells(
  seed: string = SEED,
  options: GardenOptions = {},
): InverseWellsSetup {
  const layout = options.layout ?? seededS16Layout(seed);
  if (!layout.wells.length) throw new Error('Garden needs at least one well');
  if (
    options.arrival &&
    (options.arrival.briefing.id !== ENCOUNTER_ID ||
      options.arrival.briefing.arrivalEstimate.t !== options.arrival.ship.systems.t)
  )
    throw new Error('carried Garden briefing must match the encounter and arrival epoch');
  const fields = layout.wells.map((well) => wellSpec(well.id, well.center));
  const fieldRegistry = createWellRegistry(fields, 1);
  const definition = options.arrival?.definition ?? loadShipDefinition();
  const entrance = layout.entrances[options.entrance ?? 'power'];
  if (!options.arrival && !entrance)
    throw new Error('this entrance requires the actual surviving ship and acquired briefing');
  const ship = options.arrival?.ship ?? {
    kinematics: entrance!,
    systems: createArrivalSystems(definition, {}, seed),
  };
  const world: TruthWorld = {
    t: ship.systems.t,
    law: LAW,
    ship,
    fields,
    hidden: {},
    sun: layout.sun,
    bodies: [
      ...layout.landmarks,
      ...layout.wells.map((well) => ({
        id: `${well.id}-core`,
        name: 'Dark landmark',
        gm: 0,
        radius: DEFAULT_WELL_PROFILE.coreRadius,
        position: well.center,
        velocity: { x: 0, y: 0, z: 0 },
        fixed: true,
      })),
    ],
    asteroids: [],
  };
  const problems = validateWorld(world);
  if (problems.length) throw new Error(`invalid Garden arrival: ${problems.join('; ')}`);
  // Conservative enclosing sphere covers every deployed/jammed hull point at arrival.
  const radius = Math.max(
    0,
    ...hullInWorld(ship.kinematics, ship.systems.massProperties)
      .flat()
      .map((point) => distance(point, ship.kinematics.position)),
  );
  if (
    layout.wells.some(
      (well) =>
        distance(well.center, ship.kinematics.position) <= DEFAULT_WELL_PROFILE.coreRadius + radius,
    )
  )
    throw new Error('Garden arrival intersects an excluded core with the whole ship');
  return {
    definition: {
      briefing: options.arrival?.briefing ?? survey(world, seed, layout),
      ship: definition,
      world,
      seed,
      dt: 1,
    },
    // Carried arrivals preserve the player's recorder, sensor pointing and hardware state.
    arrivalCommands: options.arrival
      ? []
      : [
          { kind: 'recorder', sampleRate: 1 },
          {
            kind: 'point',
            sensor: 'camera',
            target: layout.landmarks[0]?.id ?? `${layout.wells[0]!.id}-core`,
          },
        ],
    arrivalMass: ship.systems.massProperties.mass,
    objectiveRules: [], // 2F must supply reach-region evaluation; never substitute a visit flag.
    play: { ...DEFAULT_PLAY, recorderRate: 1, forecastSpan: 3600 },
    fieldRegistry,
    fields: fieldRegistry,
    exits: layout.exits,
    contentVersion: layout.version,
    contentStatus: layout.status,
  };
}

/** 2F owns inserting this entry in its encounter loader; all content stays in this lane. */
export const INVERSE_WELLS_ENTRY = {
  id: ENCOUNTER_ID,
  name: 'Well Garden · prototype',
  seed: SEED,
  saveFormat: SAVE_FORMAT,
  create(run: number): InverseWellsSetup {
    if (!Number.isInteger(run) || run < 0)
      throw new Error('Garden run must be a nonnegative integer');
    return createInverseWells(run === 0 ? SEED : `${SEED}/run:${run}`);
  },
} satisfies EncounterEntry;
