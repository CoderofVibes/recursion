import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BelievedField } from '../../../contracts/index.ts';
import { WellEvidencePanel } from './index.tsx';

const field: BelievedField = {
  id: 'observed-W',
  kind: 'inverse-well',
  detected: true,
  visual: {
    schema: 'well-observation-v1',
    provenance: {
      attemptId: 'A2',
      frameId: 'P03',
      measurementIds: ['m1'],
      from: 0,
      to: 10,
      current: true,
    },
    support: 'supported',
    validUntil: 20,
    rule: 'candidate',
    geometry: {
      center: { x: 0, y: 0, z: 0 },
      centerSigma: 10,
      innerRadius: { value: 39_000, sigma: 500 },
      outerRadius: { value: 51_000, sigma: 700 },
    },
    responses: [
      {
        experiment: 'probe-A',
        axis: 'radial',
        role: 'held-out',
        measurementIds: ['m1'],
        response: { value: -0.8, sigma: 0.1 },
      },
    ],
  },
};

describe('well observation panel', () => {
  it('shows acquired estimates, explicit candidate status, held-out provenance and uncertainty', () => {
    const html = renderToStaticMarkup(<WellEvidencePanel field={field} t={15} />);
    expect(html).toContain('candidate');
    expect(html).toContain('probe-A · held-out');
    expect(html).toContain('39.00');
    expect(html).toContain('0.50');
    expect(html).toContain('funnel is schematic');
    expect(html).not.toContain('<button');
  });

  it('marks expiry and never supplies default hidden radii when no evidence exists', () => {
    expect(renderToStaticMarkup(<WellEvidencePanel field={field} t={21} />)).toContain(
      'Geometry stale',
    );
    const html = renderToStaticMarkup(
      <WellEvidencePanel field={{ ...field, visual: undefined }} t={15} />,
    );
    expect(html).toContain('No acquired well geometry');
    expect(html).not.toContain('40.00');
    expect(html).not.toContain('50.00');
    const future = renderToStaticMarkup(<WellEvidencePanel field={field} t={9} />);
    expect(future).toContain('No acquired well geometry');
    expect(future).not.toContain('39.00');
  });
});
