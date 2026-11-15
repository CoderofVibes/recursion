/**
 * What the MAP's plate says about a charted region: only what the ship holds (DECISIONS A8;
 * brief §1: the exit is never labelled). The chart itself is the game's (`GameControls.chart()`,
 * drawn through `chartView` in src/view3d/adapter.ts).
 */
import type { BlackBoxArchive, ViewSnapshot } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import { deltaV } from './data.ts';
import { dist, fixed, whole } from './format.ts';

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
