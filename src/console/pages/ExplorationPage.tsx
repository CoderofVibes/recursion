/**
 * EXPLORATION (A26: the player is exploring, trying to find the way out of this universe; it was
 * MISSION). The loop's first stage: where the ship is, what this region asks of it, what is
 * already known here, and what this attempt is for.
 *
 * It leads with the chart of the region as the ship holds it: the bodies, the rocks it has
 * catalogued, the distances where each body's pull has been measured, the path flown and the
 * forecast in force. Beside it the objective as bars (how far along, against what), what Black
 * Box holds of this region, and the attempt's own design: what evidence it is after and the
 * margins it must keep. The design is recorded in Black Box and judged in the debrief; entering
 * the encounter records it as shown (5C-0 request 2).
 */
import { useMemo } from 'react';
import { LevelBar, ModeChips, Panel, Readout, ReadoutGrid } from '../../theme/components/index.ts';
import { Actions, Button, Caption, Line } from '../controls.tsx';
import { departMet, departure, objectiveLine, spendable, stores } from '../data.ts';
import type { Desk } from '../desk.ts';
import { readForecast } from '../forecastReading.ts';
import { clock, dist, fixed, name, whole } from '../format.ts';
import { CHART_UP, onPlane, sigmaEllipse } from '../instruments/chartMath.ts';
import type { Sym3 } from '../instruments/chartMath.ts';
import { DragBar } from '../instruments/DragBar.tsx';
import { TrajectoryChart } from '../instruments/TrajectoryChart.tsx';
import { APPROACH, EVIDENCE } from '../mission.ts';
import type { Approach, EvidenceGoal } from '../mission.ts';
import { chartBodies, chartPath, chartRocks, evidenceBands } from '../regionChart.ts';
import { RegionsPanel } from '../regions.tsx';

export function ExplorationPage({ desk }: { readonly desk: Desk }) {
  const { game, design } = desk;
  const status = game.status();
  const snapshot = desk.snapshot();
  const { ship, bodies, asteroids } = snapshot.world;
  const model = game.model.state();
  const depart = departure(status, snapshot, model);
  const main = stores(ship, game.ship, design.reserve).find((s) => s.id === 'main-propellant');
  // What the propellant above the reserve buys (the same figure FLIGHT shows as "to spend").
  const budget = spendable(ship, game.ship, design.reserve);
  const ended = status.phase === 'ended';
  const preparing = status.phase === 'prepare';

  // The forecast in force, or the draft being looked at, as a line on the chart.
  const shown = desk.preview ?? snapshot.forecasts.at(-1);
  const bodyKey = bodies.map((b) => `${b.id}:${b.radius}`).join('|');
  const reading = useMemo(
    () => (shown && shown.samples.length > 1 ? readForecast(shown, bodies) : undefined),
    // The believed bodies are rebuilt every frame; their ids and sizes are what matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, bodyKey],
  );
  const [x, y] = onPlane(CHART_UP, [ship.position.x, ship.position.y, ship.position.z ?? 0]);
  const [vx, vy] = onPlane(CHART_UP, [ship.velocity.x, ship.velocity.y, ship.velocity.z ?? 0]);
  const archive = desk.archive();
  const here = archive.attempts.filter((a) => a.encounterId === game.briefing.id);
  const finished = here.filter((a) => a.outcome.kind !== 'in-progress');
  const adopted = model.extensions.filter((e) => e.status === 'adopted').length;
  const measured = Object.entries(model.support.distance)
    .filter(([, spans]) => spans.length > 0)
    .map(([body, spans]) => {
      const lo = Math.min(...spans.map((s) => s[0]));
      const hi = Math.max(...spans.map((s) => s[1]));
      return `${bodies.find((b) => b.id === body)?.name ?? name(body)} ${dist(lo)} – ${dist(hi)}`;
    });

  return (
    <div className="cp-grid" data-cols="chart-two">
      <div className="cp-hero">
        <p className="cp-legend">
          <span data-key="trail">flown</span>
          <span data-key="forecast">forecast</span>
          <span data-key="measured">pull measured here</span>
          <span data-key="validated">rule tested here</span>
        </p>
        <TrajectoryChart
          label={`${game.briefing.name}: the region as the ship holds it`}
          bodies={chartBodies(bodies)}
          rocks={chartRocks(asteroids)}
          bands={evidenceBands(model)}
          trail={chartPath(snapshot.trail)}
          {...(reading ? { forecast: reading.path } : {})}
          cursor={{
            x,
            y,
            heading: Math.atan2(vy, vx),
            ellipse: sigmaEllipse(CHART_UP, ship.positionCov as unknown as Sym3),
            label: 'ship',
          }}
        />
      </div>

      <div className="cp-side">
        <Panel title="Objective" aside={game.briefing.name}>
          {snapshot.objectives.map((o, i) => {
            // Its conditions, not just its name (S20).
            const line = objectiveLine(o, i, ship.position);
            return (
              <Line key={o.id} label={line.label}>
                {line.text}
              </Line>
            );
          })}
          {depart ? (
            <>
              {/* The frame the objective is judged in, as the ship believes it (S20). */}
              <LevelBar
                label="Speed out"
                value={depart.speed}
                max={Math.max(depart.minSpeed * 2.5, depart.speed * 1.15)}
                text={
                  `${fixed(depart.speed, 1)} of ${whole(depart.minSpeed)} m/s` +
                  (depart.outward !== undefined && depart.outward <= 0 ? ' · inward' : '')
                }
                status={
                  depart.outward !== undefined && depart.outward <= 0
                    ? 'caution'
                    : departMet(depart)
                      ? 'nominal'
                      : undefined
                }
                marks={[{ at: depart.minSpeed, kind: 'target', label: 'needed' }]}
              />
              <LevelBar
                label="Distance out"
                value={depart.distance}
                max={depart.beyond * 1.1}
                text={`${dist(depart.distance)} of ${dist(depart.beyond)}`}
                marks={[{ at: depart.beyond, kind: 'target', label: 'the gate' }]}
              />
              {depart.gaugedDeltaV !== undefined && depart.maxDeltaV !== undefined ? (
                <LevelBar
                  label="Spent leaving"
                  value={depart.gaugedDeltaV}
                  max={depart.maxDeltaV * 1.25}
                  text={`≤ ${fixed(depart.gaugedDeltaV, 1)} of ${fixed(depart.maxDeltaV, 0)} m/s`}
                  status={depart.gaugedDeltaV > depart.maxDeltaV ? 'caution' : 'nominal'}
                  marks={[{ at: depart.maxDeltaV, kind: 'warning', label: 'the cap' }]}
                />
              ) : null}
              {depart.closest && Object.keys(depart.closest).length ? (
                <Line label="closest so far">
                  {Object.entries(depart.closest)
                    .map(
                      ([id, r]) =>
                        `${bodies.find((b) => b.id === id)?.name ?? name(id)} ${dist(r)}`,
                    )
                    .join(' · ')}
                </Line>
              ) : null}
              {depart.status !== 'pending' ? (
                <Line label="judged" status={depart.status === 'reached' ? 'nominal' : 'caution'}>
                  {depart.status === 'reached'
                    ? 'reached: the attempt is complete'
                    : 'missed on the way out: the attempt goes on'}
                </Line>
              ) : null}
            </>
          ) : null}
        </Panel>

        <Panel title="What Black Box holds here" tone="blackbox" aside={`${here.length} on record`}>
          <ReadoutGrid columns={3}>
            <Readout label="Attempts flown" value={finished.length} tone="blackbox" />
            <Readout label="Rules adopted" value={adopted} tone="forecast" />
            <Readout label="Model" value={`v${model.version}`} tone="forecast" />
          </ReadoutGrid>
          <Line
            label="pull measured"
            tone="forecast"
            status={measured.length ? undefined : 'stale'}
          >
            {measured.join(' · ') || 'nowhere yet'}
          </Line>
          <Actions>
            <Button tone="blackbox" onClick={() => desk.setPage('blackbox')}>
              OPEN BLACK BOX
            </Button>
            <Button tone="forecast" onClick={() => desk.setPage('model')}>
              OPEN MODEL
            </Button>
          </Actions>
        </Panel>

        <RegionsPanel current={game.briefing.id} currentName={game.briefing.name} />
      </div>

      <div className="cp-side">
        <Panel
          title="This attempt"
          aside={`attempt ${status.attemptIndex} · ${status.phase}`}
          tone="blackbox"
          status={desk.designRecorded() ? 'nominal' : preparing ? undefined : 'caution'}
          statusLine={
            desk.designRecorded()
              ? `design recorded T+${clock(desk.designedAt ?? 0)}`
              : preparing
                ? 'the design is recorded when you enter'
                : 'design changed · not recorded'
          }
        >
          <Caption>evidence goal</Caption>
          <ModeChips
            label="Evidence goal"
            options={(Object.keys(EVIDENCE) as EvidenceGoal[]).map((k) => ({
              value: k,
              label: EVIDENCE[k].label,
            }))}
            value={design.evidence}
            onChange={(v) => desk.setDesign({ evidence: v as EvidenceGoal })}
          />
          <p className="cs-note">{EVIDENCE[design.evidence].detail}</p>
          <Caption>approach</Caption>
          <ModeChips
            label="Approach"
            options={(Object.keys(APPROACH) as Approach[]).map((k) => ({
              value: k,
              label: APPROACH[k].label,
            }))}
            value={design.approach}
            onChange={(v) => desk.setDesign({ approach: v as Approach })}
          />
          <p className="cs-note">{APPROACH[design.approach].detail}</p>
          <Caption>margins the debrief judges</Caption>
          <DragBar
            stacked
            label="Reserve"
            value={design.reserve}
            min={0}
            max={main?.max ?? 6000}
            step={50}
            text={`${whole(design.reserve)} kg`}
            typed={{ unit: 'kg main' }}
            tone="measured"
            onChange={(v) => desk.setDesign({ reserve: v })}
            {...(main ? { measured: main.value } : {})}
            effect={`${whole(budget.kg)} kg to spend buys ${fixed(budget.deltaV, 1)} m/s`}
          />
          <DragBar
            stacked
            label="Clearance"
            value={design.clearance / 1000}
            min={0}
            max={500}
            step={5}
            text={dist(design.clearance)}
            typed={{ unit: 'km' }}
            tone="forecast"
            onChange={(v) => desk.setDesign({ clearance: v * 1000 })}
            effect="a forecast pass inside it raises an alert in flight"
          />
          <Actions>
            <Button primary tone="blackbox" disabled={ended} onClick={() => desk.commitDesign()}>
              RECORD DESIGN AND SET UP
            </Button>
            {preparing ? (
              <Button primary disabled={status.committing} onClick={() => desk.enter()}>
                ENTER {game.briefing.name}
              </Button>
            ) : null}
          </Actions>
          <Actions>
            <Button onClick={() => desk.setPage('systems')}>SET UP THE SHIP ▸</Button>
            <Button tone="forecast" onClick={() => desk.setPage('plan')}>
              OPEN PLAN ▸
            </Button>
          </Actions>
        </Panel>
      </div>
    </div>
  );
}
