import { HANDS_ON_NEUTRAL, type Command } from '../../src/contracts/index.ts';
import { createGravityRange, SEED } from '../../src/content/gravity-range/index.ts';
import { burnDuration, burnSteps } from '../../src/game/belief/maneuver.ts';
import type { EncounterSetup } from '../../src/game/encounter.ts';

export interface TimedControl {
  readonly at: number;
  readonly command: Command;
}

export interface FlightCase {
  readonly id: string;
  readonly seed: string;
  readonly mode: 'navigation-probe' | 'recorder-model';
  readonly duration: number;
  readonly controls: readonly TimedControl[];
  readonly knowledge: string;
  readonly expected: 'survive-window' | 'completed' | 'lost';
  readonly condition?: number;
}

/** Script provenance: production slingshot.test.ts. This is an author plan, not acquired knowledge. */
export function slingshotControls(setup: EncounterSetup): TimedControl[] {
  const seconds = Math.round(burnDuration(setup.definition.ship, setup.arrivalMass, 14.36));
  return [
    { at: 3480, command: { kind: 'attitude', target: { reference: 'prograde' } } },
    { at: 3950, command: { kind: 'attitude', target: { reference: 'prograde' } } },
    { at: 3960, command: { kind: 'fly', input: { ...HANDS_ON_NEUTRAL, throttle: 1 } } },
    { at: 3960 + seconds, command: { kind: 'fly', input: HANDS_ON_NEUTRAL } },
    {
      at: 79920,
      command: { kind: 'fly', input: { ...HANDS_ON_NEUTRAL, translate: { x: 0, y: 0, z: 1 } } },
    },
    { at: 79960, command: { kind: 'fly', input: HANDS_ON_NEUTRAL } },
  ];
}

export function casesFor(suite: 'smoke' | 'routes', seed = SEED): FlightCase[] {
  const shared = { seed, mode: 'navigation-probe' as const };
  if (suite === 'smoke')
    return [
      {
        ...shared,
        id: 'c02-coast-window',
        duration: 600,
        controls: [],
        expected: 'survive-window',
        knowledge: 'Briefing only; production navigator, no fitted model.',
      },
      {
        ...shared,
        id: 'c02-powered-negative-control',
        duration: 40000,
        controls: burnSteps({ at: 600, duration: 41, attitude: { reference: 'retrograde' } }),
        expected: 'lost',
        knowledge:
          'Wrong-law 41 s retrograde dive from 2D handoff; author-selected collision negative control, no truth steering.',
      },
    ];
  const controls = slingshotControls(createGravityRange(seed));
  return [
    {
      ...shared,
      id: 'c02-authored-slingshot',
      duration: 90 * 3600,
      controls,
      expected: 'completed',
      knowledge:
        'Exact author plan from src/content/gravity-range/slingshot.test.ts; navigator only. Not an informed-player learning certificate.',
    },
    {
      ...shared,
      id: 'c02-worn-arrival',
      duration: 90 * 3600,
      controls,
      expected: 'completed',
      condition: 0.7,
      knowledge:
        '[ASSUMED] sensitivity fixture: every actuator starts at 0.7 condition, otherwise identical author plan. Not a content-supported arrival envelope.',
    },
  ];
}

export function setupFor(flight: FlightCase): EncounterSetup {
  const setup = createGravityRange(flight.seed);
  if (flight.condition === undefined) return setup;
  const world = setup.definition.world;
  const actuators = new Set(
    setup.definition.ship.equipment
      .filter((e) => e.kind === 'main-engine' || e.kind === 'rcs-thruster')
      .map((e) => e.id),
  );
  const equipment = Object.fromEntries(
    Object.entries(world.ship.systems.equipment).map(([id, e]) => [
      id,
      actuators.has(id) ? { ...e, condition: flight.condition! } : e,
    ]),
  );
  return {
    ...setup,
    definition: {
      ...setup.definition,
      world: { ...world, ship: { ...world.ship, systems: { ...world.ship.systems, equipment } } },
    },
  };
}
