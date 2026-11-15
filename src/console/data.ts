/**
 * What the instruments show, worked out from the believed ship and the nominal design. Pure
 * functions: snapshot in, plain rows out, so panels stay layout and these stay testable.
 * Belief side (P11).
 */
import type {
  AttitudeTarget,
  BelievedShip,
  EquipmentSpec,
  Forecast,
  ForecastDraft,
  ModelState,
  Objective,
  ShipDefinition,
  ViewSnapshot,
} from '../contracts/index.ts';
import type { DepartureProgress } from '../game/belief/departure.ts';
import type { Status } from '../theme/components/index.ts';
import { distance } from '../view3d/adapter.ts';
import type { GameVec } from '../view3d/adapter.ts';
import { dist, fixed, whole } from './format.ts';

const G0 = 9.80665;

/**
 * An objective as EXPLORATION states it: its kind in a word, its name, and its conditions (S20), so
 * the player knows what the attempt is asked to do. A region to reach is given by its size and
 * how far its edge is from where the ship believes it is now.
 */
export function objectiveLine(
  objective: Objective,
  index: number,
  ship: GameVec,
): { readonly label: string; readonly text: string } {
  const o = objective;
  const label =
    o.kind === 'custom' ? `objective ${index + 1}` : o.kind === 'reach-region' ? 'reach' : o.kind;
  let text = o.label;
  if (o.kind === 'reach-region' && o.region) {
    const edge = distance(ship, o.region.center) - o.region.radius;
    text += ` · a region ${dist(2 * o.region.radius)} across, `;
    text += edge > 0 ? `${dist(edge)} from the ship` : 'around the ship';
  }
  if (o.depart)
    text += ` · ${whole(o.depart.minSpeed)} m/s from the centre of mass, beyond ${dist(o.depart.beyond)}`;
  if (o.maxDeltaV !== undefined) text += ` · at most ${fixed(o.maxDeltaV, 0)} m/s spent on leaving`;
  return { label, text };
}

/** How far the hull reaches from the centre of mass in any direction, m: the whole hull, not a point. */
export function hullReach(ship: Pick<ViewSnapshot['ship'], 'hull' | 'centerOfMass'>): number {
  const c = ship.centerOfMass;
  let reach = 0;
  for (const prism of ship.hull)
    for (const p of prism.outline)
      for (const z of [prism.zMin, prism.zMax])
        reach = Math.max(reach, Math.hypot(p.x - c.x, p.y - c.y, z - (c.z ?? 0)));
  return reach;
}

/**
 * The sensed object nearest the hull now (S8): believed position, its radius and the hull's
 * reach taken off the distance. Only what the ship senses; tracked says whether it is ranged.
 */
export function nearestClearance(
  snapshot: Pick<ViewSnapshot, 'world' | 'ship'>,
): { id: string; name: string; clearance: number; tracked: boolean } | null {
  const ship = snapshot.world.ship.position;
  const reach = hullReach(snapshot.ship);
  let best: { id: string; name: string; clearance: number; tracked: boolean } | null = null;
  const consider = (
    id: string,
    name: string,
    at: typeof ship,
    radius: number,
    tracked: boolean,
  ) => {
    const clearance = distance(ship, at) - radius - reach;
    if (!best || clearance < best.clearance) best = { id, name, clearance, tracked };
  };
  for (const b of snapshot.world.bodies) consider(b.id, b.name, b.position, b.radius, b.tracked);
  for (const a of snapshot.world.asteroids)
    consider(a.id, a.id.toUpperCase(), a.position, a.radius, a.tracked);
  return best;
}

/** A `depart` objective's standing as the screens show it. */
export interface Departure {
  /** Speed relative to the bodies' believed centre of mass, m/s, and the rule's minimum. */
  readonly speed: number;
  readonly minSpeed: number;
  /** Its part away from that centre, m/s, when known: the rule wants the ship moving out. */
  readonly outward?: number;
  /** From that centre, m, and the gate. */
  readonly distance: number;
  readonly beyond: number;
  /** Δv by the propellant gauges since arrival, m/s: at most this counts against the cap. */
  readonly gaugedDeltaV?: number;
  readonly maxDeltaV?: number;
  /** Closest believed approach to each body's centre so far, m. */
  readonly closest?: Readonly<Record<string, number>>;
  /** The ship's own verdict once the objective is judged. */
  readonly status: 'pending' | 'reached' | 'missed';
}

/**
 * The first `depart` objective's standing: the session's own reckoning (2F's
 * `status().departure`: outward speed, gauged Δv, closest approaches, the verdict), or, before
 * it has one, the console's from the snapshot and the model.
 */
export function departure(
  status: { readonly departure?: readonly DepartureProgress[] },
  snapshot: Pick<ViewSnapshot, 'world' | 'objectives'>,
  model: Pick<ModelState, 'parameters'>,
): Departure | null {
  const objective = snapshot.objectives.find((o) => o.depart);
  const reckoned =
    status.departure?.find((d) => d.objective === objective?.id) ?? status.departure?.[0];
  if (reckoned) return reckoned;
  const own = departProgress(snapshot, model);
  return own ? { ...own, status: 'pending' } : null;
}

/** Met as it stands now: moving out (where known) at the minimum speed, past the gate. */
export const departMet = (d: Departure): boolean =>
  d.speed >= d.minSpeed && d.distance >= d.beyond && (d.outward === undefined || d.outward > 0);

/**
 * The direction a planned burn will thrust along, as believed now (for `turnReadiness`):
 * prograde along the believed velocity, toward or away from a believed position, or the held
 * direction itself. Undefined where it cannot be told (no such body, no velocity).
 */
export function burnDirection(
  target: AttitudeTarget,
  ship: Pick<BelievedShip, 'position' | 'velocity'>,
  world: Pick<ViewSnapshot['world'], 'bodies' | 'asteroids'>,
): { x: number; y: number; z: number } | undefined {
  const v = ship.velocity;
  const z = (a: { z?: number }): number => a.z ?? 0;
  switch (target.reference) {
    case 'direction':
      return target.direction;
    case 'inertial': {
      const q = target.attitude;
      return {
        x: 1 - 2 * (q.y * q.y + q.z * q.z),
        y: 2 * (q.x * q.y + q.w * q.z),
        z: 2 * (q.x * q.z - q.w * q.y),
      };
    }
    case 'prograde':
    case 'retrograde': {
      const s = target.reference === 'prograde' ? 1 : -1;
      return Math.hypot(v.x, v.y, z(v)) > 0 ? { x: s * v.x, y: s * v.y, z: s * z(v) } : undefined;
    }
    case 'toward':
    case 'away': {
      const p =
        world.bodies.find((b) => b.id === target.target)?.position ??
        world.asteroids.find((a) => a.id === target.target)?.position;
      if (!p) return undefined;
      const s = target.reference === 'toward' ? 1 : -1;
      return {
        x: s * (p.x - ship.position.x),
        y: s * (p.y - ship.position.y),
        z: s * (z(p) - z(ship.position)),
      };
    }
    default:
      return undefined;
  }
}

/**
 * Progress toward a `depart` objective (S20: say which frame a speed is in). The objective
 * measures speed from the encounter's centre of mass; this is that frame as the ship believes
 * it: the bodies' believed positions and velocities weighted by the model's GM for each.
 * Null without a depart objective, or before the model holds a GM for every body.
 */
export function departProgress(
  snapshot: Pick<ViewSnapshot, 'world' | 'objectives'>,
  model: Pick<ModelState, 'parameters'>,
): {
  speed: number;
  distance: number;
  minSpeed: number;
  beyond: number;
  maxDeltaV?: number;
} | null {
  const objective = snapshot.objectives.find((o) => o.depart);
  if (!objective?.depart) return null;
  let mu = 0;
  const p = { x: 0, y: 0, z: 0 };
  const v = { x: 0, y: 0, z: 0 };
  for (const b of snapshot.world.bodies) {
    const gm = model.parameters.find((q) => q.id === `body.${b.id}.mu`)?.value;
    if (!(gm !== undefined && gm > 0)) return null;
    mu += gm;
    p.x += gm * b.position.x;
    p.y += gm * b.position.y;
    p.z += gm * (b.position.z ?? 0);
    v.x += gm * b.velocity.x;
    v.y += gm * b.velocity.y;
    v.z += gm * (b.velocity.z ?? 0);
  }
  if (!(mu > 0)) return null;
  const ship = snapshot.world.ship;
  const centre = { x: p.x / mu, y: p.y / mu, z: p.z / mu };
  const drift = { x: v.x / mu, y: v.y / mu, z: v.z / mu };
  return {
    speed: distance(ship.velocity, drift),
    distance: distance(ship.position, centre),
    minSpeed: objective.depart.minSpeed,
    beyond: objective.depart.beyond,
    ...(objective.maxDeltaV !== undefined ? { maxDeltaV: objective.maxDeltaV } : {}),
  };
}

/**
 * What a recorder rate costs and records (S20: the estimate must match the ship). The ship
 * requests its minimum power anywhere up to its minimum rate, interpolates above it, and takes
 * at most one sample per 1 s step whatever the rate asked for.
 */
export function recorderEstimate(
  rate: number,
  definition: ShipDefinition,
): { watts: number; samplesPerSecond: number; bytesPerSecond: number } {
  const r = definition.systems?.recorder as
    | {
        minimumSampleRate?: number;
        normalSampleRate?: number;
        highSampleRate?: number;
        powerMinimum?: number;
        powerNormal?: number;
        powerHigh?: number;
        bytesPerSample?: number;
      }
    | undefined;
  const lo = r?.minimumSampleRate ?? 1;
  const mid = r?.normalSampleRate ?? 10;
  const hi = r?.highSampleRate ?? 50;
  const p0 = r?.powerMinimum ?? 15;
  const p1 = r?.powerNormal ?? 35;
  const p2 = r?.powerHigh ?? 100;
  const watts =
    rate <= 0
      ? 0
      : rate <= lo
        ? p0
        : rate <= mid
          ? p0 + ((rate - lo) / (mid - lo)) * (p1 - p0)
          : p1 + ((Math.min(rate, hi) - mid) / (hi - mid)) * (p2 - p1);
  const samplesPerSecond = Math.min(Math.max(rate, 0), 1);
  return { watts, samplesPerSecond, bytesPerSecond: samplesPerSecond * (r?.bytesPerSample ?? 0) };
}

/** Main propellant above the planned reserve, kg, and the speed change it buys, m/s. */
export function spendable(
  ship: BelievedShip,
  definition: ShipDefinition,
  reserve: number,
): { kg: number; deltaV: number } {
  const engine = definition.equipment.find((e) => e.id === 'main-engine');
  const tank = definition.tanks.find((t) => t.feeds.includes('main-engine'));
  const onBoard = tank ? (ship.propellant[tank.id]?.mean ?? 0) : 0;
  const kg = Math.max(0, onBoard - reserve);
  const isp = engine?.params.isp ?? 0;
  const mass = ship.massProperties.mass;
  if (!(kg > 0) || !(isp > 0) || !(mass > kg)) return { kg, deltaV: 0 };
  return { kg, deltaV: isp * G0 * Math.log(mass / (mass - kg)) };
}

export interface Level {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly text: string;
  readonly status: Status;
  /** A limit or target on the same scale, if there is one. */
  readonly mark?: number;
}

const reading = (ship: BelievedShip, channel: string): number | undefined =>
  ship.telemetry[channel]?.value;

/** Propellant and reactant stores. `reserve` marks the main tank's planned reserve. */
export function stores(ship: BelievedShip, definition: ShipDefinition, reserve?: number): Level[] {
  return definition.tanks
    .filter((t) => t.id !== 'product-water' && t.id !== 'xenon')
    .map((t) => {
      const kg = ship.propellant[t.id]?.mean ?? 0;
      const low =
        t.id === 'main-propellant' && reserve !== undefined ? kg < reserve : kg < t.capacity * 0.1;
      return {
        id: t.id,
        label: t.name,
        value: kg,
        max: t.capacity,
        text: `${kg.toFixed(kg < 100 ? 2 : 0)} / ${t.capacity.toFixed(0)} kg`,
        status: low ? 'caution' : 'nominal',
        ...(t.id === 'main-propellant' && reserve !== undefined ? { mark: reserve } : {}),
      };
    });
}

/** Load on each bus against its protection limit. */
export function busLoads(ship: BelievedShip, definition: ShipDefinition): Level[] {
  return definition.buses.map((b) => {
    const measured = reading(ship, `${b.id}.load`);
    const load = measured ?? 0;
    return {
      id: b.id,
      label: b.name,
      value: load,
      max: b.limit,
      // Before the first telemetry there is no load to show, not a load of zero.
      text: measured === undefined ? 'no reading' : `${whole(load)} / ${whole(b.limit)} W`,
      status:
        measured === undefined
          ? 'stale'
          : load > b.limit * 0.9
            ? 'warning'
            : load > b.limit * 0.75
              ? 'caution'
              : 'nominal',
      mark: b.limit * 0.75,
    };
  });
}

/** Temperature of each thermal node against its limit: the heat margin. */
export function heat(ship: BelievedShip, definition: ShipDefinition): Level[] {
  return definition.thermalNodes.map((n) => {
    const t = reading(ship, `${n.id}.temperature`);
    const floor = 250;
    const margin = t === undefined ? undefined : n.max - t;
    return {
      id: n.id,
      label: n.name,
      value: t === undefined ? floor : t - floor,
      max: n.max - floor + 10,
      text: t === undefined ? 'no reading' : `${t.toFixed(1)} K · ${margin!.toFixed(0)} K to limit`,
      status:
        t === undefined ? 'stale' : margin! < 5 ? 'warning' : margin! < 15 ? 'caution' : 'nominal',
      mark: n.max - floor,
    };
  });
}

/** Battery charge, summed. */
export function batteries(ship: BelievedShip, definition: ShipDefinition): Level | undefined {
  const packs = definition.equipment.filter((e) => e.kind === 'battery');
  if (packs.length === 0) return undefined;
  let charge = 0;
  let capacity = 0;
  let measured = false;
  for (const p of packs) {
    const c = ship.equipment[p.id]?.readings.charge ?? reading(ship, `${p.id}.charge`);
    if (c !== undefined) measured = true;
    charge += c ?? 0;
    capacity += p.params.capacity ?? p.params.energyCapacity ?? 0;
  }
  if (!(capacity > 0)) capacity = Math.max(charge, 1);
  // Before the first telemetry the packs are unread, not empty.
  if (!measured)
    return {
      id: 'batteries',
      label: 'batteries',
      value: 0,
      max: capacity,
      text: 'no reading',
      status: 'stale',
    };
  return {
    id: 'batteries',
    label: 'batteries',
    value: charge,
    max: capacity,
    text: `${(charge / 3.6e6).toFixed(1)} kWh · ${Math.round((charge / capacity) * 100)}%`,
    status: charge < capacity * 0.2 ? 'caution' : 'nominal',
  };
}

/**
 * Electrical generation and load right now, W. Load is what the assemblies draw (bus loads would
 * count the essential and payload buses twice: they are fed through the main buses). `bridging`
 * is what the batteries are putting in to cover a shortfall.
 */
export function powerBalance(
  ship: BelievedShip,
  definition: ShipDefinition,
): {
  generated: number;
  load: number;
  bridging: number;
} {
  let generated = 0;
  let load = 0;
  let bridging = 0;
  for (const e of definition.equipment) {
    const status = ship.equipment[e.id];
    generated += status?.readings['generated-power'] ?? 0;
    load += status?.powerDraw ?? 0;
  }
  for (const b of definition.buses) bridging += reading(ship, `${b.id}.discharged`) ?? 0;
  return { generated, load, bridging };
}

export interface RecorderState {
  readonly bytes: number;
  readonly capacity: number;
  /** Samples a second. */
  readonly rate: number;
  /** Electrical draw, W. */
  readonly power: number;
  /** Bytes a second being written, measured over recent history if given. */
  readonly fillRate: number;
  /** Seconds until full at that rate; Infinity when not filling. */
  readonly toFull: number;
}

/** Black Box as a resource (P12): what recording is costing in storage and power. */
export function recorder(
  ship: BelievedShip,
  definition: ShipDefinition,
  bytesHistory: readonly number[] = [],
  historySeconds = 0,
): RecorderState {
  const spec = definition.equipment.find((e) => e.kind === 'recorder');
  const systems = definition.systems?.recorder as
    { capacity?: number; bytesPerSample?: number } | undefined;
  const bytes = reading(ship, 'black-box.bytes') ?? 0;
  const rate = reading(ship, 'black-box.sample-rate') ?? 0;
  const capacity = systems?.capacity ?? 8e9;
  const first = bytesHistory[0];
  const measured =
    first !== undefined && historySeconds > 0 ? Math.max(0, (bytes - first) / historySeconds) : 0;
  const fillRate = measured > 0 ? measured : rate * (systems?.bytesPerSample ?? 0);
  return {
    bytes,
    capacity,
    rate,
    power: spec ? (ship.equipment[spec.id]?.powerDraw ?? 0) : 0,
    fillRate,
    toFull: fillRate > 0 ? (capacity - bytes) / fillRate : Infinity,
  };
}

/** Speed change the main propellant on board buys, m/s (rocket equation, nominal ratings). */
export function deltaV(
  ship: BelievedShip,
  definition: ShipDefinition,
  thruster = 'main-engine',
): number {
  const spec = definition.equipment.find((e) => e.id === thruster);
  const tank = definition.tanks.find((t) => t.feeds.includes(thruster));
  const propellant = tank ? (ship.propellant[tank.id]?.mean ?? 0) : 0;
  const isp = spec?.params.isp ?? 0;
  const mass = ship.massProperties.mass;
  if (!(isp > 0) || !(mass > propellant)) return 0;
  return isp * G0 * Math.log(mass / (mass - propellant));
}

/** Sensor fix rate the camera can sustain: limited by the recorder and by its own power. */
export function fixRate(ship: BelievedShip, camera: EquipmentSpec | undefined): number {
  if (!camera) return 0;
  const status = ship.equipment[camera.id];
  if (!status || status.mode === 'off') return 0;
  const rate = reading(ship, 'black-box.sample-rate') ?? 0;
  const trackPower = camera.params['mode.track.power'] ?? 120;
  return Math.min(rate, status.powerDraw / trackPower);
}

/** Status of one equipment item as the ship reports it. */
export function equipmentStatus(ship: BelievedShip, id: string): Status {
  const e = ship.equipment[id];
  if (!e) return 'stale';
  if (e.tripped || e.faults.length > 0 || e.condition < 0.5) return 'warning';
  if (e.condition < 0.9) return 'caution';
  if (e.mode === 'off') return 'off';
  return 'nominal';
}

/** Distances from each body that a forecast's path visits: [nearest, farthest], metres. */
export function visited(
  forecast: Forecast | ForecastDraft | undefined,
  snapshot: ViewSnapshot,
): Map<string, readonly [number, number]> {
  const out = new Map<string, readonly [number, number]>();
  if (!forecast) return out;
  for (const body of snapshot.world.bodies) {
    const track = forecast.objects.find((o) => o.id === body.id);
    let lo = Infinity;
    let hi = 0;
    forecast.samples.forEach((s, i) => {
      // The body's forecast position at the same time, or where it is believed to be now.
      const at = track?.samples[Math.min(i, track.samples.length - 1)]?.position ?? body.position;
      const r = distance(s.position, at);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    });
    if (Number.isFinite(lo)) out.set(body.id, [lo, hi]);
  }
  return out;
}

/** Adopted rules' validated spans per body (A5), merged across rules. */
export function validatedSpans(model: ModelState): Map<string, { rMin: number; rMax: number }[]> {
  const out = new Map<string, { rMin: number; rMax: number }[]>();
  for (const ext of model.extensions) {
    if (ext.status !== 'adopted') continue;
    for (const span of ext.validatedSpans ?? []) {
      const list = out.get(span.body) ?? [];
      list.push({ rMin: span.rMin, rMax: span.rMax });
      out.set(span.body, list);
    }
  }
  return out;
}
