/**
 * BLACK BOX: the flight recorder that keeps evidence across recurrence (P8, P12). Every attempt
 * is listed; one is debriefed against its own design (5C-0 request 3); two are compared: what
 * was changed, what happened, and where each outcome left its forecast (brief §2). The overlay
 * puts the two attempts into the FLIGHT view. Recording is a resource: its rate, power and
 * storage are shown where they can be seen changing.
 */
import { useState } from 'react';
import type { AttemptRecord, BlackBoxArchive } from '../../contracts/index.ts';
import type { ModelReport } from '../../model/index.ts';
import { compareAttempts, lossReview } from '../../blackbox/index.ts';
import type { LossReview } from '../../blackbox/index.ts';
import {
  BlackBoxMark,
  ComponentList,
  ComponentRow,
  LevelBar,
  Panel,
  Readout,
  ReadoutGrid,
  Trend,
} from '../../theme/components/index.ts';
import { Columns } from '../Columns.tsx';
import { Actions, Button, Caption, Line, SelectField } from '../controls.tsx';
import { recorder } from '../data.ts';
import type { Desk } from '../desk.ts';
import { bytes, clock, dist, duration, fixed, whole } from '../format.ts';
import { LossReviewView } from '../LossReview.tsx';
import { APPROACH, EVIDENCE, debrief, describeDiff, worstOf } from '../mission.ts';
import type { Debrief } from '../mission.ts';
import { doseRate } from '../radiation.ts';

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
}: {
  readonly report: Debrief;
  /** What the attempt measured of the pull (S9 R6); absent until the model's report arrives. */
  readonly measured?: readonly MeasuredSpan[];
  readonly onModel?: () => void;
  /** A lost attempt's review from its record: what failed first, and the radiation monitor. */
  readonly loss?: LossReview;
  /** The radiation monitor's hazard threshold, U, when the ship gives one. */
  readonly threshold?: number;
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
      {report.forecasts.map((f) => (
        <Line
          key={f.label}
          label={f.label}
          tone={f.measured ? 'measured' : 'forecast'}
          status={f.measured ? undefined : f.bad ? 'caution' : 'nominal'}
        >
          {f.value}
        </Line>
      ))}
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

const debriefFor = memoLast(
  (
    record: AttemptRecord,
    archive: BlackBoxArchive,
    attempts: readonly AttemptRecord[],
    /** The bodies as JSON (a string, so an unchanged list memoizes). */
    bodyKey: string,
  ): Debrief => {
    const bodies = JSON.parse(bodyKey) as { id: string; radius: number; name: string }[];
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
  const focusId = focus ?? desk.debriefOf ?? finished.at(-1)?.id ?? attempts.at(-1)?.id;
  const focused = attempts.find((a) => a.id === focusId);
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
    <Columns>
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
              onSelect={() => setFocus(x.id)}
            />
          ))}
        </ComponentList>
        <p className="cs-note">choose an attempt to read its debrief; compare two below</p>
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
            {...(measured ? { measured } : {})}
            {...(loss ? { loss } : {})}
            {...(monitor?.threshold !== undefined ? { threshold: monitor.threshold } : {})}
            onModel={() => desk.setPage('model')}
          />
        ) : (
          <p className="cs-note">no attempt on record</p>
        )}
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

      {/* Management after the evidence: the recorder, recurrence, and erasing (S9 R14). */}
      <Panel title="Recorder and records" tone="blackbox">
        <Caption>recorder</Caption>
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
        <Actions>
          <Button
            tone="blackbox"
            primary={ended}
            onClick={() => (ended ? game.restart() : game.recall())}
            title="End this attempt and begin again at arrival. Black Box and the model keep what they have."
          >
            {ended ? 'BEGIN AGAIN' : 'RECALL'}
          </Button>
          {desk.erase ? (
            // The browser asks first; cancelling keeps every record.
            <Button
              status="warning"
              onClick={() => {
                if (window.confirm('Erase every Black Box record of this encounter?'))
                  void desk.erase?.().then(() => window.location.reload());
              }}
            >
              ERASE RECORDS
            </Button>
          ) : null}
        </Actions>
        <p className="cs-note">
          {ended ? 'begin again' : 'recall'} starts a new attempt at arrival; Black Box and the
          model keep their records
        </p>
      </Panel>
    </Columns>
  );
}
