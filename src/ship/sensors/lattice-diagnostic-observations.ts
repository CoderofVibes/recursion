/** Recorded camera image only. No truth imports and no conversion into world geometry. */
import type { Measurement } from '../../contracts/measurements.ts';
import type { LatticeDiagnosticTile } from '../../contracts/lattice-acquisition.ts';
export type { LatticeDiagnosticTile } from '../../contracts/lattice-acquisition.ts';

export const LATTICE_DIAGNOSTIC_CHANNEL = 'lattice.raw-tile.v1';
export const LATTICE_DIAGNOSTIC_MAX_BYTES = 1024;

export function encodeLatticeDiagnostic(tile: LatticeDiagnosticTile): Measurement {
  const value = [
    1,
    tile.sequence,
    ...tile.acquisition,
    tile.halfAngle,
    tile.exposure,
    tile.cameraPower,
    tile.processorPower,
    tile.acquisitionRate,
    tile.sincePrevious ?? -1,
    tile.size,
    tile.pixelSigma,
    ...tile.pixels.map((pixel) => pixel ?? -1),
  ];
  return {
    kind: 'field-signal',
    channel: LATTICE_DIAGNOSTIC_CHANNEL,
    field: tile.field,
    source: tile.source,
    t: tile.availableAt,
    value,
    sigma: value.map((_, i) => (i >= 12 && tile.pixels[i - 12] !== null ? tile.pixelSigma : 0)),
  };
}

export function decodeLatticeDiagnostic(m: Measurement): LatticeDiagnosticTile | undefined {
  if (m.kind !== 'field-signal' || m.channel !== LATTICE_DIAGNOSTIC_CHANNEL || !m.field) return;
  const a = m.value;
  if (
    a.length !== 76 ||
    a[0] !== 1 ||
    a[10] !== 8 ||
    !a.every(Number.isFinite) ||
    !Number.isFinite(m.t) ||
    !Number.isInteger(a[1]) ||
    a[1]! < 0 ||
    a[2]! !== a[3]! ||
    a[3]! > m.t ||
    a[4]! <= 0 ||
    a[4]! >= Math.PI / 2 ||
    a[5]! <= 0 ||
    a[6]! < 60 ||
    a[7]! < 40 ||
    a[8]! <= 0 ||
    a[8]! > 1 ||
    (a[9] !== -1 && a[9]! < 0) ||
    a[11]! < 1 ||
    a.slice(12).some((v) => !Number.isInteger(v) || v < -1 || v > 15) ||
    m.sigma.length !== a.length ||
    m.sigma.some(
      (sigma, i) => !Number.isFinite(sigma) || sigma !== (i >= 12 && a[i]! >= 0 ? a[11] : 0),
    ) ||
    new TextEncoder().encode(JSON.stringify(m)).length > LATTICE_DIAGNOSTIC_MAX_BYTES
  )
    return;
  return {
    version: 1,
    id: `${m.field}:diagnostic:${a[1]}`,
    field: m.field,
    source: m.source,
    sequence: a[1]!,
    acquisition: [a[2]!, a[3]!],
    availableAt: m.t,
    halfAngle: a[4]!,
    exposure: a[5]!,
    cameraPower: a[6]!,
    processorPower: a[7]!,
    acquisitionRate: a[8]!,
    sincePrevious: a[9] === -1 ? null : a[9]!,
    size: 8,
    pixelSigma: a[11]!,
    pixels: a.slice(12).map((value) => (value === -1 ? null : value)),
    coverage: 'unresolved',
  };
}
