import baseline from '../../../data/ship-baseline.json';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { cross, lerp, sub, type Vec2 } from '../../lib/vec2.ts';

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const vector = (p: readonly number[]): Vec2 => ({ x: p[0] ?? 0, y: p[1] ?? 0 });
const dataFor = (definition: ShipDefinition) =>
  (definition.systems ?? baseline) as unknown as typeof baseline;

/** The conservative occupied envelope, counter-clockwise, including space between wings. */
function convexHull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter(
    (p, i) => i === 0 || p.x !== sorted[i - 1]!.x || p.y !== sorted[i - 1]!.y,
  );
  if (unique.length < 3) return unique;
  const chain = (items: readonly Vec2[]) => {
    const result: Vec2[] = [];
    for (const point of items) {
      while (
        result.length > 1 &&
        cross(sub(result.at(-1)!, result.at(-2)!), sub(point, result.at(-1)!)) <= 0
      )
        result.pop();
      result.push(point);
    }
    return result.slice(0, -1);
  };
  return [...chain(unique), ...chain([...unique].reverse())];
}

export function configurationDeployment(
  definition: ShipDefinition,
  configuration: string,
  id: string,
): number {
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

export function getGeometry(state: ShipSystemsState, definition: ShipDefinition) {
  const data = dataFor(definition);
  const configuration = definition.configurations.find((c) => c.id === state.configuration);
  const positions: Record<string, Vec2> = {};
  const intrinsicInertia: Record<string, number> = {};
  const deployment: Record<string, number> = {};
  for (const equipment of definition.equipment) {
    positions[equipment.id] =
      configuration?.equipmentPositions?.[equipment.id] ?? equipment.position;
    intrinsicInertia[equipment.id] = equipment.params.intrinsicInertia ?? 0;
  }
  const points = data.ship.footprints.stowed.map(vector);
  for (const appendage of data.configuration.appendages) {
    if (!state.equipment[appendage.id]) continue;
    const fraction = clamp(
      state.equipment[appendage.id]!.values.deployment ??
        configurationDeployment(definition, state.configuration, appendage.id),
    );
    deployment[appendage.id] = fraction;
    positions[appendage.id] = lerp(
      vector(appendage.stowedPosition),
      vector(appendage.deployedPosition),
      fraction,
    );
    intrinsicInertia[appendage.id] =
      appendage.stowedInertia + fraction * (appendage.deployedInertia - appendage.stowedInertia);
    points.push(
      ...appendage.stowedPolygon.map((p, i) =>
        lerp(vector(p), vector(appendage.deployedPolygon[i]!), fraction),
      ),
    );
  }
  return { positions, intrinsicInertia, deployment, footprint: convexHull(points) };
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

/** Powered travel is the single source for position, inertia, footprint and cooling. */
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
      !current.tripped && current.condition > 0 && current.powerDraw >= motorPower - 1e-9;
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
