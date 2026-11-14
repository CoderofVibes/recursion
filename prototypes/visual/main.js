// Recursion visual direction prototype: Night Watch.
// Standalone: Three.js from a pinned CDN build, no dependency on the main app.
// The flight is a toy: the "true" world uses an inverse-2.5 law (P4 normalisation),
// the issued forecast uses Newtonian gravity, so they drift apart as they will in-game.
// Numbers on the panels are illustrative only.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { colour as C, alpha as A, line as L, type as TY, motion as M, render as R } from './theme.js';
import { SCENES } from './scenes.js';

// ---------------------------------------------------------------------------
// Toy flight (display units: 1 u ≈ 1 "km"; illustrative only)
// ---------------------------------------------------------------------------
const BODIES = [
  { name: 'M1', x: -18, z: 0, mu: 3600, R: 7 },
  { name: 'M2', x: 52, z: 22, mu: 900, R: 4 },
];
const R0 = 40;
const DT = 0.02;
const T_END = 48;
const N = Math.round(T_END / DT) + 1;
const START = { x: -18, z: -40, vx: 8.8, vz: 0 };
const PLAN = { burnT: 9, burnDur: 2, burnA: 0.3 };      // ATT 03 (current) burn, prograde
const PREV = { burnT: 7, burnDur: 2, burnA: 0.42 };     // ATT 02 burn
const SENSOR = { halfAngle: THREE.MathUtils.degToRad(26), range: 95, omni: 14 };
const PLANE_HALF = 200;
const HORIZON = 26;                                     // F-07 covers T+0 to T+26
const NH = Math.round(HORIZON / DT);

function accel(x, z, law) {
  let ax = 0, az = 0;
  for (const b of BODIES) {
    const dx = b.x - x, dz = b.z - z;
    const r = Math.hypot(dx, dz);
    const a = law === 'newton' ? b.mu / (r * r) : (b.mu / (R0 * R0)) * Math.pow(R0 / r, 2.5);
    ax += (a * dx) / r; az += (a * dz) / r;
  }
  return [ax, az];
}

function simulate(law, burn) {
  const x = new Float32Array(N), z = new Float32Array(N), vx = new Float32Array(N), vz = new Float32Array(N);
  const thr = new Uint8Array(N);
  let px = START.x, pz = START.z, ux = START.vx, uz = START.vz;
  for (let i = 0; i < N; i++) {
    const t = i * DT;
    x[i] = px; z[i] = pz; vx[i] = ux; vz[i] = uz;
    const [ax, az] = accel(px, pz, law);
    let tx = 0, tz = 0;
    if (t >= burn.burnT && t < burn.burnT + burn.burnDur) {
      const v = Math.hypot(ux, uz);
      tx = (burn.burnA * ux) / v; tz = (burn.burnA * uz) / v; thr[i] = 1;
    }
    ux += (ax + tx) * DT; uz += (az + tz) * DT;
    px += ux * DT; pz += uz * DT;
  }
  return { x, z, vx, vz, thr };
}

const meas = simulate('true', PLAN);
const fc = simulate('newton', PLAN);
const prev = simulate('true', PREV);

const ang = (x, z) => Math.atan2(z, x);
const lerpAngle = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const smooth = (e0, e1, x) => { const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
const idx = (t) => Math.min(N - 1, Math.max(0, Math.round(t / DT)));

// Body attitude (heading in the plane). Deliberately not the velocity direction.
const h0 = ang(meas.vx[0], meas.vz[0]) + 0.6;
const hBurn = ang(meas.vx[idx(PLAN.burnT)], meas.vz[idx(PLAN.burnT)]);
const hAfter = ang(meas.vx[idx(14)], meas.vz[idx(14)]) - 1.2;
function heading(t) {
  const i = idx(t);
  if (t < 6) return h0;
  if (t < 8.5) return lerpAngle(h0, hBurn, smooth(6, 8.5, t));
  if (t < 11) return ang(meas.vx[i], meas.vz[i]);
  if (t < 14) return lerpAngle(ang(meas.vx[idx(11)], meas.vz[idx(11)]), hAfter, smooth(11, 14, t));
  return hAfter;
}
const slewing = (t) => (t >= 6 && t < 8.5) || (t >= 11 && t < 14);

// Forecast uncertainty: modest where earlier attempts sampled the field, widening once it extrapolates.
const prevSub = [];
for (let i = 0; i < N; i += 10) prevSub.push([prev.x[i], prev.z[i]]);
let kneeIdx = NH;
for (let i = 0; i <= NH; i += 5) {
  let dmin = Infinity;
  for (const [px, pz] of prevSub) dmin = Math.min(dmin, Math.hypot(fc.x[i] - px, fc.z[i] - pz));
  if (dmin > 12 && i * DT > 4) { kneeIdx = i; break; }
}
const tKnee = kneeIdx * DT;
const sigma = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i * DT;
  sigma[i] = 0.6 + 0.12 * t + (t > tKnee ? 0.16 * Math.pow(t - tKnee, 1.3) : 0);
}
const residual = new Float32Array(N);
for (let i = 0; i < N; i++) residual[i] = Math.hypot(meas.x[i] - fc.x[i], meas.z[i] - fc.z[i]);
let cautionIdx = N;
for (let i = 0; i <= NH; i++) if (residual[i] > 2 * sigma[i] && i * DT > 3) { cautionIdx = i; break; }
const tCaution = cautionIdx * DT;

// Seeded asteroid field (prototype-local PRNG; the game uses src/lib streams).
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry32(20261114);
const ASTEROIDS = [];
while (ASTEROIDS.length < 280) {
  const a = rand() * Math.PI * 2;
  const r = 30 + Math.pow(rand(), 0.7) * 130;
  const x = BODIES[0].x + Math.cos(a) * r * 1.15, z = BODIES[0].z + Math.sin(a) * r * 0.9;
  if (Math.hypot(x - BODIES[1].x, z - BODIES[1].z) < 9) continue;
  if (Math.hypot(x, z) > PLANE_HALF - 30) continue;
  let near = Infinity;
  for (let i = 0; i < N; i += 25) near = Math.min(near, Math.hypot(x - meas.x[i], z - meas.z[i]));
  if (near < 2.5) continue;
  ASTEROIDS.push({ x, z, size: 0.35 + Math.pow(rand(), 3) * 1.4, rot: rand() * 6.28, seen: false, last: -1e9, prior: false });
}

// ---------------------------------------------------------------------------
// Coverage history: what the ship (and earlier attempts, via Black Box) has sensed.
// ---------------------------------------------------------------------------
const HIST = 512;
const histCanvas = document.createElement('canvas');
histCanvas.width = histCanvas.height = HIST;
const hctx = histCanvas.getContext('2d');
const histTex = new THREE.CanvasTexture(histCanvas);
histTex.colorSpace = THREE.NoColorSpace;
const toHist = (v) => ((v + PLANE_HALF) / (2 * PLANE_HALF)) * HIST;

function sensorDir(x, z) { return ang(BODIES[0].x - x, BODIES[0].z - z); }
function stampCoverage(x, z, a) {
  hctx.fillStyle = `rgba(255,0,0,${a})`;
  const sd = sensorDir(x, z);
  const cx = toHist(x), cz = toHist(z), s = HIST / (2 * PLANE_HALF);
  hctx.beginPath();
  hctx.moveTo(cx, cz);
  hctx.arc(cx, cz, SENSOR.range * s, sd - SENSOR.halfAngle, sd + SENSOR.halfAngle);
  hctx.closePath();
  hctx.fill();
  hctx.beginPath();
  hctx.arc(cx, cz, SENSOR.omni * s, 0, Math.PI * 2);
  hctx.fill();
}
function isCovered(ax, az, x, z) {
  const dx = ax - x, dz = az - z, d = Math.hypot(dx, dz);
  if (d < SENSOR.omni) return true;
  if (d > SENSOR.range) return false;
  return Math.cos(ang(dx, dz) - sensorDir(x, z)) > Math.cos(SENSOR.halfAngle);
}
function resetHistory() {
  hctx.globalCompositeOperation = 'source-over';
  hctx.fillStyle = '#000';
  hctx.fillRect(0, 0, HIST, HIST);
  hctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < N; i += 40) stampCoverage(prev.x[i], prev.z[i], 0.5);   // ATT 02, from Black Box
  for (const a of ASTEROIDS) {
    a.seen = false; a.last = -1e9; a.prior = false;
    for (let i = 0; i < N; i += 40) if (isCovered(a.x, a.z, prev.x[i], prev.z[i])) { a.prior = true; break; }
  }
  histTex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Theme → CSS variables
// ---------------------------------------------------------------------------
const CSS_VARS = {
  '--room': C.room, '--room-light': C.roomLight, '--table': C.table, '--table-edge': C.tableEdge, '--table-lip': C.tableLip,
  '--panel': C.panel, '--panel-edge': C.panelEdge, '--ink': C.ink, '--ink-dim': C.inkDim, '--ink-faint': C.inkFaint,
  '--measured': C.measured, '--forecast': C.forecast, '--velocity': C.velocity, '--thrust': C.thrust, '--blackbox': C.blackbox,
  '--advisory': C.advisory, '--caution': C.caution, '--warning': C.warning, '--field': C.well,
  '--font-ui': TY.family, '--font-num': TY.family, '--label-tracking': TY.tracking.label, '--label-size': `${TY.size.label}px`,
  '--t-fast': `${M.fast}ms`, '--t-base': `${M.base}ms`, '--t-alert': `${M.alertIn}ms`, '--t-breathe': `${M.breathe}ms`, '--ease-out': M.easing.out,
};
for (const [k, v] of Object.entries(CSS_VARS)) document.documentElement.style.setProperty(k, v);

// ---------------------------------------------------------------------------
// Renderer, camera, controls
// ---------------------------------------------------------------------------
const host = document.getElementById('view3d');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.localClippingEnabled = true;
host.appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
host.appendChild(labelRenderer.domElement);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
const controls = new OrbitControls(camera, renderer.domElement);
let userMoved = false;
controls.addEventListener('start', () => { userMoved = true; });
controls.enableDamping = true;
controls.dampingFactor = M.cameraDamping;
controls.maxPolarAngle = THREE.MathUtils.degToRad(84);
controls.minDistance = 25;
controls.maxDistance = 420;

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.viewBackground);
const lineMaterials = new Set();

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), R.bloom.strength, R.bloom.radius, R.bloom.threshold);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

function size() {
  const w = host.clientWidth, h = host.clientHeight;
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  labelRenderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);
  for (const m of lineMaterials) m.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  if (!userMoved) fitCamera();
}
new ResizeObserver(size).observe(host);

// Zoom to fit: bodies, measured path and forecast, seen from 55° elevation.
function fitCamera() {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  const add = (x, z, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); };
  for (let i = 0; i < N; i += 10) { add(meas.x[i], meas.z[i], 3); if (i <= NH) add(fc.x[i], fc.z[i], 3); }
  for (const b of BODIES) add(b.x, b.z, b.R + 4);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hw = (x1 - x0) / 2, hd = (z1 - z0) / 2;
  const el = THREE.MathUtils.degToRad(55), az = THREE.MathUtils.degToRad(-12);
  const vt = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), ht = vt * camera.aspect;
  const d = Math.max(hw / ht, (hd * Math.sin(el) + 6) / vt) * 1.12 + hd * Math.cos(el);
  controls.target.set(cx, 0, cz);
  camera.position.set(cx + Math.sin(az) * Math.cos(el) * d, Math.sin(el) * d, cz + Math.cos(az) * Math.cos(el) * d);
  camera.lookAt(controls.target);
}

// ---------------------------------------------------------------------------
// Drawing helpers (shared with scenes.js)
// ---------------------------------------------------------------------------
const GLSL_LINE = /* glsl */`
  float gridLine(float c, float s) {
    float f = c / s; float w = fwidth(f);
    float d = abs(fract(f - 0.5) - 0.5);
    return 1.0 - smoothstep(0.0, w * 1.25, d);
  }`;

const color = (c) => new THREE.Color(c);
function lineMat(c, width, opts = {}) {
  const m = new LineMaterial({
    color: color(c), linewidth: width, transparent: true, opacity: opts.opacity ?? 1,
    dashed: !!opts.dashed, dashSize: opts.dashSize ?? 1, gapSize: opts.gapSize ?? 1, depthWrite: false,
  });
  m.resolution.set(host.clientWidth * renderer.getPixelRatio(), host.clientHeight * renderer.getPixelRatio());
  lineMaterials.add(m);
  return m;
}
function polyline(points, mat) {
  const g = new LineGeometry();
  g.setPositions(points);
  const l = new Line2(g, mat);
  if (mat.dashed) l.computeLineDistances();
  return l;
}
function segments(points, mat) {
  const g = new LineSegmentsGeometry();
  g.setPositions(points);
  const l = new LineSegments2(g, mat);
  if (mat.dashed) l.computeLineDistances();
  return l;
}
function label(text, cls) {
  const el = document.createElement('div');
  el.className = 'tag3d ' + (cls ?? '');
  el.textContent = text;
  return new CSS2DObject(el);
}

// ---------------------------------------------------------------------------
// World: flight plane, bodies, asteroids, forecast, trails, ship
// ---------------------------------------------------------------------------
function makePlane() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      uHist: { value: histTex }, uHalf: { value: PLANE_HALF },
      uShip: { value: new THREE.Vector2() }, uSensDir: { value: new THREE.Vector2(1, 0) },
      uSensCos: { value: Math.cos(SENSOR.halfAngle) }, uSensRange: { value: SENSOR.range }, uOmni: { value: SENSOR.omni },
      uGrid: { value: color(C.grid) }, uMajor: { value: color(C.gridMajor) },
      uUnknown: { value: color(C.unknown) }, uTint: { value: color(C.coverage) }, uVeilColor: { value: color(C.viewBackground) },
      uMinor: { value: A.gridMinor }, uStale: { value: A.staleGrid }, uHatch: { value: A.unknownHatch }, uHatchS: { value: L.hatchSpacing },
      uCovTint: { value: A.coverageTint }, uCovEdge: { value: A.coverageEdge }, uVeil: { value: A.planeVeil },
      uFog: { value: R.fogDensity },
    },
    vertexShader: /* glsl */`
      varying vec2 vP; varying float vDist;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vP = wp.xz;
        vec4 mv = viewMatrix * wp; vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uHist; uniform float uHalf;
      uniform vec2 uShip; uniform vec2 uSensDir; uniform float uSensCos; uniform float uSensRange; uniform float uOmni;
      uniform vec3 uGrid; uniform vec3 uMajor; uniform vec3 uUnknown; uniform vec3 uTint; uniform vec3 uVeilColor;
      uniform float uMinor; uniform float uStale; uniform float uHatch; uniform float uHatchS;
      uniform float uCovTint; uniform float uCovEdge; uniform float uVeil; uniform float uFog;
      varying vec2 vP; varying float vDist;
      ${GLSL_LINE}
      vec3 Cc; float Aa;
      void over(vec3 c, float a) { Cc = c * a + Cc * (1.0 - a); Aa = a + Aa * (1.0 - a); }
      void main() {
        Cc = vec3(0.0); Aa = 0.0;
        vec2 d = vP - uShip; float r = length(d);
        float cone = smoothstep(uSensCos - 0.015, uSensCos + 0.015, dot(d / max(r, 1e-3), uSensDir));
        float cur = max(cone * (1.0 - smoothstep(uSensRange - 3.0, uSensRange, r)), 1.0 - smoothstep(uOmni - 1.0, uOmni, r));
        float hist = texture2D(uHist, (vP + uHalf) / (2.0 * uHalf)).r;
        float known = max(cur, clamp(hist * 1.6, 0.0, 1.0) * uStale);

        float minor = max(gridLine(vP.x, 10.0), gridLine(vP.y, 10.0));
        float major = max(gridLine(vP.x, 50.0), gridLine(vP.y, 50.0));
        float hatch = gridLine((vP.x + vP.y) * 0.70710678, uHatchS);

        // Veil: the plane is faintly opaque, so anything below it reads as below (depth cue).
        over(uVeilColor, uVeil);
        over(uUnknown, hatch * uHatch * (1.0 - known));
        over(uTint, cur * uCovTint);
        over(mix(uGrid, uMajor, major), max(minor * uMinor, major) * known);
        float edge = 1.0 - smoothstep(0.0, 2.0 * fwidth(cur) + 1e-4, abs(cur - 0.5));
        over(uTint, edge * uCovEdge);

        float fade = 1.0 - smoothstep(uHalf * 0.72, uHalf, length(vP));
        float fog = exp(-uFog * uFog * vDist * vDist);
        float a = Aa * fade * fog;
        if (a < 0.003) discard;
        gl_FragColor = vec4(Cc / max(Aa, 1e-4), a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_HALF * 2, PLANE_HALF * 2, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -10;
  return mesh;
}

function makeBody(b) {
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  const geo = new THREE.SphereGeometry(b.R, 64, 40);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uBase: { value: color(C.body) }, uRim: { value: color(C.bodyRim) }, uLight: { value: new THREE.Vector3(...R.keyLight).normalize() }, uStrength: { value: R.rimStrength } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vWN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uBase; uniform vec3 uRim; uniform vec3 uLight; uniform float uStrength;
      varying vec3 vN; varying vec3 vV; varying vec3 vWN;
      void main() {
        float lit = max(dot(normalize(vWN), uLight), 0.0);
        float fr = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.6);
        gl_FragColor = vec4(uBase * (0.35 + 0.9 * lit) + uRim * fr * uStrength * (0.35 + 0.65 * lit), 1.0);
      }`,
  });
  g.add(new THREE.Mesh(geo, mat));
  // Intersection with the flight plane: the body's footprint in the plane.
  const ring = [];
  for (let k = 0; k <= 96; k++) { const a = (k / 96) * Math.PI * 2; ring.push(Math.cos(a) * b.R * 1.02, 0.02, Math.sin(a) * b.R * 1.02); }
  g.add(polyline(ring, lineMat(C.bodyRim, L.bodyFootprint, { opacity: 0.55 })));
  const tag = label(b.name);
  tag.position.set(b.R * 0.75, b.R * 0.9, 0);
  g.add(tag);
  return g;
}

// Ship: true footprint (bus + deployed radiators), body axis, centre of mass, thrust line of action.
const SHIP = { comX: 0.15, engineX: -1.75, engineZ: 0.1 };
const FOOTPRINT = [
  [1.6, -0.5], [1.6, 0.5], [0.4, 0.5], [0.4, 2.1], [-0.8, 2.1], [-0.8, 0.5], [-1.6, 0.5],
  [-1.6, -0.5], [-0.8, -0.5], [-0.8, -2.1], [0.4, -2.1], [0.4, -0.5],
];

function makeShip() {
  const ship = new THREE.Group();
  const body = new THREE.Group();
  ship.add(body);
  const shape = new THREE.Shape(FOOTPRINT.map(([x, z]) => new THREE.Vector2(x, z)));
  const ext = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
  ext.rotateX(Math.PI / 2); ext.translate(0, 0.45, 0);
  const busGeo = new THREE.BoxGeometry(3.2, 0.9, 1.0); busGeo.translate(0, 0.45, 0);
  const bellGeo = new THREE.ConeGeometry(0.42, 0.7, 20, 1, true); bellGeo.rotateZ(Math.PI / 2); bellGeo.translate(-1.95, 0.45, 0);
  const fill = new THREE.MeshLambertMaterial({ color: C.hull, emissive: C.hullEmissive });
  const edgeMat = new THREE.LineBasicMaterial({ color: C.measured, transparent: true, opacity: 0.8 });
  for (const geo of [ext, busGeo, bellGeo]) {
    body.add(new THREE.Mesh(geo, fill));
    body.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edgeMat));
  }
  // Footprint on the plane (what clearance is measured against).
  const fp = FOOTPRINT.map(([x, z]) => [x, 0.03, z]).flat();
  fp.push(FOOTPRINT[0][0], 0.03, FOOTPRINT[0][1]);
  const fpMat = lineMat(C.measured, L.footprint, { opacity: 0.55 });
  body.add(polyline(fp, fpMat));

  // Centre of mass: quartered disc, lying flat above the hull.
  const com = new THREE.Group();
  com.position.set(SHIP.comX, 1.0, 0);
  com.rotation.x = -Math.PI / 2;
  for (let q = 0; q < 4; q++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16, (q * Math.PI) / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: q % 2 ? C.viewBackground : C.measured, depthTest: false }));
    m.renderOrder = 5; com.add(m);
  }
  const comRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: C.measured, depthTest: false }));
  comRing.renderOrder = 5; com.add(comRing);
  body.add(com);

  // Body axis tick: short, heavy, from the CoM through the nose.
  body.add(polyline([SHIP.comX + 0.6, 1.0, 0, 4.2, 1.0, 0], lineMat(C.measured, L.bodyAxis)));

  // Thrust: line of action through the engine mount, in the direction of the force.
  const thrust = new THREE.Group();
  thrust.add(polyline([SHIP.engineX, 0.45, SHIP.engineZ, 5.2, 0.45, SHIP.engineZ + 0.12], lineMat(C.thrust, L.thrustLine, { dashed: true, dashSize: 0.35, gapSize: 0.3 })));
  thrust.add(segments([
    SHIP.engineX - 1.3, 0.45, SHIP.engineZ, SHIP.engineX - 0.35, 0.45, SHIP.engineZ,
    SHIP.engineX - 0.35, 0.45, SHIP.engineZ, SHIP.engineX - 0.85, 0.45, SHIP.engineZ + 0.45,
    SHIP.engineX - 0.35, 0.45, SHIP.engineZ, SHIP.engineX - 0.85, 0.45, SHIP.engineZ - 0.45,
  ], lineMat(C.thrust, L.thrustChevron)));
  body.add(thrust);

  // Damage notch: a heavy warning tick on the struck edge. Hidden until damage.
  const notch = segments([-0.5, 0.5, 2.1, 0.1, 0.5, 2.1, -0.2, 0.5, 1.7, -0.2, 0.5, 2.5], lineMat(C.warning, 3));
  notch.visible = false;
  body.add(notch);

  // Velocity: world-frame vector with an open head; lives outside the rotating body.
  const vel = segments(new Array(18).fill(0), lineMat(C.velocity, L.velocity, { opacity: 0.95 }));

  return { ship, body, thrust, vel, com, edgeMat, fpMat, notch };
}

function makeEnvelope() {
  // Ribbon around the frozen forecast; half-width 2σ; hatched where it extrapolates.
  const pos = [], across = [], extrap = [], index = [];
  const step = 4;
  let row = 0;
  for (let i = 0; i <= NH; i += step, row++) {
    const j = Math.min(NH, i + step);
    let tx = fc.x[j] - fc.x[i], tz = fc.z[j] - fc.z[i];
    if (j === i) { tx = fc.x[i] - fc.x[i - step]; tz = fc.z[i] - fc.z[i - step]; }
    const l = Math.hypot(tx, tz) || 1;
    const nx = -tz / l, nz = tx / l, w = 2 * sigma[i];
    pos.push(fc.x[i] + nx * w, 0.05, fc.z[i] + nz * w, fc.x[i] - nx * w, 0.05, fc.z[i] - nz * w);
    across.push(1, -1);
    const e = smooth(tKnee - 0.5, tKnee + 0.5, i * DT);
    extrap.push(e, e);
    if (row > 0) { const a = (row - 1) * 2; index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aAcross', new THREE.Float32BufferAttribute(across, 1));
  g.setAttribute('aExtrap', new THREE.Float32BufferAttribute(extrap, 1));
  g.setIndex(index);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: color(C.forecast) }, uFog: { value: R.fogDensity }, uHatchS: { value: L.envelopeHatchSpacing },
      uBody: { value: A.envelopeBody }, uEdge: { value: A.envelopeEdge },
      uXBody: { value: A.extrapolatedBody }, uXEdge: { value: A.extrapolatedEdge }, uXHatch: { value: A.extrapolatedHatch },
    },
    vertexShader: /* glsl */`
      attribute float aAcross; attribute float aExtrap;
      varying float vAcross; varying float vExtrap; varying vec2 vW; varying float vDist;
      void main() { vAcross = aAcross; vExtrap = aExtrap; vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xz; vec4 mv = viewMatrix * wp; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uFog; uniform float uHatchS;
      uniform float uBody; uniform float uEdge; uniform float uXBody; uniform float uXEdge; uniform float uXHatch;
      varying float vAcross; varying float vExtrap; varying vec2 vW; varying float vDist;
      ${GLSL_LINE}
      void main() {
        float ac = abs(vAcross);
        float body = 1.0 - ac * ac;
        float edge = 1.0 - smoothstep(0.0, 2.5 * fwidth(ac), 1.0 - ac);
        float hatch = gridLine((vW.x - vW.y) * 0.70710678, uHatchS);
        float aIn = body * uBody + edge * uEdge;
        float aOut = body * uXBody + edge * uXEdge + hatch * uXHatch * body;
        gl_FragColor = vec4(uColor, mix(aIn, aOut, vExtrap) * exp(-uFog * uFog * vDist * vDist));
      }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 1;
  return mesh;
}

function pathPoints(sim, y, i0 = 0, i1 = N - 1, step = 2) {
  const p = [];
  for (let i = i0; i <= i1; i += step) p.push(sim.x[i], y, sim.z[i]);
  return p;
}
function normalAt(sim, i, len) {
  const j = Math.min(N - 1, i + 1), k = j === i ? i - 1 : i;
  const tx = sim.x[j] - sim.x[k], tz = sim.z[j] - sim.z[k], l = Math.hypot(tx, tz) || 1;
  return [(-tz / l) * len, (tx / l) * len];
}

function buildWorld() {
  const g = new THREE.Group();
  const w = { group: g, trailFull: false };

  w.plane = makePlane();
  g.add(w.plane);
  for (const b of BODIES) g.add(makeBody(b));
  const key = new THREE.DirectionalLight(C.bodyRim, 1.2); key.position.set(-120, 90, -80);
  g.add(key, new THREE.AmbientLight(0xffffff, 0.25));

  // Asteroids, tracked: low-poly rocks. Stale or prior: rings sized by positional uncertainty.
  w.rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ color: C.asteroid, emissive: C.asteroid, emissiveIntensity: 0.25, flatShading: true }), ASTEROIDS.length);
  w.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  g.add(w.rocks);
  const ringGeo = new THREE.RingGeometry(0.94, 1.0, 40);
  ringGeo.rotateX(-Math.PI / 2);
  w.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), ASTEROIDS.length);
  w.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  w.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ASTEROIDS.length * 3), 3);
  w.rings.renderOrder = 2;
  g.add(w.rings);

  // Previous attempt (Black Box record) with 5 s time ticks.
  w.prevGroup = new THREE.Group();
  w.prevMat = lineMat(C.blackbox, L.previousAttempt, { opacity: A.previousAttempt });
  w.prevGroup.add(polyline(pathPoints(prev, 0.08), w.prevMat));
  const ticks = [];
  for (let t = 5; t < T_END; t += 5) {
    const i = idx(t), [nx, nz] = normalAt(prev, i, 1.1);
    ticks.push(prev.x[i] - nx, 0.08, prev.z[i] - nz, prev.x[i] + nx, 0.08, prev.z[i] + nz);
  }
  w.prevGroup.add(segments(ticks, lineMat(C.blackbox, 1.2, { opacity: A.previousAttempt })));
  const prevTag = label('ATT 02', 'bbx');
  const pe = idx(34);
  prevTag.position.set(prev.x[pe], 0.5, prev.z[pe]);
  w.prevGroup.add(prevTag);
  g.add(w.prevGroup);

  // Issued forecast F-07: frozen, dotted, planned burn bracketed in the thrust colour, ends at its horizon.
  w.fcGroup = new THREE.Group();
  w.fcGroup.add(makeEnvelope());
  w.fcGroup.add(polyline(pathPoints(fc, 0.12, 0, NH), lineMat(C.forecast, L.forecast, { dashed: true, dashSize: L.forecastDot[0], gapSize: L.forecastDot[1] })));
  {
    const [nx, nz] = normalAt(fc, NH, 2 * sigma[NH]);
    w.fcGroup.add(segments([fc.x[NH] - nx, 0.1, fc.z[NH] - nz, fc.x[NH] + nx, 0.1, fc.z[NH] + nz], lineMat(C.forecast, 2, { opacity: 0.9 })));
  }
  const b0 = idx(PLAN.burnT), b1 = idx(PLAN.burnT + PLAN.burnDur);
  w.fcGroup.add(polyline(pathPoints(fc, 0.13, b0, b1, 1), lineMat(C.thrust, 2.2, { opacity: 0.7 })));
  const fcTag = label('F-07', 'fc');
  fcTag.position.set(fc.x[0] - 2, 0.4, fc.z[0] - 3);
  w.fcGroup.add(fcTag);
  {
    // Knee: where the forecast leaves sampled space (a short bar across the envelope).
    const [nx, nz] = normalAt(fc, kneeIdx, 2 * sigma[kneeIdx] + 1.4);
    w.fcGroup.add(segments([fc.x[kneeIdx] - nx, 0.1, fc.z[kneeIdx] - nz, fc.x[kneeIdx] + nx, 0.1, fc.z[kneeIdx] + nz], lineMat(C.forecast, 1.2, { opacity: 0.8 })));
  }
  // Forecast-now ghost: where F-07 said the ship would be at this moment.
  w.ghost = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: C.forecast, transparent: true, depthWrite: false }));
  w.fcGroup.add(w.ghost);
  w.ghostLinkMat = lineMat(C.forecast, L.connector, { opacity: 0.6, dashed: true, dashSize: 0.4, gapSize: 0.4 });
  w.ghostLink = segments([0, 0, 0, 1, 0, 0], w.ghostLinkMat);
  w.fcGroup.add(w.ghostLink);
  g.add(w.fcGroup);

  // Measured trail: solid, grows with time.
  w.trailMat = lineMat(C.measured, L.measured);
  w.trail = polyline(pathPoints(meas, 0.16, 0, N - 1, 1), w.trailMat);
  g.add(w.trail);

  w.shipParts = makeShip();
  g.add(w.shipParts.ship, w.shipParts.vel);
  return w;
}

const world = buildWorld();
scene.add(world.group);

// ---------------------------------------------------------------------------
// Feedback state (restrained: one fade-in or one flicker, then steady)
// ---------------------------------------------------------------------------
const fx = { warning: false, damageAt: -1, damaged: false, successAt: -1, marks: [] };
const nowMs = () => performance.now();

function trigger(kind) {
  if (kind === 'caution') { t = Math.min(tCaution + 1.2, T_END); lastHistI = -1; }
  if (kind === 'warning') { fx.warning = !fx.warning; if (fx.warning) fx.marks.push({ t, kind }); }
  if (kind === 'damage') { fx.damageAt = nowMs(); fx.damaged = true; fx.marks.push({ t, kind }); }
  if (kind === 'success') { fx.successAt = nowMs(); fx.marks.push({ t, kind }); }
  if (kind === 'reset') { fx.warning = false; fx.damaged = false; fx.damageAt = -1; fx.successAt = -1; fx.marks.length = 0; }
}

// ---------------------------------------------------------------------------
// Scenes (display-rule specimens): flight, wells, lattice, compare, feedback
// ---------------------------------------------------------------------------
let t = 0, playing = true, lastHistI = -1, lastFrame = performance.now(), hold = 0, frameN = 0;
const ctx = {
  THREE, C, A, L, M, GLSL_LINE, color, lineMat, polyline, segments, label, makeShip,
  meas, fc, prev, N, DT, NH, idx, sigma, PLAN, PREV, BODIES, world, fx, trigger, normalAt, smooth,
  get t() { return t; },
  // Frame the camera on a point (scenes use this); no arguments = zoom to fit the flight.
  frame(cx, cz, dist, elDeg = 55, azDeg = -12) {
    userMoved = cx !== undefined;
    if (cx === undefined) { fitCamera(); return; }
    const el = THREE.MathUtils.degToRad(elDeg), az = THREE.MathUtils.degToRad(azDeg);
    controls.target.set(cx, 0, cz);
    camera.position.set(cx + Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, cz + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(controls.target);
  },
};
let sceneId = 'flight', sceneObj = null;
const sceneBar = document.getElementById('scene-bar');
const sceneCtl = document.getElementById('scene-controls');
Object.entries(SCENES).forEach(([id, s], k) => {
  const b = document.createElement('button');
  b.dataset.s = id; b.innerHTML = `<b>${k + 1}</b> ${s.name}`;
  b.addEventListener('click', () => setScene(id));
  sceneBar.appendChild(b);
});
function setScene(id) {
  if (sceneObj) { sceneObj.dispose?.(); world.group.remove(sceneObj.group); disposeTree(sceneObj.group); }
  sceneId = id;
  sceneObj = SCENES[id].build(ctx);
  world.group.add(sceneObj.group);
  sceneCtl.replaceChildren(...(sceneObj.controls ?? []));
  for (const b of sceneBar.querySelectorAll('button')) b.classList.toggle('on', b.dataset.s === id);
  const u = new URL(location.href); u.searchParams.set('s', id); history.replaceState(null, '', u);
  if (sceneObj.time !== undefined) { t = sceneObj.time; lastHistI = -1; }
}
function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose?.();
    for (const m of [].concat(o.material ?? [])) { lineMaterials.delete(m); m.dispose?.(); }
    if (o.isCSS2DObject) o.element.remove();
  });
}

// ---------------------------------------------------------------------------
// Instruments (2D canvas)
// ---------------------------------------------------------------------------
function prepCanvas(cv) {
  const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio, 2);
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  return [c, w, h];
}
const font = (sz) => `${sz}px ${TY.family}`;
const withAlpha = (c, a) => `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;

const LOADS = [
  { k: 'ENG', idle: 25, active: 140 },
  { k: 'ACS', idle: 30, active: 70 },
  { k: 'NAV', idle: 55, active: 55 },
  { k: 'PROC', idle: 70, active: 70 },
  { k: 'BBX', idle: 22, active: 22, bb: true },
  { k: 'THRM', idle: 160, active: 175 },
  { k: 'HTR', idle: 45, active: 45 },
];
const SUPPLY = 900;
const latticePower = () => Number(document.getElementById('proc-w')?.value ?? 0);

function loadValues(t) {
  const burning = meas.thr[idx(t)] === 1, slew = slewing(t);
  return LOADS.map((l) => {
    if (l.k === 'ENG') return burning ? l.active : l.idle;
    if (l.k === 'ACS') return slew ? l.active : l.idle;
    if (l.k === 'THRM') return l.idle + (burning ? 15 : 0) + 4 * Math.sin(t * 0.7);
    if (l.k === 'PROC' && sceneId === 'lattice') return 70 + latticePower() * 2.6;
    if (l.k === 'HTR' && fx.warning) return 600;
    return l.idle;
  });
}

function drawPower(t) {
  const [c, w, h] = prepCanvas(document.getElementById('power'));
  const burning = meas.thr[idx(t)] === 1;
  const vals = loadValues(t);
  const total = vals.reduce((a, b) => a + b, 0);
  document.getElementById('pwr-total').textContent = Math.round(total);
  const over = total > SUPPLY;
  document.getElementById('power-panel').dataset.alert = over ? 'warning' : '';
  // Total vs supply (scale runs to 125 % of supply so an overdraw is visible).
  const x0 = 38, x1 = w - 30, scale = (x1 - x0) / (SUPPLY * 1.25);
  c.font = font(TY.size.small); c.textBaseline = 'middle';
  c.fillStyle = C.inkFaint; c.fillRect(x0, 8, x1 - x0, 1);
  let acc = x0;
  vals.forEach((v, k) => {
    c.fillStyle = LOADS[k].bb ? C.blackbox : k === 0 && burning ? C.thrust : withAlpha(C.ink, 0.25 + 0.08 * (k % 2));
    c.fillRect(acc, 4, v * scale, 9); acc += v * scale;
  });
  const xs = x0 + SUPPLY * scale;
  if (over) { c.fillStyle = C.warning; c.fillRect(xs, 4, acc - xs, 9); }
  c.fillStyle = over ? C.warning : C.ink; c.fillRect(xs, 1, 1.5, 15);
  c.fillStyle = C.inkDim; c.fillText('ΣP', 6, 9);
  // Per-load rows.
  const rowH = (h - 26) / LOADS.length;
  LOADS.forEach((l, k) => {
    const y = 24 + k * rowH + rowH / 2;
    const v = vals[k], max = 300;
    const hot = l.bb ? C.blackbox : k === 0 && burning ? C.thrust : l.k === 'HTR' && fx.warning ? C.warning : null;
    c.fillStyle = hot ?? C.inkDim; c.fillText(l.k, 6, y);
    c.fillStyle = C.inkFaint; for (let m = 0; m <= 4; m++) c.fillRect(x0 + (m / 4) * (x1 - x0), y - 4, 1, 8);
    c.fillStyle = hot ?? C.ink; c.globalAlpha = hot ? 1 : 0.7;
    c.fillRect(x0, y - 2, Math.min(1, v / max) * (x1 - x0), 4);
    c.globalAlpha = 1;
    c.fillStyle = C.inkDim; c.textAlign = 'right'; c.fillText(Math.round(v), w - 2, y); c.textAlign = 'left';
  });
}

function navSigma(t) {
  const i = idx(t);
  const r1 = Math.hypot(meas.x[i] - BODIES[0].x, meas.z[i] - BODIES[0].z);
  return 0.18 + r1 * 0.006 + (slewing(t) ? 0.35 : 0) + 0.03 * Math.sin(t * 3.1);
}
function drawSpark(t) {
  const [c, w, h] = prepCanvas(document.getElementById('nav-spark'));
  c.fillStyle = C.inkFaint; c.fillRect(0, h - 1, w, 1);
  c.strokeStyle = C.ink; c.lineWidth = 1.2; c.beginPath();
  const span = 20; let started = false;
  for (let k = 0; k <= 80; k++) {
    const tt = t - span + (k / 80) * span;
    if (tt < 0) continue;
    const x = (k / 80) * w, y = h - 2 - (navSigma(tt) / 1.2) * (h - 4);
    if (started) c.lineTo(x, y); else c.moveTo(x, y);
    started = true;
  }
  c.stroke();
}

function drawResidual(t) {
  const [c, w, h] = prepCanvas(document.getElementById('residual'));
  const pad = { l: 26, r: 6, t: 6, b: 16 };
  const X = (tt) => pad.l + (tt / T_END) * (w - pad.l - pad.r);
  const yMax = 30;
  const Y = (v) => h - pad.b - (Math.min(v, yMax) / yMax) * (h - pad.t - pad.b);
  c.font = font(9); c.fillStyle = C.inkFaint; c.textBaseline = 'middle';
  for (let v = 0; v <= yMax; v += 10) { c.fillRect(pad.l - 3, Y(v), 3, 1); c.fillText(v, 4, Y(v)); }
  for (let s = 0; s <= T_END; s += 12) { c.fillRect(X(s), h - pad.b, 1, 3); c.fillText(s, X(s) - 4, h - 6); }
  c.fillRect(pad.l, h - pad.b, w - pad.l - pad.r, 1);
  // 2σ envelope of the issued forecast (frozen; ends at the horizon).
  c.beginPath(); c.moveTo(X(0), Y(0));
  for (let i = 0; i <= NH; i += 10) c.lineTo(X(i * DT), Y(2 * sigma[i]));
  c.lineTo(X(HORIZON), Y(0)); c.closePath();
  c.fillStyle = withAlpha(C.forecast, 0.14); c.fill();
  c.beginPath();
  for (let i = 0; i <= NH; i += 10) { if (i) c.lineTo(X(i * DT), Y(2 * sigma[i])); else c.moveTo(X(0), Y(2 * sigma[0])); }
  c.strokeStyle = withAlpha(C.forecast, 0.6); c.lineWidth = 1; c.setLineDash([2, 3]); c.stroke(); c.setLineDash([]);
  c.fillStyle = withAlpha(C.forecast, 0.7); c.fillRect(X(tKnee), pad.t, 1, h - pad.t - pad.b);
  c.fillStyle = withAlpha(C.forecast, 0.9); c.fillRect(X(HORIZON), pad.t, 1.5, h - pad.t - pad.b);
  // Measured residual up to now; the part outside 2σ in caution.
  const iNow = Math.min(idx(t), NH);
  c.beginPath();
  for (let i = 0; i <= Math.min(iNow, cautionIdx); i += 5) { if (i) c.lineTo(X(i * DT), Y(residual[i])); else c.moveTo(X(0), Y(residual[0])); }
  c.strokeStyle = C.ink; c.lineWidth = 1.6; c.stroke();
  if (iNow >= cautionIdx) {
    c.beginPath();
    c.moveTo(X(cautionIdx * DT), Y(residual[cautionIdx]));
    for (let i = cautionIdx; i <= iNow; i += 5) c.lineTo(X(i * DT), Y(residual[i]));
    c.strokeStyle = C.caution; c.lineWidth = 1.8; c.stroke();
  }
  c.fillStyle = iNow >= cautionIdx ? C.caution : C.ink;
  c.beginPath(); c.arc(X(Math.min(t, HORIZON)), Y(residual[iNow]), 2.5, 0, Math.PI * 2); c.fill();
}

function drawAttitude(t) {
  const [c, w, h] = prepCanvas(document.getElementById('attitude'));
  const i = idx(t), cx = h / 2 + 4, cy = h / 2, Rr = h / 2 - 8;
  c.strokeStyle = C.inkFaint; c.lineWidth = 1;
  c.beginPath(); c.arc(cx, cy, Rr, 0, Math.PI * 2); c.stroke();
  for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2, l = k % 9 === 0 ? 6 : 3; c.beginPath(); c.moveTo(cx + Math.cos(a) * Rr, cy + Math.sin(a) * Rr); c.lineTo(cx + Math.cos(a) * (Rr - l), cy + Math.sin(a) * (Rr - l)); c.stroke(); }
  const hd = heading(t), vd = ang(meas.vx[i], meas.vz[i]), sd = sensorDir(meas.x[i], meas.z[i]);
  c.fillStyle = withAlpha(C.ink, 0.07);
  c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, Rr - 1, sd - SENSOR.halfAngle, sd + SENSOR.halfAngle); c.closePath(); c.fill();
  const vx = cx + Math.cos(vd) * (Rr - 4), vy = cy + Math.sin(vd) * (Rr - 4);
  c.strokeStyle = C.velocity; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx, cy); c.lineTo(vx, vy);
  c.moveTo(vx, vy); c.lineTo(vx - Math.cos(vd - 0.45) * 7, vy - Math.sin(vd - 0.45) * 7);
  c.moveTo(vx, vy); c.lineTo(vx - Math.cos(vd + 0.45) * 7, vy - Math.sin(vd + 0.45) * 7); c.stroke();
  c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(hd) * (Rr * 0.7), cy + Math.sin(hd) * (Rr * 0.7)); c.stroke();
  if (meas.thr[i]) { c.strokeStyle = C.thrust; c.lineWidth = 2; c.beginPath(); c.moveTo(cx - Math.cos(hd) * Rr * 0.75, cy - Math.sin(hd) * Rr * 0.75); c.lineTo(cx - Math.cos(hd) * Rr * 0.35, cy - Math.sin(hd) * Rr * 0.35); c.stroke(); }
  c.fillStyle = C.ink; c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();
  const deg = (a) => ((THREE.MathUtils.radToDeg(a) % 360) + 360) % 360;
  const rate = (heading(t + 0.1) - heading(t - 0.1)) / 0.2;
  const tx = cx + Rr + 16;
  const rows = [['HDG', deg(hd).toFixed(1), C.ink], ['VEL', deg(vd).toFixed(1), C.velocity], ['β', (((deg(hd - vd) + 180) % 360) - 180).toFixed(1), C.inkDim], ['ω', THREE.MathUtils.radToDeg(rate).toFixed(2), C.inkDim]];
  c.textBaseline = 'alphabetic';
  rows.forEach(([k, v, col], r) => {
    c.font = font(9); c.fillStyle = C.inkFaint; c.fillText(k, tx, 16 + r * 24);
    c.font = font(14); c.fillStyle = col; c.fillText(v, tx + 26, 16 + r * 24);
  });
  document.getElementById('att-mode').textContent = meas.thr[i] ? 'BURN' : slewing(t) ? 'SLEW' : 'HOLD';
}

function diamond(c, x, y, r) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); }
function tri(c, x, y, r) { c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y + r * 0.8); c.lineTo(x - r, y + r * 0.8); c.closePath(); c.fill(); }
function square(c, x, y, r) { c.fillRect(x - r, y - r, 2 * r, 2 * r); }
function eventGlyph(c, kind, x, y, r) {
  if (kind === 'caution') { c.fillStyle = C.caution; tri(c, x, y, r); }
  if (kind === 'warning' || kind === 'damage') { c.fillStyle = C.warning; square(c, x, y, r * 0.8); }
  if (kind === 'success') { c.strokeStyle = C.ink; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y, r * 0.8, 0, Math.PI * 2); c.stroke(); }
}

function drawTimeline(t) {
  const [c, w, h] = prepCanvas(document.getElementById('timeline'));
  const x0 = 46, x1 = w - 10;
  const X = (tt) => x0 + (tt / T_END) * (x1 - x0);
  const lanes = ['BURN', 'ATT', 'SENS', 'EVT'];
  const laneH = (h - 16) / lanes.length;
  const ly = (k) => 4 + k * laneH + laneH / 2;
  c.font = font(9); c.textBaseline = 'middle';
  lanes.forEach((ln, k) => { c.fillStyle = C.inkFaint; c.fillText(ln, 4, ly(k)); c.fillRect(x0, ly(k), x1 - x0, 1); });
  for (let s = 0; s <= T_END; s += 4) { c.fillStyle = C.inkFaint; c.fillRect(X(s), h - 12, 1, s % 12 === 0 ? 5 : 3); if (s % 12 === 0) c.fillText(`+${s}`, X(s) + 2, h - 5); }
  c.fillStyle = C.thrust; c.globalAlpha = 0.85; c.fillRect(X(PLAN.burnT), ly(0) - 5, X(PLAN.burnT + PLAN.burnDur) - X(PLAN.burnT), 10); c.globalAlpha = 1;
  c.fillStyle = C.inkDim; c.fillText('PRO 0.3', X(PLAN.burnT + PLAN.burnDur) + 4, ly(0));
  c.strokeStyle = C.ink; c.lineWidth = 1.5; c.beginPath();
  c.moveTo(X(0), ly(1)); c.lineTo(X(6), ly(1)); c.lineTo(X(8.5), ly(1) - 5); c.lineTo(X(11), ly(1) - 5); c.lineTo(X(14), ly(1) + 4); c.lineTo(X(T_END), ly(1) + 4); c.stroke();
  c.fillStyle = withAlpha(C.ink, 0.18); c.fillRect(X(0), ly(2) - 3, X(T_END) - X(0), 6);
  c.fillStyle = C.inkDim; c.fillText('NAV→M1', X(0) + 4, ly(2) - 8);
  // Forecast: issued at T+0 (Black Box ◆), horizon bar.
  c.fillStyle = C.blackbox; diamond(c, X(0) + 3, ly(3), 4);
  c.fillStyle = withAlpha(C.forecast, 0.8); c.fillRect(X(HORIZON), ly(3) - 6, 1.5, 12);
  c.fillStyle = withAlpha(C.ink, 0.5);
  for (let s = 1.5; s <= Math.min(t, T_END); s += 1.5) c.fillRect(X(s), ly(3) - 2, 1.5, 4);
  if (t >= tCaution) eventGlyph(c, 'caution', X(tCaution), ly(3), 5);
  for (const m of fx.marks) eventGlyph(c, m.kind, X(m.t), ly(3), 5);
  c.fillStyle = withAlpha(C.panel, 0.55);
  c.fillRect(X(t), 0, x1 - X(t), h - 12);
  c.fillStyle = C.ink; c.fillRect(X(t), 0, 1.5, h - 10);
}

function drawTape(t) {
  const [c, w] = prepCanvas(document.getElementById('tape'));
  const rows = [{ len: 20.5, end: 'lost' }, { len: 41, end: 'recall' }, { len: t, end: 'now' }];
  const X = (tt) => 2 + (tt / T_END) * (w - 4);
  rows.forEach((r, k) => {
    const y = 6 + k * 13;
    c.fillStyle = C.inkFaint; c.fillRect(X(0), y, X(T_END) - X(0), 1);
    c.fillStyle = withAlpha(C.blackbox, k === 2 ? 0.9 : 0.45);
    c.fillRect(X(0), y - 1, X(r.len) - X(0), 3);
    if (r.end === 'lost') { c.fillStyle = C.ink; c.fillRect(X(r.len) - 1, y - 4, 2, 9); }
    if (r.end === 'recall') { c.strokeStyle = C.blackbox; c.lineWidth = 1; c.strokeRect(X(r.len) - 3, y - 3, 6, 7); }
    if (k === 2) {
      if (t > PLAN.burnT) { c.fillStyle = C.thrust; c.fillRect(X(PLAN.burnT), y - 3, X(Math.min(t, PLAN.burnT + PLAN.burnDur)) - X(PLAN.burnT), 7); }
      if (t >= tCaution) eventGlyph(c, 'caution', X(tCaution), y, 4);
      for (const m of fx.marks) eventGlyph(c, m.kind, X(m.t), y, 4);
      c.fillStyle = C.blackbox; c.fillRect(X(t), y - 4, 1.5, 9);
    } else {
      c.fillStyle = C.thrust; c.globalAlpha = 0.5; c.fillRect(X(k === 0 ? 8 : PREV.burnT), y - 3, X(2) - X(0), 7); c.globalAlpha = 1;
    }
  });
}

// ---------------------------------------------------------------------------
// Frame update
// ---------------------------------------------------------------------------
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
const tmpC = new THREE.Color();
const cAst = color(C.asteroid), cBB = color(C.blackbox), cMeas = color(C.measured), cWarn = color(C.warning), cWhite = new THREE.Color(1, 1, 1);

function updateWorld(t) {
  const i = idx(t);
  const x = meas.x[i], z = meas.z[i];
  const sd = sensorDir(x, z);

  // Coverage history grows as the ship senses.
  if (lastHistI < 0 || i < lastHistI) { resetHistory(); for (let k = 0; k <= i; k += 20) stampCoverage(meas.x[k], meas.z[k], 1); lastHistI = i; }
  else if (i - lastHistI >= 20) { for (let k = lastHistI + 20; k <= i; k += 20) stampCoverage(meas.x[k], meas.z[k], 1); lastHistI = i - ((i - lastHistI) % 20); }
  histTex.needsUpdate = true;

  const pu = world.plane.material.uniforms;
  pu.uShip.value.set(x, z);
  pu.uSensDir.value.set(Math.cos(sd), Math.sin(sd));

  // Asteroids: tracked if in coverage now; stale ring if seen earlier this attempt;
  // prior ring (Black Box hue) if only an earlier attempt's record has it.
  ASTEROIDS.forEach((a, k) => {
    const cov = isCovered(a.x, a.z, x, z);
    if (cov) { a.seen = true; a.last = t; }
    if (cov) {
      q.setFromAxisAngle(up, a.rot + t * 0.2);
      m4.compose(p3.set(a.x, a.size * 0.3, a.z), q, s3.setScalar(a.size));
      world.rocks.setMatrixAt(k, m4);
      m4.compose(p3, q, s3.setScalar(0)); world.rings.setMatrixAt(k, m4);
    } else {
      m4.compose(p3.set(a.x, 0, a.z), q.identity(), s3.setScalar(0)); world.rocks.setMatrixAt(k, m4);
      if (a.seen || a.prior) {
        const age = a.seen ? t - a.last : 0;
        const r = a.seen ? Math.min(a.size + 0.35 + 0.08 * age, 4) : a.size + 0.7;
        const al = a.seen ? Math.max(A.staleMin, 0.7 - age / 40) : A.priorEvidence;
        m4.compose(p3.set(a.x, 0.04, a.z), q.identity(), s3.set(r, 1, r));
        world.rings.setMatrixAt(k, m4);
        world.rings.setColorAt(k, tmpC.copy(a.seen ? cAst : cBB).multiplyScalar(al));
      } else {
        m4.compose(p3, q.identity(), s3.setScalar(0)); world.rings.setMatrixAt(k, m4);
      }
    }
  });
  world.rocks.instanceMatrix.needsUpdate = true;
  world.rings.instanceMatrix.needsUpdate = true;
  world.rings.instanceColor.needsUpdate = true;

  // Trail: grows with time (or shows the whole record in comparison).
  world.trail.geometry.instanceCount = world.trailFull ? N - 1 : Math.max(1, i);

  // Ship pose. Symbol scales up with distance so it stays legible.
  const sp = world.shipParts;
  const camDist = camera.position.distanceTo(controls.target);
  const sym = THREE.MathUtils.clamp(camDist / R.shipMinScreenScale, 1, 4);
  sp.ship.position.set(x, 0, z);
  sp.ship.rotation.y = -heading(t);
  sp.ship.scale.setScalar(sym);
  const burning = meas.thr[i] === 1;
  sp.thrust.visible = burning || (t > PLAN.burnT - 2.5 && t < PLAN.burnT);
  sp.thrust.children.forEach((c) => (c.material.opacity = burning ? 1 : 0.35));

  // Damage: two short flickers in warning, then a permanent notch.
  const since = fx.damageAt < 0 ? Infinity : nowMs() - fx.damageAt;
  const flick = since < 4 * M.flicker && Math.floor(since / M.flicker) % 2 === 0;
  sp.edgeMat.color.copy(flick ? cWarn : cMeas);
  sp.fpMat.color.copy(flick ? cWarn : cMeas);
  sp.notch.visible = fx.damaged;

  // Success: the measured trail brightens once, then settles.
  const ss = fx.successAt < 0 ? Infinity : nowMs() - fx.successAt;
  const glow = ss < M.settle * 2 ? Math.sin(Math.min(1, ss / (M.settle * 2)) * Math.PI) : 0;
  world.trailMat.color.copy(cMeas).lerp(cWhite, glow * 0.8);
  world.trailMat.linewidth = L.measured + glow * 1.2;

  // Velocity vector (world frame, length ∝ speed).
  const vx = meas.vx[i], vz = meas.vz[i], v = Math.hypot(vx, vz), k = 1.25;
  const ex = x + vx * k, ez = z + vz * k, hx = -vx / v, hz = -vz / v, hs = 1.4 * Math.min(sym, 2);
  const cs = Math.cos(0.42), sn = Math.sin(0.42), y = 1.0 * sym;
  sp.vel.geometry.setPositions([
    x, y, z, ex, y, ez,
    ex, y, ez, ex + (hx * cs - hz * sn) * hs, y, ez + (hx * sn + hz * cs) * hs,
    ex, y, ez, ex + (hx * cs + hz * sn) * hs, y, ez + (-hx * sn + hz * cs) * hs,
  ]);

  // Forecast-now ghost and its link to the ship (absent beyond the horizon).
  const iF = Math.min(i, NH), gx = fc.x[iF], gz = fc.z[iF];
  world.ghost.visible = world.ghostLink.visible = i <= NH;
  world.ghost.position.set(gx, 0.14, gz);
  world.ghost.scale.setScalar(Math.min(sym, 2.5));
  const caution = i >= cautionIdx && i <= NH;
  world.ghost.material.color.set(caution ? C.caution : C.forecast);
  world.ghostLinkMat.color.set(caution ? C.caution : C.forecast);
  world.ghostLink.geometry.setPositions([gx, 0.14, gz, x, 0.14, z]);
  world.ghostLink.computeLineDistances();

  sceneObj?.update?.(t, sym);
}

function updatePanels(t) {
  const i = idx(t);
  const mm = Math.floor(t / 60), ss = t - mm * 60;
  document.getElementById('met').textContent = `T+${String(mm).padStart(2, '0')}:${ss.toFixed(1).padStart(4, '0')}`;
  const r1 = Math.hypot(meas.x[i] - BODIES[0].x, meas.z[i] - BODIES[0].z);
  document.getElementById('ro-r1').textContent = (r1 * 1000).toFixed(0);
  document.getElementById('ro-v').textContent = Math.hypot(meas.vx[i], meas.vz[i]).toFixed(2);
  const burnt = Math.min(Math.max(t - PLAN.burnT, 0), PLAN.burnDur);
  document.getElementById('ro-prop').textContent = (92.4 - burnt * 1.9).toFixed(1);
  document.getElementById('ro-heat').textContent = (1.18 + (meas.thr[i] ? 0.6 : 0) + 0.02 * Math.sin(t)).toFixed(2);
  const burning = meas.thr[i] === 1;
  document.getElementById('v-eng').textContent = burning ? '100 %' : '0 %';
  document.querySelector('.eq[data-k="eng"]').classList.toggle('thrusting', burning);
  document.querySelector('.eq[data-k="acs"]').classList.toggle('active', slewing(t));
  document.getElementById('v-acs').textContent = slewing(t) ? 'SLEW' : burning ? 'TRK' : 'HOLD';
  document.getElementById('nav-sigma').textContent = navSigma(t).toFixed(2);
  document.getElementById('v-bat').textContent = `${(78 - t * 0.05).toFixed(0)} %`;
  document.querySelector('.eq[data-k="rad"]').classList.toggle('fault', fx.damaged);
  document.getElementById('v-rad').textContent = fx.damaged ? '1/2' : '2/2';
  document.getElementById('v-proc').textContent = sceneId === 'lattice' ? 'LATTICE' : 'OPNAV';
  const st = 41 + t * 0.12;
  document.getElementById('bb-store').style.width = `${st}%`;
  document.getElementById('bb-store-n').textContent = st.toFixed(0);
  document.getElementById('res-panel').dataset.alert = i >= cautionIdx && i <= NH ? 'caution' : '';
  document.getElementById('view').dataset.hit = nowMs() - fx.damageAt < M.alertIn ? '1' : '';
  drawPower(t); drawSpark(t); drawResidual(t); drawAttitude(t); drawTimeline(t); drawTape(t);
}

function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (playing) {
    if (t >= T_END) { hold += dt; if (hold > 3) { t = 0; hold = 0; lastHistI = -1; } }
    else t = Math.min(T_END, t + dt);
  }
  controls.update();
  updateWorld(t);
  composer.render();
  labelRenderer.render(scene, camera);
  if (frameN++ % 2 === 0) updatePanels(t);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------------------
// Controls & boot
// ---------------------------------------------------------------------------
const sceneKeys = Object.keys(SCENES);
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const n = Number(e.key);
  if (n >= 1 && n <= sceneKeys.length) setScene(sceneKeys[n - 1]);
  else if (e.key === ' ') { playing = !playing; syncTc(); e.preventDefault(); }
  else if (e.key === 'ArrowRight') t = Math.min(T_END, t + 2);
  else if (e.key === 'ArrowLeft') t = Math.max(0, t - 2);
  else if (e.key === 'r') { t = 0; lastHistI = -1; }
  else if (e.key === 'h') document.body.classList.toggle('no-chrome');
  else if (e.key === 'v') document.body.classList.toggle('view-only');
  else if (e.key === 'f') { userMoved = false; fitCamera(); }
});
function syncTc() { document.getElementById('tc-pause').classList.toggle('on', !playing); document.getElementById('tc-play').classList.toggle('on', playing); }
document.getElementById('tc-pause').addEventListener('click', () => { playing = false; syncTc(); });
document.getElementById('tc-play').addEventListener('click', () => { playing = true; syncTc(); });

const params = new URLSearchParams(location.search);
setScene(SCENES[params.get('s')] ? params.get('s') : 'flight');
if (params.has('t')) t = Math.min(T_END, Math.max(0, Number(params.get('t'))));
if (params.get('pause') === '1') playing = false;
if (params.get('chrome') === '0') document.body.classList.add('no-chrome');
if (params.get('view') === '1') document.body.classList.add('view-only');
for (const k of (params.get('fx') ?? '').split(',').filter(Boolean)) trigger(k);
syncTc();
size();
requestAnimationFrame(frame);

// Debug handle for screenshots and inspection.
window.__proto = { get t() { return t; }, set t(v) { t = v; }, get playing() { return playing; }, set playing(v) { playing = v; syncTc(); }, tKnee, tCaution, camera, controls, trigger, setScene };
