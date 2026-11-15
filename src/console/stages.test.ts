/**
 * The console's spine: the six stages of the loop, in order, each saying in one line where it
 * stands. Worked out from plain facts, so each line is tested as a fact about the game.
 */
import { describe, expect, it } from 'vitest';
import { forecastDivergence } from '../blackbox/index.ts';
import { attempts } from '../contracts/fixtures/index.ts';
import type { AttemptRecord } from '../contracts/index.ts';
import { STAGE_LABEL, STAGE_ORDER, attemptInHand, attemptVerdict, stagesOf } from './stages.ts';
import type { StageFacts } from './stages.ts';

/** At arrival in a new region: nothing planned, nothing flown, nothing measured. */
const arrival: StageFacts = {
  region: 'Twin Deeps',
  objective: 'depart 50 m/s',
  power: { demand: 2865, endurance: 41.3 * 3600 },
  draft: 'empty',
  attempt: { index: 1, phase: 'prepare', t: 0, warp: 1, outcome: 'in-progress' },
  model: { version: 0, adopted: 0, attempts: 0 },
};
const stage = (facts: StageFacts, id: string) => stagesOf(facts).find((s) => s.id === id)!;

describe('the loop on the rail', () => {
  it('is the six stages in the order they are done, named as the tabs are', () => {
    const stages = stagesOf(arrival);
    expect(stages.map((s) => s.id)).toEqual([
      'exploration',
      'systems',
      'plan',
      'flight',
      'blackbox',
      'model',
    ]);
    expect(stages.map((s) => s.id)).toEqual([...STAGE_ORDER]);
    expect(stages.map((s) => s.label)).toEqual([
      'EXPLORATION',
      'SYSTEMS',
      'PLAN',
      'FLIGHT',
      'BLACK BOX',
      'MODEL',
    ]);
    // A26: the first stage is EXPLORATION everywhere; nothing is called MISSION.
    expect(Object.values(STAGE_LABEL)).not.toContain('MISSION');
  });

  it('at arrival says what is still to do, and never that anything was measured', () => {
    expect(stage(arrival, 'exploration')).toMatchObject({
      status: 'Twin Deeps · depart 50 m/s',
      state: 'now',
    });
    expect(stage(arrival, 'systems')).toMatchObject({
      status: '2,865 W · 41 h endurance',
      state: 'done',
    });
    expect(stage(arrival, 'plan')).toMatchObject({
      status: 'nothing planned · the ship coasts',
      state: 'todo',
    });
    expect(stage(arrival, 'flight')).toMatchObject({
      status: 'attempt 1 · at arrival',
      state: 'todo',
    });
    expect(stage(arrival, 'blackbox')).toMatchObject({
      status: 'nothing flown yet',
      state: 'todo',
    });
    expect(stage(arrival, 'model')).toMatchObject({
      status: 'nothing measured yet',
      state: 'todo',
    });
  });

  it('says a forecast that ends beyond the data does, before anything else about it', () => {
    const plan = stage(
      {
        ...arrival,
        draft: 'previewed',
        forecast: {
          draft: true,
          endsAt: 4 * 3600 + 43 * 60,
          endsBeyondData: true,
          pass: { name: 'Alpha', distance: 370_500, sigma: 44_600 },
        },
      },
      'plan',
    );
    expect(plan.status).toBe('ends T+04:43:00 · beyond the data');
    expect(plan.state).toBe('attention');
  });

  it('gives the pass a forecast inside its data predicts, with its uncertainty', () => {
    const facts: StageFacts = {
      ...arrival,
      draft: 'previewed',
      forecast: {
        draft: true,
        endsAt: 5 * 3600 + 49 * 60,
        endsBeyondData: false,
        pass: { name: 'Alpha', distance: 125_000, sigma: 13_000 },
      },
    };
    // A draft is still in hand; once committed the stage is done.
    expect(stage(facts, 'plan')).toMatchObject({
      status: 'Alpha 125.0 km ±13.0 km',
      state: 'now',
    });
    expect(stage({ ...facts, draft: 'committed' }, 'plan').state).toBe('done');
    expect(stage({ ...facts, forecast: { ...facts.forecast!, draft: false } }, 'plan').state).toBe(
      'done',
    );
  });

  it('says a draft with no forecast yet is not previewed', () => {
    expect(stage({ ...arrival, draft: 'edited' }, 'plan')).toMatchObject({
      status: 'draft · not previewed',
      state: 'now',
    });
  });

  it('raises PLAN when the forecast in force has run out, over whatever it said', () => {
    const plan = stage(
      {
        ...arrival,
        attempt: { ...arrival.attempt, phase: 'operate', t: 20_100, warp: 1 },
        forecastEnded: true,
        forecast: { draft: false, endsAt: 20_100, endsBeyondData: false },
      },
      'plan',
    );
    expect(plan.status).toBe('the forecast has ended · plan what comes next');
    expect(plan.state).toBe('attention');
  });

  it('in flight shows ship time and the warp, and counts exploration done', () => {
    const facts: StageFacts = {
      ...arrival,
      attempt: { index: 2, phase: 'operate', t: 3600, warp: 60, outcome: 'in-progress' },
    };
    expect(stage(facts, 'flight')).toMatchObject({ status: 'T+01:00:00 · 60×', state: 'now' });
    expect(stage(facts, 'exploration').state).toBe('done');
    expect(
      stage({ ...facts, attempt: { ...facts.attempt, phase: 'ended', outcome: 'lost' } }, 'flight'),
    ).toMatchObject({ status: 'attempt 2 · lost', state: 'done' });
  });

  it('raises SYSTEMS on an alert from the ship, in its words', () => {
    expect(stage({ ...arrival, shipAlert: '▲ power low' }, 'systems')).toMatchObject({
      status: '▲ power low',
      state: 'attention',
    });
    // Demand with no endurance to give is just the demand.
    expect(stage({ ...arrival, power: { demand: 15 } }, 'systems').status).toBe('15 W');
  });

  it('says of the last flight whether it stayed within its forecast, and by how much it did not', () => {
    const within = { index: 2, leftAt: null, worstSigmas: 2.8, lost: false };
    expect(stage({ ...arrival, compared: within }, 'blackbox')).toMatchObject({
      status: 'attempt 2 · within its forecast',
      state: 'done',
    });
    expect(
      stage(
        { ...arrival, compared: { ...within, index: 1, leftAt: 19_900, worstSigmas: 3.24 } },
        'blackbox',
      ),
    ).toMatchObject({ status: 'attempt 1 · off by 3.2σ', state: 'attention' });
    // A loss is said as a loss, whatever the forecast.
    expect(stage({ ...arrival, compared: { ...within, lost: true } }, 'blackbox')).toMatchObject({
      status: 'attempt 2 · lost',
      state: 'attention',
    });
  });

  it('raises MODEL while the measured pull slopes against the law, until a rule is adopted', () => {
    const measured = { version: 8, adopted: 0, attempts: 2 };
    expect(stage({ ...arrival, model: measured }, 'model')).toMatchObject({
      status: 'model v8 · 2 attempts',
      state: 'done',
    });
    const sloped = stage({ ...arrival, model: { ...measured, slope: -0.5 } }, 'model');
    expect(sloped.status).toMatch(/^slope .0\.50 · the law does not fit$/);
    expect(sloped.state).toBe('attention');
    // A slope too small to tell from flat raises nothing.
    expect(stage({ ...arrival, model: { ...measured, slope: 0.04 } }, 'model').state).toBe('done');
    expect(
      stage({ ...arrival, model: { version: 9, adopted: 1, attempts: 2, slope: -0.5 } }, 'model'),
    ).toMatchObject({ status: 'law adopted · model v9', state: 'done' });
    expect(
      stage({ ...arrival, model: { version: 12, adopted: 2, attempts: 3 } }, 'model').status,
    ).toBe('2 rules adopted · model v12');
  });
});

describe('the attempt in hand', () => {
  const current = attempts.at(-1)!;
  const withForecast: AttemptRecord = current.forecasts.length
    ? current
    : { ...current, forecasts: attempts.find((a) => a.forecasts.length)!.forecasts };
  const none: AttemptRecord = { ...current, forecasts: [] };

  it('is the one being flown once it has a forecast to be read against', () => {
    const status = { phase: 'operate', attemptId: current.id };
    expect(attemptInHand([withForecast], status)).toBe(withForecast);
    // Before it is entered, or with nothing forecast, the last flight is the one to read.
    expect(attemptInHand([withForecast], { ...status, phase: 'prepare' })).toBeUndefined();
    expect(attemptInHand([none], status)).toBeUndefined();
    expect(attemptInHand([withForecast], { ...status, attemptId: 'another' })).toBeUndefined();
  });
});

describe('where a flight left its forecasts', () => {
  const record = attempts.find((a) => a.forecasts.length > 0)!;

  it('is the earliest moment any of its forecasts was left, and the worst miss of all', () => {
    const each = record.forecasts.map((f) => forecastDivergence(f, record));
    const left = each
      .map((d) => d.firstBeyond3Sigma)
      .filter((t): t is number => t !== null)
      .sort((a, b) => a - b)[0];
    const verdict = attemptVerdict(record);
    expect(verdict.leftAt).toBe(left ?? null);
    expect(verdict.worstSigmas).toBe(Math.max(0, ...each.map((d) => d.maxSigmas ?? 0)));
  });

  it('is worked out once for a record as it stands, and again when it has grown', () => {
    const first = attemptVerdict(record);
    expect(attemptVerdict(record)).toBe(first);
    const grown: AttemptRecord = {
      ...record,
      measurements: [...record.measurements, record.measurements.at(-1)!],
    };
    expect(attemptVerdict(grown)).not.toBe(first);
  });
});
