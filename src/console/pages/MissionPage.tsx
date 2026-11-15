/**
 * MISSION: preparation as a visible step (challenge fit; 5C-0 request 2). Before flying, the
 * player sets what the attempt is for, the margins it must keep, how the sensor, recorder and
 * ship are set up, and an approach. Committing records the design in Black Box and sets the
 * ship up; the debrief judges the attempt against it.
 */
import type { EquipmentSpec } from '../../contracts/index.ts';
import { LevelBar, ModeChips, Panel, Readout, ReadoutGrid } from '../../theme/components/index.ts';
import { Columns } from '../Columns.tsx';
import { Actions, Button, Caption, Line, NumberField, enter } from '../controls.tsx';
import {
  departMet,
  departure,
  fixRate,
  objectiveLine,
  recorder,
  recorderEstimate,
  spendable,
  stores,
} from '../data.ts';
import type { Desk } from '../desk.ts';
import { clock, configurationName, dist, duration, fixed, name, whole } from '../format.ts';
import { APPROACH, EVIDENCE } from '../mission.ts';
import { RegionsPanel } from '../regions.tsx';
import type { Approach, EvidenceGoal } from '../mission.ts';

const RECORDER_RATES = [0.05, 0.2, 1, 10];

/** Electrical draw of a mode from the nominal ratings, W. */
const modePower = (spec: EquipmentSpec | undefined, mode: string): number =>
  spec?.params[`mode.${mode}.power`] ?? 0;

export function MissionPage({ desk }: { readonly desk: Desk }) {
  const { game, design } = desk;
  const status = game.status();
  const snapshot = desk.snapshot();
  const ship = snapshot.world.ship;
  const camera = game.ship.equipment.find((e) => e.kind === 'optical-tracker');
  const recorderSpec = game.ship.equipment.find((e) => e.kind === 'recorder');
  const rec = recorder(ship, game.ship);
  const main = stores(ship, game.ship, design.reserve).find((s) => s.id === 'main-propellant');
  // What the propellant above the reserve buys (the same figure FLIGHT shows as "to spend").
  const budget = spendable(ship, game.ship, design.reserve);
  const depart = departure(status, snapshot, game.model.state());
  const targets = [
    ...snapshot.world.bodies.map((b) => ({ value: b.id, label: b.name.toUpperCase() })),
    ...snapshot.world.asteroids.map((a) => ({ value: a.id, label: a.id.toUpperCase() })),
  ];
  // What the recorder setting will cost and record, as the ship works it out (S20): power from
  // its operating points, at most one sample a second, storage from the sample size.
  const estimate = recorderEstimate(design.setup.recorderRate, game.ship);
  const fill = estimate.bytesPerSecond;
  const recorderWatts = estimate.watts;
  const ended = status.phase === 'ended';
  const scheduled = status.planId
    ? `${status.planId} · ${status.pending} commands pending`
    : 'no maneuver scheduled';

  return (
    <Columns>
      <RegionsPanel current={game.briefing.id} currentName={game.briefing.name} />
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
            <Line
              label="from the centre of mass"
              status={departMet(depart) ? 'nominal' : undefined}
            >
              {fixed(depart.speed, 1)} of {whole(depart.minSpeed)} m/s
              {depart.outward !== undefined && depart.outward <= 0 ? ' · moving inward' : ''} ·{' '}
              {dist(depart.distance)} of {dist(depart.beyond)} out
            </Line>
            {depart.gaugedDeltaV !== undefined && depart.maxDeltaV !== undefined ? (
              <Line label="spent on leaving">
                at most {fixed(depart.gaugedDeltaV, 1)} of {fixed(depart.maxDeltaV, 0)} m/s (by the
                gauges since arrival)
              </Line>
            ) : null}
            {depart.closest && Object.keys(depart.closest).length ? (
              <Line label="closest so far">
                {Object.entries(depart.closest)
                  .map(
                    ([id, r]) =>
                      `${snapshot.world.bodies.find((b) => b.id === id)?.name ?? name(id)} ${dist(r)}`,
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
      </Panel>

      <Panel title="Margins">
        <NumberField
          label="Reserve"
          unit="kg main"
          value={design.reserve}
          min={0}
          max={main?.max ?? 6000}
          step={50}
          onChange={(v) => desk.setDesign({ reserve: v })}
        />
        {main ? (
          <LevelBar
            label="Main propellant"
            value={main.value}
            max={main.max}
            text={main.text}
            marks={[{ at: design.reserve, kind: 'target', label: 'reserve' }]}
            status={main.status}
          />
        ) : null}
        <ReadoutGrid columns={2}>
          <Readout label="Spendable" value={whole(budget.kg)} unit="kg" />
          <Readout label="Buys" value={fixed(budget.deltaV, 1)} unit="m/s" />
        </ReadoutGrid>
        <NumberField
          label="Clearance"
          unit="km"
          value={design.clearance / 1000}
          min={0}
          step={5}
          onChange={(v) => desk.setDesign({ clearance: v * 1000 })}
        />
        <p className="cs-note">
          a forecast pass inside the clearance raises an alert in flight; the debrief judges both
          margins from what was recorded
        </p>
      </Panel>

      <Panel title="Sensor and recorder" tone="blackbox">
        <Caption>camera</Caption>
        <ModeChips
          label="Camera mode"
          options={(camera?.modes ?? []).filter((m) => m !== 'reset')}
          value={design.setup.cameraMode}
          onChange={(v) => desk.setSetup({ cameraMode: v })}
        />
        <label className="cs-field">
          <span className="cs-field__label">Point at</span>
          <select
            className="cs-field__input"
            value={design.setup.cameraTarget ?? ''}
            onChange={(e) => desk.setSetup({ cameraTarget: e.target.value || null })}
          >
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <Caption>black box sample rate</Caption>
        <ModeChips
          label="Recorder rate"
          tone="blackbox"
          options={RECORDER_RATES.map((r) => ({ value: String(r), label: `${r} Hz` }))}
          value={String(design.setup.recorderRate)}
          onChange={(v) => desk.setSetup({ recorderRate: Number(v) })}
        />
        <ReadoutGrid columns={2}>
          <Readout
            label="Camera"
            value={whole(modePower(camera, design.setup.cameraMode))}
            unit="W"
          />
          <Readout label="Recorder" value={whole(recorderWatts)} unit="W" tone="blackbox" />
          <Readout
            label="Fixes"
            value={fixed(
              Math.min(
                estimate.samplesPerSecond,
                modePower(camera, design.setup.cameraMode) / (modePower(camera, 'track') || 120),
              ),
              2,
            )}
            unit="per s"
          />
          <Readout
            label="Store full in"
            value={fill > 0 ? duration((rec.capacity - rec.bytes) / fill) : '—'}
            tone="blackbox"
          />
        </ReadoutGrid>
        {design.setup.recorderRate > 1 ? (
          <p className="cs-note">
            ▲ the ship takes at most one sample a second: a faster rate costs more power and records
            no more
          </p>
        ) : null}
        {/* The estimate above is for the setting chosen; this is what the ship does now. */}
        <p className="cs-note">
          now: {fixed(fixRate(ship, camera), 2)} fixes per s · recorder{' '}
          {recorderSpec ? whole(ship.equipment[recorderSpec.id]?.powerDraw ?? 0) : '—'} W
        </p>
      </Panel>

      <Panel
        title="Configuration"
        statusLine={
          desk.designedAt !== undefined
            ? `design recorded T+${clock(desk.designedAt)} · ${scheduled}`
            : 'design not yet recorded for this attempt'
        }
        status={desk.designedAt !== undefined ? 'nominal' : 'caution'}
      >
        <ModeChips
          label="Configuration"
          options={game.ship.configurations.map((c) => ({
            value: c.id,
            label: configurationName(c.name),
          }))}
          value={design.setup.configuration}
          onChange={(v) => desk.setSetup({ configuration: v })}
        />
        <Line label="now">{ship.configuration}</Line>
        <Line label="attempt">
          {status.attemptIndex} · {status.phase}
        </Line>
        <Line label="model">v{game.model.state().version}</Line>
        <Line label="plan" status={status.planId ? 'nominal' : undefined}>
          {scheduled}
        </Line>
        {/* Setting up changes equipment and records intent; it never plans a burn (S9 R2). */}
        <p className="cs-note">
          {status.phase === 'prepare'
            ? 'prepare first; ENTER starts time. Recording the design sets the ship up; burns are planned on PLAN. Entering with no plan is allowed: the ship coasts'
            : 'recording the design sets the ship up; burns are planned on PLAN'}
        </p>
        <Actions>
          <Button primary tone="blackbox" disabled={ended} onClick={() => desk.commitDesign()}>
            RECORD DESIGN AND SET UP
          </Button>
          <Button onClick={() => desk.setPage('plan')}>OPEN PLAN</Button>
          {status.phase === 'prepare' ? (
            <Button primary disabled={status.committing} onClick={() => enter(game)}>
              ENTER {game.briefing.name}
            </Button>
          ) : null}
        </Actions>
      </Panel>
    </Columns>
  );
}
