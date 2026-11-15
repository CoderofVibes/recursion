import { createHash } from 'node:crypto';
import { createBlackBox } from '../../src/game/belief/blackbox.ts';
import { createModelBridge } from '../../src/game/belief/model-bridge.ts';
import { createStandInModel } from '../../src/game/belief/standin-model.ts';
import { createGameSession } from '../../src/game/session.ts';
import { departStatus } from '../../src/game/objectives.ts';
import { createModelClient } from '../../src/model/index.ts';
import type { EncounterSetup } from '../../src/game/encounter.ts';
import { createMetrics } from './metrics.ts';
import { setupFor, type FlightCase } from './scenarios.ts';

export const FIXED_TIME = '2026-11-15T00:00:00.000Z';
export const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** One deterministic scheduler; the production game owns all physics, sensing and recording. */
export async function runFlight(flight: FlightCase, suppliedSetup?: EncounterSetup) {
  const setup = suppliedSetup ?? setupFor(flight);
  if (setup.definition.world.t !== 0)
    throw new Error(
      'Production GameSession uses local t=0; continuous run epochs need the 3D adapter',
    );
  if (!Number.isInteger(flight.duration / setup.definition.dt) || flight.duration <= 0)
    throw new Error('Duration must be a positive whole number of production ticks');
  const controls = [...flight.controls].sort((a, b) => a.at - b.at);
  for (const entry of controls)
    if (
      !Number.isInteger(entry.at / setup.definition.dt) ||
      entry.at < 0 ||
      entry.at >= flight.duration
    )
      throw new Error('Every control must lie on a tick inside the flight window');
  const box = createBlackBox({ clock: () => 0 });
  let modelClockMs = 0;
  const client =
    flight.mode === 'recorder-model' ? createModelClient({ worker: false }) : undefined;
  const model = client
    ? createModelBridge(client, {
        referenceRadius: setup.definition.world.law.referenceRadius,
        clock: () => modelClockMs,
      })
    : createStandInModel({ referenceRadius: setup.definition.world.law.referenceRadius });
  const session = createGameSession(setup, {
    model,
    blackBox: box,
    now: () => FIXED_TIME,
    clock: () => 0,
  });
  const metrics = createMetrics(setup, session.truth());
  let cursor = 0;
  const executed = [];
  try {
    await model.settled();
    while (
      session.status().t < flight.duration &&
      session.status().outcome.kind === 'in-progress'
    ) {
      const t = session.status().t;
      while (cursor < controls.length && controls[cursor]!.at === t) {
        const command = controls[cursor++]!.command;
        if (command.kind === 'fly') session.fly(command.input);
        else session.command(command);
        // Releases issue forecasts asynchronously; settle at this exact control boundary.
        await model.settled();
      }
      modelClockMs += (setup.definition.dt * 1000) / 300;
      session.stepTicks(1);
      const tick = session.lastTick()!;
      metrics.sample(tick);
      executed.push(...tick.executed);
      if (client && session.status().t % 300 === 0) await model.settled();
    }
    await model.settled();
    const state = session.truth();
    const record = box.attempt(session.status().attemptId)!;
    const outcome = session.status().outcome;
    const matched =
      flight.expected === 'survive-window'
        ? outcome.kind === 'in-progress' && session.status().t === flight.duration
        : outcome.kind === flight.expected;
    const modelError =
      'lastError' in model
        ? ((model as ReturnType<typeof createModelBridge>).lastError() ?? null)
        : null;
    const evaluation = metrics.finish(state);
    const failedMargin = flight.expected !== 'lost' && evaluation.firstFailedMargin !== null;
    return {
      id: flight.id,
      seed: setup.definition.seed,
      encounter: setup.definition.briefing.id,
      mode: flight.mode,
      knowledge: flight.knowledge,
      dtSeconds: setup.definition.dt,
      stopAt: flight.duration,
      controls,
      acquisitionSchedule: {
        arrival: setup.arrivalCommands,
        changes: controls.filter((c) =>
          ['recorder', 'point', 'power', 'mode'].includes(c.command.kind),
        ),
        settledEverySeconds: client ? 300 : null,
        modelClock:
          'deterministic 300x: 300 simulation seconds per 1000 logical wall milliseconds; production handover/refit intervals unchanged',
      },
      actualStop: session.status().t,
      outcome,
      expectation: flight.expected,
      expectationMatched: matched,
      judgment: modelError ? 'error' : matched && !failedMargin ? 'pass' : 'finding',
      marginStatus: failedMargin
        ? 'failed-margin'
        : flight.expected === 'lost'
          ? 'negative-control'
          : 'no-observed-failure',
      metrics: evaluation,
      departure: departStatus(state.sim.world),
      deltaVSpent: state.objectives.deltaV ?? 0,
      executed,
      physicalStateHash: digest(state),
      recordHash: digest(record),
      forecasts: record.forecasts.map((f) => ({
        id: f.id,
        issuedAt: f.issuedAt,
        horizon: f.horizon,
        modelVersion: f.modelVersion,
        hash: digest(f),
        frozen: Object.isFrozen(f),
        evidence: client
          ? 'production fitted model'
          : 'navigator stand-in only; not learning evidence',
      })),
      modelError,
      pendingControls: controls.slice(cursor),
      limits: [
        'A finite survival window is not encounter completion.',
        'No route or condition fixture is a human playtest.',
        'No forecast receives these truth-side metrics.',
      ],
    };
  } finally {
    client?.terminate();
  }
}
