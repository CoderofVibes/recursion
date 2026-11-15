import { expect, it, vi } from 'vitest';
import { viewSnapshot } from '../contracts/fixtures/index.ts';
import type { SessionStatus } from '../game/belief/controls.ts';
import type { Mixer } from './mixer.ts';
import { playRoom } from './room.ts';

const operating: SessionStatus = {
  phase: 'operate',
  attemptId: 'attempt-0001',
  attemptIndex: 1,
  t: 3600,
  paused: false,
  warp: 1,
  warpSteps: [1, 10],
  saturated: false,
  coasting: false,
  frameBudget: 10,
  committing: false,
  attitude: 'free',
  alerts: [],
  departure: [],
  sightings: [],
  outcome: { kind: 'in-progress' },
  pending: 0,
};

function room() {
  const mixer = {
    hold: vi.fn<Mixer['hold']>(),
    bed: vi.fn<Mixer['bed']>(),
    shot: vi.fn<Mixer['shot']>(() => true),
    stopShots: vi.fn<Mixer['stopShots']>(),
    dispose: vi.fn<Mixer['dispose']>(),
  };
  return { mixer, play: playRoom(mixer, 'gravity-range', 24_000) };
}

const overlay = (stage?: string): HTMLElement =>
  ({ dataset: { stage }, hasAttribute: () => false }) as unknown as HTMLElement;

it('uses the radiation monitor in Twin Deeps and stops the texture when the caution clears', () => {
  const { mixer, play } = room();
  play(
    {
      ...operating,
      alerts: [
        {
          id: 'radiation-high',
          level: 'caution',
          source: 'radiation-monitor',
          reportedAt: 3600,
          validUntil: 3602,
          rate: 1,
          saturated: false,
          threshold: 0.5,
        },
      ],
    },
    viewSnapshot,
    overlay(),
    false,
  );
  expect(mixer.bed).toHaveBeenCalledWith('lattice-radiation', expect.any(Number));
  expect(mixer.bed.mock.calls.at(-1)?.[1]).toBeGreaterThan(0);
  play(operating, viewSnapshot, overlay(), false);
  expect(mixer.bed).toHaveBeenLastCalledWith('lattice-radiation', 0);
});

it('sounds the game forecast caution once and does not derive an advisory from the horizon', () => {
  const { mixer, play } = room();
  const expiredSnapshot = { ...viewSnapshot, forecasts: viewSnapshot.forecasts.slice(0, 1) };
  const end = expiredSnapshot.forecasts[0]!.samples.at(-1)!.t;
  const active = { ...operating, t: end + 1 };
  play({ ...active, t: end }, expiredSnapshot, overlay(), false);
  play(active, expiredSnapshot, overlay(), false);
  expect(mixer.shot).not.toHaveBeenCalled();

  const cautioned: SessionStatus = {
    ...active,
    alerts: [{ id: 'forecast-ended', level: 'caution', forecast: 'forecast-1', endedAt: end }],
  };
  play(cautioned, expiredSnapshot, overlay(), false);
  play(cautioned, expiredSnapshot, overlay(), false);
  expect(mixer.shot.mock.calls).toEqual([['caution']]);
});

it('plays the equipment cue for a surviving fault and leaves a fatal step to the loss sequence', () => {
  const { mixer, play } = room();
  const ended: SessionStatus = {
    ...operating,
    phase: 'ended',
    paused: true,
    outcome: { kind: 'lost', t: operating.t, cause: 'radiation' },
  };
  play(operating, viewSnapshot, overlay(), true);
  play(operating, viewSnapshot, overlay(), false);
  play(ended, viewSnapshot, overlay(), true);
  play(ended, viewSnapshot, overlay('start'), true);
  expect(mixer.shot.mock.calls).toEqual([['equipment-damage'], ['loss-failure']]);
});
