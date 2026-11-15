/**
 * S9: deterministic physical timing and arithmetic, not a playtest or model validation.
 * Run from this worktree: node tools/studies/s9/timing.mjs
 * Uses the repository's installed Vite to load its TypeScript and JSON unchanged.
 * Writes timing-vectors.json next to this file. No browser, source edits or downloads.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const reviewedSourceCommit = '55d91c30fc715a92af116dcd35c085fcbf6667ca';
// Documentation-only commits do not change these vectors. Refuse changed simulation inputs
// instead of silently attaching old review provenance to a new game implementation.
execFileSync('git', ['diff', '--quiet', reviewedSourceCommit, '--', 'src', 'data'], { cwd: root });
const tree = (path) => execFileSync('git', ['rev-parse', `${reviewedSourceCommit}:${path}`], { cwd: root, encoding: 'utf8' }).trim();
const server = await createServer({
  root,
  configFile: false,
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { createGravityRange, LAW, SEED } = await server.ssrLoadModule('/src/content/gravity-range/index.ts');
  const { createStandInModel } = await server.ssrLoadModule('/src/game/belief/standin-model.ts');
  const { createBlackBox } = await server.ssrLoadModule('/src/game/belief/blackbox.ts');
  const { createGameSession } = await server.ssrLoadModule('/src/game/session.ts');
  const { burnSteps } = await server.ssrLoadModule('/src/game/belief/maneuver.ts');
  const { DEFAULT_PLAY } = await server.ssrLoadModule('/src/game/encounter.ts');
  const { lossSequence, roomMotion } = await server.ssrLoadModule('/src/theme/room.ts');
  const scenarios = [];
  for (const duration of [6.5, 12.5, 16, 41]) {
    const model = createStandInModel({ referenceRadius: LAW.referenceRadius });
    const blackBox = createBlackBox();
    const game = createGameSession(createGravityRange(), { model, blackBox, now: () => 's9-deterministic' });
    const plan = { name: `S9 retrograde ${duration} s`, items: burnSteps({ at: 400, duration, attitude: { reference: 'retrograde' } }) };
    await game.commit(plan);
    game.setPaused(false);
    let lowest = Infinity;
    let lowestAt = 0;
    for (let i = 0; i < 288; i++) {
      game.stepTicks(100);
      const w = game.truth().sim.world;
      const p = w.ship.kinematics.position;
      const a = w.bodies[0].position;
      const range = Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z);
      if (range < lowest) { lowest = range; lowestAt = game.status().t; }
      if (game.status().phase === 'ended') break;
    }
    const status = game.status();
    const record = blackBox.attempt(status.attemptId);
    scenarios.push({
      burnSeconds: duration,
      burnAtShipSeconds: 400,
      stopAtShipSeconds: status.t,
      outcome: status.outcome,
      lowestSampledAlphaRangeKm: Number((lowest / 1000).toFixed(3)),
      lowestSampledAtShipSeconds: lowestAt,
      sampleCadenceShipSeconds: 100,
      measurements: record.measurements.length,
      endWallSecondsAtDefaultWarpIgnoringCompute: status.t / DEFAULT_PLAY.warpSteps[0],
      endWallSecondsAt2000WarpIgnoringComputeOrAlerts: status.t / 2000,
    });
  }
  const vector = {
    scope: 'Physical timings on seeded planar checkpoint-1 geometry carried in 3D types. Stand-in belief model; does not establish real estimator test/adoption or browser pacing.',
    reviewedSourceCommit,
    sourceTree: tree('src'),
    dataTree: tree('data'),
    seed: SEED,
    defaultWarp: DEFAULT_PLAY.warpSteps[0],
    warpSteps: DEFAULT_PLAY.warpSteps,
    lossSequenceWallSeconds: lossSequence.end,
    viewTravelWallSeconds: roomMotion.travel,
    scenarios,
    prior2DScriptProtocol: {
      source: 'prototypes/shots/capture.mjs',
      firstDiveShipSeconds: 28800,
      secondDiveShipSeconds: 28800,
      thirdObservationShipSeconds: 15000,
      totalShipSeconds: 72600,
      totalWallSecondsAtDefaultIgnoringCompute: 72600 / DEFAULT_PLAY.warpSteps[0],
      totalWallSecondsAt2000IgnoringComputeOrAlerts: 72600 / 2000,
      caution: 'The 2D harness used burn at 300 seconds and a different release delay, direct dev APIs, two Recalls and independent setup; this is its arithmetic, not an S9 cold-player reproduction.',
    },
  };
  writeFileSync(new URL('./timing-vectors.json', import.meta.url), JSON.stringify(vector, null, 2) + '\n');
  console.log(JSON.stringify(vector, null, 2));
} finally {
  await server.close();
}
