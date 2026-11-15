/**
 * The plate beside the MAP hologram: what the ship holds about the charted region or lead the
 * player has chosen, the way into a region's own three-dimensional view, and (S9 R13) the
 * charted objects as a list, so the keyboard can choose what the pointer can. Only what has
 * been charted (`GameControls.chart()`).
 */
import { useSyncExternalStore } from 'react';
import { Panel } from '../theme/components/index.ts';
import type { MapHolo } from '../view3d/map/MapHolo.ts';
import { regionFacts } from './chart.ts';
import { Actions, Button, Line, SelectField } from './controls.tsx';
import type { Desk } from './desk.ts';
import { degrees } from './format.ts';
import { FramingControls } from './Framing.tsx';
import type { Framing } from './Framing.tsx';
import { RehearsalPanel } from './Rehearsal.tsx';

export interface MapPlateProps {
  readonly desk: Desk;
  readonly holo: MapHolo;
  readonly region: boolean;
  readonly onRegion: (on: boolean) => void;
  /** Framing the chart without a pointer. */
  readonly framing?: Framing;
  /** Set the region view's range, metres: stepping through the forecast follows the ship. */
  readonly onRange?: (metres: number) => void;
  /** Go to where the plan is edited. */
  readonly onPlan?: () => void;
  /** The region view's range now, metres. */
  readonly range?: () => number;
  /** Reduced motion: stepping moves at once instead of gliding. */
  readonly still?: boolean;
}

export function MapPlate({
  desk,
  holo,
  region,
  onRegion,
  framing,
  onRange,
  onPlan,
  range,
  still,
}: MapPlateProps) {
  const selection = (): ReturnType<MapHolo['selected']> => holo.selected();
  const picked = useSyncExternalStore((listener) => holo.onChange(listener), selection, selection);
  const { game } = desk;
  const here = game.briefing.id;
  const chart = game.chart();
  const lead = picked?.kind === 'lead' ? chart.leads.find((l) => l.id === picked.id) : undefined;
  // With nothing chosen, the region the ship is in is the one the plate describes.
  const id = picked?.kind === 'region' ? picked.id : here;
  const options = [
    ...chart.regions.map((r) => ({ value: `region:${r.id}`, label: r.name.toUpperCase() })),
    ...chart.leads.map((l) => ({ value: `lead:${l.id}`, label: `LEAD · ${l.name.toUpperCase()}` })),
  ];
  const chooser = (
    <SelectField
      label="Charted"
      value={lead ? `lead:${lead.id}` : `region:${id}`}
      options={options}
      onChange={(v) => {
        const [kind, ...rest] = v.split(':');
        holo.select({ kind: kind === 'lead' ? 'lead' : 'region', id: rest.join(':') });
      }}
    />
  );
  const frame = framing && !region ? <FramingControls view={framing} orbit /> : null;
  const zoomOnly = framing && region ? <FramingControls view={framing} orbit={false} /> : null;

  if (lead) {
    const from = chart.regions.find((r) => r.id === lead.from)?.name ?? lead.from;
    const { x, y, z } = lead.direction;
    return (
      <aside className="mp-plate">
        <Panel title={lead.name} aside="lead">
          {chooser}
          <Line label="bearing from">{from}</Line>
          <Line label="direction">
            az {Math.round(degrees(Math.atan2(y, x)))}° · el{' '}
            {Math.round((Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI)}° ±
            {Math.round((lead.spread * 180) / Math.PI)}°
          </Line>
          <Line label="range">unknown</Line>
          {frame}
        </Panel>
      </aside>
    );
  }
  if (id !== here) return null;
  const facts = regionFacts(game, desk.archive(), desk.snapshot());
  return (
    <>
      {/* In the region's own view: the predictive model, stepped through (the owner). */}
      {region ? (
        <aside className="mp-plate mp-left">
          <RehearsalPanel
            desk={desk}
            {...(onRange ? { onRange } : {})}
            {...(onPlan ? { onPlan } : {})}
            {...(range ? { range } : {})}
            {...(still !== undefined ? { still } : {})}
          />
        </aside>
      ) : null}
      <aside className="mp-plate">
        <Panel title={game.briefing.name} aside={region ? 'region view' : 'charted'}>
          {chooser}
          {facts.map((f) => (
            <Line key={f.label} label={f.label} {...(f.tone ? { tone: f.tone } : {})}>
              {f.value}
            </Line>
          ))}
          <Actions>
            <Button
              primary
              onClick={() => {
                // Leaving the region ends the stepping: the chart shows what is charted, now.
                if (region) desk.setRehearsal(undefined);
                onRegion(!region);
              }}
            >
              {region ? 'BACK TO THE CHART' : 'ENTER REGION'}
            </Button>
          </Actions>
          <p className="cs-note">
            {region
              ? 'the environment as sensed, chart up'
              : 'unsurveyed space is not drawn as if known'}
          </p>
          {frame ?? zoomOnly}
        </Panel>
      </aside>
    </>
  );
}
