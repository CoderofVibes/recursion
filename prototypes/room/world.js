// Toy local environment for the composition mock-up, in three dimensions: enough motion to show the
// window and the flight hologram agreeing. NOT the simulation: ordinary inverse-square pull, no ship
// systems. Frame: x right, y up, z toward the viewer; a ship with no rotation faces -z.
import * as THREE from 'three';

export const SENSOR = { half: 0.46, range: 150, omni: 24 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const AX = { x: V(1, 0, 0), y: V(0, 1, 0), z: V(0, 0, 1) };
const dq = new THREE.Quaternion();
const t1 = V(0, 0, 0);
const t2 = V(0, 0, 0);

export function makeWorld(seed = 11) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;

  const bodies = [
    { id: 'M1', p: V(-84, -26, -262), r: 58, mu: 1500 },
    { id: 'M2', p: V(196, 52, -446), r: 26, mu: 380 },
  ];
  const rocks0 = [];
  while (rocks0.length < 110) {
    const p = V((rnd() - 0.5) * 380, (rnd() - 0.5) * 120, -18 - rnd() * 400);
    if (Math.hypot(p.x, p.y) < 12 && p.z > -70) continue;
    if (bodies.some((b) => p.distanceTo(b.p) < b.r + 10)) continue;
    rocks0.push({
      p,
      v: V((rnd() - 0.5) * 1.1, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 1.1),
      r: 0.8 + rnd() ** 2 * 3.6,
      spin: rnd() * 6.28,
      tilt: rnd() * 3,
    });
  }
  const big0 = { id: 'A-17', p: V(41, 13, -168), v: V(-1.72, -0.5, 5.3), r: 8.5 };
  const fences = [-74, -96, -118].map((z, i) => ({ z, x: (i - 1) * 9, w: 150, h: 90 }));

  const w = { bodies, fences, rocks: [], big: null, ship: null, t: 0, trail: [], lost: false };

  w.reset = () => {
    w.rocks = rocks0.map((r) => ({ ...r, p: r.p.clone(), v: r.v.clone(), seen: false, live: false, sp: r.p.clone() }));
    w.big = { ...big0, p: big0.p.clone(), v: big0.v.clone(), seen: false, live: false };
    w.ship = { p: V(0, 0, 0), v: V(0, 0, -6), q: new THREE.Quaternion(), wy: 0, wp: 0, prop: 1, inp: { fwd: 0, lat: 0, vert: 0, yaw: 0, pitch: 0 } };
    w.t = 0;
    w.trail = [V(0, 0, 0)];
    w.lost = false;
    w.sense();
  };

  /** Unit vectors of the ship's body in the environment frame. */
  w.fwd = (out = V(0, 0, 0)) => out.set(0, 0, -1).applyQuaternion(w.ship.q);
  w.left = (out = V(0, 0, 0)) => out.set(-1, 0, 0).applyQuaternion(w.ship.q);
  w.up = (out = V(0, 0, 0)) => out.set(0, 1, 0).applyQuaternion(w.ship.q);

  w.gravity = (p, out) => {
    out.set(0, 0, 0);
    for (const b of bodies) {
      t1.subVectors(b.p, p);
      const d = Math.max(t1.length(), b.r);
      out.addScaledVector(t1, b.mu / d ** 3);
    }
    return out;
  };

  w.inCoverage = (p) => {
    t1.subVectors(p, w.ship.p);
    const d = t1.length();
    if (d < SENSOR.omni) return true;
    if (d > SENSOR.range) return false;
    return Math.acos(G(t1.dot(w.fwd(t2)) / d)) < SENSOR.half;
  };
  const G = (v) => Math.min(1, Math.max(-1, v));

  w.sense = () => {
    for (const r of w.rocks) {
      r.live = w.inCoverage(r.p);
      if (r.live) {
        r.seen = true;
        r.sp.copy(r.p);
      }
    }
    w.big.live = w.inCoverage(w.big.p);
    if (w.big.live) w.big.seen = true;
  };

  /** inp: fwd, lat (left +), vert (up +), yaw (left +), pitch (nose up +), each -1..1. */
  w.step = (dt, inp) => {
    const sh = w.ship;
    sh.inp = inp;
    sh.wy += inp.yaw * 0.4 * dt;
    sh.wp += inp.pitch * 0.4 * dt;
    if (!inp.yaw) sh.wy *= Math.exp(-2.2 * dt); // attitude hold damps the rates
    if (!inp.pitch) sh.wp *= Math.exp(-2.2 * dt);
    sh.q.multiply(dq.setFromAxisAngle(AX.y, sh.wy * dt)).multiply(dq.setFromAxisAngle(AX.x, sh.wp * dt)).normalize();
    const a = w.gravity(sh.p, V(0, 0, 0));
    const af = inp.fwd > 0 ? 1.3 * inp.fwd : 0.5 * inp.fwd;
    a.addScaledVector(w.fwd(t2), af).addScaledVector(w.left(t2), 0.5 * inp.lat).addScaledVector(w.up(t2), 0.5 * inp.vert);
    sh.v.addScaledVector(a, dt);
    sh.p.addScaledVector(sh.v, dt);
    const burn = Math.abs(af) * 0.004 + (Math.abs(inp.lat) + Math.abs(inp.vert)) * 0.003 + (Math.abs(inp.yaw) + Math.abs(inp.pitch)) * 0.001;
    sh.prop = Math.max(0, sh.prop - burn * dt);
    for (const r of w.rocks) {
      r.p.addScaledVector(r.v, dt);
      r.spin += dt * 0.2;
    }
    w.big.p.addScaledVector(w.big.v, dt);
    w.t += dt;
    if (sh.p.distanceTo(w.trail[w.trail.length - 1]) > 1.2) w.trail.push(sh.p.clone());
    w.sense();
    // Whole-ship contact, crudely: a 2-unit sphere.
    const hit = (o) => o.p.distanceTo(sh.p) < o.r + 2;
    if (hit(w.big) || w.rocks.some(hit) || bodies.some(hit)) w.lost = true;
  };

  /** Coasting forecast from the current state: [{ p, t }]. */
  w.forecast = (horizon = 22, n = 88) => {
    const out = [];
    const p = w.ship.p.clone();
    const v = w.ship.v.clone();
    const g = V(0, 0, 0);
    const dt = horizon / n;
    for (let i = 0; i <= n; i++) {
      out.push({ p: p.clone(), t: i * dt });
      v.addScaledVector(w.gravity(p, g), dt);
      p.addScaledVector(v, dt);
    }
    return out;
  };

  /** Closest approach of the big rock, straight-line: { d, t, range }. */
  w.cpa = () => {
    const r = t1.subVectors(w.big.p, w.ship.p).clone();
    const v = t2.subVectors(w.big.v, w.ship.v).clone();
    const v2 = v.lengthSq();
    const t = v2 > 1e-6 ? Math.max(0, -r.dot(v) / v2) : 0;
    return { d: r.clone().addScaledVector(v, t).length(), t, range: r.length() };
  };

  w.reset();
  return w;
}
