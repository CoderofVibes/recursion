/**
 * The truth simulation (2A; three-dimensional since 2G, DECISIONS A11): massive bodies,
 * asteroids and the ship under one gravity law, fixed-step kick–drift–kick velocity Verlet,
 * rigid-body attitude, clearance and contact.
 *
 * One step of length dt, from state k to k+1 (all objects use the same positions for gravity):
 *   1. a_k: gravity (+ field acceleration) for every object at t_k; ship thrust at attitude q_k.
 *   2. Kick:  v += ½dt·a_k,   ω += ½dt·I⁻¹τ
 *   3. Drift: x += dt·v,      attitude and ω: the free rigid body for dt (see `rotate`)
 *   4. a_{k+1} at the new positions and t_{k+1}; ship thrust at q_{k+1}.
 *   5. Kick:  v += ½dt·a_{k+1},  ω += ½dt·I⁻¹τ
 * Gravity-only motion is symplectic and second order. Thrust is constant in the body frame
 * during a step, so evaluating it at q_k and q_{k+1} is the trapezoid rule for the rotating
 * direction (second order). Torque is constant in the body frame during a step too.
 *
 * Attitude is the unit quaternion q (body → inertial) with the angular velocity ω in the body
 * frame. The free rigid body is split, in the frame of the principal axes, into three exact
 * rotations (`rotate`): time-symmetric, second order, and it keeps the angular momentum and
 * the quaternion's length to rounding. A ship turning about its principal z axis reduces to
 * θ += dt·ω exactly, so planar motion stays exactly planar.
 *
 * Internally the state lives in typed arrays (`Work`); `step` unpacks, advances one step and
 * packs a new SimState; `run` stays packed for many steps. Both call the same `advance`, so
 * they agree bit for bit.
 *
 * Zeros: `x + 0` turns −0 into +0 and changes nothing else. JSON cannot carry −0, so every
 * value that could become one (products, never sums) is passed through it, and a state saved
 * as JSON restores to exactly the same numbers.
 */

import type { ObjectId } from '../contracts/ids.ts';
import type {
  ActuatorOutput,
  Asteroid,
  EnvironmentField,
  MassiveBody,
  ShipSystemsState,
  SimEvent,
  TruthWorld,
} from '../contracts/truth/index.ts';
import { hullReach, type MassProperties } from '../contracts/ship.ts';
import * as quat from '../lib/quat.ts';
import type { Vec3 } from '../lib/vec3.ts';
import {
  createPrismResult,
  packPrism,
  pointHull,
  segmentHull,
  type PackedPrism,
} from './geometry.ts';
import { coupling, inverseDistancePower } from './gravity.ts';
import type {
  AsteroidAbsorbed,
  ClearanceSample,
  ContactDetail,
  RunOptions,
  RunResult,
  SimInput,
  SimOptions,
  SimState,
  Simulation,
  StepResult,
} from './types.ts';

/** Contact ends once the hull is this far clear again, m. */
const CONTACT_SLOP = 1e-3;

/**
 * The attitude quaternion is renormalised only when its squared length is farther than this
 * from 1. The integrator itself keeps the length to rounding (a random walk of about 10⁻¹⁶ per
 * step), so in practice this only catches a sloppy quaternion handed in from outside.
 */
const NORM_TOLERANCE = 1e-12;

// ---------------------------------------------------------------------------------------------
// Context and validation
// ---------------------------------------------------------------------------------------------

interface Ctx {
  readonly dt: number;
  readonly t0: number;
  readonly restitution: number;
  readonly hullClearanceRange: number;
  readonly accelFields: readonly EnvironmentField[];
  readonly thrustFields: readonly EnvironmentField[];
}

const finite = (v: number): boolean => Number.isFinite(v);
const finiteVec = (v: Vec3): boolean => finite(v.x) && finite(v.y) && finite(v.z);
const separation = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Problems that make a world unsimulatable. Empty when the world is fine. */
export function validateWorld(world: TruthWorld): string[] {
  const problems: string[] = [];
  const { exponent, referenceRadius } = world.law;
  if (!(exponent > 0) || !finite(exponent)) problems.push(`law.exponent must be > 0 (${exponent})`);
  if (!(referenceRadius > 0) || !finite(referenceRadius))
    problems.push(`law.referenceRadius must be > 0 (${referenceRadius})`);
  const ids = new Set<string>();
  const checkId = (id: string): void => {
    if (ids.has(id)) problems.push(`duplicate object id "${id}"`);
    ids.add(id);
  };
  for (const b of world.bodies) {
    checkId(b.id);
    if (!(b.gm >= 0) || !finite(b.gm)) problems.push(`body ${b.id}: gm must be ≥ 0`);
    if (!(b.radius > 0) || !finite(b.radius)) problems.push(`body ${b.id}: radius must be > 0`);
    if (!finiteVec(b.position) || !finiteVec(b.velocity))
      problems.push(`body ${b.id}: non-finite state`);
  }
  for (const a of world.asteroids) {
    checkId(a.id);
    if (!(a.radius > 0) || !finite(a.radius)) problems.push(`asteroid ${a.id}: radius must be > 0`);
    if (!finiteVec(a.position) || !finiteVec(a.velocity))
      problems.push(`asteroid ${a.id}: non-finite state`);
  }
  for (let i = 0; i < world.bodies.length; i++) {
    for (let j = i + 1; j < world.bodies.length; j++) {
      const a = world.bodies[i]!;
      const b = world.bodies[j]!;
      if (separation(a.position, b.position) <= a.radius + b.radius)
        problems.push(`bodies ${a.id} and ${b.id} overlap`);
    }
  }
  const k = world.ship.kinematics;
  if (
    !finiteVec(k.position) ||
    !finiteVec(k.velocity) ||
    !quat.isFiniteQuat(k.attitude) ||
    !finiteVec(k.angularVelocity)
  )
    problems.push('ship: non-finite kinematics');
  else if (quat.norm(k.attitude) === 0) problems.push('ship: attitude quaternion is zero');
  for (const b of world.bodies) {
    if (separation(k.position, b.position) <= b.radius)
      problems.push(`ship starts inside body ${b.id}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Prepared input: per-step constants from the actuator output
// ---------------------------------------------------------------------------------------------

interface Prepared {
  /** Total thrust, body frame, N. */
  readonly fx: number;
  readonly fy: number;
  readonly fz: number;
  /** Angular acceleration from the torque about the CoM, about each principal axis, rad/s². */
  readonly a1: number;
  readonly a2: number;
  readonly a3: number;
  readonly torqueFree: boolean;
  readonly mass: number;
  /** Principal moments of inertia about the CoM, kg·m². */
  readonly i1: number;
  readonly i2: number;
  readonly i3: number;
  /** True when the principal axes are the body axes (no frame change needed). */
  readonly principalIsBody: boolean;
  /**
   * P, principal frame → body frame: row-major rotation matrix, so column i is principal axis i
   * in the body frame.
   */
  readonly axes: readonly number[];
  readonly comx: number;
  readonly comy: number;
  readonly comz: number;
  readonly hull: readonly PackedPrism[];
  /** Farthest hull corner from the CoM, m. */
  readonly hullRadius: number;
}

function prepare(actuators: ActuatorOutput | undefined, mp: MassProperties): Prepared {
  const { x: comx, y: comy, z: comz } = mp.centerOfMass;
  const { x: i1, y: i2, z: i3 } = mp.inertia.moments;
  if (
    !(mp.mass > 0) ||
    !(i1 > 0) ||
    !(i2 > 0) ||
    !(i3 > 0) ||
    !finite(mp.mass) ||
    !finite(i1) ||
    !finite(i2) ||
    !finite(i3)
  )
    throw new Error(
      `ship mass properties must be positive (mass ${mp.mass}, principal moments ${i1}, ${i2}, ${i3})`,
    );
  const principalIsBody =
    mp.inertia.axes.x === 0 && mp.inertia.axes.y === 0 && mp.inertia.axes.z === 0;
  const axes = quat.toMatrix(principalIsBody ? quat.IDENTITY : quat.normalize(mp.inertia.axes));

  // Total force and torque about the CoM, body frame: Σ F and Σ (point − com) × F + torque.
  let fx = 0;
  let fy = 0;
  let fz = 0;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  if (actuators) {
    for (const th of actuators.thrusts) {
      const rx = th.point.x - comx;
      const ry = th.point.y - comy;
      const rz = th.point.z - comz;
      fx += th.force.x;
      fy += th.force.y;
      fz += th.force.z;
      tx += ry * th.force.z - rz * th.force.y;
      ty += rz * th.force.x - rx * th.force.z;
      tz += rx * th.force.y - ry * th.force.x;
    }
    tx += actuators.torque.x;
    ty += actuators.torque.y;
    tz += actuators.torque.z;
  }
  // Torque in the principal frame (Pᵀ·τ), then the angular acceleration about each axis.
  const a1 = (principalIsBody ? tx : axes[0] * tx + axes[3] * ty + axes[6] * tz) / i1;
  const a2 = (principalIsBody ? ty : axes[1] * tx + axes[4] * ty + axes[7] * tz) / i2;
  const a3 = (principalIsBody ? tz : axes[2] * tx + axes[5] * ty + axes[8] * tz) / i3;

  const hull: PackedPrism[] = [];
  for (const prism of mp.hull)
    if (prism.outline.length > 0) hull.push(packPrism(prism.outline, prism.zMin, prism.zMax));
  // No hull: the ship is a point at its centre of mass.
  if (hull.length === 0) hull.push(packPrism([{ x: comx, y: comy }], comz, comz));

  return {
    fx,
    fy,
    fz,
    a1,
    a2,
    a3,
    torqueFree: a1 === 0 && a2 === 0 && a3 === 0,
    mass: mp.mass,
    i1,
    i2,
    i3,
    principalIsBody,
    axes,
    comx,
    comy,
    comz,
    hull,
    hullRadius: hullReach(mp.hull, mp.centerOfMass),
  };
}

/** Caches the last prepared input by identity, so a constant input costs nothing per step. */
class InputCache {
  private actuators: ActuatorOutput | undefined = undefined;
  private mp: MassProperties | undefined = undefined;
  private value: Prepared | undefined = undefined;

  get(actuators: ActuatorOutput | undefined, systems: ShipSystemsState): Prepared {
    const mp = actuators ? actuators.massProperties : systems.massProperties;
    if (this.value && actuators === this.actuators && mp === this.mp) return this.value;
    this.actuators = actuators;
    this.mp = mp;
    this.value = prepare(actuators, mp);
    return this.value;
  }
}

// ---------------------------------------------------------------------------------------------
// Packed working state
// ---------------------------------------------------------------------------------------------

class Work {
  exponent = 2;
  nb = 0;
  na = 0;
  bodiesSrc: readonly MassiveBody[] = [];
  asteroidsSrc: readonly Asteroid[] = [];
  // Bodies
  bK = new Float64Array(0);
  bR = new Float64Array(0);
  bFixed = new Uint8Array(0);
  bx = new Float64Array(0);
  by = new Float64Array(0);
  bz = new Float64Array(0);
  bvx = new Float64Array(0);
  bvy = new Float64Array(0);
  bvz = new Float64Array(0);
  bax = new Float64Array(0);
  bay = new Float64Array(0);
  baz = new Float64Array(0);
  bx0 = new Float64Array(0);
  by0 = new Float64Array(0);
  bz0 = new Float64Array(0);
  // Asteroids
  aR = new Float64Array(0);
  alive = new Uint8Array(0);
  ax = new Float64Array(0);
  ay = new Float64Array(0);
  az = new Float64Array(0);
  avx = new Float64Array(0);
  avy = new Float64Array(0);
  avz = new Float64Array(0);
  aax = new Float64Array(0);
  aay = new Float64Array(0);
  aaz = new Float64Array(0);
  ax0 = new Float64Array(0);
  ay0 = new Float64Array(0);
  az0 = new Float64Array(0);
  // Ship: centre of mass, inertial.
  sx = 0;
  sy = 0;
  sz = 0;
  svx = 0;
  svy = 0;
  svz = 0;
  // Attitude quaternion (body → inertial) and angular velocity (body frame).
  qw = 1;
  qx = 0;
  qy = 0;
  qz = 0;
  wx = 0;
  wy = 0;
  wz = 0;
  sgx = 0; // gravity + field acceleration at the current state
  sgy = 0;
  sgz = 0;
  sfx = 0; // specific force of the last step, body frame
  sfy = 0;
  sfz = 0;
  tick = 0;
  /**
   * Rotation matrix of the attitude (body → inertial, row-major), recomputed only when the
   * attitude changes. It is a fixed function of the quaternion, so `step` (which reloads the
   * quaternion every call) and `run` get the same numbers.
   */
  rot = new Float64Array(9);
  rotValid = false;

  rotation(): Float64Array {
    const r = this.rot;
    if (!this.rotValid) {
      const { qw, qx, qy, qz } = this;
      r[0] = 1 - 2 * (qy * qy + qz * qz);
      r[1] = 2 * (qx * qy - qw * qz);
      r[2] = 2 * (qx * qz + qw * qy);
      r[3] = 2 * (qx * qy + qw * qz);
      r[4] = 1 - 2 * (qx * qx + qz * qz);
      r[5] = 2 * (qy * qz - qw * qx);
      r[6] = 2 * (qx * qz - qw * qy);
      r[7] = 2 * (qy * qz + qw * qx);
      r[8] = 1 - 2 * (qx * qx + qy * qy);
      this.rotValid = true;
    }
    return r;
  }

  /** Bring the quaternion back to unit length, only if it has left NORM_TOLERANCE. */
  renormalize(): void {
    const n2 = this.qw * this.qw + this.qx * this.qx + this.qy * this.qy + this.qz * this.qz;
    if (n2 > 1 + NORM_TOLERANCE || n2 < 1 - NORM_TOLERANCE) {
      const n = Math.sqrt(n2);
      this.qw /= n;
      this.qx /= n;
      this.qy /= n;
      this.qz /= n;
      this.rotValid = false;
    }
  }

  // Per object (bodies first, then asteroids): contact flag and clearance minimum in progress.
  contact = new Uint8Array(0);
  /** 1 while the CoM is closing on the object (derived from positions and velocities). */
  closing = new Uint8Array(0);
  pendT = new Float64Array(0);
  pendD = new Float64Array(0);

  load(state: SimState): void {
    const w = state.world;
    const nb = w.bodies.length;
    const na = w.asteroids.length;
    if (nb > this.bK.length) {
      this.bK = new Float64Array(nb);
      this.bR = new Float64Array(nb);
      this.bFixed = new Uint8Array(nb);
      this.bx = new Float64Array(nb);
      this.by = new Float64Array(nb);
      this.bz = new Float64Array(nb);
      this.bvx = new Float64Array(nb);
      this.bvy = new Float64Array(nb);
      this.bvz = new Float64Array(nb);
      this.bax = new Float64Array(nb);
      this.bay = new Float64Array(nb);
      this.baz = new Float64Array(nb);
      this.bx0 = new Float64Array(nb);
      this.by0 = new Float64Array(nb);
      this.bz0 = new Float64Array(nb);
    }
    if (na > this.aR.length) {
      this.aR = new Float64Array(na);
      this.alive = new Uint8Array(na);
      this.ax = new Float64Array(na);
      this.ay = new Float64Array(na);
      this.az = new Float64Array(na);
      this.avx = new Float64Array(na);
      this.avy = new Float64Array(na);
      this.avz = new Float64Array(na);
      this.aax = new Float64Array(na);
      this.aay = new Float64Array(na);
      this.aaz = new Float64Array(na);
      this.ax0 = new Float64Array(na);
      this.ay0 = new Float64Array(na);
      this.az0 = new Float64Array(na);
    }
    if (nb + na > this.contact.length) {
      this.contact = new Uint8Array(nb + na);
      this.closing = new Uint8Array(nb + na);
      this.pendT = new Float64Array(nb + na);
      this.pendD = new Float64Array(nb + na);
    }
    this.exponent = w.law.exponent;
    this.nb = nb;
    this.na = na;
    this.bodiesSrc = w.bodies;
    this.asteroidsSrc = w.asteroids;
    for (let i = 0; i < nb; i++) {
      const b = w.bodies[i]!;
      this.bK[i] = coupling(b.gm, w.law);
      this.bR[i] = b.radius;
      this.bFixed[i] = b.fixed ? 1 : 0;
      this.bx[i] = b.position.x + 0;
      this.by[i] = b.position.y + 0;
      this.bz[i] = b.position.z + 0;
      this.bvx[i] = b.fixed ? 0 : b.velocity.x + 0;
      this.bvy[i] = b.fixed ? 0 : b.velocity.y + 0;
      this.bvz[i] = b.fixed ? 0 : b.velocity.z + 0;
    }
    for (let i = 0; i < na; i++) {
      const a = w.asteroids[i]!;
      this.aR[i] = a.radius;
      this.alive[i] = 1;
      this.ax[i] = a.position.x + 0;
      this.ay[i] = a.position.y + 0;
      this.az[i] = a.position.z + 0;
      this.avx[i] = a.velocity.x + 0;
      this.avy[i] = a.velocity.y + 0;
      this.avz[i] = a.velocity.z + 0;
    }
    const k = w.ship.kinematics;
    this.sx = k.position.x + 0;
    this.sy = k.position.y + 0;
    this.sz = k.position.z + 0;
    this.svx = k.velocity.x + 0;
    this.svy = k.velocity.y + 0;
    this.svz = k.velocity.z + 0;
    this.qw = k.attitude.w + 0;
    this.qx = k.attitude.x + 0;
    this.qy = k.attitude.y + 0;
    this.qz = k.attitude.z + 0;
    this.rotValid = false;
    this.wx = k.angularVelocity.x + 0;
    this.wy = k.angularVelocity.y + 0;
    this.wz = k.angularVelocity.z + 0;
    this.sfx = state.specificForce.x + 0;
    this.sfy = state.specificForce.y + 0;
    this.sfz = state.specificForce.z + 0;
    this.tick = state.tick;
    const contacts = new Set(state.contacts);
    for (let o = 0; o < nb + na; o++) {
      const id = o < nb ? w.bodies[o]!.id : w.asteroids[o - nb]!.id;
      this.contact[o] = contacts.has(id) ? 1 : 0;
      const p = state.closing[id];
      this.pendT[o] = p ? p.t : NaN;
      this.pendD[o] = p ? p.distance : NaN;
    }
    this.updateClosing();
  }

  /** Recompute every closing flag from the current state (same formula as each step's end). */
  updateClosing(): void {
    for (let o = 0; o < this.nb + this.na; o++) {
      let rx: number, ry: number, rz: number, vx: number, vy: number, vz: number;
      if (o < this.nb) {
        rx = this.bx[o]! - this.sx;
        ry = this.by[o]! - this.sy;
        rz = this.bz[o]! - this.sz;
        vx = this.bvx[o]! - this.svx;
        vy = this.bvy[o]! - this.svy;
        vz = this.bvz[o]! - this.svz;
      } else {
        const i = o - this.nb;
        if (!this.alive[i]) continue;
        rx = this.ax[i]! - this.sx;
        ry = this.ay[i]! - this.sy;
        rz = this.az[i]! - this.sz;
        vx = this.avx[i]! - this.svx;
        vy = this.avy[i]! - this.svy;
        vz = this.avz[i]! - this.svz;
      }
      this.closing[o] = closingRate(rx, ry, rz, vx, vy, vz) < 0 ? 1 : 0;
    }
  }

  objectId(o: number): ObjectId {
    return o < this.nb ? this.bodiesSrc[o]!.id : this.asteroidsSrc[o - this.nb]!.id;
  }

  store(ctx: Ctx, prev: TruthWorld, systems: ShipSystemsState): SimState {
    const bodies: MassiveBody[] = [];
    for (let i = 0; i < this.nb; i++) {
      const b = this.bodiesSrc[i]!;
      if (b.fixed && b.velocity.x === 0 && b.velocity.y === 0 && b.velocity.z === 0) {
        bodies.push(b); // unchanged
        continue;
      }
      bodies.push({
        id: b.id,
        name: b.name,
        gm: b.gm,
        radius: b.radius,
        position: { x: this.bx[i]!, y: this.by[i]!, z: this.bz[i]! },
        velocity: { x: this.bvx[i]!, y: this.bvy[i]!, z: this.bvz[i]! },
        fixed: b.fixed,
      });
    }
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < this.na; i++) {
      if (!this.alive[i]) continue;
      const a = this.asteroidsSrc[i]!;
      asteroids.push({
        id: a.id,
        position: { x: this.ax[i]!, y: this.ay[i]!, z: this.az[i]! },
        velocity: { x: this.avx[i]!, y: this.avy[i]!, z: this.avz[i]! },
        radius: a.radius,
      });
    }
    const contacts: ObjectId[] = [];
    const closing: Record<ObjectId, ClearanceSample> = {};
    for (let o = 0; o < this.nb + this.na; o++) {
      if (o >= this.nb && !this.alive[o - this.nb]) continue;
      const id = this.objectId(o);
      if (this.contact[o]) contacts.push(id);
      if (!Number.isNaN(this.pendT[o]!))
        closing[id] = { t: this.pendT[o]!, distance: this.pendD[o]! };
    }
    const world: TruthWorld = {
      t: ctx.t0 + this.tick * ctx.dt,
      law: prev.law,
      bodies,
      asteroids,
      ship: {
        kinematics: {
          position: { x: this.sx, y: this.sy, z: this.sz },
          velocity: { x: this.svx, y: this.svy, z: this.svz },
          attitude: { w: this.qw, x: this.qx, y: this.qy, z: this.qz },
          angularVelocity: { x: this.wx, y: this.wy, z: this.wz },
        },
        systems,
      },
      fields: prev.fields,
      hidden: prev.hidden,
      // The sun is light only (A3) and never moves; carry it over unchanged.
      ...(prev.sun ? { sun: prev.sun } : {}),
    };
    return {
      world,
      tick: this.tick,
      specificForce: { x: this.sfx, y: this.sfy, z: this.sfz },
      contacts,
      closing,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Forces
// ---------------------------------------------------------------------------------------------

/** Field acceleration scratch. */
let fax = 0;
let fay = 0;
let faz = 0;

function fieldAcceleration(ctx: Ctx, x: number, y: number, z: number, t: number): void {
  fax = 0;
  fay = 0;
  faz = 0;
  for (const f of ctx.accelFields) {
    const a = f.acceleration!({ x, y, z }, t);
    fax += a.x;
    fay += a.y;
    faz += a.z;
  }
}

function shipGravity(w: Work, ctx: Ctx, t: number): void {
  const n = w.exponent;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  for (let j = 0; j < w.nb; j++) {
    const dx = w.bx[j]! - w.sx;
    const dy = w.by[j]! - w.sy;
    const dz = w.bz[j]! - w.sz;
    const s = w.bK[j]! * inverseDistancePower(dx * dx + dy * dy + dz * dz, n);
    gx += dx * s;
    gy += dy * s;
    gz += dz * s;
  }
  if (ctx.accelFields.length > 0) {
    fieldAcceleration(ctx, w.sx, w.sy, w.sz, t);
    gx += fax;
    gy += fay;
    gz += faz;
  }
  w.sgx = gx;
  w.sgy = gy;
  w.sgz = gz;
}

function computeAccelerations(w: Work, ctx: Ctx, t: number): void {
  const n = w.exponent;
  const nb = w.nb;
  const { bx, by, bz, bK, bax, bay, baz, bFixed } = w;
  for (let i = 0; i < nb; i++) {
    if (bFixed[i]) {
      bax[i] = 0;
      bay[i] = 0;
      baz[i] = 0;
      continue;
    }
    const xi = bx[i]!;
    const yi = by[i]!;
    const zi = bz[i]!;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let j = 0; j < nb; j++) {
      if (j === i) continue;
      const dx = bx[j]! - xi;
      const dy = by[j]! - yi;
      const dz = bz[j]! - zi;
      const s = bK[j]! * inverseDistancePower(dx * dx + dy * dy + dz * dz, n);
      gx += dx * s;
      gy += dy * s;
      gz += dz * s;
    }
    bax[i] = gx;
    bay[i] = gy;
    baz[i] = gz;
  }
  const hasFields = ctx.accelFields.length > 0;
  const { ax, ay, az, aax, aay, aaz, alive } = w;
  for (let i = 0; i < w.na; i++) {
    if (!alive[i]) continue;
    const xi = ax[i]!;
    const yi = ay[i]!;
    const zi = az[i]!;
    let gx = 0;
    let gy = 0;
    let gz = 0;
    for (let j = 0; j < nb; j++) {
      const dx = bx[j]! - xi;
      const dy = by[j]! - yi;
      const dz = bz[j]! - zi;
      const s = bK[j]! * inverseDistancePower(dx * dx + dy * dy + dz * dz, n);
      gx += dx * s;
      gy += dy * s;
      gz += dz * s;
    }
    if (hasFields) {
      fieldAcceleration(ctx, xi, yi, zi, t);
      gx += fax;
      gy += fay;
      gz += faz;
    }
    aax[i] = gx;
    aay[i] = gy;
    aaz[i] = gz;
  }
  shipGravity(w, ctx, t);
}

/** Thrust force scratch (inertial, after fields). */
let tfx = 0;
let tfy = 0;
let tfz = 0;

/**
 * The ship's total thrust in the inertial frame: the body-frame force turned by the rotation
 * matrix `r`, then passed through every thrust-modifying field in order.
 */
function thrustForce(w: Work, ctx: Ctx, inp: Prepared, r: Float64Array, t: number): void {
  const { fx, fy, fz } = inp;
  tfx = r[0]! * fx + r[1]! * fy + r[2]! * fz;
  tfy = r[3]! * fx + r[4]! * fy + r[5]! * fz;
  tfz = r[6]! * fx + r[7]! * fy + r[8]! * fz;
  if (ctx.thrustFields.length === 0 || (fx === 0 && fy === 0 && fz === 0)) return;
  let f: Vec3 = { x: tfx, y: tfy, z: tfz };
  const p = { x: w.sx, y: w.sy, z: w.sz };
  const v = { x: w.svx, y: w.svy, z: w.svz };
  for (const field of ctx.thrustFields) f = field.modifyThrust!(f, p, v, t);
  tfx = f.x;
  tfy = f.y;
  tfz = f.z;
}

// ---------------------------------------------------------------------------------------------
// Attitude
// ---------------------------------------------------------------------------------------------

/**
 * Advance the attitude q and the angular velocity ω over one step: half kick, the free rigid
 * body for dt, half kick.
 *
 * The free rigid body is split along the principal axes (McLachlan and Reich's angular-momentum
 * splitting; also Touma and Wisdom; Dullweber, Leimkuhler and McLachlan). With L = I·ω in the
 * principal frame, the kinetic energy is Σ Lᵢ²/(2Iᵢ), and the flow of each term alone is exact:
 * L turns about principal axis i by −(Lᵢ/Iᵢ)·τ while the attitude turns about it by
 * +(Lᵢ/Iᵢ)·τ, which leaves the inertial angular momentum q·L unchanged. The symmetric
 * composition
 *   x for dt/2, y for dt/2, z for dt, y for dt/2, x for dt/2
 * is second order and time-reversible, keeps |L| and |q| to rounding, and has no secular energy
 * drift. Torque is constant in the body frame over a step, so its two half kicks are equal.
 *
 * The state is ω, not L: each sub-rotation forms the two momentum components it turns, turns
 * them, and divides back, so a component that is not turned keeps its exact value. Turning
 * about the principal z axis alone (ω₁ = ω₂ = 0) is therefore θ += dt·ω₃ with ω₃ untouched,
 * and constant torque about z is integrated exactly, as in the planar scheme this replaces.
 * A sub-rotation through a zero angle is skipped.
 *
 * Frames: the rates along the principal axes are Pᵀ·ω (P = principal → body). The attitude
 * stays the body → inertial quaternion and is turned about each principal axis as that axis
 * lies in the body frame (a column of P); when the principal axes are not the body axes, ω
 * gets back P·(change of the principal rates), so neither is carried through a change of frame
 * and back, which would add a rounding error every step whether or not anything turned.
 */
function rotate(w: Work, inp: Prepared, dt: number, h: number): void {
  if (inp.torqueFree && w.wx === 0 && w.wy === 0 && w.wz === 0) return; // not turning
  const { i1, i2, i3, a1, a2, a3 } = inp;
  const p = inp.axes;
  const direct = inp.principalIsBody;
  // Rates along the principal axes at the start of the step.
  const s1 = direct ? w.wx : p[0]! * w.wx + p[3]! * w.wy + p[6]! * w.wz;
  const s2 = direct ? w.wy : p[1]! * w.wx + p[4]! * w.wy + p[7]! * w.wz;
  const s3 = direct ? w.wz : p[2]! * w.wx + p[5]! * w.wy + p[8]! * w.wz;
  let o1 = s1 + h * a1;
  let o2 = s2 + h * a2;
  let o3 = s3 + h * a3;
  let qw = w.qw;
  let qx = w.qx;
  let qy = w.qy;
  let qz = w.qz;

  for (let stage = 0; stage < 5; stage++) {
    // Principal axis of this stage (0, 1, 2, 1, 0) and the half angle the attitude turns by.
    const axis = stage < 3 ? stage : 4 - stage;
    const half = 0.5 * (axis === 0 ? o1 * h : axis === 1 ? o2 * h : o3 * dt);
    if (half === 0) continue;
    const sh = Math.sin(half);
    const ch = Math.cos(half);
    // Sine and cosine of the full angle, for the two momentum components that turn.
    const s = 2 * sh * ch;
    const c = 1 - 2 * sh * sh;
    if (axis === 0) {
      if (o2 !== 0 || o3 !== 0) {
        const l2 = i2 * o2;
        const l3 = i3 * o3;
        o2 = (c * l2 + s * l3) / i2;
        o3 = (c * l3 - s * l2) / i3;
      }
    } else if (axis === 1) {
      if (o3 !== 0 || o1 !== 0) {
        const l3 = i3 * o3;
        const l1 = i1 * o1;
        o3 = (c * l3 + s * l1) / i3;
        o1 = (c * l1 - s * l3) / i1;
      }
    } else if (o1 !== 0 || o2 !== 0) {
      const l1 = i1 * o1;
      const l2 = i2 * o2;
      o1 = (c * l1 + s * l2) / i1;
      o2 = (c * l2 - s * l1) / i2;
    }
    // q ← q ⊗ (cos, sin·e), e the principal axis in the body frame.
    const rx = sh * p[axis]!;
    const ry = sh * p[3 + axis]!;
    const rz = sh * p[6 + axis]!;
    const nw = qw * ch - (qx * rx + qy * ry + qz * rz);
    const nx = qw * rx + qx * ch + qy * rz - qz * ry;
    const ny = qw * ry - qx * rz + qy * ch + qz * rx;
    const nz = qw * rz + qx * ry - qy * rx + qz * ch;
    qw = nw;
    qx = nx;
    qy = ny;
    qz = nz;
  }

  o1 += h * a1;
  o2 += h * a2;
  o3 += h * a3;

  if (direct) {
    w.wx = o1 + 0;
    w.wy = o2 + 0;
    w.wz = o3 + 0;
  } else {
    const d1 = o1 - s1;
    const d2 = o2 - s2;
    const d3 = o3 - s3;
    w.wx = w.wx + (p[0]! * d1 + p[1]! * d2 + p[2]! * d3) + 0;
    w.wy = w.wy + (p[3]! * d1 + p[4]! * d2 + p[5]! * d3) + 0;
    w.wz = w.wz + (p[6]! * d1 + p[7]! * d2 + p[8]! * d3) + 0;
  }
  w.qw = qw + 0;
  w.qx = qx + 0;
  w.qy = qy + 0;
  w.qz = qz + 0;
  w.rotValid = false;
}

// ---------------------------------------------------------------------------------------------
// One step
// ---------------------------------------------------------------------------------------------

interface Sinks {
  events: SimEvent[];
  contacts: ContactDetail[];
  absorbed: AsteroidAbsorbed[];
  minWith: number;
  minDistance: number;
  impact: boolean;
}

/** Rotation matrix of the attitude at the start of the step being taken. */
const rotA = new Float64Array(9);

function advance(w: Work, ctx: Ctx, inp: Prepared, sinks: Sinks, cached: boolean): void {
  const dt = ctx.dt;
  const h = 0.5 * dt;
  const tA = ctx.t0 + w.tick * dt;
  const tB = ctx.t0 + (w.tick + 1) * dt;
  if (!cached) computeAccelerations(w, ctx, tA);

  const m = inp.mass;

  // Thrust at the start of the step, at the attitude the step starts from.
  w.renormalize();
  const rot = w.rotation();
  for (let i = 0; i < 9; i++) rotA[i] = rot[i]!;
  thrustForce(w, ctx, inp, rotA, tA);
  const fAx = tfx;
  const fAy = tfy;
  const fAz = tfz;

  // Kick (half) and drift, remembering start positions for the swept clearance test.
  // Typed arrays are held in locals so the loops stay in registers.
  const nb = w.nb;
  const na = w.na;
  const { bx, by, bz, bvx, bvy, bvz, bax, bay, baz, bx0, by0, bz0, bFixed, bR } = w;
  const { ax, ay, az, avx, avy, avz, aax, aay, aaz, ax0, ay0, az0, alive, aR } = w;
  for (let i = 0; i < nb; i++) {
    bx0[i] = bx[i]!;
    by0[i] = by[i]!;
    bz0[i] = bz[i]!;
    if (bFixed[i]) continue;
    const vx = bvx[i]! + h * bax[i]!;
    const vy = bvy[i]! + h * bay[i]!;
    const vz = bvz[i]! + h * baz[i]!;
    bvx[i] = vx;
    bvy[i] = vy;
    bvz[i] = vz;
    bx[i] = bx[i]! + dt * vx;
    by[i] = by[i]! + dt * vy;
    bz[i] = bz[i]! + dt * vz;
  }
  for (let i = 0; i < na; i++) {
    const x = ax[i]!;
    const y = ay[i]!;
    const z = az[i]!;
    ax0[i] = x;
    ay0[i] = y;
    az0[i] = z;
    if (!alive[i]) continue;
    const vx = avx[i]! + h * aax[i]!;
    const vy = avy[i]! + h * aay[i]!;
    const vz = avz[i]! + h * aaz[i]!;
    avx[i] = vx;
    avy[i] = vy;
    avz[i] = vz;
    ax[i] = x + dt * vx;
    ay[i] = y + dt * vy;
    az[i] = z + dt * vz;
  }
  const sx0 = w.sx;
  const sy0 = w.sy;
  const sz0 = w.sz;
  w.svx += h * (w.sgx + fAx / m);
  w.svy += h * (w.sgy + fAy / m);
  w.svz += h * (w.sgz + fAz / m);
  w.sx += dt * w.svx;
  w.sy += dt * w.svy;
  w.sz += dt * w.svz;
  // Attitude and angular velocity for the whole step (both half kicks: the torque is constant
  // in the body frame, so nothing below changes it).
  rotate(w, inp, dt, h);

  // Asteroids reaching a body's surface leave the world.
  for (let i = 0; i < na; i++) {
    if (!alive[i]) continue;
    const x = ax[i]!;
    const y = ay[i]!;
    const z = az[i]!;
    const ra = aR[i]!;
    for (let j = 0; j < nb; j++) {
      const dx = x - bx[j]!;
      const dy = y - by[j]!;
      const dz = z - bz[j]!;
      const r = bR[j]! + ra;
      if (dx * dx + dy * dy + dz * dz <= r * r) {
        alive[i] = 0;
        w.pendT[nb + i] = NaN;
        w.contact[nb + i] = 0;
        sinks.absorbed.push({ t: tB, asteroid: w.asteroidsSrc[i]!.id, body: w.bodiesSrc[j]!.id });
        break;
      }
    }
  }

  // Forces at the end of the step, then the second half kick.
  computeAccelerations(w, ctx, tB);
  const rotB = w.rotation();
  thrustForce(w, ctx, inp, rotB, tB);
  const fBx = tfx;
  const fBy = tfy;
  const fBz = tfz;
  for (let i = 0; i < nb; i++) {
    if (bFixed[i]) continue;
    bvx[i] = bvx[i]! + h * bax[i]!;
    bvy[i] = bvy[i]! + h * bay[i]!;
    bvz[i] = bvz[i]! + h * baz[i]!;
  }
  for (let i = 0; i < na; i++) {
    if (!alive[i]) continue;
    avx[i] = avx[i]! + h * aax[i]!;
    avy[i] = avy[i]! + h * aay[i]!;
    avz[i] = avz[i]! + h * aaz[i]!;
  }
  w.svx += h * (w.sgx + fBx / m);
  w.svy += h * (w.sgy + fBy / m);
  w.svz += h * (w.sgz + fBz / m);

  // Specific force over the step, body frame.
  if (ctx.thrustFields.length === 0) {
    w.sfx = inp.fx / m;
    w.sfy = inp.fy / m;
    w.sfz = inp.fz / m;
  } else {
    // What the fields left of the thrust, turned back into the body frame at each end (Rᵀ·f).
    w.sfx =
      (0.5 *
        (rotA[0]! * fAx +
          rotA[3]! * fAy +
          rotA[6]! * fAz +
          (rotB[0]! * fBx + rotB[3]! * fBy + rotB[6]! * fBz))) /
        m +
      0;
    w.sfy =
      (0.5 *
        (rotA[1]! * fAx +
          rotA[4]! * fAy +
          rotA[7]! * fAz +
          (rotB[1]! * fBx + rotB[4]! * fBy + rotB[7]! * fBz))) /
        m +
      0;
    w.sfz =
      (0.5 *
        (rotA[2]! * fAx +
          rotA[5]! * fAy +
          rotA[8]! * fAz +
          (rotB[2]! * fBx + rotB[5]! * fBy + rotB[8]! * fBz))) /
        m +
      0;
  }

  w.tick += 1;
  clearanceAndContact(w, ctx, inp, sinks, sx0, sy0, sz0, rotB, tA, tB);
}

const hullResult = createPrismResult();

/**
 * Hull clearance to every object over the step just taken: minima events, swept contact
 * detection and an impulse response (objects are far heavier than the ship). Each object is a
 * sphere; in the body frame its centre moves along a straight segment over the step, from
 * where it was seen at the starting attitude to where it is seen at the final one.
 */
function clearanceAndContact(
  w: Work,
  ctx: Ctx,
  inp: Prepared,
  sinks: Sinks,
  sx0: number,
  sy0: number,
  sz0: number,
  rotB: Float64Array,
  tA: number,
  tB: number,
): void {
  const nb = w.nb;
  const dt = ctx.dt;
  const reach = inp.hullRadius + ctx.hullClearanceRange;
  const { comx, comy, comz, hull } = inp;
  let relocated = false;

  for (let o = 0; o < nb + w.na; o++) {
    let p0x: number, p0y: number, p0z: number;
    let p1x: number, p1y: number, p1z: number;
    let ovx: number, ovy: number, ovz: number;
    let r: number;
    if (o < nb) {
      p0x = w.bx0[o]!;
      p0y = w.by0[o]!;
      p0z = w.bz0[o]!;
      p1x = w.bx[o]!;
      p1y = w.by[o]!;
      p1z = w.bz[o]!;
      ovx = w.bvx[o]!;
      ovy = w.bvy[o]!;
      ovz = w.bvz[o]!;
      r = w.bR[o]!;
    } else {
      const i = o - nb;
      if (!w.alive[i]) continue;
      p0x = w.ax0[i]!;
      p0y = w.ay0[i]!;
      p0z = w.az0[i]!;
      p1x = w.ax[i]!;
      p1y = w.ay[i]!;
      p1z = w.az[i]!;
      ovx = w.avx[i]!;
      ovy = w.avy[i]!;
      ovz = w.avz[i]!;
      r = w.aR[i]!;
    }
    // Object centre relative to the ship's CoM, inertial, at both ends of the step.
    const r0x = p0x - sx0;
    const r0y = p0y - sy0;
    const r0z = p0z - sz0;
    const r1x = p1x - w.sx;
    const r1y = p1y - w.sy;
    const r1z = p1z - w.sz;
    // A pass is the centre of mass closing on the object and opening again (sign of the
    // closing rate, which needs no square roots). The CoM's closest approach lies in this step
    // if it was closing at the start and is not at the end.
    const wasClosing = w.closing[o] === 1;
    const nowClosing = closingRate(r1x, r1y, r1z, ovx - w.svx, ovy - w.svy, ovz - w.svz) < 0;
    w.closing[o] = nowClosing ? 1 : 0;
    const turning = wasClosing && !nowClosing;
    let tau: number;
    let comMin2: number;
    if (turning) {
      // Closest point of the segment r0 → r1 to the origin.
      const dx = r1x - r0x;
      const dy = r1y - r0y;
      const dz = r1z - r0z;
      const l2 = dx * dx + dy * dy + dz * dz;
      const u = l2 > 0 ? ((0 - r0x) * dx + (0 - r0y) * dy + (0 - r0z) * dz) / l2 : 0;
      tau = u < 0 ? 0 : u > 1 ? 1 : u;
      const cx = r0x + tau * dx;
      const cy = r0y + tau * dy;
      const cz = r0z + tau * dz;
      comMin2 = cx * cx + cy * cy + cz * cz;
    } else {
      const d0 = r0x * r0x + r0y * r0y + r0z * r0z;
      const d1 = r1x * r1x + r1y * r1y + r1z * r1z;
      tau = d0 < d1 ? 0 : 1;
      comMin2 = d0 < d1 ? d0 : d1;
    }
    const pending = !Number.isNaN(w.pendT[o]!);
    const rr = reach + r;

    if (comMin2 > rr * rr && w.contact[o] === 0) {
      // Far: clearance from the CoM. Square roots only where a value is needed.
      const best = sinks.minDistance + r;
      if (best === Infinity || comMin2 < best * best) trackMin(sinks, o, Math.sqrt(comMin2) - r);
      if (turning) {
        let t = tA + tau * dt;
        let d = Math.sqrt(comMin2) - r;
        if (pending && w.pendD[o]! <= d) {
          t = w.pendT[o]!;
          d = w.pendD[o]!;
        }
        sinks.events.push({ kind: 'clearance', t, with: w.objectId(o), distance: d });
        w.pendT[o] = NaN;
      } else if (pending && !nowClosing) {
        // A pass that began near ended out here: nothing can come closer now.
        sinks.events.push({
          kind: 'clearance',
          t: w.pendT[o]!,
          with: w.objectId(o),
          distance: w.pendD[o]!,
        });
        w.pendT[o] = NaN;
      }
      continue;
    }

    // Near: clearance from the hull. Object centre in the body frame: com + Rᵀ·rel, with the
    // attitude of the step's start for the start point and of its end for the end point.
    const c0x = comx + (rotA[0]! * r0x + rotA[3]! * r0y + rotA[6]! * r0z);
    const c0y = comy + (rotA[1]! * r0x + rotA[4]! * r0y + rotA[7]! * r0z);
    const c0z = comz + (rotA[2]! * r0x + rotA[5]! * r0y + rotA[8]! * r0z);
    const c1x = comx + (rotB[0]! * r1x + rotB[3]! * r1y + rotB[6]! * r1z);
    const c1y = comy + (rotB[1]! * r1x + rotB[4]! * r1y + rotB[7]! * r1z);
    const c1z = comz + (rotB[2]! * r1x + rotB[5]! * r1y + rotB[8]! * r1z);
    const touching = w.contact[o] === 1;
    segmentHull(c0x, c0y, c0z, c1x, c1y, c1z, hull, touching ? -1 : r, hullResult);
    let dmin = hullResult.distance - r;
    const tauHull = hullResult.tau;
    const tauHit = hullResult.hit;

    if (touching) {
      // Already touching: keep the hull out of the object, or let go once clear.
      const sd = pointHull(c1x, c1y, c1z, hull, hullResult).distance - r;
      if (sd <= 0) {
        resolveContact(w, ctx, inp, sinks, o, c1x, c1y, c1z, rotB, tB, false);
        relocated = true;
        dmin = 0;
      } else if (sd > CONTACT_SLOP) {
        w.contact[o] = 0;
      }
      trackMin(sinks, o, Math.max(0, Math.min(dmin, sd)));
      continue;
    }
    if (dmin <= 0) {
      if (tauHit >= 0) {
        const pcx = c0x + tauHit * (c1x - c0x);
        const pcy = c0y + tauHit * (c1y - c0y);
        const pcz = c0z + tauHit * (c1z - c0z);
        resolveContact(w, ctx, inp, sinks, o, pcx, pcy, pcz, rotB, tA + tauHit * dt, true);
        relocated = true;
        w.contact[o] = 1;
        w.pendT[o] = NaN;
        trackMin(sinks, o, 0);
        continue;
      }
      dmin = Math.max(dmin, 0);
    }
    trackMin(sinks, o, dmin);

    // During a pass keep the lowest hull clearance; report it once the CoM is opening and far
    // enough that no hull point can come closer (a tumbling hull gives one event per pass, not
    // one per half-turn).
    if (pending || wasClosing || nowClosing) {
      if (!pending || dmin < w.pendD[o]!) {
        w.pendT[o] = tA + tauHull * dt;
        w.pendD[o] = dmin;
      }
      if (
        !nowClosing &&
        Math.sqrt(r1x * r1x + r1y * r1y + r1z * r1z) - r - inp.hullRadius >= w.pendD[o]!
      ) {
        sinks.events.push({
          kind: 'clearance',
          t: w.pendT[o]!,
          with: w.objectId(o),
          distance: w.pendD[o]!,
        });
        w.pendT[o] = NaN;
      }
    }
  }
  // Contact moved the ship: closing flags must match what load() derives from the new state.
  if (relocated) w.updateClosing();
  if (relocated) shipGravity(w, ctx, tB);
}

/** Closing rate sign test: (object − ship)·(v_object − v_ship); negative while closing. */
function closingRate(
  rx: number,
  ry: number,
  rz: number,
  rvx: number,
  rvy: number,
  rvz: number,
): number {
  return rx * rvx + ry * rvy + rz * rvz;
}

function trackMin(sinks: Sinks, o: number, d: number): void {
  if (d < sinks.minDistance) {
    sinks.minDistance = d;
    sinks.minWith = o;
  }
}

/**
 * Place the ship so the object's centre sits at (pcx, pcy, pcz) in the body frame, exactly
 * touching the hull, and apply an impulse along the contact normal if the hull point is closing
 * on the object. The object is treated as immovable (far heavier than the ship).
 *
 * With n the unit normal from the hull toward the object, r the contact point from the centre
 * of mass and u the hull point's velocity relative to the object:
 *   j = (1 + e)·(u·n) / (1/m + n·((I⁻¹(r × n)) × r)),   Δv = −(j/m)·n,   Δω = −I⁻¹(r × j·n).
 * r, n and ω are handled in the body frame, where the inertia tensor is constant.
 */
function resolveContact(
  w: Work,
  ctx: Ctx,
  inp: Prepared,
  sinks: Sinks,
  o: number,
  pcx: number,
  pcy: number,
  pcz: number,
  rotB: Float64Array,
  t: number,
  impact: boolean,
): void {
  const { comx, comy, comz, mass, i1, i2, i3 } = inp;
  const nb = w.nb;
  const r = o < nb ? w.bR[o]! : w.aR[o - nb]!;
  const p1x = o < nb ? w.bx[o]! : w.ax[o - nb]!;
  const p1y = o < nb ? w.by[o]! : w.ay[o - nb]!;
  const p1z = o < nb ? w.bz[o]! : w.az[o - nb]!;
  const ovx = o < nb ? w.bvx[o]! : w.avx[o - nb]!;
  const ovy = o < nb ? w.bvy[o]! : w.avy[o - nb]!;
  const ovz = o < nb ? w.bvz[o]! : w.avz[o - nb]!;

  pointHull(pcx, pcy, pcz, inp.hull, hullResult);
  const qx = hullResult.qx;
  const qy = hullResult.qy;
  const qz = hullResult.qz;
  let nbx = hullResult.nx;
  let nby = hullResult.ny;
  let nbz = hullResult.nz;
  if (nbx === 0 && nby === 0 && nbz === 0) {
    // The centre is exactly on the hull surface: push it straight away from the CoM.
    nbx = pcx - comx;
    nby = pcy - comy;
    nbz = pcz - comz;
    const len = Math.hypot(nbx, nby, nbz);
    if (len === 0) {
      nbx = 1;
    } else {
      nbx /= len;
      nby /= len;
      nbz /= len;
    }
  }
  // Object centre exactly r from the contact point (from the CoM, body frame), and the ship
  // moved so that the object is there.
  const ocx = qx + nbx * r - comx;
  const ocy = qy + nby * r - comy;
  const ocz = qz + nbz * r - comz;
  w.sx = p1x - (rotB[0]! * ocx + rotB[1]! * ocy + rotB[2]! * ocz);
  w.sy = p1y - (rotB[3]! * ocx + rotB[4]! * ocy + rotB[5]! * ocz);
  w.sz = p1z - (rotB[6]! * ocx + rotB[7]! * ocy + rotB[8]! * ocz);

  // Normal, lever arm and angular velocity in the inertial frame, for the hull point's velocity.
  const rbx = qx - comx;
  const rby = qy - comy;
  const rbz = qz - comz;
  const nx = rotB[0]! * nbx + rotB[1]! * nby + rotB[2]! * nbz;
  const ny = rotB[3]! * nbx + rotB[4]! * nby + rotB[5]! * nbz;
  const nz = rotB[6]! * nbx + rotB[7]! * nby + rotB[8]! * nbz;
  const rx = rotB[0]! * rbx + rotB[1]! * rby + rotB[2]! * rbz;
  const ry = rotB[3]! * rbx + rotB[4]! * rby + rotB[5]! * rbz;
  const rz = rotB[6]! * rbx + rotB[7]! * rby + rotB[8]! * rbz;
  const omx = rotB[0]! * w.wx + rotB[1]! * w.wy + rotB[2]! * w.wz;
  const omy = rotB[3]! * w.wx + rotB[4]! * w.wy + rotB[5]! * w.wz;
  const omz = rotB[6]! * w.wx + rotB[7]! * w.wy + rotB[8]! * w.wz;
  const ux = w.svx + (omy * rz - omz * ry) - ovx;
  const uy = w.svy + (omz * rx - omx * rz) - ovy;
  const uz = w.svz + (omx * ry - omy * rx) - ovz;
  const un = ux * nx + uy * ny + uz * nz;
  let j = 0;
  if (un > 0) {
    // k = I⁻¹·(r × n) in the body frame, through the principal frame.
    const cx = rby * nbz - rbz * nby;
    const cy = rbz * nbx - rbx * nbz;
    const cz = rbx * nby - rby * nbx;
    let kx: number, ky: number, kz: number;
    if (inp.principalIsBody) {
      kx = cx / i1;
      ky = cy / i2;
      kz = cz / i3;
    } else {
      const p = inp.axes;
      const k1 = (p[0]! * cx + p[3]! * cy + p[6]! * cz) / i1;
      const k2 = (p[1]! * cx + p[4]! * cy + p[7]! * cz) / i2;
      const k3 = (p[2]! * cx + p[5]! * cy + p[8]! * cz) / i3;
      kx = p[0]! * k1 + p[1]! * k2 + p[2]! * k3;
      ky = p[3]! * k1 + p[4]! * k2 + p[5]! * k3;
      kz = p[6]! * k1 + p[7]! * k2 + p[8]! * k3;
    }
    // n·(k × r) = k·(r × n)
    j = ((1 + ctx.restitution) * un) / (1 / mass + (kx * cx + ky * cy + kz * cz));
    w.svx -= (j / mass) * nx;
    w.svy -= (j / mass) * ny;
    w.svz -= (j / mass) * nz;
    w.wx -= j * kx;
    w.wy -= j * ky;
    w.wz -= j * kz;
    // The accelerometer feels the impulse, spread over the step.
    w.sfx -= ((j / mass) * nbx) / ctx.dt;
    w.sfy -= ((j / mass) * nby) / ctx.dt;
    w.sfz -= ((j / mass) * nbz) / ctx.dt;
  }
  const relativeSpeed = Math.hypot(ux, uy, uz);
  const id = w.objectId(o);
  const point = { x: qx + 0, y: qy + 0, z: qz + 0 };
  if (impact) {
    sinks.impact = true;
    sinks.events.push({ kind: 'impact', t, with: id, relativeSpeed, point });
  }
  if (impact || j > 0) {
    sinks.contacts.push({
      t,
      with: id,
      impulse: j,
      point,
      normal: { x: nbx + 0, y: nby + 0, z: nbz + 0 },
      relativeSpeed,
      impact,
    });
  }
}

const newSinks = (): Sinks => ({
  events: [],
  contacts: [],
  absorbed: [],
  minWith: -1,
  minDistance: Infinity,
  impact: false,
});

const byTime = (a: { t: number }, b: { t: number }): number => a.t - b.t;

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * Build a simulation for a world (usually an encounter's world at arrival). Instantiates the
 * world's fields from the registry and checks the world; throws on problems.
 */
export function createSimulation(world: TruthWorld, options: SimOptions): Simulation {
  const { dt } = options;
  if (!(dt > 0) || !finite(dt)) throw new Error(`simulation dt must be positive, got ${dt}`);
  const problems = validateWorld(world);
  if (problems.length > 0) throw new Error(`invalid world: ${problems.join('; ')}`);
  if (world.fields.length > 0 && !options.registry)
    throw new Error('world has fields but no field registry was given');
  const fields = world.fields.map((spec) => options.registry!.create(spec));
  const ctx: Ctx = {
    dt,
    t0: world.t,
    restitution: options.restitution ?? 0.2,
    hullClearanceRange: options.hullClearanceRange ?? 5000,
    accelFields: fields.filter((f) => typeof f.acceleration === 'function'),
    thrustFields: fields.filter((f) => typeof f.modifyThrust === 'function'),
  };
  const initial: SimState = {
    world,
    tick: 0,
    specificForce: { x: 0, y: 0, z: 0 },
    contacts: [],
    closing: {},
  };

  const stepWork = new Work();
  const stepInputs = new InputCache();

  return {
    dt,
    t0: world.t,
    fields,
    initial,

    step(state: SimState, input: SimInput = {}): StepResult {
      const prepared = stepInputs.get(input.actuators, state.world.ship.systems);
      stepWork.load(state);
      const sinks = newSinks();
      advance(stepWork, ctx, prepared, sinks, false);
      const next = stepWork.store(ctx, state.world, input.systems ?? state.world.ship.systems);
      sinks.events.sort(byTime);
      return {
        state: next,
        events: sinks.events,
        contacts: sinks.contacts,
        absorbed: sinks.absorbed,
        minClearance:
          sinks.minWith < 0
            ? null
            : { with: stepWork.objectId(sinks.minWith), distance: sinks.minDistance },
      };
    },

    run(state: SimState, steps: number, opts: RunOptions = {}): RunResult {
      const work = new Work();
      const inputs = new InputCache();
      work.load(state);
      let systems = state.world.ship.systems;
      // One set of sinks for the whole run: events go straight into the output arrays.
      const sinks = newSinks();
      const { events, contacts, absorbed } = sinks;
      const every = opts.sampleEvery ?? 0;
      let done = 0;
      let current = state;
      for (let i = 0; i < steps; i++) {
        const input = opts.input?.(work.tick, ctx.t0 + work.tick * dt);
        const prepared = inputs.get(input?.actuators, systems);
        if (input?.systems) systems = input.systems;
        const first = events.length;
        sinks.impact = false;
        sinks.minDistance = Infinity;
        sinks.minWith = -1;
        advance(work, ctx, prepared, sinks, i > 0);
        if (events.length - first > 1) {
          const stepEvents = events.splice(first).sort(byTime);
          for (const e of stepEvents) events.push(e);
        }
        done++;
        const last = i === steps - 1 || (opts.stopOnImpact === true && sinks.impact);
        if (last || (every > 0 && done % every === 0)) {
          current = work.store(ctx, current.world, systems);
          if (opts.onSample) opts.onSample(current);
        }
        if (last) break;
      }
      return { state: current, steps: done, events, contacts, absorbed };
    },
  };
}
