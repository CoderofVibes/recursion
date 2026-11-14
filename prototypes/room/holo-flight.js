// Flight hologram: the local environment as the ship senses it, projected above the console.
// Also used, zoomed out and without the large ship, as the chart's region view.
import * as THREE from 'three';
import { colour as C, hex } from '../visual/theme.js';
import * as G from './gfx.js';
import { SENSOR } from './world.js';
import { makeShipModel } from './holo-ship.js';

const V3 = (c) => new THREE.Color(hex(c));

export function makeFlightHolo({ world, radius = 1.1 }) {
  const Rh = radius;
  const group = new THREE.Group(); // main.js tilts and places this
  const rot = new THREE.Group(); // heading rotation
  const trans = new THREE.Group(); // environment units → hologram metres, centred on the ship
  group.add(rot);
  rot.add(trans);

  let range = 130;
  let headingUp = true;
  let chart = false;
  let lattice = 0;
  let issuedAt = -1;

  // ---- Flight plane: grid, sensor coverage, unknown hatch -------------------------------------
  const planeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      uRh: { value: Rh }, uRange: { value: range }, uShip: { value: new THREE.Vector2() }, uRot: { value: 0 },
      uTh: { value: 0 }, uCone: { value: SENSOR.half }, uSRange: { value: SENSOR.range }, uOmni: { value: SENSOR.omni },
      cGrid: { value: V3(C.gridMajor) }, cMajor: { value: V3(C.inkDim) }, cCov: { value: V3(C.coverage) }, cUnk: { value: V3(C.inkFaint) },
    },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uRh, uRange, uRot, uTh, uCone, uSRange, uOmni; uniform vec2 uShip;
      uniform vec3 cGrid, cMajor, cCov, cUnk; varying vec2 vP;
      float gl(vec2 p, float sp){ vec2 q = p / sp; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main(){
        vec2 h = vec2(vP.x, -vP.y);
        float rr = length(h) / uRh; if (rr > 1.0) discard;
        float c = cos(uRot), s = sin(uRot);
        vec2 d = vec2(h.x * c + h.y * s, -h.x * s + h.y * c) * (uRange / uRh);
        vec2 e = uShip + d;
        float dist = length(d);
        vec2 f = vec2(-sin(uTh), -cos(uTh));
        float ang = acos(clamp(dot(d / max(dist, 1e-4), f), -1.0, 1.0));
        float aw = fwidth(ang) + 1e-4, dw = fwidth(dist) + 1e-4;
        float cone = (1.0 - smoothstep(uCone - aw, uCone + aw, ang)) * (1.0 - smoothstep(uSRange - dw, uSRange + dw, dist));
        float cov = max(cone, 1.0 - smoothstep(uOmni - dw, uOmni + dw, dist));
        float sp = uRange > 260.0 ? 50.0 : 10.0;
        float minor = gl(e, sp), major = gl(e, sp * 5.0);
        vec3 grid = cGrid * minor * 0.5 + cMajor * major * 0.55;
        float hs = uRange / 18.0;
        float hw = fwidth((e.x + e.y) / hs);
        float hatch = 1.0 - smoothstep(0.05, 0.05 + hw * 1.5, abs(fract((e.x + e.y) / hs) - 0.5));
        vec3 unk = grid * 0.28 + cUnk * hatch * 0.24;
        vec3 known = grid + cCov * 0.03;
        vec3 col = mix(unk, known, cov);
        // coverage edge
        float edge = max(
          (1.0 - smoothstep(0.0, aw * 2.5, abs(ang - uCone))) * step(dist, uSRange) * step(uOmni, dist),
          (1.0 - smoothstep(0.0, dw * 2.5, abs(dist - uSRange))) * step(ang, uCone));
        col += cCov * edge * 0.22;
        col *= smoothstep(1.0, 0.9, rr);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const plane = new THREE.Mesh(new THREE.CircleGeometry(Rh, 96), planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.renderOrder = 1;
  group.add(plane);

  // Rim with bearing ticks (turns with the environment) and a fixed lubber mark toward the window.
  const rim = G.fat(G.arcXZ(Rh, 0, Math.PI * 2, 128), { colour: C.inkDim, width: 1.2, opacity: 0.8, order: 2 });
  group.add(rim);
  const ticks = [];
  for (let d = 0; d < 360; d += 10) {
    const a = (d * Math.PI) / 180;
    const r1 = Rh * (d % 30 === 0 ? 0.955 : 0.98);
    ticks.push(Math.sin(a) * Rh, 0, -Math.cos(a) * Rh, Math.sin(a) * r1, 0, -Math.cos(a) * r1);
  }
  rot.add(G.thin(ticks, { colour: C.ink, opacity: 0.55, order: 2 }));
  group.add(G.fatSegs([0, 0, -Rh * 1.012, 0, 0, -Rh * 1.06], { colour: C.ink, width: 2.2, order: 2 }));
  const rangeTag = G.label('', 'holo dim');
  rangeTag.position.set(Rh * 0.72, 0, Rh * 0.72);
  group.add(rangeTag);

  // ---- Objects ---------------------------------------------------------------------------------
  const rockGeo = new THREE.OctahedronGeometry(1, 0);
  const mkRocks = (colour, opacity) => {
    const m = new THREE.InstancedMesh(rockGeo, new THREE.MeshBasicMaterial({
      color: hex(colour), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true,
    }), 128);
    m.frustumCulled = false;
    m.renderOrder = 3;
    trans.add(m);
    return m;
  };
  const rocksLive = mkRocks(C.asteroid, 0.95);
  const rocksStale = mkRocks(C.inkDim, 0.3);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const S = new THREE.Vector3();
  const T = new THREE.Vector3();

  const bodies = world.bodies.map((b) => {
    const g = new THREE.Group();
    g.position.set(b.x, 0, b.z);
    const sph = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(b.r, 18, 10)), new THREE.LineBasicMaterial({
      color: hex(C.bodyRim), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    g.add(sph);
    g.add(G.fat(G.arcXZ(b.r, 0, Math.PI * 2, 72), { colour: C.bodyRim, width: 1.5, opacity: 0.9 }));
    const tag = G.label(b.id, 'holo');
    tag.position.set(0, b.r * 1.15, 0);
    g.add(tag);
    trans.add(g);
    // Off-volume bearing marker on the rim.
    const mk = new THREE.Group();
    mk.add(G.fat([-0.03, 0, 0.035, 0, 0, 0, 0.03, 0, 0.035], { colour: C.bodyRim, width: 1.8 }));
    const mtag = G.label('', 'holo dim');
    mtag.position.set(0, 0.05, 0.02);
    mk.add(mtag);
    rot.add(mk);
    return { b, g, mk, mtag };
  });

  // The tracked large rock.
  const big = new THREE.Group();
  const bigMesh = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 1)), new THREE.LineBasicMaterial({
    color: hex(C.asteroid), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  big.add(bigMesh);
  const bigRing = G.fat(G.arcXZ(1.7, 0, Math.PI * 2, 48), { colour: C.caution, width: 1.6 });
  big.add(bigRing);
  const bigVel = G.fat([0, 0, 0, 0, 0, 1], { colour: C.velocity, width: 1.5 });
  big.add(bigVel);
  const bigTag = G.label('', 'holo');
  big.add(bigTag);
  trans.add(big);

  // Trail (measured, solid) and issued forecast (dotted) with its envelope and horizon bar.
  const trail = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.measured, width: 2.2, order: 4 });
  trans.add(trail);
  const fc = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.forecast, width: 1.9, dash: [1.1, 1.9], order: 4 });
  trans.add(fc);
  const envGeo = new THREE.BufferGeometry();
  const env = new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({
    color: hex(C.forecast), transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  env.frustumCulled = false;
  env.renderOrder = 2;
  trans.add(env);
  const horizon = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.forecast, width: 1.6, order: 4 });
  trans.add(horizon);
  const fcTag = G.label('', 'holo fc');
  trans.add(fcTag);

  // Lattice reconstruction: tall diamond-mesh sheets that the window never shows.
  const latMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uQ: { value: 1 }, uShip: { value: new THREE.Vector2() }, uRange: { value: range }, uT: { value: 0 },
      cA: { value: V3(C.lattice) }, cB: { value: V3(C.latticeCore) } },
    vertexShader: `varying vec3 vP;
      void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uQ, uRange, uT; uniform vec2 uShip; uniform vec3 cA, cB; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        if (distance(vP.xz, uShip) > uRange * 0.97) discard;
        vec2 vU = vP.xy;
        vec2 p = vU / 9.0; vec2 q = vec2(p.x + p.y, p.x - p.y);
        vec2 f = 0.5 - abs(fract(q) - 0.5); float d = min(f.x, f.y) * 9.0;
        float w = 0.34 * mix(3.2, 1.0, uQ);
        float I = exp(-d / w);
        float n = hash(floor(vU * 1.3) + floor(uT * 9.0));
        I *= mix(0.35 + 0.65 * step(0.45, n), 1.0, uQ);
        vec3 col = mix(cA, cB, smoothstep(0.55, 1.0, I)) * I * mix(0.35, 0.85, uQ);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const fences = world.fences.map((f) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h).translate(f.x, 0, f.z), latMat);
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.visible = false;
    trans.add(m);
    const cut = G.fat([f.x - f.w / 2, 0, f.z, f.x + f.w / 2, 0, f.z], { colour: C.latticeCore, width: 1.4, opacity: 0.7, order: 4 });
    cut.visible = false;
    trans.add(cut);
    return { f, m, cut };
  });
  const latTag = G.label('RECONSTRUCTION', 'holo field');
  latTag.visible = false;
  trans.add(latTag);

  // ---- The ship --------------------------------------------------------------------------------
  const shipG = new THREE.Group(); // large holographic ship, raised above its true spot
  const SHIP_SCALE = 0.04;
  const LIFT = 0.17;
  const RING = 0.46;
  const model = makeShipModel({ detail: false });
  model.group.scale.setScalar(SHIP_SCALE);
  shipG.add(model.group);
  shipG.position.y = LIFT;
  group.add(shipG);
  // Centre of mass, its dotted yaw axis and drop line to the plane.
  const com = new THREE.Group();
  com.add(G.fat(G.arcXZ(0.014, 0, Math.PI * 2, 24), { colour: C.ink, width: 1.5 }));
  com.add(G.fatSegs([-0.014, 0, 0, 0.014, 0, 0, 0, 0, -0.014, 0, 0, 0.014], { colour: C.ink, width: 1.1 }));
  com.add(G.fat([0, -LIFT, 0, 0, 0.2, 0], { colour: C.ink, width: 1.2, dash: [0.012, 0.014], opacity: 0.85 }));
  shipG.add(com);
  // True-scale footprint on the plane (the enlarged ship above is a symbol).
  const truth = G.fat(G.arcXZ(0.006, 0, Math.PI * 2, 16), { colour: C.ink, width: 1.4, order: 5 });
  group.add(truth);
  // Rotation ring: bearing ticks in the environment frame, with a yaw-rate arc.
  const ring = new THREE.Group();
  ring.add(G.fat(G.arcXZ(RING, 0, Math.PI * 2, 96), { colour: C.inkDim, width: 1, opacity: 0.7 }));
  const rt = [];
  for (let d = 0; d < 360; d += 15) {
    const a = (d * Math.PI) / 180;
    const r1 = RING * (d % 90 === 0 ? 0.92 : 0.96);
    rt.push(Math.sin(a) * RING, 0, -Math.cos(a) * RING, Math.sin(a) * r1, 0, -Math.cos(a) * r1);
  }
  ring.add(G.thin(rt, { colour: C.ink, opacity: 0.6 }));
  ring.position.y = LIFT;
  rot.add(ring);
  const rateArc = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.ink, width: 2.6 });
  rateArc.position.y = LIFT;
  group.add(rateArc);
  const noseTick = G.fatSegs([0, LIFT, -RING, 0, LIFT, -RING - 0.04], { colour: C.ink, width: 2.6 });
  shipG.parent.add(noseTick);
  // Velocity (green) and thrust (magenta) marks.
  const vel = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.velocity, width: 1.8 });
  vel.position.y = LIFT;
  rot.add(vel);
  const thrust = G.fatSegs([0, 0, 0, 0, 0, 0.01], { colour: C.thrust, width: 2.4 });
  shipG.add(thrust);
  const thrustAxis = G.fat([0, 0, 0.4, 0, 0, -0.4], { colour: C.thrust, width: 1.1, dash: [0.014, 0.012], opacity: 0.8 });
  thrustAxis.visible = false;
  shipG.add(thrustAxis);
  // Small ship symbol for the chart's region view.
  const sym = G.fat([0, 0, -0.03, 0.014, 0, 0.018, -0.014, 0, 0.018, 0, 0, -0.03], { colour: C.ink, width: 1.8 });
  sym.visible = false;
  group.add(sym);

  function issueForecast() {
    const f = world.forecast();
    const pts = [];
    const tri = [];
    let last = f[0];
    for (const p of f) {
      if (Math.hypot(p.x - world.ship.x, p.z - world.ship.z) > range * 0.97) break;
      pts.push(p.x, 0, p.z);
      last = p;
    }
    if (pts.length < 6) pts.push(f[1].x, 0, f[1].z);
    G.setFat(fc, pts);
    // 2-sigma ribbon, widening with time since issue.
    const n = pts.length / 3;
    let nx = 0;
    let nz = 0;
    for (let i = 0; i < n; i++) {
      const a = f[Math.max(0, i - 1)];
      const b = f[Math.min(f.length - 1, i + 1)];
      const l = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      nx = -(b.z - a.z) / l;
      nz = (b.x - a.x) / l;
      const w = 2 * (0.5 + 0.2 * f[i].t);
      tri.push(f[i].x + nx * w, 0, f[i].z + nz * w, f[i].x - nx * w, 0, f[i].z - nz * w);
    }
    const idx = [];
    for (let i = 0; i + 1 < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    envGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    envGeo.setIndex(idx);
    const wl = 2 * (0.5 + 0.2 * last.t);
    G.setFat(horizon, [last.x + nx * wl, 0, last.z + nz * wl, last.x - nx * wl, 0, last.z - nz * wl]);
    fcTag.position.set(last.x, 0, last.z);
    fcTag.userData.el.textContent = `FORECAST T+${Math.round(world.t)} s`;
    issuedAt = world.t;
  }

  function update(dt, time) {
    const sh = world.ship;
    const Sh = Rh / range;
    const hu = headingUp && !chart;
    rot.rotation.y = hu ? -sh.th : 0;
    trans.scale.setScalar(Sh);
    trans.position.set(-sh.x * Sh, 0, -sh.z * Sh);
    planeMat.uniforms.uRange.value = range;
    planeMat.uniforms.uShip.value.set(sh.x, sh.z);
    planeMat.uniforms.uRot.value = hu ? sh.th : 0;
    planeMat.uniforms.uTh.value = sh.th;
    latMat.uniforms.uT.value = time;
    latMat.uniforms.uShip.value.set(sh.x, sh.z);
    latMat.uniforms.uRange.value = range;
    rangeTag.userData.el.textContent = `RANGE ${range.toFixed(0)} km`;

    // Rocks: live inside coverage, stale where last seen, absent if never seen.
    let nl = 0;
    let ns = 0;
    for (const r of world.rocks) {
      if (!r.seen) continue;
      const x = r.live ? r.x : r.sx;
      const z = r.live ? r.z : r.sz;
      if (Math.hypot(x - sh.x, z - sh.z) > range * 0.97) continue;
      const rr = Math.max(r.r, 0.012 / Sh);
      E.set(r.tilt, r.spin, 0);
      M.compose(T.set(x, 0, z), Q.setFromEuler(E), S.set(rr, rr, rr));
      if (r.live) rocksLive.setMatrixAt(nl++, M);
      else rocksStale.setMatrixAt(ns++, M);
    }
    rocksLive.count = nl;
    rocksStale.count = ns;
    rocksLive.instanceMatrix.needsUpdate = true;
    rocksStale.instanceMatrix.needsUpdate = true;

    for (const o of bodies) {
      const dx = o.b.x - sh.x;
      const dz = o.b.z - sh.z;
      const d = Math.hypot(dx, dz);
      const inside = d + o.b.r * 0.35 < range;
      o.g.visible = inside;
      o.mk.visible = !inside;
      if (!inside) {
        const a = Math.atan2(dx, -dz);
        o.mk.position.set(Math.sin(a) * Rh * 1.03, 0, -Math.cos(a) * Rh * 1.03);
        o.mk.rotation.y = -a;
        o.mtag.userData.el.textContent = `${o.b.id} ${Math.round(d - o.b.r)} km`;
      }
    }

    // The large rock: only once sensed.
    const b = world.big;
    const cpa = world.cpa();
    const bd = cpa.range;
    big.visible = b.seen && bd < range * 0.97;
    if (big.visible) {
      big.position.set(b.x, 0, b.z);
      bigMesh.scale.setScalar(b.r);
      bigMesh.rotation.y = time * 0.15;
      const danger = cpa.d < 30 && cpa.t > 0;
      bigRing.visible = danger;
      bigRing.scale.setScalar(b.r);
      bigRing.material.opacity = 0.55 + 0.45 * Math.sin(time * 5);
      G.setFat(bigVel, [0, 0, 0, (b.vx - sh.vx) * 2.2, 0, (b.vz - sh.vz) * 2.2]);
      bigTag.position.set(0, b.r * 1.8 + 0.04 / Sh, 0);
      bigTag.userData.el.textContent = danger
        ? `▲ ${b.id}  ${bd.toFixed(0)} km  CPA ${cpa.d.toFixed(0)} km  T−${cpa.t.toFixed(0)} s`
        : `${b.id}  ${bd.toFixed(0)} km`;
      bigTag.userData.el.classList.toggle('caution', danger);
    }

    // Trail, most recent points that fit in the volume.
    const tr = world.trail;
    const pts = [sh.x, 0, sh.z];
    for (let i = tr.length - 2; i >= 0; i -= 2) {
      if (Math.hypot(tr[i] - sh.x, tr[i + 1] - sh.z) > range * 0.97) break;
      pts.push(tr[i], 0, tr[i + 1]);
    }
    if (pts.length < 6) pts.push(sh.x, 0, sh.z + 0.01);
    G.setFat(trail, pts);
    if (issuedAt < 0) issueForecast();

    for (const f of fences) {
      f.m.visible = f.cut.visible = lattice > 0;
    }
    latMat.uniforms.uQ.value = lattice === 2 ? 1 : 0.15;
    latTag.visible = lattice > 0;
    if (lattice) {
      latTag.position.set(world.fences[0].x + world.fences[0].w * 0.32, world.fences[0].h * 0.55, world.fences[0].z);
      latTag.userData.el.textContent = lattice === 2 ? 'RECONSTRUCTION  Q 0.92' : 'RECONSTRUCTION  Q 0.21  ▲ LOW POWER';
      latTag.userData.el.classList.toggle('caution', lattice === 1);
    }

    // Ship marks.
    shipG.visible = ring.visible = rateArc.visible = noseTick.visible = vel.visible = !chart;
    truth.visible = !chart;
    sym.visible = chart;
    const yawShown = hu ? 0 : sh.th;
    shipG.rotation.y = yawShown;
    noseTick.rotation.y = yawShown;
    sym.rotation.y = sh.th;
    const sp = Math.hypot(sh.vx, sh.vz);
    if (sp > 0.05) {
      const L = Math.min(0.5, 0.12 + sp * 0.022) / sp;
      const ex = sh.vx * L;
      const ez = sh.vz * L;
      const ax = -sh.vz / sp;
      const az = sh.vx / sp;
      G.setFat(vel, [0, 0, 0, ex, 0, ez, ex - sh.vx * L * 0.14 + ax * 0.016, 0, ez - sh.vz * L * 0.14 + az * 0.016, ex, 0, ez,
        ex - sh.vx * L * 0.14 - ax * 0.016, 0, ez - sh.vz * L * 0.14 - az * 0.016]);
    }
    // Yaw-rate arc from the nose, in the direction of rotation.
    const a1 = G.clamp(-sh.om * 1.4, -1.6, 1.6);
    rateArc.visible = !chart && Math.abs(a1) > 0.02;
    if (rateArc.visible) {
      G.setFat(rateArc, G.arcXZ(RING, 0, a1, 24));
      rateArc.rotation.y = yawShown;
    }
    // Thrust chevrons at the points of application (body frame of the enlarged ship).
    const seg = [];
    const chev = (x, z, dx, dz) => {
      const px = -dz;
      const pz = dx;
      for (const k of [0.04, 0.075, 0.11])
        seg.push(x + dx * k + px * 0.024, 0, z + dz * k + pz * 0.024, x + dx * (k + 0.026), 0, z + dz * (k + 0.026),
          x + dx * k - px * 0.024, 0, z + dz * k - pz * 0.024, x + dx * (k + 0.026), 0, z + dz * (k + 0.026));
    };
    const ex = 2.5 * SHIP_SCALE; // RCS pods sit on the hull corners, 5 m fore and aft
    const ez = 5 * SHIP_SCALE;
    if (sh.fwd > 0) chev(0, 8 * SHIP_SCALE, 0, 1);
    if (sh.fwd < 0) { chev(-ex * 0.8, -ez, 0, -1); chev(ex * 0.8, -ez, 0, -1); }
    if (sh.lat > 0) { chev(ex, -ez, 1, 0); chev(ex, ez, 1, 0); }
    if (sh.lat < 0) { chev(-ex, -ez, -1, 0); chev(-ex, ez, -1, 0); }
    if (sh.yaw > 0) { chev(ex, -ez, 1, 0); chev(-ex, ez, -1, 0); }
    if (sh.yaw < 0) { chev(-ex, -ez, -1, 0); chev(ex, ez, 1, 0); }
    thrust.visible = seg.length > 0;
    if (seg.length) G.setFatSegs(thrust, seg);
    thrustAxis.visible = sh.fwd !== 0;
  }

  return {
    group,
    update,
    issueForecast,
    get range() { return range; },
    setRange(r) { range = G.clamp(r, 40, 520); issuedAt = -1; },
    setHeadingUp(v) { headingUp = v; },
    get headingUp() { return headingUp; },
    setChart(v) { chart = v; issuedAt = -1; },
    setLattice(v) { lattice = v; },
    get lattice() { return lattice; },
    reset() { issuedAt = -1; },
  };
}
