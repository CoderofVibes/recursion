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
  it('presents an observed A19 funnel and precursor without substituting spherical influence or inferred mechanics', () => {
    const funnel: BelievedField = {
      id: 'observed-funnel',
      kind: 'inverse-well',
      detected: true,
      visual: {
        schema: 'well-funnel-observation-v2',
        phase: 'precursor',
        provenance: {
          attemptId: 'A2',
          frameId: 'P03',
          measurementIds: ['image-1'],
          from: 0,
          to: 10,
          current: true,
        },
        support: 'supported',
        validUntil: 20,
        rule: 'ordinary',
        responses: [],
        geometry: {
          mouth: { x: 0, y: 0, z: 0 },
          axis: { x: 0.6, y: 0, z: 0.8 },
          mouthSigma: 10,
          axisSigma: 0.01,
          length: { value: 20_000, sigma: 100 },
          mouthRadius: { value: 2_000, sigma: 20 },
          throatRadius: { value: 100, sigma: 10 },
          stations: [
            { fraction: 0, radius: { value: 2_000, sigma: 20 } },
            { fraction: 1, radius: { value: 100, sigma: 10 } },
          ],
        },
      },
    };
    const html = renderToStaticMarkup(<WellEvidencePanel field={funnel} t={15} />);
    expect(html).toContain('Observed funnel');
    expect(html).toContain('precursor');
    expect(html).toContain('Mouth radius');
    expect(html).toContain('Throat radius');
    expect(html).toContain('20.00');
    expect(html).not.toContain('spherical');
    expect(html).not.toContain('schematic');
    expect(html).not.toContain('crush');
    expect(html).toContain('No recorded comparison');
  });

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
