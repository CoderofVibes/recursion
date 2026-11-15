/**
 * BELIEF side (no truth imports). The navigator, and a stand-in for the predictive model.
 *
 * It is a navigator and a forecaster, not an estimator. It tracks the ship in three dimensions
 * with a small extended Kalman filter on the recorded azimuth, elevation and range fixes to the
 * primary body, keeps the attitude from the star trackers and gyros, follows thrust from the
 * executed commands, tracks every briefed asteroid the camera has ranged, and forecasts a plan
 * by propagating all of that under the believed law. Its parameters stay at their briefing
 * priors: it learns nothing, fits no extension and validates nothing. That is the model's work
 * (src/model); beside the model this gives the believed world each frame, and alone it lets
 * the loop, the seams and an encounter be exercised without the model.
 *
 * Frame: the filter works relative to the primary (first briefed body). What it reports is in
 * the briefing's believed inertial frame, built the way the model's forecasts are (src/model
 * forecast.ts): the two bodies' barycentre moves uniformly from its believed arrival state.
 *
 * Simplifications [ASSUMED]:
 * - The secondary's pull on the primary is included as a differential term (1B §4). The
 *   covariance of the ship is propagated with the primary's tide only.
 * - Unmodelled acceleration is white noise that grows away from the reference radius, which
 *   also widens the forecast envelope there. The forecast ends at the P10 horizon.
 * - Planned turns are complete at once: a planned burn starts at its commanded attitude.
 * - Thrust acts along the nominal mount direction carried by the attitude; the main engine's
 *   gimbal (about 1° through the centre of mass) is inside the 5% thrust doubt.
 * - A forecast takes the hands-on controls as released at its epoch.
 */

import type {
  AsteroidForecastNote,
  AttitudeTarget,
  BelievedAsteroid,
  BelievedBody,
  BelievedShip,
  BelievedWorld,
  ClosestApproach,
  Command,
  Cov3,
  EncounterBriefing,
  EquipmentSpec,
  EquipmentStatus,
  ForecastDraft,
  ForecastObjectTrack,
  ForecastSample,
  ForecastSigmaBySource,
  HandsOnInput,
  MassProperties,
  ModelState,
  ParameterEstimate,
  Seconds,
  ShipDefinition,
  ShipEstimate,
  TelemetryReading,
  ThrustTick,
} from '../../contracts/index.ts';
import { covEllipsoid, hullReach } from '../../contracts/index.ts';
import {
  fromAxisAngle,
  fromRotationVector,
  integrateBodyRate,
  multiply,
  rotate,
  type Quat,
} from '../../lib/quat.ts';
import { addSym3, fromPrincipal, pointInertia, principalAxes, type Sym3 } from '../../lib/sym3.ts';
import { wrapAngle } from '../../lib/vec2.ts';
import { fromAzEl, type Vec3 } from '../../lib/vec3.ts';
import type {
  AttemptStartInfo,
  ForecastRequest,
  HandsOnThrust,
  HandsOnTurn,
  ModelPort,
  RecordBatch,
} from './ports.ts';
import { resolveAttitude } from './resolve.ts';

const G0 = 9.80665;
/** [ASSUMED] Forecast ends where the 1-sigma envelope exceeds this fraction of the distance to the nearest body (P10). */
const HORIZON_FRACTION = 0.1;
const FORECAST_STEP = 10;
const FORECAST_SAMPLE_INTERVAL = 120;
/** [ASSUMED] Correlation time of the unmodelled acceleration, s. */
const NOISE_CORRELATION_TIME = 600;
const THRUST_CORRELATION_TIME = 10;
/** [ASSUMED] One-sigma doubt about the arrival calibration of the primary pull. */
const ARRIVAL_SCALE_SIGMA = 0.03;
/** [ASSUMED] Exponent error the unvalidated law is allowed (compare the 1G hedge, 0.3). */
const LAW_DOUBT = 0.5;
/** Exponent error allowed once the player has adopted the distance law. */
const ADOPTED_LAW_DOUBT = 0.02;
/** [ASSUMED] An object counts as tracked while its last fix is younger than this, s. */
export const TRACK_STALE = 120;
/**
 * [ASSUMED] One-sigma doubt about a surveyed asteroid's velocity, m/s. The briefing gives a
 * position uncertainty only; this is how fast that grows until the camera ranges the rock.
 */
const ASTEROID_VELOCITY_SIGMA = 1;
/** Longest step of an asteroid's believed motion, s. */
const ASTEROID_STEP = 30;
/**
 * [ASSUMED] Gyro rates below this are noise and bias, rad/s (ten times the gyros' noise): the
 * attitude is carried between star-tracker fixes only at rates above it.
 */
const TURNING_RATE = 1e-4;

/** Planned commands that start or stop thrust: a forecast step ends exactly where one begins. */
const THRUST_COMMANDS: ReadonlySet<Command['kind']> = new Set(['burn', 'cutoff', 'fly']);

const UNIT_X: Vec3 = { x: 1, y: 0, z: 0 };
const UNIT_Z: Vec3 = { x: 0, y: 0, z: 1 };
const MINUS_Y: Vec3 = { x: 0, y: -1, z: 0 };

/** Filter state size: position, velocity (three components each) and the local gravity scale. */
const N = 7;
/** Asteroid state size: position and velocity. */
const M = 6;
type Mat = number[]; // row-major, square
type Triple = [number, number, number];

interface Nav {
  t: number;
  /**
   * [px, py, pz, vx, vy, vz, g]: position and velocity relative to the primary, and g, the
   * measured strength of the primary pull relative to the believed law right here (1 = the
   * law holds).
   */
  x: number[];
  p: Mat;
}

/** Position and velocity, relative to the primary unless said otherwise. */
interface Particle {
  position: Vec3;
  velocity: Vec3;
}

/** A believed asteroid: its state relative to the primary, and its own small filter once ranged. */
interface Rock {
  readonly known: BelievedAsteroid;
  /** [px, py, pz, vx, vy, vz] relative to the primary. */
  x: number[];
  /** 6×6 covariance, kept from the first fix on. Before that the survey's grows by drift. */
  p?: Mat;
  fixes: number;
  lastSeen?: number;
}

interface Burn {
  readonly thruster: string;
  readonly start: number;
  readonly end: number;
  readonly throttle: number;
  /** Inertial attitude the burn commanded, if it commanded one. */
  readonly attitude?: Quat;
}

/** Thrust flown by hand: the thrusters the controls fire, from `start` until the next input. */
interface Flown {
  readonly start: number;
  readonly end: number;
  readonly thrust: readonly ThrustTick[];
  /** Net force on the ship, body frame, N (with the believed thrust scales). */
  readonly force: Vec3;
}

export interface StandInModelOptions {
  /** Shared reference radius of the believed law (P4). */
  readonly referenceRadius: number;
}

export interface StandInModel extends ModelPort {
  /** Stand-in only: overwrite a parameter value, e.g. `law.gravity.exponent`, for seam tests. */
  setParameter(id: string, value: number): void;
  /**
   * Take the law in force from a model state: body GMs, and the exponent while the
   * `distance-law` rule is adopted. Used when this runs as the navigator beside the real model.
   */
  adopt(state: ModelState): void;
}

const diagonal = (diag: readonly number[]): Mat => {
  const n = diag.length;
  const m = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++) m[i * (n + 1)] = diag[i]!;
  return m;
};

/** The symmetric 3×3 block of an n×n covariance starting at state index `offset`, as a Cov3. */
const block3 = (p: Mat, n: number, offset: number): Cov3 => [
  p[offset * n + offset]!,
  p[offset * n + offset + 1]!,
  p[offset * n + offset + 2]!,
  p[(offset + 1) * n + offset + 1]!,
  p[(offset + 1) * n + offset + 2]!,
  p[(offset + 2) * n + offset + 2]!,
];

/** Largest one-sigma axis of a position covariance, m. */
const majorSigma = (cov: Cov3): number => covEllipsoid(cov).radii[0];

const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export function createStandInModel(options: StandInModelOptions): StandInModel {
  const r0 = options.referenceRadius;
  let briefing: EncounterBriefing | undefined;
  let ship: ShipDefinition | undefined;
  let handsOnThrust: HandsOnThrust | undefined;
  let handsOnTurn: HandsOnTurn | undefined;
  /**
   * When the controls last changed the turn. A gyro reading taken at that instant describes
   * the ship before the controls took effect, so it does not replace the turn they ask for.
   */
  let turnChangedAt = -Infinity;
  let version = 1;
  const parameters = new Map<string, number>();
  const attemptsSeen: string[] = [];
  let measurementCount = 0;
  const support: { min: number; max: number } = { min: Infinity, max: -Infinity };

  // Per-attempt belief.
  let nav: Nav = { t: 0, x: [0, 0, 0, 0, 0, 0, 1], p: diagonal([1, 1, 1, 1, 1, 1, 1]) };
  let secondary: (Particle & { id: string; fixT: number; tracked: boolean }) | undefined;
  let rocks: Rock[] = [];
  /** How far the asteroids have been moved, and where the secondary was then. */
  let rockClock: { t: number; secondary?: Particle } = { t: 0 };
  let arrivalT = 0;
  /** The last star-tracker fix, carried forward by the gyros: `q` is the attitude at `t`. */
  let attitude: { q: Quat; t: number; sigma: number; rate: Vec3 } = {
    q: { w: 1, x: 0, y: 0, z: 0 },
    t: 0,
    sigma: 1e-3,
    rate: { x: 0, y: 0, z: 0 },
  };
  let configuration = '';
  let telemetry: Record<string, TelemetryReading> = {};
  let modes: Record<string, string> = {};
  let burns: Burn[] = [];
  let flown: Flown[] = [];
  let primaryFixT: number | undefined;
  let arrivalMass: number | undefined;
  // Snapshots outnumber recorded equipment/tank changes. These immutable derived values
  // depend only on the briefing, accepted configuration/mode commands and telemetry below;
  // the navigation state, measurement order and all arithmetic remain unchanged (PF).
  let cachedMassProperties: MassProperties | undefined;
  let cachedEquipment: Record<string, EquipmentStatus> | undefined;

  const param = (id: string, fallback: number): number => parameters.get(id) ?? fallback;
  const exponent = (): number => param('law.gravity.exponent', 2);
  const primary = (): BelievedBody => briefing!.knownBodies[0]!;
  const mu = (bodyId: string): number => param(`body.${bodyId}.mu`, 0);
  const lawDoubt = (): number =>
    parameters.has('law.gravity.exponent') ? ADOPTED_LAW_DOUBT : LAW_DOUBT;

  /** Pull of a body at displacement d (body minus point), believed law. */
  const pull = (gm: number, dx: number, dy: number, dz: number): Triple => {
    const r = Math.hypot(dx, dy, dz);
    if (r === 0) return [0, 0, 0];
    const s = ((gm / (r0 * r0)) * Math.pow(r0 / r, exponent())) / r;
    return [dx * s, dy * s, dz * s];
  };

  /**
   * Gravity on a test particle at p (relative to the primary), with the secondary at s.
   * `scale` multiplies the primary pull (the locally measured strength).
   */
  const gravity = (px: number, py: number, pz: number, s: Vec3 | undefined, scale = 1): Triple => {
    const p = primary();
    const a = pull(mu(p.id) * scale, -px, -py, -pz);
    if (s && secondary) {
      const gm = mu(secondary.id);
      const onShip = pull(gm, s.x - px, s.y - py, s.z - pz);
      const onPrimary = pull(gm, s.x, s.y, s.z);
      a[0] += onShip[0] - onPrimary[0];
      a[1] += onShip[1] - onPrimary[1];
      a[2] += onShip[2] - onPrimary[2];
    }
    return a;
  };

  /**
   * Tide of a body at displacement d (body minus point): how its pull changes with the point's
   * position, −k (I − (n + 1) û ûᵀ) with k the pull per metre of displacement.
   */
  const tide = (gm: number, dx: number, dy: number, dz: number): Sym3 => {
    const r = Math.hypot(dx, dy, dz);
    if (r === 0) return [0, 0, 0, 0, 0, 0];
    const k = ((gm / (r0 * r0)) * Math.pow(r0 / r, exponent())) / r;
    const e = exponent() + 1;
    const ux = dx / r;
    const uy = dy / r;
    const uz = dz / r;
    return [
      -k * (1 - e * ux * ux),
      k * e * ux * uy,
      k * e * ux * uz,
      -k * (1 - e * uy * uy),
      k * e * uy * uz,
      -k * (1 - e * uz * uz),
    ];
  };

  const dryMass = (): number =>
    ship!.structureMass + ship!.equipment.reduce((total, e) => total + e.mass, 0);
  const gauged = (tank: string): number =>
    telemetry[`${tank}.propellant`]?.value ?? ship!.tanks.find((t) => t.id === tank)?.capacity ?? 0;
  /** True until a tank gauge has been recorded; until then the loading record's mass is used. */
  const ungauged = (): boolean =>
    arrivalMass !== undefined && !ship!.tanks.some((t) => telemetry[`${t.id}.propellant`]);

  /**
   * Mass properties from the nominal design and gauged tanks: every item a point mass at its
   * designed position in the configuration in force, plus the structure's own inertia and each
   * assembly's intrinsic inertia where the design states one.
   */
  const massProperties = (): MassProperties => {
    if (cachedMassProperties) return cachedMassProperties;
    const def = ship!;
    const config = def.configurations.find((c) => c.id === configuration) ?? def.configurations[0]!;
    const items: { m: number; p: Vec3 }[] = [
      { m: def.structureMass, p: def.structureCenterOfMass },
      ...def.equipment.map((e) => ({
        m: e.mass,
        p: config.equipmentPositions?.[e.id] ?? e.position,
      })),
      ...def.tanks.map((t) => ({ m: gauged(t.id), p: t.position })),
    ];
    const mass = items.reduce((total, i) => total + i.m, 0);
    const cx = items.reduce((total, i) => total + i.m * i.p.x, 0) / mass;
    const cy = items.reduce((total, i) => total + i.m * i.p.y, 0) / mass;
    const cz = items.reduce((total, i) => total + i.m * i.p.z, 0) / mass;
    let tensor: Sym3 = fromPrincipal(def.structureInertia.moments, def.structureInertia.axes);
    for (const i of items)
      tensor = addSym3(tensor, pointInertia(i.m, { x: i.p.x - cx, y: i.p.y - cy, z: i.p.z - cz }));
    for (const e of def.equipment) {
      const rated = (name: string): number =>
        config.paramOverrides?.[`${e.id}.${name}`] ?? e.params[name] ?? 0;
      // Roll, pitch and yaw moments about the assembly's own centre (1C: `intrinsicInertia` is yaw).
      tensor = addSym3(tensor, [
        rated('intrinsicInertiaRoll'),
        0,
        0,
        rated('intrinsicInertiaPitch'),
        0,
        rated('intrinsicInertia'),
      ]);
    }
    const principal = principalAxes(tensor);
    return (cachedMassProperties = {
      mass: ungauged() ? arrivalMass! : mass,
      centerOfMass: { x: cx, y: cy, z: cz },
      inertia: { moments: principal.values, axes: principal.axes },
      hull: config.hull,
    });
  };
  const believedMass = (): number =>
    ungauged()
      ? arrivalMass!
      : dryMass() + ship!.tanks.reduce((total, t) => total + gauged(t.id), 0);

  /** The believed attitude at time t: the last fix, carried at the gyro rate while turning. */
  const attitudeAt = (t: number): Quat => {
    const w = attitude.rate;
    if (Math.hypot(w.x, w.y, w.z) < TURNING_RATE) return attitude.q;
    const dt = Math.max(-TRACK_STALE, Math.min(TRACK_STALE, t - attitude.t));
    return dt === 0 ? attitude.q : integrateBodyRate(attitude.q, w, dt);
  };

  /** Unit direction of a thruster's push in the body frame, with its believed mount errors. */
  const pushDirection = (spec: EquipmentSpec | undefined, id: string, nominal?: Vec3): Vec3 => {
    const direction = nominal ?? spec?.mount?.direction ?? UNIT_X;
    const yaw = param(`thruster.${id}.misalignment`, 0);
    const pitch = param(`thruster.${id}.misalignment-pitch`, 0);
    if (yaw === 0 && pitch === 0) return direction;
    // About body +z (toward +y), then about body −y (toward +z), as the ship applies them.
    return rotate(multiply(fromAxisAngle(UNIT_Z, yaw), fromAxisAngle(MINUS_Y, pitch)), direction);
  };

  /** The thrusters a hands-on input fires, as designed, without the turn demands. */
  const thrustFlown = (input: HandsOnInput): readonly ThrustTick[] => {
    const steady: HandsOnInput = { ...input, yaw: 0, pitch: 0 };
    if (handsOnThrust) return handsOnThrust(steady, massProperties());
    // Without the design's own answer: the main engine at its throttle, nothing for the jets.
    const engine = ship!.equipment.find((e) => e.kind === 'main-engine' && e.mount);
    if (!engine?.mount || !(input.throttle > 0)) return [];
    return [
      {
        source: engine.id,
        point: engine.mount.position,
        direction: engine.mount.direction,
        magnitude: Math.min(1, input.throttle) * (engine.params.thrust ?? 0),
      },
    ];
  };

  /** Net body-frame force of a set of firings, with the believed thrust scales and mount errors. */
  const netForce = (thrust: readonly ThrustTick[]): Vec3 => {
    let fx = 0;
    let fy = 0;
    let fz = 0;
    for (const tick of thrust) {
      const spec = ship!.equipment.find((e) => e.id === tick.source);
      const group = spec?.kind === 'rcs-thruster' ? param('thruster.rcs.scale', 1) : 1;
      const force = tick.magnitude * group * param(`thruster.${tick.source}.scale`, 1);
      const direction = pushDirection(spec, tick.source, tick.direction);
      fx += force * direction.x;
      fy += force * direction.y;
      fz += force * direction.z;
    }
    return { x: fx, y: fy, z: fz };
  };

  /**
   * Commanded thrust acceleration (inertial) during a step that starts at time t, from the
   * given burns and hands-on thrust. `facing` is the attitude of whatever follows the ship's
   * own: a burn that commanded an attitude uses that one.
   */
  const thrustAt = (
    t: number,
    mass: number,
    active: readonly Burn[],
    held: readonly Flown[],
    facing: Quat,
  ): Triple => {
    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const b of active) {
      if (t < b.start || t >= b.end) continue;
      const spec = ship!.equipment.find((e) => e.id === b.thruster);
      const force =
        (spec?.params.thrust ?? 0) * b.throttle * param(`thruster.${b.thruster}.scale`, 1);
      const direction = rotate(b.attitude ?? facing, pushDirection(spec, b.thruster));
      ax += (force / mass) * direction.x;
      ay += (force / mass) * direction.y;
      az += (force / mass) * direction.z;
    }
    for (const f of held) {
      if (t < f.start || t >= f.end) continue;
      const force = rotate(facing, f.force);
      ax += force.x / mass;
      ay += force.y / mass;
      az += force.z / mass;
    }
    return [ax, ay, az];
  };

  /** True when some thrust in force at t points wherever the ship does (no commanded attitude). */
  const followsAttitude = (t: number, active: readonly Burn[], held: readonly Flown[]): boolean =>
    held.some((f) => t >= f.start && t < f.end) ||
    active.some((b) => t >= b.start && t < b.end && !b.attitude);

  /**
   * Spectral density of unmodelled acceleration, m²/s³: 0.5% of the primary's pull with a long
   * correlation time, plus a share of any commanded thrust with a short one: 5% (so a burn's
   * speed change is uncertain by a few percent, the engine prior), and more while the thrust
   * follows an attitude that is turning between fixes (`pointing`, rad).
   */
  const unmodelled = (r: number, thrust: number, pointing = 0): number => {
    const g = (mu(primary().id) / (r0 * r0)) * Math.pow(r0 / r, exponent());
    return (
      (0.005 * g) ** 2 * NOISE_CORRELATION_TIME +
      ((0.05 + pointing) * thrust) ** 2 * THRUST_CORRELATION_TIME
    );
  };
  /**
   * How fast the local gravity scale may drift, per second: with an unvalidated law it can
   * change like an exponent error of LAW_DOUBT as the distance changes; an adopted law is trusted.
   */
  const scaleDrift = (r: number, radialSpeed: number): number =>
    lawDoubt() * (Math.abs(radialSpeed) / r) + 1e-7;

  /** The secondary moves about the primary under their mutual pull (relative two-body). */
  const stepSecondary = (q: Particle, dt: number): void => {
    const total = mu(primary().id) + (secondary ? mu(secondary.id) : 0);
    const kick = (): Triple => pull(total, -q.position.x, -q.position.y, -q.position.z);
    const [ax, ay, az] = kick();
    const vx = q.velocity.x + 0.5 * dt * ax;
    const vy = q.velocity.y + 0.5 * dt * ay;
    const vz = q.velocity.z + 0.5 * dt * az;
    q.position = {
      x: q.position.x + dt * vx,
      y: q.position.y + dt * vy,
      z: q.position.z + dt * vz,
    };
    const [bx, by, bz] = kick();
    q.velocity = { x: vx + 0.5 * dt * bx, y: vy + 0.5 * dt * by, z: vz + 0.5 * dt * bz };
  };

  /**
   * One filter prediction step of the ship state and covariance over dt, under the given
   * thrust acceleration; `pointing` is the doubt about where that thrust points, rad.
   */
  const predict = (n: Nav, dt: number, s: Vec3 | undefined, thrust: Triple, pointing = 0): void => {
    const [px, py, pz, vx, vy, vz, g] = n.x as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const [tx, ty, tz] = thrust;
    const [gx, gy, gz] = gravity(px, py, pz, s, g);
    const hx = vx + 0.5 * dt * (gx + tx);
    const hy = vy + 0.5 * dt * (gy + ty);
    const hz = vz + 0.5 * dt * (gz + tz);
    const nx = px + dt * hx;
    const ny = py + dt * hy;
    const nz = pz + dt * hz;
    const [g2x, g2y, g2z] = gravity(nx, ny, nz, s, g);
    n.x = [
      nx,
      ny,
      nz,
      hx + 0.5 * dt * (g2x + tx),
      hy + 0.5 * dt * (g2y + ty),
      hz + 0.5 * dt * (g2z + tz),
      g,
    ];

    // Covariance: F = I + dt·A, with the primary gravity gradient G and its unscaled pull a0
    // (the sensitivity of the acceleration to the local scale g).
    const r = Math.hypot(px, py, pz);
    const k0 = ((mu(primary().id) / (r0 * r0)) * Math.pow(r0 / r, exponent())) / r;
    const k = g * k0;
    const e = exponent() + 1;
    const ux = px / r;
    const uy = py / r;
    const uz = pz / r;
    const gxx = -k * (1 - e * ux * ux);
    const gxy = k * e * ux * uy;
    const gxz = k * e * ux * uz;
    const gyy = -k * (1 - e * uy * uy);
    const gyz = k * e * uy * uz;
    const gzz = -k * (1 - e * uz * uz);
    // prettier-ignore
    const f: Mat = [
      1, 0, 0, dt, 0, 0, 0,
      0, 1, 0, 0, dt, 0, 0,
      0, 0, 1, 0, 0, dt, 0,
      dt * gxx, dt * gxy, dt * gxz, 1, 0, 0, -dt * k0 * px,
      dt * gxy, dt * gyy, dt * gyz, 0, 1, 0, -dt * k0 * py,
      dt * gxz, dt * gyz, dt * gzz, 0, 0, 1, -dt * k0 * pz,
      0, 0, 0, 0, 0, 0, 1,
    ];
    const next = mulT(mul(f, n.p, N), f, N);
    // White unmodelled acceleration: spectral density S = sigma² · correlation time.
    const density = unmodelled(r, Math.hypot(tx, ty, tz), pointing);
    const qp = (density * dt ** 3) / 3;
    const qc = (density * dt * dt) / 2;
    const qv = density * dt;
    const add = (i: number, j: number, v: number): void => {
      next[i * N + j] = next[i * N + j]! + v;
    };
    for (let i = 0; i < 3; i++) {
      add(i, i, qp);
      add(i, i + 3, qc);
      add(i + 3, i, qc);
      add(i + 3, i + 3, qv);
    }
    const radialSpeed = (px * vx + py * vy + pz * vz) / r;
    add(6, 6, scaleDrift(r, radialSpeed) ** 2 * dt * NOISE_CORRELATION_TIME);
    n.p = next;
    n.t += dt;
  };

  /** End of a step from `from` toward `to` that stops at the next start or end of thrust. */
  const stepTo = (
    from: number,
    to: number,
    active: readonly Burn[],
    held: readonly Flown[],
  ): number => {
    let end = to;
    for (const b of [...active, ...held]) {
      if (b.start > from + 1e-9 && b.start < end) end = b.start;
      if (b.end > from + 1e-9 && b.end < end) end = b.end;
    }
    return end;
  };

  /**
   * Kick, drift, kick of an asteroid's state over dt, with the secondary at s0 when the step
   * starts and at s1 when it ends.
   */
  const stepRock = (x: number[], dt: number, s0: Vec3 | undefined, s1: Vec3 | undefined): void => {
    const [ax, ay, az] = gravity(x[0]!, x[1]!, x[2]!, s0);
    const vx = x[3]! + 0.5 * dt * ax;
    const vy = x[4]! + 0.5 * dt * ay;
    const vz = x[5]! + 0.5 * dt * az;
    x[0] = x[0]! + dt * vx;
    x[1] = x[1]! + dt * vy;
    x[2] = x[2]! + dt * vz;
    const [bx, by, bz] = gravity(x[0], x[1], x[2], s1);
    x[3] = vx + 0.5 * dt * bx;
    x[4] = vy + 0.5 * dt * by;
    x[5] = vz + 0.5 * dt * bz;
  };

  /**
   * An asteroid's covariance over dt, linearised about where it is: both bodies' tides, plus
   * white unmodelled acceleration of 0.5% of each body's pull and of what an exponent error of
   * the law's doubt would change at that distance.
   */
  const spreadRock = (x: readonly number[], p: Mat, dt: number, s: Vec3 | undefined): Mat => {
    const gmA = mu(primary().id);
    let g = tide(gmA, -x[0]!, -x[1]!, -x[2]!);
    const doubt = lawDoubt();
    const share = (gm: number, r: number): number =>
      r > 0
        ? (0.005 + doubt * Math.abs(Math.log(r0 / r))) *
          (gm / (r0 * r0)) *
          Math.pow(r0 / r, exponent())
        : 0;
    let noise = share(gmA, Math.hypot(x[0]!, x[1]!, x[2]!)) ** 2;
    if (s && secondary) {
      const gmB = mu(secondary.id);
      const dx = s.x - x[0]!;
      const dy = s.y - x[1]!;
      const dz = s.z - x[2]!;
      g = addSym3(g, tide(gmB, dx, dy, dz));
      noise += share(gmB, Math.hypot(dx, dy, dz)) ** 2;
    }
    // prettier-ignore
    const f: Mat = [
      1, 0, 0, dt, 0, 0,
      0, 1, 0, 0, dt, 0,
      0, 0, 1, 0, 0, dt,
      dt * g[0], dt * g[1], dt * g[2], 1, 0, 0,
      dt * g[1], dt * g[3], dt * g[4], 0, 1, 0,
      dt * g[2], dt * g[4], dt * g[5], 0, 0, 1,
    ];
    const next = mulT(mul(f, p, M), f, M);
    const density = noise * NOISE_CORRELATION_TIME;
    for (let i = 0; i < 3; i++) {
      next[i * M + i] = next[i * M + i]! + (density * dt ** 3) / 3;
      next[i * M + i + 3] = next[i * M + i + 3]! + (density * dt * dt) / 2;
      next[(i + 3) * M + i] = next[(i + 3) * M + i]! + (density * dt * dt) / 2;
      next[(i + 3) * M + i + 3] = next[(i + 3) * M + i + 3]! + density * dt;
    }
    return next;
  };

  /** A surveyed asteroid's position covariance at time t, before the camera has ranged it. */
  const surveyed = (rock: Rock, t: number): Cov3 => {
    const c = rock.known.positionCov;
    const drift = (ASTEROID_VELOCITY_SIGMA * (t - arrivalT)) ** 2;
    return [c[0] + drift, c[1], c[2], c[3] + drift, c[4], c[5] + drift];
  };

  /** Move every asteroid to time t, in step with the secondary's own motion. */
  const advanceRocks = (t: number): void => {
    while (rockClock.t < t - 1e-9) {
      const dt = Math.min(ASTEROID_STEP, t - rockClock.t);
      const s0 = rockClock.secondary?.position;
      if (rockClock.secondary) stepSecondary(rockClock.secondary, dt);
      const s1 = rockClock.secondary?.position;
      for (const rock of rocks) {
        if (rock.p) rock.p = spreadRock(rock.x, rock.p, dt, s0);
        stepRock(rock.x, dt, s0, s1);
      }
      rockClock.t += dt;
    }
  };

  /** Advance the ship and the secondary to time t (mutates). */
  const advanceShip = (t: number): void => {
    const mass = believedMass();
    while (nav.t < t - 1e-9) {
      const dt = stepTo(nav.t, Math.min(nav.t + 5, t), burns, flown) - nav.t;
      const steered = followsAttitude(nav.t, burns, flown);
      const thrust = thrustAt(nav.t, mass, burns, flown, attitudeAt(nav.t + 0.5 * dt));
      // Thrust that follows a turning ship points where the gyros last said, give or take the
      // turn made since the last attitude fix.
      const w = attitude.rate;
      const rate = Math.hypot(w.x, w.y, w.z);
      const pointing =
        steered && rate >= TURNING_RATE
          ? Math.min(1, rate * Math.min(TRACK_STALE, Math.abs(nav.t - attitude.t)))
          : 0;
      if (secondary) stepSecondary(secondary, dt);
      predict(nav, dt, secondary?.position, thrust, pointing);
    }
  };

  /** Advance every believed object to time t (mutates). */
  const advanceTo = (t: number): void => {
    advanceShip(t);
    advanceRocks(t);
    // The asteroids keep their own copy of the secondary between calls; bring it back in line.
    if (secondary && Math.abs(rockClock.t - nav.t) < 1e-9)
      rockClock.secondary = { position: secondary.position, velocity: secondary.velocity };
  };

  /** Scalar Kalman update of the ship's filter with measurement row h. */
  const update = (h: readonly number[], innovation: number, sigma: number): void => {
    const ph: number[] = [];
    for (let i = 0; i < N; i++) {
      let total = 0;
      for (let j = 0; j < N; j++) total += nav.p[i * N + j]! * h[j]!;
      ph.push(total);
    }
    const s = h.reduce((total, hi, i) => total + hi * ph[i]!, 0) + sigma * sigma;
    const gain = ph.map((v) => v / s);
    nav.x = nav.x.map((v, i) => v + gain[i]! * innovation);
    const next = nav.p.slice();
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) next[i * N + j] = next[i * N + j]! - gain[i]! * ph[j]!;
    nav.p = next;
  };

  /**
   * A camera fix on an asteroid: where the ship believes it is, plus the measured line of
   * sight and range, taken into that asteroid's position and velocity.
   */
  const fixRock = (
    rock: Rock,
    t: number,
    bearing: { azimuth: number; elevation: number; sigmaAzimuth: number; sigmaElevation: number },
    range: number,
    sigmaRange: number,
  ): void => {
    if (!rock.p) {
      // The survey's position doubt, grown by the doubt about the velocity since arrival.
      const tau = t - arrivalT;
      const v2 = ASTEROID_VELOCITY_SIGMA ** 2;
      const c = surveyed(rock, t);
      // prettier-ignore
      rock.p = [
        c[0], c[1], c[2], v2 * tau, 0, 0,
        c[1], c[3], c[4], 0, v2 * tau, 0,
        c[2], c[4], c[5], 0, 0, v2 * tau,
        v2 * tau, 0, 0, v2, 0, 0,
        0, v2 * tau, 0, 0, v2, 0,
        0, 0, v2 * tau, 0, 0, v2,
      ];
    }
    const p = rock.p;
    const line = fromAzEl(bearing.azimuth, bearing.elevation);
    const ca = Math.cos(bearing.azimuth);
    const sa = Math.sin(bearing.azimuth);
    const ce = Math.cos(bearing.elevation);
    const se = Math.sin(bearing.elevation);
    // The fix's error: the range along the line of sight, the two angles across it (the
    // azimuth's sigma already carries 1 / cos(elevation)), and the ship's own position doubt.
    const axes: readonly (readonly [Vec3, number])[] = [
      [line, sigmaRange],
      [{ x: -sa, y: ca, z: 0 }, range * ce * bearing.sigmaAzimuth],
      [{ x: -ca * se, y: -sa * se, z: ce }, range * bearing.sigmaElevation],
    ];
    const own = block3(nav.p, N, 0);
    const s: number[] = [
      p[0]! + own[0],
      p[1]! + own[1],
      p[2]! + own[2],
      p[M + 1]! + own[3],
      p[M + 2]! + own[4],
      p[2 * M + 2]! + own[5],
    ];
    for (const [u, sigma] of axes) {
      const v = sigma * sigma;
      s[0] = s[0]! + v * u.x * u.x;
      s[1] = s[1]! + v * u.x * u.y;
      s[2] = s[2]! + v * u.x * u.z;
      s[3] = s[3]! + v * u.y * u.y;
      s[4] = s[4]! + v * u.y * u.z;
      s[5] = s[5]! + v * u.z * u.z;
    }
    const inverse = invert3(s as unknown as Sym3);
    if (!inverse) return;
    const innovation = [
      nav.x[0]! + range * line.x - rock.x[0]!,
      nav.x[1]! + range * line.y - rock.x[1]!,
      nav.x[2]! + range * line.z - rock.x[2]!,
    ];
    // Gain K = P Hᵀ S⁻¹ with H = [I 0]: the first three columns of P times S⁻¹.
    const si = [
      [inverse[0], inverse[1], inverse[2]],
      [inverse[1], inverse[3], inverse[4]],
      [inverse[2], inverse[4], inverse[5]],
    ];
    const gain: number[][] = [];
    for (let i = 0; i < M; i++) {
      const row: number[] = [];
      for (let j = 0; j < 3; j++)
        row.push(p[i * M]! * si[0]![j]! + p[i * M + 1]! * si[1]![j]! + p[i * M + 2]! * si[2]![j]!);
      gain.push(row);
    }
    for (let i = 0; i < M; i++)
      rock.x[i] =
        rock.x[i]! +
        gain[i]![0]! * innovation[0]! +
        gain[i]![1]! * innovation[1]! +
        gain[i]![2]! * innovation[2]!;
    const next = p.slice();
    for (let i = 0; i < M; i++)
      for (let j = 0; j < M; j++)
        next[i * M + j] =
          next[i * M + j]! -
          (gain[i]![0]! * p[j]! + gain[i]![1]! * p[M + j]! + gain[i]![2]! * p[2 * M + j]!);
    rock.p = next;
    rock.fixes += 1;
    rock.lastSeen = t;
  };

  /**
   * The primary's state in the briefing's inertial frame at time t, given the secondary's state
   * relative to it: the barycentre moves uniformly from its believed arrival state.
   */
  const primaryInertial = (t: number, s: Particle | undefined): Particle => {
    const p = primary();
    const second = briefing!.knownBodies[1];
    const mp = Math.max(mu(p.id), 0);
    const ms = s && second ? Math.max(mu(second.id), 0) : 0;
    if (!s || !second || mp + ms <= 0 || ms === 0)
      return {
        position: {
          x: p.position.x + p.velocity.x * t,
          y: p.position.y + p.velocity.y * t,
          z: p.position.z + p.velocity.z * t,
        },
        velocity: p.velocity,
      };
    const f = ms / (mp + ms);
    // Barycentre at arrival: the primary's briefed state plus f × the secondary's offset from it.
    const bx = p.position.x + f * (second.position.x - p.position.x);
    const by = p.position.y + f * (second.position.y - p.position.y);
    const bz = p.position.z + f * (second.position.z - p.position.z);
    const bvx = p.velocity.x + f * (second.velocity.x - p.velocity.x);
    const bvy = p.velocity.y + f * (second.velocity.y - p.velocity.y);
    const bvz = p.velocity.z + f * (second.velocity.z - p.velocity.z);
    return {
      position: {
        x: bx + bvx * t - f * s.position.x,
        y: by + bvy * t - f * s.position.y,
        z: bz + bvz * t - f * s.position.z,
      },
      velocity: {
        x: bvx - f * s.velocity.x,
        y: bvy - f * s.velocity.y,
        z: bvz - f * s.velocity.z,
      },
    };
  };
  const offset = (origin: Particle, relative: Particle): Particle => ({
    position: add3(origin.position, relative.position),
    velocity: add3(origin.velocity, relative.velocity),
  });
  const shipOf = (n: Nav): Particle => ({
    position: { x: n.x[0]!, y: n.x[1]!, z: n.x[2]! },
    velocity: { x: n.x[3]!, y: n.x[4]!, z: n.x[5]! },
  });
  const rockOf = (x: readonly number[]): Particle => ({
    position: { x: x[0]!, y: x[1]!, z: x[2]! },
    velocity: { x: x[3]!, y: x[4]!, z: x[5]! },
  });

  const estimate = (n: Nav, origin: Particle): ShipEstimate => ({
    t: n.t,
    ...offset(origin, shipOf(n)),
    positionCov: block3(n.p, N, 0),
    velocityCov: block3(n.p, N, 3),
    attitude: attitudeAt(n.t),
    attitudeSigma: attitude.sigma,
    angularVelocity: attitude.rate,
  });

  const equipmentStatus = (): Record<string, EquipmentStatus> =>
    (cachedEquipment ??= Object.fromEntries(
      ship!.equipment.map((e) => [
        e.id,
        {
          id: e.id,
          mode: modes[e.id] ?? e.defaultMode,
          allocation: telemetry[`${e.id}.allocation`]?.value ?? e.ratedPower,
          powerDraw: telemetry[`${e.id}.power`]?.value ?? 0,
          condition: telemetry[`${e.id}.condition`]?.value ?? 1,
          tripped: false,
          faults: [],
          readings: Object.fromEntries(
            ['charge', 'output', 'generated-power']
              .filter((q) => telemetry[`${e.id}.${q}`])
              .map((q) => [q, telemetry[`${e.id}.${q}`]!.value]),
          ),
        } satisfies EquipmentStatus,
      ]),
    ));

  const believedBodies = (t: number, origin: Particle): BelievedBody[] =>
    briefing!.knownBodies.map((b, i) =>
      i === 0 || !secondary || b.id !== secondary.id
        ? {
            ...b,
            ...(i === 0 ? origin : {}),
            tracked: i === 0 && primaryFixT !== undefined && t - primaryFixT < TRACK_STALE,
            lastFix: primaryFixT ?? b.lastFix,
          }
        : {
            ...b,
            ...offset(origin, secondary),
            tracked: secondary.tracked && t - secondary.fixT < TRACK_STALE,
            lastFix: secondary.fixT,
          },
    );

  const believedAsteroids = (t: number, origin: Particle): BelievedAsteroid[] =>
    rocks.map((rock) => ({
      ...rock.known,
      ...offset(origin, rockOf(rock.x)),
      positionCov: rock.p ? block3(rock.p, M, 0) : surveyed(rock, t),
      tracked: rock.lastSeen !== undefined && t - rock.lastSeen < TRACK_STALE,
      ...(rock.lastSeen !== undefined ? { lastSeen: rock.lastSeen } : {}),
    }));

  const model: StandInModel = {
    setParameter(id, value) {
      parameters.set(id, value);
      version += 1;
    },

    adopt(state) {
      for (const parameter of state.parameters)
        if (parameter.id.startsWith('body.') && !parameter.arc)
          parameters.set(parameter.id, parameter.value);
      const ruled = state.extensions.some((e) => e.id === 'distance-law' && e.status === 'adopted');
      const exponentValue = state.parameters.find((q) => q.id === 'law.gravity.exponent')?.value;
      if (ruled && exponentValue !== undefined)
        parameters.set('law.gravity.exponent', exponentValue);
      else parameters.delete('law.gravity.exponent');
      version = state.version;
    },

    beginAttempt(start: AttemptStartInfo) {
      briefing = start.briefing;
      arrivalMass = start.arrivalMass;
      ship = start.ship;
      handsOnThrust = start.handsOnThrust;
      handsOnTurn = start.handsOnTurn;
      if (attemptsSeen.length === 0)
        for (const prior of briefing.priors)
          if (!prior.extension && !parameters.has(prior.id)) parameters.set(prior.id, prior.value);
      attemptsSeen.push(start.attemptId);
      const a = briefing.arrivalEstimate;
      const origin = briefing.knownBodies[0]!;
      const relative = (q: Particle): Particle => ({
        position: sub3(q.position, origin.position),
        velocity: sub3(q.velocity, origin.velocity),
      });
      const arrival = relative(a);
      // The arrival covariances as the briefing gives them: position and velocity each a full
      // 3×3 block, nothing known yet about how they go together.
      const p = diagonal([0, 0, 0, 0, 0, 0, ARRIVAL_SCALE_SIGMA ** 2]);
      const place = (cov: Cov3, at: number): void => {
        const rows = [
          [cov[0], cov[1], cov[2]],
          [cov[1], cov[3], cov[4]],
          [cov[2], cov[4], cov[5]],
        ];
        for (let i = 0; i < 3; i++)
          for (let j = 0; j < 3; j++) p[(at + i) * N + at + j] = rows[i]![j]!;
      };
      place(a.positionCov, 0);
      place(a.velocityCov, 3);
      nav = {
        t: a.t,
        x: [
          arrival.position.x,
          arrival.position.y,
          arrival.position.z,
          arrival.velocity.x,
          arrival.velocity.y,
          arrival.velocity.z,
          1,
        ],
        p,
      };
      arrivalT = a.t;
      const second = briefing.knownBodies[1];
      secondary = second
        ? { id: second.id, ...relative(second), fixT: a.t, tracked: false }
        : undefined;
      rocks = briefing.knownAsteroids.map((known) => {
        const q = relative(known);
        return {
          known,
          x: [q.position.x, q.position.y, q.position.z, q.velocity.x, q.velocity.y, q.velocity.z],
          fixes: 0,
        };
      });
      rockClock = {
        t: a.t,
        ...(secondary
          ? { secondary: { position: secondary.position, velocity: secondary.velocity } }
          : {}),
      };
      attitude = {
        q: a.attitude,
        t: a.t,
        sigma: a.attitudeSigma,
        rate: a.angularVelocity,
      };
      configuration = briefing.arrivalConfiguration;
      telemetry = {};
      modes = {};
      cachedMassProperties = undefined;
      cachedEquipment = undefined;
      burns = [];
      flown = [];
      turnChangedAt = -Infinity;
      primaryFixT = undefined;
    },

    ingest(batch: RecordBatch) {
      for (const done of batch.executed) {
        if (done.status === 'rejected') continue;
        const c = done.command;
        if (c.kind === 'burn') {
          burns = burns.filter((b) => b.thruster !== c.thruster || b.end <= done.t);
          burns.push({
            thruster: c.thruster,
            start: done.t,
            end: done.t + c.duration,
            throttle: c.throttle,
            ...(c.attitude?.reference === 'inertial' ? { attitude: c.attitude.attitude } : {}),
          });
        } else if (c.kind === 'cutoff') {
          burns = burns.map((b) =>
            (c.thruster === 'all' || b.thruster === c.thruster) && b.end > done.t
              ? { ...b, end: done.t }
              : b,
          );
          // A cut-off thruster stops whatever the controls were asking of it too.
          flown = flown.flatMap((f) => {
            if (f.end <= done.t) return [f];
            const closed = { ...f, end: done.t };
            const thrust = f.thrust.filter((k) => c.thruster !== 'all' && k.source !== c.thruster);
            if (thrust.length === f.thrust.length) return [f];
            return thrust.length === 0
              ? [closed]
              : [closed, { start: done.t, end: f.end, thrust, force: netForce(thrust) }];
          });
        } else if (c.kind === 'fly') {
          // The controls as they are now replace whatever they were asking before.
          flown = flown.map((f) => (f.end > done.t ? { ...f, end: done.t } : f));
          const thrust = thrustFlown(c.input);
          if (thrust.length > 0)
            flown.push({ start: done.t, end: Infinity, thrust, force: netForce(thrust) });
          // The sticks set the turn (contracts: HandsOnInput): centred, the ship stops turning
          // and holds; deflected, it turns at the rate the flight software asks for. Either
          // way the last gyro rate no longer describes it, so the attitude is carried at the
          // new rate from now until the gyros and star trackers speak again.
          const centred = c.input.yaw === 0 && c.input.pitch === 0;
          if (centred || handsOnTurn) turnChangedAt = done.t;
          if (centred || handsOnTurn)
            attitude = {
              ...attitude,
              q: attitudeAt(done.t),
              t: done.t,
              rate: centred || !handsOnTurn ? { x: 0, y: 0, z: 0 } : handsOnTurn(c.input),
            };
        } else if (c.kind === 'mode') {
          modes[c.equipment] = c.mode;
          cachedEquipment = undefined;
        }
      }
      for (const e of batch.events)
        if (e.kind === 'configuration-changed') {
          configuration = e.configuration;
          cachedMassProperties = undefined;
        }

      const p = primary();
      /** The bearing taken with a range fix: same packet, same target, same instant. */
      const bearingWith = (target: string, t: number) => {
        const b = batch.measurements.find(
          (q) => q.kind === 'bearing' && q.target === target && q.t === t,
        );
        if (!b) return undefined;
        const sigmaAzimuth = b.sigma[0] ?? 0;
        return {
          azimuth: b.value[0] ?? 0,
          elevation: b.value[1] ?? 0,
          sigmaAzimuth,
          sigmaElevation: b.sigma[1] ?? sigmaAzimuth,
        };
      };
      for (const m of batch.measurements) {
        measurementCount += 1;
        // First component: a telemetry value, a range, or a bearing's azimuth.
        const value = m.value[0] ?? 0;
        const sigma = m.sigma[0] ?? 0;
        if (m.kind === 'telemetry' && m.channel) {
          telemetry[m.channel] = { t: m.t, value, sigma };
          cachedEquipment = undefined;
          if (m.channel.endsWith('.propellant')) cachedMassProperties = undefined;
        } else if (m.kind === 'attitude') {
          // A star-tracker fix: the rotation vector of the body-to-inertial attitude.
          attitude = {
            ...attitude,
            q: fromRotationVector({ x: value, y: m.value[1] ?? 0, z: m.value[2] ?? 0 }),
            t: m.t,
            sigma: Math.max(sigma, m.sigma[1] ?? 0, m.sigma[2] ?? 0),
          };
        } else if (m.kind === 'rate') {
          // Gyros: carry the attitude to now at the old rate, then take the new one, unless the
          // reading was taken as the controls changed (it shows the ship before they acted).
          if (m.t > turnChangedAt)
            attitude = {
              ...attitude,
              q: attitudeAt(m.t),
              t: m.t,
              rate: { x: value, y: m.value[1] ?? 0, z: m.value[2] ?? 0 },
            };
        } else if ((m.kind === 'bearing' || m.kind === 'range') && m.target === p.id) {
          advanceShip(m.t);
          const [px, py, pz] = nav.x as [number, number, number];
          const r = Math.hypot(px, py, pz);
          if (m.kind === 'bearing') {
            // Direction from the ship to the primary at the origin: azimuth, then elevation.
            const flat = Math.hypot(px, py);
            if (flat > 1e-6 * r) {
              const predicted = Math.atan2(-py, -px);
              update(
                [-py / (flat * flat), px / (flat * flat), 0, 0, 0, 0, 0],
                wrapAngle(value - predicted),
                sigma,
              );
            }
            const elevation = m.value[1];
            if (elevation !== undefined) {
              const [qx, qy, qz] = nav.x as [number, number, number];
              const level = Math.hypot(qx, qy);
              const d2 = level * level + qz * qz;
              const h =
                level > 1e-6 * r
                  ? [(qz * qx) / (level * d2), (qz * qy) / (level * d2), -level / d2, 0, 0, 0, 0]
                  : [0, 0, -level / d2, 0, 0, 0, 0];
              update(h, elevation - Math.atan2(-qz, level), m.sigma[1] ?? sigma);
            }
          } else {
            update([px / r, py / r, pz / r, 0, 0, 0, 0], value - r, sigma);
          }
          primaryFixT = m.t;
          support.min = Math.min(support.min, r);
          support.max = Math.max(support.max, r);
        } else if (m.kind === 'range' && secondary && m.target === secondary.id) {
          // A range fix follows its bearing in the same packet: place the secondary from both.
          advanceShip(m.t);
          const bearing = bearingWith(m.target, m.t);
          if (bearing) {
            const line = fromAzEl(bearing.azimuth, bearing.elevation);
            const blend = 0.2;
            secondary.position = {
              x: secondary.position.x + blend * (nav.x[0]! + value * line.x - secondary.position.x),
              y: secondary.position.y + blend * (nav.x[1]! + value * line.y - secondary.position.y),
              z: secondary.position.z + blend * (nav.x[2]! + value * line.z - secondary.position.z),
            };
            secondary.fixT = m.t;
            secondary.tracked = true;
          }
        } else if (m.kind === 'range' && m.target !== undefined) {
          // A briefed asteroid, ranged because the briefing gives its size.
          const rock = rocks.find((q) => q.known.id === m.target);
          const bearing = rock ? bearingWith(m.target, m.t) : undefined;
          if (rock && bearing) {
            advanceTo(m.t);
            fixRock(rock, m.t, bearing, value, sigma);
          }
        }
      }
    },

    endAttempt() {
      // Nothing to refit: the navigator keeps no parameters of its own.
    },

    settled() {
      return Promise.resolve();
    },

    believedWorld(t: Seconds): BelievedWorld {
      if (!briefing || !ship) throw new Error('model has no attempt');
      advanceTo(t);
      const origin = primaryInertial(t, secondary);
      const base = estimate(nav, origin);
      const propellant = Object.fromEntries(
        ship.tanks.map((tank) => [tank.id, { mean: gauged(tank.id), sigma: 0 }]),
      );
      const believed: BelievedShip = {
        ...base,
        t,
        configuration,
        massProperties: massProperties(),
        equipment: equipmentStatus(),
        propellant,
        telemetry,
      };
      return {
        t,
        modelVersion: version,
        ship: believed,
        bodies: believedBodies(t, origin),
        asteroids: believedAsteroids(t, origin),
        fields: [],
      };
    },

    state(): ModelState {
      const priors = briefing?.priors ?? [];
      const estimates: ParameterEstimate[] = priors
        .filter((prior) => !prior.extension || parameters.has(prior.id))
        .map((prior) => ({
          id: prior.id,
          label: prior.label,
          unit: prior.unit,
          value: parameters.get(prior.id) ?? prior.value,
          sigma: prior.sigma,
          prior: { mean: prior.value, sigma: prior.sigma },
          ...(prior.extension ? { extension: prior.extension } : {}),
          support: 0,
        }));
      const n = estimates.length;
      const values = new Array<number>(n * n).fill(0);
      estimates.forEach((e, i) => (values[i * n + i] = e.sigma * e.sigma));
      return {
        version,
        parameters: estimates,
        covariance: { ids: estimates.map((e) => e.id), values },
        extensions: [
          {
            id: 'distance-law',
            status: parameters.has('law.gravity.exponent') ? 'adopted' : 'candidate',
          },
        ],
        support: {
          distance:
            briefing && support.max >= support.min
              ? { [primary().id]: [[support.min, support.max]] }
              : {},
          powered: [],
        },
        residuals: { coast: { rms: 0, n: 0 }, powered: { rms: 0, n: 0 } },
        basedOn: { attempts: [...attemptsSeen], measurementCount },
        calibration: [],
      };
    },

    forecast(request: ForecastRequest): Promise<ForecastDraft> {
      if (!briefing || !ship) return Promise.reject(new Error('model has no attempt'));
      advanceTo(request.issuedAt);
      const def = ship;
      const known = briefing.knownBodies;
      const initial = estimate(nav, primaryInertial(nav.t, secondary));
      const mp = massProperties();
      const reach = hullReach(mp.hull, mp.centerOfMass);

      const state: Nav = { t: nav.t, x: [...nav.x], p: nav.p.slice() };
      const second: Particle | undefined = secondary
        ? { position: secondary.position, velocity: secondary.velocity }
        : undefined;
      /** Inertial state of briefed body i at the forecast's current time. */
      const bodyAt = (i: number): Particle => {
        const origin = primaryInertial(state.t, second);
        return i === 0 || !second ? origin : offset(origin, second);
      };
      /** The asteroids the camera has ranged this attempt, each with its own state to carry on. */
      const tracked = rocks
        .filter((rock) => rock.p)
        .map((rock) => ({
          rock,
          x: [...rock.x],
          p: rock.p!.slice(),
          spreadTo: state.t,
          samples: [] as ForecastObjectTrack['samples'][number][],
          best: undefined as { t: number; distance: number; ship: Cov3; own: Cov3 } | undefined,
        }));

      // What the ship is doing in the forecast: burns still running, then the plan's commands,
      // each resolved against the forecast's own state at the moment it starts (the same rule
      // the game uses when the command executes). Hands-on thrust ends at the epoch.
      let active: Burn[] = burns.filter((b) => b.end > state.t);
      let held: Flown[] = [];
      let facing = attitudeAt(state.t);
      const plannedAttitudes: { t: number; attitude: Quat }[] = [];
      const pending = request.plan.items
        .map((item) => ({ at: request.plan.epoch + item.at, command: item.command }))
        .filter((item) => item.at >= state.t - 1e-9)
        .sort((a, b) => a.at - b.at);
      const resolve = (target: AttitudeTarget): AttitudeTarget | undefined =>
        resolveAttitude(target, {
          ship: { ...offset(bodyAt(0), shipOf(state)), attitude: facing },
          bodies: known.map((b, i) => ({ id: b.id, ...bodyAt(i) })),
          asteroids: rocks.map((rock) => ({
            id: rock.known.id,
            position: add3(bodyAt(0).position, rockOf(rock.x).position),
          })),
        });
      const start = (at: number, command: Command): void => {
        if (command.kind === 'attitude') {
          const target = resolve(command.target);
          if (target?.reference === 'inertial') facing = target.attitude;
        } else if (command.kind === 'burn') {
          const target = command.attitude ? resolve(command.attitude) : undefined;
          // A reference the navigation solution cannot resolve never reaches the ship.
          if (command.attitude && !target) return;
          if (target?.reference === 'inertial') {
            facing = target.attitude;
            plannedAttitudes.push({ t: at, attitude: facing });
          }
          active = active.filter((b) => b.thruster !== command.thruster || b.end <= at);
          active.push({
            thruster: command.thruster,
            start: at,
            end: at + command.duration,
            throttle: command.throttle,
            ...(target?.reference === 'inertial' ? { attitude: target.attitude } : {}),
          });
        } else if (command.kind === 'cutoff') {
          active = active.map((b) =>
            (command.thruster === 'all' || b.thruster === command.thruster) && b.end > at
              ? { ...b, end: at }
              : b,
          );
          if (command.thruster === 'all')
            held = held.map((f) => (f.end > at ? { ...f, end: at } : f));
        } else if (command.kind === 'fly') {
          held = held.map((f) => (f.end > at ? { ...f, end: at } : f));
          const thrust = thrustFlown(command.input);
          if (thrust.length > 0)
            held.push({ start: at, end: Infinity, thrust, force: netForce(thrust) });
        }
      };

      let mass = mp.mass;
      const samples: ForecastSample[] = [];
      const sigmaMajor: ForecastSigmaBySource[] = [];
      const trackSamples = known.map((): ForecastObjectTrack['samples'][number][] => []);
      const approach = new Map<string, ClosestApproach>();
      const end = request.issuedAt + request.span;
      let nextSample = state.t;
      let horizon = request.span;

      /** Record a sample; false when the forecast must end here (horizon or surface). */
      const sample = (): boolean => {
        const positionCov = block3(state.p, N, 0);
        const sigma = majorSigma(positionCov);
        const origin = bodyAt(0);
        const here = offset(origin, shipOf(state));
        let nearest = Infinity;
        let surface = false;
        known.forEach((b, i) => {
          const at = bodyAt(i).position;
          const distance = Math.hypot(
            here.position.x - at.x,
            here.position.y - at.y,
            here.position.z - at.z,
          );
          nearest = Math.min(nearest, distance);
          if (distance <= b.radius) surface = true;
          trackSamples[i]!.push({ t: state.t, position: at, positionCov: b.positionCov });
          const clearance = distance - b.radius - reach;
          const best = approach.get(b.id);
          if (!best || clearance < best.distance)
            approach.set(b.id, { id: b.id, t: state.t, distance: clearance, sigma });
        });
        // Past the horizon the model says nothing (P10); the first sample is always kept.
        if (samples.length > 0 && sigma > HORIZON_FRACTION * nearest) return false;
        for (const item of tracked) {
          // The asteroid's own doubt, brought up to this sample in one step.
          if (state.t > item.spreadTo) {
            item.p = spreadRock(item.x, item.p, state.t - item.spreadTo, second?.position);
            item.spreadTo = state.t;
          }
          item.samples.push({
            t: state.t,
            position: add3(origin.position, rockOf(item.x).position),
            positionCov: block3(item.p, M, 0),
          });
        }
        const r = Math.hypot(state.x[0]!, state.x[1]!, state.x[2]!);
        samples.push({
          t: state.t,
          ...here,
          positionCov,
          extrapolating: !(r >= support.min && r <= support.max),
        });
        sigmaMajor.push({
          t: state.t,
          state: sigma,
          profile: 0,
          hedge: 0,
          engine: 0,
          mass: 0,
          total: sigma,
        });
        return !surface;
      };
      /** Hull-to-surface clearance to every tracked asteroid right now; keeps the smallest. */
      const pass = (): void => {
        for (const item of tracked) {
          const clearance =
            Math.hypot(
              state.x[0]! - item.x[0]!,
              state.x[1]! - item.x[1]!,
              state.x[2]! - item.x[2]!,
            ) -
            item.rock.known.radius -
            reach;
          if (!item.best || clearance < item.best.distance)
            item.best = {
              t: state.t,
              distance: clearance,
              ship: block3(state.p, N, 0),
              own: block3(item.p, M, 0),
            };
        }
      };

      for (;;) {
        while (pending.length > 0 && pending[0]!.at <= state.t + 1e-9) {
          const { at, command } = pending.shift()!;
          start(at, command);
        }
        if (state.t >= nextSample - 1e-9) {
          nextSample += FORECAST_SAMPLE_INTERVAL;
          if (!sample()) {
            horizon = state.t - request.issuedAt;
            break;
          }
        }
        pass();
        if (state.t >= end - 1e-9) break;
        // Step to the next sample, start or end of thrust, or planned change of thrust,
        // whichever is first. (A planned turn takes effect at the step that follows it.)
        let to = Math.min(state.t + FORECAST_STEP, nextSample, end);
        const next = pending.find((item) => THRUST_COMMANDS.has(item.command.kind));
        if (next) to = Math.min(to, Math.max(next.at, state.t + 1e-6));
        const dt = stepTo(state.t, to, active, held) - state.t;
        for (const b of active) {
          if (state.t < b.start - 1e-9 || state.t >= b.end - 1e-9) continue;
          const spec = def.equipment.find((e) => e.id === b.thruster);
          const flow = ((spec?.params.thrust ?? 0) * b.throttle) / ((spec?.params.isp ?? 300) * G0);
          mass = Math.max(dryMass(), mass - flow * dt);
        }
        for (const f of held) {
          if (state.t < f.start - 1e-9 || state.t >= f.end - 1e-9) continue;
          for (const tick of f.thrust) {
            const isp = def.equipment.find((e) => e.id === tick.source)?.params.isp ?? 300;
            mass = Math.max(dryMass(), mass - (tick.magnitude / (isp * G0)) * dt);
          }
        }
        const thrust = thrustAt(state.t, mass, active, held, facing);
        const s0 = second?.position;
        if (second) stepSecondary(second, dt);
        for (const item of tracked) stepRock(item.x, dt, s0, second?.position);
        predict(state, dt, second?.position, thrust);
      }

      const asteroids: AsteroidForecastNote[] = tracked.map((item) => ({
        id: item.rock.known.id,
        forecast: true,
        ...(item.rock.lastSeen !== undefined ? { tLast: item.rock.lastSeen } : {}),
        fixes: item.rock.fixes,
      }));
      for (const item of tracked)
        if (item.best)
          approach.set(item.rock.known.id, {
            id: item.rock.known.id,
            t: item.best.t,
            distance: item.best.distance,
            sigma: Math.hypot(majorSigma(item.best.ship), majorSigma(item.best.own)),
          });

      return Promise.resolve({
        id: request.id,
        attemptId: request.attemptId,
        issuedAt: request.issuedAt,
        modelVersion: version,
        inputs: {
          initial,
          massProperties: mp,
          plan: request.plan,
          parameters: Object.fromEntries(parameters),
          extensions: parameters.has('law.gravity.exponent') ? ['distance-law'] : [],
          calibration: [],
          noiseScale: 1,
          hedge: 0.4,
          plannedAttitudes,
        },
        horizon,
        samples,
        objects: [
          ...known.map((b, i) => ({ id: b.id, samples: trackSamples[i]! })),
          ...tracked.map((item) => ({ id: item.rock.known.id, samples: item.samples })),
        ],
        closestApproaches: [...approach.values()],
        // The navigator's envelope is its filter's: all of it is the present state carried on.
        detail: { sigmaMajor, presentSource: 'navigator', presentTime: initial.t, asteroids },
      });
    },
  };
  return model;
}

/** a · b for row-major n×n matrices. */
function mul(a: Mat, b: Mat, n: number): Mat {
  const out = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let total = 0;
      for (let k = 0; k < n; k++) total += a[i * n + k]! * b[k * n + j]!;
      out[i * n + j] = total;
    }
  return out;
}

/** a · bᵀ */
function mulT(a: Mat, b: Mat, n: number): Mat {
  const out = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      let total = 0;
      for (let k = 0; k < n; k++) total += a[i * n + k]! * b[j * n + k]!;
      out[i * n + j] = total;
    }
  return out;
}

/** Inverse of a symmetric 3×3, or undefined when it has none worth using. */
function invert3(m: Sym3): Sym3 | undefined {
  const [a, b, c, d, e, f] = m;
  const c00 = d * f - e * e;
  const c01 = c * e - b * f;
  const c02 = b * e - c * d;
  const det = a * c00 + b * c01 + c * c02;
  if (!(Math.abs(det) > 0) || !Number.isFinite(det)) return undefined;
  return [
    c00 / det,
    c01 / det,
    c02 / det,
    (a * f - c * c) / det,
    (b * c - a * e) / det,
    (a * d - b * b) / det,
  ];
}
