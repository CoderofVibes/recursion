/** Numerical references only: these impulses are not player commands or ship-system runs. */
import inputs from '../studies/s8/inputs.json';
import vectors from '../studies/s8/vectors.json';
import witness from '../studies/s8/ring-witness.json';
import type { TruthWorld } from '../../src/contracts/truth/index.ts';
import type { Vec3 } from '../../src/lib/vec3.ts';
import { add, distance } from '../../src/lib/vec3.ts';
import { createShipSystemsState, loadShipDefinition } from '../../src/ship/index.ts';
import { createSimulation, type SimState } from '../../src/sim/index.ts';

interface StateVector {
  readonly t: number;
  readonly position: readonly number[];
  readonly velocity: readonly number[];
}

interface Impulse {
  readonly t: number;
  readonly deltaV: readonly number[];
}

export interface ReferenceSample {
  readonly t: number;
  readonly positionErrorM: number;
  readonly velocityErrorMps: number;
  readonly expected: { readonly position: Vec3; readonly velocity: Vec3 };
  readonly actual: { readonly position: Vec3; readonly velocity: Vec3 };
  readonly passed: boolean;
}

export interface ReferenceResolution {
  readonly dt: number;
  readonly samples: readonly ReferenceSample[];
  readonly maxPositionErrorM: number;
  readonly maxVelocityErrorMps: number;
  readonly impacts: number;
  readonly passed: boolean;
}

export interface ReferenceCase {
  readonly id: string;
  readonly source: string;
  readonly acceptedAtDtSeconds: number;
  readonly input: StateVector;
  readonly impulses: readonly Impulse[];
  readonly resolutions: readonly ReferenceResolution[];
  readonly convergence: {
    readonly positionDifferenceM: readonly [number, number];
    readonly velocityDifferenceMps: readonly [number, number];
    readonly positionRatio: number | null;
    readonly velocityRatio: number | null;
    readonly passed: boolean;
    readonly interpretation: string;
  };
  readonly passed: boolean;
}

export interface ReferenceReport {
  readonly kind: 'numerical-reference';
  readonly passed: boolean;
  readonly sourceCommit: string;
  readonly sources: readonly string[];
  readonly method: string;
  readonly tolerance: typeof vectors.tolerance;
  readonly cases: readonly ReferenceCase[];
  readonly sourceFindings: {
    readonly kind: 'imported-study-findings-not-production-admission';
    readonly rejected: typeof vectors.rejected_seed;
    readonly candidateOffsetsDegrees: readonly number[];
    readonly interpretation: string;
  };
  readonly blocked: readonly string[];
  readonly limits: readonly string[];
}

const vector = (value: readonly number[]): Vec3 => {
  if (value.length !== 3 || value.some((x) => !Number.isFinite(x)))
    throw new Error('S8 reference vector must contain three finite coordinates');
  return { x: value[0]!, y: value[1]!, z: value[2]! };
};

/**
 * S8 core.py gives this circular pair at epoch zero. Only initialization uses the analytic
 * frequency; production sim integrates both moving bodies after that. No replacement solver.
 */
function referenceWorld(initial: StateVector): TruthWorld {
  const c = inputs.constants;
  const law = { exponent: c.exponent, referenceRadius: c.reference_radius_m };
  const totalGm = c.alpha_gm + c.beta_gm;
  const omega = Math.sqrt(
    (totalGm * c.reference_radius_m ** (c.exponent - 2)) /
      c.binary_separation_m ** (c.exponent + 1),
  );
  const alphaX = (-c.beta_gm / totalGm) * c.binary_separation_m;
  const betaX = (c.alpha_gm / totalGm) * c.binary_separation_m;
  const systems = createShipSystemsState(loadShipDefinition(), 'harness.s8.reference');
  return {
    t: initial.t,
    law,
    bodies: [
      {
        id: 'alpha',
        name: 'Alpha',
        gm: c.alpha_gm,
        radius: c.alpha_radius_m,
        position: { x: alphaX, y: 0, z: 0 },
        velocity: { x: 0, y: omega * alphaX, z: 0 },
        fixed: false,
      },
      {
        id: 'beta',
        name: 'Beta',
        gm: c.beta_gm,
        radius: c.beta_radius_m,
        position: { x: betaX, y: 0, z: 0 },
        velocity: { x: 0, y: omega * betaX, z: 0 },
        fixed: false,
      },
    ],
    asteroids: [],
    fields: [],
    hidden: {},
    ship: {
      systems,
      kinematics: {
        position: vector(initial.position),
        velocity: vector(initial.velocity),
        attitude: { w: 1, x: 0, y: 0, z: 0 },
        angularVelocity: { x: 0, y: 0, z: 0 },
      },
    },
  };
}

function withImpulse(state: SimState, impulse: Impulse): SimState {
  return {
    ...state,
    world: {
      ...state.world,
      ship: {
        ...state.world.ship,
        kinematics: {
          ...state.world.ship.kinematics,
          velocity: add(state.world.ship.kinematics.velocity, vector(impulse.deltaV)),
        },
      },
    },
  };
}

function resolution(
  initial: StateVector,
  impulses: readonly Impulse[],
  expected: readonly StateVector[],
  dt: number,
): ReferenceResolution {
  const simulation = createSimulation(referenceWorld(initial), { dt });
  let state = simulation.initial;
  let impacts = 0;
  const samples: ReferenceSample[] = [];
  const epochs = [...new Set([...impulses.map((x) => x.t), ...expected.map((x) => x.t)])].sort(
    (a, b) => a - b,
  );
  for (const t of epochs) {
    const ticks = (t - state.world.t) / dt;
    if (!Number.isInteger(ticks) || ticks < 0)
      throw new Error(`S8 epoch ${t} is not reachable by a whole ${dt} s tick`);
    const result = simulation.run(state, ticks, { stopOnImpact: true });
    state = result.state;
    impacts += result.contacts.filter((x) => x.impact).length;
    if (impacts) break;
    // Stored command-epoch states are post-impulse (S8 core.py fly semantics).
    for (const impulse of impulses.filter((x) => x.t === t)) state = withImpulse(state, impulse);
    const reference = expected.find((x) => x.t === t);
    if (!reference) continue;
    const actual = {
      position: state.world.ship.kinematics.position,
      velocity: state.world.ship.kinematics.velocity,
    };
    const target = { position: vector(reference.position), velocity: vector(reference.velocity) };
    const positionErrorM = distance(actual.position, target.position);
    const velocityErrorMps = distance(actual.velocity, target.velocity);
    samples.push({
      t,
      positionErrorM,
      velocityErrorMps,
      expected: target,
      actual,
      passed:
        positionErrorM <= vectors.tolerance.ship_position_m &&
        velocityErrorMps <= vectors.tolerance.ship_velocity_m_s,
    });
  }
  return {
    dt,
    samples,
    impacts,
    maxPositionErrorM: Math.max(0, ...samples.map((x) => x.positionErrorM)),
    maxVelocityErrorMps: Math.max(0, ...samples.map((x) => x.velocityErrorMps)),
    passed: impacts === 0 && samples.length === expected.length && samples.every((x) => x.passed),
  };
}

function checkCase(
  id: string,
  source: string,
  initial: StateVector,
  impulses: readonly Impulse[],
  expected: readonly StateVector[],
): ReferenceCase {
  const resolutions = [8, 4, 2].map((dt) => resolution(initial, impulses, expected, dt));
  const last = resolutions.map((r) => r.samples.at(-1)?.actual);
  const difference = (key: 'position' | 'velocity'): [number, number] => {
    const [a, b, c] = last;
    return a && b && c ? [distance(a[key], b[key]), distance(b[key], c[key])] : [0, 0];
  };
  const positionDifferenceM = difference('position');
  const velocityDifferenceMps = difference('velocity');
  const ratio = (values: readonly [number, number]): number | null =>
    values[1] > 0 ? values[0] / values[1] : null;
  const positionRatio = ratio(positionDifferenceM);
  const velocityRatio = ratio(velocityDifferenceMps);
  const convergence = {
    positionDifferenceM,
    velocityDifferenceMps,
    positionRatio,
    velocityRatio,
    passed:
      last.every(Boolean) &&
      positionRatio !== null &&
      velocityRatio !== null &&
      positionRatio > 3 &&
      positionRatio < 5 &&
      velocityRatio > 3 &&
      velocityRatio < 5,
    interpretation:
      'Endpoint successive-resolution differences; ratio near 4 checks second-order convergence, independently of reference error.',
  };
  return {
    id,
    source,
    acceptedAtDtSeconds: 2,
    input: initial,
    impulses,
    resolutions,
    convergence,
    passed: resolutions.at(-1)!.passed && convergence.passed,
  };
}

export function runReferenceChecks(): ReferenceReport {
  const informed = vectors.informed_exit;
  const wrong = vectors.wrong_law.case;
  const cases = [
    checkCase(
      's8-informed-body-track',
      'tools/studies/s8/ring-witness.json',
      informed.initial_ship,
      informed.commands.map((x) => ({ t: x.t, deltaV: x.delta_v })),
      [
        ...witness.snapshots.filter((x) => [3600, 7200, 82800, 108000, 241200].includes(x.t)),
        {
          t: informed.expected.exit_t,
          position: informed.expected.exit_position,
          velocity: informed.expected.exit_velocity,
        },
      ],
    ),
    checkCase(
      's8-wrong-law-plan-last-safe-state',
      'tools/studies/s8/vectors.json',
      { t: 0, ...wrong.initial },
      wrong.commands.map((x) => ({
        t: x.t,
        deltaV: x.delta_v_vector.map((v) => (v === 0 ? 0 : v)),
      })),
      wrong.samples.filter((x) => [600, 3000, 6000, 9000, 12000, 14960].includes(x.t)),
    ),
  ];
  return {
    kind: 'numerical-reference',
    passed: cases.every((x) => x.passed),
    sourceCommit: inputs.source_commit,
    sources: [
      'tools/studies/s8/inputs.json',
      'tools/studies/s8/vectors.json',
      'tools/studies/s8/ring-witness.json',
      'docs/studies/s8/seeds.md',
    ],
    method:
      'Production createSimulation.run, moving two-body inverse-2.5 law; imported inertial impulses at their exact epochs; 8/4/2 s steps. No author-side trajectory search.',
    tolerance: vectors.tolerance,
    cases,
    sourceFindings: {
      kind: 'imported-study-findings-not-production-admission',
      rejected: vectors.rejected_seed,
      candidateOffsetsDegrees: [-15, -10, -5, 0, 5, 10, 15],
      interpretation:
        'S8 candidate catalogue is body-only until full-session admission; +25° lacks a witness in its finite first-window search. The historical strict low-orbit-plus-16 m/s-exit rule rejected 13/13 for lack of a certificate, not demonstrated impossibility. A18(3) supersedes that cumulative-cap policy by excluding science burns from departure accounting; the historical rejection is not current admission policy. S8 uses an independent RNG; names are not game seed IDs.',
    },
    blocked: [
      'Full-session S8 seed/arrival admission requires the content owner certificate and finite-burn/control neighborhood tests.',
      'S5 wells/lattice acceptance awaits delivered providers implementing approved A15/A16 semantics; geometry-only vectors cannot establish damage or blind survival.',
      'S4 both-branch/cross-transfer state continuity and C05 bypass costs await expedition and content providers.',
      'S6 moving opening, partial crossing and surviving-state Earth checks await 4D and Q22–Q28 implementations.',
    ],
    limits: [
      'Numerical reference only, not player evidence, a finite-burn route, resource feasibility, forecast performance, seed admission or human playtest.',
      'Massless rocks omitted from both selected tracks: they do not gravitate, but omitted collision/exposure means no full-field clearance claim. Informed track continues to the exact stored outward-exit sample, not an interpolated gate event.',
      'Ship systems are inert during these mechanics checks. Imported impulses carry no power, fuel, heat or attitude authority claim.',
      'Wrong-law case is the true-law trajectory of the mistaken plan; last sample is the stored safe 14960 s epoch. Refined 14967.085322 s contact and warning/abort UI claims are not tested here.',
      'S8 reference has analytic circular body ephemerides; production integrates both moving bodies. Resolution errors include that difference. S8 reference source hash predates the current baseline.',
      'Acceptance is at 2 s; 8/4 s runs are convergence controls and their out-of-tolerance samples remain reported. Coarse failures are not accepted flight resolutions.',
    ],
  };
}
