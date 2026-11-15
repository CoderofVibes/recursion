/**
 * The control room (DECISIONS A8): a walkable first-person compartment with a central console
 * and a panoramic window. From the console the player opens four views: MAP and SHIP as
 * holograms above it with the room hidden, CONSOLE as the screen they look down into, and FLIGHT
 * as a hologram above the console with the window behind it. A loss shakes, cuts to black, and
 * puts the player back at the door (A9).
 *
 * This class owns the scene, the camera, walking, the white-dot cursor and the view changes.
 * It draws what it is given each frame and reports what the player did; it holds no game state
 * and never reaches the game. Ported from 1E's prototype (`prototypes/room/main.js`).
 */
import {
  BackSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import type { Object3D } from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { ShipDefinition } from '../../contracts/index.ts';
import {
  colour,
  hex,
  holoWire,
  hudMotion,
  lossSequence,
  roomBloom,
  roomMotion,
  roomSurface,
} from '../../theme/index.ts';
import { pixelsPerUnit } from '../../theme/three/index.ts';
import { makeFlightHolo, RANGE_DEFAULT } from '../flight/FlightHolo.ts';
import type { FlightFrame, FlightHolo } from '../flight/FlightHolo.ts';
import { clamp, ease, thin } from '../gfx.ts';
import { makeMapHolo } from '../map/MapHolo.ts';
import type { Chart, MapHolo } from '../map/MapHolo.ts';
import type { RoomShot } from '../opening/shot.ts';
import { makeShipHolo } from '../ship/ShipHolo.ts';
import type { ShipHolo } from '../ship/ShipHolo.ts';
import { CON, DOOR, HOLO, REACH, ROOM, VIEW } from './layout.ts';
import type { Hotspot, ViewMode } from './layout.ts';
import { buildOutside } from './outside.ts';
import type { Outside } from './outside.ts';
import { buildRoom } from './shell.ts';

export type LossStage = 'start' | 'black' | 'pip' | 'reset' | 'fade' | 'end';

/** What the room tells its host. */
export interface RoomEvents {
  /** The view changed. `region` is the map's local view of the environment. */
  mode(mode: ViewMode, region: boolean): void;
  /** What the cursor has found on the console, if anything. */
  hot(hot: Hotspot | null): void;
  pointerLock(locked: boolean): void;
  /** The camera has arrived over the console: show its screen. */
  consoleArrived(): void;
  /** The loss sequence reached a stage; at `reset` the next attempt should begin. */
  loss(stage: LossStage): void;
  /** The player clicked in the flight hologram: an object, or nothing. */
  flightPick(id: string | null): void;
  /** Black Box's recorder was opened from the room. */
  blackBox(): void;
}

/** Seconds after the console view arrives before its screen is fully up and opaque. */
const SCREEN_SETTLED = hudMotion.screenIn / 1000 + 0.25;

/** What the room draws this frame. */
export interface RoomFrame extends FlightFrame {
  readonly chart: Chart;
  /** Black Box is recording: its lamp breathes. */
  readonly recording: boolean;
}

export class RoomView {
  readonly flight: FlightHolo;
  readonly ship: ShipHolo;
  readonly map: MapHolo;
  /** Keys held down, lower case. The host reads the flight controls from here. */
  readonly keys = new Set<string>();

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(VIEW.room.fov, 1, 0.06, 9000);
  private readonly composer: EffectComposer;
  private readonly labels: CSS2DRenderer;
  private readonly shell;
  private readonly outside;
  private readonly veil: Mesh<SphereGeometry, MeshBasicMaterial>;
  private readonly holoRoot = new Group();
  private readonly holoTilt = new Group();
  private readonly cone;
  private readonly player = {
    x: DOOR.x as number,
    z: DOOR.z as number,
    yaw: DOOR.yaw as number,
    pitch: DOOR.pitch as number,
  };
  private current: ViewMode = 'room';
  private inRegion = false;
  private trans: {
    t: number;
    from: { pos: Vector3; quat: Quaternion };
    to: { pos: Vector3; quat: Quaternion };
  } | null = null;
  private tilt = 0;
  private tiltUser = 0;
  /** How each hologram was framed at first, for resetFraming(). */
  private readonly framingAtRest: {
    readonly range: number;
    readonly map: Quaternion;
    readonly ship: Quaternion;
  };
  private readonly cur = {
    level: VIEW.room.level,
    veil: VIEW.room.veil,
    screen: VIEW.room.screen,
    holo: VIEW.room.holo,
    lift: VIEW.room.lift,
    fov: VIEW.room.fov,
  };
  private death: { t: number; shake: boolean; stage: LossStage } | null = null;
  private readonly mouse = new Vector2();
  private readonly ray = new Raycaster();
  private drag: { x: number; y: number; moved: boolean } | null = null;
  private hot: Hotspot | null = null;
  private time = 0;
  private width = 0;
  private height = 0;
  /** The canvas's size as last observed; read here, never from layout during a frame (S15). */
  private observed = { w: 0, h: 0 };
  /** Real seconds the console view has been settled (arrived, its screen fully up). */
  private consoleFor = 0;
  /** The chart the map was last given: rebuilt only when the loop hands over a new one. */
  private lastChart: RoomFrame['chart'] | null = null;
  private readonly cleanup: (() => void)[] = [];
  private readonly canvas: HTMLCanvasElement;
  private readonly events: RoomEvents;

  constructor(
    canvas: HTMLCanvasElement,
    labels: HTMLElement,
    definition: ShipDefinition,
    events: RoomEvents,
    options?: { readonly scripted?: boolean },
  ) {
    this.canvas = canvas;
    this.events = events;
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(hex(roomSurface.void));
    this.camera.rotation.order = 'YXZ';
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new UnrealBloomPass(
        new Vector2(1, 1),
        roomBloom.strength,
        roomBloom.radius,
        roomBloom.threshold,
      ),
    );
    this.composer.addPass(new OutputPass());
    this.labels = new CSS2DRenderer({ element: labels });

    this.shell = buildRoom(this.scene);
    this.outside = buildOutside(this.scene);

    // Holograms: a veil that hides the room behind MAP and SHIP, the projector's cone of light,
    // and the three projections on one tilting root above the console.
    this.veil = new Mesh(
      new SphereGeometry(3.3, 40, 20),
      new MeshBasicMaterial({
        color: hex(roomSurface.void),
        transparent: true,
        opacity: 0,
        side: BackSide,
        depthWrite: false,
      }),
    );
    this.veil.position.set(HOLO.x, HOLO.y, HOLO.z);
    this.veil.renderOrder = -5;
    this.scene.add(this.veil);
    this.holoRoot.position.set(HOLO.x, HOLO.y, HOLO.z);
    this.scene.add(this.holoRoot);
    this.holoRoot.add(this.holoTilt);
    {
      const seg: number[] = [];
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * 2 * Math.PI;
        seg.push(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4, Math.sin(a) * 1.1, 1, Math.cos(a) * 1.1);
      }
      this.cone = thin(seg, colour.ink, holoWire.projector);
      this.cone.position.set(HOLO.x, CON.top + 0.02, HOLO.z);
      this.scene.add(this.cone);
    }
    this.flight = makeFlightHolo(definition);
    this.ship = makeShipHolo(definition);
    this.map = makeMapHolo();
    this.holoTilt.add(this.flight.group, this.map.group, this.ship.group);
    this.framingAtRest = {
      range: this.flight.range(),
      map: this.map.spin.quaternion.clone(),
      ship: this.ship.spin.quaternion.clone(),
    };

    if (!options?.scripted) this.bind();
    // The canvas's size, from an observer: reading clientWidth every frame forced a layout of
    // the whole page (the console included) inside the frame (S15).
    this.observed = { w: canvas.clientWidth, h: canvas.clientHeight };
    if (typeof ResizeObserver !== 'undefined') {
      const watch = new ResizeObserver((entries) => {
        const box = entries[0]?.contentRect;
        if (box) this.observed = { w: Math.round(box.width), h: Math.round(box.height) };
      });
      watch.observe(canvas);
      this.cleanup.push(() => watch.disconnect());
    }
    this.resize();
    const pose = this.poseOf('room');
    this.camera.position.copy(pose.pos);
    this.camera.quaternion.copy(pose.quat);
    this.syncVisibility();
  }

  /** Replace the snapshot-driven window objects with a caller-owned set piece. */
  setWindowScenery(scenery: Object3D | null): void {
    this.outside.setScenery(scenery);
  }

  /** Draw one scripted frame without advancing the room clock, walking or updating a hologram. */
  renderScriptedShot(shot: RoomShot): void {
    this.resize();
    if (this.width === 0 || this.height === 0) return;
    const { camera } = this;
    camera.position.set(...shot.position);
    camera.rotation.set(...shot.rotation, 'YXZ');
    this.shell.setLevel(shot.light, shot.alarm);
    this.shell.setConsole(shot.console, null);
    this.shell.setConsoleMap(shot.consoleMap);
    this.shell.setHologramLight(0);
    const hadHologram = this.holoRoot.visible;
    const hadCone = this.cone.visible;
    this.holoRoot.visible = false;
    this.cone.visible = false;
    this.composer.render();
    this.shell.setConsoleMap();
    this.holoRoot.visible = hadHologram;
    this.cone.visible = hadCone;
  }

  mode(): ViewMode {
    return this.current;
  }
  region(): boolean {
    return this.inRegion;
  }
  dying(): boolean {
    return this.death !== null;
  }
  /** What the window's funnel sky drew last frame (for checks of its cost and culling). */
  outsideStats(): ReturnType<Outside['funnels']> {
    return this.outside.funnels();
  }
  /** No camera travel or loss sequence under way: the view is still (A20 may thin its frames). */
  settled(): boolean {
    return this.trans === null && this.death === null;
  }
  locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Change view. The camera travels; the room dims or hides as the view asks. */
  go(mode: ViewMode, instant = false): void {
    if (this.death || mode === this.current) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const from = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone() };
    if (this.current === 'map') this.applyRegion(false);
    this.current = mode;
    this.tiltUser = 0;
    if (mode === 'room' || mode === 'flight') this.flight.setChart(false);
    this.syncVisibility();
    this.trans = { t: instant ? 1 : 0, from, to: this.poseOf(mode) };
    this.events.mode(mode, this.inRegion);
  }

  // ---- Framing (S9 R13): the wheel, the drag, keys and buttons all come here -------------------
  // Framing moves the camera on a hologram only: it never senses, points or fires anything.

  /** Range of the view's hologram: a factor above 1 zooms out, below 1 zooms in. */
  frameZoom(factor: number): void {
    const mode = this.current;
    if (mode === 'flight' || (mode === 'map' && this.inRegion))
      this.flight.setRange(this.flight.range() * factor);
    else if (mode === 'map')
      this.map.spin.scale.setScalar(clamp(this.map.spin.scale.x / factor, 0.7, 2.4));
    else if (mode === 'ship')
      this.ship.group.scale.setScalar(clamp(this.ship.group.scale.x / factor, 0.6, 2.6));
  }
  /** Turn MAP or SHIP about the vertical, radians. */
  frameOrbit(radians: number): void {
    if (this.current === 'ship') this.ship.spin.rotateY(radians);
    else if (this.current === 'map' && !this.inRegion) this.map.spin.rotateY(radians);
  }
  /** Tilt the hologram toward or away from the player, radians. */
  frameTilt(radians: number): void {
    const mode = this.current;
    if (mode === 'flight') this.tiltUser = clamp(this.tiltUser + radians, -0.3, 0.6);
    else if (mode === 'map' || mode === 'ship')
      this.tiltUser = clamp(this.tiltUser + radians, -0.25, 0.8);
  }
  /** Back to how the view first framed its hologram. */
  resetFraming(): void {
    this.tiltUser = 0;
    const mode = this.current;
    if (mode === 'flight' || (mode === 'map' && this.inRegion))
      this.flight.setRange(this.framingAtRest.range);
    else if (mode === 'map') {
      this.map.spin.quaternion.copy(this.framingAtRest.map);
      this.map.spin.scale.setScalar(1);
    } else if (mode === 'ship') {
      this.ship.spin.quaternion.copy(this.framingAtRest.ship);
      this.ship.group.scale.setScalar(1);
    }
  }

  /** Step back one level: out of an isolated system, out of a region, out of a view. */
  back(): void {
    if (this.current === 'ship' && this.ship.system()) this.ship.setSystem(null);
    else if (this.current === 'map' && this.inRegion) this.setRegion(false);
    else if (this.current !== 'room') this.go('room');
  }

  /** The map's local view: the environment itself, chart-up and zoomed out. */
  setRegion(on: boolean): void {
    this.applyRegion(on);
    this.syncVisibility();
    this.events.mode(this.current, this.inRegion);
  }

  /**
   * Begin the end of an attempt: with `shake`, the loss of the ship; without, a quiet cut to
   * black for a voluntary Recall. Either way the player ends up back at the door.
   */
  lose(shake = true): void {
    if (this.death) return;
    this.death = { t: shake ? 0 : lossSequence.shakeEnd, shake, stage: 'start' };
    if (document.pointerLockElement) document.exitPointerLock();
    this.events.loss('start');
  }

  frame(dt: number, data: RoomFrame, cameraOverride?: Pick<RoomShot, 'position' | 'rotation'>): void {
    this.time += dt;
    this.resize();
    if (this.width === 0 || this.height === 0) return;
    const { camera, cur } = this;
    const mode = this.current;

    // Settled at the console: its opaque screen covers the whole view, so nothing behind it is
    // drawn (S15). The game, the recorder and alerts run on in the loop regardless; any
    // transition, a loss, or a view change brings the room back on its first frame.
    this.consoleFor = mode === 'console' && !this.trans && !this.death ? this.consoleFor + dt : 0;
    if (this.consoleFor > SCREEN_SETTLED) return;

    this.outside.update(data.snapshot);
    if (data.chart !== this.lastChart) {
      this.lastChart = data.chart;
      this.map.setChart(data.chart);
    }
    // The drawing follows the ship as it reports itself: wings out when they are out.
    this.ship.setConfig(data.snapshot.world.ship.configuration);

    // Walking.
    if (mode === 'room' && !this.trans && !this.death) {
      const k = this.keys;
      const f =
        (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
      const s = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      const turn = (k.has('arrowleft') ? 1 : 0) - (k.has('arrowright') ? 1 : 0);
      const p = this.player;
      p.yaw += turn * roomMotion.turn * dt;
      if (f || s) {
        const n = roomMotion.walk / Math.hypot(f, s);
        p.x += (-Math.sin(p.yaw) * f + Math.cos(p.yaw) * s) * n * dt;
        p.z += (-Math.cos(p.yaw) * f - Math.sin(p.yaw) * s) * n * dt;
        this.constrain(p);
      }
    }

    // Camera.
    if (cameraOverride) {
      camera.position.set(...cameraOverride.position);
      camera.rotation.set(...cameraOverride.rotation, 'YXZ');
    } else if (this.trans) {
      const tr = this.trans;
      tr.t = Math.min(1, tr.t + dt / roomMotion.travel);
      const e = ease(tr.t);
      camera.position.lerpVectors(tr.from.pos, tr.to.pos, e);
      camera.quaternion.slerpQuaternions(tr.from.quat, tr.to.quat, e);
      if (tr.t >= 1) {
        this.trans = null;
        if (mode === 'console') this.events.consoleArrived();
      }
    } else {
      const pose = this.poseOf(mode);
      camera.position.copy(pose.pos);
      camera.quaternion.copy(pose.quat);
    }

    // Room level, veil, console brightness and hologram tilt ease toward the view's values.
    const v = VIEW[mode];
    const k = 1 - Math.exp(-dt * roomMotion.ease);
    cur.level += (v.level - cur.level) * k;
    cur.veil += (v.veil - cur.veil) * k;
    cur.screen += (v.screen - cur.screen) * k;
    cur.holo += (v.holo - cur.holo) * k;
    cur.lift += (v.lift - cur.lift) * k;
    cur.fov += (v.fov - cur.fov) * k;
    this.tilt += (v.tilt + this.tiltUser - this.tilt) * k;
    this.shell.setLevel(cur.level);
    this.veil.material.opacity = cur.veil;
    this.veil.visible = cur.veil > 0.01;
    this.shell.setConsole(cur.screen, this.hot);
    this.holoRoot.position.y = HOLO.y + cur.lift;
    this.cone.scale.y = this.holoRoot.position.y - this.cone.position.y;
    this.cone.visible = cur.veil < 0.5 && cur.holo > 0.4;
    if (Math.abs(camera.fov - cur.fov) > 0.01) {
      camera.fov = cur.fov;
      camera.updateProjectionMatrix();
    }
    this.holoTilt.rotation.x = this.tilt;
    this.holoRoot.visible = cur.holo > 0.05;
    // In a focus view nothing of the room is lit by the hologram.
    this.shell.setHologramLight(cur.holo * (1 - cur.veil));
    this.shell.setRecorderLamp(
      data.recording ? 0.55 + 0.45 * Math.sin(this.time * 2.6) ** 2 : 0.45,
    );

    // The cursor: what it has found on the console.
    let found: Hotspot | null = null;
    if (mode === 'room' && !this.trans && !this.death) {
      this.ray.setFromCamera(this.locked() ? new Vector2(0, 0) : this.mouse, camera);
      const hit = this.ray.intersectObjects(this.shell.hotspots, false)[0];
      if (hit && hit.distance < REACH)
        found = (hit.object.userData.hot as Hotspot | undefined) ?? null;
    }
    if (found !== this.hot) {
      this.hot = found;
      this.canvas.style.cursor = found ? 'pointer' : '';
      this.events.hot(found);
    }
    if (!this.drag) {
      if (mode === 'map' && !this.inRegion) {
        this.ray.setFromCamera(this.mouse, camera);
        this.map.hover(this.map.pick(this.ray));
      } else if (mode === 'ship') {
        this.ray.setFromCamera(this.mouse, camera);
        this.ship.hover(this.ship.pick(this.ray));
      }
    }

    // Holograms. Dashes keep their rhythm in screen pixels at the hologram's distance.
    const px = pixelsPerUnit(
      camera.fov,
      camera.position.distanceTo(this.holoRoot.position),
      this.height,
    );
    this.flight.setPixelsPerUnit(px);
    this.ship.setPixelsPerUnit(px * this.ship.group.scale.x);
    this.map.setPixelsPerUnit(px);
    if (this.flight.group.visible) this.flight.update(data, dt, this.time);
    if (this.map.group.visible) this.map.update(dt, this.time);
    if (this.ship.group.visible) this.ship.update(dt);

    if (this.death) this.stepDeath(dt);

    this.composer.render();
    this.labels.render(this.scene, camera);
  }

  dispose(): void {
    for (const off of this.cleanup) off();
    this.flight.dispose();
    this.ship.dispose();
    this.map.dispose();
    this.outside.dispose();
    this.shell.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  // ---- Internals -----------------------------------------------------------------------------

  private applyRegion(on: boolean): void {
    this.inRegion = on;
    this.flight.setChart(on);
    if (!on) this.flight.setRange(Math.min(this.flight.range(), RANGE_DEFAULT));
  }

  private syncVisibility(): void {
    const m = this.current;
    this.flight.group.visible = m === 'room' || m === 'flight' || (m === 'map' && this.inRegion);
    this.map.group.visible = m === 'map' && !this.inRegion;
    this.ship.group.visible = m === 'ship';
  }

  private poseOf(mode: ViewMode): { pos: Vector3; quat: Quaternion } {
    const v = VIEW[mode];
    if (!v.pos || !v.look) {
      const p = this.player;
      return {
        pos: new Vector3(p.x, ROOM.eye, p.z),
        quat: new Quaternion().setFromEuler(new Euler(p.pitch, p.yaw, 0, 'YXZ')),
      };
    }
    const pos = new Vector3(...v.pos);
    const m = new Matrix4().lookAt(
      pos,
      new Vector3(...v.look),
      new Vector3(...(v.up ?? [0, 1, 0])),
    );
    return { pos, quat: new Quaternion().setFromRotationMatrix(m) };
  }

  /** Keep the player inside the walls, off the wall stations and seats, and out of the console. */
  private constrain(p: { x: number; z: number }): void {
    const m = 0.38;
    const { W, back: bk, zc, R } = ROOM;
    p.x = clamp(p.x, -W / 2 + m, W / 2 - m);
    p.z = Math.min(p.z, bk - m);
    if (p.z < zc) {
      const dz = p.z - zc;
      const d = Math.hypot(p.x, dz);
      if (d > R - m) {
        p.x = (p.x / d) * (R - m);
        p.z = zc + (dz / d) * (R - m);
      }
    }
    if (p.z > -0.8 && p.z < 3.9) p.x = clamp(p.x, -W / 2 + 0.75 + m, W / 2 - 0.75 - m);
    p.z = Math.min(p.z, bk - 0.45 - m);
    if (p.z < zc) {
      const dz = p.z - zc;
      const d = Math.hypot(p.x, dz);
      if (d > R - 0.66 - m) {
        p.x = (p.x / d) * (R - 0.66 - m);
        p.z = zc + (dz / d) * (R - 0.66 - m);
      }
    }
    for (const sx of [-2.92, 2.92])
      for (const sz of [0.45, 2.65]) {
        const d = Math.hypot(p.x - sx, p.z - sz);
        if (d < 0.5 + m * 0.6 && d > 1e-4) {
          p.x = sx + ((p.x - sx) / d) * (0.5 + m * 0.6);
          p.z = sz + ((p.z - sz) / d) * (0.5 + m * 0.6);
        }
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

  private activate(id: Hotspot): void {
    if (id === 'blackbox') {
      this.events.blackBox();
      this.go('console');
    } else this.go(id);
  }

  private stepDeath(dt: number): void {
    const d = this.death;
    if (!d) return;
    d.t += dt;
    const t = d.t;
    const L = lossSequence;
    const stage = (s: LossStage): void => {
      if (d.stage === s) return;
      d.stage = s;
      this.events.loss(s);
    };
    if (t < L.shakeEnd) {
      // Shake up and down, lights and hologram flickering out.
      const k = 1 - t / (L.shakeEnd * 1.27);
      this.camera.position.y += Math.sin(t * 41) * L.shake * k + Math.sin(t * 17) * L.shake * 0.4;
      this.camera.rotateZ(Math.sin(t * 29 + 1) * L.roll * k);
      this.shell.setLevel(
        this.cur.level *
          (Math.sin(t * 53) > -0.2 ? 0.35 + 0.65 * Math.abs(Math.sin(t * 23)) : 0.05),
      );
      this.holoRoot.visible = Math.sin(t * 61) > -0.3 && t < L.hologramEnd;
      return;
    }
    if (t < L.pipAt) stage('black');
    else if (t < L.resetAt) stage('pip');
    else if (t < L.fadeAt) {
      if (d.stage !== 'reset') {
        // Back at the door, in the room, with everything as it was on arrival.
        Object.assign(this.player, { x: DOOR.x, z: DOOR.z, yaw: DOOR.yaw, pitch: DOOR.pitch });
        this.applyRegion(false);
        this.current = 'room';
        this.trans = null;
        this.tiltUser = 0;
        this.flight.setChart(false);
        this.holoRoot.visible = true;
        this.syncVisibility();
        this.events.mode('room', false);
      }
      stage('reset');
    } else if (t < L.end) stage('fade');
    else {
      stage('end');
      this.death = null;
    }
  }

  private resize(): void {
    const { w, h } = this.observed;
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.labels.setSize(w, h);
    this.flight.setResolution(w, h);
    this.ship.setResolution(w, h);
    this.map.setResolution(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private bind(): void {
    const { canvas } = this;
    const on = <K extends keyof WindowEventMap>(
      target: Window | HTMLElement | Document,
      type: K | string,
      handler: (e: never) => void,
      options?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, handler as EventListener, options);
      this.cleanup.push(() => target.removeEventListener(type, handler as EventListener, options));
    };
    const typing = (e: Event): boolean => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'SELECT' ||
        tag === 'TEXTAREA' ||
        target?.isContentEditable === true
      );
    };
    // A focused control keeps the keys that work it: Space and Enter press it, arrows, Home and
    // End move within it (S9 R10). Every other key still reaches the scene, so a click on a
    // warp step does not stop the flight keys.
    const controlKey = (e: KeyboardEvent, k: string): boolean =>
      (k === ' ' || k === 'enter' || k === 'home' || k === 'end' || k.startsWith('arrow')) &&
      (e.target as HTMLElement | null)?.closest?.(
        'button, a[href], summary, [role="radio"], [role="tab"], [role="switch"], [tabindex]:not(canvas)',
      ) != null;
    const point = (e: MouseEvent): void => {
      const r = canvas.getBoundingClientRect();
      this.mouse.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      );
    };

    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        // Editing a field: the first Escape leaves the field, the next steps back.
        if (typing(e)) (e.target as HTMLElement).blur();
        else this.back();
        return;
      }
      if (typing(e) || controlKey(e, k)) return;
      this.keys.add(k);
      if (this.current === 'flight' && (k.startsWith('arrow') || k === ' ')) e.preventDefault();
      if (k === 'backspace') this.back();
      // The console's screen keeps its keys to itself.
      if (this.current === 'console') return;
      if (k === '1') this.go('map');
      if (k === '2') this.go('ship');
      if (k === '3') this.go('console');
      if (k === '4') this.go('flight');
      if (k === '0') this.go('room');
      if (k === 'u' && this.current === 'flight')
        this.flight.setHeadingUp(!this.flight.headingUp());
      // Framing by key (S9 R13), clear of the flight keys: - = zoom, , . orbit, [ ] tilt, / reset.
      if (k === '-' || k === '_') this.frameZoom(roomMotion.frameZoom);
      if (k === '=' || k === '+') this.frameZoom(1 / roomMotion.frameZoom);
      if (k === ',') this.frameOrbit(-roomMotion.frameOrbit);
      if (k === '.') this.frameOrbit(roomMotion.frameOrbit);
      if (k === '[') this.frameTilt(-roomMotion.frameTilt);
      if (k === ']') this.frameTilt(roomMotion.frameTilt);
      if (k === '/') this.resetFraming();
      if ((k === 'f' || k === 'enter') && this.current === 'room' && this.hot)
        this.activate(this.hot);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase()));
    on(window, 'blur', () => this.keys.clear());
    on(document, 'pointerlockchange', () => this.events.pointerLock(this.locked()));

    on(canvas, 'mousedown', (e: MouseEvent) => {
      this.drag = { x: e.clientX, y: e.clientY, moved: false };
      if (!this.locked()) point(e);
    });
    on(window, 'mouseup', (e: MouseEvent) => {
      const drag = this.drag;
      if (!drag) return;
      this.drag = null;
      if (drag.moved || e.target !== canvas || this.trans || this.death) return;
      const mode = this.current;
      if (mode === 'room') {
        if (this.hot) this.activate(this.hot);
        else if (!this.locked()) void canvas.requestPointerLock?.();
      } else if (mode === 'map' && !this.inRegion) {
        this.ray.setFromCamera(this.mouse, this.camera);
        this.map.select(this.map.pick(this.ray));
      } else if (mode === 'ship') {
        this.ray.setFromCamera(this.mouse, this.camera);
        this.ship.select(this.ship.pick(this.ray));
      } else if (mode === 'flight') {
        this.events.flightPick(
          this.flight.pick(this.mouse.x, this.mouse.y, this.camera, this.height),
        );
      }
    });
    on(window, 'mousemove', (e: MouseEvent) => {
      const p = this.player;
      if (this.locked()) {
        p.yaw -= e.movementX * roomMotion.look;
        p.pitch = clamp(p.pitch - e.movementY * roomMotion.look, -1.25, 1.25);
        return;
      }
      point(e);
      const drag = this.drag;
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
      if (!drag.moved) return;
      const mode = this.current;
      if (mode === 'room') {
        p.yaw += e.movementX * roomMotion.dragLook;
        p.pitch = clamp(p.pitch + e.movementY * roomMotion.dragLook, -1.25, 1.25);
      } else if (mode === 'map' || mode === 'ship' || mode === 'flight') {
        this.frameOrbit(e.movementX * 0.006);
        this.frameTilt(e.movementY * roomMotion.dragLook);
      }
    });
    on(
      canvas,
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        this.frameZoom(Math.exp(e.deltaY * 0.0012));
      },
      { passive: false },
    );
  }
}
