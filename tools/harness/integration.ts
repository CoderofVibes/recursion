/** Production integration probes. Results are diagnostic evidence, never a player forecast. */
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Command, Procedure } from '../../src/contracts/index.ts';
import { HANDS_ON_NEUTRAL } from '../../src/contracts/index.ts';
import { createGravityRange } from '../../src/content/gravity-range/index.ts';
import { freshAlerts } from '../../src/console/alerts.ts';
import { Desk, type PageId } from '../../src/console/desk.ts';
import { createBlackBox } from '../../src/game/belief/blackbox.ts';
import { createModelBridge } from '../../src/game/belief/model-bridge.ts';
import type { ModelPort } from '../../src/game/belief/ports.ts';
import type { EncounterSetup } from '../../src/game/encounter.ts';
import { createGameSession } from '../../src/game/session.ts';
import {
  createTruthStepper,
  type DueCommand,
  type GameTruthState,
} from '../../src/game/truth-step.ts';
import { createModelClient } from '../../src/model/index.ts';

export interface IntegrationCheck {
  readonly id: string;
  readonly status: 'pass' | 'fail' | 'blocked';
  readonly scope: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

const SEED = 'gravity-range-1';
const FIXED_DATE = '2026-11-14T00:00:00.000Z';
const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const jsonClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A bounded clock/operation fixture, not an authored flight or a changed model setting. */
function fixture(setup: EncounterSetup, delayedForecast = false) {
  const client = createModelClient({ worker: false });
  const bridge = createModelBridge(client, {
    referenceRadius: setup.definition.briefing.referenceRadius ?? 1_000_000,
    clock: () => 0,
  });
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model: ModelPort = delayedForecast
    ? {
        ...bridge,
        async forecast(request) {
          await gate;
          return bridge.forecast(request);
        },
      }
    : bridge;
  const blackBox = createBlackBox({ clock: () => 0 });
  const game = createGameSession(setup, {
    model,
    blackBox,
    rules: bridge.rules,
    now: () => FIXED_DATE,
    clock: () => 0,
  });
  return { game, bridge, client, blackBox, release: () => release?.() };
}

const resumeCommands: readonly { readonly at: number; readonly command: Command }[] = [
  { at: 0, command: { kind: 'recorder', sampleRate: 0.1 } },
  { at: 0, command: { kind: 'point', sensor: 'camera', target: 'alpha' } },
  { at: 30, command: { kind: 'configure', configuration: 'stowed' } },
  { at: 35, command: { kind: 'burn', thruster: 'main-engine', throttle: 0.25, duration: 25 } },
  { at: 70, command: { kind: 'fly', input: { ...HANDS_ON_NEUTRAL, yaw: 0.3, pitch: 0.2 } } },
  { at: 90, command: { kind: 'fly', input: HANDS_ON_NEUTRAL } },
];

/** Saves the production state, not a substitute physical model. External commands remain explicit. */
export function checkTruthResume(setup = createGravityRange(SEED)): IntegrationCheck {
  const stepper = createTruthStepper(setup);
  const resumedStepper = createTruthStepper(setup);
  let continuous = stepper.initial;
  let resumed: GameTruthState | undefined;
  const remainingCommands = resumeCommands.filter((item) => item.at >= 37);
  const left: unknown[] = [];
  const right: unknown[] = [];
  let checkpoint: unknown;
  for (let tick = 0; tick < 120; tick++) {
    if (tick === 37) {
      resumed = jsonClone(continuous);
      checkpoint = {
        t: continuous.sim.world.t,
        activeBurns: continuous.sim.world.ship.systems.burns,
        transition: continuous.sim.world.ship.systems.transition ?? null,
        pendingCommands: remainingCommands,
        rngStreams: Object.keys(continuous.sim.world.ship.systems.rng),
        hash: hash(continuous),
      };
    }
    const commands: DueCommand[] = resumeCommands
      .filter((item) => item.at === tick)
      .map(({ command }) => ({ command, source: 'manual' }));
    const result = stepper.step(continuous, commands);
    continuous = result.state;
    if (resumed) {
      const replay = resumedStepper.step(resumed, commands);
      resumed = replay.state;
      left.push(result);
      right.push(replay);
    }
  }
  const exact = isDeepStrictEqual(continuous, resumed) && isDeepStrictEqual(left, right);
  return {
    id: 'truth-json-resume',
    status: exact ? 'pass' : 'fail',
    scope:
      'GameTruthState, ship RNG, active burn/deployment and every post-checkpoint TickResult; dt=1 s.',
    evidence: {
      checkpoint,
      finalTime: continuous.sim.world.t,
      continuedHash: hash(continuous),
      resumedHash: hash(resumed),
      tickResultsHash: hash(left),
      replayTickResultsHash: hash(right),
      exact,
      commandSource: 'manual',
      commands: resumeCommands,
      limitation:
        'The harness re-supplies the explicit remaining command schedule. This is not a full-session save/restore API.',
    },
  };
}

export async function checkWarpReplay(setup = createGravityRange(SEED)): Promise<IntegrationCheck> {
  const direct = fixture(setup);
  const batched = fixture(setup);
  const commands: readonly { readonly at: number; readonly command: Command }[] = [
    { at: 0, command: { kind: 'burn', thruster: 'main-engine', throttle: 0.25, duration: 7 } },
    { at: 60, command: { kind: 'configure', configuration: 'stowed' } },
    { at: 120, command: { kind: 'recorder', sampleRate: 0.1 } },
  ];
  try {
    await Promise.all([direct.bridge.settled(), batched.bridge.settled()]);
    direct.game.setPaused(false);
    batched.game.setPaused(false);
    for (const warp of [1, 10, 60]) {
      const at = direct.game.status().t;
      for (const item of commands.filter((item) => item.at === at)) {
        direct.game.command(item.command);
        batched.game.command(item.command);
      }
      direct.game.stepTicks(60);
      batched.game.setWarp(warp);
      for (let frame = 0; frame < 60 / warp; frame++) batched.game.advance(1);
      // Both clients see exactly the same records at the same deterministic boundary.
      await Promise.all([direct.bridge.settled(), batched.bridge.settled()]);
    }
    const exactTruth = isDeepStrictEqual(direct.game.truth(), batched.game.truth());
    const exactRecords = isDeepStrictEqual(direct.blackBox.archive(), batched.blackBox.archive());
    const exactModel = isDeepStrictEqual(direct.bridge.state(), batched.bridge.state());
    const modelErrors = [direct.bridge.lastError() ?? null, batched.bridge.lastError() ?? null];
    return {
      id: 'warp-batching',
      status:
        exactTruth && exactRecords && exactModel && modelErrors.every((error) => error === null)
          ? 'pass'
          : 'fail',
      scope:
        'Production session, real Black Box/model; 180 fixed ticks grouped at 1x, 10x and 60x.',
      evidence: {
        exactTruth,
        exactRecords,
        exactModel,
        finalTime: direct.game.status().t,
        directHash: hash(direct.game.truth()),
        batchedHash: hash(batched.game.truth()),
        recordHash: hash(direct.blackBox.archive()),
        modelHash: hash(direct.bridge.state()),
        commands,
        settleAt: [0, 60, 120, 180],
        realFrameSeconds: 1,
        clock:
          'All injected millisecond clocks are fixed at 0; handover is explicitly settled at command boundaries.',
        modelErrors,
      },
    };
  } finally {
    direct.client.terminate();
    batched.client.terminate();
  }
}

async function operationChecks(setup: EncounterSetup): Promise<IntegrationCheck[]> {
  const f = fixture(setup);
  const checks: IntegrationCheck[] = [];
  const { game, bridge } = f;
  const desk = new Desk(game, bridge.lastError);
  async function operate(id: string, scope: string, action: () => unknown): Promise<void> {
    const before = game.status().t;
    let result: unknown;
    let error: string | null = null;
    try {
      result = action();
    } catch (e) {
      error = errorText(e);
    }
    const ticksWhilePending = game.advance(1);
    try {
      await result;
    } catch (e) {
      error = errorText(e);
    }
    const executed = game.lastTick()?.executed ?? [];
    const commandsAccepted = executed.every((item) => item.status !== 'rejected');
    checks.push({
      id,
      status: ticksWhilePending === 1 && !error && commandsAccepted ? 'pass' : 'fail',
      scope,
      evidence: {
        before,
        after: game.status().t,
        ticksWhilePending,
        operationError: error,
        executed,
      },
    });
  }
  try {
    await bridge.settled();
    // Two short, disjoint completed records make comparison and rule-test controls available.
    for (let attempt = 0; attempt < 2; attempt++) {
      game.stepTicks(600);
      game.recall();
      await bridge.settled();
    }
    game.setPaused(false);
    game.stepTicks(120);
    await bridge.settled();

    const views = ['ROOM', 'MAP', 'SHIP', 'FLIGHT'] as const;
    for (const view of views)
      await operate(
        `a12-view-${view.toLowerCase()}`,
        `${view} read path through GameControls; not a browser navigation test.`,
        () => {
          if (view === 'MAP') game.chart();
          else game.snapshot();
        },
      );
    const pages: readonly PageId[] = ['mission', 'plan', 'model', 'blackbox', 'systems'];
    for (const page of pages)
      await operate(
        `a12-console-${page}`,
        `Desk.setPage('${page}') and its production session read path.`,
        () => {
          desk.setPage(page);
          if (page === 'blackbox') game.blackBox.archive();
          else if (page === 'model') game.model.state();
          else game.snapshot();
        },
      );
    await operate('a12-design-edit', 'Mission design edit in the production Desk.', () =>
      desk.setDesign({ evidence: 'probe' }),
    );
    await operate(
      'a12-design-apply',
      'Mission configuration commands through Desk.commitDesign.',
      () => desk.commitDesign(),
    );
    await operate('a12-configuration', 'Configuration command while the encounter advances.', () =>
      game.command({ kind: 'configure', configuration: 'stowed' }),
    );
    await operate('a12-equipment', 'Power and pointing edits while the encounter advances.', () => {
      game.command({ kind: 'power', equipment: 'camera', allocation: 120 });
      game.command({ kind: 'point', sensor: 'camera', target: 'beta' });
    });
    await operate(
      'a12-comparison',
      'Compare independent recorded attempts through Desk and session.',
      () => desk.setCompare(['attempt-0001', 'attempt-0002']),
    );
    await operate(
      'a12-diagnostics',
      'Real model diagnostics request; tick while its promise is pending.',
      () => game.rules!.report(),
    );
    await operate(
      'a12-fit-handover',
      'Real model accepts acquired data and refreshes via settled().',
      () => bridge.settled(),
    );
    await operate(
      'a12-rule-test',
      'Rule test with disjoint completed attempts; no adoption claim from short records.',
      () => game.rules!.test('distance-law', ['attempt-0001'], 'attempt-0002'),
    );
    await operate('a12-preview', 'Real preview request while the encounter advances.', () =>
      game.preview({ items: [] }),
    );
    const ship = game.snapshot().world.ship;
    const procedure: Procedure = {
      id: 'harness-integration-coast',
      name: 'Integration coast',
      origin: { attemptId: game.status().attemptId, t: game.status().t },
      condition: {
        encounterId: game.briefing.id,
        configuration: game.ship.defaultConfiguration,
        position: ship.position,
        velocity: ship.velocity,
        positionCov: ship.positionCov,
        attitude: ship.attitude,
        tolerance: { position: 0, velocity: 0, attitude: 0 },
      },
      items: [],
    };
    await operate(
      'a12-procedure-save',
      'Production Black Box procedure archive write during flight.',
      () => game.blackBox.saveProcedure(procedure),
    );
    await operate(
      'a12-procedure-remove',
      'Production Black Box procedure archive delete during flight.',
      () => game.blackBox.removeProcedure(procedure.id),
    );
    await bridge.settled();
    checks.push({
      id: 'operation-model-health',
      status: bridge.lastError() ? 'fail' : 'pass',
      scope:
        'The operation fixture uses the production estimator and actual recorded measurements.',
      evidence: {
        modelError: bridge.lastError() ?? null,
        records: game.blackBox.archive().attempts.length,
      },
    });
    return checks;
  } finally {
    f.client.terminate();
  }
}

async function commitHoldCheck(setup: EncounterSetup): Promise<IntegrationCheck> {
  const f = fixture(setup, true);
  try {
    f.game.setPaused(false);
    f.game.advance(120);
    await f.bridge.settled();
    const before = f.game.status().t;
    const pending = f.game.commit({ name: 'A12 delayed forecast fixture', items: [] });
    const committing = f.game.status().committing;
    const ticksWhilePending = f.game.advance(1);
    const after = f.game.status().t;
    f.release();
    const forecast = await pending;
    const resumes = f.game.advance(1);
    return {
      id: 'a12-commit',
      status: ticksWhilePending >= 1 ? 'pass' : 'blocked',
      scope:
        'An unresolved real-model forecast is held by a fixture latch; production advance is called while COMMIT is pending.',
      evidence: {
        before,
        after,
        committing,
        ticksWhilePending,
        ticksAfterRelease: resumes,
        forecastFrozen: Object.isFrozen(forecast),
        forecastHorizon: forecast.horizon,
        dependency:
          ticksWhilePending >= 1
            ? null
            : '2F: src/game/session.ts advance returns zero while committing; A12 active encounter hold.',
        limitation:
          'This isolates an asynchronous state hold. It does not measure synchronous worker CPU or browser frame scheduling.',
      },
    };
  } finally {
    f.release();
    f.client.terminate();
  }
}

async function truthIndependenceCheck(setup: EncounterSetup): Promise<IntegrationCheck> {
  const altered: EncounterSetup = {
    ...setup,
    definition: {
      ...setup.definition,
      world: {
        ...setup.definition.world,
        law: { ...setup.definition.world.law, exponent: 3 },
        bodies: setup.definition.world.bodies.map((body) => ({ ...body, gm: body.gm * 3 })),
      },
    },
  };
  const one = fixture(setup);
  const two = fixture(altered);
  try {
    const [a, b] = await Promise.all([
      one.game.preview({ items: [] }),
      two.game.preview({ items: [] }),
    ]);
    const exact = isDeepStrictEqual(a, b);
    return {
      id: 'forecast-truth-independence',
      status: exact ? 'pass' : 'fail',
      scope:
        'Same briefing, no acquired measurements, same requested coast; hidden truth law/masses differ.',
      evidence: {
        exact,
        forecastHashes: [hash(a), hash(b)],
        truthHashes: [hash(one.game.truth()), hash(two.game.truth())],
        changedTruth: 'exponent 2.5 to 3; every true massive-body GM multiplied by 3',
        limitation:
          'A metamorphic boundary check at arrival; does not replace P11 import lint or downstream field-specific tests.',
      },
    };
  } finally {
    one.client.terminate();
    two.client.terminate();
  }
}

function alertClassificationCheck(): IntegrationCheck {
  const caution = { id: 'integration-contact', level: 'caution', text: 'fixture' } as const;
  const warning = { ...caution, level: 'warning' } as const;
  const advisory = { id: 'horizon', level: 'advisory', text: 'fixture' } as const;
  const first = freshAlerts(new Set(), [caution]);
  const evidence = {
    freshCaution: first.fresh.length,
    repeatedCaution: freshAlerts(first.active, [caution]).fresh.length,
    worsenedWarning: freshAlerts(first.active, [warning]).fresh.length,
    freshAdvisory: freshAlerts(new Set(), [advisory]).fresh.length,
  };
  return {
    id: 'a12-alert-classification',
    status:
      evidence.freshCaution === 1 &&
      evidence.repeatedCaution === 0 &&
      evidence.worsenedWarning === 1 &&
      evidence.freshAdvisory === 0
        ? 'pass'
        : 'fail',
    scope: 'Production freshAlerts classification only; browser warp response is not executed.',
    evidence,
  };
}

export async function runIntegrationChecks() {
  const range = createGravityRange(SEED);
  const operationSetup = { ...range, play: { ...range.play, forecastSpan: 120 } };
  const checks: IntegrationCheck[] = [
    checkTruthResume(range),
    await checkWarpReplay(range),
    ...(await operationChecks(operationSetup)),
    await commitHoldCheck(operationSetup),
    await truthIndependenceCheck(operationSetup),
    alertClassificationCheck(),
    {
      id: 'full-session-save-resume',
      status: 'blocked',
      scope: 'Physical and evidence state restored together mid-flight.',
      evidence: {
        dependency:
          '3D/2F: no production whole-session restore seam is delivered. Black Box reload closes the in-progress attempt as recalled.',
      },
    },
    {
      id: 'a12-browser-shell',
      status: 'blocked',
      scope: 'All screen navigation, hidden-page no-edit enforcement and new-alert warp response.',
      evidence: {
        dependency:
          'Browser integration fixture required for src/app/loop.ts; headless Desk/API calls do not mount or navigate the shell.',
      },
    },
    {
      id: 'a12-adopt-revoke',
      status: 'blocked',
      scope: 'Successful rule adoption/revocation during active flight.',
      evidence: {
        dependency:
          'Use a completed validated learning run; the short operation fixture does not fabricate a passing rule.',
      },
    },
    {
      id: 'a12-sustainable-transit',
      status: 'blocked',
      scope: 'Indefinite safe preparation with actual power/thermal/resource evolution.',
      evidence: {
        dependency:
          '3A/3D transit provider and supported sustainable envelope; the Gravity range ENTER hold is not transit.',
      },
    },
  ];
  return {
    seed: SEED,
    resolutionSeconds: range.definition.dt,
    timestampPolicy: FIXED_DATE,
    fixture: {
      production: [
        'createGameSession',
        'createTruthStepper',
        'createModelBridge/createModelClient',
        'createBlackBox',
        'Desk',
        'freshAlerts',
      ],
      operationForecastSpanSeconds: 120,
      inputKnowledge:
        'Authored Gravity range briefing only; two 600-second coast records for comparison/rule controls.',
      acquisition:
        'Production arrival recorder/camera commands; later explicit design, power, point and recorder operations.',
      limitation:
        'Short integration fixtures establish API behavior, not route success, sustainable transit, UI comprehension or successful science.',
    },
    checks,
  };
}
