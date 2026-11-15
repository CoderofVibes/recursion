/** Display-only evidence contract. No field definitions, seed, or truth geometry cross here. */
import type { Vec3 } from '../../../contracts/index.ts';
import type {
  LatticeVolume,
  LatticeEvidence,
  LatticeStrand,
  LatticeCoverage,
  LatticeThreat,
  LatticeVisual,
} from '../../../contracts/lattice-coverage.ts';
export type {
  LatticeVolume,
  LatticeEvidence,
  LatticeStrand,
  LatticeCoverage,
  LatticeThreat,
  LatticeVisual,
  LatticeServiceValidity,
  LatticeClearCoverageCertificate,
  LatticeCoverageProvenance,
  LatticeQualifiedCoverageCertificate,
} from '../../../contracts/lattice-coverage.ts';

const record = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const positive = (x: unknown): x is number => finite(x) && x > 0;
const vector = (x: unknown): x is Vec3 => record(x) && finite(x.x) && finite(x.y) && finite(x.z);
const ids = (x: unknown): x is readonly string[] =>
  Array.isArray(x) &&
  x.length > 0 &&
  x.every((id: unknown) => typeof id === 'string' && id.length > 0);
const volume = (x: unknown): x is LatticeVolume =>
  record(x) &&
  vector(x.center) &&
  vector(x.halfSize) &&
  x.halfSize.x > 0 &&
  x.halfSize.y > 0 &&
  x.halfSize.z > 0;
const evidence = (x: unknown): x is LatticeEvidence =>
  record(x) &&
  ids(x.sampleIds) &&
  finite(x.observedFrom) &&
  finite(x.observedTo) &&
  finite(x.validUntil) &&
  x.observedFrom <= x.observedTo &&
  x.observedTo <= x.validUntil;

/** Fail closed. Malformed evidence never gets a geometry fallback. */
export function readLatticeVisual(input: unknown): LatticeVisual | null {
  if (
    !record(input) ||
    input.schema !== 'lattice-observations-v1' ||
    typeof input.frameId !== 'string' ||
    input.frameId.length === 0 ||
    typeof input.attemptId !== 'string' ||
    input.attemptId.length === 0 ||
    !finite(input.updatedAt) ||
    typeof input.enabled !== 'boolean' ||
    !finite(input.quality) ||
    input.quality < 0 ||
    input.quality > 1 ||
    !volume(input.requestedVolume) ||
    !Array.isArray(input.strands) ||
    !Array.isArray(input.coverage)
  )
    return null;
  const strands: LatticeStrand[] = [];
  for (const strand of input.strands) {
    if (
      !record(strand) ||
      !evidence(strand) ||
      typeof strand.id !== 'string' ||
      !Array.isArray(strand.points) ||
      strand.points.length < 2 ||
      !strand.points.every(vector) ||
      !finite(strand.sigmaM) ||
      strand.sigmaM < 0 ||
      !finite(strand.confidence) ||
      strand.confidence <= 0 ||
      strand.confidence > 1
    )
      continue;
    strands.push(strand as unknown as LatticeStrand);
  }
  const coverage: LatticeCoverage[] = [];
  for (const patch of input.coverage) {
    if (
      !record(patch) ||
      !volume(patch) ||
      typeof patch.id !== 'string' ||
      !['unobserved', 'unresolved', 'clear-supported'].includes(String(patch.status))
    )
      continue;
    if (!evidence(patch)) continue;
    const c = patch.certificate;
    const certified =
      record(c) &&
      c.calibrated === true &&
      c.confidenceSigmas === 3 &&
      positive(c.resolutionM) &&
      finite(c.undetectedSupportM) &&
      c.undetectedSupportM >= 0 &&
      ids(c.sampleIds);
    coverage.push({
      ...(patch as unknown as LatticeCoverage),
      status:
        patch.status === 'clear-supported' && !certified
          ? 'unresolved'
          : (patch.status as LatticeCoverage['status']),
    });
  }
  const threat = input.threat;
  const processing = input.processing;
  const goodProcessing =
    record(processing) &&
    finite(processing.reportedAt) &&
    finite(processing.validUntil) &&
    processing.reportedAt <= processing.validUntil &&
    typeof processing.available === 'boolean';
  const goodThreat =
    record(threat) &&
    evidence(threat) &&
    typeof threat.componentId === 'string' &&
    typeof threat.name === 'string' &&
    vector(threat.position) &&
    finite(threat.sigmaM) &&
    threat.sigmaM >= 0 &&
    finite(threat.marginM);
  return {
    schema: 'lattice-observations-v1',
    frameId: input.frameId,
    attemptId: input.attemptId,
    updatedAt: input.updatedAt,
    enabled: input.enabled,
    quality: input.quality,
    ...(goodProcessing
      ? { processing: processing as unknown as NonNullable<LatticeVisual['processing']> }
      : {}),
    requestedVolume: input.requestedVolume,
    strands,
    coverage,
    ...(goodThreat ? { threat: threat as unknown as LatticeThreat } : {}),
    ...(typeof input.limitation === 'string' ? { limitation: input.limitation } : {}),
  };
}

/** An allocation switch is a request. Only a fresh report establishes active processing. */
export function latticeIsLive(data: LatticeVisual, now: number): boolean {
  return (
    data.enabled &&
    data.processing !== undefined &&
    data.processing.available &&
    data.processing.reportedAt <= now &&
    now <= data.processing.validUntil
  );
}

export function coverageState(patch: LatticeCoverage, now: number): LatticeCoverage['status'] {
  if (patch.observedTo > now || patch.validUntil < now) return 'unresolved';
  return patch.status;
}

export function containsVolume(outer: LatticeVolume, inner: LatticeVolume): boolean {
  return (['x', 'y', 'z'] as const).every(
    (axis) =>
      Math.abs(inner.center[axis] - outer.center[axis]) + inner.halfSize[axis] <=
      outer.halfSize[axis],
  );
}
