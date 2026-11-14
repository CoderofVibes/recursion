// Chart hologram: the expanse as the ship knows it. Charted regions, bearings to leads, earlier
// attempts from Black Box, and unsurveyed space left honestly blank. Mock data, loosely after
// docs/design/expedition.md (1F); region names are the ship's designations, not the author's.
import * as THREE from 'three';
import { colour as C, hex } from '../visual/theme.js';
import * as G from './gfx.js';

const V3 = (c) => new THREE.Color(hex(c));

const REGIONS = [
  { id: 'R-01', name: 'ARRIVAL · TWO-MASS FIELD', short: 'ARRIVAL', x: -0.52, z: 0.2, kind: 'field', cov: 0.62, local: true,
    rows: [['QUESTION', 'MASS, DISTANCE LAW OR SECOND BODY?', 'open'], ['EVIDENCE', '3 ATTEMPTS · 164 FIXES · 5 BURNS'],
      ['MODEL', '▲ RESIDUAL 2.3σ BEYOND 1,400 km', 'caution'], ['HAZARDS', '37 ROCKS TRACKED · REST UNSURVEYED'],
      ['PROCEDURE', 'BROAD PASS · CONDITIONS DIFFER']] },
  { id: 'R-02', name: 'JUNCTION', x: 0.0, z: 0.04, kind: 'junction', cov: 0.44,
    rows: [['QUESTION', 'WHICH LEAD EARNS THE POINTING TIME?', 'open'], ['EVIDENCE', '2 ATTEMPTS · 58 FIXES · 3 BEARINGS'],
      ['MODEL', 'RESIDUAL 0.8σ'], ['HAZARDS', 'NONE CHARTED'], ['PROCEDURE', '—']] },
  { id: 'R-03', name: 'DIM POCKET', x: 0.34, z: -0.34, kind: 'pocket', cov: 0.83,
    rows: [['QUESTION', 'WHICH LOADS FIGHT FOR THE BUS?', 'answered'], ['EVIDENCE', '2 ATTEMPTS · 31 FIXES · 6 LOAD STEPS'],
      ['MODEL', 'RESIDUAL 0.5σ'], ['HAZARDS', 'NONE CHARTED'], ['PROCEDURE', 'STAGGERED LOADS · MATCHES']] },
  { id: 'R-04', name: 'BRIGHT RIM', x: 0.7, z: -0.5, kind: 'rim', cov: 0.27,
    rows: [['QUESTION', 'CAN COOLING AND POINTING COEXIST?', 'open'], ['EVIDENCE', '1 ATTEMPT · 12 FIXES'],
      ['MODEL', '▲ HEAT TREND UNSAMPLED PAST 9 MIN', 'caution'], ['HAZARDS', 'SHIP LOST HERE · ATTEMPT 3'], ['PROCEDURE', '—']] },
];
const LINKS = [['R-01', 'R-02'], ['R-02', 'R-03'], ['R-03', 'R-04']];
const TRANSFER = { 'R-02': 'Δv 84 ± 12 m/s · 3 h 10 m', 'R-03': 'Δv 151 ± 30 m/s · 7 h 40 m', 'R-04': 'Δv 236 ± 64 m/s · 13 h 05 m' };
const LEADS = [
  { id: 'L-A', name: 'PERIODIC BRIGHT RIM', from: 'R-02', to: 'R-04', rows: [['STATUS', 'RESOLVED · 2 BEARINGS CROSS', 'answered'], ['FIRST SEEN', 'ATTEMPT 2 · T+00:52'], ['LEADS TO', 'R-04']] },
  { id: 'L-B', name: 'CORRELATED TRACES', from: 'R-02', bearing: 2.0, fan: 0.14, len: 0.62,
    rows: [['STATUS', 'NOTICED', 'open'], ['BEARING', '115° ± 8°'], ['RANGE', 'UNRESOLVED · 1 BEARING'], ['FIRST SEEN', 'ATTEMPT 3 · T+01:17']] },
  { id: 'L-C', name: 'REPEATED SILHOUETTE', from: 'R-01', bearing: 0.42, fan: 0.23, len: 0.7, stale: true,
    rows: [['STATUS', 'NOTICED · STALE', 'open'], ['BEARING', '024° ± 13°'], ['RANGE', 'UNRESOLVED · 1 BEARING'], ['FIRST SEEN', 'ATTEMPT 1 · T+00:09']] },
];
const START = [-0.6, 0.27];
const ATTEMPTS = [
  { n: 1, end: 'lost', pts: [START, [-0.56, 0.21], [-0.48, 0.13]] },
  { n: 2, end: 'recall', pts: [START, [-0.5, 0.21], [0.0, 0.04], [0.34, -0.34]] },
  { n: 3, end: 'lost', pts: [START, [-0.5, 0.21], [0.0, 0.04], [0.34, -0.34], [0.61, -0.46]] },
];

export function makeMapHolo(ui, hooks) {
  const Rh = 1.1;
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const byId = new Map(REGIONS.map((r) => [r.id, r]));
  let attempt = 4;
  let selected = null;
  let hovered = null;
  const layers = { leads: true, attempts: true, coverage: true, reach: true };

  // ---- Plane: charted pockets and corridors get a grid; everything else is hatched unknown ----
  const planeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      uRh: { value: Rh }, uCov: { value: 1 },
      uNodes: { value: REGIONS.map((r) => new THREE.Vector3(r.x, r.z, 0.1 + r.cov * 0.08)) },
      uSegs: { value: LINKS.map(([a, b]) => new THREE.Vector4(byId.get(a).x, byId.get(a).z, byId.get(b).x, byId.get(b).z)) },
      cGrid: { value: V3(C.gridMajor) }, cUnk: { value: V3(C.inkFaint) }, cCov: { value: V3(C.coverage) },
    },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uRh, uCov; uniform vec3 uNodes[${REGIONS.length}]; uniform vec4 uSegs[${LINKS.length}];
      uniform vec3 cGrid, cUnk, cCov; varying vec2 vP;
      float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      float gl(vec2 p, float sp){ vec2 q = p / sp; vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q); return 1.0 - min(min(g.x, g.y), 1.0); }
      void main(){
        vec2 h = vec2(vP.x, -vP.y);
        float rr = length(h) / uRh; if (rr > 1.0) discard;
        float d = 1e3;
        for (int i = 0; i < ${REGIONS.length}; i++) d = min(d, length(h - uNodes[i].xy) - uNodes[i].z);
        for (int i = 0; i < ${LINKS.length}; i++) d = min(d, sdSeg(h, uSegs[i].xy, uSegs[i].zw) - 0.035);
        float w = fwidth(d) + 1e-4;
        float known = 1.0 - smoothstep(-w, w, d);
        float edge = 1.0 - smoothstep(0.0, w * 2.0, abs(d));
        float hw = fwidth((h.x + h.y) / 0.05);
        float hatch = 1.0 - smoothstep(0.04, 0.04 + hw * 1.5, abs(fract((h.x + h.y) / 0.05) - 0.5));
        vec3 unk = cUnk * hatch * 0.17;
        vec3 kn = cGrid * gl(h, 0.05) * 0.55 + cCov * 0.035;
        vec3 col = mix(unk, kn, known * uCov) + cCov * edge * 0.2 * uCov;
        col *= smoothstep(1.0, 0.9, rr);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const plane = new THREE.Mesh(new THREE.CircleGeometry(Rh, 96), planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.renderOrder = 1;
  spin.add(plane);
  spin.add(G.fat(G.arcXZ(Rh, 0, Math.PI * 2, 128), { colour: C.inkDim, width: 1.2, opacity: 0.8 }));

  // ---- Regions ---------------------------------------------------------------------------------
  const pickables = [];
  const pickGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const pickMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const covGroup = new THREE.Group();
  spin.add(covGroup);
  const nodes = new Map();
  let s = 5;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (const r of REGIONS) {
    const g = new THREE.Group();
    g.position.set(r.x, 0, r.z);
    const rp = 0.13;
    g.add(G.fat(G.arcXZ(rp, 0, Math.PI * 2, 64), { colour: C.inkFaint, width: 1, opacity: 0.9 }));
    const arc = G.fat(G.arcXZ(rp, 0, Math.PI * 2 * r.cov, 64), { colour: C.ink, width: 1.6, opacity: 0.8 });
    arc.position.set(r.x, 0, r.z);
    covGroup.add(arc);
    if (r.kind === 'field') {
      for (const [x, z, rad] of [[-0.025, -0.04, 0.03], [0.055, -0.085, 0.014]]) {
        const sp = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(rad, 10, 6)), new THREE.LineBasicMaterial({
          color: hex(C.bodyRim), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
        sp.position.set(x, 0, z);
        g.add(sp);
      }
      const pts = [];
      for (let i = 0; i < 46; i++) {
        const a = rnd() * 6.283;
        const d = 0.02 + rnd() * 0.095;
        pts.push(Math.sin(a) * d, 0, Math.cos(a) * d);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: hex(C.asteroid), size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    } else if (r.kind === 'junction') {
      g.add(G.fat([0, 0, -0.028, 0.028, 0, 0, 0, 0, 0.028, -0.028, 0, 0, 0, 0, -0.028], { colour: C.ink, width: 1.6 }));
    } else if (r.kind === 'pocket') {
      const rock = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.OctahedronGeometry(0.022, 0)), new THREE.LineBasicMaterial({
        color: hex(C.asteroid), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      g.add(rock);
    } else if (r.kind === 'rim') {
      g.add(G.fat(G.arcXZ(0.055, -0.4, 2.6, 40), { colour: C.bodyRim, width: 2.6 }));
      g.add(G.fat(G.arcXZ(0.055, 2.6, Math.PI * 2 - 0.4, 40), { colour: C.bodyRim, width: 1, opacity: 0.3 }));
    }
    const tag = G.label(`${r.id}  ${r.short ?? r.name}`, 'holo');
    tag.position.set(0, 0.075, 0);
    g.add(tag);
    const pk = new THREE.Mesh(pickGeo, pickMat);
    pk.userData.id = r.id;
    g.add(pk);
    pickables.push(pk);
    spin.add(g);
    nodes.set(r.id, { r, g, tag });
  }
  // Corridors actually flown.
  const corr = [];
  for (const [a, b] of LINKS) corr.push(byId.get(a).x, 0, byId.get(a).z, byId.get(b).x, 0, byId.get(b).z);
  spin.add(G.fatSegs(corr, { colour: C.inkDim, width: 1.3, opacity: 0.7 }));

  // ---- Leads: bearings, not places, until a second bearing crosses them ------------------------
  const leadGroup = new THREE.Group();
  spin.add(leadGroup);
  for (const l of LEADS) {
    const o = byId.get(l.from);
    const g = new THREE.Group();
    let ex;
    let ez;
    if (l.to) {
      const t = byId.get(l.to);
      ex = (o.x + t.x) / 2 + 0.1;
      ez = (o.z + t.z) / 2 + 0.02;
      g.add(G.fat([o.x, 0.002, o.z, ex, 0.002, ez, t.x, 0.002, t.z], { colour: C.ink, width: 1, opacity: 0.35, dash: [0.02, 0.014] }));
    } else {
      const dir = (a, len) => [o.x + Math.sin(a) * len, 0.002, o.z - Math.cos(a) * len];
      const k = l.stale ? 0.4 : 1;
      g.add(G.fat([o.x, 0.002, o.z, ...dir(l.bearing, l.len)], { colour: C.ink, width: 1.5, opacity: 0.9 * k }));
      g.add(G.fatSegs([o.x, 0.002, o.z, ...dir(l.bearing - l.fan, l.len), o.x, 0.002, o.z, ...dir(l.bearing + l.fan, l.len)], { colour: C.ink, width: 1, opacity: 0.45 * k }));
      const hatch = [];
      for (let i = 2; i <= 9; i++) {
        const len = (l.len * i) / 9;
        hatch.push(...dir(l.bearing - l.fan, len), ...dir(l.bearing + l.fan, len));
      }
      g.add(G.thin(hatch, { colour: C.ink, opacity: 0.22 * k }));
      [ex, , ez] = dir(l.bearing, l.len);
    }
    const tag = G.label(l.to ? l.id : `${l.id}  ${l.name}`, `holo ${l.stale || l.to ? 'dim' : ''}`);
    tag.position.set(ex, 0.05, ez);
    g.add(tag);
    const pk = new THREE.Mesh(pickGeo, pickMat);
    pk.position.set(ex, 0, ez);
    pk.scale.setScalar(0.7);
    pk.userData.id = l.id;
    g.add(pk);
    pickables.push(pk);
    leadGroup.add(g);
  }

  // ---- Earlier attempts, from Black Box --------------------------------------------------------
  const attGroup = new THREE.Group();
  spin.add(attGroup);
  function addAttempt(a) {
    const flat = [];
    const off = 0.012 * (((a.n - 1) % 3) - 1);
    for (const [x, z] of a.pts) flat.push(x + off, 0.004, z + off);
    attGroup.add(G.fat(flat, { colour: C.blackbox, width: 1.1, opacity: 0.45 }));
    const end = a.pts[a.pts.length - 1];
    const tag = G.label(`${a.end === 'lost' ? '✕' : '↺'} ${a.n}`, 'holo bbx');
    tag.position.set(end[0] + off, 0.03, end[1] + off);
    attGroup.add(tag);
  }
  ATTEMPTS.forEach(addAttempt);

  // ---- You are here, and what the propellant on board can still reach --------------------------
  const here = new THREE.Group();
  here.position.set(START[0], 0.006, START[1]);
  here.add(G.fat([0, 0, -0.03, 0.015, 0, 0.02, -0.015, 0, 0.02, 0, 0, -0.03], { colour: C.ink, width: 2 }));
  const pulse = G.fat(G.arcXZ(0.045, 0, Math.PI * 2, 40), { colour: C.ink, width: 1.4 });
  here.add(pulse);
  const hereTag = G.label('', 'holo sel');
  hereTag.position.set(0, 0.05, 0.06);
  here.add(hereTag);
  here.rotation.y = -0.9;
  spin.add(here);
  const reach = new THREE.Group();
  reach.position.copy(here.position);
  reach.add(G.fat(G.arcXZ(0.42, 0, Math.PI * 2, 120), { colour: C.velocity, width: 1.1, opacity: 0.7, dash: [0.02, 0.02] }));
  const reachTag = G.label('REACH 690 m/s', 'holo vel');
  reachTag.position.set(0.1, 0.02, 0.46);
  reach.add(reachTag);
  spin.add(reach);

  // ---- Selection -------------------------------------------------------------------------------
  const selRing = G.fat(G.arcXZ(0.16, 0, Math.PI * 2, 64), { colour: C.ink, width: 2.2 });
  selRing.visible = false;
  spin.add(selRing);
  const hovRing = G.fat(G.arcXZ(0.16, 0, Math.PI * 2, 64), { colour: C.ink, width: 1, opacity: 0.6 });
  hovRing.visible = false;
  spin.add(hovRing);
  const route = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.forecast, width: 2, dash: [0.016, 0.02] });
  route.visible = false;
  spin.add(route);

  const posOf = (id) => {
    const r = byId.get(id);
    if (r) return [r.x, r.z, 0.16];
    const pk = pickables.find((p) => p.userData.id === id);
    return [pk.position.x, pk.position.z, 0.07];
  };

  function fillPlate() {
    const el = ui.plate;
    if (!selected) { el.hidden = true; return; }
    const r = byId.get(selected);
    const l = LEADS.find((x) => x.id === selected);
    const o = r ?? l;
    const rows = [...o.rows];
    if (r && r.id !== 'R-01') rows.push(['TRANSFER', TRANSFER[r.id], 'fc']);
    el.hidden = false;
    el.innerHTML = `
      <header><span class="pl-id">${o.id}</span><span class="pl-sub">${o.name}</span></header>
      ${r ? `<div class="pl-cap">SURVEYED</div><div class="cond"><i style="width:${Math.round(r.cov * 100)}%"></i></div>` : ''}
      <dl>${rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c ?? ''}">${v}</dd>`).join('')}</dl>
      ${r ? `<div class="pl-actions"><button data-act="region"${r.local ? '' : ' disabled'}>${r.local ? 'REGION VIEW' : 'NO LOCAL SURVEY'}</button>${r.id !== 'R-01' ? '<button data-act="course">SET COURSE</button>' : ''}</div>` : ''}`;
    el.querySelector('[data-act="region"]')?.addEventListener('click', () => hooks.enterRegion(r.id));
    el.querySelector('[data-act="course"]')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
  }

  function restyle() {
    for (const [ring, id] of [[selRing, selected], [hovRing, hovered === selected ? null : hovered]]) {
      ring.visible = !!id;
      if (id) {
        const [x, z, rad] = posOf(id);
        ring.position.set(x, 0.003, z);
        ring.scale.setScalar(rad / 0.16);
      }
    }
    route.visible = false;
    const r = byId.get(selected);
    if (r && r.id !== 'R-01') {
      const flat = [START[0], 0.008, START[1]];
      for (const q of REGIONS) {
        flat.push(q.x, 0.008, q.z);
        if (q.id === r.id) break;
      }
      G.setFat(route, flat);
      route.visible = true;
    }
  }

  function chips() {
    ui.layers.innerHTML = Object.keys(layers).map((k) => `<button data-layer="${k}" class="${layers[k] ? 'on' : ''}">${k.toUpperCase()}</button>`).join('');
    ui.layers.querySelectorAll('button').forEach((b) => (b.onclick = () => {
      layers[b.dataset.layer] = !layers[b.dataset.layer];
      chips();
    }));
    leadGroup.visible = layers.leads;
    attGroup.visible = layers.attempts;
    covGroup.visible = layers.coverage;
    planeMat.uniforms.uCov.value = layers.coverage ? 1 : 0;
    reach.visible = layers.reach;
  }

  const api = {
    group, spin,
    get attempt() { return attempt; },
    pick(raycaster) {
      const hits = raycaster.intersectObjects(pickables.filter((p) => p.parent.parent.visible), false);
      return hits.length ? hits[0].object.userData.id : null;
    },
    hover(id) { if (id !== hovered) { hovered = id; restyle(); } },
    select(id) { selected = id; restyle(); fillPlate(); },
    /** The ship was lost: Black Box keeps the track, the attempt counter moves on. */
    addLoss() {
      addAttempt({ n: attempt, end: 'lost', pts: [START, [-0.57 + rnd() * 0.05, 0.2 - rnd() * 0.05], [-0.52 + rnd() * 0.08, 0.12 + rnd() * 0.05]] });
      attempt += 1;
      hereTag.userData.el.textContent = `ATTEMPT ${attempt}`;
    },
    update(dt, time) {
      const k = (time % 2.4) / 2.4;
      pulse.scale.setScalar(1 + k * 1.2);
      pulse.material.opacity = 1 - k;
    },
  };
  hereTag.userData.el.textContent = `ATTEMPT ${attempt}`;
  chips();
  restyle();
  fillPlate();
  return api;
}
