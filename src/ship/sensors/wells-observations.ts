/** Recorded data codec; safe for the model to import without truth or physics. */
import type { Measurement } from '../../contracts/measurements.ts';
import type {
  WellAppearancePhase,
  WellCameraFrame,
  WellImageCovariance,
} from '../../contracts/wells-acquisition.ts';
import type { Vec3 } from '../../lib/vec3.ts';
import { cross, distance, dot, length } from '../../lib/vec3.ts';

export const WELL_CAMERA_CHANNEL = 'wells.contour-bearings.v1';
export const WELL_CAMERA_FIELD = 'well-camera' as const;
export const WELL_CAMERA_MAX_CONTOURS = 64;
const phases: readonly WellAppearancePhase[] = [
  'unresolved',
  'precursor',
  'ramping',
  'active',
  'fading',
];
const HEADER = 20;
const STRIDE = 11;
const vec = (a: readonly number[], i: number): Vec3 => ({ x: a[i]!, y: a[i + 1]!, z: a[i + 2]! });
const covariance = (a: readonly number[], i: number): WellImageCovariance => [
  a[i]!,
  a[i + 1]!,
  a[i + 2]!,
];
const positiveCovariance = (c: WellImageCovariance) =>
  c[0] > 0 && c[2] > 0 && Math.abs(c[1]) <= Math.sqrt(c[0] * c[2]) * (1 + 1e-12);

export function encodeWellCameraFrame(frame: WellCameraFrame): Measurement {
  const b = frame.basis;
  const value = [
    1,
    frame.sequence,
    ...frame.acquisition,
    frame.exposure,
    frame.cameraPower,
    frame.effectiveRate,
    frame.coverage.halfAngle,
    frame.basisSigma,
    Number(frame.coverage.truncated),
    b.forward.x,
    b.forward.y,
    b.forward.z,
    b.right.x,
    b.right.y,
    b.right.z,
    b.up.x,
    b.up.y,
    b.up.z,
    frame.contours.length,
    ...frame.contours.flatMap((c) => [
      ...c.start,
      ...c.end,
      ...c.startCov,
      ...c.endCov,
      phases.indexOf(c.phase),
    ]),
  ];
  const sigma = value.map(() => 0);
  for (let j = 10; j < 19; j++) sigma[j] = frame.basisSigma;
  frame.contours.forEach((c, i) => {
    const offset = HEADER + i * STRIDE;
    sigma[offset] = Math.sqrt(c.startCov[0]);
    sigma[offset + 1] = Math.sqrt(c.startCov[2]);
    sigma[offset + 2] = Math.sqrt(c.endCov[0]);
    sigma[offset + 3] = Math.sqrt(c.endCov[2]);
  });
  const measurement: Measurement = {
    kind: 'field-signal',
    channel: WELL_CAMERA_CHANNEL,
    field: WELL_CAMERA_FIELD,
    source: frame.source,
    t: frame.availableAt,
    value,
    sigma,
  };
  if (!decodeWellCameraFrame(measurement)) throw new Error('invalid well camera frame');
  return measurement;
}

/** Strict version, dimensions, finite values, covariance and camera-frame validation. */
export function decodeWellCameraFrame(m: Measurement): WellCameraFrame | undefined {
  if (
    m.kind !== 'field-signal' ||
    m.channel !== WELL_CAMERA_CHANNEL ||
    m.field !== WELL_CAMERA_FIELD ||
    !m.source
  )
    return;
  const a = m.value;
  if (
    a.length < HEADER ||
    a[0] !== 1 ||
    !a.every(Number.isFinite) ||
    !Number.isFinite(m.t) ||
    m.sigma.length !== a.length ||
    !m.sigma.every((s) => Number.isFinite(s) && s >= 0)
  )
    return;
  const count = a[19]!;
  if (
    !Number.isSafeInteger(a[1]) ||
    a[1]! < 0 ||
    a[2]! > a[3]! ||
    a[3]! > m.t ||
    a[4]! <= 0 ||
    a[5]! < 0 ||
    a[6]! <= 0 ||
    a[7]! <= 0 ||
    a[7]! >= Math.PI / 2 ||
    a[8]! <= 0 ||
    (a[9] !== 0 && a[9] !== 1) ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > WELL_CAMERA_MAX_CONTOURS ||
    a.length !== HEADER + count * STRIDE
  )
    return;
  const basis = { forward: vec(a, 10), right: vec(a, 13), up: vec(a, 16) };
  if (
    [basis.forward, basis.right, basis.up].some((v) => Math.abs(length(v) - 1) > 1e-8) ||
    Math.abs(dot(basis.forward, basis.right)) > 1e-8 ||
    distance(cross(basis.forward, basis.right), basis.up) > 1e-8
  )
    return;
  const id = `${m.source}:well-frame:${a[1]}`;
  const expectedSigma = a.map(() => 0);
  for (let j = 10; j < 19; j++) expectedSigma[j] = a[8]!;
  const contours: WellCameraFrame['contours'][number][] = [];
  for (let i = 0; i < count; i++) {
    const j = HEADER + i * STRIDE;
    const startCov = covariance(a, j + 4),
      endCov = covariance(a, j + 7);
    const phase = a[j + 10]!;
    if (
      !positiveCovariance(startCov) ||
      !positiveCovariance(endCov) ||
      !Number.isInteger(phase) ||
      !phases[phase]
    )
      return;
    expectedSigma[j] = Math.sqrt(startCov[0]);
    expectedSigma[j + 1] = Math.sqrt(startCov[2]);
    expectedSigma[j + 2] = Math.sqrt(endCov[0]);
    expectedSigma[j + 3] = Math.sqrt(endCov[2]);
    contours.push({
      id: `${id}:contour:${i}`,
      start: [a[j]!, a[j + 1]!],
      end: [a[j + 2]!, a[j + 3]!],
      startCov,
      endCov,
      phase: phases[phase]!,
    });
  }
  // The generic measurement and specialized covariance must not disagree.
  if (m.sigma.some((s, i) => s !== expectedSigma[i])) return;
  return {
    version: 1,
    id,
    field: WELL_CAMERA_FIELD,
    source: m.source,
    sequence: a[1]!,
    acquisition: [a[2]!, a[3]!],
    availableAt: m.t,
    exposure: a[4]!,
    cameraPower: a[5]!,
    effectiveRate: a[6]!,
    basis,
    basisSigma: a[8]!,
    basisCorrelation: 'frame-common-rotation',
    coverage: { status: 'unresolved', halfAngle: a[7]!, truncated: a[9] === 1 },
    contours,
  };
}

export function wellCameraFrameFreshness(
  frame: WellCameraFrame,
  now: number,
  maxAge: number,
): 'fresh' | 'stale' {
  return Number.isFinite(now) &&
    Number.isFinite(maxAge) &&
    maxAge >= 0 &&
    now >= frame.availableAt &&
    now - frame.acquisition[1] <= maxAge
    ? 'fresh'
    : 'stale';
}
