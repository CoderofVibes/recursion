/* global window, setTimeout */
// Evaluate with rig/capture.mjs in a fresh Well Garden browser session.
// Start with the real ENTER button. No state, physics or geometry is assigned here.
(async () => {
  const game = window.__recursion.game;
  game.setPaused(true); // Only stop wall-clock advancement while capturing exact ticks.
  const before = game.status().t;
  game.stepTicks(1);
  const dt = game.status().t - before;
  if (before > 1238) throw new Error('Use a fresh attempt before T+1238');
  while (game.status().t < 1238 - dt / 2) {
    const count = Math.min(200, Math.round((1238 - game.status().t) / dt));
    if (game.stepTicks(count) !== count) throw new Error('Flight ended before capture');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const snapshot = game.snapshot();
  const ids = new Set(
    snapshot.window.fields.filter((field) => field.kind === 'funnel').map((field) => field.id),
  );
  const truth = game.truth().sim.world;
  const { readFunnelParameters } = await import('/src/sim/fields/wells.ts');
  return {
    provenance: {
      build: '93b555c35f5deae18f7258013351e974de2fbbda',
      region: 'inverse-wells',
      run: 0,
      attempt: game.status().attemptId,
      t: snapshot.t,
      dt,
      inputs:
        'Fresh run; ENTER WELL GARDEN; coast to T+1238 through GameSession.stepTicks; no burns or state edits.',
      source:
        'Live game snapshot.window from VX createFunnelWindow. Hologram geometry below is truth, staged for trailer only.',
    },
    snapshot: { ...snapshot, trail: [], forecasts: [], coverageEarlier: [] },
    geometry: truth.fields
      .filter((field) => ids.has(field.id))
      .map((field) => ({ id: field.id, ...readFunnelParameters(field) })),
    shipKinematics: truth.ship.kinematics,
  };
})();
