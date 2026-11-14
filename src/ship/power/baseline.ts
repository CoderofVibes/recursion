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

export function modeOf(definition: ShipDefinition, id: string, mode: string): OperatingMode {
  const item = systems(definition).equipment.find((entry) => entry.id === id);
  const modes = item?.modes as Record<string, OperatingMode> | undefined;
  return modes?.[mode] ?? { power: 0, heat: 0, generatedPower: 0, dataRate: 0 };
}

export const bounded = (x: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, x));
