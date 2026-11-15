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
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Scene, ShaderMaterial } from 'three';
import type { ViewSnapshot, WindowView } from '../../contracts/index.ts';
import { colour, hex, outsideStyle, render } from '../../theme/index.ts';
import { bodyMaterial, rockMaterial, setSun } from '../../theme/three/index.ts';
import { attitudeToScene, toScene, windowFields } from '../adapter.ts';
import { windowViewFor } from '../windowViews.ts';
import type { WindowView as EyeView } from '../windowViews.ts';
import { dressingRandom } from '../gfx.ts';
import { HORIZON_Y } from './layout.ts';

const MAX_ROCKS = 512;
/** Scene metres: nothing outside is drawn nearer than this, or farther than NEAR + SPAN. */
const NEAR = 30;
const SPAN = 5000;
/** Distance (game metres) at which an object sits half way out. */
const HALF = 2_000_000;
const STARS = 6000;
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
  dispose(): void;
}

export function buildOutside(scene: Scene): Outside {
  const rot = new Group();
  rot.position.set(0, HORIZON_Y, 0);
  scene.add(rot);

  const sunEnv = new Vector3(...render.keyLight).normalize();
  const sunWorld = new Vector3();
  const materials: ShaderMaterial[] = [];

  // Bodies: one sphere per believed body, the secondary a little cooler than the primary.
  const sphere = new SphereGeometry(1, 64, 40);
  const bodies = new Map<string, Mesh>();
  const bodyMesh = (id: string, index: number): Mesh => {
    let m = bodies.get(id);
    if (!m) {
      const mat = bodyMaterial(index > 0 ? { lit: outsideStyle.bodyLitCool } : {});
      materials.push(mat);
      m = new Mesh(sphere, mat);
      m.rotation.z = 0.3;
      rot.add(m);
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
        0.78 + 0.42 * Math.abs((Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453) % 1);
      p.setXYZ(i, x * k, y * k, z * k);
    }
    rockGeo.computeVertexNormals();
  }
  const rockMat = rockMaterial();
  (rockMat.uniforms.cRock!.value as Color).set(hex(outsideStyle.rock));
  materials.push(rockMat);
  const rocks = new InstancedMesh(rockGeo, rockMat, MAX_ROCKS);
  rocks.frustumCulled = false;
  rocks.count = 0;
  rot.add(rocks);

  // Stars.
  {
    const r = dressingRandom(99);
    const pos: number[] = [];
    const col: number[] = [];
    const [warmG, warmB] = outsideStyle.starWarm;
    for (let i = 0; i < outsideStyle.starCount; i++) {
      const u = r() * 2 - 1;
      const a = r() * 2 * Math.PI;
      const s = Math.sqrt(1 - u * u);
      pos.push(Math.cos(a) * s * STARS, u * STARS, Math.sin(a) * s * STARS);
      const b = outsideStyle.starMin + r() ** 4 * (1 - outsideStyle.starMin);
      const warm = r();
      col.push(b, b * (warmG + warm * (1 - warmG - 0.02)), b * (warmB + warm * (1 - warmB - 0.02)));
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new Float32BufferAttribute(col, 3));
    const stars = new Points(
      g,
      new PointsMaterial({
        size: outsideStyle.starSize,
        sizeAttenuation: false,
        vertexColors: true,
        color: hex(colour.ink),
      }),
    );
    stars.frustumCulled = false;
    rot.add(stars);
  }

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
    mesh.userData.cLit ??= (u.cLit!.value as Color).clone();
    (u.cLit!.value as Color).copy(lit ? (mesh.userData.cLit as Color) : (u.cDark!.value as Color));
    u.uRimStrength!.value = lit ? render.rimStrength : 0;
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
        mesh.scale.setScalar(drawn * Math.tan(Math.min(a, 1.4)));
        setLit(mesh, o.lit);
      } else if (o.lit && n < MAX_ROCKS) {
        // An unlit rock is not seen at all.
        const drawn = NEAR + SPAN * (0.1 + 0.3 / (1 + a * 2000));
        const r = drawn * Math.tan(Math.min(a, 1.4));
        let h = 0;
        for (let k = 0; k < o.id.length; k++) h = (h * 31 + o.id.charCodeAt(k)) % 6283;
        spin.setFromAxisAngle(axis, h / 1000);
        m4.compose(d.multiplyScalar(drawn), spin, scale.set(r, r * 0.8, r * 1.1));
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
  const drawPhenomena = (view: object, t: number): void => {
    const visible = new Set<string>();
    for (const field of windowFields(view)) {
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
    update(snapshot) {
      const ship = snapshot.world.ship;
      // The room is the ship: bring the ship's nose onto the room's -z, the window.
      rot.quaternion.copy(attitudeToScene(ship.attitude, q)).invert();
      const view = snapshot.window;
      if (view?.sun) toScene(view.sun.direction, sunWorld).normalize();
      else sunWorld.copy(sunEnv);
      sunWorld.applyQuaternion(rot.quaternion);
      for (const m of materials) setSun(m, [sunWorld.x, sunWorld.y, sunWorld.z]);
      if (view) {
        fromWindow(view);
        drawPhenomena(view, snapshot.t);
        return;
      }

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
    dispose() {
      for (const id of [...phenomena.keys()]) retire(id);
      sphere.dispose();
      rockGeo.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
