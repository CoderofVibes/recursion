/**
 * BLACK BOX: the loop's fifth stage, and the flight recorder that keeps evidence across
 * recurrence (P8, P12). After a flight the first thing to see is the prediction against what
 * happened, so the page leads with it: the flight as its record measured it, drawn over the
 * forecast that was issued for it, seen from the body the ship ranged; where the flight left the
 * forecast is marked on the path. Beside it the verdict (held or left, by how much, when) and how
 * far off the forecast the flight ran over time, then the attempt judged against its own design
 * (5C-0 request 3) and, for a loss, the loss review.
 *
 * Every attempt is listed; two are compared: what was changed, what happened, and where each
 * outcome left its forecast (brief §2). The overlay puts the two attempts into the FLIGHT view.
 * Recall is here: it ends the attempt and begins again at arrival, keeping the records.
 */
import { useState } from 'react';
import type { AttemptRecord, BlackBoxArchive, Forecast } from '../../contracts/index.ts';
import type { ModelReport } from '../../model/index.ts';
import { compareAttempts, forecastDivergence, lossReview } from '../../blackbox/index.ts';
import type { ForecastDivergence, LossReview } from '../../blackbox/index.ts';
import {
  BlackBoxMark,
  ComponentList,
  ComponentRow,
  LevelBar,
  ModeChips,
  Panel,
  Readout,
  ReadoutGrid,
  Trend,
} from '../../theme/components/index.ts';
import { Actions, Button, Caption, Line, SelectField } from '../controls.tsx';
import { recorder } from '../data.ts';
import type { Desk } from '../desk.ts';
import { readForecast } from '../forecastReading.ts';
import type { ForecastReading } from '../forecastReading.ts';
import { bytes, clock, dist, duration, fixed, whole } from '../format.ts';
import { at } from '../instruments/chartMath.ts';
import type { P2 } from '../instruments/chartMath.ts';
import { TrajectoryChart } from '../instruments/TrajectoryChart.tsx';
import type { ChartBody, ChartMark } from '../instruments/TrajectoryChart.tsx';
import { LossReviewView } from '../LossReview.tsx';
import { APPROACH, EVIDENCE, debrief, describeDiff, worstOf } from '../mission.ts';
import type { Debrief } from '../mission.ts';
import { doseRate } from '../radiation.ts';
import { chartPath, measuredTrack, mostRanged, relativeTo, trackBreaks } from '../regionChart.ts';
import { attemptInHand } from '../stages.ts';

const rms = (values: readonly { readonly value: number }[]): number =>
  values.length ? Math.sqrt(values.reduce((s, r) => s + r.value * r.value, 0) / values.length) : 0;

const outcomeText = (a: AttemptRecord): string =>
  a.outcome.kind === 'lost'
    ? `lost · ${a.outcome.cause}`
    : a.outcome.kind === 'completed'
      ? 'completed'
      : a.outcome.kind;

/** Distances one attempt measured the pull at, per body, from the model's local fits. */
export interface MeasuredSpan {
  readonly body: string;
  readonly text: string;
}

/** The attempt judged against its own design. */
export function DebriefView({
  report,
  measured,
  onModel,
  loss,
  threshold,
  forecasts = true,
}: {
  readonly report: Debrief;
  /** What the attempt measured of the pull (S9 R6); absent until the model's report arrives. */
  readonly measured?: readonly MeasuredSpan[];
  readonly onModel?: () => void;
  /** A lost attempt's review from its record: what failed first, and the radiation monitor. */
  readonly loss?: LossReview;
  /** The radiation monitor's hazard threshold, U, when the ship gives one. */
  readonly threshold?: number;
  /** Each forecast's line; left out where the verdict beside it already draws them. */
  readonly forecasts?: boolean;
}) {
  return (
    <>
      <ReadoutGrid columns={3}>
        <Readout label="Attempt" value={report.index} tone="blackbox" />
        <Readout
          label="Outcome"
          value={report.outcome === 'in-progress' ? 'flying' : report.outcome}
          tone="blackbox"
        />
        <Readout label="Ship time" value={clock(report.duration)} />
      </ReadoutGrid>
      {report.design ? (
        <Line label="design" tone="blackbox">
          {EVIDENCE[report.design.evidence].label} · {APPROACH[report.design.approach].label}
        </Line>
      ) : (
        <p className="cs-note">no design was recorded for this attempt</p>
      )}
      <Caption>planned against measured</Caption>
      {report.constraints.map((c) => (
        <Line
          key={c.label}
          label={c.label}
          status={c.met === null ? 'stale' : c.met ? 'nominal' : 'warning'}
        >
          {c.planned} → {c.measured}
        </Line>
      ))}
      <Caption>limiting event</Caption>
      {report.limiting ? (
        <Line label={report.limiting.label} status="caution">
          {report.limiting.detail}
        </Line>
      ) : (
        <p className="cs-note">none recorded</p>
      )}
      {/* A loss, read from the record in the order it happened (A24, A16). */}
      {loss ? (
        <LossReviewView review={loss} {...(threshold !== undefined ? { threshold } : {})} />
      ) : null}
      {forecasts
        ? report.forecasts.map((f) => (
            <Line
              key={f.label}
              label={f.label}
              tone={f.measured ? 'measured' : 'forecast'}
              status={f.measured ? undefined : f.bad ? 'caution' : 'nominal'}
            >
              {f.value}
            </Line>
          ))
        : null}
      {measured ? (
        <>
          <Caption>the pull, measured</Caption>
          {measured.length ? (
            measured.map((m) => (
              <Line key={m.body} label={m.body} tone="measured">
                {m.text}
              </Line>
            ))
          ) : (
            <p className="cs-note">no local fit of the pull from this attempt</p>
          )}
          {onModel ? (
            <Actions>
              <Button tone="forecast" onClick={onModel}>
                OPEN MODEL
              </Button>
            </Actions>
          ) : null}
        </>
      ) : null}
      <Caption>cost</Caption>
      {report.cost.map((c) => (
        <Line key={c.label} label={c.label}>
          {c.value}
        </Line>
      ))}
      <Caption>changed from the attempt before</Caption>
      {report.changed.length ? (
        report.changed.map((line, i) => (
          <p className="cs-change" key={i}>
            {line}
          </p>
        ))
      ) : (
        <p className="cs-note">nothing to compare with yet</p>
      )}
    </>
  );
}

/**
 * Worked out once per change of input, not once per refresh (S15): the console refreshes five
 * times a second, and a debrief or comparison walks every measurement of the records. Inputs
 * are compared by identity; the desk hands back the same archive objects between its reads.
 */
function memoLast<A extends readonly unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let last: { args: A; value: R } | undefined;
  return (...args: A): R => {
    if (last && args.every((v, i) => Object.is(v, last!.args[i]))) return last.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}

const sortedAttempts = memoLast((archive: BlackBoxArchive): AttemptRecord[] =>
  [...archive.attempts].sort((a, b) => a.index - b.index),
);

interface KnownBody {
  readonly id: string;
  readonly radius: number;
  readonly name: string;
}

const debriefFor = memoLast(
  (
    record: AttemptRecord,
    archive: BlackBoxArchive,
    attempts: readonly AttemptRecord[],
    /** The bodies as JSON (a string, so an unchanged list memoizes). */
    bodyKey: string,
  ): Debrief => {
    const bodies = JSON.parse(bodyKey) as KnownBody[];
    return debrief(record, { ...archive, attempts }, bodies);
  },
);

const comparisonFor = memoLast(compareAttempts);

/**
 * A lost attempt's review (2C's `lossReview`), from its record alone. The monitor's threshold
 * and saturation limit come from the ship's latest reading when it has given one; without them
 * the review finds the spike as a rise and flags no reading as over range.
 */
const lossReviewFor = memoLast(
  (
    record: AttemptRecord,
    threshold: number | undefined,
    saturation: number | undefined,
    equipmentKey: string,
  ): LossReview =>
    lossReview(record, {
      ...(threshold !== undefined ? { threshold } : {}),
      ...(saturation !== undefined ? { saturation } : {}),
      knownEquipment: equipmentKey.split('|'),
    }),
);

const measuredFor = memoLast((strength: ModelReport['strength'], attempt: string): MeasuredSpan[] =>
  strength.flatMap((s) => {
    const mine = s.points.filter((p) => p.attempt === attempt && p.converged);
    if (mine.length === 0) return [];
    const lo = Math.min(...mine.map((p) => p.rMin));
    const hi = Math.max(...mine.map((p) => p.rMax));
    const rel = mine.map((p) => p.scaleSigma / Math.max(1e-9, Math.abs(p.scale)));
    const best = Math.min(...rel);
    const worst = Math.max(...rel);
    return [
      {
        body: s.body,
        text:
          `${dist(lo)} – ${dist(hi)} · ${mine.length} fit${mine.length === 1 ? '' : 's'} · ±` +
          (worst - best < 0.005
            ? `${fixed(best * 100, 1)}%`
            : `${fixed(best * 100, 1)}–${fixed(worst * 100, 1)}%`),
      },
    ];
  }),
);

/** Each forecast an attempt was issued, against what the attempt then measured. */
const divergencesFor = memoLast(
  (record: AttemptRecord): { readonly f: Forecast; readonly d: ForecastDivergence }[] =>
    record.forecasts.map((f) => ({ f, d: forecastDivergence(f, record) })),
);

/**
 * The forecast a flight is best read against: the one the flight left first; failing that, the
 * one most of the flight was compared with.
 */
export function leadForecast(
  divergences: readonly { readonly f: Forecast; readonly d: ForecastDivergence }[],
): Forecast | undefined {
  let lead: (typeof divergences)[number] | undefined;
  for (const x of divergences) {
    if (!lead) {
      lead = x;
      continue;
    }
    const left = x.d.firstBeyond3Sigma;
    const leadLeft = lead.d.firstBeyond3Sigma;
    if (left !== null ? leadLeft === null || left < leadLeft : leadLeft === null)
      if (left !== null || x.d.points.length > lead.d.points.length) lead = x;
  }
  return lead?.f;
}

/** A flight drawn against its forecast, seen from the body the ship ranged. */
export interface FlightChart {
  /** The body the flight is charted against. */
  readonly about: KnownBody;
  readonly bodies: readonly ChartBody[];
  /** The flight as measured, oldest first. */
  readonly trail: readonly P2[];
  /** Where the record has a stretch with no fix: the trail starts again there. */
  readonly breaks: readonly number[];
  /** The attempt before, as measured against the same body, and where its record has gaps. */
  readonly previous?: readonly P2[];
  readonly previousBreaks?: readonly number[];
  /** The forecast, seen from the body. */
  readonly reading?: ForecastReading;
  readonly marks: readonly ChartMark[];
  readonly fit: readonly P2[];
  /** When the last fix on the body was taken. */
  readonly flownTo: number;
}

/**
 * The flight as its record measured it against the forecast issued for it. Undefined when the
 * attempt ranged nothing: there is then no measured path to draw.
 */
export function flightChart(
  record: AttemptRecord,
  previous: AttemptRecord | undefined,
  forecast: Forecast | undefined,
  leftAt: number | null,
  bodies: readonly KnownBody[],
): FlightChart | undefined {
  const id = mostRanged(record);
  const about = bodies.find((b) => b.id === id);
  if (!id || !about) return undefined;
  const track = measuredTrack(record, id);
  if (track.length < 2) return undefined;
  const trail = chartPath(track);
  const trackBefore = previous ? measuredTrack(previous, id) : [];
  const before = chartPath(trackBefore);
  const seen = forecast ? relativeTo(forecast, id) : undefined;
  const origin = { x: 0, y: 0, z: 0 };
  const reading =
    seen && seen.samples.length > 1
      ? readForecast(
          seen,
          bodies.map((b) => ({ ...b, position: origin })),
        )
      : undefined;
  const marks: ChartMark[] = [];
  if (reading) {
    for (const s of reading.steps) {
      if (s.kind !== 'burn' && s.kind !== 'ends') continue;
      const p = at(reading.path, s.t);
      if (p)
        marks.push({
          x: p.x,
          y: p.y,
          kind: s.kind,
          label: s.kind === 'ends' ? 'forecast ends' : s.label.toLowerCase(),
        });
    }
  }
  if (leftAt !== null) {
    const i = track.findIndex((p) => p.t >= leftAt);
    const p = trail[i < 0 ? trail.length - 1 : i];
    if (p) marks.push({ x: p[0], y: p[1], kind: 'left', label: 'left the forecast' });
  }
  const flownTo = track.at(-1)!.t;
  const end = trail.at(-1)!;
  marks.push({ x: end[0], y: end[1], kind: 'now', label: `flown to T+${clock(flownTo)}` });
  // The body the chart is about sits at its centre; any other is where the forecast puts it
  // when it ends, as seen from there.
  const others = reading ? reading.bodiesAt(reading.endsAt).filter((b) => b.id !== id) : [];
  const chartBodies: ChartBody[] = [
    { id, name: about.name, x: 0, y: 0, radius: about.radius },
    ...others,
  ];
  const r = about.radius * 1.2;
  const fit: P2[] = [
    ...trail,
    ...(reading ? reading.path.map((p): P2 => [p.x, p.y]) : []),
    [-r, -r],
    [r, r],
  ];
  return {
    about,
    bodies: chartBodies,
    trail,
    breaks: trackBreaks(track),
    ...(before.length > 1 ? { previous: before, previousBreaks: trackBreaks(trackBefore) } : {}),
    ...(reading ? { reading } : {}),
    marks,
    fit,
    flownTo,
  };
}

const flightChartFor = memoLast(
  (
    record: AttemptRecord,
    previous: AttemptRecord | undefined,
    forecast: Forecast | undefined,
    leftAt: number | null,
    bodyKey: string,
  ): FlightChart | undefined =>
    flightChart(record, previous, forecast, leftAt, JSON.parse(bodyKey) as KnownBody[]),
);

/** The verdict on a forecast against the flight: whether it held, by how much, and over time. */
export function VerdictView({
  divergence,
  forecast,
}: {
  readonly divergence: ForecastDivergence | undefined;
  readonly forecast: Forecast | undefined;
}) {
  if (!divergence || !forecast)
    return <p className="cs-note">no forecast was issued this attempt: nothing was predicted</p>;
  const d = divergence;
  if (d.unmeasured)
    return (
      <p className="cs-note">
        nothing was measured while this forecast ran: it can be neither confirmed nor refuted
      </p>
    );
  const left = d.firstBeyond3Sigma;
  const worst = worstOf(d.points);
  const through = d.points.at(-1)?.t ?? forecast.issuedAt;
  return (
    <>
      <ReadoutGrid columns={2}>
        <Readout
          label="The flight"
          value={left !== null ? 'LEFT IT' : 'HELD'}
          tone="forecast"
          status={left !== null ? 'caution' : 'nominal'}
        />
        <Readout
          label="Worst miss"
          value={`${fixed(d.maxSigmas ?? 0, 1)}σ`}
          tone="forecast"
          status={(d.maxSigmas ?? 0) > 3 ? 'caution' : 'nominal'}
        />
      </ReadoutGrid>
      <Line
        label={left !== null ? 'left the forecast at' : 'inside the forecast through'}
        tone="forecast"
        status={left !== null ? 'caution' : 'nominal'}
      >
        T+{clock(left ?? through)}
      </Line>
      <Trend
        title="Off the forecast"
        unit="σ"
        value={worst ? `worst at T+${clock(worst.t)}` : '—'}
        data={d.points.map((p) => p.sigmas)}
        tone="forecast"
        min={0}
        limits={[{ at: 3, kind: 'caution' }]}
        {...(left !== null ? { status: 'caution' as const } : {})}
      />
      <p className="cs-note">
        {left !== null
          ? 'past 3σ the flight is outside what the model allowed for: the model is missing something there'
          : 'inside 3σ the flight is where the model said it could be'}
        {d.gaps.length
          ? ` · ${d.gaps.length} stretch${d.gaps.length === 1 ? '' : 'es'} with no fix`
          : ''}
      </p>
    </>
  );
}

export function BlackBoxPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const status = game.status();
  const snapshot = desk.snapshot();
  // Every attempt, the one in progress as it stood at the desk's last read (S15: every two
  // seconds while it runs, at once when it ends). The same objects come back between reads, so
  // the debrief and the comparison below are worked out once per read, not once per refresh.
  const archive = desk.archive();
  const attempts = sortedAttempts(archive);
  const finished = attempts.filter((a) => a.outcome.kind !== 'in-progress');
  // A row chooses the debrief; A and B are chosen apart, in Compare (S9 R14).
  const [picked, setPicked] = useState<readonly [string, string]>(() =>
    desk.compare ? [desk.compare[0], desk.compare[1]] : ['', ''],
  );
  const [focus, setFocus] = useState<string | undefined>(undefined);
  // Which of the attempt's forecasts the chart and the verdict read, when it was issued several.
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  // The attempt in hand once it has a forecast to be read against (the rail's rule); else the
  // one the game last ended, else the last one finished.
  const focusId =
    focus ??
    attemptInHand(attempts, status)?.id ??
    desk.debriefOf ??
    finished.at(-1)?.id ??
    attempts.at(-1)?.id;
  const focused = attempts.find((x) => x.id === focusId);
  const bodyKey = JSON.stringify(
    snapshot.world.bodies.map((b) => ({ id: b.id, radius: b.radius, name: b.name })),
  );
  const report = focused ? debriefFor(focused, archive, attempts, bodyKey) : undefined;
  // A lost attempt is reviewed from its record: what failed first, and what the monitor read.
  const monitor = doseRate(status);
  const loss =
    focused?.outcome.kind === 'lost'
      ? lossReviewFor(
          focused,
          monitor?.threshold,
          monitor?.saturationRate,
          game.ship.equipment.map((e) => e.id).join('|'),
        )
      : undefined;
  const choices = [
    { value: '', label: '—' },
    ...attempts.map((x) => ({ value: x.id, label: `ATTEMPT ${x.index} · ${outcomeText(x)}` })),
  ];

  // The prediction against the flight: the attempt's forecasts, each against what was measured.
  const divergences = focused ? divergencesFor(focused) : [];
  const lead = divergences.find((x) => x.f.id === chosen)?.f ?? leadForecast(divergences);
  const verdict = divergences.find((x) => x.f === lead)?.d;
  const before = focused ? attempts.filter((x) => x.index < focused.index).at(-1) : undefined;
  const chart = focused
    ? flightChartFor(focused, before, lead, verdict?.firstBeyond3Sigma ?? null, bodyKey)
    : undefined;

  const a = attempts.find((x) => x.id === picked[0]);
  const b = attempts.find((x) => x.id === picked[1]);
  desk.refreshReport();
  const comparison = a && b ? comparisonFor(a, b, desk.report ?? null) : undefined;
  const changed = comparison
    ? comparison.executed
        .filter((d) =>
          d.kind === 'same' || d.kind === 'changed'
            ? d.kind === 'changed' && d.a.kind !== 'mark'
            : d.command.kind !== 'mark',
        )
        .map((d) => describeDiff(d, 'A', 'B'))
        .filter((line): line is string => line !== null)
    : [];
  const overlaid =
    desk.compare !== undefined && a && b && desk.compare[0] === a.id && desk.compare[1] === b.id;

  // The distances this attempt measured the pull at, with their uncertainty (S9 R6).
  const strength = desk.report?.strength;
  const measured: MeasuredSpan[] | undefined =
    strength && focused ? measuredFor(strength, focused.id) : undefined;

  const rec = recorder(
    snapshot.world.ship,
    game.ship,
    desk.history('black-box.bytes'),
    desk.history('black-box.bytes').length * 0.5 * status.warp,
  );
  const ended = status.phase === 'ended';

  return (
    <div className="cp-grid" data-cols="side-chart-side">
      <div className="cp-side">
        <Panel title="Attempts" tone="blackbox" aside={`${attempts.length} on record`}>
          <BlackBoxMark
            state={rec.rate > 0 && !status.paused && !ended ? 'recording' : 'idle'}
            detail={`${fixed(rec.rate, 2)} Hz · ${whole(rec.power)} W`}
          />
          <ComponentList label="Attempts">
            {attempts.map((x) => (
              <ComponentRow
                key={x.id}
                name={`Attempt ${x.index}${picked[0] === x.id ? ' · A' : picked[1] === x.id ? ' · B' : ''}`}
                mode={outcomeText(x)}
                value={`${whole(x.measurements.length)} rec`}
                tone="blackbox"
                status={
                  x.outcome.kind === 'lost'
                    ? 'warning'
                    : x.outcome.kind === 'in-progress'
                      ? 'nominal'
                      : 'stale'
                }
                selected={focusId === x.id}
                onSelect={() => {
                  setFocus(x.id);
                  setChosen(undefined);
                }}
              />
            ))}
          </ComponentList>
          <Actions>
            <Button
              tone="blackbox"
              primary={ended}
              onClick={() => (ended ? game.restart() : game.recall())}
              title="End this attempt and begin again at arrival. Black Box and the model keep what they have."
            >
              {ended ? 'BEGIN AGAIN' : 'RECALL'}
            </Button>
          </Actions>
          <p className="cs-note">
            {ended ? 'begin again' : 'recall'} starts a new attempt at arrival; Black Box and the
            model keep their records
          </p>
        </Panel>

        <Panel
          title="Compare"
          tone="blackbox"
          aside={a && b ? `A attempt ${a.index} · B attempt ${b.index}` : 'choose two'}
        >
          <div className="cs-fields">
            <SelectField
              label="A"
              value={picked[0]}
              options={choices}
              onChange={(v) => setPicked(([, y]) => [v, y])}
            />
            <SelectField
              label="B"
              value={picked[1]}
              options={choices}
              onChange={(v) => setPicked(([x]) => [x, v])}
            />
          </div>
          {comparison && a && b ? (
            <>
              <Line
                label="configuration"
                status={comparison.configurationDiffers ? 'caution' : 'nominal'}
              >
                {comparison.configurationDiffers
                  ? `${comparison.a.configuration.start} → ${comparison.b.configuration.start}`
                  : 'same'}
              </Line>
              <Caption>what was changed</Caption>
              {changed.length === 0 ? (
                <p className="cs-note">the same commands reached the ship</p>
              ) : (
                changed.slice(0, 8).map((line, i) => (
                  <p className="cs-change" key={i}>
                    {line}
                  </p>
                ))
              )}
              <Caption>where the outcome left the forecast</Caption>
              {(['a', 'b'] as const).map((side) => {
                const s = comparison[side];
                const first = s.divergence.find((d) => d.firstBeyond3Sigma !== null);
                const points = s.divergence.flatMap((d) => d.points);
                const worstPoint = worstOf(points);
                const worst = Math.max(0, ...s.divergence.map((d) => d.maxSigmas ?? 0));
                const through = Math.max(-Infinity, ...points.map((p) => p.t));
                const since = Math.min(Infinity, ...points.map((p) => p.t));
                // The worst miss's moment and the stretch compared (S20).
                const worstText = `worst ${fixed(worst, 1)}σ${worstPoint ? ` at T+${clock(worstPoint.t)}` : ''}`;
                return (
                  <Line
                    key={side}
                    label={side === 'a' ? `A · attempt ${a.index}` : `B · attempt ${b.index}`}
                    tone="forecast"
                    status={first ? 'caution' : s.divergence.length ? 'nominal' : 'stale'}
                  >
                    {s.divergence.length === 0
                      ? 'no forecast was issued'
                      : first
                        ? `left at T+${clock(first.firstBeyond3Sigma!)} · ${worstText}`
                        : Number.isFinite(through)
                          ? `within envelope T+${clock(since)}–T+${clock(through)} · ${worstText}`
                          : 'not recorded: nothing measured inside a forecast'}
                  </Line>
                );
              })}
              <Caption>residuals · coasting / powered</Caption>
              {(['a', 'b'] as const).map((side) => {
                const s = comparison[side];
                return (
                  <Line key={side} label={side === 'a' ? 'A' : 'B'}>
                    {s.residuals.coast.length ? `${fixed(rms(s.residuals.coast), 2)}σ` : '—'} /{' '}
                    {s.residuals.powered.length ? `${fixed(rms(s.residuals.powered), 2)}σ` : '—'}
                  </Line>
                );
              })}
              {comparison.strengthSummary.map((s) => (
                <Line key={s.body} label={`${s.body} strength slope`} tone="forecast">
                  {s.slope === null ? 'too few windows' : fixed(s.slope, 2)}
                </Line>
              ))}
              {[...comparison.a.missing, ...comparison.b.missing].slice(0, 4).map((m, i) => (
                <p className="cs-note" key={i}>
                  missing: {m}
                </p>
              ))}
              <Actions>
                {/* It sets what FLIGHT draws; it does not go there. */}
                <Button
                  tone="blackbox"
                  primary={!overlaid}
                  disabled={a.outcome.kind === 'in-progress' || b.outcome.kind === 'in-progress'}
                  onClick={() => desk.setCompare(overlaid ? undefined : [a.id, b.id])}
                >
                  {overlaid ? 'CLEAR FLIGHT OVERLAY' : 'SET FLIGHT OVERLAY'}
                </Button>
              </Actions>
              {overlaid ? (
                <p className="cs-note">FLIGHT draws A and B, labelled with their attempts</p>
              ) : null}
            </>
          ) : (
            <p className="cs-note">
              two attempts side by side: what changed, what happened, where the result differed from
              the prediction
            </p>
          )}
        </Panel>

        {/* Management after the evidence: the recorder's store, and erasing (S9 R14). */}
        <details className="cp-fold">
          <summary>
            recorder · {bytes(rec.bytes)} of {bytes(rec.capacity)}
          </summary>
          <div className="cp-fold__body">
            <LevelBar
              label="Storage"
              value={rec.bytes}
              max={rec.capacity}
              text={`${bytes(rec.bytes)} / ${bytes(rec.capacity)}`}
              tone="blackbox"
            />
            <Trend
              title="Stored"
              unit="MB"
              value={fixed(rec.bytes / 1e6, 2)}
              data={desk.history('black-box.bytes').map((v) => v / 1e6)}
              tone="blackbox"
            />
            <Line label="full in" tone="blackbox">
              {Number.isFinite(rec.toFull) ? duration(rec.toFull) : 'not filling'}
            </Line>
            {desk.erase ? (
              <Actions>
                {/* The browser asks first; cancelling keeps every record. */}
                <Button
                  status="warning"
                  onClick={() => {
                    if (window.confirm('Erase every Black Box record of this encounter?'))
                      void desk.erase?.().then(() => window.location.reload());
                  }}
                >
                  ERASE RECORDS
                </Button>
              </Actions>
            ) : null}
          </div>
        </details>
      </div>

      <div className="cp-hero">
        <div className="cp-tools">
          {divergences.length > 1 ? (
            <ModeChips
              label="Forecast"
              options={divergences.map(({ f }) => ({
                value: f.id,
                label: `T+${clock(f.issuedAt)} · v${f.modelVersion}`,
              }))}
              value={lead?.id ?? ''}
              onChange={(v) => setChosen(v)}
            />
          ) : (
            <span className="cp-tools__title">
              {focused ? `Attempt ${focused.index}` : 'No attempt'}
              {lead ? ` · forecast T+${clock(lead.issuedAt)} on model v${lead.modelVersion}` : ''}
            </span>
          )}
          <p className="cp-legend">
            <span data-key="trail">flown, as measured</span>
            <span data-key="forecast">forecast</span>
            <span data-key="envelope">2σ</span>
            {chart?.previous ? <span data-key="previous">the attempt before</span> : null}
          </p>
        </div>
        {chart && focused ? (
          <TrajectoryChart
            label={`Attempt ${focused.index}: the flight as measured against its forecast, seen from ${chart.about.name}`}
            bodies={chart.bodies}
            trail={chart.trail}
            trailBreaks={chart.breaks}
            {...(chart.previous
              ? { previousTrail: chart.previous, previousBreaks: chart.previousBreaks ?? [] }
              : {})}
            {...(chart.reading ? { forecast: chart.reading.path } : {})}
            marks={chart.marks}
            fit={chart.fit}
          />
        ) : (
          <div className="cp-empty">
            <p>Nothing flown yet</p>
            <p className="cs-note">
              fly a plan: the flight as the ship measured it is drawn here over the forecast that
              was issued for it
            </p>
          </div>
        )}
      </div>

      <div className="cp-side">
        <Panel
          title="Predicted against flown"
          tone="forecast"
          aside={focused ? `attempt ${focused.index}` : ''}
          status={verdict?.firstBeyond3Sigma != null ? 'caution' : undefined}
        >
          <VerdictView divergence={verdict} forecast={lead} />
          {/* What was measured, and what no forecast covered, in sight; each forecast's own
              line in full on demand (the figures above are the lead forecast's). */}
          {report?.forecasts
            .filter((f) => !f.label.startsWith('forecast T+'))
            .map((f) => (
              <Line
                key={f.label}
                label={f.label}
                tone={f.measured ? 'measured' : 'forecast'}
                status={f.measured ? undefined : f.bad ? 'caution' : 'nominal'}
              >
                {f.value}
              </Line>
            ))}
          {report?.forecasts.some((f) => f.label.startsWith('forecast T+')) ? (
            <details className="cs-details">
              <summary>each forecast in full</summary>
              {report.forecasts
                .filter((f) => f.label.startsWith('forecast T+'))
                .map((f) => (
                  <Line
                    key={f.label}
                    label={f.label}
                    tone="forecast"
                    status={f.bad ? 'caution' : 'nominal'}
                  >
                    {f.value}
                  </Line>
                ))}
            </details>
          ) : null}
          <Actions>
            <Button tone="forecast" onClick={() => desk.setPage('model')}>
              WHAT THE MODEL LEARNED ▸
            </Button>
          </Actions>
        </Panel>

        <Panel
          title="Debrief"
          tone="blackbox"
          aside={focused ? `attempt ${focused.index}` : ''}
          statusLine={
            focused?.outcome.kind === 'in-progress' ? 'attempt in progress: so far' : undefined
          }
        >
          {report ? (
            <DebriefView
              report={report}
              forecasts={false}
              {...(measured ? { measured } : {})}
              {...(loss ? { loss } : {})}
              {...(monitor?.threshold !== undefined ? { threshold: monitor.threshold } : {})}
              onModel={() => desk.setPage('model')}
            />
          ) : (
            <p className="cs-note">no attempt on record</p>
          )}
        </Panel>
      </div>
    </div>
  );
}
