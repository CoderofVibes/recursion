/**
 * TRUTH-SIDE AUTHORING ORACLE ONLY. Never import from the player model or a screen.
 * Executes ordinary controls through the real power/thermal/jet allocator and simulation.
 * Knowing the authored route here establishes physical affordability, not player knowledge.
 */
import type { Command } from '../../contracts/commands.ts';
import type { ShipTruth } from '../../contracts/truth/ship.ts';
import type { MassProperties, ShipDefinition } from '../../contracts/ship.ts';
import { midStepMassProperties } from '../../game/truth-step.ts';
import { add, sub, scale, length, cross, type Vec3 } from '../../lib/vec3.ts';
import { rotate, rotateInverse, angleBetween } from '../../lib/quat.ts';
import { createSimulation } from '../../sim/index.ts';
import { sampleLatticeComponent } from '../../sim/fields/lattice.ts';
import { stepShipSystems } from '../../ship/index.ts';
import { getGeometry } from '../../ship/config/index.ts';
import { decodeLatticeFrame } from '../../ship/sensors/lattice-observations.ts';
import { createChainLink } from './index.ts';
import { createChainLinkEnvironment, latticePoseFromShip } from './environment.ts';
import { FENCE_COUNT, FORWARD_EXIT_X, referencePath } from './layout.ts';

export const QUALIFICATION = Object.freeze({
  axialSpeed: 1.4,
  rcsBudget: 100,
  minimumClearance: 16,
  maximumTime: 6500,
  clearanceSamplePeriod: 2.5,
  positionGain: 0.0008,
  velocityGain: 0.05,
});

export interface QualificationReport {
  readonly catalogueIndex: number;
  readonly seed: string;
  readonly contentVersion: string;
  readonly dt: number;
  readonly complete: boolean;
  readonly elapsed: number;
  readonly fenceCount: number;
  readonly rcsUsed: number;
  readonly rcsRemaining: number;
  readonly mainUsed: number;
  readonly hydrogenUsed: number;
  readonly oxygenUsed: number;
  readonly recordedBytes: number;
  readonly recordedLatticeFrames: number;
  readonly minimumContinuousClearance: number;
  readonly minimumRockClearance: number;
  readonly maximumMaterialSpeedBound: number;
  readonly maximumTrackingError: number;
  readonly maximumAttitudeError: number;
  readonly maximumTemperature: Readonly<Record<string, number>>;
  readonly minimumScannerPower: Readonly<Record<string, number>>;
  readonly faults: readonly string[];
  readonly contacts: number;
  readonly finalLocalDatum: Vec3;
  readonly finalLocalVelocity: Vec3;
  readonly commandTicks: number;
}

/** Angular-momentum and force bounds for the continuous-clearance certificate. */
function materialSpeedBound(
  before: ShipTruth,
  after: ShipTruth,
  force: Vec3,
  torque: Vec3,
  dt: number,
  integratedMass: MassProperties,
  definition: ShipDefinition,
): number {
  const mass = integratedMass.mass;
  const moments = integratedMass.inertia.moments;
  const minimumI = Math.min(moments.x, moments.y, moments.z);
  const maximumI = Math.max(moments.x, moments.y, moments.z);
  const w = length(before.kinematics.angularVelocity);
  // |L(t)| <= Imax*|w0|+|torque|*dt in inertial coordinates; divide by Imin.
  // Use exactly the constant midpoint tensor passed to this discrete simulation step.
  // Do not assume endpoint eigenvalues bound an arbitrary deployment's intermediate tensor.
  // The numerical free-body step composes five principal-axis rotations whose stage
  // durations sum to 3*dt. This factor encloses even that split path, as well as
  // shortest-arc interpolation between the actual simulation endpoints.
  const rate = (3 * (maximumI * w + length(torque) * dt)) / minimumI;
  if (!Number.isFinite(rate) || rate < 0) throw new Error('angular-speed enclosure diverged');
  let reach = 0,
    deployment = 0;
  const earlier = before.systems.massProperties,
    later = after.systems.massProperties;
  for (let i = 0; i < later.hull.length; i++) {
    const p = later.hull[i]!,
      old = earlier.hull[i]!;
    for (let j = 0; j < p.outline.length; j++) {
      const xy = p.outline[j]!,
        prior = old.outline[j]!;
      for (const z of [p.zMin, p.zMax]) {
        reach = Math.max(
          reach,
          length(sub({ ...xy, z }, later.centerOfMass)),
          length(sub({ ...prior, z: z === p.zMin ? old.zMin : old.zMax }, earlier.centerOfMass)),
        );
        deployment = Math.max(
          deployment,
          Math.hypot(
            xy.x - prior.x,
            xy.y - prior.y,
            Math.max(Math.abs(p.zMin - old.zMin), Math.abs(p.zMax - old.zMax)),
          ) / dt,
        );
      }
    }
  }
  // Production compact components use mount points; include their actual reach and motion.
  // Appendage vertices and mounts interpolate linearly with deployment in getGeometry.
  const beforePositions = getGeometry(before.systems, definition).positions;
  for (const [id, point] of Object.entries(getGeometry(after.systems, definition).positions)) {
    const old = beforePositions[id]!;
    reach = Math.max(
      reach,
      length(sub(point, later.centerOfMass)),
      length(sub(old, earlier.centerOfMass)),
    );
    deployment = Math.max(deployment, length(sub(point, old)) / dt);
  }
  const shift = length(sub(later.centerOfMass, earlier.centerOfMass)) / dt;
  return (
    length(before.kinematics.velocity) +
    (length(force) / mass) * dt +
    rate * reach +
    deployment +
    shift
  );
}

export interface QualificationOptions {
  readonly catalogueIndex: number;
  readonly seed?: string;
  /** A shorter probe reports complete:false and cannot satisfy the full-flight test. */
  readonly stopAt?: number;
  readonly progress?: (elapsed: number, localX: number, rcsUsed: number) => void;
}

export function qualifyChainLink(options: QualificationOptions): QualificationReport {
  const seed = options.seed ?? 'a16-twenty-controlled';
  const setup = createChainLink(seed, { catalogueIndex: options.catalogueIndex });
  if (setup.definition.world.bodies.some((body) => body.gm !== 0))
    throw new Error('qualification speed enclosure needs the authored zero-gravity local world');
  const simulation = createSimulation(setup.definition.world, {
    dt: setup.definition.dt,
    registry: setup.fieldRegistry,
  });
  const environment = createChainLinkEnvironment(setup);
  const origin = setup.layout.point({ x: 0, y: 0, z: 0 });
  const frame = setup.layout.orientation;
  const initial = simulation.initial.world.ship.systems;
  const rcs = (s: typeof initial) => s.tanks['rcs-left']! + s.tanks['rcs-right']!;
  const localDatum = (ship: ShipTruth) =>
    rotateInverse(
      frame,
      sub(
        sub(ship.kinematics.position, origin),
        rotate(ship.kinematics.attitude, ship.systems.massProperties.centerOfMass),
      ),
    );
  const clamp = (n: number) => Math.max(-0.8, Math.min(0.8, n));
  const minimumScannerPower: Record<string, number> = {
    camera: Infinity,
    'science-processor': Infinity,
    'black-box': Infinity,
  };
  const maximumTemperature: Record<string, number> = { ...initial.thermal };
  let state = simulation.initial;
  let contacts = 0,
    commandTicks = 0,
    recordedLatticeFrames = 0;
  let minimumContinuousClearance = Infinity,
    minimumRockClearance = Infinity;
  let maximumTrackingError = 0,
    maximumAttitudeError = 0,
    maximumMaterialSpeedBound = 0;
  let lastClearance = Infinity,
    lastClearanceAt = 0,
    intervalSpeed = 0;
  let nextClearanceAt = 0,
    nextProgressAt = 1000;
  const faults = new Set<string>();
  const sampleClearance = () => {
    const pose = latticePoseFromShip(state.world.ship, setup.definition.ship);
    let clearance = Infinity;
    for (const component of pose.components)
      clearance = Math.min(
        clearance,
        sampleLatticeComponent(environment.field, pose, component).clearance,
      );
    if (lastClearance !== Infinity) {
      // Every time is within half an interval of one of the two endpoints. Distance is
      // one-Lipschitz in occupied geometry; the rate bound covers all intermediate motion.
      minimumContinuousClearance = Math.min(
        minimumContinuousClearance,
        Math.min(lastClearance, clearance) -
          (intervalSpeed * (state.world.t - lastClearanceAt)) / 2,
      );
    }
    lastClearance = clearance;
    lastClearanceAt = state.world.t;
    intervalSpeed = 0;
  };
  const maxTime = Math.min(QUALIFICATION.maximumTime, options.stopAt ?? Infinity);
  while (state.world.t < maxTime && localDatum(state.world.ship).x < FORWARD_EXIT_X) {
    const before = state.world.ship;
    const local = localDatum(before);
    const velocity = rotateInverse(frame, before.kinematics.velocity);
    const path = referencePath(local.x);
    const ax = Math.max(
      -0.012,
      Math.min(0.012, QUALIFICATION.velocityGain * (QUALIFICATION.axialSpeed - velocity.x)),
    );
    const acceleration = { x: ax, y: 0, z: 0 };
    for (const axis of ['y', 'z'] as const)
      acceleration[axis] =
        path.second[axis] * velocity.x ** 2 +
        path.first[axis] * ax +
        QUALIFICATION.positionGain * (path.position[axis] - local[axis]) +
        QUALIFICATION.velocityGain * (path.first[axis] * velocity.x - velocity[axis]);
    const force = rotateInverse(
      before.kinematics.attitude,
      rotate(frame, scale(acceleration, before.systems.massProperties.mass)),
    );
    const commands: Command[] = [
      {
        kind: 'fly',
        input: {
          translate: { x: clamp(force.x / 800), y: clamp(force.y / 400), z: clamp(force.z / 800) },
          yaw: 0,
          pitch: 0,
          throttle: 0,
        },
      },
    ];
    if (state.tick === 0)
      commands.unshift(
        ...setup.arrivalCommands,
        { kind: 'configure', configuration: 'allDeployed' },
        { kind: 'mode', equipment: 'camera', mode: 'detail' },
        { kind: 'power', equipment: 'camera', allocation: 200 },
        { kind: 'mode', equipment: 'science-processor', mode: 'lattice' },
        { kind: 'power', equipment: 'science-processor', allocation: 1000 },
        { kind: 'recorder', sampleRate: 10 },
      );
    commandTicks++;
    if (state.world.t + 1e-8 >= nextClearanceAt) {
      sampleClearance();
      nextClearanceAt += QUALIFICATION.clearanceSamplePeriod;
    }
    const systems = stepShipSystems(
      before.systems,
      setup.definition.ship,
      commands,
      environment.at(state),
      simulation.dt,
    );
    for (const event of systems.events)
      if (
        event.kind === 'command-rejected' ||
        event.kind === 'equipment-fault' ||
        event.kind === 'breaker-trip'
      )
        faults.add(JSON.stringify(event));
    for (const measurement of systems.measurements)
      if (decodeLatticeFrame(measurement)) recordedLatticeFrames++;
    const massProperties = midStepMassProperties(
      before.systems.massProperties,
      systems.actuators.massProperties,
    );
    const stepped = simulation.step(state, {
      systems: systems.state,
      actuators: { ...systems.actuators, massProperties },
    });
    contacts += stepped.contacts.filter((c) => c.impact).length;
    minimumRockClearance = Math.min(
      minimumRockClearance,
      stepped.minClearance?.distance ?? Infinity,
    );
    state = {
      ...stepped.state,
      world: { ...stepped.state.world, sun: setup.definition.world.sun },
    };
    let netForce: Vec3 = { x: 0, y: 0, z: 0 },
      netTorque = systems.actuators.torque;
    for (const thrust of systems.actuators.thrusts) {
      netForce = add(netForce, thrust.force);
      netTorque = add(
        netTorque,
        cross(sub(thrust.point, massProperties.centerOfMass), thrust.force),
      );
    }
    const speedBound = materialSpeedBound(
      before,
      state.world.ship,
      netForce,
      netTorque,
      simulation.dt,
      massProperties,
      setup.definition.ship,
    );
    intervalSpeed = Math.max(intervalSpeed, speedBound);
    maximumMaterialSpeedBound = Math.max(maximumMaterialSpeedBound, speedBound);
    maximumTrackingError = Math.max(
      maximumTrackingError,
      Math.hypot(path.position.y - local.y, path.position.z - local.z),
    );
    maximumAttitudeError = Math.max(
      maximumAttitudeError,
      angleBetween(frame, state.world.ship.kinematics.attitude),
    );
    for (const [node, temperature] of Object.entries(systems.state.thermal))
      maximumTemperature[node] = Math.max(maximumTemperature[node]!, temperature);
    if (state.world.t >= 35)
      for (const id of Object.keys(minimumScannerPower))
        minimumScannerPower[id] = Math.min(
          minimumScannerPower[id]!,
          systems.state.equipment[id]!.powerDraw,
        );
    if (state.world.t >= nextProgressAt) {
      options.progress?.(state.world.t, local.x, rcs(initial) - rcs(systems.state));
      nextProgressAt += 1000;
    }
  }
  sampleClearance();
  const final = state.world.ship.systems;
  return {
    catalogueIndex: options.catalogueIndex,
    seed,
    contentVersion: setup.contentVersion,
    dt: simulation.dt,
    complete: localDatum(state.world.ship).x >= FORWARD_EXIT_X,
    elapsed: state.world.t,
    fenceCount: FENCE_COUNT,
    rcsUsed: rcs(initial) - rcs(final),
    rcsRemaining: rcs(final),
    mainUsed: initial.tanks['main-propellant']! - final.tanks['main-propellant']!,
    hydrogenUsed: initial.tanks['fuel-cell-hydrogen']! - final.tanks['fuel-cell-hydrogen']!,
    oxygenUsed: initial.tanks['fuel-cell-oxygen']! - final.tanks['fuel-cell-oxygen']!,
    recordedBytes: final.recorder.bytesUsed - initial.recorder.bytesUsed,
    recordedLatticeFrames,
    minimumContinuousClearance,
    minimumRockClearance,
    maximumMaterialSpeedBound,
    maximumTrackingError,
    maximumAttitudeError,
    maximumTemperature,
    minimumScannerPower,
    faults: [...faults],
    contacts,
    finalLocalDatum: localDatum(state.world.ship),
    finalLocalVelocity: rotateInverse(frame, state.world.ship.kinematics.velocity),
    commandTicks,
  };
}
