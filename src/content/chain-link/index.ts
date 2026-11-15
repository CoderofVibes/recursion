/** N03 encounter provider. Everything in this module is on the truth side. */
import type { EncounterBriefing, ShipDefinition } from '../../contracts/index.ts';
import { isoCov3 } from '../../contracts/index.ts';
import type { FieldRegistry, ShipTruth, TruthWorld } from '../../contracts/truth/index.ts';
import { createFieldRegistry } from '../../contracts/truth/index.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { createArrivalSystems } from '../../game/arrival.ts';
import { DEFAULT_PLAY, type EncounterSetup } from '../../game/encounter.ts';
import { fromRotationVector, multiply, rotate } from '../../lib/quat.ts';
import { createRng } from '../../lib/rng.ts';
import { add, type Vec3 } from '../../lib/vec3.ts';
import { loadShipDefinition } from '../../ship/index.ts';
import { initializeLatticeSensorStreams } from '../../ship/sensors/lattice.ts';
import { latticeFieldFactory } from '../../sim/fields/lattice.ts';
import {
  createChainLinkLayout,
  CONTENT_VERSION,
  type ChainLinkLayout,
  type ChainLinkExit,
} from './layout.ts';

export { createChainLinkLayout, CONTENT_VERSION } from './layout.ts';
export const ENCOUNTER_ID = 'chain-link';
export const SEED = 'unseen-cathedral-1';
export const SAVE_FORMAT = 1;
export const LAW = { exponent: 2.5, referenceRadius: 1_000_000 } as const;

/** Ready for 2F's ENCOUNTERS array; run identity comes from its persistent archive. */
export const CHAIN_LINK_ENTRY = {
  id: ENCOUNTER_ID,
  name: 'Unseen Cathedral',
  seed: SEED,
  saveFormat: SAVE_FORMAT,
  create(run: number): ChainLinkSetup {
    if (!Number.isSafeInteger(run) || run < 0)
      throw new RangeError('run must be a nonnegative integer');
    return createChainLink(`${SEED}:run:${run}`);
  },
};

export interface ChainLinkOptions {
  readonly entrance?: 'sensing' | 'cross-transfer';
  readonly catalogueIndex?: number;
  /** Continuous surviving ship and its acquired arrival; never refilled or repaired. */
  readonly arrival?: {
    readonly ship: ShipTruth;
    readonly definition: ShipDefinition;
    readonly briefing: EncounterBriefing;
  };
}

/** Proposed shape for 2F R1. No unsafe cast disguises an unsupported core objective. */
export interface ChainLinkReachRule {
  readonly kind: 'reach-region';
  readonly objective: string;
  readonly center: Vec3;
  readonly radius: number;
  readonly wholeShip: true;
}

export interface ChainLinkSetup extends EncounterSetup {
  readonly fieldRegistry: FieldRegistry;
  /** 2F's committed EncounterSetup names the same registry `fields`. */
  readonly fields: FieldRegistry;
  readonly contentVersion: string;
  readonly layout: ChainLinkLayout;
  readonly exits: readonly ChainLinkExit[];
  readonly reachRegionRules: readonly ChainLinkReachRule[];
}

/** Seeded optical arrival survey. Invisible geometry does not enter the briefing. */
function survey(world: TruthWorld, seed: string, layout: ChainLinkLayout): EncounterBriefing {
  const rng = createRng(seed).stream('content.chain-link.arrival-survey');
  const noisy = (p: Vec3, sigma: number): Vec3 => ({
    x: rng.normal(p.x, sigma),
    y: rng.normal(p.y, sigma),
    z: rng.normal(p.z, sigma),
  });
  const k = world.ship.kinematics;
  return {
    id: ENCOUNTER_ID,
    name: 'Unseen Cathedral',
    objectives: layout.exits.map((exit) => ({
      id: exit.id,
      kind: 'reach-region',
      label: exit.id === 'forward' ? 'FORWARD TRANSIT' : 'CROSS-TRANSFER',
      region: { center: exit.center, radius: exit.radius },
    })),
    arrivalEstimate: {
      t: world.t,
      position: noisy(k.position, 0.5),
      velocity: noisy(k.velocity, 0.01),
      positionCov: isoCov3(0.5),
      velocityCov: isoCov3(0.01),
      attitude: multiply(k.attitude, fromRotationVector(noisy({ x: 0, y: 0, z: 0 }, 4e-5))),
      attitudeSigma: 4e-5,
      angularVelocity: k.angularVelocity,
    },
    arrivalConfiguration: world.ship.systems.configuration,
    // A massless rocky reference at the origin is an ordinary collision body.
    // The 0 ± 1e4 prior is broad; it is not a measured gravitational calibration.
    knownBodies: [
      {
        id: 'cathedral-reference',
        name: 'Survey rock',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: isoCov3(0),
        radius: 24,
        tracked: false,
        lastFix: world.t,
      },
    ],
    knownAsteroids: world.asteroids.slice(0, 18).map((rock) => ({
      id: rock.id,
      position: noisy(rock.position, 0.5),
      velocity: noisy(rock.velocity, 0.005),
      positionCov: isoCov3(0.5),
      radius: rock.radius,
      tracked: false,
      lastSeen: world.t,
    })),
    priors: [
      {
        id: 'body.cathedral-reference.mu',
        label: 'Survey rock μ',
        unit: 'm³/s²',
        value: 0,
        sigma: 1e4,
      },
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

export function createChainLink(
  seed: string = SEED,
  options: ChainLinkOptions = {},
): ChainLinkSetup {
  const layout = createChainLinkLayout(seed, options.catalogueIndex);
  const definition = options.arrival?.definition ?? loadShipDefinition();
  if (
    options.arrival &&
    (options.arrival.briefing.id !== ENCOUNTER_ID ||
      options.arrival.briefing.arrivalEstimate.t !== options.arrival.ship.systems.t)
  )
    throw new Error('carried Cathedral briefing must match the encounter and arrival epoch');
  const fresh = initializeLatticeSensorStreams(createArrivalSystems(definition, {}, seed), seed);
  const localArrival =
    options.entrance === 'cross-transfer' ? { x: -500, y: -260, z: 80 } : { x: -500, y: 0, z: 0 };
  const carried = options.arrival?.ship;
  const carriedSystems = carried && initializeLatticeSensorStreams(carried.systems, seed);
  const ship: ShipTruth = carried
    ? carriedSystems === carried.systems
      ? carried
      : { ...carried, systems: carriedSystems! }
    : {
        systems: fresh,
        kinematics: {
          position: add(
            layout.point(localArrival),
            rotate(layout.orientation, fresh.massProperties.centerOfMass),
          ),
          velocity: rotate(layout.orientation, { x: 2, y: 0, z: 0 }),
          attitude: layout.orientation,
          angularVelocity: { x: 0, y: 0, z: 0 },
        },
      };
  const rocks = createRng(seed).stream('content.chain-link.rocks');
  const world: TruthWorld = {
    t: ship.systems.t,
    law: LAW,
    ship,
    hidden: {},
    sun: { direction: rotate(layout.orientation, { x: -0.8, y: 0, z: 0.6 }), irradiance: 600 },
    bodies: [
      {
        id: 'cathedral-reference',
        name: 'Survey rock',
        gm: 0,
        radius: 24,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        fixed: true,
      },
    ],
    // Rocks frame an ordinary-looking gap along +x. The measured centre route and
    // exterior probe remain physically open; nothing changes when the player turns.
    asteroids: Array.from({ length: 54 }, (_, i) => ({
      id: `cathedral-rock-${i}`,
      radius: rocks.range(3, 10),
      position: layout.point({
        x: rocks.range(-100, 2250),
        y: (i % 2 ? 1 : -1) * rocks.range(100, 190),
        z: rocks.range(-150, 160),
      }),
      velocity: { x: 0, y: 0, z: 0 },
    })),
    fields: [
      {
        id: 'cathedral-lattice',
        kind: 'lattice',
        params: { layers: layout.layers } as unknown as JsonValue,
      },
    ],
  };
  const fieldRegistry = createFieldRegistry([latticeFieldFactory]);
  // Construct now so malformed content cannot fail only after the player enters.
  for (const spec of world.fields) fieldRegistry.create(spec);
  return {
    definition: {
      briefing: options.arrival?.briefing ?? survey(world, seed, layout),
      ship: definition,
      world,
      seed,
      dt: 0.1,
    },
    arrivalCommands: options.arrival
      ? []
      : [
          { kind: 'recorder', sampleRate: 1 },
          {
            kind: 'point',
            sensor: 'camera',
            target: null,
            direction: rotate(layout.orientation, { x: 1, y: 0, z: 0 }),
          },
        ],
    arrivalMass: ship.systems.massProperties.mass,
    objectiveRules: layout.exits.map((exit) => ({
      kind: 'reach-region',
      objective: exit.id,
      center: exit.center,
      radius: exit.radius,
    })),
    reachRegionRules: layout.exits.map((exit) => ({
      kind: 'reach-region',
      objective: exit.id,
      center: exit.center,
      radius: exit.radius,
      wholeShip: true,
    })),
    play: {
      ...DEFAULT_PLAY,
      recorderRate: 1,
      trailInterval: 1,
      telemetryKeepalive: 1,
      warpSteps: [1, 2, 5, 10, 30, 60],
      forecastSpan: 300,
    },
    fieldRegistry,
    fields: fieldRegistry,
    contentVersion: CONTENT_VERSION,
    layout,
    exits: layout.exits,
  };
}
