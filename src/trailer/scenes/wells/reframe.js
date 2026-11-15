/* global setTimeout */
// Evaluate in the trailer's origin. Reproduce the same coast; offset ONLY the display eye.
(async () => {
  const { createGame } = await import('/src/app/game.ts');
  const { INVERSE_WELLS_ENTRY } = await import('/src/content/inverse-wells/index.ts');
  const { createFunnelWindow } = await import('/src/game/funnel-window.ts');
  const { buildWindowView } = await import('/src/game/window.ts');
  const { readFunnelParameters } = await import('/src/sim/fields/wells.ts');
  const { rotate } = await import('/src/lib/quat.ts');
  const { addScaled } = await import('/src/lib/vec3.ts');
  // This is NIGHT's isolated capture profile, never the owner's play profile.
  await (await createGame('inverse-wells')).erase();
  const game = (await createGame('inverse-wells')).controls;
  game.setPaused(true);
  while (game.status().t < 1238) {
    const n = Math.min(200, 1238 - game.status().t);
    if (game.stepTicks(n) !== n) throw new Error('Capture flight ended');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const snapshot = game.snapshot();
  const truth = game.truth().sim.world;
  const original = truth.ship.kinematics;
  const eye = addScaled(original.position, rotate(original.attitude, { x: 1, y: 0, z: 0 }), 400000);
  const displayed = {
    ...truth,
    ship: { ...truth.ship, kinematics: { ...original, position: eye } },
  };
  // Run 0 selects catalogue 22000 explicitly; the default factory selects a catalogue by seed.
  // The precursor birth table must come from this same encounter setup as the played field.
  const setup = INVERSE_WELLS_ENTRY.create(0);
  const optics = createFunnelWindow(setup)(displayed);
  const ids = new Set(optics.map((field) => field.id));
  return {
    provenance: {
      build: '93b555c35f5deae18f7258013351e974de2fbbda',
      region: 'inverse-wells',
      run: 0,
      attempt: game.status().attemptId,
      t: 1238,
      dt: 1,
      inputs:
        'Fresh game; coast 1238 exact GameSession ticks; no burns. Display eye staged 400 km along the ship forward axis for field framing.',
      source:
        'Real committed field through VX createFunnelWindow and buildWindowView, from the staged eye. No site position, axis, shape, lifecycle or light modified.',
      stagedEye: eye,
      realEye: original.position,
    },
    snapshot: {
      ...snapshot,
      trail: [],
      forecasts: [],
      coverageEarlier: [],
      window: { ...buildWindowView(displayed, setup.play.windowMinAngularRadius), fields: optics },
    },
    geometry: truth.fields
      .filter((field) => ids.has(field.id))
      .map((field) => ({ id: field.id, ...readFunnelParameters(field) })),
    shipKinematics: displayed.ship.kinematics,
  };
})();
