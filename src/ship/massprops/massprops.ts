import baseline from '../../../data/ship-baseline.json';
import {
  isotropicInertia,
  type Inertia,
  type MassProperties,
  type ShipDefinition,
} from '../../contracts/ship.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { fromPrincipal } from '../../lib/sym3.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { getGeometry } from '../config/configuration.ts';

// LIFT(2G): src/ship turns the ship about body z only, so it reads this one inertia term.
/** Yaw inertia: the body-frame zz term (`moments.z` while the axes are the identity). */
export const yawInertia = (inertia: Inertia): number =>
  fromPrincipal(inertia.moments, inertia.axes)[5];

/** [ESTABLISHED: S14, S24] Direct sums and the parallel-axis theorem, including retained water. */
export function computeMassProperties(
  state: ShipSystemsState,
  definition: ShipDefinition,
): MassProperties {
  const data = (definition.systems ?? baseline) as unknown as typeof baseline;
  const geometry = getGeometry(state, definition);
  const masses: { mass: number; position: Vec3; inertia: number }[] = [
    {
      mass: definition.structureMass,
      position: definition.structureCenterOfMass,
      inertia: yawInertia(definition.structureInertia),
    },
  ];
  for (const equipment of definition.equipment)
    masses.push({
      mass: equipment.mass,
      position: geometry.positions[equipment.id] ?? equipment.position,
      inertia: geometry.intrinsicInertia[equipment.id] ?? 0,
    });
  for (const tank of definition.tanks) {
    const mass = Math.max(0, state.tanks[tank.id] ?? 0);
    const resource = [...data.propellant, ...data.reactants].find((r) => r.id === tank.id);
    masses.push({
      mass,
      position: tank.position,
      inertia: mass * (resource?.intrinsicInertiaPerKg ?? 0),
    });
  }
  const mass = masses.reduce((total, item) => total + item.mass, 0);
  if (!(mass > 0)) throw new Error('Ship mass must be positive');
  // LIFT(2G): planar sums; the centre of mass stays in the body x–y plane (z = 0).
  const centerOfMass = {
    x: masses.reduce((total, item) => total + item.mass * item.position.x, 0) / mass,
    y: masses.reduce((total, item) => total + item.mass * item.position.y, 0) / mass,
    z: 0,
  };
  const inertia = masses.reduce(
    (total, item) =>
      total +
      item.inertia +
      item.mass *
        ((item.position.x - centerOfMass.x) ** 2 + (item.position.y - centerOfMass.y) ** 2),
    0,
  );
  // LIFT(2G): only the yaw inertia is summed; it is reported as the moment about every axis.
  return { mass, centerOfMass, inertia: isotropicInertia(inertia), hull: geometry.hull };
}
