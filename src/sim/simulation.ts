/**
 * The truth simulation (2A): massive bodies, asteroids and the ship under one gravity law,
 * fixed-step kick–drift–kick velocity Verlet, rigid-body attitude, clearance and contact.
 *
 * One step of length dt, from state k to k+1 (all objects use the same positions for gravity):
 *   1. a_k: gravity (+ field acceleration) for every object at t_k; ship thrust at attitude θ_k.
 *   2. Kick:  v += ½dt·a_k,   ω += ½dt·α
 *   3. Drift: x += dt·v,      θ += dt·ω
 *   4. a_{k+1} at the new positions and t_{k+1}; ship thrust at θ_{k+1}.
 *   5. Kick:  v += ½dt·a_{k+1},  ω += ½dt·α
 * Gravity-only motion is symplectic and second order. Thrust is constant in the body frame
 * during a step, so evaluating it at θ_k and θ_{k+1} is the trapezoid rule for the rotating
 * direction (second order); constant torque gives constant α, which this scheme integrates exactly.
 *
 * Internally the state lives in typed arrays (`Work`); `step` unpacks, advances one step and
 * packs a new SimState; `run` stays packed for many steps. Both call the same `advance`, so
 * they agree bit for bit.
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
import type { MassProperties } from '../contracts/ship.ts';
import { wrapAngle, type Vec2 } from '../lib/vec2.ts';
import {
  createGeometryResult,
  pointPolygon,
  pointSegmentTau,
  segmentPolygon,
  sweepPolygon,
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
const finiteVec = (v: Vec2): boolean => finite(v.x) && finite(v.y);

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
      const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
      if (d <= a.radius + b.radius) problems.push(`bodies ${a.id} and ${b.id} overlap`);
    }
  }
  const k = world.ship.kinematics;
  if (
    !finiteVec(k.position) ||
    !finiteVec(k.velocity) ||
    !finite(k.attitude) ||
    !finite(k.angularRate)
  )
    problems.push('ship: non-finite kinematics');
  for (const b of world.bodies) {
    const d = Math.hypot(k.position.x - b.position.x, k.position.y - b.position.y);
    if (d <= b.radius) problems.push(`ship starts inside body ${b.id}`);
  }
  return problems;
}

// ---------------------------------------------------------------------------------------------
// Prepared input: per-step constants from the actuator output
// ---------------------------------------------------------------------------------------------

interface Prepared {
  readonly fx: number; // total thrust, body frame, N
  readonly fy: number;
  readonly torque: number; // about the CoM, N·m
  readonly mass: number;
  readonly inertia: number;
  readonly comx: number;
  readonly comy: number;
  readonly hull: Float64Array;
  readonly nh: number;
  /** Farthest hull vertex from the CoM, m. */
  readonly hullRadius: number;
}

function prepare(actuators: ActuatorOutput | undefined, mp: MassProperties): Prepared {
  const comx = mp.centerOfMass.x;
  const comy = mp.centerOfMass.y;
  if (!(mp.mass > 0) || !(mp.inertia > 0) || !finite(mp.mass) || !finite(mp.inertia))
    throw new Error(
      `ship mass properties must be positive (mass ${mp.mass}, inertia ${mp.inertia})`,
    );
  let fx = 0;
  let fy = 0;
  let torque = 0;
  if (actuators) {
    for (const th of actuators.thrusts) {
      fx += th.force.x;
      fy += th.force.y;
      torque += (th.point.x - comx) * th.force.y - (th.point.y - comy) * th.force.x;
    }
    torque += actuators.torque;
  }
  const fp = mp.footprint;
  const nh = fp.length > 0 ? fp.length : 1;
  const hull = new Float64Array(2 * nh);
  let hullRadius = 0;
  if (fp.length === 0) {
    hull[0] = comx;
    hull[1] = comy;
  } else {
    for (let i = 0; i < fp.length; i++) {
      const p = fp[i]!;
      hull[2 * i] = p.x;
      hull[2 * i + 1] = p.y;
      hullRadius = Math.max(hullRadius, Math.hypot(p.x - comx, p.y - comy));
    }
  }
  return { fx, fy, torque, mass: mp.mass, inertia: mp.inertia, comx, comy, hull, nh, hullRadius };
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
  bvx = new Float64Array(0);
  bvy = new Float64Array(0);
  bax = new Float64Array(0);
  bay = new Float64Array(0);
  bx0 = new Float64Array(0);
  by0 = new Float64Array(0);
  // Asteroids
  aR = new Float64Array(0);
  alive = new Uint8Array(0);
  ax = new Float64Array(0);
  ay = new Float64Array(0);
  avx = new Float64Array(0);
  avy = new Float64Array(0);
  aax = new Float64Array(0);
  aay = new Float64Array(0);
  ax0 = new Float64Array(0);
  ay0 = new Float64Array(0);
  // Ship
  sx = 0;
  sy = 0;
  svx = 0;
  svy = 0;
  th = 0;
  om = 0;
  sgx = 0; // gravity + field acceleration at the current state
  sgy = 0;
  sfx = 0; // specific force of the last step, body frame
  sfy = 0;
  tick = 0;
  // cos/sin of the attitude they were computed for (the end of one step is the next's start).
  trigTh = NaN;
  trigC = 1;
  trigS = 0;

  trig(): void {
    if (this.th !== this.trigTh) {
      this.trigTh = this.th;
      this.trigC = Math.cos(this.th);
      this.trigS = Math.sin(this.th);
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
      this.bvx = new Float64Array(nb);
      this.bvy = new Float64Array(nb);
      this.bax = new Float64Array(nb);
      this.bay = new Float64Array(nb);
      this.bx0 = new Float64Array(nb);
      this.by0 = new Float64Array(nb);
    }
    if (na > this.aR.length) {
      this.aR = new Float64Array(na);
      this.alive = new Uint8Array(na);
      this.ax = new Float64Array(na);
      this.ay = new Float64Array(na);
      this.avx = new Float64Array(na);
      this.avy = new Float64Array(na);
      this.aax = new Float64Array(na);
      this.aay = new Float64Array(na);
      this.ax0 = new Float64Array(na);
      this.ay0 = new Float64Array(na);
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
      this.bx[i] = b.position.x;
      this.by[i] = b.position.y;
      this.bvx[i] = b.fixed ? 0 : b.velocity.x;
      this.bvy[i] = b.fixed ? 0 : b.velocity.y;
    }
    for (let i = 0; i < na; i++) {
      const a = w.asteroids[i]!;
      this.aR[i] = a.radius;
      this.alive[i] = 1;
      this.ax[i] = a.position.x;
      this.ay[i] = a.position.y;
      this.avx[i] = a.velocity.x;
      this.avy[i] = a.velocity.y;
    }
    const k = w.ship.kinematics;
    this.sx = k.position.x;
    this.sy = k.position.y;
    this.svx = k.velocity.x;
    this.svy = k.velocity.y;
    this.th = k.attitude;
    this.om = k.angularRate;
    this.sfx = state.specificForce.x;
    this.sfy = state.specificForce.y;
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
      let rx: number, ry: number, vx: number, vy: number;
      if (o < this.nb) {
        rx = this.bx[o]! - this.sx;
        ry = this.by[o]! - this.sy;
        vx = this.bvx[o]! - this.svx;
        vy = this.bvy[o]! - this.svy;
      } else {
        const i = o - this.nb;
        if (!this.alive[i]) continue;
        rx = this.ax[i]! - this.sx;
        ry = this.ay[i]! - this.sy;
        vx = this.avx[i]! - this.svx;
        vy = this.avy[i]! - this.svy;
      }
      this.closing[o] = closingRate(rx, ry, vx, vy) < 0 ? 1 : 0;
    }
  }

  objectId(o: number): ObjectId {
    return o < this.nb ? this.bodiesSrc[o]!.id : this.asteroidsSrc[o - this.nb]!.id;
  }

  store(ctx: Ctx, prev: TruthWorld, systems: ShipSystemsState): SimState {
    const bodies: MassiveBody[] = [];
    for (let i = 0; i < this.nb; i++) {
      const b = this.bodiesSrc[i]!;
      if (b.fixed && b.velocity.x === 0 && b.velocity.y === 0) {
        bodies.push(b); // unchanged
        continue;
      }
      bodies.push({
        id: b.id,
        name: b.name,
        gm: b.gm,
        radius: b.radius,
        position: { x: this.bx[i]!, y: this.by[i]! },
        velocity: { x: this.bvx[i]!, y: this.bvy[i]! },
        fixed: b.fixed,
      });
    }
    const asteroids: Asteroid[] = [];
    for (let i = 0; i < this.na; i++) {
      if (!this.alive[i]) continue;
      const a = this.asteroidsSrc[i]!;
      asteroids.push({
        id: a.id,
        position: { x: this.ax[i]!, y: this.ay[i]! },
        velocity: { x: this.avx[i]!, y: this.avy[i]! },
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
          position: { x: this.sx, y: this.sy },
          velocity: { x: this.svx, y: this.svy },
          attitude: this.th,
          angularRate: this.om,
        },
        systems,
      },
      fields: prev.fields,
      hidden: prev.hidden,
    };
    return {
      world,
      tick: this.tick,
      specificForce: { x: this.sfx, y: this.sfy },
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

function fieldAcceleration(ctx: Ctx, x: number, y: number, t: number): void {
  fax = 0;
  fay = 0;
  for (const f of ctx.accelFields) {
    const a = f.acceleration!({ x, y }, t);
    fax += a.x;
    fay += a.y;
  }
}

function shipGravity(w: Work, ctx: Ctx, t: number): void {
  const n = w.exponent;
  let gx = 0;
  let gy = 0;
  for (let j = 0; j < w.nb; j++) {
    const dx = w.bx[j]! - w.sx;
    const dy = w.by[j]! - w.sy;
    const s = w.bK[j]! * inverseDistancePower(dx * dx + dy * dy, n);
    gx += dx * s;
    gy += dy * s;
  }
  if (ctx.accelFields.length > 0) {
    fieldAcceleration(ctx, w.sx, w.sy, t);
    gx += fax;
    gy += fay;
  }
  w.sgx = gx;
  w.sgy = gy;
}

function computeAccelerations(w: Work, ctx: Ctx, t: number): void {
  const n = w.exponent;
  const nb = w.nb;
  const { bx, by, bK, bax, bay, bFixed } = w;
  for (let i = 0; i < nb; i++) {
    if (bFixed[i]) {
      bax[i] = 0;
      bay[i] = 0;
      continue;
    }
    const xi = bx[i]!;
    const yi = by[i]!;
    let gx = 0;
    let gy = 0;
    for (let j = 0; j < nb; j++) {
      if (j === i) continue;
      const dx = bx[j]! - xi;
      const dy = by[j]! - yi;
      const s = bK[j]! * inverseDistancePower(dx * dx + dy * dy, n);
      gx += dx * s;
      gy += dy * s;
    }
    bax[i] = gx;
    bay[i] = gy;
  }
  const hasFields = ctx.accelFields.length > 0;
  const { ax, ay, aax, aay, alive } = w;
  for (let i = 0; i < w.na; i++) {
    if (!alive[i]) continue;
    const xi = ax[i]!;
    const yi = ay[i]!;
    let gx = 0;
    let gy = 0;
    for (let j = 0; j < nb; j++) {
      const dx = bx[j]! - xi;
      const dy = by[j]! - yi;
      const s = bK[j]! * inverseDistancePower(dx * dx + dy * dy, n);
      gx += dx * s;
      gy += dy * s;
    }
    if (hasFields) {
      fieldAcceleration(ctx, xi, yi, t);
      gx += fax;
      gy += fay;
    }
    aax[i] = gx;
    aay[i] = gy;
  }
  shipGravity(w, ctx, t);
}

/** Thrust force scratch (inertial, after fields). */
let tfx = 0;
let tfy = 0;

function thrustForce(
  ctx: Ctx,
  fx: number,
  fy: number,
  x: number,
  y: number,
  vx: number,
  vy: number,
  t: number,
): void {
  if (ctx.thrustFields.length === 0 || (fx === 0 && fy === 0)) {
    tfx = fx;
    tfy = fy;
    return;
  }
  let f: Vec2 = { x: fx, y: fy };
  const p = { x, y };
  const v = { x: vx, y: vy };
  for (const field of ctx.thrustFields) f = field.modifyThrust!(f, p, v, t);
  tfx = f.x;
  tfy = f.y;
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

const geo = createGeometryResult();

function advance(w: Work, ctx: Ctx, inp: Prepared, sinks: Sinks, cached: boolean): void {
  const dt = ctx.dt;
  const h = 0.5 * dt;
  const tA = ctx.t0 + w.tick * dt;
  const tB = ctx.t0 + (w.tick + 1) * dt;
  if (!cached) computeAccelerations(w, ctx, tA);

  const m = inp.mass;
  const alpha = inp.torque / inp.inertia;

  // Thrust at the start of the step.
  w.trig();
  const cA = w.trigC;
  const sA = w.trigS;
  thrustForce(
    ctx,
    cA * inp.fx - sA * inp.fy,
    sA * inp.fx + cA * inp.fy,
    w.sx,
    w.sy,
    w.svx,
    w.svy,
    tA,
  );
  const fAx = tfx;
  const fAy = tfy;

  // Kick (half) and drift, remembering start positions for the swept clearance test.
  // Typed arrays are held in locals so the loops stay in registers.
  const nb = w.nb;
  const na = w.na;
  const { bx, by, bvx, bvy, bax, bay, bx0, by0, bFixed, bR } = w;
  const { ax, ay, avx, avy, aax, aay, ax0, ay0, alive, aR } = w;
  for (let i = 0; i < nb; i++) {
    bx0[i] = bx[i]!;
    by0[i] = by[i]!;
    if (bFixed[i]) continue;
    const vx = bvx[i]! + h * bax[i]!;
    const vy = bvy[i]! + h * bay[i]!;
    bvx[i] = vx;
    bvy[i] = vy;
    bx[i] = bx[i]! + dt * vx;
    by[i] = by[i]! + dt * vy;
  }
  for (let i = 0; i < na; i++) {
    const x = ax[i]!;
    const y = ay[i]!;
    ax0[i] = x;
    ay0[i] = y;
    if (!alive[i]) continue;
    const vx = avx[i]! + h * aax[i]!;
    const vy = avy[i]! + h * aay[i]!;
    avx[i] = vx;
    avy[i] = vy;
    ax[i] = x + dt * vx;
    ay[i] = y + dt * vy;
  }
  const sx0 = w.sx;
  const sy0 = w.sy;
  w.svx += h * (w.sgx + fAx / m);
  w.svy += h * (w.sgy + fAy / m);
  w.om += h * alpha;
  w.sx += dt * w.svx;
  w.sy += dt * w.svy;
  const th = w.th + dt * w.om;
  w.th = th > Math.PI || th <= -Math.PI ? wrapAngle(th) : th; // same result, skips the fmod

  // Asteroids reaching a body's surface leave the world.
  for (let i = 0; i < na; i++) {
    if (!alive[i]) continue;
    const x = ax[i]!;
    const y = ay[i]!;
    const ra = aR[i]!;
    for (let j = 0; j < nb; j++) {
      const dx = x - bx[j]!;
      const dy = y - by[j]!;
      const r = bR[j]! + ra;
      if (dx * dx + dy * dy <= r * r) {
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
  w.trig();
  const cB = w.trigC;
  const sB = w.trigS;
  thrustForce(
    ctx,
    cB * inp.fx - sB * inp.fy,
    sB * inp.fx + cB * inp.fy,
    w.sx,
    w.sy,
    w.svx,
    w.svy,
    tB,
  );
  const fBx = tfx;
  const fBy = tfy;
  for (let i = 0; i < nb; i++) {
    if (bFixed[i]) continue;
    bvx[i] = bvx[i]! + h * bax[i]!;
    bvy[i] = bvy[i]! + h * bay[i]!;
  }
  for (let i = 0; i < na; i++) {
    if (!alive[i]) continue;
    avx[i] = avx[i]! + h * aax[i]!;
    avy[i] = avy[i]! + h * aay[i]!;
  }
  w.svx += h * (w.sgx + fBx / m);
  w.svy += h * (w.sgy + fBy / m);
  w.om += h * alpha;

  // Specific force over the step, body frame.
  if (ctx.thrustFields.length === 0) {
    w.sfx = inp.fx / m;
    w.sfy = inp.fy / m;
  } else {
    w.sfx = (0.5 * (cA * fAx + sA * fAy + cB * fBx + sB * fBy)) / m;
    w.sfy = (0.5 * (-sA * fAx + cA * fAy - sB * fBx + cB * fBy)) / m;
  }

  w.tick += 1;
  clearanceAndContact(w, ctx, inp, sinks, sx0, sy0, cA, sA, cB, sB, tA, tB);
}

/**
 * Hull clearance to every object over the step just taken: minima events, swept contact
 * detection and a simple impulse response (objects are far heavier than the ship).
 */
function clearanceAndContact(
  w: Work,
  ctx: Ctx,
  inp: Prepared,
  sinks: Sinks,
  sx0: number,
  sy0: number,
  cA: number,
  sA: number,
  cB: number,
  sB: number,
  tA: number,
  tB: number,
): void {
  const nb = w.nb;
  const dt = ctx.dt;
  const reach = inp.hullRadius + ctx.hullClearanceRange;
  const { comx, comy, hull, nh } = inp;
  let relocated = false;

  for (let o = 0; o < nb + w.na; o++) {
    let p0x: number, p0y: number, p1x: number, p1y: number, ovx: number, ovy: number, r: number;
    if (o < nb) {
      p0x = w.bx0[o]!;
      p0y = w.by0[o]!;
      p1x = w.bx[o]!;
      p1y = w.by[o]!;
      ovx = w.bvx[o]!;
      ovy = w.bvy[o]!;
      r = w.bR[o]!;
    } else {
      const i = o - nb;
      if (!w.alive[i]) continue;
      p0x = w.ax0[i]!;
      p0y = w.ay0[i]!;
      p1x = w.ax[i]!;
      p1y = w.ay[i]!;
      ovx = w.avx[i]!;
      ovy = w.avy[i]!;
      r = w.aR[i]!;
    }
    // Object centre relative to the ship's CoM, inertial, at both ends of the step.
    const r0x = p0x - sx0;
    const r0y = p0y - sy0;
    const r1x = p1x - w.sx;
    const r1y = p1y - w.sy;
    // A pass is the centre of mass closing on the object and opening again (sign of the
    // closing rate, which needs no square roots). The CoM's closest approach lies in this step
    // if it was closing at the start and is not at the end.
    const wasClosing = w.closing[o] === 1;
    const nowClosing = closingRate(r1x, r1y, ovx - w.svx, ovy - w.svy) < 0;
    w.closing[o] = nowClosing ? 1 : 0;
    const turning = wasClosing && !nowClosing;
    let tau: number;
    let comMin2: number;
    if (turning) {
      tau = pointSegmentTau(r0x, r0y, r1x, r1y, 0, 0);
      const cx = r0x + tau * (r1x - r0x);
      const cy = r0y + tau * (r1y - r0y);
      comMin2 = cx * cx + cy * cy;
    } else {
      const d0 = r0x * r0x + r0y * r0y;
      const d1 = r1x * r1x + r1y * r1y;
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

    // Near: clearance from the hull polygon. Object centre in the body frame: com + R(−θ)·rel.
    const c0x = comx + cA * r0x + sA * r0y;
    const c0y = comy - sA * r0x + cA * r0y;
    const c1x = comx + cB * r1x + sB * r1y;
    const c1y = comy - sB * r1x + cB * r1y;
    segmentPolygon(c0x, c0y, c1x, c1y, hull, nh, geo);
    let dmin = geo.distance - r;
    const tauHull = geo.tau;

    if (w.contact[o]) {
      // Already touching: keep the hull out of the object, or let go once clear.
      pointPolygon(c1x, c1y, hull, nh, geo);
      const sd = geo.distance - r;
      if (sd <= 0) {
        resolveContact(w, ctx, inp, sinks, o, c1x, c1y, cB, sB, p1x, p1y, ovx, ovy, tB, false);
        relocated = true;
        dmin = 0;
      } else if (sd > CONTACT_SLOP) {
        w.contact[o] = 0;
      }
      trackMin(sinks, o, Math.max(0, Math.min(dmin, sd)));
      continue;
    }
    if (dmin <= 0) {
      const tauHit = sweepPolygon(c0x, c0y, c1x, c1y, hull, nh, r);
      if (tauHit >= 0) {
        const pcx = c0x + tauHit * (c1x - c0x);
        const pcy = c0y + tauHit * (c1y - c0y);
        resolveContact(
          w,
          ctx,
          inp,
          sinks,
          o,
          pcx,
          pcy,
          cB,
          sB,
          p1x,
          p1y,
          ovx,
          ovy,
          tA + tauHit * dt,
          true,
        );
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
    // enough that no hull point can come closer (a spinning hull gives one event per pass, not
    // one per half-turn).
    if (pending || wasClosing || nowClosing) {
      if (!pending || dmin < w.pendD[o]!) {
        w.pendT[o] = tA + tauHull * dt;
        w.pendD[o] = dmin;
      }
      if (!nowClosing && Math.sqrt(r1x * r1x + r1y * r1y) - r - inp.hullRadius >= w.pendD[o]!) {
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
function closingRate(rx: number, ry: number, rvx: number, rvy: number): number {
  return rx * rvx + ry * rvy;
}

function trackMin(sinks: Sinks, o: number, d: number): void {
  if (d < sinks.minDistance) {
    sinks.minDistance = d;
    sinks.minWith = o;
  }
}

/**
 * Place the ship so the object's centre sits at (pcx, pcy) in the body frame, exactly touching
 * the hull, and apply an impulse along the contact normal if the hull point is closing on the
 * object. The object is treated as immovable (far heavier than the ship).
 */
function resolveContact(
  w: Work,
  ctx: Ctx,
  inp: Prepared,
  sinks: Sinks,
  o: number,
  pcx: number,
  pcy: number,
  cB: number,
  sB: number,
  p1x: number,
  p1y: number,
  ovx: number,
  ovy: number,
  t: number,
  impact: boolean,
): void {
  const { comx, comy, hull, nh, mass, inertia } = inp;
  const r = o < w.nb ? w.bR[o]! : w.aR[o - w.nb]!;
  pointPolygon(pcx, pcy, hull, nh, geo);
  const qx = geo.qx;
  const qy = geo.qy;
  let nbx = pcx - qx;
  let nby = pcy - qy;
  let len = Math.hypot(nbx, nby);
  if (len === 0) {
    nbx = pcx - comx;
    nby = pcy - comy;
    len = Math.hypot(nbx, nby);
  }
  if (len === 0) {
    nbx = 1;
    nby = 0;
    len = 1;
  }
  const sign = geo.distance < 0 ? -1 : 1; // centre inside the hull: push it back out
  nbx = (sign * nbx) / len;
  nby = (sign * nby) / len;
  // Object centre exactly r from the contact point.
  const ocx = qx + nbx * r - comx;
  const ocy = qy + nby * r - comy;
  w.sx = p1x - (cB * ocx - sB * ocy);
  w.sy = p1y - (sB * ocx + cB * ocy);

  const nx = cB * nbx - sB * nby;
  const ny = sB * nbx + cB * nby;
  const rbx = qx - comx;
  const rby = qy - comy;
  const rx = cB * rbx - sB * rby;
  const ry = sB * rbx + cB * rby;
  const ux = w.svx - w.om * ry - ovx;
  const uy = w.svy + w.om * rx - ovy;
  const un = ux * nx + uy * ny;
  let j = 0;
  if (un > 0) {
    const rn = rx * ny - ry * nx;
    j = ((1 + ctx.restitution) * un) / (1 / mass + (rn * rn) / inertia);
    w.svx -= (j / mass) * nx;
    w.svy -= (j / mass) * ny;
    w.om -= (j / inertia) * rn;
    // The accelerometer feels the impulse, spread over the step.
    w.sfx -= ((j / mass) * nbx) / ctx.dt;
    w.sfy -= ((j / mass) * nby) / ctx.dt;
  }
  const relativeSpeed = Math.hypot(ux, uy);
  const id = w.objectId(o);
  const point = { x: qx, y: qy };
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
      normal: { x: nbx, y: nby },
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
    specificForce: { x: 0, y: 0 },
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
