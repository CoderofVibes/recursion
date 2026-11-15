import { describe, expect, it } from 'vitest';
import type { Hull } from '../../contracts/ship.ts';
import { hullReach } from '../../contracts/ship.ts';
import * as quat from '../../lib/quat.ts';
import * as v3 from '../../lib/vec3.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { funnelCrushPoint, funnelSpec, type FunnelActivation } from '../../sim/fields/wells.ts';
import { createFunnelHullHazards, type OccupiedHull } from './hazards.ts';

const box = (x0: number, x1: number, y0 = -1, y1 = 1, zMin = -1, zMax = 1): Hull[number] => ({
  outline: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  zMin,
  zMax,
});
const hull: OccupiedHull = { centerOfMass: v3.ZERO, hull: [box(-10, 10)] };
const pose = (position: Vec3) => ({ position, attitude: quat.IDENTITY });
const throat = (
  id = 'throat',
  activation: FunnelActivation = { phase: 'initial' },
  center = v3.ZERO,
) => funnelSpec(id, v3.addScaled(center, v3.UNIT_X, -120_000), v3.UNIT_X, activation);

describe('S22 occupied-hull structural contact diagnostics', () => {
  it('detects appendage contact when the COM and central hull are clear', () => {
    const hazards = createFunnelHullHazards([throat()]);
    const ship = pose({ x: 1100, y: 0, z: 0 });
    expect(hazards.contactsAt(ship, hull, 10)).toEqual([]);
    const deployed: OccupiedHull = { ...hull, hull: [...hull.hull, box(-150, -90)] };
    expect(hazards.contactsAt(ship, deployed, 10)).toEqual([
      { field: 'throat', cause: 'structural', t: 10, clearance: -50 },
    ]);
    expect(v3.length(ship.position)).toBeGreaterThan(1000);
  });

  it('avoids an enclosing-sphere false positive through exact occupied prisms', () => {
    const field = throat();
    const hazards = createFunnelHullHazards([field]);
    const long: OccupiedHull = { centerOfMass: v3.ZERO, hull: [box(-200, 200)] };
    const ship = pose({ x: 0, y: 1100, z: 0 });
    expect(
      funnelCrushPoint(field, ship.position, 0, hullReach(long.hull, long.centerOfMass)).contact,
    ).toBe(true);
    expect(hazards.contactsAt(ship, long, 0)).toEqual([]);
  });

  it('uses the actual offset COM datum and attitude, including exact surface contact', () => {
    const hazards = createFunnelHullHazards([throat()]);
    const offset: OccupiedHull = {
      centerOfMass: { x: 300, y: -20, z: 10 },
      hull: [box(295, 305, -21, -19, 9, 11)],
    };
    const touching = { position: { x: 0, y: 1005, z: 0 }, attitude: quat.fromYaw(Math.PI / 2) };
    const contacts = hazards.contactsAt(touching, offset, 8);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.clearance).toBeCloseTo(0, 10);
    expect(
      hazards.contactsAt({ ...touching, position: { x: 0, y: 1005.01, z: 0 } }, offset, 8),
    ).toEqual([]);
  });

  it('finds first contact during a fixed translated outside-to-outside sweep', () => {
    const hazards = createFunnelHullHazards([throat()]);
    const start = pose({ x: -2000, y: 0, z: 0 });
    const end = { x: 2000, y: 0, z: 0 };
    expect(hazards.contactsAt(start, hull, 10)).toEqual([]);
    expect(hazards.contactsAt(pose(end), hull, 14)).toEqual([]);
    const contacts = hazards.linearFixedHullSweep(start, hull, end, 10, 14);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ field: 'throat', cause: 'structural', clearance: -1000 });
    expect(contacts[0]?.t).toBeCloseTo(10.99, 11);
  });

  it('remains covariant under 3D rotation and translation for a fixed hull sweep', () => {
    const q = quat.fromAxisAngle(v3.normalize({ x: 1, y: 2, z: -3 }), 0.8);
    const center = { x: 40_000, y: -80_000, z: 20_000 };
    const axis = quat.rotate(q, v3.UNIT_X);
    const field = funnelSpec('rotated', v3.addScaled(center, axis, -120_000), axis);
    const hazards = createFunnelHullHazards([field]);
    const start = { position: v3.addScaled(center, axis, -2000), attitude: q };
    const end = v3.addScaled(center, axis, 2000);
    const contacts = hazards.linearFixedHullSweep(start, hull, end, 10, 14);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.t).toBeCloseTo(10.99, 9);
  });

  it.each(['pending', 'cancelled'] as const)('has no collision at a %s site', (phase) => {
    const hazards = createFunnelHullHazards([throat('off', { phase })]);
    expect(hazards.contactsAt(pose(v3.ZERO), hull, 5000)).toEqual([]);
    expect(
      hazards.linearFixedHullSweep(
        pose({ x: -2000, y: 0, z: 0 }),
        hull,
        { x: 2000, y: 0, z: 0 },
        0,
        5000,
      ),
    ).toEqual([]);
  });

  it('clips a sweep to the active birth interval, with crush live before force ramp completes', () => {
    const start = pose({ x: -2000, y: 0, z: 0 });
    const end = { x: 2000, y: 0, z: 0 };
    const born = createFunnelHullHazards([throat('born', { phase: 'active', activeSince: 2 })]);
    expect(born.contactsAt(pose(v3.ZERO), hull, 1.999)).toEqual([]);
    expect(born.contactsAt(pose(v3.ZERO), hull, 2)[0]?.t).toBe(2);
    expect(born.linearFixedHullSweep(start, hull, end, 0, 4)[0]?.t).toBe(2);
    const late = createFunnelHullHazards([throat('late', { phase: 'active', activeSince: 3.1 })]);
    expect(late.linearFixedHullSweep(start, hull, end, 0, 4)).toEqual([]);
    const endpoint = createFunnelHullHazards([
      throat('endpoint', { phase: 'active', activeSince: 3.01 }),
    ]);
    expect(endpoint.linearFixedHullSweep(start, hull, { x: 1010, y: 0, z: 0 }, 0, 3.01)).toEqual([
      { field: 'endpoint', cause: 'structural', t: 3.01, clearance: 0 },
    ]);
  });

  it('orders simultaneous contacts by stable ID and keeps returned diagnostics JSON-only', () => {
    const fields = [throat('z'), throat('a')];
    const hazards = createFunnelHullHazards(fields);
    const contacts = hazards.contactsAt(pose({ x: 1000, y: 0, z: 0 }), hull, 8);
    expect(contacts.map((contact) => contact.field)).toEqual(['a', 'z']);
    expect(JSON.parse(JSON.stringify(contacts))).toEqual(contacts);
    expect(
      createFunnelHullHazards([...fields].reverse()).contactsAt(
        pose({ x: 1000, y: 0, z: 0 }),
        hull,
        8,
      ),
    ).toEqual(contacts);
    expect(hazards.size).toBe(2);
  });

  it('matches the simulation empty-hull point convention and handles zero-time queries', () => {
    const hazards = createFunnelHullHazards([throat()]);
    const empty: OccupiedHull = { centerOfMass: { x: 40, y: 20, z: 10 }, hull: [] };
    const at = pose({ x: 1000, y: 0, z: 0 });
    expect(hazards.contactsAt(at, empty, 1)).toEqual([
      { field: 'throat', cause: 'structural', t: 1, clearance: 0 },
    ]);
    const sweep = hazards.linearFixedHullSweep;
    expect(sweep(at, empty, at.position, 1, 1)).toEqual(hazards.contactsAt(at, empty, 1));
    expect(() => sweep(at, empty, v3.ZERO, 1, 1)).toThrow('cannot translate');
  });

  it('rejects malformed geometry/time inputs instead of returning a safe miss', () => {
    const hazards = createFunnelHullHazards([throat()]);
    expect(() =>
      hazards.contactsAt({ position: v3.ZERO, attitude: { w: 0, x: 0, y: 0, z: 0 } }, hull, 0),
    ).toThrow('unit attitude');
    expect(() =>
      hazards.contactsAt(pose(v3.ZERO), { ...hull, centerOfMass: { x: Infinity, y: 0, z: 0 } }, 0),
    ).toThrow('COM');
    expect(() =>
      hazards.contactsAt(pose(v3.ZERO), { ...hull, hull: [box(-1, 1, -1, 1, 2, -2)] }, 0),
    ).toThrow('ordered caps');
    expect(() => hazards.contactsAt(pose(v3.ZERO), hull, Infinity)).toThrow('time');
    expect(() => hazards.linearFixedHullSweep(pose(v3.ZERO), hull, v3.ZERO, 2, 1)).toThrow(
      'ordered times',
    );
    expect(() => createFunnelHullHazards([throat('duplicate'), throat('duplicate')])).toThrow(
      'distinct',
    );
  });
});
