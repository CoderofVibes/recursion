/**
 * Small dense linear algebra for the estimator (1G spec §4.4, §5.4).
 *
 * Row-major Float64Array matrices, sized for the model's problems (up to about 60×60).
 * LU with partial pivoting for general solves and inverses; Cholesky for symmetric
 * positive-definite systems. Deterministic: no randomness, fixed loop order.
 */

export interface Matrix {
  readonly rows: number;
  readonly cols: number;
  /** Row-major, length rows × cols. */
  readonly data: Float64Array;
}

export function zeros(rows: number, cols: number): Matrix {
  return { rows, cols, data: new Float64Array(rows * cols) };
}

export function identity(n: number): Matrix {
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m.data[i * n + i] = 1;
  return m;
}

export function fromRows(rows: readonly (readonly number[])[]): Matrix {
  const r = rows.length;
  const c = r > 0 ? rows[0]!.length : 0;
  const m = zeros(r, c);
  for (let i = 0; i < r; i++) {
    const row = rows[i]!;
    if (row.length !== c) throw new Error('fromRows: ragged rows');
    for (let j = 0; j < c; j++) m.data[i * c + j] = row[j]!;
  }
  return m;
}

export function toRows(m: Matrix): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < m.rows; i++) out.push(Array.from(m.data.subarray(i * m.cols, (i + 1) * m.cols)));
  return out;
}

export function clone(m: Matrix): Matrix {
  return { rows: m.rows, cols: m.cols, data: new Float64Array(m.data) };
}

export function at(m: Matrix, i: number, j: number): number {
  return m.data[i * m.cols + j]!;
}

export function matMul(a: Matrix, b: Matrix): Matrix {
  if (a.cols !== b.rows) throw new Error('matMul: shape mismatch');
  const out = zeros(a.rows, b.cols);
  const n = a.cols;
  const bc = b.cols;
  for (let i = 0; i < a.rows; i++) {
    for (let k = 0; k < n; k++) {
      const aik = a.data[i * n + k]!;
      if (aik === 0) continue;
      for (let j = 0; j < bc; j++) out.data[i * bc + j]! += aik * b.data[k * bc + j]!;
    }
  }
  return out;
}

export function transpose(a: Matrix): Matrix {
  const out = zeros(a.cols, a.rows);
  for (let i = 0; i < a.rows; i++)
    for (let j = 0; j < a.cols; j++) out.data[j * a.rows + i] = a.data[i * a.cols + j]!;
  return out;
}

/** a · b · aᵀ for a (r×n) and symmetric b (n×n). */
export function sandwich(a: Matrix, b: Matrix): Matrix {
  return matMul(matMul(a, b), transpose(a));
}

export function trace(a: Matrix): number {
  let s = 0;
  for (let i = 0; i < Math.min(a.rows, a.cols); i++) s += a.data[i * a.cols + i]!;
  return s;
}

/** Sub-matrix with the given row and column indices. */
export function pick(a: Matrix, rows: readonly number[], cols: readonly number[] = rows): Matrix {
  const out = zeros(rows.length, cols.length);
  for (let i = 0; i < rows.length; i++)
    for (let j = 0; j < cols.length; j++)
      out.data[i * cols.length + j] = a.data[rows[i]! * a.cols + cols[j]!]!;
  return out;
}

export interface LU {
  readonly n: number;
  readonly lu: Float64Array;
  readonly piv: Int32Array;
}

/** LU decomposition with partial pivoting. Throws on an exactly singular matrix. */
export function luDecompose(a: Matrix): LU {
  if (a.rows !== a.cols) throw new Error('luDecompose: matrix must be square');
  const n = a.rows;
  const lu = new Float64Array(a.data);
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  for (let k = 0; k < n; k++) {
    let p = k;
    let best = Math.abs(lu[k * n + k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(lu[i * n + k]!);
      if (v > best) {
        best = v;
        p = i;
      }
    }
    if (best === 0 || !Number.isFinite(best)) throw new Error('luDecompose: singular matrix');
    if (p !== k) {
      for (let j = 0; j < n; j++) {
        const t = lu[k * n + j]!;
        lu[k * n + j] = lu[p * n + j]!;
        lu[p * n + j] = t;
      }
      const t = piv[k]!;
      piv[k] = piv[p]!;
      piv[p] = t;
    }
    const pivot = lu[k * n + k]!;
    for (let i = k + 1; i < n; i++) {
      const f = (lu[i * n + k]! /= pivot);
      if (f === 0) continue;
      for (let j = k + 1; j < n; j++) lu[i * n + j]! -= f * lu[k * n + j]!;
    }
  }
  return { n, lu, piv };
}

export function luSolve(d: LU, b: ArrayLike<number>): Float64Array {
  const { n, lu, piv } = d;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = b[piv[i]!]!;
  for (let i = 0; i < n; i++) {
    let s = x[i]!;
    for (let j = 0; j < i; j++) s -= lu[i * n + j]! * x[j]!;
    x[i] = s;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]!;
    for (let j = i + 1; j < n; j++) s -= lu[i * n + j]! * x[j]!;
    x[i] = s / lu[i * n + i]!;
  }
  return x;
}

/** Solve a·x = b. */
export function solve(a: Matrix, b: ArrayLike<number>): Float64Array {
  return luSolve(luDecompose(a), b);
}

export function inverse(a: Matrix): Matrix {
  const d = luDecompose(a);
  const n = a.rows;
  const out = zeros(n, n);
  const e = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    e.fill(0);
    e[j] = 1;
    const col = luSolve(d, e);
    for (let i = 0; i < n; i++) out.data[i * n + j] = col[i]!;
  }
  return out;
}

/** Lower-triangular Cholesky factor of a symmetric positive-definite matrix, or null if not SPD. */
export function cholesky(a: Matrix): Matrix | null {
  if (a.rows !== a.cols) throw new Error('cholesky: matrix must be square');
  const n = a.rows;
  const l = zeros(n, n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a.data[i * n + j]!;
      for (let k = 0; k < j; k++) s -= l.data[i * n + k]! * l.data[j * n + k]!;
      if (i === j) {
        if (!(s > 0)) return null;
        l.data[i * n + i] = Math.sqrt(s);
      } else {
        l.data[i * n + j] = s / l.data[j * n + j]!;
      }
    }
  }
  return l;
}

export function choleskySolve(l: Matrix, b: ArrayLike<number>): Float64Array {
  const n = l.rows;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= l.data[i * n + k]! * y[k]!;
    y[i] = s / l.data[i * n + i]!;
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= l.data[k * n + i]! * y[k]!;
    y[i] = s / l.data[i * n + i]!;
  }
  return y;
}

/** Eigenvalues (ascending) of a symmetric 2×2 [[a, b], [b, c]]. */
export function symEig2(a: number, b: number, c: number): [number, number] {
  const m = 0.5 * (a + c);
  const r = Math.hypot(0.5 * (a - c), b);
  return [m - r, m + r];
}

/**
 * Least-squares solution of design · X ≈ rhs (design m×n, m ≥ n, full column rank) by
 * Householder QR, so poorly scaled designs such as [1, τ, ½τ²] keep their precision.
 * Returns X (n × rhs.cols).
 */
export function lstsq(design: Matrix, rhs: Matrix): Matrix {
  const m = design.rows;
  const n = design.cols;
  const k = rhs.cols;
  if (rhs.rows !== m) throw new Error('lstsq: shape mismatch');
  if (m < n) throw new Error('lstsq: under-determined');
  const a = new Float64Array(design.data);
  const b = new Float64Array(rhs.data);
  const v = new Float64Array(m);
  for (let j = 0; j < n; j++) {
    let norm = 0;
    for (let i = j; i < m; i++) norm += a[i * n + j]! * a[i * n + j]!;
    norm = Math.sqrt(norm);
    if (norm === 0) throw new Error('lstsq: rank deficient');
    const alpha = a[j * n + j]! > 0 ? -norm : norm;
    let vnorm = 0;
    for (let i = j; i < m; i++) {
      v[i] = a[i * n + j]! - (i === j ? alpha : 0);
      vnorm += v[i]! * v[i]!;
    }
    if (vnorm === 0) continue;
    for (let c = j; c < n; c++) {
      let s = 0;
      for (let i = j; i < m; i++) s += v[i]! * a[i * n + c]!;
      const f = (2 * s) / vnorm;
      for (let i = j; i < m; i++) a[i * n + c]! -= f * v[i]!;
    }
    for (let c = 0; c < k; c++) {
      let s = 0;
      for (let i = j; i < m; i++) s += v[i]! * b[i * k + c]!;
      const f = (2 * s) / vnorm;
      for (let i = j; i < m; i++) b[i * k + c]! -= f * v[i]!;
    }
  }
  const x = zeros(n, k);
  for (let c = 0; c < k; c++) {
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i * k + c]!;
      for (let j = i + 1; j < n; j++) s -= a[i * n + j]! * x.data[j * k + c]!;
      x.data[i * k + c] = s / a[i * n + i]!;
    }
  }
  return x;
}
