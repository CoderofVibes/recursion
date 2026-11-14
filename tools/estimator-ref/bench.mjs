// Timing probe for the estimator spec (docs/model/estimator-spec.md section 4.7).
//
//   node tools/estimator-ref/bench.mjs
//
// Plain JavaScript, typed arrays, no dependencies. It times the three inner
// loops a browser implementation needs, at the sizes the spec quotes:
//   1. one Gauss-Newton iteration of a Tier L window fit (5 parameters, 40 fixes)
//   2. one Gauss-Newton iteration of a Tier G arc (state + 6 global parameters)
//   3. one forecast with sensitivities (4 state + 20 mode columns, 2000 steps)
// Sensitivities are propagated with the variational equations (spec 4.3), one
// body, power-law gravity. This measures arithmetic cost only: no UI, no worker
// messaging, no IndexedDB. Node's V8 is the same engine as Chrome's.

const R0 = 1e6;

// State y = [x, y, vx, vy], sensitivity S = d(state)/d(q) for nq columns, stored
// column-major in a Float64Array of length 4*nq. Parameter columns:
//   0..3 initial state, 4 = mu (or scale g), 5 = exponent n, 6.. = dummy acceleration modes.
function deriv(y, S, nq, mu, n, dy, dS) {
  const x = y[0], yy = y[1];
  const r2 = x * x + yy * yy, r = Math.sqrt(r2);
  const k = (mu / (R0 * R0)) * Math.pow(R0 / r, n) / r; // a = -k * pos
  dy[0] = y[2]; dy[1] = y[3]; dy[2] = -k * x; dy[3] = -k * yy;
  // gravity gradient: da/dpos = -k I + k (n+1) pos pos^T / r^2
  const c = k * (n + 1) / r2;
  const gxx = -k + c * x * x, gxy = c * x * yy, gyy = -k + c * yy * yy;
  const lnr = Math.log(R0 / r);
  for (let j = 0; j < nq; j++) {
    const o = 4 * j;
    const sx = S[o], sy = S[o + 1];
    dS[o] = S[o + 2]; dS[o + 1] = S[o + 3];
    let ax = gxx * sx + gxy * sy, ay = gxy * sx + gyy * sy;
    if (j === 4) { ax += -k * x / mu; ay += -k * yy / mu; }            // d a / d mu
    else if (j === 5) { ax += -k * x * lnr; ay += -k * yy * lnr; }     // d a / d n
    else if (j > 5) { ax += -k * x * 1e-3; ay += -k * yy * 1e-3; }     // a mode column
    dS[o + 2] = ax; dS[o + 3] = ay;
  }
}

function makeWork(nq) {
  const m = 4 * nq;
  return { k1: new Float64Array(4), k2: new Float64Array(4), k3: new Float64Array(4), k4: new Float64Array(4), yt: new Float64Array(4),
           K1: new Float64Array(m), K2: new Float64Array(m), K3: new Float64Array(m), K4: new Float64Array(m), St: new Float64Array(m) };
}

function rk4(y, S, nq, mu, n, h, w) {
  const m = 4 * nq;
  deriv(y, S, nq, mu, n, w.k1, w.K1);
  for (let i = 0; i < 4; i++) w.yt[i] = y[i] + 0.5 * h * w.k1[i];
  for (let i = 0; i < m; i++) w.St[i] = S[i] + 0.5 * h * w.K1[i];
  deriv(w.yt, w.St, nq, mu, n, w.k2, w.K2);
  for (let i = 0; i < 4; i++) w.yt[i] = y[i] + 0.5 * h * w.k2[i];
  for (let i = 0; i < m; i++) w.St[i] = S[i] + 0.5 * h * w.K2[i];
  deriv(w.yt, w.St, nq, mu, n, w.k3, w.K3);
  for (let i = 0; i < 4; i++) w.yt[i] = y[i] + h * w.k3[i];
  for (let i = 0; i < m; i++) w.St[i] = S[i] + h * w.K3[i];
  deriv(w.yt, w.St, nq, mu, n, w.k4, w.K4);
  for (let i = 0; i < 4; i++) y[i] += (h / 6) * (w.k1[i] + 2 * w.k2[i] + 2 * w.k3[i] + w.k4[i]);
  for (let i = 0; i < m; i++) S[i] += (h / 6) * (w.K1[i] + 2 * w.K2[i] + 2 * w.K3[i] + w.K4[i]);
}

// One Gauss-Newton iteration: propagate with sensitivities, accumulate the normal
// equations from bearing + range rows at every `every`-th step, solve by Cholesky.
function iteration(nq, steps, every, h, mu, n) {
  const y = new Float64Array([R0, 0, 0, Math.sqrt(mu / R0)]);
  const S = new Float64Array(4 * nq);
  for (let j = 0; j < 4; j++) S[4 * j + j] = 1;
  const w = makeWork(nq);
  const H = new Float64Array(nq * nq), g = new Float64Array(nq), row = new Float64Array(nq);
  let rows = 0;
  for (let s = 0; s < steps; s++) {
    rk4(y, S, nq, mu, n, h, w);
    if (s % every === 0) {
      const x = y[0], yy = y[1], r2 = x * x + yy * yy, r = Math.sqrt(r2);
      for (let comp = 0; comp < 2; comp++) {
        const hx = comp === 0 ? yy / r2 : x / r, hy = comp === 0 ? -x / r2 : yy / r;
        const sig = comp === 0 ? 4e-5 : 2e-3 * r;
        for (let j = 0; j < nq; j++) row[j] = (hx * S[4 * j] + hy * S[4 * j + 1]) / sig;
        for (let a = 0; a < nq; a++) { g[a] += row[a] * 0.5; for (let b = 0; b <= a; b++) H[a * nq + b] += row[a] * row[b]; }
        rows++;
      }
    }
  }
  // Cholesky solve with diagonal scaling (normal matrix is tiny).
  const d = new Float64Array(nq);
  for (let a = 0; a < nq; a++) d[a] = 1 / Math.sqrt(H[a * nq + a] || 1);
  for (let a = 0; a < nq; a++) for (let b = 0; b <= a; b++) H[a * nq + b] *= d[a] * d[b];
  for (let a = 0; a < nq; a++) H[a * nq + a] += 1e-9;
  for (let a = 0; a < nq; a++) {
    for (let b = 0; b <= a; b++) {
      let sum = H[a * nq + b];
      for (let k = 0; k < b; k++) sum -= H[a * nq + k] * H[b * nq + k];
      H[a * nq + b] = a === b ? Math.sqrt(Math.max(sum, 1e-300)) : sum / H[b * nq + b];
    }
  }
  return rows + H[0] * 0 + g[0] * 0;
}

function time(label, fn, reps) {
  for (let i = 0; i < 20; i++) fn(); // warm up the JIT
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  const ms = (performance.now() - t0) / reps;
  console.log(`${label.padEnd(74)} ${ms.toFixed(3).padStart(9)} ms`);
  return ms;
}

console.log(`node ${process.version}, ${process.arch}`);
const mu = 1e10, n = 2.5;
const a = time("Tier L window fit: 1 iteration (5 params, 120 steps of 60 s, 40 fixes)", () => iteration(5, 120, 3, 60, mu, n), 2000);
const b = time("Tier G arc: 1 iteration (10 params, 4320 steps of 10 s = 12 h, 240 fixes)", () => iteration(10, 4320, 18, 10, mu, n), 200);
const c = time("Tier G arc at 1 s steps (10 params, 43200 steps = 12 h, 240 fixes)", () => iteration(10, 43200, 180, 1, mu, n), 20);
const f = time("Forecast with sensitivities (24 columns, 2000 steps)", () => iteration(24, 2000, 2000, 10, mu, n), 200);
const f2 = time("Forecast with sensitivities at 1 s steps (24 columns, 28800 steps = 8 h)", () => iteration(24, 28800, 28800, 1, mu, n), 20);
console.log("");
console.log(`Tier L, 30 windows x 4 iterations:                 ${(a * 120).toFixed(1)} ms`);
console.log(`Tier G rebuild, 10 arcs x 6 iterations (10 s):     ${(b * 60).toFixed(0)} ms`);
console.log(`Tier G rebuild, 10 arcs x 6 iterations (1 s):      ${(c * 60).toFixed(0)} ms`);
