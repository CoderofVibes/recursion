/**
 * Turns the contract fixtures into what the primitives display. Lab only: the console thread
 * does this for the real panels. Belief side (P11): fixtures and shared contracts, never truth.
 */
import {
  models,
  shipDefinition,
  viewSnapshot,
  viewSnapshotCompare,
} from '../../contracts/fixtures/index.ts';
import { covEllipse } from '../../contracts/index.ts';
import type { SchematicLink, SchematicNode, Status } from '../components/index.ts';

const KM = 1000;
type P = { readonly x: number; readonly y: number };
const km = (a: P, b: P): number => Math.hypot(a.x - b.x, a.y - b.y) / KM;
const fmt = (v: number, digits = 0): string =>
  v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/**
 * A k-sigma radius in km. An issued Forecast is deeply frozen, and that type forgets a covariance
 * has exactly three entries, so rebuild the triple before handing it to the contract helper.
 */
export function sigmaKm(cov: readonly number[], k: number): number {
  // LIFT(2G): the x–y block [xx, xy, yy] of a Cov3 [xx, xy, xz, yy, yz, zz].
  return covEllipse([cov[0] ?? 0, cov[1] ?? 0, cov[3] ?? 0], k).major / KM;
}

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`fixture is missing ${what}`);
  return v;
}

const snapshot = viewSnapshot;
const forecast = need(snapshot.forecasts[0], 'a forecast');
const alpha = need(snapshot.world.bodies[0], 'a body');
/** Forecast samples are 20 s apart; thin the measured trail to match. */
const STEP = 20;

/** Range to the first body: measured so far, forecast from now, and the earlier attempt. */
export function rangeTrend() {
  const measured = snapshot.trail.filter((p) => p.t % STEP === 0);
  const future = forecast.samples.filter((s) => s.t > snapshot.t);
  const earlier = viewSnapshotCompare.compare?.[0];
  const last = need(measured[measured.length - 1], 'a trail');
  return {
    data: measured.map((p) => km(p.position, alpha.position)),
    forecast: future.map((s) => km(s.position, alpha.position)),
    band: future.map((s) => sigmaKm(s.positionCov, 2)),
    previous: earlier?.trail
      .filter((p) => p.t % STEP === 0 && p.t <= snapshot.t)
      .map((p) => km(p.position, alpha.position)),
    surface: alpha.radius / KM,
    value: fmt(km(last.position, alpha.position), 1),
    body: alpha.name,
  };
}

/** How far the measured path has drifted from the forecast issued for it, against its 2σ. */
export function residualTrend() {
  const at = new Map(forecast.samples.map((s) => [s.t, s]));
  const rows = snapshot.trail.flatMap((p) => {
    const s = at.get(p.t);
    return s ? [{ r: km(p.position, s.position), limit: sigmaKm(s.positionCov, 2) }] : [];
  });
  const last = need(rows[rows.length - 1], 'a residual');
  return {
    data: rows.map((r) => r.r),
    limit: last.limit,
    value: fmt(last.r, 2),
    status: (last.r > last.limit ? 'caution' : 'nominal') as Status,
  };
}

export interface EquipmentRow {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly mode: string;
  readonly draw: number;
  readonly allocation: number;
  readonly rated: number;
  readonly condition: number;
  readonly status: Status;
  readonly value: string;
}

/** Each piece of equipment with its believed status. */
export function equipmentRows(): readonly EquipmentRow[] {
  return shipDefinition.equipment.map((e) => {
    const s = need(snapshot.world.ship.equipment[e.id], `status for ${e.id}`);
    const status: Status = s.tripped
      ? 'warning'
      : s.condition < 0.99
        ? 'caution'
        : s.mode === 'off'
          ? 'off'
          : 'nominal';
    return {
      id: e.id,
      name: e.name,
      kind: e.kind,
      mode: s.mode,
      draw: s.powerDraw,
      allocation: s.allocation,
      rated: e.ratedPower,
      condition: s.condition,
      status,
      value: s.allocation > 0 ? `${fmt(s.powerDraw)} W` : '—',
    };
  });
}

/** Bus load and the stores the ship gauges. */
export function levels() {
  const t = snapshot.world.ship.telemetry;
  const bus = need(shipDefinition.buses[0], 'a bus');
  const tank = need(shipDefinition.tanks[0], 'a tank');
  const battery = need(
    shipDefinition.equipment.find((e) => e.kind === 'battery'),
    'a battery',
  );
  const recorder = need(
    shipDefinition.equipment.find((e) => e.kind === 'recorder'),
    'a recorder',
  );
  const load = t[`${bus.id}.load`]?.value ?? 0;
  const charge = t[`${battery.id}.charge`]?.value ?? 0;
  const propellant = t[`${tank.id}.propellant`]?.value ?? 0;
  const used = snapshot.world.ship.equipment[recorder.id]?.readings.bytesUsed ?? 0;
  return {
    bus: {
      name: bus.name,
      value: load,
      max: bus.limit,
      text: `${fmt(load)} / ${fmt(bus.limit)} W`,
    },
    battery: {
      name: battery.name,
      value: charge,
      max: battery.params.capacity ?? 1,
      text: `${fmt((100 * charge) / (battery.params.capacity ?? 1))} %`,
    },
    propellant: {
      name: tank.name,
      value: propellant,
      max: tank.capacity,
      text: `${fmt(propellant)} / ${fmt(tank.capacity)} kg`,
    },
    recorder: {
      name: `${recorder.name} store`,
      value: used,
      max: recorder.params.capacity ?? 1,
      text: `${fmt(used / 1e9, 2)} / ${fmt((recorder.params.capacity ?? 0) / 1e9)} GB`,
    },
  };
}

/** The model's parameters with how sure it is and how much of that is data. */
export function modelView() {
  const m = models.massOnly;
  const num = (v: number): string =>
    Math.abs(v) >= 1e5 || Math.abs(v) < 1e-2 ? v.toExponential(2) : fmt(v, 3);
  return {
    version: m.version,
    parameters: m.parameters.map((p) => ({
      label: p.label,
      value: num(p.value),
      unit: p.unit,
      sigma: num(p.sigma),
      support: p.support,
    })),
    coast: m.residuals.coast,
    powered: m.residuals.powered,
    extensions: m.extensions,
  };
}

/** A one-line diagram of the fixture ship's bus: sources, the bus, and its largest loads. */
export function powerSchematic(): {
  cols: number;
  rows: number;
  nodes: SchematicNode[];
  links: SchematicLink[];
} {
  const rows = equipmentRows();
  const bus = need(shipDefinition.buses[0], 'a bus');
  const sources = rows.filter((r) => r.kind === 'power-source' || r.kind === 'battery');
  const loads = rows
    .filter((r) => r.allocation > 0)
    .sort((a, b) => b.draw - a.draw)
    .slice(0, 4);
  const height = Math.max(sources.length, loads.length);
  const nodes: SchematicNode[] = [
    ...sources.map((s, i) => ({
      id: s.id,
      col: 0,
      row: i,
      label: s.name,
      sub: s.mode,
      status: s.status,
    })),
    {
      id: bus.id,
      col: 1,
      row: Math.floor((height - 1) / 2),
      label: bus.name,
      sub: `${bus.voltage} V`,
      kind: 'bus' as const,
    },
    ...loads.map((l, i) => ({
      id: l.id,
      col: 2,
      row: i,
      label: l.name,
      sub: l.value,
      status: l.status,
    })),
  ];
  const links: SchematicLink[] = [
    ...sources.map((s) => ({ from: s.id, to: bus.id })),
    ...loads.map((l) => ({
      from: bus.id,
      to: l.id,
      state: l.mode === 'off' ? ('off' as const) : ('on' as const),
    })),
  ];
  return { cols: 3, rows: height, nodes, links };
}

export const lab = { snapshot, forecast, compare: viewSnapshotCompare.compare };
