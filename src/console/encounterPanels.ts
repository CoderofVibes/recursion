/**
 * Encounter panels: an encounter's own instruments beside FLIGHT (a lattice's reconstruction,
 * a well's readings). The interface lives here; each panel lives in
 * `src/console/encounters/<encounter-id>/` and belongs to the section that builds that
 * encounter (build-plan ownership map), like the field views in `src/view3d/fieldViews.ts`.
 *
 * To add one, create `src/console/encounters/<encounter-id>/index.ts` that registers its panel
 * for its encounter id. Every such file is loaded with the console; nothing else needs editing.
 * Register through a dynamic import of this module (as `src/view3d/fields/lattice/index.ts`
 * does for its view): the eager load below imports the panel's module, so a static import back
 * would be a cycle.
 *
 * A panel sees what the game shows the console (the snapshot and `GameControls`, P11) and acts
 * only through `command`, which sends each command to the ship exactly as SYSTEMS's controls do
 * (A12: in real time, never a pause). What it shows as delivered must come from telemetry.
 */
import { createElement, useSyncExternalStore } from 'react';
import type { ReactElement } from 'react';
import type { Command, ViewSnapshot } from '../contracts/index.ts';
import type { GameControls } from '../game/belief/controls.ts';

export interface EncounterPanelProps {
  /** This frame's snapshot (the desk's: no second one is built). */
  readonly snapshot: ViewSnapshot;
  readonly game: GameControls;
  /** Send commands to the ship through the ordinary manual channel, in order. */
  readonly command: (commands: readonly Command[]) => void;
}

export type EncounterPanel = (props: EncounterPanelProps) => ReactElement | null;

const registry = new Map<string, EncounterPanel>();

/** Register the panel for one encounter (`EncounterBriefing.id`). The last one registered wins. */
export function registerEncounterPanel(encounterId: string, panel: EncounterPanel): void {
  registry.set(encounterId, panel);
  for (const l of listeners) l();
}

export function encounterPanelFor(encounterId: string): EncounterPanel | undefined {
  return registry.get(encounterId);
}

const listeners = new Set<() => void>();
/** Hear of panels registered after the console first drew (they register asynchronously). */
export function onEncounterPanels(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Where the current encounter's panel goes: nothing for an encounter without one. Its commands
 * go to the ship one by one through `GameControls.command`.
 */
export function EncounterSlot({
  game,
  snapshot,
}: {
  readonly game: GameControls;
  readonly snapshot: ViewSnapshot;
}): ReactElement | null {
  const id = game.briefing.id;
  const read = (): EncounterPanel | undefined => encounterPanelFor(id);
  const panel = useSyncExternalStore(onEncounterPanels, read, read);
  if (!panel) return null;
  return createElement(panel, {
    snapshot,
    game,
    command: (commands: readonly Command[]) => {
      for (const c of commands) game.command(c);
    },
  });
}

let loaded = false;

/** Load every panel under `src/console/encounters/`. Called once by the control room. */
export function loadEncounterPanels(): void {
  if (loaded) return;
  loaded = true;
  // Each panel registers itself as a side effect of being imported.
  import.meta.glob('./encounters/*/index.ts', { eager: true });
}
