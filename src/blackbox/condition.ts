/**
 * Equipment condition in the record (R27; DECISIONS A16; S17: "the apparent global failure is
 * understood through the first few localized failures"). For the loss review and the console.
 *
 * From the record's ship events only, per equipment id as the ship names it: reported condition
 * changes (`condition-changed`, whose `condition` is the reported condition by contract), faults,
 * breaker trips, recoveries and load sheds, in time order; the condition last reported; and when
 * each piece first failed or faulted. Nothing is derived from a dose or a true state: `exposure`
 * events are not read here.
 */

import type { AttemptRecord, ShipEvent } from '../contracts/index.ts';

export type EquipmentEntry =
  | { readonly t: number; readonly kind: 'condition'; readonly condition: number }
  | { readonly t: number; readonly kind: 'fault'; readonly fault: string }
  | { readonly t: number; readonly kind: 'trip' }
  | { readonly t: number; readonly kind: 'recovered' }
  | { readonly t: number; readonly kind: 'shed'; readonly reason: string };

export interface EquipmentTimeline {
  readonly equipment: string;
  readonly entries: readonly EquipmentEntry[];
  /** The condition last reported (1 when none was). */
  readonly condition: number;
  /** When it was first reported failed (condition 0), if it was. */
  readonly failedAt?: number;
  /** Its first fault, if any. */
  readonly firstFault?: { readonly t: number; readonly fault: string };
  /** The id is not in the ship's equipment list (when one was given). */
  readonly unknown?: true;
}

function entryOf(e: ShipEvent): [string, EquipmentEntry] | null {
  switch (e.kind) {
    case 'condition-changed':
      return [e.equipment, { t: e.t, kind: 'condition', condition: e.condition }];
    case 'equipment-fault':
      return [e.equipment, { t: e.t, kind: 'fault', fault: e.fault }];
    case 'breaker-trip':
      return [e.equipment, { t: e.t, kind: 'trip' }];
    case 'equipment-recovered':
      return [e.equipment, { t: e.t, kind: 'recovered' }];
    case 'load-shed':
      return [e.equipment, { t: e.t, kind: 'shed', reason: e.reason }];
    default:
      return null;
  }
}

/**
 * Each piece of equipment's recorded condition history up to `now`, ordered by when its story
 * starts (the first entry), so the loss review reads the failures in the order they came.
 * `known`: the ship's equipment ids; anything else is kept and marked `unknown`.
 */
export function equipmentTimeline(
  rec: Pick<AttemptRecord, 'events'>,
  now = Infinity,
  known?: readonly string[],
): EquipmentTimeline[] {
  const byId = new Map<string, EquipmentEntry[]>();
  for (const e of rec.events) {
    if (e.t > now) continue;
    const got = entryOf(e);
    if (!got) continue;
    const [id, entry] = got;
    byId.set(id, [...(byId.get(id) ?? []), entry]);
  }
  const ids = known ? new Set(known) : null;
  return [...byId.entries()]
    .map(([equipment, entries]): EquipmentTimeline => {
      const sorted = [...entries].sort((a, b) => a.t - b.t);
      let condition = 1;
      let failedAt: number | undefined;
      let firstFault: { t: number; fault: string } | undefined;
      for (const x of sorted) {
        if (x.kind === 'condition') {
          condition = x.condition;
          if (x.condition <= 0 && failedAt === undefined) failedAt = x.t;
        }
        if (x.kind === 'fault' && !firstFault) firstFault = { t: x.t, fault: x.fault };
      }
      return {
        equipment,
        entries: sorted,
        condition,
        ...(failedAt !== undefined ? { failedAt } : {}),
        ...(firstFault ? { firstFault } : {}),
        ...(ids && !ids.has(equipment) ? { unknown: true as const } : {}),
      };
    })
    .sort((a, b) => a.entries[0]!.t - b.entries[0]!.t || (a.equipment < b.equipment ? -1 : 1));
}

/**
 * The order in which equipment first failed or faulted, up to `now`: when, which, and how
 * (`failed`, or the fault's name). What a loss review leads with.
 */
export function failureOrder(
  rec: Pick<AttemptRecord, 'events'>,
  now = Infinity,
): { readonly t: number; readonly equipment: string; readonly how: string }[] {
  return equipmentTimeline(rec, now)
    .flatMap((q) => {
      const first =
        q.failedAt !== undefined && (!q.firstFault || q.failedAt <= q.firstFault.t)
          ? { t: q.failedAt, how: 'failed' }
          : q.firstFault
            ? { t: q.firstFault.t, how: q.firstFault.fault }
            : null;
      return first ? [{ t: first.t, equipment: q.equipment, how: first.how }] : [];
    })
    .sort((a, b) => a.t - b.t || (a.equipment < b.equipment ? -1 : 1));
}
