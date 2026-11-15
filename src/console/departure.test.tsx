/**
 * 2F's screen data (handoff 2F, request 2 to 2D): the departure as the session reckons it, a
 * planned burn's direction for `turnReadiness`, and PLAN's turn cue.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DepartureProgress } from '../game/belief/departure.ts';
import { burnDirection, departMet, departure } from './data.ts';
import { TurnLine } from './pages/PlanPage.tsx';

const snapshot = {
  world: {
    bodies: [
      {
        id: 'alpha',
        name: 'Alpha',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
      },
    ],
    asteroids: [],
    ship: { position: { x: 1e7, y: 0, z: 0 }, velocity: { x: 40, y: 30, z: 0 } },
  },
  objectives: [{ id: 'leave', depart: { minSpeed: 50, beyond: 9e6 } }],
} as unknown as Parameters<typeof departure>[1];
const model = { parameters: [{ id: 'body.alpha.mu', value: 1e10 }] } as unknown as Parameters<
  typeof departure
>[2];

const reckoned: DepartureProgress = {
  objective: 'leave',
  status: 'pending',
  distance: 1e7,
  beyond: 9e6,
  speed: 55,
  outward: -3,
  minSpeed: 50,
  gaugedDeltaV: 12.5,
  maxDeltaV: 16,
  closest: { alpha: 2.1e6 },
};

describe('the departure on the screens', () => {
  it("prefers the session's reckoning, and says inward is not met", () => {
    const d = departure({ departure: [reckoned] }, snapshot, model)!;
    expect(d).toEqual(reckoned);
    expect(departMet(d)).toBe(false);
    expect(departMet({ ...d, outward: 3 })).toBe(true);
  });

  it("falls back to the console's own from the snapshot and the model", () => {
    const d = departure({ departure: [] }, snapshot, model)!;
    expect(d).toMatchObject({ speed: 50, distance: 1e7, minSpeed: 50, status: 'pending' });
    expect(departure({}, { ...snapshot, objectives: [] }, model)).toBeNull();
  });
});

describe("a planned burn's direction, as believed now", () => {
  const ship = snapshot.world.ship;
  it('follows the velocity, a body, or the held direction', () => {
    expect(burnDirection({ reference: 'prograde' }, ship, snapshot.world)).toEqual({
      x: 40,
      y: 30,
      z: 0,
    });
    expect(burnDirection({ reference: 'retrograde' }, ship, snapshot.world)).toEqual({
      x: -40,
      y: -30,
      z: -0,
    });
    expect(burnDirection({ reference: 'toward', target: 'alpha' }, ship, snapshot.world)).toEqual({
      x: -1e7,
      y: 0,
      z: 0,
    });
    const held = { x: 0, y: 1, z: 0 };
    expect(burnDirection({ reference: 'direction', direction: held }, ship, snapshot.world)).toBe(
      held,
    );
    expect(
      burnDirection({ reference: 'toward', target: 'nowhere' }, ship, snapshot.world),
    ).toBeUndefined();
  });
});

describe("PLAN's turn cue", () => {
  it('says when a burn leaves the turn too little time', () => {
    const half = { angle: Math.PI, needed: 423, lead: 300, ready: false };
    const late = renderToStaticMarkup(<TurnLine readiness={half} />);
    expect(late).toContain('180° turn needs 7.0 min');
    expect(late).toContain('not ready');
    expect(late).toContain('data-status="caution"');
    const ready = renderToStaticMarkup(
      <TurnLine readiness={{ ...half, lead: 600, ready: true }} />,
    );
    expect(ready).toContain('ready by the burn');
    expect(renderToStaticMarkup(<TurnLine readiness={undefined} />)).toBe('');
  });
});
