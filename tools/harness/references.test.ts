import { describe, expect, it } from 'vitest';
import { runReferenceChecks } from './references.ts';

describe('independent S8 reference through the production simulation', () => {
  it('matches stored epochs and converges while preserving reference/admission limits', () => {
    const report = runReferenceChecks();
    expect(report.passed, JSON.stringify(report.cases, null, 2)).toBe(true);
    expect(report.cases.map((x) => x.resolutions.map((r) => r.dt))).toEqual([
      [8, 4, 2],
      [8, 4, 2],
    ]);
    expect(report.cases[0]!.resolutions[2]!.samples.at(-1)!.t).toBe(242760);
    expect(report.cases[1]!.resolutions[2]!.samples.at(-1)!.t).toBe(14960);
    expect(report.cases.every((x) => x.convergence.passed)).toBe(true);
    expect(report.cases.every((x) => x.acceptedAtDtSeconds === 2 && x.resolutions[2]!.passed)).toBe(
      true,
    );
    expect(report.sourceFindings.kind).toBe('imported-study-findings-not-production-admission');
    expect(report.sourceFindings.rejected.candidate.admitted).toBe(false);
    expect(report.sourceFindings.rejected.strict_combined_rule).toMatchObject({
      rejected: 13,
      denominator: 13,
    });
    expect(report.sourceFindings.candidateOffsetsDegrees).toHaveLength(7);
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });
});
