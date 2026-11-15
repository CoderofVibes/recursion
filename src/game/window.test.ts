/**
 * The window: what the unaided eye sees outside (A3, A8). Directions and apparent sizes only.
 */

import { describe, expect, it } from 'vitest';
import type { Asteroid, MassiveBody, Sun, TruthWorld } from '../contracts/truth/index.ts';
import { createGravityRange, LAW, SUN as RANGE_SUN } from '../content/gravity-range/index.ts';
import { v3 } from '../lib/index.ts';
import { createBlackBox } from './belief/blackbox.ts';
import { createStandInModel } from './belief/standin-model.ts';
import { DEFAULT_PLAY } from './encounter.ts';
import { createGameSession } from './session.ts';
import { buildWindowView } from './window.ts';

const body = (id: string, x: number, y: number, z: number, radius: number): MassiveBody => ({
  id,
  name: id,
  gm: 1e9,
  radius,
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
  fixed: true,
});
const rock = (id: string, x: number, y: number, z: number, radius: number): Asteroid => ({
  id,
  radius,
  position: { x, y, z },
  velocity: { x: 0, y: 0, z: 0 },
});
/** The sun is toward −x, so shadows fall toward +x. */
const SUN: Sun = { direction: { x: -1, y: 0, z: 0 }, irradiance: 600 };
const MIN = DEFAULT_PLAY.windowMinAngularRadius;

/** A world with the ship at `ship`, built on the real encounter's ship systems. */
function world(over: Partial<TruthWorld>, ship = { x: 0, y: 0, z: 0 }): TruthWorld {
  const base = createGravityRange().definition.world;
  return {
    ...base,
    bodies: [],
    asteroids: [],
    sun: SUN,
    ...over,
    ship: { ...base.ship, kinematics: { ...base.ship.kinematics, position: ship } },
  };
}

describe('the window view', () => {
  it('gives a direction and an apparent size for a body and a rock, and nothing else', () => {
    const view = buildWindowView(
      world({ bodies: [body('p', 0, 3000, 4000, 500)], asteroids: [rock('r', 0, -2000, 0, 10)] }),
      MIN,
    );
    expect(view.sun).toEqual({ direction: SUN.direction, visible: true });
    expect(view.sunlit).toBe(true);
    expect(view.objects).toHaveLength(2);
    const [p, r] = view.objects;
    expect(p).toEqual({
      id: 'p',
      kind: 'body',
      direction: { x: 0, y: 0.6, z: 0.8 },
      angularRadius: Math.asin(500 / 5000),
      lit: true,
    });
    expect(r).toEqual({
      id: 'r',
      kind: 'asteroid',
      direction: { x: 0, y: -1, z: 0 },
      angularRadius: Math.asin(10 / 2000),
      lit: true,
    });
    // No range, no velocity, no size in metres: only what an eye takes in.
    for (const object of view.objects)
      expect(Object.keys(object).sort()).toEqual([
        'angularRadius',
        'direction',
        'id',
        'kind',
        'lit',
      ]);
    expect(Object.keys(view).sort()).toEqual(['objects', 'sun', 'sunlit']);
  });

  it('leaves out a rock too small to make out, and one in a body shadow', () => {
    const view = buildWindowView(
      world(
        {
          bodies: [body('p', 0, 0, 0, 100)],
          asteroids: [
            // 1 m at 20 km is 5e-5 rad: below what the eye resolves.
            rock('speck', 0, 21_000, 0, 1),
            // 5 m at 20 km is 2.5e-4 rad: just visible.
            rock('pebble', 0, 21_000, 3000, 5),
            // Big enough, but inside the body's shadow cylinder.
            rock('dark', 400, 0, 50, 20),
            // Above the cylinder: in sunlight.
            rock('lit', 400, 0, 150, 20),
          ],
        },
        { x: 0, y: 1000, z: 0 },
      ),
      MIN,
    );
    expect(view.objects.map((o) => o.id)).toEqual(['p', 'pebble', 'lit']);
  });

  it('shows a body that is in shadow as dark, and hides one behind another', () => {
    // `moon` sits in the planet's shadow; `far` is exactly behind the planet from the ship.
    const view = buildWindowView(
      world(
        {
          bodies: [
            body('planet', 0, 0, 0, 100),
            body('moon', 400, 0, 0, 30),
            body('far', 0, -2000, 0, 50),
          ],
          asteroids: [rock('behind', 0, -900, 0, 40), rock('beside', 300, -900, 300, 40)],
        },
        { x: 0, y: 1000, z: 0 },
      ),
      MIN,
    );
    expect(view.objects.map((o) => [o.id, o.lit])).toEqual([
      ['planet', true],
      ['moon', false],
      ['beside', true],
    ]);
  });

  it('says when the ship is in shadow: the sun is behind a body and out of view', () => {
    const inside = buildWindowView(
      world({ bodies: [body('p', 0, 0, 0, 100)] }, { x: 500, y: 0, z: 60 }),
      MIN,
    );
    expect(inside.sunlit).toBe(false);
    expect(inside.sun).toEqual({ direction: SUN.direction, visible: false });
    // The body is still there to see, as a lit limb or a dark disc against the stars.
    expect(inside.objects.map((o) => o.id)).toEqual(['p']);
    const above = buildWindowView(
      world({ bodies: [body('p', 0, 0, 0, 100)] }, { x: 500, y: 0, z: 160 }),
      MIN,
    );
    expect(above.sunlit).toBe(true);
    expect(above.sun!.visible).toBe(true);
  });

  it('without a sun shows the bodies dark and no rocks', () => {
    const { sun: _sun, ...sunless } = world({
      bodies: [body('p', 0, 3000, 0, 500)],
      asteroids: [rock('r', 0, -2000, 0, 100)],
    });
    const view = buildWindowView(sunless, MIN);
    expect(view.sun).toBeUndefined();
    expect(view.sunlit).toBe(false);
    expect(view.objects).toEqual([
      {
        id: 'p',
        kind: 'body',
        direction: { x: 0, y: 1, z: 0 },
        angularRadius: Math.asin(500 / 3000),
        lit: false,
      },
    ]);
  });
});

describe('the window in the snapshot', () => {
  const setup = createGravityRange();
  const session = createGameSession(setup, {
    model: createStandInModel({ referenceRadius: LAW.referenceRadius }),
    blackBox: createBlackBox(),
    now: () => 'now',
  });

  it('is filled from the true world each time, in the frame the believed side uses', () => {
    session.stepTicks(600);
    const view = session.snapshot();
    const seen = view.window!;
    expect(seen.sun).toEqual({ direction: RANGE_SUN.direction, visible: true });
    expect(seen.sunlit).toBe(true);
    // Alpha fills the view ahead; Beta is hidden behind it from the arrival orbit.
    const alpha = seen.objects.find((o) => o.id === 'alpha')!;
    expect(alpha).toMatchObject({ kind: 'body', lit: true });
    expect(alpha.angularRadius).toBeCloseTo(Math.asin(250 / 1000), 2);
    expect(seen.objects.some((o) => o.id === 'beta')).toBe(false);
    // The eye and the navigator agree on where Alpha is to within the navigator's error: the
    // two frames differ only by a uniform motion, so a direction is the same in both.
    const believed = view.world;
    const toAlpha = v3.normalize(v3.sub(believed.bodies[0]!.position, believed.ship.position));
    expect(v3.angleBetween(alpha.direction, toAlpha)).toBeLessThan(0.01);
    for (const object of seen.objects) expect(v3.length(object.direction)).toBeCloseTo(1, 12);
  });

  it('shows rocks the ship has not catalogued, and only those big enough to see', () => {
    const seen = session.snapshot().window!;
    const world = session.truth().sim.world;
    const catalogued = new Set(setup.definition.briefing.knownAsteroids.map((a) => a.id));
    const rocks = seen.objects.filter((o) => o.kind === 'asteroid');
    expect(rocks.length).toBeGreaterThan(10);
    for (const object of rocks)
      expect(object.angularRadius).toBeGreaterThanOrEqual(DEFAULT_PLAY.windowMinAngularRadius);
    // Alpha's smallest rocks are not on the arrival survey; the eye can still pick one out.
    const unsurveyed = world.asteroids.filter((a) => !catalogued.has(a.id));
    expect(unsurveyed.length).toBeGreaterThan(0);
    expect(rocks.some((o) => !catalogued.has(o.id))).toBe(true);
    // Every listed rock is one that truly is in sunlight out there.
    for (const object of rocks) expect(world.asteroids.some((a) => a.id === object.id)).toBe(true);
  });
});
