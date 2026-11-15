/**
 * 3B-owned inputs to 3E's runFlight. Author controls, never a player autopilot.
 * No dynamics, recorder, metrics, event policy or model is implemented here.
 */
import type { FlightCase } from '../../../tools/harness/scenarios.ts';
import { burnSteps } from '../../game/belief/maneuver.ts';
import { rotate } from '../../lib/quat.ts';
import { createInverseWells, type InverseWellsSetup } from './index.ts';
import { s22Layout, S22_CATALOGUE_SEEDS } from './s22-layout.ts';

export const ADMISSION_PROTOCOL = 's22-production-harness-v2';
export interface GardenAdmission {
  readonly flight: FlightCase;
  readonly setup: InverseWellsSetup;
  readonly catalogueSeed: number;
  readonly variant: string;
  readonly condition: number;
}

export const ADMISSION_VARIANTS = [
  'negative-y',
  'positive-y',
  'coast',
  'axial-away',
  'cutoff-abort',
  'worn-negative-y',
  'worn-positive-y',
  'delayed-negative-y',
  'delayed-positive-y',
  'model-negative-y',
  'model-positive-y',
  'cutoff-abort-positive-y',
] as const;
export type AdmissionVariant = (typeof ADMISSION_VARIANTS)[number];

/** Same catalogue geometry/noise across paired controls; every flight starts independently. */
export function gardenAdmission(catalogueSeed: number, variant: AdmissionVariant): GardenAdmission {
  const layout = s22Layout(catalogueSeed);
  const seed = `s22-admission/${catalogueSeed}`;
  let setup = createInverseWells(seed, { layout });
  const condition = variant.startsWith('worn-') ? 0.7 : 1;
  if (condition !== 1) {
    const actuators = new Set(
      setup.definition.ship.equipment
        .filter((e) => e.kind === 'main-engine' || e.kind === 'rcs-thruster')
        .map((e) => e.id),
    );
    const world = setup.definition.world;
    setup = {
      ...setup,
      definition: {
        ...setup.definition,
        world: {
          ...world,
          ship: {
            ...world.ship,
            systems: {
              ...world.ship.systems,
              equipment: Object.fromEntries(
                Object.entries(world.ship.systems.equipment).map(([id, e]) => [
                  id,
                  actuators.has(id) ? { ...e, condition } : e,
                ]),
              ),
            },
          },
        },
      },
    };
  }
  const side = variant.endsWith('positive-y') ? 1 : -1;
  const delayed = variant.startsWith('delayed-');
  const burnAt = delayed ? 900 : 600;
  const direction = rotate(
    layout.entrances.power.attitude,
    variant === 'axial-away' ? { x: -1, y: 0, z: 0 } : { x: 0, y: side, z: 0 },
  );
  const controls =
    variant === 'coast'
      ? []
      : burnSteps({
          at: burnAt,
          duration: 16,
          attitude: { reference: 'direction', direction },
          lead: 480,
        });
  const abort = variant.startsWith('cutoff-abort');
  const realModel = variant.startsWith('model-');
  if (abort) controls.push({ at: burnAt + 8, command: { kind: 'cutoff', thruster: 'all' } });
  const negativeControl = variant === 'coast' || variant === 'axial-away';
  const shortWindow = negativeControl || abort;
  return {
    catalogueSeed,
    variant,
    condition,
    setup,
    flight: {
      id: `s22-${catalogueSeed}-${variant}`,
      seed,
      mode: realModel ? 'recorder-model' : 'navigation-probe',
      duration: shortWindow ? 3600 : 36_000,
      controls,
      expected: negativeControl ? 'lost' : abort ? 'survive-window' : 'completed',
      knowledge: [
        '[ASSUMED] Author-supplied inertial direction from S22 geometry; no acquired funnel rule or player inference is claimed.',
        "The nominal +/-y controls port S22's 16 s, 24 kN burn at t=600 through actual main propulsion, with a real roll-held direction command 480 s beforehand and rate nulling 5 s after cutoff.",
        condition !== 1
          ? 'Sensitivity fixture: main/RCS condition 0.7, no repair, refill or increased pulse.'
          : '',
        delayed
          ? 'Sensitivity fixture: turn and burn delayed 300 s. This is not a continuous late-arrival/frame transfer.'
          : '',
        abort
          ? 'Authored eight-second cutoff; outcome and subsequent acquisition are measured, not presumed safe.'
          : '',
        realModel
          ? 'Production recorder/model enabled; an ordinary model is not a fitted well-response model.'
          : 'Navigator stand-in only; forecasts are not fitted-model evidence.',
      ]
        .filter(Boolean)
        .join(' '),
    },
  };
}

/** Both directions for all admitted geometry; sensitivities on nominal entry only. */
export function gardenAdmissionCases(): readonly {
  catalogueSeed: number;
  variant: AdmissionVariant;
}[] {
  return [
    ...S22_CATALOGUE_SEEDS.flatMap((catalogueSeed) =>
      (['negative-y', 'positive-y'] as const).map((variant) => ({ catalogueSeed, variant })),
    ),
    ...ADMISSION_VARIANTS.slice(2).map((variant) => ({ catalogueSeed: 22000, variant })),
  ];
}
