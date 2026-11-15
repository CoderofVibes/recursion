/**
 * The drawn ship: every part of `parts.ts` as one-pixel wire, in body metres. The ship hologram
 * (`ShipHolo.ts`) inspects it; the flight hologram uses it, enlarged and without the interior,
 * as the ship symbol.
 *
 * What the vehicle is comes from the game's `ShipDefinition` (masses, positions, configurations);
 * how each assembly is drawn comes from `parts.ts`.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { LineBasicMaterial } from 'three';
import type { ShipDefinition, Vec2 } from '../../contracts/index.ts';
import { wireMaterial } from '../../theme/three/index.ts';
import { shipHoloMotion, shipWire } from '../../theme/three/ship-holo.ts';
import { buildParts } from './parts.ts';
import type { Deploys, ShipPart } from './parts.ts';
import type { Vec3 } from './wire.ts';

/** Body frame (x forward, y left, z up) → three (x right, y up, z toward the viewer). Forward is -z. */
export const P = (bx: number, by: number, up = 0): Vector3 => new Vector3(-by, up, -bx);

/** The four configurations of the baseline: how far out each set of wings is, and a short name. */
export const CONFIGS = {
  stowed: { rad: 0, sol: 0, label: 'STOWED' },
  radiators: { rad: 1, sol: 0, label: 'RADIATORS' },
  solar: { rad: 0, sol: 1, label: 'SOLAR' },
  allDeployed: { rad: 1, sol: 1, label: 'ALL OUT' },
} as const satisfies Record<string, Readonly<Record<Deploys, number>> & { readonly label: string }>;

export type ConfigId = keyof typeof CONFIGS;
export const isConfigId = (id: string): id is ConfigId => Object.hasOwn(CONFIGS, id);

/** Deployed fraction of the radiators and of the solar wings: 0 stowed, 1 out. */
export type Deployment = Readonly<Record<Deploys, number>>;

const DEPLOYS: readonly Deploys[] = ['rad', 'sol'];
/** Distance from the centreline at which a stowed wing's callout and pick sphere sit, metres. */
const WING_ROOT = 2.7;
/** How much a wing's pick sphere grows as the wing runs out, metres of radius. */
const WING_PICK_GROWTH = 2.4;
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

export interface ShipModel {
  /** Body metres; forward is -z, left is -x, up is +y (see `P`). */
  readonly group: Group;
  /** One opacity for the whole drawing (the flight hologram's ship symbol). */
  setOpacity(o: number): void;
  /** 'stowed' | 'radiators' | 'solar' | 'allDeployed'. Any other id is ignored. */
  setConfig(id: string, instant?: boolean): void;
  /** Eases the deployment toward the configuration. */
  update(dt: number): void;
  /** Dry centre of mass at the drawn deployment, in the group's frame. */
  centreOfMass(): Vector3;
  /** Frees the drawing and takes the group out of the scene. */
  dispose(): void;
}

/** One part as drawn. */
export interface DrawnPart {
  readonly part: ShipPart;
  /** Its bounding box is kept current as the part moves. */
  readonly line: LineSegments<BufferGeometry, LineBasicMaterial>;
  /**
   * An unseen sphere that takes the pointer, for a part that stands for equipment the definition
   * lists. Never rendered; `ShipHolo` decides when it may be picked.
   */
  readonly pick: Mesh | null;
}

/** The model as the ship hologram needs it: the parts themselves and the state of deployment. */
export interface DrawnShip extends ShipModel {
  readonly parts: ReadonlyMap<string, DrawnPart>;
  /** Live: read it, do not keep it. */
  readonly deployment: Deployment;
  config(): ConfigId;
  /** Ease the deployment by dt seconds. True while the wings are still moving. */
  step(dt: number): boolean;
  /** Dry centre of mass at the drawn deployment, body frame (x forward, y left), metres. */
  centreOfMassBody(): Vec2;
}

/** Where a part's callout starts, body frame: fixed, or midway along a wing as it runs out. */
export function anchorOf(part: ShipPart, deployment: Deployment): Vec3 {
  if (!part.dyn || !part.follow) return part.anchor;
  const reach = WING_ROOT + ((part.span ?? 0) * deployment[part.follow]) / 2;
  return [part.anchor[0], (part.side ?? 1) * reach, 0];
}

const drawing = (part: ShipPart, d: Deployment): Float32Array =>
  (part.dyn ? part.dyn(d.rad, d.sol) : part.wire)?.toThree() ?? new Float32Array(0);

function geometryOf(part: ShipPart, d: Deployment): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(drawing(part, d), 3));
  g.computeBoundingBox();
  return g;
}

/** A mass and where it sits: fixed, or carried out by a wing. */
interface MassPoint {
  readonly mass: number;
  readonly home: Vec2;
  readonly out?: Vec2;
  readonly follow?: Deploys;
}

/**
 * Structure and every assembly as point masses. An assembly rides a wing if a configuration
 * places it somewhere other than where the stowed configuration does.
 */
function massPoints(definition: ShipDefinition): MassPoint[] {
  const placed = (id: ConfigId): Readonly<Record<string, Vec2>> | undefined =>
    definition.configurations.find((c) => c.id === id)?.equipmentPositions;
  const stowed = placed('stowed');
  const carried = [
    { follow: 'rad', positions: placed('radiators') },
    { follow: 'sol', positions: placed('solar') },
  ] as const;
  const points: MassPoint[] = [
    { mass: definition.structureMass, home: definition.structureCenterOfMass },
  ];
  for (const e of definition.equipment) {
    const home = stowed?.[e.id] ?? e.position;
    let point: MassPoint = { mass: e.mass, home };
    for (const { follow, positions } of carried) {
      const out = positions?.[e.id];
      if (out && (out.x !== home.x || out.y !== home.y)) {
        point = { mass: e.mass, home, out, follow };
        break;
      }
    }
    points.push(point);
  }
  return points;
}

/** The drawn ship with its parts exposed, for the ship hologram. */
export function drawShip(
  definition: ShipDefinition,
  { detail = true }: { detail?: boolean } = {},
): DrawnShip {
  const group = new Group();
  const frac: Record<Deploys, number> = { rad: 0, sol: 0 };
  const target: Record<Deploys, number> = { rad: 0, sol: 0 };
  let cfg: ConfigId = 'stowed';
  const masses = massPoints(definition);
  const listed = new Set(definition.equipment.map((e) => e.id));

  const pickGeometry = new SphereGeometry(1, 10, 8);
  const pickMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const parts = new Map<string, DrawnPart>();
  for (const part of buildParts()) {
    if (!detail && !part.ext) continue;
    const line = new LineSegments(
      geometryOf(part, frac),
      wireMaterial(part.orange ? 'blackbox' : 'measured'),
    );
    line.frustumCulled = false;
    group.add(line);
    let pick: Mesh | null = null;
    if (detail && part.eq !== undefined && listed.has(part.eq) && part.r > 0) {
      pick = new Mesh(pickGeometry, pickMaterial);
      pick.position.copy(P(...part.anchor));
      pick.scale.setScalar(part.r);
      pick.visible = false;
      group.add(pick);
    }
    parts.set(part.id, { part, line, pick });
  }

  /** Redraw the parts that move, and carry their pick spheres with them. */
  function layout(): void {
    for (const { part, line, pick } of parts.values()) {
      if (!part.dyn) continue;
      line.geometry.dispose();
      line.geometry = geometryOf(part, frac);
      if (pick && part.follow) {
        pick.position.copy(P(...anchorOf(part, frac)));
        pick.scale.setScalar(part.r + WING_PICK_GROWTH * frac[part.follow]);
      }
    }
  }

  function centreOfMassBody(): Vec2 {
    let m = 0;
    let x = 0;
    let y = 0;
    for (const p of masses) {
      const f = p.follow ? frac[p.follow] : 0;
      m += p.mass;
      x += p.mass * (p.out ? lerp(p.home.x, p.out.x, f) : p.home.x);
      y += p.mass * (p.out ? lerp(p.home.y, p.out.y, f) : p.home.y);
    }
    return m > 0 ? { x: x / m, y: y / m } : { x: 0, y: 0 };
  }

  function setConfig(id: string, instant = false): void {
    if (!isConfigId(id)) return;
    cfg = id;
    target.rad = CONFIGS[id].rad;
    target.sol = CONFIGS[id].sol;
    if (instant) {
      frac.rad = target.rad;
      frac.sol = target.sol;
      layout();
    }
  }

  function step(dt: number): boolean {
    let moving = false;
    for (const k of DEPLOYS) {
      const d = target[k] - frac[k];
      if (Math.abs(d) > 1e-4) {
        frac[k] += Math.sign(d) * Math.min(Math.abs(d), dt / shipHoloMotion.deploy);
        moving = true;
      }
    }
    if (moving) layout();
    return moving;
  }

  setConfig(
    isConfigId(definition.defaultConfiguration) ? definition.defaultConfiguration : cfg,
    true,
  );

  return {
    group,
    parts,
    deployment: frac,
    config: () => cfg,
    setConfig,
    step,
    update(dt) {
      step(dt);
    },
    setOpacity(o) {
      for (const { part, line } of parts.values())
        line.material.opacity = o * (part.faint ? shipWire.faintLevel : 1);
    },
    centreOfMassBody,
    centreOfMass() {
      const c = centreOfMassBody();
      return P(c.x, c.y, 0);
    },
    dispose() {
      for (const { line } of parts.values()) {
        line.geometry.dispose();
        line.material.dispose();
      }
      pickGeometry.dispose();
      pickMaterial.dispose();
      group.removeFromParent();
    },
  };
}

/**
 * The drawn ship in body metres. `detail: false` keeps only what shows from outside (the ship
 * symbol in the flight hologram).
 */
export function makeShipModel(
  definition: ShipDefinition,
  options: { detail?: boolean } = {},
): ShipModel {
  return drawShip(definition, options);
}
