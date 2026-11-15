/**
 * One tick with the real simulation (2A) and the real ship (2B) on the Gravity range.
 */

import { describe, expect, it } from 'vitest';
import type { Command } from '../contracts/commands.ts';
import { HANDS_ON_NEUTRAL, type MassProperties } from '../contracts/index.ts';
import type { Asteroid } from '../contracts/truth/index.ts';
import { createGravityRange, HIDDEN } from '../content/gravity-range/index.ts';
import { hashState } from '../lib/hash.ts';
import { quat, sym3 } from '../lib/index.ts';
import type { EncounterSetup } from './encounter.ts';
import { buildEnvironment } from './environment.ts';
import {
  createTruthStepper,
  midStepMassProperties,
  type DueCommand,
  type GameTruthState,
} from './truth-step.ts';

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
  const yaw = quat.yawOf(k.attitude);
  const dir = { x: Math.cos(yaw), y: Math.sin(yaw) };
  const rock: Asteroid = {
    id: 'rock',
    radius: 50,
    position: { x: k.position.x + dir.x * offset, y: k.position.y + dir.y * offset, z: 0 },
    velocity: {
      x: k.velocity.x - dir.x * closingSpeed,
      y: k.velocity.y - dir.y * closingSpeed,
      z: 0,
    },
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
      attitude: { reference: 'inertial', attitude },
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
    const attitude = quat.fromYaw(quat.yawOf(setup.definition.world.ship.kinematics.attitude) + 1);
    const commands = {
      50: [manual({ kind: 'attitude', target: { reference: 'inertial', attitude } })],
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

  it('loses the ship to a rock coming down on it from above the plane', () => {
    // 400 m straight above the arriving ship, falling onto it at 25 m/s.
    const world = setup.definition.world;
    const k = world.ship.kinematics;
    const rock: Asteroid = {
      id: 'overhead',
      radius: 40,
      position: { x: k.position.x, y: k.position.y, z: k.position.z + 400 },
      velocity: { x: k.velocity.x, y: k.velocity.y, z: k.velocity.z - 25 },
    };
    const above: EncounterSetup = {
      ...setup,
      definition: {
        ...setup.definition,
        world: { ...world, asteroids: [...world.asteroids, rock] },
      },
    };
    const stepper = createTruthStepper(above);
    let state = stepper.initial;
    const events = [];
    const impacts = [];
    for (let i = 0; i < 60 && !state.lost; i++) {
      const result = stepper.step(state, i === 0 ? arrival : []);
      state = result.state;
      events.push(...result.events);
      impacts.push(...result.simEvents.filter((e) => e.kind === 'impact'));
    }
    expect(state.lost).toBe('collision');
    const lost = events.find((e) => e.kind === 'ship-lost');
    // 400 m less the rock's radius and the hull's 2.5 m half-height, at 25 m/s.
    expect(lost!.t).toBeGreaterThan(14);
    expect(lost!.t).toBeLessThan(15);
    // It struck the top of the hull (body z = 2.5 m), not its side.
    const impact = impacts[0]!;
    if (impact.kind !== 'impact') throw new Error('no impact');
    expect(impact.with).toBe('overhead');
    expect(impact.point.z).toBeCloseTo(2.5, 6);
    expect(impact.relativeSpeed).toBeGreaterThan(24);
  });

  it('names a briefed body it hits even unseen, and an unbriefed rock only if seen', () => {
    // On Alpha's night side, 2 km above the surface and falling onto it at 30 m/s; an
    // unbriefed rock waits 300 m below the ship, in the dark too.
    const world = setup.definition.world;
    const alpha = world.bodies[0]!;
    const down = {
      x: -world.sun!.direction.x,
      y: -world.sun!.direction.y,
      z: -world.sun!.direction.z,
    };
    const at = (height: number) => ({
      x: alpha.position.x + (alpha.radius + height) * down.x,
      y: alpha.position.y + (alpha.radius + height) * down.y,
      z: alpha.position.z + (alpha.radius + height) * down.z,
    });
    const falling = {
      x: alpha.velocity.x - 30 * down.x,
      y: alpha.velocity.y - 30 * down.y,
      z: alpha.velocity.z - 30 * down.z,
    };
    const placed = (asteroids: readonly Asteroid[]): EncounterSetup => ({
      ...setup,
      definition: {
        ...setup.definition,
        world: {
          ...world,
          asteroids,
          ship: {
            ...world.ship,
            kinematics: { ...world.ship.kinematics, position: at(2_000), velocity: falling },
          },
        },
      },
    });
    const stepper = createTruthStepper(placed([]));
    const scene = buildEnvironment(stepper.initial.sim, {
      knownSizeTargets: [],
      sunExclusionAngle: setup.play.sunExclusionAngle,
    }).fieldSignals['ship-environment'] as { visibility: Record<string, boolean> };
    // From the night side Alpha cannot be seen.
    expect(scene.visibility.alpha).toBe(false);

    const ground = run(placed([]), 120);
    expect(ground.state.lost).toBe('collision');
    expect(ground.events.find((e) => e.kind === 'contact')).toMatchObject({ with: 'alpha' });

    const rock: Asteroid = {
      id: 'dark-rock',
      radius: 20,
      position: at(1_700),
      velocity: alpha.velocity,
    };
    const dark = run(placed([rock]), 120);
    const contact = dark.events.find((e) => e.kind === 'contact');
    expect(contact).toBeDefined();
    expect(contact).not.toHaveProperty('with');
    expect(dark.state.lost).toBe('collision');
  });

  it('counts Δv from the main engine and RCS translation, not from turning', () => {
    const stepper = createTruthStepper(setup);
    let state = stepper.initial;
    const go = (ticks: number, commands: Readonly<Record<number, DueCommand[]>> = {}) => {
      for (let i = 0; i < ticks; i++) state = stepper.step(state, commands[i] ?? []).state;
    };
    go(101, { 0: arrival });
    expect(state.objectives.deltaV).toBeUndefined();
    // A quarter turn on attitude control, then a hands-on yaw: couples, nothing pushed.
    const yaw = quat.yawOf(setup.definition.world.ship.kinematics.attitude);
    go(420, {
      0: [
        manual({
          kind: 'attitude',
          target: { reference: 'inertial', attitude: quat.fromYaw(yaw + Math.PI / 2) },
        }),
      ],
    });
    const turned = state.objectives.deltaV ?? 0;
    // The allocator trims the 2 mm sideways offset of the centre of mass with tiny forces.
    expect(turned).toBeLessThan(1e-3);
    go(100, {
      0: [manual({ kind: 'fly', input: { ...HANDS_ON_NEUTRAL, yaw: 1 } })],
      40: [manual({ kind: 'fly', input: HANDS_ON_NEUTRAL })],
    });
    expect((state.objectives.deltaV ?? 0) - turned).toBeLessThan(1e-9);

    // 10 s of main engine: the rocket equation on the propellant actually used.
    const before = state.objectives.deltaV ?? 0;
    const m0 = state.sim.world.ship.systems.massProperties.mass;
    go(20, { 0: [manual({ kind: 'burn', thruster: 'main-engine', throttle: 1, duration: 10 })] });
    const m1 = state.sim.world.ship.systems.massProperties.mass;
    const burned = (state.objectives.deltaV ?? 0) - before;
    expect(burned).toBeCloseTo(320 * 9.80665 * Math.log(m0 / m1), 5);
    expect(burned).toBeGreaterThan(7.5);

    // A minute of sideways translation by hand: 400 N on the ship.
    const sideways = state.objectives.deltaV ?? 0;
    go(61, {
      0: [manual({ kind: 'fly', input: { ...HANDS_ON_NEUTRAL, translate: { x: 0, y: 1, z: 0 } } })],
      60: [manual({ kind: 'fly', input: HANDS_ON_NEUTRAL })],
    });
    const mass = state.sim.world.ship.systems.massProperties.mass;
    expect((state.objectives.deltaV ?? 0) - sideways).toBeCloseTo((400 / mass) * 60, 3);
  });

  it('survives a slow bump below the loss speed', () => {
    const { state, events } = run(withObstacle(80, 1), 120);
    expect(state.lost).toBeUndefined();
    const contact = events.find((e) => e.kind === 'contact');
    expect(contact).toBeDefined();
    expect(events.some((e) => e.kind === 'ship-lost')).toBe(false);
  });
});

describe('mass properties at the middle of a step', () => {
  const props = (
    moments: MassProperties['inertia']['moments'],
    axes: quat.Quat,
  ): MassProperties => ({
    mass: 30_000,
    centerOfMass: { x: -0.3, y: 0, z: -0.1 },
    inertia: { moments, axes },
    hull: [],
  });

  it('is the mean of the two inertia tensors, also when the principal axes turn', () => {
    // The principal axes turn by 0.1 rad about body y between the two ends of the step.
    const before = props(
      { x: 1e5, y: 3e5, z: 3.2e5 },
      quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, 0.02),
    );
    const after = props(
      { x: 0.9e5, y: 2.9e5, z: 3.3e5 },
      quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, 0.12),
    );
    const mid = midStepMassProperties({ ...before, mass: 30_100 }, after);
    const tensor = (p: MassProperties) => sym3.fromPrincipal(p.inertia.moments, p.inertia.axes);
    const mean = sym3.scaleSym3(sym3.addSym3(tensor(before), tensor(after)), 0.5);
    const got = tensor(mid);
    for (let i = 0; i < 6; i++) expect(got[i]).toBeCloseTo(mean[i]!, 4);
    // Averaging the moments on the newer axes would miss the product of inertia by about 400.
    const naive = sym3.fromPrincipal({ x: 0.95e5, y: 2.95e5, z: 3.25e5 }, after.inertia.axes);
    expect(Math.abs(naive[2] - mean[2])).toBeGreaterThan(1e3);
    expect(mid.mass).toBe(30_050);
    expect(mid.hull).toBe(after.hull);
  });

  it('keeps the ship’s own numbers when nothing changed', () => {
    const same = props(
      { x: 1e5, y: 3e5, z: 3.2e5 },
      quat.fromAxisAngle({ x: 0, y: 1, z: 0 }, 0.03),
    );
    expect(midStepMassProperties(same, same)).toBe(same);
    const lighter = { ...same, mass: 29_990 };
    expect(midStepMassProperties(same, lighter).inertia).toBe(lighter.inertia);
  });
});
