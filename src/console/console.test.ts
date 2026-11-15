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
import {
  batteries,
  busLoads,
  deltaV,
  departProgress,
  heat,
  hullReach,
  nearestClearance,
  objectiveLine,
  recorderEstimate,
  spendable,
  stores,
  validatedSpans,
  visited,
} from './data.ts';
import { bytes, clock, configurationName, dist, duration, km, sci, whole } from './format.ts';
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

  it('names what the ship ranged as the briefing does, not by its id', () => {
    const record = withDesign(attempts[0]!);
    const text = (named: typeof bodies) => {
      const report = debrief(record, { ...archive, attempts: [record] }, named);
      return [
        ...report.constraints.map((c) => c.measured),
        ...report.forecasts.map((f) => f.value),
      ].join(' | ');
    };
    const ranged = bodies.filter((b) => text(bodies).includes(`from ${b.id}`));
    expect(ranged.length).toBeGreaterThan(0);
    const renamed = bodies.map((b) => ({ ...b, name: `The ${b.id} throat` }));
    for (const b of ranged) {
      expect(text(renamed)).toContain(`from The ${b.id} throat`);
      expect(text(renamed)).not.toContain(`from ${b.id}`);
    }
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

  it('states an objective by its conditions, not only its name', () => {
    const ship = { x: 0, y: 0, z: 0 };
    const reach = objectiveLine(
      {
        id: 'forward',
        kind: 'reach-region',
        label: 'Forward transit',
        region: { center: { x: 300_000, y: 400_000, z: 0 }, radius: 20_000 },
      },
      0,
      ship,
    );
    // 500 km to the centre, so the edge is 480 km off; the sphere is 40 km across.
    expect(reach).toEqual({
      label: 'reach',
      text: 'Forward transit · a region 40.0 km across, 480.0 km from the ship',
    });
    const inside = objectiveLine(
      { id: 'here', kind: 'reach-region', label: 'Here', region: { center: ship, radius: 5 } },
      0,
      ship,
    );
    expect(inside.text).toBe('Here · a region 10 m across, around the ship');
    // The Gravity range's departure reads as before.
    const depart = objectiveLine(
      {
        id: 'depart',
        kind: 'depart',
        label: 'DEPART 50 M/S',
        depart: { beyond: 9_000_000, minSpeed: 50 },
        maxDeltaV: 16,
      },
      0,
      ship,
    );
    expect(depart).toEqual({
      label: 'depart',
      text: 'DEPART 50 M/S · 50 m/s from the centre of mass, beyond 9,000 km · at most 16 m/s spent on leaving',
    });
    expect(objectiveLine({ id: 'c', kind: 'custom', label: 'Hold' }, 2, ship)).toEqual({
      label: 'objective 3',
      text: 'Hold',
    });
  });

  it('names a configuration in words, however the ship spells it', () => {
    expect(configurationName('allDeployed')).toBe('all deployed');
    expect(configurationName('radiators')).toBe('radiators');
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

describe('margin to act (S8)', () => {
  it("takes the whole hull's reach off a distance, not the centre of mass", () => {
    const reach = hullReach(viewSnapshot.ship);
    expect(reach).toBeGreaterThan(0);
    const near = nearestClearance(viewSnapshot);
    expect(near).not.toBeNull();
    const all = [
      ...viewSnapshot.world.bodies.map((b) => ({ p: b.position, r: b.radius })),
      ...viewSnapshot.world.asteroids.map((a) => ({ p: a.position, r: a.radius })),
    ];
    const s = viewSnapshot.world.ship.position;
    const best = Math.min(
      ...all.map(({ p, r }) => Math.hypot(p.x - s.x, p.y - s.y, (p.z ?? 0) - (s.z ?? 0)) - r),
    );
    expect(near!.clearance).toBeCloseTo(best - reach, 6);
  });

  it('counts only the propellant above the reserve as something to spend', () => {
    const ship = viewSnapshot.world.ship;
    const none = spendable(ship, shipDefinition, 1e9);
    expect(none).toEqual({ kg: 0, deltaV: 0 });
    const some = spendable(ship, shipDefinition, 0);
    expect(some.deltaV).toBeCloseTo(deltaV(ship, shipDefinition), 6);
  });
});

describe('estimates that match the ship (S20)', () => {
  it('prices a recorder rate as the ship does, and never promises more than a sample a second', () => {
    const def = {
      ...shipDefinition,
      systems: {
        recorder: {
          minimumSampleRate: 1,
          normalSampleRate: 10,
          highSampleRate: 50,
          powerMinimum: 15,
          powerNormal: 35,
          powerHigh: 100,
          bytesPerSample: 256,
        },
      },
    } as typeof shipDefinition;
    expect(recorderEstimate(0.05, def).watts).toBe(15);
    expect(recorderEstimate(0.2, def).watts).toBe(15);
    expect(recorderEstimate(1, def).watts).toBe(15);
    expect(recorderEstimate(10, def).watts).toBe(35);
    expect(recorderEstimate(0, def).watts).toBe(0);
    expect(recorderEstimate(10, def).samplesPerSecond).toBe(1);
    expect(recorderEstimate(0.2, def).bytesPerSecond).toBeCloseTo(0.2 * 256, 9);
  });

  it('measures departure from the believed centre of mass, weighted by the model GM', () => {
    const ship = {
      ...viewSnapshot.world.ship,
      position: { x: 3, y: 0, z: 0 },
      velocity: { x: 0, y: 5, z: 0 },
    };
    const bodies = [
      {
        ...viewSnapshot.world.bodies[0]!,
        id: 'a',
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 1, z: 0 },
      },
      {
        ...viewSnapshot.world.bodies[0]!,
        id: 'b',
        position: { x: 4, y: 0, z: 0 },
        velocity: { x: 0, y: -1, z: 0 },
      },
    ];
    const snapshot = {
      world: { ...viewSnapshot.world, ship, bodies },
      objectives: [
        { id: 'd', kind: 'depart', label: 'DEPART', depart: { beyond: 9e6, minSpeed: 50 } },
      ],
    } as unknown as Parameters<typeof departProgress>[0];
    const model = {
      parameters: [
        { id: 'body.a.mu', value: 3 },
        { id: 'body.b.mu', value: 1 },
      ],
    } as unknown as Parameters<typeof departProgress>[1];
    const p = departProgress(snapshot, model)!;
    // Centre of mass at x = 1, moving at +0.5 in y.
    expect(p.distance).toBeCloseTo(2, 9);
    expect(p.speed).toBeCloseTo(4.5, 9);
    expect(p.minSpeed).toBe(50);
    // Without a GM for every body there is no frame to state.
    expect(departProgress(snapshot, { parameters: [] } as never)).toBeNull();
  });
});
