// Flight hologram: the local environment in three dimensions, as the ship senses it, projected above
// the console. The ship sits back toward the player so the space ahead of it fills the volume.
// Also used, zoomed out and without the large ship, as the map's region view.
import * as THREE from 'three';
import { colour as C, hex } from '../visual/theme.js';
import * as G from './gfx.js';
import { SENSOR } from './world.js';
import { makeShipModel } from './holo-ship.js';

const V3 = (c) => new THREE.Color(hex(c));
const TAU = Math.PI * 2;

export function makeFlightHolo({ world, radius = 1.1 }) {
  const Rh = radius;
  const SET_BACK = 0.5 * Rh; // how far toward the player the ship sits
  const group = new THREE.Group(); // main.js tilts and places this
  const rot = new THREE.Group(); // origin at the ship; turns the environment into the display frame
  const trans = new THREE.Group(); // environment units → hologram metres, centred on the ship
  group.add(rot);
  rot.add(trans);

  let range = 130;
  let headingUp = true;
  let chart = false;
  let lattice = 0;
  let issuedAt = -1;
  const toHolo = new THREE.Matrix4(); // environment → hologram frame, for clipping to the volume
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const inside = (p, margin = 0.97) => tmp.copy(p).applyMatrix4(toHolo).length() < Rh * margin;

  // ---- Reference plane: the level plane through the ship, with grid and sensor coverage -------
  const planeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      uRh: { value: Rh }, uScale: { value: 1 }, uShip: { value: new THREE.Vector2() }, uRot: { value: new THREE.Matrix4() },
      uFwd: { value: new THREE.Vector3(0, 0, -1) }, uCone: { value: SENSOR.half }, uSRange: { value: SENSOR.range }, uOmni: { value: SENSOR.omni }, uRange: { value: range },
      cGrid: { value: V3(C.gridMajor) }, cMajor: { value: V3(C.inkDim) }, cCov: { value: V3(C.coverage) }, cUnk: { value: V3(C.inkFaint) },
    },
    vertexShader: `uniform mat4 uRot; varying vec3 vP; varying vec3 vH;
      void main(){ vP = position; vH = (uRot * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uRh, uScale, uCone, uSRange, uOmni, uRange; uniform vec2 uShip; uniform vec3 uFwd;
      uniform vec3 cGrid, cMajor, cCov, cUnk; varying vec3 vP; varying vec3 vH;
      float gl(vec2 p, float sp){ vec2 q = p / sp; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main(){
        float rr = length(vH) / uRh; if (rr > 1.0) discard;
        vec3 d = vec3(vP.x, 0.0, vP.z) / uScale;
        vec2 e = uShip + d.xz;
        float dist = length(d);
        float ang = acos(clamp(dot(d / max(dist, 1e-4), uFwd), -1.0, 1.0));
        float aw = fwidth(ang) + 1e-4, dw = fwidth(dist) + 1e-4;
        float cone = (1.0 - smoothstep(uCone - aw, uCone + aw, ang)) * (1.0 - smoothstep(uSRange - dw, uSRange + dw, dist));
        float cov = max(cone, 1.0 - smoothstep(uOmni - dw, uOmni + dw, dist));
        float sp = uRange > 260.0 ? 50.0 : 10.0;
        vec3 grid = cGrid * gl(e, sp) * 0.5 + cMajor * gl(e, sp * 5.0) * 0.55;
        float hs = uRange / 18.0;
        float hw = fwidth((e.x + e.y) / hs);
        float hatch = 1.0 - smoothstep(0.05, 0.05 + hw * 1.5, abs(fract((e.x + e.y) / hs) - 0.5));
        vec3 col = mix(grid * 0.28 + cUnk * hatch * 0.24, grid + cCov * 0.03, cov);
        float edge = max(
          (1.0 - smoothstep(0.0, aw * 2.5, abs(ang - uCone))) * step(dist, uSRange) * step(uOmni, dist),
          (1.0 - smoothstep(0.0, dw * 2.5, abs(dist - uSRange))) * step(ang, uCone));
        col += cCov * edge * 0.22;
        col *= smoothstep(1.0, 0.9, rr);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const plane = new THREE.Mesh(new THREE.CircleGeometry(Rh * 2.2, 96).rotateX(-Math.PI / 2), planeMat);
  plane.renderOrder = 1;
  plane.frustumCulled = false;
  rot.add(plane);

  // The volume: a rim at console level and two faint arcs over the top.
  group.add(G.fat(G.arcXZ(Rh, 0, TAU, 128), { colour: C.inkDim, width: 1.2, opacity: 0.8, order: 2 }));
  const dome = [];
  for (let i = 0; i < 48; i++) {
    const a = (Math.PI * i) / 48;
    const b = (Math.PI * (i + 1)) / 48;
    dome.push(Math.cos(a) * Rh, Math.sin(a) * Rh, 0, Math.cos(b) * Rh, Math.sin(b) * Rh, 0, 0, Math.sin(a) * Rh, Math.cos(a) * Rh, 0, Math.sin(b) * Rh, Math.cos(b) * Rh);
  }
  group.add(G.thin(dome, { colour: C.ink, opacity: 0.1 }));
  group.add(G.fatSegs([0, 0, -Rh * 1.012, 0, 0, -Rh * 1.06], { colour: C.ink, width: 2.2, order: 2 }));
  const rangeTag = G.label('', 'holo dim');
  rangeTag.position.set(Rh * 0.74, 0, Rh * 0.74);
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
  // Stalks drop each object to the reference plane so its height reads.
  const stalks = G.thin([0, 0, 0, 0, 0, 0], { colour: C.ink, opacity: 0.2 });
  trans.add(stalks);
  const M = new THREE.Matrix4();
  const Q = new THREE.Quaternion();
  const E = new THREE.Euler();
  const S = new THREE.Vector3();

  const bodies = world.bodies.map((b) => {
    const g = new THREE.Group();
    g.position.copy(b.p);
    g.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(b.r, 18, 10)), new THREE.LineBasicMaterial({
      color: hex(C.bodyRim), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending,
    })));
    g.add(G.fat(G.arcXZ(b.r, 0, TAU, 72), { colour: C.bodyRim, width: 1.5, opacity: 0.9 }));
    const tag = G.label(b.id, 'holo');
    tag.position.set(0, b.r * 1.15, 0);
    g.add(tag);
    trans.add(g);
    const mk = new THREE.Group(); // bearing marker on the rim when the body is outside the volume
    mk.add(G.fat([-0.03, 0, 0.035, 0, 0, 0, 0.03, 0, 0.035], { colour: C.bodyRim, width: 1.8 }));
    const mtag = G.label('', 'holo dim');
    mtag.position.set(0, 0.05, 0.02);
    mk.add(mtag);
    group.add(mk);
    return { b, g, mk, mtag };
  });

  const big = new THREE.Group();
  const bigMesh = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1, 1)), new THREE.LineBasicMaterial({
    color: hex(C.asteroid), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  big.add(bigMesh);
  const bigRing = G.fat(G.arcXZ(1.7, 0, TAU, 48), { colour: C.caution, width: 1.6 });
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
    uniforms: { uQ: { value: 1 }, uToHolo: { value: toHolo }, uRh: { value: Rh }, uT: { value: 0 }, cA: { value: V3(C.lattice) }, cB: { value: V3(C.latticeCore) } },
    vertexShader: `uniform mat4 uToHolo; varying vec3 vP; varying vec3 vH;
      void main(){ vP = position; vH = (uToHolo * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uQ, uRh, uT; uniform vec3 cA, cB; varying vec3 vP; varying vec3 vH;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        if (length(vH) > uRh * 0.97) discard;
        vec2 p = vP.xy / 9.0; vec2 q = vec2(p.x + p.y, p.x - p.y);
        vec2 f = 0.5 - abs(fract(q) - 0.5); float d = min(f.x, f.y) * 9.0;
        float I = exp(-d / (0.34 * mix(3.2, 1.0, uQ)));
        I *= mix(0.35 + 0.65 * step(0.45, hash(floor(vP.xy * 1.3) + floor(uT * 9.0))), 1.0, uQ);
        gl_FragColor = vec4(mix(cA, cB, smoothstep(0.55, 1.0, I)) * I * mix(0.3, 0.7, uQ), 1.0);
      }`,
  });
  const fences = world.fences.map((f) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h).translate(f.x, 0, f.z), latMat);
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.visible = false;
    trans.add(m);
    return { f, m };
  });
  const latTag = G.label('RECONSTRUCTION', 'holo field');
  latTag.visible = false;
  trans.add(latTag);

  // ---- The ship --------------------------------------------------------------------------------
  const shipG = new THREE.Group(); // origin at the ship, in the display frame
  rot.add(shipG);
  const SHIP_SCALE = 0.034;
  const RING = 0.4;
  const model = makeShipModel({ detail: false });
  model.group.scale.setScalar(SHIP_SCALE);
  model.setOpacity(0.3);
  shipG.add(model.group);
  // Centre of mass with its dotted yaw axis, and a nose tick.
  shipG.add(G.fat(G.arcXZ(0.014, 0, TAU, 24), { colour: C.ink, width: 1.5 }));
  shipG.add(G.fat([0, -0.24, 0, 0, 0.26, 0], { colour: C.ink, width: 1.2, dash: [0.012, 0.014], opacity: 0.85 }));
  shipG.add(G.fatSegs([0, 0, -RING, 0, 0, -RING - 0.04], { colour: C.ink, width: 2.6 }));
  const rateArc = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.ink, width: 2.6 });
  shipG.add(rateArc);
  const pitchArc = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.ink, width: 2.6 });
  shipG.add(pitchArc);
  // Sensor cone, drawn faintly from the nose.
  const coneLines = G.thin([0, 0, 0, 0, 0, 0], { colour: C.coverage, opacity: 0.16 });
  shipG.add(coneLines);
  const thrust = G.fatSegs([0, 0, 0, 0, 0, 0.01], { colour: C.thrust, width: 2.4 });
  shipG.add(thrust);
  const thrustAxis = G.fat([0, 0, 0.4, 0, 0, -0.4], { colour: C.thrust, width: 1.1, dash: [0.014, 0.012], opacity: 0.8 });
  shipG.add(thrustAxis);
  // In the environment frame: a level bearing ring and the velocity arrow.
  const ring = new THREE.Group();
  ring.add(G.fat(G.arcXZ(RING, 0, TAU, 96), { colour: C.inkDim, width: 1, opacity: 0.7 }));
  const rt = [];
  for (let d = 0; d < 360; d += 15) {
    const a = (d * Math.PI) / 180;
    const r1 = RING * (d % 90 === 0 ? 0.9 : 0.95);
    rt.push(Math.sin(a) * RING, 0, -Math.cos(a) * RING, Math.sin(a) * r1, 0, -Math.cos(a) * r1);
  }
  ring.add(G.thin(rt, { colour: C.ink, opacity: 0.6 }));
  rot.add(ring);
  const vel = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.velocity, width: 1.8 });
  rot.add(vel);
  // Small ship symbol for the map's region view.
  const sym = G.fat([0, 0, -0.03, 0.014, 0, 0.018, -0.014, 0, 0.018, 0, 0, -0.03], { colour: C.ink, width: 1.8 });
  shipG.add(sym);

  function issueForecast() {
    const f = world.forecast();
    const pts = [];
    const tri = [];
    let n = 0;
    for (const s of f) {
      if (!inside(s.p)) break;
      pts.push(s.p.x, s.p.y, s.p.z);
      n++;
    }
    if (n < 2) { pts.length = 0; pts.push(f[0].p.x, f[0].p.y, f[0].p.z, f[1].p.x, f[1].p.y, f[1].p.z); n = 2; }
    G.setFat(fc, pts);
    // 2-sigma ribbon, level, widening with time since issue.
    const side = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      side.subVectors(f[Math.min(f.length - 1, i + 1)].p, f[Math.max(0, i - 1)].p).cross(tmp2.set(0, 1, 0)).normalize();
      const w = 2 * (0.5 + 0.2 * f[i].t);
      const p = f[i].p;
      tri.push(p.x + side.x * w, p.y, p.z + side.z * w, p.x - side.x * w, p.y, p.z - side.z * w);
    }
    const idx = [];
    for (let i = 0; i + 1 < n; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    envGeo.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3));
    envGeo.setIndex(idx);
    const k = (n - 1) * 6;
    G.setFat(horizon, [tri[k], tri[k + 1], tri[k + 2], tri[k + 3], tri[k + 4], tri[k + 5]]);
    fcTag.position.copy(f[n - 1].p);
    fcTag.userData.el.textContent = `FORECAST T+${Math.round(world.t)} s`;
    issuedAt = world.t;
  }

  function update(dt, time) {
    const sh = world.ship;
    const Sh = Rh / range;
    const hu = headingUp && !chart;
    rot.position.set(0, 0, hu ? SET_BACK : 0);
    if (hu) rot.quaternion.copy(sh.q).invert();
    else rot.quaternion.identity();
    trans.scale.setScalar(Sh);
    trans.position.copy(sh.p).multiplyScalar(-Sh);
    rot.updateMatrix();
    trans.updateMatrix();
    toHolo.multiplyMatrices(rot.matrix, trans.matrix);
    shipG.quaternion.copy(sh.q); // undoes the display rotation in heading-up, so the nose points away
    planeMat.uniforms.uScale.value = Sh;
    planeMat.uniforms.uRange.value = range;
    planeMat.uniforms.uShip.value.set(sh.p.x, sh.p.z);
    planeMat.uniforms.uRot.value.copy(rot.matrix);
    world.fwd(planeMat.uniforms.uFwd.value);
    latMat.uniforms.uT.value = time;
    rangeTag.userData.el.textContent = `RANGE ${range.toFixed(0)} km`;

    // Rocks: live inside coverage, stale where last seen, absent if never seen.
    let nl = 0;
    let ns = 0;
    const st = [];
    for (const r of world.rocks) {
      if (!r.seen) continue;
      const p = r.live ? r.p : r.sp;
      if (!inside(p)) continue;
      const rr = Math.max(r.r, 0.012 / Sh);
      E.set(r.tilt, r.spin, 0);
      M.compose(p, Q.setFromEuler(E), S.set(rr, rr, rr));
      if (r.live) rocksLive.setMatrixAt(nl++, M);
      else rocksStale.setMatrixAt(ns++, M);
      if (Math.abs(p.y - sh.p.y) > 3) st.push(p.x, p.y, p.z, p.x, sh.p.y, p.z);
    }
    rocksLive.count = nl;
    rocksStale.count = ns;
    rocksLive.instanceMatrix.needsUpdate = true;
    rocksStale.instanceMatrix.needsUpdate = true;

    for (const o of bodies) {
      tmp.copy(o.b.p).applyMatrix4(toHolo);
      const inVol = tmp.length() + o.b.r * Sh * 0.35 < Rh;
      o.g.visible = inVol;
      o.mk.visible = !inVol;
      if (inVol) st.push(o.b.p.x, o.b.p.y, o.b.p.z, o.b.p.x, sh.p.y, o.b.p.z);
      else {
        const a = Math.atan2(tmp.x, -tmp.z);
        o.mk.position.set(Math.sin(a) * Rh * 1.03, 0, -Math.cos(a) * Rh * 1.03);
        o.mk.rotation.y = -a;
        const el = tmp.y / Math.max(1e-6, Math.hypot(tmp.x, tmp.z));
        o.mtag.userData.el.textContent = `${o.b.id} ${Math.round(o.b.p.distanceTo(sh.p) - o.b.r)} km${el > 0.12 ? ' ▲' : el < -0.12 ? ' ▼' : ''}`;
      }
    }

    // The large rock: only once sensed.
    const b = world.big;
    const cpa = world.cpa();
    big.visible = b.seen && inside(b.p);
    if (big.visible) {
      big.position.copy(b.p);
      bigMesh.scale.setScalar(b.r);
      bigMesh.rotation.y = time * 0.15;
      const danger = cpa.d < 30 && cpa.t > 0;
      bigRing.visible = danger;
      bigRing.scale.setScalar(b.r);
      bigRing.material.opacity = 0.55 + 0.45 * Math.sin(time * 5);
      tmp2.subVectors(b.v, sh.v).multiplyScalar(2.2);
      G.setFat(bigVel, [0, 0, 0, tmp2.x, tmp2.y, tmp2.z]);
      bigTag.position.set(0, b.r * 1.8 + 0.04 / Sh, 0);
      bigTag.userData.el.textContent = danger
        ? `▲ ${b.id}  ${cpa.range.toFixed(0)} km  CPA ${cpa.d.toFixed(0)} km  T−${cpa.t.toFixed(0)} s`
        : `${b.id}  ${cpa.range.toFixed(0)} km`;
      bigTag.userData.el.classList.toggle('caution', danger);
      st.push(b.p.x, b.p.y, b.p.z, b.p.x, sh.p.y, b.p.z);
    }
    stalks.geometry.setAttribute('position', new THREE.Float32BufferAttribute(st.length ? st : [0, 0, 0, 0, 0, 0], 3));

    // Trail: the most recent points that fit in the volume.
    const pts = [sh.p.x, sh.p.y, sh.p.z];
    for (let i = world.trail.length - 1; i >= 0; i--) {
      const p = world.trail[i];
      if (!inside(p)) break;
      pts.push(p.x, p.y, p.z);
    }
    if (pts.length < 6) pts.push(sh.p.x, sh.p.y, sh.p.z + 0.01);
    G.setFat(trail, pts);
    if (issuedAt < 0) issueForecast();

    for (const f of fences) f.m.visible = lattice > 0;
    latMat.uniforms.uQ.value = lattice === 2 ? 1 : 0.15;
    latTag.visible = lattice > 0;
    if (lattice) {
      const f0 = world.fences[0];
      latTag.position.set(f0.x + f0.w * 0.3, f0.h * 0.42, f0.z);
      latTag.userData.el.textContent = lattice === 2 ? 'RECONSTRUCTION  Q 0.92' : 'RECONSTRUCTION  Q 0.21  ▲ LOW POWER';
      latTag.userData.el.classList.toggle('caution', lattice === 1);
    }

    // Ship marks.
    model.group.visible = ring.visible = vel.visible = coneLines.visible = !chart;
    sym.visible = chart;
    const sp = sh.v.length();
    if (sp > 0.05) {
      const L = Math.min(0.5, 0.12 + sp * 0.022);
      tmp.copy(sh.v).multiplyScalar(L / sp);
      tmp2.copy(sh.v).cross(S.set(0, 1, 0)).normalize().multiplyScalar(0.016);
      const bx = tmp.x * 0.86;
      const by = tmp.y * 0.86;
      const bz = tmp.z * 0.86;
      G.setFat(vel, [0, 0, 0, tmp.x, tmp.y, tmp.z, bx + tmp2.x, by, bz + tmp2.z, tmp.x, tmp.y, tmp.z, bx - tmp2.x, by, bz - tmp2.z]);
    }
    const a1 = G.clamp(-sh.wy * 1.4, -1.6, 1.6);
    rateArc.visible = !chart && Math.abs(a1) > 0.02;
    if (rateArc.visible) G.setFat(rateArc, G.arcXZ(RING, 0, a1, 24));
    const p1 = G.clamp(sh.wp * 1.4, -1.2, 1.2);
    pitchArc.visible = !chart && Math.abs(p1) > 0.02;
    if (pitchArc.visible) {
      const arc = [];
      for (let i = 0; i <= 16; i++) { const a = (p1 * i) / 16; arc.push(0, Math.sin(a) * RING, -Math.cos(a) * RING); }
      G.setFat(pitchArc, arc);
    }
    // Sensor cone from the nose, as long as fits in the volume.
    const Lc = Math.min(SENSOR.range * Sh, (Rh + (hu ? SET_BACK : 0)) * 0.95);
    const cr = Math.tan(SENSOR.half) * Lc;
    const cl = [];
    for (let k = 0; k < 4; k++) { const a = (TAU * k) / 4 + 0.785; cl.push(0, 0, 0, Math.cos(a) * cr, Math.sin(a) * cr, -Lc); }
    for (let k = 0; k < 32; k++) { const a = (TAU * k) / 32; const c = (TAU * (k + 1)) / 32; cl.push(Math.cos(a) * cr, Math.sin(a) * cr, -Lc, Math.cos(c) * cr, Math.sin(c) * cr, -Lc); }
    coneLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(cl, 3));
    // Thrust chevrons at the points of application (body frame of the enlarged ship).
    const seg = [];
    const chev = (o, d) => {
      const px = d[1] !== 0 ? [1, 0, 0] : [-d[2], 0, d[0]];
      for (const k of [0.04, 0.075, 0.11])
        for (const sg of [1, -1])
          seg.push(o[0] + d[0] * k + px[0] * 0.024 * sg, o[1] + d[1] * k, o[2] + d[2] * k + px[2] * 0.024 * sg, o[0] + d[0] * (k + 0.026), o[1] + d[1] * (k + 0.026), o[2] + d[2] * (k + 0.026));
    };
    const ex = 2.5 * SHIP_SCALE; // RCS pods sit on the hull sides, 5 m fore and aft
    const ez = 5 * SHIP_SCALE;
    const i = sh.inp;
    if (i.fwd > 0) chev([0, 0, 8 * SHIP_SCALE], [0, 0, 1]);
    if (i.fwd < 0) { chev([-ex * 0.8, 0, -ez], [0, 0, -1]); chev([ex * 0.8, 0, -ez], [0, 0, -1]); }
    if (i.lat) { chev([i.lat * ex, 0, -ez], [i.lat, 0, 0]); chev([i.lat * ex, 0, ez], [i.lat, 0, 0]); }
    if (i.vert) for (const sx of [-ex, ex]) for (const sz of [-ez, ez]) chev([sx, 0, sz], [0, -i.vert, 0]);
    if (i.yaw) { chev([i.yaw * ex, 0, -ez], [i.yaw, 0, 0]); chev([-i.yaw * ex, 0, ez], [-i.yaw, 0, 0]); }
    if (i.pitch) { chev([ex, 0, -ez], [0, -i.pitch, 0]); chev([-ex, 0, -ez], [0, -i.pitch, 0]); chev([ex, 0, ez], [0, i.pitch, 0]); chev([-ex, 0, ez], [0, i.pitch, 0]); }
    thrust.visible = !chart && seg.length > 0;
    if (seg.length) G.setFatSegs(thrust, seg);
    thrustAxis.visible = !chart && i.fwd !== 0;
  }

  return {
    group,
    update,
    issueForecast,
    get range() { return range; },
    setRange(r) { range = G.clamp(r, 40, 520); issuedAt = -1; },
    setHeadingUp(v) { headingUp = v; issuedAt = -1; },
    get headingUp() { return headingUp; },
    setChart(v) { chart = v; issuedAt = -1; },
    setLattice(v) { lattice = v; },
    get lattice() { return lattice; },
    reset() { issuedAt = -1; },
  };
}
