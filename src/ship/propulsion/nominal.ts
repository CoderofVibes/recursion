import baseline from '../../../data/ship-baseline.json';
import type { HandsOnInput } from '../../contracts/commands.ts';
import type { EquipmentId } from '../../contracts/ids.ts';
import type { MassProperties, ShipDefinition } from '../../contracts/ship.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { inertiaTensor } from '../massprops/massprops.ts';
import { createShipSystemsState } from '../state.ts';
import { allocateJets } from './allocator.ts';
import { attitudeTorque, controlSettings, handsOnForce, handsOnRate } from './control.ts';
import { jetsOf } from './jets.ts';

/**
 * What the spec sheets say about thrust: where each jet is, which way it pushes and how hard,
 * and which of them a hands-on demand fires. Everything here is computed from the nominal
 * design (`ShipDefinition`) and, optionally, believed mass properties, never from the ship's
 * true state, so the game layer may use it to draw thrust for the player (P11).
 */

/** One RCS jet as designed. */
export interface NominalJet {
  /** The jet's id in the baseline, e.g. `rcs-forward-left-a-3`. */
  readonly id: string;
  /** The pod (equipment) it belongs to. */
  readonly pod: EquipmentId;
  readonly bank: 'a' | 'b';
  /** Its number in the pod: the `jet-<index>` mode selects it for a manual pod burn. */
  readonly index: number;
  /** Where its force acts, body frame, m (the pod's position). */
  readonly point: Vec3;
  /** Unit direction of the force on the ship, body frame (opposite the nozzle). */
  readonly direction: Vec3;
  /** Thrust, N. */
  readonly thrust: number;
}

/** A thruster firing as designed: for drawing thrust at its point of application. */
export interface NominalFiring {
  /** Equipment that fires: an RCS pod or the main engine. */
  readonly source: EquipmentId;
  /** The jet, for an RCS firing. */
  readonly jet?: string;
  /** Where the force acts, body frame, m. */
  readonly point: Vec3;
  /** Unit direction of the force on the ship, body frame. */
  readonly direction: Vec3;
  /** Mean force, N: the jet's thrust times its duty (jets pulse; the engine throttles by pulses). */
  readonly force: number;
}

const dataFor = (definition: ShipDefinition) =>
  (definition.systems ?? baseline) as unknown as typeof baseline;

/** Every installed RCS jet with its body-frame position and force direction. */
export function nominalJets(definition: ShipDefinition): NominalJet[] {
  const thrust = dataFor(definition).propulsion.rcs.thrustPerJet;
  return jetsOf(definition).map((jet) => {
    const pod = definition.equipment.find((e) => e.id === jet.pod)!;
    return {
      id: jet.id,
      pod: jet.pod,
      bank: jet.bank,
      index: jet.index,
      point: pod.mount?.position ?? pod.position,
      direction: jet.direction,
      thrust,
    };
  });
}

const arrivalMass = new WeakMap<ShipDefinition, MassProperties>();
/** Mass properties of the design at arrival: default configuration, tanks as loaded. */
function nominalMassProperties(definition: ShipDefinition): MassProperties {
  let mass = arrivalMass.get(definition);
  if (!mass) {
    mass = createShipSystemsState(definition).massProperties;
    arrivalMass.set(definition, mass);
  }
  return mass;
}

/**
 * The thrusters a hands-on input fires, as designed: the same control law and jet allocator
 * the ship step uses, applied to a ship at rest with bank A, every pod available and the given
 * (believed) mass properties, or the design's arrival loading when none are given.
 *
 *  - `translate`: the jets that push that way, held as long as the control is.
 *  - `yaw`, `pitch`: the jets that start the turn. The ship fires them until the rate is
 *    reached (a few seconds), then coasts; released, it fires the opposite ones to stop.
 *  - `throttle`: the main engine at its mount, along its nominal direction.
 */
export function handsOnFirings(
  definition: ShipDefinition,
  input: HandsOnInput,
  massProperties: MassProperties = nominalMassProperties(definition),
): NominalFiring[] {
  const data = dataFor(definition);
  const settings = controlSettings(definition);
  const firings: NominalFiring[] = [];
  const force = handsOnForce(input, definition);
  const torque = attitudeTorque(
    { reference: 'rate', rate: handsOnRate(input, settings) },
    {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      attitude: { w: 1, x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    inertiaTensor(massProperties.inertia),
    settings,
  );
  if (torque || force.x !== 0 || force.y !== 0 || force.z !== 0) {
    const jets = nominalJets(definition).filter((jet) => jet.bank === 'a');
    const pods = [...new Set(jets.map((jet) => jet.pod))];
    const duty = allocateJets(
      jets.map((jet) => ({
        pod: pods.indexOf(jet.pod),
        point: jet.point,
        direction: jet.direction,
      })),
      massProperties.centerOfMass,
      force,
      torque ?? { x: 0, y: 0, z: 0 },
      {
        thrust: data.propulsion.rcs.thrustPerJet,
        maxPerPod: data.propulsion.rcs.maxSimultaneousJetsPerPod,
        torquePriority: settings.torquePriority,
      },
    );
    jets.forEach((jet, j) => {
      if (duty[j]! > 0)
        firings.push({
          source: jet.pod,
          jet: jet.id,
          point: jet.point,
          direction: jet.direction,
          force: duty[j]! * jet.thrust,
        });
    });
  }
  if (input.throttle > 0) {
    const engine = definition.equipment.find((e) => e.id === data.propulsion.main.equipmentId);
    if (engine?.mount)
      firings.push({
        source: engine.id,
        point: engine.mount.position,
        direction: engine.mount.direction,
        force: Math.min(1, input.throttle) * data.propulsion.main.thrust,
      });
  }
  return firings;
}
