/**
 * What is outside the window: the unaided eye's view (DECISIONS A8, P11). The window shows what
 * light shows, bodies and sunlit rocks against the stars; it never shows anything that needs a
 * sensor, and nothing here is a hologram. The room is the ship, so the outside turns as the ship
 * turns and the ship's nose is always toward the window.
 *
 * Drawn from the game's window channel (ViewSnapshot.window, 2G): what light shows, with the
 * sun where it is and bodies in shadow dark. Without it (stand-ins, old fixtures) it falls back
 * to the believed world and a display sun.
 */
import {
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Camera, Object3D, Scene, ShaderMaterial, WebGLRenderer } from 'three';
import type { ViewSnapshot, WindowView } from '../../contracts/index.ts';
import { render } from '../../theme/index.ts';
import { setSun } from '../../theme/three/index.ts';
import { airlessMaterial } from '../fx/airless.ts';
import { attitudeToScene, toScene, type WindowField } from '../adapter.ts';
import { windowViewFor } from '../windowViews.ts';
import { FUNNEL_KIND, makeFunnelLight } from '../fx/funnels.ts';
import { createCloudLight } from '../fx/clouds.ts';
import { cloudBanks, opticalFields } from '../fx/window-light.ts';
import type { FunnelSkyStats } from './funnelSky.ts';
import type { WindowView as EyeView } from '../windowViews.ts';
import { createDeepSky } from '../sky/index.ts';
import { HORIZON_Y } from './layout.ts';

const MAX_ROCKS = 512;
/** Scene metres: nothing outside is drawn nearer than this, or farther than NEAR + SPAN. */
const NEAR = 30;
const SPAN = 5000;
/** Distance (game metres) at which an object sits half way out. */
const HALF = 2_000_000;
/** Scene metres: the shell a phenomenon with no known range is drawn on, between the bodies and the stars. */
const SHELL = NEAR + SPAN * 0.6;

/**
 * Distances outside span metres to thousands of kilometres. Each object is drawn along its true
 * direction at a compressed distance, scaled to keep its true angular size, and the compression
 * is monotonic so nearer things still cover farther ones.
 */
const compress = (d: number): number => NEAR + (SPAN * d) / (d + HALF);

export interface Outside {
  update(snapshot: ViewSnapshot): void;
  setScenery(scenery: Object3D | null): void;
  followEye(camera: Camera, renderer: WebGLRenderer): void;
  /** What the funnel sky drew last frame (offered, culled, thinned, drawn, segments). */
  funnels(): FunnelSkyStats;
  dispose(): void;
}

export function buildOutside(scene: Scene): Outside {
  const rot = new Group();
  rot.position.set(0, HORIZON_Y, 0);
  scene.add(rot);
  const world = new Group();
  rot.add(world);
  let scenery: Object3D | null = null;

  const sunEnv = new Vector3(...render.keyLight).normalize();
  const sunWorld = new Vector3();
  const materials: ShaderMaterial[] = [];

  // Bodies: one sphere per believed body, the secondary a little cooler than the primary.
  const sphere = new SphereGeometry(1, 64, 40);
  const bodies = new Map<string, Mesh>();
  const bodyMesh = (id: string, index: number): Mesh => {
    let m = bodies.get(id);
    if (!m) {
      const mat = airlessMaterial(false, index > 0);
      materials.push(mat);
      m = new Mesh(sphere, mat);
      m.name = `window-body:${id}`;
      m.rotation.z = 0.3;
      world.add(m);
      bodies.set(id, m);
    }
    return m;
  };

  // Rocks: irregular lumps, flat-shaded by the sun.
  const rockGeo = new IcosahedronGeometry(1, 1);
  {
    const p = rockGeo.attributes.position!;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const k =
        0.74 + 0.26 * Math.abs((Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    rockGeo.computeVertexNormals();
  }
  const rockMat = airlessMaterial(true);
  materials.push(rockMat);
  const rocks = new InstancedMesh(rockGeo, rockMat, MAX_ROCKS);
  rocks.frustumCulled = false;
  rocks.count = 0;
  world.add(rocks);

  const deepSky = createDeepSky();
  rot.add(deepSky.object);

  const q = new Quaternion();
  const d = new Vector3();
  const m4 = new Matrix4();
  const scale = new Vector3();
  const spin = new Quaternion();
  const axis = new Vector3(0.3, 1, 0.2).normalize();

  /** Place `object` along the true direction from the ship at its compressed distance. */
  const place = (
    from: { x: number; y: number; z?: number },
    to: { x: number; y: number; z?: number },
    radius: number,
    out: Vector3,
  ): number => {
    toScene({ x: to.x - from.x, y: to.y - from.y, z: (to.z ?? 0) - (from.z ?? 0) }, out);
    const dist = Math.max(out.length(), 1);
    const drawn = compress(dist);
    out.multiplyScalar(drawn / dist);
    return (radius * drawn) / dist;
  };

  /** Lit or unlit: an unlit body is a dark disc against the stars, with no rim of light. */
  const setLit = (mesh: Mesh, lit: boolean): void => {
    const u = (mesh.material as ShaderMaterial).uniforms;
    if (mesh.userData.lit === lit) return;
    mesh.userData.lit = lit;
    u.uLit!.value = lit ? 1 : 0;
  };

  /**
   * The eye's view from the game (`ViewSnapshot.window`): directions and apparent sizes only,
   * never a range. Each object is drawn along its direction at a distance that orders it by
   * apparent size (rocks in front of bodies), scaled to keep its true angular size.
   */
  const fromWindow = (view: WindowView): void => {
    let bodyIndex = 0;
    const seen = new Set<string>();
    let n = 0;
    for (const o of view.objects) {
      toScene(o.direction, d).normalize();
      const a = Math.max(o.angularRadius, 0);
      if (o.kind === 'body') {
        const mesh = bodyMesh(o.id, bodyIndex++);
        seen.add(o.id);
        mesh.visible = true;
        const drawn = NEAR + SPAN * (0.45 + 0.55 / (1 + a * 20));
        mesh.position.copy(d).multiplyScalar(drawn);
        // A sphere subtends asin(radius / centre-distance), unlike a flat sprite.
        mesh.scale.setScalar(drawn * Math.sin(Math.min(a, Math.PI / 2)));
        setLit(mesh, o.lit);
      } else if (o.lit && n < MAX_ROCKS) {
        // An unlit rock is not seen at all.
        const drawn = NEAR + SPAN * (0.1 + 0.3 / (1 + a * 2000));
        const r = drawn * Math.sin(Math.min(a, Math.PI / 2));
        let h = 0;
        for (let k = 0; k < o.id.length; k++) h = (h * 31 + o.id.charCodeAt(k)) % 6283;
        spin.setFromAxisAngle(axis, h / 1000);
        m4.compose(d.multiplyScalar(drawn), spin, scale.set(r, r * 0.8, r));
        rocks.setMatrixAt(n++, m4);
      }
    }
    for (const [id, mesh] of bodies) if (!seen.has(id)) mesh.visible = false;
    rocks.count = n;
    rocks.instanceMatrix.needsUpdate = true;
  };

  // Phenomena the eye can see (A19: the wells' funnels), each drawn by its section's window
  // view (windowViews.ts) from the window channel's light-only data.
  const phenomena = new Map<string, { kind: string; group: Group; view: EyeView }>();
  // The wells' funnels, all of them in one draw (funnelSky.ts).
  const sky = makeFunnelLight({ displayRadius: SHELL });
  rot.add(sky.object);
  const clouds = createCloudLight(SHELL);
  rot.add(clouds.object);
  let funnelStats: FunnelSkyStats = { offered: 0, culled: 0, thinned: 0, drawn: 0, segments: 0 };
  const drawPhenomena = (fields: readonly WindowField[], t: number): void => {
    const visible = new Set<string>();
    for (const field of fields) {
      // Wells are drawn together by the funnel sky below, not one view each.
      if (field.kind === FUNNEL_KIND || field.kind === 'cloud-bank') continue;
      let entry = phenomena.get(field.id);
      if (!entry || entry.kind !== field.kind) {
        if (entry) retire(field.id);
        const factory = windowViewFor(field.kind);
        if (!factory) continue;
        const group = new Group();
        rot.add(group);
        entry = { kind: field.kind, group, view: factory({ group, displayRadius: SHELL }) };
        phenomena.set(field.id, entry);
      }
      entry.group.visible = true;
      entry.view.update(field.visual, t);
      visible.add(field.id);
    }
    for (const id of [...phenomena.keys()]) if (!visible.has(id)) retire(id);
  };
  const retire = (id: string): void => {
    const entry = phenomena.get(id);
    if (!entry) return;
    entry.view.dispose();
    rot.remove(entry.group);
    phenomena.delete(id);
  };

  return {
    setScenery(next) {
      if (scenery) scene.remove(scenery);
      scenery = next;
      if (scenery) {
        scene.add(scenery);
        rot.quaternion.identity();
      }
      rot.visible = scenery === null;
    },
    followEye(camera, renderer) {
      // Optical directions are from the ship's eye; walking must not shift the sky/bodies.
      rot.position.copy(camera.position);
      deepSky.followEye(camera, renderer);
    },
    update(snapshot) {
      if (scenery) return;
      const ship = snapshot.world.ship;
      // The room is the ship: bring the ship's nose onto the room's -z, the window.
      rot.quaternion.copy(attitudeToScene(ship.attitude, q)).invert();
      const view = snapshot.window;
      deepSky.setSun(view);
      if (view?.sun) toScene(view.sun.direction, sunWorld).normalize();
      else sunWorld.copy(sunEnv);
      sunWorld.applyQuaternion(rot.quaternion);
      for (const m of materials) setSun(m, [sunWorld.x, sunWorld.y, sunWorld.z]);
      if (view) {
        fromWindow(view);
        const fields = opticalFields(view);
        drawPhenomena(fields, snapshot.t);
        funnelStats = sky.update(fields, snapshot.t, rot.quaternion);
        clouds.update(cloudBanks(view), rot.quaternion);
        return;
      }

      drawPhenomena([], snapshot.t);
      funnelStats = sky.update([], snapshot.t, rot.quaternion);
      clouds.update([], rot.quaternion);

      // Without a window channel (stand-ins, old fixtures): the believed world.
      snapshot.world.bodies.forEach((b, i) => {
        const mesh = bodyMesh(b.id, i);
        const r = place(ship.position, b.position, b.radius, mesh.position);
        mesh.scale.setScalar(r);
      });

      let n = 0;
      for (const a of snapshot.world.asteroids) {
        if (n >= MAX_ROCKS) break;
        const r = place(ship.position, a.position, a.radius, d);
        // Each rock keeps its own orientation, from its id, so it does not pop between frames.
        let h = 0;
        for (let k = 0; k < a.id.length; k++) h = (h * 31 + a.id.charCodeAt(k)) % 6283;
        spin.setFromAxisAngle(axis, h / 1000);
        m4.compose(d, spin, scale.set(r, r * 0.8, r * 1.1));
        rocks.setMatrixAt(n++, m4);
      }
      rocks.count = n;
      rocks.instanceMatrix.needsUpdate = true;
    },
    funnels: () => funnelStats,
    dispose() {
      if (scenery) scene.remove(scenery);
      for (const id of [...phenomena.keys()]) retire(id);
      sky.dispose();
      clouds.dispose();
      deepSky.dispose();
      rot.removeFromParent();
      sphere.dispose();
      rockGeo.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
