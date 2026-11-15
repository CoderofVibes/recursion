/**
 * The plate beside the MAP hologram: what the ship holds about the charted region the player
 * has chosen, and the way into its own three-dimensional view. Only what has been charted.
 */
import { useSyncExternalStore } from 'react';
import { Panel } from '../theme/components/index.ts';
import type { MapHolo } from '../view3d/map/MapHolo.ts';
import { regionFacts } from './chart.ts';
import { Actions, Button, Line } from './controls.tsx';
import type { Desk } from './desk.ts';

export interface MapPlateProps {
  readonly desk: Desk;
  readonly holo: MapHolo;
  readonly region: boolean;
  readonly onRegion: (on: boolean) => void;
}

export function MapPlate({ desk, holo, region, onRegion }: MapPlateProps) {
  const selection = (): ReturnType<MapHolo['selected']> => holo.selected();
  const picked = useSyncExternalStore((listener) => holo.onChange(listener), selection, selection);
  const { game } = desk;
  const here = game.briefing.id;
  // With one region charted, it is the one the plate describes.
  const id = picked?.kind === 'region' ? picked.id : here;
  if (id !== here) return null;
  const facts = regionFacts(game, game.blackBox.archive(), desk.snapshot());
  return (
    <aside className="mp-plate">
      <Panel title={game.briefing.name} aside={region ? 'region view' : 'charted'}>
        {facts.map((f) => (
          <Line key={f.label} label={f.label} {...(f.tone ? { tone: f.tone } : {})}>
            {f.value}
          </Line>
        ))}
        <Actions>
          <Button primary onClick={() => onRegion(!region)}>
            {region ? 'BACK TO THE CHART' : 'ENTER REGION'}
          </Button>
        </Actions>
        <p className="cs-note">
          {region
            ? 'the environment as sensed, chart up · wheel to change range'
            : 'unsurveyed space is not drawn as if known'}
        </p>
      </Panel>
    </aside>
  );
}
