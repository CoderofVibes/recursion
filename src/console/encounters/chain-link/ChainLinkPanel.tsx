import type { ReactElement } from 'react';
import type { LatticeServiceValidity } from '../../../contracts/lattice-coverage.ts';
import {
  Alert,
  BlackBoxMark,
  LevelBar,
  ModeChips,
  Panel,
  Readout,
  ReadoutGrid,
} from '../../../theme/components/index.ts';
import './chain-link.css';

export type ReconstructionMode = 'off' | 'survey' | 'thread';

export type ChannelValidity = LatticeServiceValidity;

export type ChainLinkReading = 'processor' | 'recorder' | 'sensors' | 'thermal' | 'reconstruction';

/** Actual service and retained evidence, supplied by the game/Black Box owners. */
export interface ChainLinkPanelState {
  readonly now: number;
  /** Omitted validity fails closed: retain the last value, visibly stale. */
  readonly readings?: Partial<Readonly<Record<ChainLinkReading, ChannelValidity>>>;
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
  /** The acquired <=1 KiB diagnostic clue, independently retained while sensing (A16). */
  readonly diagnosticSnapshot?: {
    readonly recordedAt: number;
    readonly bytes: number;
    readonly sampleId: string;
  };
  readonly firstThreat?: {
    readonly component: string;
    readonly marginM: number;
    readonly sigmaM: number;
    readonly reading?: ChannelValidity;
  };
}

function validityIsFresh(now: number, reading?: ChannelValidity): boolean {
  return (
    reading !== undefined &&
    reading.available &&
    Number.isFinite(now) &&
    Number.isFinite(reading.reportedAt) &&
    Number.isFinite(reading.validUntil) &&
    reading.reportedAt <= now &&
    now <= reading.validUntil
  );
}

export function channelIsFresh(state: ChainLinkPanelState, channel: ChainLinkReading): boolean {
  return validityIsFresh(state.now, state.readings?.[channel]);
}

export interface ChainLinkPanelProps {
  readonly state: ChainLinkPanelState;
  readonly onMode: (mode: ReconstructionMode) => void;
}

export function recordingDuration(state: ChainLinkPanelState): string {
  if (!channelIsFresh(state, 'recorder')) return 'STALE';
  if (state.optionalBytesRemaining <= 0) return 'FULL';
  if (state.recordingBytesPerSecond <= 0 || !state.recording) return 'STOPPED';
  const seconds = Math.floor(state.optionalBytesRemaining / state.recordingBytesPerSecond);
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

/** The unexplained channel is present before first contact; discovery changes its label only. */
export function ChainLinkPanel({ state, onMode }: ChainLinkPanelProps): ReactElement {
  const processorFresh = channelIsFresh(state, 'processor');
  const recorderFresh = channelIsFresh(state, 'recorder');
  const sensorFresh = channelIsFresh(state, 'sensors');
  const evidenceFresh = channelIsFresh(state, 'reconstruction');
  const heatFresh = channelIsFresh(state, 'thermal');
  const full = recorderFresh && state.optionalBytesRemaining <= 0;
  const powered = processorFresh && state.deliveredProcessorW >= 350;
  const recording = recorderFresh && state.recording;
  const running =
    state.mode !== 'off' && powered && recording && sensorFresh && evidenceFresh && !full;
  const evidenceAt = state.readings?.reconstruction?.reportedAt;
  const evidenceAge =
    evidenceAt !== undefined && Number.isFinite(evidenceAt) && evidenceAt <= state.now
      ? state.now - evidenceAt
      : null;
  const diagnostic = state.diagnosticSnapshot;
  const diagnosticAge =
    diagnostic &&
    diagnostic.sampleId &&
    Number.isFinite(diagnostic.recordedAt) &&
    diagnostic.recordedAt <= state.now
      ? state.now - diagnostic.recordedAt
      : null;
  const threat = state.firstThreat;
  const threatFresh = running && validityIsFresh(state.now, threat?.reading);
  return (
    <Panel
      title={state.discovered ? 'Lattice reconstruction' : 'Black Box · channel 03'}
      aside={running ? 'LIVE' : evidenceAge !== null ? 'STALE' : 'NO DATA'}
      tone="blackbox"
      statusLine={!running && state.mode !== 'off' ? `STALE · ${state.validity}` : state.validity}
      status={full || (state.mode !== 'off' && !running) ? 'caution' : 'nominal'}
    >
      <div className="cl-instrument">
        <BlackBoxMark
          state={
            recorderFresh && full
              ? 'full'
              : recording
                ? 'recording'
                : recorderFresh
                  ? 'off'
                  : 'idle'
          }
          detail={`${state.retainedFrames} RETAINED FRAMES`}
        />
        <ModeChips
          label="Black Box processing allocation"
          tone="blackbox"
          value={state.mode}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'survey', label: 'Survey · 350 W' },
            { value: 'thread', label: 'Thread · 1,000 W' },
          ]}
          onChange={(value) => onMode(value as ReconstructionMode)}
        />
        <LevelBar
          label="Processor delivered"
          value={state.deliveredProcessorW}
          max={Math.max(1000, state.requestedProcessorW)}
          text={`${Math.round(state.deliveredProcessorW)} / ${Math.round(state.requestedProcessorW)} W`}
          marks={[{ at: 350, kind: 'caution' }]}
          status={!processorFresh ? 'stale' : powered ? 'nominal' : 'off'}
        />
        <ReadoutGrid>
          <Readout
            label="Recorded updates"
            value={state.updatesPerSecond.toFixed(2)}
            unit="Hz"
            status={running ? 'nominal' : 'stale'}
          />
          <Readout
            label="Storage remaining"
            value={recordingDuration(state)}
            tone="blackbox"
            status={!recorderFresh ? 'stale' : full ? 'warning' : 'nominal'}
          />
          <Readout
            label="Optional capacity"
            value={(state.optionalBytesRemaining / 1e6).toFixed(1)}
            unit="MB"
            tone="blackbox"
            status={recorderFresh ? 'nominal' : 'stale'}
          />
          <Readout
            label="Stored rate"
            value={(state.recordingBytesPerSecond / 1024).toFixed(1)}
            unit="KiB/s"
            tone="blackbox"
            status={recording ? 'nominal' : 'stale'}
          />
          <Readout
            label="Sensor-chain heat"
            value={Math.round(state.chainHeatW)}
            unit="W"
            status={heatFresh ? 'nominal' : 'stale'}
          />
          <Readout
            label="Evidence age"
            value={evidenceAge === null ? '—' : evidenceAge.toFixed(1)}
            unit={evidenceAge === null ? undefined : 's'}
            status={running ? 'nominal' : 'stale'}
          />
        </ReadoutGrid>
        {diagnostic && diagnosticAge !== null && (
          <Readout
            label="Last channel snapshot"
            value={`${diagnostic.bytes} B · ${diagnosticAge.toFixed(1)} s ago`}
            tone="blackbox"
            status={sensorFresh && recording && diagnosticAge <= 1 ? 'nominal' : 'stale'}
          />
        )}
        {state.discovered && (
          <>
            <ReadoutGrid>
              <Readout
                label="Supported fragments"
                value={state.supportedFragments}
                status={running ? 'nominal' : 'stale'}
              />
              <Readout
                label={running ? 'Covered patches' : 'Earlier covered patches'}
                value={state.coveredPatches}
                status={running ? 'nominal' : 'stale'}
              />
            </ReadoutGrid>
            <div className="cl-legend" aria-label="Reconstruction legend">
              <span data-kind="unknown">▨ Unobserved</span>
              <span data-kind="unresolved">◇ Unresolved</span>
              <span data-kind="strand">━ Supported strand</span>
              <span data-kind="covered">□ Covered patch</span>
            </div>
            <p className="cl-note">
              Hatched space is unresolved. Openings count only inside fresh, calibrated coverage.
            </p>
          </>
        )}
        {threat && (
          <Alert
            level={threat.marginM <= 0 ? 'warning' : 'caution'}
            text={`${threat.component} ${threatFresh ? 'first exposed' : 'earlier exposure estimate'}`}
            detail={`${threatFresh ? '' : 'STALE · '}${threat.marginM.toFixed(1)} m margin · ± ${threat.sigmaM.toFixed(1)} m`}
          />
        )}
        {state.mode !== 'off' && !running && (
          <Alert
            level="caution"
            text={
              full
                ? 'Optional store full'
                : !recorderFresh
                  ? 'Recorder telemetry stale'
                  : !state.recording
                    ? 'Recording stopped'
                    : !processorFresh || !powered
                      ? 'Processing unavailable'
                      : !sensorFresh
                        ? 'Sensor readings stale'
                        : 'Reconstruction stale'
            }
            detail="No new reconstruction. Earlier evidence is not fresh coverage."
          />
        )}
      </div>
    </Panel>
  );
}
