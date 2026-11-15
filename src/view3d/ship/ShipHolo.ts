/**
 * Ship hologram: the vehicle of the game's `ShipDefinition` drawn as a three-dimensional technical
 * drawing. The overview calls out the major items; choosing a system isolates it, frames it and
 * names its components. The readouts beside it are the console's (React); they follow this
 * hologram through `onChange`.
 */
import { hullOutline } from '../adapter.ts';
import { Box3, Group, Sphere, Vector3 } from 'three';
import type { Object3D, Raycaster } from 'three';
import type { ShipDefinition } from '../../contracts/index.ts';
import { holoLines, lineStyles } from '../../theme/index.ts';
import { shipHoloMotion, shipWire } from '../../theme/three/ship-holo.ts';
import { LineSet, arcXZ, label, setFat, setTag, setThin, thin } from '../gfx.ts';
import type { Tag } from '../gfx.ts';
import { CONFIGS, P, anchorOf, drawShip } from './model.ts';
import type { DrawnPart } from './model.ts';
import { SYSTEMS } from './parts.ts';
import type { ShipPart, SystemId } from './parts.ts';
import type { Vec3 } from './wire.ts';

export interface ShipSystemInfo {
  readonly id: string;
  readonly name: string;
}

/** A drawn part that stands for one piece of the definition's equipment. */
export interface ShipPartInfo {
  /** The equipment id. */
  readonly id: string;
  /** The system it is drawn under (a `ShipSystemInfo` id). */
  readonly system: string;
  /** Its callout on the drawing, without any rating. */
  readonly name: string;
}

export interface ShipHolo {
  /** Add under the hologram root; the host scales and tilts it. */
  readonly group: Group;
  /** The host rotates this on drag. Its scale is the hologram's own (the framing). */
  readonly spin: Group;
  readonly systems: readonly ShipSystemInfo[];
  /** Equipment-backed parts and the system each belongs to. The same array every call. */
  parts(): readonly ShipPartInfo[];
  /** The isolated system; null is the overview of the whole vehicle. */
  system(): string | null;
  setSystem(id: string | null): void;
  /** The selected equipment id. Selecting a part opens its system. */
  selected(): string | null;
  select(id: string | null): void;
  /** The equipment under a ray, among the parts that can be chosen now. */
  pick(ray: Raycaster): string | null;
  hover(id: string | null): void;
  /** 'stowed' | 'radiators' | 'solar' | 'allDeployed': the configuration the drawing shows. */
  config(): string;
  setConfig(id: string, instant?: boolean): void;
  /** Deployed fraction of the radiators and the solar wings as drawn: 0 stowed, 1 out. */
  deployment(): { readonly radiators: number; readonly solar: number };
  /** Dry centre of mass as drawn, body frame (x forward, y left), metres. */
  centreOfMass(): { readonly x: number; readonly y: number };
  /**
   * Called whenever system, selection or config changes, and once more when the wings stop
   * moving (so React can re-render its panels). Returns unsubscribe.
   */
  onChange(listener: () => void): () => void;
  update(dt: number): void;
  /** Jump eased values (framing, deployment) to their targets. */
  snap(): void;
  setResolution(width: number, height: number): void;
  /** Screen pixels covered by one unit of `group`'s own frame; the framing scale is applied here. */
  setPixelsPerUnit(pixels: number): void;
  dispose(): void;
}

/** A view of the drawing: the point (model frame) brought to the centre, and the scale. */
interface Framing {
  readonly c: Vector3;
  readonly S: number;
}

/** Hologram units per metre of ship with the whole vehicle in view. */
const OVERVIEW_SCALE = 0.078;
/** An isolated system fills this radius of the hologram, but is never enlarged past ZOOM_MAX. */
const ZOOM_FILL = 0.62;
const ZOOM_MAX = 0.15;
/** Smallest radius a system is framed as, metres (a single small part is not blown up). */
const ZOOM_MIN_RADIUS = 1.5;
/** Resting attitude of the drawing: pitch and yaw, radians. */
const REST_PITCH = 0.12;
const REST_YAW = 0.95;

/** Centre of mass mark: ring radius, and how far its dotted axis runs below and above, metres. */
const COM_RING = 0.42;
const COM_AXIS_LOW = -4.4;
const COM_AXIS_HIGH = 4.8;
const COM_TAG_HEIGHT = 5.1;
/** Level of the footprint outline under the ship, metres. */
const BASE = -4.4;
/** Where the main engine's gimbal is drawn (`parts.ts`), and its offset from the centreline. */
const ENGINE_MOUNT_X = -6.4;
const ENGINE_DRAWN_Y = 0.08;
/** The line of action runs this far aft of the gimbal and this far forward of it, metres. */
const THRUST_LINE_AFT = 1.6;
const THRUST_LINE_FORE = 15.5;

const HULL = 'hull';
const CANOPY = 'canopy';
const MAIN_ENGINE = 'main-engine';

/** 12.0 → "12", 2.55 → "2.6". */
const metres = (v: number): string => String(Number(v.toFixed(1)));

export function makeShipHolo(definition: ShipDefinition): ShipHolo {
  const group = new Group();
  const spin = new Group();
  group.add(spin);
  spin.rotation.set(REST_PITCH, REST_YAW, 0);
  const model = drawShip(definition, { detail: true });
  spin.add(model.group);
  // Centre of mass, thrust line and footprint ride with the model.
  const marks = new Group();
  model.group.add(marks);
  const lines = new LineSet();

  const engine = definition.equipment.find((e) => e.id === MAIN_ENGINE);
  const engineY = engine?.mount?.position.y ?? engine?.position.y ?? ENGINE_DRAWN_Y;
  const footprints = new Map(definition.configurations.map((c) => [c.id, hullOutline(c)]));

  // Equipment the definition lists, by id, and the pick sphere each answers to.
  const byEquipment = new Map<string, DrawnPart>();
  const pickIds = new Map<Object3D, string>();
  const listed = new Set(definition.equipment.map((e) => e.id));
  for (const d of model.parts.values()) {
    const eq = d.part.eq;
    if (eq === undefined || !listed.has(eq)) continue;
    byEquipment.set(eq, d);
    if (d.pick) pickIds.set(d.pick, eq);
  }
  const partInfos: readonly ShipPartInfo[] = [...byEquipment].map(([id, d]) => ({
    id,
    system: d.part.sys,
    name: d.part.name.replace(/\s{2}.*/, ''),
  }));

  let system: SystemId | null = null;
  let selected: DrawnPart | null = null;
  let hovered: DrawnPart | null = null;
  let moving = false;
  let hasFootprint = false;
  let pickable: Object3D[] = [];
  let hostPixels = 1;
  const overview: Framing = { c: new Vector3(0, 0, 0), S: OVERVIEW_SCALE };
  const view = { c: overview.c.clone(), S: overview.S };
  let goal: Framing = overview;
  const listeners = new Set<() => void>();
  const emit = (): void => {
    for (const listener of [...listeners]) listener();
  };

  // Centre of mass, its dotted yaw axis, and the main engine's line of action.
  const comMark = new Group();
  const comRing = lines.fat(arcXZ(COM_RING, 0, Math.PI * 2, 32), holoLines.centreOfMass);
  const comCross = lines.fatSegs(
    [-COM_RING, 0, 0, COM_RING, 0, 0, 0, 0, -COM_RING, 0, 0, COM_RING],
    holoLines.centreOfMass,
  );
  const comAxis = lines.fat([0, COM_AXIS_LOW, 0, 0, COM_AXIS_HIGH, 0], holoLines.comAxis);
  const comTag = label('');
  comTag.position.set(0, COM_TAG_HEIGHT, 0);
  comMark.add(comRing, comCross, comAxis, comTag);
  marks.add(comMark);
  const mount = P(ENGINE_MOUNT_X, engineY, 0);
  const thrustLine = lines.fat(
    [mount.x, 0, mount.z + THRUST_LINE_AFT, mount.x, 0, mount.z - THRUST_LINE_FORE],
    lineStyles.thrustLine,
  );
  marks.add(thrustLine);
  const armTag = label('', 'thr');
  armTag.position.set(mount.x, 0.5, mount.z - THRUST_LINE_FORE - 0.7);
  marks.add(armTag);
  const foot = lines.fat([], lineStyles.shipFootprint);
  marks.add(foot);
  const footTag = label('', 'dim');
  footTag.position.copy(P(-9.8, 0, BASE));
  marks.add(footTag);

  // Callouts: a leader from each named part to its label.
  const leaders = thin([], holoLines.leader.colour, holoLines.leader.opacity);
  model.group.add(leaders);
  const thrust = engine?.params.thrust;
  const calloutText = (part: ShipPart): string =>
    part.id === MAIN_ENGINE && thrust !== undefined
      ? `${part.name.replace(/\s{2}.*/, '')}  ${metres(thrust / 1000)} kN`
      : part.name;
  const tags = new Map<string, Tag>();
  for (const { part } of model.parts.values()) {
    if (!part.name) continue;
    const t = label(calloutText(part), part.orange ? 'call bbx' : 'call');
    model.group.add(t);
    tags.set(part.id, t);
  }

  /** Where a part's label stands: out from the hull along the line from the axis through it. */
  function labelPos(part: ShipPart, a: Vec3): Vec3 {
    const rad = Math.hypot(a[1], a[2]);
    const out: Vec3 = part.dyn || rad <= 0.35 ? [0, 0, 1] : [0, a[1] / rad, a[2] / rad];
    const reach = part.dyn ? 1.5 : Math.max(rad + 0.9, system ? rad + 0.9 : 3.5) - rad;
    return [
      a[0] + (system ? 0 : Math.sign(a[0]) * 0.3),
      a[1] + out[1] * reach,
      a[2] + out[2] * reach,
    ];
  }

  /** Drawn at all: a system's own parts over a ghost of the hull, or everything but the runs. */
  const visibleIn = (p: ShipPart): boolean =>
    system ? p.sys === system || p.id === HULL || p.id === CANOPY : !p.net;
  const calledOut = (p: ShipPart): boolean =>
    !!p.name && (system ? p.sys === system && (!p.net || !!p.callout) && p.id !== HULL : !!p.major);

  function wireOpacity(p: ShipPart, hot: boolean): number {
    if (!system) {
      if (hot) return shipWire.hot;
      if (p.faint) return shipWire.overviewFaint;
      if (p.id === HULL) return shipWire.overviewHull;
      if (p.orange) return shipWire.overviewBlackBox;
      return p.ext ? shipWire.overviewExterior : shipWire.overviewInterior;
    }
    if (p.sys !== system) return shipWire.ghost;
    if (hot) return shipWire.hot;
    if (p.faint) return shipWire.isolatedFaint;
    if (p.net) return shipWire.isolatedNetwork;
    return selected ? shipWire.isolatedBeside : shipWire.isolatedPart;
  }

  function restyle(): void {
    const seg: number[] = [];
    pickable = [];
    for (const d of model.parts.values()) {
      const p = d.part;
      const hot = d === selected || d === hovered;
      d.line.visible = visibleIn(p);
      d.line.material.opacity = wireOpacity(p, hot);
      if (d.pick && (!system || p.sys === system)) pickable.push(d.pick);
      const t = tags.get(p.id);
      if (!t) continue;
      t.visible = calledOut(p) || (hot && visibleIn(p));
      if (!t.visible) continue;
      const a = anchorOf(p, model.deployment);
      const l = labelPos(p, a);
      t.position.copy(P(l[0], l[1], l[2]));
      const from = P(a[0], a[1], a[2]);
      seg.push(from.x, from.y, from.z, t.position.x, t.position.y, t.position.z);
      t.element.classList.toggle('sel', d === selected);
    }
    setThin(leaders, seg);
    marks.visible = !system || system === 'structure' || system === 'propulsion';
    foot.visible = footTag.visible = hasFootprint && (!system || system === 'structure');
  }

  function refreshMarks(): void {
    const com = model.centreOfMassBody();
    comMark.position.copy(P(com.x, com.y, 0));
    setTag(armTag, `THRUST ARM ${Math.round(Math.abs(engineY - com.y) * 100)} cm`);
    setTag(comTag, `CoM  ${com.x >= 0 ? '+' : '−'}${Math.abs(com.x).toFixed(2)} m  DRY`);
    const poly = footprints.get(model.config()) ?? [];
    hasFootprint = poly.length > 2;
    if (!hasFootprint) return;
    const flat: number[] = [];
    for (let i = 0; i <= poly.length; i++) {
      const q = poly[i % poly.length]!;
      const v = P(q.x, q.y, BASE);
      flat.push(v.x, v.y, v.z);
    }
    setFat(foot, flat);
    const xs = poly.map((q) => q.x);
    const ys = poly.map((q) => q.y);
    const length = Math.max(...xs) - Math.min(...xs);
    const span = Math.max(...ys) - Math.min(...ys);
    setTag(footTag, `FOOTPRINT ${metres(length)} × ${metres(span)} m`);
  }

  /** Frame the isolated system: centre and scale from the extent of its parts. */
  function frame(): void {
    if (!system || system === 'structure') {
      goal = overview;
      return;
    }
    const box = new Box3();
    for (const { part, line } of model.parts.values()) {
      if (part.sys !== system || part.net) continue;
      if (line.geometry.boundingBox) box.union(line.geometry.boundingBox);
    }
    if (box.isEmpty()) {
      goal = overview;
      return;
    }
    const s = box.getBoundingSphere(new Sphere());
    goal = { c: s.center, S: Math.min(ZOOM_MAX, ZOOM_FILL / Math.max(s.radius, ZOOM_MIN_RADIUS)) };
  }

  /** Put the eased framing on the scene, and keep dashes in screen pixels at that scale. */
  function place(): void {
    spin.scale.setScalar(view.S);
    model.group.position.copy(view.c).multiplyScalar(-1);
    lines.setPixelsPerUnit(hostPixels * view.S);
  }

  /** The configuration and how far the wings are out, as one comparable value. */
  const drawnAs = (): string => `${model.config()} ${model.deployment.rad} ${model.deployment.sol}`;

  /** Redraw after a change of state; tell the listeners if it was one they can see. */
  function settle(before: { system: SystemId | null; selected: DrawnPart | null }): void {
    frame();
    restyle();
    if (before.system !== system || before.selected !== selected) emit();
  }

  refreshMarks();
  restyle();
  place();

  return {
    group,
    spin,
    systems: SYSTEMS,
    parts: () => partInfos,
    system: () => system,
    setSystem(id) {
      const before = { system, selected };
      system = SYSTEMS.find((s) => s.id === id)?.id ?? null;
      if (selected && selected.part.sys !== system) selected = null;
      settle(before);
    },
    selected: () => selected?.part.eq ?? null,
    select(id) {
      const before = { system, selected };
      selected = id === null ? null : (byEquipment.get(id) ?? null);
      // In the overview, choosing a part opens its system (the structure is the overview itself);
      // with another system isolated, the view moves to the system the part belongs to.
      const sys = selected?.part.sys;
      if (sys && sys !== system && (system || sys !== 'structure')) system = sys;
      settle(before);
    },
    pick(ray) {
      if (!pickable.length) return null;
      model.group.updateWorldMatrix(true, true);
      const hit = ray.intersectObjects(pickable, false)[0];
      return hit ? (pickIds.get(hit.object) ?? null) : null;
    },
    hover(id) {
      const next = id === null ? null : (byEquipment.get(id) ?? null);
      if (next === hovered) return;
      hovered = next;
      restyle();
    },
    config: () => model.config(),
    setConfig(id, instant) {
      const before = drawnAs();
      model.setConfig(id, instant);
      if (instant) moving = false;
      refreshMarks();
      frame();
      restyle();
      if (before !== drawnAs()) emit();
    },
    deployment: () => ({ radiators: model.deployment.rad, solar: model.deployment.sol }),
    centreOfMass: () => model.centreOfMassBody(),
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(dt) {
      if (model.step(dt)) {
        refreshMarks();
        frame();
        restyle();
        moving = true;
      } else if (moving) {
        // The wings have stopped: anything read off the deployment is final now.
        moving = false;
        emit();
      }
      const k = 1 - Math.exp(-dt * shipHoloMotion.frame);
      view.c.lerp(goal.c, k);
      view.S += (goal.S - view.S) * k;
      place();
    },
    snap() {
      const target = CONFIGS[model.config()];
      const { rad, sol } = model.deployment;
      if (moving || rad !== target.rad || sol !== target.sol) {
        model.setConfig(model.config(), true);
        moving = false;
        refreshMarks();
        frame();
        restyle();
        emit();
      }
      view.c.copy(goal.c);
      view.S = goal.S;
      place();
    },
    setResolution(width, height) {
      lines.setResolution(width, height);
    },
    setPixelsPerUnit(pixels) {
      hostPixels = pixels;
      lines.setPixelsPerUnit(hostPixels * view.S);
    },
    dispose() {
      listeners.clear();
      // A tag's element leaves the page when the tag leaves its parent.
      for (const t of [...tags.values(), comTag, armTag, footTag]) t.removeFromParent();
      for (const l of [comRing, comCross, comAxis, thrustLine, foot]) l.geometry.dispose();
      lines.dispose();
      leaders.geometry.dispose();
      leaders.material.dispose();
      model.dispose();
      group.removeFromParent();
    },
  };
}
