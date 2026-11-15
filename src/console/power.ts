/**
 * The ship's electrical budget as the console shows it: what each load is set to draw (from the
 * equipment's own ratings, so it is there before time starts), what the ship reports it drawing
 * once it does, what the sources supply and could supply, and how long the fuel-cell reactants
 * last at that load. One picture of how the systems share one supply (brief §4).
 *
 * Before the encounter is entered nothing has run: a setting made then reaches the ship on
 * ENTER, and the ship reports no draw. So the budget is worked out from what is *set* (the
 * settings waiting to be sent, else what the ship reports of itself, else the design's
 * defaults), by the same rule the ship applies: a unit asks for its mode's power, held to its
 * allocation where the ship may shed it.
 *
 * Pure: the design, the believed ship and the settings in, rows out. Belief side (P11).
 */
import type { BelievedShip, EquipmentSpec, ShipDefinition } from '../contracts/index.ts';
import { recorderEstimate } from './data.ts';

/** What is set for one unit: its mode, and the most power it may draw. */
export interface UnitSetting {
  readonly mode: string;
  readonly allocation: number;
}

/** Settings made but not yet with the ship (they are sent on ENTER), by unit. */
export type PendingSettings = Readonly<Record<string, Partial<UnitSetting>>>;

/** A unit's setting: what is waiting to be sent, else what the ship reports, else its default. */
export function settingOf(
  spec: EquipmentSpec,
  ship: Pick<BelievedShip, 'equipment'>,
  pending: PendingSettings = {},
): UnitSetting {
  const reported = ship.equipment[spec.id];
  const waiting = pending[spec.id];
  return {
    mode: waiting?.mode ?? reported?.mode ?? spec.defaultMode,
    allocation: waiting?.allocation ?? reported?.allocation ?? spec.ratedPower,
  };
}

/** The power a mode asks for, by the design's ratings, W. */
export const modePower = (spec: EquipmentSpec, mode: string): number =>
  spec.params[`mode.${mode}.power`] ?? 0;

/**
 * The power a unit draws as set, W: its mode's rating, held to its allocation where the ship
 * may shed it (a unit the ship never sheds takes what its mode asks). Off draws nothing. The
 * recorder asks by its sample rate, not its mode.
 */
export function designedDraw(
  spec: EquipmentSpec,
  setting: UnitSetting,
  definition: ShipDefinition,
  recorderRate?: number,
): number {
  if (!spec.bus || setting.mode === 'off') return 0;
  const wanted =
    spec.kind === 'recorder' && recorderRate !== undefined
      ? recorderEstimate(recorderRate, definition).watts
      : modePower(spec, setting.mode);
  return Math.min(wanted, Math.max(spec.sheddable ? 0 : wanted, setting.allocation));
}

/** The modes a player chooses between: not the resets, the transients or the jets' own. */
export function settableModes(spec: EquipmentSpec): string[] {
  return spec.modes.filter(
    (m) => m !== 'reset' && !/^(bank|jet|fire)-|^(moving|deploying|firing)$/.test(m),
  );
}

export interface PowerLoad {
  /** A group's id, or the unit's own id when it stands alone. */
  readonly id: string;
  readonly label: string;
  /** The units counted in it. */
  readonly units: readonly string[];
  /** What it draws as set, W. */
  readonly designed: number;
  /** What the ship reports it drawing, W. Absent until the ship has reported (before ENTER). */
  readonly measured?: number;
  /** The one unit behind a load the player sets directly (camera, recorder, processor, comms). */
  readonly unit?: EquipmentSpec;
}

export interface PowerSource {
  readonly id: string;
  readonly label: string;
  /** What it supplies: measured once the ship reports, else its share of the load as set. */
  readonly value: number;
  /** What it could supply in the mode it is set to, W. */
  readonly capacity: number;
  /** `value` is measured (the ship reported it), not worked out from the load. */
  readonly measured: boolean;
}

export interface PowerBudget {
  readonly loads: readonly PowerLoad[];
  readonly sources: readonly PowerSource[];
  /** The whole demand as set, W. */
  readonly demand: number;
  /** The whole demand as the ship reports it, W. Absent before it has reported. */
  readonly measured?: number;
  /** What the sources could supply as set, W. */
  readonly available: number;
  /**
   * Seconds the fuel-cell reactants on board last at the demand as set, by the design's own
   * fuel-cell figures. Absent where the design does not give them or nothing is drawn.
   */
  readonly endurance?: number;
}

/** The loads the player sets one by one; every other unit is counted in its group. */
const OWN_KINDS: ReadonlySet<string> = new Set(['optical-tracker', 'recorder', 'comms']);

const GROUPS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'life', label: 'life support' },
  { id: 'cooling', label: 'cooling loops' },
  { id: 'avionics', label: 'flight computers' },
  { id: 'engines', label: 'engines ready' },
  { id: 'other', label: 'other' },
];

function groupOf(spec: EquipmentSpec): string | null {
  if (OWN_KINDS.has(spec.kind)) return null;
  // The payload bus's processor is the science processor: the player sets it by itself.
  if (spec.kind === 'processor' && spec.bus === 'payload') return null;
  if (spec.kind === 'life-support') return 'life';
  if (spec.kind === 'radiator' || /pump|hx/.test(spec.id)) return 'cooling';
  if (['processor', 'accelerometer', 'star-tracker', 'power-bus'].includes(spec.kind))
    return 'avionics';
  if (spec.kind === 'main-engine' || spec.kind === 'rcs-thruster') return 'engines';
  if (spec.id === 'console') return 'avionics';
  return 'other';
}

/**
 * The budget. `recorderRate` is the Black Box sample rate as set (Hz), when it is known: the
 * recorder's draw follows it. `pending` are settings made before ENTER.
 */
export function powerBudget(
  ship: BelievedShip,
  definition: ShipDefinition,
  pending: PendingSettings = {},
  recorderRate?: number,
): PowerBudget {
  const reported = Object.keys(ship.telemetry).length > 0;
  const byGroup = new Map<string, { units: string[]; designed: number; measured: number }>();
  const own: PowerLoad[] = [];
  const sources: { spec: EquipmentSpec; capacity: number }[] = [];

  for (const spec of definition.equipment) {
    const setting = settingOf(spec, ship, pending);
    if (spec.kind === 'power-source') {
      sources.push({ spec, capacity: spec.params[`mode.${setting.mode}.generatedPower`] ?? 0 });
      continue;
    }
    if (spec.kind === 'battery' || !spec.bus) continue;
    const designed = designedDraw(spec, setting, definition, recorderRate);
    const drawn = ship.equipment[spec.id]?.powerDraw ?? 0;
    const group = groupOf(spec);
    if (group === null) {
      own.push({
        id: spec.id,
        label: spec.name,
        units: [spec.id],
        designed,
        ...(reported ? { measured: drawn } : {}),
        unit: spec,
      });
      continue;
    }
    const g = byGroup.get(group) ?? { units: [], designed: 0, measured: 0 };
    g.units.push(spec.id);
    g.designed += designed;
    g.measured += drawn;
    byGroup.set(group, g);
  }

  const grouped: PowerLoad[] = GROUPS.flatMap((g) => {
    const found = byGroup.get(g.id);
    // A group that asks for nothing and draws nothing is not a load.
    if (!found || (found.designed <= 0 && found.measured <= 0)) return [];
    return [
      {
        id: g.id,
        label: g.label,
        units: found.units,
        designed: found.designed,
        ...(reported ? { measured: found.measured } : {}),
      },
    ];
  });
  const loads = [...grouped, ...own];
  const demand = loads.reduce((n, l) => n + l.designed, 0);
  const measured = reported ? loads.reduce((n, l) => n + (l.measured ?? 0), 0) : undefined;

  // Sources that follow the load share it in the order the ship lists them, until the ship
  // reports what each is really giving.
  let left = demand;
  const supply: PowerSource[] = sources.map(({ spec, capacity }) => {
    const status = ship.equipment[spec.id];
    const given = status?.readings.output ?? status?.readings['generated-power'];
    const share = Math.min(capacity, Math.max(0, left));
    left -= share;
    const isMeasured = reported && given !== undefined;
    return {
      id: spec.id,
      label: spec.name,
      value: isMeasured ? given : share,
      capacity,
      measured: isMeasured,
    };
  });
  const available = supply.reduce((n, s) => n + s.capacity, 0);

  // Endurance: the reactants on board, by the gauges, at the demand as set.
  const cell = (
    definition.systems?.generation as { fuelCell?: Record<string, unknown> } | undefined
  )?.fuelCell;
  const heating = typeof cell?.hydrogenHHV === 'number' ? cell.hydrogenHHV : undefined;
  const efficiency = typeof cell?.netEfficiencyHHV === 'number' ? cell.netEfficiencyHHV : undefined;
  const perOxygen =
    typeof cell?.oxygenPerHydrogen === 'number' ? cell.oxygenPerHydrogen : undefined;
  const hydrogen = ship.propellant['fuel-cell-hydrogen']?.mean;
  const oxygen = ship.propellant['fuel-cell-oxygen']?.mean;
  let endurance: number | undefined;
  if (heating !== undefined && efficiency !== undefined && hydrogen !== undefined && demand > 0) {
    const usable =
      oxygen !== undefined && perOxygen !== undefined && perOxygen > 0
        ? Math.min(hydrogen, oxygen / perOxygen)
        : hydrogen;
    endurance = (Math.max(0, usable) * heating * efficiency) / demand;
  }

  return {
    loads,
    sources: supply,
    demand,
    ...(measured !== undefined ? { measured } : {}),
    available,
    ...(endurance !== undefined ? { endurance } : {}),
  };
}
