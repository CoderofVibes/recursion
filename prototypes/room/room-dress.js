// Fills the compartment so it reads as a working control room: wall stations with slanted desks and
// inset screens, instrument racks, overhead panels, a round hatch, pipes, vents, crew seats and floor
// markings. Original set dressing in the Night Watch palette; the owner's reference images informed
// the density and the kinds of furniture, nothing is copied from them.
import * as THREE from 'three';
import { colour as C, type as TY, hex } from '../visual/theme.js';
import * as G from './gfx.js';

const PI = Math.PI;
const lcg = (seed) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

// ---- Textures --------------------------------------------------------------------------------
function screenTexture(kind, seed, tint = C.ink) {
  return G.canvasTex(256, 144, (x, w, h) => {
    const r = lcg(seed);
    x.fillStyle = '#060403';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#2b2118';
    x.lineWidth = 4;
    x.strokeRect(2, 2, w - 4, h - 4);
    x.strokeStyle = tint;
    x.fillStyle = tint;
    x.lineWidth = 2;
    if (kind === 0) {
      for (let i = 0; i < 7; i++) {
        x.globalAlpha = 0.25;
        x.fillRect(16, 16 + i * 17, 224, 6);
        x.globalAlpha = 1;
        x.fillRect(16, 16 + i * 17, 224 * (0.15 + r() * 0.8), 6);
      }
    } else if (kind === 1) {
      x.globalAlpha = 0.3;
      for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(12, (h * i) / 4); x.lineTo(w - 12, (h * i) / 4); x.stroke(); }
      x.globalAlpha = 1;
      for (let k = 0; k < 2; k++) {
        x.beginPath();
        let v = 0.3 + k * 0.35;
        for (let i = 0; i <= 50; i++) {
          v = G.clamp(v + (r() - 0.5) * 0.12, 0.1, 0.9);
          x[i ? 'lineTo' : 'moveTo'](14 + i * 4.56, h - 14 - v * (h - 28));
        }
        x.stroke();
        x.setLineDash([3, 5]);
      }
      x.setLineDash([]);
    } else if (kind === 2) {
      for (const rad of [22, 40, 58]) { x.globalAlpha = rad === 58 ? 1 : 0.4; x.beginPath(); x.arc(w / 2, h / 2, rad, 0, 7); x.stroke(); }
      x.globalAlpha = 0.4;
      x.beginPath(); x.moveTo(w / 2 - 60, h / 2); x.lineTo(w / 2 + 60, h / 2); x.moveTo(w / 2, h / 2 - 60); x.lineTo(w / 2, h / 2 + 60); x.stroke();
      x.globalAlpha = 1;
      for (let i = 0; i < 7; i++) { const a = r() * 6.28; const d = 10 + r() * 46; x.fillRect(w / 2 + Math.cos(a) * d - 2, h / 2 + Math.sin(a) * d - 2, 4, 4); }
      x.beginPath(); x.moveTo(w / 2, h / 2); x.lineTo(w / 2 + 50, h / 2 - 30); x.stroke();
    } else if (kind === 3) {
      for (let i = 0; i < 9; i++) {
        let px = 14;
        while (px < 220 * (0.4 + r() * 0.6)) {
          const ww = 6 + r() * 26;
          x.globalAlpha = r() > 0.8 ? 1 : 0.6;
          x.fillRect(px, 14 + i * 13, ww, 5);
          px += ww + 5;
        }
      }
    } else if (kind === 4) {
      for (const cx of [72, 184]) {
        x.beginPath(); x.arc(cx, 76, 44, PI * 0.8, PI * 2.2); x.stroke();
        for (let i = 0; i <= 8; i++) { const a = PI * 0.8 + (PI * 1.4 * i) / 8; x.beginPath(); x.moveTo(cx + Math.cos(a) * 38, 76 + Math.sin(a) * 38); x.lineTo(cx + Math.cos(a) * 44, 76 + Math.sin(a) * 44); x.stroke(); }
        const a = PI * 0.8 + PI * 1.4 * (0.2 + r() * 0.6);
        x.lineWidth = 3;
        x.beginPath(); x.moveTo(cx, 76); x.lineTo(cx + Math.cos(a) * 34, 76 + Math.sin(a) * 34); x.stroke();
        x.lineWidth = 2;
      }
    } else {
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 11; i++) {
          const on = r();
          x.globalAlpha = on > 0.55 ? 1 : 0.18;
          x.fillStyle = on > 0.93 ? C.blackbox : tint;
          x.fillRect(18 + i * 20.5, 18 + j * 23, 10, 10);
        }
    }
    x.globalAlpha = 1;
  });
}

function plateTexture(kind) {
  const t = G.canvasTex(256, 256, (x, w, h) => {
    const r = lcg(5 + kind * 7);
    x.fillStyle = '#16110d';
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,220,170,${r() * 0.03})`; x.fillRect(r() * w, r() * h, 1, 6 + r() * 26); }
    x.strokeStyle = '#080605';
    x.lineWidth = 5;
    x.strokeRect(3, 3, w - 6, h - 6);
    if (kind === 0) {
      // vent louvres
      x.fillStyle = '#060403';
      for (let i = 0; i < 9; i++) x.fillRect(26, 30 + i * 23, w - 52, 11);
      x.fillStyle = 'rgba(255,220,170,0.07)';
      for (let i = 0; i < 9; i++) x.fillRect(26, 28 + i * 23, w - 52, 2);
    } else if (kind === 1) {
      // access panel with fasteners and a stencil
      x.strokeStyle = '#0a0705';
      x.lineWidth = 3;
      x.strokeRect(28, 28, w - 56, h - 56);
      x.fillStyle = '#2e241a';
      for (const [a, b] of [[38, 38], [w - 38, 38], [38, h - 38], [w - 38, h - 38], [w / 2, 38], [w / 2, h - 38]]) { x.beginPath(); x.arc(a, b, 5, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(239,227,204,0.28)';
      x.font = `600 20px ${TY.family}`;
      x.fillText(['LOOP 2', 'BUS A', 'O₂ FEED', 'RACK 4'][Math.floor(r() * 4)], 46, 84);
      x.fillRect(46, 96, 70, 3);
    } else if (kind === 2) {
      // deck grating
      x.fillStyle = '#0a0806';
      x.fillRect(0, 0, w, h);
      x.strokeStyle = '#231b14';
      x.lineWidth = 3;
      for (let i = 0; i <= 16; i++) { x.beginPath(); x.moveTo(i * 16, 0); x.lineTo(i * 16, h); x.stroke(); }
      x.lineWidth = 6;
      for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(0, i * 64); x.lineTo(w, i * 64); x.stroke(); }
    } else {
      // hazard chevrons, muted
      x.fillStyle = '#0c0a07';
      x.fillRect(0, 0, w, h);
      x.fillStyle = '#7a5b22';
      for (let i = -4; i < 12; i++) { x.beginPath(); x.moveTo(i * 44, h); x.lineTo(i * 44 + 22, h); x.lineTo(i * 44 + 22 + h, 0); x.lineTo(i * 44 + h, 0); x.fill(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * ctx: { room, ROOM, CON, glowMat(colour, k, extra), emissives: [], addLight }.
 * Returns { front(group, arcRadians) } to dress the curved wall whenever the window is rebuilt.
 */
export function dressRoom(ctx) {
  const { room, ROOM, CON, glowMat, emissives, addLight } = ctx;
  const { W, back, zc, R, H } = ROOM;
  const metal = new THREE.MeshStandardMaterial({ color: 0x1d1813, roughness: 0.5, metalness: 0.65 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x0f0c09, roughness: 0.55, metalness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x33281d, roughness: 0.4, metalness: 0.75 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3b2416, roughness: 0.85, metalness: 0.05 });
  const plate = [0, 1, 2, 3].map((k) => new THREE.MeshStandardMaterial({ map: plateTexture(k), roughness: 0.6, metalness: 0.5 }));
  plate[2].map.repeat.set(1, 3);
  const screens = [];
  for (let k = 0; k < 6; k++)
    for (const tint of k === 5 ? [C.ink] : [C.ink, k % 2 ? C.blackbox : C.ink]) {
      const tex = screenTexture(k, 11 + screens.length * 3, tint);
      const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.35, metalness: 0.1 });
      emissives.push({ m, base: 0.85 });
      screens.push(m);
    }
  const rnd = lcg(77);
  const pickScreen = () => screens[Math.floor(rnd() * screens.length)];
  const amber = glowMat('#ff9a40', 0.5);
  const warm = glowMat('#ffc890', 0.55);

  const box = (parent, w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const face = (mesh, n, up) => {
    const N = new THREE.Vector3(...n).normalize();
    const U = new THREE.Vector3(...up);
    U.addScaledVector(N, -U.dot(N)).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(U, N), U, N));
    return mesh;
  };
  const panel = (parent, w, h, mat, pos, n, up) => {
    const m = face(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat), n, up);
    m.position.set(...pos);
    parent.add(m);
    return m;
  };

  // Small lit keys and indicator lamps, all in one instanced mesh.
  const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), glowMat('#ffffff', 1), 2600);
  leds.frustumCulled = false;
  let nLed = 0;
  const dummy = new THREE.Object3D();
  const ledCol = new THREE.Color();
  const led = (parent, x, y, z, size = 0.03, bright = 0.5, col = C.ink) => {
    if (nLed >= 2600) return;
    parent.add(dummy);
    dummy.position.set(x, y, z);
    dummy.scale.set(size, size * 0.4, size);
    dummy.updateWorldMatrix(true, false);
    leds.setMatrixAt(nLed, dummy.matrixWorld);
    leds.setColorAt(nLed++, ledCol.set(hex(col)).multiplyScalar(bright));
    parent.remove(dummy);
  };
  const keyRow = (parent, x, y, z0, z1, n) => {
    for (let i = 0; i < n; i++) {
      const v = rnd();
      led(parent, x, y, z0 + ((z1 - z0) * i) / (n - 1), 0.034, v > 0.75 ? 0.9 : 0.22, v > 0.94 ? C.blackbox : C.ink);
    }
  };

  function seat(parent, x, z, ry) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    const cyl = (r, h, y, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat); m.position.y = y; g.add(m); };
    cyl(0.27, 0.03, 0.015, metalDark);
    cyl(0.06, 0.42, 0.23, trim);
    box(g, 0.52, 0.1, 0.5, leather, 0, 0.49, 0);
    const b = box(g, 0.1, 0.66, 0.46, leather, 0.27, 0.86, 0);
    b.rotation.z = -0.14;
    box(g, 0.08, 0.2, 0.3, leather, 0.33, 1.27, 0);
    for (const k of [-1, 1]) { box(g, 0.38, 0.04, 0.06, metalDark, 0.02, 0.68, k * 0.28); box(g, 0.04, 0.2, 0.05, trim, 0.16, 0.58, k * 0.28); }
    parent.add(g);
  }

  // ---- Wall stations along both sides ---------------------------------------------------------
  const L = 4.5;
  const zMid = 1.55;
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.position.set(s * (W / 2), 0, zMid);
    st.rotation.y = s > 0 ? PI : 0; // local +x points into the room
    room.add(st);
    box(st, 0.56, 0.74, L, metal, 0.28, 0.37, 0);
    box(st, 0.02, 0.02, L, amber, 0.575, 0.06, 0);
    for (let i = 0; i < 6; i++) panel(st, 0.6, 0.5, plate[i % 2], [0.562, 0.4, -L / 2 + 0.4 + i * 0.74], [1, 0, 0], [0, 1, 0]);
    const desk = new THREE.Group();
    desk.position.set(0.37, 0.82, 0);
    desk.rotation.z = -0.36;
    st.add(desk);
    box(desk, 0.72, 0.06, L, metalDark, 0, 0, 0);
    box(desk, 0.03, 0.03, L, trim, 0.36, 0.03, 0);
    for (let i = 0; i < 5; i++) panel(desk, 0.66, 0.37, pickScreen(), [-0.1, 0.034, -L / 2 + 0.55 + i * 0.85], [0, 1, 0], [-1, 0, 0]);
    keyRow(desk, 0.22, 0.036, -L / 2 + 0.2, L / 2 - 0.2, 64);
    keyRow(desk, 0.28, 0.036, -L / 2 + 0.2, L / 2 - 0.2, 64);
    // Handrail and a work light under the rack.
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, L - 0.2, 8), trim);
    rail.rotation.x = PI / 2;
    rail.position.set(0.5, 1.06, 0);
    st.add(rail);
    box(st, 0.03, 0.014, L - 0.3, warm, 0.3, 1.27, 0);
    // Upper rack of modules.
    box(st, 0.34, 1.16, L, metal, 0.17, 1.87, 0);
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 2; j++) {
        const v = rnd();
        const mat = v < 0.45 ? pickScreen() : v < 0.7 ? plate[0] : plate[1];
        panel(st, 0.66, 0.5, mat, [0.345, 1.58 + j * 0.56, -L / 2 + 0.41 + i * 0.737], [1, 0, 0], [0, 1, 0]);
        if (v >= 0.7) for (let k = 0; k < 5; k++) led(st, 0.35, 1.42 + j * 0.56, -L / 2 + 0.2 + i * 0.737 + k * 0.07, 0.022, rnd() > 0.5 ? 0.9 : 0.15, rnd() > 0.9 ? C.blackbox : C.ink);
      }
    // Overhead panel, tilted down toward whoever stands at the station.
    const over = new THREE.Group();
    over.position.set(0.42, 2.66, 0);
    over.rotation.z = 0.5;
    st.add(over);
    box(over, 0.7, 0.07, L, metalDark, 0, 0, 0);
    for (let i = 0; i < 7; i++) panel(over, 0.5, 0.22, pickScreen(), [0.02, -0.037, -L / 2 + 0.4 + i * 0.62], [0, -1, 0], [-1, 0, 0]);
    keyRow(over, 0.3, -0.04, -L / 2 + 0.15, L / 2 - 0.15, 56);
    // Pilasters.
    for (const z of [-L / 2, 0, L / 2]) box(st, 0.42, H, 0.14, metal, 0.21, H / 2, z);
    seat(st, 1.08, -1.1, 0);
    seat(st, 1.08, 1.1, 0);
    const l = new THREE.PointLight(0xffd9a8, 2.4, 4.5, 2);
    l.position.set(s * (W / 2 - 1.0), 1.25, zMid);
    addLight(l);
  }

  // ---- Round hatch in the back wall, flanked by racks ----------------------------------------
  const hatch = new THREE.Group();
  hatch.position.set(0, 1.22, back - 0.03);
  room.add(hatch);
  const torus = (r, t, mat, z = 0) => { const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 12, 48), mat); m.position.z = z; hatch.add(m); return m; };
  torus(1.14, 0.1, metal, -0.02);
  torus(1.27, 0.012, glowMat('#ff9a40', 0.6), -0.06);
  const door = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.06, 0.1, 48), metalDark);
  door.rotation.x = PI / 2;
  hatch.add(door);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * PI * 2;
    const sp = box(hatch, 0.08, 0.72, 0.06, trim, Math.cos(a) * 0.62, Math.sin(a) * 0.62, -0.08);
    sp.rotation.z = a - PI / 2;
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * PI * 2 + 0.13;
    const lug = box(hatch, 0.16, 0.09, 0.07, metal, Math.cos(a) * 0.98, Math.sin(a) * 0.98, -0.08);
    lug.rotation.z = a;
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 24), metal);
  hub.rotation.x = PI / 2;
  hub.position.z = -0.1;
  hatch.add(hub);
  torus(0.36, 0.025, trim, -0.2);
  for (let k = 0; k < 3; k++) { const a = (k / 3) * PI * 2; const sp = box(hatch, 0.03, 0.36, 0.03, trim, Math.cos(a) * 0.18, Math.sin(a) * 0.18, -0.2); sp.rotation.z = a - PI / 2; }
  box(room, 1.9, 0.1, 0.42, metal, 0, 0.05, back - 0.22);
  panel(room, 1.9, 0.12, plate[3], [0, 2.52, back - 0.04], [0, 0, -1], [0, 1, 0]);
  for (const s of [-1, 1]) {
    const rk = new THREE.Group();
    rk.position.set(s * 2.55, 0, back);
    room.add(rk);
    box(rk, 1.9, 2.7, 0.42, metal, 0, 1.35, -0.21);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 4; j++) {
        const v = rnd();
        panel(rk, 0.58, 0.58, v < 0.4 ? pickScreen() : v < 0.7 ? plate[0] : plate[1], [-0.61 + i * 0.61, 0.42 + j * 0.62, -0.425], [0, 0, -1], [0, 1, 0]);
        if (v >= 0.4) for (let k = 0; k < 4; k++) led(rk, -0.8 + i * 0.61 + k * 0.07, 0.19 + j * 0.62, -0.43, 0.022, rnd() > 0.5 ? 0.9 : 0.15);
      }
    box(rk, 0.03, 2.4, 0.03, amber, -s * 1.0, 1.3, -0.44);
  }

  // ---- Overhead: pipes, cable trays, vents -----------------------------------------------------
  const pipe = (r, x, y, len, z, mat = trim) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), mat); m.rotation.x = PI / 2; m.position.set(x, y, z); room.add(m); };
  for (const s of [-1, 1]) {
    pipe(0.055, s * 2.55, H - 0.2, 5.6, 1.8);
    pipe(0.035, s * 2.72, H - 0.26, 5.6, 1.8, metal);
    pipe(0.03, s * 2.38, H - 0.27, 5.6, 1.8, metalDark);
    box(room, 0.4, 0.05, 5.4, metalDark, s * 0.95, H - 0.2, 1.8);
    for (const z of [1.25, 2.75, 4.1]) panel(room, 1.3, 0.6, plate[0], [s * 1.75, H - 0.012, z], [0, -1, 0], [1, 0, 0]);
    for (const z of [0.2, 1.4, 2.6, 3.8]) box(room, 0.14, 0.1, 0.1, trim, s * 2.55, H - 0.2, z);
  }
  box(room, 0.5, 0.08, 5.4, metal, 0, H - 0.16, 1.8);

  // ---- Deck: walkway from the hatch, dais rings round the console ------------------------------
  const walk = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 3.6), plate[2]);
  walk.rotation.x = -PI / 2;
  walk.position.set(0, 0.006, 2.75);
  room.add(walk);
  const lane = glowMat('#d2491c', 0.42);
  for (const s of [-1, 1]) box(room, 0.03, 0.012, 3.6, lane, s * 0.79, 0.01, 2.75);
  const ring = (r0, r1, mat) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 96), mat); m.rotation.x = -PI / 2; m.position.set(CON.x, 0.008, CON.z); room.add(m); };
  ring(2.36, 2.4, glowMat('#ff9a40', 0.5));
  ring(2.62, 2.635, glowMat('#ff9a40', 0.3));
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * PI * 2;
    led(room, CON.x + Math.cos(a) * 2.51, 0.012, CON.z + Math.sin(a) * 2.51, 0.05, 0.3);
  }
  // Console: keys round the screen and a rail on each short side.
  const cg = new THREE.Group();
  cg.position.set(CON.x, CON.top + 0.006, CON.z);
  room.add(cg);
  for (let i = 0; i < 44; i++) {
    const v = rnd();
    led(cg, -1.3 + (2.6 * i) / 43, 0, -CON.d / 2 + 0.08, 0.034, v > 0.7 ? 0.9 : 0.22, v > 0.94 ? C.blackbox : C.ink);
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < 16; i++) led(cg, s * (CON.w / 2 - 0.07), 0, -0.55 + (1.1 * i) / 15, 0.034, rnd() > 0.6 ? 0.9 : 0.22);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 1.3, 8), trim);
    r.rotation.x = PI / 2;
    r.position.set(s * (CON.w / 2 + 0.07), -0.1, 0);
    cg.add(r);
    for (const z of [-0.6, 0.6]) box(cg, 0.1, 0.03, 0.03, trim, s * (CON.w / 2 + 0.03), -0.1, z);
  }
  for (let i = 0; i < 5; i++) panel(room, 0.38, 0.5, plate[0], [CON.x - 0.84 + i * 0.42, 0.42, CON.z + 0.527], [0, 0, 1], [0, 1, 0]);

  /** Sill console and canopy that follow the window's arc. Called whenever the front is rebuilt. */
  function front(group, half) {
    const t0 = PI - half;
    const t1 = PI + half;
    const cone = (rTop, rBot, y, h, mat) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, Math.max(8, Math.round((t1 - t0) / 0.05)), 1, true, t0, t1 - t0), mat);
      m.position.set(0, y, zc);
      group.add(m);
      return m;
    };
    const inner = (mat) => { const m = mat.clone(); m.side = THREE.DoubleSide; return m; };
    cone(R - 0.62, R - 0.62, 0.36, 0.72, inner(metal)); // cabinet front
    cone(R - 0.06, R - 0.64, 0.83, 0.22, inner(metalDark)); // slanted desk
    cone(R - 0.6, R - 0.05, 2.82, 0.32, inner(metalDark)); // canopy above the window
    const n = Math.max(3, Math.round((half * 2) / 0.24));
    for (let i = 0; i < n; i++) {
      const th = t0 + ((t1 - t0) * (i + 0.5)) / n;
      const rx = Math.sin(th);
      const rz = Math.cos(th);
      const at = (r, y) => [rx * r, y, zc + rz * r];
      panel(group, 0.62, 0.3, pickScreen(), at(R - 0.33, 0.845), [-rx * 0.39, 0.92, -rz * 0.39], [rx, 0.4, rz]);
      panel(group, 0.5, 0.2, pickScreen(), at(R - 0.33, 2.805), [-rx * 0.5, -0.86, -rz * 0.5], [rx, -0.5, rz]);
      panel(group, 0.6, 0.46, plate[i % 2], at(R - 0.625, 0.36), [-rx, 0, -rz], [0, 1, 0]);
    }
    for (let i = 0; i < n * 6; i++) {
      const th = t0 + ((t1 - t0) * (i + 0.5)) / (n * 6);
      const v = rnd();
      led(group, Math.sin(th) * (R - 0.59), 0.765, zc + Math.cos(th) * (R - 0.59), 0.03, v > 0.72 ? 0.9 : 0.2, v > 0.95 ? C.blackbox : C.ink);
    }
    leds.count = nLed;
    leds.instanceMatrix.needsUpdate = true;
    if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
  }

  room.updateMatrixWorld(true);
  room.add(leds);
  let fixed = 0;
  return {
    /** Dress the curved wall. Keys added for a previous arc are dropped first. */
    front(group, half) {
      if (!fixed) fixed = nLed;
      nLed = fixed;
      front(group, half);
    },
  };
}
