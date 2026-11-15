/**
 * The Chain Link's instrument beside FLIGHT (brief §6, A16): the Black Box's unexplained channel
 * and its processing allocation. 3C's panel, 2F's belief-side data for it and 2D's mount point,
 * joined here: the panel shows what the gauges and Black Box report, and its three settings send
 * the ordinary commands (`latticeModeCommands`), in real time.
 */
import { createElement } from 'react';
import type { AttemptRecord } from '../../../contracts/index.ts';
import { chainLinkPanelData } from '../../../game/belief/chain-link-panel.ts';
import { readLatticeVisual } from '../../../view3d/fields/lattice/data.ts';
import { registerEncounterPanel } from '../../encounterPanels.ts';
import type { EncounterPanelProps } from '../../encounterPanels.ts';
import { ChainLinkPanel } from './ChainLinkPanel.tsx';
import type { ChainLinkPanelState, ReconstructionMode } from './ChainLinkPanel.tsx';
import { latticeModeCommands } from './commands.ts';

export { ChainLinkPanel, channelIsFresh, recordingDuration } from './ChainLinkPanel.tsx';
export { latticeModeCommands } from './commands.ts';
export type {
  ChainLinkPanelProps,
  ChainLinkPanelState,
  ChannelValidity,
  ChainLinkReading,
  ReconstructionMode,
} from './ChainLinkPanel.tsx';

/** Real milliseconds between reads of the record in progress: each read copies all of it (S15). */
const RECORD_EVERY = 2000;
let held: { readonly attemptId: string; readonly at: number; readonly record?: AttemptRecord } = {
  attemptId: '',
  at: -Infinity,
};

/** The attempt's record, read from Black Box at most every `RECORD_EVERY`. */
function recordOf(
  game: EncounterPanelProps['game'],
  now = performance.now(),
): AttemptRecord | undefined {
  const attemptId = game.status().attemptId;
  if (attemptId !== held.attemptId || now - held.at >= RECORD_EVERY) {
    const record = game.blackBox.attempt(attemptId);
    held = { attemptId, at: now, ...(record ? { record } : {}) };
  }
  return held.record;
}

/**
 * The reconstruction's own numbers, from the lattice the ship believes this attempt (the model's
 * rebuild of its recorded frames, `BelievedWorld.fields`): when its processing last reported, how
 * many connected strands have support, how many patches the camera has covered, and the model's
 * own statement of what it could and could not support. A rebuild that supports nothing yet is
 * still reported (FLIGHT draws only supported strands). With no believed lattice the channel
 * stays unreported and the panel fails closed to stale.
 */
export function withReconstruction(
  state: ChainLinkPanelState,
  snapshot: EncounterPanelProps['snapshot'],
  attemptId: string,
): ChainLinkPanelState {
  const visual = snapshot.world.fields
    .map((field) => (field.kind === 'lattice' ? readLatticeVisual(field.visual) : null))
    .find((v) => v !== null && v.attemptId === attemptId);
  if (!visual) return state;
  const threat = visual.threat;
  return {
    ...state,
    readings: {
      ...state.readings,
      ...(visual.processing ? { reconstruction: visual.processing } : {}),
    },
    discovered: visual.strands.length > 0,
    supportedFragments: visual.strands.length,
    coveredPatches: visual.coverage.length,
    validity: visual.limitation ?? `${visual.strands.length} strands supported`,
    ...(threat
      ? {
          firstThreat: {
            component: threat.name,
            marginM: threat.marginM,
            sigmaM: threat.sigmaM,
            ...(visual.processing ? { reading: visual.processing } : {}),
          },
        }
      : {}),
  };
}

export function ChainLinkInstrument({ snapshot, game, command }: EncounterPanelProps) {
  const data = chainLinkPanelData(snapshot.t, snapshot.world.ship, game.ship, recordOf(game));
  return createElement(ChainLinkPanel, {
    state: withReconstruction(data, snapshot, game.status().attemptId),
    onMode: (mode: ReconstructionMode) => command(latticeModeCommands(mode)),
  });
}

registerEncounterPanel('chain-link', ChainLinkInstrument);
