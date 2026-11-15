/**
 * SYSTEMS: the ship as one supply shared by everything aboard (brief §4, §10). The loop's second
 * stage: set the ship up, and see what each setting costs the others.
 *
 * It leads with the electrical budget: what the sources give against what every load is set to
 * draw, on one scale, with a fader for each load the player sets (the camera, the Black Box
 * recorder, the science processor, comms). Pull one and the demand grows, the headroom and the
 * reactants' endurance shrink, and the line under the fader says what the setting buys in the
 * mission's own terms. Beside it: the endurance against the plan's length, the fixes the camera
 * will take, heat, stores, the configuration and the radiation monitor. Every unit, with its
 * modes, allocation, readings and condition, folds out below.
 *
 * Before the encounter is entered nothing runs, so a setting made here is shown as set and
 * reaches the ship on ENTER (`desk.setUnit`); inside the encounter it is a command, sent at
 * once (A12), and what the ship reports drawing is shown beside what was set.
 */
import { useRef, useState } from 'react';
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
import { Actions, Button, Caption, Line } from '../controls.tsx';
import {
  batteries,
  busLoads,
  equipmentStatus,
  fixRate,
  heat,
  recorder,
  recorderEstimate,
  stores,
} from '../data.ts';
import type { Desk } from '../desk.ts';
import { configurationName, duration, fixed, name, whole } from '../format.ts';
import { BudgetBoard } from '../instruments/BudgetBoard.tsx';
import type { BudgetLoad } from '../instruments/BudgetBoard.tsx';
import { DragBar } from '../instruments/DragBar.tsx';
import { modePower, powerBudget, settableModes } from '../power.ts';
import type { PowerLoad } from '../power.ts';
import { doseRate, doseRateView, rateText } from '../radiation.ts';

/** Assemblies that are structure or stores: listed last and quietly. */
const PASSIVE = new Set(['other']);

/** The Black Box sample rates offered, Hz. */
export const RECORDER_RATES: readonly number[] = [0.05, 0.2, 1, 10];

/**
 * The mode a unit needs to draw `watts`: the least powerful it has that can. A fader swept up
 * its scale passes through the unit's modes in the order of what they ask.
 */
export function modeFor(spec: EquipmentSpec, watts: number): string {
  const modes = settableModes(spec)
    .map((mode) => ({ mode, power: modePower(spec, mode) }))
    .sort((a, b) => a.power - b.power);
  if (watts <= 0) return modes.find((m) => m.mode === 'off')?.mode ?? modes[0]?.mode ?? 'off';
  return (modes.find((m) => m.power >= watts - 1e-9) ?? modes.at(-1))?.mode ?? spec.defaultMode;
}

/** What a setting buys, in the mission's own terms, for the loads the player sets. */
function effectOf(
  load: PowerLoad,
  mode: string,
  fixes: { readonly rate: number; readonly limit: string },
): string {
  switch (load.unit?.kind) {
    case 'optical-tracker':
      return mode === 'off'
        ? 'off: no fixes, so no tracking'
        : `${mode} · ${fixed(fixes.rate, 2)} fixes a second · ${fixes.limit}`;
    case 'processor':
      return mode === 'lattice'
        ? 'Black Box channel 03 processing'
        : mode === 'science'
          ? 'science processing'
          : mode;
    case 'comms':
      return mode === 'transmit' ? 'transmitting' : mode === 'listen' ? 'listening' : mode;
    default:
      return mode;
  }
}

export function EquipmentDetail({
  desk,
  spec,
}: {
  readonly desk: Desk;
  readonly spec: EquipmentSpec;
}) {
  const { game } = desk;
  const ship = desk.snapshot().world.ship;
  const status = ship.equipment[spec.id];
  const phase = game.status().phase;
  const ended = phase === 'ended';
  if (!status) return <p className="cs-note">no report from {name(spec.id)}</p>;
  const set = desk.unitSetting(spec.id) ?? { mode: status.mode, allocation: status.allocation };
  const modes = settableModes(spec);
  const readings = Object.entries(status.readings).filter(([k]) => k !== 'generated-power');
  const history = desk.history(`${spec.id}.power`);
  return (
    <>
      <ReadoutGrid columns={3}>
        <Readout label="Draw" value={whole(status.powerDraw)} unit="W" />
        <Readout label="Allocated" value={whole(set.allocation)} unit="W" tone="forecast" />
        <Readout
          label="Condition"
          value={`${Math.round(status.condition * 100)}%`}
          status={status.condition < 0.9 ? 'caution' : 'nominal'}
        />
      </ReadoutGrid>
      {history.length > 1 ? (
        <Trend
          title="Draw · this attempt"
          unit="W"
          value={whole(status.powerDraw)}
          data={history}
        />
      ) : null}
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
            value={set.mode}
            {...(ended ? {} : { onChange: (mode: string) => desk.setUnit(spec.id, { mode }) })}
          />
        </>
      ) : null}
      {spec.ratedPower > 0 ? (
        <DragBar
          stacked
          label="Allocate"
          value={Math.round(set.allocation)}
          min={0}
          max={spec.ratedPower}
          step={Math.max(1, Math.round(spec.ratedPower / 40))}
          text={`${whole(set.allocation)} W`}
          typed={{ unit: 'W', step: 10 }}
          measured={status.powerDraw}
          {...(ended ? {} : { onChange: (v: number) => desk.setUnit(spec.id, { allocation: v }) })}
        />
      ) : null}
      {phase === 'prepare' ? (
        <p className="cs-note">set now · it reaches the ship when you enter</p>
      ) : null}
      {spec.modes.includes('reset') && (status.tripped || status.faults.length > 0) ? (
        <Actions>
          <Button
            status="caution"
            disabled={ended}
            onClick={() => game.command({ kind: 'mode', equipment: spec.id, mode: 'reset' })}
          >
            RESET
          </Button>
        </Actions>
      ) : null}
    </>
  );
}

/**
 * The radiation monitor (A24): the dose rate where it sits, its noise, whether it is over
 * range, and the caution the session raises above the hazard threshold.
 */
export function RadiationPanel({ desk }: { readonly desk: Desk }) {
  const status = desk.game.status();
  const reading = doseRate(status);
  const caution = status.alerts.some((a) => (a.id as string) === 'radiation-high');
  const view = doseRateView(reading, status.t, caution);
  const threshold = reading?.threshold;
  return (
    <Panel
      title="Radiation"
      aside={reading ? `monitor in ${name(reading.source)}` : 'monitor'}
      status={view.status === 'caution' ? 'caution' : 'nominal'}
      {...(view.status === 'caution' ? { statusLine: 'dose rate above the hazard threshold' } : {})}
    >
      <Trend
        title="Dose rate"
        unit="U"
        value={view.value}
        data={desk.history('radiation')}
        status={view.status}
        min={0}
        {...(threshold !== undefined ? { limits: [{ at: threshold, kind: 'caution' }] } : {})}
      />
      <Line label="reading" {...(view.status === 'stale' ? { status: 'stale' } : {})}>
        {view.note}
      </Line>
      {threshold !== undefined ? <Line label="caution above">{rateText(threshold)} U</Line> : null}
    </Panel>
  );
}

export function SystemsPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const [selected, setSelected] = useState('camera');
  // Every unit, folded: drawn only once it is opened (34 rows redrawn five times a second,
  // unseen, were most of this page's cost on a modest machine: S15's views).
  const [unitsOpen, setUnitsOpen] = useState(false);
  const snapshot = desk.snapshot();
  const ship = snapshot.world.ship;
  const status = game.status();
  const ended = status.phase === 'ended';
  const preparing = status.phase === 'prepare';
  const spec = game.ship.equipment.find((e) => e.id === selected);
  const camera = game.ship.equipment.find((e) => e.kind === 'optical-tracker');
  const rate = desk.recorderRate();
  const budget = powerBudget(ship, game.ship, desk.pendingSettings(), rate);
  const battery = batteries(ship, game.ship);
  // In the ship's own order, which never changes while the player works down it (S9 R12): a
  // list sorted by live draw would move the row under the keyboard.
  const active = game.ship.equipment.filter((e) => !PASSIVE.has(e.kind) || e.ratedPower > 0);
  const detail = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // Fixes: the camera takes them, the recorder keeps them. Whichever is slower sets the rate.
  const cameraDraw = budget.loads.find((l) => l.unit?.kind === 'optical-tracker')?.designed ?? 0;
  const kept = recorderEstimate(rate, game.ship).samplesPerSecond;
  const taken = cameraDraw / (camera ? modePower(camera, 'track') || 120 : 120);
  const fixes = {
    rate: preparing ? (cameraDraw > 0 ? Math.min(kept, taken) : 0) : fixRate(ship, camera),
    limit:
      cameraDraw <= 0
        ? 'the camera is off'
        : kept <= taken
          ? 'limited by the recorder’s rate'
          : 'limited by the camera’s power',
  };
  const rec = recorder(ship, game.ship);
  const fill = recorderEstimate(rate, game.ship).bytesPerSecond;

  const loads: BudgetLoad[] = budget.loads.map((load): BudgetLoad => {
    const unit = load.unit;
    const tone: BudgetLoad['tone'] =
      unit?.kind === 'recorder' ? 'blackbox' : load.id === 'engines' ? 'thrust' : undefined;
    const base = {
      id: load.id,
      label: load.label,
      value: load.designed,
      ...(tone ? { tone } : {}),
    };
    if (!unit || ended) return base;
    const set = desk.unitSetting(unit.id);
    if (unit.kind === 'recorder')
      // The recorder asks by its sample rate: its settings are rates, and several cost the same.
      return {
        ...base,
        control: {
          min: 0,
          max: unit.ratedPower,
          step: 1,
          stops: RECORDER_RATES.map((r) => ({
            at: recorderEstimate(r, game.ship).watts,
            label: `${r} Hz`,
          })),
          stop: `${rate} Hz`,
          onStop: (s) => desk.setRecorderRate(Number(s.label.replace(' Hz', ''))),
          ...(load.measured !== undefined ? { measured: load.measured } : {}),
          effect:
            `${fixed(kept, 2)} samples a second kept · store full in ` +
            (fill > 0 ? duration((rec.capacity - rec.bytes) / fill) : '—'),
        },
      };
    return {
      ...base,
      control: {
        min: 0,
        max: unit.ratedPower,
        step: Math.max(1, Math.round(unit.ratedPower / 40)),
        stops: settableModes(unit).map((mode) => ({ at: modePower(unit, mode), label: mode })),
        ...(set ? { stop: set.mode } : {}),
        onStop: (s) => desk.setUnit(unit.id, { mode: s.label, allocation: unit.ratedPower }),
        onChange: (v) => desk.setUnit(unit.id, { mode: modeFor(unit, v), allocation: v }),
        ...(load.measured !== undefined ? { measured: load.measured } : {}),
        effect: effectOf(load, set?.mode ?? unit.defaultMode, fixes),
      },
    };
  });

  // The plan's length, for the endurance to be read against: the forecast in hand.
  const shown = desk.preview ?? snapshot.forecasts.at(-1);
  const planHours = shown?.samples.length
    ? Math.max(0, shown.samples.at(-1)!.t - status.t) / 3600
    : undefined;
  const hours = budget.endurance !== undefined ? budget.endurance / 3600 : undefined;
  const short = budget.demand - budget.available;

  return (
    <div className="cp-grid" data-cols="lead-side">
      <div className="cp-side">
        <Panel
          title="Power"
          aside="supply against demand"
          status={short > 0 ? 'warning' : 'nominal'}
          statusLine={
            preparing
              ? 'as set: nothing runs until you enter · every watt burns hydrogen and ends as heat'
              : budget.measured !== undefined
                ? `the ship reports ${whole(budget.measured)} W drawn`
                : undefined
          }
        >
          <BudgetBoard
            label="Electrical power"
            unit="W"
            sources={budget.sources
              .filter((s) => s.capacity > 0 || s.value > 0)
              .map((s) => ({ id: s.id, label: s.label, value: s.value, capacity: s.capacity }))}
            loads={loads}
            selected={selected}
            onSelect={(id) => {
              const first = budget.loads.find((l) => l.id === id)?.units[0];
              if (first) setSelected(first);
            }}
            shortfall="short: batteries bridge it"
            faders
          />
        </Panel>

        <details
          className="cp-fold"
          open={unitsOpen}
          onToggle={(event) => setUnitsOpen(event.currentTarget.open)}
        >
          <summary>
            every unit · {active.length} assemblies · modes, allocation, readings, condition
          </summary>
          {unitsOpen ? (
            <div className="cp-fold__body cp-units">
              <div className="cs-scroll" ref={list}>
                <ComponentList label="Equipment">
                  {active.map((e) => {
                    const s = ship.equipment[e.id];
                    const set = desk.unitSetting(e.id);
                    return (
                      <ComponentRow
                        key={e.id}
                        name={e.name}
                        mode={set?.mode ?? s?.mode ?? '—'}
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
              {spec ? (
                <div
                  ref={detail}
                  tabIndex={-1}
                  className="cs-anchor"
                  aria-label={`${spec.name} controls`}
                >
                  <Caption>
                    {spec.name} · {spec.kind}
                  </Caption>
                  <EquipmentDetail desk={desk} spec={spec} />
                </div>
              ) : (
                <p className="cs-note">choose an assembly</p>
              )}
            </div>
          ) : null}
        </details>
      </div>

      <div className="cp-side">
        <Panel title="What it buys" tone="forecast" aside="as set">
          {hours !== undefined ? (
            <LevelBar
              label="Endurance"
              value={hours}
              max={Math.max(48, hours * 1.15)}
              text={`${fixed(hours, 1)} h of reactants`}
              tone="forecast"
              status={planHours !== undefined && hours < planHours * 1.5 ? 'caution' : 'nominal'}
              {...(planHours !== undefined && planHours > 0
                ? {
                    marks: [{ at: planHours, kind: 'target' as const, label: 'the plan’s length' }],
                  }
                : {})}
            />
          ) : (
            <Line label="endurance">not given by the design</Line>
          )}
          {battery ? (
            <LevelBar
              label="Batteries"
              value={battery.value}
              max={battery.max}
              text={battery.text}
              status={battery.status}
            />
          ) : null}
          <LevelBar
            label="Fixes"
            value={fixes.rate}
            max={1}
            text={`${fixed(fixes.rate, 2)} per s`}
            tone="forecast"
            status={fixes.rate <= 0 ? 'caution' : 'nominal'}
          />
          <p className="cs-note">{fixes.limit}: more fixes narrow “tracking now” in the forecast</p>
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
          <Caption>buses</Caption>
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
        </Panel>

        <Panel title="Stores and configuration" aside={configurationName(ship.configuration)}>
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
          <Caption>configuration</Caption>
          <ModeChips
            label="Configuration"
            options={game.ship.configurations.map((c) => ({
              value: c.id,
              label: configurationName(c.name),
            }))}
            value={desk.configuration()}
            {...(ended ? {} : { onChange: (c: string) => desk.setConfiguration(c) })}
          />
          {preparing ? (
            <p className="cs-note">set now · the ship takes it up when you enter</p>
          ) : desk.configuration() !== ship.configuration ? (
            <p className="cs-note">moving to it</p>
          ) : null}
        </Panel>

        <RadiationPanel desk={desk} />
      </div>
    </div>
  );
}
