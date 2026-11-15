import baseline from '../../../data/ship-baseline.json';
import type { HandsOnInput } from '../../contracts/commands.ts';
import type { EquipmentSpec, ShipDefinition } from '../../contracts/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type {
  EnvironmentEffects,
  ShipSystemsState,
  ThrustOutput,
} from '../../contracts/truth/ship.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { normalize } from '../../lib/quat.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { getGeometry } from '../config/configuration.ts';
import { computeMassProperties, massDetail } from '../massprops/massprops.ts';
import { allocateJets, type AllocatorJet } from './allocator.ts';
import { attitudeTorque, controlSettings, handsOnForce, ratesNulled } from './control.ts';
import {
  activeJets,
  CONTROL_KEY,
  controlOf,
  PULSES_KEY,
  pulsesOf,
  type Jet,
  type JetPulse,
} from './jets.ts';

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
/** −0 becomes +0, so a stored value is unchanged by a JSON round trip (replays stay exact). */
const unsigned = (value: number) => value + 0;
const dataFor = (definition: ShipDefinition) =>
  (definition.systems ?? baseline) as unknown as typeof baseline;

/** `ext.handsOnHold`: released controls first null the rates ('pending'), then hold ('held'). */
export const HANDS_ON_HOLD_KEY = 'handsOnHold';

/** One thruster the propulsion step fires, with what never changes about it. */
interface Thruster {
  readonly spec: EquipmentSpec;
  readonly isRcs: boolean;
  /** Power each mode needs: the spec's `mode.<m>.power`, else the baseline's, else ∞. */
  readonly modePower: (mode: string) => number;
}
/**
 * The propulsion facts of a design, indexed once (S15 rank 1): the thrusters in the
 * definition's order, the flight computers, and each thruster's mode powers. Values only.
 */
interface PropulsionTables {
  /** RCS pods and the main engine, as `stepPropulsion` fires them. */
  readonly thrusters: readonly Thruster[];
  /** Main engines and RCS pods by kind, as `preparePropulsion` sets their modes. */
  readonly byKind: readonly EquipmentSpec[];
  /** RCS pods, for the controller. */
  readonly pods: readonly EquipmentSpec[];
  /** Flight computers, each with the power it needs to run the controller. */
  readonly computers: readonly { readonly spec: EquipmentSpec; readonly power: number }[];
}
const propulsionTables = new WeakMap<ShipDefinition, PropulsionTables>();

function tablesOf(definition: ShipDefinition): PropulsionTables {
  let tables = propulsionTables.get(definition);
  if (!tables) {
    const data = dataFor(definition);
    const thrusters: Thruster[] = [];
    for (const spec of definition.equipment) {
      const isRcs = spec.kind === 'rcs-thruster';
      if (!isRcs && spec.id !== data.propulsion.main.equipmentId) continue;
      const baselineModes = data.equipment.find((item) => item.id === spec.id)?.modes as
        Record<string, { power: number }> | undefined;
      const powers = new Map<string, number>();
      const modePower = (mode: string): number => {
        let power = powers.get(mode);
        if (power === undefined) {
          power = spec.params[`mode.${mode}.power`] ?? baselineModes?.[mode]?.power ?? Infinity;
          powers.set(mode, power);
        }
        return power;
      };
      thrusters.push({ spec, isRcs, modePower });
    }
    tables = {
      thrusters,
      byKind: definition.equipment.filter(
        (spec) => spec.kind === 'main-engine' || spec.kind === 'rcs-thruster',
      ),
      pods: definition.equipment.filter((spec) => spec.kind === 'rcs-thruster'),
      computers: definition.equipment
        .filter((spec) => spec.id.startsWith('flight-cpu'))
        .map((spec) => ({ spec, power: spec.params['mode.active.power'] ?? 120 })),
    };
    propulsionTables.set(definition, tables);
  }
  return tables;
}

/**
 * A thrust direction turned by a mount or gimbal error: `yaw` about body +z (toward +y for a
 * +x thruster), `pitch` about body −y (toward +z). With pitch 0 this is the planar rotation.
 */
export function tiltDirection(direction: Vec3, yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const x = direction.x * cp - direction.z * sp;
  const z = direction.x * sp + direction.z * cp;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return { x: x * cy - direction.y * sy, y: x * sy + direction.y * cy, z };
}

/** Can the attitude and hands-on controller count on this pod's jets this step? */
function podAvailable(
  state: ShipSystemsState,
  spec: EquipmentSpec,
  data: typeof baseline,
): boolean {
  const current = state.equipment[spec.id];
  if (!current || current.tripped || current.condition <= 0) return false;
  if (current.values.controlInhibited === 1 || ['off', 'heater'].includes(current.mode))
    return false;
  // A manual burn has the pod (manual burns override control per pod).
  if (state.burns.some((b) => b.thruster === spec.id && b.until > state.t)) return false;
  const temperature =
    current.temperature ?? (spec.thermalNode ? state.thermal[spec.thermalNode] : undefined) ?? 293;
  return (
    temperature >= Math.max(spec.params.tempMin ?? 0, data.propulsion.rcs.warmupTemperature) &&
    temperature < (spec.params.tempMax ?? Infinity) &&
    (current.values.readyTime ?? 0) >= data.propulsion.rcs.warmupTime
  );
}

/**
 * What the attitude controller and the hands-on translation controls ask of each jet this
 * step, as a duty per jet index per pod. Real jets only: there is no free torque.
 */
function jetControl(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
): Record<string, Record<string, number>> {
  const data = dataFor(definition);
  const settings = controlSettings(definition);
  const force = handsOnForce(state.ext?.handsOn as unknown as HandsOnInput | undefined, definition);
  // Only an inertial or rate target asks for torque; with nothing else asked for there is
  // nothing to allocate, and the mass properties are not needed.
  const target = state.attitudeTarget;
  const steering = target.reference === 'inertial' || target.reference === 'rate';
  if (!steering && force.x === 0 && force.y === 0 && force.z === 0) return {};
  const mass = massDetail(state, definition);
  const torque = steering
    ? attitudeTorque(target, env.kinematics, mass.tensor, settings)
    : undefined;
  if (!torque && force.x === 0 && force.y === 0 && force.z === 0) return {};
  const geometry = getGeometry(state, definition);
  const pods: string[] = [];
  const jets: (AllocatorJet & { readonly jet: Jet })[] = [];
  for (const spec of tablesOf(definition).pods) {
    if (!podAvailable(state, spec, data)) continue;
    const point = geometry.positions[spec.id] ?? spec.position;
    for (const jet of activeJets(definition, state, spec.id))
      jets.push({ pod: pods.length, point, direction: jet.direction, jet });
    pods.push(spec.id);
  }
  const duty = allocateJets(
    jets,
    mass.properties.centerOfMass,
    force,
    torque ?? { x: 0, y: 0, z: 0 },
    {
      thrust: data.propulsion.rcs.thrustPerJet,
      maxPerPod: data.propulsion.rcs.maxSimultaneousJetsPerPod,
      torquePriority: settings.torquePriority,
    },
  );
  const control: Record<string, Record<string, number>> = {};
  jets.forEach((entry, j) => {
    if (duty[j]! > 0) (control[entry.jet.pod] ??= {})[String(entry.jet.index)] = duty[j]!;
  });
  return control;
}

/**
 * Reserve valve power before dispatch, and decide what the controller asks of the jets.
 * Released hands-on controls become an attitude hold here, once the rates are nulled.
 */
export function preparePropulsion(
  input: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
): ShipSystemsState {
  let state = input;
  if (
    state.ext?.[HANDS_ON_HOLD_KEY] === 'pending' &&
    state.attitudeTarget.reference === 'rate' &&
    ratesNulled(env.kinematics.angularVelocity, controlSettings(definition))
  ) {
    // The ship is steady: from now on hold the attitude it has (A8: released controls give a
    // steady ship, which is what the coasting forecast assumes).
    const q = normalize(env.kinematics.attitude);
    state = {
      ...state,
      attitudeTarget: {
        reference: 'inertial',
        attitude: { w: unsigned(q.w), x: unsigned(q.x), y: unsigned(q.y), z: unsigned(q.z) },
      },
      ext: { ...state.ext, [HANDS_ON_HOLD_KEY]: 'held' },
    };
  }
  const equipment = { ...state.equipment };
  const control = jetControl(state, definition, env);
  const pulses = pulsesOf(state);
  for (const spec of tablesOf(definition).byKind) {
    const current = equipment[spec.id];
    if (!current) continue;
    const isRcs = spec.kind === 'rcs-thruster';
    const burn = state.burns.find(
      (b) => b.thruster === spec.id && b.until > state.t && b.throttle > 0,
    );
    let valves = burn || (current.values.pulseRemaining ?? 0) > 0 ? 1 : 0;
    if (isRcs && !burn) {
      // Jets the controller asks for, and jets still finishing a committed minimum pulse.
      const asked = new Set(Object.keys(control[spec.id] ?? {}));
      for (const jet of activeJets(definition, state, spec.id))
        if ((pulses[jet.id]?.pulse ?? 0) > 0) asked.add(String(jet.index));
      valves += asked.size;
    }
    const mode =
      valves > 0
        ? isRcs
          ? valves > 1
            ? 'fire-two'
            : 'fire-one'
          : 'firing'
        : ['firing', 'fire-one', 'fire-two'].includes(current.mode)
          ? 'ready'
          : current.mode;
    equipment[spec.id] = { ...current, mode };
  }
  return {
    ...state,
    equipment,
    ext: { ...state.ext, [CONTROL_KEY]: control as unknown as JsonValue },
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

/**
 * Chemical thrust is delivered in whole minimum-impulse pulses. Demand (N·s) accumulates in
 * `pending` until a pulse can start; a committed pulse runs on across ticks in `pulse` (s).
 * Returns the new bookkeeping and how long the valve is open this step.
 */
function advancePulse(
  pendingBefore: number,
  pulseBefore: number,
  ready: boolean,
  demand: number,
  dt: number,
  minimumImpulse: number,
  nominalThrust: number,
): { pending: number; pulse: number; firingTime: number } {
  if (!ready) return { pending: 0, pulse: 0, firingTime: 0 };
  let pending = pendingBefore + demand;
  let pulse = pulseBefore;
  let firingTime = 0;
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
  return { pending, pulse, firingTime };
}

export function stepPropulsion(
  state: ShipSystemsState,
  definition: ShipDefinition,
  _env: EnvironmentEffects,
  dt: number,
): { state: ShipSystemsState; thrusts: ThrustOutput[]; torque: Vec3; events: ShipEvent[] } {
  const data = dataFor(definition);
  const g0 = data.constants.g0.value;
  const equipment = { ...state.equipment };
  const tanks = { ...state.tanks };
  const events: ShipEvent[] = [];
  const thrusts: ThrustOutput[] = [];
  const geometry = getGeometry(state, definition);
  const tables = tablesOf(definition);
  const control = controlOf(state);
  const oldPulses = pulsesOf(state);
  const pulses: Record<string, JetPulse> = {};
  const controllerPowered = tables.computers.some(
    ({ spec, power }) =>
      equipment[spec.id]?.mode === 'active' &&
      (equipment[spec.id]?.powerDraw ?? 0) >= power - 1e-9 &&
      !equipment[spec.id]?.tripped &&
      (equipment[spec.id]?.condition ?? 0) > 0,
  );
  for (const { spec, isRcs, modePower } of tables.thrusters) {
    const current = equipment[spec.id];
    if (!current) continue;
    const values = { ...current.values };
    const burn = state.burns.find((b) => b.thruster === spec.id && b.until > state.t);
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
    // How many valves the supplied power and readiness allow open at once (the main engine: 1).
    const warm =
      operational &&
      (!isRcs ||
        (temperature >= data.propulsion.rcs.warmupTemperature &&
          (current.values.readyTime ?? 0) >= data.propulsion.rcs.warmupTime));
    const valves = !warm
      ? 0
      : !isRcs
        ? current.powerDraw >= modePower('firing') - 1e-9
          ? 1
          : 0
        : current.powerDraw >= modePower('fire-two') - 1e-9
          ? data.propulsion.rcs.maxSimultaneousJetsPerPod
          : current.powerDraw >= modePower('fire-one') - 1e-9
            ? 1
            : 0;
    const thrustScale = Math.max(0, values.thrustScale ?? 1) * clamp(current.condition);
    const point = geometry.positions[spec.id] ?? spec.mount?.position ?? spec.position;
    const misalignment =
      values.misalignment ??
      spec.params.mountMisalignment ??
      (isRcs ? data.propulsion.rcs.mountMisalignment : data.propulsion.main.mountMisalignment);
    const misalignmentPitch =
      values.misalignmentPitch ??
      spec.params.mountMisalignmentPitch ??
      (isRcs ? 0 : data.propulsion.main.mountMisalignmentPitch);
    let unserved = values.unservedImpulse ?? 0;
    let totalImpulse = 0;
    let totalMass = 0;
    let fx = 0;
    let fy = 0;
    let fz = 0;
    /** Open one valve for `firingTime`: draw propellant, add the force. True if the feed ran short. */
    const fire = (
      firingTime: number,
      resources: readonly string[],
      direction: Vec3,
      yaw: number,
      pitch: number,
    ): boolean => {
      const requestedImpulse = nominalThrust * thrustScale * firingTime;
      const feeds = resources.filter((id) => values[`feed.${id}`] !== 0);
      const usedMass = consume(tanks, feeds, requestedImpulse / (isp * g0));
      const impulse = usedMass * isp * g0;
      const short = impulse + 1e-8 < requestedImpulse;
      if (short) unserved += requestedImpulse - impulse;
      if (impulse > 0) {
        const tilted = tiltDirection(direction, yaw, pitch);
        const magnitude = impulse / dt;
        fx += tilted.x * magnitude;
        fy += tilted.y * magnitude;
        fz += tilted.z * magnitude;
      }
      totalImpulse += impulse;
      totalMass += usedMass;
      return short;
    };

    // The commanded channel: a timed or hands-on burn of the main engine, or of a pod's
    // selected jet. Its bookkeeping stays in the equipment values, as before.
    const podJets = isRcs ? activeJets(definition, state, spec.id) : [];
    // What the controller asks of this pod. A commanded burn has the pod to itself.
    const asked: Readonly<Record<string, number>> =
      isRcs &&
      !burn &&
      controllerPowered &&
      current.values.controlInhibited !== 1 &&
      !['off', 'heater'].includes(current.mode)
        ? (control[spec.id] ?? {})
        : {};
    const controlled = Object.keys(asked).length > 0;
    const selected = isRcs
      ? podJets.find((jet) => jet.index === Math.round(values.selectedJet ?? 0))
      : undefined;
    const activeTime = burn ? Math.min(dt, Math.max(0, burn.until - state.t)) : 0;
    const throttle = clamp(burn?.throttle ?? 0);
    const commanded = advancePulse(
      values.pendingImpulse ?? 0,
      values.pulseRemaining ?? 0,
      valves >= 1,
      nominalThrust * throttle * activeTime,
      dt,
      minimumImpulse,
      nominalThrust,
    );
    // Demand left over when nothing asks for thrust any more is reported, never fired late.
    let reported = false;
    if (!burn) {
      unserved += commanded.pending;
      commanded.pending = 0;
      reported = !controlled;
    }
    let direction: Vec3;
    let yaw = misalignment;
    let pitch = misalignmentPitch;
    if (!isRcs) {
      // Two-axis gimbal: aim the thrust line through the centre of mass, each axis within the
      // gimbal limit and rate. Yaw turns the thrust toward +y, pitch toward +z. With no valve
      // open the gimbal holds where it is (and the centre of mass is not needed).
      const main = data.propulsion.main;
      const steer = (ideal: number, previous: number): number =>
        previous +
        clamp(
          clamp(ideal, -main.gimbalLimit, main.gimbalLimit) - previous,
          -main.gimbalRate * dt,
          main.gimbalRate * dt,
        );
      if (valves >= 1) {
        const mass = computeMassProperties(state, definition);
        const dx = mass.centerOfMass.x - point.x;
        const dy = mass.centerOfMass.y - point.y;
        const dz = mass.centerOfMass.z - point.z;
        values.gimbal = steer(Math.atan2(dy, dx) - misalignment, values.gimbal ?? 0);
        values.gimbalPitch = unsigned(
          steer(Math.atan2(dz, Math.hypot(dx, dy)) - misalignmentPitch, values.gimbalPitch ?? 0),
        );
      } else {
        values.gimbal = values.gimbal ?? 0;
        values.gimbalPitch = unsigned(values.gimbalPitch ?? 0);
      }
      yaw += values.gimbal;
      pitch += values.gimbalPitch;
      direction = {
        x: main.direction[0]!,
        y: main.direction[1]!,
        z: main.direction[2]!,
      };
    } else direction = selected?.direction ?? { x: 0, y: 0, z: 0 };
    const resources = isRcs ? (selected?.resourceIds ?? []) : data.propulsion.main.resourceIds;
    if (fire(commanded.firingTime, resources, direction, yaw, pitch)) {
      commanded.pending = 0;
      commanded.pulse = 0;
      reported = true;
    }
    values.pendingImpulse = commanded.pending;
    values.pulseRemaining = commanded.pulse;

    if (isRcs) {
      // The controller's channel: any number of the pod's jets, each with its own minimum-bit
      // bookkeeping.
      // With power for one valve only, the jet asked for most keeps it.
      let favoured = -1;
      if (valves === 1)
        for (const jet of podJets)
          if ((asked[jet.index] ?? 0) > (favoured < 0 ? 0 : (asked[favoured] ?? 0)))
            favoured = jet.index;
      for (const jet of podJets) {
        const duty = asked[jet.index] ?? 0;
        const before = oldPulses[jet.id];
        if (duty === 0 && !before) continue;
        const ready =
          !burn && (valves > 1 || (valves === 1 && (favoured < 0 || favoured === jet.index)));
        const next = advancePulse(
          before?.pending ?? 0,
          before?.pulse ?? 0,
          ready,
          nominalThrust * clamp(duty) * dt,
          dt,
          minimumImpulse,
          nominalThrust,
        );
        if (duty === 0) {
          if (next.pending > 0) reported = true;
          unserved += next.pending;
          next.pending = 0;
        }
        if (
          fire(next.firingTime, jet.resourceIds, jet.direction, misalignment, misalignmentPitch)
        ) {
          next.pending = 0;
          next.pulse = 0;
          reported = true;
        }
        if (next.pending > 0 || next.pulse > 0)
          pulses[jet.id] = { pending: next.pending, pulse: next.pulse };
      }
    }

    if (totalImpulse > 0)
      thrusts.push({
        source: spec.id,
        point,
        force: { x: unsigned(fx), y: unsigned(fy), z: unsigned(fz) },
      });
    if (reported) values.unservedImpulse = unserved;
    values.impulse = totalImpulse;
    values.massFlow = totalMass / dt;
    const chemicalHeat = isRcs
      ? data.propulsion.rcs.chemicalHeatPerFiringJet
      : data.propulsion.main.chemicalHeatAtFullThrust;
    values.heat = current.powerDraw + chemicalHeat * (totalImpulse / (nominalThrust * dt));
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
    ext: { ...state.ext, [PULSES_KEY]: pulses as unknown as JsonValue },
  };
  return {
    state: { ...next, massProperties: computeMassProperties(next, definition) },
    thrusts,
    torque: { x: 0, y: 0, z: 0 },
    events,
  };
}
