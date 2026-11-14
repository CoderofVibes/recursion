// Ship hologram: the vehicle from data/ship-baseline.json drawn as a three-dimensional technical
// drawing. The overview calls out the major items; choosing a system isolates it, frames it, names
// its components and brings up its readouts (ship-screens.js).
import * as THREE from 'three';
import { colour as C, hex } from '../visual/theme.js';
import * as G from './gfx.js';
import { EQUIPMENT, APPENDAGES, FOOTPRINTS, SHIP } from './ship-data.js';
import { buildParts, SYSTEMS } from './ship-parts.js';
import { renderShipPanels } from './ship-screens.js';

/** Body frame (x forward, y left, z up) → three (x right, y up, z toward the viewer). Forward is -z. */
export const P = (bx, by, up = 0) => new THREE.Vector3(-by, up, -bx);
const lerp = (a, b, f) => a + (b - a) * f;
const APP = new Map(APPENDAGES.map((a) => [a.id, a]));

export const CONFIGS = {
  stowed: { rad: 0, sol: 0, label: 'STOWED' },
  radiators: { rad: 1, sol: 0, label: 'RADIATORS' },
  solar: { rad: 0, sol: 1, label: 'SOLAR' },
  allDeployed: { rad: 1, sol: 1, label: 'ALL OUT' },
};

/** The drawn ship in body metres. detail=false keeps only what shows from outside. */
export function makeShipModel({ detail = true } = {}) {
  const group = new THREE.Group();
  const frac = { rad: 0, sol: 0 };
  const target = { rad: 0, sol: 0 };
  let cfg = 'stowed';
  const parts = new Map();
  const list = buildParts().filter((p) => detail || p.ext);
  for (const p of list) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute((p.dyn ? p.dyn(0, 0) : p.wire).toThree(), 3));
    const line = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        color: hex(p.orange ? C.blackbox : C.ink),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    line.frustumCulled = false;
    group.add(line);
    let pick = null;
    if (detail && p.eq && p.r > 0) {
      pick = new THREE.Mesh(
        new THREE.SphereGeometry(1, 10, 8),
        new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
      );
      pick.position.copy(P(...p.anchor));
      pick.scale.setScalar(p.r);
      pick.userData.id = p.id;
      group.add(pick);
    }
    parts.set(p.id, { p, line, pick });
  }

  function layout() {
    for (const o of parts.values()) {
      if (!o.p.dyn) continue;
      o.line.geometry.dispose();
      o.line.geometry = new THREE.BufferGeometry();
      o.line.geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(o.p.dyn(frac.rad, frac.sol).toThree(), 3),
      );
      if (o.pick) {
        const f = frac[o.p.follow];
        const span = o.p.follow === 'sol' ? 9.4 : 7.5;
        o.pick.position.copy(P(o.p.anchor[0], o.p.side * (2.7 + (span * f) / 2), 0));
        o.pick.scale.setScalar(0.9 + 2.4 * f);
      }
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
        p = [
          lerp(a.stowedPosition[0], a.deployedPosition[0], f),
          lerp(a.stowedPosition[1], a.deployedPosition[1], f),
        ];
      }
      m += e.mass;
      x += e.mass * p[0];
      y += e.mass * p[1];
    }
    return [x / m, y / m];
  }

  const api = {
    group,
    parts,
    list,
    frac,
    get config() {
      return cfg;
    },
    com: centreOfMass,
    setConfig(name, instant = false) {
      cfg = name;
      target.rad = CONFIGS[name].rad;
      target.sol = CONFIGS[name].sol;
      if (instant) {
        frac.rad = target.rad;
        frac.sol = target.sol;
        layout();
      }
    },
    /** Returns true while appendages are still moving. */
    update(dt) {
      let moving = false;
      for (const k of ['rad', 'sol']) {
        const d = target[k] - frac[k];
        if (Math.abs(d) > 1e-4) {
          frac[k] += Math.sign(d) * Math.min(Math.abs(d), dt / 1.8);
          moving = true;
        }
      }
      if (moving) layout();
      return moving;
    },
    setOpacity(v) {
      for (const o of parts.values()) o.line.material.opacity = v * (o.p.faint ? 0.3 : 1);
    },
  };
  api.setConfig(SHIP.initialConfiguration, true);
  return api;
}

/** The ship inspection hologram. ui: { left, right } panel elements. */
export function makeShipHolo(ui) {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  group.add(spin);
  spin.rotation.set(0.12, 0.95, 0);
  const model = makeShipModel({ detail: true });
  spin.add(model.group);
  const marks = new THREE.Group(); // centre of mass, thrust line and footprint ride with the model
  model.group.add(marks);

  const modeOf = new Map(EQUIPMENT.map((e) => [e.id, e.initialMode]));
  let system = null;
  let selected = null;
  let hovered = null;
  let moving = false;
  const OVERVIEW = { c: new THREE.Vector3(0, 0, 0), S: 0.078 };
  const view = { c: OVERVIEW.c.clone(), S: OVERVIEW.S };
  let goal = OVERVIEW;

  // Centre of mass, its dotted yaw axis, and the main engine's line of action.
  const comMark = new THREE.Group();
  comMark.add(G.fat(G.arcXZ(0.42, 0, Math.PI * 2, 32), { colour: C.ink, width: 1.6 }));
  comMark.add(
    G.fatSegs([-0.42, 0, 0, 0.42, 0, 0, 0, 0, -0.42, 0, 0, 0.42], { colour: C.ink, width: 1.2 }),
  );
  comMark.add(
    G.fat([0, -4.4, 0, 0, 4.8, 0], { colour: C.ink, width: 1.3, dash: [0.22, 0.3], opacity: 0.8 }),
  );
  const comTag = G.label('', 'holo');
  comTag.position.set(0, 5.1, 0);
  comMark.add(comTag);
  marks.add(comMark);
  const mount = P(-6.4, 0.08, 0);
  const thrustLine = G.fat([mount.x, 0, mount.z + 1.6, mount.x, 0, mount.z - 15.5], {
    colour: C.thrust,
    width: 1.3,
    dash: [0.4, 0.3],
    opacity: 0.9,
  });
  marks.add(thrustLine);
  const armTag = G.label('', 'holo thr');
  armTag.position.set(mount.x, 0.5, mount.z - 16.2);
  marks.add(armTag);
  const BASE = -4.4;
  const foot = G.fat([0, 0, 0, 0, 0, 1], { colour: C.ink, width: 1.3, opacity: 0.6 });
  marks.add(foot);
  const footTag = G.label('', 'holo dim');
  marks.add(footTag);

  // Callouts: a leader from each named part to its label.
  const leaders = G.thin([0, 0, 0, 0, 0, 0], { colour: C.inkDim, opacity: 0.7 });
  model.group.add(leaders);
  const tags = new Map();
  for (const o of model.parts.values()) {
    if (!o.p.name) continue;
    const t = G.label(o.p.name, `holo call${o.p.orange ? ' bbx' : ''}`);
    model.group.add(t);
    tags.set(o.p.id, t);
  }

  const anchorOf = (o) => {
    if (o.p.dyn) {
      const span = o.p.follow === 'sol' ? 9.4 : 7.5;
      return [o.p.anchor[0], o.p.side * (2.7 + (span * model.frac[o.p.follow]) / 2), 0];
    }
    return o.p.anchor;
  };
  function labelPos(o) {
    const a = anchorOf(o);
    const rad = Math.hypot(a[1], a[2]);
    const out = o.p.dyn ? [0, 0, 1] : rad > 0.35 ? [0, a[1] / rad, a[2] / rad] : [0, 0, 1];
    const reach = o.p.dyn ? 1.5 : Math.max(rad + 0.9, system ? rad + 0.9 : 3.5) - rad;
    return [a[0] + (system ? 0 : Math.sign(a[0]) * 0.3), a[1] + out[1] * reach, a[2] + out[2] * reach];
  }

  const visibleIn = (p) =>
    system ? p.sys === system || p.id === 'hull' || p.id === 'canopy' : !p.net;
  const calledOut = (p) =>
    !!p.name && (system ? p.sys === system && (!p.net || p.callout) && p.id !== 'hull' : p.major);

  function restyle() {
    const seg = [];
    for (const o of model.parts.values()) {
      const p = o.p;
      const mine = system && p.sys === system;
      o.line.visible = visibleIn(p);
      if (o.pick) o.pick.visible = system ? !!mine : true;
      const hot = p.id === selected || p.id === hovered;
      let op;
      if (!system)
        op = hot ? 1 : p.faint ? 0.1 : p.id === 'hull' ? 0.26 : p.orange ? 0.9 : p.ext ? 0.5 : 0.25;
      else if (!mine) op = 0.07;
      else op = hot ? 1 : p.faint ? 0.25 : p.net ? 0.42 : selected ? 0.42 : 0.82;
      o.line.material.opacity = op;
      const t = tags.get(p.id);
      if (t) {
        t.visible = calledOut(p) || (hot && !!p.name && visibleIn(p));
        if (t.visible) {
          const a = anchorOf(o);
          const l = labelPos(o);
          t.position.copy(P(l[0], l[1], l[2]));
          const A = P(a[0], a[1], a[2]);
          seg.push(A.x, A.y, A.z, t.position.x, t.position.y, t.position.z);
          t.userData.el.classList.toggle('sel', p.id === selected);
        }
      }
    }
    leaders.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(seg.length ? seg : [0, 0, 0, 0, 0, 0], 3),
    );
    marks.visible = !system || system === 'structure' || system === 'propulsion';
    foot.visible = footTag.visible = !system || system === 'structure';
  }

  function refreshMarks() {
    const [cx, cy] = model.com();
    comMark.position.copy(P(cx, cy, 0));
    armTag.userData.el.textContent = `THRUST ARM ${Math.round(Math.abs(0.08 - cy) * 100)} cm`;
    comTag.userData.el.textContent = `CoM  ${cx >= 0 ? '+' : '−'}${Math.abs(cx).toFixed(2)} m  DRY`;
    const poly = FOOTPRINTS[model.config];
    const flat = [];
    for (let i = 0; i <= poly.length; i++) {
      const v = P(poly[i % poly.length][0], poly[i % poly.length][1], BASE);
      flat.push(v.x, v.y, v.z);
    }
    G.setFat(foot, flat);
    const ys = poly.map((q) => q[1]);
    footTag.userData.el.textContent = `FOOTPRINT 16 × ${Math.max(...ys) - Math.min(...ys)} m`;
    footTag.position.copy(P(-9.8, 0, BASE));
  }

  /** Frame the isolated system: centre and scale from the extent of its parts. */
  function frame() {
    if (!system || system === 'structure') {
      goal = OVERVIEW;
      return;
    }
    const box = new THREE.Box3();
    for (const o of model.parts.values()) {
      if (o.p.sys !== system || o.p.net) continue;
      o.line.geometry.computeBoundingBox();
      box.union(o.line.geometry.boundingBox);
    }
    const s = new THREE.Sphere();
    box.getBoundingSphere(s);
    goal = { c: s.center.clone(), S: Math.min(0.15, 0.62 / Math.max(s.radius, 1.5)) };
  }

  const panels = () =>
    renderShipPanels(
      ui,
      {
        system,
        selected,
        parts: model.list,
        modeOf,
        frac: model.frac,
        config: model.config,
        com: model.com(),
      },
      {
        system: (id) => api.setSystem(id),
        part: (id) => api.select(id === selected ? null : id),
        config: (k) => api.setConfig(k),
        mode: (id, m) => {
          modeOf.set(id, m);
          panels();
        },
      },
      CONFIGS,
    );

  const api = {
    group,
    spin,
    model,
    get system() {
      return system;
    },
    pick(raycaster) {
      const hits = raycaster.intersectObjects(
        [...model.parts.values()].filter((o) => o.pick?.visible).map((o) => o.pick),
        false,
      );
      return hits.length ? hits[0].object.userData.id : null;
    },
    hover(id) {
      if (id !== hovered) {
        hovered = id;
        restyle();
      }
    },
    /** In the overview, choosing a part opens its system. */
    select(id) {
      selected = id;
      const p = id ? model.parts.get(id)?.p : null;
      if (p && !system && p.sys !== 'structure') {
        system = p.sys;
        frame();
      }
      restyle();
      panels();
    },
    setSystem(id) {
      system = id && SYSTEMS.some((s) => s.id === id) ? id : null;
      if (selected && model.parts.get(selected)?.p.sys !== system) selected = null;
      frame();
      restyle();
      panels();
    },
    setConfig(k, instant) {
      model.setConfig(k, instant);
      refreshMarks();
      frame();
      restyle();
      panels();
    },
    update(dt) {
      if (model.update(dt)) {
        refreshMarks();
        frame();
        restyle();
        moving = true;
      } else if (moving) {
        moving = false;
        panels(); // redraw the readouts once the wings have stopped
      }
      const k = 1 - Math.exp(-dt * 4.5);
      view.c.lerp(goal.c, k);
      view.S += (goal.S - view.S) * k;
      spin.scale.setScalar(view.S);
      model.group.position.copy(view.c).multiplyScalar(-1);
    },
    /** Redraw the readouts (their canvases need the columns to be on screen). */
    refresh: () => panels(),
    /** Jump straight to the framed view (used for screenshots). */
    snap() {
      view.c.copy(goal.c);
      view.S = goal.S;
    },
  };
  refreshMarks();
  restyle();
  panels();
  return api;
}
