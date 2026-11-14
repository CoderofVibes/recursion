/**
 * BELIEF side (no truth imports). Builds the `ViewSnapshot` the console and 3D view receive,
 * from the believed world, recorded commands and Black Box records only (P11).
 */

import type {
  AttemptOverlay,
  BelievedWorld,
  Command,
  Forecast,
  Objective,
  Selection,
  SensorSector,
  ShipDefinition,
  ThrustTick,
  TrailPoint,
  ViewSnapshot,
} from '../../contracts/index.ts';
import type { Vec2 } from '../../lib/vec2.ts';

/** [ASSUMED] Display values for the camera's coverage sector. */
const CAMERA_HALF_WIDTH = Math.PI / 6;
const CAMERA_RANGE = 6_000_000;

/**
 * What the ship was last told to do, kept from executed commands (never from truth): which
 * burns are commanded now and where the camera was pointed.
 */
export interface CommandedState {
  readonly burns: readonly {
    readonly thruster: string;
    readonly throttle: number;
    readonly until: number;
  }[];
  readonly pointing: Readonly<
    Record<string, { readonly target: string | null; readonly angle?: number }>
  >;
}

export const initialCommandedState: CommandedState = { burns: [], pointing: {} };

/** Fold one executed command into the commanded state. */
export function applyCommanded(state: CommandedState, t: number, command: Command): CommandedState {
  switch (command.kind) {
    case 'burn':
      return {
        ...state,
        burns: [
          ...state.burns.filter((b) => b.thruster !== command.thruster && b.until > t),
          { thruster: command.thruster, throttle: command.throttle, until: t + command.duration },
        ],
      };
    case 'cutoff':
      return {
        ...state,
        burns: state.burns.filter(
          (b) => command.thruster !== 'all' && b.thruster !== command.thruster,
        ),
      };
    case 'point':
      return {
        ...state,
        pointing: {
          ...state.pointing,
          [command.sensor]: {
            target: command.target,
            ...(command.angle !== undefined ? { angle: command.angle } : {}),
          },
        },
      };
    default:
      return state;
  }
}

function thrustTicks(
  definition: ShipDefinition,
  commanded: CommandedState,
  t: number,
): ThrustTick[] {
  const ticks: ThrustTick[] = [];
  for (const burn of commanded.burns) {
    if (burn.until <= t) continue;
    const spec = definition.equipment.find((e) => e.id === burn.thruster);
    if (!spec?.mount) continue;
    ticks.push({
      source: spec.id,
      point: spec.mount.position,
      direction: spec.mount.direction,
      magnitude: (spec.params.thrust ?? 0) * burn.throttle,
    });
  }
  return ticks;
}

function coverage(
  definition: ShipDefinition,
  commanded: CommandedState,
  world: BelievedWorld,
): SensorSector[] {
  const sectors: SensorSector[] = [];
  for (const spec of definition.equipment) {
    if (spec.kind !== 'optical-tracker') continue;
    const status = world.ship.equipment[spec.id];
    if (!status || status.mode === 'off' || status.powerDraw <= 0) continue;
    const aim = commanded.pointing[spec.id];
    const target = aim?.target
      ? (world.bodies.find((b) => b.id === aim.target) ??
        world.asteroids.find((a) => a.id === aim.target))
      : undefined;
    const boresight = spec.mount ? Math.atan2(spec.mount.direction.y, spec.mount.direction.x) : 0;
    const center = target
      ? Math.atan2(
          target.position.y - world.ship.position.y,
          target.position.x - world.ship.position.x,
        )
      : (aim?.angle ?? world.ship.attitude + boresight);
    sectors.push({
      sensor: spec.id,
      center,
      halfWidth: spec.params.fovHalfAngle ?? CAMERA_HALF_WIDTH,
      range: CAMERA_RANGE,
      quality: Math.max(0, Math.min(1, status.powerDraw / spec.ratedPower)),
    });
  }
  return sectors;
}

/** Objectives with a moving target follow that target's believed position. */
function placeObjectives(objectives: readonly Objective[], world: BelievedWorld): Objective[] {
  return objectives.map((objective) => {
    if (!objective.target || !objective.region) return objective;
    const target: { position: Vec2 } | undefined =
      world.bodies.find((b) => b.id === objective.target) ??
      world.asteroids.find((a) => a.id === objective.target);
    return target
      ? { ...objective, region: { ...objective.region, center: target.position } }
      : objective;
  });
}

export interface ViewInputs {
  readonly t: number;
  readonly paused: boolean;
  readonly warp: number;
  readonly world: BelievedWorld;
  readonly definition: ShipDefinition;
  readonly commanded: CommandedState;
  readonly trail: readonly TrailPoint[];
  readonly forecasts: readonly Forecast[];
  readonly objectives: readonly Objective[];
  readonly compare?: readonly [AttemptOverlay, AttemptOverlay];
  readonly selection?: Selection;
}

export function buildViewSnapshot(inputs: ViewInputs): ViewSnapshot {
  const { world, definition, commanded } = inputs;
  return {
    t: inputs.t,
    paused: inputs.paused,
    warp: inputs.warp,
    world,
    ship: {
      footprint: world.ship.massProperties.footprint,
      centerOfMass: world.ship.massProperties.centerOfMass,
      thrust: thrustTicks(definition, commanded, inputs.t),
    },
    trail: inputs.trail,
    forecasts: inputs.forecasts,
    coverage: { sectors: coverage(definition, commanded, world) },
    objectives: placeObjectives(inputs.objectives, world),
    ...(inputs.compare ? { compare: inputs.compare } : {}),
    ...(inputs.selection ? { selection: inputs.selection } : {}),
  };
}
