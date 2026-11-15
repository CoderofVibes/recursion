import baseline from '../../../data/ship-baseline.json';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import type { Vec3 } from '../../lib/vec3.ts';

/** One RCS jet of the baseline: a nozzle on a pod, in one of the pod's two banks. */
export interface Jet {
  readonly id: string;
  /** Equipment id of the pod it sits on. */
  readonly pod: string;
  readonly bank: 'a' | 'b';
  /** Its number within the pod and bank: the `jet-<index>` mode selects it for a manual burn. */
  readonly index: number;
  /** Nominal unit direction of the force on the ship, body frame. */
  readonly direction: Vec3;
  /** Tanks it draws from. */
  readonly resourceIds: readonly string[];
}

const dataFor = (definition: ShipDefinition) =>
  (definition.systems ?? baseline) as unknown as typeof baseline;

const jetTables = new WeakMap<ShipDefinition, readonly Jet[]>();

/** Every installed jet, in the baseline's order. Built once per definition. */
export function jetsOf(definition: ShipDefinition): readonly Jet[] {
  let jets = jetTables.get(definition);
  if (!jets) {
    jets = dataFor(definition).propulsion.rcs.jets.map((jet) => ({
      id: jet.id,
      pod: jet.equipmentId,
      bank: jet.bank === 'b' ? 'b' : 'a',
      index: Number(jet.id.slice(jet.id.lastIndexOf('-') + 1)),
      direction: { x: jet.direction[0]!, y: jet.direction[1]!, z: jet.direction[2]! },
      resourceIds: jet.resourceIds,
    }));
    jetTables.set(definition, jets);
  }
  return jets;
}

const bankTables = new WeakMap<ShipDefinition, Map<string, readonly Jet[]>>();

/** The jets of a pod's active bank (`values.bank`: 0 is A, 1 is B), by index. */
export function activeJets(
  definition: ShipDefinition,
  state: ShipSystemsState,
  pod: string,
): readonly Jet[] {
  const bank = (state.equipment[pod]?.values.bank ?? 0) === 1 ? 'b' : 'a';
  let table = bankTables.get(definition);
  if (!table) bankTables.set(definition, (table = new Map()));
  const key = `${pod}/${bank}`;
  let jets = table.get(key);
  if (!jets) {
    jets = jetsOf(definition).filter((jet) => jet.pod === pod && jet.bank === bank);
    table.set(key, jets);
  }
  return jets;
}

/** Minimum-impulse bookkeeping of one automatically fired jet (both in SI). */
export interface JetPulse {
  /** Demanded impulse not yet large enough for a minimum bit, N·s. */
  readonly pending: number;
  /** Time left of a committed minimum pulse, s. */
  readonly pulse: number;
}

export type JetPulses = Readonly<Record<string, JetPulse>>;

export const PULSES_KEY = 'propulsion.pulses';
export const CONTROL_KEY = 'propulsion.control';

/** Duty per jet index, per pod, asked by the attitude and hands-on controller this step. */
export type JetControl = Readonly<Record<string, Readonly<Record<string, number>>>>;

export const pulsesOf = (state: ShipSystemsState): JetPulses =>
  (state.ext?.[PULSES_KEY] as unknown as JetPulses | undefined) ?? {};

export const controlOf = (state: ShipSystemsState): JetControl =>
  (state.ext?.[CONTROL_KEY] as unknown as JetControl | undefined) ?? {};

/**
 * Forget the queued and committed pulses of the automatically fired jets of one pod (or of
 * every pod): a cutoff, a mode change or a bank or jet switch must not leave thrust behind.
 */
export function clearJetPulses(
  state: ShipSystemsState,
  definition: ShipDefinition,
  pod: string | 'all',
): ShipSystemsState {
  const pulses = pulsesOf(state);
  const kept: Record<string, JetPulse> = {};
  let changed = false;
  const podOf = new Map(jetsOf(definition).map((jet) => [jet.id, jet.pod]));
  for (const [id, value] of Object.entries(pulses)) {
    if (pod === 'all' || podOf.get(id) === pod) changed = true;
    else kept[id] = value;
  }
  if (!changed) return state;
  return { ...state, ext: { ...state.ext, [PULSES_KEY]: kept as unknown as JsonValue } };
}
