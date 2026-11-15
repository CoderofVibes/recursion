/**
 * MODEL: the loop's sixth stage. What the predictive model holds and how far to trust it (A2,
 * A4, A5, P5). It fits numbers by itself and shows them with their uncertainty and how much of
 * each comes from data. It never adopts a rule: the player tests one against an attempt held
 * out from the fit, and adopts or revokes it.
 *
 * The page leads with the evidence as a picture: for each body, the strength of its pull as the
 * flights measured it, against distance, as a multiple of what the model's law says there. On
 * the line at ×1 the law holds; a slope means it does not. Once a rule is adopted the same
 * measurements are drawn against the new law, with the picture from before kept under it.
 * Beside it the rule, as the three steps of its test (fit, hold out, result), with the test's
 * numbers as bars; then the model's own figures. The rest of 1G's spec §9 (parameters, the
 * confounding indicator, calibration freshness, coverage, burn checks and unexplained pull)
 * folds away under those.
 */
import { useState } from 'react';
import type { ExtensionState, ModelState, ParameterEstimate } from '../../contracts/index.ts';
import type { ExtensionRecord, ModelReport } from '../../model/index.ts';
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
import { clock, dist, duration, fixed, sci, whole } from '../format.ts';
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

/**
 * A test's result in plain words before its statistics (S9 R7): insufficient evidence, fails,
 * passes but not adopted, or adopted. Never a readiness state the numbers do not support.
 *
 * `why` is the model's own reason for how the held-out attempt came out, in plain words (2C's
 * `heldOutTest.diagnosis`, read from the test's numbers): where the misfit lies, and what to
 * hold out instead. A test saved before the model gave one has none, and keeps the old words.
 */
export function testVerdict(
  result: ExtensionRecord | { error: string } | undefined,
  adopted: boolean,
): { text: string; status: Status; why?: string } | null {
  const why = result && !('error' in result) ? result.heldOutTest?.diagnosis?.why : undefined;
  const reason = why ? { why } : {};
  if (adopted) return { text: 'adopted', status: 'nominal', ...reason };
  if (!result) return null;
  if ('error' in result) return { text: `no test: ${result.error}`, status: 'caution' };
  if (result.adoptable) return { text: 'passes · not adopted', status: 'nominal', ...reason };
  if (result.heldOutTest && !result.heldOutTest.pass)
    return why
      ? { text: 'fails its held-out test', status: 'caution', why }
      : { text: 'fails: the held-out attempt departs from it', status: 'caution' };
  if (result.identifiable && !result.identifiable.identifiable)
    return {
      text: `insufficient evidence: ${result.identifiable.reasons.join('; ') || 'not identifiable'}`,
      status: 'caution',
    };
  if (result.evidence && !result.evidence.evidence)
    return { text: 'insufficient evidence: the fit does not beat its penalty', status: 'caution' };
  return { text: 'not adoptable', status: 'caution' };
}

/** What a slope of measured strength against distance says, in words. */
export function slopeText(slope: number | null): string {
  if (slope === null) return 'too few fits to tell a slope';
  if (Math.abs(slope) < 0.05)
    return `slope ${fixed(slope, 2)}: the law holds across these distances`;
  return `slope ${fixed(slope, 2)}: the pull is ${slope < 0 ? 'stronger' : 'weaker'} close in than the law says`;
}

/** One body's local fits as the plot draws them. */
const dotsOf = (
  body: ModelReport['strength'][number],
  current: string | undefined,
): StrengthDot[] =>
  body.points
    .filter((pt) => pt.converged)
    .map((pt) => ({
      distance: pt.distance,
      scale: pt.scale,
      sigma: pt.scaleSigma,
      probe: pt.probe !== undefined,
      current: pt.attempt === current,
    }));

export function ModelPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const [heldOut, setHeldOut] = useState('');
  const [busy, setBusy] = useState('');
  const model: ModelState = game.model.state();
  const snapshot = desk.snapshot();
  const status = game.status();
  const archive = desk.archive();
  const finished = archive.attempts.filter((a) => a.outcome.kind !== 'in-progress');
  const held = finished.some((a) => a.id === heldOut) ? heldOut : (finished.at(-1)?.id ?? '');
  desk.refreshReport();
  const report = desk.report;
  const before = desk.reportBefore;
  const shown = desk.preview ?? snapshot.forecasts.at(-1);
  const visits = visited(shown, snapshot);
  const spans = validatedSpans(model);
  const bodyName = (id: string): string =>
    snapshot.world.bodies.find((b) => b.id === id)?.name ?? id;

  // Strength against distance: the model's local fits. The report says which attempt and which
  // tracked rock each came from; until it arrives, the state's own calibration windows are drawn.
  // The same fits as rows, for reading without the plot (S9 R7): source, distance, strength ± σ.
  const strength: {
    body: string;
    slope: number | null | undefined;
    points: StrengthDot[];
    rows: { key: string; source: string; distance: string; value: string }[];
  }[] = report
    ? report.strength.map((body) => ({
        body: body.body,
        slope: body.slope,
        points: dotsOf(body, status.attemptId),
        rows: body.points.map((pt) => ({
          key: pt.window,
          source:
            `attempt ${archive.attempts.find((a) => a.id === pt.attempt)?.index ?? '—'}` +
            (pt.probe ? ` · rock ${pt.probe}` : '') +
            (pt.converged ? '' : ' · not converged'),
          distance: `${dist(pt.distance)} (${dist(pt.rMin)} – ${dist(pt.rMax)})`,
          value: `${fixed(pt.scale, 3)} ±${fixed(pt.scaleSigma, 3)}`,
        })),
      }))
    : model.calibration.map((profile) => ({
        body: profile.body,
        slope: undefined,
        points: profile.windows.map((w) => ({
          distance: w.distance,
          scale: w.scale,
          sigma: w.sigma,
          probe: false,
          current: false,
        })),
        rows: profile.windows.map((w, i) => ({
          key: String(i),
          source: 'calibration',
          distance: dist(w.distance),
          value: `${fixed(w.scale, 3)} ±${fixed(w.sigma, 3)}`,
        })),
      }));

  // A body is plotted once something has been measured of it; until then it is named, not
  // drawn as an empty plot.
  const measuredBodies = strength.filter((b) => b.points.length > 0);
  const unmeasured = strength.filter((b) => b.points.length === 0);

  // World parameters and rules' parameters once each; ship calibrations as used in this attempt.
  const world = model.parameters.filter((p) => !p.arc && !p.freshness);
  const calibrations = model.parameters.filter(
    (p) => p.arc === status.attemptId || (p.freshness && !p.arc),
  );
  const shipCal = calibrations.length
    ? calibrations
    : model.parameters.filter((p) => /^(thruster|sensor)\./.test(p.id) && !p.arc);

  const test = (rule: string): void => {
    // Training never includes the held-out attempt.
    const fitOn = finished.filter((a) => a.id !== held).map((a) => a.id);
    if (!game.rules || !held || fitOn.length === 0) return;
    setBusy(rule);
    game.rules.test(rule, fitOn, held).then(
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
    // The evidence as it stood against the law about to be replaced, kept to show beside the new.
    const standing = desk.report;
    (adopt ? game.rules.adopt(rule) : game.rules.revoke(rule)).then(
      (next) => {
        setBusy('');
        desk.reportBefore = adopt ? standing : undefined;
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

  // Which finished attempts the model could use, and why TEST is unavailable when it is (S9 R6).
  const indexOf = (id: string): number | string =>
    archive.attempts.find((a) => a.id === id)?.index ?? id;
  const unused = new Map(
    (report?.coverage ?? [])
      .filter((c) => !c.used)
      .map((c) => [c.attempt, c.missing[0] ?? 'nothing the model can fit'] as const),
  );
  const training = finished.filter((a) => a.id !== held);
  const usableTraining = training.filter((a) => !unused.has(a.id));
  const unavailable = !game.rules
    ? 'the model here is a stand-in: rules cannot be tested'
    : finished.length < 2
      ? `a test needs two finished attempts: one to fit the rule, one held out to check it (${finished.length} finished)`
      : unused.has(held)
        ? `attempt ${indexOf(held)} cannot be held out: ${unused.get(held)}`
        : usableTraining.length === 0
          ? `no attempt left to fit the rule: ${training.map((a) => `attempt ${a.index}: ${unused.get(a.id)}`).join('; ')}`
          : null;
  const latest = snapshot.forecasts.at(-1);
  const adoptedCount = model.extensions.filter((e) => e.status === 'adopted').length;

  return (
    <div className="cp-grid" data-cols="chart-side">
      <div className="cp-hero" data-scroll="">
        <div className="cp-tools">
          <span className="cp-tools__title">
            Strength of the pull against distance · measured ÷ the model’s law
          </span>
          <p className="cs-legend">
            <span data-swatch="law">the model’s law</span>
            <span data-swatch="trend">as measured</span>
            <span data-swatch="validated">rule tested here</span>
            <span data-swatch="visits">the plan flies here</span>
            <span data-swatch="probe">from a tracked rock</span>
          </p>
        </div>
        {measuredBodies.length ? (
          <div className="cp-plots">
            {measuredBodies.map((body) => {
              const was = before?.strength.find((s) => s.body === body.body);
              return (
                <figure className="cp-plot" key={body.body}>
                  <div className="cp-plot__pair">
                    <div>
                      <figcaption>
                        <span className="cp-plot__name">
                          {bodyName(body.body)}
                          {was ? ' · with the rule' : ''}
                        </span>
                        <span>
                          {body.slope === undefined
                            ? `${body.points.length} local fits · report pending`
                            : slopeText(body.slope)}
                        </span>
                      </figcaption>
                      <StrengthPlot
                        label={`${bodyName(body.body)}: measured strength against distance`}
                        points={body.points}
                        validated={spans.get(body.body) ?? []}
                        {...(visits.get(body.body) ? { visits: visits.get(body.body)! } : {})}
                        {...(typeof body.slope === 'number' ? { slope: body.slope } : {})}
                      />
                    </div>
                    {was ? (
                      <div>
                        <figcaption>
                          <span className="cp-plot__name">
                            {bodyName(body.body)} · before the rule
                          </span>
                          <span>{slopeText(was.slope)}</span>
                        </figcaption>
                        <StrengthPlot
                          label={`${bodyName(body.body)}: measured strength against distance, before the rule was adopted`}
                          points={dotsOf(was, undefined)}
                          {...(typeof was.slope === 'number' ? { slope: was.slope } : {})}
                        />
                      </div>
                    ) : null}
                  </div>
                  {body.rows.length ? (
                    <details className="cs-details">
                      <summary>
                        data · {body.rows.length} fit{body.rows.length === 1 ? '' : 's'}
                      </summary>
                      <table className="cs-table">
                        <thead>
                          <tr>
                            <th scope="col">source</th>
                            <th scope="col">distance</th>
                            <th scope="col">strength ±σ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {body.rows.map((r) => (
                            <tr key={r.key}>
                              <td>{r.source}</td>
                              <td>{r.distance}</td>
                              <td>{r.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  ) : null}
                </figure>
              );
            })}
          </div>
        ) : (
          <div className="cp-empty">
            <p>Nothing measured yet</p>
            <p className="cs-note">
              fly, and track a body or a rock: each stretch of coasting measures the pull at the
              distances it covers
            </p>
          </div>
        )}
        {measuredBodies.length && unmeasured.length ? (
          <p className="cs-note">
            nothing measured yet of {unmeasured.map((b) => bodyName(b.body)).join(', ')}: no
            coasting fixes on {unmeasured.length === 1 ? 'it' : 'them'}
          </p>
        ) : null}
        <p className="cs-note">
          each point is a stretch of coasting: the pull it measured, over what the model’s law says
          at that distance. On the line at ×1 the law holds there; a slope means it does not
        </p>
      </div>

      <div className="cp-side">
        <Panel title="Rules" tone="forecast" aside="tested by the player, held out">
          {RULES.map((rule) => {
            const ext = model.extensions.find((e) => e.id === rule.id);
            const state = ruleStatus(ext);
            const result = desk.tests.get(rule.id);
            const adopted = ext?.status === 'adopted';
            const adoptable = isRecord(result) ? result.adoptable : false;
            const v = isRecord(result) ? result.heldOutTest : undefined;
            const validation = isRecord(result) ? result.state.validation : undefined;
            const fitted = isRecord(result) ? Object.entries(result.fitted ?? {}) : [];
            const verdict = testVerdict(result, adopted);
            return (
              <div className="cs-item" key={rule.id}>
                <div className="cs-item__head">
                  <span>{rule.label}</span>
                  <span className="cs-item__value" data-status={state.status}>
                    {state.text}
                  </span>
                </div>
                <p className="cs-note">{rule.detail}</p>
                {/* The test as its three steps: what it is fitted on, what is held out, the result. */}
                <ol className="cp-steps" aria-label="The test">
                  <li data-done={training.length > 0 && !unavailable ? '' : undefined}>
                    <span className="cp-steps__label">Fit on</span>
                    <span className="cp-steps__value">
                      {isRecord(result)
                        ? `attempt${result.training.length > 1 ? 's' : ''} ${result.training.map(indexOf).join(', ')}`
                        : training.length
                          ? `attempt${training.length > 1 ? 's' : ''} ${training.map((a) => a.index).join(', ')}`
                          : '—'}
                    </span>
                  </li>
                  <li data-done={held && !unavailable ? '' : undefined}>
                    <span className="cp-steps__label">Check on</span>
                    <span className="cp-steps__value">
                      {isRecord(result) && result.heldOut
                        ? `attempt ${indexOf(result.heldOut)}`
                        : held
                          ? `attempt ${indexOf(held)}`
                          : '—'}
                    </span>
                  </li>
                  <li
                    data-done={verdict ? '' : undefined}
                    data-status={verdict ? verdict.status : undefined}
                  >
                    <span className="cp-steps__label">Result</span>
                    <span className="cp-steps__value">
                      {busy === rule.id ? 'working' : verdict ? verdict.text : 'not tested'}
                    </span>
                  </li>
                </ol>
                {/* Why the held-out attempt came out as it did, in the model's own words. */}
                {verdict?.why && busy !== rule.id ? (
                  <p className="cs-why" data-status={verdict.status}>
                    {verdict.why}
                  </p>
                ) : null}
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
                {unavailable ? (
                  <Line label="test unavailable" status="caution">
                    {unavailable}
                  </Line>
                ) : null}
                {v ? (
                  <LevelBar
                    label="Held-out T/ν"
                    value={v.TperNu}
                    max={Math.max(v.threshold * 2, v.TperNu * 1.1)}
                    text={`${fixed(v.TperNu, 2)} against ${fixed(v.threshold, 2)}`}
                    tone="forecast"
                    status={v.TperNu <= v.threshold ? 'nominal' : 'caution'}
                    marks={[{ at: v.threshold, kind: 'warning', label: 'must stay under' }]}
                  />
                ) : null}
                {validation ? (
                  <>
                    <Caption>how far the held-out flight is from the model</Caption>
                    <LevelBar
                      label="Without the rule"
                      value={validation.rmsBefore}
                      max={Math.max(validation.rmsBefore, validation.rmsAfter, 1)}
                      text={dist(validation.rmsBefore)}
                      status="caution"
                    />
                    <LevelBar
                      label="With the rule"
                      value={validation.rmsAfter}
                      max={Math.max(validation.rmsBefore, validation.rmsAfter, 1)}
                      text={dist(validation.rmsAfter)}
                      tone="forecast"
                      status="nominal"
                    />
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
                  <Line key={i} label={`tested · ${bodyName(s.body)}`} tone="forecast">
                    {dist(s.rMin)} – {dist(s.rMax)} · σ {fixed(s.sigmaE, 3)}
                  </Line>
                ))}
                <Actions>
                  <Button
                    tone="forecast"
                    disabled={unavailable !== null || adopted || busy !== ''}
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
                {adopted ? (
                  // Adoption changes the model, never a plan: the next forecast is the player's
                  // to ask for (S9 R8).
                  <>
                    <Line label="in force" tone="forecast">
                      forecasts from now use model v{model.version}
                      {latest && latest.modelVersion < model.version
                        ? ` · the issued forecast is from v${latest.modelVersion}`
                        : ''}
                    </Line>
                    <Actions>
                      <Button tone="forecast" onClick={() => desk.setPage('plan')}>
                        PLAN WITH IT ▸
                      </Button>
                    </Actions>
                  </>
                ) : null}
              </div>
            );
          })}
          <Caption>where a rule is tested, against where the plan flies</Caption>
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
                {reach ? `flies ${dist(reach[0])} – ${dist(reach[1])}` : 'no forecast'} ·{' '}
                {list.length
                  ? `tested ${list.map((s) => `${dist(s.rMin)} – ${dist(s.rMax)}`).join(', ')}`
                  : 'nothing tested'}
              </Line>
            );
          })}
        </Panel>

        <Panel
          title="Model"
          tone="forecast"
          aside={`v${model.version}`}
          statusLine={
            failure
              ? `model fault: ${failure}`
              : report?.fitFailure
                ? `▲ the joint fit could not be solved: ${report.fitFailure}. Shared values held at their priors; each attempt fitted on its own`
                : `${model.basedOn.attempts.length} attempts · ${whole(model.basedOn.measurementCount)} measurements`
          }
          status={failure ? 'warning' : report?.fitFailure ? 'caution' : 'nominal'}
        >
          <ReadoutGrid columns={3}>
            <Readout label="Version" value={`v${model.version}`} tone="forecast" />
            <Readout label="Rules" value={adoptedCount} tone="forecast" />
            <Readout
              label="Noise ×"
              value={model.noiseScale !== undefined ? fixed(model.noiseScale, 2) : '—'}
            />
          </ReadoutGrid>
          <Caption>how far the flights are from the model</Caption>
          <LevelBar
            label={`Coasting · ${whole(model.residuals.coast.n)} fixes`}
            value={model.residuals.coast.rms}
            max={Math.max(model.residuals.coast.rms, model.residuals.powered.rms, 1)}
            text={dist(model.residuals.coast.rms)}
          />
          <LevelBar
            label={`Powered · ${whole(model.residuals.powered.n)} fixes`}
            value={model.residuals.powered.rms}
            max={Math.max(model.residuals.coast.rms, model.residuals.powered.rms, 1)}
            text={dist(model.residuals.powered.rms)}
          />
          <Line label="fit χ²/ν">
            {model.fit && model.fit.nu > 0 ? sci(model.fit.chi2 / model.fit.nu, 3) : '—'}
          </Line>
          <Line label="finished attempts" status={finished.length >= 2 ? 'nominal' : 'stale'}>
            {finished.length}
            {report
              ? ` · ${finished.filter((a) => !unused.has(a.id)).length} used by the model`
              : ''}
          </Line>
        </Panel>

        <details className="cp-fold">
          <summary>what the model holds · {world.length} values</summary>
          <div className="cp-fold__body">
            <Caption>each value, and how much of it comes from data</Caption>
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
          </div>
        </details>

        <details className="cp-fold">
          <summary>
            {confounding
              ? confounding.confounded
                ? `▲ pull and engine cannot be told apart (|ρ| ${fixed(confounding.maxAbsRho, 2)})`
                : `calibration · pull and engine separable (|ρ| ${fixed(confounding.maxAbsRho, 2)})`
              : 'calibration and confounding'}
          </summary>
          <div className="cp-fold__body">
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
            <Caption>what each attempt gives the model</Caption>
            {(report?.coverage ?? []).slice(-4).map((c) => (
              <Line
                key={c.attempt}
                label={`attempt ${indexOf(c.attempt)} · ${c.used ? 'used' : 'not used'}`}
                status={!c.used ? 'warning' : c.missing.length ? 'caution' : 'nominal'}
              >
                {c.missing.length
                  ? c.missing.join('; ')
                  : `${c.coastFixes} coasting fixes · ${c.burns} burns`}
              </Line>
            ))}
            {!report ? (
              <p className="cs-note">diagnostics arrive with the model&apos;s next report</p>
            ) : null}
          </div>
        </details>

        <BurnsAndPull desk={desk} indexOf={indexOf} />
      </div>
    </div>
  );
}

/**
 * Two questions the player can put to the model when a forecast and the flight disagree (spec
 * §9.4, §9.5): did each burn deliver what was commanded, and is there a pull the law in force
 * does not explain? Each costs fits, so each runs only when asked.
 */
function BurnsAndPull({
  desk,
  indexOf,
}: {
  readonly desk: Desk;
  readonly indexOf: (id: string) => number | string;
}) {
  const { game } = desk;
  const version = game.model.state().version;
  const burns = desk.burnCheck;
  const pull = desk.unexplained;
  const off = (value: number, sigma: number, expected: number): boolean =>
    Math.abs(value - expected) > 3 * Math.max(sigma, 1e-9);
  return (
    <details className="cp-fold" open={burns !== undefined || pull !== undefined}>
      <summary>was it the engine, or the pull?</summary>
      <div className="cp-fold__body">
        <Actions>
          <Button tone="forecast" disabled={!game.rules} onClick={() => desk.checkBurns()}>
            CHECK BURNS
          </Button>
          <Button tone="forecast" disabled={!game.rules} onClick={() => desk.findUnexplained()}>
            FIND UNEXPLAINED PULL
          </Button>
        </Actions>
        {burns ? (
          <>
            <Caption>
              burns · achieved ÷ commanded · model v{burns.version}
              {burns.version !== version ? ' (older than the model)' : ''}
            </Caption>
            {burns.burns.length === 0 ? (
              <p className="cs-note">no recorded burn had enough fixes around it to judge</p>
            ) : (
              burns.burns.slice(-6).map((b) => (
                <Line
                  key={`${b.attempt}-${b.t0}-${b.thruster}`}
                  label={`attempt ${indexOf(b.attempt)} · ${b.kind === 'rcs' ? 'rcs' : 'engine'} T+${clock(b.t0)}`}
                  status={
                    !b.converged
                      ? 'stale'
                      : off(b.along, b.alongSigma, 1) ||
                          (b.kind === 'engine' &&
                            (off(b.across, b.acrossSigma, 0) || off(b.up, b.upSigma, 0)))
                        ? 'caution'
                        : 'nominal'
                  }
                >
                  {fixed(b.along, 3)} ±{fixed(b.alongSigma, 3)}
                  {b.kind === 'engine'
                    ? ` · across ${fixed(b.across, 3)} · up ${fixed(b.up, 3)}`
                    : ''}
                </Line>
              ))
            )}
          </>
        ) : null}
        {pull ? (
          pull.result ? (
            <>
              <Caption>
                pull the law does not explain · {pull.result.body} · model v{pull.version}
              </Caption>
              <Line
                label="along the track"
                status={pull.result.maxAbsTangentialZ > 3 ? 'caution' : 'nominal'}
              >
                largest {fixed(pull.result.maxAbsTangentialZ, 1)}σ
              </Line>
              <Line
                label="out of the plane"
                status={pull.result.maxAbsNormalZ > 3 ? 'caution' : 'nominal'}
              >
                largest {fixed(pull.result.maxAbsNormalZ, 1)}σ
              </Line>
              <Line label="fit χ²/ν">{fixed(pull.result.chi2PerDof, 2)}</Line>
              <p className="cs-note">
                a wrong strength with distance leaves no pull along the track; a mass the model
                lacks does, and a body off the plane shows out of it
              </p>
              <details className="cs-details">
                <summary>data · {pull.result.rows.length} windows</summary>
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th scope="col">window</th>
                      <th scope="col">radial ±σ</th>
                      <th scope="col">along ±σ</th>
                      <th scope="col">normal ±σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pull.result.rows.map((r) => (
                      <tr key={r.window}>
                        <td>
                          attempt {indexOf(r.attempt)} · T+{clock(r.t0)}
                        </td>
                        <td>
                          {sci(r.aR, 2)} ±{sci(r.sigmaR, 1)}
                        </td>
                        <td>
                          {sci(r.aT, 2)} ±{sci(r.sigmaT, 1)}
                        </td>
                        <td>
                          {sci(r.aN, 2)} ±{sci(r.sigmaN, 1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <p className="cs-note">nothing to fit yet: no tracked arc</p>
          )
        ) : null}
        {!burns && !pull ? (
          <p className="cs-note">
            ask when a forecast and the flight disagree: was it the engine, or the pull?
          </p>
        ) : null}
      </div>
    </details>
  );
}
