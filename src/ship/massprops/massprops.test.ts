import { describe, expect, it } from 'vitest';
import baseline from '../../../data/ship-baseline.json';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import { angleBetween, IDENTITY, norm } from '../../lib/quat.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { computeMassProperties, inertiaTensor, massDetail, yawInertia } from './massprops.ts';

describe('baseline mass properties (C02, C13)', () => {
  const definition = loadShipDefinition();
  it('matches the independent 1C wet and drained sums', () => {
    const initial = createShipSystemsState(definition);
    expect(initial.massProperties.mass).toBe(30374);
    expect(initial.massProperties.centerOfMass.x).toBeCloseTo(-0.33285, 6);
    // 1C's yaw inertia is the zz term of the tensor; heights do not enter it.
    expect(yawInertia(initial.massProperties.inertia)).toBeCloseTo(325048.751, 3);
    const empty = computeMassProperties(
      { ...initial, tanks: { ...initial.tanks, 'main-propellant': 0 } },
      definition,
    );
    expect(empty.mass).toBe(24374);
    expect(empty.centerOfMass.x).toBeCloseTo(0.077542, 6);
    expect(empty.centerOfMass.x).toBeGreaterThan(initial.massProperties.centerOfMass.x);
  });
  it('keeps converted reactants aboard and moves their center forward', () => {
    const initial = createShipSystemsState(definition);
    const converted = computeMassProperties(
      {
        ...initial,
        tanks: {
          ...initial.tanks,
          'fuel-cell-hydrogen': 0,
          'fuel-cell-oxygen': 0,
          'product-water': 54,
        },
      },
      definition,
    );
    expect(converted.mass).toBe(initial.massProperties.mass);
    expect(converted.centerOfMass.x - initial.massProperties.centerOfMass.x).toBeCloseTo(
      54 / 30374,
      12,
    );
  });
  it('moves the center sideways when only the left RCS reservoir drains', () => {
    const initial = createShipSystemsState(definition);
    const drained = computeMassProperties(
      { ...initial, tanks: { ...initial.tanks, 'rcs-left': 0 } },
      definition,
    );
    expect(drained.centerOfMass.y).toBeLessThan(initial.massProperties.centerOfMass.y);
    expect(drained.mass).toBe(30224);
  });
});

describe('mass properties in three dimensions (C02, C04)', () => {
  const definition = loadShipDefinition();
  const base = createShipSystemsState(definition);
  /** The ship in a configuration with its appendages fully there, tanks full or all empty. */
  function ship(configuration: string, empty: boolean): ShipSystemsState {
    const equipment = { ...base.equipment };
    const overrides =
      definition.configurations.find((c) => c.id === configuration)!.paramOverrides ?? {};
    for (const [key, value] of Object.entries(overrides)) {
      const [id, param] = key.split('.');
      if (param === 'deployment')
        equipment[id!] = {
          ...equipment[id!]!,
          values: { ...equipment[id!]!.values, deployment: value },
        };
    }
    return {
      ...base,
      configuration,
      equipment,
      tanks: empty ? Object.fromEntries(Object.keys(base.tanks).map((id) => [id, 0])) : base.tanks,
    };
  }

  it('matches the independent sums for every configuration, full and empty', () => {
    // Expected values: docs/engineering/ship-baseline.md, "Inertia about the centre of mass in
    // three dimensions", computed by validate_baseline.py (Python, its own Jacobi rotation).
    // [mass, [com x, y, z], [Ixx, Iyy, Izz], [Ixy, Ixz, Iyz], principal moments, tilt in °]
    type Row = [number, number[], number[], number[], number[], number];
    const full = [-0.3329, 0.0021, -0.1047];
    const empty = [0.0915, 0.0026, -0.1471];
    const p = [300, 10568, -22];
    const q = [327, 8730, -24];
    const table: Record<string, Row> = {
      'stowed full': [30374, full, [83057, 306970, 305049], p, [82554, 306970, 305551], 2.74],
      'stowed empty': [24000, empty, [75204, 278047, 277005], q, [74826, 278047, 277382], 2.62],
      'radiators full': [30374, full, [102615, 307412, 325049], p, [102113, 307412, 325550], 2.72],
      'radiators empty': [24000, empty, [94762, 278489, 297005], q, [94385, 278489, 297381], 2.47],
      'solar full': [30374, full, [115167, 307460, 337649], p, [114665, 307460, 338150], 2.71],
      'solar empty': [24000, empty, [107314, 278537, 309605], q, [106937, 278537, 309981], 2.47],
      'allDeployed full': [
        30374,
        full,
        [134725, 307902, 357649],
        p,
        [134224, 307902, 358149],
        2.71,
      ],
      'allDeployed empty': [
        24000,
        empty,
        [126872, 278979, 329605],
        q,
        [126496, 278979, 329980],
        2.46,
      ],
    };
    for (const [name, [mass, com, diagonal, products, moments, tilt]] of Object.entries(table)) {
      const [configuration, loading] = name.split(' ');
      const detail = massDetail(ship(configuration!, loading === 'empty'), definition);
      const properties = detail.properties;
      expect(properties.mass, name).toBeCloseTo(mass, 9);
      expect(properties.centerOfMass.x, name).toBeCloseTo(com[0]!, 4);
      expect(properties.centerOfMass.y, name).toBeCloseTo(com[1]!, 4);
      expect(properties.centerOfMass.z, name).toBeCloseTo(com[2]!, 4);
      const [xx, xy, xz, yy, yz, zz] = detail.tensor;
      // The table is rounded to 1 kg·m².
      [xx, yy, zz].forEach((value, i) =>
        expect(Math.abs(value - diagonal[i]!), name).toBeLessThan(0.6),
      );
      [xy, xz, yz].forEach((value, i) =>
        expect(Math.abs(value - products[i]!), name).toBeLessThan(0.6),
      );
      const principal = properties.inertia.moments;
      [principal.x, principal.y, principal.z].forEach((value, i) =>
        expect(Math.abs(value - moments[i]!), name).toBeLessThan(0.6),
      );
      expect((angleBetween(properties.inertia.axes, IDENTITY) * 180) / Math.PI, name).toBeCloseTo(
        tilt,
        1,
      );
    }
  });

  it('reports the tensor as principal moments and axes that rebuild it', () => {
    for (const configuration of ['stowed', 'radiators', 'solar', 'allDeployed']) {
      const detail = massDetail(ship(configuration, false), definition);
      const inertia = detail.properties.inertia;
      expect(norm(inertia.axes)).toBeCloseTo(1, 12);
      const rebuilt = inertiaTensor(inertia);
      detail.tensor.forEach((term, i) => expect(rebuilt[i]! - term).toBeCloseTo(0, 6));
      // The trace is the sum of the principal moments.
      expect(inertia.moments.x + inertia.moments.y + inertia.moments.z).toBeCloseTo(
        detail.tensor[0] + detail.tensor[3] + detail.tensor[5],
        6,
      );
      // The low, forward life-support gear tilts the long principal axis about 2.7° in the
      // x–z plane; the principal axes stay close to the body axes.
      expect(inertia.moments.x).toBeLessThan(inertia.moments.y);
      expect(angleBetween(inertia.axes, IDENTITY)).toBeLessThan(0.06);
      // No negative zero reaches the state.
      expect(JSON.parse(JSON.stringify(detail.properties))).toEqual(detail.properties);
    }
  });

  it('heights change neither the yaw inertia nor the planar centre of mass', () => {
    // The planar sums of 1C, done here from the data file without any height.
    const state = ship('radiators', false);
    const deployed = new Set(['radiator-left', 'radiator-right']);
    const parts: { mass: number; x: number; y: number; yaw: number }[] = [];
    for (const e of baseline.equipment) {
      const wing = baseline.configuration.appendages.find((a) => a.id === e.id);
      const out = wing !== undefined && deployed.has(e.id);
      const position = out ? wing.deployedPosition : e.position;
      parts.push({
        mass: e.mass,
        x: position[0]!,
        y: position[1]!,
        yaw: out ? wing.deployedInertia : e.intrinsicInertia,
      });
    }
    for (const r of [...baseline.propellant, ...baseline.reactants])
      parts.push({
        mass: r.initialMass,
        x: r.position[0]!,
        y: r.position[1]!,
        yaw: r.initialMass * r.intrinsicInertiaPerKg,
      });
    const mass = parts.reduce((sum, part) => sum + part.mass, 0);
    const cx = parts.reduce((sum, part) => sum + part.mass * part.x, 0) / mass;
    const cy = parts.reduce((sum, part) => sum + part.mass * part.y, 0) / mass;
    const yaw = parts.reduce(
      (sum, part) => sum + part.yaw + part.mass * ((part.x - cx) ** 2 + (part.y - cy) ** 2),
      0,
    );
    const detail = massDetail(state, definition);
    expect(detail.properties.mass).toBe(mass);
    expect(detail.properties.centerOfMass.x).toBeCloseTo(cx, 12);
    expect(detail.properties.centerOfMass.y).toBeCloseTo(cy, 12);
    expect(detail.tensor[5]).toBeCloseTo(yaw, 6);
    expect(yaw).toBeCloseTo(325048.751, 3);
    // The principal moment nearest z is not that number: the axes are tilted.
    expect(detail.properties.inertia.moments.z).toBeCloseTo(325549.7, 1);
    // What heights do add: a centre of mass 105 mm below the hull axis.
    expect(detail.properties.centerOfMass.z).toBeCloseTo(-0.104672, 6);
  });

  it('moves the roll and yaw inertia with a wing, hardly the pitch inertia', () => {
    const half: ShipSystemsState = {
      ...base,
      equipment: {
        ...base.equipment,
        'solar-left': {
          ...base.equipment['solar-left']!,
          values: { ...base.equipment['solar-left']!.values, deployment: 0.5 },
        },
      },
    };
    const before = massDetail(base, definition).tensor;
    const after = massDetail(half, definition).tensor;
    // A 300 kg wing moved 2.5 m outboard (to y = 4.5) and half unfolded.
    expect(after[0] - before[0]).toBeGreaterThan(5000);
    expect(after[5] - before[5]).toBeGreaterThan(5000);
    expect(Math.abs(after[3] - before[3])).toBeLessThan(200);
    // One wing out on the left, forward of the centre of mass: an xy product appears.
    expect(Math.abs(after[1] - before[1])).toBeGreaterThan(1000);
  });

  it('gives the same values whether recalled or recomputed', () => {
    const state = ship('allDeployed', false);
    const first = computeMassProperties(state, definition);
    // Asked again with an equal state: the remembered result.
    expect(computeMassProperties({ ...state }, definition)).toBe(first);
    // A fresh definition has no memory and must give the same numbers.
    const fresh = computeMassProperties(state, loadShipDefinition());
    expect(fresh).not.toBe(first);
    expect(fresh).toEqual(first);
    // A different loading is a different answer, and the first is still the first.
    const lighter = computeMassProperties(
      { ...state, tanks: { ...state.tanks, 'rcs-right': 100 } },
      definition,
    );
    expect(lighter.mass).toBe(first.mass - 50);
    expect(computeMassProperties(state, definition)).toEqual(first);
  });
});
