/**
 * The control room's fixed geometry (DECISIONS A8): deck, walls, the curved front wall with its
 * panoramic window, the central console with its four pads and screen, Black Box docked in the
 * console's end, and the lights. Ported from 1E's prototype (`prototypes/room/main.js`).
 * Everything that glows registers with a dimmer so MAP and SHIP can take the room away.
 */
import {
  AmbientLight,
  BackSide,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { Light, MeshBasicMaterialParameters, Object3D, Scene, Texture } from 'three';
import { colour, hex, roomFinish, roomLights, roomSurface } from '../../theme/index.ts';
import { clamp } from '../gfx.ts';
import { dressRoom } from './dress.ts';
import { CON, HOLO, PADS, ROOM, WINDOW_ARC } from './layout.ts';
import type { Hotspot } from './layout.ts';
import {
  consoleTopTexture,
  deckTexture,
  padTexture,
  panelTexture,
  recorderFaceTexture,
} from './textures.ts';

const PI = Math.PI;
const tint = (c: string): Color => new Color(hex(c));

export interface RoomShell {
  /** Objects the cursor can find; `userData.hot` names what each one opens. */
  readonly hotspots: Object3D[];
  /** Set the room's light level, 0 dark to 1 lit. */
  setLevel(k: number, alarm?: number): void;
  /** Brightness of the console's screen, ring and pads; `hot` is the pad under the cursor. */
  setConsole(screen: number, hot: Hotspot | null): void;
  setConsoleMap(map?: Texture): void;
  /** Black Box's lamp: 0 dim to 1 bright. */
  setRecorderLamp(k: number): void;
  setHologramLight(k: number): void;
  setWindowArc(degrees: number): void;
  dispose(): void;
}

export function buildRoom(scene: Scene): RoomShell {
  const lights: { l: Light; base: number }[] = [];
  const glows: { m: MeshBasicMaterial; base: Color }[] = [];
  const emissives: { m: MeshStandardMaterial; base: number }[] = [];
  const textures: Texture[] = [];
  const addLight = <T extends Light>(l: T): T => {
    lights.push({ l, base: l.intensity });
    scene.add(l);
    return l;
  };
  const glowMat = (
    c: string,
    k = 1,
    extra: MeshBasicMaterialParameters = {},
  ): MeshBasicMaterial => {
    const m = new MeshBasicMaterial({ color: tint(c).multiplyScalar(k), ...extra });
    glows.push({ m, base: m.color.clone() });
    return m;
  };

  const wallTex = panelTexture(true);
  const plainTex = panelTexture(false);
  const floorTex = deckTexture();
  textures.push(wallTex, plainTex, floorTex);
  const std = (
    tex: Texture,
    rx: number,
    ry: number,
    finish: { roughness: number; metalness: number },
    side = undefined as typeof BackSide | typeof DoubleSide | undefined,
  ): MeshStandardMaterial => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    textures.push(t);
    return new MeshStandardMaterial({ map: t, ...finish, ...(side !== undefined ? { side } : {}) });
  };
  const darkMat = new MeshStandardMaterial({ color: hex(roomSurface.metal), ...roomFinish.metal });

  // ---- The room ----------------------------------------------------------------------------
  const room = new Group();
  scene.add(room);
  const { W, back, zc, R, H, sill, head } = ROOM;
  {
    const fs = new Shape();
    fs.moveTo(-W / 2, -back);
    fs.lineTo(W / 2, -back);
    fs.lineTo(W / 2, -zc);
    fs.absarc(0, -zc, R, 0, PI, false);
    fs.lineTo(-W / 2, -back);
    const fg = new ShapeGeometry(fs, 48);
    const floor = new Mesh(fg, std(floorTex, 0.5, 0.5, roomFinish.deck));
    floor.rotation.x = -PI / 2;
    const ceil = new Mesh(fg, std(plainTex, 0.5, 0.5, roomFinish.ceiling, BackSide));
    ceil.rotation.x = -PI / 2;
    ceil.position.y = H;
    room.add(floor, ceil);
    const len = back - zc;
    const wall = (w: number, x: number, z: number, ry: number): void => {
      const m = new Mesh(new PlaneGeometry(w, H), std(wallTex, w / 2, 1, roomFinish.panel));
      m.position.set(x, H / 2, z);
      m.rotation.y = ry;
      room.add(m);
    };
    wall(len, -W / 2, (back + zc) / 2, PI / 2);
    wall(len, W / 2, (back + zc) / 2, -PI / 2);
    wall(W, 0, back, PI);
    // Ceiling ribs and two warm light bars.
    for (const z of [3.5, 2.0, 0.5, -1.0]) {
      const rib = new Mesh(new BoxGeometry(W, 0.14, 0.2), darkMat);
      rib.position.set(0, H - 0.07, z);
      room.add(rib);
    }
    for (const x of [-1.7, 1.7]) {
      const bar = new Mesh(
        new BoxGeometry(0.1, 0.02, 1.5),
        glowMat(roomLights.warm, roomLights.glow.ceilingBar),
      );
      bar.position.set(x, H - 0.15, 2.75);
      room.add(bar);
      const l = new PointLight(
        hex(roomLights.warm),
        roomLights.intensity.ceiling,
        roomLights.distance.ceiling,
        2,
      );
      l.position.set(x, H - 0.35, 2.75);
      addLight(l);
    }
    // Floor-edge guide strips.
    const strip = glowMat(roomLights.strip, roomLights.glow.floorStrip);
    for (const x of [-W / 2 + 0.03, W / 2 - 0.03]) {
      const s = new Mesh(new BoxGeometry(0.025, 0.025, len), strip);
      s.position.set(x, 0.05, (back + zc) / 2);
      room.add(s);
    }
    const fstrip = new Mesh(
      new CylinderGeometry(R - 0.03, R - 0.03, 0.025, 64, 1, true, PI / 2, PI),
      glowMat(roomLights.strip, roomLights.glow.floorStrip, { side: BackSide }),
    );
    fstrip.position.set(0, 0.05, zc);
    room.add(fstrip);
    const dl = new PointLight(
      hex(roomLights.door),
      roomLights.intensity.door,
      roomLights.distance.door,
      2,
    );
    dl.position.set(0, 2.2, back - 0.7);
    addLight(dl);
  }

  const dress = dressRoom({ room, ROOM, CON, glowMat, emissives, addLight });

  // Curved front wall with the panoramic window; rebuilt when the arc changes.
  const glassMat = new MeshBasicMaterial({
    color: hex(roomSurface.glass),
    transparent: true,
    opacity: roomSurface.glassAlpha,
    side: BackSide,
    depthWrite: false,
  });
  const frameMat = new MeshStandardMaterial({
    color: hex(roomSurface.frame),
    ...roomFinish.frame,
    side: DoubleSide,
  });
  const sillGlow = glowMat(roomLights.strip, roomLights.glow.sill, { side: BackSide });
  let front: Group | null = null;
  function buildFront(arcDeg: number): void {
    if (front) {
      room.remove(front);
      front.traverse((o) => (o as Mesh).geometry?.dispose());
    }
    const group = new Group();
    front = group;
    room.add(group);
    const a = MathUtils.degToRad(clamp(arcDeg, 90, 180)) / 2;
    const cyl = (
      y0: number,
      y1: number,
      t0: number,
      t1: number,
      mat: MeshBasicMaterial | MeshStandardMaterial,
      r: number = R,
    ): Mesh => {
      const g = new CylinderGeometry(
        r,
        r,
        y1 - y0,
        Math.max(6, Math.round((t1 - t0) / 0.04)),
        1,
        true,
        t0,
        t1 - t0,
      );
      const m = new Mesh(g, mat);
      m.position.set(0, (y0 + y1) / 2, zc);
      group.add(m);
      return m;
    };
    const cm = (t0: number, t1: number, y0: number, y1: number): MeshStandardMaterial =>
      std(plainTex, ((t1 - t0) * R) / 2, (y1 - y0) / 2, roomFinish.panel, BackSide);
    cyl(0, sill, PI / 2, 1.5 * PI, cm(PI / 2, 1.5 * PI, 0, sill));
    cyl(head, H, PI / 2, 1.5 * PI, cm(PI / 2, 1.5 * PI, head, H));
    if (a < PI / 2 - 0.01) {
      cyl(sill, head, PI / 2, PI - a, cm(PI / 2, PI - a, sill, head));
      cyl(sill, head, PI + a, 1.5 * PI, cm(PI + a, 1.5 * PI, sill, head));
    }
    const glass = cyl(sill, head, PI - a, PI + a, glassMat);
    glass.renderOrder = -10;
    cyl(sill - 0.05, sill + 0.03, PI - a, PI + a, frameMat, R - 0.07);
    cyl(head - 0.03, head + 0.05, PI - a, PI + a, frameMat, R - 0.07);
    const n = Math.round(arcDeg / 15);
    for (let i = 0; i <= n; i++) {
      const th = PI - a + (2 * a * i) / n;
      const m = new Mesh(new BoxGeometry(0.07, head - sill, 0.16), frameMat);
      m.position.set(Math.sin(th) * (R - 0.06), (sill + head) / 2, zc + Math.cos(th) * (R - 0.06));
      m.rotation.y = th;
      group.add(m);
    }
    // A thin warm line under the sill so the window's edge reads in the dark.
    cyl(sill - 0.12, sill - 0.1, PI - a, PI + a, sillGlow, R - 0.02);
    dress.front(group, a);
  }
  buildFront(WINDOW_ARC);

  // ---- The console -------------------------------------------------------------------------
  const con = new Group();
  con.position.set(CON.x, 0, CON.z);
  scene.add(con);
  const hotspots: Object3D[] = [];
  const pads: { id: Hotspot; mat: MeshBasicMaterial }[] = [];
  const hw = CON.w / 2;
  const hd = CON.d / 2;

  const ped = new Mesh(new BoxGeometry(2.2, 0.82, 1.05), darkMat);
  ped.position.y = 0.41;
  con.add(ped);
  hotspots.push(ped);
  const rr = new Shape();
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
  const slab = new Mesh(
    new ExtrudeGeometry(rr, { depth: 0.13, bevelEnabled: false, curveSegments: 10 }),
    new MeshStandardMaterial({ color: hex(roomSurface.slab), ...roomFinish.slab }),
  );
  slab.rotation.x = -PI / 2;
  slab.position.y = CON.top - 0.13;
  con.add(slab);
  hotspots.push(slab);
  // The main console screen, set into the top.
  const topTex = consoleTopTexture();
  textures.push(topTex);
  const screenMat = new MeshBasicMaterial({ map: topTex });
  const screen = new Mesh(new PlaneGeometry(2.72, 1.49), screenMat);
  screen.rotation.x = -PI / 2;
  screen.position.y = CON.top + 0.003;
  screen.userData.hot = 'console' satisfies Hotspot;
  con.add(screen);
  hotspots.push(screen);
  // Projector ring.
  const ringMat = new MeshBasicMaterial({ color: tint(colour.ink) });
  const ring = new Mesh(new TorusGeometry(0.4, 0.011, 8, 72), ringMat);
  ring.rotation.x = PI / 2;
  ring.position.y = CON.top + 0.012;
  con.add(ring);
  // Warm light under the overhang.
  const under = glowMat(roomLights.strip, roomLights.glow.underConsole);
  for (const z of [-0.54, 0.54]) {
    const s = new Mesh(new BoxGeometry(2.1, 0.02, 0.02), under);
    s.position.set(0, 0.8, z);
    con.add(s);
  }
  for (const z of [1.15, -1.15]) {
    const l = new PointLight(
      hex(roomLights.strip),
      roomLights.intensity.underConsole,
      roomLights.distance.underConsole,
      2,
    );
    l.position.set(CON.x, 0.5, CON.z + z);
    addLight(l);
  }
  // Key rail on the side the player arrives from.
  const rail = new Group();
  rail.position.set(0, CON.top + 0.045, hd - 0.2);
  rail.rotation.x = 0.5;
  rail.add(new Mesh(new BoxGeometry(2.56, 0.06, 0.27), darkMat));
  const hitMat = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  PADS.forEach((id, i) => {
    const tex = padTexture(id.toUpperCase());
    textures.push(tex);
    const mat = new MeshBasicMaterial({ map: tex });
    const p = new Mesh(new PlaneGeometry(0.54, 0.19), mat);
    p.rotation.x = -PI / 2;
    p.position.set(-0.93 + i * 0.62, 0.033, 0);
    rail.add(p);
    pads.push({ id, mat });
    const hit = new Mesh(new BoxGeometry(0.58, 0.16, 0.3), hitMat);
    hit.position.copy(p.position);
    hit.position.y += 0.04;
    hit.userData.hot = id;
    rail.add(hit);
    hotspots.push(hit);
  });
  con.add(rail);
  // Black Box: a physical recorder docked in the end of the console.
  const bb = new Group();
  bb.position.set(hw - 0.22, 0.6, 0.1);
  const casing = new Mesh(
    new BoxGeometry(0.3, 0.34, 0.62),
    new MeshStandardMaterial({
      color: hex(roomSurface.recorder),
      ...roomFinish.recorder,
      emissive: hex(roomSurface.recorderEmissive),
    }),
  );
  casing.userData.hot = 'blackbox' satisfies Hotspot;
  bb.add(casing);
  hotspots.push(casing);
  const faceTex = recorderFaceTexture();
  textures.push(faceTex);
  const face = new Mesh(
    new PlaneGeometry(0.56, 0.28),
    new MeshBasicMaterial({ transparent: true, map: faceTex }),
  );
  face.position.x = 0.152;
  face.rotation.y = PI / 2;
  bb.add(face);
  const lampMat = new MeshBasicMaterial({ color: tint(colour.blackbox) });
  const lamp = new Mesh(new SphereGeometry(0.018, 12, 8), lampMat);
  lamp.position.set(0.155, 0.11, -0.24);
  bb.add(lamp);
  const bl = new PointLight(
    hex(colour.blackbox),
    roomLights.intensity.recorder,
    roomLights.distance.recorder,
    2,
  );
  bl.position.set(CON.x + hw + 0.35, 0.7, CON.z + 0.1);
  addLight(bl);
  con.add(bb);

  addLight(new AmbientLight(hex(roomLights.ambient), roomLights.intensity.ambient));
  const winLight = new PointLight(
    hex(roomLights.warm),
    roomLights.intensity.window,
    roomLights.distance.window,
    2,
  );
  winLight.position.set(-2.4, 2.0, -4.0);
  addLight(winLight);
  // The hologram lights the console a little; it is not dimmed with the room.
  const holoLight = new PointLight(
    hex(roomLights.hologram),
    roomLights.intensity.hologram,
    roomLights.distance.hologram,
    2,
  );
  holoLight.position.set(HOLO.x, HOLO.y + 0.2, HOLO.z);
  scene.add(holoLight);

  const ink = tint(colour.ink);
  const orange = tint(colour.blackbox);
  const amberStrip = tint(roomLights.strip);
  return {
    hotspots,
    setLevel(k, alarm = 0) {
      for (const o of lights) o.l.intensity = o.base * k;
      for (const o of glows) o.m.color.copy(o.base).multiplyScalar(k);
      for (const o of emissives) o.m.emissiveIntensity = o.base * k;
      if (alarm > 0) {
        sillGlow.color.lerp(amberStrip, alarm);
        under.color.lerp(amberStrip, alarm);
      }
    },
    setConsole(level, hot) {
      screenMat.color.setScalar(level);
      const trim = clamp(level / roomLights.consoleScreen, 0, 1);
      ringMat.color.copy(ink).multiplyScalar(roomLights.projectorRing * trim);
      for (const p of pads)
        p.mat.color.setScalar((p.id === hot ? roomLights.pad.hot : roomLights.pad.idle) * trim);
    },
    setRecorderLamp(k) {
      lampMat.color.copy(orange).multiplyScalar(k);
    },
    setConsoleMap(map) {
      screenMat.map = map ?? topTex;
    },
    setHologramLight(k) {
      holoLight.intensity = roomLights.intensity.hologram * k;
    },
    setWindowArc: buildFront,
    dispose() {
      for (const t of textures) t.dispose();
      scene.traverse((o) => {
        const mesh = o as Mesh;
        mesh.geometry?.dispose();
      });
    },
  };
}
