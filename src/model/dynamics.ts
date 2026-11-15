/**
 * Believed dynamics and measurement residuals in three dimensions (1G spec revision 3: §2, §3,
 * §4.2).
 *
 * Inertial gauge frame (§3.4): the first body of a structure (the primary) sits at the origin,
 * at rest, at the arc epoch. Bodies attract each other and the ship under the P4 law
 * a = (μ / r0²)(r0 / r)ⁿ along the line between centres; the ship is a massless test particle
 * that also feels commanded thrust (main engine along the recorded attitude with two
 * misalignment angles, RCS translation in the body frame), optional local gravity scales
 * (Tier L), calibration profiles (§5.4, §8.2) and empirical accelerations (§6.4).
 *
 * Order everywhere: x, y, z, vx, vy, vz. Attitude is a unit quaternion, body to inertial.
 *
 * Planar reduction (§1, Appendix A.3): a planar case is the same code with the out-of-plane
 * unknowns given as the fixed number 0 instead of a parameter (z and vz of the ship and of every
 * body, the pitch misalignment, the camera components about body x and y, the orbit-normal
 * empirical term) and the out-of-plane rows marked unused (`sigma: null` on a fix's elevation
 * and on the accelerometer's z). Every formula here then reduces to revision 2's.
 *
 * Fixed-step RK4 (step `dt`, the reference uses 60 s). Thrust-segment and empirical-window
 * boundaries are integration nodes; measurement times between nodes are reached by a
 * sub-step from the preceding node, so the trajectory itself does not depend on which
 * times are recorded. Belief side: never imports src/sim or truth (P11).
 */

import * as quat from '../lib/quat.ts';
import type { Quat } from '../lib/quat.ts';

/**
 * A number, the name of a parameter, or a list of refs whose values add (an arrival value plus
 * a per-arc deviation, §3.7). Names may contain "{att}", replaced by the arc id.
 */
export type Ref = number | string | readonly Ref[];

export type Refs3 = readonly [Ref, Ref, Ref];
export type Refs6 = readonly [Ref, Ref, Ref, Ref, Ref, Ref];
export type State6 = readonly [number, number, number, number, number, number];

/** Names of the six state components, in order. */
export const STATE_KEYS = ['x', 'y', 'z', 'vx', 'vy', 'vz'] as const;

export interface BodyDef {
  readonly id: string;
  readonly mu: Ref;
  /** 'gauge' for the primary (origin, at rest at the epoch); otherwise six state refs. */
  readonly state: 'gauge' | Refs6;
  /** Fixed state per arc id, overriding `state` (other bodies frozen in Tier L fits). */
  readonly stateByArc?: Readonly<Record<string, State6>>;
  /** Local scale on this body's pull on the ship (Tier L, §5.2). Default 1. */
  readonly gs?: Ref;
  /** Local slope: scale = gs + gs1·(ln r − gsU0) (present-state fit, §8.1). Default 0. */
  readonly gs1?: Ref;
  readonly gsU0?: number;
}

/**
 * Empirical acceleration (§6.4): piecewise-constant radial, tangential and orbit-normal
 * components relative to body `ref`. bounds[arc] lists window start times then the final end
 * time; window k covers [bounds[k], bounds[k+1]). Parameters "{att}.emp{k}.R", ".T" and ".N".
 * With r and v the ship's position and velocity relative to the body: r̂ = r/|r|,
 * n̂ = (r × v)/|r × v|, t̂ = n̂ × r̂ (in the orbit plane, on the side the ship is moving toward).
 */
export interface EmpDef {
  readonly ref: string;
  readonly bounds: Readonly<Record<string, readonly number[]>>;
  /** False holds the orbit-normal term at zero (planar reduction). Default true. */
  readonly normal?: boolean;
}

/**
 * Calibration profile for one body's pull on the ship (§5.4, §8.2). With u = ln r clipped to
 * [ln rMin, ln rMax] the pull is multiplied by g(u)·exp(−ηe·Le(r) − η·(L(r) − Le(r))); g is
 * piecewise linear on uNodes (absolute ln r) with values gNodes[b] + dNodes[b]; L(r) = ln(r/rMax)
 * above the covered range, ln(r/rMin) below it, 0 inside; Le is the part of that stretch of
 * ln r inside the validated spans of an adopted rule (§7.4), signed like L. r is the scalar
 * distance: the profile has no direction (A11).
 */
export interface ProfileDef {
  readonly body: string;
  readonly uNodes: readonly number[];
  readonly gNodes: readonly number[];
  readonly rMin: number;
  readonly rMax: number;
  readonly dNodes?: readonly Ref[];
  /** Default hedge exponent η (outside validated spans). */
  readonly eta?: Ref;
  /** Earned hedge exponent ηe (inside validated spans). */
  readonly etaE?: Ref;
  /** Validated distance spans [lo, hi] in m (merged, disjoint). */
  readonly validated?: readonly (readonly [number, number])[];
}

export interface EngineDef {
  /** Thrust scale (also absorbs mass error). */
  readonly kE: Ref;
  /** Thrust misalignment about body +z (toward +y), rad: the planar angle. */
  readonly dE: Ref;
  /** Thrust misalignment about body −y (toward +z), rad. */
  readonly dP: Ref;
}

export interface Structure {
  readonly r0: number;
  /** Distance-law exponent n. */
  readonly n: Ref;
  readonly bodies: readonly BodyDef[];
  /** Ship x, y, z, vx, vy, vz at the arc epoch. */
  readonly ship: Refs6;
  /** Bodies attract each other (only meaningful with two or more bodies). */
  readonly dynamicBodies: boolean;
  /** Default engine; segments naming a thruster in `engines` use that entry instead. */
  readonly engine: EngineDef;
  readonly engines?: Readonly<Record<string, EngineDef>>;
  /** RCS translation scale (§3.3). Default 1. */
  readonly kR?: Ref;
  /** Accelerometer scale. */
  readonly kA: Ref;
  /** Camera misalignment: a rotation vector in the body frame (§2.1); z is the planar bias. */
  readonly camBias: Refs3;
  readonly emp?: EmpDef;
  readonly profiles?: readonly ProfileDef[];
  /**
   * The profiles' hedge also acts on the bodies' pulls on each other (2F request 13): one body
   * pulls another from a distance the ship's data may never have sampled, and outside the
   * covered range the law there is as uncertain as anywhere else (§8.2). Only the hedge factor
   * applies, not the calibration: the bodies' believed motion (its mean) stays that of the bare
   * law, as fitted. Off by default (fits and the reference vectors).
   */
  readonly bodyProfiles?: boolean;
}

export const SHIP_REFS: Refs6 = [
  '{att}.ship.x',
  '{att}.ship.y',
  '{att}.ship.z',
  '{att}.ship.vx',
  '{att}.ship.vy',
  '{att}.ship.vz',
];

/** Ship state refs; `planar` holds z and vz at the fixed number 0 (planar reduction). */
export function shipRefs(planar = false): Refs6 {
  return planar
    ? ['{att}.ship.x', '{att}.ship.y', 0, '{att}.ship.vx', '{att}.ship.vy', 0]
    : SHIP_REFS;
}

/** State refs of a moving body; `planar` holds z and vz at the fixed number 0. */
export function bodyRefs(body: string, planar = false): Refs6 {
  const p = `{att}.${body}.`;
  return planar
    ? [`${p}x`, `${p}y`, 0, `${p}vx`, `${p}vy`, 0]
    : [`${p}x`, `${p}y`, `${p}z`, `${p}vx`, `${p}vy`, `${p}vz`];
}

/** Camera misalignment given only as its planar part (about body +z). */
export const camAboutZ = (z: Ref): Refs3 => [0, 0, z];

/** Commanded thrust over [t0, t1) (§3.3). */
export interface ThrustSegment {
  readonly t0: number;
  readonly t1: number;
  /** Commanded main-engine acceleration (force / believed mass), m/s². */
  readonly u: number;
  /** Recorded attitude over the segment, body to inertial. */
  readonly q: Quat;
  /** Commanded RCS translation acceleration, body frame, m/s² (absent: none). */
  readonly rcs?: readonly [number, number, number];
  /**
   * Rotation from the engine's own frame (thrust along +x) to the body frame, for a thruster
   * whose nominal push is not along body +x. Absent: the identity (the main engine).
   */
  readonly mount?: Quat;
  /** Thruster id, selecting Structure.engines. */
  readonly thruster?: string;
  /** Extra scale for a segment whose level is uncertain (a `limited` burn). */
  readonly scale?: Ref;
}

/** One-sigma of a measurement component; null marks a component that is not used (A.3). */
export type Sigma = number | null;

export type EstMeasurement =
  /**
   * Optical fix: z = [azimuth, elevation] or [azimuth, elevation, range]. sigma[0] is the
   * azimuth sigma as the sensor reports it (σ_b / cos el); the estimator uses σ_az·cos(el).
   * `q` is the recorded attitude at the fix (absent: the identity); it matters only to the
   * camera misalignment.
   */
  | {
      readonly kind: 'opnav';
      readonly t: number;
      readonly target: string;
      readonly z: readonly number[];
      readonly sigma: readonly Sigma[];
      readonly q?: Quat;
    }
  /** Range without a bearing: z = [ρ]. */
  | {
      readonly kind: 'range';
      readonly t: number;
      readonly target: string;
      readonly z: readonly number[];
      readonly sigma: readonly Sigma[];
    }
  /** Ship minus target, inertial: z = [x, y, z]. */
  | {
      readonly kind: 'relpos';
      readonly t: number;
      readonly target: string;
      readonly z: readonly number[];
      readonly sigma: readonly Sigma[];
    }
  /** Non-gravitational specific force, body frame: z = [fx, fy, fz]. Used only while thrusting. */
  | {
      readonly kind: 'accel';
      readonly t: number;
      readonly target?: undefined;
      readonly z: readonly number[];
      readonly sigma: readonly Sigma[];
    };

export type Fix = Extract<EstMeasurement, { kind: 'opnav' }>;

/** Is this an optical fix whose range is used? */
export function hasRange(m: EstMeasurement): m is Fix {
  return m.kind === 'opnav' && m.z.length === 3 && m.sigma[2] !== null;
}

/** Measured unit direction of a fix (ship to target), §2.1. */
export function lineOfSight(m: Fix): [number, number, number] {
  const ce = Math.cos(m.z[1]!);
  return [ce * Math.cos(m.z[0]!), ce * Math.sin(m.z[0]!), Math.sin(m.z[1]!)];
}

/**
 * A fitted arc: the structure, parameter vector and index it was fitted with, and the
 * posterior covariance of the parameters that move it (Tier G, an arc fit, or a window fit).
 */
export interface ArcSolution {
  readonly arc: Pick<Arc, 'id' | 'epoch' | 'commands' | 'meas'>;
  readonly structure: Structure;
  readonly x: Float64Array;
  readonly idx: ReadonlyMap<string, number>;
  /** Posterior covariance aligned with x (null: unknown, treated as zero). */
  readonly P: { readonly rows: number; readonly cols: number; readonly data: Float64Array } | null;
  /** Indices of the parameters that affect this arc. */
  readonly rel: readonly number[];
  /** Finite-difference scales aligned with x. */
  readonly scale: Float64Array;
  /**
   * True for a solution from a converged global fit (Tier G). A fit of one arc with the globals
   * held at their priors places a body it never saw only by what the ship's motion asks of it,
   * under a law that may be wrong, so its state is not taken as that body's believed state.
   */
  readonly fromGlobalFit?: boolean;
}

/** One continuous stretch of one attempt (§3.5). */
export interface Arc {
  readonly id: string;
  /** State parameters are defined at this time. */
  readonly epoch: number;
  readonly commands: readonly ThrustSegment[];
  readonly meas: readonly EstMeasurement[];
}

/**
 * Range fixes on the primary, at distinct times, that an arc needs before it can be fitted: no
 * prior holds a ship state (§3.6), and the initial quadratic of §4.5 needs three. Three fixes
 * give nine numbers (two angles and a range each) for the six of the state, so an arc that has
 * them determines z and vz as well. An arc with fewer is left out of the fits (adapt.ts), and no
 * arc-growing stage cuts an arc below them (solve.ts): a state the data do not determine is
 * never solved for.
 */
export const MIN_ARC_FIXES = 3;

/** Distinct times of the range fixes on `body`, ascending. */
export function rangeFixTimes(meas: readonly EstMeasurement[], body: string): number[] {
  const times = new Set<number>();
  for (const m of meas) if (hasRange(m) && m.target === body) times.add(m.t);
  return [...times].sort((a, b) => a - b);
}

export const TWO_PI = 2 * Math.PI;

/** Wrap to [−π, π) (numpy-compatible modulo). */
export function wrap(a: number): number {
  const m = (a + Math.PI) % TWO_PI;
  return (m < 0 ? m + TWO_PI : m) - Math.PI;
}

const EPS_T = 1e-6;

/** Does this segment push at all (main engine or RCS)? */
export function segmentPowered(c: ThrustSegment): boolean {
  return c.u !== 0 || (c.rcs !== undefined && (c.rcs[0] !== 0 || c.rcs[1] !== 0 || c.rcs[2] !== 0));
}

/** Is thrust commanded at t (any segment with t0 ≤ t < t1 that fires the engine or the RCS)? */
export function poweredAt(commands: readonly ThrustSegment[], t: number): boolean {
  for (const c of commands)
    if (c.t0 <= t + EPS_T && t < c.t1 - EPS_T && segmentPowered(c)) return true;
  return false;
}

/** Does the structure model this measurement (accel always; others need a modelled target)? */
export function usable(st: Structure, m: EstMeasurement): boolean {
  if (m.kind === 'accel') return true;
  return st.bodies.some((b) => b.id === m.target);
}

/** Thrust direction in the engine's frame: +x turned by dE about +z and by dP about −y (§3.3). */
function thrustDirection(dE: number, dP: number, out: Float64Array, off: number): void {
  const cp = Math.cos(dP);
  out[off] = cp * Math.cos(dE);
  out[off + 1] = cp * Math.sin(dE);
  out[off + 2] = Math.sin(dP);
}

/** v turned by the rotation vector w (Rodrigues), in place on `v` at `off`. */
function rotateBy(wx: number, wy: number, wz: number, v: Float64Array, off: number): void {
  const a2 = wx * wx + wy * wy + wz * wz;
  if (a2 === 0) return;
  const a = Math.sqrt(a2);
  const s = a < 1e-12 ? 1 : Math.sin(a) / a;
  const c = a < 1e-12 ? 0.5 : (1 - Math.cos(a)) / a2;
  const vx = v[off]!;
  const vy = v[off + 1]!;
  const vz = v[off + 2]!;
  const cx = wy * vz - wz * vy;
  const cy = wz * vx - wx * vz;
  const cz = wx * vy - wy * vx;
  v[off] = vx + s * cx + c * (wy * cz - wz * cy);
  v[off + 1] = vy + s * cy + c * (wz * cx - wx * cz);
  v[off + 2] = vz + s * cz + c * (wx * cy - wy * cx);
}

// ---------------------------------------------------------------------------------------------
// Compilation: refs → slots (constant or parameter index) for one arc
// ---------------------------------------------------------------------------------------------

/** ≥ 0: parameter index; < 0: constant in a side table; array: sum of slots. */
type Slot = number | readonly Slot[];

interface Slots {
  readonly consts: number[];
}

function slotOf(ref: Ref, idx: ReadonlyMap<string, number>, arcId: string, s: Slots): Slot {
  if (typeof ref === 'object') return ref.map((r) => slotOf(r, idx, arcId, s));
  if (typeof ref === 'number') {
    s.consts.push(ref);
    return -s.consts.length; // −1, −2, …
  }
  const name = ref.replaceAll('{att}', arcId);
  const i = idx.get(name);
  if (i === undefined) throw new Error(`dynamics: unknown parameter ${name}`);
  return i;
}

function leaves(slot: Slot, out: number[]): number[] {
  if (typeof slot === 'object') for (const q of slot) leaves(q, out);
  else if (slot >= 0) out.push(slot);
  return out;
}

interface CompiledSegment {
  readonly t0: number;
  readonly t1: number;
  readonly u: number;
  /** Row-major 3×3: engine frame → inertial (attitude · mount). */
  readonly CM: readonly number[];
  /** Row-major 3×3 mount (engine frame → body), or null for the identity. */
  readonly M: readonly number[] | null;
  /** RCS acceleration in the body frame and turned into the inertial frame, or null. */
  readonly rcsB: readonly [number, number, number] | null;
  readonly rcsI: readonly [number, number, number] | null;
  readonly kE: Slot;
  readonly dE: Slot;
  readonly dP: Slot;
  readonly scale: Slot | null;
}

interface CompiledProfile {
  readonly body: number;
  readonly un: Float64Array;
  readonly g: Float64Array;
  readonly dn: Slot[] | null;
  readonly lmin: number;
  readonly lmax: number;
  readonly eta: Slot;
  readonly etaE: Slot;
  /** Validated spans in ln r. */
  readonly spans: readonly (readonly [number, number])[];
}

export interface CompiledArc {
  readonly arcId: string;
  readonly epoch: number;
  readonly r0: number;
  readonly nb: number;
  readonly bodyIndex: ReadonlyMap<string, number>;
  readonly consts: Float64Array;
  readonly n: Slot;
  readonly mu: readonly Slot[];
  readonly bodyState: readonly (readonly Slot[] | null)[];
  readonly gs: readonly ({ g0: Slot; g1: Slot; u0: number } | null)[];
  readonly ship: readonly Slot[];
  readonly dyn: boolean;
  /** The profiles' hedge acts on the bodies' mutual pulls too (`Structure.bodyProfiles`). */
  readonly bodyProf: boolean;
  readonly kA: Slot;
  readonly kR: Slot;
  /** Camera misalignment slots (body x, y, z), or null when it is the fixed number zero. */
  readonly cam: readonly [Slot, Slot, Slot] | null;
  readonly segments: readonly CompiledSegment[];
  readonly emp: {
    ref: number;
    aR: Slot[];
    aT: Slot[];
    aN: Slot[] | null;
    inner: Float64Array;
  } | null;
  readonly profiles: readonly CompiledProfile[];
  /** Sorted node times other than the regular grid (segment and empirical boundaries). */
  readonly breaks: Float64Array;
  /** Parameters that move the trajectory. */
  readonly moves: ReadonlySet<number>;
  /** Parameters that enter only the measurement equations (camera, accelerometer scale). */
  readonly measures: ReadonlySet<number>;
  /**
   * For a parameter that only ever appears added to the same other parameters (an arrival value
   * and its per-arc deviation, §3.7): the first of them. Their derivatives are identical.
   */
  readonly sameAs: ReadonlyMap<number, number>;
}

const IDENT3: readonly number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function mul3(a: readonly number[], b: readonly number[]): number[] {
  const o = new Array<number>(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      o[3 * i + j] = a[3 * i]! * b[j]! + a[3 * i + 1]! * b[3 + j]! + a[3 * i + 2]! * b[6 + j]!;
  return o;
}

export function compileArc(
  st: Structure,
  arc: Pick<Arc, 'id' | 'epoch' | 'commands'>,
  idx: ReadonlyMap<string, number>,
): CompiledArc {
  const s: Slots = { consts: [] };
  const moving: Slot[] = [];
  const measuring: Slot[] = [];
  const sl = (r: Ref, list: Slot[] = moving) => {
    const slot = slotOf(r, idx, arc.id, s);
    list.push(slot);
    return slot;
  };
  const bodyIndex = new Map<string, number>();
  st.bodies.forEach((b, i) => bodyIndex.set(b.id, i));
  const plainGs = (b: BodyDef) =>
    (b.gs === undefined || b.gs === 1) && (b.gs1 === undefined || b.gs1 === 0);
  const engineFor = (thr?: string) => (thr !== undefined && st.engines?.[thr]) || st.engine;
  let anyRcs = false;
  const segments: CompiledSegment[] = arc.commands.map((c) => {
    const e = engineFor(c.thruster);
    const C = quat.toMatrix(c.q);
    const M = c.mount ? quat.toMatrix(c.mount) : null;
    const rcs = c.rcs && (c.rcs[0] !== 0 || c.rcs[1] !== 0 || c.rcs[2] !== 0) ? c.rcs : null;
    if (rcs) anyRcs = true;
    const fires = c.u !== 0;
    return {
      t0: c.t0,
      t1: c.t1,
      u: c.u,
      CM: M ? mul3(C, M) : C,
      M,
      rcsB: rcs,
      rcsI: rcs
        ? [
            C[0] * rcs[0] + C[1] * rcs[1] + C[2] * rcs[2],
            C[3] * rcs[0] + C[4] * rcs[1] + C[5] * rcs[2],
            C[6] * rcs[0] + C[7] * rcs[1] + C[8] * rcs[2],
          ]
        : null,
      // A segment that does not fire the engine does not depend on the engine's parameters.
      kE: fires ? sl(e.kE) : slotOf(1, idx, arc.id, s),
      dE: fires ? sl(e.dE) : slotOf(0, idx, arc.id, s),
      dP: fires ? sl(e.dP) : slotOf(0, idx, arc.id, s),
      scale: c.scale === undefined ? null : sl(c.scale),
    };
  });
  let emp: CompiledArc['emp'] = null;
  const breaks: number[] = [];
  for (const c of arc.commands) breaks.push(c.t0, c.t1);
  if (st.emp) {
    const bnd = st.emp.bounds[arc.id];
    if (!bnd) throw new Error(`dynamics: no empirical bounds for arc ${arc.id}`);
    const nseg = bnd.length - 1;
    const aR: Slot[] = [];
    const aT: Slot[] = [];
    const aN: Slot[] | null = st.emp.normal === false ? null : [];
    for (let k = 0; k < nseg; k++) {
      aR.push(sl(`{att}.emp${k}.R`));
      aT.push(sl(`{att}.emp${k}.T`));
      aN?.push(sl(`{att}.emp${k}.N`));
    }
    const ref = bodyIndex.get(st.emp.ref);
    if (ref === undefined)
      throw new Error(`dynamics: empirical frame body ${st.emp.ref} not modelled`);
    const inner = Float64Array.from(bnd.slice(1, -1));
    for (const b of inner) breaks.push(b);
    emp = { ref, aR, aT, aN, inner };
  }
  const profiles: CompiledProfile[] = (st.profiles ?? []).map((p) => {
    const body = bodyIndex.get(p.body);
    if (body === undefined) throw new Error(`dynamics: profile body ${p.body} not modelled`);
    if (p.uNodes.length < 2) throw new Error('dynamics: a profile needs at least two nodes');
    return {
      body,
      un: Float64Array.from(p.uNodes),
      g: Float64Array.from(p.gNodes),
      dn: p.dNodes ? p.dNodes.map((r) => sl(r)) : null,
      lmin: Math.log(p.rMin),
      lmax: Math.log(p.rMax),
      eta: sl(p.eta ?? 0),
      etaE: sl(p.etaE ?? 0),
      spans: (p.validated ?? []).map(([lo, hi]) => [Math.log(lo), Math.log(hi)] as const),
    };
  });
  const camZero = st.camBias.every((c) => c === 0);
  const compiled = {
    arcId: arc.id,
    epoch: arc.epoch,
    r0: st.r0,
    nb: st.bodies.length,
    bodyIndex,
    n: sl(st.n),
    mu: st.bodies.map((b) => sl(b.mu)),
    bodyState: st.bodies.map((b) => {
      const fixed = b.stateByArc?.[arc.id];
      if (fixed) return fixed.map((r) => sl(r));
      return b.state === 'gauge' ? null : b.state.map((r) => sl(r));
    }),
    gs: st.bodies.map((b) =>
      plainGs(b) ? null : { g0: sl(b.gs ?? 1), g1: sl(b.gs1 ?? 0), u0: b.gsU0 ?? 0 },
    ),
    ship: st.ship.map((r) => sl(r)),
    dyn: st.dynamicBodies && st.bodies.length > 1,
    bodyProf: st.bodyProfiles === true,
    kA: sl(st.kA, measuring),
    kR: anyRcs ? sl(st.kR ?? 1) : slotOf(1, idx, arc.id, s),
    cam: camZero
      ? null
      : ([
          sl(st.camBias[0], measuring),
          sl(st.camBias[1], measuring),
          sl(st.camBias[2], measuring),
        ] as const),
    segments,
    emp,
    profiles,
    breaks: Float64Array.from([...new Set(breaks)].sort((a, b) => a - b)),
  };
  // Which parameters move the trajectory, which enter only the measurements, and which always
  // appear added to the same others.
  const moves = new Set<number>();
  for (const q of moving) for (const i of leaves(q, [])) moves.add(i);
  const measures = new Set<number>();
  for (const q of measuring) for (const i of leaves(q, [])) if (!moves.has(i)) measures.add(i);
  const containing = new Map<number, Set<string>>();
  for (const q of [...moving, ...measuring]) {
    const members = [...new Set(leaves(q, []))].sort((a, b) => a - b);
    const key = members.join('+');
    for (const i of members) {
      const set = containing.get(i);
      if (set) set.add(key);
      else containing.set(i, new Set([key]));
    }
  }
  const firstWith = new Map<string, number>();
  const sameAs = new Map<number, number>();
  for (const i of [...containing.keys()].sort((a, b) => a - b)) {
    const sig = [...containing.get(i)!].sort().join('|');
    const first = firstWith.get(sig);
    if (first === undefined) firstWith.set(sig, i);
    else sameAs.set(i, first);
  }
  return { ...compiled, consts: Float64Array.from(s.consts), moves, measures, sameAs };
}

function val(ca: CompiledArc, slot: Slot, x: ArrayLike<number>): number {
  if (typeof slot === 'object') {
    let v = 0;
    for (const q of slot) v += val(ca, q, x);
    return v;
  }
  return slot >= 0 ? x[slot]! : ca.consts[-slot - 1]!;
}

// ---------------------------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------------------------

export interface Trajectory {
  /** Requested times (ascending). */
  readonly times: readonly number[];
  /** Per time, particle positions [x0, y0, z0, x1, y1, z1, …]; bodies first, ship last. */
  readonly pos: readonly Float64Array[];
  readonly vel: readonly Float64Array[];
}

interface Resolved {
  readonly r0: number;
  readonly n: number;
  readonly mu: Float64Array;
  readonly gs: ({ g0: number; g1: number; u0: number } | null)[];
  readonly prof: ({
    un: Float64Array;
    g: Float64Array;
    lmin: number;
    lmax: number;
    eta: number;
    etaE: number;
    spans: readonly (readonly [number, number])[];
  } | null)[];
  /** Per segment, its thrust acceleration in the inertial frame (engine and RCS), 3 numbers. */
  readonly segAcc: Float64Array;
  readonly empR: Float64Array | null;
  readonly empT: Float64Array | null;
  readonly empN: Float64Array | null;
}

function resolve(ca: CompiledArc, x: ArrayLike<number>): Resolved {
  const v = (s: Slot) => val(ca, s, x);
  const prof: Resolved['prof'] = new Array(ca.nb).fill(null);
  for (const p of ca.profiles) {
    const g = new Float64Array(p.g);
    if (p.dn) for (let b = 0; b < g.length; b++) g[b]! += v(p.dn[b]!);
    prof[p.body] = {
      un: p.un,
      g,
      lmin: p.lmin,
      lmax: p.lmax,
      eta: v(p.eta),
      etaE: v(p.etaE),
      spans: p.spans,
    };
  }
  const segAcc = new Float64Array(3 * ca.segments.length);
  const tb = new Float64Array(3);
  const kR = v(ca.kR);
  ca.segments.forEach((seg, s) => {
    if (seg.u !== 0) {
      thrustDirection(v(seg.dE), v(seg.dP), tb, 0);
      const mag = (seg.scale === null ? 1 : v(seg.scale)) * v(seg.kE) * seg.u;
      const C = seg.CM;
      segAcc[3 * s] = mag * (C[0]! * tb[0]! + C[1]! * tb[1]! + C[2]! * tb[2]!);
      segAcc[3 * s + 1] = mag * (C[3]! * tb[0]! + C[4]! * tb[1]! + C[5]! * tb[2]!);
      segAcc[3 * s + 2] = mag * (C[6]! * tb[0]! + C[7]! * tb[1]! + C[8]! * tb[2]!);
    }
    if (seg.rcsI) {
      const k = (seg.scale === null ? 1 : v(seg.scale)) * kR;
      segAcc[3 * s]! += k * seg.rcsI[0];
      segAcc[3 * s + 1]! += k * seg.rcsI[1];
      segAcc[3 * s + 2]! += k * seg.rcsI[2];
    }
  });
  return {
    r0: ca.r0,
    n: v(ca.n),
    mu: Float64Array.from(ca.mu, v),
    gs: ca.gs.map((g) => (g ? { g0: v(g.g0), g1: v(g.g1), u0: g.u0 } : null)),
    prof,
    segAcc,
    empR: ca.emp ? Float64Array.from(ca.emp.aR, v) : null,
    empT: ca.emp ? Float64Array.from(ca.emp.aT, v) : null,
    empN: ca.emp?.aN ? Float64Array.from(ca.emp.aN, v) : null,
  };
}

function activeAt(seg: { t0: number; t1: number }, t: number): boolean {
  return seg.t0 <= t + EPS_T && t < seg.t1 - EPS_T;
}

/**
 * Propagate bodies and ship from the arc epoch with parameters x and return positions and
 * velocities at the requested times (ascending, ≥ epoch).
 */
export function simulate(
  ca: CompiledArc,
  x: ArrayLike<number>,
  times: readonly number[],
  dt: number,
): Trajectory {
  const R = resolve(ca, x);
  const nb = ca.nb;
  const N = nb + 1;
  const ship = 3 * nb;
  const dim = 3 * N;
  const P = new Float64Array(dim);
  const V = new Float64Array(dim);
  for (let i = 0; i < nb; i++) {
    const st = ca.bodyState[i];
    if (st)
      for (let c = 0; c < 3; c++) {
        P[3 * i + c] = val(ca, st[c]!, x);
        V[3 * i + c] = val(ca, st[3 + c]!, x);
      }
  }
  for (let c = 0; c < 3; c++) {
    P[ship + c] = val(ca, ca.ship[c]!, x);
    V[ship + c] = val(ca, ca.ship[3 + c]!, x);
  }

  const out: Trajectory = { times, pos: [], vel: [] };
  if (times.length === 0) return out;
  const tEnd = times[times.length - 1]!;
  if (times[0]! < ca.epoch - EPS_T) throw new Error('simulate: requested time before the epoch');

  // Integration nodes: regular grid from the epoch, plus breaks inside (epoch, tEnd].
  const nodes: number[] = [];
  for (let k = 0; ; k++) {
    const t = ca.epoch + k * dt;
    if (t > tEnd + EPS_T) break;
    nodes.push(t);
  }
  if (ca.breaks.length > 0) {
    for (const b of ca.breaks) if (b > ca.epoch + EPS_T && b <= tEnd + EPS_T) nodes.push(b);
    nodes.sort((a, b) => a - b);
    let w = 1;
    for (let r = 1; r < nodes.length; r++)
      if (nodes[r]! - nodes[w - 1]! > EPS_T) nodes[w++] = nodes[r]!;
    nodes.length = w;
  }

  const r0sq = R.r0 * R.r0;
  const n = R.n;
  const newton = n === 2;
  const mu = R.mu;
  const r0 = R.r0;
  /** Bodies whose pull on the ship carries a local scale or a profile (Tier L, forecasts). */
  const scaled = Uint8Array.from({ length: nb }, (_, j) => (R.gs[j] || R.prof[j] ? 1 : 0));
  /** Thrust in force (engine and RCS, inertial) over the current interval. */
  const thr = new Float64Array(3);
  let empSeg = 0;
  const emp = ca.emp;
  const empRef = emp ? 3 * emp.ref : 0;
  const pull = (j: number, rr: number, r: number) =>
    newton ? mu[j]! / (rr * r) : ((mu[j]! / r0sq) * Math.pow(r0 / r, n)) / r;
  /** The hedge factor body j's profile puts on its pull at ln r = lr: 1 inside its covered range. */
  const hedgeOf = (j: number, lr: number): number => {
    const pf = R.prof[j];
    if (!pf) return 1;
    const L = lr > pf.lmax ? lr - pf.lmax : lr < pf.lmin ? lr - pf.lmin : 0;
    if (L === 0) return 1;
    // Part of the stretch from the covered edge to r inside validated spans (§8.2).
    let Le = 0;
    for (const [vlo, vhi] of pf.spans) {
      if (lr < pf.lmin) Le -= Math.max(Math.min(vhi, pf.lmin) - Math.max(vlo, lr), 0);
      else Le += Math.max(Math.min(vhi, lr) - Math.max(vlo, pf.lmax), 0);
    }
    return Math.exp(-pf.etaE * Le - pf.eta * (L - Le));
  };
  /** The multiplier body j's calibration profile and hedge put on its pull at ln r = lr (§8.2). */
  const profileOf = (j: number, lr: number): number => {
    const pf = R.prof[j]!;
    const nn = pf.un.length;
    const uc = Math.min(Math.max(lr, pf.lmin), pf.lmax);
    const xq = Math.min(Math.max((uc - pf.un[0]!) / (pf.un[1]! - pf.un[0]!), 0), nn - 1);
    const i0 = Math.min(Math.floor(xq), nn - 2);
    const wq = xq - i0;
    return ((1 - wq) * pf.g[i0]! + wq * pf.g[i0 + 1]!) * hedgeOf(j, lr);
  };
  /** The multiplier a local scale and a calibration profile put on body j's pull at r² = rr. */
  const scaleOf = (j: number, rr: number): number => {
    let k = 1;
    const gs = R.gs[j];
    const lr = 0.5 * Math.log(rr);
    if (gs) k *= gs.g0 + gs.g1 * (lr - gs.u0);
    if (R.prof[j]) k *= profileOf(j, lr);
    return k;
  };
  const bodyProf = ca.bodyProf;
  /** Empirical acceleration on the ship (§6.4), added to `a` at the ship's slots. */
  const empirical = (p: Float64Array, v: Float64Array, a: Float64Array) => {
    const dx = p[ship]! - p[empRef]!;
    const dy = p[ship + 1]! - p[empRef + 1]!;
    const dz = p[ship + 2]! - p[empRef + 2]!;
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const rx = dx / r;
    const ry = dy / r;
    const rz = dz / r;
    const aR = R.empR![empSeg]!;
    a[ship]! += aR * rx;
    a[ship + 1]! += aR * ry;
    a[ship + 2]! += aR * rz;
    const wx = v[ship]! - v[empRef]!;
    const wy = v[ship + 1]! - v[empRef + 1]!;
    const wz = v[ship + 2]! - v[empRef + 2]!;
    // Orbit normal r × v; the frame is undefined for purely radial motion (T, N left out).
    let hx = dy * wz - dz * wy;
    let hy = dz * wx - dx * wz;
    let hz = dx * wy - dy * wx;
    const hn = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (!(hn > 0)) return;
    hx /= hn;
    hy /= hn;
    hz /= hn;
    const aT = R.empT![empSeg]!;
    a[ship]! += aT * (hy * rz - hz * ry);
    a[ship + 1]! += aT * (hz * rx - hx * rz);
    a[ship + 2]! += aT * (hx * ry - hy * rx);
    if (R.empN) {
      const aN = R.empN[empSeg]!;
      a[ship]! += aN * hx;
      a[ship + 1]! += aN * hy;
      a[ship + 2]! += aN * hz;
    }
  };

  const accel = (p: Float64Array, v: Float64Array, a: Float64Array) => {
    a.fill(0);
    if (ca.dyn) {
      // Each pair once: the pull of j on i and of i on j share the geometry.
      for (let i = 0; i < nb; i++) {
        const xi = p[3 * i]!;
        const yi = p[3 * i + 1]!;
        const zi = p[3 * i + 2]!;
        for (let j = i + 1; j < nb; j++) {
          const dx = p[3 * j]! - xi;
          const dy = p[3 * j + 1]! - yi;
          const dz = p[3 * j + 2]! - zi;
          const rr = dx * dx + dy * dy + dz * dz;
          const r = Math.sqrt(rr);
          let kj = pull(j, rr, r);
          let ki = pull(i, rr, r);
          if (bodyProf) {
            const lr = 0.5 * Math.log(rr);
            kj *= hedgeOf(j, lr);
            ki *= hedgeOf(i, lr);
          }
          a[3 * i]! += dx * kj;
          a[3 * i + 1]! += dy * kj;
          a[3 * i + 2]! += dz * kj;
          a[3 * j]! -= dx * ki;
          a[3 * j + 1]! -= dy * ki;
          a[3 * j + 2]! -= dz * ki;
        }
      }
    }
    const sx = p[ship]!;
    const sy = p[ship + 1]!;
    const sz = p[ship + 2]!;
    let ax = thr[0]!;
    let ay = thr[1]!;
    let az = thr[2]!;
    for (let j = 0; j < nb; j++) {
      const dx = p[3 * j]! - sx;
      const dy = p[3 * j + 1]! - sy;
      const dz = p[3 * j + 2]! - sz;
      const rr = dx * dx + dy * dy + dz * dz;
      const r = Math.sqrt(rr);
      let k = pull(j, rr, r);
      if (scaled[j]) k *= scaleOf(j, rr);
      ax += dx * k;
      ay += dy * k;
      az += dz * k;
    }
    a[ship] = ax;
    a[ship + 1] = ay;
    a[ship + 2] = az;
    if (emp) empirical(p, v, a);
  };
  const a1 = new Float64Array(dim);
  const a2 = new Float64Array(dim);
  const a3 = new Float64Array(dim);
  const a4 = new Float64Array(dim);
  const P2 = new Float64Array(dim);
  const V2 = new Float64Array(dim);
  const P3 = new Float64Array(dim);
  const V3 = new Float64Array(dim);
  const P4 = new Float64Array(dim);
  const V4 = new Float64Array(dim);

  /** One RK4 step of size h from (p, v) into (po, vo). */
  const rk4 = (p: Float64Array, v: Float64Array, h: number, po: Float64Array, vo: Float64Array) => {
    accel(p, v, a1);
    for (let i = 0; i < dim; i++) {
      P2[i] = p[i]! + 0.5 * h * v[i]!;
      V2[i] = v[i]! + 0.5 * h * a1[i]!;
    }
    accel(P2, V2, a2);
    for (let i = 0; i < dim; i++) {
      P3[i] = p[i]! + 0.5 * h * V2[i]!;
      V3[i] = v[i]! + 0.5 * h * a2[i]!;
    }
    accel(P3, V3, a3);
    for (let i = 0; i < dim; i++) {
      P4[i] = p[i]! + h * V3[i]!;
      V4[i] = v[i]! + h * a3[i]!;
    }
    accel(P4, V4, a4);
    for (let i = 0; i < dim; i++) {
      po[i] = p[i]! + (h / 6) * (v[i]! + 2 * V2[i]! + 2 * V3[i]! + V4[i]!);
      vo[i] = v[i]! + (h / 6) * (a1[i]! + 2 * a2[i]! + 2 * a3[i]! + a4[i]!);
    }
  };

  const setInterval = (t: number) => {
    thr.fill(0);
    for (let s = 0; s < ca.segments.length; s++) {
      if (!activeAt(ca.segments[s]!, t)) continue;
      thr[0]! += R.segAcc[3 * s]!;
      thr[1]! += R.segAcc[3 * s + 1]!;
      thr[2]! += R.segAcc[3 * s + 2]!;
    }
    if (emp) {
      let s = 0;
      while (s < emp.inner.length && emp.inner[s]! <= t + EPS_T) s++;
      empSeg = s;
    }
  };

  const Ps = new Float64Array(dim);
  const Vs = new Float64Array(dim);
  const pos: Float64Array[] = [];
  const vel: Float64Array[] = [];
  let ri = 0;
  for (let i = 0; i < nodes.length; i++) {
    const ti = nodes[i]!;
    const tn = i + 1 < nodes.length ? nodes[i + 1]! : Infinity;
    setInterval(ti);
    while (ri < times.length && times[ri]! < tn - EPS_T) {
      const tr = times[ri]!;
      if (Math.abs(tr - ti) <= EPS_T) {
        pos.push(new Float64Array(P));
        vel.push(new Float64Array(V));
      } else {
        rk4(P, V, tr - ti, Ps, Vs);
        pos.push(new Float64Array(Ps));
        vel.push(new Float64Array(Vs));
      }
      ri++;
    }
    if (i + 1 < nodes.length) rk4(P, V, tn - ti, P, V);
  }
  return { times, pos, vel };
}

// ---------------------------------------------------------------------------------------------
// Measurement residuals (§2, §4.1)
// ---------------------------------------------------------------------------------------------

/** Distinct sorted times of the measurements and, per measurement, its index into them. */
export function timeIndex(meas: readonly EstMeasurement[]): { times: number[]; at: Int32Array } {
  const times = [...new Set(meas.map((m) => m.t))].sort((a, b) => a - b);
  const pos = new Map<number, number>();
  times.forEach((t, i) => pos.set(t, i));
  return { times, at: Int32Array.from(meas, (m) => pos.get(m.t)!) };
}

/**
 * The scalar rows of an arc's measurements, in measurement order: for a fix, east (azimuth),
 * north (elevation) and range; for an accelerometer sample, f_x, f_y, f_z. A component whose
 * sigma is null gives no row.
 */
export interface MeasPlan {
  readonly meas: readonly EstMeasurement[];
  readonly ti: { times: number[]; at: Int32Array };
  /** Number of scalar rows. */
  readonly m: number;
  /** Per row: measurement index and component. */
  readonly meta: readonly (readonly [number, number])[];
  /** Per measurement: first row, or −1 for an unused component, for components 0, 1, 2. */
  readonly row: Int32Array;
  /** Per measurement: 1 / sigma of each component as used (east: 1 / (σ_az cos el)). */
  readonly w: Float64Array;
  /** Per fix: measured direction, east and north (9 numbers); zeros for other kinds. */
  readonly basis: Float64Array;
  /** Per fix: attitude matrix at the fix (row-major), or null for the identity. */
  readonly Cfix: readonly (readonly number[] | null)[];
  readonly needsTrajectory: boolean;
}

export function planMeasurements(meas: readonly EstMeasurement[]): MeasPlan {
  const nm = meas.length;
  const row = new Int32Array(3 * nm).fill(-1);
  const w = new Float64Array(3 * nm);
  const basis = new Float64Array(9 * nm);
  const Cfix: (readonly number[] | null)[] = new Array(nm).fill(null);
  const meta: [number, number][] = [];
  let needsTrajectory = false;
  meas.forEach((m, i) => {
    if (m.kind !== 'accel') needsTrajectory = true;
    let cosEl = 1;
    if (m.kind === 'opnav') {
      const az = m.z[0]!;
      const el = m.z[1]!;
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      const ce = Math.cos(el);
      const se = Math.sin(el);
      cosEl = ce;
      basis.set([ce * ca, ce * sa, se, -sa, ca, 0, -se * ca, -se * sa, ce], 9 * i);
      if (m.q) Cfix[i] = quat.toMatrix(m.q);
    }
    for (let c = 0; c < m.z.length; c++) {
      const s = m.sigma[c];
      if (s === null || s === undefined) continue;
      row[3 * i + c] = meta.length;
      // The east row is whitened by σ_az·cos(el): the arc the azimuth error subtends (§2.1).
      w[3 * i + c] = 1 / (m.kind === 'opnav' && c === 0 ? s * cosEl : s);
      meta.push([i, c]);
    }
  });
  return { meas, ti: timeIndex(meas), m: meta.length, meta, row, w, basis, Cfix, needsTrajectory };
}

/**
 * Whitened residuals, measured minus predicted, in the plan's row order.
 *
 * Bearing (§2.1): the predicted direction is mapped into the tangent plane at the measured
 * direction. With s = (east · p, north · p), c = measured · p and θ = atan2(|s|, c), the
 * residual is −(θ / |s|) s. For planar data this is exactly wrap(az measured − az predicted).
 *
 * `traj` reuses a trajectory already propagated with parameters that move it as in x (for
 * parameters that enter only the measurements).
 */
export function residuals(
  ca: CompiledArc,
  x: ArrayLike<number>,
  plan: MeasPlan,
  dt: number,
  out?: Float64Array,
  traj?: Trajectory | null,
): Float64Array {
  const meas = plan.meas;
  const tr = plan.needsTrajectory ? (traj ?? simulate(ca, x, plan.ti.times, dt)) : null;
  const ship = 3 * ca.nb;
  const res = out ?? new Float64Array(plan.m);
  const row = plan.row;
  const w = plan.w;
  const B = plan.basis;
  let cam: [number, number, number] | null = null;
  if (ca.cam) cam = [val(ca, ca.cam[0], x), val(ca, ca.cam[1], x), val(ca, ca.cam[2], x)];
  let force: Float64Array | null = null; // per segment: body-frame specific force, 3 numbers
  const p3 = new Float64Array(3);
  for (let i = 0; i < meas.length; i++) {
    const m = meas[i]!;
    const r0 = row[3 * i]!;
    const r1 = row[3 * i + 1]!;
    const r2 = row[3 * i + 2]!;
    if (m.kind === 'accel') {
      if (!force) {
        force = new Float64Array(3 * ca.segments.length);
        const kA = val(ca, ca.kA, x);
        const kR = val(ca, ca.kR, x);
        const tb = new Float64Array(3);
        ca.segments.forEach((seg, s) => {
          const lvl = seg.scale === null ? 1 : val(ca, seg.scale, x);
          if (seg.u !== 0) {
            thrustDirection(val(ca, seg.dE, x), val(ca, seg.dP, x), tb, 0);
            const f = kA * lvl * val(ca, seg.kE, x) * seg.u;
            const M = seg.M ?? IDENT3;
            force![3 * s] = f * (M[0]! * tb[0]! + M[1]! * tb[1]! + M[2]! * tb[2]!);
            force![3 * s + 1] = f * (M[3]! * tb[0]! + M[4]! * tb[1]! + M[5]! * tb[2]!);
            force![3 * s + 2] = f * (M[6]! * tb[0]! + M[7]! * tb[1]! + M[8]! * tb[2]!);
          }
          if (seg.rcsB) {
            const f = kA * lvl * kR;
            force![3 * s]! += f * seg.rcsB[0];
            force![3 * s + 1]! += f * seg.rcsB[1];
            force![3 * s + 2]! += f * seg.rcsB[2];
          }
        });
      }
      let fx = 0;
      let fy = 0;
      let fz = 0;
      for (let s = 0; s < ca.segments.length; s++) {
        if (!activeAt(ca.segments[s]!, m.t)) continue;
        fx += force[3 * s]!;
        fy += force[3 * s + 1]!;
        fz += force[3 * s + 2]!;
      }
      if (r0 >= 0) res[r0] = (m.z[0]! - fx) * w[3 * i]!;
      if (r1 >= 0) res[r1] = (m.z[1]! - fy) * w[3 * i + 1]!;
      if (r2 >= 0) res[r2] = (m.z[2]! - fz) * w[3 * i + 2]!;
      continue;
    }
    const p = tr!.pos[plan.ti.at[i]!]!;
    const j = 3 * ca.bodyIndex.get(m.target)!;
    const dx = p[j]! - p[ship]!;
    const dy = p[j + 1]! - p[ship + 1]!;
    const dz = p[j + 2]! - p[ship + 2]!;
    const rho = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (m.kind === 'opnav') {
      if (r0 >= 0 || r1 >= 0) {
        p3[0] = dx / rho;
        p3[1] = dy / rho;
        p3[2] = dz / rho;
        if (cam) {
          // The reported direction is the true one turned by the camera misalignment, a
          // rotation vector fixed in the body frame and carried by the attitude at the fix.
          const C = plan.Cfix[i];
          if (C)
            rotateBy(
              C[0]! * cam[0] + C[1]! * cam[1] + C[2]! * cam[2],
              C[3]! * cam[0] + C[4]! * cam[1] + C[5]! * cam[2],
              C[6]! * cam[0] + C[7]! * cam[1] + C[8]! * cam[2],
              p3,
              0,
            );
          else rotateBy(cam[0], cam[1], cam[2], p3, 0);
        }
        const b = 9 * i;
        const c = B[b]! * p3[0]! + B[b + 1]! * p3[1]! + B[b + 2]! * p3[2]!;
        const sE = B[b + 3]! * p3[0]! + B[b + 4]! * p3[1]! + B[b + 5]! * p3[2]!;
        const sN = B[b + 6]! * p3[0]! + B[b + 7]! * p3[1]! + B[b + 8]! * p3[2]!;
        const sn = Math.sqrt(sE * sE + sN * sN);
        const f = sn > 1e-300 ? Math.atan2(sn, c) / sn : 1;
        if (r0 >= 0) res[r0] = -f * sE * w[3 * i]!;
        if (r1 >= 0) res[r1] = -f * sN * w[3 * i + 1]!;
      }
      if (r2 >= 0) res[r2] = (m.z[2]! - rho) * w[3 * i + 2]!;
    } else if (m.kind === 'range') {
      if (r0 >= 0) res[r0] = (m.z[0]! - rho) * w[3 * i]!;
    } else {
      if (r0 >= 0) res[r0] = (m.z[0]! + dx) * w[3 * i]!;
      if (r1 >= 0) res[r1] = (m.z[1]! + dy) * w[3 * i + 1]!;
      if (r2 >= 0) res[r2] = (m.z[2]! + dz) * w[3 * i + 2]!;
    }
  }
  return res;
}

/** Ship state (six numbers) and ship position relative to body 0 at the given times. */
export function shipStates(
  ca: CompiledArc,
  x: ArrayLike<number>,
  times: readonly number[],
  dt: number,
): { state: Float64Array[]; rel: Float64Array[] } {
  const order = times.map((t, i) => [t, i] as const).sort((a, b) => a[0] - b[0]);
  const traj = simulate(
    ca,
    x,
    order.map((o) => o[0]),
    dt,
  );
  const ship = 3 * ca.nb;
  const state: Float64Array[] = new Array(times.length);
  const rel: Float64Array[] = new Array(times.length);
  order.forEach(([, i], k) => {
    const p = traj.pos[k]!;
    const v = traj.vel[k]!;
    state[i] = Float64Array.of(
      p[ship]!,
      p[ship + 1]!,
      p[ship + 2]!,
      v[ship]!,
      v[ship + 1]!,
      v[ship + 2]!,
    );
    rel[i] = Float64Array.of(p[ship]! - p[0]!, p[ship + 1]! - p[1]!, p[ship + 2]! - p[2]!);
  });
  return { state, rel };
}
