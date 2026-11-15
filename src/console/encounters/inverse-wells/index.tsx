import type { BelievedField } from '../../../contracts/index.ts';
import { Panel, Readout, ReadoutGrid } from '../../../theme/components/index.ts';
import { Caption, Line } from '../../controls.tsx';
import { readWellVisual, wellDisplayState } from '../../../view3d/fields/wells/evidence.ts';
import { readWellFunnelVisual } from '../../../view3d/fields/wells/funnel.ts';

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
  const visual = readWellFunnelVisual(field) ?? readWellVisual(field);
  const state = wellDisplayState(visual, t);
  const supported = state === 'current';
  return (
    <Panel
      title="Well response"
      aside={field.id}
      statusLine={
        state === 'current' && visual?.schema === 'well-funnel-observation-v2'
          ? 'Observed funnel · shape does not establish its force response'
          : explanation[state]
      }
      status={supported ? 'nominal' : 'stale'}
    >
      {visual && state !== 'unknown' ? (
        <>
          <Line label="model rule">{visual.rule}</Line>
          <Line label="geometry record">
            {visual.provenance.attemptId} · {visual.provenance.frameId}
          </Line>
          <Line label="acquired through">{visual.provenance.to.toFixed(1)} s</Line>
          {visual.schema === 'well-funnel-observation-v2' ? (
            <>
              <Line label="visible state">{visual.phase}</Line>
              <Readout
                label="Observed brightness"
                value={(100 * visual.brightness).toFixed(1)}
                unit="%"
                status={supported ? 'nominal' : 'stale'}
              />
              <ReadoutGrid columns={3}>
                {(
                  [
                    ['Length', visual.geometry.length],
                    ['Mouth radius', visual.geometry.mouthRadius],
                    ['Throat radius', visual.geometry.throatRadius],
                  ] as const
                ).map(([label, reading]) => (
                  <Readout
                    key={label}
                    label={label}
                    value={(reading.value / 1000).toFixed(2)}
                    sigma={(reading.sigma / 1000).toFixed(2)}
                    unit="km"
                    status={supported ? 'nominal' : 'stale'}
                  />
                ))}
              </ReadoutGrid>
              <Line label="mouth → throat axis">
                {[visual.geometry.axis.x, visual.geometry.axis.y, visual.geometry.axis.z]
                  .map((v) => v.toFixed(3))
                  .join(', ')}{' '}
                ± {visual.geometry.axisSigma.toFixed(3)} rad
              </Line>
            </>
          ) : (
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
          )}
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
