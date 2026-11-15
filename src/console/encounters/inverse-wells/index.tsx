import type { BelievedField } from '../../../contracts/index.ts';
import { Panel, Readout, ReadoutGrid } from '../../../theme/components/index.ts';
import { Caption, Line } from '../../controls.tsx';
import { readWellVisual, wellDisplayState } from '../../../view3d/fields/wells/evidence.ts';

export interface WellEvidencePanelProps {
  readonly field: BelievedField;
  readonly t: number;
}

const explanation = {
  unknown: 'No acquired well geometry',
  archived: 'Archived coordinates — acquire this run’s geometry',
  unresolved: 'Geometry unresolved — no supported influence surface',
  stale: 'Geometry stale — refresh tracking before relying on boundaries',
  current: 'Estimated spherical influence · funnel is schematic',
} as const;

/** Observation display only: no automatic experiment, rule adoption, or clock control. */
export function WellEvidencePanel({ field, t }: WellEvidencePanelProps) {
  const visual = readWellVisual(field);
  const state = wellDisplayState(visual, t);
  const supported = state === 'current';
  return (
    <Panel
      title="Well response"
      aside={field.id}
      statusLine={explanation[state]}
      status={supported ? 'nominal' : 'stale'}
    >
      {visual && state !== 'unknown' ? (
        <>
          <Line label="model rule">{visual.rule}</Line>
          <Line label="geometry record">
            {visual.provenance.attemptId} · {visual.provenance.frameId}
          </Line>
          <Line label="acquired through">{visual.provenance.to.toFixed(1)} s</Line>
          <ReadoutGrid>
            <Readout
              label="Inner radius"
              value={(visual.geometry.innerRadius.value / 1000).toFixed(2)}
              sigma={(visual.geometry.innerRadius.sigma / 1000).toFixed(2)}
              unit="km"
              status={supported ? 'nominal' : 'stale'}
            />
            <Readout
              label="Outer radius"
              value={(visual.geometry.outerRadius.value / 1000).toFixed(2)}
              sigma={(visual.geometry.outerRadius.sigma / 1000).toFixed(2)}
              unit="km"
              status={supported ? 'nominal' : 'stale'}
            />
          </ReadoutGrid>
          <Caption>Recorded comparisons · gain ± 1σ; coast is acceleration residual</Caption>
          {visual.responses.length === 0 ? (
            <Line label="response">No recorded comparison</Line>
          ) : (
            visual.responses.map((r, i) => (
              <Readout
                key={`${r.experiment}:${r.axis}:${i}`}
                label={`${r.axis} · ${r.experiment} · ${r.role}`}
                value={r.response.value.toFixed(3)}
                sigma={r.response.sigma.toFixed(3)}
                unit={r.axis === 'coast' ? 'm/s²' : 'gain'}
                tone={r.role === 'held-out' ? 'blackbox' : 'measured'}
              />
            ))
          )}
          <Line label="support">{visual.support}; untested directions remain unsupported</Line>
        </>
      ) : (
        <Line label="evidence">Record powered comparisons and coast controls</Line>
      )}
    </Panel>
  );
}
