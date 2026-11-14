/**
 * Mission design and the attempt debrief (challenge fit; docs/handoffs/5C-0.md requests 2 and 3).
 *
 * Preparation is a visible step: before flying, the player chooses what the attempt is for
 * (an evidence goal), the margins it must keep (a propellant reserve and a clearance), how the
 * sensor, recorder and ship are set up, and an approach. The design is recorded in Black Box as
 * a `mark` command, so it travels with the attempt's record across recurrence, and the debrief
 * judges the attempt against it from that record alone.
 *
 * Belief side: everything here is computed from Black Box records (P11). What was not measured
 * is reported as not measured.
 */
import type {
  AttemptRecord,
  BlackBoxArchive,
  Command,
  ExecutedCommand,
  ShipDefinition,
} from '../contracts/index.ts';
import { diffCommands, forecastDivergence } from '../blackbox/index.ts';
import type { ItemDiff } from '../blackbox/index.ts';
import { clock, dist, fixed, name, whole } from './format.ts';

export type EvidenceGoal = 'calibrate' | 'probe' | 'validate' | 'fly';
export type Approach = 'wide' | 'close';

export const EVIDENCE: Readonly<Record<EvidenceGoal, { label: string; detail: string }>> = {
  calibrate: { label: 'CALIBRATE', detail: 'measure the pull at distances not yet flown' },
  probe: { label: 'PROBE', detail: 'track a rock where the ship will not go' },
  validate: { label: 'VALIDATE', detail: 'fly a separate case to hold out against a rule' },
  fly: { label: 'FLY', detail: 'fly the objective on the model as it stands' },
};

export const APPROACH: Readonly<Record<Approach, { label: string; detail: string }>> = {
  wide: { label: 'WIDE', detail: 'more clearance and time, less turn from the pass' },
  close: { label: 'CLOSE', detail: 'more turn for less propellant, less room for error' },
};

export interface MissionDesign {
  readonly version: 1;
  readonly evidence: EvidenceGoal;
  /** Main propellant to have left at the end, kg. */
  readonly reserve: number;
  /** Closest pass planned for, hull to surface, metres. */
  readonly clearance: number;
  readonly approach: Approach;
  readonly setup: {
    readonly cameraMode: string;
    /** Object the camera is pointed at; null leaves it where it is. */
    readonly cameraTarget: string | null;
    /** Black Box sample rate, Hz. */
    readonly recorderRate: number;
    readonly configuration: string;
  };
}

export function defaultDesign(ship: ShipDefinition, primary: string | null): MissionDesign {
  const main = ship.tanks.find((t) => t.id === 'main-propellant') ?? ship.tanks[0];
  const camera = ship.equipment.find((e) => e.kind === 'optical-tracker');
  return {
    version: 1,
    evidence: 'calibrate',
    reserve: Math.round((main?.capacity ?? 0) * 0.9),
    clearance: 50_000,
    approach: 'wide',
    setup: {
      cameraMode: camera?.defaultMode ?? 'track',
      cameraTarget: primary,
      recorderRate: 0.05,
      configuration: ship.defaultConfiguration,
    },
  };
}

const PREFIX = 'mission-design ';

/** The design as a Black Box annotation. */
export const designMark = (design: MissionDesign): Command => ({
  kind: 'mark',
  label: PREFIX + JSON.stringify(design),
});

function parseDesign(label: string): MissionDesign | undefined {
  if (!label.startsWith(PREFIX)) return undefined;
  try {
    const d = JSON.parse(label.slice(PREFIX.length)) as MissionDesign;
    return d.version === 1 && typeof d.reserve === 'number' ? d : undefined;
  } catch {
    return undefined;
  }
}

/** The last design committed during an attempt, and when. */
export function designOf(record: AttemptRecord): { t: number; design: MissionDesign } | undefined {
  for (let i = record.executed.length - 1; i >= 0; i--) {
    const e = record.executed[i]!;
    if (e.command.kind !== 'mark') continue;
    const design = parseDesign(e.command.label);
    if (design) return { t: e.t, design };
  }
  return undefined;
}

/** The commands that set the ship up as designed. */
export function setupCommands(design: MissionDesign, ship: ShipDefinition): Command[] {
  const camera = ship.equipment.find((e) => e.kind === 'optical-tracker');
  const commands: Command[] = [];
  if (camera) {
    commands.push({ kind: 'mode', equipment: camera.id, mode: design.setup.cameraMode });
    if (design.setup.cameraTarget)
      commands.push({ kind: 'point', sensor: camera.id, target: design.setup.cameraTarget });
  }
  commands.push({ kind: 'recorder', sampleRate: design.setup.recorderRate });
  commands.push({ kind: 'configure', configuration: design.setup.configuration });
  return commands;
}

// ---- Debrief ---------------------------------------------------------------------------------

export interface DebriefLine {
  readonly label: string;
  readonly planned: string;
  readonly measured: string;
  /** null: could not be judged from what was recorded. */
  readonly met: boolean | null;
}

export interface Debrief {
  readonly attemptId: string;
  readonly index: number;
  readonly outcome: string;
  readonly duration: number;
  readonly design: MissionDesign | undefined;
  /** Each planned constraint against what was measured. */
  readonly constraints: readonly DebriefLine[];
  /** The event that ended or limited the attempt, if the record shows one. */
  readonly limiting: { readonly label: string; readonly detail: string } | null;
  readonly cost: readonly { readonly label: string; readonly value: string }[];
  /** What differs from the attempt before, in plain instrument words. */
  readonly changed: readonly string[];
  /** Where each issued forecast left what was measured. */
  readonly forecasts: readonly { readonly label: string; readonly value: string; readonly bad: boolean }[];
}

/** First and last recorded reading of a telemetry channel in an attempt. */
function channelSpan(
  record: AttemptRecord,
  channel: string,
): { first: number; last: number } | undefined {
  let first: number | undefined;
  let last: number | undefined;
  for (const m of record.measurements) {
    if (m.kind !== 'telemetry' || m.channel !== channel) continue;
    const v = m.value[0];
    if (v === undefined) continue;
    if (first === undefined) first = v;
    last = v;
  }
  return first !== undefined && last !== undefined ? { first, last } : undefined;
}

/** Smallest measured range to each ranged target, centre to centre. */
function closestMeasured(record: AttemptRecord): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of record.measurements) {
    if (m.kind !== 'range' || !m.target) continue;
    const v = m.value[0];
    if (v === undefined) continue;
    const best = out.get(m.target);
    if (best === undefined || v < best) out.set(m.target, v);
  }
  return out;
}

const describeCommand = (c: Command): string => {
  switch (c.kind) {
    case 'burn':
      return `burn ${name(c.thruster)} ${fixed(c.duration, 1)} s at ${Math.round(c.throttle * 100)}%`;
    case 'cutoff':
      return `cutoff ${name(c.thruster)}`;
    case 'attitude':
      return `attitude ${c.target.reference}`;
    case 'power':
      return `power ${name(c.equipment)} ${whole(c.allocation)} W`;
    case 'mode':
      return `${name(c.equipment)} ${c.mode}`;
    case 'point':
      return `point ${name(c.sensor)} at ${c.target ?? 'a direction'}`;
    case 'configure':
      return `configure ${c.configuration}`;
    case 'recorder':
      return `recorder ${c.sampleRate} Hz`;
    case 'mark':
      return 'mark';
  }
};

const flown = (record: AttemptRecord): { t: number; command: Command }[] =>
  record.executed
    .filter(
      (e: ExecutedCommand) =>
        e.status !== 'rejected' && e.source !== 'procedure' && e.command.kind !== 'mark',
    )
    .map((e) => ({ t: e.t, command: e.command }));

/** Commands given at nearly the same moment in two attempts count as given at the same time. */
const SAME_MOMENT = 120;

/**
 * One command difference between two attempts in instrument words, or null when it is not a
 * change the player made: the same command a little earlier or later, or an attitude target
 * that resolved to a slightly different angle.
 */
export function describeDiff(d: ItemDiff, a = 'the first', b = 'the second'): string | null {
  if (d.kind === 'same') return null;
  if (d.kind === 'only-a') return `only in ${a}: T+${clock(d.t)} ${describeCommand(d.command)}`;
  if (d.kind === 'only-b') return `only in ${b}: T+${clock(d.t)} ${describeCommand(d.command)}`;
  const before = describeCommand(d.a);
  const after = describeCommand(d.b);
  const moved = Math.abs(d.tA - d.tB) >= SAME_MOMENT;
  if (before === after && !moved) return null;
  return moved
    ? `T+${clock(d.tA)} ${before} → T+${clock(d.tB)} ${after}`
    : `T+${clock(d.tA)} ${before} → ${after}`;
}

/** What differs between this attempt and the one before it. */
export function changes(record: AttemptRecord, previous: AttemptRecord | undefined): string[] {
  if (!previous) return [];
  const out: string[] = [];
  const names = [`attempt ${previous.index}`, `attempt ${record.index}`] as const;
  const a = designOf(previous)?.design;
  const b = designOf(record)?.design;
  if (a && b) {
    if (a.evidence !== b.evidence)
      out.push(`goal ${EVIDENCE[a.evidence].label} → ${EVIDENCE[b.evidence].label}`);
    if (a.approach !== b.approach)
      out.push(`approach ${APPROACH[a.approach].label} → ${APPROACH[b.approach].label}`);
    if (a.reserve !== b.reserve) out.push(`reserve ${whole(a.reserve)} → ${whole(b.reserve)} kg`);
    if (a.clearance !== b.clearance)
      out.push(`clearance ${dist(a.clearance)} → ${dist(b.clearance)}`);
  } else if (!a && b) out.push('a design was recorded this time');
  for (const d of diffCommands(flown(previous), flown(record), 5)) {
    const line = describeDiff(d, names[0], names[1]);
    if (line === null) continue;
    if (out.length >= 9) {
      out.push('…');
      break;
    }
    out.push(line);
  }
  if (previous.modelVersionAtEnd !== record.start.modelVersion)
    out.push(`model v${previous.start.modelVersion} → v${record.start.modelVersion} at start`);
  return out;
}

/** Judge an attempt against its own design, from its record. */
export function debrief(
  record: AttemptRecord,
  archive: BlackBoxArchive,
  bodies: readonly { readonly id: string; readonly radius: number }[],
): Debrief {
  const design = designOf(record)?.design;
  const previous = archive.attempts.filter((a) => a.index < record.index).at(-1);
  const end = record.outcome.kind === 'in-progress' ? undefined : record.outcome.t;
  const lastT = end ?? record.measurements.at(-1)?.t ?? 0;

  const main = channelSpan(record, 'main-propellant.propellant');
  const rcsL = channelSpan(record, 'rcs-left.propellant');
  const rcsR = channelSpan(record, 'rcs-right.propellant');
  const hydrogen = channelSpan(record, 'fuel-cell-hydrogen.propellant');
  const stored = channelSpan(record, 'black-box.bytes');
  const closest = closestMeasured(record);

  const constraints: DebriefLine[] = [];
  if (design) {
    constraints.push({
      label: 'reserve',
      planned: `≥ ${whole(design.reserve)} kg`,
      measured: main ? `${whole(main.last)} kg` : 'not recorded',
      met: main ? main.last >= design.reserve : null,
    });
    // Clearance can only be judged against objects the ship ranged.
    let tightest: { id: string; clearance: number } | undefined;
    for (const [id, r] of closest) {
      const radius = bodies.find((b) => b.id === id)?.radius ?? 0;
      const c = r - radius;
      if (!tightest || c < tightest.clearance) tightest = { id, clearance: c };
    }
    constraints.push({
      label: 'clearance',
      planned: `≥ ${dist(design.clearance)}`,
      measured: tightest ? `${dist(tightest.clearance)} from ${tightest.id}` : 'nothing ranged',
      met: tightest ? tightest.clearance >= design.clearance : null,
    });
    const probeFixes = record.measurements.filter(
      (m) =>
        (m.kind === 'bearing' || m.kind === 'range') &&
        m.target !== undefined &&
        !bodies.some((b) => b.id === m.target),
    ).length;
    const heldOut = (archive.extensionTests ?? []).filter((t) => t.heldOut === record.id);
    const objective = record.events.filter((e) => e.kind === 'objective');
    const spans = [...closest].map(([id, r]) => `${id} to ${dist(r)}`).join(', ');
    const evidence: Readonly<Record<EvidenceGoal, DebriefLine>> = {
      calibrate: {
        label: 'evidence',
        planned: EVIDENCE.calibrate.detail,
        measured: spans ? `ranged ${spans}` : 'no range fixes',
        met: closest.size > 0 ? true : false,
      },
      probe: {
        label: 'evidence',
        planned: EVIDENCE.probe.detail,
        measured: probeFixes ? `${whole(probeFixes)} fixes on rocks` : 'no rock was tracked',
        met: probeFixes > 0,
      },
      validate: {
        label: 'evidence',
        planned: EVIDENCE.validate.detail,
        measured: heldOut.length
          ? `held out ${heldOut.length}×, ${heldOut.some((t) => t.adoptable) ? 'a rule held' : 'no rule held'}`
          : 'not yet held out against a rule',
        met: heldOut.length ? heldOut.some((t) => t.adoptable) : null,
      },
      fly: {
        label: 'evidence',
        planned: EVIDENCE.fly.detail,
        measured: objective.length ? `${objective.length} objective events` : 'objective not reached',
        met: record.outcome.kind === 'completed',
      },
    };
    constraints.push(evidence[design.evidence]);
  }

  // The limiting event: what the record shows ended or bounded the attempt.
  let limiting: Debrief['limiting'] = null;
  const contact = record.events.filter((e) => e.kind === 'contact').at(-1);
  const divergences = record.forecasts.map((f) => ({ f, d: forecastDivergence(f, record) }));
  const firstLeft = divergences
    .filter((x) => x.d.firstBeyond3Sigma !== null)
    .sort((a, b) => a.d.firstBeyond3Sigma! - b.d.firstBeyond3Sigma!)[0];
  if (record.outcome.kind === 'lost') {
    limiting = {
      label: `ship lost · ${record.outcome.cause}`,
      detail:
        `T+${clock(record.outcome.t)}` +
        (contact && contact.kind === 'contact'
          ? ` · contact with ${contact.with ?? 'an object the ship could not identify'}`
          : ''),
    };
  } else if (firstLeft) {
    limiting = {
      label: 'outcome left the forecast',
      detail: `T+${clock(firstLeft.d.firstBeyond3Sigma!)}, forecast issued T+${clock(firstLeft.f.issuedAt)} on model v${firstLeft.f.modelVersion}`,
    };
  } else if (design && main && main.last < design.reserve) {
    limiting = { label: 'reserve broken', detail: `${whole(main.last)} kg left` };
  }

  const used = (span: { first: number; last: number } | undefined): number | undefined =>
    span ? span.first - span.last : undefined;
  const rcsUsed =
    rcsL || rcsR ? (used(rcsL) ?? 0) + (used(rcsR) ?? 0) : undefined;
  const cost = [
    { label: 'main propellant', value: main ? `${fixed(used(main)!, 1)} kg` : 'not recorded' },
    { label: 'rcs propellant', value: rcsUsed !== undefined ? `${fixed(rcsUsed, 1)} kg` : 'not recorded' },
    { label: 'hydrogen', value: hydrogen ? `${fixed(used(hydrogen)!, 2)} kg` : 'not recorded' },
    { label: 'ship time', value: `T+${clock(lastT)}` },
    {
      label: 'records',
      value: `${whole(record.measurements.length)}${stored ? ` · ${fixed((stored.last - stored.first) / 1e6, 1)} MB` : ''}`,
    },
  ];

  const forecasts = divergences.map(({ f, d }) => ({
    label: `forecast T+${clock(f.issuedAt)} · v${f.modelVersion}`,
    value: d.unmeasured
      ? 'nothing measured while it was valid'
      : d.firstBeyond3Sigma !== null
        ? `left at T+${clock(d.firstBeyond3Sigma)} · worst ${fixed(d.maxSigmas ?? 0, 1)}σ`
        : `held · worst ${fixed(d.maxSigmas ?? 0, 1)}σ`,
    bad: d.firstBeyond3Sigma !== null,
  }));

  return {
    attemptId: record.id,
    index: record.index,
    outcome: record.outcome.kind,
    duration: lastT,
    design,
    constraints,
    limiting,
    cost,
    changed: changes(record, previous),
    forecasts,
  };
}
