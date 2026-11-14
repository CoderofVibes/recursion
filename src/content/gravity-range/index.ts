/**
 * The Gravity range (expedition C02): the first playable encounter. TRUTH side.
 *
 * `createGravityRange()` returns everything the game loop needs: the encounter definition
 * (briefing, the real 1C ship, the true world at arrival), the arrival procedure, the rules
 * the world uses to decide the objective, and the play values.
 */

import type { Command } from '../../contracts/commands.ts';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { DEFAULT_PLAY, type EncounterSetup, type ObjectiveRule } from '../../game/encounter.ts';
import { loadShipDefinition } from '../../ship/index.ts';
import { BAND, RESERVE, briefing } from './briefing.ts';
import { arrivalWorld } from './world.ts';

export { BAND, ENCOUNTER_ID, OBJECTIVES, PRIORS, RESERVE } from './briefing.ts';
export { ALPHA, ARRIVAL_ANGLE, BETA, HIDDEN, LAW, SEPARATION, SUN } from './world.ts';

/** Root seed for the field, the arrival survey and every sensor noise stream. */
export const SEED = 'gravity-range-1';

/**
 * Bump whenever a change here would make earlier Black Box records describe a different world
 * or ship (law, bodies, field, sensors). The app keeps one save slot per value.
 */
export const SAVE_FORMAT = 2;

/**
 * [ASSUMED] 1 s suits the P16 scale (2A: orbits of hours; worst error 11 mm over 20,000 s).
 * It also caps every instrument at one packet per tick.
 */
export const DT = 1;

/**
 * [ASSUMED] Arrival procedure, run at t = 0 of every attempt:
 * - Black Box at one packet every 20 s (`DEFAULT_PLAY.recorderRate`): enough fixes for orbits
 *   that take hours, about 1,350 packets for a 7.5 h dive;
 * - the camera locked on Alpha, in its default `track` mode (120 W), so each packet carries one
 *   bearing and one range to Alpha.
 * Recording faster, or looking at Beta or an asteroid instead, is the player's choice (P12).
 */
export const ARRIVAL_COMMANDS: readonly Command[] = [
  { kind: 'recorder', sampleRate: DEFAULT_PLAY.recorderRate },
  { kind: 'point', sensor: 'camera', target: 'alpha' },
];

/**
 * [ASSUMED] Camera range noise per fix, as a fraction of range: 1G's value (spec §2.1,
 * sub-pixel limb fitting) in place of the 1C baseline's 5%.
 *
 * 1C's 5% is the doubt about a body's size. That is one scale error shared by every fix, but
 * ship systems apply it as independent noise on each fix, and at that level the model's fit of
 * two bodies runs away: on real flight records the distance-law test returns exponents of
 * −0.2 or 12 instead of 2.5 [DEMONSTRATED: 2F handoff]. With 0.2% the same flights give
 * 2.5000 and pass the held-out test. The baseline itself is 1C's; see the 2F handoff request.
 */
export const CAMERA_RANGE_FRACTION = 0.002;

/** The real 1C ship (`loadShipDefinition()`) with the one sensor value above retuned. */
export function rangeShip(): ShipDefinition {
  const ship = loadShipDefinition();
  const systems = ship.systems as Record<string, JsonValue> | undefined;
  const sensing = systems?.sensing as Record<string, JsonValue> | undefined;
  const camera = sensing?.camera as Record<string, JsonValue> | undefined;
  if (!systems || !sensing || !camera) throw new Error('ship baseline has no camera to tune');
  return {
    ...ship,
    systems: {
      ...systems,
      sensing: { ...sensing, camera: { ...camera, rangePriorFraction: CAMERA_RANGE_FRACTION } },
    },
  };
}

export const OBJECTIVE_RULES: readonly ObjectiveRule[] = [
  {
    kind: 'orbit-band',
    objective: 'low-orbit',
    body: 'alpha',
    inner: BAND.inner,
    outer: BAND.outer,
    revolutions: BAND.revolutions,
  },
  { kind: 'reserve', objective: 'reserve', tank: RESERVE.tank, minimum: RESERVE.minimum },
];

export function createGravityRange(seed: string = SEED): EncounterSetup {
  const ship = rangeShip();
  const world = arrivalWorld(ship, seed);
  return {
    definition: { briefing: briefing(world, seed), ship, world, seed, dt: DT },
    arrivalCommands: ARRIVAL_COMMANDS,
    arrivalMass: world.ship.systems.massProperties.mass,
    objectiveRules: OBJECTIVE_RULES,
    play: DEFAULT_PLAY,
  };
}
