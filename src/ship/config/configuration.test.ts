import { describe, expect, it } from 'vitest';
import { hullReach, type Hull, type HullPrism } from '../../contracts/ship.ts';
import type { ShipSystemsState } from '../../contracts/truth/ship.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { loadShipDefinition } from '../definition.ts';
import { createShipSystemsState } from '../state.ts';
import { computeMassProperties } from '../massprops/massprops.ts';
import { getGeometry, prepareConfiguration, stepConfiguration } from './configuration.ts';

describe('configuration geometry (C04)', () => {
  const definition = loadShipDefinition();
  it('requires motor power and freezes the occupied geometry on loss of power', () => {
    const initial = createShipSystemsState(definition);
    const commanded = prepareConfiguration(
      { ...initial, transition: { to: 'stowed', completesAt: 20 } },
      definition,
    );
    const stalled = stepConfiguration(commanded, definition, 10).state;
    expect(getGeometry(stalled, definition)).toEqual(getGeometry(initial, definition));
    expect(stalled.transition).toBeDefined();
    expect(commanded.equipment['radiator-left']!.mode).toBe('moving');
  });
  it('uses the same intermediate extension for position, inertia and footprint', () => {
    const initial = createShipSystemsState(definition);
    const left = initial.equipment['radiator-left']!;
    const state = {
      ...initial,
      transition: { to: 'stowed', completesAt: 20 },
      equipment: {
        ...initial.equipment,
        'radiator-left': { ...left, mode: 'moving', powerDraw: 80 },
      },
    };
    const halfway = stepConfiguration(state, definition, 10).state;
    const geometry = getGeometry(halfway, definition);
    expect(geometry.deployment['radiator-left']).toBe(0.5);
    expect(geometry.deployment['radiator-right']).toBe(1);
    expect(geometry.positions['radiator-left']!.y).toBe(4);
    expect(geometry.intrinsicInertia['radiator-left']).toBe(1500);
    // A thin plate at every extension: yaw = roll + pitch.
    expect(
      geometry.intrinsicInertiaRoll['radiator-left']! +
        geometry.intrinsicInertiaPitch['radiator-left']!,
    ).toBe(1500);
    // The occupied volume is several prisms now; the extent across all of them is unchanged.
    const outline = geometry.hull.flatMap((prism) => prism.outline);
    expect(Math.max(...outline.map((p) => p.y))).toBe(6.25);
    expect(Math.min(...outline.map((p) => p.y))).toBe(-10);
    expect(computeMassProperties(halfway, definition).centerOfMass.y).toBeLessThan(
      initial.massProperties.centerOfMass.y,
    );
  });
  it('completes only when all moving appendages reach their targets', () => {
    const initial = createShipSystemsState(definition);
    const equipment = { ...initial.equipment };
    for (const id of ['radiator-left', 'radiator-right'])
      equipment[id] = { ...equipment[id]!, mode: 'moving', powerDraw: 80 };
    const result = stepConfiguration(
      { ...initial, equipment, transition: { to: 'stowed', completesAt: 20 } },
      definition,
      20,
    );
    expect(result.state.transition).toBeUndefined();
    expect(result.state.configuration).toBe('stowed');
    expect(result.events).toEqual([
      { kind: 'configuration-changed', t: 20, configuration: 'stowed' },
    ]);
    expect(getGeometry(result.state, definition).hull).toEqual(
      definition.configurations.find((c) => c.id === 'stowed')!.hull,
    );
  });
});

describe('hull prisms (C04, A11)', () => {
  const definition = loadShipDefinition();
  const hullOf = (id: string): Hull => definition.configurations.find((c) => c.id === id)!.hull;
  const box = (prism: HullPrism) => ({
    x: [Math.min(...prism.outline.map((p) => p.x)), Math.max(...prism.outline.map((p) => p.x))],
    y: [Math.min(...prism.outline.map((p) => p.y)), Math.max(...prism.outline.map((p) => p.y))],
    z: [prism.zMin, prism.zMax],
  });
  /** Is the body-frame point inside the prism (convex outline, counter-clockwise)? */
  const inside = (prism: HullPrism, point: Vec3): boolean =>
    point.z >= prism.zMin &&
    point.z <= prism.zMax &&
    prism.outline.every((a, i) => {
      const b = prism.outline[(i + 1) % prism.outline.length]!;
      return (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) >= 0;
    });
  const occupied = (hull: Hull, point: Vec3) => hull.some((prism) => inside(prism, point));
  const part = (hull: Hull, id: string) => box(hull.find((prism) => prism.part === id)!);

  it('is the pressure hull over its 5 m diameter plus one thin prism per wing', () => {
    for (const id of ['stowed', 'radiators', 'solar', 'allDeployed']) {
      const hull = hullOf(id);
      expect(hull.map((prism) => prism.part)).toEqual([
        'habitat-structure',
        'radiator-left',
        'radiator-right',
        'solar-left',
        'solar-right',
      ]);
      // The body: 16 m long, 5 m wide, 5 m high, the same in every configuration.
      expect(box(hull[0]!)).toEqual({ x: [-8, 8], y: [-2.5, 2.5], z: [-2.5, 2.5] });
      // Every outline is convex and counter-clockwise seen from +z, as the contract asks.
      for (const prism of hull) {
        const n = prism.outline.length;
        expect(n).toBeGreaterThanOrEqual(3);
        for (let i = 0; i < n; i++) {
          const a = prism.outline[i]!;
          const b = prism.outline[(i + 1) % n]!;
          const c = prism.outline[(i + 2) % n]!;
          expect((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)).toBeGreaterThan(0);
        }
        expect(prism.zMax).toBeGreaterThan(prism.zMin);
      }
    }
  });

  it('grows each wing with its own configuration only', () => {
    const wing = (id: string, name: string) => part(hullOf(id), name);
    // Radiators: 5 m chord aft of the origin, 0.2 m thick, out to y = ±10 when deployed.
    expect(wing('stowed', 'radiator-left')).toEqual({ x: [-4, 1], y: [1.5, 2.5], z: [-0.1, 0.1] });
    expect(wing('radiators', 'radiator-left')).toEqual({ x: [-4, 1], y: [2, 10], z: [-0.1, 0.1] });
    expect(wing('radiators', 'radiator-right')).toEqual({
      x: [-4, 1],
      y: [-10, -2],
      z: [-0.1, 0.1],
    });
    expect(wing('solar', 'radiator-left')).toEqual(wing('stowed', 'radiator-left'));
    // Solar wings: 6 m chord forward, 0.1 m thick, out to y = ±12.
    expect(wing('stowed', 'solar-right')).toEqual({
      x: [0, 6],
      y: [-2.5, -1.5],
      z: [-0.05, 0.05],
    });
    expect(wing('solar', 'solar-right')).toEqual({ x: [0, 6], y: [-12, -2], z: [-0.05, 0.05] });
    expect(wing('radiators', 'solar-right')).toEqual(wing('stowed', 'solar-right'));
    expect(wing('allDeployed', 'solar-left')).toEqual({ x: [0, 6], y: [2, 12], z: [-0.05, 0.05] });
    expect(wing('allDeployed', 'radiator-right')).toEqual(wing('radiators', 'radiator-right'));
    // Stowed, every wing lies inside the body: stowing adds nothing to the envelope.
    const stowed = hullOf('stowed');
    for (const prism of stowed.slice(1))
      for (const p of prism.outline) expect(inside(stowed[0]!, { ...p, z: 0 })).toBe(true);
  });

  it('is the union of the parts, not the old convex outline around them', () => {
    const all = hullOf('allDeployed');
    // On a wing, near a wing tip, in the body.
    expect(occupied(all, { x: 3, y: 8, z: 0 })).toBe(true);
    expect(occupied(all, { x: -2, y: -9.9, z: 0.09 })).toBe(true);
    expect(occupied(all, { x: 7, y: 0, z: 2.4 })).toBe(true);
    // Above a wing there is nothing: a wing is 0.1 to 0.2 m thick, not 5 m.
    expect(occupied(all, { x: 3, y: 8, z: 0.3 })).toBe(false);
    expect(occupied(all, { x: -2, y: 6, z: 1 })).toBe(false);
    // Between the wing tips and the nose and tail, which the old convex footprint
    // ((−8, 2.5) to (−4, 10), and (6, 12) to (8, 2.5)) counted as ship, there is nothing.
    expect(occupied(all, { x: -6, y: 5, z: 0 })).toBe(false);
    expect(occupied(all, { x: 7, y: 6, z: 0 })).toBe(false);
    // The farthest corner from the centre of mass: a solar wing tip, or a corner of the body.
    const com = createShipSystemsState(definition).massProperties.centerOfMass;
    expect(hullReach(all, com)).toBeCloseTo(
      Math.hypot(6 - com.x, 12 + Math.abs(com.y), 0.05 - com.z),
      9,
    );
    expect(hullReach(hullOf('stowed'), com)).toBeCloseTo(
      Math.hypot(8 - com.x, 2.5 + Math.abs(com.y), 2.5 - com.z),
      9,
    );
  });

  it('follows a wing through a transition, and stops where the wing stops', () => {
    const initial = createShipSystemsState(definition);
    expect(initial.massProperties.hull).toEqual(hullOf('radiators'));
    const powered = (
      state: ShipSystemsState,
      ids: string[],
      mode: string,
      watts: number,
    ): ShipSystemsState => ({
      ...state,
      equipment: {
        ...state.equipment,
        ...Object.fromEntries(
          ids.map((id) => [id, { ...state.equipment[id]!, mode, powerDraw: watts }]),
        ),
      },
    });
    // Deploying the solar wings (30 s): a third of the way after 10 s.
    let state = powered(
      { ...initial, transition: { to: 'allDeployed', completesAt: 30 } },
      ['solar-left', 'solar-right'],
      'deploying',
      100,
    );
    state = stepConfiguration(state, definition, 10).state;
    let hull = computeMassProperties(state, definition).hull;
    expect(part(hull, 'solar-left').y[0]).toBeCloseTo(1.5 + 0.5 / 3, 12);
    expect(part(hull, 'solar-left').y[1]).toBeCloseTo(2.5 + 9.5 / 3, 12);
    expect(part(hull, 'solar-right').y[0]).toBeCloseTo(-2.5 - 9.5 / 3, 12);
    expect(part(hull, 'solar-left').z).toEqual([-0.05, 0.05]);
    expect(part(hull, 'radiator-left')).toEqual(part(hullOf('radiators'), 'radiator-left'));
    expect(hull[0]).toEqual(hullOf('stowed')[0]);
    // The right wing loses power: it stays where it is while the left one finishes.
    state = powered({ ...state, t: 10 }, ['solar-right'], 'deploying', 0);
    state = stepConfiguration(state, definition, 20).state;
    hull = computeMassProperties(state, definition).hull;
    expect(part(hull, 'solar-left')).toEqual(part(hullOf('allDeployed'), 'solar-left'));
    expect(part(hull, 'solar-right').y[0]).toBeCloseTo(-2.5 - 9.5 / 3, 12);
    expect(state.transition).toBeDefined();
    // Geometry and mass properties carry one and the same hull.
    expect(getGeometry(state, definition).hull).toBe(hull);
  });
});
