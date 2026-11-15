/**
 * The region picker (A25) offers exactly 2F's built encounters, default first, so a region added
 * to `ENCOUNTERS` without a place in the picker (or the other way round) fails here.
 */
import { describe, expect, it } from 'vitest';
import { REGIONS } from '../console/regions.tsx';
import { ENCOUNTERS, encounterEntry } from '../game/encounters.ts';

describe('the region picker and the encounter loader', () => {
  it('lists the same encounters, with the loader’s default first', () => {
    expect(REGIONS.map((r) => r.id).sort()).toEqual(ENCOUNTERS.map((e) => e.id).sort());
    expect(REGIONS[0]!.id).toBe(encounterEntry(null).id);
  });
});
