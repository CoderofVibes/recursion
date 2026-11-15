/**
 * The Black Box function for the lattice (A16; S17; 3C R9 and R22): retention from the record
 * alone, and the archive store keeping both new channels exactly as recorded.
 */

import { describe, expect, it } from 'vitest';
import {
  isoCov3,
  type AttemptRecord,
  type ExecutedCommand,
  type Measurement,
} from '../contracts/index.ts';
import * as quat from '../lib/quat.ts';
import { encodeFrame } from '../model/lattice-harness.ts';
import { LATTICE_TILE_CHANNEL } from '../model/lattice/frames.ts';
import { latticeFunctionLog, latticeRetention } from './lattice.ts';
import { MemoryBlackBoxStore } from './store.ts';
import { emptyArchive, withAttempt } from './archive.ts';

/** 3C's `lattice.raw-tile.v1` layout: an 8×8 camera-local image, nothing geometric. */
function tile(sequence: number, t: number, availableAt: number): Measurement {
  const value = [
    1,
    sequence,
    t,
    t,
    Math.PI / 6,
    0.01,
    200,
    1000,
    1,
    -1,
    8,
    1,
    ...new Array<number>(64).fill(3),
  ];
  return {
    kind: 'field-signal',
    channel: LATTICE_TILE_CHANNEL,
    field: 'fence',
    source: 'camera',
    t: availableAt,
    value,
    sigma: value.map((_, i) => (i >= 12 ? 1 : 0)),
  };
}

const mode = (t: number, m: string): ExecutedCommand => ({
  t,
  command: { kind: 'mode', equipment: 'science-processor', mode: m },
  source: 'manual',
  status: 'executed',
});

function record(): AttemptRecord {
  const frames = [0, 1, 2, 4, 5, 8, 9].map((seq) =>
    encodeFrame({
      field: 'fence',
      sequence: seq,
      acquisition: [seq * 0.6, seq * 0.6],
      availableAt: seq * 0.6 + 0.3,
      fragments: [{ start: [0.01 * seq, 0], end: [0.01 * seq + 0.05, 0], sigma: 5e-4 }],
    }),
  );
  return {
    id: 'att1',
    index: 1,
    encounterId: 'cathedral',
    startedAt: '2026-11-15T00:00:00Z',
    start: {
      estimate: {
        t: 0,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        positionCov: isoCov3(0.5),
        velocityCov: isoCov3(0.01),
        attitude: quat.IDENTITY,
        attitudeSigma: 4e-5,
        angularVelocity: { x: 0, y: 0, z: 0 },
      },
      configuration: 'radiators',
      modelVersion: 0,
    },
    plans: [],
    executed: [mode(0, 'lattice'), mode(4, 'idle'), mode(4.5, 'lattice')],
    forecasts: [],
    measurements: [...frames, tile(0, 1.0, 1.4), tile(1, 4.2, 4.6)].sort((a, b) => a.t - b.t),
    events: [],
    outcome: { kind: 'lost', t: 7, cause: 'radiation' },
    modelVersionAtEnd: 0,
  };
}

describe('lattice retention, from the record alone', () => {
  const rec = record();

  it('counts what was retained and shows what was not', () => {
    const [r] = latticeRetention(rec);
    expect(r!.field).toBe('fence');
    expect(r!.frames).toBe(7);
    expect(r!.fragments).toBe(7);
    expect(r!.bytes).toBeGreaterThan(7 * 100);
    // Sequences 3, 6 and 7 were never retained.
    expect(r!.sequences).toEqual({
      first: 0,
      last: 9,
      missing: 3,
      gaps: [
        [3, 3],
        [6, 7],
      ],
    });
    expect(r!.lastAcquisition).toBeCloseTo(5.4, 12);
    // At the loss (t = 7): the last frame was acquired 1.6 s earlier.
    expect(r!.age).toBeCloseTo(1.6, 12);
  });

  it('gives the latest raw tile its age from acquisition, not delivery', () => {
    const [r] = latticeRetention(rec);
    expect(r!.tiles.count).toBe(2);
    expect(r!.tiles.latest!.acquisition).toEqual([4.2, 4.2]);
    expect(r!.tiles.latest!.availableAt).toBe(4.6);
    expect(r!.tiles.latest!.age).toBeCloseTo(7 - 4.2, 12);
  });

  it('as of an earlier time, only what had been delivered then', () => {
    const [r] = latticeRetention(rec, 2);
    expect(r!.frames).toBe(3);
    expect(r!.tiles.count).toBe(1);
  });

  it('logs when the function was switched on and off', () => {
    expect(latticeFunctionLog(rec)).toEqual({ on: [0, 4.5], off: [4], enabled: true });
    expect(latticeFunctionLog(rec, 4.2)).toEqual({ on: [0], off: [4], enabled: false });
  });
});

describe('the archive store and the new channels (R22)', () => {
  it('keeps lattice frames and raw tiles exactly as recorded: no migration', async () => {
    const rec = record();
    const store = new MemoryBlackBoxStore();
    await store.putAttempt(rec);
    const back = (await store.load()).archive.attempts[0]!;
    expect(back).toEqual(rec);
    // And through an archive, as the game keeps it.
    const archive = withAttempt(emptyArchive(), back);
    expect(latticeRetention(archive.attempts[0]!)).toEqual(latticeRetention(rec));
  });
});
