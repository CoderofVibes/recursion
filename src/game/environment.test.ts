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
  position: { x, y },
  velocity: { x: 0, y: 0 },
  fixed: true,
});

/** The sun is toward −x, so shadows fall toward +x. */
const SUN: Sun = { direction: { x: -1, y: 0 }, irradiance: 600 };

/** A world with the ship at the origin, built on the real encounter's ship systems. */
function world(over: Partial<TruthWorld>, ship = { x: 0, y: 0 }): TruthWorld {
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
    expect(inShadow({ x: 500, y: 0 }, [planet], SUN)).toBe(true);
    expect(inShadow({ x: 5e6, y: 99 }, [planet], SUN)).toBe(true);
    expect(inShadow({ x: 500, y: 101 }, [planet], SUN)).toBe(false);
    expect(inShadow({ x: -500, y: 0 }, [planet], SUN)).toBe(false);
  });

  it('can leave one body out', () => {
    expect(inShadow({ x: 500, y: 0 }, [planet], SUN, 'p')).toBe(false);
  });

  it('gives full irradiance in the open, none in shadow, none without a sun', () => {
    const lit = world({ bodies: [planet] }, { x: -500, y: 0 });
    const dark = world({ bodies: [planet] }, { x: 500, y: 0 });
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
          { id: 'dark', position: { x: 400, y: 50 }, velocity: { x: 0, y: 0 }, radius: 1 },
          { id: 'lit', position: { x: 400, y: 300 }, velocity: { x: 0, y: 0 }, radius: 1 },
        ],
      },
      { x: 400, y: 1000 },
    );
    expect(visible(w)).toMatchObject({ dark: false, lit: true });
  });

  it('does not see through a body', () => {
    const w = world(
      {
        bodies: [body('near', 0, 500, 100)],
        asteroids: [
          { id: 'far', position: { x: 0, y: 1500 }, velocity: { x: 0, y: 0 }, radius: 1 },
        ],
      },
      { x: 0, y: 0 },
    );
    expect(visible(w)).toEqual({ near: true, far: false });
  });

  it('sees only the night side from inside a body shadow', () => {
    // 34° off the sun line, so glare does not apply; the ship sits in the body's shadow band.
    const w = world({ bodies: [body('p', -300, 0, 250)] }, { x: 0, y: 200 });
    expect(inShadow(w.ship.kinematics.position, w.bodies, SUN)).toBe(true);
    expect(visible(w)).toEqual({ p: false });
  });

  it('sees nothing without a sun', () => {
    const { sun: _sun, ...sunless } = world({ bodies: [body('p', 1000, 0, 100)] });
    expect(visible(sunless)).toEqual({ p: false });
  });
});

describe('buildEnvironment', () => {
  it('describes the tick start: time, kinematics, last specific force, scene and sunlight', () => {
    const setup = createGravityRange();
    const sim = createSimulation(setup.definition.world, { dt: setup.definition.dt });
    const state = { ...sim.initial, specificForce: { x: 0.5, y: -0.1 } };
    const env = buildEnvironment(state, {
      knownSizeTargets: ['alpha', 'beta'],
      sunExclusionAngle: 0.35,
    });
    expect(env.t).toBe(0);
    expect(env.kinematics).toBe(state.world.ship.kinematics);
    expect(env.specificForce).toEqual({ x: 0.5, y: -0.1 });
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
