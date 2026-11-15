import type {
  AttemptRecord,
  BlackBoxArchive,
  Forecast,
  Procedure,
} from '../../src/contracts/index.ts';
import { createGravityRange, LAW, SEED } from '../../src/content/gravity-range/index.ts';
import { matchProcedure, saveProcedure } from '../../src/blackbox/index.ts';
import { createBlackBox } from '../../src/game/belief/blackbox.ts';
import { burnDuration, burnSteps } from '../../src/game/belief/maneuver.ts';
import { createModelBridge } from '../../src/game/belief/model-bridge.ts';
import { createGameSession, type GameSession } from '../../src/game/session.ts';
import { createModelClient, type ExtensionRecord } from '../../src/model/index.ts';
import { createMetrics } from './metrics.ts';
import { digest, FIXED_TIME } from './flight.ts';

/** The established 2F/2G two-dive experiment, with real acquired records and held-out testing. */
export async function runLearning(seed = SEED) {
  const range = createGravityRange(seed);
  const setup = { ...range, play: { ...range.play, forecastSpan: 16 * 3600 } };
  const client = createModelClient({ worker: false });
  let logicalMs = 0;
  const box = createBlackBox({ clock: () => 0 });
  let tests: readonly ExtensionRecord[] = [];
  let adopted: readonly string[] = [];
  const model = createModelBridge(
    {
      ...client,
      adopt: (id) => client.adopt(id, FIXED_TIME),
      revoke: (id) => client.revoke(id, FIXED_TIME),
    },
    {
      referenceRadius: LAW.referenceRadius,
      clock: () => logicalMs,
      onExtensions: (history, rules) => {
        tests = history;
        adopted = rules;
      },
    },
  );
  const session = createGameSession(setup, {
    model,
    blackBox: box,
    rules: model.rules,
    now: () => FIXED_TIME,
    clock: () => 0,
  });
  const summaries: unknown[] = [];
  const modelErrors: string[] = [];
  const frozenForecasts: { forecast: Forecast; hash: string }[] = [];
  let procedure: Procedure | undefined;
  const flyUntil = async (
    game: GameSession,
    end: number,
    metrics: ReturnType<typeof createMetrics>,
    settle = () => model.settled(),
  ) => {
    while (game.status().t < end && game.status().outcome.kind === 'in-progress') {
      logicalMs += (setup.definition.dt * 1000) / 300;
      game.stepTicks(1);
      metrics.sample(game.lastTick()!);
      if (game.status().t % 300 === 0) {
        await settle();
        const error = (game.model as typeof model).lastError();
        if (error) modelErrors.push(error);
      }
    }
  };
  const draftFor = (deltaV: number) => ({
    name: `Authored ${deltaV} m/s nominal dive`,
    items: burnSteps({
      at: 600,
      duration: burnDuration(
        session.ship,
        session.snapshot().world.ship.massProperties.mass,
        deltaV,
      ),
      attitude: { reference: 'retrograde' as const },
    }),
  });
  const forecastSummary = (f: Forecast) => ({
    id: f.id,
    issuedAt: f.issuedAt,
    horizon: f.horizon,
    modelVersion: f.modelVersion,
    frozen: Object.isFrozen(f),
    hash: digest(f),
    extrapolatingSamples: f.samples.filter((s) => s.extrapolating).length,
    samples: f.samples.length,
    closestApproaches: f.closestApproaches,
    maxSigmaM: Math.max(
      0,
      ...f.samples.map((s) => Math.sqrt(s.positionCov[0] + s.positionCov[3] + s.positionCov[5])),
    ),
  });
  try {
    for (const deltaV of [9.85, 5]) {
      await model.settled();
      const metrics = createMetrics(setup, session.truth());
      await flyUntil(session, 300, metrics);
      const procedureStart = structuredClone(session.snapshot().world.ship);
      const forecast = await session.commit(draftFor(deltaV));
      frozenForecasts.push({ forecast, hash: digest(forecast) });
      await flyUntil(session, 30300, metrics);
      await model.settled();
      if (model.lastError()) modelErrors.push(model.lastError()!);
      summaries.push({
        attemptId: session.status().attemptId,
        deltaV,
        forecast: forecastSummary(forecast),
        metrics: metrics.finish(session.truth()),
        physicalStateHash: digest(session.truth()),
        modelError: model.lastError() ?? null,
      });
      if (deltaV === 5) {
        procedure = saveProcedure({
          id: 'harness-proven-shallow-dive',
          name: 'Saved acquired shallow investigation',
          record: box.attempt(session.status().attemptId)!,
          from: 300,
          to: 30300,
          state: procedureStart,
          tolerance: { position: 20000, velocity: 2, attitude: 0.1 },
        });
        box.saveProcedure(procedure);
      }
      session.recall();
    }
    await model.settled();
    session.setPaused(false);
    const tested = await model.rules.test('distance-law', ['attempt-0002'], 'attempt-0001');
    const liveRuleOperations: { operation: string; advancedTicks: number }[] = [];
    if (tested.adoptable) {
      for (const operation of ['adopt', 'revoke', 'adopt'] as const) {
        const pending = model.rules[operation]('distance-law');
        const advancedTicks = session.advance(1);
        await pending;
        liveRuleOperations.push({ operation, advancedTicks });
      }
    }

    if (!procedure) throw new Error('No acquired procedure was saved');
    // Keep only completed acquired attempts. This is archive restore, never an in-flight restore.
    const archive: BlackBoxArchive = {
      ...box.archive(),
      attempts: box.archive().attempts.filter((a) => a.outcome.kind !== 'in-progress'),
      extensionTests: tests,
      adoptedExtensions: adopted,
      extensionDecisions: await client.decisions(),
    };
    const comparisons = [];
    const pairedRecords: AttemptRecord[] = [];
    for (const acquire of [false, true]) {
      const pairClient = createModelClient({ worker: false });
      try {
        const pairBox = createBlackBox({ archive: structuredClone(archive), clock: () => 0 });
        logicalMs = 0;
        const pairModel = createModelBridge(pairClient, {
          referenceRadius: LAW.referenceRadius,
          clock: () => logicalMs,
          restored: { attempts: archive.attempts, extensions: tests, adopted },
        });
        const pairSetup = {
          ...setup,
          arrivalCommands: [
            ...setup.arrivalCommands,
            { kind: 'recorder' as const, sampleRate: acquire ? setup.play.recorderRate : 0 },
          ],
        };
        const game = createGameSession(pairSetup, {
          model: pairModel,
          blackBox: pairBox,
          rules: pairModel.rules,
          now: () => FIXED_TIME,
          clock: () => 0,
        });
        await pairModel.settled();
        const metrics = createMetrics(pairSetup, game.truth());
        await flyUntil(game, 300, metrics, () => pairModel.settled());
        const saved = pairBox.archive().procedures.find((p) => p.id === procedure!.id)!;
        const match = matchProcedure(saved, {
          encounterId: game.briefing.id,
          configuration: game.snapshot().world.ship.configuration,
          estimate: game.snapshot().world.ship,
        });
        const forecast = await game.commit({ name: saved.name, items: saved.items });
        frozenForecasts.push({ forecast, hash: digest(forecast) });
        await flyUntil(game, 30300, metrics, () => pairModel.settled());
        await pairModel.settled();
        if (pairModel.lastError()) modelErrors.push(pairModel.lastError()!);
        const finalCoast = await game.commit({ name: 'End-of-window coast comparison', items: [] });
        frozenForecasts.push({ forecast: finalCoast, hash: digest(finalCoast) });
        const record = pairBox.attempt(game.status().attemptId)!;
        pairedRecords.push(record);
        comparisons.push({
          acquisition: acquire ? 'fresh' : 'carried-only',
          newMeasurements: record.measurements.length,
          inheritedAttemptIds: archive.attempts.map((a) => a.id),
          inheritedExtensions: adopted,
          savedProcedure: saved.id,
          procedureMatch: match,
          replayClassification: match.matches
            ? 'within saved tolerances'
            : 'stale-procedure sensitivity test; mismatch retained, no automatic retiming',
          forecast: forecastSummary(forecast),
          finalCoastForecast: forecastSummary(finalCoast),
          metrics: metrics.finish(game.truth()),
          outcome: game.status().outcome,
          physicalStateHash: digest(game.truth()),
          modelError: pairModel.lastError() ?? null,
        });
      } finally {
        pairClient.terminate();
      }
    }
    return {
      summary: {
        id: 'c02-independent-attempt-learning-and-carried-comparison',
        seed,
        dtSeconds: setup.definition.dt,
        provenance:
          'Production model-loop.test.ts two-dive design; test trained on attempt-0002, scored only on attempt-0001. Explicit scripted rule proposal.',
        scheduling:
          'Deterministic 300x logical wall clock; settle every 300 simulation seconds and at attempt/forecast boundaries. Production handover/refit intervals and model settings unchanged. 16 h forecast fixture matches the original dive experiment.',
        learning: summaries,
        ruleTest: tested,
        adopted,
        liveRuleOperations,
        comparisons,
        checks: {
          heldOutNotInTraining: !tested.training.includes(tested.heldOut ?? ''),
          adoptedFromPassingTest: tested.adoptable && adopted.includes('distance-law'),
          carriedHasNoMeasurements: comparisons[0]!.newMeasurements === 0,
          freshHasMeasurements: comparisons[1]!.newMeasurements > 0,
          noModelErrors: modelErrors.length === 0,
          originalForecastsPreserved: frozenForecasts.every(
            (f) => Object.isFrozen(f.forecast) && digest(f.forecast) === f.hash,
          ),
          liveAdoptRevoke:
            liveRuleOperations.length === 3 &&
            liveRuleOperations.every((o) => o.advancedTicks === 1),
        },
        modelErrors,
        limits: [
          'This is a 30,300 s investigation, not the C02 departure or a full expedition cakewalk certificate.',
          'Both comparisons restore all acquired calibration, rules, and the saved procedure. They use the same seed; new-seed geometry and route completion remain separate acceptance work.',
          'Current production recurrence repeats sensor streams; distinct completed attempts satisfy the delivered model contract. Same-run disjoint experiments await 2C/3D.',
          'No human understanding or difficulty finding is inferred from scripted adoption.',
        ],
      },
      evidence: { archive, comparisons: pairedRecords },
    };
  } finally {
    client.terminate();
  }
}
