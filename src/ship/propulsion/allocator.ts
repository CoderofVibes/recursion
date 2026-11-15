import type { Vec3 } from '../../lib/vec3.ts';

/**
 * RCS jet allocator: from a demanded body-frame force and torque (about the centre of mass) to
 * a duty (0..1) for each jet.
 *
 * It is a small linear programme, solved exactly. The force is delivered along its own
 * direction with size μF and the torque along its own with size μT:
 *
 *   minimise    Σ duty − wF · μF − wT · μT + M · |off-demand force and torque|
 *   subject to  Σ duty · wrench(jet) = μF · f̂ + μT · τ̂ + off-demand part
 *               0 ≤ μF ≤ |force|,   0 ≤ μT ≤ |torque|
 *               0 ≤ duty ≤ 1,       Σ duty in a pod ≤ maxPerPod
 *
 * in units of one jet's thrust (force) and one jet's thrust on a 1 m arm (torque). The rewards
 * wF and wT are far above any jet's cost, so as much of each demand is delivered as the jets
 * allow, torque first (wT = torquePriority · wF), and then with the least propellant (Σ duty:
 * every jet has the same thrust and Isp). M is above both rewards, so nothing is delivered
 * off the demanded directions unless that buys more than it spoils: a torque comes back as a
 * couple (no net force), a force as a balanced push (no net torque), and a demand beyond the
 * jets' authority is scaled back, not bent. Only when pods are missing and a clean answer does
 * not exist does a jet whose side effect is small against its use get fired alone.
 *
 * Deterministic: a dense tableau simplex with fixed pivot rules (the most negative reduced
 * cost enters, the lowest index on ties; Bland's rule takes over while pivots make no
 * progress, so it cannot cycle). Equal inputs give the same pivots and the same duties.
 */

export interface AllocatorJet {
  /** Index of the jet's pod, for the per-pod limit. */
  readonly pod: number;
  /** Where the force acts, body frame, m. */
  readonly point: Vec3;
  /** Unit direction of the force on the ship, body frame. */
  readonly direction: Vec3;
}

export interface AllocatorOptions {
  /** Thrust of one jet, N. */
  readonly thrust: number;
  /** Most jet-seconds per second a pod can fire (two valves open at once: 2). */
  readonly maxPerPod: number;
  /** How much more a unit of torque is worth than a unit of force when jets are short. */
  readonly torquePriority: number;
}

export interface Wrench {
  readonly force: Vec3;
  readonly torque: Vec3;
}

/** Reward for a unit of delivered force, in jet duty: well above the jets it takes (1 to 3). */
const FORCE_REWARD = 20;
/** Smallest reduced cost and pivot element the simplex acts on. */
const EPS = 1e-7;
const MAX_PIVOTS = 600;
/** Pivots without progress before Bland's rule takes over. */
const STALL_LIMIT = 12;

/** Force and torque about `centerOfMass` of one jet at full thrust. */
export function jetWrench(jet: AllocatorJet, thrust: number, centerOfMass: Vec3): Wrench {
  const rx = jet.point.x - centerOfMass.x;
  const ry = jet.point.y - centerOfMass.y;
  const rz = jet.point.z - centerOfMass.z;
  const fx = jet.direction.x * thrust;
  const fy = jet.direction.y * thrust;
  const fz = jet.direction.z * thrust;
  return {
    force: { x: fx, y: fy, z: fz },
    torque: { x: ry * fz - rz * fy, y: rz * fx - rx * fz, z: rx * fy - ry * fx },
  };
}

/** The force and torque a set of duties delivers (nominal jets, no pulse quantisation). */
export function wrenchOf(
  jets: readonly AllocatorJet[],
  duty: readonly number[],
  thrust: number,
  centerOfMass: Vec3,
): Wrench {
  let fx = 0;
  let fy = 0;
  let fz = 0;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  jets.forEach((jet, j) => {
    const u = duty[j] ?? 0;
    if (u === 0) return;
    const w = jetWrench(jet, thrust, centerOfMass);
    fx += u * w.force.x;
    fy += u * w.force.y;
    fz += u * w.force.z;
    tx += u * w.torque.x;
    ty += u * w.torque.y;
    tz += u * w.torque.z;
  });
  return { force: { x: fx, y: fy, z: fz }, torque: { x: tx, y: ty, z: tz } };
}

/**
 * Minimise cost · x subject to the tableau's rows (A x = b with b ≥ 0), x ≥ 0, starting from the
 * given basis of unit columns. `t` is (rows + 1) × (cols + 1), row-major; the last column is b
 * and the last row receives the reduced costs. Returns x.
 */
function simplex(
  t: Float64Array,
  rows: number,
  cols: number,
  basis: Int32Array,
  cost: Float64Array,
): Float64Array {
  const width = cols + 1;
  const z = rows * width;
  for (let j = 0; j <= cols; j++) {
    let value = j < cols ? cost[j]! : 0;
    for (let i = 0; i < rows; i++) value -= cost[basis[i]!]! * t[i * width + j]!;
    t[z + j] = value;
  }
  let stalled = 0;
  for (let pivots = 0; pivots < MAX_PIVOTS; pivots++) {
    let enter = -1;
    let steepest = -EPS;
    for (let j = 0; j < cols; j++) {
      const reduced = t[z + j]!;
      if (reduced < steepest) {
        enter = j;
        if (stalled >= STALL_LIMIT) break; // Bland: the first candidate
        steepest = reduced;
      }
    }
    if (enter < 0) break;
    let leave = -1;
    let best = Infinity;
    for (let i = 0; i < rows; i++) {
      const a = t[i * width + enter]!;
      if (a <= EPS) continue;
      const ratio = t[i * width + cols]! / a;
      if (
        ratio < best - 1e-12 ||
        (ratio <= best + 1e-12 && leave >= 0 && basis[i]! < basis[leave]!)
      ) {
        best = ratio;
        leave = i;
      }
    }
    if (leave < 0) break; // unbounded: cannot happen, every reward is capped
    stalled = best > 1e-12 ? 0 : stalled + 1;
    const row = leave * width;
    const pivot = t[row + enter]!;
    for (let j = 0; j <= cols; j++) t[row + j] = t[row + j]! / pivot;
    for (let i = 0; i <= rows; i++) {
      if (i === leave) continue;
      const factor = t[i * width + enter]!;
      if (factor === 0) continue;
      const other = i * width;
      for (let j = 0; j <= cols; j++) t[other + j] = t[other + j]! - factor * t[row + j]!;
      t[other + enter] = 0;
    }
    basis[leave] = enter;
  }
  const x = new Float64Array(cols);
  for (let i = 0; i < rows; i++) x[basis[i]!] = Math.max(0, t[i * width + cols]!);
  return x;
}

/**
 * Solve the allocation. `columns[j]` is jet j's wrench, `direction` the unit force direction
 * (rows 0–2) and unit torque direction (rows 3–5), `size` the two demanded sizes. With
 * `bounded` false the duty and per-pod limits are left out (eight rows, cheap); the caller adds
 * them only when that answer breaks a limit.
 */
function solve(
  jets: readonly AllocatorJet[],
  pods: number,
  columns: readonly (readonly number[])[],
  direction: readonly number[],
  size: readonly [number, number],
  options: AllocatorOptions,
  bounded: boolean,
): Float64Array {
  const n = jets.length;
  // Columns: duties, μF, μT, six pairs of off-demand parts, the two caps' slacks, then the
  // limits' slacks.
  const mu = n;
  const off = n + 2;
  const cap = off + 12;
  const limit = cap + 2;
  const limitRows = bounded ? n + pods : 0;
  const rows = 8 + limitRows;
  const cols = limit + limitRows;
  const width = cols + 1;
  const t = new Float64Array((rows + 1) * width);
  const basis = new Int32Array(rows);
  const cost = new Float64Array(cols);
  const torqueReward = FORCE_REWARD * options.torquePriority;
  const penalty = 2 * Math.max(FORCE_REWARD, torqueReward);
  for (let j = 0; j < n; j++) cost[j] = 1;
  cost[mu] = -FORCE_REWARD;
  cost[mu + 1] = -torqueReward;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < n; j++) t[i * width + j] = columns[j]![i]!;
    t[i * width + mu + (i < 3 ? 0 : 1)] = -direction[i]!;
    t[i * width + off + 2 * i] = 1;
    t[i * width + off + 2 * i + 1] = -1;
    basis[i] = off + 2 * i;
    cost[off + 2 * i] = penalty;
    cost[off + 2 * i + 1] = penalty;
  }
  for (let k = 0; k < 2; k++) {
    const i = 6 + k;
    t[i * width + mu + k] = 1;
    t[i * width + cap + k] = 1;
    t[i * width + cols] = size[k]!;
    basis[i] = cap + k;
  }
  if (bounded) {
    for (let j = 0; j < n; j++) {
      const i = 8 + j;
      t[i * width + j] = 1;
      t[i * width + limit + j] = 1;
      t[i * width + cols] = 1;
      basis[i] = limit + j;
    }
    for (let p = 0; p < pods; p++) {
      const i = 8 + n + p;
      for (let j = 0; j < n; j++) if (jets[j]!.pod === p) t[i * width + j] = 1;
      t[i * width + limit + n + p] = 1;
      t[i * width + cols] = options.maxPerPod;
      basis[i] = limit + n + p;
    }
  }
  return simplex(t, rows, cols, basis, cost);
}

/**
 * Duty per jet (same order as `jets`) for a demanded force (N) and torque (N·m) in the body
 * frame, the torque about `centerOfMass`.
 */
export function allocateJets(
  jets: readonly AllocatorJet[],
  centerOfMass: Vec3,
  force: Vec3,
  torque: Vec3,
  options: AllocatorOptions,
): number[] {
  const n = jets.length;
  const duty = new Array<number>(n).fill(0);
  if (n === 0 || !(options.thrust > 0)) return duty;
  const forceSize = Math.sqrt(force.x * force.x + force.y * force.y + force.z * force.z);
  const torqueSize = Math.sqrt(torque.x * torque.x + torque.y * torque.y + torque.z * torque.z);
  if (!(forceSize > 0) && !(torqueSize > 0)) return duty;
  const direction = [
    forceSize > 0 ? force.x / forceSize : 0,
    forceSize > 0 ? force.y / forceSize : 0,
    forceSize > 0 ? force.z / forceSize : 0,
    torqueSize > 0 ? torque.x / torqueSize : 0,
    torqueSize > 0 ? torque.y / torqueSize : 0,
    torqueSize > 0 ? torque.z / torqueSize : 0,
  ];
  const size: [number, number] = [
    forceSize > 0 ? forceSize / options.thrust : 0,
    torqueSize > 0 ? torqueSize / options.thrust : 0,
  ];
  let pods = 0;
  const columns = jets.map((jet) => {
    pods = Math.max(pods, jet.pod + 1);
    const w = jetWrench(jet, 1, centerOfMass);
    return [w.force.x, w.force.y, w.force.z, w.torque.x, w.torque.y, w.torque.z];
  });
  const withinLimits = (x: Float64Array): boolean => {
    const perPod = new Array<number>(pods).fill(0);
    for (let j = 0; j < n; j++) {
      if (x[j]! > 1 + 1e-9) return false;
      perPod[jets[j]!.pod]! += x[j]!;
    }
    return perPod.every((sum) => sum <= options.maxPerPod + 1e-9);
  };
  let x = solve(jets, pods, columns, direction, size, options, false);
  if (!withinLimits(x)) x = solve(jets, pods, columns, direction, size, options, true);
  for (let j = 0; j < n; j++) {
    const u = x[j]!;
    duty[j] = u < 1e-9 ? 0 : Math.min(1, u);
  }
  return duty;
}
