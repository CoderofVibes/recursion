/**
 * BELIEF side (no truth imports). How a `depart` objective stands, as the ship believes it (S20,
 * R17): the screens show this, never the truth the objective is judged on.
 *
 * - **distance** from the bodies' believed centre of mass, against the gate (`beyond`);
 * - **speed** relative to that centre, and its **outward** part, against `minSpeed`: the speed
 *   the rule judges, not the speed relative to Alpha that FLIGHT shows;
 * - **gauged Δv**: what the propellant gauges say the engines have given since arrival (the
 *   rocket equation on each tank's drop, at the nominal specific impulse of what it feeds). It
 *   includes RCS spent turning and the learning burns the rule leaves out (A18 (3)), so it is an
 *   upper bound on what the rule counts against `maxDeltaV`;
 * - **closest** believed approach to each body so far, sampled with the power gauges;
 * - **status**: the ship's own verdict once the objective is judged (its `objective` event).
 *
 * The centre of mass weights the bodies by the model's current μ estimates, or the briefing's
 * priors before the model has any.
 */

import type {
  BelievedWorld,
  BodyId,
  Objective,
  ObjectiveId,
  ParameterEstimate,
  ParameterPrior,
  ShipDefinition,
} from '../../contracts/index.ts';

const G0 = 9.80665;

export interface DepartureProgress {
  readonly objective: ObjectiveId;
  readonly status: 'pending' | 'reached' | 'missed';
  /** From the bodies' believed centre of mass, m; the gate. */
  readonly distance: number;
  readonly beyond: number;
  /** Relative to that centre, m/s: the speed, its outward part, and the minimum. */
  readonly speed: number;
  readonly outward: number;
  readonly minSpeed: number;
  /** Δv by the propellant gauges since arrival, m/s (an upper bound on what is counted). */
  readonly gaugedDeltaV: number;
  readonly maxDeltaV?: number;
  /** Closest believed approach to each body's centre so far, m. */
  readonly closest: Readonly<Record<BodyId, number>>;
}

/** What the believed side keeps between samples. Plain data. */
export interface DepartureTrack {
  readonly gaugedDeltaV: number;
  readonly propellant?: Readonly<Record<string, number>>;
  readonly closest: Readonly<Record<BodyId, number>>;
  readonly verdicts: Readonly<Record<ObjectiveId, 'reached' | 'missed'>>;
}

export const initialDepartureTrack: DepartureTrack = { gaugedDeltaV: 0, closest: {}, verdicts: {} };

/** Each body's weight: the model's μ, else the briefing's prior, else 1. */
export function bodyWeights(
  world: BelievedWorld,
  estimates: readonly (ParameterEstimate | ParameterPrior)[],
): Record<BodyId, number> {
  const out: Record<BodyId, number> = {};
  for (const b of world.bodies) {
    const mu = estimates.find((p) => p.id === `body.${b.id}.mu`)?.value;
    out[b.id] = mu !== undefined && mu > 0 ? mu : 1;
  }
  return out;
}

/** Specific impulse of whatever each tank feeds, s, from the design. */
function tankIsp(definition: ShipDefinition): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tank of definition.tanks) {
    for (const id of tank.feeds) {
      const isp = definition.equipment.find((e) => e.id === id)?.params.isp;
      if (isp !== undefined && isp > 0) {
        out[tank.id] = isp;
        break;
      }
    }
  }
  return out;
}

/** One sample: the gauges' drop since the last one as Δv, and the closest approaches. */
export function trackDeparture(
  track: DepartureTrack,
  world: BelievedWorld,
  definition: ShipDefinition,
): DepartureTrack {
  const ship = world.ship;
  const isp = tankIsp(definition);
  const propellant: Record<string, number> = {};
  let dv = 0;
  const mass = ship.massProperties.mass;
  for (const id of Object.keys(isp)) {
    const now = ship.propellant[id]?.mean;
    if (now === undefined) continue;
    propellant[id] = now;
    const before = track.propellant?.[id];
    if (before !== undefined && before > now && mass > 0)
      // The rocket equation over the drop, from the mass before it.
      dv += isp[id]! * G0 * Math.log((mass + (before - now)) / mass);
  }
  const closest: Record<BodyId, number> = { ...track.closest };
  for (const b of world.bodies) {
    const d = Math.hypot(
      ship.position.x - b.position.x,
      ship.position.y - b.position.y,
      ship.position.z - b.position.z,
    );
    if (!(d >= (closest[b.id] ?? Infinity))) closest[b.id] = d;
  }
  return { ...track, gaugedDeltaV: track.gaugedDeltaV + dv, propellant, closest };
}

/** The ship's verdict on an objective, from its `objective` event. */
export function recordVerdict(
  track: DepartureTrack,
  objective: ObjectiveId,
  status: 'reached' | 'missed',
): DepartureTrack {
  if (track.verdicts[objective]) return track;
  return { ...track, verdicts: { ...track.verdicts, [objective]: status } };
}

/** How a depart objective stands now, as believed. Undefined for other objectives. */
export function departureProgress(
  objective: Objective,
  world: BelievedWorld,
  weights: Readonly<Record<BodyId, number>>,
  track: DepartureTrack,
): DepartureProgress | undefined {
  if (!objective.depart) return undefined;
  let m = 0;
  const c = { x: 0, y: 0, z: 0 };
  const v = { x: 0, y: 0, z: 0 };
  for (const b of world.bodies) {
    const w = weights[b.id] ?? 1;
    m += w;
    c.x += w * b.position.x;
    c.y += w * b.position.y;
    c.z += w * b.position.z;
    v.x += w * b.velocity.x;
    v.y += w * b.velocity.y;
    v.z += w * b.velocity.z;
  }
  if (m > 0) {
    c.x /= m;
    c.y /= m;
    c.z /= m;
    v.x /= m;
    v.y /= m;
    v.z /= m;
  }
  const s = world.ship;
  const r = { x: s.position.x - c.x, y: s.position.y - c.y, z: s.position.z - c.z };
  const u = { x: s.velocity.x - v.x, y: s.velocity.y - v.y, z: s.velocity.z - v.z };
  const distance = Math.hypot(r.x, r.y, r.z);
  const speed = Math.hypot(u.x, u.y, u.z);
  const outward = distance > 0 ? (r.x * u.x + r.y * u.y + r.z * u.z) / distance : 0;
  return {
    objective: objective.id,
    status: track.verdicts[objective.id] ?? 'pending',
    distance,
    beyond: objective.depart.beyond,
    speed,
    outward,
    minSpeed: objective.depart.minSpeed,
    gaugedDeltaV: track.gaugedDeltaV,
    ...(objective.maxDeltaV !== undefined ? { maxDeltaV: objective.maxDeltaV } : {}),
    closest: track.closest,
  };
}
