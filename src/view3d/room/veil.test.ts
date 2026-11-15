/**
 * When the room's own parts may be left undrawn behind the veil (R63). Only where nothing of
 * them could show: never in a view that shows the room, never mid-move or mid-loss, never under
 * a veil that is still letting the room through.
 */
import { describe, expect, it } from 'vitest';
import { VEIL_OPAQUE, coveredByVeil } from './veil.ts';

describe('the room behind the veil', () => {
  it('is covered in MAP and in SHIP, settled, with the veil as good as opaque', () => {
    expect(coveredByVeil('map', 1, false)).toBe(true);
    expect(coveredByVeil('ship', 0.9995, false)).toBe(true);
  });

  it('is drawn in every view that shows the room', () => {
    for (const mode of ['room', 'console', 'flight'])
      expect(coveredByVeil(mode, 1, false)).toBe(false);
  });

  it('is drawn while moving between views and through a loss, whatever the veil', () => {
    expect(coveredByVeil('map', 1, true)).toBe(false);
    expect(coveredByVeil('ship', 1, true)).toBe(false);
  });

  it('is drawn until the veil is as good as opaque: a veil at the limit still lets it through', () => {
    expect(coveredByVeil('map', VEIL_OPAQUE, false)).toBe(false);
    expect(coveredByVeil('map', 0.99, false)).toBe(false);
    expect(coveredByVeil('ship', 0, false)).toBe(false);
  });
});
