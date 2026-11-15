/**
 * The Black Box function for the lattice (DECISIONS A16; S17 `black-box.md` § Storage and § FLIGHT
 * and the loss review; 3C's handoff R9): what was retained, from the record alone.
 *
 * Once the player switches the function on (3C's `latticeModeCommands`: the science processor in
 * `lattice` mode), the recorder keeps the camera's processed angular frames and, when the camera
 * delivers them, raw diagnostic tiles. This module accounts for them per field:
 *
 * - frames and fragments retained, their bytes as recorded (each measurement's JSON, decimal
 *   bytes; S17's 16 KiB per processed update), the acquisition span and the mean rate;
 * - sequence numbers never retained (dropped by the recorder, or never acquired while the
 *   function was on): missing data stays visible as missing;
 * - frames whose coverage was truncated by the per-frame budget;
 * - the latest raw tile, with its original acquisition time, so a loss review can show its age
 *   from `acquisition[1]`, not from delayed delivery (3C);
 * - when the function was switched on and off.
 *
 * The reconstruction itself is the model's (`ModelService.lattice`), rebuilt from these same
 * records. Nothing here interprets a tile as geometry or certifies clear space.
 */

import type { AttemptRecord } from '../contracts/index.ts';
import { latticeFrames, readTile, type TileSummary } from '../model/lattice/frames.ts';

export interface LatticeRetention {
  readonly field: string;
  readonly frames: number;
  readonly fragments: number;
  /** Bytes of the retained frames as recorded. */
  readonly bytes: number;
  readonly firstAcquisition: number;
  readonly lastAcquisition: number;
  readonly lastAvailableAt: number;
  /** Frames per second of acquisition span. */
  readonly meanRate: number;
  /** Time since the last retained acquisition, at `now`. */
  readonly age: number;
  readonly sequences: {
    readonly first: number;
    readonly last: number;
    /** Sequence numbers between first and last that were never retained. */
    readonly missing: number;
    /** The first missing runs, [from, to] inclusive. */
    readonly gaps: readonly (readonly [number, number])[];
  };
  /** Frames whose coverage says the per-frame budget cut fragments. */
  readonly truncated: number;
  readonly tiles: {
    readonly count: number;
    readonly bytes: number;
    readonly latest?: TileSummary & { readonly age: number };
  };
}

export interface LatticeFunctionLog {
  /** Times the processor was commanded into, and out of, `lattice` mode. */
  readonly on: readonly number[];
  readonly off: readonly number[];
  readonly enabled: boolean;
}

const PROCESSOR = 'science-processor';
const LATTICE_MODE = 'lattice';
const MAX_GAPS = 20;

/** When the function was switched on and off, up to `now`. */
export function latticeFunctionLog(rec: AttemptRecord, now = Infinity): LatticeFunctionLog {
  const on: number[] = [];
  const off: number[] = [];
  let enabled = false;
  for (const e of rec.executed) {
    if (e.t > now || e.status !== 'executed') continue;
    const c = e.command as { kind: string; equipment?: string; mode?: string };
    if (c.kind !== 'mode' || c.equipment !== PROCESSOR) continue;
    const next = c.mode === LATTICE_MODE;
    if (next && !enabled) on.push(e.t);
    if (!next && enabled) off.push(e.t);
    enabled = next;
  }
  return { on, off, enabled };
}

/**
 * Per field, what the record retained up to `now` (default: the attempt's end, or everything).
 * A loss review passes the loss time.
 */
export function latticeRetention(rec: AttemptRecord, now?: number): LatticeRetention[] {
  const end = now ?? (rec.outcome.kind === 'in-progress' ? Infinity : rec.outcome.t);
  const frames = latticeFrames(rec, end);
  const tiles: TileSummary[] = [];
  for (const m of rec.measurements) {
    if (m.t > end) continue;
    const tile = readTile(m);
    if (tile) tiles.push(tile);
  }
  const fields = [
    ...new Set([...frames.map((f) => f.frame.field), ...tiles.map((t) => t.field)]),
  ].sort();
  return fields.map((field) => {
    const mine = frames.filter((f) => f.frame.field === field);
    const seqs = [...new Set(mine.map((f) => f.frame.sequence))].sort((a, b) => a - b);
    const gaps: [number, number][] = [];
    let missing = 0;
    for (let i = 1; i < seqs.length; i++) {
      const a = seqs[i - 1]!;
      const b = seqs[i]!;
      if (b > a + 1) {
        missing += b - a - 1;
        if (gaps.length < MAX_GAPS) gaps.push([a + 1, b - 1]);
      }
    }
    const first = mine.length > 0 ? Math.min(...mine.map((f) => f.frame.acquisition[0])) : NaN;
    const last = mine.length > 0 ? Math.max(...mine.map((f) => f.frame.acquisition[1])) : NaN;
    const myTiles = tiles.filter((t) => t.field === field);
    const latestTile = myTiles.reduce(
      (a, t) => (!a || t.acquisition[1] > a.acquisition[1] ? t : a),
      undefined as TileSummary | undefined,
    );
    const at = Number.isFinite(end) ? end : Math.max(last, latestTile?.availableAt ?? -Infinity);
    return {
      field,
      frames: mine.length,
      fragments: mine.reduce((acc, f) => acc + f.frame.fragments.length, 0),
      bytes: mine.reduce((acc, f) => acc + f.bytes, 0),
      firstAcquisition: first,
      lastAcquisition: last,
      lastAvailableAt: mine.length > 0 ? Math.max(...mine.map((f) => f.frame.availableAt)) : NaN,
      meanRate: mine.length > 1 && last > first ? (mine.length - 1) / (last - first) : 0,
      age: mine.length > 0 ? at - last : NaN,
      sequences: {
        first: seqs[0] ?? NaN,
        last: seqs.at(-1) ?? NaN,
        missing,
        gaps,
      },
      truncated: mine.filter((f) => f.frame.coverage.truncated).length,
      tiles: {
        count: myTiles.length,
        bytes: myTiles.reduce((acc, t) => acc + t.bytes, 0),
        ...(latestTile ? { latest: { ...latestTile, age: at - latestTile.acquisition[1] } } : {}),
      },
    };
  });
}
