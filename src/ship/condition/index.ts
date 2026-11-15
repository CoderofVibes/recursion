import type { ShipDefinition } from '../../contracts/ship.ts';
import type { EquipmentState, ShipSystemsState } from '../../contracts/truth/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import { bounded, systems } from '../power/baseline.ts';

/** Raw field dose; susceptibility is applied here, exactly once. A slice must not
 * cross an intensity-threshold edge. Unresolved field bounds require refinement. */
export interface ComponentExposure {
  readonly rawDose: number;
  readonly aboveBurnout: boolean;
}
export type Exposure = Readonly<Record<string, ComponentExposure>>;
export type Energized = Readonly<Record<string, boolean>>;
export type RadiationProfile = ReturnType<typeof systems>['radiation']['profiles']['standard'];

const profiles = new WeakMap<ShipDefinition, ReadonlyMap<string, RadiationProfile>>();
export function radiationProfiles(
  definition: ShipDefinition,
): ReadonlyMap<string, RadiationProfile> {
  let table = profiles.get(definition);
  if (!table) {
    const data = systems(definition);
    table = new Map(
      data.equipment.map((e) => [
        e.id,
        data.radiation.profiles[e.radiationProfile as keyof typeof data.radiation.profiles],
      ]),
    );
    profiles.set(definition, table);
  }
  return table;
}

/** Temporary functional inhibition, independent of permanent condition and trips.
 * A reboot still consumes electrical power and remains vulnerable to burnout. */
export function functionAvailable(e: EquipmentState | undefined, t: number): boolean {
  return (
    !!e &&
    e.condition > 0 &&
    !e.tripped &&
    e.mode !== 'off' &&
    (e.values.radiationRestartUntil ?? 0) <= t &&
    (e.values.thermalInhibited ?? 0) === 0
  );
}

function bucket(dose: number, spacing: number): number {
  return spacing > 0 ? Math.floor((dose + 1e-10) / spacing) : 0;
}

/** True if a prefix reaches a discrete condition event. The caller re-queries
 * actual swept geometry at every bisection; dose/duration is NEVER an intensity. */
function reachesEvent(
  state: ShipSystemsState,
  definition: ShipDefinition,
  exposure: Exposure,
  energized: Energized,
  dt: number,
): boolean {
  const radiation = systems(definition).radiation;
  for (const [id, profile] of radiationProfiles(definition)) {
    const e = state.equipment[id];
    if (!e || profile.susceptibility === 0) continue;
    const sample = exposure[id];
    const before = state.exposure[id] ?? 0;
    const after = before + (sample?.rawDose ?? 0) * profile.susceptibility;
    if (e.condition > 0 && after >= profile.failureExposure && before < profile.failureExposure)
      return true;
    if (energized[id] && e.condition > 0 && !e.tripped) {
      if (sample?.aboveBurnout && (e.values.radiationDwell ?? 0) + dt >= radiation.burnoutDwell)
        return true;
      if (
        bucket(after, profile.latchInterval) >
        (e.values.radiationLatchBucket ?? bucket(before, profile.latchInterval))
      )
        return true;
      if (
        bucket(after, profile.upsetInterval) >
        (e.values.radiationUpsetBucket ?? bucket(before, profile.upsetInterval))
      )
        return true;
    }
    const recovery = e.values.radiationRestartUntil ?? 0;
    if (recovery > state.t && recovery <= state.t + dt) return true;
  }
  return false;
}

/** Earliest condition boundary to <= tolerance seconds, using the field owner's
 * certified prefix integrals. sample(0) must return zero dose. The caller caps
 * duration at every high-intensity edge and at every electrical topology change.
 * Bounds straddling a dose bucket must be refined by sample, not averaged here. */
export function nextConditionBoundary(
  state: ShipSystemsState,
  definition: ShipDefinition,
  sample: (duration: number) => Exposure,
  energized: Energized,
  duration: number,
  tolerance = 0.00025,
): number {
  if (
    !(duration > 0) ||
    !Number.isFinite(duration) ||
    !(tolerance > 0) ||
    !Number.isFinite(tolerance)
  )
    throw new RangeError('Condition duration and tolerance must be finite and positive.');
  if (!reachesEvent(state, definition, sample(duration), energized, duration)) return duration;
  let low = 0;
  let high = duration;
  while (high - low > tolerance) {
    const middle = (low + high) / 2;
    if (reachesEvent(state, definition, sample(middle), energized, middle)) high = middle;
    else low = middle;
  }
  return high;
}

/** Advance ONE event-bounded interval with its actual integrated dose. Inputs
 * carry actual energization through that interval, not averaged bus watts.
 * Persisted bucket cursors advance off/tripped/failed too. No survival RNG. */
export function stepCondition(
  state: ShipSystemsState,
  definition: ShipDefinition,
  exposure: Exposure,
  energized: Energized,
  dt: number,
): { state: ShipSystemsState; events: ShipEvent[] } {
  if (!(dt > 0) || !Number.isFinite(dt))
    throw new RangeError('Condition dt must be finite and positive.');
  const data = systems(definition).radiation;
  const equipment = { ...state.equipment };
  const doses = { ...state.exposure };
  const events: ShipEvent[] = [];
  const at = state.t + dt;
  for (const [id, profile] of radiationProfiles(definition)) {
    const e = equipment[id];
    if (!e || profile.susceptibility === 0) continue;
    const sample = exposure[id];
    const rawDose = sample?.rawDose ?? 0;
    if (!Number.isFinite(rawDose) || rawDose < 0)
      throw new RangeError(`Invalid raw dose for ${id}.`);
    if (rawDose === 0 && !e.values.radiationDwell && !e.values.radiationRestartUntil) continue;
    const before = doses[id] ?? 0;
    const amount = rawDose * profile.susceptibility;
    const dose = before + amount;
    doses[id] = dose;
    const values = { ...e.values };
    let faults = [...e.faults];
    let condition = e.condition;
    let tripped = e.tripped;
    const live = !!energized[id] && e.condition > 0 && !e.tripped && e.mode !== 'off';
    const dwell = live && sample?.aboveBurnout ? (values.radiationDwell ?? 0) + dt : 0;
    values.radiationDwell = dwell;
    const upsets = bucket(dose, profile.upsetInterval);
    const latches = bucket(dose, profile.latchInterval);
    const oldUpsets = values.radiationUpsetBucket ?? bucket(before, profile.upsetInterval);
    const oldLatches = values.radiationLatchBucket ?? bucket(before, profile.latchInterval);
    values.radiationUpsetBucket = upsets;
    values.radiationLatchBucket = latches;
    const remaining =
      1 -
      bounded(
        (dose - profile.degradationStart) / (profile.failureExposure - profile.degradationStart),
        0,
        1,
      );
    const oldRemaining =
      values.radiationRemaining ??
      1 -
        bounded(
          (before - profile.degradationStart) /
            (profile.failureExposure - profile.degradationStart),
          0,
          1,
        );
    condition = oldRemaining > 0 ? condition * (remaining / oldRemaining) : 0;
    values.radiationRemaining = remaining;
    values.radiationLeakage = data.maxLeakageFraction * (1 - remaining);
    const fault = (name: string) => {
      if (!faults.includes(name)) faults.push(name);
      events.push({ kind: 'equipment-fault', t: at, equipment: id, fault: name });
    };
    // Failure > trip > upset for exact ties. A reboot does not electrically isolate hardware.
    if (
      e.condition > 0 &&
      (dose >= profile.failureExposure || (live && dwell >= data.burnoutDwell))
    ) {
      condition = 0;
      values.radiationDwell = 0;
      fault(dose >= profile.failureExposure ? 'radiation-dose-failure' : 'radiation-burnout');
    } else if (live && latches > oldLatches) {
      tripped = true;
      values.trippedAt = at;
      values.radiationDwell = 0;
      // Existing deliberate reset clears overcurrent. The origin remains in events/dose.
      fault('overcurrent');
      events.push({ kind: 'breaker-trip', t: at, equipment: id });
    } else if (live && upsets > oldUpsets) {
      values.radiationRestartUntil = at + data.restartTime;
      fault('radiation-upset');
    }
    if (values.radiationRestartUntil && values.radiationRestartUntil <= at) {
      delete values.radiationRestartUntil;
      faults = faults.filter((f) => f !== 'radiation-upset');
      if (condition > 0 && !tripped)
        events.push({ kind: 'equipment-recovered', t: at, equipment: id });
    }
    if (condition !== e.condition)
      events.push({ kind: 'condition-changed', t: at, equipment: id, condition });
    if (amount > 0) events.push({ kind: 'exposure', t: at, equipment: id, amount });
    equipment[id] = { ...e, condition, tripped, faults, values };
  }
  const rank = (e: ShipEvent) =>
    e.kind === 'condition-changed' && e.condition === 0
      ? 0
      : e.kind === 'equipment-fault' && e.fault.includes('burnout')
        ? 0
        : e.kind === 'equipment-fault' && e.fault.includes('failure')
          ? 0
          : e.kind === 'breaker-trip' || (e.kind === 'equipment-fault' && e.fault === 'overcurrent')
            ? 1
            : e.kind === 'equipment-fault' && e.fault === 'radiation-upset'
              ? 2
              : 3;
  events.sort(
    (a, b) =>
      a.t - b.t ||
      rank(a) - rank(b) ||
      ('equipment' in a ? a.equipment : '').localeCompare('equipment' in b ? b.equipment : ''),
  );
  return { state: { ...state, equipment, exposure: doses }, events };
}
