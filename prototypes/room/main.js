// Compartment and screen-composition mock-up (owner's brief, 2026-11-14): a walkable control room
// with a panoramic window and a central console; MAP, SHIP and FLIGHT project as holograms above
// the console, CONSOLE is the screen in its top. A layout study in the Night Watch theme, not game
// code: the world is a toy, the data is mock, nothing here is wired to the simulation.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { colour as C, type as TY, hex } from '../visual/theme.js';
import * as G from './gfx.js';
import { makeWorld } from './world.js';
import { makeFlightHolo } from './holo-flight.js';
import { makeMapHolo } from './holo-map.js';
import { makeShipHolo } from './holo-ship.js';
import { initConsoleScreen, consoleTopTexture, padTexture } from './screen.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const $ = (s) => document.querySelector(s);
const V3 = (c) => new THREE.Color(hex(c));
const PI = Math.PI;

for (const [k, v] of Object.entries(C)) document.documentElement.style.setProperty(`--${k}`, v);
document.documentElement.style.setProperty('--font', TY.family);
if (q.get('chrome') === '0') document.body.classList.add('no-chrome');

// ---- Renderer ------------------------------------------------------------------------------------
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.06, 9000);
camera.rotation.order = 'YXZ';
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.4, 0.3);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const labels = new CSS2DRenderer({ element: $('#labels') });

// ---- Dimensions ----------------------------------------------------------------------------------
const ROOM = { W: 8, back: 4.6, zc: -1.0, R: 4, H: 3.0, sill: 0.82, head: 2.62, eye: 1.68 };
const CON = { x: 0, z: -0.9, w: 3.0, d: 1.8, top: 0.95 };
const HOLO = new THREE.Vector3(0, 1.42, CON.z);
const PLANE_Y = 1.6; // the flight plane passes through the ship at about window height
const SO = 8; // metres outside the window per environment unit

// ---- Things that dim when a hologram takes the player's attention ------------------------------
const lights = [];
const glows = [];
const addLight = (l) => { lights.push({ l, base: l.intensity }); scene.add(l); return l; };
const glowMat = (col, k = 1, extra = {}) => {
  const m = new THREE.MeshBasicMaterial({ color: V3(col).multiplyScalar(k), ...extra });
  glows.push({ m, base: m.color.clone() });
  return m;
};
function applyLevel(k) {
  for (const o of lights) o.l.intensity = o.base * k;
  for (const o of glows) o.m.color.copy(o.base).multiplyScalar(k);
}

// ---- Textures ------------------------------------------------------------------------------------
const lcg = (seed) => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
function panelTexture(bands) {
  const r = lcg(21);
  const t = G.canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#1d1711';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      x.fillStyle = `rgba(255,220,170,${r() * 0.028})`;
      x.fillRect(r() * w, r() * h, 1, 10 + r() * 40);
    }
    x.strokeStyle = '#0a0705';
    x.lineWidth = 5;
    for (let i = 0; i <= 2; i++) { x.beginPath(); x.moveTo(i * 256, 0); x.lineTo(i * 256, h); x.stroke(); }
    if (bands) for (const yy of [0.12, 0.7]) { x.beginPath(); x.moveTo(0, h * yy); x.lineTo(w, h * yy); x.stroke(); }
    x.fillStyle = '#2c2219';
    for (let i = 0; i < 2; i++)
      for (const yy of bands ? [0.03, 0.16, 0.66, 0.74] : [0.06, 0.94])
        for (const dx of [16, 240]) { x.beginPath(); x.arc(i * 256 + dx, h * yy, 3, 0, 7); x.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const wallTex = panelTexture(true);
const plainTex = panelTexture(false);
const floorTex = (() => {
  const r = lcg(4);
  const t = G.canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#15110d';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(255,230,190,${r() * 0.03})`;
      x.fillRect(r() * w, r() * h, 2 + r() * 5, 1);
    }
    x.strokeStyle = '#070504';
    x.lineWidth = 6;
    x.strokeRect(0, 0, w, h);
    x.lineWidth = 2;
    x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
    x.fillStyle = '#261d15';
    for (const [a, b] of [[18, 18], [w - 18, 18], [18, h - 18], [w - 18, h - 18]]) { x.beginPath(); x.arc(a, b, 4, 0, 7); x.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const std = (tex, rx, ry, extra = {}) => {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(rx, ry);
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, metalness: 0.3, ...extra });
};
const darkMat = new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.55, metalness: 0.55 });

// ---- The room ------------------------------------------------------------------------------------
const room = new THREE.Group();
scene.add(room);
{
  const { W, back, zc, R, H } = ROOM;
  const fs = new THREE.Shape();
  fs.moveTo(-W / 2, -back);
  fs.lineTo(W / 2, -back);
  fs.lineTo(W / 2, -zc);
  fs.absarc(0, -zc, R, 0, PI, false);
  fs.lineTo(-W / 2, -back);
  const fg = new THREE.ShapeGeometry(fs, 48);
  const floor = new THREE.Mesh(fg, std(floorTex, 0.5, 0.5, { roughness: 0.62, metalness: 0.45 }));
  floor.rotation.x = -PI / 2;
  const ceil = new THREE.Mesh(fg, std(plainTex, 0.5, 0.5, { side: THREE.BackSide, roughness: 0.9 }));
  ceil.rotation.x = -PI / 2;
  ceil.position.y = H;
  room.add(floor, ceil);
  const len = back - zc;
  const wall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), std(wallTex, w / 2, 1));
    m.position.set(x, H / 2, z);
    m.rotation.y = ry;
    room.add(m);
  };
  wall(len, -W / 2, (back + zc) / 2, PI / 2);
  wall(len, W / 2, (back + zc) / 2, -PI / 2);
  wall(W, 0, back, PI);
  // Ceiling ribs and two warm light bars.
  for (const z of [3.5, 2.0, 0.5, -1.0]) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, 0.2), darkMat);
    rib.position.set(0, H - 0.07, z);
    room.add(rib);
  }
  for (const x of [-1.7, 1.7]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 1.5), glowMat('#ffb070', 0.75));
    bar.position.set(x, H - 0.15, 2.75);
    room.add(bar);
    const l = new THREE.PointLight(0xffb070, 9, 9, 2);
    l.position.set(x, H - 0.35, 2.75);
    addLight(l);
  }
  // Floor-edge guide strips.
  const strip = glowMat('#ff9a40', 0.5);
  for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, len), strip);
    s.position.set(x, 0.05, (back + zc) / 2);
    room.add(s);
  }
  const fstrip = new THREE.Mesh(new THREE.CylinderGeometry(R - 0.03, R - 0.03, 0.025, 64, 1, true, PI / 2, PI), glowMat('#ff9a40', 0.5, { side: THREE.BackSide }));
  fstrip.position.set(0, 0.05, zc);
  room.add(fstrip);
  // Door the player wakes behind.
  const door = new THREE.Group();
  door.position.set(0, 0, back - 0.03);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.25, 0.04), new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: 0.5, metalness: 0.6 }));
  slab.position.y = 1.125;
  door.add(slab);
  for (const x of [-0.72, 0.72]) {
    const j = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), darkMat);
    j.position.set(x, 1.2, -0.03);
    door.add(j);
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.02, 2.1, 0.02), glowMat('#ff9a40', 0.6));
    g.position.set(x * 0.9, 1.15, -0.1);
    door.add(g);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 0.12), darkMat);
  lintel.position.set(0, 2.33, -0.03);
  door.add(lintel);
  room.add(door);
  const dl = new THREE.PointLight(0xffa050, 5, 7, 2);
  dl.position.set(0, 2.2, back - 0.7);
  addLight(dl);
  // Side-wall status niches.
  const niche = (seed) => G.canvasTex(512, 256, (x, w, h) => {
    const r = lcg(seed);
    x.fillStyle = '#0b0806';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = C.panelEdge;
    x.lineWidth = 3;
    x.strokeRect(2, 2, w - 4, h - 4);
    for (let i = 0; i < 7; i++) {
      x.fillStyle = C.unknown;
      x.fillRect(24, 26 + i * 30, 210, 9);
      x.fillStyle = C.ink;
      x.fillRect(24, 26 + i * 30, 210 * (0.2 + r() * 0.7), 9);
    }
    x.strokeStyle = C.ink;
    x.lineWidth = 3;
    x.beginPath();
    let v = 0.5;
    for (let i = 0; i <= 40; i++) {
      v = G.clamp(v + (r() - 0.5) * 0.16, 0.1, 0.9);
      x[i ? 'lineTo' : 'moveTo'](270 + i * 5.4, 230 - v * 200);
    }
    x.stroke();
  });
  for (const [x, ry, seed] of [[-W / 2 + 0.02, PI / 2, 3], [W / 2 - 0.02, -PI / 2, 9]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.65), glowMat('#ffffff', 0.5, { map: niche(seed) }));
    m.position.set(x, 1.5, 1.6);
    m.rotation.y = ry;
    room.add(m);
  }
}

// Curved front wall with the panoramic window; rebuilt when the arc changes.
const glassMat = new THREE.MeshBasicMaterial({ color: 0xffe2c4, transparent: true, opacity: 0.007, side: THREE.BackSide, depthWrite: false });
let front = null;
let arcDeg = G.clamp(num('arc', 150), 90, 180);
function buildFront() {
  const { zc, R, H, sill, head } = ROOM;
  if (front) {
    room.remove(front);
    front.traverse((o) => o.geometry?.dispose());
  }
  front = new THREE.Group();
  room.add(front);
  const a = THREE.MathUtils.degToRad(arcDeg) / 2;
  const cyl = (y0, y1, t0, t1, mat, r = R) => {
    const g = new THREE.CylinderGeometry(r, r, y1 - y0, Math.max(6, Math.round((t1 - t0) / 0.04)), 1, true, t0, t1 - t0);
    const m = new THREE.Mesh(g, mat);
    m.position.set(0, (y0 + y1) / 2, zc);
    front.add(m);
    return m;
  };
  const cm = (t0, t1, y0, y1) => std(plainTex, ((t1 - t0) * R) / 2, (y1 - y0) / 2, { side: THREE.BackSide });
  cyl(0, sill, PI / 2, 1.5 * PI, cm(PI / 2, 1.5 * PI, 0, sill));
  cyl(head, H, PI / 2, 1.5 * PI, cm(PI / 2, 1.5 * PI, head, H));
  if (a < PI / 2 - 0.01) {
    cyl(sill, head, PI / 2, PI - a, cm(PI / 2, PI - a, sill, head));
    cyl(sill, head, PI + a, 1.5 * PI, cm(PI + a, 1.5 * PI, sill, head));
  }
  const glass = cyl(sill, head, PI - a, PI + a, glassMat);
  glass.renderOrder = -10;
  const frame = new THREE.MeshStandardMaterial({ color: 0x0d0a08, roughness: 0.45, metalness: 0.7, side: THREE.DoubleSide });
  cyl(sill - 0.05, sill + 0.03, PI - a, PI + a, frame, R - 0.07);
  cyl(head - 0.03, head + 0.05, PI - a, PI + a, frame, R - 0.07);
  const n = Math.round(arcDeg / 15);
  for (let i = 0; i <= n; i++) {
    const th = PI - a + (2 * a * i) / n;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, head - sill, 0.16), frame);
    m.position.set(Math.sin(th) * (R - 0.06), (sill + head) / 2, zc + Math.cos(th) * (R - 0.06));
    m.rotation.y = th;
    front.add(m);
  }
  // A thin warm line under the sill so the window's edge reads in the dark.
  const s = cyl(sill - 0.12, sill - 0.1, PI - a, PI + a, glowMat('#ff9a40', 0.45, { side: THREE.BackSide }), R - 0.02);
  s.userData.glow = true;
}
buildFront();

// ---- The console ---------------------------------------------------------------------------------
const con = new THREE.Group();
con.position.set(CON.x, 0, CON.z);
scene.add(con);
const hotspots = [];
const pads = [];
let screenMat;
let bbxLamp;
let ringMat;
{
  const ped = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.82, 1.05), darkMat);
  ped.position.y = 0.41;
  con.add(ped);
  hotspots.push(ped);
  const rr = new THREE.Shape();
  const hw = CON.w / 2;
  const hd = CON.d / 2;
  const r = 0.3;
  rr.moveTo(-hw + r, -hd);
  rr.lineTo(hw - r, -hd);
  rr.absarc(hw - r, -hd + r, r, -PI / 2, 0, false);
  rr.lineTo(hw, hd - r);
  rr.absarc(hw - r, hd - r, r, 0, PI / 2, false);
  rr.lineTo(-hw + r, hd);
  rr.absarc(-hw + r, hd - r, r, PI / 2, PI, false);
  rr.lineTo(-hw, -hd + r);
  rr.absarc(-hw + r, -hd + r, r, PI, 1.5 * PI, false);
  const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(rr, { depth: 0.13, bevelEnabled: false, curveSegments: 10 }), new THREE.MeshStandardMaterial({ color: 0x1a140e, roughness: 0.42, metalness: 0.65 }));
  slab.rotation.x = -PI / 2;
  slab.position.y = CON.top - 0.13;
  con.add(slab);
  hotspots.push(slab);
  // The main console screen, set into the top.
  screenMat = new THREE.MeshBasicMaterial({ map: consoleTopTexture() });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.72, 1.49), screenMat);
  screen.rotation.x = -PI / 2;
  screen.position.y = CON.top + 0.003;
  screen.userData.hot = 'console';
  con.add(screen);
  hotspots.push(screen);
  // Projector ring.
  ringMat = new THREE.MeshBasicMaterial({ color: V3(C.ink).multiplyScalar(0.9) });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.011, 8, 72), ringMat);
  ring.rotation.x = PI / 2;
  ring.position.y = CON.top + 0.012;
  con.add(ring);
  // Warm light under the overhang.
  const under = glowMat('#ff9a40', 0.55);
  for (const z of [-0.54, 0.54]) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.02, 0.02), under);
    s.position.set(0, 0.8, z);
    con.add(s);
  }
  for (const z of [1.15, -1.15]) {
    const l = new THREE.PointLight(0xff9a40, 2.2, 5, 2);
    l.position.set(CON.x, 0.5, CON.z + z);
    addLight(l);
  }
  // Key rail on the side the player arrives from.
  const rail = new THREE.Group();
  rail.position.set(0, CON.top + 0.045, hd - 0.2);
  rail.rotation.x = 0.5;
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.56, 0.06, 0.27), darkMat);
  rail.add(base);
  [['map', 'MAP'], ['ship', 'SHIP'], ['console', 'CONSOLE'], ['flight', 'FLIGHT']].forEach(([id, text], i) => {
    const mat = new THREE.MeshBasicMaterial({ map: padTexture(text), color: 0xbbbbbb });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.19), mat);
    p.rotation.x = -PI / 2;
    p.position.set(-0.93 + i * 0.62, 0.033, 0);
    rail.add(p);
    pads.push({ id, mat });
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.16, 0.3), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    hit.position.copy(p.position);
    hit.position.y += 0.04;
    hit.userData.hot = id;
    rail.add(hit);
    hotspots.push(hit);
  });
  con.add(rail);
  // Black Box: a physical recorder docked in the end of the console.
  const bb = new THREE.Group();
  bb.position.set(hw - 0.22, 0.6, 0.1);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.62), new THREE.MeshStandardMaterial({ color: 0xb4520f, roughness: 0.5, metalness: 0.25, emissive: 0x2a1003 }));
  body.userData.hot = 'bbx';
  bb.add(body);
  hotspots.push(body);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.28), new THREE.MeshBasicMaterial({
    transparent: true,
    map: G.canvasTex(512, 256, (x, w, h) => {
      x.clearRect(0, 0, w, h);
      x.fillStyle = '#1a0d04';
      x.font = `600 58px ${TY.family}`;
      x.textAlign = 'center';
      x.fillText('BLACK BOX', w / 2, 110);
      x.font = `600 30px ${TY.family}`;
      x.fillText('FLIGHT RECORDER · DO NOT OPEN', w / 2, 170);
    }),
  }));
  face.position.x = 0.152;
  face.rotation.y = PI / 2;
  bb.add(face);
  bbxLamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshBasicMaterial({ color: V3(C.blackbox) }));
  bbxLamp.position.set(0.155, 0.11, -0.24);
  bb.add(bbxLamp);
  const bl = new THREE.PointLight(hex(C.blackbox), 0.5, 2.5, 2);
  bl.position.set(hw + 0.35, 0.7, 0.1);
  addLight(bl);
  bl.position.x += CON.x;
  bl.position.z += CON.z;
  con.add(bb);
}
addLight(new THREE.AmbientLight(0x2e241a, 0.85));
const winLight = new THREE.PointLight(0xffb070, 10, 12, 2);
winLight.position.set(-2.4, 2.0, -4.0);
addLight(winLight);
const holoLight = new THREE.PointLight(0xf1e4cc, 2.2, 6, 2);
holoLight.position.copy(HOLO).y += 0.2;
scene.add(holoLight);

// ---- Outside the window: what the eye can see, no sensors involved -----------------------------
const world = makeWorld();
const outsideRot = new THREE.Group();
outsideRot.position.set(0, PLANE_Y, 0);
scene.add(outsideRot);
const outside = new THREE.Group();
outsideRot.add(outside);
const sunDir = new THREE.Vector3(-0.62, 0.42, 0.5).normalize();
const uL = { value: new THREE.Vector3() };
const VS = `varying vec3 vN; varying vec3 vW; varying vec3 vO;
  void main(){ mat4 mm = modelMatrix;
  #ifdef USE_INSTANCING
    mm = modelMatrix * instanceMatrix;
  #endif
    vO = normal; vN = normalize(mat3(mm) * normal); vec4 wp = mm * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const bodyMat = (tint) => new THREE.ShaderMaterial({
  uniforms: { uL, cDark: { value: V3(C.body) }, cLit: { value: V3(tint) }, cRim: { value: V3(C.bodyRim) } },
  vertexShader: VS,
  fragmentShader: `uniform vec3 uL, cDark, cLit, cRim; varying vec3 vN; varying vec3 vW; varying vec3 vO;
    void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
      float d = smoothstep(-0.05, 0.9, dot(n, uL));
      float band = 0.86 + 0.14 * sin(vO.y * 21.0 + sin(vO.y * 7.0) * 2.0);
      float rim = pow(1.0 - max(dot(n, v), 0.0), 2.6) * smoothstep(-0.25, 0.4, dot(n, uL));
      gl_FragColor = vec4(cDark * 0.18 + cLit * d * band * 0.75 + cRim * rim * 0.75, 1.0); }`,
});
const rockMat = new THREE.ShaderMaterial({
  uniforms: { uL, cRock: { value: V3('#8f7d66') } },
  vertexShader: VS,
  fragmentShader: `uniform vec3 uL, cRock; varying vec3 vW;
    void main(){ vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); float d = max(dot(n, uL), 0.0);
      gl_FragColor = vec4(cRock * (0.035 + 0.95 * d), 1.0); }`,
});
for (const [i, b] of world.bodies.entries()) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(b.r * SO, 64, 40), bodyMat(i ? '#6f7f86' : '#8a6a4a'));
  m.position.set(b.x * SO, 0, b.z * SO);
  m.rotation.z = 0.3;
  outside.add(m);
}
const rockGeo = new THREE.IcosahedronGeometry(1, 1);
{
  const p = rockGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.78 + 0.42 * Math.abs((Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  rockGeo.computeVertexNormals();
}
const rocksOut = new THREE.InstancedMesh(rockGeo, rockMat, world.rocks.length);
rocksOut.frustumCulled = false;
outside.add(rocksOut);
const bigOut = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), rockMat);
{
  const p = bigOut.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 0.8 + 0.16 * Math.sin(x * 3.1 + y * 1.7) + 0.12 * Math.sin(z * 4.3 + x * 2.2) + 0.06 * Math.sin(y * 9.0);
    p.setXYZ(i, x * k, y * k * 0.82, z * k);
  }
}
outside.add(bigOut);
// Stars, and one lead: a point that brightens on a slow period.
{
  const r = lcg(99);
  const pos = [];
  const col = [];
  for (let i = 0; i < 3200; i++) {
    const u = r() * 2 - 1;
    const a = r() * 2 * PI;
    const s = Math.sqrt(1 - u * u);
    pos.push(Math.cos(a) * s * 6000, u * 6000, Math.sin(a) * s * 6000);
    const b = 0.16 + r() ** 4 * 0.84;
    const warm = r();
    col.push(b, b * (0.86 + warm * 0.12), b * (0.68 + warm * 0.3));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true }));
  stars.frustumCulled = false;
  outsideRot.add(stars);
}
const glimmer = new THREE.Mesh(new THREE.SphereGeometry(9, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
glimmer.position.set(2600, 420, -4600);
outsideRot.add(glimmer);

// ---- Holograms -----------------------------------------------------------------------------------
const veil = new THREE.Mesh(new THREE.SphereGeometry(3.3, 40, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthWrite: false }));
veil.position.copy(HOLO);
veil.renderOrder = -5;
scene.add(veil);
const holoRoot = new THREE.Group();
holoRoot.position.copy(HOLO);
scene.add(holoRoot);
const holoTilt = new THREE.Group();
holoRoot.add(holoTilt);
const cone = (() => {
  const seg = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * 2 * PI;
    seg.push(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4, Math.sin(a) * 1.1, 1, Math.cos(a) * 1.1);
  }
  const c = G.thin(seg, { colour: C.ink, opacity: 0.05 });
  c.position.set(HOLO.x, CON.top + 0.02, HOLO.z);
  scene.add(c);
  return c;
})();
const flight = makeFlightHolo({ world });
const map = makeMapHolo({ plate: $('#map-plate'), layers: $('#map-layers') }, { enterRegion: () => setRegion(true) });
const ship = makeShipHolo({ plate: $('#ship-plate'), layers: $('#ship-layers'), configs: $('#ship-configs') });
holoTilt.add(flight.group, map.group, ship.group);
const consoleScreen = initConsoleScreen($('#console-screen'));

// ---- Player, modes and camera --------------------------------------------------------------------
const player = { x: num('px', 0), z: num('pz', 3.75), yaw: num('yaw', 0), pitch: num('pitch', -0.05) };
const VIEW = {
  room: { level: 1, veil: 0, screen: 0.75, tilt: 0, holo: 1, lift: 0, fov: 62 },
  map: { pos: [0, 2.75, CON.z + 1.9], look: [0, 1.74, CON.z], level: 0, veil: 1, screen: 0, tilt: 0.45, holo: 1.4, lift: 0.4, fov: 42 },
  ship: { pos: [0, 2.3, CON.z + 2.3], look: [0, 1.72, CON.z], level: 0, veil: 1, screen: 0, tilt: 0, holo: 1.4, lift: 0.36, fov: 42 },
  console: { pos: [0, 2.56, CON.z + 0.001], look: [0, CON.top, CON.z], up: [0, 0, -1], level: 0.5, veil: 0, screen: 1, tilt: 0, holo: 0, lift: 0, fov: 62 },
  flight: { pos: [0, 1.9, CON.z + 2.55], look: [0, 1.42, CON.z - 1.0], level: 0.3, veil: 0, screen: 0.4, tilt: 0.3, holo: 1.2, lift: 0, fov: 60 },
};
let mode = 'room';
let region = false;
let trans = null;
let tilt = 0;
let tiltUser = 0;
const cur = { level: 1, veil: 0, screen: 0.75, holo: 1, lift: 0, fov: 62 };
const tmpM = new THREE.Matrix4();

function poseOf(m) {
  const v = VIEW[m];
  if (m === 'room') {
    return {
      pos: new THREE.Vector3(player.x, ROOM.eye, player.z),
      quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')),
    };
  }
  const pos = new THREE.Vector3(...v.pos);
  tmpM.lookAt(pos, new THREE.Vector3(...v.look), new THREE.Vector3(...(v.up ?? [0, 1, 0])));
  return { pos, quat: new THREE.Quaternion().setFromRotationMatrix(tmpM) };
}

function setRegion(on) {
  region = on;
  flight.setChart(on);
  flight.setRange(on ? 470 : 130);
  syncHud();
}

function syncHud() {
  document.body.dataset.mode = mode;
  document.body.dataset.region = region ? '1' : '0';
  $('#hud-title').textContent = { room: '', map: region ? 'MAP  ›  R-01  ›  REGION' : 'MAP  ›  EXPANSE', ship: 'SHIP', console: '', flight: 'FLIGHT' }[mode];
  document.querySelectorAll('[data-go]').forEach((b) => b.classList.toggle('on', b.dataset.go === mode));
  flight.group.visible = mode === 'room' || mode === 'flight' || (mode === 'map' && region);
  map.group.visible = mode === 'map' && !region;
  ship.group.visible = mode === 'ship';
  $('#btn-up').classList.toggle('on', flight.headingUp);
  document.querySelectorAll('[data-lat]').forEach((b) => b.classList.toggle('on', Number(b.dataset.lat) === flight.lattice));
}

function go(m, { instant = false, page } = {}) {
  if (death || m === mode) return;
  if (document.pointerLockElement) document.exitPointerLock();
  $('#console-screen').classList.remove('on');
  const from = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
  if (mode === 'map') setRegion(false);
  mode = m;
  tiltUser = 0;
  if (m === 'room' || m === 'flight') { flight.setChart(false); flight.setRange(130); }
  if (m === 'console') consoleScreen.show(page);
  syncHud();
  trans = { t: instant ? 1 : 0, dur: 0.8, from, to: poseOf(m) };
}

function back() {
  if (mode === 'map' && region) setRegion(false);
  else if (mode !== 'room') go('room');
}

function constrain(p) {
  const m = 0.38;
  const { W, back: bk, zc, R } = ROOM;
  p.x = G.clamp(p.x, -W / 2 + m, W / 2 - m);
  p.z = Math.min(p.z, bk - m);
  if (p.z < zc) {
    const dz = p.z - zc;
    const d = Math.hypot(p.x, dz);
    if (d > R - m) { p.x = (p.x / d) * (R - m); p.z = zc + (dz / d) * (R - m); }
  }
  const hx = CON.w / 2 + m + 0.25;
  const hz = CON.d / 2 + m + 0.05;
  const lx = p.x - CON.x;
  const lz = p.z - CON.z;
  if (Math.abs(lx) < hx && Math.abs(lz) < hz) {
    if (hx - Math.abs(lx) < hz - Math.abs(lz)) p.x = CON.x + Math.sign(lx || 1) * hx;
    else p.z = CON.z + Math.sign(lz || 1) * hz;
  }
}

// ---- Input ---------------------------------------------------------------------------------------
const keys = new Set();
const mouse = new THREE.Vector2(0, 0);
const ray = new THREE.Raycaster();
let drag = null;
let hot = null;
let lastInput = 0;
const HOT_NAME = { map: 'MAP', ship: 'SHIP', console: 'CONSOLE', flight: 'FLIGHT', bbx: 'BLACK BOX' };
const locked = () => document.pointerLockElement === canvas;

function activate(id) {
  if (id === 'bbx') go('console', { page: 'BLACK BOX' });
  else if (id) go(id);
}

addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === 'escape' || k === 'backspace') back();
  if (k === '1') go('map');
  if (k === '2') go('ship');
  if (k === '3') go('console');
  if (k === '4') go('flight');
  if (k === '0') go('room');
  if (k === 'h') document.body.classList.toggle('no-chrome');
  if (k === 'k') die();
  if (k === 'u') { flight.setHeadingUp(!flight.headingUp); syncHud(); }
  if (k === 'l' && mode === 'flight') { flight.setLattice((flight.lattice + 1) % 3); syncHud(); }
  if ((k === 'f' || k === 'enter') && mode === 'room' && hot) activate(hot);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

canvas.addEventListener('mousedown', (e) => {
  drag = { x: e.clientX, y: e.clientY, moved: false };
  if (!locked()) mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
addEventListener('mouseup', (e) => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  if (moved || e.target !== canvas || trans || death) return;
  if (mode === 'room') {
    if (hot) activate(hot);
    else if (!locked()) canvas.requestPointerLock?.();
  } else if (mode === 'map' && !region) {
    ray.setFromCamera(mouse, camera);
    map.select(map.pick(ray));
  } else if (mode === 'ship') {
    ray.setFromCamera(mouse, camera);
    ship.select(ship.pick(ray));
  }
});
addEventListener('mousemove', (e) => {
  if (locked()) {
    player.yaw -= e.movementX * 0.0021;
    player.pitch = G.clamp(player.pitch - e.movementY * 0.0021, -1.25, 1.25);
    return;
  }
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
  if (!drag.moved) return;
  if (mode === 'room') {
    player.yaw += e.movementX * 0.004;
    player.pitch = G.clamp(player.pitch + e.movementY * 0.004, -1.25, 1.25);
  } else if (mode === 'map' || mode === 'ship') {
    (mode === 'map' ? (region ? null : map.spin) : ship.spin)?.rotateY(e.movementX * 0.006);
    tiltUser = G.clamp(tiltUser + e.movementY * 0.004, -0.25, 0.8);
  } else if (mode === 'flight') {
    tiltUser = G.clamp(tiltUser + e.movementY * 0.004, -0.3, 0.6);
  }
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const k = Math.exp(e.deltaY * 0.0012);
  if (mode === 'flight' || (mode === 'map' && region)) flight.setRange(flight.range * k);
  else if (mode === 'map') map.spin.scale.setScalar(G.clamp(map.spin.scale.x / k, 0.7, 2.4));
  else if (mode === 'ship') ship.group.scale.setScalar(G.clamp(ship.group.scale.x / k, 0.6, 2.6));
}, { passive: false });

document.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
document.querySelectorAll('[data-lat]').forEach((b) => (b.onclick = () => { flight.setLattice(Number(b.dataset.lat)); syncHud(); }));
$('#btn-up').onclick = () => { flight.setHeadingUp(!flight.headingUp); syncHud(); };
$('#btn-die').onclick = () => die();
$('#arc').value = arcDeg;
$('#arc-v').textContent = `${arcDeg}°`;
$('#arc').oninput = (e) => { arcDeg = Number(e.target.value); $('#arc-v').textContent = `${arcDeg}°`; buildFront(); };

// ---- Losing the ship -----------------------------------------------------------------------------
let death = null;
function die() {
  if (death) return;
  death = { t: 0, black: false, reset: false };
  document.body.dataset.dying = '1';
  if (document.pointerLockElement) document.exitPointerLock();
}
function stepDeath(dt) {
  death.t += dt;
  const t = death.t;
  if (t < 1.5) {
    const k = 1 - t / 1.9;
    camera.position.y += Math.sin(t * 41) * 0.075 * k + Math.sin(t * 17) * 0.03;
    camera.rotateZ(Math.sin(t * 29 + 1) * 0.022 * k);
    applyLevel(cur.level * (Math.sin(t * 53) > -0.2 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 23)) : 0.05));
    holoRoot.visible = Math.sin(t * 61) > -0.3 && t < 1.1;
    return;
  }
  if (!death.black) {
    death.black = true;
    $('#black').className = 'on';
    $('#console-screen').classList.remove('on');
  }
  if (t > 2.3) $('#black').classList.add('pip');
  if (t > 3.6 && !death.reset) {
    death.reset = true;
    world.reset();
    flight.reset();
    map.addLoss();
    map.select(null);
    consoleScreen.setAttempt(map.attempt);
    $('#black-n').textContent = `ATTEMPT ${map.attempt}`;
    Object.assign(player, { x: 0, z: 3.75, yaw: 0, pitch: -0.05 });
    setRegion(false);
    mode = 'room';
    trans = null;
    tiltUser = 0;
    flight.setChart(false);
    flight.setRange(130);
    flight.setLattice(0);
    holoRoot.visible = true;
    delete document.body.dataset.dying;
    syncHud();
  }
  if (t > 4.4) $('#black').className = 'fade';
  if (t > 6) { $('#black').className = ''; death = null; }
}

// ---- Frame ---------------------------------------------------------------------------------------
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  labels.setSize(w, h);
  G.setResolution(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const M4 = new THREE.Matrix4();
const QQ = new THREE.Quaternion();
const EE = new THREE.Euler();
const SS = new THREE.Vector3();
const TT = new THREE.Vector3();
function syncOutside() {
  const sh = world.ship;
  outsideRot.rotation.y = -sh.th;
  outside.position.set(-sh.x * SO, 0, -sh.z * SO);
  uL.value.copy(sunDir).applyEuler(outsideRot.rotation);
  world.rocks.forEach((r, i) => {
    EE.set(r.tilt, r.spin, r.tilt * 0.5);
    M4.compose(TT.set(r.x * SO, 0, r.z * SO), QQ.setFromEuler(EE), SS.set(r.r * SO, r.r * SO * 0.8, r.r * SO * 1.1));
    rocksOut.setMatrixAt(i, M4);
  });
  rocksOut.instanceMatrix.needsUpdate = true;
  bigOut.position.set(world.big.x * SO, 0, world.big.z * SO);
  bigOut.scale.setScalar(world.big.r * SO);
  bigOut.rotation.set(world.t * 0.05, world.t * 0.08, 0.4);
}

let acc = 0;
let time = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;

  // Flight: thrust keys drive the toy world; the forecast is re-issued when the hands come off.
  if (mode === 'flight' && !trans && !death) {
    const inp = {
      fwd: (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0),
      lat: (keys.has('a') ? 1 : 0) - (keys.has('d') ? 1 : 0),
      yaw: (keys.has('q') ? 1 : 0) - (keys.has('e') ? 1 : 0),
    };
    const active = inp.fwd || inp.lat || inp.yaw;
    acc += dt;
    while (acc >= 1 / 60) { world.step(1 / 60, inp); acc -= 1 / 60; }
    if (active) lastInput = time;
    else if (lastInput && time - lastInput > 0.35) { flight.issueForecast(); lastInput = 0; }
    document.querySelectorAll('#flight-keys [data-k]').forEach((el) => el.classList.toggle('on', keys.has(el.dataset.k)));
    const sh = world.ship;
    const cpa = world.cpa();
    $('#ro-speed').textContent = Math.hypot(sh.vx, sh.vz).toFixed(1);
    $('#ro-rate').textContent = `${((-sh.om * 180) / PI).toFixed(1)}`;
    $('#ro-head').textContent = String(Math.round((((-sh.th * 180) / PI) % 360 + 360) % 360)).padStart(3, '0');
    $('#ro-prop').textContent = (sh.prop * 100).toFixed(0);
    $('#ro-met').textContent = `T+${world.t.toFixed(0).padStart(3, '0')} s`;
    const danger = world.big.seen && cpa.d < 30 && cpa.t > 0;
    const al = $('#flight-alert');
    al.dataset.alert = danger ? (cpa.d < 14 ? 'warning' : 'caution') : '';
    al.textContent = danger ? `${cpa.d < 14 ? '■' : '▲'} A-17  CPA ${cpa.d.toFixed(0)} km  T−${cpa.t.toFixed(0)} s` : '';
    if (world.lost) die();
  }
  syncOutside();

  // Player.
  if (mode === 'room' && !trans && !death) {
    const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const turn = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
    player.yaw += turn * 1.6 * dt;
    if (f || s) {
      const n = 2.5 / Math.hypot(f, s);
      player.x += (-Math.sin(player.yaw) * f + Math.cos(player.yaw) * s) * n * dt;
      player.z += (-Math.cos(player.yaw) * f - Math.sin(player.yaw) * s) * n * dt;
      constrain(player);
    }
  }

  // Camera.
  if (trans) {
    trans.t = Math.min(1, trans.t + dt / trans.dur);
    const e = G.ease(trans.t);
    camera.position.lerpVectors(trans.from.pos, trans.to.pos, e);
    camera.quaternion.slerpQuaternions(trans.from.quat, trans.to.quat, e);
    if (trans.t >= 1) {
      trans = null;
      if (mode === 'console') $('#console-screen').classList.add('on');
    }
  } else {
    const p = poseOf(mode);
    camera.position.copy(p.pos);
    camera.quaternion.copy(p.quat);
  }

  // Room level, veil, console brightness and hologram tilt ease toward the mode's values.
  const v = VIEW[mode];
  const k = 1 - Math.exp(-dt * 5);
  for (const key of ['level', 'veil', 'screen', 'holo', 'lift', 'fov']) cur[key] += (v[key] - cur[key]) * k;
  tilt += (v.tilt + tiltUser - tilt) * k;
  applyLevel(cur.level);
  veil.material.opacity = cur.veil;
  veil.visible = cur.veil > 0.01;
  screenMat.color.setScalar(cur.screen);
  const trim = G.clamp(cur.screen / 0.75, 0, 1);
  ringMat.color.copy(V3(C.ink)).multiplyScalar(0.9 * trim);
  for (const p of pads) p.mat.color.setScalar((p.id === hot ? 1.5 : 0.72) * trim);
  holoRoot.position.y = HOLO.y + cur.lift;
  cone.scale.y = holoRoot.position.y - cone.position.y;
  cone.visible = cur.veil < 0.5 && cur.holo > 0.4;
  if (Math.abs(camera.fov - cur.fov) > 0.01) { camera.fov = cur.fov; camera.updateProjectionMatrix(); }
  holoTilt.rotation.x = tilt;
  holoRoot.visible = cur.holo > 0.05;
  holoLight.intensity = 2.2 * cur.holo;
  bbxLamp.material.color.copy(V3(C.blackbox)).multiplyScalar(0.55 + 0.45 * Math.sin(time * 2.6) ** 2);
  glimmer.material.color.setScalar(0.25 + 1.6 * Math.max(0, Math.sin(time * 0.9)) ** 12);

  // Pointing at the console.
  let h = null;
  if (mode === 'room' && !trans && !death) {
    ray.setFromCamera(locked() ? new THREE.Vector2(0, 0) : mouse, camera);
    const hits = ray.intersectObjects(hotspots, false);
    if (hits.length && hits[0].distance < 3.8) h = hits[0].object.userData.hot ?? null;
  }
  if (h !== hot) {
    hot = h;
    $('#reticle').classList.toggle('hot', !!hot);
    $('#reticle span').textContent = hot ? HOT_NAME[hot] : '';
    canvas.style.cursor = hot ? 'pointer' : '';
  }
  document.body.dataset.locked = locked() ? '1' : '0';
  if (mode === 'map' && !region && !drag) { ray.setFromCamera(mouse, camera); map.hover(map.pick(ray)); }
  if (mode === 'ship' && !drag) { ray.setFromCamera(mouse, camera); ship.hover(ship.pick(ray)); }

  flight.update(dt, time);
  map.update(dt, time);
  ship.update(dt);
  if (death) stepDeath(dt);

  composer.render();
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---- Start ---------------------------------------------------------------------------------------
{
  const t0 = num('t', 0);
  for (let i = 0; i < t0 * 60; i++) world.step(1 / 60, { fwd: 0, lat: 0, yaw: 0 });
  flight.setLattice(num('lat', 0));
  if (q.get('up') === '0') flight.setHeadingUp(false);
  if (q.has('cfg')) ship.setConfig(q.get('cfg'), true);
  if (q.has('layer')) ship.setLayer(q.get('layer'));
  const p = poseOf('room');
  camera.position.copy(p.pos);
  camera.quaternion.copy(p.quat);
  syncHud();
  const m = q.get('m');
  if (m && VIEW[m] && m !== 'room') {
    $('#console-screen').classList.add('instant');
    go(m, { instant: true, page: q.get('page') ?? undefined });
    Object.assign(cur, VIEW[m]);
    tilt = VIEW[m].tilt;
  }
  if (q.has('spin')) (mode === 'map' ? map.spin : ship.spin).rotation.y = num('spin', 0);
  if (q.get('region') === '1') setRegion(true);
  if (q.has('sel')) (mode === 'map' ? map : ship).select(q.get('sel'));
  if (q.get('fx') === 'die') setTimeout(die, num('at', 1200));
}
window.__room = { world, flight, map, ship, go, die, player, camera, cur };
requestAnimationFrame(frame);
