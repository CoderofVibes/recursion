/**
 * EnvironmentEffects from truth: sunlight and shadow bands (A3), and what the camera can see.
 */

import { describe, expect, it } from 'vitest';
import type { MassiveBody, Sun, TruthWorld } from '../contracts/truth/index.ts';
import { createGravityRange } from '../content/gravity-range/index.ts';
import { createSimulation, sensorTargets } from '../sim/index.ts';
import { buildEnvironment, inShadow, sunlightAt, targetVisibility } from './environment.ts';

const body = (id: string, x: number, y: number, radius: number): MassiveBody => ({
  id,
  name: id,
  gm: 1e9,
  radius,
  position: { x, y, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  fixed: true,
});

/** The sun is toward −x, so shadows fall toward +x. */
const SUN: Sun = { direction: { x: -1, y: 0, z: 0 }, irradiance: 600 };

/** A world with the ship at the origin, built on the real encounter's ship systems. */
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

describe('shadow bands (parallel rays, A3)', () => {
  const planet = body('p', 0, 0, 100);

  it('covers the band directly behind a body and nothing else', () => {
    expect(inShadow({ x: 500, y: 0, z: 0 }, [planet], SUN)).toBe(true);
    expect(inShadow({ x: 5e6, y: 99, z: 0 }, [planet], SUN)).toBe(true);
    expect(inShadow({ x: 500, y: 101, z: 0 }, [planet], SUN)).toBe(false);
    expect(inShadow({ x: -500, y: 0, z: 0 }, [planet], SUN)).toBe(false);
  });

  it('can leave one body out', () => {
    expect(inShadow({ x: 500, y: 0, z: 0 }, [planet], SUN, 'p')).toBe(false);
  });

  it('gives full irradiance in the open, none in shadow, none without a sun', () => {
    const lit = world({ bodies: [planet] }, { x: -500, y: 0, z: 0 });
    const dark = world({ bodies: [planet] }, { x: 500, y: 0, z: 0 });
    expect(sunlightAt(lit, lit.ship.kinematics.position)).toEqual({
      direction: SUN.direction,
      irradiance: 600,
    });
    expect(sunlightAt(dark, dark.ship.kinematics.position).irradiance).toBe(0);
    const { sun: _sun, ...sunless } = lit;
    expect(sunlightAt(sunless, lit.ship.kinematics.position).irradiance).toBe(0);
  });
});

describe('what the camera can see', () => {
  const exclusion = (20 * Math.PI) / 180;
  const visible = (w: TruthWorld): Record<string, boolean> =>
    targetVisibility(w, sensorTargets(w), exclusion);

  it('sees a lit body with the sun behind the ship', () => {
    expect(visible(world({ bodies: [body('p', 1000, 0, 100)] }))).toEqual({ p: true });
  });

  it('loses a target close to the sun in glare', () => {
    // 10° from the sun's direction: inside the exclusion angle.
    const near = body('p', -1000 * Math.cos(0.17), 1000 * Math.sin(0.17), 10);
    const clear = body('q', -1000 * Math.cos(0.6), 1000 * Math.sin(0.6), 10);
    expect(visible(world({ bodies: [near, clear] }))).toEqual({ p: false, q: true });
  });

  it('does not see an asteroid inside a body shadow', () => {
    const w = world(
      {
        bodies: [body('p', 0, 0, 100)],
        asteroids: [
          {
            id: 'dark',
            position: { x: 400, y: 50, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            radius: 1,
          },
          {
            id: 'lit',
            position: { x: 400, y: 300, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            radius: 1,
          },
        ],
      },
      { x: 400, y: 1000, z: 0 },
    );
    expect(visible(w)).toMatchObject({ dark: false, lit: true });
  });

  it('does not see through a body', () => {
    const w = world(
      {
        bodies: [body('near', 0, 500, 100)],
        asteroids: [
          {
            id: 'far',
            position: { x: 0, y: 1500, z: 0 },
            velocity: { x: 0, y: 0, z: 0 },
            radius: 1,
          },
        ],
      },
      { x: 0, y: 0, z: 0 },
    );
    expect(visible(w)).toEqual({ near: true, far: false });
  });

  it('sees only the night side from inside a body shadow', () => {
    // 34° off the sun line, so glare does not apply; the ship sits in the body's shadow band.
    const w = world({ bodies: [body('p', -300, 0, 250)] }, { x: 0, y: 200, z: 0 });
    expect(inShadow(w.ship.kinematics.position, w.bodies, SUN)).toBe(true);
    expect(visible(w)).toEqual({ p: false });
  });

  it('sees nothing without a sun', () => {
    const { sun: _sun, ...sunless } = world({ bodies: [body('p', 1000, 0, 100)] });
    expect(visible(sunless)).toEqual({ p: false });
  });
});

describe('three dimensions (A11): shadow cylinders, the glare cone and spheres in the way', () => {
  const planet = body('p', 0, 0, 100);
  /** A sun 30° above the bodies' plane, on the −x side: shadows slope down toward +x. */
  const HIGH: Sun = {
    direction: { x: -Math.cos(Math.PI / 6), y: 0, z: Math.sin(Math.PI / 6) },
    irradiance: 600,
  };
  const exclusion = (20 * Math.PI) / 180;
  const visible = (w: TruthWorld): Record<string, boolean> =>
    targetVisibility(w, sensorTargets(w), exclusion);
  const rock = (id: string, x: number, y: number, z: number) => ({
    id,
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    radius: 1,
  });

  it('a shadow is a cylinder: it ends above and below the body as well as beside it', () => {
    // The sun in the plane: 99 m above the axis of the shadow is dark, 101 m is lit.
    expect(inShadow({ x: 500, y: 0, z: 99 }, [planet], SUN)).toBe(true);
    expect(inShadow({ x: 500, y: 0, z: 101 }, [planet], SUN)).toBe(false);
    expect(inShadow({ x: 500, y: 70, z: 70 }, [planet], SUN)).toBe(true);
    expect(inShadow({ x: 500, y: 72, z: 72 }, [planet], SUN)).toBe(false);
  });

  it('with the sun above the plane the shadow slopes below it, so sunlight depends on height', () => {
    // 2,000 m behind the body in the plane, the shadow's axis is 1,155 m below the plane.
    const behind = { x: 2000, y: 0, z: 0 };
    expect(inShadow(behind, [planet], HIGH)).toBe(false);
    expect(inShadow({ x: 2000, y: 0, z: -2000 * Math.tan(Math.PI / 6) }, [planet], HIGH)).toBe(
      true,
    );
    // The same place in the plane is dark when the sun is in the plane too.
    expect(inShadow(behind, [planet], SUN)).toBe(true);
    // And the ship's sunlight follows: lit in the plane, dark down in the cylinder.
    const up = world({ bodies: [planet], sun: HIGH }, behind);
    const down = world({ bodies: [planet], sun: HIGH }, { x: 2000, y: 0, z: -1155 });
    expect(sunlightAt(up, up.ship.kinematics.position).irradiance).toBe(600);
    expect(sunlightAt(down, down.ship.kinematics.position)).toEqual({
      direction: HIGH.direction,
      irradiance: 0,
    });
    // 120 m higher is 104 m across the rays from the cylinder's axis: back in the light.
    expect(inShadow({ x: 2000, y: 0, z: -1155 + 120 }, [planet], HIGH)).toBe(false);
  });

  it('glare is a cone about the direction to the sun, in every direction around it', () => {
    // The sun is toward −x. 10° off it upward, sideways and diagonally: all lost; 30° up: seen.
    const at = (angle: number, around: number) => ({
      x: -1000 * Math.cos(angle),
      y: 1000 * Math.sin(angle) * Math.cos(around),
      z: 1000 * Math.sin(angle) * Math.sin(around),
    });
    const place = (id: string, angle: number, around: number) => {
      const p = at(angle, around);
      return rock(id, p.x, p.y, p.z);
    };
    const w = world({
      asteroids: [
        place('up', 0.17, Math.PI / 2),
        place('side', 0.17, 0),
        place('diagonal', 0.17, 2.2),
        place('clear-up', 0.52, Math.PI / 2),
        place('clear-down', 0.52, -Math.PI / 2),
      ],
    });
    expect(visible(w)).toEqual({
      up: false,
      side: false,
      diagonal: false,
      'clear-up': true,
      'clear-down': true,
    });
    // With the sun 30° above the plane, the rock 30° up is the one in the glare.
    const lifted = world({
      sun: HIGH,
      asteroids: [place('clear-up', Math.PI / 6, Math.PI / 2), place('side', 0.17, 0)],
    });
    expect(visible(lifted)).toEqual({ 'clear-up': false, side: true });
  });

  it('a body hides what is behind its sphere, not what is above or below it', () => {
    // The body is 500 m ahead (+y) with radius 100; the line to each rock passes it at 500 m.
    const w = world({
      bodies: [body('near', 0, 500, 100)],
      asteroids: [
        rock('behind', 0, 1500, 0),
        // The line of sight clears the sphere by passing 120 m above its centre...
        rock('over', 0, 1500, 360),
        // ...and is cut when it passes 80 m above it.
        rock('grazing', 0, 1500, 240),
        rock('under', 0, 1500, -360),
      ],
    });
    expect(visible(w)).toEqual({
      near: true,
      behind: false,
      over: true,
      grazing: false,
      under: true,
    });
  });

  it('a rock above a body is lit when the shadow passes beneath it', () => {
    // Both rocks are 400 m behind the body; one is in the plane, one 150 m above it.
    const w = world(
      { bodies: [planet], asteroids: [rock('low', 400, 0, 0), rock('high', 400, 0, 150)] },
      { x: 400, y: 1000, z: 0 },
    );
    expect(visible(w)).toMatchObject({ low: false, high: true });
  });
});

describe('buildEnvironment', () => {
  it('describes the tick start: time, kinematics, last specific force, scene and sunlight', () => {
    const setup = createGravityRange();
    const sim = createSimulation(setup.definition.world, { dt: setup.definition.dt });
    const state = { ...sim.initial, specificForce: { x: 0.5, y: -0.1, z: 0 } };
    const env = buildEnvironment(state, {
      knownSizeTargets: ['alpha', 'beta'],
      sunExclusionAngle: 0.35,
    });
    expect(env.t).toBe(0);
    expect(env.kinematics).toBe(state.world.ship.kinematics);
    expect(env.specificForce).toEqual({ x: 0.5, y: -0.1, z: 0 });
    expect(env.targets).toHaveLength(2 + state.world.asteroids.length);
    expect(env.sunlight.irradiance).toBe(setup.definition.world.sun!.irradiance);
    const scene = env.fieldSignals['ship-environment'] as {
      starsVisible: boolean;
      visibility: Record<string, boolean>;
      knownSizeTargets: string[];
    };
    expect(scene.starsVisible).toBe(true);
    expect(scene.knownSizeTargets).toEqual(['alpha', 'beta']);
    // On arrival Alpha is lit and in view; Beta is exactly behind it.
    expect(scene.visibility.alpha).toBe(true);
    expect(scene.visibility.beta).toBe(false);
  });
});
