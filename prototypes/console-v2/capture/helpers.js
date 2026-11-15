// Installed into the dev build's page: reduced dumps of real game state for the layout mockups.
(() => {
  const R = () => window.__recursion;
  const v = (p) => [p.x, p.y, p.z ?? 0];
  const slim = (f) =>
    f && {
      id: f.id,
      issuedAt: f.issuedAt,
      modelVersion: f.modelVersion,
      horizon: f.horizon,
      samples: f.samples.map((s) => ({
        t: s.t,
        p: v(s.position),
        v: v(s.velocity),
        cov: s.positionCov,
        x: s.extrapolating,
        val: !!s.validated,
      })),
      objects: f.objects.map((o) => ({
        id: o.id,
        samples: o.samples.map((s) => ({ t: s.t, p: v(s.position) })),
      })),
      closestApproaches: f.closestApproaches,
      sigma: f.detail?.sigmaMajor,
      detail: f.detail && {
        presentSource: f.detail.presentSource,
        presentTime: f.detail.presentTime,
        presentBody: f.detail.presentBody,
        presentAge: f.detail.presentAge,
        stale: f.detail.stale,
        asteroids: f.detail.asteroids,
      },
      plan: f.inputs?.plan,
    };
  const world = (s) => ({
    t: s.t,
    ship: s.world.ship,
    bodies: s.world.bodies.map((b) => ({ ...b, p: v(b.position), vel: v(b.velocity) })),
    asteroids: s.world.asteroids.map((a) => ({
      id: a.id,
      p: v(a.position),
      radius: a.radius,
      tracked: a.tracked,
    })),
    objectives: s.objectives,
    trail: s.trail.map((p) => ({ t: p.t, p: v(p.position) })),
    forecasts: s.forecasts.map(slim),
    shipView: s.ship,
  });
  const series = () => Object.fromEntries([...R().desk.series.entries()]);
  window.__d = {
    slim,
    A: () => {
      const { game, desk } = R();
      return JSON.stringify({
        briefing: game.briefing,
        shipDef: game.ship,
        status: game.status(),
        design: desk.design,
        world: world(desk.snapshot()),
        preview: slim(desk.preview),
        model: game.model.state(),
      });
    },
    B: () => {
      const { game, desk } = R();
      return JSON.stringify({
        status: game.status(),
        world: world(game.snapshot()),
        miss: desk.flightMiss,
        alerts: desk.flightAlerts,
        series: series(),
      });
    },
    C: async () => {
      const { game, desk } = R();
      const mission = await import('/src/console/mission.ts');
      const bb = await import('/src/blackbox/index.ts');
      const archive = game.blackBox.archive();
      const bodies = game.snapshot().world.bodies;
      const attempts = archive.attempts.map((a) => {
        let debrief = null;
        let divergence = null;
        try {
          debrief = mission.debrief(a, archive, bodies);
          divergence = a.forecasts.map((f) => {
            const d = bb.forecastDivergence(f, a);
            return { forecast: f.id, ...d };
          });
        } catch (e) {
          debrief = { error: String(e) };
        }
        return {
          id: a.id,
          index: a.index,
          outcome: a.outcome,
          measurements: a.measurements.length,
          forecasts: a.forecasts.map(slim),
          commands: a.commands,
          debrief,
          divergence,
        };
      });
      const done = archive.attempts.filter((a) => a.outcome.kind !== 'in-progress');
      let compare = null;
      if (done.length >= 2) {
        desk.setCompare([done[0].id, done[1].id]);
        const c = game.snapshot().compare;
        compare = c?.map((o) => ({
          attemptId: o.attemptId,
          label: o.label,
          trail: o.trail.map((p) => ({ t: p.t, p: v(p.position) })),
          forecast: slim(o.forecast),
        }));
        desk.setCompare(undefined);
      }
      const test = desk.tests.get('distance-law');
      return JSON.stringify({
        status: game.status(),
        model: game.model.state(),
        report: desk.report,
        test,
        attempts,
        compare,
        extensionTests: archive.extensionTests,
        procedures: archive.procedures,
      });
    },
    D: () => {
      const { game, desk } = R();
      return JSON.stringify({
        status: game.status(),
        world: world(desk.snapshot()),
        preview: slim(desk.preview),
        model: game.model.state(),
      });
    },
  };
  return 'helpers installed';
})();
