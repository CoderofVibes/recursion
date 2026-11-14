// Ship hologram: the vehicle from data/ship-baseline.json (1C proposal), drawn as a selectable
// wireframe. Positions in the baseline are planar (x forward, y left); heights here are for display.
import * as THREE from 'three';
import { colour as C, hex } from '../visual/theme.js';
import * as G from './gfx.js';
import { EQUIPMENT, APPENDAGES, FOOTPRINTS, BUSES, SHIP } from './ship-data.js';

/** Body frame (x forward, y left, up) → three (x right, y up, z toward the viewer). Forward is -z. */
export const P = (bx, by, up = 0) => new THREE.Vector3(-by, up, -bx);
const lerp = (a, b, f) => a + (b - a) * f;
const EQ = new Map(EQUIPMENT.map((e) => [e.id, e]));
const APP = new Map(APPENDAGES.map((a) => [a.id, a]));

export const CONFIGS = {
  stowed: { rad: 0, sol: 0, label: 'STOWED' },
  radiators: { rad: 1, sol: 0, label: 'RADIATORS' },
  solar: { rad: 0, sol: 1, label: 'SOLAR' },
  allDeployed: { rad: 1, sol: 1, label: 'ALL OUT' },
};

const LAYERS = {
  all: null,
  power: ['generation', 'storage', 'distribution'],
  thermal: ['thermal'],
  propulsion: ['propulsion', 'tank'],
  sensing: ['sensing', 'avionics', 'processing'],
  data: ['data', 'communications'],
  life: ['crew', 'life-support'],
};

// Display heights for items the planar baseline stacks on one spot.
const UP = {
  'cabin-stores': -1.35, crew: 0.7, 'interface-hx': -1.25, 'ion-drive': -1.35, 'black-box': 0.95,
  'product-water-tank': -1.0, 'reactant-tanks': -1.0, 'rcs-tanks': 1.35, 'xenon-tank': -1.5,
  'science-processor': 0.75, console: 0.05, comms: 1.9, camera: 0, 'star-tracker-a': 1.6, 'star-tracker-b': 1.6,
};

function shapeOf(id) {
  if (id === 'main-tank') return { sph: 1.5 };
  if (id === 'xenon-tank' || id === 'product-water-tank') return { sph: 0.4 };
  if (/tanks?$/.test(id)) return { sph: 0.55 };
  if (id.startsWith('fuel-cell')) return { box: [0.9, 0.7, 0.7] };
  if (id.startsWith('battery')) return { box: [0.9, 0.7, 0.5] };
  if (id.startsWith('pdu')) return { box: [0.6, 0.6, 0.45] };
  if (id.startsWith('eclss')) return { box: [1.1, 0.8, 0.9] };
  if (id.includes('pump')) return { box: [0.4, 0.4, 0.4] };
  if (id.startsWith('flight-cpu')) return { box: [0.5, 0.35, 0.25] };
  if (id.startsWith('imu')) return { box: [0.2, 0.16, 0.2] };
  if (id.startsWith('star-tracker')) return { box: [0.45, 0.4, 0.4] };
  if (id === 'interface-hx') return { box: [0.8, 1.0, 0.4] };
  if (id === 'main-engine') return { bell: true };
  if (id.startsWith('rcs-')) return { box: [0.6, 0.5, 0.5] };
  if (id === 'ion-drive') return { box: [0.8, 0.45, 0.45] };
  if (id === 'camera') return { box: [0.8, 0.7, 0.7] };
  if (id === 'science-processor') return { box: [0.5, 0.35, 0.3] };
  if (id === 'black-box') return { box: [0.6, 0.45, 0.4] };
  if (id === 'comms') return { box: [0.3, 1.1, 1.1] };
  if (id === 'console') return { box: [1.3, 0.9, 0.5] };
  if (id === 'crew') return { box: [0.9, 1.5, 0.5] };
  if (id === 'cabin-stores') return { box: [1.3, 1.7, 0.5] };
  return null;
}

function hullSegs() {
  const st = [[8, 1.1], [7, 2.5], [0.25, 2.5], [0, 2.3], [-6, 2.3], [-6.05, 0.55], [-8, 1.3]];
  const out = [];
  const n = 28;
  for (const [x, r] of st)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = ((i + 1) / n) * Math.PI * 2;
      out.push(r * Math.cos(a), r * Math.sin(a), -x, r * Math.cos(b), r * Math.sin(b), -x);
    }
  for (let s = 0; s + 1 < st.length; s++)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const [x0, r0] = st[s];
      const [x1, r1] = st[s + 1];
      out.push(r0 * Math.cos(a), r0 * Math.sin(a), -x0, r1 * Math.cos(a), r1 * Math.sin(a), -x1);
    }
  return out;
}

/**
 * The ship in body metres. detail=false gives hull, engine and appendages only (the flight hologram).
 */
export function makeShipModel({ detail = true } = {}) {
  const group = new THREE.Group();
  const hull = G.thin(hullSegs(), { colour: C.ink, opacity: detail ? 0.14 : 0.5 });
  group.add(hull);

  // Appendages: flat plates that slide between the stowed and deployed polygons.
  const plates = APPENDAGES.map((a) => {
    const pos = new Float32Array(15);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const line = new THREE.Line(lg, new THREE.LineBasicMaterial({
      color: hex(C.ink), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    line.frustumCulled = false;
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    fg.setIndex([0, 1, 2, 0, 2, 3]);
    const face = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({
      color: hex(C.ink), transparent: true, opacity: a.id.startsWith('solar') ? 0.1 : 0.05, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    face.frustumCulled = false;
    face.userData.id = a.id;
    group.add(line, face);
    return { a, pos, line, face, lg, fg };
  });

  const frac = { rad: 0, sol: 0 };
  const target = { rad: 0, sol: 0 };
  let cfg = 'stowed';

  function layout() {
    for (const p of plates) {
      const f = p.a.id.startsWith('radiator') ? frac.rad : frac.sol;
      for (let i = 0; i < 5; i++) {
        const k = i % 4;
        const v = P(
          lerp(p.a.stowedPolygon[k][0], p.a.deployedPolygon[k][0], f),
          lerp(p.a.stowedPolygon[k][1], p.a.deployedPolygon[k][1], f),
          0,
        );
        p.pos.set([v.x, v.y, v.z], i * 3);
      }
      p.lg.attributes.position.needsUpdate = true;
      p.fg.attributes.position.needsUpdate = true;
      p.fg.computeBoundingSphere();
    }
  }

  function centreOfMass() {
    let m = 0;
    let x = 0;
    let y = 0;
    for (const e of EQUIPMENT) {
      let p = e.position;
      const a = APP.get(e.id);
      if (a) {
        const f = a.id.startsWith('radiator') ? frac.rad : frac.sol;
        p = [lerp(a.stowedPosition[0], a.deployedPosition[0], f), lerp(a.stowedPosition[1], a.deployedPosition[1], f)];
      }
      m += e.mass;
      x += e.mass * p[0];
      y += e.mass * p[1];
    }
    return [x / m, y / m];
  }

  // Equipment.
  const parts = new Map();
  if (detail) {
    for (const e of EQUIPMENT) {
      const sh = shapeOf(e.id);
      if (!sh) continue;
      let geo;
      if (sh.sph) geo = new THREE.IcosahedronGeometry(sh.sph, 0);
      else if (sh.bell) geo = new THREE.CylinderGeometry(0.55, 1.3, 2, 14, 1, true).rotateX(-Math.PI / 2);
      else geo = new THREE.BoxGeometry(sh.box[1], sh.box[2], sh.box[0]);
      const col = e.id === 'black-box' ? C.blackbox : C.ink;
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: hex(col), transparent: true, opacity: 0.03, depthWrite: false, blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }));
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, sh.sph ? 1 : 20), new THREE.LineBasicMaterial({
        color: hex(col), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const at = sh.bell ? P(-7, e.position[1], 0) : P(e.position[0], e.position[1], UP[e.id] ?? 0);
      mesh.position.copy(at);
      edges.position.copy(at);
      mesh.userData.id = e.id;
      group.add(mesh, edges);
      parts.set(e.id, { e, mesh, edges, at });
    }
    for (const p of plates) parts.set(p.a.id, { e: EQ.get(p.a.id), mesh: p.face, edges: p.line, plate: p });
  } else {
    const bell = new THREE.CylinderGeometry(0.55, 1.3, 2, 14, 1, true).rotateX(-Math.PI / 2);
    const b = new THREE.LineSegments(new THREE.EdgesGeometry(bell, 1), new THREE.LineBasicMaterial({
      color: hex(C.ink), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    b.position.copy(P(-7, 0, 0));
    group.add(b);
  }

  const api = {
    group, parts, plates, frac,
    get config() { return cfg; },
    com: centreOfMass,
    setConfig(name, instant = false) {
      cfg = name;
      target.rad = CONFIGS[name].rad;
      target.sol = CONFIGS[name].sol;
      if (instant) { frac.rad = target.rad; frac.sol = target.sol; layout(); }
    },
    /** Returns true while appendages are still moving. */
    update(dt) {
      let moving = false;
      for (const k of ['rad', 'sol']) {
        const d = target[k] - frac[k];
        if (Math.abs(d) > 1e-4) {
          frac[k] += Math.sign(d) * Math.min(Math.abs(d), dt / 1.6);
          moving = true;
        }
      }
      if (moving) layout();
      return moving;
    },
  };
  api.setConfig(SHIP.initialConfiguration, true);
  return api;
}

const NAME = (id) => id.replace(/-/g, ' ').toUpperCase();

/** The ship inspection hologram with its plate and chips. ui: { plate, layers, configs }. */
export function makeShipHolo(ui) {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const SCALE = 0.085;
  spin.scale.setScalar(SCALE);
  spin.rotation.y = 0.85;
  const model = makeShipModel({ detail: true });
  spin.add(model.group);

  // Centre of mass: mark, yaw axis (dotted) and the main engine's line of action.
  const comMark = new THREE.Group();
  comMark.add(G.fat(G.arcXZ(0.42, 0, Math.PI * 2, 32), { colour: C.ink, width: 1.6 }));
  comMark.add(G.fatSegs([-0.42, 0, 0, 0.42, 0, 0, 0, 0, -0.42, 0, 0, 0.42], { colour: C.ink, width: 1.2 }));
  const axis = G.fat([0, -4.2, 0, 0, 4.6, 0], { colour: C.ink, width: 1.3, dash: [0.22, 0.3], opacity: 0.8 });
  comMark.add(axis);
  const comTag = G.label('CoM', 'holo');
  comTag.position.set(0, 4.9, 0);
  comMark.add(comTag);
  spin.add(comMark);
  const thrustLine = G.fat([0, 0, 0, 0, 0, 1], { colour: C.thrust, width: 1.3, dash: [0.4, 0.3], opacity: 0.9 });
  spin.add(thrustLine);
  const armTag = G.label('', 'holo thr');
  spin.add(armTag);

  // Footprint on a base plane under the ship.
  const BASE = -3.6;
  const foot = G.fat([0, 0, 0, 0, 0, 1], { colour: C.ink, width: 1.4, opacity: 0.7 });
  spin.add(foot);
  const footTag = G.label('', 'holo dim');
  spin.add(footTag);
  const drop = G.thin([0, 0, 0, 0, 0, 0], { colour: C.inkDim, opacity: 0.5 });
  spin.add(drop);

  const links = new THREE.Group();
  spin.add(links);
  const selTag = G.label('', 'holo sel');
  selTag.visible = false;
  spin.add(selTag);
  const hovTag = G.label('', 'holo');
  hovTag.visible = false;
  spin.add(hovTag);

  let layer = 'all';
  let selected = null;
  let hovered = null;
  const modeOf = new Map(EQUIPMENT.map((e) => [e.id, e.initialMode]));

  function refreshMarks() {
    const [cx, cy] = model.com();
    comMark.position.copy(P(cx, cy, 0));
    const mount = P(-7, 0.08, 0);
    G.setFat(thrustLine, [mount.x, 0, mount.z, mount.x, 0, mount.z - 16.5]);
    armTag.userData.el.textContent = `THRUST ARM ${Math.round(Math.abs(0.08 - cy) * 100)} cm`;
    armTag.position.set(mount.x, 0.5, mount.z - 17.2);
    comTag.userData.el.textContent = `CoM  ${cx >= 0 ? '+' : '−'}${Math.abs(cx).toFixed(2)} m  DRY`;
    drop.geometry.setAttribute('position', new THREE.Float32BufferAttribute([comMark.position.x, 0, comMark.position.z, comMark.position.x, BASE, comMark.position.z], 3));
  }

  function refreshFootprint() {
    const poly = FOOTPRINTS[model.config];
    const flat = [];
    for (let i = 0; i <= poly.length; i++) {
      const v = P(poly[i % poly.length][0], poly[i % poly.length][1], BASE);
      flat.push(v.x, v.y, v.z);
    }
    G.setFat(foot, flat);
    const ys = poly.map((p) => p[1]);
    const xs = poly.map((p) => p[0]);
    const span = Math.max(...ys) - Math.min(...ys);
    const len = Math.max(...xs) - Math.min(...xs);
    footTag.userData.el.textContent = `FOOTPRINT ${len} × ${span} m`;
    footTag.position.copy(P(-9.5, 0, BASE));
  }

  const inLayer = (e) => layer === 'all' || LAYERS[layer].includes(e.subsystem);

  function layerLinks() {
    const L = [];
    const add = (a, b) => L.push([a, b]);
    if (layer === 'power')
      for (const e of EQUIPMENT) {
        if (e.bus === 'main-a' && e.id !== 'pdu-a') add('pdu-a', e.id);
        if (e.bus === 'main-b' && e.id !== 'pdu-b') add('pdu-b', e.id);
      }
    if (layer === 'thermal')
      [['internal-pump-a', 'interface-hx'], ['internal-pump-b', 'interface-hx'], ['interface-hx', 'external-pump-a'],
        ['interface-hx', 'external-pump-b'], ['external-pump-a', 'radiator-left'], ['external-pump-b', 'radiator-right']].forEach((p) => add(...p));
    if (layer === 'propulsion')
      [['main-tank', 'main-engine'], ['xenon-tank', 'ion-drive'], ['rcs-tanks', 'rcs-forward-left'], ['rcs-tanks', 'rcs-forward-right'],
        ['rcs-tanks', 'rcs-aft-left'], ['rcs-tanks', 'rcs-aft-right']].forEach((p) => add(...p));
    if (layer === 'sensing')
      [['flight-cpu-a', 'imu-a'], ['flight-cpu-a', 'star-tracker-a'], ['flight-cpu-a', 'camera'], ['flight-cpu-b', 'imu-b'],
        ['flight-cpu-b', 'star-tracker-b'], ['science-processor', 'camera'], ['flight-cpu-a', 'console']].forEach((p) => add(...p));
    if (layer === 'data')
      [['black-box', 'flight-cpu-a'], ['black-box', 'flight-cpu-b'], ['black-box', 'science-processor'], ['comms', 'flight-cpu-a'],
        ['black-box', 'console']].forEach((p) => add(...p));
    if (layer === 'life') [['eclss-a', 'cabin-stores'], ['eclss-b', 'cabin-stores'], ['crew', 'cabin-stores']].forEach((p) => add(...p));
    return L;
  }

  function related(id) {
    const e = EQ.get(id);
    const L = [];
    if (!e) return L;
    if (e.bus === 'main-a' && id !== 'pdu-a') L.push(['pdu-a', id]);
    if (e.bus === 'main-b' && id !== 'pdu-b') L.push(['pdu-b', id]);
    if (e.bus === 'essential') { L.push(['pdu-a', id]); L.push(['pdu-b', id]); }
    if (e.thermalNode === 'external-loop') L.push([e.position[1] >= 0 ? 'external-pump-a' : 'external-pump-b', id]);
    if (e.thermalNode === 'cabin' && !id.includes('pump')) L.push(['internal-pump-a', id]);
    if (e.thermalNode === 'service' && !id.includes('pump')) L.push(['external-pump-a', id]);
    return L;
  }

  const posOf = (id) => {
    const p = model.parts.get(id);
    if (!p) return null;
    if (p.plate) {
      const a = p.plate.pos;
      return new THREE.Vector3((a[0] + a[6]) / 2, 0, (a[2] + a[8]) / 2);
    }
    return p.at;
  };

  function restyle() {
    const rel = selected ? new Set(related(selected).flat()) : null;
    for (const [id, p] of model.parts) {
      const on = inLayer(p.e);
      const hot = id === selected || id === hovered;
      const near = rel?.has(id);
      p.edges.material.opacity = hot ? 1 : near ? 0.75 : on ? (layer === 'all' ? 0.3 : 0.8) : 0.06;
      p.mesh.material.opacity = hot ? (p.e.id === 'main-tank' ? 0.07 : 0.2) : near ? 0.1 : on ? (p.plate ? 0.07 : layer === 'all' ? 0.02 : 0.05) : 0.008;
    }
    links.clear();
    const segs = [];
    for (const [a, b] of selected ? related(selected) : layerLinks()) {
      const pa = posOf(a);
      const pb = posOf(b);
      if (pa && pb) segs.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
    }
    if (segs.length) links.add(G.fatSegs(segs, { colour: C.inkDim, width: 1.1, dash: [0.18, 0.14], opacity: 0.9 }));
    for (const [tag, id] of [[selTag, selected], [hovTag, hovered === selected ? null : hovered]]) {
      tag.visible = !!id;
      if (id) {
        tag.userData.el.textContent = NAME(id);
        const p = posOf(id);
        tag.position.set(p.x, p.y + 0.9, p.z);
      }
    }
  }

  function drawSpark(c, seed, mode) {
    const x = c.getContext('2d');
    const w = (c.width = c.clientWidth * 2 || 400);
    const h = (c.height = 72);
    x.clearRect(0, 0, w, h);
    x.strokeStyle = C.grid;
    x.lineWidth = 1;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, (h * i) / 4); x.lineTo(w, (h * i) / 4); x.stroke(); }
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    x.strokeStyle = C.ink;
    x.lineWidth = 2.4;
    x.beginPath();
    let v = 0.5;
    for (let i = 0; i <= 80; i++) {
      v = G.clamp(v + (rnd() - 0.5) * 0.12 + (mode === 'off' ? -0.01 : 0.004), 0.12, 0.88);
      const px = (i / 80) * w;
      const py = h - v * h;
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    x.stroke();
  }

  function fillPlate() {
    const el = ui.plate;
    if (!selected) { el.hidden = true; return; }
    const e = EQ.get(selected);
    const mode = modeOf.get(selected);
    const m = e.modes[mode] ?? { power: 0, heat: 0, gen: 0 };
    const bus = BUSES.find((b) => b.id === e.bus);
    el.hidden = false;
    el.innerHTML = `
      <header><span class="pl-id${selected === 'black-box' ? ' bbx' : ''}">${NAME(selected)}</span><span class="pl-sub">${e.subsystem.toUpperCase()}</span></header>
      <div class="pl-modes">${Object.keys(e.modes).map((k) => `<button data-mode="${k}" class="${k === mode ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</div>
      <dl>
        <dt>BUS</dt><dd>${bus ? `${bus.id.toUpperCase()} · ${bus.voltage} V` : '—'}</dd>
        <dt>LOOP</dt><dd>${(e.thermalNode ?? '—').toUpperCase()}</dd>
        <dt>${m.gen ? 'SUPPLY' : 'DRAW'}</dt><dd class="num">${m.gen || m.power} W</dd>
        <dt>HEAT</dt><dd class="num">${m.heat} W</dd>
        <dt>MASS</dt><dd class="num">${e.mass} kg</dd>
        <dt>SPARE</dt><dd>${(e.redundancy || '—').toUpperCase()}</dd>
      </dl>
      <div class="pl-cap">LAST 10 MIN</div><canvas class="spark"></canvas>
      <div class="pl-cap">CONDITION</div><div class="cond"><i style="width:${selected.endsWith('-b') ? 100 : 94}%"></i></div>`;
    drawSpark(el.querySelector('canvas'), selected.length * 977 + mode.length * 31, mode);
    el.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { modeOf.set(selected, b.dataset.mode); fillPlate(); }));
  }

  function chips() {
    ui.layers.innerHTML = Object.keys(LAYERS).map((k) => `<button data-layer="${k}" class="${k === layer ? 'on' : ''}">${k.toUpperCase()}</button>`).join('');
    ui.layers.querySelectorAll('button').forEach((b) => (b.onclick = () => api.setLayer(b.dataset.layer)));
    ui.configs.innerHTML = Object.entries(CONFIGS).map(([k, v]) => `<button data-cfg="${k}" class="${k === model.config ? 'on' : ''}">${v.label}</button>`).join('');
    ui.configs.querySelectorAll('button').forEach((b) => (b.onclick = () => api.setConfig(b.dataset.cfg)));
  }

  const api = {
    group, spin, model,
    pick(raycaster) {
      const hits = raycaster.intersectObjects([...model.parts.values()].filter((p) => inLayer(p.e)).map((p) => p.mesh), false);
      return hits.length ? hits[0].object.userData.id : null;
    },
    hover(id) { if (id !== hovered) { hovered = id; restyle(); } },
    select(id) { selected = id; restyle(); fillPlate(); },
    setLayer(k) { layer = k; if (selected && !inLayer(EQ.get(selected))) selected = null; chips(); restyle(); fillPlate(); },
    setConfig(k, instant) { model.setConfig(k, instant); chips(); refreshFootprint(); if (instant) { refreshMarks(); restyle(); } },
    update(dt) { if (model.update(dt)) { refreshMarks(); restyle(); } },
  };
  chips();
  refreshMarks();
  refreshFootprint();
  restyle();
  fillPlate();
  return api;
}
