/**
 * Truth-side S22 prototype lifecycle (study 48309d4); owner confirmed the 900 s precursor.
 * The game owner must split committed integration at each due birth and persist
 * this value. No speculative force query may consume a birth or change a phase.
 */
import type { Vec3 } from '../../lib/vec3.ts';
import type { FunnelActivation } from '../../sim/fields/wells.ts';
import { funnelBirthGuardCenter } from '../../sim/fields/wells.ts';

export const FUNNEL_LIFECYCLE_VERSION = 's22-prototype-lifecycle-v1';
export const S22_PRECURSOR_SECONDS = 900;

export type FunnelPhase = 'dormant' | 'precursor' | 'active' | 'cancelled';

export interface FunnelBirthSchedule {
  readonly id: string;
  /** Reserved enclosing-ball centre, not mouth or throat. */
  readonly center: Vec3;
  /** null means established at run creation; positive seconds are epoch-relative. */
  readonly birthOffset: number | null;
}

export interface FunnelLifecycleSite {
  readonly id: string;
  readonly center: Vec3;
  readonly nominalBirth: number | null;
  readonly phase: FunnelPhase;
  /** null for established, pending and cancelled sites; never reset on reload. */
  readonly activeSince: number | null;
}

export interface FunnelLifecycleState {
  readonly version: typeof FUNNEL_LIFECYCLE_VERSION;
  readonly runEpoch: number;
  readonly t: number;
  /** First unresolved entry; established entries precede births sorted by time/ID. */
  readonly dueCursor: number;
  readonly sites: readonly FunnelLifecycleSite[];
}

/** One committed actual state per distinct due epoch, including simultaneous births. */
export interface FunnelBirthSample {
  readonly t: number;
  readonly position: Vec3;
  readonly velocity: Vec3;
  /** Encloses the actual current whole hull, including deployed or jammed parts. */
  readonly hullRadius: number;
}

export type FunnelLifecycleEvent =
  | { readonly kind: 'precursor'; readonly t: number; readonly id: string }
  | {
      readonly kind: 'birth' | 'birth-veto';
      readonly t: number;
      readonly id: string;
      /** Truth diagnostic; never send this guard computation to the optical view. */
      readonly guardMargin: number;
    };

function fail(message: string): never {
  throw new Error(`invalid S22 lifecycle: ${message}`);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return fail('expected an object');
  return value as Record<string, unknown>;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`${name} must be finite`);
  return value;
}

function vector(value: unknown): Vec3 {
  const v = record(value);
  return { x: finite(v.x, 'x'), y: finite(v.y, 'y'), z: finite(v.z, 'z') };
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSites(a: FunnelLifecycleSite, b: FunnelLifecycleSite): number {
  if (a.nominalBirth === null && b.nominalBirth !== null) return -1;
  if (a.nominalBirth !== null && b.nominalBirth === null) return 1;
  return (a.nominalBirth ?? 0) - (b.nominalBirth ?? 0) || compareIds(a.id, b.id);
}

/** Validate a parsed save and detach all returned arrays/objects from its input. */
export function restoreFunnelLifecycle(value: unknown): FunnelLifecycleState {
  const saved = record(value);
  if (saved.version !== FUNNEL_LIFECYCLE_VERSION) return fail('unsupported version');
  const runEpoch = finite(saved.runEpoch, 'runEpoch');
  const t = finite(saved.t, 't');
  if (t < runEpoch) return fail('time precedes run epoch');
  if (!Array.isArray(saved.sites)) return fail('sites must be an array');
  const ids = new Set<string>();
  const sites: FunnelLifecycleSite[] = saved.sites.map((value: unknown) => {
    const site = record(value);
    if (typeof site.id !== 'string' || site.id.trim() === '' || ids.has(site.id))
      return fail('empty or duplicate site ID');
    ids.add(site.id);
    const nominalBirth =
      site.nominalBirth === null ? null : finite(site.nominalBirth, 'nominalBirth');
    const activeSince = site.activeSince === null ? null : finite(site.activeSince, 'activeSince');
    const phase = site.phase;
    if (phase !== 'dormant' && phase !== 'precursor' && phase !== 'active' && phase !== 'cancelled')
      return fail('unknown phase');
    if (nominalBirth === null) {
      if (phase !== 'active' || activeSince !== null) return fail('invalid established site');
    } else {
      if (nominalBirth <= runEpoch) return fail('scheduled birth must follow run epoch');
      if (nominalBirth <= t) {
        if (!(
          (phase === 'active' && activeSince === nominalBirth) ||
          (phase === 'cancelled' && activeSince === null)
        ))
          return fail('past birth requires its saved decision');
      } else {
        const expected = t >= nominalBirth - S22_PRECURSOR_SECONDS ? 'precursor' : 'dormant';
        if (phase !== expected || activeSince !== null) return fail('invalid pending phase');
      }
    }
    return { id: site.id, center: vector(site.center), nominalBirth, phase, activeSince };
  });
  for (let i = 1; i < sites.length; i++) {
    if (compareSites(sites[i - 1]!, sites[i]!) >= 0) return fail('noncanonical site order');
  }
  const dueCursor = finite(saved.dueCursor, 'dueCursor');
  const expectedCursor = sites.filter(
    (site) => site.nominalBirth === null || site.nominalBirth <= t,
  ).length;
  if (!Number.isInteger(dueCursor) || dueCursor !== expectedCursor)
    return fail('due cursor disagrees with saved decisions');
  return { version: FUNNEL_LIFECYCLE_VERSION, runEpoch, t, dueCursor, sites };
}

/** Create at runEpoch only; late arrivals must carry the saved decisions since that epoch. */
export function createFunnelLifecycle(
  schedule: readonly FunnelBirthSchedule[],
  runEpoch: number,
): FunnelLifecycleState {
  finite(runEpoch, 'runEpoch');
  const sites: FunnelLifecycleSite[] = schedule.map((site) => {
    const offset = site.birthOffset === null ? null : finite(site.birthOffset, 'birthOffset');
    if (offset !== null && offset <= 0) return fail('birthOffset must be positive or null');
    const nominalBirth = offset === null ? null : finite(runEpoch + offset, 'nominalBirth');
    return {
      id: site.id,
      center: site.center,
      nominalBirth,
      phase:
        nominalBirth === null
          ? 'active'
          : runEpoch >= nominalBirth - S22_PRECURSOR_SECONDS
            ? 'precursor'
            : 'dormant',
      activeSince: null,
    };
  });
  sites.sort(compareSites);
  return restoreFunnelLifecycle({
    version: FUNNEL_LIFECYCLE_VERSION,
    runEpoch,
    t: runEpoch,
    dueCursor: sites.filter((site) => site.nominalBirth === null).length,
    sites,
  });
}

/** Next phase boundary for the game owner's integration/event scheduler. */
export function nextFunnelLifecycleEvent(state: FunnelLifecycleState): number | null {
  const valid = restoreFunnelLifecycle(state);
  let next: number | null = null;
  for (const site of valid.sites.slice(valid.dueCursor)) {
    const at =
      site.phase === 'dormant' ? site.nominalBirth! - S22_PRECURSOR_SECONDS : site.nominalBirth!;
    if (next === null || at < next) next = at;
  }
  return next;
}

/**
 * Advance once using actual, already committed samples at every crossed birth.
 * No interpolation, extrapolation, RNG, mutable field closure or retry. Supplied
 * samples must have exactly the due epochs in order; malformed batches fail atomically.
 * This fixed S22 bound is valid only for the source-free prototype baseline.
 */
export function advanceFunnelLifecycle(
  state: FunnelLifecycleState,
  to: number,
  samples: readonly FunnelBirthSample[] = [],
): { readonly state: FunnelLifecycleState; readonly events: readonly FunnelLifecycleEvent[] } {
  const valid = restoreFunnelLifecycle(state);
  finite(to, 'advance time');
  if (to < valid.t) return fail('cannot move time backwards');
  const due = valid.sites.slice(valid.dueCursor).filter((site) => site.nominalBirth! <= to);
  const epochs = [...new Set(due.map((site) => site.nominalBirth!))];
  if (samples.length !== epochs.length) return fail('requires one actual sample per due epoch');
  const actual = new Map<number, FunnelBirthSample>();
  samples.forEach((sample, index) => {
    if (finite(sample.t, 'sample time') !== epochs[index])
      return fail('sample epochs are missing, repeated or out of order');
    const hullRadius = finite(sample.hullRadius, 'hullRadius');
    if (hullRadius < 0) return fail('hullRadius must be nonnegative');
    actual.set(sample.t, {
      t: sample.t,
      position: vector(sample.position),
      velocity: vector(sample.velocity),
      hullRadius,
    });
  });
  const events: FunnelLifecycleEvent[] = [];
  const sites = valid.sites.map((site) => {
    if (site.phase === 'active' || site.phase === 'cancelled') return site;
    const nominalBirth = site.nominalBirth!;
    const precursor = nominalBirth - S22_PRECURSOR_SECONDS;
    if (site.phase === 'dormant' && precursor <= to)
      events.push({ kind: 'precursor', id: site.id, t: precursor });
    if (nominalBirth <= to) {
      const sample = actual.get(nominalBirth)!;
      const guardMargin = funnelBirthGuardCenter(
        site.center,
        sample.position,
        sample.velocity,
        sample.hullRadius,
      );
      finite(guardMargin, 'guard margin');
      const allowed = guardMargin > 0;
      events.push({
        kind: allowed ? 'birth' : 'birth-veto',
        id: site.id,
        t: nominalBirth,
        guardMargin,
      });
      return {
        ...site,
        phase: allowed ? ('active' as const) : ('cancelled' as const),
        activeSince: allowed ? nominalBirth : null,
      };
    }
    return { ...site, phase: precursor <= to ? ('precursor' as const) : ('dormant' as const) };
  });
  events.sort(
    (a, b) =>
      a.t - b.t ||
      Number(a.kind !== 'precursor') - Number(b.kind !== 'precursor') ||
      compareIds(a.id, b.id),
  );
  return {
    state: { ...valid, t: to, dueCursor: valid.dueCursor + due.length, sites },
    events,
  };
}

/** Immutable force-query snapshot; cancellation also disables the throat immediately. */
export function funnelLifecycleActivation(site: FunnelLifecycleSite): FunnelActivation {
  if (site.phase === 'active')
    return site.activeSince === null
      ? { phase: 'initial' }
      : { phase: 'active', activeSince: site.activeSince };
  return { phase: site.phase === 'cancelled' ? 'cancelled' : 'pending' };
}
