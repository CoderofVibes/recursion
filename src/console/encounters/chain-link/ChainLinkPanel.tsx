import type { ReactElement } from 'react';
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

/** Actual service and retained evidence, supplied by the game/Black Box owners. */
export interface ChainLinkPanelState {
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
  /** Evidence's own age, rather than time since the screen was opened. */
  readonly latestEvidenceAgeS: number | null;
  readonly validity: string;
  readonly firstThreat?: {
    readonly component: string;
    readonly marginM: number;
    readonly sigmaM: number;
  };
}

export interface ChainLinkPanelProps {
  readonly state: ChainLinkPanelState;
  readonly onMode: (mode: ReconstructionMode) => void;
}

export function recordingDuration(state: ChainLinkPanelState): string {
  if (state.optionalBytesRemaining <= 0) return 'FULL';
  if (state.recordingBytesPerSecond <= 0 || !state.recording) return 'STOPPED';
  const seconds = Math.floor(state.optionalBytesRemaining / state.recordingBytesPerSecond);
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

/** The unexplained channel is present before first contact; discovery changes its label only. */
export function ChainLinkPanel({ state, onMode }: ChainLinkPanelProps): ReactElement {
  const full = state.optionalBytesRemaining <= 0;
  const powered = state.deliveredProcessorW >= 350;
  const running = state.mode !== 'off' && powered && state.recording && !full;
  const threat = state.firstThreat;
  return (
    <Panel
      title={state.discovered ? 'Lattice reconstruction' : 'Black Box · channel 03'}
      aside="LIVE"
      tone="blackbox"
      statusLine={state.validity}
      status={full || (state.mode !== 'off' && !running) ? 'caution' : 'nominal'}
    >
      <div className="cl-instrument">
        <BlackBoxMark
          state={full ? 'full' : state.recording ? 'recording' : 'off'}
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
          status={powered ? 'nominal' : 'off'}
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
            status={full ? 'warning' : 'nominal'}
          />
          <Readout label="Sensor-chain heat" value={Math.round(state.chainHeatW)} unit="W" />
          <Readout
            label="Evidence age"
            value={state.latestEvidenceAgeS === null ? '—' : state.latestEvidenceAgeS.toFixed(1)}
            unit={state.latestEvidenceAgeS === null ? undefined : 's'}
            status={state.latestEvidenceAgeS === null ? 'off' : 'nominal'}
          />
        </ReadoutGrid>
        {state.discovered && (
          <>
            <ReadoutGrid>
              <Readout label="Supported fragments" value={state.supportedFragments} />
              <Readout label="Covered patches" value={state.coveredPatches} />
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
            text={`${threat.component} first exposed`}
            detail={`${threat.marginM.toFixed(1)} m margin · ± ${threat.sigmaM.toFixed(1)} m`}
          />
        )}
        {state.mode !== 'off' && !running && (
          <Alert
            level="caution"
            text={
              full
                ? 'Optional store full'
                : !state.recording
                  ? 'Recording stopped'
                  : 'Processing unavailable'
            }
            detail="No new reconstruction. Earlier evidence is not fresh coverage."
          />
        )}
      </div>
    </Panel>
  );
}
