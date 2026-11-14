/**
 * Independent numerical probe, not the production simulator or vector generator.
 * Run: node tools/physics/benchmark.mjs
 * SI units throughout. p = 2.5; K = GM * sqrt(r0), in m^3.5 s^-2.
 * Uses cached-acceleration kick-drift-kick velocity Verlet (one new force call
 * per step); no allocation inside the stepping loop. No randomness or packages.
 * Timings are this Node process on this host, NOT a browser performance promise.
 */
import { performance } from 'node:perf_hooks';

const GM1 = 1e10;
const GM2 = 2.5e9;
const R0 = 1e6;
const D = 4e6;
const K1 = GM1 * Math.sqrt(R0);
const K2 = GM2 * Math.sqrt(R0);
const OMEGA = Math.sqrt((K1 + K2) / D ** 3.5);

// Layout: [x1,y1,vx1,vy1, x2,y2,vx2,vy2, xs,ys,vxs,vys].
function initialBinary() {
  const q = GM2 / (GM1 + GM2);
  const x1 = -q * D;
  const x2 = (1 - q) * D;
  return new Float64Array([x1, 0, 0, OMEGA * x1,
    x2, 0, 0, OMEGA * x2, 0, 2e6, 45, 0]);
}

function accelerations(s, a) {
  let dx = s[4] - s[0];
  let dy = s[5] - s[1];
  let f = 1 / (dx * dx + dy * dy) ** 1.75;
  a[0] = K2 * dx * f;
  a[1] = K2 * dy * f;
  a[2] = -K1 * dx * f;
  a[3] = -K1 * dy * f;
  dx = s[0] - s[8];
  dy = s[1] - s[9];
  f = K1 / (dx * dx + dy * dy) ** 1.75;
  a[4] = dx * f;
  a[5] = dy * f;
  dx = s[4] - s[8];
  dy = s[5] - s[9];
  f = K2 / (dx * dx + dy * dy) ** 1.75;
  a[4] += dx * f;
  a[5] += dy * f;
}

function advanceBinary(s, a, h, count) {
  const half = h / 2;
  for (let n = 0; n < count; n++) {
    for (let body = 0; body < 3; body++) {
      const i = 4 * body;
      const j = 2 * body;
      s[i + 2] += half * a[j];
      s[i + 3] += half * a[j + 1];
      s[i] += h * s[i + 2];
      s[i + 1] += h * s[i + 3];
    }
    accelerations(s, a);
    for (let body = 0; body < 3; body++) {
      const i = 4 * body;
      const j = 2 * body;
      s[i + 2] += half * a[j];
      s[i + 3] += half * a[j + 1];
    }
  }
}

function integrateBinary(h, duration = 10000) {
  const s = initialBinary();
  const a = new Float64Array(6);
  const count = Math.round(duration / h);
  if (count * h !== duration) throw new Error('Duration must be an integer number of steps.');
  accelerations(s, a);
  advanceBinary(s, a, h, count);
  if (!s.every(Number.isFinite)) throw new Error('Non-finite state.');
  return s;
}

function stateError(s, reference) {
  let position = 0;
  let velocity = 0;
  for (let body = 0; body < 3; body++) {
    const i = body * 4;
    position = Math.max(position, Math.hypot(s[i] - reference[i], s[i + 1] - reference[i + 1]));
    velocity = Math.max(velocity, Math.hypot(s[i + 2] - reference[i + 2], s[i + 3] - reference[i + 3]));
  }
  return { max_body_position_error_m: position, max_body_velocity_error_m_s: velocity };
}

// Independent scalar single-body integration with diagnostics at every step.
function singleBodyProbe(radius, h, circular, duration) {
  const vc = Math.sqrt(K1 / radius ** 1.5);
  let x = radius, y = 0, vx = 0, vy = (circular ? 1 : 0.9) * vc;
  let ax = -K1 / radius ** 2.5, ay = 0;
  const energy = () => 0.5 * (vx * vx + vy * vy) - K1 / (1.5 * Math.hypot(x, y) ** 1.5);
  const e0 = energy();
  let maximum = 0, firstHalfMaximum = 0, minRadius = radius;
  const count = Math.round(duration / h);
  const elapsed = count * h;
  for (let i = 0; i < count; i++) {
    vx += 0.5 * h * ax;
    vy += 0.5 * h * ay;
    x += h * vx;
    y += h * vy;
    const r = Math.hypot(x, y);
    const factor = -K1 / r ** 3.5;
    ax = factor * x;
    ay = factor * y;
    vx += 0.5 * h * ax;
    vy += 0.5 * h * ay;
    const error = Math.abs((energy() - e0) / e0);
    maximum = Math.max(maximum, error);
    if (i < count / 2) firstHalfMaximum = Math.max(firstHalfMaximum, error);
    minRadius = Math.min(minRadius, r);
  }
  const result = {
    radius_m: radius, dt_s: h, initial_tangential_speed_fraction: circular ? 1 : 0.9,
    elapsed_s: elapsed, steps: count, min_radius_m: minRadius,
    max_relative_energy_error: maximum, first_half_max_relative_energy_error: firstHalfMaximum,
    final_relative_energy_error: (energy() - e0) / e0,
  };
  if (circular) {
    const angle = vc / radius * elapsed;
    result.final_position_error_m = Math.hypot(x - radius * Math.cos(angle), y - radius * Math.sin(angle));
    result.final_phase_error_rad = Math.atan2(
      y * Math.cos(angle) - x * Math.sin(angle), x * Math.cos(angle) + y * Math.sin(angle));
  }
  return result;
}

const reference = integrateBinary(0.0625);
const refinedReference = integrateBinary(0.03125);
const convergence = [2, 1, 0.5, 0.25].map(h => ({ dt_s: h, ...stateError(integrateBinary(h), refinedReference) }));
const circularPeriod = 2 * Math.PI * Math.sqrt(R0 ** 3.5 / K1);
const closeRadius = 4e5;
const closePeriod = 2 * Math.PI * Math.sqrt(closeRadius ** 3.5 / K1);
const conservation = [
  singleBodyProbe(R0, 2, true, 10 * circularPeriod),
  singleBodyProbe(R0, 1, true, 10 * circularPeriod),
  singleBodyProbe(closeRadius, 2, true, 10 * closePeriod),
  singleBodyProbe(closeRadius, 1, true, 10 * closePeriod),
  singleBodyProbe(R0, 2, false, 20 * circularPeriod),
  singleBodyProbe(R0, 1, false, 20 * circularPeriod),
];

// Fresh states are allocated before each timer. Warm up the same 100k-step path.
const samples = [];
let checksum = 0;
for (let i = 0; i < 12; i++) {
  const s = initialBinary();
  const a = new Float64Array(6);
  accelerations(s, a);
  const start = performance.now();
  advanceBinary(s, a, 0.1, 100000);
  const elapsed = performance.now() - start;
  checksum += s[8] + s[9] + s[10] + s[11];
  if (i >= 3) samples.push(elapsed);
}
samples.sort((a, b) => a - b);
const output = {
  status: 'Research prototype only; production/browser acceptance remains unverified.',
  runtime: process.version,
  model: { exponent: 2.5, GM_primary_m3_s2: GM1, GM_secondary_m3_s2: GM2, r0_m: R0, separation_m: D },
  method: 'Cached-acceleration kick-drift-kick velocity Verlet; no inner-loop allocation; mutually moving bodies plus massless ship.',
  convergence_duration_s: 10000,
  refinement: { coarse_dt_s: 0.0625, fine_dt_s: 0.03125, ...stateError(reference, refinedReference) },
  convergence,
  conservation,
  timing: {
    steps: 100000, dt_s: 0.1, force_evaluations_in_timed_loop: 100000,
    pair_or_source_contributions_per_force_evaluation: 3,
    warmups: 3, measured_runs: samples.length, minimum_ms: samples[0],
    median_ms: samples[Math.floor(samples.length / 2)], maximum_ms: samples.at(-1), checksum,
    excluded: 'UI, output sampling, sensing, collisions, ship systems, recording, workers and browser overhead.',
  },
};
if (convergence[1].max_body_position_error_m > 0.1 || convergence[1].max_body_velocity_error_m_s > 1e-5) {
  throw new Error('One-second fixture convergence exceeded the proposed 0.1 m / 1e-5 m/s target.');
}
console.log(JSON.stringify(output, null, 2));
