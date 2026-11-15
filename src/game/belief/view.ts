/**
 * BELIEF side (no truth imports). Builds the `ViewSnapshot` the console and 3D view receive,
 * from the believed world, recorded commands and Black Box records only (P11). The window
 * (`ViewSnapshot.window`) is the one part that is not belief: the session passes it through
 * from the truth-side `window.ts`, already reduced to what an eye can see.
 */

import type {
  AttemptOverlay,
  BelievedWorld,
  Command,
  CoverageLook,
  EquipmentId,
  Forecast,
  HandsOnInput,
  Objective,
  Selection,
  SensorCone,
  ShipDefinition,
  ThrustTick,
  TrailPoint,
  ViewSnapshot,
  WindowView,
} from '../../contracts/index.ts';
import { isHandsOnNeutral } from '../../contracts/index.ts';
import { rotate } from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';

/** [ASSUMED] Display values for the camera's coverage cone: its reach, m. */
const CAMERA_HALF_ANGLE = Math.PI / 6;
export const CAMERA_RANGE = 6_000_000;

const UNIT_X: Vec3 = { x: 1, y: 0, z: 0 };

/**
 * What the ship was last told to do, kept from executed commands (never from truth): which
 * burns are commanded now, what the hands-on controls are asking for and where the camera was
 * pointed.
 */
export interface CommandedState {
  readonly burns: readonly {
    readonly thruster: string;
    readonly throttle: number;
    readonly until: number;
  }[];
  /**
   * The hands-on controls as last executed, while any of them is held, and the thrusters cut
   * off since (a cut-off thruster stays quiet until the controls next change).
   */
  readonly handsOn?: { readonly input: HandsOnInput; readonly cut: readonly EquipmentId[] };
  readonly pointing: Readonly<
    Record<string, { readonly target: string | null; readonly direction?: Vec3 }>
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
    case 'cutoff': {
      const { handsOn, ...rest } = state;
      return {
        ...rest,
        burns: state.burns.filter(
          (b) => command.thruster !== 'all' && b.thruster !== command.thruster,
        ),
        // Cutting everything off also stops whatever the controls were asking for.
        ...(handsOn && command.thruster !== 'all'
          ? { handsOn: { ...handsOn, cut: [...handsOn.cut, command.thruster] } }
          : {}),
      };
    }
    case 'fly': {
      const { handsOn: _released, ...rest } = state;
      return isHandsOnNeutral(command.input)
        ? rest
        : { ...rest, handsOn: { input: command.input, cut: [] } };
    }
    case 'point':
      return {
        ...state,
        pointing: {
          ...state.pointing,
          [command.sensor]: {
            target: command.target,
            ...(command.direction !== undefined ? { direction: command.direction } : {}),
          },
        },
      };
    default:
      return state;
  }
}

/**
 * Commanded thrust right now, at its points of application: every timed burn still running,
 * and the thrusters the hands-on controls fire (`handsOn`, worked out by the session from the
 * executed input and the nominal design).
 */
function thrustTicks(
  definition: ShipDefinition,
  commanded: CommandedState,
  t: number,
  handsOn: readonly ThrustTick[],
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
  const cut = commanded.handsOn?.cut ?? [];
  for (const tick of handsOn) if (!cut.includes(tick.source)) ticks.push(tick);
  return ticks;
}

const unit = (v: Vec3): Vec3 | undefined => {
  const length = Math.hypot(v.x, v.y, v.z);
  return length > 0 ? { x: v.x / length, y: v.y / length, z: v.z / length } : undefined;
};

/**
 * Where the ship's cameras can look right now, as commanded: one cone per camera that is on
 * and drawing power, along its believed axis, with its half-angle from the design.
 */
export function sensorCones(
  definition: ShipDefinition,
  commanded: CommandedState,
  world: BelievedWorld,
): SensorCone[] {
  const cones: SensorCone[] = [];
  for (const spec of definition.equipment) {
    if (spec.kind !== 'optical-tracker') continue;
    const status = world.ship.equipment[spec.id];
    if (!status || status.mode === 'off' || status.powerDraw <= 0) continue;
    const aim = commanded.pointing[spec.id];
    const target = aim?.target
      ? (world.bodies.find((b) => b.id === aim.target) ??
        world.asteroids.find((a) => a.id === aim.target))
      : undefined;
    // Where the camera looks, as commanded: at the believed position of its target, along its
    // commanded direction, or along its mount's boresight carried by the believed attitude.
    const toTarget = target
      ? unit({
          x: target.position.x - world.ship.position.x,
          y: target.position.y - world.ship.position.y,
          z: target.position.z - world.ship.position.z,
        })
      : undefined;
    const axis =
      toTarget ??
      (aim?.direction ? unit(aim.direction) : undefined) ??
      rotate(world.ship.attitude, spec.mount?.direction ?? UNIT_X);
    cones.push({
      sensor: spec.id,
      axis,
      halfAngle: spec.params.fovHalfAngle ?? CAMERA_HALF_ANGLE,
      range: CAMERA_RANGE,
      quality: Math.max(0, Math.min(1, status.powerDraw / spec.ratedPower)),
    });
  }
  return cones;
}

/** Objectives with a moving target follow that target's believed position. */
function placeObjectives(objectives: readonly Objective[], world: BelievedWorld): Objective[] {
  return objectives.map((objective) => {
    if (!objective.target || !objective.region) return objective;
    const target: { position: Vec3 } | undefined =
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
  /** The thrusters the hands-on controls fire, as designed (empty while they are released). */
  readonly handsOn?: readonly ThrustTick[];
  readonly trail: readonly TrailPoint[];
  readonly forecasts: readonly Forecast[];
  readonly objectives: readonly Objective[];
  readonly compare?: readonly [AttemptOverlay, AttemptOverlay];
  readonly selection?: Selection;
  /** What the eye sees outside, from the truth-side window module. */
  readonly window?: WindowView;
  /** Coverage sensed in earlier attempts of this encounter, from Black Box (`coverage.ts`). */
  readonly coverageEarlier?: readonly CoverageLook[];
}

export function buildViewSnapshot(inputs: ViewInputs): ViewSnapshot {
  const { world, definition, commanded } = inputs;
  return {
    t: inputs.t,
    paused: inputs.paused,
    warp: inputs.warp,
    world,
    ship: {
      // Geometry from the believed mass properties: the hull of the configuration in force and
      // the centre of mass from the design and the gauged tanks.
      hull: world.ship.massProperties.hull,
      centerOfMass: world.ship.massProperties.centerOfMass,
      thrust: thrustTicks(definition, commanded, inputs.t, inputs.handsOn ?? []),
    },
    trail: inputs.trail,
    forecasts: inputs.forecasts,
    coverage: { cones: sensorCones(definition, commanded, world) },
    objectives: placeObjectives(inputs.objectives, world),
    ...(inputs.compare ? { compare: inputs.compare } : {}),
    ...(inputs.selection ? { selection: inputs.selection } : {}),
    ...(inputs.window ? { window: inputs.window } : {}),
    ...(inputs.coverageEarlier && inputs.coverageEarlier.length > 0
      ? { coverageEarlier: inputs.coverageEarlier }
      : {}),
  };
}
