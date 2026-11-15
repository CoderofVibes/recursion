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
import {
  accumulateFunnelWork,
  createWellRegistry,
  createWellSpatialIndex,
  evaluateFunnel,
  evaluateWell,
  FUNNEL_PROFILE,
  funnelSupportBounds,
  readWellParameters,
  WELL_KIND,
  type WellSpatialIndex,
} from '../sim/fields/wells.ts';
import type {
  EncounterDynamics,
  EncounterHazards,
  EncounterLedger,
  EncounterSetup,
  LedgerStage,
} from './encounter.ts';

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

/**
 * The work the wells do on the ship over the attempt (3B's request 4), J: the commanded thrust's
 * own power (`nominalJ`), what a well's response adds to or takes from it (`fieldJ`), and the
 * funnels' pull (`pullJ`, mass × velocity · pull), each by 3B's trapezoid over the tick from the
 * ship's actual state at its start and end (`accumulateFunnelWork`). With them the propellant
 * the ship expelled (`removedKg`) and the kinetic energy it carried away at the tick's mean
 * speed (`removedKineticJ`): 3B's note that a variable-mass energy balance needs both. Truth
 * diagnostics, never recorded or shown; plain JSON in the truth state, so they survive a save.
 */
export interface PullWork {
  readonly nominalJ: number;
  readonly fieldJ: number;
  readonly pullJ: number;
  readonly removedKg: number;
  readonly removedKineticJ: number;
}

export const NO_WORK: PullWork = {
  nominalJ: 0,
  fieldJ: 0,
  pullJ: 0,
  removedKg: 0,
  removedKineticJ: 0,
};

interface WellLookup {
  readonly index: WellSpatialIndex;
  readonly byId: ReadonlyMap<string, FieldInstanceSpec>;
}

const lookups = new WeakMap<readonly FieldInstanceSpec[], WellLookup>();

/** A broad-phase index over the specs as they are now, built once per set of specs. */
function lookupFor(specs: readonly FieldInstanceSpec[]): WellLookup {
  let found = lookups.get(specs);
  if (found) return found;
  const wells = specs.filter((s) => s.kind === WELL_KIND);
  const byId = new Map(wells.map((s) => [s.id, s]));
  const index = createWellSpatialIndex(
    wells.map((spec) => {
      if (isFunnel(spec)) return { id: spec.id, bounds: funnelSupportBounds(spec) };
      const p = readWellParameters(spec);
      const r = p.outerRadius;
      return {
        id: spec.id,
        bounds: {
          min: { x: p.center.x - r, y: p.center.y - r, z: p.center.z - r },
          max: { x: p.center.x + r, y: p.center.y + r, z: p.center.z + r },
        },
      };
    }),
  );
  found = { index, byId };
  lookups.set(specs, found);
  return found;
}

function isFunnel(spec: FieldInstanceSpec): boolean {
  const params = spec.params as { readonly profile?: JsonValue } | null;
  return !!params && typeof params === 'object' && params.profile === FUNNEL_PROFILE;
}

/** The powers at one end of the tick: the first well whose support holds the ship, as the registry dispatches. */
function powersAt(
  specs: readonly FieldInstanceSpec[],
  stage: LedgerStage,
): { nominalPower: number; fieldPower: number; pullPower: number } {
  const { index, byId } = lookupFor(specs);
  for (const id of index.candidatesAt(stage.position)) {
    const spec = byId.get(id)!;
    if (isFunnel(spec)) {
      const e = evaluateFunnel(
        spec,
        stage.force,
        stage.position,
        stage.velocity,
        stage.mass,
        stage.t,
      );
      if (e.weight > 0) return e;
    } else {
      const p = readWellParameters(spec);
      const d = Math.hypot(
        stage.position.x - p.center.x,
        stage.position.y - p.center.y,
        stage.position.z - p.center.z,
      );
      if (d <= p.outerRadius)
        return { ...evaluateWell(spec, stage.force, stage.position, stage.velocity), pullPower: 0 };
    }
  }
  const v = stage.velocity;
  const f = stage.force;
  return { nominalPower: v.x * f.x + v.y * f.y + v.z * f.z, fieldPower: 0, pullPower: 0 };
}

export function funnelLedger(): EncounterLedger {
  return {
    initial: NO_WORK as unknown as JsonValue,
    account(state, specs, start, end, dt) {
      const work = state as unknown as PullWork;
      const next = accumulateFunnelWork(work, powersAt(specs, start), powersAt(specs, end), dt);
      const removed = Math.max(0, start.mass - end.mass);
      const speed2 =
        ((start.velocity.x + end.velocity.x) ** 2 +
          (start.velocity.y + end.velocity.y) ** 2 +
          (start.velocity.z + end.velocity.z) ** 2) /
        4;
      return {
        ...next,
        removedKg: work.removedKg + removed,
        removedKineticJ: work.removedKineticJ + 0.5 * removed * speed2,
      } as unknown as JsonValue;
    },
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
    ledger: funnelLedger(),
    window: createFunnelWindow(setup),
  };
}
