/**
 * The Chain Link's instrument is mounted beside FLIGHT: registered for its encounter, fed from
 * what the gauges and Black Box report, and its settings sent as ordinary commands.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { shipDefinition, viewSnapshot } from '../../../contracts/fixtures/index.ts';
import type { Command } from '../../../contracts/index.ts';
import type { GameControls } from '../../../game/belief/controls.ts';
import { encounterPanelFor } from '../../encounterPanels.ts';
import { ChainLinkInstrument, latticeModeCommands, withReconstruction } from './index.ts';
import type { ChainLinkPanelProps, ChainLinkPanelState } from './index.ts';

describe('the Chain Link instrument beside FLIGHT', () => {
  const reads = vi.fn(() => undefined);
  const game = {
    ship: shipDefinition,
    status: () => ({ attemptId: 'attempt-0001' }),
    blackBox: { attempt: reads },
  } as unknown as GameControls;

  it('is registered for its encounter and for no other', () => {
    expect(encounterPanelFor('chain-link')).toBe(ChainLinkInstrument);
    expect(encounterPanelFor('gravity-range')).toBeUndefined();
  });

  it('shows the unexplained channel, off, before anything is allocated', () => {
    const html = renderToStaticMarkup(
      <ChainLinkInstrument snapshot={viewSnapshot} game={game} command={() => undefined} />,
    );
    expect(html).toContain('Black Box · channel 03');
    expect(html).toContain('NO DATA');
    expect(html).toContain('Survey · 350 W');
  });

  it('takes the reconstruction’s numbers from the lattice the ship believes this attempt', () => {
    const box = { center: { x: 0, y: 0, z: 0 }, halfSize: { x: 50, y: 50, z: 50 } };
    const seen = { observedFrom: 2, observedTo: 4, validUntil: 10, sampleIds: ['retained:1'] };
    const visual = {
      schema: 'lattice-observations-v1',
      frameId: 'relative-nav:1',
      attemptId: 'attempt-0001',
      updatedAt: 4,
      enabled: true,
      quality: 1,
      processing: { reportedAt: 4, validUntil: 10, available: true },
      requestedVolume: box,
      strands: [
        {
          id: 'observed:1',
          points: [
            { x: -10, y: -10, z: 0 },
            { x: 10, y: 10, z: 0 },
          ],
          sigmaM: 0.5,
          confidence: 0.997,
          ...seen,
        },
      ],
      coverage: [],
    };
    const believing = (attemptId: string) => ({
      ...viewSnapshot,
      world: {
        ...viewSnapshot.world,
        fields: [
          { id: 'lattice', kind: 'lattice', detected: true, visual: { ...visual, attemptId } },
        ],
      },
    });
    const bare = {
      readings: {},
      retainedFrames: 26,
      discovered: false,
      supportedFragments: 0,
      coveredPatches: 0,
      validity: 'no reconstruction yet',
    } as unknown as ChainLinkPanelState;
    const now = withReconstruction(bare, believing('attempt-0001'), 'attempt-0001');
    expect(now.discovered).toBe(true);
    expect(now.supportedFragments).toBe(1);
    expect(now.readings?.reconstruction).toEqual(visual.processing);
    expect(now.validity).toBe('1 strands supported');
    // The model's own statement of its limits is shown when it gives one, supported or not.
    const none = {
      ...believing('attempt-0001'),
      world: {
        ...viewSnapshot.world,
        fields: [
          {
            id: 'lattice',
            kind: 'lattice',
            detected: false,
            visual: {
              ...visual,
              attemptId: 'attempt-0001',
              strands: [],
              limitation: '0 of 2952 fitted features supported by held-out frames',
            },
          },
        ],
      },
    };
    const unsupported = withReconstruction(bare, none, 'attempt-0001');
    expect(unsupported.discovered).toBe(false);
    expect(unsupported.supportedFragments).toBe(0);
    expect(unsupported.validity).toBe('0 of 2952 fitted features supported by held-out frames');
    expect(unsupported.readings?.reconstruction).toEqual(visual.processing);
    // No believed lattice, or an earlier attempt's (an archive view): nothing is claimed.
    expect(withReconstruction(bare, viewSnapshot, 'attempt-0001')).toBe(bare);
    expect(withReconstruction(bare, believing('attempt-0000'), 'attempt-0001')).toBe(bare);
  });

  it('sends a setting as the ordinary commands, and reads the record sparingly', () => {
    const sent: (readonly Command[])[] = [];
    reads.mockClear();
    let panel!: { props: ChainLinkPanelProps };
    for (let i = 0; i < 20; i++)
      panel = ChainLinkInstrument({
        snapshot: viewSnapshot,
        game,
        command: (commands) => sent.push(commands),
      }) as unknown as { props: ChainLinkPanelProps };
    // Twenty frames in a moment read Black Box's record at most once: each read copies it.
    expect(reads.mock.calls.length).toBeLessThanOrEqual(1);
    panel.props.onMode('survey');
    panel.props.onMode('off');
    expect(sent).toEqual([latticeModeCommands('survey'), latticeModeCommands('off')]);
    expect(panel.props.state.mode).toBe('off');
    expect(panel.props.state.now).toBe(viewSnapshot.t);
  });
});
