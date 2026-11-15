/** Retained-owner hooks for the game loop. All exports here are TRUTH ONLY. */
import type { ShipDefinition } from '../../contracts/ship.ts';
import type { EnvironmentEffects, ShipTruth } from '../../contracts/truth/ship.ts';
import { buildEnvironment } from '../../game/environment.ts';
import { getGeometry } from '../../ship/config/index.ts';
import type { SimState } from '../../sim/types.ts';
import {
  createLatticeField,
  type LatticeField,
  type LatticePose,
} from '../../sim/fields/lattice.ts';
import type { ChainLinkSetup } from './index.ts';

/**
 * A16/S17: each installed assembly gets its own exposure. Distributed radiator/
 * array vulnerability occupies the entire actual prism. Compact electronics use
 * the explicitly declared baseline mount-point approximation. Hull is a separate
 * geometric check, never a shared electrical health bar.
 */
export function latticePoseFromShip(ship: ShipTruth, definition: ShipDefinition): LatticePose {
  const geometry = getGeometry(ship.systems, definition);
  return {
    position: ship.kinematics.position,
    attitude: ship.kinematics.attitude,
    centerOfMass: ship.systems.massProperties.centerOfMass,
    components: [
      ...definition.equipment.map((equipment) => {
        const prisms = geometry.hull.filter((part) => part.part === equipment.id);
        return {
          id: equipment.id,
          shapes: prisms.length
            ? prisms.map((prism) => ({ kind: 'prism' as const, prism }))
            : [
                {
                  kind: 'point' as const,
                  point: geometry.positions[equipment.id] ?? equipment.position,
                },
              ],
        };
      }),
      ...geometry.hull
        .filter((part) => !definition.equipment.some((e) => e.id === part.part))
        .map((prism, i) => ({
          id: `structure:${prism.part ?? i}`,
          shapes: [{ kind: 'prism' as const, prism }],
        })),
    ],
  };
}

export interface ChainLinkEnvironment {
  readonly field: LatticeField;
  /** Supply to stepShipSystems; only stepSensors may turn this into observations. */
  at(state: SimState): EnvironmentEffects;
}

/**
 * Ready for 2F's environment hook; does not fork the game loop or damage pipeline.
 * No point intensity is substituted for the chronological swept exposure contract.
 */
export function createChainLinkEnvironment(setup: ChainLinkSetup): ChainLinkEnvironment {
  const field = createLatticeField('cathedral-lattice', { layers: setup.layout.layers });
  return {
    field,
    at(state) {
      const base = buildEnvironment(state, {
        knownSizeTargets: [
          ...setup.definition.briefing.knownBodies.map((body) => body.id),
          ...setup.definition.briefing.knownAsteroids.map((rock) => rock.id),
        ],
        sunExclusionAngle: setup.play.sunExclusionAngle,
      });
      return {
        ...base,
        fieldSignals: {
          ...base.fieldSignals,
          [field.id]: field.signal!(state.world.ship.kinematics.position, state.world.t),
        },
      };
    },
  };
}
