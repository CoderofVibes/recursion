import { cpus, freemem } from 'node:os';
import { sleep } from './cdp.mjs';

const counters = () => cpus().map(({ times }) => ({
  idle: times.idle, total: Object.values(times).reduce((a, b) => a + b, 0),
}));

// Measure before launching the next page, not concurrently with its timed sample.
// CPU occupancy is a contention indicator, never proof of an otherwise quiet GPU/host.
export async function hostLoad() {
  const before = counters();
  await sleep(1000);
  const after = counters();
  const perCoreBusyPercent = after.map((c, i) => {
    const total = c.total - before[i].total;
    return total ? 100 * (1 - (c.idle - before[i].idle) / total) : 0;
  });
  const busyPercent = perCoreBusyPercent.reduce((a, b) => a + b, 0) / after.length;
  return { at: new Date().toISOString(), windowMs: 1000, busyPercent, perCoreBusyPercent,
    freeMemoryBytes: freemem(), contentionFlag: busyPercent >= 20,
    note: 'Uncontrolled shared host; >=20% aggregate CPU flags possible contention. Low CPU does not establish quiet GPU, memory, or scheduling.' };
}
