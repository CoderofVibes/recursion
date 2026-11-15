/**
 * SYSTEMS: equipment and power allocation, with the consequences where they can be seen
 * (brief §4, §10). Buses against their limits, stores, heat margin, and every assembly with its
 * modes, allocation, readings and condition. A change here is a command to the ship, so its
 * effect shows up in the readings beside it, not in a description.
 */
import { useState } from 'react';
import type { EquipmentSpec } from '../../contracts/index.ts';
import {
  ComponentList,
  ComponentRow,
  LevelBar,
  ModeChips,
  Panel,
  Readout,
  ReadoutGrid,
  Trend,
} from '../../theme/components/index.ts';
import { Actions, Button, Caption, Line, NumberField } from '../controls.tsx';
import {
  batteries,
  busLoads,
  equipmentStatus,
  fixRate,
  heat,
  powerBalance,
  stores,
} from '../data.ts';
import type { Desk } from '../desk.ts';
import { fixed, name, whole } from '../format.ts';

/** Assemblies that are structure or stores: listed last and quietly. */
const PASSIVE = new Set(['other']);

export function EquipmentDetail({
  desk,
  spec,
}: {
  readonly desk: Desk;
  readonly spec: EquipmentSpec;
}) {
  const { game } = desk;
  const ship = game.snapshot().world.ship;
  const status = ship.equipment[spec.id];
  const ended = game.status().phase === 'ended';
  if (!status) return <p className="cs-note">no report from {name(spec.id)}</p>;
  const modes = spec.modes.filter((m) => m !== 'reset' && !/^(bank|jet)-/.test(m));
  const readings = Object.entries(status.readings).filter(([k]) => k !== 'generated-power');
  return (
    <>
      <ReadoutGrid columns={3}>
        <Readout label="Draw" value={whole(status.powerDraw)} unit="W" />
        <Readout label="Allocated" value={whole(status.allocation)} unit="W" />
        <Readout
          label="Condition"
          value={`${Math.round(status.condition * 100)}%`}
          status={status.condition < 0.9 ? 'caution' : 'nominal'}
        />
      </ReadoutGrid>
      <Line label="bus">{spec.bus ? name(spec.bus) : 'none'}</Line>
      <Line label="thermal node">{spec.thermalNode ? name(spec.thermalNode) : 'none'}</Line>
      <Line label="mass">{whole(spec.mass)} kg</Line>
      {status.tripped ? (
        <Line label="protection" status="warning">
          tripped
        </Line>
      ) : null}
      {status.faults.map((f) => (
        <Line key={f} label="fault" status="warning">
          {f}
        </Line>
      ))}
      {readings.map(([k, v]) => (
        <Line key={k} label={k}>
          {Math.abs(v) >= 1e5 ? v.toExponential(3) : fixed(v, 2)}
        </Line>
      ))}
      {modes.length > 1 ? (
        <>
          <Caption>mode</Caption>
          <ModeChips
            label={`${spec.name} mode`}
            options={modes}
            value={status.mode}
            {...(ended
              ? {}
              : {
                  onChange: (mode: string) =>
                    game.command({ kind: 'mode', equipment: spec.id, mode }),
                })}
          />
        </>
      ) : null}
      {spec.ratedPower > 0 ? (
        <NumberField
          label="Allocate"
          unit="W"
          min={0}
          max={spec.ratedPower}
          step={10}
          value={Math.round(status.allocation)}
          disabled={ended}
          onChange={(v) => game.command({ kind: 'power', equipment: spec.id, allocation: v })}
        />
      ) : null}
      {spec.modes.includes('reset') && (status.tripped || status.faults.length > 0) ? (
        <Actions>
          <Button
            status="caution"
            onClick={() => game.command({ kind: 'mode', equipment: spec.id, mode: 'reset' })}
          >
            RESET
          </Button>
        </Actions>
      ) : null}
    </>
  );
}

export function SystemsPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const [selected, setSelected] = useState('camera');
  const snapshot = game.snapshot();
  const ship = snapshot.world.ship;
  const ended = game.status().phase === 'ended';
  const spec = game.ship.equipment.find((e) => e.id === selected);
  const camera = game.ship.equipment.find((e) => e.kind === 'optical-tracker');
  const balance = powerBalance(ship, game.ship);
  const battery = batteries(ship, game.ship);
  const active = game.ship.equipment
    .filter((e) => !PASSIVE.has(e.kind) || (ship.equipment[e.id]?.powerDraw ?? 0) > 0)
    .sort(
      (x, y) => (ship.equipment[y.id]?.powerDraw ?? 0) - (ship.equipment[x.id]?.powerDraw ?? 0),
    );

  return (
    <div className="cs-grid">
      <Panel
        title="Power"
        aside={`${whole(balance.generated)} W made · ${whole(balance.load)} W drawn`}
        status={balance.bridging > 1 ? 'caution' : 'nominal'}
        statusLine={
          balance.bridging > 1
            ? `batteries bridging ${whole(balance.bridging)} W: generation is short`
            : undefined
        }
      >
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
          title="Essential bus"
          unit="W"
          value={whole(ship.telemetry['essential.load']?.value ?? 0)}
          data={desk.history('essential.load')}
        />
        <Trend
          title="Payload bus"
          unit="W"
          value={whole(ship.telemetry['payload.load']?.value ?? 0)}
          data={desk.history('payload.load')}
        />
        <Line label="fix rate">{fixed(fixRate(ship, camera), 2)} per s</Line>
      </Panel>

      <Panel title="Stores and heat">
        {stores(ship, game.ship, desk.design.reserve).map((s) => (
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
        <Caption>heat margin</Caption>
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
        <Caption>configuration</Caption>
        <ModeChips
          label="Configuration"
          options={game.ship.configurations.map((c) => ({ value: c.id, label: c.name }))}
          value={ship.configuration}
          {...(ended
            ? {}
            : {
                onChange: (configuration: string) =>
                  game.command({ kind: 'configure', configuration }),
              })}
        />
      </Panel>

      <Panel title="Equipment" aside={`${active.length} assemblies`}>
        <div className="cs-scroll">
          <ComponentList label="Equipment">
            {active.map((e) => {
              const s = ship.equipment[e.id];
              return (
                <ComponentRow
                  key={e.id}
                  name={e.name}
                  mode={s?.mode ?? '—'}
                  value={`${whole(s?.powerDraw ?? 0)} W`}
                  status={equipmentStatus(ship, e.id)}
                  tone={e.kind === 'recorder' ? 'blackbox' : 'measured'}
                  selected={e.id === selected}
                  onSelect={() => setSelected(e.id)}
                />
              );
            })}
          </ComponentList>
        </div>
      </Panel>

      <Panel
        title={spec ? spec.name : 'Component'}
        aside={spec?.kind ?? ''}
        tone={spec?.kind === 'recorder' ? 'blackbox' : 'measured'}
      >
        {spec ? (
          <EquipmentDetail desk={desk} spec={spec} />
        ) : (
          <p className="cs-note">choose an assembly</p>
        )}
      </Panel>
    </div>
  );
}
