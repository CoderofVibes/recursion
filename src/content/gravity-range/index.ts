/**
 * The Gravity range (expedition C02): the first playable encounter. TRUTH side.
 *
 * `createGravityRange()` returns everything the game loop needs: the encounter definition
 * (briefing, the real 1C ship, the true world at arrival), the arrival procedure, the rules
 * the world uses to decide the objective, and the play values.
 */

import type { Command } from '../../contracts/commands.ts';
import { DEFAULT_PLAY, type EncounterSetup, type ObjectiveRule } from '../../game/encounter.ts';
import { loadShipDefinition } from '../../ship/index.ts';
import { BAND, RESERVE, briefing } from './briefing.ts';
import { arrivalWorld } from './world.ts';

export { BAND, ENCOUNTER_ID, OBJECTIVES, PRIORS, RESERVE } from './briefing.ts';
export { ALPHA, ARRIVAL_ANGLE, BETA, HIDDEN, LAW, SEPARATION, SUN } from './world.ts';

/** Root seed for the field, the arrival survey and every sensor noise stream. */
export const SEED = 'gravity-range-1';

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
  const ship = loadShipDefinition();
  const world = arrivalWorld(ship, seed);
  return {
    definition: { briefing: briefing(world, seed), ship, world, seed, dt: DT },
    arrivalCommands: ARRIVAL_COMMANDS,
    objectiveRules: OBJECTIVE_RULES,
    play: DEFAULT_PLAY,
  };
}
