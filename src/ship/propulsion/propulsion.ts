import baseline from '../../../data/ship-baseline.json';
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type {
  EnvironmentEffects,
  ShipSystemsState,
  ThrustOutput,
} from '../../contracts/truth/ship.ts';
import { yawOf } from '../../lib/quat.ts';
import { cross, rotate, scale, sub, wrapAngle, type Vec2 } from '../../lib/vec2.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { getGeometry } from '../config/configuration.ts';
import { computeMassProperties, yawInertia } from '../massprops/massprops.ts';

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const dataFor = (definition: ShipDefinition) =>
  (definition.systems ?? baseline) as unknown as typeof baseline;
interface Control {
  jet: number;
  throttle: number;
}

function attitudeControl(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
): Record<string, Control> {
  const target = state.attitudeTarget;
  if (target.reference !== 'inertial' && target.reference !== 'rate') return {};
  const data = dataFor(definition);
  const inertia = yawInertia(computeMassProperties(state, definition).inertia);
  // LIFT(2G): one-axis control. Only yaw (about body z) is held or turned; the x and y parts of
  // a rate target and the pitch and roll of an inertial target are ignored.
  const angularRate = env.kinematics.angularVelocity.z;
  // [ASSUMED] 5 s damping and 25 s attitude stiffness; actuator limits still apply.
  const acceleration =
    target.reference === 'rate'
      ? 0.4 * (target.rate.z - angularRate)
      : 0.04 * wrapAngle(yawOf(target.attitude) - yawOf(env.kinematics.attitude)) -
        0.4 * angularRate;
  const demand = inertia * acceleration;
  if (Math.abs(demand) < 1e-9) return {};
  const jetIndex = demand > 0 ? 1 : 0;
  const geometry = getGeometry(state, definition);
  const jets = data.propulsion.rcs.jets.filter(
    (jet) => jet.bank === 'a' && jet.id.endsWith(`-${jetIndex}`),
  );
  // LIFT(2G): torque capacity about body z only, from the planar parts of lever arm and force.
  const capacity = Math.abs(
    jets.reduce(
      (total, jet) =>
        total +
        cross(
          sub(geometry.positions[jet.equipmentId]!, state.massProperties.centerOfMass),
          scale({ x: jet.direction[0]!, y: jet.direction[1]! }, data.propulsion.rcs.thrustPerJet),
        ),
      0,
    ),
  );
  if (capacity === 0) return {};
  return Object.fromEntries(
    jets.map((jet) => [
      jet.equipmentId,
      { jet: jetIndex, throttle: clamp(Math.abs(demand) / capacity) },
    ]),
  );
}

/** Reserve valve power before dispatch. Attitude control uses the installed RCS jets, never free torque. */
export function preparePropulsion(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
): ShipSystemsState {
  const equipment = { ...state.equipment };
  const control = attitudeControl(state, definition, env);
  for (const spec of definition.equipment) {
    if (spec.kind !== 'main-engine' && spec.kind !== 'rcs-thruster') continue;
    const current = equipment[spec.id];
    if (!current) continue;
    const burn = state.burns.find(
      (b) => b.thruster === spec.id && b.until > state.t && b.throttle > 0,
    );
    const automatic =
      control[spec.id] &&
      current.values.controlInhibited !== 1 &&
      !['off', 'heater'].includes(current.mode);
    const firing = burn || automatic || (current.values.pulseRemaining ?? 0) > 0;
    const mode = firing
      ? spec.kind === 'rcs-thruster'
        ? 'fire-one'
        : 'firing'
      : ['firing', 'fire-one', 'fire-two'].includes(current.mode)
        ? 'ready'
        : current.mode;
    equipment[spec.id] = { ...current, mode };
  }
  return {
    ...state,
    equipment,
    ext: {
      ...state.ext,
      'propulsion.control': control as unknown as Record<string, { jet: number; throttle: number }>,
    },
  };
}

/** Draw equally from available feeds, redistributing when one becomes empty. */
function consume(tanks: Record<string, number>, ids: readonly string[], requested: number): number {
  let remaining = requested;
  let active = ids.filter((id) => (tanks[id] ?? 0) > 0);
  while (remaining > 1e-12 && active.length > 0) {
    const share = remaining / active.length;
    let used = 0;
    for (const id of active) {
      const amount = Math.min(tanks[id]!, share);
      tanks[id] = Math.max(0, tanks[id]! - amount);
      used += amount;
    }
    remaining = Math.max(0, remaining - used);
    active = active.filter((id) => tanks[id]! > 1e-12);
  }
  return requested - remaining;
}

export function stepPropulsion(
  state: ShipSystemsState,
  definition: ShipDefinition,
  _env: EnvironmentEffects,
  dt: number,
): { state: ShipSystemsState; thrusts: ThrustOutput[]; torque: Vec3; events: ShipEvent[] } {
  const data = dataFor(definition);
  const equipment = { ...state.equipment };
  const tanks = { ...state.tanks };
  const events: ShipEvent[] = [];
  const thrusts: ThrustOutput[] = [];
  const geometry = getGeometry(state, definition);
  const mass = computeMassProperties(state, definition);
  const control = (state.ext?.['propulsion.control'] ?? {}) as unknown as Record<string, Control>;
  const controllerPowered = definition.equipment.some(
    (spec) =>
      spec.id.startsWith('flight-cpu') &&
      equipment[spec.id]?.mode === 'active' &&
      (equipment[spec.id]?.powerDraw ?? 0) >= (spec.params['mode.active.power'] ?? 120) - 1e-9 &&
      !equipment[spec.id]?.tripped &&
      (equipment[spec.id]?.condition ?? 0) > 0,
  );
  for (const spec of definition.equipment) {
    const isRcs = spec.kind === 'rcs-thruster';
    if (!isRcs && spec.id !== data.propulsion.main.equipmentId) continue;
    const current = equipment[spec.id];
    if (!current) continue;
    const values = { ...current.values };
    const baselineModes = data.equipment.find((item) => item.id === spec.id)?.modes as
      Record<string, { power: number }> | undefined;
    const modePower = (mode: string) =>
      spec.params[`mode.${mode}.power`] ?? baselineModes?.[mode]?.power ?? Infinity;
    const burn = state.burns.find((b) => b.thruster === spec.id && b.until > state.t);
    const automatic =
      !burn &&
      controllerPowered &&
      control[spec.id] &&
      current.values.controlInhibited !== 1 &&
      !['off', 'heater'].includes(current.mode)
        ? control[spec.id]
        : undefined;
    const nominalThrust = isRcs ? data.propulsion.rcs.thrustPerJet : data.propulsion.main.thrust;
    const minimumImpulse = isRcs
      ? data.propulsion.rcs.minimumImpulsePerJet
      : data.propulsion.main.minimumImpulse;
    const isp = isRcs ? data.propulsion.rcs.Isp : data.propulsion.main.Isp;
    const temperature =
      current.temperature ??
      (spec.thermalNode ? state.thermal[spec.thermalNode] : undefined) ??
      293;
    const operational =
      !current.tripped &&
      current.condition > 0 &&
      current.mode !== 'off' &&
      temperature >= (spec.params.tempMin ?? 0) &&
      temperature < (spec.params.tempMax ?? Infinity);
    if (isRcs) {
      const readinessPower = modePower(current.mode === 'heater' ? 'heater' : 'ready');
      values.readyTime =
        operational &&
        current.powerDraw >= readinessPower &&
        temperature >= data.propulsion.rcs.warmupTemperature
          ? Math.min(data.propulsion.rcs.warmupTime, (values.readyTime ?? 0) + dt)
          : 0;
    }
    const firingPower = modePower(isRcs ? 'fire-one' : 'firing');
    const ready =
      operational &&
      current.powerDraw >= firingPower - 1e-9 &&
      (!isRcs ||
        (temperature >= data.propulsion.rcs.warmupTemperature &&
          (current.values.readyTime ?? 0) >= data.propulsion.rcs.warmupTime));
    const activeTime = burn ? Math.min(dt, Math.max(0, burn.until - state.t)) : automatic ? dt : 0;
    const throttle = clamp(burn?.throttle ?? automatic?.throttle ?? 0);
    let pending = values.pendingImpulse ?? 0;
    let pulse = values.pulseRemaining ?? 0;
    let firingTime = 0;
    if (ready) {
      pending += nominalThrust * throttle * activeTime;
      let availableTime = dt;
      // Continue committed minimum pulses across small simulation ticks.
      const continuation = Math.min(availableTime, pulse);
      firingTime += continuation;
      pulse -= continuation;
      availableTime -= continuation;
      const pulseDuration = minimumImpulse / nominalThrust;
      const wholePulses = Math.floor((pending + 1e-9) / minimumImpulse);
      const neededPulses = Math.ceil(Math.max(0, availableTime - 1e-12) / pulseDuration);
      const startedPulses = Math.min(wholePulses, neededPulses);
      const duration = startedPulses * pulseDuration;
      pending = Math.max(0, pending - startedPulses * minimumImpulse);
      firingTime += Math.min(availableTime, duration);
      pulse += Math.max(0, duration - availableTime);
    } else {
      pending = 0;
      pulse = 0;
    }
    if (!burn && !automatic) {
      values.unservedImpulse = (values.unservedImpulse ?? 0) + pending;
      pending = 0;
    }
    const thrustScale = Math.max(0, values.thrustScale ?? 1) * clamp(current.condition);
    const requestedImpulse = nominalThrust * thrustScale * firingTime;
    const selectedJet = Math.round(automatic?.jet ?? values.selectedJet ?? 0);
    const bank = (values.bank ?? 0) === 1 ? 'b' : 'a';
    const jet = isRcs
      ? data.propulsion.rcs.jets.find(
          (j) => j.equipmentId === spec.id && j.bank === bank && j.id.endsWith(`-${selectedJet}`),
        )
      : undefined;
    const resources = isRcs ? (jet?.resourceIds ?? []) : data.propulsion.main.resourceIds;
    const feeds = resources.filter((id) => values[`feed.${id}`] !== 0);
    const usedMass = consume(tanks, feeds, requestedImpulse / (isp * data.constants.g0.value));
    const impulse = usedMass * isp * data.constants.g0.value;
    if (impulse + 1e-8 < requestedImpulse) {
      values.unservedImpulse = (values.unservedImpulse ?? 0) + requestedImpulse - impulse;
      pending = 0;
      pulse = 0;
    }
    // LIFT(2G): thrust directions, mount misalignment and gimbal stay in the body x–y plane
    // (rotations about z); forces leave with z = 0.
    let direction: Vec2 = isRcs
      ? { x: jet?.direction[0] ?? 0, y: jet?.direction[1] ?? 0 }
      : { x: data.propulsion.main.direction[0]!, y: data.propulsion.main.direction[1]! };
    const point = geometry.positions[spec.id] ?? spec.mount?.position ?? spec.position;
    const misalignment =
      values.misalignment ??
      spec.params.mountMisalignment ??
      (isRcs ? data.propulsion.rcs.mountMisalignment : data.propulsion.main.mountMisalignment);
    if (!isRcs) {
      const ideal =
        Math.atan2(mass.centerOfMass.y - point.y, mass.centerOfMass.x - point.x) - misalignment;
      const targetGimbal = clamp(
        ideal,
        -data.propulsion.main.gimbalLimit,
        data.propulsion.main.gimbalLimit,
      );
      const previous = values.gimbal ?? 0;
      const gimbal = ready
        ? previous +
          clamp(
            targetGimbal - previous,
            -data.propulsion.main.gimbalRate * dt,
            data.propulsion.main.gimbalRate * dt,
          )
        : previous;
      values.gimbal = gimbal;
      direction = rotate(direction, misalignment + gimbal);
    } else direction = rotate(direction, misalignment);
    if (impulse > 0) {
      const force = scale(direction, impulse / dt);
      thrusts.push({ source: spec.id, point, force: { x: force.x, y: force.y, z: 0 } });
    }
    values.pendingImpulse = pending;
    values.pulseRemaining = pulse;
    values.impulse = impulse;
    values.massFlow = usedMass / dt;
    const chemicalHeat = isRcs
      ? data.propulsion.rcs.chemicalHeatPerFiringJet
      : data.propulsion.main.chemicalHeatAtFullThrust;
    values.heat = current.powerDraw + chemicalHeat * (impulse / (nominalThrust * dt));
    equipment[spec.id] = { ...current, values };
  }
  for (const tank of definition.tanks) {
    const previous = state.tanks[tank.id] ?? 0;
    const remaining = tanks[tank.id] ?? 0;
    if (previous > 0 && remaining <= 1e-12)
      events.push({ kind: 'propellant-depleted', t: state.t + dt, tank: tank.id });
    else if (previous > tank.capacity * 0.1 && remaining <= tank.capacity * 0.1)
      events.push({ kind: 'propellant-low', t: state.t + dt, tank: tank.id });
  }
  const next = {
    ...state,
    equipment,
    tanks,
    burns: state.burns.filter((burn) => burn.until > state.t + dt),
  };
  return {
    state: { ...next, massProperties: computeMassProperties(next, definition) },
    thrusts,
    torque: { x: 0, y: 0, z: 0 },
    events,
  };
}
