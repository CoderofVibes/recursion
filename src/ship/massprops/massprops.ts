import baseline from '../../../data/ship-baseline.json';
import type { MassProperties, ShipDefinition } from '../../contracts/ship.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { getGeometry } from '../config/configuration.ts';

/** [ESTABLISHED: S14, S24] Direct sums and the parallel-axis theorem, including retained water. */
export function computeMassProperties(
  state: ShipSystemsState,
  definition: ShipDefinition,
): MassProperties {
  const data = (definition.systems ?? baseline) as unknown as typeof baseline;
  const geometry = getGeometry(state, definition);
  const masses = [
    {
      mass: definition.structureMass,
      position: definition.structureCenterOfMass,
      inertia: definition.structureInertia,
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
  const centerOfMass = {
    x: masses.reduce((total, item) => total + item.mass * item.position.x, 0) / mass,
    y: masses.reduce((total, item) => total + item.mass * item.position.y, 0) / mass,
  };
  const inertia = masses.reduce(
    (total, item) =>
      total +
      item.inertia +
      item.mass *
        ((item.position.x - centerOfMass.x) ** 2 + (item.position.y - centerOfMass.y) ** 2),
    0,
  );
  return { mass, centerOfMass, inertia, footprint: geometry.footprint };
}
