/**
 * BELIEF side (no truth imports). The power alerts (A18 (5) after S21, A12): what the ship's own
 * gauges and fault reports say. Read from the believed ship's latest telemetry, the ship's fault
 * events and the nominal design only.
 *
 * - **caution `power-low`**: the gauges' no-generation endurance, the stored energy over the
 *   present demand as if the arrays gave nothing, is under `cautionLead` (4 h). Deploying and
 *   pointing the arrays fits easily inside it (S21: 30 s and a half turn of about 420 s);
 * - **caution `power-reserve`**: the fuel cells have run dry and the batteries carry the load;
 * - **warning `critical-service`**: a critical function (the air train, a cooling pump, the
 *   flight computer, the IMU) is short of power. It names the functions and, from the ship's
 *   first fault report, when the shortage began, so the screens can count down the 120 s after
 *   which the attempt is lost (`deadline`).
 *
 * Stored energy: the batteries' charge as they can deliver it (at their discharge efficiency),
 * plus the fuel cells' remaining hydrogen (or oxygen at 8:1, whichever runs out first) times its
 * specific energy at the stacks' net efficiency, from the nominal design
 * (`ShipDefinition.systems.generation`, the crew's spec sheet). Demand: the generation buses'
 * load less what the batteries take to charge. Drain: demand less the arrays' output.
 */

import type { BelievedShip, ShipDefinition, ShipEvent } from '../../contracts/index.ts';

export type PowerAlertLevel = 'caution' | 'warning';

export interface PowerAlert {
  readonly id: 'power-low' | 'power-reserve' | 'critical-service';
  readonly level: PowerAlertLevel;
  /**
   * Seconds the stored energy lasts at the present demand with no generation (`power-low`), or
   * at the present net drain (`power-reserve`). Absent when nothing drains it.
   */
  readonly timeToEmpty?: number;
  /** Stored energy, J; demand with no generation and net drain, W. */
  readonly stored: number;
  readonly demand: number;
  readonly drain: number;
  /** `critical-service`: the functions short of power (redundancy groups). */
  readonly functions?: readonly string[];
  /** `critical-service`: when the shortage began, and when the attempt is lost if it lasts. */
  readonly since?: number;
  readonly deadline?: number;
}

/** [ASSUMED] Nominal fuel-cell numbers when the design does not give them (1C's values). */
const FALLBACK = { hydrogenHHV: 1.42e8, netEfficiencyHHV: 0.5, oxygenPerHydrogen: 8 };
/** [ASSUMED: S21] A unit drawing less than this share of its mode's power is short. */
const SERVED_FRACTION = 0.95;

function generationSpec(definition: ShipDefinition): typeof FALLBACK & {
  dischargeEfficiency: number;
} {
  const generation = definition.systems?.generation as
    | {
        readonly fuelCell?: Partial<typeof FALLBACK>;
        readonly battery?: { readonly dischargeEfficiency?: number };
      }
    | undefined;
  const f = generation?.fuelCell ?? {};
  return {
    hydrogenHHV: f.hydrogenHHV ?? FALLBACK.hydrogenHHV,
    netEfficiencyHHV: f.netEfficiencyHHV ?? FALLBACK.netEfficiencyHHV,
    oxygenPerHydrogen: f.oxygenPerHydrogen ?? FALLBACK.oxygenPerHydrogen,
    dischargeEfficiency: generation?.battery?.dischargeEfficiency ?? 1,
  };
}

const reading = (ship: BelievedShip, channel: string): number | undefined =>
  ship.telemetry[channel]?.value;

/** The redundancy groups the ship never sheds: its critical functions, from the design. */
export function criticalFunctions(definition: ShipDefinition): string[] {
  const groups: string[] = [];
  for (const e of definition.equipment)
    if (e.sheddable === false && e.redundancyGroup && !groups.includes(e.redundancyGroup))
      groups.push(e.redundancyGroup);
  return groups;
}

/** The power a unit's mode needs, W, by the design. */
const modePower = (definition: ShipDefinition, id: string, mode: string): number => {
  const spec = definition.equipment.find((e) => e.id === id);
  return spec?.params[`mode.${mode}.power`] ?? spec?.ratedPower ?? 0;
};

/** Stored energy, demand with no generation, and net drain, as the gauges show them. */
export function powerBudget(
  ship: BelievedShip,
  definition: ShipDefinition,
): { stored: number; demand: number; drain: number; reactants: number } {
  const g = generationSpec(definition);
  let battery = 0;
  let charging = 0;
  for (const e of definition.equipment) {
    if (e.kind !== 'battery') continue;
    battery += (reading(ship, `${e.id}.charge`) ?? 0) * g.dischargeEfficiency;
    // A battery draws power only to charge.
    charging += reading(ship, `${e.id}.power`) ?? 0;
  }
  const h2 = reading(ship, 'fuel-cell-hydrogen.propellant') ?? 0;
  const o2 = reading(ship, 'fuel-cell-oxygen.propellant');
  const usable = o2 === undefined ? h2 : Math.min(h2, o2 / g.oxygenPerHydrogen);
  const reactants = Math.max(0, usable) * g.hydrogenHHV * g.netEfficiencyHHV;
  // The generation buses carry the whole demand, conversion and charging included.
  let load = 0;
  for (const b of definition.buses) {
    if (!b.id.startsWith('main-')) continue;
    load += reading(ship, `${b.id}.load`) ?? 0;
  }
  let solar = 0;
  for (const e of definition.equipment)
    if (e.kind === 'power-source' && e.id.startsWith('solar'))
      solar += reading(ship, `${e.id}.generated-power`) ?? 0;
  const demand = Math.max(0, load - charging);
  return { stored: battery + reactants, demand, drain: demand - solar, reactants };
}

/**
 * The critical functions the gauges show short of power: no unit of the function reported in
 * its `active` mode, healthy and drawing at least 95% of that mode's power.
 */
export function shortFunctions(ship: BelievedShip, definition: ShipDefinition): string[] {
  const out: string[] = [];
  for (const group of criticalFunctions(definition)) {
    let served = false;
    for (const spec of definition.equipment) {
      if (spec.redundancyGroup !== group) continue;
      const e = ship.equipment[spec.id];
      if (!e || e.mode !== 'active' || e.tripped || e.condition <= 0) continue;
      const draw = reading(ship, `${spec.id}.power`) ?? e.powerDraw;
      if (draw >= SERVED_FRACTION * modePower(definition, spec.id, 'active')) served = true;
    }
    if (!served) out.push(group);
  }
  return out;
}

/**
 * The critical function a fault event reports short of power, if any: a `power-shortfall` on a
 * unit the ship may not shed. (A spare in standby being shed is a `load-shed`, and no shortage.)
 */
export function criticalFault(event: ShipEvent, definition: ShipDefinition): string | undefined {
  if (event.kind !== 'equipment-fault' || event.fault !== 'power-shortfall') return undefined;
  const spec = definition.equipment.find((e) => e.id === event.equipment);
  return spec && spec.sheddable === false ? spec.redundancyGroup : undefined;
}

/** The power alerts the gauges raise now, most serious first. */
export function powerAlerts(
  ship: BelievedShip,
  definition: ShipDefinition,
  cautionLead: number,
): PowerAlert[] {
  const { stored, demand, drain, reactants } = powerBudget(ship, definition);
  const alerts: PowerAlert[] = [];
  const short = shortFunctions(ship, definition);
  if (short.length > 0)
    alerts.push({
      id: 'critical-service',
      level: 'warning',
      functions: short,
      stored,
      demand,
      drain,
    });
  // [ASSUMED] Under a kilojoule of reactants left counts as dry.
  if (reactants < 1e3 && drain > 0)
    alerts.push({
      id: 'power-reserve',
      level: 'caution',
      timeToEmpty: stored / drain,
      stored,
      demand,
      drain,
    });
  if (demand > 0) {
    const timeToEmpty = stored / demand;
    if (timeToEmpty < cautionLead)
      alerts.push({ id: 'power-low', level: 'caution', timeToEmpty, stored, demand, drain });
  }
  return alerts;
}
