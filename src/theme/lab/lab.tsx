/**
 * UI lab (dev only): the theme's primitives and 3D materials on the contract fixtures, so the
 * owner can tune the look before, and beside, the real console. Not part of the production build.
 * Run `npm run dev` and open /src/theme/lab/index.html.
 */
import { StrictMode, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import {
  ComponentList,
  ComponentRow,
  LevelBar,
  Panel,
  Readout,
  ReadoutGrid,
  Schematic,
  Trend,
} from '../components/index.ts';
import type { Status, Tone } from '../components/index.ts';
import { applyTheme, colour, lineStyles, type } from '../index.ts';
import {
  equipmentRows,
  levels,
  modelView,
  powerSchematic,
  rangeTrend,
  residualTrend,
} from './data.ts';
import { FixtureExtras, MoreStates } from './more.tsx';
import { mountScene } from './scene.ts';
import type { LabScene } from './scene.ts';
import './lab.css';

applyTheme(document.documentElement);

const STATUSES: readonly Status[] = ['nominal', 'caution', 'warning', 'off', 'stale'];
const TONES: readonly Tone[] = ['measured', 'forecast', 'blackbox'];
const WAVE = Array.from(
  { length: 40 },
  (_, i) => 50 + 18 * Math.sin(i / 4) + 6 * Math.sin(i * 1.7),
);

function Fixtures(): ReactElement {
  const [selected, setSelected] = useState<string | undefined>('opt-nav');
  const range = rangeTrend();
  const residual = residualTrend();
  const lv = levels();
  const rows = equipmentRows();
  const model = modelView();
  const diagram = powerSchematic();
  const chosen = rows.find((r) => r.id === selected);
  return (
    <div className="lab-grid">
      <Panel title="Track" aside="fixture: viewSnapshot" statusLine={`Range to ${range.body}`}>
        <Trend
          title={`Range to ${range.body}`}
          unit="km"
          value={range.value}
          data={range.data}
          forecast={range.forecast}
          forecastBand={range.band}
          previous={range.previous}
          limits={[{ at: range.surface, kind: 'warning' }]}
        />
        <Trend
          title="Off the issued forecast"
          unit="km"
          value={residual.value}
          data={residual.data}
          limits={[{ at: residual.limit, kind: 'caution' }]}
          status={residual.status}
          min={0}
        />
      </Panel>

      <Panel title="Stores and load" aside="telemetry">
        <LevelBar
          label={lv.bus.name}
          value={lv.bus.value}
          max={lv.bus.max}
          text={lv.bus.text}
          marks={[{ at: lv.bus.max * 0.8, kind: 'caution', label: 'continuous rating' }]}
        />
        <LevelBar
          label={lv.battery.name}
          value={lv.battery.value}
          max={lv.battery.max}
          text={lv.battery.text}
        />
        <LevelBar
          label={lv.propellant.name}
          value={lv.propellant.value}
          max={lv.propellant.max}
          text={lv.propellant.text}
          forecast={lv.propellant.value * 0.86}
          marks={[{ at: lv.propellant.max * 0.25, kind: 'warning', label: 'reserve' }]}
        />
        <LevelBar
          label={lv.recorder.name}
          value={lv.recorder.value}
          max={lv.recorder.max}
          text={lv.recorder.text}
          tone="blackbox"
        />
      </Panel>

      <Panel title="Model" aside={`v ${model.version}`} tone="forecast">
        <ReadoutGrid columns={2}>
          {model.parameters.map((p) => (
            <Readout
              key={p.label}
              label={p.label}
              value={p.value}
              unit={p.unit}
              sigma={p.sigma}
              size="body"
            />
          ))}
        </ReadoutGrid>
        {model.parameters.map((p) => (
          <LevelBar
            key={p.label}
            label={p.label}
            value={p.support}
            text={`${Math.round(p.support * 100)} % from data`}
            tone="forecast"
            status={p.support < 0.3 ? 'caution' : 'nominal'}
          />
        ))}
        <ReadoutGrid columns={2}>
          <Readout label={`Coast residual · n ${model.coast.n}`} value={model.coast.rms} unit="m" />
          <Readout
            label={`Powered residual · n ${model.powered.n}`}
            value={model.powered.rms}
            unit="m"
          />
        </ReadoutGrid>
      </Panel>

      <Panel title="Power" aside="fixture: shipDefinition">
        <Schematic
          label="Main bus one-line diagram"
          cols={diagram.cols}
          rows={diagram.rows}
          nodes={diagram.nodes}
          links={diagram.links}
          selected={selected}
          onSelect={setSelected}
        />
      </Panel>

      <Panel title="Equipment" aside={String(rows.length)}>
        <ComponentList label="Equipment">
          {rows.map((r) => (
            <ComponentRow
              key={r.id}
              name={r.name}
              mode={r.mode}
              value={r.value}
              status={r.status}
              tone={r.kind === 'recorder' ? 'blackbox' : 'measured'}
              selected={r.id === selected}
              onSelect={() => setSelected(r.id === selected ? undefined : r.id)}
            />
          ))}
        </ComponentList>
      </Panel>

      {chosen && (
        <Panel
          title={chosen.name}
          aside={chosen.kind}
          tone={chosen.kind === 'recorder' ? 'blackbox' : 'measured'}
          status={chosen.status}
          statusLine={
            chosen.status === 'nominal' ? chosen.mode : `${chosen.mode} · ${chosen.status}`
          }
        >
          <LevelBar
            label="Draw"
            value={chosen.draw}
            max={Math.max(chosen.rated, chosen.allocation, 1)}
            text={`${chosen.draw} / ${chosen.allocation} W`}
            marks={[{ at: chosen.allocation, kind: 'limit', label: 'allocated' }]}
          />
          <LevelBar
            label="Condition"
            value={chosen.condition}
            text={`${Math.round(chosen.condition * 100)} %`}
            status={chosen.status === 'caution' ? 'caution' : 'nominal'}
          />
          <ReadoutGrid columns={3}>
            <Readout label="Mode" value={chosen.mode.toUpperCase()} />
            <Readout label="Allocated" value={chosen.allocation} unit="W" />
            <Readout label="Rated" value={chosen.rated} unit="W" />
          </ReadoutGrid>
        </Panel>
      )}
    </div>
  );
}

function States(): ReactElement {
  return (
    <div className="lab-grid">
      <Panel title="Level bar" aside="every status">
        {STATUSES.map((s, i) => (
          <LevelBar
            key={s}
            label={s}
            value={0.25 + i * 0.15}
            status={s}
            marks={[{ at: 0.8, kind: 'caution' }]}
            forecast={i === 0 ? 0.6 : undefined}
          />
        ))}
        {TONES.map((t) => (
          <LevelBar key={t} label={t} value={0.55} tone={t} />
        ))}
      </Panel>
      <Panel title="Trend" aside="status and tone">
        {(['nominal', 'caution', 'stale'] as const).map((s) => (
          <Trend
            key={s}
            title={s}
            unit="K"
            value="295"
            data={WAVE}
            status={s}
            limits={[{ at: 72, kind: 'caution' }]}
          />
        ))}
        <Trend title="blackbox" value="37" unit="%" data={WAVE} tone="blackbox" />
      </Panel>
      <Panel title="Readout" aside="sizes and status">
        <ReadoutGrid columns={2}>
          {(['body', 'value', 'readout', 'display'] as const).map((s) => (
            <Readout key={s} label={s} value="1,443" unit="W" size={s} />
          ))}
          {STATUSES.slice(1).map((s) => (
            <Readout key={s} label={s} value="313" unit="K" status={s} />
          ))}
          {TONES.slice(1).map((t) => (
            <Readout key={t} label={t} value="690" unit="m/s" sigma="12" tone={t} />
          ))}
        </ReadoutGrid>
      </Panel>
      <Panel title="Component row" aside="every status">
        <ComponentList label="Row states">
          {STATUSES.map((s) => (
            <ComponentRow
              key={s}
              name={`Pump ${s}`}
              mode={s === 'off' ? 'OFF' : 'ACTIVE'}
              value="120 W"
              status={s}
            />
          ))}
          <ComponentRow name="Black Box" mode="REC" value="35 W" tone="blackbox" selected />
        </ComponentList>
      </Panel>
    </div>
  );
}

function View3d(): ReactElement {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scene = useRef<LabScene | null>(null);
  const [compare, setCompare] = useState(false);
  const [validated, setValidated] = useState(false);
  const [quality, setQuality] = useState(1);
  useEffect(() => {
    if (!canvas.current) return undefined;
    const s = mountScene(canvas.current);
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);
  useEffect(() => scene.current?.setCompare(compare), [compare]);
  useEffect(() => scene.current?.setValidated(validated), [validated]);
  useEffect(() => scene.current?.setLatticeQuality(quality), [quality]);
  return (
    <div className="lab-view">
      <canvas ref={canvas} className="lab-view__canvas" />
      <div className="lab-view__controls">
        <label>
          <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} />{' '}
          earlier attempt
        </label>
        <label>
          <input
            type="checkbox"
            checked={validated}
            onChange={(e) => setValidated(e.target.checked)}
          />{' '}
          validated span
        </label>
        <label>
          lattice quality{' '}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </label>
      </div>
      <ul className="lab-legend">
        {Object.entries(lineStyles).map(([name, s]) => (
          <li key={name}>
            <svg viewBox="0 0 40 8" aria-hidden="true">
              <line
                x1={0}
                y1={4}
                x2={40}
                y2={4}
                stroke={s.colour}
                strokeWidth={s.width}
                strokeOpacity={s.opacity}
                strokeDasharray={'dash' in s && s.dash ? s.dash.join(' ') : undefined}
              />
            </svg>
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tokens(): ReactElement {
  return (
    <div className="lab-tokens">
      <ul className="lab-swatches">
        {Object.entries(colour).map(([name, c]) => (
          <li key={name}>
            <i style={{ background: c }} />
            <span>{name}</span>
            <code>{c}</code>
          </li>
        ))}
      </ul>
      <ul className="lab-type">
        {Object.entries(type.size).map(([name, px]) => (
          <li key={name} style={{ fontSize: px }}>
            {name} {px} · 1,443 W · T+00:41:07
          </li>
        ))}
      </ul>
    </div>
  );
}

function Lab(): ReactElement {
  return (
    <main className="lab">
      <header className="lab-head">
        <h1>UI LAB · NIGHT WATCH</h1>
        <p>Dev only. The theme&apos;s primitives and 3D materials on the contract fixtures.</p>
      </header>
      <h2>Primitives on the fixtures</h2>
      <Fixtures />
      <FixtureExtras />
      <h2>Every state</h2>
      <States />
      <MoreStates />
      <h2>3D materials on the fixture snapshot</h2>
      <View3d />
      <h2>Tokens</h2>
      <Tokens />
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');
const host = window as unknown as { rxLabRoot?: Root };
host.rxLabRoot ??= createRoot(root);
host.rxLabRoot.render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
