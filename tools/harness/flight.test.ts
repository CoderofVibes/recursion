import { expect, it } from 'vitest';
import { runFlight } from './flight.ts';
import type { FlightCase } from './scenarios.ts';

const flight: FlightCase = {
  id: 'replay-powered-sensing',
  seed: 'harness-replay',
  mode: 'recorder-model',
  duration: 120,
  expected: 'survive-window',
  knowledge: 'Briefing and acquired packets only',
  controls: [
    { at: 0, command: { kind: 'recorder', sampleRate: 0.1 } },
    { at: 10, command: { kind: 'burn', thruster: 'main-engine', throttle: 0.2, duration: 5 } },
    { at: 60, command: { kind: 'configure', configuration: 'stowed' } },
  ],
};

it('replays acquired records, controls, resources and physical RNG state exactly', async () => {
  const one = await runFlight(flight);
  const two = await runFlight(flight);
  expect(one).toEqual(two);
  expect(one.modelError).toBeNull();
  expect(one.expectationMatched).toBe(true);
  expect(one.metrics.resources.main.consumedKg).toBeGreaterThan(0);
  expect(one.metrics.observations.packets).toBeGreaterThan(0);
});

it('refuses fractional control epochs instead of silently skipping a command', async () => {
  await expect(
    runFlight({ ...flight, controls: [{ at: 0.5, command: { kind: 'mark', label: 'invalid' } }] }),
  ).rejects.toThrow('on a tick');
});
