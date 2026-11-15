/**
 * A25's region picker: where the player is, a button for each other region, the owner's
 * honest label, and an address that changes only the encounter.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PREVIEW_NOTE, REGIONS, RegionsPanel, regionHref } from './regions.tsx';

describe('the region picker', () => {
  it('changes only the encounter in the address; the default region takes none', () => {
    const base = 'https://example.test/recursion/?view=console&encounter=chain-link#x';
    expect(regionHref(base, 'inverse-wells')).toBe(
      'https://example.test/recursion/?view=console&encounter=inverse-wells#x',
    );
    expect(regionHref(base, REGIONS[0]!.id)).toBe('https://example.test/recursion/?view=console#x');
  });

  it('says where the player is, offers the others as buttons, and says they are previews', () => {
    const html = renderToStaticMarkup(
      <RegionsPanel current="inverse-wells" currentName="Well Garden · prototype" />,
    );
    expect(html).toContain(PREVIEW_NOTE);
    expect(html).toContain('Well Garden');
    expect(html).not.toContain('WELL GARDEN ▸');
    expect(html).toContain('TWIN DEEPS ▸');
    expect(html).toContain('UNSEEN CATHEDRAL ▸');
    expect(html.match(/<button/g)).toHaveLength(2);
  });

  it('gives the briefing’s name beside the region’s where they differ', () => {
    const html = renderToStaticMarkup(
      <RegionsPanel current="gravity-range" currentName="Gravity range" />,
    );
    expect(html).toContain('Twin Deeps · Gravity range');
  });

  it('names an encounter that is not one of the regions by its briefing, offering all three', () => {
    const html = renderToStaticMarkup(<RegionsPanel current="test-range" currentName="Test" />);
    expect(html).toContain('Test');
    expect(html.match(/<button/g)).toHaveLength(3);
  });
});
