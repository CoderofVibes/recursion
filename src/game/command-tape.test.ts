/**
 * The command tape's fingerprint (see command-tape.ts). Opt in: it flies 30,000 ticks and
 * hashes every state, so it is not part of the ordinary suite.
 *
 *   RECURSION_TAPE=<file.json> npx vitest run src/game/command-tape.test.ts
 *
 * writes, for each variant, a hash of every tick's truth state, ship-systems state,
 * measurements and events (negative zero and non-finite numbers kept distinct), a running hash
 * of the whole run, and a few readable totals. With RECURSION_TAPE_AGAINST=<before.json> as
 * well, it then compares the two tick by tick (`compareTapes` below) and fails at the first tick
 * that differs, naming what differs. Record `before.json` on the code as it was, then run the
 * changed code against it.
 */

import { describe, expect, it } from 'vitest';
import { createGravityRange } from '../content/gravity-range/index.ts';
import { COMMAND_TAPE, TAPE_TICKS, TAPE_VARIANTS, dueAt, tapeSetup } from './command-tape.ts';
import { createTruthStepper } from './truth-step.ts';

// The app's TypeScript project has no Node types, so the few Node built-ins this opt-in test
// uses are typed here and loaded when it runs (always under Node, in Vitest).
interface Hash {
  update(text: string): Hash;
  digest(encoding: 'hex'): string;
}
interface NodeBuiltins {
  readonly createHash: (algorithm: 'sha256') => Hash;
  readonly readFileSync: (path: string, encoding: 'utf8') => string;
  readonly writeFileSync: (path: string, text: string) => void;
}
const env =
  (globalThis as { process?: { env?: Readonly<Record<string, string | undefined>> } }).process
    ?.env ?? {};
const OUT = env.RECURSION_TAPE;
const AGAINST = env.RECURSION_TAPE_AGAINST;
const builtin = (name: string): Promise<unknown> => import(/* @vite-ignore */ `node:${name}`);
async function loadNode(): Promise<NodeBuiltins> {
  const crypto = (await builtin('crypto')) as Pick<NodeBuiltins, 'createHash'>;
  const fs = (await builtin('fs')) as Pick<NodeBuiltins, 'readFileSync' | 'writeFileSync'>;
  return {
    createHash: crypto.createHash,
    readFileSync: fs.readFileSync,
    writeFileSync: fs.writeFileSync,
  };
}
let createHash: NodeBuiltins['createHash'] = () => {
  throw new Error('Node built-ins not loaded');
};

/** JSON that keeps −0, NaN and ±Infinity apart from 0 and null. */
const exact = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === 'number' && (Object.is(v, -0) || !Number.isFinite(v))
      ? `#${String(v === 0 ? '-0' : v)}`
      : v,
  );
const digest = (text: string): string => createHash('sha256').update(text).digest('hex');

interface VariantPrint {
  readonly ticks: number;
  readonly chain: string;
  readonly totals: Readonly<Record<string, number>>;
  /** Per tick: state, systems, measurements, events (12 hex characters each). */
  readonly perTick: readonly string[];
}
type TapePrint = Readonly<Record<string, VariantPrint>>;

function fly(variant: (typeof TAPE_VARIANTS)[number]): VariantPrint {
  const setup = tapeSetup(createGravityRange(), variant);
  const stepper = createTruthStepper(setup);
  let state = stepper.initial;
  const chain = createHash('sha256');
  const perTick: string[] = [];
  let measurements = 0;
  let events = 0;
  let rejected = 0;
  for (let tick = 0; tick < TAPE_TICKS; tick++) {
    const result = stepper.step(state, dueAt(tick));
    state = result.state;
    const s = exact(result.state);
    const y = exact(result.state.sim.world.ship.systems);
    const m = exact(result.measurements);
    const e = exact([result.executed, result.events, result.simEvents]);
    chain.update(s).update(m).update(e);
    perTick.push([digest(s), digest(y), digest(m), digest(e)].map((h) => h.slice(0, 12)).join(' '));
    measurements += result.measurements.length;
    events += result.events.length;
    rejected += result.executed.filter((c) => c.status === 'rejected').length;
    if (state.lost) break;
  }
  const systems = state.sim.world.ship.systems;
  return {
    ticks: perTick.length,
    chain: chain.digest('hex'),
    totals: {
      t: state.sim.world.t,
      mass: systems.massProperties.mass,
      measurements,
      events,
      rejected,
      ...Object.fromEntries(Object.entries(systems.tanks).map(([id, kg]) => [`tank.${id}`, kg])),
    },
    perTick,
  };
}

/** The first tick at which two fingerprints differ, per variant, and in which parts. */
export function compareTapes(a: TapePrint, b: TapePrint): string[] {
  const parts = ['state', 'systems', 'measurements', 'events'];
  const found: string[] = [];
  for (const variant of Object.keys(a)) {
    const x = a[variant]!;
    const y = b[variant];
    if (!y) {
      found.push(`${variant}: missing`);
      continue;
    }
    if (x.chain === y.chain && x.ticks === y.ticks) continue;
    const n = Math.max(x.ticks, y.ticks);
    for (let tick = 0; tick < n; tick++) {
      const p = x.perTick[tick]?.split(' ') ?? [];
      const q = y.perTick[tick]?.split(' ') ?? [];
      const differ = parts.filter((_, i) => p[i] !== q[i]);
      if (differ.length > 0) {
        found.push(`${variant}: first differs at tick ${tick} (${differ.join(', ')})`);
        break;
      }
    }
  }
  return found;
}

describe.skipIf(!OUT)('command tape fingerprint', () => {
  it(
    'flies the tape on every variant and writes its fingerprint',
    { timeout: 900_000 },
    async () => {
      const node = await loadNode();
      createHash = node.createHash;
      expect(COMMAND_TAPE.every((entry) => entry.at >= 0 && entry.at < TAPE_TICKS)).toBe(true);
      const print: Record<string, VariantPrint> = {};
      for (const variant of TAPE_VARIANTS) print[variant] = fly(variant);
      node.writeFileSync(OUT!, JSON.stringify(print));
      for (const variant of TAPE_VARIANTS) expect(print[variant]!.ticks).toBe(TAPE_TICKS);
      if (AGAINST) {
        const before = JSON.parse(node.readFileSync(AGAINST, 'utf8')) as TapePrint;
        expect(compareTapes(before, print)).toEqual([]);
      }
    },
  );
});
