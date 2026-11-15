import type { ShipDefinition } from '../../contracts/ship.ts';
import type {
  EnvironmentEffects,
  EquipmentState,
  ShipSystemsState,
} from '../../contracts/truth/ship.ts';
import type { ShipEvent } from '../../contracts/measurements.ts';
import type { JsonValue } from '../../contracts/units.ts';
import { getGeometry } from '../config/configuration.ts';
import { requestedRecorderPower } from '../sensors/index.ts';
import { bounded, modeOf, systems } from './baseline.ts';
import { sunIncidence } from './sun.ts';

type Side = 'a' | 'b';
/** Functions whose active unit is essential: its spare inherits the priority when selected. */
const ACTIVE_FUNCTIONS = ['eclss-', 'internal-pump-', 'external-pump-', 'flight-cpu-', 'imu-'];
/**
 * An equipment record while one dispatch is being worked out. It is a fresh copy made at the
 * start of the dispatch, so filling it in place is invisible outside (2F's request 4: the
 * copies made for every small change were most of the tick).
 */
type Working = { -readonly [K in keyof EquipmentState]: EquipmentState[K] } & {
  values: Record<string, number>;
};
interface Load {
  id: string;
  side: Side;
  bus: string;
  requested: number;
  floor: number;
  priority: number;
  factor: number;
}

/** [ASSUMED] baseline C03/C09/C13: protected per-bus dispatch, with explicit losses. */
export function stepPower(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
): { state: ShipSystemsState; events: ShipEvent[] } {
  if (!(dt > 0) || !Number.isFinite(dt))
    throw new RangeError('Power dt must be finite and positive');
  const data = systems(definition);
  let split = dt;
  for (const spec of definition.equipment) {
    const e = state.equipment[spec.id];
    if (!e || e.tripped || e.condition <= 0 || e.mode === 'off' || !(e.values.faultPower! > 0))
      continue;
    const rating =
      spec.kind === 'power-bus'
        ? (definition.buses.find((bus) => bus.id === spec.bus)?.limit ?? spec.ratedPower)
        : spec.ratedPower;
    const demand = modeOf(definition, spec.id, e.mode).power + e.values.faultPower!;
    const remaining = data.power.rpc.tripDelay - (e.values.overloadTime ?? 0);
    if (
      demand > rating * data.power.branchHeadroom * data.power.rpc.tripCurrentMultiple &&
      remaining > 1e-12
    )
      split = Math.min(split, remaining);
  }
  if (split >= dt - 1e-12) return dispatchPower(state, definition, env, dt);
  const first = dispatchPower(state, definition, env, split);
  const second = stepPower({ ...first.state, t: state.t + split }, definition, env, dt - split);
  const fraction = split / dt;
  const average = (a: number, b: number) => a * fraction + b * (1 - fraction);
  const equipment = { ...second.state.equipment };
  for (const [id, e] of Object.entries(equipment)) {
    const previous = first.state.equipment[id]!;
    const values = { ...e.values };
    for (const key of ['heat', 'generatedPower', 'requestedPower', 'unmetPower'])
      values[key] = average(previous.values[key] ?? 0, e.values[key] ?? 0);
    equipment[id] = { ...e, powerDraw: average(previous.powerDraw, e.powerDraw), values };
  }
  const mergeRates = (a: JsonValue | undefined, b: JsonValue | undefined): JsonValue => {
    if (typeof a === 'number' && typeof b === 'number') return average(a, b);
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      const left = a as Record<string, JsonValue>;
      const right = b as Record<string, JsonValue>;
      return Object.fromEntries(
        Object.keys(right).map((key) => [key, mergeRates(left[key], right[key])]),
      );
    }
    return b ?? null;
  };
  return {
    state: {
      ...second.state,
      t: state.t,
      equipment,
      ext: {
        ...second.state.ext,
        power: mergeRates(first.state.ext?.power, second.state.ext?.power),
      },
    },
    events: [...first.events, ...second.events],
  };
}

function dispatchPower(
  state: ShipSystemsState,
  definition: ShipDefinition,
  env: EnvironmentEffects,
  dt: number,
): { state: ShipSystemsState; events: ShipEvent[] } {
  if (!(dt > 0) || !Number.isFinite(dt))
    throw new RangeError('Power dt must be finite and positive');
  const data = systems(definition);
  const equipment: Record<string, Working> = {};
  const events: ShipEvent[] = [];
  const tanks = { ...state.tanks };
  const battery = data.generation.battery;
  const fc = data.generation.fuelCell;
  const oldPower = state.ext?.power as Record<string, JsonValue> | undefined;
  const healthy = (id: string): boolean => {
    const e = equipment[id] ?? state.equipment[id];
    return !!e && e.condition > 0 && !e.tripped && e.mode !== 'off';
  };
  for (const spec of definition.equipment) {
    const old = state.equipment[spec.id];
    if (!old) continue;
    equipment[spec.id] = {
      ...old,
      powerDraw: 0,
      values: { ...old.values, heat: 0, generatedPower: 0, requestedPower: 0, unmetPower: 0 },
    };
  }
  const update = (id: string, values: Record<string, number>, draw?: number): void => {
    const working = equipment[id];
    if (!working) return;
    if (draw !== undefined) working.powerDraw = draw;
    Object.assign(working.values, values);
  };
  const pdu: Record<Side, boolean> = { a: healthy('pdu-a'), b: healthy('pdu-b') };
  const geometry = getGeometry(state, definition);
  // Sunlight arrives with body shadows already applied (irradiance 0 in shadow; DECISIONS A3).
  const irradiance = Math.max(0, env.sunlight.irradiance);
  // The wings face along the array normal (body +x: feathered to face forward).
  const incidence = sunIncidence(env, data.generation.solar.arrayNormal);
  const sources: Record<
    Side,
    { solar: number; fuel: number; discharge: number; optionalDischarge: number }
  > = {
    a: { solar: 0, fuel: 0, discharge: 0, optionalDischarge: 0 },
    b: { solar: 0, fuel: 0, discharge: 0, optionalDischarge: 0 },
  };
  for (const side of ['a', 'b'] as const) {
    const s = sources[side];
    const solarId = side === 'a' ? 'solar-left' : 'solar-right';
    if (pdu[side] && healthy(solarId)) {
      s.solar =
        Math.min(
          data.generation.solar.maxPowerPerWing,
          irradiance *
            data.generation.solar.areaPerWing *
            data.generation.solar.efficiency *
            incidence *
            (geometry.deployment[solarId] ?? 0),
        ) * (equipment[solarId]?.condition ?? 0);
    }
    const fuelId = `fuel-cell-${side}`;
    if (pdu[side] && healthy(fuelId)) {
      const previous = equipment[fuelId]?.values.output ?? fc.initialPowerPerStack;
      const maximum = fc.maxPowerPerStack * (equipment[fuelId]?.condition ?? 0);
      // Integrate the linear startup ramp, rather than producing its final power for all dt.
      const start = bounded(previous, 0, maximum);
      const rise = Math.min(dt, (maximum - start) / fc.rampRateWPerS);
      s.fuel = (start * rise + 0.5 * fc.rampRateWPerS * rise * rise + maximum * (dt - rise)) / dt;
    }
    const batteryId = `battery-${side}`;
    const e = equipment[batteryId];
    const temperature = state.thermal.service ?? 295;
    const charge = bounded(
      e?.values.charge ?? battery.initialEnergyPerPack,
      0,
      battery.capacityPerPack * (e?.condition ?? 0),
    );
    update(batteryId, { charge, output: 0 });
    if (
      pdu[side] &&
      healthy(batteryId) &&
      e?.mode !== 'charge' &&
      temperature >= battery.dischargeTempMin &&
      temperature <= battery.dischargeTempMax
    ) {
      s.discharge = Math.min(
        battery.maxDischargePowerPerPack * e!.condition,
        (charge * battery.dischargeEfficiency) / dt,
      );
      s.optionalDischarge = Math.min(
        s.discharge,
        (Math.max(0, charge - data.power.reserveEnergyPerBattery) * battery.dischargeEfficiency) /
          dt,
      );
    }
  }
  const hydrogen = Math.max(0, tanks['fuel-cell-hydrogen'] ?? 0);
  const oxygen = Math.max(0, tanks['fuel-cell-oxygen'] ?? 0);
  const water = Math.max(0, tanks['product-water'] ?? 0);
  const waterCapacity =
    definition.tanks.find((tank) => tank.id === 'product-water')?.capacity ?? 54;
  const fuelEnergy =
    Math.min(
      hydrogen,
      oxygen / fc.oxygenPerHydrogen,
      Math.max(0, waterCapacity - water) / fc.waterPerHydrogen,
    ) *
    fc.netEfficiencyHHV *
    fc.hydrogenHHV;
  const totalFuel = sources.a.fuel + sources.b.fuel;
  const fuelScale = totalFuel > 0 ? Math.min(1, fuelEnergy / (totalFuel * dt)) : 0;
  sources.a.fuel *= fuelScale;
  sources.b.fuel *= fuelScale;

  const essential = data.buses.find((bus) => bus.id === 'essential')!;
  const eta = essential.converterEfficiency ?? 1;
  const available = (side: Side) =>
    sources[side].solar + sources[side].fuel + sources[side].discharge;
  const essentialSide: Side = pdu.a && (available('a') >= available('b') || !pdu.b) ? 'a' : 'b';
  const busLimits = Object.fromEntries(definition.buses.map((bus) => [bus.id, bus.limit]));
  const loads: Load[] = [];
  for (const spec of definition.equipment) {
    const e = equipment[spec.id];
    if (!e || !spec.bus || spec.kind === 'battery') continue;
    const mode = modeOf(definition, spec.id, e.mode);
    const wanted =
      spec.id === data.recorder.equipmentId
        ? requestedRecorderPower(state.recorder.sampleRate, definition)
        : mode.power;
    const activeFunction = ACTIVE_FUNCTIONS.some((prefix) => spec.id.startsWith(prefix));
    const isEssential = activeFunction ? e.mode === 'active' : !spec.sheddable;
    let request = healthy(spec.id)
      ? Math.min(wanted, Math.max(isEssential ? wanted : 0, e.allocation))
      : 0;
    const faultPower = Math.max(0, e.values.faultPower ?? 0);
    if (healthy(spec.id) && faultPower > 0) {
      const feederLimit =
        spec.kind === 'power-bus' ? (busLimits[spec.bus] ?? spec.ratedPower) : spec.ratedPower;
      const tripThreshold =
        feederLimit * data.power.branchHeadroom * data.power.rpc.tripCurrentMultiple;
      const elapsed = request + faultPower > tripThreshold ? (e.values.overloadTime ?? 0) + dt : 0;
      const live =
        elapsed >= data.power.rpc.tripDelay
          ? Math.min(dt, Math.max(0, data.power.rpc.tripDelay - (e.values.overloadTime ?? 0)))
          : dt;
      request = ((request + faultPower) * live) / dt;
      update(spec.id, { overloadTime: elapsed });
      if (elapsed >= data.power.rpc.tripDelay) {
        update(spec.id, { trippedAt: state.t + live });
        equipment[spec.id] = {
          ...equipment[spec.id]!,
          tripped: true,
          faults: [...new Set([...e.faults, 'overcurrent'])],
        };
        events.push({ kind: 'breaker-trip', t: state.t + live, equipment: spec.id });
      }
    }
    const side: Side = spec.bus === 'essential' ? essentialSide : spec.bus === 'main-a' ? 'a' : 'b';
    const floor =
      spec.id === 'black-box'
        ? Math.min(request, data.recorder.powerMinimum)
        : isEssential
          ? request
          : 0;
    const shedIndex = data.power.shedOrder.indexOf(spec.id);
    const priority = isEssential
      ? 0
      : spec.id === 'ion-drive'
        ? 10
        : spec.kind === 'main-engine' || spec.kind === 'rcs-thruster'
          ? 1
          : spec.id === 'black-box'
            ? 2
            : shedIndex >= 0
              ? 10 - shedIndex
              : 3;
    loads.push({
      id: spec.id,
      side,
      bus: spec.bus,
      requested: request,
      floor,
      priority,
      factor: spec.bus === 'essential' ? 1 / eta : 1,
    });
    update(spec.id, { requestedPower: wanted });
  }
  // Charging is a separately requested load, with no simultaneous discharge.
  for (const side of ['a', 'b'] as const) {
    const id = `battery-${side}`;
    const e = equipment[id];
    const temperature = state.thermal.service ?? 295;
    if (
      e?.mode === 'charge' &&
      healthy(id) &&
      temperature >= battery.chargeTempMin &&
      temperature <= battery.chargeTempMax
    ) {
      const requested = Math.min(
        battery.maxChargePowerPerPack * e.condition,
        Math.max(0, battery.capacityPerPack * e.condition - (e.values.charge ?? 0)) /
          (dt * battery.chargeEfficiency),
      );
      loads.push({ id, side, bus: `main-${side}`, requested, floor: 0, priority: 11, factor: 1 });
    }
  }
  const demand = { a: 0, b: 0 };
  for (const load of loads) demand[load.side] += load.requested * load.factor;
  let transfer = 0; // Positive: a -> b; generation only, never pooled batteries.
  if (oldPower?.tieClosed === true && pdu.a && pdu.b) {
    const ga = Math.min(sources.a.solar + sources.a.fuel, busLimits['main-a'] ?? Infinity);
    const gb = Math.min(sources.b.solar + sources.b.fuel, busLimits['main-b'] ?? Infinity);
    transfer =
      ga > demand.a
        ? Math.min(data.power.tieMaxPower, ga - demand.a, Math.max(0, demand.b - gb))
        : -Math.min(data.power.tieMaxPower, Math.max(0, gb - demand.b), Math.max(0, demand.a - ga));
  }
  const generatedAvailable = {
    a: sources.a.solar + sources.a.fuel - transfer,
    b: sources.b.solar + sources.b.fuel + transfer,
  };
  const spent = { a: 0, b: 0 };
  const busSpent: Record<string, number> = {};
  const draws: Record<string, number> = {};
  const allocate = (load: Load, request: number, protectedLoad: boolean): void => {
    const capacity =
      generatedAvailable[load.side] +
      (protectedLoad ? sources[load.side].discharge : sources[load.side].optionalDischarge);
    const outgoing = Math.max(0, load.side === 'a' ? transfer : -transfer);
    const headroom = Math.max(
      0,
      Math.min(
        capacity - spent[load.side],
        (busLimits[`main-${load.side}`] ?? Infinity) - outgoing - spent[load.side],
      ),
    );
    const busRoom = Math.max(0, (busLimits[load.bus] ?? Infinity) - (busSpent[load.bus] ?? 0));
    const supplied = pdu[load.side] ? Math.min(request, headroom / load.factor, busRoom) : 0;
    draws[load.id] = (draws[load.id] ?? 0) + supplied;
    spent[load.side] += supplied * load.factor;
    busSpent[load.bus] = (busSpent[load.bus] ?? 0) + supplied;
  };
  for (const load of loads.filter((load) => load.floor > 0).sort((a, b) => a.priority - b.priority))
    allocate(load, load.floor, true);
  for (const load of [...loads].sort((a, b) => a.priority - b.priority))
    allocate(load, load.requested - load.floor, false);
  // Limits may have rejected some receiver demand; do not export energy into a nonexistent load.
  transfer =
    transfer >= 0
      ? Math.min(transfer, Math.max(0, spent.b - sources.b.solar - sources.b.fuel))
      : -Math.min(-transfer, Math.max(0, spent.a - sources.a.solar - sources.a.fuel));
  let loadWatts = 0;
  let conversionLoss = 0;
  let unmet = 0;
  for (const load of loads) {
    const draw = draws[load.id] ?? 0;
    const e = equipment[load.id]!;
    const mode = modeOf(definition, load.id, e.mode);
    const short = Math.max(0, load.requested - draw);
    loadWatts += draw;
    unmet += short;
    conversionLoss += draw * (load.factor - 1);
    const heat =
      load.id === 'black-box' ? draw : mode.power > 0 ? (draw * mode.heat) / mode.power : draw;
    update(load.id, { heat, unmetPower: short }, draw);
    if (short > 1e-9 && (state.equipment[load.id]?.values.unmetPower ?? 0) <= 1e-9) {
      events.push(
        load.floor > 0 && draw < load.floor
          ? { kind: 'equipment-fault', t: state.t, equipment: load.id, fault: 'power-shortfall' }
          : {
              kind: 'load-shed',
              t: state.t,
              equipment: load.id,
              reason: 'bus supply, reserve or rating limit',
            },
      );
    }
  }
  update(`pdu-${essentialSide}`, {
    heat: (equipment[`pdu-${essentialSide}`]?.values.heat ?? 0) + conversionLoss,
  });
  let generated = 0;
  let discharged = 0;
  let charged = 0;
  let batteryLoss = 0;
  let fuelGenerated = 0;
  const busLedger: Record<string, JsonValue> = {};
  for (const side of ['a', 'b'] as const) {
    const s = sources[side];
    const id = `battery-${side}`;
    const e = equipment[id];
    let chargeInput = draws[id] ?? 0;
    let sourceNeed = spent[side] + (side === 'a' ? transfer : -transfer);
    // An idle battery absorbs real excess solar; it never creates fuel-cell demand.
    const temp = state.thermal.service ?? 295;
    if (
      e &&
      healthy(id) &&
      e.mode !== 'discharge' &&
      chargeInput === 0 &&
      s.solar > sourceNeed &&
      temp >= battery.chargeTempMin &&
      temp <= battery.chargeTempMax
    ) {
      chargeInput = Math.min(
        s.solar - sourceNeed,
        battery.maxChargePowerPerPack * e.condition,
        Math.max(0, battery.capacityPerPack * e.condition - (e.values.charge ?? 0)) /
          (dt * battery.chargeEfficiency),
        Math.max(0, (busLimits[`main-${side}`] ?? Infinity) - spent[side]),
      );
      sourceNeed += chargeInput;
      spent[side] += chargeInput;
      loadWatts += chargeInput;
    }
    const solarOutput = Math.min(s.solar, Math.max(0, sourceNeed));
    const fuelOutput = Math.min(s.fuel, Math.max(0, sourceNeed - solarOutput));
    const discharge = Math.max(0, sourceNeed - solarOutput - fuelOutput);
    const loss =
      chargeInput * (1 - battery.chargeEfficiency) +
      discharge * (1 / battery.dischargeEfficiency - 1);
    const before = e?.values.charge ?? 0;
    const after = Math.max(
      0,
      before +
        dt * (chargeInput * battery.chargeEfficiency - discharge / battery.dischargeEfficiency),
    );
    update(
      id,
      { charge: after, output: discharge, heat: loss, generatedPower: discharge },
      chargeInput,
    );
    if (before > 0 && after <= 1e-8)
      events.push({ kind: 'battery-depleted', t: state.t + dt, equipment: id });
    const fuelId = `fuel-cell-${side}`;
    const previous = state.equipment[fuelId]?.values.output ?? 0;
    // Recover ramp terminal value from its integrated output where ramp-limited.
    const endOutput =
      fuelOutput >= s.fuel - 1e-9 && fuelOutput > 0
        ? Math.min(
            fc.maxPowerPerStack * (equipment[fuelId]?.condition ?? 0),
            previous + fc.rampRateWPerS * dt,
          )
        : fuelOutput;
    update(fuelId, {
      output: endOutput,
      generatedPower: fuelOutput,
      heat: fuelOutput * (1 / fc.netEfficiencyHHV - 1),
    });
    update(side === 'a' ? 'solar-left' : 'solar-right', {
      output: solarOutput,
      generatedPower: solarOutput,
    });
    generated += solarOutput + fuelOutput;
    fuelGenerated += fuelOutput;
    discharged += discharge;
    charged += chargeInput;
    batteryLoss += loss;
    busLedger[`main-${side}`] = {
      load: spent[side],
      generated: solarOutput + fuelOutput,
      discharged: discharge,
      // 0 − transfer, not −transfer: an open tie must store +0 (−0 does not survive a JSON save).
      transfer: side === 'a' ? 0 - transfer : transfer,
    };
  }
  const consumedHydrogen = (fuelGenerated * dt) / (fc.netEfficiencyHHV * fc.hydrogenHHV);
  tanks['fuel-cell-hydrogen'] = Math.max(0, hydrogen - consumedHydrogen);
  tanks['fuel-cell-oxygen'] = Math.max(0, oxygen - consumedHydrogen * fc.oxygenPerHydrogen);
  tanks['product-water'] = water + consumedHydrogen * fc.waterPerHydrogen;
  for (const bus of ['essential', 'payload']) busLedger[bus] = { load: busSpent[bus] ?? 0 };
  return {
    state: {
      ...state,
      equipment,
      tanks,
      ext: {
        ...state.ext,
        power: {
          tieClosed: oldPower?.tieClosed === true,
          generated,
          fuelGenerated,
          discharged,
          charged,
          load: loadWatts - charged,
          conversionLoss,
          batteryLoss,
          unmet,
          buses: busLedger,
        },
      },
    },
    events,
  };
}
