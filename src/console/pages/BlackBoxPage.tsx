/**
 * BLACK BOX: the flight recorder that keeps evidence across recurrence (P8, P12). Every attempt
 * is listed; one is debriefed against its own design (5C-0 request 3); two are compared: what
 * was changed, what happened, and where each outcome left its forecast (brief §2). The overlay
 * puts the two attempts into the FLIGHT view. Recording is a resource: its rate, power and
 * storage are shown where they can be seen changing.
 */
import { useState } from 'react';
import type { AttemptRecord } from '../../contracts/index.ts';
import { compareAttempts } from '../../blackbox/index.ts';
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
import { Actions, Button, Caption, Line } from '../controls.tsx';
import { recorder } from '../data.ts';
import type { Desk } from '../desk.ts';
import { bytes, clock, duration, fixed, whole } from '../format.ts';
import { APPROACH, EVIDENCE, debrief, describeDiff } from '../mission.ts';
import type { Debrief } from '../mission.ts';

const rms = (values: readonly { readonly value: number }[]): number =>
  values.length ? Math.sqrt(values.reduce((s, r) => s + r.value * r.value, 0) / values.length) : 0;

const outcomeText = (a: AttemptRecord): string =>
  a.outcome.kind === 'lost'
    ? `lost · ${a.outcome.cause}`
    : a.outcome.kind === 'completed'
      ? 'completed'
      : a.outcome.kind;

/** The attempt judged against its own design. */
export function DebriefView({ report }: { readonly report: Debrief }) {
  return (
    <>
      <ReadoutGrid columns={3}>
        <Readout label="Attempt" value={report.index} tone="blackbox" />
        <Readout label="Outcome" value={report.outcome === 'in-progress' ? 'flying' : report.outcome} tone="blackbox" />
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
      {report.forecasts.map((f) => (
        <Line key={f.label} label={f.label} tone="forecast" status={f.bad ? 'caution' : 'nominal'}>
          {f.value}
        </Line>
      ))}
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

export function BlackBoxPage({ desk }: { readonly desk: Desk }) {
  const { game } = desk;
  const status = game.status();
  const snapshot = game.snapshot();
  const archive = game.blackBox.archive();
  const live = game.blackBox.attempt(status.attemptId);
  // The archive holds finished attempts; the one in progress is read as it stands.
  const attempts: AttemptRecord[] = [
    ...archive.attempts.filter((a) => a.id !== status.attemptId),
    ...(live ? [live] : []),
  ].sort((a, b) => a.index - b.index);
  const finished = attempts.filter((a) => a.outcome.kind !== 'in-progress');
  const [picked, setPicked] = useState<string[]>([]);
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const focusId = focus ?? desk.debriefOf ?? finished.at(-1)?.id ?? attempts.at(-1)?.id;
  const focused = attempts.find((a) => a.id === focusId);
  const bodies = snapshot.world.bodies.map((b) => ({ id: b.id, radius: b.radius }));
  const report = focused ? debrief(focused, { ...archive, attempts }, bodies) : undefined;

  const pick = (id: string): void => {
    setFocus(id);
    setPicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list.slice(-1), id]));
  };
  const a = attempts.find((x) => x.id === picked[0]);
  const b = attempts.find((x) => x.id === picked[1]);
  desk.refreshReport();
  const comparison = a && b ? compareAttempts(a, b, desk.report ?? null) : undefined;
  const changed = comparison
    ? comparison.executed
        .filter((d) => d.kind === 'same' || d.kind === 'changed' ? d.kind === 'changed' && d.a.kind !== 'mark' : d.command.kind !== 'mark')
        .map((d) => describeDiff(d, 'A', 'B'))
        .filter((line): line is string => line !== null)
    : [];
  const overlaid =
    desk.compare !== undefined && a && b && desk.compare[0] === a.id && desk.compare[1] === b.id;

  const rec = recorder(
    snapshot.world.ship,
    game.ship,
    desk.history('black-box.bytes'),
    desk.history('black-box.bytes').length * 0.5 * status.warp,
  );
  const ended = status.phase === 'ended';

  return (
    <div className="cs-grid">
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
              status={x.outcome.kind === 'lost' ? 'warning' : x.outcome.kind === 'in-progress' ? 'nominal' : 'stale'}
              selected={picked.includes(x.id) || focusId === x.id}
              onSelect={() => pick(x.id)}
            />
          ))}
        </ComponentList>
        <p className="cs-note">choose two attempts to compare them</p>
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
      </Panel>

      <Panel
        title="Debrief"
        tone="blackbox"
        aside={focused ? `attempt ${focused.index}` : ''}
        statusLine={focused?.outcome.kind === 'in-progress' ? 'attempt in progress: so far' : undefined}
      >
        {report ? <DebriefView report={report} /> : <p className="cs-note">no attempt on record</p>}
      </Panel>

      <Panel
        title="Compare"
        tone="blackbox"
        aside={a && b ? `A attempt ${a.index} · B attempt ${b.index}` : 'choose two'}
      >
        {comparison && a && b ? (
          <>
            <Line label="configuration" status={comparison.configurationDiffers ? 'caution' : 'nominal'}>
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
              const worst = Math.max(0, ...s.divergence.map((d) => d.maxSigmas ?? 0));
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
                      ? `left at T+${clock(first.firstBeyond3Sigma!)} · worst ${fixed(worst, 1)}σ`
                      : `held · worst ${fixed(worst, 1)}σ`}
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
              <Button
                tone="blackbox"
                primary={!overlaid}
                disabled={a.outcome.kind === 'in-progress' || b.outcome.kind === 'in-progress'}
                onClick={() => desk.setCompare(overlaid ? undefined : [a.id, b.id])}
              >
                {overlaid ? 'CLEAR OVERLAY' : 'OVERLAY IN FLIGHT'}
              </Button>
            </Actions>
          </>
        ) : (
          <p className="cs-note">
            two attempts side by side: what changed, what happened, where the result differed from
            the prediction
          </p>
        )}
      </Panel>
    </div>
  );
}
