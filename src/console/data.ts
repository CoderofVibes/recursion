/**
 * What the instruments show, worked out from the believed ship and the nominal design. Pure
 * functions: snapshot in, plain rows out, so panels stay layout and these stay testable.
 * Belief side (P11).
 */
import type {
  BelievedShip,
  EquipmentSpec,
  Forecast,
  ForecastDraft,
  ModelState,
  ShipDefinition,
  ViewSnapshot,
} from '../contracts/index.ts';
import type { Status } from '../theme/components/index.ts';

const G0 = 9.80665;

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
      const low = t.id === 'main-propellant' && reserve !== undefined ? kg < reserve : kg < t.capacity * 0.1;
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
    const load = reading(ship, `${b.id}.load`) ?? 0;
    return {
      id: b.id,
      label: b.name,
      value: load,
      max: b.limit,
      text: `${Math.round(load).toLocaleString('en-US')} / ${b.limit.toLocaleString('en-US')} W`,
      status: load > b.limit * 0.9 ? 'warning' : load > b.limit * 0.75 ? 'caution' : 'nominal',
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
  for (const p of packs) {
    charge += ship.equipment[p.id]?.readings.charge ?? reading(ship, `${p.id}.charge`) ?? 0;
    capacity += p.params.capacity ?? p.params.energyCapacity ?? 0;
  }
  if (!(capacity > 0)) capacity = Math.max(charge, 1);
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
export function powerBalance(ship: BelievedShip, definition: ShipDefinition): {
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
  const systems = definition.systems?.recorder as { capacity?: number; bytesPerSample?: number } | undefined;
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
export function deltaV(ship: BelievedShip, definition: ShipDefinition, thruster = 'main-engine'): number {
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
      const r = Math.hypot(s.position.x - at.x, s.position.y - at.y);
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
