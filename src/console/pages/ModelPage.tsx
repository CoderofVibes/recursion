/**
 * MODEL: what the predictive model holds and how far to trust it (A2, A4, A5, P5). It fits
 * numbers by itself and shows them with their uncertainty and how much of each comes from data.
 * It never adopts a rule: the player tests one against an attempt held out from the fit, and
 * adopts or revokes it. Diagnostics follow 1G's spec §9: strength against distance, residuals
 * split by coasting and powered flight, the confounding indicator, calibration freshness, and
 * each adopted rule's validated spans against the distances the flight visits.
 */
import { useState } from 'react';
import type { ExtensionState, ModelState, ParameterEstimate } from '../../contracts/index.ts';
import type { ExtensionRecord } from '../../model/index.ts';
import {
  ComponentList,
  ComponentRow,
  LevelBar,
  Panel,
  Readout,
  ReadoutGrid,
} from '../../theme/components/index.ts';
import type { Status } from '../../theme/components/index.ts';
import { Actions, Button, Caption, Line, SelectField } from '../controls.tsx';
import { validatedSpans, visited } from '../data.ts';
import type { Desk } from '../desk.ts';
import { dist, duration, fixed, sci } from '../format.ts';
import { StrengthPlot } from '../StrengthPlot.tsx';
import type { StrengthDot } from '../StrengthPlot.tsx';

const RULES: readonly { id: string; label: string; detail: string }[] = [
  {
    id: 'distance-law',
    label: 'DISTANCE LAW',
    detail: 'the pull falls with distance by a fitted power',
  },
];

const value = (p: ParameterEstimate): string =>
  `${sci(p.value, 4)} ±${sci(p.sigma, 2)}${p.unit ? ` ${p.unit}` : ''}`;

function ruleStatus(ext: ExtensionState | undefined): { text: string; status: Status } {
  switch (ext?.status) {
    case 'adopted':
      return { text: 'adopted', status: 'nominal' };
    case 'rejected':
      return { text: 'failed its test', status: 'caution' };
    case 'revoked':
      return { text: 'revoked', status: 'off' };
    case 'candidate':
      return { text: 'tested, not adopted', status: 'stale' };
    default:
      return { text: 'not tested', status: 'off' };
  }
}

const isRecord = (t: ExtensionRecord | { error: string } | undefined): t is ExtensionRecord =>
  t !== undefined && !('error' in t);

export function ModelPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const [heldOut, setHeldOut] = useState('');
  const [busy, setBusy] = useState('');
  const model: ModelState = game.model.state();
  const snapshot = desk.snapshot();
  const status = game.status();
  const archive = game.blackBox.archive();
  const finished = archive.attempts.filter((a) => a.outcome.kind !== 'in-progress');
  const held = finished.some((a) => a.id === heldOut) ? heldOut : (finished.at(-1)?.id ?? '');
  desk.refreshReport();
  const report = desk.report;
  const shown = desk.preview ?? snapshot.forecasts.at(-1);
  const visits = visited(shown, snapshot);
  const spans = validatedSpans(model);

  // Strength against distance: the model's local fits. The report says which attempt and which
  // tracked rock each came from; until it arrives, the state's own calibration windows are drawn.
  const strength: { body: string; points: StrengthDot[] }[] = report
    ? report.strength.map((body) => ({
        body: body.body,
        points: body.points
          .filter((pt) => pt.converged)
          .map((pt) => ({
            distance: pt.distance,
            scale: pt.scale,
            sigma: pt.scaleSigma,
            probe: pt.probe !== undefined,
            current: pt.attempt === status.attemptId,
          })),
      }))
    : model.calibration.map((profile) => ({
        body: profile.body,
        points: profile.windows.map((w) => ({
          distance: w.distance,
          scale: w.scale,
          sigma: w.sigma,
          probe: false,
          current: false,
        })),
      }));

  // World parameters and rules' parameters once each; ship calibrations as used in this attempt.
  const world = model.parameters.filter((p) => !p.arc && !p.freshness);
  const calibrations = model.parameters.filter(
    (p) => p.arc === status.attemptId || (p.freshness && !p.arc),
  );
  const shipCal = calibrations.length
    ? calibrations
    : model.parameters.filter((p) => /^(thruster|sensor)\./.test(p.id) && !p.arc);

  const test = (rule: string): void => {
    const training = finished.filter((a) => a.id !== held).map((a) => a.id);
    if (!game.rules || !held || training.length === 0) return;
    setBusy(rule);
    game.rules.test(rule, training, held).then(
      (result) => {
        desk.tests.set(rule, result);
        setBusy('');
        desk.say(
          `${rule}: ${result.adoptable ? 'holds against the held-out attempt' : 'does not hold'}`,
        );
      },
      (reason: unknown) => {
        desk.tests.set(rule, { error: reason instanceof Error ? reason.message : String(reason) });
        setBusy('');
        desk.say(`${rule}: no test`);
      },
    );
  };
  const decide = (rule: string, adopt: boolean): void => {
    if (!game.rules) return;
    setBusy(rule);
    (adopt ? game.rules.adopt(rule) : game.rules.revoke(rule)).then(
      (next) => {
        setBusy('');
        desk.refreshReport(true);
        desk.say(`${rule} ${adopt ? 'adopted' : 'revoked'}: model v${next.version}`);
      },
      (reason: unknown) => {
        setBusy('');
        desk.say(reason instanceof Error ? reason.message : String(reason));
      },
    );
  };

  const confounding = report?.confounding;
  const failure = desk.modelError();

  return (
    <div className="cs-grid">
      <Panel
        title="Model"
        tone="forecast"
        aside={`v${model.version}`}
        statusLine={
          failure
            ? `model fault: ${failure}`
            : `${model.basedOn.attempts.length} attempts · ${model.basedOn.measurementCount.toLocaleString('en-US')} measurements`
        }
        status={failure ? 'warning' : 'nominal'}
      >
        <ReadoutGrid columns={3}>
          <Readout label="Version" value={`v${model.version}`} tone="forecast" />
          <Readout
            label="Fit χ²/ν"
            value={model.fit && model.fit.nu > 0 ? sci(model.fit.chi2 / model.fit.nu, 3) : '—'}
          />
          <Readout
            label="Noise ×"
            value={model.noiseScale !== undefined ? fixed(model.noiseScale, 2) : '—'}
          />
          <Readout
            label="Coast rms"
            value={dist(model.residuals.coast.rms)}
            sigma={`n ${model.residuals.coast.n}`}
          />
          <Readout
            label="Powered rms"
            value={dist(model.residuals.powered.rms)}
            sigma={`n ${model.residuals.powered.n}`}
          />
          <Readout
            label="Rules"
            value={model.extensions.filter((e) => e.status === 'adopted').length}
            tone="forecast"
          />
        </ReadoutGrid>
        <Caption>parameters · share from data</Caption>
        {world.map((p) => (
          <LevelBar
            key={p.id}
            label={p.label}
            value={p.support}
            max={1}
            text={value(p)}
            tone={p.extension ? 'forecast' : 'measured'}
            status={p.support < 0.05 ? 'stale' : 'nominal'}
          />
        ))}
      </Panel>

      <Panel
        title="Strength against distance"
        aside="measured ÷ model's law"
        statusLine={
          report
            ? report.strength
                .map((s) => `${s.body} slope ${s.slope === null ? '—' : fixed(s.slope, 2)}`)
                .join(' · ')
            : `${strength.reduce((n, b) => n + b.points.length, 0)} local fits · report pending`
        }
      >
        {strength.map((body) => (
          <div key={body.body}>
            <Caption>{body.body}</Caption>
            <StrengthPlot
              label={`${body.body}: measured strength against distance`}
              points={body.points}
              validated={spans.get(body.body) ?? []}
              {...(visits.get(body.body) ? { visits: visits.get(body.body)! } : {})}
            />
          </div>
        ))}
        <p className="cs-legend">
          <span data-swatch="validated">validated span</span>
          <span data-swatch="visits">flight visits</span>
          <span data-swatch="probe">from a tracked rock</span>
        </p>
      </Panel>

      <Panel title="Rules" tone="forecast" aside="tested by the player, held out">
        <SelectField
          label="Hold out"
          value={held}
          options={finished.map((a) => ({
            value: a.id,
            label: `ATTEMPT ${a.index} · ${a.outcome.kind}`,
          }))}
          onChange={setHeldOut}
          disabled={finished.length < 2}
        />
        {finished.length < 2 ? (
          <p className="cs-note">
            a test needs two finished attempts: one to fit the rule, one held out to check it
          </p>
        ) : null}
        {RULES.map((rule) => {
          const ext = model.extensions.find((e) => e.id === rule.id);
          const state = ruleStatus(ext);
          const result = desk.tests.get(rule.id);
          const adopted = ext?.status === 'adopted';
          const adoptable = isRecord(result) ? result.adoptable : false;
          const v = isRecord(result) ? result.heldOutTest : undefined;
          const fitted = isRecord(result) ? Object.entries(result.fitted ?? {}) : [];
          return (
            <div className="cs-item" key={rule.id}>
              <div className="cs-item__head">
                <span>{rule.label}</span>
                <span className="cs-item__value" data-status={state.status}>
                  {state.text}
                </span>
              </div>
              <p className="cs-note">{rule.detail}</p>
              {v ? (
                <>
                  <Line
                    label="held-out T/ν"
                    status={v.TperNu <= v.threshold ? 'nominal' : 'caution'}
                  >
                    {fixed(v.TperNu, 2)} against {fixed(v.threshold, 2)}
                  </Line>
                  {isRecord(result) && result.state.validation ? (
                    <Line label="rms before → after">
                      {dist(result.state.validation.rmsBefore)} →{' '}
                      {dist(result.state.validation.rmsAfter)}
                    </Line>
                  ) : null}
                </>
              ) : null}
              {fitted.map(([id, f]) => (
                <Line key={id} label={id.split('.').at(-1) ?? id} tone="forecast">
                  {fixed(f.value, 4)} ±{sci(f.sigma, 2)}
                </Line>
              ))}
              {isRecord(result) && result.evidence ? (
                <Line label="evidence" status={result.evidence.evidence ? 'nominal' : 'caution'}>
                  {result.evidence.evidence ? 'beats its penalty' : 'does not beat its penalty'}
                </Line>
              ) : null}
              {result && 'error' in result ? (
                <p className="cs-note">no test: {result.error}</p>
              ) : null}
              {(ext?.validatedSpans ?? []).map((s, i) => (
                <Line key={i} label={`validated · ${s.body}`} tone="forecast">
                  {dist(s.rMin)} – {dist(s.rMax)} · σ {fixed(s.sigmaE, 3)}
                </Line>
              ))}
              <Actions>
                <Button
                  tone="forecast"
                  disabled={!game.rules || finished.length < 2 || adopted || busy !== ''}
                  onClick={() => test(rule.id)}
                >
                  {busy === rule.id ? 'TESTING' : 'TEST'}
                </Button>
                <Button
                  primary
                  tone="forecast"
                  disabled={!game.rules || busy !== '' || (!adopted && !adoptable)}
                  onClick={() => decide(rule.id, !adopted)}
                >
                  {adopted ? 'REVOKE' : 'ADOPT'}
                </Button>
              </Actions>
            </div>
          );
        })}
        <Caption>validated spans against the flight</Caption>
        {snapshot.world.bodies.map((b) => {
          const reach = visits.get(b.id);
          const list = spans.get(b.id) ?? [];
          const covered =
            reach !== undefined && list.some((s) => s.rMin <= reach[0] && s.rMax >= reach[1]);
          return (
            <Line
              key={b.id}
              label={b.name}
              status={reach === undefined ? 'off' : covered ? 'nominal' : 'caution'}
            >
              {reach ? `visits ${dist(reach[0])} – ${dist(reach[1])}` : 'no forecast'} ·{' '}
              {list.length
                ? `validated ${list.map((s) => `${dist(s.rMin)} – ${dist(s.rMax)}`).join(', ')}`
                : 'nothing validated'}
            </Line>
          );
        })}
      </Panel>

      <Panel
        title="Calibration and confounding"
        statusLine={
          confounding
            ? confounding.confounded
              ? `▲ gravity and propulsion cannot be told apart (|ρ| ${fixed(confounding.maxAbsRho, 2)})`
              : `gravity and propulsion separable (|ρ| ${fixed(confounding.maxAbsRho, 2)})`
            : 'confounding: no fit yet'
        }
        status={confounding?.confounded ? 'caution' : 'nominal'}
      >
        <ComponentList label="Ship calibration">
          {shipCal.map((p) => {
            const f = p.freshness;
            const aged = f ? f.sigmaAged > f.sigmaMeasured : false;
            return (
              <ComponentRow
                key={`${p.id}-${p.arc ?? ''}`}
                name={p.label}
                mode={
                  f
                    ? `aged ${duration(f.since.shipTime)} · Δv ${fixed(f.since.deltaV, 1)} m/s`
                    : p.support > 0.05
                      ? 'measured'
                      : 'prior only'
                }
                value={`${sci(p.value, 4)} ±${sci(p.sigma, 2)}`}
                status={aged ? 'caution' : p.support < 0.05 && !f ? 'stale' : 'nominal'}
              />
            );
          })}
        </ComponentList>
        {confounding?.pairs.slice(0, 4).map((pair) => (
          <Line
            key={`${pair.gravity}-${pair.propulsion}`}
            label={`${pair.gravity.split('.').slice(1).join('.')} × ${pair.propulsion.split('.').slice(1).join('.')}`}
            status={Math.abs(pair.rho) > 0.9 ? 'caution' : 'nominal'}
          >
            ρ {fixed(pair.rho, 2)}
          </Line>
        ))}
        <Caption>what each attempt lacks</Caption>
        {(report?.coverage ?? []).slice(-4).map((c) => (
          <Line
            key={c.attempt}
            label={c.attempt.replace('attempt-', 'attempt ')}
            status={c.missing.length ? 'caution' : 'nominal'}
          >
            {c.missing.length
              ? c.missing.join('; ')
              : `${c.coastFixes} coasting fixes · ${c.burns} burns`}
          </Line>
        ))}
        {!report ? (
          <p className="cs-note">diagnostics arrive with the model's next report</p>
        ) : null}
      </Panel>
    </div>
  );
}
