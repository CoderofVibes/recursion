import { describe, expect, it } from 'vitest';
import type { Measurement, ShipEvent } from '../../contracts/index.ts';
import { buildEnvironment } from '../../game/environment.ts';
import { midStepMassProperties } from '../../game/truth-step.ts';
import { dot, length, sub, type Vec3 } from '../../lib/vec3.ts';
import { createSimulation } from '../../sim/index.ts';
import { readFunnelParameters, sampleFunnel } from '../../sim/fields/wells.ts';
import { stepShipSystems } from '../../ship/index.ts';
import {
  FUNNEL_EXPERIMENTS,
  FUNNEL_EXPERIMENT_BURN_TICK,
  FUNNEL_EXPERIMENT_TICKS,
  funnelExperimentCommands,
  funnelExperimentSetup,
  type FunnelExperiment,
} from './funnel-experiments.ts';

/** Direct production registry/ship acquisition until the owner integrates terminal lifecycle. */
function record(experiment: FunnelExperiment, fieldOn: boolean, worn = false) {
  const setup = funnelExperimentSetup(experiment);
  const original = setup.definition.world;
  const systems = original.ship.systems;
  const world = {
    ...original,
    fields: fieldOn ? original.fields : [],
    ship: {
      ...original.ship,
      systems: worn
        ? {
            ...systems,
            equipment: {
              ...systems.equipment,
              'main-engine': { ...systems.equipment['main-engine']!, condition: 0.6 },
            },
          }
        : systems,
    },
  };
  const simulation = createSimulation(world, { dt: 1, registry: setup.fieldRegistry });
  let state = simulation.initial;
  const measurements: Measurement[] = [];
  const events: ShipEvent[] = [];
  const samples: { t: number; specificForce: Vec3; velocity: Vec3; weight: number; pull: Vec3 }[] =
    [];
  const first = original.fields.find((field) => field.id === 'funnel-0')!;
  const axis = readFunnelParameters(first).axis;
  const initialField = sampleFunnel(first, world.ship.kinematics.position, 0);
  for (let tick = 0; tick < FUNNEL_EXPERIMENT_TICKS; tick++) {
    const environment = buildEnvironment(state, {
      knownSizeTargets: world.bodies.map((body) => body.id),
      sunExclusionAngle: setup.play.sunExclusionAngle,
    });
    const ship = stepShipSystems(
      state.world.ship.systems,
      setup.definition.ship,
      funnelExperimentCommands(experiment, tick),
      environment,
      1,
    );
    measurements.push(...ship.measurements);
    events.push(...ship.events);
    const stepped = simulation.step(state, {
      systems: ship.state,
      actuators: {
        ...ship.actuators,
        massProperties: midStepMassProperties(
          state.world.ship.systems.massProperties,
          ship.actuators.massProperties,
        ),
      },
    });
    expect(stepped.contacts.filter((contact) => contact.impact)).toEqual([]);
    state = { ...stepped.state, world: { ...stepped.state.world, sun: world.sun } };
    const field = sampleFunnel(first, state.world.ship.kinematics.position, state.world.t);
    samples.push({
      t: state.world.t,
      specificForce: state.specificForce,
      velocity: state.world.ship.kinematics.velocity,
      weight: field.weight,
      pull: field.pull,
    });
  }
  return {
    state,
    measurements,
    events,
    samples,
    axis,
    initialField,
    initialMain: systems.tanks['main-propellant']!,
  };
}

function acceleration(measurements: readonly Measurement[], t = 65): Measurement {
  const result = measurements.find((m) => m.kind === 'accel' && m.source === 'imu-a' && m.t === t);
  expect(result, `normal IMU acquisition at ${t} s`).toBeDefined();
  return result!;
}

describe('controlled S22 experiments through the real ship and sensors', () => {
  it.each(FUNNEL_EXPERIMENTS)(
    '$id retains acquired response and ordinary operating costs',
    (experiment) => {
      const field = record(experiment, true);
      const ordinary = record(experiment, false);
      const a = acceleration(field.measurements).value[0]!;
      const b = acceleration(ordinary.measurements).value[0]!;
      const actualSystems = field.state.world.ship.systems;
      const plainSystems = ordinary.state.world.ship.systems;
      expect(field.events.filter((event) => event.kind === 'command-rejected')).toEqual([]);
      expect(actualSystems.recorder.bytesUsed).toBeGreaterThan(0);
      expect(field.measurements.some((m) => m.kind === 'telemetry')).toBe(true);
      expect(field.measurements.filter((m) => m.kind === 'accel').length).toBeGreaterThan(40);
      // Field work changes motion, never the ship's fuel/power/heat dispatch or nominal torque.
      expect(actualSystems.tanks).toEqual(plainSystems.tanks);
      expect(actualSystems.thermal).toEqual(plainSystems.thermal);
      for (const equipment of Object.keys(actualSystems.equipment)) {
        expect(actualSystems.equipment[equipment]!.powerDraw).toEqual(
          plainSystems.equipment[equipment]!.powerDraw,
        );
        expect(actualSystems.equipment[equipment]!.temperature).toEqual(
          plainSystems.equipment[equipment]!.temperature,
        );
        expect(actualSystems.equipment[equipment]!.values.charge).toEqual(
          plainSystems.equipment[equipment]!.values.charge,
        );
      }
      expect(field.state.world.ship.kinematics.attitude).toEqual(
        ordinary.state.world.ship.kinematics.attitude,
      );
      expect(field.state.world.ship.kinematics.angularVelocity).toEqual(
        ordinary.state.world.ship.kinematics.angularVelocity,
      );
      if (experiment.burn) {
        expect(actualSystems.tanks['main-propellant']).toBeLessThan(field.initialMain);
        expect(Math.abs(acceleration(field.measurements, 75).value[0]!)).toBeLessThan(0.001);
      }
      if (experiment.expected === 'reversed') {
        expect(a).toBeLessThan(-0.5);
        expect(b).toBeGreaterThan(0.5);
        expect(dot(field.state.world.ship.kinematics.velocity, field.axis)).toBeGreaterThan(0);
        expect(dot(ordinary.state.world.ship.kinematics.velocity, field.axis)).toBeLessThan(0);
      } else if (experiment.expected === 'coast-pull') {
        expect(field.samples.every((sample) => length(sample.specificForce) === 0)).toBe(true);
        expect(dot(field.state.world.ship.kinematics.velocity, field.axis)).toBeGreaterThan(1);
        expect(length(ordinary.state.world.ship.kinematics.velocity)).toBe(0);
        expect(Math.abs(a)).toBeLessThan(0.001);
        expect(field.measurements.filter((m) => m.kind === 'accel')).toEqual(
          ordinary.measurements.filter((m) => m.kind === 'accel'),
        );
        expect(actualSystems.tanks['main-propellant']).toBe(field.initialMain);
      } else if (experiment.expected === 'near-zero') {
        expect(field.initialField.weight).toBeCloseTo(0.5, 10);
        // Pull moves the ship during sensor warmup; no artificial hold pins it to half weight.
        expect(field.samples[FUNNEL_EXPERIMENT_BURN_TICK]!.weight).not.toBe(
          field.initialField.weight,
        );
        expect(Math.abs(a)).toBeLessThan(0.04);
        expect(b).toBeGreaterThan(0.5);
        expect(
          field.samples
            .slice(0, FUNNEL_EXPERIMENT_BURN_TICK)
            .every((sample) => dot(sample.pull, field.axis) > 0),
        ).toBe(true);
        expect(
          dot(field.samples[FUNNEL_EXPERIMENT_BURN_TICK - 1]!.velocity, field.axis),
        ).toBeGreaterThan(0.5);
      } else {
        expect(Math.abs(a - b)).toBeLessThan(0.001);
        expect(a).toBeGreaterThan(0.5);
        if (experiment.id === 'outside') {
          expect(field.initialField.weight).toBe(0);
          expect(
            length(
              sub(
                field.state.world.ship.kinematics.velocity,
                ordinary.state.world.ship.kinematics.velocity,
              ),
            ),
          ).toBeLessThan(1e-10);
        }
      }
    },
  );

  it('uses worn delivered authority and repeats actual telemetry/noise deterministically', () => {
    const axial = FUNNEL_EXPERIMENTS[0]!;
    const healthy = record(axial, true);
    const worn = record(axial, true, true);
    const replay = record(axial, true, true);
    expect(replay.measurements).toEqual(worn.measurements);
    expect(replay.state).toEqual(worn.state);
    const used = (result: ReturnType<typeof record>) =>
      result.initialMain - result.state.world.ship.systems.tanks['main-propellant']!;
    expect(used(worn)).toBeGreaterThan(0);
    expect(used(worn)).toBeLessThan(used(healthy));
    expect(Math.abs(acceleration(worn.measurements).value[0]!)).toBeLessThan(
      Math.abs(acceleration(healthy.measurements).value[0]!),
    );
    expect(acceleration(worn.measurements).value[0]).toBeLessThan(-0.1);
  });
});
