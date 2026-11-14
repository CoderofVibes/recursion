import type { ShipDefinition } from '../../contracts/ship.ts';
import type {
  EnvironmentEffects,
  EquipmentState,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { yawOf } from '../../lib/quat.ts';
import { getGeometry } from '../config/configuration.ts';
import { bounded, systems } from '../power/baseline.ts';

/** [ASSUMED] C04/C11 thermal stub: conservative finite nodes, passive/active transport and IR rejection.
 * Local freeze rupture, equipment damage and failed regulators remain Phase 3 work.
 */
export function stepThermal(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
): { state: ShipSystemsState; events: ShipEvent[] } {
  if (!(dt > 0) || !Number.isFinite(dt))
    throw new RangeError('Thermal dt must be finite and positive');
  const data = systems(definition);
  const thermal = { ...state.thermal };
  const equipment: Record<string, EquipmentState> = { ...state.equipment };
  const events: ShipEvent[] = [];
  const input: Record<string, number> = {};
  const capacity: Record<string, number> = {};
  for (const node of data.thermalNodes) {
    thermal[node.id] ??= node.initialTemperature;
    capacity[node.id] = node.capacity;
    input[node.id] = 0;
  }
  for (const spec of definition.equipment) {
    if (!spec.thermalNode) continue;
    input[spec.thermalNode] =
      (input[spec.thermalNode] ?? 0) + (equipment[spec.id]?.values.heat ?? 0);
  }
  // Metabolism is not an electrical load and cannot be switched off.
  input.cabin = (input.cabin ?? 0) + data.lifeSupport.crewHeat;
  const isPumping = (ids: readonly string[]): boolean =>
    ids.some((id) => {
      const e = equipment[id];
      const base = data.equipment.find((entry) => entry.id === id);
      const active = base?.modes.active?.power ?? Infinity;
      return e?.mode === 'active' && e.condition > 0 && !e.tripped && e.powerDraw >= active - 1e-9;
    });
  const geometry = getGeometry(state, definition);
  const radiator = data.radiators;
  const light = env.fieldSignals.illumination as Record<string, JsonValue> | undefined;
  // Sunlight arrives with body shadows already applied (DECISIONS A3); only the sink
  // temperature still comes from the optional fieldSignals.illumination adapter.
  const irradiance = Math.max(0, env.sunlight.irradiance);
  // LIFT(2G): planar sun incidence, from the sun's azimuth against the yaw of the body axis.
  const sunAngle = Math.atan2(env.sunlight.direction.y, env.sunlight.direction.x);
  const incidence =
    irradiance > 0 ? Math.max(0, Math.cos(sunAngle - yawOf(env.kinematics.attitude))) : 0;
  const sink =
    typeof light?.sinkTemperature === 'number'
      ? Math.max(0, light.sinkTemperature)
      : radiator.referenceSinkTemperature;
  let radiationEnergy = 0;
  const startEnergy = data.thermalNodes.reduce(
    (sum, node) => sum + node.capacity * thermal[node.id]!,
    0,
  );
  const heatInput = Object.values(input).reduce((sum, q) => sum + q, 0);
  // Bounded substeps stabilize the stub even when an integration test requests a long coast.
  const count = Math.ceil(dt);
  const h = dt / count;
  for (let iteration = 0; iteration < count; iteration++) {
    for (const node of data.thermalNodes)
      thermal[node.id] = thermal[node.id]! + ((input[node.id] ?? 0) * h) / node.capacity;
    const transfer = (
      from: string,
      to: string,
      conductance: number,
      maximum: number,
      active: boolean,
      gain: number,
    ): void => {
      const difference = thermal[from]! - thermal[to]!;
      const target = data.thermalNodes.find((node) => node.id === from)!.controlTargetTemperature;
      const raw = conductance * difference;
      const regulated =
        active && raw > 0
          ? Math.min(
              raw,
              maximum,
              Math.max(0, (input[from] ?? 0) + gain * (thermal[from]! - target)),
            )
          : bounded(raw, -maximum, maximum);
      const equilibrium = Math.abs(difference) / (1 / capacity[from]! + 1 / capacity[to]!);
      const energy = Math.sign(regulated) * Math.min(Math.abs(regulated) * h, equilibrium);
      thermal[from] = thermal[from]! - energy / capacity[from]!;
      thermal[to] = thermal[to]! + energy / capacity[to]!;
    };
    for (const loop of data.thermalLoops) {
      const pump = isPumping(loop.pumpIds);
      transfer(
        loop.from,
        loop.to,
        pump ? loop.conductance : radiator.passiveConductance,
        loop.maxHeatTransport,
        pump,
        loop.controlGain,
      );
    }
    for (const link of data.thermalLinks) {
      const pump = isPumping(['external-pump-a', 'external-pump-b']);
      transfer(
        link.from,
        link.to,
        pump ? link.conductance : link.passiveConductance,
        link.maxHeatTransport,
        pump,
        link.controlGain,
      );
    }
    for (const id of ['radiator-left', 'radiator-right']) {
      const e = equipment[id];
      if (!e || e.condition <= 0) continue;
      const deployment = geometry.deployment[id] ?? 0;
      const area =
        radiator.stowedEffectiveAreaPerWing +
        deployment * (radiator.emittingAreaPerWing - radiator.stowedEffectiveAreaPerWing);
      const temperature = thermal['external-loop']!;
      const emittedFull =
        radiator.emissivity *
        data.constants.sigma.value *
        area *
        radiator.referenceViewFactor *
        (temperature ** 4 - sink ** 4);
      const externalInput = heatInput / 2;
      const targetFraction = bounded(
        (externalInput + 1000 * (temperature - radiator.louverTargetTemperature)) /
          Math.max(1, emittedFull),
        radiator.louverMinEmissionFraction,
        radiator.louverMaxEmissionFraction,
      );
      const oldFraction = e.values.louverEmission ?? targetFraction;
      const fraction = bounded(
        oldFraction +
          (targetFraction - oldFraction) * (1 - Math.exp(-h / radiator.louverResponseTime)),
        radiator.louverMinEmissionFraction,
        radiator.louverMaxEmissionFraction,
      );
      const absorbed = ((radiator.solarAbsorptivity * irradiance * area) / 2) * incidence;
      const rate = (emittedFull * fraction - absorbed) * e.condition;
      const energy = Math.min(
        rate * h,
        Math.max(0, temperature - sink) * capacity['external-loop']!,
      );
      thermal['external-loop'] = temperature - energy / capacity['external-loop']!;
      radiationEnergy += energy;
      equipment[id] = {
        ...e,
        values: {
          ...e.values,
          louverEmission: fraction,
          radiatedPower: energy / h,
          emittingArea: area,
        },
      };
    }
  }
  for (const spec of definition.equipment) {
    const e = equipment[spec.id];
    if (e && spec.thermalNode)
      equipment[spec.id] = { ...e, temperature: thermal[spec.thermalNode] };
  }
  for (const node of data.thermalNodes) {
    const temperature = thermal[node.id]!;
    const previous = state.thermal[node.id] ?? node.initialTemperature;
    const low = node.id === 'hx-water';
    if (
      low
        ? temperature <= node.warnTemperature && previous > node.warnTemperature
        : temperature >= node.warnTemperature && previous < node.warnTemperature
    )
      events.push({ kind: 'thermal-limit', t: state.t + dt, node: node.id, temperature });
  }
  const endEnergy = data.thermalNodes.reduce(
    (sum, node) => sum + node.capacity * thermal[node.id]!,
    0,
  );
  return {
    state: {
      ...state,
      thermal,
      equipment,
      ext: {
        ...state.ext,
        thermal: {
          heatInput,
          radiated: radiationEnergy / dt,
          storedEnergyChange: endEnergy - startEnergy,
          energyResidual: heatInput * dt - radiationEnergy - (endEnergy - startEnergy),
        },
      },
    },
    events,
  };
}
