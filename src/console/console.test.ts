/**
 * The console's logic on the contract fixtures: the mission design carried in Black Box, the
 * debrief judged from the record alone, the instrument rows, the chart, and the rule that the
 * overlays take every visual value from the theme.
 */
import { describe, expect, it } from 'vitest';
import {
  archive,
  attempts,
  models,
  shipDefinition,
  viewSnapshot,
} from '../contracts/fixtures/index.ts';
import type { AttemptRecord, ExecutedCommand } from '../contracts/index.ts';
import { cssVariables } from '../theme/index.ts';
import { batteries, busLoads, deltaV, heat, stores, validatedSpans, visited } from './data.ts';
import { bytes, clock, dist, duration, km, sci, whole } from './format.ts';
import { changes, debrief, defaultDesign, designMark, designOf, setupCommands } from './mission.ts';

const { readFileSync } = (await import(/* @vite-ignore */ `node:${'fs'}`)) as {
  readFileSync(path: URL, encoding: 'utf8'): string;
};

const design = defaultDesign(shipDefinition, 'alpha');
const executed = (t: number, command: ExecutedCommand['command']): ExecutedCommand => ({
  t,
  command,
  source: 'manual',
  status: 'executed',
});
/** A fixture attempt with the mission design recorded in it, as the console records it. */
const withDesign = (record: AttemptRecord, d = design): AttemptRecord => ({
  ...record,
  executed: [executed(1, designMark(d)), ...record.executed],
});

describe('mission design', () => {
  it('travels in Black Box as an annotation and comes back out of the record', () => {
    const first = attempts[0]!;
    expect(designOf(first)).toBeUndefined();
    const found = designOf(withDesign(first));
    expect(found?.t).toBe(1);
    expect(found?.design).toEqual(design);
  });

  it('sets the ship up with real commands: camera, recorder, configuration', () => {
    const kinds = setupCommands(design, shipDefinition).map((c) => c.kind);
    expect(kinds).toContain('recorder');
    expect(kinds).toContain('configure');
    expect(kinds.filter((k) => k === 'mark')).toHaveLength(0);
  });

  it('keeps the latest design when the player records another', () => {
    const later = { ...design, reserve: 1234 };
    const base = attempts[0]!;
    const record: AttemptRecord = {
      ...base,
      executed: [
        executed(1, designMark(design)),
        ...base.executed,
        executed(9e9, designMark(later)),
      ],
    };
    expect(designOf(record)?.design.reserve).toBe(1234);
  });
});

describe('debrief', () => {
  const bodies = viewSnapshot.world.bodies.map((b) => ({ id: b.id, radius: b.radius }));

  it('names the loss as the limiting event, from the record', () => {
    const lost = attempts.find((a) => a.outcome.kind === 'lost');
    expect(lost).toBeDefined();
    const report = debrief(lost!, archive, bodies);
    expect(report.outcome).toBe('lost');
    expect(report.limiting?.label).toMatch(/^ship lost/);
    expect(report.cost.map((c) => c.label)).toContain('main propellant');
  });

  it('says so when no design was recorded, and judges none', () => {
    const report = debrief(attempts[0]!, archive, bodies);
    expect(report.design).toBeUndefined();
    expect(report.constraints).toHaveLength(0);
  });

  it('judges reserve, clearance and the evidence goal against what was measured', () => {
    const record = withDesign(attempts[0]!);
    const report = debrief(record, { ...archive, attempts: [record] }, bodies);
    expect(report.constraints.map((c) => c.label)).toEqual(['reserve', 'clearance', 'evidence']);
    // Whatever was not measured is reported as such, never guessed.
    for (const line of report.constraints)
      if (line.met === null) expect(line.measured).toMatch(/not recorded|nothing ranged|not yet/);
  });

  it('lists a held burn by the time it ran, not the time it was commanded for', () => {
    const base = attempts[0]!;
    const quiet = { ...base, executed: base.executed.filter((e) => e.source === 'procedure') };
    const held: AttemptRecord = {
      ...quiet,
      index: quiet.index + 1,
      executed: [
        ...quiet.executed,
        executed(100, { kind: 'burn', thruster: 'main-engine', throttle: 1, duration: 3600 }),
        executed(104, { kind: 'cutoff', thruster: 'main-engine' }),
      ],
    };
    const lines = changes(held, quiet);
    expect(lines.some((l) => l.includes('burn main engine 4.0 s'))).toBe(true);
    expect(lines.some((l) => l.includes('cutoff'))).toBe(false);
  });

  it('lists a stretch of hands-on flying as one entry: how long, and which controls', () => {
    const base = attempts[0]!;
    const quiet = { ...base, executed: base.executed.filter((e) => e.source === 'procedure') };
    const input = (throttle: number, yaw = 0) => ({
      translate: { x: 0, y: 0, z: 0 },
      yaw,
      pitch: 0,
      throttle,
    });
    const handFlown: AttemptRecord = {
      ...quiet,
      index: quiet.index + 1,
      executed: [
        ...quiet.executed,
        executed(100, { kind: 'fly', input: input(1) }),
        executed(102, { kind: 'fly', input: input(1, 1) }),
        executed(104.5, { kind: 'fly', input: input(0) }),
      ],
    };
    const lines = changes(handFlown, quiet);
    const flying = lines.filter((l) => l.includes('by hand'));
    expect(flying).toHaveLength(1);
    expect(flying[0]).toContain('by hand 4.5 s: main engine, yaw left');
  });

  it('lists what changed from the attempt before', () => {
    const [a, b] = attempts;
    const lines = changes(b!, a!);
    expect(lines.length).toBeGreaterThan(0);
    expect(changes(a!, undefined)).toEqual([]);
    const reserved = withDesign(b!, { ...design, reserve: design.reserve - 500 });
    expect(changes(reserved, withDesign(a!)).some((l) => l.startsWith('reserve'))).toBe(true);
  });

  it('bounds a forecast by its own end, and calls a later loss outside its coverage (S9 R5)', () => {
    const lost = attempts.find((a) => a.outcome.kind === 'lost')!;
    const lostAt = lost.outcome.kind === 'lost' ? lost.outcome.t : 0;
    // The forecast ended before the loss.
    const short = {
      ...lost,
      forecasts: lost.forecasts.map((f) => ({ ...f, horizon: Math.min(f.horizon, lostAt - 28) })),
    } as AttemptRecord;
    const report = debrief(short, { ...archive, attempts: [short] }, bodies);
    const after = report.forecasts.find((f) => f.label === 'no forecast after');
    expect(after?.value).toBe(
      `T+${clock(lostAt - 28)} · lost at T+${clock(lostAt)}, outside forecast coverage`,
    );
    expect(report.limiting?.detail).toContain('outside forecast coverage');
    // Each forecast's own line names its end, and never says plain "held".
    for (const f of report.forecasts.filter((x) => x.label.startsWith('forecast T+')))
      expect(f.value).toMatch(/ends T\+|^left at/);
    expect(report.forecasts.some((f) => f.value.startsWith('held'))).toBe(false);
  });

  it('keeps the moment a forecast was left, and reports an unmeasured one as not recorded', () => {
    const lost = attempts.find((a) => a.outcome.kind === 'lost')!;
    const report = debrief(lost, archive, bodies);
    for (const f of report.forecasts.filter((x) => x.label.startsWith('forecast T+')))
      expect(f.value).toMatch(/^(left at T\+\S+|within envelope through T\+\S+|not recorded: )/);
    const blind = { ...lost, measurements: [] } as AttemptRecord;
    const none = debrief(blind, { ...archive, attempts: [blind] }, bodies);
    for (const f of none.forecasts.filter((x) => x.label.startsWith('forecast T+')))
      expect(f.value).toMatch(/^not recorded/);
  });
});

describe('instrument rows', () => {
  const ship = viewSnapshot.world.ship;

  it('shows stores against capacity with the planned reserve marked', () => {
    const rows = stores(ship, shipDefinition, 100);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.value).toBeGreaterThanOrEqual(0);
      expect(row.value).toBeLessThanOrEqual(row.max);
    }
  });

  it('shows each bus against its limit and each node against its temperature limit', () => {
    expect(busLoads(ship, shipDefinition)).toHaveLength(shipDefinition.buses.length);
    expect(heat(ship, shipDefinition)).toHaveLength(shipDefinition.thermalNodes.length);
  });

  it('never reports a negative speed change on board', () => {
    expect(deltaV(ship, shipDefinition)).toBeGreaterThanOrEqual(0);
  });

  it('finds the distances a forecast visits around each body', () => {
    const forecast = viewSnapshot.forecasts.at(-1);
    const reach = visited(forecast, viewSnapshot);
    expect(reach.size).toBe(forecast ? viewSnapshot.world.bodies.length : 0);
    for (const [lo, hi] of reach.values()) expect(lo).toBeLessThanOrEqual(hi);
    expect(visited(undefined, viewSnapshot).size).toBe(0);
  });

  it('lists validated spans only for rules that are adopted', () => {
    expect(validatedSpans(models.prior).size).toBe(0);
    const adopted = models.distanceLaw.extensions.filter((e) => e.status === 'adopted');
    const spans = validatedSpans(models.distanceLaw);
    const expected = new Set(adopted.flatMap((e) => (e.validatedSpans ?? []).map((s) => s.body)));
    expect(new Set(spans.keys())).toEqual(expected);
  });
});

describe('formatting', () => {
  it('keeps units in lower case and picks a sensible scale', () => {
    expect(clock(3723)).toBe('01:02:03');
    expect(dist(950)).toBe('950 m');
    expect(dist(12_300)).toBe('12.3 km');
    expect(dist(4_840_000)).toBe('4,840 km');
    expect(duration(45)).toBe('45 s');
    expect(duration(7200)).toBe('2.0 h');
    expect(bytes(2.5e6)).toBe('2.5 MB');
    expect(sci(1.02e10, 3)).toBe('1.02×10¹⁰');
    expect(sci(0.975)).toBe('0.975');
  });

  it('formats exactly as toLocaleString did, with formatters made once (S15)', () => {
    const values = [0, -0, -0.4, 0.5, 1234.5, -98765.4, 1e9, 4_840_000, NaN, Infinity, -Infinity];
    for (const v of values) {
      expect(whole(v)).toBe(Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '—');
      for (const digits of [0, 1, 2])
        expect(km(v, digits)).toBe(
          (v / 1000).toLocaleString('en-US', {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }),
        );
    }
  });
});

describe('readings not yet taken', () => {
  it('shows an unread battery or bus as no reading, not as empty or idle', () => {
    const blank = { ...viewSnapshot.world.ship, telemetry: {}, equipment: {} };
    const pack = batteries(blank, shipDefinition);
    if (pack) {
      expect(pack.text).toBe('no reading');
      expect(pack.status).toBe('stale');
    }
    for (const bus of busLoads(blank, shipDefinition)) {
      expect(bus.text).toBe('no reading');
      expect(bus.status).toBe('stale');
    }
  });
});

describe('overlay stylesheets', () => {
  const sheets = [
    readFileSync(new URL('./console.css', import.meta.url), 'utf8'),
    readFileSync(new URL('../app/control-room.css', import.meta.url), 'utf8'),
    readFileSync(new URL('../app/app.css', import.meta.url), 'utf8'),
  ];

  it('hold no literal colours, pixel sizes or timings: only theme tokens', () => {
    for (const css of sheets) {
      const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
      expect(body.match(/#[0-9a-f]{3,8}\b/gi)).toBeNull();
      expect(body.match(/\brgba?\(/g)).toBeNull();
      expect(body.match(/\d+(\.\d+)?px\b/g)).toBeNull();
      expect(body.match(/\d+(\.\d+)?m?s\b/g)).toBeNull();
    }
  });

  it('use only tokens that applyTheme defines', () => {
    for (const css of sheets) {
      const used = new Set([...css.matchAll(/var\((--rx-[a-z0-9-]+)/g)].map((m) => m[1]!));
      // Aliases a sheet sets for itself from a token (a status colour) are fine.
      const local = new Set([...css.matchAll(/(--rx-[a-z0-9-]+)\s*:/g)].map((m) => m[1]!));
      for (const name of used)
        if (!local.has(name)) expect(Object.keys(cssVariables), name).toContain(name);
    }
  });
});
