/** Display-only evidence contract. No field definitions, seed, or truth geometry cross here. */
import type { Vec3 } from '../../../contracts/index.ts';

export interface LatticeVolume {
  readonly center: Vec3;
  readonly halfSize: Vec3;
}

export interface LatticeEvidence {
  readonly sampleIds: readonly string[];
  readonly observedFrom: number;
  readonly observedTo: number;
  readonly validUntil: number;
}

export interface LatticeStrand extends LatticeEvidence {
  readonly id: string;
  /** Only connected support actually observed, never a completed periodic grid. */
  readonly points: readonly Vec3[];
  readonly sigmaM: number;
  readonly confidence: number;
}

export interface LatticeCoverage extends LatticeVolume, LatticeEvidence {
  readonly id: string;
  readonly status: 'unobserved' | 'unresolved' | 'clear-supported';
  readonly reason?: string;
  /** Required separately from a strand fit: fitted corners cannot certify empty space. */
  readonly certificate?: {
    readonly calibrated: true;
    readonly confidenceSigmas: 3;
    readonly resolutionM: number;
    readonly undetectedSupportM: number;
    readonly sampleIds: readonly string[];
  };
}

export interface LatticeThreat extends LatticeEvidence {
  readonly componentId: string;
  readonly name: string;
  readonly position: Vec3;
  readonly sigmaM: number;
  readonly marginM: number;
}

export interface LatticeVisual {
  readonly schema: 'lattice-observations-v1';
  /** Explicit current-run relative frame; an archive cannot masquerade as a current map. */
  readonly frameId: string;
  readonly attemptId: string;
  readonly updatedAt: number;
  readonly enabled: boolean;
  readonly quality: number;
  /** Commanded sensing volume, never the true field's bounds. */
  readonly requestedVolume: LatticeVolume;
  readonly strands: readonly LatticeStrand[];
  readonly coverage: readonly LatticeCoverage[];
  readonly threat?: LatticeThreat;
  readonly limitation?: string;
}

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
    requestedVolume: input.requestedVolume,
    strands,
    coverage,
    ...(goodThreat ? { threat: threat as unknown as LatticeThreat } : {}),
    ...(typeof input.limitation === 'string' ? { limitation: input.limitation } : {}),
  };
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
