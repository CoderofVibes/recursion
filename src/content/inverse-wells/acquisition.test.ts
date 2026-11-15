import { describe, expect, it } from 'vitest';
import type {
  AttemptRecord,
  Command,
  EncounterBriefing,
  ExecutedCommand,
  Measurement,
  ShipEvent,
} from '../../contracts/index.ts';
import type { TruthWorld } from '../../contracts/truth/index.ts';
import { buildEnvironment } from '../../game/environment.ts';
import { midStepMassProperties } from '../../game/truth-step.ts';
import { createStandInModel } from '../../game/belief/standin-model.ts';
import { createBlackBox } from '../../game/belief/blackbox.ts';
import { contextFromBriefing, ModelService } from '../../model/index.ts';
import { createSimulation } from '../../sim/index.ts';
import { stepShipSystems } from '../../ship/index.ts';
import { createInverseWells, LAW } from './index.ts';

describe('Well Garden default acquisition', () => {
  it(
    'can use one observed zero-GM core as the navigation reference without adding gravity',
    { timeout: 30_000 },
    () => {
      // Compatibility probe only: this does not import or validate an S16 layout.
      const setup = createInverseWells('source-free-acquisition');
      const { ship: definition } = setup.definition;
      const cores = setup.definition.world.bodies.filter((body) => body.id.endsWith('-core'));
      const core = cores[0]!;
      const world: TruthWorld = { ...setup.definition.world, bodies: cores };
      const briefing: EncounterBriefing = {
        ...setup.definition.briefing,
        knownBodies: [
          {
            id: core.id,
            name: core.name,
            position: core.position,
            velocity: core.velocity,
            radius: core.radius,
            positionCov: [2500, 0, 0, 2500, 0, 2500],
            tracked: false,
            lastFix: 0,
          },
        ],
        priors: [
          { id: `body.${core.id}.mu`, label: 'Core gravity', unit: 'm³/s²', value: 0, sigma: 1e4 },
          ...setup.definition.briefing.priors.filter((prior) => !prior.id.startsWith('body.')),
        ],
      };
      const arrivalCommands: readonly Command[] = [
        { kind: 'recorder', sampleRate: 1 },
        { kind: 'point', sensor: 'camera', target: core.id },
      ];
      const simulation = createSimulation(world, { dt: 1, registry: setup.fieldRegistry });
      let state = simulation.initial;
      const measurements: Measurement[] = [];
      const executed: ExecutedCommand[] = [];
      const events: ShipEvent[] = [];
      const navigator = createStandInModel({ referenceRadius: LAW.referenceRadius });
      const start = {
        attemptId: 'source-free',
        index: 1,
        briefing,
        ship: definition,
        arrivalMass: setup.arrivalMass,
        startedAt: 'test',
      };
      navigator.beginAttempt(start, createBlackBox().beginAttempt(start, 0));
      for (let tick = 0; tick < 600; tick++) {
        const commands = tick === 0 ? arrivalCommands : [];
        const env = buildEnvironment(state, {
          knownSizeTargets: [core.id],
          sunExclusionAngle: setup.play.sunExclusionAngle,
        });
        const ship = stepShipSystems(state.world.ship.systems, definition, commands, env, 1);
        expect(ship.events.filter((event) => event.kind === 'command-rejected')).toEqual([]);
        const done: ExecutedCommand[] = commands.map((command) => ({
          t: tick,
          command,
          source: 'procedure',
          status: 'executed',
        }));
        measurements.push(...ship.measurements);
        executed.push(...done);
        events.push(...ship.events);
        navigator.ingest({
          attemptId: 'source-free',
          t: tick,
          executed: done,
          measurements: ship.measurements,
          events: ship.events,
        });
        state = simulation.step(state, {
          systems: ship.state,
          actuators: {
            ...ship.actuators,
            massProperties: midStepMassProperties(
              state.world.ship.systems.massProperties,
              ship.actuators.massProperties,
            ),
          },
        }).state;
        state = { ...state, world: { ...state.world, sun: world.sun } };
      }
      expect(state.world.bodies.every((body) => body.gm === 0)).toBe(true);
      expect(
        measurements.filter((m) => m.kind === 'range' && m.target === core.id).length,
      ).toBeGreaterThan(100);
      const believed = navigator.believedWorld(600);
      expect(believed.bodies).toHaveLength(1);
      expect(believed.bodies[0]?.tracked).toBe(true);
      expect(believed.bodies[0]?.position).toEqual(core.position);
      expect(Object.values(believed.ship.position).every(Number.isFinite)).toBe(true);
      const record: AttemptRecord = {
        id: 'source-free',
        index: 1,
        encounterId: briefing.id,
        startedAt: 'test',
        start: {
          estimate: briefing.arrivalEstimate,
          configuration: briefing.arrivalConfiguration,
          modelVersion: 0,
          briefing,
        },
        plans: [],
        executed,
        forecasts: [],
        measurements,
        events,
        outcome: { kind: 'recalled', t: 600 },
        modelVersionAtEnd: 0,
      };
      const model = new ModelService(
        contextFromBriefing(briefing, definition, { arrivalMass: setup.arrivalMass }),
      );
      const fitted = model.load({ attempts: [record] });
      expect(fitted.basedOn.attempts).toContain('source-free');
      expect(model.report().coverage[0]?.used).toBe(true);
      expect(model.report().residuals.some((residual) => residual.target === core.id)).toBe(true);
      expect(
        fitted.parameters.every(
          (parameter) => Number.isFinite(parameter.value) && Number.isFinite(parameter.sigma),
        ),
      ).toBe(true);
      const forecast = model.forecast({
        id: 'source-free-coast',
        attemptId: record.id,
        issuedAt: 600,
        plan: { id: 'coast', epoch: 600, items: [] },
        massProperties: state.world.ship.systems.massProperties,
        duration: 300,
        step: 30,
      });
      expect(forecast.draft.samples.length).toBeGreaterThan(1);
      expect(
        forecast.draft.samples.every((sample) =>
          [
            ...Object.values(sample.position),
            ...Object.values(sample.velocity),
            ...sample.positionCov,
          ].every(Number.isFinite),
        ),
      ).toBe(true);
      const coast = state.world.ship.kinematics;
      for (const sample of forecast.draft.samples) {
        const elapsed = sample.t - 600;
        const miss = Math.hypot(
          sample.position.x - coast.position.x - elapsed * coast.velocity.x,
          sample.position.y - coast.position.y - elapsed * coast.velocity.y,
          sample.position.z - coast.position.z - elapsed * coast.velocity.z,
        );
        const positionSigma = Math.sqrt(
          sample.positionCov[0] + sample.positionCov[3] + sample.positionCov[5],
        );
        expect(miss).toBeLessThan(3 * positionSigma);
      }
      expect(forecast.draft.samples.at(-1)?.t).toBe(900);
      expect(forecast.draft.samples.some((sample) => sample.extrapolating)).toBe(true);
      // This is the ordinary coasting forecast; no adopted well response is implied.
      expect(forecast.draft.inputs.extensions).not.toContain('thrust-response-region');
    },
  );
  it(
    'records a modelled optical target without inventing moving core tracks',
    { timeout: 30_000 },
    () => {
      const setup = createInverseWells('garden-acquisition');
      const { world, ship: definition, briefing } = setup.definition;
      // Static massless cores are physical objects, not an invented orbiting secondary.
      expect(world.bodies.filter((body) => body.id.endsWith('-core'))).toHaveLength(3);
      expect(briefing.knownBodies.map((body) => body.id)).toEqual(['garden-reference']);
      expect(setup.arrivalCommands).toContainEqual({
        kind: 'point',
        sensor: 'camera',
        target: 'garden-reference',
      });
      const simulation = createSimulation(world, { dt: 1, registry: setup.fieldRegistry });
      let state = simulation.initial;
      const measurements: Measurement[] = [];
      const executed: ExecutedCommand[] = [];
      const events: ShipEvent[] = [];
      const navigator = createStandInModel({ referenceRadius: LAW.referenceRadius });
      const start = {
        attemptId: 'acquisition',
        index: 1,
        briefing,
        ship: definition,
        arrivalMass: setup.arrivalMass,
        startedAt: 'test',
      };
      navigator.beginAttempt(start, createBlackBox().beginAttempt(start, 0));
      // Exercise actual ship acquisition and production physics until a short coast arc exists.
      for (let tick = 0; tick < 600; tick++) {
        const commands = tick === 0 ? setup.arrivalCommands : [];
        const env = buildEnvironment(state, {
          knownSizeTargets: briefing.knownBodies.map((body) => body.id),
          sunExclusionAngle: setup.play.sunExclusionAngle,
        });
        const ship = stepShipSystems(state.world.ship.systems, definition, commands, env, 1);
        const rejected = ship.events.filter((event) => event.kind === 'command-rejected');
        expect(rejected).toEqual([]);
        const done: ExecutedCommand[] = commands.map((command) => ({
          t: tick,
          command,
          source: 'procedure',
          status: 'executed',
        }));
        measurements.push(...ship.measurements);
        executed.push(...done);
        events.push(...ship.events);
        navigator.ingest({
          attemptId: 'acquisition',
          t: tick,
          executed: done,
          measurements: ship.measurements,
          events: ship.events,
        });
        state = simulation.step(state, {
          systems: ship.state,
          actuators: {
            ...ship.actuators,
            massProperties: midStepMassProperties(
              state.world.ship.systems.massProperties,
              ship.actuators.massProperties,
            ),
          },
        }).state;
        // Match the game layer's preservation of the distant sun across simulation stores.
        state = { ...state, world: { ...state.world, sun: world.sun } };
      }
      const fixes = measurements.filter(
        (m) => m.kind === 'range' && m.target === 'garden-reference',
      );
      expect(fixes.length).toBeGreaterThan(100);
      const believed = navigator.believedWorld(600);
      expect(believed.bodies.map((body) => body.id)).toEqual(['garden-reference']);
      expect(believed.bodies[0]?.tracked).toBe(true);
      expect(believed.fields).toEqual([]);
      const record: AttemptRecord = {
        id: 'acquisition',
        index: 1,
        encounterId: briefing.id,
        startedAt: 'test',
        start: {
          estimate: briefing.arrivalEstimate,
          configuration: briefing.arrivalConfiguration,
          modelVersion: 0,
          briefing,
        },
        plans: [],
        executed,
        forecasts: [],
        measurements,
        events,
        outcome: { kind: 'recalled', t: 600 },
        modelVersionAtEnd: 0,
      };
      const model = new ModelService(
        contextFromBriefing(briefing, definition, {
          arrivalMass: setup.arrivalMass,
        }),
      );
      const fitted = model.load({ attempts: [record] });
      // Usable ordinary evidence is distinct from a demonstrated well-response recovery.
      expect(fitted.basedOn.attempts).toContain('acquisition');
      expect(model.report().coverage[0]?.used).toBe(true);
      expect(
        model.report().residuals.some((residual) => residual.target === 'garden-reference'),
      ).toBe(true);
      expect(model.report().residuals.some((residual) => residual.target?.endsWith('-core'))).toBe(
        false,
      );
    },
  );
});
