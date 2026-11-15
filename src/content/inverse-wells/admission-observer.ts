/** Content-owned truth diagnostics around existing production hooks. Never feeds the pilot. */
import type { EncounterSetup, DynamicsEvent, DynamicsSample } from '../../game/encounter.ts';
import { adaptSetup } from '../../game/adapters.ts';
import type { FunnelLifecycleState } from './lifecycle.ts';

const phases = (state: FunnelLifecycleState) => {
  const counts = { dormant: 0, precursor: 0, active: 0, cancelled: 0 };
  for (const site of state.sites) counts[site.phase]++;
  return counts;
};

/** Observe each real call once and return the owner's exact result, without changing dynamics. */
export function observeGardenAdmission(given: EncounterSetup) {
  const production = adaptSetup(given);
  const dynamics = production.dynamics;
  const hazards = production.hazards;
  if (!dynamics || !hazards)
    throw new Error('Admission requires production funnel dynamics and hazards');
  const initial = dynamics.initial as unknown as FunnelLifecycleState;
  let latest = initial;
  const epochs: Array<{ t: number; ship: DynamicsSample; events: readonly DynamicsEvent[] }> = [];
  const contacts: Array<{
    t: number;
    field: string;
    cause: string;
    tick: readonly [number, number];
  }> = [];
  let sampledTicks = 0,
    sweptTicks = 0,
    fieldRebuilds = 0;
  let maxAngularStep = 0;
  let lastStart: {
    t: number;
    kinematics: EncounterSetup['definition']['world']['ship']['kinematics'];
  } | null = null;
  let lastSweep: { t0: number; t1: number; endPosition: DynamicsSample['position'] } | null = null;
  const setup: EncounterSetup = {
    ...production,
    environment(state, effects) {
      sampledTicks++;
      const k = state.world.ship.kinematics;
      maxAngularStep = Math.max(
        maxAngularStep,
        Math.hypot(k.angularVelocity.x, k.angularVelocity.y, k.angularVelocity.z) *
          given.definition.dt,
      );
      lastStart = { t: state.world.t, kinematics: structuredClone(k) };
      return production.environment?.(state, effects) ?? effects;
    },
    dynamics: {
      ...dynamics,
      advance(state, to, ship) {
        const result = dynamics.advance(state, to, ship);
        latest = result.state as unknown as FunnelLifecycleState;
        epochs.push({ t: to, ship: structuredClone(ship), events: structuredClone(result.events) });
        return result;
      },
    },
    hazards(specs) {
      fieldRebuilds++;
      const source = hazards(specs);
      return {
        sweep(start, hull, endPosition, t0, t1) {
          sweptTicks++;
          const result = source.sweep(start, hull, endPosition, t0, t1);
          lastSweep = { t0, t1, endPosition: { ...endPosition } };
          for (const c of result) contacts.push({ ...c, tick: [t0, t1] });
          return result;
        },
      };
    },
  };
  return {
    setup,
    finish() {
      return {
        schema: 'well-admission-observations-v1',
        initialPhases: phases(initial),
        finalPhases: phases(latest),
        lastLifecycleEpoch: latest.t,
        dueCursor: latest.dueCursor,
        events: epochs,
        eventCounts: epochs
          .flatMap((e) => e.events)
          .reduce<Record<string, number>>((n, e) => {
            n[e.kind] = (n[e.kind] ?? 0) + 1;
            return n;
          }, {}),
        sampledTicks,
        sweptTicks,
        fieldRebuilds,
        contacts,
        lastStart,
        lastSweep,
        maxAngularStepRadians: maxAngularStep,
        limits: [
          'Observers return unmodified production hook results; this is not another solver or recorder.',
          'A production seen precursor flag is not a camera detection or a verified visibility margin.',
          'Sweeps use straight COM paths and starting hull/attitude; rotating/deploying continuous clearance is not certified.',
          'No contact is not a measured positive clearance; generic harness body clearance excludes funnels.',
          'Last start state precedes the final tick. Sweep endpoint is not final velocity or the exact loss-time state.',
          'Field work and whole-session save/resume remain unmeasured.',
        ],
      };
    },
  };
}
