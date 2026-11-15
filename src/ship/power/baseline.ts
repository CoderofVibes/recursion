import baseline from '../../../data/ship-baseline.json';
import type { ShipDefinition } from '../../contracts/ship.ts';

export type Baseline = typeof baseline;
export interface OperatingMode {
  power: number;
  heat: number;
  generatedPower: number;
  dataRate: number;
}

/** The loader preserves the complete versioned 1C payload under systems. */
export function systems(definition: ShipDefinition): Baseline {
  return (definition.systems ?? baseline) as unknown as Baseline;
}

/** What `modeOf` gives for a mode the baseline does not list. */
export const NO_MODE: OperatingMode = { power: 0, heat: 0, generatedPower: 0, dataRate: 0 };
const modeTables = new WeakMap<object, Map<string, Record<string, OperatingMode>>>();

/** Every assembly's mode table by id, built once per baseline payload (a lookup, not state). */
function modesById(data: Baseline): Map<string, Record<string, OperatingMode>> {
  let table = modeTables.get(data);
  if (!table) {
    table = new Map(
      data.equipment.map((entry) => [
        entry.id,
        entry.modes as unknown as Record<string, OperatingMode>,
      ]),
    );
    modeTables.set(data, table);
  }
  return table;
}

export function modeOf(definition: ShipDefinition, id: string, mode: string): OperatingMode {
  return modesById(systems(definition)).get(id)?.[mode] ?? NO_MODE;
}

/** An assembly's whole mode table in the baseline (`modeOf` reads one entry of it). */
export function modesOf(
  definition: ShipDefinition,
  id: string,
): Readonly<Record<string, OperatingMode>> | undefined {
  return modesById(systems(definition)).get(id);
}

export const bounded = (x: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, x));
