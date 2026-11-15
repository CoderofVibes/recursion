/**
 * Encounter panels: an encounter's own instruments beside FLIGHT (a lattice's reconstruction,
 * a well's readings). The interface lives here; each panel lives in
 * `src/console/encounters/<encounter-id>/` and belongs to the section that builds that
 * encounter (build-plan ownership map), like the field views in `src/view3d/fieldViews.ts`.
 *
 * To add one, create `src/console/encounters/<encounter-id>/index.ts` that registers its panel
 * for its encounter id. Every such file is loaded with the console; nothing else needs editing.
 * A static import of this module from the panel is safe (the registry is hoisted, below), as is
 * a dynamic one (as `src/view3d/fields/lattice/index.ts` does for its view).
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

interface Registry {
  readonly panels: Map<string, EncounterPanel>;
  readonly listeners: Set<() => void>;
}

/**
 * The panels and their listeners live on a hoisted function, not module-level consts: Vite
 * hoists the eager glob in `loadEncounterPanels` above every const, so a panel registering
 * while this module is still being evaluated would meet them uninitialised (the integrator
 * found the same in `src/view3d/fieldViews.ts`, R33).
 */
function registry(): Registry {
  const self = registry as typeof registry & { state?: Registry };
  return (self.state ??= { panels: new Map(), listeners: new Set() });
}

/** Register the panel for one encounter (`EncounterBriefing.id`). The last one registered wins. */
export function registerEncounterPanel(encounterId: string, panel: EncounterPanel): void {
  const { panels, listeners } = registry();
  panels.set(encounterId, panel);
  for (const l of listeners) l();
}

export function encounterPanelFor(encounterId: string): EncounterPanel | undefined {
  return registry().panels.get(encounterId);
}

/** Hear of panels registered after the console first drew (they register asynchronously). */
export function onEncounterPanels(listener: () => void): () => void {
  const { listeners } = registry();
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
