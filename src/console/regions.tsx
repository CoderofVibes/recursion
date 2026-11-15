/**
 * The region picker (A25). The expedition's route between regions (3D) is not built, so anyone
 * can play each built region from MISSION instead. Each is 2F's `?encounter=<id>` loader with its
 * own save slot, so switching reloads the page and every region keeps its own Black Box records.
 *
 * The ids are 2F's `ENCOUNTERS` (src/game/encounters.ts, truth-side, so not imported here);
 * `src/app/regions.test.ts` fails if the two lists drift apart.
 */
import { Panel } from '../theme/components/index.ts';
import { Actions, Button, Line } from './controls.tsx';

export interface Region {
  /** 2F's encounter id, and the briefing's. */
  readonly id: string;
  /** The region's name on the chart (A25). */
  readonly name: string;
}

/** The built regions. The first is the default: its address carries no `encounter`. */
export const REGIONS: readonly Region[] = [
  { id: 'gravity-range', name: 'Twin Deeps' },
  { id: 'inverse-wells', name: 'Well Garden' },
  { id: 'chain-link', name: 'Unseen Cathedral' },
];

/** The owner's wording (A25). */
export const PREVIEW_NOTE =
  'Preview regions: the route between them isn’t built yet; each starts with a fresh ship.';

/** This page's address for `region`, everything else kept. */
export function regionHref(href: string, region: string): string {
  const url = new URL(href);
  if (region === REGIONS[0]!.id) url.searchParams.delete('encounter');
  else url.searchParams.set('encounter', region);
  return url.toString();
}

export function RegionsPanel({
  current,
  currentName,
  go = (href) => location.assign(href),
}: {
  /** The encounter now loaded (`EncounterBriefing.id`). */
  readonly current: string;
  /** Its briefing's name, shown if it is not one of the regions. */
  readonly currentName: string;
  /** Go to an address (tests replace it). */
  readonly go?: (href: string) => void;
}) {
  const here = REGIONS.find((r) => r.id === current);
  // The briefing's own name too where it differs (the Gravity range is Twin Deeps on the chart),
  // so the picker matches the header and the ENTER button.
  const named = !here
    ? currentName
    : currentName.startsWith(here.name)
      ? currentName
      : `${here.name} · ${currentName}`;
  return (
    <Panel title="Regions" aside="preview">
      <p className="cs-note">{PREVIEW_NOTE}</p>
      <Line label="here">{named}</Line>
      <Actions>
        {REGIONS.filter((r) => r !== here).map((r) => (
          <Button
            key={r.id}
            mark={`region-${r.id}`}
            title={`Reloads the page in the ${r.name}, with its own records`}
            onClick={() => go(regionHref(location.href, r.id))}
          >
            {r.name.toUpperCase()} ▸
          </Button>
        ))}
      </Actions>
      <p className="cs-note">Each region keeps its own records; switching reloads the page.</p>
    </Panel>
  );
}
