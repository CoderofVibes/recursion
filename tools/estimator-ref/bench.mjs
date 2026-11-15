// Timing probe for the estimator spec (docs/model/estimator-spec.md section 4.7).
//
//   node tools/estimator-ref/bench.mjs
//
// Plain JavaScript, typed arrays, no dependencies. It times the three inner
// loops a browser implementation needs, at the sizes the spec quotes, twice:
// with the planar state of revision 2 (4 numbers) and with the 3D state of
// revision 3 (6 numbers, three measurement rows per fix):
//   1. one Gauss-Newton iteration of a Tier L window fit
//   2. one Gauss-Newton iteration of a Tier G arc
//   3. one forecast with sensitivities
// Sensitivities are propagated with the variational equations (spec 4.3), one
// body, power-law gravity. This measures arithmetic cost only: no UI, no worker
// messaging, no IndexedDB. Node's V8 is the same engine as Chrome's.

const R0 = 1e6;

// ---------------------------------------------------------------------------
// Planar (revision 2). State y = [x, y, vx, vy], sensitivity S = d(state)/d(q)
// for nq columns, column-major in a Float64Array of length 4*nq. Columns:
//   0..3 initial state, 4 = mu (or scale g), 5 = exponent n, 6.. = dummy acceleration modes.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// 3D (revision 3). State y = [x, y, z, vx, vy, vz], S column-major, 6*nq.
// Columns: 0..5 initial state, 6 = mu (or scale g), 7 = exponent n, 8.. = modes.
// ---------------------------------------------------------------------------
function deriv3(y, S, nq, mu, n, dy, dS) {
  const x = y[0], yy = y[1], z = y[2];
  const r2 = x * x + yy * yy + z * z, r = Math.sqrt(r2);
  const k = (mu / (R0 * R0)) * Math.pow(R0 / r, n) / r;
  dy[0] = y[3]; dy[1] = y[4]; dy[2] = y[5]; dy[3] = -k * x; dy[4] = -k * yy; dy[5] = -k * z;
  const c = k * (n + 1) / r2;
  const gxx = -k + c * x * x, gxy = c * x * yy, gxz = c * x * z;
  const gyy = -k + c * yy * yy, gyz = c * yy * z, gzz = -k + c * z * z;
  const lnr = Math.log(R0 / r);
  for (let j = 0; j < nq; j++) {
    const o = 6 * j;
    const sx = S[o], sy = S[o + 1], sz = S[o + 2];
    dS[o] = S[o + 3]; dS[o + 1] = S[o + 4]; dS[o + 2] = S[o + 5];
    let ax = gxx * sx + gxy * sy + gxz * sz;
    let ay = gxy * sx + gyy * sy + gyz * sz;
    let az = gxz * sx + gyz * sy + gzz * sz;
    if (j === 6) { ax += -k * x / mu; ay += -k * yy / mu; az += -k * z / mu; }
    else if (j === 7) { ax += -k * x * lnr; ay += -k * yy * lnr; az += -k * z * lnr; }
    else if (j > 7) { ax += -k * x * 1e-3; ay += -k * yy * 1e-3; az += -k * z * 1e-3; }
    dS[o + 3] = ax; dS[o + 4] = ay; dS[o + 5] = az;
  }
}

function makeWork(dim, nq) {
  const m = dim * nq;
  const f = (len) => new Float64Array(len);
  return { k1: f(dim), k2: f(dim), k3: f(dim), k4: f(dim), yt: f(dim), K1: f(m), K2: f(m), K3: f(m), K4: f(m), St: f(m) };
}

function rk4(der, dim, y, S, nq, mu, n, h, w) {
  const m = dim * nq;
  der(y, S, nq, mu, n, w.k1, w.K1);
  for (let i = 0; i < dim; i++) w.yt[i] = y[i] + 0.5 * h * w.k1[i];
  for (let i = 0; i < m; i++) w.St[i] = S[i] + 0.5 * h * w.K1[i];
  der(w.yt, w.St, nq, mu, n, w.k2, w.K2);
  for (let i = 0; i < dim; i++) w.yt[i] = y[i] + 0.5 * h * w.k2[i];
  for (let i = 0; i < m; i++) w.St[i] = S[i] + 0.5 * h * w.K2[i];
  der(w.yt, w.St, nq, mu, n, w.k3, w.K3);
  for (let i = 0; i < dim; i++) w.yt[i] = y[i] + h * w.k3[i];
  for (let i = 0; i < m; i++) w.St[i] = S[i] + h * w.K3[i];
  der(w.yt, w.St, nq, mu, n, w.k4, w.K4);
  for (let i = 0; i < dim; i++) y[i] += (h / 6) * (w.k1[i] + 2 * w.k2[i] + 2 * w.k3[i] + w.k4[i]);
  for (let i = 0; i < m; i++) S[i] += (h / 6) * (w.K1[i] + 2 * w.K2[i] + 2 * w.K3[i] + w.K4[i]);
}

function accumulate(H, g, row, nq) {
  for (let a = 0; a < nq; a++) { g[a] += row[a] * 0.5; for (let b = 0; b <= a; b++) H[a * nq + b] += row[a] * row[b]; }
}

// Cholesky factorisation with diagonal scaling (the normal matrix is tiny).
function cholesky(H, nq) {
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
}

// One planar Gauss-Newton iteration: propagate with sensitivities, accumulate the
// normal equations from bearing + range rows at every `every`-th step, factorise.
function iteration(nq, steps, every, h, mu, n) {
  const y = new Float64Array([R0, 0, 0, Math.sqrt(mu / R0)]);
  const S = new Float64Array(4 * nq);
  for (let j = 0; j < 4; j++) S[4 * j + j] = 1;
  const w = makeWork(4, nq);
  const H = new Float64Array(nq * nq), g = new Float64Array(nq), row = new Float64Array(nq);
  let rows = 0;
  for (let s = 0; s < steps; s++) {
    rk4(deriv, 4, y, S, nq, mu, n, h, w);
    if (s % every === 0) {
      const x = y[0], yy = y[1], r2 = x * x + yy * yy, r = Math.sqrt(r2);
      for (let comp = 0; comp < 2; comp++) {
        const hx = comp === 0 ? yy / r2 : x / r, hy = comp === 0 ? -x / r2 : yy / r;
        const sig = comp === 0 ? 4e-5 : 2e-3 * r;
        for (let j = 0; j < nq; j++) row[j] = (hx * S[4 * j] + hy * S[4 * j + 1]) / sig;
        accumulate(H, g, row, nq);
        rows++;
      }
    }
  }
  cholesky(H, nq);
  return rows + H[0] * 0 + g[0] * 0;
}

// One 3D Gauss-Newton iteration on an orbit inclined 50 deg: three rows per fix
// (east and north in the tangent plane at the line of sight, and range).
function iteration3(nq, steps, every, h, mu, n) {
  const v = Math.sqrt(mu / R0), ci = Math.cos(0.8727), si = Math.sin(0.8727);
  const y = new Float64Array([R0, 0, 0, 0, v * ci, v * si]);
  const S = new Float64Array(6 * nq);
  for (let j = 0; j < 6; j++) S[6 * j + j] = 1;
  const w = makeWork(6, nq);
  const H = new Float64Array(nq * nq), g = new Float64Array(nq), row = new Float64Array(nq);
  let rows = 0;
  for (let s = 0; s < steps; s++) {
    rk4(deriv3, 6, y, S, nq, mu, n, h, w);
    if (s % every === 0) {
      const x = y[0], yy = y[1], z = y[2];
      const r = Math.sqrt(x * x + yy * yy + z * z);
      const px = -x / r, py = -yy / r, pz = -z / r;           // line of sight, ship to body
      const ch = Math.hypot(px, py) || 1e-300;
      const ex = -py / ch, ey = px / ch;                      // east (ez = 0)
      const nx = -pz * px / ch, ny = -pz * py / ch, nz = ch;  // north
      const sb = 4e-5 * r, sr = 2e-3 * r;
      for (let comp = 0; comp < 3; comp++) {
        const hx = comp === 0 ? ex / sb : comp === 1 ? nx / sb : px / sr;
        const hy = comp === 0 ? ey / sb : comp === 1 ? ny / sb : py / sr;
        const hz = comp === 0 ? 0 : comp === 1 ? nz / sb : pz / sr;
        for (let j = 0; j < nq; j++) row[j] = hx * S[6 * j] + hy * S[6 * j + 1] + hz * S[6 * j + 2];
        accumulate(H, g, row, nq);
        rows++;
      }
    }
  }
  cholesky(H, nq);
  return rows + H[0] * 0 + g[0] * 0;
}

function time(label, fn, reps) {
  for (let i = 0; i < 20; i++) fn(); // warm up the JIT
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) fn();
  const ms = (performance.now() - t0) / reps;
  console.log(`${label.padEnd(84)} ${ms.toFixed(3).padStart(9)} ms`);
  return ms;
}

console.log(`node ${process.version}, ${process.arch}`);
const mu = 1e10, n = 2.5;

console.log("\nPlanar (revision 2): 4-state, 2 rows per fix");
const a = time("Tier L window fit: 1 iteration (5 params, 120 steps of 60 s, 40 fixes)", () => iteration(5, 120, 3, 60, mu, n), 2000);
const b = time("Tier G arc: 1 iteration (10 params, 4320 steps of 10 s = 12 h, 240 fixes)", () => iteration(10, 4320, 18, 10, mu, n), 200);
const c = time("Tier G arc at 1 s steps (10 params, 43200 steps = 12 h, 240 fixes)", () => iteration(10, 43200, 180, 1, mu, n), 20);
time("Forecast with sensitivities (24 columns, 2000 steps)", () => iteration(24, 2000, 2000, 10, mu, n), 200);
time("Forecast with sensitivities at 1 s steps (24 columns, 28800 steps = 8 h)", () => iteration(24, 28800, 28800, 1, mu, n), 20);
console.log(`Tier L, 30 windows x 4 iterations:                 ${(a * 120).toFixed(1)} ms`);
console.log(`Tier G rebuild, 10 arcs x 6 iterations (10 s):     ${(b * 60).toFixed(0)} ms`);
console.log(`Tier G rebuild, 10 arcs x 6 iterations (1 s):      ${(c * 60).toFixed(0)} ms`);

// 3D sizes. Tier L: 6 state + g = 7. Tier G arc: 6 state + mu, n, kE, dE, dP, kA,
// kR and three camera components = 16. Forecast: 6 state + 2 hedge + kE, dE, dP +
// mu + 20 profile nodes = 32 columns.
console.log("\n3D (revision 3): 6-state, 3 rows per fix");
const a3 = time("Tier L window fit: 1 iteration (7 params, 120 steps of 60 s, 40 fixes)", () => iteration3(7, 120, 3, 60, mu, n), 2000);
time("Present-state fit: 1 iteration (11 params, 240 steps of 60 s, 80 fixes)", () => iteration3(11, 240, 3, 60, mu, n), 1000);
const b3 = time("Tier G arc: 1 iteration (16 params, 4320 steps of 10 s = 12 h, 240 fixes)", () => iteration3(16, 4320, 18, 10, mu, n), 200);
const c3 = time("Tier G arc at 1 s steps (16 params, 43200 steps = 12 h, 240 fixes)", () => iteration3(16, 43200, 180, 1, mu, n), 20);
time("Forecast with sensitivities (32 columns, 2000 steps)", () => iteration3(32, 2000, 2000, 10, mu, n), 200);
time("Forecast with sensitivities at 1 s steps (32 columns, 28800 steps = 8 h)", () => iteration3(32, 28800, 28800, 1, mu, n), 20);
console.log(`Tier L, 30 windows x 4 iterations:                 ${(a3 * 120).toFixed(1)} ms`);
console.log(`Tier G rebuild, 10 arcs x 6 iterations (10 s):     ${(b3 * 60).toFixed(0)} ms`);
console.log(`Tier G rebuild, 10 arcs x 6 iterations (1 s):      ${(c3 * 60).toFixed(0)} ms`);
