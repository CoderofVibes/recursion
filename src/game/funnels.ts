/**
 * TRUTH side. 3B's Inverse Wells in the truth tick (3B handoff requests 2 and 3; ledger R30):
 * the encounter's dynamics and hazards (`EncounterSetup.dynamics`, `.hazards`) built from 3B's
 * own functions, so neither the truth step nor 3B's content needs to know the other.
 *
 * - **Pop-up wells.** The lifecycle (`content/inverse-wells/lifecycle.ts`) is advanced at each
 *   of its due epochs (`nextFunnelLifecycleEvent`) with the ship's actual committed state there
 *   (`advanceFunnelLifecycle`): a precursor 900 s ahead, then the birth, or its veto when the
 *   ship is too close. Each change of activation gives new field specs, a registry built from
 *   exactly them (`createWellRegistry` refuses any other), and so a rebuilt simulation and
 *   hazard index. Precursors are `seen`: the eye sees them through the window (A19), and a new
 *   one drops warp to 1× while time runs on (A12).
 * - **Crush.** The earliest contact of any part of the hull with an active throat over the
 *   tick ends the attempt as `structural` (`createFunnelHullHazards().linearFixedHullSweep`:
 *   the hull's prisms, moving straight across the tick at its starting attitude). Dormant and
 *   cancelled throats have none. Nothing changes `lossSpeed`.
 *
 * Due epochs fall on ticks: the S22 births are whole seconds after a whole-second epoch and the
 * Garden steps at 1 s. The truth step refuses one between ticks rather than move it.
 */

import type { FieldInstanceSpec } from '../contracts/truth/index.ts';
import type { JsonValue } from '../contracts/units.ts';
import { createFunnelWindow } from './funnel-window.ts';
import {
  advanceFunnelLifecycle,
  createFunnelHullHazards,
  funnelLifecycleActivation,
  nextFunnelLifecycleEvent,
  restoreFunnelLifecycle,
  type FunnelLifecycleState,
  type InverseWellsSetup,
} from '../content/inverse-wells/index.ts';
import { createWellRegistry } from '../sim/fields/wells.ts';
import type { EncounterDynamics, EncounterHazards, EncounterSetup } from './encounter.ts';

/** The minimum gap 3B's provider builds its registry with, m. */
const WELL_GAP = 1;

const lifecycleOf = (state: JsonValue): FunnelLifecycleState => restoreFunnelLifecycle(state);

/** The specs whose activation the lifecycle changed, replaced; the rest kept as they are. */
function specsFor(
  state: FunnelLifecycleState,
  specs: readonly FieldInstanceSpec[],
): readonly FieldInstanceSpec[] {
  const sites = new Map(state.sites.map((s) => [s.id, s]));
  let changed = false;
  const next = specs.map((spec) => {
    const site = sites.get(spec.id);
    const params = spec.params as { readonly activation?: JsonValue } | null;
    if (!site || !params || typeof params !== 'object' || !('activation' in params)) return spec;
    const activation = funnelLifecycleActivation(site);
    if (JSON.stringify(activation) === JSON.stringify(params.activation)) return spec;
    changed = true;
    return { ...spec, params: { ...(spec.params as object), activation } as JsonValue };
  });
  return changed ? next : specs;
}

export function funnelDynamics(initial: FunnelLifecycleState): EncounterDynamics {
  return {
    initial: initial as unknown as JsonValue,
    next: (state) => nextFunnelLifecycleEvent(lifecycleOf(state)),
    advance(state, to, ship) {
      const before = lifecycleOf(state);
      // One actual sample per due birth epoch: the truth step stops at each, so at most this one.
      const birth = before.sites
        .slice(before.dueCursor)
        .some((site) => site.nominalBirth !== null && site.nominalBirth <= to);
      const advanced = advanceFunnelLifecycle(
        before,
        to,
        birth
          ? [
              {
                t: ship.t,
                position: ship.position,
                velocity: ship.velocity,
                hullRadius: ship.hullRadius,
              },
            ]
          : [],
      );
      return {
        state: advanced.state as unknown as JsonValue,
        events: advanced.events.map((e) => ({
          kind: e.kind,
          t: e.t,
          id: e.id,
          ...(e.kind === 'precursor'
            ? {
                seen: true,
                until: advanced.state.sites.find((s) => s.id === e.id)?.nominalBirth ?? e.t,
              }
            : {}),
        })),
      };
    },
    fields: (state, specs) => specsFor(lifecycleOf(state), specs),
    registry: (specs) => createWellRegistry(specs, WELL_GAP),
  };
}

export function funnelHazards(specs: readonly FieldInstanceSpec[]): EncounterHazards {
  const hazards = createFunnelHullHazards(specs);
  return {
    sweep: (start, hull, endPosition, t0, t1) =>
      hazards
        .linearFixedHullSweep(start, hull, endPosition, t0, t1)
        .map((c) => ({ t: c.t, field: c.field, cause: c.cause })),
  };
}

/** 3B's setup with its lifecycle and throats wired into the truth tick. */
export function withFunnels(setup: InverseWellsSetup): EncounterSetup {
  const lifecycle = setup.funnelLifecycle;
  if (!lifecycle) return setup;
  return {
    ...setup,
    dynamics: funnelDynamics(lifecycle),
    hazards: funnelHazards,
    window: createFunnelWindow(setup),
  };
}
