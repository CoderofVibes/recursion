/**
 * The instruments beside the SHIP hologram. The hologram is the drawing; choosing a system
 * isolates it there and brings up, here, its schematic, levels, trends, readouts and component
 * list, and the selected component's own controls (brief §10: "selecting equipment should expose
 * useful controls, component relationships, readings and history").
 *
 * Wired to the ship as it reports itself: modes, allocations, draws, stores, bus loads and node
 * temperatures are the believed ship's. What `src/ship` does not expose yet is marked as such.
 */
import { useSyncExternalStore } from 'react';
import type { EquipmentSpec } from '../contracts/index.ts';
import {
  ComponentList,
  ComponentRow,
  LevelBar,
  ModeChips,
  Panel,
  Readout,
  ReadoutGrid,
  Schematic,
  Trend,
} from '../theme/components/index.ts';
import type { SchematicLink, SchematicNode } from '../theme/components/index.ts';
import { coverageCones, sigmaMajor, yawInertia } from '../view3d/adapter.ts';
import type { ShipHolo } from '../view3d/ship/ShipHolo.ts';
import { Caption, Line } from './controls.tsx';
import {
  batteries,
  busLoads,
  deltaV,
  equipmentStatus,
  fixRate,
  heat,
  powerBalance,
  recorder,
  stores,
} from './data.ts';
import type { Desk } from './desk.ts';
import { FramingControls } from './Framing.tsx';
import type { Framing } from './Framing.tsx';
import { bytes, configurationName, duration, fixed, name, whole } from './format.ts';
import { EquipmentDetail } from './pages/SystemsPage.tsx';

/** One-line diagram of the electrical system: sources over the buses they feed. */
function powerDiagram(desk: Desk): {
  nodes: SchematicNode[];
  links: SchematicLink[];
  cols: number;
} {
  const { game } = desk;
  const ship = desk.snapshot().world.ship;
  const buses = game.ship.buses;
  const nodes: SchematicNode[] = [];
  const links: SchematicLink[] = [];
  const sources = game.ship.equipment.filter(
    (e) => e.kind === 'power-source' || e.kind === 'battery',
  );
  buses.forEach((b, col) => {
    nodes.push({
      id: b.id,
      col,
      row: 2,
      kind: 'bus',
      label: b.name,
      sub: `${whole(ship.telemetry[`${b.id}.load`]?.value ?? 0)} W`,
    });
  });
  const perBus = new Map<string, number>();
  for (const s of sources) {
    const col = buses.findIndex((b) => b.id === s.bus);
    if (col < 0) continue;
    const row = perBus.get(s.bus ?? '') ?? 0;
    if (row > 1) continue;
    perBus.set(s.bus ?? '', row + 1);
    const status = ship.equipment[s.id];
    const out = status?.readings.output ?? status?.readings['generated-power'] ?? 0;
    nodes.push({
      id: s.id,
      col,
      row,
      label: s.name,
      sub: `${whole(out)} W`,
      status: equipmentStatus(ship, s.id),
    });
    links.push({ from: s.id, to: s.bus ?? '', state: out > 0 ? 'on' : 'off' });
  }
  return { nodes, links, cols: buses.length };
}

function SystemScreen({
  desk,
  system,
  parts,
}: {
  readonly desk: Desk;
  readonly system: string;
  readonly parts: readonly EquipmentSpec[];
}) {
  const { game } = desk;
  const snapshot = desk.snapshot();
  const ship = snapshot.world.ship;
  switch (system) {
    case 'power': {
      const balance = powerBalance(ship, game.ship);
      const battery = batteries(ship, game.ship);
      const diagram = powerDiagram(desk);
      return (
        <>
          <Schematic
            label="Electrical one-line"
            cols={diagram.cols}
            rows={3}
            nodes={diagram.nodes}
            links={diagram.links}
          />
          <ReadoutGrid columns={2}>
            <Readout label="Made" value={whole(balance.generated)} unit="W" />
            <Readout label="Drawn" value={whole(balance.load)} unit="W" />
          </ReadoutGrid>
          {busLoads(ship, game.ship).map((b) => (
            <LevelBar
              key={b.id}
              label={b.label}
              value={b.value}
              max={b.max}
              text={b.text}
              status={b.status}
              marks={[{ at: b.mark ?? b.max, kind: 'caution' }]}
            />
          ))}
          {battery ? (
            <LevelBar
              label="Batteries"
              value={battery.value}
              max={battery.max}
              text={battery.text}
              status={battery.status}
            />
          ) : null}
          <Trend
            title="Main bus A"
            unit="W"
            value={whole(ship.telemetry['main-a.load']?.value ?? 0)}
            data={desk.history('main-a.load')}
          />
        </>
      );
    }
    case 'thermal':
      return (
        <>
          {heat(ship, game.ship).map((n) => (
            <LevelBar
              key={n.id}
              label={n.label}
              value={n.value}
              max={n.max}
              text={n.text}
              status={n.status}
              marks={[{ at: n.mark ?? n.max, kind: 'warning' }]}
            />
          ))}
          <Trend
            title="External loop"
            unit="K"
            value={fixed(ship.telemetry['external-loop.temperature']?.value ?? 0, 1)}
            data={desk.history('external-loop.temperature')}
          />
          <Trend
            title="Service bay"
            unit="K"
            value={fixed(ship.telemetry['service.temperature']?.value ?? 0, 1)}
            data={desk.history('service.temperature')}
          />
        </>
      );
    case 'propulsion': {
      const engine = game.ship.equipment.find((e) => e.id === 'main-engine');
      return (
        <>
          <ReadoutGrid columns={2}>
            <Readout label="Δv on board" value={fixed(deltaV(ship, game.ship), 0)} unit="m/s" />
            <Readout
              label="Thrust"
              value={fixed((engine?.params.thrust ?? 0) / 1000, 0)}
              unit="kN"
            />
            <Readout label="Isp" value={whole(engine?.params.isp ?? 0)} unit="s" />
            <Readout label="Mass" value={whole(ship.massProperties.mass)} unit="kg" />
          </ReadoutGrid>
          {stores(ship, game.ship, desk.design.reserve)
            .filter((s) => s.id === 'main-propellant' || s.id.startsWith('rcs-'))
            .map((s) => (
              <LevelBar
                key={s.id}
                label={s.label}
                value={s.value}
                max={s.max}
                text={s.text}
                status={s.status}
                {...(s.mark !== undefined
                  ? { marks: [{ at: s.mark, kind: 'target' as const, label: 'reserve' }] }
                  : {})}
              />
            ))}
          <Trend
            title="Main propellant"
            unit="kg"
            value={whole(ship.propellant['main-propellant']?.mean ?? 0)}
            data={desk.history('tank:main-propellant')}
          />
        </>
      );
    }
    case 'guidance': {
      const camera = game.ship.equipment.find((e) => e.kind === 'optical-tracker');
      const sector = coverageCones(snapshot.coverage)[0];
      const tracked = [...snapshot.world.bodies, ...snapshot.world.asteroids].filter(
        (o) => o.tracked,
      );
      return (
        <>
          <ReadoutGrid columns={2}>
            <Readout label="Fix rate" value={fixed(fixRate(ship, camera), 2)} unit="per s" />
            <Readout
              label="Quality"
              value={sector ? `${Math.round(sector.quality * 100)}%` : '—'}
            />
            <Readout
              label="Tracking"
              value={tracked.map((o) => o.id).join(', ') || 'nothing'}
              status={tracked.length ? 'nominal' : 'caution'}
            />
            <Readout label="Position ±" value={`${fixed(sigmaMajor(ship.positionCov), 0)} m`} />
          </ReadoutGrid>
          <Trend
            title="Off the forecast"
            unit="m"
            value={whole(desk.history('miss').at(-1) ?? 0)}
            data={desk.history('miss')}
            tone="forecast"
          />
        </>
      );
    }
    case 'data': {
      const rec = recorder(ship, game.ship);
      return (
        <>
          <ReadoutGrid columns={2}>
            <Readout label="Sample rate" value={fixed(rec.rate, 2)} unit="Hz" tone="blackbox" />
            <Readout label="Draw" value={whole(rec.power)} unit="W" tone="blackbox" />
            <Readout label="Stored" value={bytes(rec.bytes)} tone="blackbox" />
            <Readout
              label="Full in"
              value={Number.isFinite(rec.toFull) ? duration(rec.toFull) : '—'}
              tone="blackbox"
            />
          </ReadoutGrid>
          <LevelBar
            label="Storage"
            value={rec.bytes}
            max={rec.capacity}
            text={`${bytes(rec.bytes)} / ${bytes(rec.capacity)}`}
            tone="blackbox"
          />
          <Trend
            title="Stored"
            unit="MB"
            value={fixed(rec.bytes / 1e6, 2)}
            data={desk.history('black-box.bytes').map((v) => v / 1e6)}
            tone="blackbox"
          />
        </>
      );
    }
    case 'life':
      return (
        <>
          <ReadoutGrid columns={2}>
            <Readout
              label="Cabin"
              value={fixed(ship.telemetry['cabin.temperature']?.value ?? 0, 1)}
              unit="K"
            />
            <Readout
              label="Air trains"
              value={parts.filter((p) => ship.equipment[p.id]?.mode === 'active').length}
            />
          </ReadoutGrid>
          <p className="cs-note">
            placeholder: stores and cabin air are not reported by the ship yet; life support keeps a
            fixed power and heat demand and its consumables do not run out (P14)
          </p>
        </>
      );
    default:
      return (
        <>
          <ReadoutGrid columns={2}>
            <Readout label="Mass" value={whole(ship.massProperties.mass)} unit="kg" />
            <Readout
              label="Centre of mass"
              value={`${fixed(ship.massProperties.centerOfMass.x, 2)}, ${fixed(ship.massProperties.centerOfMass.y, 2)}`}
              unit="m"
            />
            <Readout
              label="Inertia"
              value={yawInertia(ship.massProperties.inertia).toExponential(2)}
              unit="kg·m²"
            />
            <Readout label="Configuration" value={ship.configuration} />
          </ReadoutGrid>
        </>
      );
  }
}

export function ShipPanels({
  desk,
  holo,
  framing,
}: {
  readonly desk: Desk;
  readonly holo: ShipHolo;
  /** Framing the drawing without a pointer. */
  readonly framing?: Framing;
}) {
  const { game } = desk;
  // Re-render when the hologram's system, selection or configuration changes.
  const drawn = (): string => `${holo.system()}|${holo.selected()}|${holo.config()}`;
  useSyncExternalStore((listener) => holo.onChange(listener), drawn, drawn);
  const ship = desk.snapshot().world.ship;
  const system = holo.system();
  const ended = game.status().phase === 'ended';
  const members = holo.parts().filter((p) => p.system === system);
  const specs = members
    .map((p) => game.ship.equipment.find((e) => e.id === p.id))
    .filter((e): e is EquipmentSpec => e !== undefined);
  const selected = game.ship.equipment.find((e) => e.id === holo.selected());

  return (
    <>
      <aside className="sp-col sp-left">
        <Panel title="Systems" aside={system ? '' : 'vehicle'}>
          <div className="sp-systems">
            <button
              type="button"
              className="rx-chip"
              data-on={system === null ? '' : undefined}
              aria-pressed={system === null}
              onClick={() => holo.setSystem(null)}
            >
              VEHICLE
            </button>
            {holo.systems.map((s) => (
              <button
                key={s.id}
                type="button"
                className="rx-chip"
                data-on={system === s.id ? '' : undefined}
                aria-pressed={system === s.id}
                onClick={() => holo.setSystem(s.id)}
              >
                {s.name}
              </button>
            ))}
          </div>
          <Caption>configuration</Caption>
          <ModeChips
            label="Configuration"
            options={game.ship.configurations.map((c) => ({
              value: c.id,
              label: configurationName(c.name),
            }))}
            value={ship.configuration}
            {...(ended
              ? {}
              : {
                  onChange: (configuration: string) =>
                    game.command({ kind: 'configure', configuration }),
                })}
          />
          {framing ? <FramingControls view={framing} orbit /> : null}
        </Panel>
        {system ? (
          <Panel title={holo.systems.find((s) => s.id === system)?.name ?? system}>
            <SystemScreen desk={desk} system={system} parts={specs} />
          </Panel>
        ) : (
          <Panel title="Vehicle">
            <SystemScreen desk={desk} system="vehicle" parts={[]} />
            <Line label="equipment">{game.ship.equipment.length} assemblies</Line>
          </Panel>
        )}
      </aside>

      <aside className="sp-col sp-right">
        {system ? (
          <Panel title="Components" aside={`${specs.length}`}>
            <ComponentList label="Components">
              {specs.map((e) => {
                const s = ship.equipment[e.id];
                return (
                  <ComponentRow
                    key={e.id}
                    name={name(e.id)}
                    mode={s?.mode ?? '—'}
                    value={`${whole(s?.powerDraw ?? 0)} W`}
                    status={equipmentStatus(ship, e.id)}
                    tone={e.kind === 'recorder' ? 'blackbox' : 'measured'}
                    selected={holo.selected() === e.id}
                    onSelect={() => holo.select(e.id)}
                  />
                );
              })}
            </ComponentList>
          </Panel>
        ) : null}
        {selected ? (
          <Panel
            title={selected.name}
            aside={selected.kind}
            tone={selected.kind === 'recorder' ? 'blackbox' : 'measured'}
          >
            <EquipmentDetail desk={desk} spec={selected} />
          </Panel>
        ) : null}
      </aside>
    </>
  );
}
