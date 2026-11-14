// Map hologram: the expanse as the ship knows it, as a three-dimensional volume. Charted regions,
// bearings to leads, earlier attempts from Black Box, and unsurveyed space left honestly empty.
// Mock data, loosely after docs/design/expedition.md (1F); region names are the ship's designations.
import * as THREE from 'three';
import { colour as C, hex } from '../visual/theme.js';
import * as G from './gfx.js';

const TAU = Math.PI * 2;
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Positions are [x, height, z] inside a volume of radius 1.1.
const REGIONS = [
  { id: 'R-01', name: 'ARRIVAL · TWO-MASS FIELD', short: 'ARRIVAL', p: [-0.52, -0.1, 0.2], kind: 'field', cov: 0.62, local: true,
    rows: [['QUESTION', 'MASS, DISTANCE LAW OR SECOND BODY?', 'open'], ['EVIDENCE', '3 ATTEMPTS · 164 FIXES · 5 BURNS'],
      ['MODEL', '▲ RESIDUAL 2.3σ BEYOND 1,400 km', 'caution'], ['HAZARDS', '37 ROCKS TRACKED · REST UNSURVEYED'],
      ['PROCEDURE', 'BROAD PASS · CONDITIONS DIFFER']] },
  { id: 'R-02', name: 'JUNCTION', p: [0.0, 0.18, 0.04], kind: 'junction', cov: 0.44,
    rows: [['QUESTION', 'WHICH LEAD EARNS THE POINTING TIME?', 'open'], ['EVIDENCE', '2 ATTEMPTS · 58 FIXES · 3 BEARINGS'],
      ['MODEL', 'RESIDUAL 0.8σ'], ['HAZARDS', 'NONE CHARTED'], ['PROCEDURE', '—']] },
  { id: 'R-03', name: 'DIM POCKET', p: [0.34, -0.22, -0.34], kind: 'pocket', cov: 0.83,
    rows: [['QUESTION', 'WHICH LOADS FIGHT FOR THE BUS?', 'answered'], ['EVIDENCE', '2 ATTEMPTS · 31 FIXES · 6 LOAD STEPS'],
      ['MODEL', 'RESIDUAL 0.5σ'], ['HAZARDS', 'NONE CHARTED'], ['PROCEDURE', 'STAGGERED LOADS · MATCHES']] },
  { id: 'R-04', name: 'BRIGHT RIM', p: [0.68, 0.32, -0.46], kind: 'rim', cov: 0.27,
    rows: [['QUESTION', 'CAN COOLING AND POINTING COEXIST?', 'open'], ['EVIDENCE', '1 ATTEMPT · 12 FIXES'],
      ['MODEL', '▲ HEAT TREND UNSAMPLED PAST 9 MIN', 'caution'], ['HAZARDS', 'SHIP LOST HERE · ATTEMPT 3'], ['PROCEDURE', '—']] },
];
const LINKS = [['R-01', 'R-02'], ['R-02', 'R-03'], ['R-03', 'R-04']];
const TRANSFER = { 'R-02': 'Δv 84 ± 12 m/s · 3 h 10 m', 'R-03': 'Δv 151 ± 30 m/s · 7 h 40 m', 'R-04': 'Δv 236 ± 64 m/s · 13 h 05 m' };
const LEADS = [
  { id: 'L-A', name: 'PERIODIC BRIGHT RIM', from: 'R-02', to: 'R-04', rows: [['STATUS', 'RESOLVED · 2 BEARINGS CROSS', 'answered'], ['FIRST SEEN', 'ATTEMPT 2 · T+00:52'], ['LEADS TO', 'R-04']] },
  { id: 'L-B', name: 'CORRELATED TRACES', from: 'R-02', dir: [0.78, -0.42, 0.46], fan: 0.14, len: 0.6,
    rows: [['STATUS', 'NOTICED', 'open'], ['BEARING', '115° ± 8° · 25° BELOW'], ['RANGE', 'UNRESOLVED · 1 BEARING'], ['FIRST SEEN', 'ATTEMPT 3 · T+01:17']] },
  { id: 'L-C', name: 'REPEATED SILHOUETTE', from: 'R-01', dir: [0.36, 0.62, -0.7], fan: 0.23, len: 0.66, stale: true,
    rows: [['STATUS', 'NOTICED · STALE', 'open'], ['BEARING', '024° ± 13° · 38° ABOVE'], ['RANGE', 'UNRESOLVED · 1 BEARING'], ['FIRST SEEN', 'ATTEMPT 1 · T+00:09']] },
];
const START = [-0.6, -0.14, 0.27];
const ATTEMPTS = [
  { n: 1, end: 'lost', pts: [START, [-0.56, -0.1, 0.21], [-0.47, -0.05, 0.13]] },
  { n: 2, end: 'recall', pts: [START, [-0.5, -0.1, 0.21], [0.0, 0.18, 0.04], [0.34, -0.22, -0.34]] },
  { n: 3, end: 'lost', pts: [START, [-0.5, -0.1, 0.21], [0.0, 0.18, 0.04], [0.34, -0.22, -0.34], [0.6, 0.24, -0.44]] },
];
const DATUM = -0.5;

export function makeMapHolo(ui, hooks) {
  const Rh = 1.1;
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  const byId = new Map(REGIONS.map((r) => [r.id, r]));
  let attempt = 4;
  let selected = null;
  let hovered = null;
  let zoom = null;
  const layers = { leads: true, attempts: true, coverage: true, reach: true };
  let s = 5;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const lineMat = (col, op) => new THREE.LineBasicMaterial({ color: hex(col), transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });

  // ---- The volume: a datum plane to read heights against, a rim and two arcs over the top -----
  const datum = [];
  for (let i = -5; i <= 5; i++) {
    const x = i * 0.2;
    const h = Math.sqrt(Math.max(0, Rh * Rh - x * x));
    datum.push(x, DATUM, -h, x, DATUM, h, -h, DATUM, x, h, DATUM, x);
  }
  spin.add(G.thin(datum, { colour: C.gridMajor, opacity: 0.5 }));
  spin.add(G.fat(G.arcXZ(Rh, 0, TAU, 128, DATUM), { colour: C.inkDim, width: 1.2, opacity: 0.8 }));
  const dome = [];
  for (let i = 0; i < 64; i++) {
    const a = (TAU * i) / 64;
    const b = (TAU * (i + 1)) / 64;
    dome.push(Math.cos(a) * Rh, Math.sin(a) * Rh, 0, Math.cos(b) * Rh, Math.sin(b) * Rh, 0);
  }
  const shell = G.thin(dome, { colour: C.ink, opacity: 0.1 });
  shell.rotation.y = 0.6;
  spin.add(shell);

  // Unsurveyed space: a sparse haze of dim points everywhere the ship has not been.
  const charted = (p) => {
    for (const r of REGIONS) if (p.distanceTo(V(r.p)) < 0.24) return true;
    for (const [a, b] of LINKS) {
      const A = V(byId.get(a).p);
      const B = V(byId.get(b).p);
      const t = G.clamp(p.clone().sub(A).dot(B.clone().sub(A)) / A.distanceToSquared(B), 0, 1);
      if (p.distanceTo(A.lerp(B, t)) < 0.1) return true;
    }
    return false;
  };
  const haze = [];
  while (haze.length < 2400 * 3) {
    const p = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).multiplyScalar(Rh);
    if (p.length() > Rh || p.y < DATUM || charted(p)) continue;
    haze.push(p.x, p.y, p.z);
  }
  const hg = new THREE.BufferGeometry();
  hg.setAttribute('position', new THREE.Float32BufferAttribute(haze, 3));
  const hazePts = new THREE.Points(hg, new THREE.PointsMaterial({ color: hex(C.inkFaint), size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  spin.add(hazePts);

  // ---- Regions: a bubble of surveyed space, a small model of what is there, a stalk to the datum
  const pickables = [];
  const pickGeo = new THREE.SphereGeometry(0.1, 10, 8);
  const pickMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const covGroup = new THREE.Group();
  spin.add(covGroup);
  const stalks = [];
  for (const r of REGIONS) {
    const g = new THREE.Group();
    g.position.copy(V(r.p));
    const rb = 0.1 + r.cov * 0.07;
    const bubble = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(rb, 12, 8)), lineMat(C.ink, 0.08));
    covGroup.add(bubble);
    bubble.position.copy(g.position);
    const arc = G.fat(G.arcXZ(rb, 0, TAU * r.cov, 64), { colour: C.ink, width: 1.6, opacity: 0.8 });
    arc.position.copy(g.position);
    covGroup.add(arc);
    g.add(G.fat(G.arcXZ(rb, 0, TAU, 64), { colour: C.inkFaint, width: 1, opacity: 0.9 }));
    if (r.kind === 'field') {
      for (const [x, y, z, rad] of [[-0.025, -0.02, -0.04, 0.03], [0.055, 0.03, -0.085, 0.014]]) {
        const sp = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(rad, 10, 6)), lineMat(C.bodyRim, 0.55));
        sp.position.set(x, y, z);
        g.add(sp);
      }
      const pts = [];
      for (let i = 0; i < 70; i++) {
        const a = rnd() * TAU;
        const d = 0.02 + rnd() * 0.1;
        pts.push(Math.sin(a) * d, (rnd() - 0.5) * 0.07, Math.cos(a) * d);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: hex(C.asteroid), size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    } else if (r.kind === 'junction') {
      g.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.OctahedronGeometry(0.032, 0)), lineMat(C.ink, 0.9)));
    } else if (r.kind === 'pocket') {
      g.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(0.024, 0)), lineMat(C.asteroid, 0.8)));
    } else if (r.kind === 'rim') {
      g.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(0.05, 12, 8)), lineMat(C.bodyRim, 0.25)));
      const c = G.fat(G.arcXZ(0.056, -0.4, 2.6, 40), { colour: C.bodyRim, width: 2.6 });
      c.rotation.x = 0.9;
      g.add(c);
    }
    const tag = G.label(`${r.id}  ${r.short ?? r.name}`, 'holo');
    tag.position.set(0, rb + 0.05, 0);
    g.add(tag);
    const pk = new THREE.Mesh(pickGeo, pickMat);
    pk.userData.id = r.id;
    pk.scale.setScalar(rb / 0.1);
    g.add(pk);
    pickables.push(pk);
    spin.add(g);
    stalks.push(r.p[0], r.p[1], r.p[2], r.p[0], DATUM, r.p[2]);
    spin.add(Object.assign(G.fat(G.arcXZ(0.05, 0, TAU, 32, DATUM, r.p[0], r.p[2]), { colour: C.inkDim, width: 1, opacity: 0.8 })));
  }
  spin.add(G.thin(stalks, { colour: C.inkDim, opacity: 0.6 }));
  const corr = [];
  for (const [a, b] of LINKS) corr.push(...byId.get(a).p, ...byId.get(b).p);
  spin.add(G.fatSegs(corr, { colour: C.inkDim, width: 1.3, opacity: 0.7 }));

  // ---- Leads: a bearing is a cone, not a place, until a second bearing crosses it -------------
  const leadGroup = new THREE.Group();
  spin.add(leadGroup);
  for (const l of LEADS) {
    const o = V(byId.get(l.from).p);
    const g = new THREE.Group();
    let end;
    if (l.to) {
      const t = V(byId.get(l.to).p);
      end = o.clone().lerp(t, 0.5).add(new THREE.Vector3(0.08, 0.1, 0.02));
      g.add(G.fat([o.x, o.y, o.z, end.x, end.y, end.z, t.x, t.y, t.z], { colour: C.ink, width: 1, opacity: 0.35, dash: [0.02, 0.014] }));
    } else {
      const d = V(l.dir).normalize();
      const u = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0, 1, 0)).normalize();
      const v = new THREE.Vector3().crossVectors(d, u);
      const k = l.stale ? 0.4 : 1;
      end = o.clone().addScaledVector(d, l.len);
      g.add(G.fat([o.x, o.y, o.z, end.x, end.y, end.z], { colour: C.ink, width: 1.5, opacity: 0.9 * k }));
      const cone = [];
      const rim = (f, a) => o.clone().addScaledVector(d, l.len * f).addScaledVector(u, Math.cos(a) * Math.tan(l.fan) * l.len * f).addScaledVector(v, Math.sin(a) * Math.tan(l.fan) * l.len * f);
      for (let i = 0; i < 6; i++) { const p = rim(1, (TAU * i) / 6); cone.push(o.x, o.y, o.z, p.x, p.y, p.z); }
      for (const f of [0.34, 0.67, 1])
        for (let i = 0; i < 24; i++) { const p = rim(f, (TAU * i) / 24); const q = rim(f, (TAU * (i + 1)) / 24); cone.push(p.x, p.y, p.z, q.x, q.y, q.z); }
      g.add(G.thin(cone, { colour: C.ink, opacity: 0.3 * k }));
    }
    const tag = G.label(l.to ? l.id : `${l.id}  ${l.name}`, `holo ${l.stale || l.to ? 'dim' : ''}`);
    tag.position.copy(end).y += 0.05;
    g.add(tag);
    const pk = new THREE.Mesh(pickGeo, pickMat);
    pk.position.copy(end);
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
    for (const p of a.pts) flat.push(p[0] + off, p[1] + off, p[2] + off);
    attGroup.add(G.fat(flat, { colour: C.blackbox, width: 1.1, opacity: 0.45 }));
    const end = a.pts[a.pts.length - 1];
    const tag = G.label(`${a.end === 'lost' ? '✕' : '↺'} ${a.n}`, 'holo bbx');
    tag.position.set(end[0] + off, end[1] + off + 0.03, end[2] + off);
    attGroup.add(tag);
  }
  ATTEMPTS.forEach(addAttempt);

  // ---- You are here, and what the propellant on board can still reach --------------------------
  const here = new THREE.Group();
  here.position.copy(V(START));
  const glyph = G.fat([0, 0, -0.03, 0.015, 0, 0.02, -0.015, 0, 0.02, 0, 0, -0.03], { colour: C.ink, width: 2 });
  glyph.rotation.y = -0.9;
  here.add(glyph);
  const pulse = G.fat(G.arcXZ(0.045, 0, TAU, 40), { colour: C.ink, width: 1.4 });
  here.add(pulse);
  const hereTag = G.label('', 'holo sel');
  hereTag.position.set(0, -0.06, 0.05);
  here.add(hereTag);
  spin.add(here);
  spin.add(G.thin([START[0], START[1], START[2], START[0], DATUM, START[2]], { colour: C.ink, opacity: 0.5 }));
  const reach = new THREE.Group();
  reach.position.copy(here.position);
  for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2]]) {
    const c = G.fat(G.arcXZ(0.42, 0, TAU, 96), { colour: C.velocity, width: 1, opacity: rx || rz ? 0.3 : 0.7, dash: [0.02, 0.02] });
    c.rotation.set(rx, 0, rz);
    reach.add(c);
  }
  const reachTag = G.label('REACH 690 m/s', 'holo vel');
  reachTag.position.set(0.1, -0.08, 0.44);
  reach.add(reachTag);
  spin.add(reach);

  // ---- Selection -------------------------------------------------------------------------------
  const mkSel = (w, op) => {
    const g = new THREE.Group();
    for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2]]) {
      const c = G.fat(G.arcXZ(1, 0, TAU, 64), { colour: C.ink, width: w, opacity: op });
      c.rotation.set(rx, 0, rz);
      g.add(c);
    }
    g.visible = false;
    spin.add(g);
    return g;
  };
  const selRing = mkSel(1.8, 0.9);
  const hovRing = mkSel(1, 0.45);
  const route = G.fat([0, 0, 0, 0, 0, 0.01], { colour: C.forecast, width: 2, dash: [0.016, 0.02] });
  route.visible = false;
  spin.add(route);

  const posOf = (id) => {
    const r = byId.get(id);
    if (r) return [V(r.p), 0.12 + r.cov * 0.08];
    return [pickables.find((p) => p.userData.id === id).position.clone(), 0.07];
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
      ${r ? `<div class="pl-actions"><button data-act="region"${r.local ? '' : ' disabled'}>${r.local ? 'ENTER REGION' : 'NO LOCAL SURVEY'}</button>${r.id !== 'R-01' ? '<button data-act="course">SET COURSE</button>' : ''}</div>` : ''}`;
    el.querySelector('[data-act="region"]')?.addEventListener('click', () => api.zoomTo(r.id));
    el.querySelector('[data-act="course"]')?.addEventListener('click', (e) => e.currentTarget.classList.toggle('on'));
  }

  function restyle() {
    for (const [ring, id] of [[selRing, selected], [hovRing, hovered === selected ? null : hovered]]) {
      ring.visible = !!id;
      if (id) {
        const [p, rad] = posOf(id);
        ring.position.copy(p);
        ring.scale.setScalar(rad);
      }
    }
    route.visible = false;
    const r = byId.get(selected);
    if (r && r.id !== 'R-01') {
      const flat = [...START];
      for (const q of REGIONS) {
        flat.push(...q.p);
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
    covGroup.visible = hazePts.visible = layers.coverage;
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
    /** Fly the view into a region, then hand over to its local environment. */
    zoomTo(id) { if (!zoom) zoom = { id, t: 0, base: spin.scale.x }; },
    resetZoom() { zoom = null; spin.position.set(0, 0, 0); },
    /** The ship was lost: Black Box keeps the track, the attempt counter moves on. */
    addLoss() {
      addAttempt({ n: attempt, end: 'lost', pts: [START, [-0.57 + rnd() * 0.05, -0.1, 0.2 - rnd() * 0.05], [-0.52 + rnd() * 0.08, -0.06 + rnd() * 0.06, 0.12 + rnd() * 0.05]] });
      attempt += 1;
      hereTag.userData.el.textContent = `ATTEMPT ${attempt}`;
    },
    update(dt, time) {
      const k = (time % 2.4) / 2.4;
      pulse.scale.setScalar(1 + k * 1.2);
      pulse.material.opacity = 1 - k;
      if (zoom) {
        zoom.t = Math.min(1, zoom.t + dt / 0.55);
        const e = G.ease(zoom.t);
        const sc = zoom.base * (1 + 4.5 * e);
        spin.scale.setScalar(sc);
        spin.position.copy(V(byId.get(zoom.id).p)).applyQuaternion(spin.quaternion).multiplyScalar(-sc * e);
        if (zoom.t >= 1) {
          const { id, base } = zoom;
          zoom = null;
          spin.scale.setScalar(base);
          spin.position.set(0, 0, 0);
          hooks.enterRegion(id);
        }
      }
    },
  };
  hereTag.userData.el.textContent = `ATTEMPT ${attempt}`;
  chips();
  restyle();
  fillPlate();
  return api;
}
