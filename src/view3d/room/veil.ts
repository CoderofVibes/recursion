/**
 * The veil: in MAP and SHIP a dark sphere about the hologram hides the room (A8). Once it is as
 * good as opaque the room's own parts cannot be seen, so they are not sent to be drawn (PF's
 * measured proposal, R63: about 119 fewer draws a frame in MAP and 95 in SHIP).
 */

/** The veil counts as opaque from here up: its opacity eases toward 1 and never quite arrives. */
export const VEIL_OPAQUE = 0.999;

/**
 * Whether the room's own parts are covered and need not be drawn: only in MAP or SHIP, only
 * settled there (never while moving between views or through a loss, when the room shows), and
 * only with the veil as good as opaque.
 */
export function coveredByVeil(mode: string, veil: number, moving: boolean): boolean {
  return (mode === 'map' || mode === 'ship') && !moving && veil > VEIL_OPAQUE;
}
