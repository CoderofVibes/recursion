"""Unit quaternions for attitude (spec revision 3, section 1).

Convention: scalar first (w, x, y, z), Hamilton product, **body to inertial**:
v_inertial = q (x) v_body (x) q*.  q and -q are the same attitude.
An independent numpy implementation of the conventions in
src/contracts/README.md. The roll-held rule (`point_along`) and its tie-break
for a 180 degree turn follow src/lib/quat.ts on purpose, so that a forecast
resolves a pointing target to the attitude the ship will fly.
"""
from __future__ import annotations

import math

import numpy as np

IDENTITY = (1.0, 0.0, 0.0, 0.0)


def normalize(q):
    q = np.asarray(q, dtype=float)
    return q / math.sqrt(float(q @ q))


def mul(a, b):
    """Hamilton product a (x) b: apply b first, then a."""
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return np.array([
        aw * bw - ax * bx - ay * by - az * bz,
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
    ])


def conj(q):
    return np.array([q[0], -q[1], -q[2], -q[3]])


def rotmat(q):
    """3x3 matrix C with v_inertial = C v_body. Columns are the body axes."""
    w, x, y, z = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ])


def rotate(q, v):
    return rotmat(q) @ np.asarray(v, dtype=float)


def canonical(q):
    """Same rotation with w >= 0 (first non-zero component positive)."""
    q = np.asarray(q, dtype=float)
    for c in q:
        if c > 0:
            return q
        if c < 0:
            return -q
    return q


def from_matrix(M):
    """Unit quaternion of a proper rotation matrix (Shepperd)."""
    M = np.asarray(M, dtype=float)
    tr = M[0, 0] + M[1, 1] + M[2, 2]
    if tr > 0:
        s = 2 * math.sqrt(tr + 1)
        q = (0.25 * s, (M[2, 1] - M[1, 2]) / s, (M[0, 2] - M[2, 0]) / s, (M[1, 0] - M[0, 1]) / s)
    elif M[0, 0] > M[1, 1] and M[0, 0] > M[2, 2]:
        s = 2 * math.sqrt(1 + M[0, 0] - M[1, 1] - M[2, 2])
        q = ((M[2, 1] - M[1, 2]) / s, 0.25 * s, (M[0, 1] + M[1, 0]) / s, (M[0, 2] + M[2, 0]) / s)
    elif M[1, 1] > M[2, 2]:
        s = 2 * math.sqrt(1 + M[1, 1] - M[0, 0] - M[2, 2])
        q = ((M[0, 2] - M[2, 0]) / s, (M[0, 1] + M[1, 0]) / s, 0.25 * s, (M[1, 2] + M[2, 1]) / s)
    else:
        s = 2 * math.sqrt(1 + M[2, 2] - M[0, 0] - M[1, 1])
        q = ((M[1, 0] - M[0, 1]) / s, (M[0, 2] + M[2, 0]) / s, (M[1, 2] + M[2, 1]) / s, 0.25 * s)
    return canonical(normalize(q))


def from_axis_angle(axis, angle):
    a = np.asarray(axis, dtype=float)
    a = a / math.sqrt(float(a @ a))
    s = math.sin(0.5 * angle)
    return np.array([math.cos(0.5 * angle), a[0] * s, a[1] * s, a[2] * s])


def from_yaw(psi):
    """Planar attitude: rotation by psi about +z."""
    return np.array([math.cos(0.5 * psi), 0.0, 0.0, math.sin(0.5 * psi)])


def from_rotvec(v):
    v = np.asarray(v, dtype=float)
    ang = math.sqrt(float(v @ v))
    if ang < 1e-12:
        return normalize([1.0, 0.5 * v[0], 0.5 * v[1], 0.5 * v[2]])
    k = math.sin(0.5 * ang) / ang
    return np.array([math.cos(0.5 * ang), v[0] * k, v[1] * k, v[2] * k])


def to_rotvec(q):
    """Rotation vector (axis x angle, angle in [0, pi]): the star-tracker fix."""
    c = canonical(q)
    s = math.sqrt(c[1] ** 2 + c[2] ** 2 + c[3] ** 2)
    if s < 1e-12:
        return 2.0 * c[1:]
    return c[1:] * (2.0 * math.atan2(s, c[0]) / s)


def shortest_arc(a, b):
    """Smallest rotation taking unit vector a to unit vector b. For opposite
    vectors the axis is the perpendicular closest to +z (then +x, then +y), so
    a planar reversal stays a rotation about z."""
    a = np.asarray(a, dtype=float)
    b = np.asarray(b, dtype=float)
    d = float(a @ b)
    if d < -1 + 1e-12:
        if abs(a[2]) <= abs(a[0]) or abs(a[2]) <= abs(a[1]):
            helper = np.array([0.0, 0.0, 1.0])
        elif abs(a[0]) <= abs(a[1]):
            helper = np.array([1.0, 0.0, 0.0])
        else:
            helper = np.array([0.0, 1.0, 0.0])
        p = helper - float(helper @ a) * a
        p = p / math.sqrt(float(p @ p))
        return np.array([0.0, p[0], p[1], p[2]])
    c = np.cross(a, b)
    return normalize([1.0 + d, c[0], c[1], c[2]])


def point_along(q, direction):
    """Roll held (spec 3.3): the attitude that puts body +x along `direction` by
    the smallest rotation from attitude q. No roll about the line of sight is
    added. Planar inputs (q a rotation about z, direction in the x-y plane)
    return exactly from_yaw(atan2(dy, dx))."""
    d = np.asarray(direction, dtype=float)
    n = math.sqrt(float(d @ d))
    if n == 0.0:
        return np.asarray(q, dtype=float)
    if d[2] == 0.0 and q[1] == 0.0 and q[2] == 0.0:
        return from_yaw(math.atan2(d[1], d[0]))
    x_now = rotmat(q)[:, 0]
    return normalize(mul(shortest_arc(x_now, d / n), q))


def angle_between(a, b):
    d = abs(float(np.asarray(a) @ np.asarray(b)))
    return 2.0 * math.acos(min(1.0, d))
