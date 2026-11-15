/* global setTimeout */
// A fresh coasting encounter, through the production GameSession and its real terminal event.
(async () => {
  const { createGame } = await import('/src/app/game.ts');
  const { CHAIN_LINK_ENTRY } = await import('/src/content/chain-link/index.ts');
  await (await createGame('chain-link')).erase();
  const game = (await createGame('chain-link')).controls;
  game.setPaused(true);
  const frames = [];
  while (game.status().outcome.kind === 'in-progress' && game.status().t < 400) {
    game.stepTicks(5);
    if (game.status().t > 220) {
      const s = game.snapshot();
      frames.push({
        t: s.t,
        attitude: s.world.ship.attitude,
        window: s.window,
        position: game.truth().sim.world.ship.kinematics.position,
      });
    }
    if (frames.length % 10 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  const template = game.snapshot();
  return {
    provenance: {
      build: '93b555c35f5deae18f7258013351e974de2fbbda',
      region: 'chain-link',
      run: 0,
      inputs: 'Fresh attempt, no commands: coast through GameSession.stepTicks(5), dt=0.1 s.',
      lossAt: game.status().t,
      outcome: game.status().outcome,
      source:
        'Real rock optics and terminal event. Truth layout is retained separately for the explicitly staged hologram; R46 is not present on this source build.',
    },
    template: { ...template, trail: [], forecasts: [], coverageEarlier: [] },
    frames: frames.slice(-40),
    layers: CHAIN_LINK_ENTRY.create(0).layout.layers,
  };
})();
