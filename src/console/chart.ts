/**
 * The chart the MAP shows: only what has been charted (DECISIONS A8; brief §1: the exit is never
 * labelled). For the Phase 2 playtest that is one region, the encounter the ship is in, with
 * what Black Box holds of it. Regions, corridors and leads beyond it arrive with the expedition
 * (3D, 3F); the contracts do not carry chart positions yet (see docs/handoffs/2D.md, requests).
 */
import type { BlackBoxArchive, ModelState, ViewSnapshot } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import type { Chart, ChartOutcome } from '../view3d/map/MapHolo.ts';
import { deltaV } from './data.ts';
import { dist, fixed, whole } from './format.ts';

/**
 * How much of the region is surveyed, 0 to 1: the share of its bodies whose pull the model has
 * measured at some distance, with a rule adopted counting as one more.
 */
export function surveyed(model: ModelState, bodies: number): number {
  const measured = model.calibration.filter((c) => c.distances.length > 0).length;
  const rules = model.extensions.some((e) => e.status === 'adopted') ? 1 : 0;
  return Math.min(1, (measured + rules) / Math.max(1, bodies + 1));
}

export function buildChart(game: GameControls, archive: BlackBoxArchive): Chart {
  const model = game.model.state();
  const status = game.status();
  const attempts = archive.attempts
    .filter((a) => a.encounterId === game.briefing.id && a.id !== status.attemptId)
    .map((a) => ({ index: a.index, outcome: a.outcome.kind as ChartOutcome }));
  attempts.push({
    index: status.attemptIndex,
    outcome: status.outcome.kind as ChartOutcome,
  });
  return {
    regions: [
      {
        id: game.briefing.id,
        name: game.briefing.name.toUpperCase(),
        position: [0, 0, 0],
        radius: 1,
        surveyed: surveyed(model, game.briefing.knownBodies.length),
        current: true,
        attempts,
      },
    ],
    corridors: [],
    leads: [],
  };
}

/** Facts about the charted region, for the map's plate: only what the ship holds. */
export function regionFacts(
  game: GameControls,
  archive: BlackBoxArchive,
  snapshot: ViewSnapshot,
): { label: string; value: string; tone?: 'forecast' | 'blackbox' }[] {
  const model = game.model.state();
  const here = archive.attempts.filter((a) => a.encounterId === game.briefing.id);
  const lost = here.filter((a) => a.outcome.kind === 'lost').length;
  const recalled = here.filter((a) => a.outcome.kind === 'recalled').length;
  const completed = here.filter((a) => a.outcome.kind === 'completed').length;
  const spans = Object.entries(model.support.distance).map(([body, list]) => {
    const lo = Math.min(...list.map((s) => s[0]));
    const hi = Math.max(...list.map((s) => s[1]));
    return `${body} ${Number.isFinite(lo) ? `${dist(lo)} – ${dist(hi)}` : 'none'}`;
  });
  const tracked = snapshot.world.asteroids.filter((a) => a.tracked).length;
  return [
    { label: 'objective', value: snapshot.objectives.map((o) => o.label).join(' · ') || 'none' },
    { label: 'bodies', value: snapshot.world.bodies.map((b) => b.name).join(', ') },
    {
      label: 'rocks catalogued',
      value: `${snapshot.world.asteroids.length} · ${tracked} tracked now`,
    },
    {
      label: 'attempts',
      value: `${here.length} · ${lost} lost · ${recalled} recalled · ${completed} completed`,
      tone: 'blackbox',
    },
    {
      label: 'model',
      value: `v${model.version} · ${model.extensions.filter((e) => e.status === 'adopted').length} rules adopted`,
      tone: 'forecast',
    },
    { label: 'pull measured at', value: spans.join(' · ') || 'no distances yet', tone: 'forecast' },
    {
      label: 'reach on board',
      value: `${fixed(deltaV(snapshot.world.ship, game.ship), 0)} m/s · ${whole(snapshot.world.ship.propellant['main-propellant']?.mean ?? 0)} kg`,
    },
  ];
}
