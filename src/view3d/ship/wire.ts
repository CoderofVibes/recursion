/**
 * Line-drawing kit for the ship hologram: builds technical-drawing style wire geometry in the
 * ship's body frame (x forward, y left, z up, metres).
 */
const TAU = Math.PI * 2;

/** A point or a direction in the body frame. */
export type Vec3 = readonly [number, number, number];
/** A body axis by name, or any direction. */
export type Axis = 'x' | 'y' | 'z' | Vec3;
/** One station of a lathe profile: [distance along the axis, radius]. */
export type ProfilePoint = readonly [number, number];

export interface LatheOptions {
  /** Meridians: lines running along the axis. */
  readonly mer?: number;
  /** Segments around each ring. */
  readonly n?: number;
  /** Draw a ring at every profile station. Default true. */
  readonly rings?: boolean;
  /** Start and end angle about the axis, for a partial surface. */
  readonly a0?: number;
  readonly a1?: number;
}

const AX: Readonly<Record<'x' | 'y' | 'z', Vec3>> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dir = (axis: Axis): Vec3 => unit(typeof axis === 'string' ? AX[axis] : axis);

/** The axis direction and two unit vectors across it. */
function basis(axis: Axis): readonly [Vec3, Vec3, Vec3] {
  const d = dir(axis);
  const u = unit(cross(Math.abs(d[2]) < 0.9 ? AX.z : AX.y, d));
  return [d, u, cross(d, u)];
}

/** c + u·a + v·b + d·t */
const at = (c: Vec3, u: Vec3, v: Vec3, d: Vec3, a: number, b: number, t: number): Vec3 => [
  c[0] + u[0] * a + v[0] * b + d[0] * t,
  c[1] + u[1] * a + v[1] * b + d[1] * t,
  c[2] + u[2] * a + v[2] * b + d[2] * t,
];

/** Corners of a rectangle, in drawing order. */
const CORNERS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
type Index = 0 | 1 | 2;
/** The two axes across each axis. */
const ACROSS: Readonly<Record<Index, readonly [Index, Index]>> = {
  0: [1, 2],
  1: [0, 2],
  2: [0, 1],
};

export class Wire {
  /** Line segments as a flat list: two points (x, y, z, x, y, z) each, body frame. */
  readonly s: number[] = [];

  /** Number of line segments drawn so far. */
  get segments(): number {
    return this.s.length / 6;
  }

  seg(a: Vec3, b: Vec3): this {
    this.s.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    return this;
  }

  poly(pts: readonly Vec3[], closed = false): this {
    for (let i = 0; i + 1 < pts.length; i++) this.seg(pts[i]!, pts[i + 1]!);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1]!, pts[0]!);
    return this;
  }

  /** Circle or arc of radius r about `axis` through c. */
  ring(c: Vec3, r: number, axis: Axis = 'x', n = 24, a0 = 0, a1 = TAU): this {
    const [d, u, v] = basis(axis);
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(at(c, u, v, d, Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return this.poly(pts);
  }

  /** Surface of revolution: profile is [[distance along axis, radius], ...] from c. */
  lathe(
    c: Vec3,
    axis: Axis,
    prof: readonly ProfilePoint[],
    { mer = 12, n = 24, rings = true, a0 = 0, a1 = TAU }: LatheOptions = {},
  ): this {
    const [d, u, v] = basis(axis);
    if (rings)
      for (const [t, r] of prof) {
        if (r <= 0) continue;
        const pts: Vec3[] = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          pts.push(at(c, u, v, d, Math.cos(a) * r, Math.sin(a) * r, t));
        }
        this.poly(pts);
      }
    const full = Math.abs(a1 - a0 - TAU) < 1e-6;
    const m = full ? mer : mer + 1;
    for (let k = 0; k < m; k++) {
      const a = a0 + ((a1 - a0) * k) / mer;
      this.poly(prof.map(([t, r]) => at(c, u, v, d, Math.cos(a) * r, Math.sin(a) * r, t)));
    }
    return this;
  }

  cyl(c: Vec3, axis: Axis, len: number, r: number, o?: LatheOptions): this {
    return this.lathe(
      c,
      axis,
      [
        [0, r],
        [len, r],
      ],
      o,
    );
  }

  cone(c: Vec3, axis: Axis, len: number, r0: number, r1: number, o?: LatheOptions): this {
    return this.lathe(
      c,
      axis,
      [
        [0, r0],
        [len, r1],
      ],
      o,
    );
  }

  /** Sphere as a lathe about `axis`. */
  sphere(c: Vec3, r: number, axis: Axis = 'x', o: LatheOptions = {}): this {
    const prof: ProfilePoint[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = -Math.PI / 2 + (Math.PI * i) / 8;
      prof.push([Math.sin(p) * r, Math.cos(p) * r]);
    }
    return this.lathe(c, axis, prof, { mer: 8, n: 20, ...o });
  }

  /** Tank with domed ends: c is the centre, len the full length along axis. */
  capsule(c: Vec3, axis: Axis, len: number, r: number, o: LatheOptions = {}): this {
    const h = Math.max(0, len / 2 - r);
    const prof: ProfilePoint[] = [];
    for (let i = 0; i <= 5; i++) {
      const p = (Math.PI / 2) * (i / 5);
      prof.push([-h - Math.cos(p) * r, Math.sin(p) * r]);
    }
    for (let i = 0; i <= 5; i++) {
      const p = (Math.PI / 2) * (i / 5);
      prof.push([h + Math.sin(p) * r, Math.cos(p) * r]);
    }
    return this.lathe(c, axis, prof, { mer: 8, n: 24, ...o });
  }

  /** Axis-aligned box: centre c, sizes along x, y, z. */
  box(c: Vec3, s: Vec3): this {
    const hx = s[0] / 2;
    const hy = s[1] / 2;
    const hz = s[2] / 2;
    const p = (i: number, j: number, k: number): Vec3 => [
      c[0] + i * hx,
      c[1] + j * hy,
      c[2] + k * hz,
    ];
    for (const k of [-1, 1]) this.poly([p(-1, -1, k), p(1, -1, k), p(1, 1, k), p(-1, 1, k)], true);
    for (const [i, j] of CORNERS) this.seg(p(i, j, -1), p(i, j, 1));
    return this;
  }

  /** Box sliced into `count` plates or cards along one axis (0 = x, 1 = y, 2 = z). */
  slices(c: Vec3, s: Vec3, axis: Index, count: number): this {
    const [u, v] = ACROSS[axis];
    for (let i = 1; i < count; i++) {
      const t = -s[axis] / 2 + (s[axis] * i) / count;
      const pts = CORNERS.map(([a, b]): Vec3 => {
        const q: [number, number, number] = [c[0], c[1], c[2]];
        q[axis] += t;
        q[u] += (a * s[u]) / 2;
        q[v] += (b * s[v]) / 2;
        return q;
      });
      this.poly(pts, true);
    }
    return this;
  }

  /** Flat panel with a cell grid: origin o, edge vectors u and v. */
  grid(o: Vec3, u: Vec3, v: Vec3, nu: number, nv: number): this {
    const p = (a: number, b: number): Vec3 => [
      o[0] + u[0] * a + v[0] * b,
      o[1] + u[1] * a + v[1] * b,
      o[2] + u[2] * a + v[2] * b,
    ];
    for (let i = 0; i <= nu; i++) this.seg(p(i / nu, 0), p(i / nu, 1));
    for (let j = 0; j <= nv; j++) this.seg(p(0, j / nv), p(1, j / nv));
    return this;
  }

  /** Disc with spokes and inner rings (a bulkhead, a grid, a dish face). */
  disc(c: Vec3, r: number, axis: Axis, spokes = 8, rings = 2): this {
    const [d, u, v] = basis(axis);
    for (let i = 1; i <= rings; i++) this.ring(c, (r * i) / rings, axis, 28);
    for (let k = 0; k < spokes; k++) {
      const a = (TAU * k) / spokes;
      this.seg(c, at(c, u, v, d, Math.cos(a) * r, Math.sin(a) * r, 0));
    }
    return this;
  }

  /** A pipe or cable run through the given points. */
  run(pts: readonly Vec3[]): this {
    return this.poly(pts);
  }

  merge(other: Wire): this {
    for (const x of other.s) this.s.push(x);
    return this;
  }

  /** Mirror across the ship's centre plane (y → -y). */
  mirrored(): Wire {
    const w = new Wire();
    for (let i = 0; i < this.s.length; i += 3)
      w.s.push(this.s[i]!, -this.s[i + 1]!, this.s[i + 2]!);
    return w;
  }

  /** Flat array in three.js coordinates: body (x, y, z) → (-y, z, -x). */
  toThree(): Float32Array {
    const out = new Float32Array(this.s.length);
    for (let i = 0; i < this.s.length; i += 3) {
      out[i] = -this.s[i + 1]!;
      out[i + 1] = this.s[i + 2]!;
      out[i + 2] = -this.s[i]!;
    }
    return out;
  }
}

export const W = (): Wire => new Wire();
