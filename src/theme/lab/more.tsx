/**
 * UI lab, second sheet: mode chips, toggle, alerts, the Black Box mark and gauges, first on the
 * contract fixtures and then in every state. Lab only.
 */
import { useState } from 'react';
import type { ReactElement } from 'react';
import { archive, shipDefinition, viewSnapshot } from '../../contracts/fixtures/index.ts';
import {
  Alert,
  AlertStack,
  BlackBoxMark,
  Gauge,
  LevelBar,
  ModeChips,
  Panel,
  Readout,
  ReadoutGrid,
  Toggle,
} from '../components/index.ts';
import type { AlertItem, BlackBoxState, Status, Tone } from '../components/index.ts';
import { equipmentRows, levels } from './data.ts';

/** Alerts the fixture snapshot would raise. */
function fixtureAlerts(): AlertItem[] {
  const out: AlertItem[] = [];
  for (const r of equipmentRows())
    if (r.status === 'caution')
      out.push({
        id: r.id,
        level: 'caution',
        text: r.name,
        detail: `CONDITION ${Math.round(r.condition * 100)} %`,
      });
  const beyond = viewSnapshot.forecasts[0]?.samples.find((s) => s.extrapolating);
  if (beyond)
    out.push({
      id: 'extrapolating',
      level: 'advisory',
      text: 'Forecast beyond sampled range',
      detail: `FROM T+${beyond.t} s`,
    });
  for (const lead of archive.leads)
    if (lead.status === 'noticed')
      out.push({ id: lead.id, level: 'advisory', text: 'Lead noticed', detail: lead.name });
  return out;
}

export function FixtureExtras(): ReactElement {
  const camera = shipDefinition.equipment.find((e) => e.kind === 'optical-tracker');
  const status = camera ? viewSnapshot.world.ship.equipment[camera.id] : undefined;
  const [mode, setMode] = useState(status?.mode ?? 'off');
  const [highRate, setHighRate] = useState(false);
  const lv = levels();
  const recorder = Object.values(viewSnapshot.world.ship.equipment).find(
    (e) => e.readings.sampleRate !== undefined,
  );
  return (
    <div className="lab-grid">
      <Panel title="Alerts" aside="from the fixtures">
        <AlertStack alerts={fixtureAlerts()} />
      </Panel>

      <Panel title="Black Box" aside="fixture: archive" tone="blackbox">
        <BlackBoxMark
          state={highRate ? 'recording' : 'idle'}
          detail={`ATTEMPT ${archive.attempts.length + 1}`}
        />
        <LevelBar
          label="Store"
          value={lv.recorder.value}
          max={lv.recorder.max}
          text={lv.recorder.text}
          tone="blackbox"
        />
        <ReadoutGrid columns={3}>
          <Readout label="Attempts held" value={archive.attempts.length} tone="blackbox" />
          <Readout label="Procedures" value={archive.procedures.length} tone="blackbox" />
          <Readout label="Sample rate" value={recorder?.readings.sampleRate ?? 0} unit="Hz" />
        </ReadoutGrid>
        <Toggle
          label="Recording"
          on={highRate}
          onChange={setHighRate}
          onText="REC"
          offText="HOLD"
          tone="blackbox"
        />
      </Panel>

      <Panel title="Margins" aside="telemetry">
        <div className="lab-row">
          <Gauge
            label={lv.bus.name}
            value={lv.bus.value}
            max={lv.bus.max}
            text={(lv.bus.value / 1000).toFixed(1)}
            unit="kW"
            marks={[{ at: lv.bus.max * 0.8, kind: 'caution' }]}
          />
          <Gauge label={lv.battery.name} value={lv.battery.value} max={lv.battery.max} />
          <Gauge
            label={lv.propellant.name}
            value={lv.propellant.value}
            max={lv.propellant.max}
            forecast={lv.propellant.value * 0.86}
            marks={[{ at: lv.propellant.max * 0.25, kind: 'warning' }]}
          />
        </div>
      </Panel>

      {camera && (
        <Panel title={camera.name} aside="mode">
          <ModeChips
            label={`${camera.name} mode`}
            options={camera.modes}
            value={mode}
            onChange={setMode}
          />
        </Panel>
      )}
    </div>
  );
}

const STATUSES: readonly Status[] = ['nominal', 'caution', 'warning', 'off', 'stale'];
const TONES: readonly Tone[] = ['measured', 'forecast', 'blackbox'];
const BBX: readonly BlackBoxState[] = ['recording', 'idle', 'full', 'off'];

export function MoreStates(): ReactElement {
  const [mode, setMode] = useState('track');
  const [on, setOn] = useState(true);
  return (
    <div className="lab-grid">
      <Panel title="Mode chips and toggle" aside="choose · read only · tones">
        <ModeChips
          label="Interactive"
          options={['off', 'standby', 'track', { value: 'detail', disabled: true }]}
          value={mode}
          onChange={setMode}
        />
        <ModeChips
          label="Read only"
          options={['stowed', 'radiators', 'solar', 'all out']}
          value="radiators"
        />
        {TONES.slice(1).map((t) => (
          <ModeChips
            key={t}
            label={t}
            options={['off', '180 W', '610 W']}
            value="180 W"
            tone={t}
            onChange={() => {}}
          />
        ))}
        <ModeChips
          label="Caution"
          options={['off', 'heater', 'ready']}
          value="heater"
          status="caution"
          onChange={() => {}}
        />
        <div className="lab-row">
          <Toggle label="Bus tie" on={on} onChange={setOn} onText="CLOSED" offText="OPEN" />
          <Toggle label="Heading-up" on={!on} onChange={(v) => setOn(!v)} />
          <Toggle label="Locked" on={false} />
        </div>
      </Panel>

      <Panel title="Alert" aside="three levels · a stack">
        <Alert level="advisory" text="Solar stowed" />
        <Alert level="caution" text="Radiators stowed" detail="REJECTION 3.2 kW" />
        <Alert level="warning" text="A-17" detail="CPA 9 km · T−6 s" />
        <AlertStack
          max={2}
          alerts={[
            { id: 'a', level: 'advisory', text: 'Lead noticed' },
            { id: 'b', level: 'warning', text: 'Main bus overload', detail: '7.9 / 7.5 kW' },
            { id: 'c', level: 'caution', text: 'Nav sigma rising' },
            { id: 'd', level: 'advisory', text: 'Loop B standby' },
          ]}
        />
      </Panel>

      <Panel title="Black Box mark" aside="every state">
        {BBX.map((s) => (
          <BlackBoxMark key={s} state={s} detail={s.toUpperCase()} />
        ))}
        <div className="lab-row">
          <BlackBoxMark label="" state="recording" />
          <BlackBoxMark label="FROM ATTEMPT 3" state="idle" />
        </div>
      </Panel>

      <Panel title="Gauge" aside="status and tone">
        <div className="lab-row">
          {STATUSES.map((s, i) => (
            <Gauge
              key={s}
              label={s}
              value={0.3 + i * 0.14}
              status={s}
              marks={[{ at: 0.8, kind: 'caution' }]}
            />
          ))}
        </div>
        <div className="lab-row">
          {TONES.map((t) => (
            <Gauge
              key={t}
              label={t}
              value={0.62}
              tone={t}
              forecast={t === 'measured' ? 0.45 : undefined}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
