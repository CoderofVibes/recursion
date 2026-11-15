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
import { registerEncounterPanel } from './encounterPanels.ts';
import { testVerdict } from './pages/ModelPage.tsx';
import type { ExtensionRecord } from '../model/index.ts';

const pending = <T,>(): Promise<T> => new Promise<T>(() => undefined);

function stubGame(
  options: {
    model?: ModelState;
    snapshot?: ViewSnapshot;
    ended?: boolean;
    /** Before the encounter is entered: nothing runs, and ship time is zero. */
    preparing?: boolean;
    alerts?: readonly object[];
    radiation?: object;
  } = {},
) {
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
      phase: options.preparing ? 'prepare' : options.ended ? 'ended' : 'operate',
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
      alerts: options.alerts ?? [],
      ...(options.radiation ? { radiation: options.radiation } : {}),
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

const PAGES: readonly PageId[] = ['exploration', 'plan', 'model', 'blackbox', 'systems', 'credits'];

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

  it("shows the radiation monitor's dose rate and its caution on SYSTEMS (A24)", () => {
    const t = viewSnapshot.t;
    const reading = {
      source: 'flight-cpu-a',
      t: t - 0.5,
      rate: 0.03,
      sigma: 0.0006,
      saturated: false,
      saturationRate: 25,
      validUntil: t + 1.5,
      threshold: 0.02,
    };
    const caution = { id: 'radiation-high', level: 'caution', rate: 0.03, threshold: 0.02 };
    const { game } = stubGame({ radiation: reading, alerts: [caution] });
    const desk = new Desk(game);
    desk.page = 'systems';
    const html = renderToStaticMarkup(<ConsoleScreen desk={desk} visible />);
    expect(html).toContain('Radiation');
    expect(html).toContain('0.0300 ± 0.0006');
    expect(html).toContain('dose rate above the hazard threshold');
    expect(html).toContain('0.0200 U');
    // No reading yet: said so, never a zero.
    const quiet = new Desk(stubGame().game);
    quiet.page = 'systems';
    const none = renderToStaticMarkup(<ConsoleScreen desk={quiet} visible />);
    expect(none).toContain('no reading');
    expect(none).not.toContain('0.0000');
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
    // The test as its steps: what it is fitted on, and the attempt held out to check it, which
    // is never among those it is fitted on.
    const step = (label: string): string | undefined =>
      new RegExp(`${label}</span><span class="cp-steps__value">([^<]*)<`).exec(html)?.[1];
    if (finished.length >= 2) {
      const held = finished.at(-1)!;
      const training = finished.filter((x) => x.id !== held.id);
      expect(step('Check on')).toBe(`attempt ${held.index}`);
      expect(step('Fit on')).toBe(
        `attempt${training.length > 1 ? 's' : ''} ${training.map((x) => x.index).join(', ')}`,
      );
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

  it('gives the model’s own reason for a held-out test, where the test carries one (2C)', () => {
    const base = {
      state: { id: 'distance-law', status: 'candidate' },
      training: ['attempt-0001'],
      heldOut: 'attempt-0002',
    } as unknown as ExtensionRecord;
    const why =
      'Most of the misfit is in the held-out attempt’s burn (T+0:10 to T+0:11): the model can’t explain that burn, so this attempt can’t judge the rule.';
    const failed = {
      ...base,
      adoptable: false,
      heldOutTest: {
        pass: false,
        TperNu: 4.2,
        threshold: 1.12,
        diagnosis: { cause: 'burn', why },
      },
    } as unknown as ExtensionRecord;
    // The reason replaces the old words; the result itself stays short.
    expect(testVerdict(failed, false)).toEqual({
      text: 'fails its held-out test',
      status: 'caution',
      why,
    });
    // A pass says why it passed, too; a test saved before the model gave reasons has none.
    const agrees = 'The held-out attempt agrees with the rule within its measurement noise.';
    const passed = {
      ...base,
      adoptable: true,
      heldOutTest: {
        pass: true,
        TperNu: 1.0,
        threshold: 1.12,
        diagnosis: { cause: 'consistent', why: agrees },
      },
    } as unknown as ExtensionRecord;
    expect(testVerdict(passed, false)).toEqual({
      text: 'passes · not adopted',
      status: 'nominal',
      why: agrees,
    });
    expect(testVerdict(passed, true)?.why).toBe(agrees);
    expect(
      testVerdict({ ...failed, heldOutTest: { pass: false } } as unknown as ExtensionRecord, false),
    ).toEqual({ text: 'fails: the held-out attempt departs from it', status: 'caution' });

    // On the page: the result in the test's third step, the reason under the steps in full.
    const { game } = stubGame({ model: models.prior });
    const desk = new Desk(game);
    desk.page = 'model';
    desk.tests.set('distance-law', failed);
    const html = renderToStaticMarkup(<ConsoleScreen desk={desk} visible />);
    expect(html).toContain('<span class="cp-steps__value">fails its held-out test</span>');
    expect(html).toContain(`<p class="cs-why" data-status="caution">${why}</p>`);
    expect(html).not.toContain('departs from it');
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

/** Every element carrying `marker` in its opening tag. */
const tags = (html: string, marker: string): string[] =>
  (html.match(/<[a-z]+ [^>]*>/g) ?? []).filter((tag) => tag.includes(marker));

describe('the loop on the console', () => {
  const render = (
    page: PageId,
    options: Parameters<typeof stubGame>[0] = {},
    prepare?: (desk: Desk) => void,
  ) => {
    const stub = stubGame(options);
    const desk = new Desk(stub.game);
    desk.page = page;
    prepare?.(desk);
    return { html: renderToStaticMarkup(<ConsoleScreen desk={desk} visible />), desk, ...stub };
  };

  it('names the six stages in order on the rail, each a button saying where it stands (A26)', () => {
    const { html } = render('plan');
    const stages = tags(html, 'class="ci-rail__stage"');
    expect(stages).toHaveLength(6);
    expect(stages.every((tag) => tag.startsWith('<button type="button"'))).toBe(true);
    const names = stages.map((tag) => /aria-label="([^":]+): [^"]+"/.exec(tag)?.[1]);
    expect(names).toEqual(['EXPLORATION', 'SYSTEMS', 'PLAN', 'FLIGHT', 'BLACK BOX', 'MODEL']);
    // The page in hand is the one stage marked; nothing on the console is called MISSION.
    expect(stages.filter((tag) => tag.includes('aria-current="step"'))).toHaveLength(1);
    expect(stages[2]).toContain('aria-current="step"');
    expect(html).not.toContain('MISSION');
  });

  it('offers a burn every direction, across the motion among them, on chips the keyboard steps', () => {
    const { html } = render('plan', {}, (desk) =>
      desk.editPlan((e) => ({
        ...e,
        burns: [
          {
            key: desk.newRowKey(),
            at: 600,
            direction: 'left',
            target: briefing.knownBodies[0]!.id,
            offset: 0,
            sizing: 'deltaV',
            amount: 12.5,
            throttle: 1,
          },
        ],
      })),
    );
    for (const label of [
      'PROGRADE',
      'RETROGRADE',
      'TOWARD',
      'AWAY',
      'STEER',
      '◂ LEFT',
      'RIGHT ▸',
      '▴ UP',
      '▾ DOWN',
      'AXIS',
    ])
      expect(html).toContain(`>${label}</button>`);
    // The direction chosen is the one chip checked, and it is said in words what it means.
    expect(html).toMatch(/aria-checked="true"[^>]*>◂ LEFT</);
    expect(html).toContain('across the ship’s motion as it is now: to its left');
    // Each of a burn's settings is a bar to pull and a figure to type: when it fires, how
    // much, how hard. All of them take the keyboard.
    const sliders = tags(html, 'role="slider"');
    expect(sliders.map((tag) => /aria-label="([^"]+)"/.exec(tag)?.[1])).toEqual([
      'Fires in',
      'Speed change',
      'Throttle',
    ]);
    expect(sliders.every((tag) => tag.includes('tabindex="0"'))).toBe(true);
    expect(html).toContain('aria-valuetext="12.5 m/s"');
    expect(tags(html, 'type="number"').map((tag) => /aria-label="([^"]+)"/.exec(tag)?.[1])).toEqual(
      ['Fires in, s', 'Speed change, m/s', 'Throttle, %'],
    );
  });

  it('steers a burn by a body or by a place the objective says to reach', () => {
    const snapshot = {
      ...viewSnapshot,
      objectives: [
        {
          id: 'cross',
          kind: 'reach-region',
          label: 'CROSS-TRANSFER',
          region: { center: { x: 4e8, y: 3e8, z: 1e8 }, radius: 1000 },
        },
      ],
    } as unknown as ViewSnapshot;
    const { html } = render('plan', { snapshot }, (desk) =>
      desk.editPlan((e) => ({
        ...e,
        burns: [
          {
            key: desk.newRowKey(),
            at: 600,
            direction: 'steer',
            target: 'objective:cross',
            offset: 0,
            sizing: 'deltaV',
            amount: 12.5,
            throttle: 1,
          },
        ],
      })),
    );
    expect(html).toMatch(/aria-checked="true"[^>]*>STEER</);
    expect(html).toContain('turns the path toward it');
    // What it can be steered by: every body, then every place to reach, the chosen one selected.
    const select =
      /<span class="cs-field__label">Steer toward<\/span><select[^>]*>(.*?)<\/select>/.exec(
        html,
      )![1]!;
    const options = [...select.matchAll(/<option value="([^"]+)"( selected="")?>([^<]+)</g)].map(
      (m) => ({ value: m[1], chosen: m[2] !== undefined, label: m[3] }),
    );
    expect(options.map((o) => o.value)).toEqual([
      ...viewSnapshot.world.bodies.map((b) => b.id),
      'objective:cross',
    ]);
    expect(options.find((o) => o.chosen)).toEqual({
      value: 'objective:cross',
      chosen: true,
      label: 'CROSS-TRANSFER',
    });
    // It has a side to steer to, so nothing says otherwise.
    expect(html).not.toContain('there is no side to steer to');
  });

  it('keeps PREVIEW, COMMIT and CUTOFF under the chart, outside the column that scrolls', () => {
    const { html } = render('plan');
    const strip = html.indexOf('class="cp-commit"');
    expect(strip).toBeGreaterThan(html.indexOf('class="cp-hero"'));
    expect(strip).toBeLessThan(html.lastIndexOf('class="cp-side"'));
    const after = html.slice(strip, html.lastIndexOf('class="cp-side"'));
    for (const label of ['PREVIEW', 'COMMIT', 'CUTOFF'])
      expect(after).toContain(`>${label}</button>`);
    // Once, each: they are not also down in the burn list.
    for (const label of ['PREVIEW', 'COMMIT', 'CUTOFF'])
      expect(html.split(`>${label}</button>`)).toHaveLength(2);
    // Procedures and Recall stay on the page, folded: a summary the keyboard opens.
    expect(html).toMatch(
      /<details class="cp-fold"><summary>procedures · \d+ saved · recall<\/summary>/,
    );
  });

  it('before the encounter offers the way in on EXPLORATION, and never once inside', () => {
    const before = render('exploration', { preparing: true }).html;
    expect(before).toContain('RECORD DESIGN AND SET UP');
    // On the page and in the footer.
    expect(before.split(`ENTER ${briefing.name}`)).toHaveLength(3);
    expect(before).toContain('the design is recorded when you enter');
    expect(before).toContain('ci-chart');
    const inside = render('exploration').html;
    expect(inside).not.toContain(`ENTER ${briefing.name}`);
    expect(inside).toContain('RECORD DESIGN AND SET UP');
  });

  it('before the encounter shows the power as set, on faders the keyboard can pull', () => {
    const { html, commands } = render('systems', { preparing: true }, (desk) =>
      desk.setUnit('comms', { mode: 'on' }),
    );
    expect(html).toContain('as set: nothing runs until you enter');
    const faders = tags(html, 'role="slider"');
    expect(faders.length).toBeGreaterThan(0);
    expect(faders.every((tag) => tag.includes('tabindex="0"'))).toBe(true);
    // A setting made here is on the desk, not with the ship.
    expect(commands).toEqual([]);
    // Inside, the page says nothing of waiting.
    expect(render('systems').html).not.toContain('nothing runs until you enter');
  });

  it('keeps every unit a fold away, and draws that list only once it is opened', () => {
    const { html } = render('systems');
    // The fold is there to open, with how many units it holds; closed, none of them is drawn
    // (the page is redrawn five times a second: S15's views).
    expect(html).toMatch(
      /<details class="cp-fold"><summary>every unit · \d+ assemblies · modes, allocation, readings, condition<\/summary><\/details>/,
    );
    expect(html).not.toContain('aria-label="Equipment"');
    // The loads the player sets are still on the board, outside the fold.
    expect(tags(html, 'role="slider"').length).toBeGreaterThan(0);
  });

  it('leads BLACK BOX with the flight as measured, over the attempt before, and keeps RECALL in sight', () => {
    const { html } = render('blackbox');
    expect(html).toContain('the flight as measured against its forecast, seen from');
    expect(html).toContain('class="ci-chart__trail"');
    expect(html).toMatch(/class="ci-chart__trail" data-previous=""/);
    expect(html).toContain('Predicted against flown');
    // Recall is not folded away: it comes before the first fold on the page.
    expect(html.indexOf('>RECALL</button>')).toBeGreaterThan(0);
    expect(html.indexOf('>RECALL</button>')).toBeLessThan(html.indexOf('<details'));
    // Compare and the recorder's store are still here.
    expect(html).toContain('aria-label="Compare"');
    expect(html).toMatch(/<summary>recorder · /);
  });

  it('names a body the model has measured nothing of, and draws no empty plot for it', () => {
    const model: ModelState = {
      ...models.distanceLaw,
      calibration: [
        ...models.distanceLaw.calibration,
        { ...models.distanceLaw.calibration[0]!, body: 'beta', windows: [] },
      ],
    };
    const { html } = render('model', { model });
    expect(html.split('<figure')).toHaveLength(2);
    expect(html).toContain('nothing measured yet of Beta');
    expect(html).not.toContain('nothing measured, nothing drawn');
    // The questions that cost fits are folded, and still there to ask.
    expect(html).toContain('>CHECK BURNS</button>');
    expect(html).toContain('>FIND UNEXPLAINED PULL</button>');
  });

  it('reads the plan’s forecast against a place to reach, and points the chart at it (R51)', () => {
    const end = viewSnapshot.forecasts.at(-1)!.samples.at(-1)!;
    const objective = (center: { x: number; y: number; z: number }, radius: number) =>
      ({
        ...viewSnapshot,
        objectives: [
          {
            id: 'forward',
            kind: 'reach-region',
            label: 'FORWARD TRANSIT',
            region: { center, radius },
          },
        ],
      }) as unknown as ViewSnapshot;
    // Far off: the forecast says how near it comes, and the chart points the way.
    const far = render('plan', { snapshot: objective({ x: 4e8, y: 3e8, z: 0 }, 1000) }).html;
    expect(far).toContain('against the objective');
    expect(far).toMatch(
      /forward transit<\/span><span class="cs-line__value">comes within [\d,.]+ km ±[\d,.]+ k?m · T\+\d\d:\d\d:\d\d</,
    );
    expect(far).toMatch(/class="ci-chart__pointer".*>FORWARD TRANSIT · [\d,.]+ km<\/text>/);
    // Where the forecast ends inside it, it is said to be reached, as a plain fact.
    const there = render('plan', {
      snapshot: objective({ x: end.position.x, y: end.position.y, z: end.position.z ?? 0 }, 5000),
    }).html;
    expect(there).toMatch(
      /forward transit<\/span><span class="cs-line__value">reached T\+\d\d:\d\d:\d\d · position ±[\d,.]+ k?m</,
    );
    expect(there).not.toContain('comes within');
  });

  it('reads a departure where the plan’s forecast ends: how fast, and how far out', () => {
    const snapshot = {
      ...viewSnapshot,
      objectives: [
        {
          id: 'depart',
          kind: 'depart',
          label: 'DEPART 50 M/S',
          depart: { beyond: 9_000_000, minSpeed: 50 },
        },
      ],
    } as unknown as ViewSnapshot;
    const { html } = render('plan', { snapshot });
    expect(html).toContain('against the objective');
    expect(html).toContain('against the objective · where the forecast ends');
    // What the objective needs is said once; each bar then carries only its own figure.
    expect(html).toContain('50 m/s outward, beyond 9,000 km');
    // (A ship heading back in, or short of the speed, is a caution, and the bar says so.)
    expect(html).toMatch(
      /aria-label="Speed out"[^>]*aria-valuetext="[\d,.]+ m\/s( · inward)?(, caution)?"/,
    );
    expect(html).toMatch(/aria-label="Distance out"[^>]*aria-valuetext="[\d,.]+ km ±[\d,.]+ k?m"/);
    // With no objective of either kind, the panel claims nothing about one.
    expect(render('plan').html).not.toContain('against the objective');
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

  it("mounts the encounter's own panel beside FLIGHT, its commands through the ship's channel (R4)", () => {
    const { game, commands } = stubGame();
    let send: ((c: readonly unknown[]) => void) | undefined;
    registerEncounterPanel(briefing.id, ({ command }) => {
      send = command as (c: readonly unknown[]) => void;
      return <p>ENCOUNTER PANEL HERE</p>;
    });
    const html = renderToStaticMarkup(
      <FlightHud
        desk={new Desk(game)}
        available={{ throttle: true, yaw: true, pitch: true, translate: true }}
        headingUp
        range={1_500_000}
        onHeadingUp={() => undefined}
      />,
    );
    expect(html).toContain('ENCOUNTER PANEL HERE');
    send?.([
      { kind: 'mode', equipment: 'camera', mode: 'detail' },
      { kind: 'recorder', sampleRate: 10 },
    ]);
    expect(commands).toEqual([
      { kind: 'mode', equipment: 'camera', mode: 'detail' },
      { kind: 'recorder', sampleRate: 10 },
    ]);
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
