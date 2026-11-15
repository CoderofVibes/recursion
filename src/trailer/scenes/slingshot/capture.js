/* global window, setTimeout, fetch */
// Run through rig/capture.mjs on this dev origin, in NIGHT's disposable capture profile.
// The flown route is src/content/gravity-range/slingshot.test.ts's successful hands-on tape.
(async () => {
  const { createGame } = await import('/src/app/game.ts');
  const { burnDuration } = await import('/src/game/belief/maneuver.ts');
  const { HANDS_ON_NEUTRAL } = await import('/src/contracts/commands.ts');
  const { fromYaw } = await import('/src/lib/quat.ts');
  const { sub } = await import('/src/lib/vec3.ts');
  // A prior flown pass supplies an informed look direction; the next run really turns to it.
  const prior = await (await fetch('/src/trailer/scenes/slingshot/fixture.json')).json();
  const aim =
    prior.provenance.lookDirection ??
    prior.frames
      .find((frame) => frame.t === 108000)
      .window.objects.find((object) => object.id === 'beta').direction;
  await (await createGame('gravity-range')).erase();
  const game = (await createGame('gravity-range')).controls;
  game.setPaused(true);
  const inputs = [];
  const wait = () => new Promise((resolve) => setTimeout(resolve, 0));
  const advance = async (until) => {
    while (game.status().t < until) {
      const n = Math.min(200, until - game.status().t);
      if (game.stepTicks(n) !== n)
        throw new Error(
          `Flight ended at ${game.status().t}: ${JSON.stringify(game.status().outcome)}`,
        );
      window.__tvCapture = { scene: 'slingshot', t: game.status().t, until };
      await wait();
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  };
  const command = (value) => {
    inputs.push({ t: game.status().t, command: value });
    game.command(value);
  };
  const fly = (input) => {
    inputs.push({ t: game.status().t, fly: input });
    game.fly(input);
  };
  const mass = game.snapshot().world.ship.massProperties.mass;
  const quarter = burnDuration(game.ship, mass, 13.797 / 0.973, 'main-engine', 0.25);
  const seconds = Math.round(quarter);
  const start = 3960 - Math.round(seconds / 2);
  const alongAlpha = () => {
    const w = game.snapshot().world;
    command({
      kind: 'attitude',
      target: {
        reference: 'direction',
        direction: sub(w.ship.velocity, w.bodies.find((b) => b.id === 'alpha').velocity),
      },
    });
  };
  const facingSun = () =>
    command({
      kind: 'attitude',
      target: { reference: 'direction', direction: game.snapshot().window.sun.direction },
    });
  await advance(start - 480);
  alongAlpha();
  await advance(start - 10);
  alongAlpha();
  await advance(start);
  fly({ ...HANDS_ON_NEUTRAL, throttle: (0.25 * quarter) / seconds });
  await advance(start + seconds);
  fly(HANDS_ON_NEUTRAL);
  command({ kind: 'configure', configuration: 'solar' });
  facingSun();
  await advance(79420);
  const v = game.snapshot().world.ship.velocity;
  command({
    kind: 'attitude',
    target: { reference: 'inertial', attitude: fromYaw(Math.atan2(v.y, v.x)) },
  });
  await advance(80020);
  fly({ ...HANDS_ON_NEUTRAL, translate: { x: 0, y: 0, z: 1 } });
  await advance(80060);
  fly(HANDS_ON_NEUTRAL);
  facingSun();
  await advance(95000);
  command({ kind: 'attitude', target: { reference: 'direction', direction: aim } });
  const frames = [];
  let template;
  for (let t = 97200; t <= 117000; t += 600) {
    await advance(t);
    const snapshot = game.snapshot();
    template ??= { ...snapshot, forecasts: [], trail: [], coverageEarlier: [] };
    frames.push({ t, attitude: snapshot.world.ship.attitude, window: snapshot.window });
  }
  return {
    provenance: {
      build: '93b555c35f5deae18f7258013351e974de2fbbda',
      region: 'gravity-range',
      run: 0,
      from: frames[0].t,
      to: frames.at(-1).t,
      interval: 600,
      source:
        'Real game session, full production model. Ordinary GameControls commands and hands-on fly inputs; no world assignments. Route adapted from slingshot.test.ts; at T+95000 a real RCS turn faces Beta’s T+108000 bearing measured on the preceding pass.',
      inputs,
      lookDirection: aim,
    },
    template,
    frames,
  };
})();
