import baseline from '../../../data/ship-baseline.json';
import type { Inertia, MassProperties, ShipDefinition } from '../../contracts/ship.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { fromPrincipal, principalAxes, type Sym3 } from '../../lib/sym3.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { getGeometry, type Geometry } from '../config/configuration.ts';

/** The inertia tensor about the centre of mass in the body frame, [xx, xy, xz, yy, yz, zz]. */
export const inertiaTensor = (inertia: Inertia): Sym3 =>
  fromPrincipal(inertia.moments, inertia.axes);

/** Yaw inertia: the body-frame zz term of the tensor (not the principal moment about z′). */
export const yawInertia = (inertia: Inertia): number => inertiaTensor(inertia)[5];

/** −0 becomes +0, so a stored value is unchanged by a JSON round trip (replays stay exact). */
const unsigned = (value: number) => value + 0;

/** Mass properties with the body-frame tensor they were reduced from (zz is the yaw inertia). */
export interface MassDetail {
  readonly properties: MassProperties;
  /** Inertia about the centre of mass, body frame: [xx, xy, xz, yy, yz, zz], kg·m². */
  readonly tensor: Sym3;
}

interface Item {
  readonly mass: number;
  readonly position: Vec3;
  readonly roll: number;
  readonly pitch: number;
  readonly yaw: number;
}

/**
 * The part of the sums that depends only on the design and the geometry: the structure and
 * every assembly, in order, with the running totals of mass and of mass × position after the
 * last of them. A build carries on from these with the tanks, so it adds the same numbers in
 * the same order as summing everything from scratch (S15 rank 1: the tanks change every
 * tick, the rest only when an appendage moves).
 */
interface FixedPart {
  readonly definition: ShipDefinition;
  readonly items: readonly Item[];
  readonly mass: number;
  readonly mx: number;
  readonly my: number;
  readonly mz: number;
}
const fixedParts = new WeakMap<Geometry, FixedPart>();
/** Each tank's inertia per kilogram, in the definition's tank order. */
const tankInertias = new WeakMap<ShipDefinition, readonly number[]>();

function fixedPart(definition: ShipDefinition, geometry: Geometry): FixedPart {
  const cached = fixedParts.get(geometry);
  if (cached?.definition === definition) return cached;
  const structure = definition.structureInertia;
  // The structure's own tensor in body axes; with identity axes these are its three moments.
  const structureTensor = inertiaTensor(structure);
  const items: Item[] = [
    {
      mass: definition.structureMass,
      position: definition.structureCenterOfMass,
      roll: structureTensor[0],
      pitch: structureTensor[3],
      yaw: structureTensor[5],
    },
  ];
  for (const equipment of definition.equipment)
    items.push({
      mass: equipment.mass,
      position: geometry.positions[equipment.id] ?? equipment.position,
      roll: geometry.intrinsicInertiaRoll[equipment.id] ?? 0,
      pitch: geometry.intrinsicInertiaPitch[equipment.id] ?? 0,
      yaw: geometry.intrinsicInertia[equipment.id] ?? 0,
    });
  let mass = 0;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (const item of items) {
    mass = mass + item.mass;
    mx = mx + item.mass * item.position.x;
    my = my + item.mass * item.position.y;
    mz = mz + item.mass * item.position.z;
  }
  const part = { definition, items, mass, mx, my, mz };
  fixedParts.set(geometry, part);
  return part;
}

function tankInertiaPerKg(definition: ShipDefinition): readonly number[] {
  let perKg = tankInertias.get(definition);
  if (!perKg) {
    const data = (definition.systems ?? baseline) as unknown as typeof baseline;
    const resources = [...data.propellant, ...data.reactants];
    perKg = definition.tanks.map(
      (tank) => resources.find((r) => r.id === tank.id)?.intrinsicInertiaPerKg ?? 0,
    );
    tankInertias.set(definition, perKg);
  }
  return perKg;
}

function build(
  definition: ShipDefinition,
  geometry: Geometry,
  tankMasses: readonly number[],
): MassDetail {
  const fixed = fixedPart(definition, geometry);
  const perKg = tankInertiaPerKg(definition);
  const masses: Item[] = [...fixed.items];
  let mass = fixed.mass;
  let mx = fixed.mx;
  let my = fixed.my;
  let mz = fixed.mz;
  definition.tanks.forEach((tank, index) => {
    const tankMass = tankMasses[index]!;
    // [ASSUMED] A compact tank: the same inertia per kilogram about every axis.
    const inertia = tankMass * perKg[index]!;
    masses.push({
      mass: tankMass,
      position: tank.position,
      roll: inertia,
      pitch: inertia,
      yaw: inertia,
    });
    mass = mass + tankMass;
    mx = mx + tankMass * tank.position.x;
    my = my + tankMass * tank.position.y;
    mz = mz + tankMass * tank.position.z;
  });
  if (!(mass > 0)) throw new Error('Ship mass must be positive');
  const centerOfMass = {
    x: unsigned(mx / mass),
    y: unsigned(my / mass),
    z: unsigned(mz / mass),
  };
  // [ESTABLISHED: S14, S24] Parallel-axis theorem, every term of the tensor. The zz sum keeps
  // 1C's planar form (intrinsic yaw + m (dx² + dy²)), so heights cannot change the yaw inertia.
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (const item of masses) {
    const dx = item.position.x - centerOfMass.x;
    const dy = item.position.y - centerOfMass.y;
    const dz = item.position.z - centerOfMass.z;
    xx = xx + item.roll + item.mass * (dy * dy + dz * dz);
    yy = yy + item.pitch + item.mass * (dx * dx + dz * dz);
    zz = zz + item.yaw + item.mass * (dx * dx + dy * dy);
    xy -= item.mass * dx * dy;
    xz -= item.mass * dx * dz;
    yz -= item.mass * dy * dz;
  }
  const tensor: Sym3 = [xx, unsigned(xy), unsigned(xz), yy, unsigned(yz), zz];
  const principal = principalAxes(tensor);
  return {
    properties: {
      mass,
      centerOfMass,
      inertia: {
        moments: principal.values,
        axes: {
          w: unsigned(principal.axes.w),
          x: unsigned(principal.axes.x),
          y: unsigned(principal.axes.y),
          z: unsigned(principal.axes.z),
        },
      },
      hull: geometry.hull,
    },
    tensor,
  };
}

/**
 * Mass properties depend only on the design, the geometry and the tank contents, and the step
 * needs them several times, so the last few results are kept (2F's request 4). Recalled and
 * recomputed values are the same numbers; nothing here is state.
 */
interface MassMemo {
  readonly geometry: Geometry;
  readonly tanks: readonly number[];
  readonly detail: MassDetail;
}
const massMemo = new WeakMap<ShipDefinition, MassMemo[]>();
const MASS_MEMO_SIZE = 4;

export function massDetail(state: ShipSystemsState, definition: ShipDefinition): MassDetail {
  const geometry = getGeometry(state, definition);
  const tanks = definition.tanks.map((tank) => Math.max(0, state.tanks[tank.id] ?? 0));
  let entries = massMemo.get(definition);
  if (!entries) massMemo.set(definition, (entries = []));
  for (const entry of entries) {
    let same = entry.geometry === geometry;
    for (let i = 0; same && i < tanks.length; i++) same = entry.tanks[i] === tanks[i];
    if (same) return entry.detail;
  }
  const detail = build(definition, geometry, tanks);
  if (entries.length >= MASS_MEMO_SIZE) entries.shift();
  entries.push({ geometry, tanks, detail });
  return detail;
}

/** [ESTABLISHED: S14, S24] Direct sums and the parallel-axis theorem, including retained water. */
export function computeMassProperties(
  state: ShipSystemsState,
  definition: ShipDefinition,
): MassProperties {
  return massDetail(state, definition).properties;
}
