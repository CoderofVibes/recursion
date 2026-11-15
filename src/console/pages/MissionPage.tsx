/**
 * MISSION: preparation as a visible step (challenge fit; 5C-0 request 2). Before flying, the
 * player sets what the attempt is for, the margins it must keep, how the sensor, recorder and
 * ship are set up, and an approach. Committing records the design in Black Box and sets the
 * ship up; the debrief judges the attempt against it.
 */
import type { EquipmentSpec } from '../../contracts/index.ts';
import { LevelBar, ModeChips, Panel, Readout, ReadoutGrid } from '../../theme/components/index.ts';
import { Actions, Button, Caption, Line, NumberField, enter } from '../controls.tsx';
import { deltaV, fixRate, recorder, stores } from '../data.ts';
import type { Desk } from '../desk.ts';
import { clock, duration, fixed, whole } from '../format.ts';
import { APPROACH, EVIDENCE } from '../mission.ts';
import type { Approach, EvidenceGoal } from '../mission.ts';

const RECORDER_RATES = [0.05, 0.2, 1, 10];

/** Electrical draw of a mode from the nominal ratings, W. */
const modePower = (spec: EquipmentSpec | undefined, mode: string): number =>
  spec?.params[`mode.${mode}.power`] ?? 0;

export function MissionPage({ desk }: { readonly desk: Desk }) {
  const { game, design } = desk;
  const status = game.status();
  const snapshot = game.snapshot();
  const ship = snapshot.world.ship;
  const camera = game.ship.equipment.find((e) => e.kind === 'optical-tracker');
  const recorderSpec = game.ship.equipment.find((e) => e.kind === 'recorder');
  const rec = recorder(ship, game.ship);
  const main = stores(ship, game.ship, design.reserve).find((s) => s.id === 'main-propellant');
  const spendable = main ? Math.max(0, main.value - design.reserve) : 0;
  const dvAll = deltaV(ship, game.ship);
  const dvSpendable = main && main.value > 0 ? dvAll * (spendable / main.value) : 0;
  const targets = [
    ...snapshot.world.bodies.map((b) => ({ value: b.id, label: b.name.toUpperCase() })),
    ...snapshot.world.asteroids.map((a) => ({ value: a.id, label: a.id.toUpperCase() })),
  ];
  // What the recorder setting will cost: power from the ratings, storage from its sample size.
  const systems = game.ship.systems?.recorder as { bytesPerSample?: number } | undefined;
  const fill = design.setup.recorderRate * (systems?.bytesPerSample ?? 0);
  const recorderWatts =
    design.setup.recorderRate <= 1
      ? 15 + (35 - 15) * Math.max(0, (design.setup.recorderRate - 1 / 10) / (1 - 1 / 10))
      : 35 + ((100 - 35) * (design.setup.recorderRate - 10)) / 40;
  const ended = status.phase === 'ended';

  return (
    <div className="cs-grid">
      <Panel title="Objective" aside={game.briefing.name}>
        {snapshot.objectives.map((o, i) => (
          <Line key={o.id} label={o.kind === 'custom' ? `objective ${i + 1}` : o.kind}>
            {o.label}
          </Line>
        ))}
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
          <Readout label="Spendable" value={whole(spendable)} unit="kg" />
          <Readout label="Buys" value={fixed(dvSpendable, 1)} unit="m/s" />
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
                design.setup.recorderRate,
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
        <p className="cs-note">
          now: {fixed(fixRate(ship, camera), 2)} fixes per s · recorder{' '}
          {recorderSpec ? whole(ship.equipment[recorderSpec.id]?.powerDraw ?? 0) : '—'} W
        </p>
      </Panel>

      <Panel
        title="Configuration"
        statusLine={
          desk.designedAt !== undefined
            ? `design recorded T+${clock(desk.designedAt)}`
            : 'design not yet recorded for this attempt'
        }
        status={desk.designedAt !== undefined ? 'nominal' : 'caution'}
      >
        <ModeChips
          label="Configuration"
          options={game.ship.configurations.map((c) => ({ value: c.id, label: c.name }))}
          value={design.setup.configuration}
          onChange={(v) => desk.setSetup({ configuration: v })}
        />
        <Line label="now">{ship.configuration}</Line>
        <Line label="attempt">
          {status.attemptIndex} · {status.phase}
        </Line>
        <Line label="model">v{game.model.state().version}</Line>
        <Actions>
          <Button primary tone="blackbox" disabled={ended} onClick={() => desk.commitDesign()}>
            RECORD DESIGN AND SET UP
          </Button>
          {status.phase === 'prepare' ? (
            <Button primary disabled={status.committing} onClick={() => enter(game)}>
              ENTER {game.briefing.name}
            </Button>
          ) : null}
        </Actions>
      </Panel>
    </div>
  );
}
