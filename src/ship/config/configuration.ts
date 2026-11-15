import baseline from '../../../data/ship-baseline.json';
import type { Hull, HullPrism, ShipDefinition } from '../../contracts/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { lerp, type Vec2 } from '../../lib/vec2.ts';
import { lerp as lerp3, type Vec3 } from '../../lib/vec3.ts';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const vector = (p: readonly number[]): Vec2 => ({ x: p[0] ?? 0, y: p[1] ?? 0 });
const vector3 = (p: readonly number[]): Vec3 => ({ x: p[0] ?? 0, y: p[1] ?? 0, z: p[2] ?? 0 });
const dataFor = (definition: ShipDefinition) =>
  (definition.systems ?? baseline) as unknown as typeof baseline;

/** The ship's geometry at one set of appendage extensions. Treat as immutable: it is shared. */
export interface Geometry {
  /** Body-frame position of every assembly, appendages at their current extension. */
  readonly positions: Readonly<Record<string, Vec3>>;
  /** Intrinsic inertia about body z (yaw) through each assembly's own centre, kg·m². */
  readonly intrinsicInertia: Readonly<Record<string, number>>;
  /** The same about body x (roll). */
  readonly intrinsicInertiaRoll: Readonly<Record<string, number>>;
  /** The same about body y (pitch). */
  readonly intrinsicInertiaPitch: Readonly<Record<string, number>>;
  /** Extension of each appendage, 0 stowed to 1 deployed. */
  readonly deployment: Readonly<Record<string, number>>;
  /** Occupied volume: the pressure hull, then one thin prism per appendage. */
  readonly hull: Hull;
}

/**
 * [ASSUMED] The occupied volume as a union of convex prisms (contracts README § Conventions):
 * the pressure hull over its 5 m diameter, and each radiator and solar wing as a thin prism over
 * its polygon at the given extension. Nothing between the parts is included, so a wing can pass
 * an object that the old single convex outline would have counted as touched.
 */
export function hullAt(
  definition: ShipDefinition,
  deployment: Readonly<Record<string, number>>,
): Hull {
  const data = dataFor(definition);
  const body = data.ship.hull;
  const hull: HullPrism[] = [
    { outline: body.outline.map(vector), zMin: body.zMin, zMax: body.zMax, part: body.part },
  ];
  for (const appendage of data.configuration.appendages) {
    const fraction = deployment[appendage.id];
    if (fraction === undefined) continue;
    hull.push({
      outline: appendage.stowedPolygon.map((p, i) =>
        lerp(vector(p), vector(appendage.deployedPolygon[i]!), fraction),
      ),
      zMin: appendage.zMin,
      zMax: appendage.zMax,
      part: appendage.id,
    });
  }
  return hull;
}

/**
 * Each appendage's extension in each named configuration, worked out once per definition
 * (S15 rank 1: the geometry asks for it several times a tick, and it searches and reformats
 * names). A value of the design alone, never of state.
 */
const deploymentTables = new WeakMap<ShipDefinition, Map<string, Map<string, number>>>();

export function configurationDeployment(
  definition: ShipDefinition,
  configuration: string,
  id: string,
): number {
  let table = deploymentTables.get(definition);
  if (!table) deploymentTables.set(definition, (table = new Map()));
  let byId = table.get(configuration);
  if (!byId) table.set(configuration, (byId = new Map()));
  let fraction = byId.get(id);
  if (fraction === undefined) {
    fraction = deploymentIn(definition, configuration, id);
    byId.set(id, fraction);
  }
  return fraction;
}

function deploymentIn(definition: ShipDefinition, configuration: string, id: string): number {
  const data = dataFor(definition);
  const appendage = data.configuration.appendages.find((a) => a.id === id);
  const config = definition.configurations.find((c) => c.id === configuration);
  if (!appendage || !config) return 0;
  const override = config.paramOverrides?.[`${id}.deployment`];
  if (override !== undefined) return clamp(override);
  const position = config.equipmentPositions?.[id];
  if (position)
    return clamp(
      (position.y - appendage.stowedPosition[1]!) /
        (appendage.deployedPosition[1]! - appendage.stowedPosition[1]!),
    );
  const name = configuration.toLowerCase().replaceAll('-', '');
  return name === 'alldeployed' ||
    (id.startsWith('radiator') && name === 'radiators') ||
    (id.startsWith('solar') && name === 'solar')
    ? 1
    : 0;
}

/** Extension of every installed appendage in this state, in the baseline's order. */
function deploymentOf(state: ShipSystemsState, definition: ShipDefinition): number[] {
  const fractions: number[] = [];
  for (const appendage of dataFor(definition).configuration.appendages) {
    const equipment = state.equipment[appendage.id];
    fractions.push(
      equipment
        ? clamp(
            equipment.values.deployment ??
              configurationDeployment(definition, state.configuration, appendage.id),
          )
        : -1,
    );
  }
  return fractions;
}

function buildGeometry(
  definition: ShipDefinition,
  configurationId: string,
  fractions: readonly number[],
): Geometry {
  const data = dataFor(definition);
  const configuration = definition.configurations.find((c) => c.id === configurationId);
  const positions: Record<string, Vec3> = {};
  const intrinsicInertia: Record<string, number> = {};
  const intrinsicInertiaRoll: Record<string, number> = {};
  const intrinsicInertiaPitch: Record<string, number> = {};
  const deployment: Record<string, number> = {};
  for (const equipment of definition.equipment) {
    positions[equipment.id] =
      configuration?.equipmentPositions?.[equipment.id] ?? equipment.position;
    const yaw = equipment.params.intrinsicInertia ?? 0;
    intrinsicInertia[equipment.id] = yaw;
    intrinsicInertiaRoll[equipment.id] = equipment.params.intrinsicInertiaRoll ?? yaw;
    intrinsicInertiaPitch[equipment.id] = equipment.params.intrinsicInertiaPitch ?? yaw;
  }
  data.configuration.appendages.forEach((appendage, index) => {
    const fraction = fractions[index]!;
    if (fraction < 0) return; // not installed
    deployment[appendage.id] = fraction;
    positions[appendage.id] = lerp3(
      vector3(appendage.stowedPosition),
      vector3(appendage.deployedPosition),
      fraction,
    );
    // One extension drives all three terms, so a thin wing stays thin (yaw = roll + pitch).
    intrinsicInertia[appendage.id] =
      appendage.stowedInertia + fraction * (appendage.deployedInertia - appendage.stowedInertia);
    intrinsicInertiaRoll[appendage.id] =
      appendage.stowedInertiaRoll +
      fraction * (appendage.deployedInertiaRoll - appendage.stowedInertiaRoll);
    intrinsicInertiaPitch[appendage.id] =
      appendage.stowedInertiaPitch +
      fraction * (appendage.deployedInertiaPitch - appendage.stowedInertiaPitch);
  });
  return {
    positions,
    intrinsicInertia,
    intrinsicInertiaRoll,
    intrinsicInertiaPitch,
    deployment,
    hull: hullAt(definition, deployment),
  };
}

/**
 * Geometry is a function of the design, the configuration and the appendage extensions only,
 * and several subsystems ask for it every step, so the last few results are kept (2F's request
 * 4). The memo holds values, never state: the same inputs always give the same geometry,
 * computed or recalled.
 */
interface GeometryMemo {
  readonly configuration: string;
  readonly fractions: readonly number[];
  readonly geometry: Geometry;
}
const geometryMemo = new WeakMap<ShipDefinition, GeometryMemo[]>();
const GEOMETRY_MEMO_SIZE = 4;

export function getGeometry(state: ShipSystemsState, definition: ShipDefinition): Geometry {
  const fractions = deploymentOf(state, definition);
  let entries = geometryMemo.get(definition);
  if (!entries) geometryMemo.set(definition, (entries = []));
  for (const entry of entries) {
    let same =
      entry.configuration === state.configuration && entry.fractions.length === fractions.length;
    for (let i = 0; same && i < fractions.length; i++) same = entry.fractions[i] === fractions[i];
    if (same) return entry.geometry;
  }
  const geometry = buildGeometry(definition, state.configuration, fractions);
  if (entries.length >= GEOMETRY_MEMO_SIZE) entries.shift();
  entries.push({ configuration: state.configuration, fractions, geometry });
  return geometry;
}

/** Run before dispatch so motion consumes its declared motor power. */
export function prepareConfiguration(
  state: ShipSystemsState,
  definition: ShipDefinition,
): ShipSystemsState {
  if (!state.transition) return state;
  const equipment = { ...state.equipment };
  const geometry = getGeometry(state, definition);
  for (const [id, fraction] of Object.entries(geometry.deployment)) {
    const current = equipment[id]!;
    const target = configurationDeployment(definition, state.transition.to, id);
    if (Math.abs(target - fraction) > 1e-12)
      equipment[id] = {
        ...current,
        mode: id.startsWith('solar') ? 'deploying' : 'moving',
        values: { ...current.values, deployment: fraction },
      };
  }
  return { ...state, equipment };
}

/** Powered travel is the single source for position, inertia, hull and cooling. */
export function stepConfiguration(
  state: ShipSystemsState,
  definition: ShipDefinition,
  dt: number,
): { state: ShipSystemsState; events: ShipEvent[] } {
  if (!state.transition) return { state, events: [] };
  const data = dataFor(definition);
  const equipment = { ...state.equipment };
  const geometry = getGeometry(state, definition);
  let remaining = 0;
  for (const [id, fraction] of Object.entries(geometry.deployment)) {
    const current = equipment[id]!;
    const target = configurationDeployment(definition, state.transition.to, id);
    const duration = id.startsWith('solar')
      ? data.configuration.solarDeploymentTime
      : data.radiators.deploymentTime;
    const mode = id.startsWith('solar') ? 'deploying' : 'moving';
    const baselineModes = data.equipment.find((item) => item.id === id)?.modes as
      Record<string, { power: number }> | undefined;
    const motorPower =
      definition.equipment.find((item) => item.id === id)?.params[`mode.${mode}.power`] ??
      baselineModes?.[mode]?.power ??
      Infinity;
    const available =
      !current.tripped &&
      current.condition > 0 &&
      !current.faults.includes('deployment-jam') &&
      (current.values.radiationRestartUntil ?? 0) <= state.t &&
      !current.values.thermalInhibited &&
      current.powerDraw >= motorPower - 1e-9;
    const next = available
      ? fraction +
        Math.sign(target - fraction) * Math.min(Math.abs(target - fraction), dt / duration)
      : fraction;
    const moving = Math.abs(target - next) > 1e-12;
    remaining = Math.max(remaining, Math.abs(target - next) * duration);
    equipment[id] = {
      ...current,
      mode: moving
        ? current.mode
        : id.startsWith('solar')
          ? next > 0
            ? 'deployed'
            : 'stowed'
          : 'hold',
      values: { ...current.values, deployment: next },
    };
  }
  const complete = remaining <= 1e-9;
  return {
    state: {
      ...state,
      equipment,
      configuration: complete ? state.transition.to : state.configuration,
      transition: complete
        ? undefined
        : { ...state.transition, completesAt: state.t + dt + remaining },
    },
    events: complete
      ? [{ kind: 'configuration-changed', t: state.t + dt, configuration: state.transition.to }]
      : [],
  };
}
