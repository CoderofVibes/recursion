/**
 * One tick with the real simulation (2A) and the real ship (2B) on the Gravity range.
 */

import { describe, expect, it } from 'vitest';
import type { Command } from '../contracts/commands.ts';
import type { Asteroid } from '../contracts/truth/index.ts';
import { createGravityRange, HIDDEN } from '../content/gravity-range/index.ts';
import { hashState } from '../lib/hash.ts';
import type { EncounterSetup } from './encounter.ts';
import { createTruthStepper, type DueCommand, type GameTruthState } from './truth-step.ts';

const setup = createGravityRange();
const arrival: DueCommand[] = setup.arrivalCommands.map((command) => ({
  command,
  source: 'procedure',
}));
const manual = (command: Command): DueCommand => ({ command, source: 'manual' });

/** Speed relative to Alpha. */
function speed(state: GameTruthState): number {
  const alpha = state.sim.world.bodies[0]!;
  const k = state.sim.world.ship.kinematics;
  return Math.hypot(k.velocity.x - alpha.velocity.x, k.velocity.y - alpha.velocity.y);
}

/** Run ticks with commands keyed by tick index; collects everything the ship sensed. */
function run(
  encounter: EncounterSetup,
  ticks: number,
  commands: Readonly<Record<number, DueCommand[]>> = {},
) {
  const stepper = createTruthStepper(encounter);
  let state = stepper.initial;
  const measurements = [];
  const events = [];
  const executed = [];
  for (let i = 0; i < ticks && !state.lost; i++) {
    const result = stepper.step(state, [...(i === 0 ? arrival : []), ...(commands[i] ?? [])]);
    state = result.state;
    measurements.push(...result.measurements);
    events.push(...result.events);
    executed.push(...result.executed);
  }
  return { state, measurements, events, executed };
}

/** The encounter with one extra asteroid placed relative to the arriving ship. */
function withObstacle(offset: number, closingSpeed: number): EncounterSetup {
  const world = setup.definition.world;
  const k = world.ship.kinematics;
  const dir = { x: Math.cos(k.attitude), y: Math.sin(k.attitude) };
  const rock: Asteroid = {
    id: 'rock',
    radius: 50,
    position: { x: k.position.x + dir.x * offset, y: k.position.y + dir.y * offset },
    velocity: { x: k.velocity.x - dir.x * closingSpeed, y: k.velocity.y - dir.y * closingSpeed },
  };
  return {
    ...setup,
    definition: { ...setup.definition, world: { ...world, asteroids: [...world.asteroids, rock] } },
  };
}

describe('truth step', () => {
  it('keeps the sun in the world and records camera fixes on Alpha once warmed up', () => {
    const { state, measurements, executed } = run(setup, 120);
    expect(state.sim.world.sun).toEqual(setup.definition.world.sun);
    expect(state.sim.world.t).toBe(120);
    expect(executed.map((e) => [e.t, e.command.kind, e.source, e.status])).toEqual([
      [0, 'recorder', 'procedure', 'executed'],
      [0, 'point', 'procedure', 'executed'],
    ]);
    const fixes = measurements.filter((m) => m.kind === 'bearing' || m.kind === 'range');
    // One packet every 20 s; the camera needs 30 s to warm up and calibrate.
    expect(fixes.map((m) => [m.t, m.kind, m.target])).toEqual([
      [40, 'bearing', 'alpha'],
      [40, 'range', 'alpha'],
      [60, 'bearing', 'alpha'],
      [60, 'range', 'alpha'],
      [80, 'bearing', 'alpha'],
      [80, 'range', 'alpha'],
      [100, 'bearing', 'alpha'],
      [100, 'range', 'alpha'],
    ]);
    // Alpha is dead ahead-left of the arriving ship: bearing near 0, range near r0.
    expect(fixes[0]!.value[0]).toBeCloseTo(0.004, 3);
    expect(fixes[1]!.value[0]! / 1e6).toBeCloseTo(1, 0);
  });

  it('never reports gravity: coasting accelerometers read only bias and noise', () => {
    const { measurements } = run(setup, 200);
    const accel = measurements.filter((m) => m.kind === 'accel');
    expect(accel.length).toBeGreaterThan(10);
    // Gravity at r0 is 0.01 m/s²; a coasting accelerometer shows 100 times less.
    for (const m of accel) expect(Math.hypot(m.value[0]!, m.value[1]!)).toBeLessThan(6e-4);
  });

  it('burns with the true (hidden) engine and uses propellant accordingly', () => {
    const attitude = setup.definition.world.ship.kinematics.attitude;
    const burn: Command = {
      kind: 'burn',
      thruster: 'main-engine',
      throttle: 1,
      duration: 10,
      attitude: { reference: 'inertial', angle: attitude },
    };
    const before = run(setup, 60).state;
    const { state, executed } = run(setup, 80, { 60: [manual(burn)] });
    expect(executed.at(-1)).toMatchObject({ t: 60, source: 'manual', status: 'executed' });
    const scale = HIDDEN['thruster.main-engine.scale']!;
    const m0 = 30374;
    const used = 6000 - state.sim.world.ship.systems.tanks['main-propellant']!;
    // Rated 24 kN at 320 s, running at the hidden scale.
    expect(used).toBeCloseTo((scale * 24000 * 10) / (320 * 9.80665), 1);
    const exhaust = 320 * 9.80665;
    expect(speed(state) - speed(before)).toBeCloseTo(exhaust * Math.log(m0 / (m0 - used)), 1);
  });

  it('reports a command the ship refuses', () => {
    const { executed, events } = run(setup, 2, {
      1: [manual({ kind: 'attitude', target: { reference: 'prograde' } })],
    });
    expect(executed.at(-1)).toMatchObject({ t: 1, status: 'rejected' });
    expect(executed.at(-1)!.reason).toMatch(/inertial/);
    expect(events.some((e) => e.kind === 'command-rejected')).toBe(true);
  });

  it('is deterministic and survives a JSON save and restore part way', () => {
    const attitude = setup.definition.world.ship.kinematics.attitude + 1;
    const commands = {
      50: [manual({ kind: 'attitude', target: { reference: 'inertial', angle: attitude } })],
      150: [manual({ kind: 'burn', thruster: 'main-engine', throttle: 0.6, duration: 7.5 })],
    };
    const a = run(setup, 300, commands);
    const b = run(setup, 300, commands);
    expect(hashState(b.state)).toBe(hashState(a.state));
    expect(hashState(b.measurements)).toBe(hashState(a.measurements));

    const stepper = createTruthStepper(setup);
    let state = stepper.initial;
    for (let i = 0; i < 300; i++) {
      if (i === 170) state = JSON.parse(JSON.stringify(state)) as GameTruthState;
      state = stepper.step(state, [
        ...(i === 0 ? arrival : []),
        ...(commands[i as keyof typeof commands] ?? []),
      ]).state;
    }
    expect(hashState(state)).toBe(hashState(a.state));
    expect(hashState(run(setup, 300).state)).not.toBe(hashState(a.state));
  });

  it('loses the ship in a fast impact and keeps the events up to it', () => {
    const { state, events } = run(withObstacle(300, 30), 60);
    expect(state.lost).toBe('collision');
    const contact = events.find((e) => e.kind === 'contact');
    const lost = events.find((e) => e.kind === 'ship-lost');
    expect(contact).toBeDefined();
    expect(lost).toMatchObject({ kind: 'ship-lost', cause: 'collision' });
    expect(lost!.t).toBeGreaterThan(7);
    expect(lost!.t).toBeLessThan(10);
    expect(() => createTruthStepper(setup).step(state)).toThrow(/lost/);
  });

  it('survives a slow bump below the loss speed', () => {
    const { state, events } = run(withObstacle(80, 1), 120);
    expect(state.lost).toBeUndefined();
    const contact = events.find((e) => e.kind === 'contact');
    expect(contact).toBeDefined();
    expect(events.some((e) => e.kind === 'ship-lost')).toBe(false);
  });
});
