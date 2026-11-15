/**
 * Window views: how an encounter's phenomenon looks to the unaided eye through the room's window,
 * for the few that light shows (A19: the wells' funnels glow). The interface lives here; each
 * view lives with its field view in `src/view3d/fields/<kind>/` and belongs to the section that
 * builds that encounter, as the FLIGHT plugins do (`fieldViews.ts`).
 *
 * A window view sees only light: a direction and an apparent shape, never a range (A3, A8,
 * P11). Its data comes from the game's window channel, one entry per visible phenomenon
 * (`windowFields` in `adapter.ts`); a phenomenon the eye cannot see has no entry and its view
 * is hidden, then disposed.
 *
 * To add one, register it from the field's `index.ts` (loaded with the flight view):
 *
 *   void import('../../windowViews.ts').then(({ registerWindowView }) =>
 *     registerWindowView('well', ({ group, displayRadius }) => makeOpticalFunnelView(group, displayRadius)),
 *   );
 */
import type { Group } from 'three';

export interface WindowViewContext {
  /**
   * Add objects here. The group turns with the room, so scene directions (game axes through
   * `toScene`) point where they do outside; its origin is the eye.
   */
  readonly group: Group;
  /**
   * Radius of the window's presentation shell, scene metres: where something with no known
   * range is drawn, behind sunlit rocks and in front of the stars. Not a measured distance.
   */
  readonly displayRadius: number;
}

export interface WindowView {
  /** This frame's optical data for the phenomenon (its own schema), and the frame's ship time. */
  update(visual: unknown, t: number): void;
  dispose(): void;
}

export type WindowViewFactory = (context: WindowViewContext) => WindowView;

const registry = new Map<string, WindowViewFactory>();

/** Register the window view for one kind of phenomenon. The last one registered wins. */
export function registerWindowView(kind: string, factory: WindowViewFactory): void {
  registry.set(kind, factory);
}

export function windowViewFor(kind: string): WindowViewFactory | undefined {
  return registry.get(kind);
}
