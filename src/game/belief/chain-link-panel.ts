/**
 * BELIEF side (no truth imports). What 3C's ChainLinkPanel shows (3C's R20; the panel's
 * `ChainLinkPanelState`), from the believed ship's telemetry and Black Box only: actual delivered
 * power, the recorder's state, freshness per channel. Each reading is valid until three of the
 * recorder's sample periods after it was reported; a reading never reported is omitted, and the
 * panel fails closed to stale. The reconstruction's own numbers (fragments, covered patches, the
 * first threat) are 2C's: until it publishes them they stay empty and the channel unreported.
 */

import type { AttemptRecord, BelievedShip, ShipDefinition } from '../../contracts/index.ts';
import type { LatticeServiceValidity } from '../../contracts/lattice-coverage.ts';

export type ReconstructionMode = 'off' | 'survey' | 'thread';
export type ChainLinkReading = 'processor' | 'recorder' | 'sensors' | 'thermal' | 'reconstruction';

/** The panel's state (`src/console/encounters/chain-link/ChainLinkPanel.tsx`), field for field. */
export interface ChainLinkPanelData {
  readonly now: number;
  readonly readings: Partial<Readonly<Record<ChainLinkReading, LatticeServiceValidity>>>;
  readonly mode: ReconstructionMode;
  readonly discovered: boolean;
  readonly recording: boolean;
  readonly optionalBytesRemaining: number;
  readonly recordingBytesPerSecond: number;
  readonly requestedProcessorW: number;
  readonly deliveredProcessorW: number;
  readonly chainHeatW: number;
  readonly updatesPerSecond: number;
  readonly retainedFrames: number;
  readonly supportedFragments: number;
  readonly coveredPatches: number;
  readonly validity: string;
  readonly diagnosticSnapshot?: {
    readonly recordedAt: number;
    readonly bytes: number;
    readonly sampleId: string;
  };
}

/** The lattice products' channels (3C's `lattice-observations.ts`). */
const FRAGMENTS = 'lattice.angular-fragments.v2';
const RAW_TILE = 'lattice.raw-tile.v1';

interface RecorderSpec {
  readonly equipmentId?: string;
  readonly capacity?: number;
  readonly bytesPerSample?: number;
  readonly reservedEventCapacity?: number;
}

export function chainLinkPanelData(
  now: number,
  ship: BelievedShip,
  definition: ShipDefinition,
  record?: AttemptRecord,
): ChainLinkPanelData {
  const recorder = (definition.systems?.recorder ?? {}) as RecorderSpec;
  const recorderId = recorder.equipmentId ?? 'black-box';
  const reading = (channel: string) => ship.telemetry[channel];
  const rate = reading(`${recorderId}.sample-rate`)?.value ?? 0;
  // Valid for three of the recorder's sample periods (at least three seconds).
  const window = 3 * Math.max(1, rate > 0 ? 1 / rate : 1);
  const validity = (channel: string, available: (value: number) => boolean) => {
    const r = reading(channel);
    return r
      ? { reportedAt: r.t, validUntil: r.t + window, available: available(r.value) }
      : undefined;
  };
  const readings: Partial<Record<ChainLinkReading, LatticeServiceValidity>> = {};
  const set = (key: ChainLinkReading, v: LatticeServiceValidity | undefined) => {
    if (v) readings[key] = v;
  };
  set(
    'processor',
    validity('science-processor.power', (w) => w > 0),
  );
  set(
    'recorder',
    validity(`${recorderId}.bytes`, () => (reading(`${recorderId}.power`)?.value ?? 0) > 0),
  );
  set(
    'sensors',
    validity('camera.power', (w) => w > 0),
  );
  const processor = ship.equipment['science-processor'];
  const thermalNode = definition.equipment.find((e) => e.id === 'science-processor')?.thermalNode;
  if (thermalNode)
    set(
      'thermal',
      validity(`${thermalNode}.temperature`, () => true),
    );
  const allocation = processor?.allocation ?? 0;
  const mode: ReconstructionMode =
    processor?.mode !== 'lattice' ? 'off' : allocation >= 1000 ? 'thread' : 'survey';
  const bytes = reading(`${recorderId}.bytes`)?.value ?? 0;
  const capacity = (recorder.capacity ?? 0) - (recorder.reservedEventCapacity ?? 0);
  const delivered = reading('science-processor.power')?.value ?? 0;
  let frames = 0;
  let diagnostic: ChainLinkPanelData['diagnosticSnapshot'];
  for (const m of record?.measurements ?? []) {
    if (m.kind !== 'field-signal') continue;
    if (m.channel === FRAGMENTS) frames += 1;
    else if (m.channel === RAW_TILE)
      diagnostic = { recordedAt: m.t, bytes: m.value.length, sampleId: `${m.channel}@${m.t}` };
  }
  return {
    now,
    readings,
    mode,
    discovered: false,
    recording: rate > 0 && (reading(`${recorderId}.power`)?.value ?? 0) > 0,
    optionalBytesRemaining: Math.max(0, capacity - bytes),
    recordingBytesPerSecond: rate * (recorder.bytesPerSample ?? 0),
    requestedProcessorW: allocation,
    deliveredProcessorW: delivered,
    chainHeatW: delivered + (reading('camera.power')?.value ?? 0),
    updatesPerSecond: rate,
    retainedFrames: frames,
    supportedFragments: 0,
    coveredPatches: 0,
    validity: frames > 0 ? 'no reconstruction yet' : 'no frames',
    ...(diagnostic ? { diagnosticSnapshot: diagnostic } : {}),
  };
}
