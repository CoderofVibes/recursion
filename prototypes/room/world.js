// Toy local environment for the composition mock-up: enough motion to show the window and the
// flight hologram agreeing. NOT the simulation: ordinary inverse-square pull, no ship systems.
// Frame: x right, z toward the viewer; heading 0 faces -z; positive heading turns left.

export const SENSOR = { half: 0.46, range: 150, omni: 24 };

export function makeWorld(seed = 11) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  const bodies = [
    { id: 'M1', x: -84, z: -262, r: 58, mu: 1500 },
    { id: 'M2', x: 196, z: -446, r: 26, mu: 380 },
  ];
  const rocks0 = [];
  while (rocks0.length < 96) {
    const x = (rnd() - 0.5) * 380;
    const z = -18 - rnd() * 400;
    if (Math.abs(x) < 9 && z > -70) continue;
    if (bodies.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + 10)) continue;
    rocks0.push({
      x,
      z,
      vx: (rnd() - 0.5) * 1.1,
      vz: (rnd() - 0.5) * 1.1,
      r: 0.8 + rnd() ** 2 * 3.6,
      spin: rnd() * 6.28,
      tilt: rnd() * 3,
    });
  }
  const big0 = { id: 'A-17', x: 41, z: -168, vx: -1.72, vz: 5.3, r: 8.5 };
  const fences = [-74, -96, -118].map((z, i) => ({ z, x: (i - 1) * 9, w: 150, h: 46 }));

  const w = { bodies, fences, rocks: [], big: null, ship: null, t: 0, trail: [], lost: false };

  w.reset = () => {
    w.rocks = rocks0.map((r) => ({ ...r, seen: false, live: false, sx: r.x, sz: r.z }));
    w.big = { ...big0, seen: false, live: false };
    w.ship = { x: 0, z: 0, vx: 0, vz: -6, th: 0, om: 0, prop: 1, fwd: 0, lat: 0, yaw: 0 };
    w.t = 0;
    w.trail = [0, 0];
    w.lost = false;
    w.sense();
  };

  w.gravity = (x, z) => {
    let ax = 0;
    let az = 0;
    for (const b of bodies) {
      const dx = b.x - x;
      const dz = b.z - z;
      const d = Math.max(Math.hypot(dx, dz), b.r);
      ax += (b.mu * dx) / d ** 3;
      az += (b.mu * dz) / d ** 3;
    }
    return [ax, az];
  };

  w.inCoverage = (x, z) => {
    const sh = w.ship;
    const dx = x - sh.x;
    const dz = z - sh.z;
    const d = Math.hypot(dx, dz);
    if (d < SENSOR.omni) return true;
    if (d > SENSOR.range) return false;
    const fx = -Math.sin(sh.th);
    const fz = -Math.cos(sh.th);
    return Math.acos(Math.min(1, Math.max(-1, (dx * fx + dz * fz) / d))) < SENSOR.half;
  };

  w.sense = () => {
    for (const r of w.rocks) {
      r.live = w.inCoverage(r.x, r.z);
      if (r.live) {
        r.seen = true;
        r.sx = r.x;
        r.sz = r.z;
      }
    }
    w.big.live = w.inCoverage(w.big.x, w.big.z);
    if (w.big.live) w.big.seen = true;
  };

  /** inp: fwd, lat (left positive), yaw (left positive), each -1..1. */
  w.step = (dt, inp) => {
    const sh = w.ship;
    sh.fwd = inp.fwd;
    sh.lat = inp.lat;
    sh.yaw = inp.yaw;
    sh.om += inp.yaw * 0.4 * dt;
    if (!inp.yaw) sh.om *= Math.exp(-2.2 * dt); // attitude hold damps the rate
    sh.th += sh.om * dt;
    const fx = -Math.sin(sh.th);
    const fz = -Math.cos(sh.th);
    const lx = -Math.cos(sh.th);
    const lz = Math.sin(sh.th);
    const [gx, gz] = w.gravity(sh.x, sh.z);
    const af = inp.fwd > 0 ? 1.3 * inp.fwd : 0.5 * inp.fwd;
    const al = 0.5 * inp.lat;
    sh.vx += (gx + fx * af + lx * al) * dt;
    sh.vz += (gz + fz * af + lz * al) * dt;
    sh.x += sh.vx * dt;
    sh.z += sh.vz * dt;
    const burn = Math.abs(af) * 0.004 + Math.abs(al) * 0.003 + Math.abs(inp.yaw) * 0.001;
    sh.prop = Math.max(0, sh.prop - burn * dt);
    for (const r of w.rocks) {
      r.x += r.vx * dt;
      r.z += r.vz * dt;
      r.spin += dt * 0.2;
    }
    w.big.x += w.big.vx * dt;
    w.big.z += w.big.vz * dt;
    w.t += dt;
    const n = w.trail.length;
    if (Math.hypot(sh.x - w.trail[n - 2], sh.z - w.trail[n - 1]) > 1.2) w.trail.push(sh.x, sh.z);
    w.sense();
    // Whole-ship contact, crudely: a 2-unit disc.
    const hit = (o) => Math.hypot(o.x - sh.x, o.z - sh.z) < o.r + 2;
    if (hit(w.big) || w.rocks.some(hit) || bodies.some(hit)) w.lost = true;
  };

  /** Coasting forecast from the current state: [{x, z, t}]. */
  w.forecast = (horizon = 22, n = 88) => {
    const sh = w.ship;
    const out = [];
    let x = sh.x;
    let z = sh.z;
    let vx = sh.vx;
    let vz = sh.vz;
    const dt = horizon / n;
    for (let i = 0; i <= n; i++) {
      out.push({ x, z, t: i * dt });
      const [gx, gz] = w.gravity(x, z);
      vx += gx * dt;
      vz += gz * dt;
      x += vx * dt;
      z += vz * dt;
    }
    return out;
  };

  /** Closest approach of the big rock, straight-line: { d, t, range }. */
  w.cpa = () => {
    const sh = w.ship;
    const b = w.big;
    const rx = b.x - sh.x;
    const rz = b.z - sh.z;
    const vx = b.vx - sh.vx;
    const vz = b.vz - sh.vz;
    const v2 = vx * vx + vz * vz;
    const t = v2 > 1e-6 ? Math.max(0, -(rx * vx + rz * vz) / v2) : 0;
    return { d: Math.hypot(rx + vx * t, rz + vz * t), t, range: Math.hypot(rx, rz) };
  };

  w.reset();
  return w;
}
