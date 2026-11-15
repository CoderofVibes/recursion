import { beforeAll, describe, expect, it } from 'vitest';
import { runIntegrationChecks } from './integration.ts';

describe('production harness integration', () => {
  let report: Awaited<ReturnType<typeof runIntegrationChecks>>;
  beforeAll(async () => {
    report = await runIntegrationChecks();
  }, 120_000);

  it('replays production ticks, measurements and RNG exactly after a JSON checkpoint during an active burn', () => {
    const check = report.checks.find((item) => item.id === 'truth-json-resume')!;
    expect(check.status).toBe('pass');
    expect(check.evidence.continuedHash).toBe(check.evidence.resumedHash);
    expect(check.evidence.tickResultsHash).toBe(check.evidence.replayTickResultsHash);
    const checkpoint = check.evidence.checkpoint as {
      activeBurns: unknown[];
      rngStreams: string[];
    };
    expect(checkpoint.activeBurns.length).toBeGreaterThan(0);
    expect(checkpoint.rngStreams.length).toBeGreaterThan(0);
  });

  it('preserves physical state and real recorder/model results through warp grouping', () => {
    const check = report.checks.find((item) => item.id === 'warp-batching')!;
    expect(check.status).toBe('pass');
    expect(check.evidence).toMatchObject({
      exactTruth: true,
      exactRecords: true,
      exactModel: true,
      finalTime: 180,
    });
  });

  it('reports actual COMMIT behavior without treating a blocked A12 check as compliance', () => {
    const check = report.checks.find((item) => item.id === 'a12-commit')!;
    const progressed = Number(check.evidence.ticksWhilePending) >= 1;
    expect(check.status).toBe(progressed ? 'pass' : 'blocked');
    expect(check.evidence.ticksAfterRelease).toBe(1);
    expect(check.evidence.forecastFrozen).toBe(true);
    if (!progressed) expect(check.evidence.dependency).toContain('2F');
  });

  it('keeps hidden truth changes out of an otherwise identical issued preview', () => {
    const check = report.checks.find((item) => item.id === 'forecast-truth-independence')!;
    expect(check.status).toBe('pass');
    const hashes = check.evidence.truthHashes as string[];
    expect(hashes[0]).not.toBe(hashes[1]);
  });

  it('executes every available operation at 1x and distinguishes missing integration coverage', () => {
    expect(report.checks.filter((item) => item.status === 'fail')).toEqual([]);
    for (const id of [
      'a12-preview',
      'a12-rule-test',
      'a12-fit-handover',
      'a12-comparison',
      'a12-configuration',
    ]) {
      expect(report.checks.find((item) => item.id === id)?.status).toBe('pass');
    }
    for (const id of ['full-session-save-resume', 'a12-browser-shell', 'a12-sustainable-transit']) {
      expect(report.checks.find((item) => item.id === id)?.status).toBe('blocked');
    }
    expect(() => JSON.stringify(report)).not.toThrow();
  });
});
