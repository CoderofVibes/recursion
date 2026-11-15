import type { ShipDefinition } from '../../contracts/ship.ts';
import type {
  EnvironmentEffects,
  EquipmentState,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { getGeometry } from '../config/configuration.ts';
import { bounded, systems, type Baseline } from '../power/baseline.ts';
import { sunIncidence } from '../power/sun.ts';
import { functionAvailable } from '../condition/index.ts';
import { hasFault, stepThermalProtection } from './protection.ts';

/**
 * The thermal facts of a design, indexed once (S15 rank 1): each node's control target and
 * each pump's active power were searched for inside the integration loop. Values only.
 */
interface ThermalTables {
  /** `controlTargetTemperature` of the first node with each id. */
  readonly target: ReadonlyMap<string, { readonly controlTargetTemperature: number }>;
  /** Power a pump draws when active, by id: `modes.active.power` in the baseline, else ∞. */
  readonly pumpPower: Map<string, number>;
  readonly data: Baseline;
}
const thermalTables = new WeakMap<Baseline, ThermalTables>();
const EXTERNAL_PUMPS = ['external-pump-a', 'external-pump-b'] as const;

function tablesOf(data: Baseline): ThermalTables {
  let tables = thermalTables.get(data);
  if (!tables) {
    const target = new Map<string, { readonly controlTargetTemperature: number }>();
    for (const node of data.thermalNodes) if (!target.has(node.id)) target.set(node.id, node);
    tables = { target, pumpPower: new Map(), data };
    thermalTables.set(data, tables);
  }
  return tables;
}

/** Active power of one pump (looked up once, then remembered: the baseline never changes). */
function activePower(tables: ThermalTables, id: string): number {
  let power = tables.pumpPower.get(id);
  if (power === undefined) {
    const base = tables.data.equipment.find((entry) => entry.id === id);
    power = base?.modes.active?.power ?? Infinity;
    tables.pumpPower.set(id, power);
  }
  return power;
}

/** [ASSUMED] C04/C11 finite nodes, regulated pumped transport and IR rejection.
 * Failed bypasses, common leaks, frozen exchangers and jammed louvers persist. */
export function stepThermal(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
): { state: ShipSystemsState; events: ShipEvent[] } {
  if (!(dt > 0) || !Number.isFinite(dt))
    throw new RangeError('Thermal dt must be finite and positive');
  const data = systems(definition);
  const tables = tablesOf(data);
  const thermal = { ...state.thermal };
  let equipment: Record<string, EquipmentState> = { ...state.equipment };
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
      const active = activePower(tables, id);
      return (
        e?.mode === 'active' &&
        functionAvailable(e, state.t) &&
        !ids.some((pumpId) => hasFault(equipment[pumpId], 'loop-leak')) &&
        e.powerDraw >= active - 1e-9
      );
    });
  const geometry = getGeometry(state, definition);
  const radiator = data.radiators;
  const light = env.fieldSignals.illumination as Record<string, JsonValue> | undefined;
  // Sunlight arrives with body shadows already applied (DECISIONS A3); only the sink
  // temperature still comes from the optional fieldSignals.illumination adapter.
  const irradiance = Math.max(0, env.sunlight.irradiance);
  // The radiators take sunlight at the same incidence as the solar wings (1C's formula).
  const incidence = sunIncidence(env, data.generation.solar.arrayNormal);
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
      const target = tables.target.get(from)!.controlTargetTemperature;
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
      const hx = equipment['interface-hx'];
      const regulator =
        loop.id === 'internal-water'
          ? hx
          : equipment[
              loop.pumpIds.find((id) => equipment[id]?.mode === 'active') ?? loop.pumpIds[0]!
            ];
      const broken =
        loop.id === 'internal-water' &&
        (!functionAvailable(hx, state.t) || hasFault(hx, 'freeze-rupture'));
      const pump = isPumping(loop.pumpIds) && !broken && !hasFault(regulator, 'regulator-closed');
      const open = hasFault(regulator, 'regulator-open');
      transfer(
        loop.from,
        loop.to,
        pump ? loop.conductance : radiator.passiveConductance,
        loop.maxHeatTransport,
        pump && !open,
        loop.controlGain,
      );
    }
    for (const link of data.thermalLinks) {
      const hx = equipment['interface-hx'];
      const pump =
        isPumping(EXTERNAL_PUMPS) &&
        functionAvailable(hx, state.t) &&
        !hasFault(hx, 'freeze-rupture') &&
        !hasFault(hx, 'regulator-closed');
      transfer(
        link.from,
        link.to,
        pump ? link.conductance : link.passiveConductance,
        link.maxHeatTransport,
        pump && !hasFault(hx, 'regulator-open'),
        link.controlGain,
      );
    }
    for (const id of ['radiator-left', 'radiator-right']) {
      const e = equipment[id];
      if (!e) continue;
      if (e.condition <= 0 || hasFault(e, 'branch-isolated')) {
        equipment[id] = { ...e, values: { ...e.values, radiatedPower: 0 } };
        continue;
      }
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
      const fraction =
        hasFault(e, 'louver-jam') || !functionAvailable(e, state.t)
          ? oldFraction
          : bounded(
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
    const protectedStep = stepThermalProtection(
      { ...state, t: state.t + iteration * h, thermal, equipment },
      definition,
      h,
    );
    if (protectedStep.state.equipment !== equipment)
      equipment = { ...protectedStep.state.equipment };
    events.push(...protectedStep.events);
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
