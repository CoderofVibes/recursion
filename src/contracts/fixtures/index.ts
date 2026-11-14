/**
 * Shared fixtures: realistic mock data so console (2D) and 3D view (2E) can be built before
 * the simulation exists. Safe for belief-side code. [FICTIONAL] values throughout.
 *
 * Story the fixtures tell (mock "Gravity range"): two bodies, Alpha and Beta. The world uses an
 * inverse-2.5 law; the ship's model starts Newtonian, calibrated at arrival.
 *   - Attempt 1: prograde burn at 300 s, coasts, recalled at 1800 s. Forecast (model v1)
 *     looks right at first and drifts as the ship leaves the arrival distance.
 *   - Model v2: mass-only refit after attempt 1 (fits attempt 1, will fail at other distances).
 *   - Attempt 2: retrograde burn at 120 s drops toward Alpha; forecast from v2; lost to a
 *     collision with asteroid a-07 at 1500 s.
 *   - Model v3: distance-law extension enabled, validated against attempt 2.
 *
 * Everything is built once at import by buildFixtures(); the build is deterministic.
 */

import * as v from '../../lib/vec2.ts';
import type { Vec2 } from '../../lib/vec2.ts';
import { isoCov2 } from '../estimates.ts';
import { issueForecast, type Forecast, type ForecastObjectTrack } from '../forecast.ts';
import type {
  AttemptOverlay,
  AttemptRecord,
  BelievedAsteroid,
  BelievedBody,
  BelievedShip,
  BelievedWorld,
  BlackBoxArchive,
  CalibrationProfile,
  ClosestApproach,
  CovarianceMatrix,
  EncounterBriefing,
  EquipmentStatus,
  ExecutedCommand,
  ForecastSample,
  MassProperties,
  Measurement,
  ModelState,
  ParameterEstimate,
  ParameterPrior,
  Plan,
  Procedure,
  ShipDefinition,
  ShipEstimate,
  ShipEvent,
  TelemetryReading,
  TrailPoint,
  ViewSnapshot,
} from '../index.ts';
import {
  ARRIVAL,
  ENGINE,
  MOCK_BODIES,
  REFERENCE_RADIUS,
  TRUE_EXPONENT,
  TRUE_GRAVITY,
  TRUE_IMU_BIAS_X,
  buildMockScenario,
  coastParticle,
  fixtureRng,
  newtonianGravity,
  propagate,
  type MockAsteroid,
  type MockBurn,
  type MockSample,
} from './generate.ts';

// ---------------------------------------------------------------------------------------------
// Ship design (mock; the real baseline comes from section 1C)
// ---------------------------------------------------------------------------------------------

const rcs = (id: string, x: number, y: number, dirY: number) =>
  ({
    id,
    kind: 'rcs-thruster',
    name: `RCS ${id.slice(-1)}`,
    mass: 8,
    position: v.vec2(x, y),
    ratedPower: 20,
    bus: 'bus-a',
    thermalNode: 'node-prop',
    modes: ['off', 'armed'],
    defaultMode: 'armed',
    mount: { position: v.vec2(x, y), direction: v.vec2(0, dirY) },
    sheddable: true,
    params: { thrust: 220, isp: 230, minImpulseBit: 0.5 },
  }) as const;

export const mockShipDefinition: ShipDefinition = {
  id: 'mock-ship',
  name: 'Mock ship (fixture)',
  structureMass: 7000,
  structureCenterOfMass: v.vec2(0.5, 0),
  structureInertia: 1.6e5,
  equipment: [
    {
      id: 'power-main',
      kind: 'power-source',
      name: 'Power unit',
      mass: 450,
      position: v.vec2(-3, 0),
      ratedPower: 0,
      bus: 'bus-a',
      thermalNode: 'node-power',
      modes: ['off', 'on'],
      defaultMode: 'on',
      sheddable: false,
      params: { output: 6000 },
    },
    {
      id: 'battery-1',
      kind: 'battery',
      name: 'Battery 1',
      mass: 300,
      position: v.vec2(-1, 1.2),
      ratedPower: 0,
      bus: 'bus-a',
      thermalNode: 'node-power',
      modes: ['off', 'on'],
      defaultMode: 'on',
      sheddable: false,
      params: { capacity: 1.8e8, maxCharge: 4000, maxDischarge: 9000 },
    },
    {
      id: 'main-engine',
      kind: 'main-engine',
      name: 'Main engine',
      mass: 260,
      position: v.vec2(-6.5, 0),
      ratedPower: 150,
      bus: 'bus-a',
      thermalNode: 'node-prop',
      modes: ['off', 'armed'],
      defaultMode: 'armed',
      mount: { position: v.vec2(-7, 0), direction: v.vec2(1, 0) },
      sheddable: true,
      params: { thrust: ENGINE.thrust, isp: ENGINE.isp, minImpulseBit: 40 },
    },
    rcs('rcs-1', 5, 1.6, -1),
    rcs('rcs-2', 5, -1.6, 1),
    rcs('rcs-3', -5, 1.6, -1),
    rcs('rcs-4', -5, -1.6, 1),
    {
      id: 'opt-nav',
      kind: 'optical-tracker',
      name: 'Optical nav camera',
      mass: 35,
      position: v.vec2(6, 0),
      ratedPower: 140,
      bus: 'bus-a',
      thermalNode: 'node-avionics',
      modes: ['off', 'standby', 'track'],
      defaultMode: 'track',
      mount: { position: v.vec2(6.2, 0), direction: v.vec2(1, 0) },
      sheddable: true,
      params: { sigmaBearing: 1.5e-4, sigmaRangeFraction: 1e-3, halfWidth: 0.6, range: 2e6 },
    },
    {
      id: 'imu',
      kind: 'accelerometer',
      name: 'Inertial unit',
      mass: 12,
      position: v.vec2(0.5, 0),
      ratedPower: 40,
      bus: 'bus-a',
      thermalNode: 'node-avionics',
      modes: ['off', 'on'],
      defaultMode: 'on',
      sheddable: true,
      params: { noise: 2e-4, biasStability: 5e-5 },
    },
    {
      id: 'star-tracker',
      kind: 'star-tracker',
      name: 'Star tracker',
      mass: 6,
      position: v.vec2(4, 0.8),
      ratedPower: 15,
      bus: 'bus-a',
      thermalNode: 'node-avionics',
      modes: ['off', 'on'],
      defaultMode: 'on',
      sheddable: true,
      params: { sigma: 1e-4 },
    },
    {
      id: 'black-box',
      kind: 'recorder',
      name: 'Black Box',
      mass: 20,
      position: v.vec2(0, -0.8),
      ratedPower: 30,
      bus: 'bus-a',
      thermalNode: 'node-avionics',
      modes: ['off', 'on'],
      defaultMode: 'on',
      sheddable: false,
      params: { capacity: 2e10, powerPerHz: 0.4 },
    },
    {
      id: 'processor',
      kind: 'processor',
      name: 'Flight computer',
      mass: 15,
      position: v.vec2(1, 0),
      ratedPower: 120,
      bus: 'bus-a',
      thermalNode: 'node-avionics',
      modes: ['off', 'on'],
      defaultMode: 'on',
      sheddable: false,
      params: {},
    },
    {
      id: 'radiator-1',
      kind: 'radiator',
      name: 'Radiator panels',
      mass: 140,
      position: v.vec2(-2, 1.9),
      ratedPower: 10,
      bus: 'bus-a',
      thermalNode: 'node-power',
      modes: ['off', 'on'],
      defaultMode: 'on',
      sheddable: true,
      params: { area: 18, emissivity: 0.85 },
    },
    {
      id: 'life-support',
      kind: 'life-support',
      name: 'Life support',
      mass: 900,
      position: v.vec2(2, 0),
      ratedPower: 1800,
      bus: 'bus-a',
      thermalNode: 'node-avionics',
      modes: ['on'],
      defaultMode: 'on',
      sheddable: false,
      params: {},
    },
    {
      id: 'comms',
      kind: 'comms',
      name: 'Radio',
      mass: 25,
      position: v.vec2(3, -1.2),
      ratedPower: 60,
      bus: 'bus-a',
      thermalNode: 'node-avionics',
      modes: ['off', 'standby', 'on'],
      defaultMode: 'standby',
      sheddable: true,
      params: {},
    },
  ],
  tanks: [
    {
      id: 'tank-main',
      name: 'Main tank',
      position: v.vec2(-3.5, 0),
      capacity: 3200,
      propellant: 'MMH/NTO',
      feeds: ['main-engine', 'rcs-1', 'rcs-2', 'rcs-3', 'rcs-4'],
    },
  ],
  buses: [{ id: 'bus-a', name: 'Main bus', voltage: 120, limit: 7500 }],
  thermalNodes: [
    { id: 'node-avionics', name: 'Avionics', heatCapacity: 2.0e5, min: 263, max: 323 },
    { id: 'node-power', name: 'Power', heatCapacity: 4.0e5, min: 253, max: 343 },
    { id: 'node-prop', name: 'Propulsion', heatCapacity: 1.5e5, min: 263, max: 333 },
  ],
  configurations: [
    {
      id: 'stowed',
      name: 'Stowed',
      footprint: [v.vec2(-7, -2), v.vec2(5, -2), v.vec2(7, 0), v.vec2(5, 2), v.vec2(-7, 2)],
      transitionTime: 0,
    },
    {
      id: 'radiators-deployed',
      name: 'Radiators deployed',
      footprint: [
        v.vec2(-7, -2),
        v.vec2(-4, -2),
        v.vec2(-4, -6),
        v.vec2(0, -6),
        v.vec2(0, -2),
        v.vec2(5, -2),
        v.vec2(7, 0),
        v.vec2(5, 2),
        v.vec2(0, 2),
        v.vec2(0, 6),
        v.vec2(-4, 6),
        v.vec2(-4, 2),
        v.vec2(-7, 2),
      ],
      equipmentPositions: { 'radiator-1': v.vec2(-2, 4) },
      paramOverrides: { 'radiator-1.area': 36 },
      transitionTime: 90,
    },
  ],
  defaultConfiguration: 'stowed',
};

const DRY_MASS =
  mockShipDefinition.structureMass + mockShipDefinition.equipment.reduce((s, e) => s + e.mass, 0);

/** Mock mass properties: point masses plus structure. (2B owns the real computation.) */
export function mockMassProperties(
  def: ShipDefinition,
  configurationId: string,
  propellant: number,
): MassProperties {
  const config = def.configurations.find((c) => c.id === configurationId);
  if (!config) throw new Error(`unknown configuration ${configurationId}`);
  const tank = def.tanks[0];
  const points: { m: number; p: Vec2 }[] = [
    { m: def.structureMass, p: def.structureCenterOfMass },
    ...def.equipment.map((e) => ({
      m: e.mass,
      p: config.equipmentPositions?.[e.id] ?? e.position,
    })),
    ...(tank ? [{ m: propellant, p: tank.position }] : []),
  ];
  const mass = points.reduce((s, q) => s + q.m, 0);
  const com = v.scale(
    points.reduce((s, q) => v.addScaled(s, q.p, q.m), v.ZERO),
    1 / mass,
  );
  const inertia =
    def.structureInertia + points.reduce((s, q) => s + q.m * v.distanceSq(q.p, com), 0);
  return { mass, centerOfMass: com, inertia, footprint: config.footprint };
}

// ---------------------------------------------------------------------------------------------
// Model priors and versions
// ---------------------------------------------------------------------------------------------

const MU_ALPHA = (MOCK_BODIES[0] as { mu: number }).mu;
const MU_BETA = (MOCK_BODIES[1] as { mu: number }).mu;

export const mockPriors: readonly ParameterPrior[] = [
  { id: 'body.alpha.mu', label: 'Alpha μ', unit: 'm³/s²', value: MU_ALPHA, sigma: 1.0e8 },
  { id: 'body.beta.mu', label: 'Beta μ', unit: 'm³/s²', value: MU_BETA, sigma: 1.2e8 },
  { id: 'thruster.main-engine.scale', label: 'Main thrust scale', unit: '', value: 1, sigma: 0.03 },
  { id: 'sensor.imu.bias-x', label: 'IMU bias x', unit: 'm/s²', value: 0, sigma: 5e-4 },
];

const estimate = (
  prior: ParameterPrior,
  value: number,
  sigma: number,
  support: number,
): ParameterEstimate => ({
  id: prior.id,
  label: prior.label,
  unit: prior.unit,
  value,
  sigma,
  prior: { mean: prior.value, sigma: prior.sigma },
  ...(prior.extension ? { extension: prior.extension } : {}),
  support,
});

const exponentPrior: ParameterPrior = {
  id: 'law.gravity.exponent',
  label: 'Distance-law exponent',
  unit: '',
  value: 2,
  sigma: 0.5,
  extension: 'distance-law',
};

function diagonalCovariance(params: readonly ParameterEstimate[]): CovarianceMatrix {
  const n = params.length;
  const values = new Array<number>(n * n).fill(0);
  params.forEach((p, i) => (values[i * n + i] = p.sigma * p.sigma));
  return { ids: params.map((p) => p.id), values };
}

function withCorrelation(m: CovarianceMatrix, a: string, b: string, rho: number): CovarianceMatrix {
  const n = m.ids.length;
  const i = m.ids.indexOf(a);
  const j = m.ids.indexOf(b);
  const values = [...m.values];
  const c = rho * Math.sqrt((values[i * n + i] as number) * (values[j * n + j] as number));
  values[i * n + j] = c;
  values[j * n + i] = c;
  return { ids: m.ids, values };
}

const [pAlpha, pBeta, pScale, pBias] = mockPriors as [
  ParameterPrior,
  ParameterPrior,
  ParameterPrior,
  ParameterPrior,
];

// ---------------------------------------------------------------------------------------------
// Attempts
// ---------------------------------------------------------------------------------------------

interface AttemptSpec {
  readonly id: string;
  readonly index: number;
  readonly burns: readonly MockBurn[];
  readonly duration: number;
  readonly modelVersion: number;
  readonly forecastMu: Readonly<Record<string, number>>;
  readonly forecastScale: number;
  /** Alpha distance span (m) where the issuing model had data. */
  readonly support: readonly [number, number];
  readonly events: readonly ShipEvent[];
  readonly outcome: AttemptRecord['outcome'];
  /** Calibration the issuing model held (1G spec §5.4). */
  readonly calibration: readonly CalibrationProfile[];
}

/**
 * Mock calibration profile for Alpha (1G spec §5.4): local fits over attempt 1's coasting
 * stretches. Scale = the pull the data imply over the pull of the given reference law.
 */
function mockCalibration(
  track: readonly MockSample[],
  referenceMu: number,
  referenceExponent: number,
  inflation: number,
): CalibrationProfile {
  const alpha = (MOCK_BODIES[0] as { position: Vec2 }).position;
  const r0 = REFERENCE_RADIUS;
  const spans: readonly (readonly [number, number])[] = [
    [0, 300],
    [320, 1060],
    [1060, 1800],
  ];
  const windows = spans
    .map(([start, end]) => {
      const logs = track
        .filter((p) => p.t >= start && p.t <= end)
        .map((p) => Math.log(v.distance(p.position, alpha)));
      const d = Math.exp(logs.reduce((a, b) => a + b, 0) / logs.length);
      const pull = (mu: number, n: number): number => (mu * Math.pow(r0, n - 2)) / Math.pow(d, n);
      const scale = pull(MU_ALPHA, TRUE_EXPONENT) / pull(referenceMu, referenceExponent);
      return { start, end, distance: d, scale, sigma: 0.004 };
    })
    .sort((a, b) => a.distance - b.distance);
  const n = windows.length;
  const covariance = new Array<number>(n * n).fill(0);
  windows.forEach((w, i) => (covariance[i * n + i] = w.sigma * w.sigma * inflation));
  return {
    body: 'alpha',
    distances: windows.map((w) => w.distance),
    scale: windows.map((w) => w.scale),
    covariance,
    inflation,
    windows,
  };
}

const ARRIVAL_ESTIMATE: ShipEstimate = {
  t: 0,
  position: v.add(ARRIVAL.position, v.vec2(120, -80)),
  velocity: v.add(ARRIVAL.velocity, v.vec2(0.02, -0.03)),
  positionCov: isoCov2(150),
  velocityCov: isoCov2(0.05),
  attitude: ARRIVAL.attitude,
  attitudeSigma: 1e-4,
  angularRate: 0,
};

const FORECAST_STEP = 20;
const FORECAST_HORIZON = 1800;
const SHIP_HALF_LENGTH = 7;

function measurementsFor(id: string, truth: readonly MockSample[]): Measurement[] {
  const rng = fixtureRng(`measurements/${id}`);
  const out: Measurement[] = [];
  for (const s of truth) {
    if (s.t % 10 === 0) {
      for (const b of MOCK_BODIES) {
        const rel = v.sub(b.position, s.position);
        const r = v.length(rel);
        const sigR = 50 + 1e-3 * r;
        const sigB = 1.5e-4;
        out.push({
          kind: 'bearing',
          t: s.t,
          source: 'opt-nav',
          target: b.id,
          value: [v.angleOf(rel) + rng.normal(0, sigB)],
          sigma: [sigB],
        });
        out.push({
          kind: 'range',
          t: s.t,
          source: 'opt-nav',
          target: b.id,
          value: [r + rng.normal(0, sigR)],
          sigma: [sigR],
        });
      }
    }
    if (s.thrustAccel > 0) {
      out.push({
        kind: 'accel',
        t: s.t,
        source: 'imu',
        value: [s.thrustAccel + TRUE_IMU_BIAS_X + rng.normal(0, 2e-4), rng.normal(0, 2e-4)],
        sigma: [2e-4, 2e-4],
      });
    }
    if (s.t % 5 === 0) {
      out.push({
        kind: 'attitude',
        t: s.t,
        source: 'star-tracker',
        value: [v.wrapAngle(s.attitude + rng.normal(0, 1e-4))],
        sigma: [1e-4],
      });
    }
    if (s.t % 30 === 0) {
      const burning = s.thrustAccel > 0;
      const telemetry: [string, string, number, number][] = [
        ['battery-1', 'battery-1.charge', 1.5e8 - 2000 * s.t, 2e5],
        ['tank-main', 'tank-main.propellant', s.mass - DRY_MASS, 15],
        ['bus-a', 'bus-a.load', 4200 + (burning ? 150 : 0), 20],
        ['processor', 'node-avionics.temperature', 293 + 0.001 * s.t, 0.2],
      ];
      for (const [source, channel, value, sigma] of telemetry) {
        out.push({
          kind: 'telemetry',
          t: s.t,
          source,
          channel,
          value: [value + rng.normal(0, sigma)],
          sigma: [sigma],
        });
      }
    }
  }
  return out;
}

/** Measured path: position fixes from Alpha bearing and range (ship = target − ρ·û). */
function trailFrom(measurements: readonly Measurement[]): TrailPoint[] {
  const alpha = MOCK_BODIES[0] as { id: string; position: Vec2 };
  const bearings = new Map<number, number>();
  const trail: TrailPoint[] = [];
  for (const m of measurements) {
    if (m.target !== alpha.id) continue;
    if (m.kind === 'bearing') bearings.set(m.t, m.value[0] as number);
    if (m.kind === 'range') {
      const theta = bearings.get(m.t);
      if (theta === undefined) continue;
      trail.push({
        t: m.t,
        position: v.sub(alpha.position, v.fromAngle(theta, m.value[0] as number)),
      });
    }
  }
  return trail;
}

function planFor(spec: AttemptSpec): Plan {
  return {
    id: `plan-${spec.index}-1`,
    name: spec.burns[0]?.direction === 'prograde' ? 'Raise' : 'Lower',
    epoch: 0,
    items: [
      { id: 'item-1', at: 0, command: { kind: 'attitude', target: { reference: 'prograde' } } },
      ...spec.burns.map((b, i) => ({
        id: `item-${i + 2}`,
        at: b.start,
        command: {
          kind: 'burn' as const,
          thruster: 'main-engine',
          throttle: 1,
          duration: b.duration,
          attitude: { reference: b.direction },
        },
      })),
    ],
  };
}

function executedFor(plan: Plan): ExecutedCommand[] {
  return [
    {
      t: 0,
      command: { kind: 'power', equipment: 'opt-nav', allocation: 140 },
      source: 'manual',
      status: 'executed',
    },
    ...plan.items.map((item) => ({
      t: plan.epoch + item.at,
      command: item.command,
      source: 'plan' as const,
      planId: plan.id,
      planItemId: item.id,
      status: 'executed' as const,
    })),
  ];
}

function believedAsteroidsAt(
  truth: readonly MockAsteroid[],
  t: number,
  shipPosition: Vec2,
  rngName: string,
): BelievedAsteroid[] {
  const rng = fixtureRng(rngName);
  return truth.map((a) => {
    const now = t === 0 ? a : coastParticle(a.position, a.velocity, TRUE_GRAVITY, t, 5);
    const tracked = v.distance(now.position, shipPosition) < 60e3;
    const sigma = tracked ? 150 : 2500;
    return {
      id: a.id,
      position: v.add(now.position, v.vec2(rng.normal(0, sigma), rng.normal(0, sigma))),
      velocity: v.add(now.velocity, v.vec2(rng.normal(0, 0.2), rng.normal(0, 0.2))),
      positionCov: isoCov2(sigma),
      radius: a.radius,
      tracked,
      ...(tracked ? { lastSeen: t } : {}),
    };
  });
}

function forecastFor(
  spec: AttemptSpec,
  plan: Plan,
  massProperties: MassProperties,
  knownAsteroids: readonly BelievedAsteroid[],
): Forecast {
  const g = newtonianGravity(spec.forecastMu);
  const track = propagate(g, spec.burns, FORECAST_HORIZON, spec.forecastScale);
  const alpha = MOCK_BODIES[0] as { position: Vec2 };
  const [lo, hi] = spec.support;
  let extrapolatingSince: number | undefined;
  const samples: ForecastSample[] = [];
  for (const s of track) {
    if (s.t % FORECAST_STEP !== 0) continue;
    const r = v.distance(s.position, alpha.position);
    const extrapolating = r < lo - 2e3 || r > hi + 2e3;
    if (extrapolating && extrapolatingSince === undefined) extrapolatingSince = s.t;
    const sigma =
      150 + 0.15 * s.t + (extrapolatingSince !== undefined ? 0.6 * (s.t - extrapolatingSince) : 0);
    samples.push({
      t: s.t,
      position: s.position,
      velocity: s.velocity,
      positionCov: isoCov2(sigma),
      extrapolating,
    });
  }

  const objects: ForecastObjectTrack[] = knownAsteroids.map((a) => {
    const objSamples: ForecastObjectTrack['samples'][number][] = [];
    let p = a.position;
    let vel = a.velocity;
    const sigma0 = Math.sqrt(a.positionCov[0]);
    for (let t = 0; t <= FORECAST_HORIZON; t += FORECAST_STEP) {
      objSamples.push({ t, position: p, positionCov: isoCov2(sigma0 + 0.1 * t) });
      ({ position: p, velocity: vel } = coastParticle(p, vel, g, FORECAST_STEP, 5));
    }
    return { id: a.id, samples: objSamples };
  });

  const closestApproaches: ClosestApproach[] = objects
    .map((o, i) => {
      let best = { t: 0, d: Infinity, sigma: 0 };
      o.samples.forEach((os, k) => {
        const ss = samples[k];
        if (!ss) return;
        const d = v.distance(os.position, ss.position);
        if (d < best.d) {
          best = {
            t: os.t,
            d,
            sigma: Math.hypot(Math.sqrt(os.positionCov[0]), Math.sqrt(ss.positionCov[0])),
          };
        }
      });
      const radius = (knownAsteroids[i] as BelievedAsteroid).radius;
      return {
        id: o.id,
        t: best.t,
        distance: best.d - radius - SHIP_HALF_LENGTH,
        sigma: best.sigma,
      };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  return issueForecast({
    id: `forecast-${spec.index}-1`,
    attemptId: spec.id,
    issuedAt: 0,
    modelVersion: spec.modelVersion,
    inputs: {
      initial: ARRIVAL_ESTIMATE,
      massProperties,
      plan,
      parameters: {
        'body.alpha.mu': spec.forecastMu.alpha as number,
        'body.beta.mu': spec.forecastMu.beta as number,
        'thruster.main-engine.scale': spec.forecastScale,
      },
      extensions: [],
      calibration: spec.calibration,
      noiseScale: 1,
      hedge: 0.3,
    },
    horizon: FORECAST_HORIZON,
    samples,
    objects,
    closestApproaches,
  });
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------

export interface Fixtures {
  readonly shipDefinition: ShipDefinition;
  readonly briefing: EncounterBriefing;
  readonly models: {
    readonly prior: ModelState;
    readonly massOnly: ModelState;
    readonly distanceLaw: ModelState;
  };
  readonly attempts: readonly [AttemptRecord, AttemptRecord];
  readonly trails: Readonly<Record<string, readonly TrailPoint[]>>;
  readonly procedure: Procedure;
  readonly archive: BlackBoxArchive;
  readonly believedWorld: BelievedWorld;
  readonly viewSnapshot: ViewSnapshot;
  readonly viewSnapshotCompare: ViewSnapshot;
}

export function buildFixtures(): Fixtures {
  const def = mockShipDefinition;
  const arrivalPropellant = ARRIVAL.mass - DRY_MASS;
  const massAtArrival = mockMassProperties(def, 'stowed', arrivalPropellant);

  // Mock truth (asteroids, true trajectories). Used here only to synthesise measurements.
  const scenario = buildMockScenario();
  const { asteroids } = scenario;
  const truth1 = scenario.truth['attempt-0001'];
  const truth2 = scenario.truth['attempt-0002'];
  const burns1 = scenario.burns['attempt-0001'];
  const burns2 = scenario.burns['attempt-0002'];

  const knownAtArrival = believedAsteroidsAt(asteroids, 0, ARRIVAL.position, 'believed/arrival');

  // Model v2 data support comes from attempt 1's distances.
  const alphaPos = (MOCK_BODIES[0] as { position: Vec2 }).position;
  const r1 = truth1.map((s) => v.distance(s.position, alphaPos));
  const support1: readonly [number, number] = [Math.min(...r1), Math.max(...r1)];
  const supportArrival: readonly [number, number] = [146e3, 154e3];
  const fittedMuAlpha = 1.97e9;
  const fittedScale = 0.971;
  const calibrationV2 = mockCalibration(truth1, fittedMuAlpha, 2, 1.3);
  const calibrationV3 = mockCalibration(truth1, 2.001e9, 2.49, 1.0);

  const specs: [AttemptSpec, AttemptSpec] = [
    {
      id: 'attempt-0001',
      index: 1,
      burns: burns1,
      duration: 1800,
      modelVersion: 1,
      forecastMu: { alpha: MU_ALPHA, beta: MU_BETA },
      forecastScale: 1,
      support: supportArrival,
      events: [{ kind: 'recall', t: 1800 }],
      outcome: { kind: 'recalled', t: 1800 },
      calibration: [],
    },
    {
      id: 'attempt-0002',
      index: 2,
      burns: burns2,
      duration: 1500,
      modelVersion: 2,
      forecastMu: { alpha: fittedMuAlpha, beta: MU_BETA },
      forecastScale: fittedScale,
      support: support1,
      events: [
        { kind: 'contact', t: 1500, with: 'a-07', impulse: 5200 },
        { kind: 'ship-lost', t: 1500, cause: 'collision' },
      ],
      outcome: { kind: 'lost', t: 1500, cause: 'collision' },
      calibration: [calibrationV2],
    },
  ];

  const trails: Record<string, TrailPoint[]> = {};
  const attempts = specs.map((spec): AttemptRecord => {
    const truth = scenario.truth[spec.id as keyof typeof scenario.truth];
    const measurements = measurementsFor(spec.id, truth);
    trails[spec.id] = trailFrom(measurements);
    const plan = planFor(spec);
    return {
      id: spec.id,
      index: spec.index,
      encounterId: 'gravity-range-mock',
      startedAt: `2026-11-14T2${spec.index}:00:00.000Z`,
      start: {
        estimate: ARRIVAL_ESTIMATE,
        configuration: 'stowed',
        modelVersion: spec.modelVersion,
      },
      plans: [plan],
      executed: executedFor(plan),
      forecasts: [forecastFor(spec, plan, massAtArrival, knownAtArrival)],
      measurements,
      events: spec.events,
      outcome: spec.outcome,
      modelVersionAtEnd: spec.modelVersion + 1,
    };
  }) as [AttemptRecord, AttemptRecord];

  // --- Model versions.
  const priorParams = [
    estimate(pAlpha, pAlpha.value, pAlpha.sigma, 0.1),
    estimate(pBeta, pBeta.value, pBeta.sigma, 0.05),
    estimate(pScale, pScale.value, pScale.sigma, 0),
    estimate(pBias, pBias.value, pBias.sigma, 0),
  ];
  const massOnlyParams = [
    estimate(pAlpha, fittedMuAlpha, 6e6, 0.9),
    estimate(pBeta, 1.21e9, 9e7, 0.2),
    estimate(pScale, fittedScale, 0.004, 0.85),
    estimate(pBias, 1.1e-4, 3e-5, 0.8),
  ];
  const distanceLawParams = [
    estimate(pAlpha, 2.001e9, 4e6, 0.95),
    estimate(pBeta, 1.198e9, 5e7, 0.4),
    estimate(pScale, 0.9702, 0.003, 0.9),
    estimate(pBias, 1.19e-4, 2e-5, 0.85),
    estimate(exponentPrior, 2.49, 0.02, 0.9),
  ];
  const r2 = truth2.map((s) => v.distance(s.position, alphaPos));
  const models = {
    prior: {
      version: 1,
      parameters: priorParams,
      covariance: diagonalCovariance(priorParams),
      extensions: [{ id: 'distance-law', status: 'candidate' }],
      support: { distance: { alpha: [supportArrival] }, powered: [] },
      residuals: { coast: { rms: 0, n: 0 }, powered: { rms: 0, n: 0 } },
      basedOn: { attempts: [], measurementCount: 0 },
      calibration: [],
    },
    massOnly: {
      version: 2,
      parameters: massOnlyParams,
      covariance: withCorrelation(
        diagonalCovariance(massOnlyParams),
        'body.alpha.mu',
        'body.beta.mu',
        -0.3,
      ),
      parent: 1,
      extensions: [{ id: 'distance-law', status: 'candidate' }],
      support: { distance: { alpha: [support1] }, powered: [[300, 320]] },
      residuals: { coast: { rms: 420, n: 180 }, powered: { rms: 35, n: 20 } },
      basedOn: {
        attempts: ['attempt-0001'],
        measurementCount: attempts[0].measurements.length,
      },
      fit: { chi2: 1530, nu: 196, pEff: 4, iterations: 7, converged: true },
      calibration: [calibrationV2],
    },
    distanceLaw: {
      version: 3,
      parent: 2,
      parameters: distanceLawParams,
      covariance: withCorrelation(
        diagonalCovariance(distanceLawParams),
        'body.alpha.mu',
        'law.gravity.exponent',
        0.6,
      ),
      extensions: [
        {
          id: 'distance-law',
          status: 'adopted',
          fittedAt: 3,
          validation: {
            heldOutAttempt: 'attempt-0002',
            modelVersion: 3,
            statistic: 1.04,
            threshold: 1.2,
            rmsBefore: 2900,
            rmsAfter: 310,
            verdict: 'better',
          },
        },
      ],
      support: {
        distance: { alpha: [[Math.min(...r2), Math.max(...r1)]] },
        powered: [
          [300, 320],
          [120, 160],
        ],
      },
      residuals: { coast: { rms: 120, n: 330 }, powered: { rms: 30, n: 60 } },
      basedOn: {
        attempts: ['attempt-0001', 'attempt-0002'],
        measurementCount: attempts[0].measurements.length + attempts[1].measurements.length,
      },
      fit: { chi2: 352, nu: 345, pEff: 5, iterations: 5, converged: true },
      calibration: [calibrationV3],
    },
  } satisfies Fixtures['models'];

  // --- Briefing.
  const knownBodies = (t: number): BelievedBody[] =>
    MOCK_BODIES.map((b) => ({
      id: b.id,
      name: b.name,
      position: b.position,
      velocity: v.ZERO,
      positionCov: isoCov2(500),
      radius: b.radius,
      tracked: true,
      lastFix: t,
    }));
  const briefing: EncounterBriefing = {
    id: 'gravity-range-mock',
    name: 'Gravity range (mock)',
    objectives: [
      {
        id: 'gap',
        kind: 'pass-gap',
        label: 'Gap',
        region: { center: v.vec2(250e3, -60e3), radius: 8e3 },
        window: { from: 1200, to: 2400 },
      },
    ],
    arrivalEstimate: ARRIVAL_ESTIMATE,
    arrivalConfiguration: 'stowed',
    priors: mockPriors,
    knownBodies: knownBodies(0),
    knownAsteroids: knownAtArrival.filter((a) => a.tracked),
  };

  // --- Procedure and archive.
  const firstPlan = attempts[0].plans[0] as Plan;
  const procedure: Procedure = {
    id: 'procedure-raise',
    name: 'Raise from arrival',
    origin: { attemptId: 'attempt-0001', t: 0 },
    condition: {
      encounterId: 'gravity-range-mock',
      configuration: 'stowed',
      position: ARRIVAL_ESTIMATE.position,
      velocity: ARRIVAL_ESTIMATE.velocity,
      positionCov: ARRIVAL_ESTIMATE.positionCov,
      attitude: ARRIVAL_ESTIMATE.attitude,
      tolerance: { position: 2000, velocity: 1, attitude: 0.05 },
    },
    items: firstPlan.items,
  };
  const archive: BlackBoxArchive = {
    attempts,
    procedures: [procedure],
    adoptedExtensions: [],
    leads: [
      {
        id: 'lead-glimmer-1',
        name: 'Glimmer, bearing 212°',
        firstSeen: { attemptId: 'attempt-0001', t: 640 },
        status: 'noticed',
      },
    ],
  };

  // --- Believed world and view at t = 900 s of attempt 2.
  const tView = 900;
  const attempt2 = attempts[1];
  const trail2 = (trails['attempt-0002'] as TrailPoint[]).filter((p) => p.t <= tView);
  const fix = trail2[trail2.length - 1] as TrailPoint;
  const truthAtView = truth2[tView] as MockSample;
  const rngView = fixtureRng('believed/view');
  const propellantNow = truthAtView.mass - DRY_MASS;
  const massNow = mockMassProperties(def, 'stowed', propellantNow);

  const telemetry: Record<string, TelemetryReading> = {};
  for (const m of attempt2.measurements) {
    if (m.kind === 'telemetry' && m.channel && m.t <= tView) {
      telemetry[m.channel] = { t: m.t, value: m.value[0] as number, sigma: m.sigma[0] as number };
    }
  }
  const equipment: Record<string, EquipmentStatus> = Object.fromEntries(
    def.equipment.map((e) => {
      const status: EquipmentStatus = {
        id: e.id,
        mode: e.defaultMode,
        allocation: e.ratedPower,
        powerDraw: Math.round(e.ratedPower * 0.95),
        condition: e.id === 'opt-nav' ? 0.98 : 1,
        tripped: false,
        temperature: 293,
        faults: [],
        readings:
          e.id === 'battery-1'
            ? { charge: telemetry['battery-1.charge']?.value ?? 0 }
            : e.id === 'black-box'
              ? { sampleRate: 2, bytesUsed: 3.1e8 }
              : {},
      };
      return [e.id, status];
    }),
  );
  const ship: BelievedShip = {
    t: tView,
    position: fix.position,
    velocity: v.add(truthAtView.velocity, v.vec2(rngView.normal(0, 0.05), rngView.normal(0, 0.05))),
    positionCov: isoCov2(180),
    velocityCov: isoCov2(0.06),
    attitude: v.wrapAngle(truthAtView.attitude + rngView.normal(0, 1e-4)),
    attitudeSigma: 1e-4,
    angularRate: 0,
    configuration: 'stowed',
    massProperties: massNow,
    equipment,
    propellant: { 'tank-main': { mean: propellantNow, sigma: 15 } },
    telemetry,
  };
  const believedWorld: BelievedWorld = {
    t: tView,
    modelVersion: 2,
    ship,
    bodies: knownBodies(tView),
    asteroids: believedAsteroidsAt(
      asteroids,
      tView,
      truthAtView.position,
      'believed/view-asteroids',
    ),
    fields: [],
  };
  const alphaBearing = v.angleOf(v.sub(alphaPos, fix.position));
  const viewSnapshot: ViewSnapshot = {
    t: tView,
    paused: true,
    warp: 1,
    world: believedWorld,
    ship: { footprint: massNow.footprint, centerOfMass: massNow.centerOfMass, thrust: [] },
    trail: trail2,
    forecasts: attempt2.forecasts,
    coverage: {
      sectors: [
        { sensor: 'opt-nav', center: alphaBearing, halfWidth: 0.6, range: 2e6, quality: 0.92 },
      ],
    },
    objectives: briefing.objectives,
  };
  const overlay = (a: AttemptRecord, label: string): AttemptOverlay => ({
    attemptId: a.id,
    label,
    trail: trails[a.id] as TrailPoint[],
    ...(a.forecasts[0] ? { forecast: a.forecasts[0] } : {}),
  });
  const viewSnapshotCompare: ViewSnapshot = {
    ...viewSnapshot,
    trail: trails['attempt-0002'] as TrailPoint[],
    t: 1500,
    compare: [overlay(attempts[0], 'Attempt 1'), overlay(attempt2, 'Attempt 2')],
    selection: { kind: 'object', id: 'a-07' },
  };

  return {
    shipDefinition: def,
    briefing,
    models,
    attempts,
    trails,
    procedure,
    archive,
    believedWorld,
    viewSnapshot,
    viewSnapshotCompare,
  };
}

/** Built once at import. */
export const fixtures: Fixtures = buildFixtures();

export const {
  shipDefinition,
  briefing,
  models,
  attempts,
  trails,
  procedure,
  archive,
  believedWorld,
  viewSnapshot,
  viewSnapshotCompare,
} = fixtures;
