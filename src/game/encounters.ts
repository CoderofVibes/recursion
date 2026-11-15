/**
 * TRUTH side. The encounters the app can load, until 3D's expedition frame exists. The app
 * picks one with `?encounter=<id>` (default: the Gravity range) and keeps a save slot per
 * encounter, seed and save format.
 *
 * Adding an encounter: its owning section (3B Inverse Wells, 3C the lattice, and later ones)
 * adds one entry to `ENCOUNTERS` below, importing its own factory. That one-line edit is open
 * to those sections; the rest of this file is 2F's. An entry's `create(run)` returns the
 * encounter as run `run` of a save meets it (A10: 0-based; the run's geometry and sensor noise
 * come from its seed), with its environment fields' registry in `EncounterSetup.fields`.
 */

import {
  createGravityRange,
  ENCOUNTER_ID as GRAVITY_RANGE,
  SAVE_FORMAT as GRAVITY_RANGE_FORMAT,
  SEED as GRAVITY_RANGE_SEED,
} from '../content/gravity-range/index.ts';
import type { EncounterSetup } from './encounter.ts';

export interface EncounterEntry {
  readonly id: string;
  readonly name: string;
  /** Root seed of the encounter's world. */
  readonly seed: string;
  /**
   * Bump when records made under an earlier build describe a different world or ship; the
   * app then starts a fresh save slot rather than mixing evidence from two worlds.
   */
  readonly saveFormat: number;
  /** The encounter as run `run` of a save meets it (0-based). */
  create(run: number): EncounterSetup;
}

export const ENCOUNTERS: readonly EncounterEntry[] = [
  {
    id: GRAVITY_RANGE,
    name: 'Gravity range',
    seed: GRAVITY_RANGE_SEED,
    saveFormat: GRAVITY_RANGE_FORMAT,
    create: (run) => createGravityRange(GRAVITY_RANGE_SEED, { run }),
  },
];

/** The entry for `id`, or the Gravity range when `id` is absent or unknown. */
export function encounterEntry(id?: string | null): EncounterEntry {
  return ENCOUNTERS.find((e) => e.id === id) ?? ENCOUNTERS[0]!;
}

/** The save slot for an encounter's records (one IndexedDB database per slot). */
export const saveSlot = (entry: EncounterEntry): string =>
  `recursion-${entry.id}-${entry.seed}-${entry.saveFormat}`;
