/**
 * BELIEF side (no truth imports). The power cautions (A18 (5), A12): what the ship's own
 * gauges say about how long its stored energy will last. Read from the believed ship's latest
 * telemetry and the nominal design only.
 *
 * - **caution `power-low`**: at the present net drain, the batteries and the fuel cells'
 *   reactants run out within `cautionLead`;
 * - **warning `power-reserve`**: the fuel cells have run dry and the batteries are carrying the
 *   load: the last reserve, draining;
 * - **warning `life-support`**: a running life-support unit is short of the power it needs.
 *   Once the ship is dark its recorder stops too, so this one may never be read; the reserve
 *   warning is the one the gauges can be relied on to give.
 *
 * Stored energy: the batteries' charge, plus the fuel cells' remaining hydrogen (or oxygen at
 * 8:1, whichever runs out first) times its specific energy at the stacks' net efficiency, from
 * the nominal design (`ShipDefinition.systems.generation.fuelCell`, the crew's spec sheet).
 * Net drain: the generation buses' load less what the solar arrays deliver.
 */

import type { BelievedShip, ShipDefinition } from '../../contracts/index.ts';

export type PowerAlertLevel = 'caution' | 'warning';

export interface PowerAlert {
  readonly id: 'power-low' | 'power-reserve' | 'life-support';
  readonly level: PowerAlertLevel;
  /** Seconds until the stored energy runs out at the present drain (absent: not draining). */
  readonly timeToEmpty?: number;
  /** Stored energy, J, and the net drain, W. */
  readonly stored: number;
  readonly drain: number;
}

/** [ASSUMED] Nominal fuel-cell numbers when the design does not give them (1C's values). */
const FALLBACK = { hydrogenHHV: 1.42e8, netEfficiencyHHV: 0.5, oxygenPerHydrogen: 8 };

function fuelCellSpec(definition: ShipDefinition): typeof FALLBACK {
  const generation = definition.systems?.generation as
    { readonly fuelCell?: Partial<typeof FALLBACK> } | undefined;
  const f = generation?.fuelCell ?? {};
  return {
    hydrogenHHV: f.hydrogenHHV ?? FALLBACK.hydrogenHHV,
    netEfficiencyHHV: f.netEfficiencyHHV ?? FALLBACK.netEfficiencyHHV,
    oxygenPerHydrogen: f.oxygenPerHydrogen ?? FALLBACK.oxygenPerHydrogen,
  };
}

const reading = (ship: BelievedShip, channel: string): number | undefined =>
  ship.telemetry[channel]?.value;

/** Stored energy and net drain as the gauges show them. */
export function powerBudget(
  ship: BelievedShip,
  definition: ShipDefinition,
): { stored: number; drain: number; reactants: number } {
  let battery = 0;
  for (const e of definition.equipment)
    if (e.kind === 'battery') battery += reading(ship, `${e.id}.charge`) ?? 0;
  const fc = fuelCellSpec(definition);
  const h2 = reading(ship, 'fuel-cell-hydrogen.propellant') ?? 0;
  const o2 = reading(ship, 'fuel-cell-oxygen.propellant');
  const usable = o2 === undefined ? h2 : Math.min(h2, o2 / fc.oxygenPerHydrogen);
  const reactants = Math.max(0, usable) * fc.hydrogenHHV * fc.netEfficiencyHHV;
  // The generation buses carry the whole demand, conversion included.
  let load = 0;
  for (const b of definition.buses) {
    if (!b.id.startsWith('main-')) continue;
    load += reading(ship, `${b.id}.load`) ?? 0;
  }
  let solar = 0;
  for (const e of definition.equipment)
    if (e.kind === 'power-source' && e.id.startsWith('solar'))
      solar += reading(ship, `${e.id}.generated-power`) ?? 0;
  return { stored: battery + reactants, drain: load - solar, reactants };
}

/** The power alerts the gauges raise now, most serious first. */
export function powerAlerts(
  ship: BelievedShip,
  definition: ShipDefinition,
  cautionLead: number,
): PowerAlert[] {
  const { stored, drain, reactants } = powerBudget(ship, definition);
  const alerts: PowerAlert[] = [];
  const starved = definition.equipment.some(
    (e) =>
      e.kind === 'life-support' &&
      ship.equipment[e.id]?.mode === 'active' &&
      (reading(ship, `${e.id}.unmet-power`) ?? 0) > 1,
  );
  if (starved) alerts.push({ id: 'life-support', level: 'warning', stored, drain });
  // [ASSUMED] Under a kilojoule of reactants left counts as dry.
  if (reactants < 1e3 && drain > 0)
    alerts.push({
      id: 'power-reserve',
      level: 'warning',
      timeToEmpty: stored / drain,
      stored,
      drain,
    });
  if (drain > 0) {
    const timeToEmpty = stored / drain;
    if (timeToEmpty < cautionLead)
      alerts.push({ id: 'power-low', level: 'caution', timeToEmpty, stored, drain });
  }
  return alerts;
}
