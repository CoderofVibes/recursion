/**
 * BELIEF side (no truth imports). The chart the MAP shows (contracts `chart.ts`): only what
 * the ship has charted, built from the briefing, the model's state and Black Box.
 *
 * For now the expedition is one encounter, so the chart is one region at its own origin, with
 * no corridors. Leads are the archive's leads that carry a bearing.
 */

import type {
  BlackBoxArchive,
  Chart,
  ChartLead,
  ChartRegion,
  EncounterBriefing,
  ModelState,
} from '../../contracts/index.ts';

/**
 * Radius of the space the encounter covers: the distance its `depart` objective is judged at,
 * or, without one, the farthest briefed body's surface from the first body.
 */
function regionRadius(briefing: EncounterBriefing): number {
  let depart = 0;
  for (const objective of briefing.objectives)
    if (objective.depart) depart = Math.max(depart, objective.depart.beyond);
  if (depart > 0) return depart;
  const origin = briefing.knownBodies[0]?.position ?? { x: 0, y: 0, z: 0 };
  let farthest = 0;
  for (const body of briefing.knownBodies)
    farthest = Math.max(
      farthest,
      Math.hypot(
        body.position.x - origin.x,
        body.position.y - origin.y,
        body.position.z - origin.z,
      ) + body.radius,
    );
  return farthest;
}

/**
 * Survey coverage, 0 to 1: the share of what is there that the model has measured. Each
 * briefed body counts once its pull has been measured at some distance (the model's data
 * support names it), and the rule the place has to teach counts as one more once the player
 * has adopted a rule.
 */
function surveyed(briefing: EncounterBriefing, state: ModelState): number {
  const bodies = briefing.knownBodies;
  const measured = bodies.filter((b) => (state.support.distance[b.id]?.length ?? 0) > 0).length;
  const ruled = state.extensions.some((e) => e.status === 'adopted') ? 1 : 0;
  return (measured + ruled) / (bodies.length + 1);
}

/** The chart as it stands: this encounter's region, and the leads that have a bearing. */
export function buildChart(
  briefing: EncounterBriefing,
  state: ModelState,
  archive: BlackBoxArchive,
): Chart {
  const region: ChartRegion = {
    id: briefing.id,
    name: briefing.name.toUpperCase(),
    position: { x: 0, y: 0, z: 0 },
    radius: regionRadius(briefing),
    surveyed: surveyed(briefing, state),
    current: true,
    attempts: archive.attempts
      .filter((a) => a.encounterId === briefing.id)
      .map((a) => ({ index: a.index, outcome: a.outcome.kind })),
  };
  const leads: ChartLead[] = [];
  for (const lead of archive.leads) {
    const bearing = lead.bearing;
    if (!bearing) continue;
    const length = Math.hypot(bearing.direction.x, bearing.direction.y, bearing.direction.z);
    if (!(length > 0)) continue;
    leads.push({
      id: lead.id,
      name: lead.name,
      from: bearing.from,
      direction: {
        x: bearing.direction.x / length,
        y: bearing.direction.y / length,
        z: bearing.direction.z / length,
      },
      spread: bearing.spread,
    });
  }
  return { regions: [region], corridors: [], leads };
}
