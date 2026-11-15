/**
 * The flight hologram on the contract fixtures: it draws every fixture without a renderer, keeps
 * to what the ship believes (P11), and reports the closest approaches and the miss from the
 * issued forecast that the instruments show.
 */
import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  shipDefinition,
  viewSnapshot,
  viewSnapshotCompare,
} from '../../contracts/fixtures/index.ts';
import type { ViewSnapshot } from '../../contracts/index.ts';
import { Quaternion, Vector3 } from 'three';
import { holoLines } from '../../theme/index.ts';
import { registerFieldView } from '../fieldViews.ts';
import { LineSet } from '../gfx.ts';
import {
  levelHeading,
  makeFlightHolo,
  openingRange,
  pastAndAhead,
  RANGE_DEFAULT,
  RANGE_MAX,
  RANGE_MIN,
  rangeMinFor,
  withEarlierAttempts,
} from './FlightHolo.ts';

/** Just enough of an element for a hologram tag. */
class FakeElement {
  className = '';
  textContent = '';
  readonly style: Record<string, string> = {};
  readonly parentNode = null;
  readonly ownerDocument = { defaultView: { Element: FakeElement } };
  setAttribute(): void {}
}

const make = () => {
  vi.stubGlobal('document', { createElement: () => new FakeElement() });
  return makeFlightHolo(shipDefinition);
};
const frame = (snapshot: ViewSnapshot, extra: { selected?: string } = {}) => ({
  snapshot,
  clearance: 50_000,
  ...extra,
});

describe('flight hologram', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('starts a new attempt on the arrival’s heading instead of turning round from the last', () => {
    // The ship as the last attempt left it: late in the flight and turned 2.5 rad about its up.
    const ship = viewSnapshot.world.ship;
    const half = 2.5 / 2;
    const turned = { x: 0, y: 0, z: Math.sin(half), w: Math.cos(half) };
    const lost: ViewSnapshot = {
      ...viewSnapshot,
      t: viewSnapshot.t + 20_000,
      world: { ...viewSnapshot.world, ship: { ...ship, attitude: turned as typeof ship.attitude } },
    };
    const arrival: ViewSnapshot = { ...viewSnapshot, t: 0 };
    /** The display's orientation: the group that turns the environment into the display frame. */
    const display = (holo: ReturnType<typeof make>) => holo.group.children[0]!.quaternion;

    const fresh = make();
    fresh.update(frame(arrival), 0.016, 0);
    const recurred = make();
    recurred.update(frame(lost), 0.016, 0);
    expect(display(recurred).angleTo(display(fresh))).toBeGreaterThan(1);
    // The clock ran backwards: a new attempt. One frame later the display is the arrival's.
    recurred.update(frame(arrival), 0.016, 0.016);
    expect(display(recurred).angleTo(display(fresh))).toBeLessThan(1e-9);

    // Within an attempt it still turns no faster than the theme allows, however fast the ship.
    const tumbling = make();
    tumbling.update(frame(arrival), 0.016, 0);
    tumbling.update(frame({ ...lost, t: 1 }), 0.016, 0.016);
    expect(display(tumbling).angleTo(display(fresh))).toBeLessThan(0.05);
  });

  it('keeps the reference disc level: the display turns with the heading only (A26)', () => {
    const ship = viewSnapshot.world.ship;
    // Yawed 40° left, nose 13° below the plane, rolled 25°: body → inertial, in the game's axes.
    const q = (axis: Vector3, degrees: number): Quaternion =>
      new Quaternion().setFromAxisAngle(axis, (degrees * Math.PI) / 180);
    const attitude = (yaw: number, pitch: number, roll: number) => {
      const a = q(new Vector3(0, 0, 1), yaw)
        .multiply(q(new Vector3(0, 1, 0), pitch))
        .multiply(q(new Vector3(1, 0, 0), roll));
      return { x: a.x, y: a.y, z: a.z, w: a.w } as typeof ship.attitude;
    };
    const at = (yaw: number, pitch: number, roll: number): ViewSnapshot => ({
      ...viewSnapshot,
      t: 0,
      world: { ...viewSnapshot.world, ship: { ...ship, attitude: attitude(yaw, pitch, roll) } },
    });
    const display = (holo: ReturnType<typeof make>) => holo.group.children[0]!.quaternion;

    const straight = make();
    straight.update(frame(at(0, 0, 0)), 0.016, 0);
    const level = make();
    level.update(frame(at(40, 0, 0)), 0.016, 0);
    const tilted = make();
    tilted.update(frame(at(40, 13, 25)), 0.016, 0);

    // The disc's normal stays the display's up, however the ship is pitched and rolled.
    const up = new Vector3(0, 1, 0).applyQuaternion(display(tilted));
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(1, 9);
    expect(up.z).toBeCloseTo(0, 9);
    // And the display has turned exactly as far as for the same heading flown level.
    expect(display(tilted).angleTo(display(level))).toBeLessThan(1e-9);
    // The heading is still followed: 40° of yaw turns the display 40° about its up.
    expect(display(level).angleTo(display(straight))).toBeCloseTo((40 * Math.PI) / 180, 9);
  });

  it('reads a heading from the nose’s bearing, and keeps the last one when the nose is vertical', () => {
    const about = (axis: Vector3, radians: number): Quaternion =>
      new Quaternion().setFromAxisAngle(axis, radians);
    // In the scene the drawing's nose is -z and up is +y.
    expect(levelHeading(new Quaternion())).toBeCloseTo(0, 12);
    expect(levelHeading(about(new Vector3(0, 1, 0), 0.7))).toBeCloseTo(0.7, 12);
    // Pitch and roll do not change it.
    const pitched = about(new Vector3(0, 1, 0), 0.7).multiply(about(new Vector3(1, 0, 0), 0.4));
    expect(levelHeading(pitched)).toBeCloseTo(0.7, 12);
    const rolled = pitched.clone().multiply(about(new Vector3(0, 0, 1), -0.9));
    expect(levelHeading(rolled)).toBeCloseTo(0.7, 12);
    // Nose straight up: no bearing, so the heading it had stands.
    expect(levelHeading(about(new Vector3(1, 0, 0), Math.PI / 2), 1.2)).toBe(1.2);
  });

  it('steps through a forecast in the region view, centred on where it puts the ship', () => {
    const issued = viewSnapshot.forecasts.at(-1)!;
    const sample = issued.samples[Math.floor(issued.samples.length / 2)]!;
    const rehearsal = (follow: boolean) => ({ forecast: issued, t: sample.t, follow });
    /** The group that scales game metres to the hologram and centres them. */
    const centred = (holo: ReturnType<typeof make>) => {
      const trans = holo.group.children[0]!.children[0]!;
      // Undo the scale and the sign: the game point the view is centred on, in scene axes.
      return trans.position.clone().divideScalar(-trans.scale.x);
    };
    const ship = viewSnapshot.world.ship.position;
    const inScene = (p: { x: number; y: number; z?: number }) => new Vector3(p.x, p.z ?? 0, -p.y);

    const region = make();
    region.setChart(true);
    region.update({ ...frame(viewSnapshot), rehearsal: rehearsal(true) }, 0.016, 0);
    expect(centred(region).distanceTo(inScene(sample.position))).toBeLessThan(1e-3);

    // Not following: the forecast is walked, but the view stays on the ship as it is now.
    const staying = make();
    staying.setChart(true);
    staying.update({ ...frame(viewSnapshot), rehearsal: rehearsal(false) }, 0.016, 0);
    expect(centred(staying).distanceTo(inScene(ship))).toBeLessThan(1e-3);

    // Outside the region view a rehearsal is ignored: FLIGHT is always centred on the ship.
    const flying = make();
    flying.update({ ...frame(viewSnapshot), rehearsal: rehearsal(true) }, 0.016, 0);
    expect(centred(flying).distanceTo(inScene(ship))).toBeLessThan(1e-3);
    for (const holo of [region, staying, flying]) holo.dispose();
  });

  it('never lets a draft being stepped through change the alerts (they are the issued forecast’s)', () => {
    const issued = viewSnapshot.forecasts.at(-1)!;
    const plain = make();
    plain.setChart(true);
    plain.update(frame(viewSnapshot), 0.016, 0);
    const before = plain.alerts();

    // A draft that would graze the first body: a pass well inside any clearance.
    const body = viewSnapshot.world.bodies[0]!;
    const mid = issued.samples[Math.floor(issued.samples.length / 2)]!.t;
    const draft = {
      ...issued,
      id: 'draft-graze',
      closestApproaches: [{ id: body.id, t: mid, distance: 10, sigma: 1 }],
    } as unknown as typeof issued;
    const stepping = make();
    stepping.setChart(true);
    stepping.update(
      { ...frame(viewSnapshot), rehearsal: { forecast: draft, t: mid, follow: true } },
      0.016,
      0,
    );
    expect(stepping.alerts()).toEqual(before);
    // Gliding between steps redraws only the path's split: it must not throw or change them.
    stepping.update(
      { ...frame(viewSnapshot), rehearsal: { forecast: draft, t: mid + 5, follow: true } },
      0.016,
      0.016,
    );
    expect(stepping.alerts()).toEqual(before);
    plain.dispose();
    stepping.dispose();
  });

  it('draws the fixture snapshot and the two-attempt overlay', () => {
    const holo = make();
    holo.setRange(400_000);
    expect(() => {
      holo.update(frame(viewSnapshot), 0.016, 0);
      holo.update(frame(viewSnapshotCompare), 0.016, 0.016);
      holo.setChart(true);
      holo.update(frame(viewSnapshot), 0.3, 0.4);
      holo.setHeadingUp(false);
      holo.update(frame(viewSnapshot), 0.3, 0.7);
    }).not.toThrow();
    holo.dispose();
  });

  it('keeps its range inside what it can draw', () => {
    const holo = make();
    holo.setRange(1);
    expect(holo.range()).toBe(RANGE_MIN);
    holo.setRange(1e12);
    expect(holo.range()).toBe(RANGE_MAX);
    holo.dispose();
  });

  it('reports closest approaches from the issued forecast, soonest first, and only those ahead', () => {
    const holo = make();
    holo.setRange(400_000);
    holo.update(frame(viewSnapshot), 0.016, 0);
    const alerts = holo.alerts();
    const forecast = viewSnapshot.forecasts.at(-1);
    for (const a of alerts) expect(a.t).toBeGreaterThan(viewSnapshot.t);
    for (let i = 1; i < alerts.length; i++)
      expect(alerts[i]!.t).toBeGreaterThanOrEqual(alerts[i - 1]!.t);
    // Every alert comes from the forecast as issued, never from anywhere else.
    for (const a of alerts)
      expect(forecast?.closestApproaches.some((c) => c.id === a.id && c.t === a.t)).toBe(true);
    holo.dispose();
  });

  it('raises a predicted pass inside the planned clearance', () => {
    const holo = make();
    holo.setRange(400_000);
    const forecast = viewSnapshot.forecasts.at(-1);
    const ahead = forecast?.closestApproaches.find((c) => c.t > viewSnapshot.t);
    if (!ahead) {
      holo.dispose();
      return;
    }
    // A clearance far larger than the predicted pass: it must be flagged.
    holo.update({ snapshot: viewSnapshot, clearance: ahead.distance * 10 + 1e6 }, 0.016, 0);
    const alert = holo.alerts().find((a) => a.id === ahead.id);
    if (alert) expect(alert.level).not.toBe('advisory');
    holo.dispose();
  });

  it('measures how far the ship is from where the forecast put it now', () => {
    const holo = make();
    holo.update(frame(viewSnapshot), 0.016, 0);
    const forecast = viewSnapshot.forecasts.at(-1);
    const covers =
      forecast !== undefined &&
      forecast.samples[0]!.t <= viewSnapshot.t &&
      forecast.samples.at(-1)!.t >= viewSnapshot.t;
    const miss = holo.miss();
    if (covers) {
      expect(miss).not.toBeNull();
      expect(miss!.metres).toBeGreaterThanOrEqual(0);
    } else expect(miss).toBeNull();
    holo.dispose();
  });

  it('hands a detected field to its plugin and never an undetected one', () => {
    const seen: string[] = [];
    let disposed = 0;
    registerFieldView('test-lattice', () => ({
      update: ({ field }) => void seen.push(field.id),
      dispose: () => void disposed++,
    }));
    const withFields = (detected: boolean): ViewSnapshot => ({
      ...viewSnapshot,
      world: {
        ...viewSnapshot.world,
        fields: [{ id: 'fence-1', kind: 'test-lattice', detected }],
      },
    });
    const holo = make();
    holo.update(frame(withFields(false)), 0.016, 0);
    expect(seen).toEqual([]);
    holo.update(frame(withFields(true)), 0.016, 0.016);
    expect(seen).toEqual(['fence-1']);
    // Coverage lost: the reconstruction goes away with it.
    holo.update(frame(withFields(false)), 0.016, 0.032);
    expect(disposed).toBe(1);
    holo.dispose();
  });

  it('finds the object under the cursor among what is drawn', () => {
    const holo = make();
    holo.setRange(400_000);
    holo.setHeadingUp(false);
    holo.update(frame(viewSnapshot), 0.016, 0);
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 100);
    camera.position.set(0, 2, 3);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const hit = holo.pick(0, 0, camera, 720);
    const known = new Set([
      ...viewSnapshot.world.bodies.map((b) => b.id),
      ...viewSnapshot.world.asteroids.map((a) => a.id),
    ]);
    if (hit !== null) expect(known.has(hit)).toBe(true);
    // Far off in a corner there is nothing to find.
    expect(holo.pick(5, 5, camera, 720)).toBeNull();
    holo.dispose();
  });
});

describe('a forecast flown partly before it arrived (A18)', () => {
  const samples = [0, 100, 200, 300].map((t) => ({ t, position: { x: t, y: 0, z: t / 10 } }));

  it('draws what is already flown as past, meeting the rest at the forecast for now', () => {
    const { past, ahead } = pastAndAhead(samples, 150);
    expect(past.map((p) => p.x)).toEqual([0, 100, 150]);
    expect(ahead.map((p) => p.x)).toEqual([150, 200, 300]);
    expect(past.at(-1)).toEqual(ahead[0]);
    expect(ahead[0]?.z).toBeCloseTo(15, 9);
  });

  it('is all ahead before it starts, and all past after it ends', () => {
    expect(pastAndAhead(samples, -5).past).toEqual([]);
    expect(pastAndAhead(samples, 999).ahead).toEqual([]);
  });
});

describe('coverage from earlier attempts (2G coverageEarlier)', () => {
  const look = (t: number, x: number) => ({
    attemptId: 'a1',
    sensor: 'camera',
    from: t - 30,
    to: t + 30,
    origin: { x, y: 0, z: 0 },
    axis: { x: 0, y: 1, z: 0 },
    halfAngle: 0.5,
    range: 6e6,
  });
  const at = (t: number, looks: ReturnType<typeof look>[]) => ({
    t,
    world: {
      ...viewSnapshot.world,
      ship: { ...viewSnapshot.world.ship, position: { x: 0, y: 0, z: 0 } },
    },
    coverageEarlier: looks,
  });

  it('counts a look taken near this moment of the encounter, fading with encounter time', () => {
    const near = withEarlierAttempts([], at(1000, [look(1000, 0)]), 1.5e6);
    expect(near).toHaveLength(1);
    expect(near[0]?.fresh).toBeCloseTo(1, 9);
    expect(near[0]?.center).toBeCloseTo(Math.PI / 2, 9);
    const later = withEarlierAttempts([], at(1000 + 3600, [look(1000, 0)]), 1.5e6);
    expect(later[0]?.fresh).toBeGreaterThan(0);
    expect(later[0]?.fresh).toBeLessThan(near[0]!.fresh);
    expect(withEarlierAttempts([], at(1000 + 1e6, [look(1000, 0)]), 1.5e6)).toEqual([]);
  });

  it('drops looks that cannot reach the view, and keeps the freshest the plane can draw', () => {
    expect(withEarlierAttempts([], at(1000, [look(1000, 1e9)]), 1.5e6)).toEqual([]);
    const many = Array.from({ length: 60 }, (_, i) => look(1000 + i * 60, 0));
    const kept = withEarlierAttempts([], at(1000, many), 1.5e6);
    expect(kept.length).toBeLessThanOrEqual(24);
    for (let i = 1; i < kept.length; i++)
      expect(kept[i - 1]!.fresh).toBeGreaterThanOrEqual(kept[i]!.fresh);
  });
});

describe('the range FLIGHT opens at', () => {
  it('puts the nearest briefed body two thirds of the way out, at each encounter’s scale', () => {
    // The Gravity range: Alpha 1,000 km away (with the arrival's survey error) is the standard.
    expect(openingRange(1_000_700)).toBe(RANGE_DEFAULT);
    // The Well Garden: the entrance throat 108.8 km away.
    expect(openingRange(108_800)).toBe(160_000);
    // The Unseen Cathedral: the survey rock 1,452 m away, under the encounter's 120 m floor never.
    expect(openingRange(1452, rangeMinFor('chain-link'))).toBe(2200);
    expect(openingRange(10, rangeMinFor('chain-link'))).toBe(120);
    expect(openingRange(1452)).toBe(RANGE_MIN);
    // Never wider than the standard, and the standard when nothing is briefed.
    expect(openingRange(9_000_000)).toBe(RANGE_DEFAULT);
    expect(openingRange(undefined)).toBe(RANGE_DEFAULT);
    expect(openingRange(Infinity)).toBe(RANGE_DEFAULT);
  });
});

describe('close range where an encounter is studied close (3C, R4)', () => {
  it('lets FLIGHT zoom to 120 m in the Chain Link, in true metres, and keeps 5 km elsewhere', () => {
    expect(rangeMinFor('chain-link')).toBe(120);
    expect(rangeMinFor('gravity-range')).toBe(RANGE_MIN);
    const holo = make();
    holo.setRangeMin(rangeMinFor('chain-link'));
    holo.setRange(1);
    expect(holo.range()).toBe(120);
    holo.setRangeMin(RANGE_MIN);
    expect(holo.range()).toBe(RANGE_MIN);
    holo.dispose();
  });
});

describe('exact clipping for field plugins (3B)', () => {
  it("gives a segment's part inside the volume, crossing, one end in, or none", () => {
    let clip: ((a: Vector3, b: Vector3) => readonly [number, number] | undefined) | undefined;
    let revision: number | undefined;
    registerFieldView('test-clip', () => ({
      update: (f) => {
        clip = f.clipSegment;
        revision = f.clipRevision;
      },
      dispose: () => undefined,
    }));
    const snapshot: ViewSnapshot = {
      ...viewSnapshot,
      world: { ...viewSnapshot.world, fields: [{ id: 'f', kind: 'test-clip', detected: true }] },
    };
    const holo = make();
    holo.setHeadingUp(false);
    holo.setRange(400_000);
    holo.update(frame(snapshot), 0.016, 0);
    expect(clip).toBeDefined();
    expect(revision).toBeTypeOf('number');
    const ship = viewSnapshot.world.ship.position;
    const c = new Vector3(ship.x, ship.z ?? 0, -ship.y);
    // Through the middle, both ends far outside: a stretch in the middle.
    const through = clip!(
      c.clone().add(new Vector3(-4e6, 0, 0)),
      c.clone().add(new Vector3(4e6, 0, 0)),
    );
    expect(through).toBeDefined();
    expect(through![0]).toBeGreaterThan(0.3);
    expect(through![1]).toBeLessThan(0.7);
    // One end at the centre: from the start to where it leaves.
    const half = clip!(c, c.clone().add(new Vector3(4e6, 0, 0)));
    expect(half![0]).toBe(0);
    expect(half![1]).toBeGreaterThan(0);
    expect(half![1]).toBeLessThan(1);
    // Wholly outside: nothing.
    expect(
      clip!(c.clone().add(new Vector3(5e6, 0, 0)), c.clone().add(new Vector3(6e6, 0, 0))),
    ).toBeUndefined();
    holo.dispose();
  });
});

describe('line materials released with their plugin (3B)', () => {
  it('forgets a material when it is disposed or released', () => {
    const lines = new LineSet();
    const a = lines.fat([0, 0, 0, 1, 0, 0], holoLines.rim);
    const b = lines.fat([0, 0, 0, 1, 0, 0], holoLines.rim);
    expect(lines.size).toBe(2);
    (a.material as { dispose(): void }).dispose();
    expect(lines.size).toBe(1);
    lines.release(b.material as Parameters<LineSet['release']>[0]);
    expect(lines.size).toBe(0);
    lines.dispose();
  });
});
