/**
 * The ship as a planar rigid body: thrust at mounting points, torque from an offset centre of
 * mass, pure torque, rotating thrust direction, and the reported specific force.
 */

import { describe, expect, it } from 'vitest';
import * as quat from '../lib/quat.ts';
import { createSimulation } from './simulation.ts';
import { actuators, makeWorld, massProps, thrust } from './test-helpers.ts';

describe('ship rigid body', () => {
  it('constant body-frame thrust through the CoM: x = ½at², no rotation', () => {
    const mp = massProps();
    const sim = createSimulation(makeWorld({ mp }), { dt: 1 });
    const act = actuators([thrust({ x: -7, y: 0 }, { x: 2000, y: 0 })], mp);
    const r = sim.run(sim.initial, 100, { input: () => ({ actuators: act }) });
    const k = r.state.world.ship.kinematics;
    const a = 2000 / mp.mass;
    expect(k.position.x).toBeCloseTo(0.5 * a * 100 * 100, 9);
    expect(k.velocity.x).toBeCloseTo(a * 100, 12);
    expect(k.position.y).toBe(0);
    expect(quat.yawOf(k.attitude)).toBe(0);
    expect(k.angularVelocity.z).toBe(0);
    expect(r.state.specificForce).toEqual({ x: a, y: 0, z: 0 });
  });

  it('thrust off the centre of mass produces torque α = (p − c) × F / I', () => {
    // CoM sits 0.5 m to port of the engine line, so the engine pushes the tail to starboard.
    const mp = massProps({ centerOfMass: { x: 0, y: 0.5 } });
    const sim = createSimulation(makeWorld({ mp }), { dt: 0.5 });
    const act = actuators([thrust({ x: -7, y: 0 }, { x: 1000, y: 0 })], mp);
    const r = sim.step(sim.initial, { actuators: act });
    const torque = (-7 - 0) * 0 - (0 - 0.5) * 1000; // = +500 N·m, counter-clockwise
    expect(torque).toBe(500);
    const alpha = torque / mp.inertia.moments.z;
    expect(r.state.world.ship.kinematics.angularVelocity.z).toBeCloseTo(alpha * 0.5, 15);
    // Constant α is integrated exactly by kick–drift–kick: θ = ½αt².
    expect(quat.yawOf(r.state.world.ship.kinematics.attitude)).toBeCloseTo(0.5 * alpha * 0.25, 15);
  });

  it('pure torque spins the ship without moving it; balanced couples cancel', () => {
    const mp = massProps();
    const sim = createSimulation(makeWorld({ mp }), { dt: 1 });
    const wheel = actuators([], mp, 400);
    const couple = actuators(
      [
        thrust({ x: 5, y: 2 }, { x: 0, y: 100 }, 'rcs-a'),
        thrust({ x: 5, y: -2 }, { x: 0, y: -100 }, 'rcs-b'),
      ],
      mp,
    );
    const r1 = sim.run(sim.initial, 10, { input: () => ({ actuators: wheel }) }).state;
    expect(r1.world.ship.kinematics.angularVelocity.z).toBeCloseTo(
      (400 / mp.inertia.moments.z) * 10,
      14,
    );
    expect(r1.world.ship.kinematics.position).toEqual({ x: 0, y: 0, z: 0 });
    const r2 = sim.step(sim.initial, { actuators: couple }).state;
    expect(r2.world.ship.kinematics.angularVelocity.z).toBe(0); // +100·5 and −100·5 about z… cancel
    expect(r2.world.ship.kinematics.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('thrust rotates with the ship: matches the analytic spiral, second order in dt', () => {
    // From rest, ω constant, body force F along +x: v = (F/mω)(sin ωt, 1 − cos ωt).
    const mp = massProps();
    const omega = 0.1;
    const F = 1000;
    const T = 50;
    const a = F / mp.mass;
    const exact = {
      x: (a / omega) * ((1 - Math.cos(omega * T)) / omega),
      y: (a / omega) * (T - Math.sin(omega * T) / omega),
      vx: (a / omega) * Math.sin(omega * T),
      vy: (a / omega) * (1 - Math.cos(omega * T)),
    };
    const err = (dt: number): number => {
      const sim = createSimulation(makeWorld({ mp, angularRate: omega }), { dt });
      const act = actuators([thrust({ x: -7, y: 0 }, { x: F, y: 0 })], mp);
      const k = sim.run(sim.initial, Math.round(T / dt), { input: () => ({ actuators: act }) })
        .state.world.ship.kinematics;
      expect(k.angularVelocity.z).toBe(omega);
      return Math.hypot(k.position.x - exact.x, k.position.y - exact.y);
    };
    const e1 = err(1);
    const e05 = err(0.5);
    expect(e1).toBeLessThan(0.05); // over a 125 m spiral
    expect(e1 / e05).toBeGreaterThan(3.8);
    expect(e1 / e05).toBeLessThan(4.2);
  });

  it('reports specific force in the body frame, independent of attitude', () => {
    const mp = massProps();
    const sim = createSimulation(makeWorld({ mp, attitude: 1.2, angularRate: 0.05 }), { dt: 1 });
    const act = actuators([thrust({ x: 0, y: 2 }, { x: 0, y: -300 }, 'rcs')], mp);
    const r = sim.step(sim.initial, { actuators: act });
    expect(r.state.specificForce).toEqual({ x: 0, y: -300 / mp.mass, z: 0 });
    const coast = sim.step(r.state);
    expect(coast.state.specificForce).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('keeps attitude wrapped to (−π, π]', () => {
    const sim = createSimulation(makeWorld({ angularRate: 1 }), { dt: 1 });
    let s = sim.initial;
    for (let i = 0; i < 20; i++) {
      s = sim.step(s).state;
      const th = quat.yawOf(s.world.ship.kinematics.attitude);
      expect(th).toBeGreaterThan(-Math.PI);
      expect(th).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('uses the ship-systems mass properties when coasting, and carries systems over', () => {
    const mp = massProps({ mass: 5000 });
    const world = makeWorld({ mp });
    const sim = createSimulation(world, { dt: 1 });
    const r = sim.step(sim.initial);
    expect(r.state.world.ship.systems).toBe(world.ship.systems);
    const newSystems = { ...world.ship.systems, t: 1 };
    const r2 = sim.step(r.state, { systems: newSystems });
    expect(r2.state.world.ship.systems).toBe(newSystems);
  });

  it('rejects non-positive mass properties', () => {
    const sim = createSimulation(makeWorld(), { dt: 1 });
    const bad = actuators([], massProps({ mass: 0 }));
    expect(() => sim.step(sim.initial, { actuators: bad })).toThrow(/mass properties/);
  });
});
