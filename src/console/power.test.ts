/**
 * The electrical budget: what each load is set to draw, by the ship's own rule, before the ship
 * has reported anything and after; what the sources give; how long the reactants last.
 */
import { describe, expect, it } from 'vitest';
import type { BelievedShip, EquipmentSpec, ShipDefinition } from '../contracts/index.ts';
import { designedDraw, modePower, powerBudget, settableModes, settingOf } from './power.ts';

const unit = (
  id: string,
  kind: string,
  modes: Record<string, number>,
  extra: Partial<EquipmentSpec> = {},
): EquipmentSpec =>
  ({
    id,
    kind,
    name: id.replace(/-/g, ' '),
    mass: 1,
    position: { x: 0, y: 0, z: 0 },
    ratedPower: Math.max(...Object.values(modes)),
    bus: 'essential',
    modes: [...Object.keys(modes), 'reset'],
    defaultMode: Object.keys(modes)[1] ?? Object.keys(modes)[0]!,
    sheddable: true,
    params: Object.fromEntries(Object.entries(modes).map(([m, w]) => [`mode.${m}.power`, w])),
    ...extra,
  }) as unknown as EquipmentSpec;

const eclss = unit(
  'eclss-a',
  'life-support',
  { off: 0, active: 1800, standby: 80 },
  { sheddable: false },
);
const pump = unit('internal-pump-a', 'other', { off: 0, active: 120 });
const cpu = unit(
  'flight-cpu-a',
  'processor',
  { off: 0, active: 120, standby: 20 },
  { sheddable: false },
);
const camera = unit(
  'camera',
  'optical-tracker',
  { off: 0, survey: 60, track: 120, detail: 200 },
  {
    bus: 'payload',
    defaultMode: 'track',
  },
);
const science = unit(
  'science-processor',
  'processor',
  { off: 0, idle: 40, science: 350, lattice: 1000 },
  {
    bus: 'payload',
  },
);
const recorder = unit(
  'black-box',
  'recorder',
  { off: 0, minimum: 15, normal: 35, high: 100 },
  {
    defaultMode: 'normal',
  },
);
const cell = (id: string): EquipmentSpec =>
  ({
    ...unit(id, 'power-source', { off: 0, following: 0 }),
    params: { 'mode.off.generatedPower': 0, 'mode.following.generatedPower': 6000 },
  }) as EquipmentSpec;
const battery = unit('battery-a', 'battery', { off: 0, idle: 0, charge: 2000 });
const tank = unit('main-tank', 'other', { off: 0 }, { bus: undefined } as Partial<EquipmentSpec>);

const definition = {
  equipment: [
    cell('fuel-cell-a'),
    cell('fuel-cell-b'),
    battery,
    eclss,
    pump,
    cpu,
    camera,
    science,
    recorder,
    tank,
  ],
  systems: {
    generation: { fuelCell: { hydrogenHHV: 1.42e8, netEfficiencyHHV: 0.5, oxygenPerHydrogen: 8 } },
    recorder: {
      minimumSampleRate: 1,
      normalSampleRate: 10,
      highSampleRate: 50,
      powerMinimum: 15,
      powerNormal: 35,
      powerHigh: 100,
    },
  },
} as unknown as ShipDefinition;

/** The ship before ENTER: modes and allocations known, nothing drawn, nothing reported. */
const atArrival = {
  equipment: Object.fromEntries(
    definition.equipment.map((e) => [
      e.id,
      {
        id: e.id,
        mode: e.id.startsWith('fuel-cell') ? 'following' : e.defaultMode,
        allocation: e.ratedPower,
        powerDraw: 0,
        condition: 1,
        tripped: false,
        faults: [],
        readings: {},
      },
    ]),
  ),
  telemetry: {},
  propellant: {
    'fuel-cell-hydrogen': { mean: 6, sigma: 0 },
    'fuel-cell-oxygen': { mean: 48, sigma: 0 },
  },
} as unknown as BelievedShip;

describe('what a unit draws as set', () => {
  it('asks for its mode’s rating, held to its allocation where the ship may shed it', () => {
    expect(modePower(camera, 'track')).toBe(120);
    expect(designedDraw(camera, { mode: 'track', allocation: 200 }, definition)).toBe(120);
    expect(designedDraw(camera, { mode: 'track', allocation: 90 }, definition)).toBe(90);
    expect(designedDraw(camera, { mode: 'detail', allocation: 200 }, definition)).toBe(200);
    expect(designedDraw(camera, { mode: 'off', allocation: 200 }, definition)).toBe(0);
  });

  it('gives a unit the ship never sheds what its mode asks, whatever its allocation', () => {
    expect(designedDraw(eclss, { mode: 'active', allocation: 0 }, definition)).toBe(1800);
    expect(designedDraw(eclss, { mode: 'standby', allocation: 0 }, definition)).toBe(80);
  });

  it('prices the recorder by its sample rate, as the ship does', () => {
    const set = { mode: 'normal', allocation: 100 };
    expect(designedDraw(recorder, set, definition, 0.05)).toBe(15);
    expect(designedDraw(recorder, set, definition, 10)).toBe(35);
    // Without a rate the mode's own rating stands.
    expect(designedDraw(recorder, set, definition)).toBe(35);
  });

  it('counts nothing for a unit with no bus', () => {
    expect(designedDraw(tank, { mode: 'off', allocation: 0 }, definition)).toBe(0);
  });

  it('offers the modes a player chooses between, not resets or transients', () => {
    const solar = unit('solar-left', 'power-source', {
      off: 0,
      stowed: 0,
      deployed: 0,
      deploying: 100,
    });
    expect(settableModes(solar)).toEqual(['off', 'stowed', 'deployed']);
    const jet = {
      ...unit('rcs', 'rcs-thruster', { off: 0, ready: 15 }),
      modes: ['off', 'ready', 'fire-one', 'bank-a', 'jet-0', 'reset'],
    } as EquipmentSpec;
    expect(settableModes(jet)).toEqual(['off', 'ready']);
  });
});

describe('a setting: what waits to be sent, else what the ship reports, else the default', () => {
  it('prefers a setting made before ENTER to what the ship still reports', () => {
    expect(settingOf(camera, atArrival)).toEqual({ mode: 'track', allocation: 200 });
    expect(settingOf(camera, atArrival, { camera: { mode: 'detail' } })).toEqual({
      mode: 'detail',
      allocation: 200,
    });
    expect(settingOf(camera, atArrival, { camera: { allocation: 60 } })).toEqual({
      mode: 'track',
      allocation: 60,
    });
  });

  it('falls back to the design for a unit the ship has not reported', () => {
    const silent = { ...atArrival, equipment: {} } as unknown as BelievedShip;
    expect(settingOf(camera, silent)).toEqual({ mode: 'track', allocation: 200 });
  });
});

describe('the budget before the ship has reported anything', () => {
  const budget = powerBudget(atArrival, definition, {}, 0.05);

  it('is there before time starts: every load as set, none measured', () => {
    expect(budget.loads.map((l) => [l.id, l.designed])).toEqual([
      ['life', 1800],
      ['cooling', 120],
      ['avionics', 120],
      ['camera', 120],
      ['science-processor', 40],
      ['black-box', 15],
    ]);
    expect(budget.demand).toBe(2215);
    expect(budget.measured).toBeUndefined();
    expect(budget.loads.every((l) => l.measured === undefined)).toBe(true);
  });

  it('lets the player set the camera, the recorder and the science processor one by one', () => {
    expect(budget.loads.filter((l) => l.unit).map((l) => l.id)).toEqual([
      'camera',
      'science-processor',
      'black-box',
    ]);
    // A flight computer is avionics, not a load to set: only the payload's processor is.
    expect(budget.loads.find((l) => l.id === 'avionics')!.units).toEqual(['flight-cpu-a']);
  });

  it('shares the load among the sources until the ship says what each gives', () => {
    expect(budget.sources).toEqual([
      { id: 'fuel-cell-a', label: 'fuel cell a', value: 2215, capacity: 6000, measured: false },
      { id: 'fuel-cell-b', label: 'fuel cell b', value: 0, capacity: 6000, measured: false },
    ]);
    expect(budget.available).toBe(12_000);
  });

  it('says how long the reactants last at this load', () => {
    // 6 kg of hydrogen (the oxygen is enough for all of it) at 142 MJ/kg and 50%.
    expect(budget.endurance).toBeCloseTo((6 * 1.42e8 * 0.5) / 2215, 6);
  });

  it('moves with a setting made before ENTER, and with nothing else', () => {
    const more = powerBudget(atArrival, definition, { camera: { mode: 'detail' } }, 0.05);
    expect(more.demand - budget.demand).toBe(80);
    expect(more.endurance!).toBeLessThan(budget.endurance!);
    expect(more.loads.find((l) => l.id === 'life')!.designed).toBe(1800);
    const shed = powerBudget(atArrival, definition, { camera: { allocation: 0 } }, 0.05);
    expect(shed.loads.find((l) => l.id === 'camera')!.designed).toBe(0);
  });

  it('is limited by the oxygen when that runs short first', () => {
    const lean = {
      ...atArrival,
      propellant: { ...atArrival.propellant, 'fuel-cell-oxygen': { mean: 8, sigma: 0 } },
    } as unknown as BelievedShip;
    expect(powerBudget(lean, definition, {}, 0.05).endurance).toBeCloseTo(
      (1 * 1.42e8 * 0.5) / 2215,
      6,
    );
  });

  it('gives no endurance where the design does not say how the cells burn', () => {
    const bare = { ...definition, systems: {} } as unknown as ShipDefinition;
    expect(powerBudget(atArrival, bare).endurance).toBeUndefined();
  });
});

describe('the budget once the ship reports', () => {
  const flying = {
    ...atArrival,
    telemetry: { 'main-a.load': { t: 10, value: 2300, sigma: 0 } },
    equipment: {
      ...atArrival.equipment,
      camera: { ...atArrival.equipment.camera!, powerDraw: 118 },
      'eclss-a': { ...atArrival.equipment['eclss-a']!, powerDraw: 1800 },
      'fuel-cell-a': {
        ...atArrival.equipment['fuel-cell-a']!,
        readings: { output: 2100, 'generated-power': 2100 },
      },
      'fuel-cell-b': { ...atArrival.equipment['fuel-cell-b']!, readings: { output: 200 } },
    },
  } as unknown as BelievedShip;
  const budget = powerBudget(flying, definition, {}, 0.05);

  it('shows what is drawn beside what was set', () => {
    const cam = budget.loads.find((l) => l.id === 'camera')!;
    expect(cam.designed).toBe(120);
    expect(cam.measured).toBe(118);
    expect(budget.measured).toBe(1918);
  });

  it('shows what each source really gives', () => {
    expect(budget.sources.map((s) => [s.id, s.value, s.measured])).toEqual([
      ['fuel-cell-a', 2100, true],
      ['fuel-cell-b', 200, true],
    ]);
  });
});
