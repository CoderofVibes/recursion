import baseline from '../../data/ship-baseline.json';
import type { EquipmentKind, EquipmentSpec, ShipDefinition } from '../contracts/ship.ts';
import type { JsonValue } from '../contracts/units.ts';
import type { Vec2 } from '../lib/vec2.ts';

const vector = (p: readonly number[]): Vec2 => ({ x: p[0]!, y: p[1]! });
const name = (id: string): string => id.replaceAll('-', ' ');

function kind(id: string, subsystem: string): EquipmentKind {
  if (id === 'main-engine' || id === 'ion-drive') return 'main-engine';
  if (id.startsWith('rcs-') && subsystem === 'propulsion') return 'rcs-thruster';
  if (id === 'camera') return 'optical-tracker';
  if (id.startsWith('imu-')) return 'accelerometer';
  if (id.startsWith('star-tracker-')) return 'star-tracker';
  if (id.startsWith('radiator-')) return 'radiator';
  if (id === 'black-box') return 'recorder';
  if (id === 'comms') return 'comms';
  if (id.startsWith('eclss-')) return 'life-support';
  if (subsystem === 'generation') return 'power-source';
  if (subsystem === 'storage') return 'battery';
  if (subsystem === 'distribution') return 'power-bus';
  if (subsystem === 'processing' || id.startsWith('flight-cpu-')) return 'processor';
  return 'other';
}

/** [ASSUMED] 1C's SI baseline, with shared nominal fields projected without counting structure twice. */
export function loadShipDefinition(): ShipDefinition {
  const structure = baseline.equipment.find((e) => e.subsystem === 'structure')!;
  const equipment: EquipmentSpec[] = baseline.equipment
    .filter((e) => e.id !== structure.id)
    .map((e) => {
      const equipmentKind = kind(e.id, e.subsystem);
      const params: Record<string, number> = {
        intrinsicInertia: e.intrinsicInertia,
        tempMin: e.limits.tempMin,
        tempMax: e.limits.tempMax,
      };
      for (const [mode, values] of Object.entries(e.modes)) {
        for (const [key, value] of Object.entries(values)) {
          if (typeof value === 'number') params[`mode.${mode}.${key}`] = value;
        }
      }
      let direction: Vec2 | undefined;
      if (e.id === 'main-engine' || e.id === 'ion-drive') {
        const engine = e.id === 'main-engine' ? baseline.propulsion.main : baseline.propulsion.ion;
        Object.assign(params, { thrust: engine.thrust, isp: engine.Isp });
        direction = vector(engine.direction);
        if (e.id === 'main-engine') {
          Object.assign(params, {
            minimumImpulse: baseline.propulsion.main.minimumImpulse,
            mountMisalignment: baseline.propulsion.main.mountMisalignment,
            gimbalLimit: baseline.propulsion.main.gimbalLimit,
            gimbalRate: baseline.propulsion.main.gimbalRate,
          });
        }
      } else if (equipmentKind === 'rcs-thruster') {
        Object.assign(params, {
          thrust: baseline.propulsion.rcs.thrustPerJet,
          isp: baseline.propulsion.rcs.Isp,
          minimumImpulse: baseline.propulsion.rcs.minimumImpulsePerJet,
          mountMisalignment: baseline.propulsion.rcs.mountMisalignment,
          warmupTime: baseline.propulsion.rcs.warmupTime,
        });
        direction = vector(
          baseline.propulsion.rcs.jets.find((j) => j.equipmentId === e.id)!.direction,
        );
      } else if (equipmentKind === 'optical-tracker') {
        direction = { x: 1, y: 0 };
        Object.assign(params, { sigmaBearing: baseline.sensing.camera.nominalAngularSigma });
      } else if (equipmentKind === 'accelerometer') {
        Object.assign(params, { sigmaAcceleration: baseline.sensing.imu.accelerationSigma });
      } else if (equipmentKind === 'star-tracker') {
        direction = { x: 1, y: 0 };
        Object.assign(params, { sigmaAttitude: baseline.sensing.starTracker.angularSigma });
      } else if (equipmentKind === 'battery') {
        Object.assign(params, { capacity: baseline.generation.battery.capacityPerPack });
      } else if (equipmentKind === 'power-source') {
        Object.assign(params, {
          maxPower: e.id.startsWith('fuel-cell')
            ? baseline.generation.fuelCell.maxPowerPerStack
            : baseline.generation.solar.maxPowerPerWing,
        });
      }
      const redundant =
        /^(fuel-cell|battery|pdu|eclss|internal-pump|external-pump|flight-cpu|imu|star-tracker)-[ab]$/.exec(
          e.id,
        );
      return {
        id: e.id,
        kind: equipmentKind,
        name: name(e.id),
        mass: e.mass,
        position: vector(e.position),
        ratedPower: Math.max(...Object.values(e.modes).map((m) => m.power)),
        bus: e.bus ?? undefined,
        thermalNode: e.thermalNode,
        modes: [
          ...Object.keys(e.modes),
          'reset',
          ...(equipmentKind === 'rcs-thruster' ? ['bank-a', 'bank-b', 'jet-0', 'jet-1'] : []),
        ],
        defaultMode: e.initialMode,
        mount: direction ? { position: vector(e.position), direction } : undefined,
        redundancyGroup: redundant?.[1],
        sheddable: !['eclss', 'internal-pump', 'external-pump', 'flight-cpu', 'imu'].includes(
          redundant?.[1] ?? '',
        ),
        params,
      };
    });
  const resources = [...baseline.propellant, ...baseline.reactants];
  return {
    id: 'recursion-return-vehicle',
    name: baseline.ship.name,
    structureMass: structure.mass,
    structureCenterOfMass: vector(structure.position),
    structureInertia: structure.intrinsicInertia,
    equipment,
    tanks: resources.map((tank) => ({
      id: tank.id,
      name: name(tank.id),
      position: vector(tank.position),
      capacity: tank.capacity,
      propellant: tank.id,
      feeds:
        tank.id === 'main-propellant'
          ? ['main-engine']
          : tank.id.startsWith('rcs-')
            ? equipment.filter((e) => e.kind === 'rcs-thruster').map((e) => e.id)
            : tank.id === 'xenon'
              ? ['ion-drive']
              : tank.id === 'product-water'
                ? []
                : ['fuel-cell-a', 'fuel-cell-b'],
    })),
    buses: baseline.buses.map((b) => ({
      id: b.id,
      name: name(b.id),
      voltage: b.voltage,
      limit: b.maxPower,
    })),
    thermalNodes: baseline.thermalNodes.map((node) => ({
      id: node.id,
      name: name(node.id),
      heatCapacity: node.capacity,
      min: node.id === 'hx-water' ? node.failureTemperature : 0,
      max: node.id === 'hx-water' ? 323 : node.failureTemperature,
    })),
    configurations: Object.entries(baseline.ship.footprints).map(([id, polygon]) => {
      const deployed = (part: string) =>
        id === 'allDeployed' || (part.startsWith('radiator') ? id === 'radiators' : id === 'solar');
      const positions: Record<string, Vec2> = {};
      const overrides: Record<string, number> = {};
      for (const part of baseline.configuration.appendages) {
        const extended = deployed(part.id);
        positions[part.id] = vector(extended ? part.deployedPosition : part.stowedPosition);
        overrides[`${part.id}.deployment`] = extended ? 1 : 0;
        overrides[`${part.id}.intrinsicInertia`] = extended
          ? part.deployedInertia
          : part.stowedInertia;
        if (part.id.startsWith('radiator'))
          overrides[`${part.id}.area`] = extended
            ? baseline.radiators.emittingAreaPerWing
            : baseline.radiators.stowedEffectiveAreaPerWing;
      }
      return {
        id,
        name: name(id),
        footprint: polygon.map(vector),
        equipmentPositions: positions,
        paramOverrides: overrides,
        transitionTime: Math.max(
          baseline.radiators.deploymentTime,
          baseline.configuration.solarDeploymentTime,
        ),
      };
    }),
    defaultConfiguration: baseline.ship.initialConfiguration,
    systems: structuredClone(baseline) as unknown as Record<string, JsonValue>,
  };
}
