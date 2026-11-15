/**
 * Every console page and every instrument panel beside a hologram renders from the contract
 * fixtures, with the game stubbed behind `GameControls`: the pages work before, and apart from,
 * the live loop.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  archive,
  attempts,
  briefing,
  models,
  shipDefinition,
  viewSnapshot,
  viewSnapshotCompare,
} from '../contracts/fixtures/index.ts';
import type { ModelState, ViewSnapshot } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';
import type { MapHolo } from '../view3d/map/MapHolo.ts';
import type { ShipHolo } from '../view3d/ship/ShipHolo.ts';
import { ConsoleScreen } from './ConsoleScreen.tsx';
import { Desk } from './desk.ts';
import type { PageId } from './desk.ts';
import { FlightHud } from './FlightHud.tsx';
import { MapPlate } from './MapPlate.tsx';
import { designMark, defaultDesign } from './mission.ts';
import { ShipPanels } from './ShipPanels.tsx';
import { testVerdict } from './pages/ModelPage.tsx';
import type { ExtensionRecord } from '../model/index.ts';

const pending = <T,>(): Promise<T> => new Promise<T>(() => undefined);

function stubGame(options: { model?: ModelState; snapshot?: ViewSnapshot; ended?: boolean } = {}) {
  const commands: unknown[] = [];
  const current = attempts.at(-1)!;
  const game = {
    briefing,
    ship: shipDefinition,
    model: { state: () => options.model ?? models.distanceLaw },
    blackBox: {
      archive: () => archive,
      attempt: (id: string) => archive.attempts.find((a) => a.id === id),
    },
    rules: { report: pending, test: pending, adopt: pending, revoke: pending },
    status: () => ({
      phase: options.ended ? 'ended' : 'operate',
      attemptId: current.id,
      attemptIndex: current.index,
      t: viewSnapshot.t,
      paused: false,
      warp: 60,
      warpSteps: [1, 10, 60, 300, 1000, 2000],
      saturated: false,
      committing: false,
      outcome: options.ended ? current.outcome : { kind: 'in-progress' },
      pending: 0,
    }),
    snapshot: () => options.snapshot ?? viewSnapshot,
    chart: () => ({
      regions: [
        {
          id: briefing.id,
          name: briefing.name,
          position: { x: 0, y: 0, z: 0 },
          radius: 2e7,
          surveyed: 0,
          current: true,
          attempts: [{ index: 1, outcome: 'in-progress' }],
        },
      ],
      corridors: [],
      leads: [
        {
          id: 'lead-1',
          name: 'Faint source',
          from: briefing.id,
          direction: { x: 0, y: 1, z: 0 },
          spread: 0.1,
        },
      ],
    }),
    command: (c: unknown) => void commands.push(c),
    setPaused: () => undefined,
    setWarp: () => undefined,
    setCompare: () => undefined,
    preview: pending,
    commit: pending,
  } as unknown as GameControls;
  return { game, commands };
}

const PAGES: readonly PageId[] = ['mission', 'plan', 'model', 'blackbox', 'systems', 'credits'];

describe('console pages on the fixtures', () => {
  for (const page of PAGES)
    it(`renders ${page}`, () => {
      const { game } = stubGame();
      const desk = new Desk(game);
      desk.page = page;
      const html = renderToStaticMarkup(<ConsoleScreen desk={desk} visible />);
      expect(html).toContain('rx-panel');
      expect(html).not.toContain('NaN');
      expect(html).not.toContain('undefined');
    });

  it('renders the model page before anything has been learned', () => {
    const { game } = stubGame({ model: models.prior });
    const desk = new Desk(game);
    desk.page = 'model';
    const html = renderToStaticMarkup(<ConsoleScreen desk={desk} visible />);
    // No rule is in force yet: the page offers a test, never a revoke.
    expect(html).toContain('DISTANCE LAW');
    expect(html).not.toContain('REVOKE');
  });

  it('offers BEGIN AGAIN, not RECALL, once the attempt has ended', () => {
    const { game } = stubGame({ ended: true });
    const desk = new Desk(game);
    desk.page = 'blackbox';
    const html = renderToStaticMarkup(<ConsoleScreen desk={desk} visible />);
    expect(html).toContain('BEGIN AGAIN');
  });

  it('links the licence and notices under the deployment base (S13)', () => {
    const { game } = stubGame();
    const desk = new Desk(game);
    desk.page = 'credits';
    const html = renderToStaticMarkup(<ConsoleScreen desk={desk} visible />);
    const base = import.meta.env.BASE_URL;
    for (const file of ['LICENSE', 'NOTICE', 'THIRD-PARTY-NOTICES.txt'])
      expect(html).toContain(`href="${base}${file}"`);
    expect(html).toContain('#what-we-verified');
  });

  it('mounts no page while the screen is down', () => {
    const { game } = stubGame();
    const html = renderToStaticMarkup(<ConsoleScreen desk={new Desk(game)} visible={false} />);
    expect(html).not.toContain('rx-panel');
  });

  it('says how many attempts are finished and what the next test fits and checks (S9 R6, R7)', () => {
    const { game } = stubGame();
    const desk = new Desk(game);
    desk.page = 'model';
    const html = renderToStaticMarkup(<ConsoleScreen desk={desk} visible />);
    const finished = archive.attempts.filter((a) => a.outcome.kind !== 'in-progress');
    expect(html).toContain('finished attempts');
    if (finished.length >= 2) {
      const held = finished.at(-1)!;
      expect(html).toContain(`check on attempt ${held.index}`);
      expect(html).not.toContain(`attempt${finished.length > 2 ? 's' : ''} ${held.index} ·`);
    } else expect(html).toContain('test unavailable');
    // The data behind the plot can be read without it.
    expect(html).toContain('cs-table');
  });

  it('words a test result before its statistics, and never as ready when it is not', () => {
    const base = {
      state: { id: 'distance-law', status: 'candidate' },
      training: ['a1'],
      heldOut: 'a2',
    } as unknown as ExtensionRecord;
    expect(testVerdict(undefined, false)).toBeNull();
    expect(testVerdict(undefined, true)?.text).toBe('adopted');
    expect(testVerdict({ error: 'no fittable arc' }, false)?.text).toBe('no test: no fittable arc');
    expect(testVerdict({ ...base, adoptable: true }, false)).toEqual({
      text: 'passes · not adopted',
      status: 'nominal',
    });
    const fails = {
      ...base,
      adoptable: false,
      heldOutTest: { pass: false },
    } as unknown as ExtensionRecord;
    expect(testVerdict(fails, false)?.text).toMatch(/^fails/);
    const weak = {
      ...base,
      adoptable: false,
      heldOutTest: { pass: true },
      evidence: { evidence: false, deltaCost: 1, penalty: 9 },
    } as unknown as ExtensionRecord;
    expect(testVerdict(weak, false)).toEqual({
      text: 'insufficient evidence: the fit does not beat its penalty',
      status: 'caution',
    });
  });

  it('records the design and sets the ship up through commands only', () => {
    const { game, commands } = stubGame();
    const desk = new Desk(game);
    desk.commitDesign();
    expect(commands[0]).toEqual(
      designMark(defaultDesign(shipDefinition, briefing.knownBodies[0]!.id)),
    );
    expect(commands.length).toBeGreaterThan(1);
    expect(desk.designedAt).toBe(viewSnapshot.t);
  });
});

describe('instruments beside the holograms', () => {
  it('renders the flight instruments, with and without the two-attempt overlay', () => {
    for (const snapshot of [viewSnapshot, viewSnapshotCompare]) {
      const { game } = stubGame({ snapshot });
      const html = renderToStaticMarkup(
        <FlightHud
          desk={new Desk(game)}
          available={{ throttle: true, yaw: true, pitch: false, translate: false }}
          headingUp
          range={1_500_000}
          onHeadingUp={() => undefined}
        />,
      );
      expect(html).toContain('Margins');
      expect(html).not.toContain('NaN');
    }
  });

  it('renders each ship system beside the drawing', () => {
    const systems = [
      { id: 'power', name: 'POWER' },
      { id: 'thermal', name: 'THERMAL' },
      { id: 'propulsion', name: 'PROPULSION' },
      { id: 'guidance', name: 'GUIDANCE' },
      { id: 'data', name: 'DATA' },
      { id: 'life', name: 'LIFE SUPPORT' },
      { id: 'structure', name: 'STRUCTURE' },
    ];
    for (const system of [null, ...systems.map((s) => s.id)]) {
      const first = shipDefinition.equipment[0]!;
      const holo = {
        systems,
        parts: () => [{ id: first.id, system: system ?? 'power', name: first.name }],
        system: () => system,
        selected: () => (system ? first.id : null),
        config: () => shipDefinition.defaultConfiguration,
        onChange: () => () => undefined,
      } as unknown as ShipHolo;
      const { game } = stubGame();
      const html = renderToStaticMarkup(<ShipPanels desk={new Desk(game)} holo={holo} />);
      expect(html).toContain('rx-panel');
      expect(html).not.toContain('NaN');
    }
  });

  it('renders the map plate for the charted region, and for a chosen lead', () => {
    const holo = { selected: () => null, onChange: () => () => undefined } as unknown as MapHolo;
    const { game } = stubGame();
    const html = renderToStaticMarkup(
      <MapPlate desk={new Desk(game)} holo={holo} region={false} onRegion={() => undefined} />,
    );
    expect(html).toContain('ENTER REGION');
    // The charted objects as a list the keyboard can use (S9 R13): the region and the lead.
    expect(html).toContain('LEAD · FAINT SOURCE');
    const onLead = {
      selected: () => ({ kind: 'lead', id: 'lead-1' }),
      onChange: () => () => undefined,
    } as unknown as MapHolo;
    const lead = renderToStaticMarkup(
      <MapPlate desk={new Desk(game)} holo={onLead} region={false} onRegion={() => undefined} />,
    );
    expect(lead).toContain('Faint source');
    expect(lead).toContain('unknown');
  });
});
