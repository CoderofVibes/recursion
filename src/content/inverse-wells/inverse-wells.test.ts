import { describe, expect, it } from 'vitest';
import type { Measurement } from '../../contracts/index.ts';
import { buildEnvironment } from '../../game/environment.ts';
import { midStepMassProperties } from '../../game/truth-step.ts';
import { createSimulation } from '../../sim/index.ts';
import { stepShipSystems } from '../../ship/index.ts';
import { createInverseWells, MECHANICS_PREVIEW } from './index.ts';
import {
  experimentCommands,
  experimentSetup,
  EXPERIMENT_TICKS,
  WELL_EXPERIMENTS,
  type WellExperiment,
} from './experiments.ts';

/** Direct production registry/ship/sim test while 2F awaits truth-step ownership from 2G. */
function record(experiment: WellExperiment, fieldOn: boolean, worn = false) {
  const setup = experimentSetup(experiment);
  const initial = setup.definition.world;
  const systems = initial.ship.systems;
  const world = {
    ...initial,
    fields: fieldOn ? initial.fields : [],
    ship: {
      ...initial.ship,
      systems: worn
        ? {
            ...systems,
            equipment: {
              ...systems.equipment,
              'main-engine': {
                ...systems.equipment['main-engine']!,
                condition: 0.6,
              },
            },
          }
        : systems,
    },
  };
  const sim = createSimulation(world, { dt: 1, registry: setup.fieldRegistry });
  let state = sim.initial;
  const measurements: Measurement[] = [];
  for (let tick = 0; tick < EXPERIMENT_TICKS; tick++) {
    const env = buildEnvironment(state, {
      knownSizeTargets: world.bodies.map((body) => body.id),
      sunExclusionAngle: 0.1,
    });
    const ship = stepShipSystems(
      state.world.ship.systems,
      setup.definition.ship,
      experimentCommands(experiment, tick),
      env,
      1,
    );
    measurements.push(...ship.measurements);
    state = sim.step(state, {
      systems: ship.state,
      actuators: {
        ...ship.actuators,
        massProperties: midStepMassProperties(
          state.world.ship.systems.massProperties,
          ship.actuators.massProperties,
        ),
      },
    }).state;
    // Match the game's declared persistent distant sun; sim's store currently drops it.
    state = { ...state, world: { ...state.world, sun: world.sun } };
  }
  return { state, measurements };
}

describe('P03 content provider', () => {
  it('replays the survey/noise seed, never briefs invisible well parameters', () => {
    const a = createInverseWells('a');
    const b = createInverseWells('a');
    expect(a.definition).toEqual(b.definition);
    expect(createInverseWells('b').definition.briefing).not.toEqual(a.definition.briefing);
    expect(JSON.stringify(a.definition.briefing)).not.toMatch(
      /innerRadius|outerRadius|radialGain|inverse-well"/,
    );
    expect(a.contentStatus).toBe('funnel-prototype');
    expect(a.definition.world.fields).toHaveLength(2601);
    expect(a.fieldRegistry.kinds()).toEqual(['inverse-well']);
    expect(a.exits.map((exit) => exit.destination)).toEqual(['P04', 'N03']);
  });

  it.each(['power', 'cross-transfer'] as const)(
    'preserves a surviving %s arrival without repairs or new commands',
    (entrance) => {
      const base = createInverseWells('carry', { entrance, layout: MECHANICS_PREVIEW });
      const original = base.definition.world.ship;
      const ship = {
        ...original,
        systems: {
          ...original.systems,
          t: 1234,
          tanks: { ...original.systems.tanks, 'main-propellant': 321 },
          equipment: {
            ...original.systems.equipment,
            'main-engine': {
              ...original.systems.equipment['main-engine']!,
              condition: 0.4,
              tripped: true,
            },
          },
        },
      };
      const carried = createInverseWells('carry', {
        entrance,
        layout: MECHANICS_PREVIEW,
        arrival: {
          ship,
          definition: base.definition.ship,
          briefing: {
            ...base.definition.briefing,
            arrivalEstimate: { ...base.definition.briefing.arrivalEstimate, t: 1234 },
          },
        },
      });
      expect(carried.definition.world.ship).toBe(ship);
      expect(carried.definition.world.t).toBe(1234);
      expect(carried.definition.briefing.arrivalEstimate.t).toBe(1234);
      expect(carried.arrivalCommands).toEqual([]);
      expect(() =>
        createInverseWells('bad-epoch', {
          arrival: {
            ship,
            definition: base.definition.ship,
            briefing: base.definition.briefing,
          },
        }),
      ).toThrow(/epoch/);
    },
  );

  it('rejects overlapping wells and a whole-ship core arrival', () => {
    expect(() =>
      createInverseWells('bad', {
        layout: {
          ...MECHANICS_PREVIEW,
          wells: [MECHANICS_PREVIEW.wells[0]!, { ...MECHANICS_PREVIEW.wells[0]!, id: 'overlap' }],
        },
      }),
    ).toThrow(/overlap/);
    const base = createInverseWells(undefined, { layout: MECHANICS_PREVIEW });
    const center = MECHANICS_PREVIEW.wells[0]!.center;
    expect(() =>
      createInverseWells('bad', {
        layout: MECHANICS_PREVIEW,
        arrival: {
          definition: base.definition.ship,
          briefing: base.definition.briefing,
          ship: {
            ...base.definition.world.ship,
            kinematics: {
              ...base.definition.world.ship.kinematics,
              position: { ...center, x: center.x + 1001 },
            },
          },
        },
      }),
    ).toThrow(/core|inside|overlap/);
  });
});

describe('real ship acquired well comparisons', () => {
  it.each(WELL_EXPERIMENTS)(
    '$id records the selected response without a field resource credit',
    (experiment) => {
      const field = record(experiment, true);
      const ordinary = record(experiment, false);
      const state = field.state.world.ship.systems;
      // The field affects translation only: normal propellant, electrical and thermal costs survive.
      expect(state.tanks).toEqual(ordinary.state.world.ship.systems.tanks);
      expect(state.thermal).toEqual(ordinary.state.world.ship.systems.thermal);
      expect(field.state.world.ship.kinematics.attitude).toEqual(
        ordinary.state.world.ship.kinematics.attitude,
      );
      const read = (measurements: readonly Measurement[]) =>
        measurements.filter((m) => m.kind === 'accel' && m.source === 'imu-a' && m.t === 65)[0]!
          .value[0]!;
      const a = read(field.measurements);
      const b = read(ordinary.measurements);
      if (experiment.expected === 'reversed') {
        expect(a).toBeLessThan(-0.5);
        expect(b).toBeGreaterThan(0.5);
      } else if (experiment.expected === 'coast') {
        expect(field.state).toEqual({
          ...ordinary.state,
          world: { ...ordinary.state.world, fields: field.state.world.fields },
        });
        expect(Math.abs(a)).toBeLessThan(0.001);
      } else if (experiment.expected === 'near-zero') {
        expect(Math.abs(a)).toBeLessThan(0.01);
        expect(b).toBeGreaterThan(0.5);
      } else {
        expect(Math.abs(a - b)).toBeLessThan(0.001);
        expect(a).toBeGreaterThan(0.5);
      }
    },
  );

  it('uses delivered worn-engine authority and replays the measured signal', () => {
    const radial = WELL_EXPERIMENTS[0]!;
    const healthy = record(radial, true);
    const worn = record(radial, true, true);
    expect(record(radial, true, true)).toEqual(worn);
    const used = (result: ReturnType<typeof record>) =>
      6000 - result.state.world.ship.systems.tanks['main-propellant']!;
    expect(used(worn)).toBeLessThan(used(healthy));
    expect(used(worn)).toBeGreaterThan(0);
  });
});
