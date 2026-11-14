/**
 * BELIEF side (no truth imports). STAND-IN for the predictive model until 2C merges.
 *
 * It is a navigator and a forecaster, not an estimator: it tracks the ship with a small
 * extended Kalman filter on the recorded bearing and range fixes to the primary body, and
 * forecasts a plan by propagating that state under the believed law. Its parameters stay at
 * their briefing priors: it learns nothing, fits no extension and validates nothing. That is
 * 2C's work (src/model); this exists so the loop, the seams and the encounter can be exercised.
 *
 * Simplifications [ASSUMED, stand-in only]:
 * - Frame: the primary (first briefed body) at the origin, treated as inertial. The secondary's
 *   pull on the primary is included as a differential term (1B §4).
 * - Unmodelled acceleration is white noise that grows away from the reference radius, which
 *   also widens the forecast envelope there. The forecast ends at the P10 horizon.
 * - Planned burns start at their commanded attitude at once (no slew).
 */

import type {
  BelievedAsteroid,
  BelievedBody,
  BelievedShip,
  BelievedWorld,
  ClosestApproach,
  Cov2,
  EncounterBriefing,
  EquipmentStatus,
  ForecastDraft,
  ForecastObjectTrack,
  ForecastSample,
  MassProperties,
  ModelState,
  ParameterEstimate,
  Seconds,
  ShipDefinition,
  ShipEstimate,
  TelemetryReading,
} from '../../contracts/index.ts';
import { covEllipse } from '../../contracts/index.ts';
import { wrapAngle, type Vec2 } from '../../lib/vec2.ts';
import type { AttemptStartInfo, ForecastRequest, ModelPort, RecordBatch } from './ports.ts';
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

/** Filter state size: position, velocity and the local gravity scale. */
const N = 5;
type Mat = number[]; // row-major N×N
type Row = readonly [number, number, number, number, number];

interface Nav {
  t: number;
  /**
   * [px, py, vx, vy, g]: position and velocity relative to the primary, and g, the measured
   * strength of the primary pull relative to the believed law right here (1 = the law holds).
   */
  x: [number, number, number, number, number];
  p: Mat;
}

interface Particle {
  position: Vec2;
  velocity: Vec2;
}

interface Burn {
  readonly thruster: string;
  readonly start: number;
  readonly end: number;
  readonly throttle: number;
  /** Inertial thrust direction, if the burn commanded one. */
  readonly angle?: number;
}

export interface StandInModelOptions {
  /** Shared reference radius of the believed law (P4). */
  readonly referenceRadius: number;
}

export interface StandInModel extends ModelPort {
  /** Stand-in only: overwrite a parameter value, e.g. `law.gravity.exponent`, for seam tests. */
  setParameter(id: string, value: number): void;
}

const diagonal = (diag: Row): Mat => {
  const m = new Array<number>(N * N).fill(0);
  for (let i = 0; i < N; i++) m[i * (N + 1)] = diag[i]!;
  return m;
};

export function createStandInModel(options: StandInModelOptions): StandInModel {
  const r0 = options.referenceRadius;
  let briefing: EncounterBriefing | undefined;
  let ship: ShipDefinition | undefined;
  let version = 1;
  const parameters = new Map<string, number>();
  const attemptsSeen: string[] = [];
  let measurementCount = 0;
  const support: { min: number; max: number } = { min: Infinity, max: -Infinity };

  // Per-attempt belief.
  let nav: Nav = { t: 0, x: [0, 0, 0, 0, 1], p: diagonal([1, 1, 1, 1, 1]) };
  let secondary: (Particle & { id: string; fixT: number; tracked: boolean }) | undefined;
  let asteroids: (Particle & { known: BelievedAsteroid; t: number })[] = [];
  let attitude = { value: 0, sigma: 1e-3, rate: 0 };
  let configuration = '';
  let telemetry: Record<string, TelemetryReading> = {};
  let modes: Record<string, string> = {};
  let burns: Burn[] = [];
  let primaryFixT: number | undefined;

  const param = (id: string, fallback: number): number => parameters.get(id) ?? fallback;
  const exponent = (): number => param('law.gravity.exponent', 2);
  const primary = (): BelievedBody => briefing!.knownBodies[0]!;
  const mu = (bodyId: string): number => param(`body.${bodyId}.mu`, 0);

  /** Pull of a body at displacement d (body minus point), believed law. */
  const pull = (gm: number, dx: number, dy: number): [number, number] => {
    const r = Math.hypot(dx, dy);
    if (r === 0) return [0, 0];
    const s = ((gm / (r0 * r0)) * Math.pow(r0 / r, exponent())) / r;
    return [dx * s, dy * s];
  };

  /**
   * Gravity on a test particle at p (relative to the primary), with the secondary at s.
   * `scale` multiplies the primary pull (the locally measured strength).
   */
  const gravity = (px: number, py: number, s: Vec2 | undefined, scale = 1): [number, number] => {
    const p = primary();
    let [ax, ay] = pull(mu(p.id) * scale, -px, -py);
    if (s && secondary) {
      const gm = mu(secondary.id);
      const onShip = pull(gm, s.x - px, s.y - py);
      const onPrimary = pull(gm, s.x, s.y);
      ax += onShip[0] - onPrimary[0];
      ay += onShip[1] - onPrimary[1];
    }
    return [ax, ay];
  };

  const dryMass = (): number =>
    ship!.structureMass + ship!.equipment.reduce((total, e) => total + e.mass, 0);
  const gauged = (tank: string): number =>
    telemetry[`${tank}.propellant`]?.value ?? ship!.tanks.find((t) => t.id === tank)?.capacity ?? 0;

  /** Mass properties from the nominal design and gauged tanks (point masses; stand-in). */
  const massProperties = (): MassProperties => {
    const def = ship!;
    const config = def.configurations.find((c) => c.id === configuration) ?? def.configurations[0]!;
    const items: { m: number; p: Vec2 }[] = [
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
    const inertia =
      def.structureInertia +
      items.reduce((total, i) => total + i.m * ((i.p.x - cx) ** 2 + (i.p.y - cy) ** 2), 0);
    return { mass, centerOfMass: { x: cx, y: cy }, inertia, footprint: config.footprint };
  };
  const believedMass = (): number =>
    dryMass() + ship!.tanks.reduce((total, t) => total + gauged(t.id), 0);

  /** Commanded thrust acceleration at time t (inertial), from recorded burns. */
  const thrustAt = (t: number, mass: number): [number, number] => {
    let ax = 0;
    let ay = 0;
    for (const b of burns) {
      if (t < b.start || t >= b.end) continue;
      const spec = ship!.equipment.find((e) => e.id === b.thruster);
      const force =
        (spec?.params.thrust ?? 0) * b.throttle * param(`thruster.${b.thruster}.scale`, 1);
      const mount = spec?.mount ? Math.atan2(spec.mount.direction.y, spec.mount.direction.x) : 0;
      const angle =
        (b.angle ?? attitude.value) + mount + param(`thruster.${b.thruster}.misalignment`, 0);
      ax += (force / mass) * Math.cos(angle);
      ay += (force / mass) * Math.sin(angle);
    }
    return [ax, ay];
  };

  /**
   * Spectral density of unmodelled acceleration, m²/s³: 0.5% of the primary's pull with a long
   * correlation time, plus 5% of any commanded thrust with a short one (so a burn's speed
   * change is uncertain by a few percent, the engine prior).
   */
  const unmodelled = (r: number, thrust: number): number => {
    const g = (mu(primary().id) / (r0 * r0)) * Math.pow(r0 / r, exponent());
    return (
      (0.005 * g) ** 2 * NOISE_CORRELATION_TIME + (0.05 * thrust) ** 2 * THRUST_CORRELATION_TIME
    );
  };
  /**
   * How fast the local gravity scale may drift, per second: with an unvalidated law it can
   * change like an exponent error of LAW_DOUBT as the distance changes; an adopted law is trusted.
   */
  const scaleDrift = (r: number, radialSpeed: number): number =>
    (parameters.has('law.gravity.exponent') ? 0.02 : LAW_DOUBT) * (Math.abs(radialSpeed) / r) +
    1e-7;

  const stepParticle = (q: Particle, dt: number, s: Vec2 | undefined): void => {
    const [ax, ay] = gravity(q.position.x, q.position.y, s);
    const vx = q.velocity.x + 0.5 * dt * ax;
    const vy = q.velocity.y + 0.5 * dt * ay;
    const x = q.position.x + dt * vx;
    const y = q.position.y + dt * vy;
    const [bx, by] = gravity(x, y, s);
    q.position = { x, y };
    q.velocity = { x: vx + 0.5 * dt * bx, y: vy + 0.5 * dt * by };
  };

  /** The secondary moves about the primary under their mutual pull (relative two-body). */
  const stepSecondary = (q: Particle, dt: number): void => {
    const total = mu(primary().id) + (secondary ? mu(secondary.id) : 0);
    const kick = (): [number, number] => pull(total, -q.position.x, -q.position.y);
    const [ax, ay] = kick();
    const vx = q.velocity.x + 0.5 * dt * ax;
    const vy = q.velocity.y + 0.5 * dt * ay;
    q.position = { x: q.position.x + dt * vx, y: q.position.y + dt * vy };
    const [bx, by] = kick();
    q.velocity = { x: vx + 0.5 * dt * bx, y: vy + 0.5 * dt * by };
  };

  /** One filter prediction step of the ship state and covariance over dt. */
  const predict = (n: Nav, dt: number, s: Vec2 | undefined, mass: number): void => {
    const [px, py, vx, vy, g] = n.x;
    const [tx, ty] = thrustAt(n.t, mass);
    const [gx, gy] = gravity(px, py, s, g);
    const hx = vx + 0.5 * dt * (gx + tx);
    const hy = vy + 0.5 * dt * (gy + ty);
    const nx = px + dt * hx;
    const ny = py + dt * hy;
    const [g2x, g2y] = gravity(nx, ny, s, g);
    n.x = [nx, ny, hx + 0.5 * dt * (g2x + tx), hy + 0.5 * dt * (g2y + ty), g];

    // Covariance: F = I + dt·A, with the primary gravity gradient G and its unscaled pull a0
    // (the sensitivity of the acceleration to the local scale g).
    const r = Math.hypot(px, py);
    const k0 = ((mu(primary().id) / (r0 * r0)) * Math.pow(r0 / r, exponent())) / r;
    const k = g * k0;
    const e = exponent() + 1;
    const ux = px / r;
    const uy = py / r;
    const gxx = -k * (1 - e * ux * ux);
    const gxy = k * e * ux * uy;
    const gyy = -k * (1 - e * uy * uy);
    // prettier-ignore
    const f: Mat = [
      1, 0, dt, 0, 0,
      0, 1, 0, dt, 0,
      dt * gxx, dt * gxy, 1, 0, -dt * k0 * px,
      dt * gxy, dt * gyy, 0, 1, -dt * k0 * py,
      0, 0, 0, 0, 1,
    ];
    const next = mulT(mul(f, n.p), f);
    // White unmodelled acceleration: spectral density S = sigma² · correlation time.
    const density = unmodelled(r, Math.hypot(tx, ty));
    const qp = (density * dt ** 3) / 3;
    const qc = (density * dt * dt) / 2;
    const qv = density * dt;
    const add = (i: number, j: number, v: number): void => {
      next[i * N + j] = next[i * N + j]! + v;
    };
    add(0, 0, qp);
    add(1, 1, qp);
    add(0, 2, qc);
    add(2, 0, qc);
    add(1, 3, qc);
    add(3, 1, qc);
    add(2, 2, qv);
    add(3, 3, qv);
    const radialSpeed = (px * vx + py * vy) / r;
    add(4, 4, scaleDrift(r, radialSpeed) ** 2 * dt * NOISE_CORRELATION_TIME);
    n.p = next;
    n.t += dt;
  };

  /** End of a step from `from` toward `to` that stops at the next burn start or end. */
  const stepTo = (from: number, to: number): number => {
    let end = to;
    for (const b of burns) {
      if (b.start > from + 1e-9 && b.start < end) end = b.start;
      if (b.end > from + 1e-9 && b.end < end) end = b.end;
    }
    return end;
  };

  /** Advance every believed object to time t (mutates). */
  const advanceTo = (t: number): void => {
    const mass = believedMass();
    while (nav.t < t - 1e-9) {
      const dt = stepTo(nav.t, Math.min(nav.t + 5, t)) - nav.t;
      if (secondary) stepSecondary(secondary, dt);
      predict(nav, dt, secondary?.position, mass);
    }
    for (const a of asteroids) {
      while (a.t < t - 1e-9) {
        const dt = Math.min(30, t - a.t);
        stepParticle(a, dt, secondary?.position);
        a.t += dt;
      }
    }
  };

  /** Scalar Kalman update with measurement row h. */
  const update = (h: Row, innovation: number, sigma: number): void => {
    const ph: number[] = [];
    for (let i = 0; i < N; i++) {
      let total = 0;
      for (let j = 0; j < N; j++) total += nav.p[i * N + j]! * h[j]!;
      ph.push(total);
    }
    const s = h.reduce((total, hi, i) => total + hi * ph[i]!, 0) + sigma * sigma;
    const gain = ph.map((v) => v / s);
    nav.x = nav.x.map((v, i) => v + gain[i]! * innovation) as Nav['x'];
    const next = nav.p.slice();
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) next[i * N + j] = next[i * N + j]! - gain[i]! * ph[j]!;
    nav.p = next;
  };

  /** The 2×2 block of the covariance starting at state index `offset`. */
  const cov2 = (p: Mat, offset: 0 | 2): Cov2 => [
    p[offset * (N + 1)]!,
    p[offset * N + offset + 1]!,
    p[(offset + 1) * (N + 1)]!,
  ];

  const estimate = (n: Nav): ShipEstimate => ({
    t: n.t,
    position: { x: n.x[0], y: n.x[1] },
    velocity: { x: n.x[2], y: n.x[3] },
    positionCov: cov2(n.p, 0),
    velocityCov: cov2(n.p, 2),
    attitude: attitude.value,
    attitudeSigma: attitude.sigma,
    angularRate: attitude.rate,
  });

  const equipmentStatus = (): Record<string, EquipmentStatus> =>
    Object.fromEntries(
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
    );

  const believedBodies = (t: number): BelievedBody[] =>
    briefing!.knownBodies.map((b, i) =>
      i === 0 || !secondary || b.id !== secondary.id
        ? {
            ...b,
            tracked: i === 0 && primaryFixT !== undefined && t - primaryFixT < 120,
            lastFix: primaryFixT ?? b.lastFix,
          }
        : {
            ...b,
            position: secondary.position,
            velocity: secondary.velocity,
            tracked: secondary.tracked && t - secondary.fixT < 120,
            lastFix: secondary.fixT,
          },
    );

  const model: StandInModel = {
    setParameter(id, value) {
      parameters.set(id, value);
      version += 1;
    },

    beginAttempt(start: AttemptStartInfo) {
      briefing = start.briefing;
      ship = start.ship;
      if (attemptsSeen.length === 0)
        for (const prior of briefing.priors)
          if (!prior.extension && !parameters.has(prior.id)) parameters.set(prior.id, prior.value);
      attemptsSeen.push(start.attemptId);
      const a = briefing.arrivalEstimate;
      nav = {
        t: a.t,
        x: [a.position.x, a.position.y, a.velocity.x, a.velocity.y, 1],
        p: diagonal([
          a.positionCov[0],
          a.positionCov[2],
          a.velocityCov[0],
          a.velocityCov[2],
          ARRIVAL_SCALE_SIGMA ** 2,
        ]),
      };
      const second = briefing.knownBodies[1];
      secondary = second
        ? {
            id: second.id,
            position: second.position,
            velocity: second.velocity,
            fixT: a.t,
            tracked: false,
          }
        : undefined;
      asteroids = briefing.knownAsteroids.map((known) => ({
        known,
        position: known.position,
        velocity: known.velocity,
        t: a.t,
      }));
      attitude = { value: a.attitude, sigma: a.attitudeSigma, rate: a.angularRate };
      configuration = briefing.arrivalConfiguration;
      telemetry = {};
      modes = {};
      burns = [];
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
            ...(c.attitude?.reference === 'inertial' ? { angle: c.attitude.angle } : {}),
          });
        } else if (c.kind === 'cutoff') {
          burns = burns.map((b) =>
            (c.thruster === 'all' || b.thruster === c.thruster) && b.end > done.t
              ? { ...b, end: done.t }
              : b,
          );
        } else if (c.kind === 'mode') modes[c.equipment] = c.mode;
      }
      for (const e of batch.events)
        if (e.kind === 'configuration-changed') configuration = e.configuration;

      const p = primary();
      for (const m of batch.measurements) {
        measurementCount += 1;
        const value = m.value[0] ?? 0;
        const sigma = m.sigma[0] ?? 0;
        if (m.kind === 'telemetry' && m.channel) {
          telemetry[m.channel] = { t: m.t, value, sigma };
        } else if (m.kind === 'attitude') {
          attitude = { ...attitude, value, sigma };
        } else if (m.kind === 'rate') {
          attitude = { ...attitude, rate: value };
        } else if ((m.kind === 'bearing' || m.kind === 'range') && m.target === p.id) {
          advanceTo(m.t);
          const [px, py] = nav.x;
          const r = Math.hypot(px, py);
          if (m.kind === 'bearing') {
            // Direction from the ship to the primary at the origin.
            const predicted = Math.atan2(-py, -px);
            update([-py / (r * r), px / (r * r), 0, 0, 0], wrapAngle(value - predicted), sigma);
          } else {
            update([px / r, py / r, 0, 0, 0], value - r, sigma);
          }
          primaryFixT = m.t;
          support.min = Math.min(support.min, r);
          support.max = Math.max(support.max, r);
        } else if (m.kind === 'range' && secondary && m.target === secondary.id) {
          // A range fix follows its bearing in the same packet: place the secondary from both.
          advanceTo(m.t);
          const bearing = batch.measurements.find(
            (b) => b.kind === 'bearing' && b.target === m.target && b.t === m.t,
          );
          if (bearing) {
            const angle = bearing.value[0] ?? 0;
            const seen = {
              x: nav.x[0] + value * Math.cos(angle),
              y: nav.x[1] + value * Math.sin(angle),
            };
            const blend = 0.2;
            secondary.position = {
              x: secondary.position.x + blend * (seen.x - secondary.position.x),
              y: secondary.position.y + blend * (seen.y - secondary.position.y),
            };
            secondary.fixT = m.t;
            secondary.tracked = true;
          }
        }
      }
    },

    believedWorld(t: Seconds): BelievedWorld {
      if (!briefing || !ship) throw new Error('model has no attempt');
      advanceTo(t);
      const base = estimate(nav);
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
        bodies: believedBodies(t),
        asteroids: asteroids.map((a) => ({
          ...a.known,
          position: a.position,
          velocity: a.velocity,
        })),
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
      const initial = estimate(nav);
      const mp = massProperties();

      const state: Nav = { t: nav.t, x: [...nav.x], p: nav.p.slice() };
      const second: Particle | undefined = secondary
        ? { position: secondary.position, velocity: secondary.velocity }
        : undefined;
      const bodyAt = (i: number): Particle =>
        i === 0 || !second
          ? { position: known[i]!.position, velocity: known[i]!.velocity }
          : second;

      // Burns still running, plus the plan's, each resolved against the forecast's own state
      // at the moment it starts (the same rule the game uses when the command executes).
      const recorded = burns;
      const pending = request.plan.items
        .map((item) => ({ at: request.plan.epoch + item.at, command: item.command }))
        .filter((item) => item.command.kind === 'burn' && item.at >= state.t - 1e-9)
        .sort((a, b) => a.at - b.at);
      burns = burns.filter((b) => b.end > state.t);

      let mass = mp.mass;
      const samples: ForecastSample[] = [];
      const trackSamples = known.map((): ForecastObjectTrack['samples'][number][] => []);
      const approach = new Map<string, ClosestApproach>();
      const end = request.issuedAt + request.span;
      let nextSample = state.t;
      let horizon = request.span;

      /** Record a sample; false when the forecast must end here (horizon or surface). */
      const sample = (): boolean => {
        const positionCov = cov2(state.p, 0);
        const sigma = covEllipse(positionCov).major;
        const [px, py] = state.x;
        let nearest = Infinity;
        let surface = false;
        known.forEach((b, i) => {
          const at = bodyAt(i).position;
          const distance = Math.hypot(px - at.x, py - at.y);
          nearest = Math.min(nearest, distance);
          if (distance <= b.radius) surface = true;
          trackSamples[i]!.push({ t: state.t, position: at, positionCov: b.positionCov });
          const best = approach.get(b.id);
          if (!best || distance - b.radius < best.distance)
            approach.set(b.id, { id: b.id, t: state.t, distance: distance - b.radius, sigma });
        });
        // Past the horizon the model says nothing (P10); the first sample is always kept.
        if (samples.length > 0 && sigma > HORIZON_FRACTION * nearest) return false;
        const r = Math.hypot(px, py);
        samples.push({
          t: state.t,
          position: { x: px, y: py },
          velocity: { x: state.x[2], y: state.x[3] },
          positionCov,
          extrapolating: !(r >= support.min && r <= support.max),
        });
        return !surface;
      };

      try {
        for (;;) {
          while (pending.length > 0 && pending[0]!.at <= state.t + 1e-9) {
            const { at, command } = pending.shift()!;
            if (command.kind !== 'burn') continue;
            const resolved = command.attitude
              ? resolveAttitude(command.attitude, {
                  ship: {
                    position: { x: state.x[0], y: state.x[1] },
                    velocity: { x: state.x[2], y: state.x[3] },
                  },
                  bodies: known.map((b, i) => ({ id: b.id, ...bodyAt(i) })),
                  asteroids: [],
                })
              : undefined;
            burns = burns.filter((b) => b.thruster !== command.thruster || b.end <= at);
            burns.push({
              thruster: command.thruster,
              start: at,
              end: at + command.duration,
              throttle: command.throttle,
              ...(resolved?.reference === 'inertial' ? { angle: resolved.angle } : {}),
            });
          }
          if (state.t >= nextSample - 1e-9) {
            nextSample += FORECAST_SAMPLE_INTERVAL;
            if (!sample()) {
              horizon = state.t - request.issuedAt;
              break;
            }
          }
          if (state.t >= end - 1e-9) break;
          // Step to the next sample, burn boundary or planned burn, whichever comes first.
          let to = Math.min(state.t + FORECAST_STEP, nextSample, end);
          if (pending.length > 0) to = Math.min(to, Math.max(pending[0]!.at, state.t + 1e-6));
          const dt = stepTo(state.t, to) - state.t;
          for (const b of burns) {
            if (state.t < b.start - 1e-9 || state.t >= b.end - 1e-9) continue;
            const spec = def.equipment.find((e) => e.id === b.thruster);
            const flow =
              ((spec?.params.thrust ?? 0) * b.throttle) / ((spec?.params.isp ?? 300) * G0);
            mass = Math.max(dryMass(), mass - flow * dt);
          }
          if (second) stepSecondary(second, dt);
          predict(state, dt, second?.position, mass);
        }
      } finally {
        burns = recorded;
      }

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
        },
        horizon,
        samples,
        objects: known.map((b, i) => ({ id: b.id, samples: trackSamples[i]! })),
        closestApproaches: [...approach.values()],
      });
    },
  };
  return model;
}

function mul(a: Mat, b: Mat): Mat {
  const out = new Array<number>(N * N).fill(0);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      let total = 0;
      for (let k = 0; k < N; k++) total += a[i * N + k]! * b[k * N + j]!;
      out[i * N + j] = total;
    }
  return out;
}

/** a · bᵀ */
function mulT(a: Mat, b: Mat): Mat {
  const out = new Array<number>(N * N).fill(0);
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++) {
      let total = 0;
      for (let k = 0; k < N; k++) total += a[i * N + k]! * b[j * N + k]!;
      out[i * N + j] = total;
    }
  return out;
}
