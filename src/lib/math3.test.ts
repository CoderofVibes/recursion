import { describe, expect, it } from 'vitest';
import { quat, sym3, v3, type DeepReadonly, type Quat, type Vec3 } from './index.ts';

const close = (a: Vec3, b: Vec3, tolerance = 1e-12): void => {
  expect(v3.equals(a, b, tolerance), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(true);
};
const sameRotation = (a: Quat, b: Quat, tolerance = 1e-12): void => {
  expect(quat.angleBetween(a, b)).toBeLessThan(tolerance);
};

describe('vec3', () => {
  it('does basic arithmetic', () => {
    const a = v3.vec3(1, 2, 2);
    expect(v3.length(a)).toBe(3);
    expect(v3.vec3(3, 4)).toEqual({ x: 3, y: 4, z: 0 });
    expect(v3.add(a, v3.vec3(1, 1, 1))).toEqual({ x: 2, y: 3, z: 3 });
    expect(v3.dot(a, v3.UNIT_Z)).toBe(2);
    expect(v3.cross(v3.UNIT_X, v3.UNIT_Y)).toEqual(v3.UNIT_Z);
    expect(v3.cross(v3.UNIT_Y, v3.UNIT_Z)).toEqual(v3.UNIT_X);
    expect(v3.normalize(v3.ZERO)).toEqual(v3.ZERO);
    expect(v3.distance(a, v3.ZERO)).toBe(3);
  });

  it('converts between a direction and azimuth and elevation', () => {
    const d = v3.fromAzEl(0.7, -0.4, 5);
    expect(v3.length(d)).toBeCloseTo(5, 12);
    expect(v3.azimuthOf(d)).toBeCloseTo(0.7, 12);
    expect(v3.elevationOf(d)).toBeCloseTo(-0.4, 12);
    // In the plane it is the planar angle, exactly.
    expect(v3.fromAzEl(1.1)).toEqual({ x: Math.cos(1.1), y: Math.sin(1.1), z: 0 });
    expect(v3.angleBetween(v3.UNIT_X, v3.UNIT_Z)).toBeCloseTo(Math.PI / 2, 12);
  });

  it('finds a perpendicular, and keeps in-plane vectors in the plane or along z', () => {
    for (const a of [v3.vec3(1, 2, 3), v3.UNIT_X, v3.UNIT_Z, v3.vec3(0, -4, 0)]) {
      const p = v3.anyPerpendicular(a);
      expect(v3.length(p)).toBeCloseTo(1, 12);
      expect(v3.dot(p, a)).toBeCloseTo(0, 12);
    }
    expect(v3.anyPerpendicular(v3.vec3(2, 0, 0)).z).toBe(0);
  });
});

describe('quat', () => {
  it('rotates body vectors to inertial, and back', () => {
    const q = quat.fromAxisAngle(v3.normalize(v3.vec3(1, 2, -1)), 0.9);
    const b = v3.vec3(0.3, -2, 1.5);
    close(quat.rotateInverse(q, quat.rotate(q, b)), b);
    expect(v3.length(quat.rotate(q, b))).toBeCloseTo(v3.length(b), 12);
    close(quat.rotate(quat.fromYaw(Math.PI / 2), v3.UNIT_X), v3.UNIT_Y, 1e-15);
    // A pitch about +y turns +x toward −z (right-handed).
    close(quat.rotate(quat.fromAxisAngle(v3.UNIT_Y, Math.PI / 2), v3.UNIT_X), v3.neg(v3.UNIT_Z));
  });

  it('composes as apply-right-first and matches its rotation matrix', () => {
    const a = quat.fromAxisAngle(v3.UNIT_Z, 0.5);
    const b = quat.fromAxisAngle(v3.UNIT_X, -1.2);
    const p = v3.vec3(1, 2, 3);
    close(quat.rotate(quat.multiply(a, b), p), quat.rotate(a, quat.rotate(b, p)));
    const m = quat.toMatrix(a);
    close(
      { x: m[0] * p.x + m[1] * p.y + m[2] * p.z, y: m[3] * p.x + m[4] * p.y + m[5] * p.z, z: p.z },
      quat.rotate(a, p),
    );
    sameRotation(quat.fromMatrix(quat.toMatrix(quat.multiply(a, b))), quat.multiply(a, b));
    close(quat.axisX(b), quat.rotate(b, v3.UNIT_X));
    close(quat.axisY(b), quat.rotate(b, v3.UNIT_Y));
    close(quat.axisZ(b), quat.rotate(b, v3.UNIT_Z));
  });

  it('carries a planar attitude as a yaw', () => {
    for (const yaw of [0, 0.3, -2.5, Math.PI, 3.1]) {
      expect(quat.yawOf(quat.fromYaw(yaw))).toBeCloseTo(yaw, 14);
      const r = quat.toRotationVector(quat.fromYaw(yaw));
      expect(r.x).toBe(0);
      expect(r.y).toBe(0);
      expect(r.z).toBeCloseTo(yaw, 14);
    }
    expect(quat.yawOf(quat.fromYaw(-3.1))).toBeCloseTo(-3.1, 14);
  });

  it('round-trips rotation vectors, including small and half-turn rotations', () => {
    for (const r of [
      v3.vec3(0.2, -0.5, 1.1),
      v3.vec3(1e-9, 0, 0),
      v3.ZERO,
      v3.vec3(0, Math.PI, 0),
    ]) {
      const back = quat.toRotationVector(quat.fromRotationVector(r));
      close(back, r, 1e-12);
    }
    // q and −q are the same attitude.
    const q = quat.fromRotationVector(v3.vec3(0.4, 0.1, -0.2));
    close(quat.toRotationVector({ w: -q.w, x: -q.x, y: -q.y, z: -q.z }), quat.toRotationVector(q));
  });

  it('finds the shortest arc, also for opposite vectors', () => {
    const from = v3.normalize(v3.vec3(1, 1, 0));
    const to = v3.normalize(v3.vec3(-1, 0.2, 2));
    close(quat.rotate(quat.shortestArc(from, to), from), to);
    const flip = quat.shortestArc(v3.UNIT_X, v3.neg(v3.UNIT_X));
    close(quat.rotate(flip, v3.UNIT_X), v3.neg(v3.UNIT_X));
    // A planar reversal turns about z.
    expect(Math.abs(flip.z)).toBeCloseTo(1, 12);
  });

  it('points the body axis along a direction with roll held', () => {
    const current = quat.fromAxisAngle(v3.normalize(v3.vec3(0.2, 1, 0.1)), 0.6);
    const direction = v3.vec3(-2, 1, 3);
    const pointed = quat.pointAlong(current, direction);
    close(quat.axisX(pointed), v3.normalize(direction));
    // The turn's axis is perpendicular to both the old and the new body axis: no roll added.
    const turn = quat.multiply(pointed, quat.conjugate(current));
    const axis = v3.normalize(v3.vec3(turn.x, turn.y, turn.z));
    expect(v3.dot(axis, quat.axisX(current))).toBeCloseTo(0, 12);
    expect(v3.dot(axis, quat.axisX(pointed))).toBeCloseTo(0, 12);
    // Planar inputs give exactly the planar answer.
    expect(quat.pointAlong(quat.fromYaw(0.4), v3.vec3(-3, 2))).toEqual(
      quat.fromYaw(Math.atan2(2, -3)),
    );
    expect(quat.pointAlong(current, v3.ZERO)).toBe(current);
  });

  it('integrates a constant body rate exactly', () => {
    const omega = v3.vec3(0.01, -0.02, 0.03);
    let q: Quat = quat.fromYaw(0.2);
    for (let i = 0; i < 100; i++) q = quat.integrateBodyRate(q, omega, 0.5);
    sameRotation(q, quat.integrateBodyRate(quat.fromYaw(0.2), omega, 50), 1e-12);
    expect(quat.norm(q)).toBeCloseTo(1, 14);
    // A yaw rate advances the yaw.
    expect(
      quat.yawOf(quat.integrateBodyRate(quat.fromYaw(0.2), v3.vec3(0, 0, 0.1), 3)),
    ).toBeCloseTo(0.5, 14);
  });

  it('interpolates along the shorter way', () => {
    const a = quat.fromYaw(0.2);
    const b = quat.fromYaw(1.0);
    expect(quat.yawOf(quat.slerp(a, b, 0.25))).toBeCloseTo(0.4, 12);
    sameRotation(quat.slerp(a, { w: -b.w, x: -b.x, y: -b.y, z: -b.z }, 1), b);
  });
});

describe('sym3', () => {
  it('finds principal axes and rebuilds the matrix from them', () => {
    const m: sym3.Sym3 = [5, 1.2, -0.7, 9, 2.1, 4];
    const p = sym3.principalAxes(m);
    const back = sym3.fromPrincipal(p.values, p.axes);
    for (let i = 0; i < 6; i++) expect(back[i]).toBeCloseTo(m[i] as number, 12);
    expect(p.values.x + p.values.y + p.values.z).toBeCloseTo(sym3.traceSym3(m), 12);
    // Each axis is an eigenvector.
    for (const [axis, value] of [
      [quat.axisX(p.axes), p.values.x],
      [quat.axisY(p.axes), p.values.y],
      [quat.axisZ(p.axes), p.values.z],
    ] as const) {
      close(sym3.mulSym3(m, axis), v3.scale(axis, value), 1e-10);
    }
  });

  it('stays at the identity for a diagonal matrix and keeps z when xz = yz = 0', () => {
    const diagonal = sym3.principalAxes([3, 0, 0, 7, 0, 5]);
    expect(diagonal.axes).toEqual(quat.IDENTITY);
    expect(diagonal.values).toEqual({ x: 3, y: 7, z: 5 });
    const planar = sym3.principalAxes([3, 0.8, 0, 7, 0, 5]);
    expect(planar.values.z).toBe(5);
    expect(planar.axes.x).toBe(0);
    expect(planar.axes.y).toBe(0);
    // The zz term of an identity-axes inertia is its z moment, exactly.
    expect(sym3.fromPrincipal({ x: 1.5, y: 2.5, z: 123.456 }, quat.IDENTITY)[5]).toBe(123.456);
  });

  it('sums point masses by the parallel-axis theorem', () => {
    // Two 1 kg masses 2 m apart on x: no inertia about x, 2 kg·m² about y and z.
    const tensor = sym3.addSym3(
      sym3.pointInertia(1, v3.vec3(1, 0, 0)),
      sym3.pointInertia(1, v3.vec3(-1, 0, 0)),
    );
    // Compare by value: the products of inertia are zeros of either sign.
    expect(tensor.map((term) => term + 0)).toEqual([0, 0, 0, 2, 0, 2]);
    expect(sym3.quadSym3(tensor, v3.UNIT_Z)).toBe(2);
    // Rotating the pair onto z moves the zero moment to z.
    const turned = sym3.rotateSym3(tensor, quat.fromAxisAngle(v3.UNIT_Y, Math.PI / 2));
    expect(turned[0]).toBeCloseTo(2, 12);
    expect(turned[5]).toBeCloseTo(0, 12);
  });
});

describe('DeepReadonly', () => {
  it('keeps tuple shapes', () => {
    // Compile-time check: a frozen covariance is still a six-element tuple.
    const cov: DeepReadonly<{ c: [number, number, number, number, number, number] }> = {
      c: [1, 0, 0, 1, 0, 1],
    };
    const tuple: readonly [number, number, number, number, number, number] = cov.c;
    expect(tuple).toHaveLength(6);
  });
});
