#!/usr/bin/env python3
"""Three-dimensional extension of the Phase 1B reference (thread 2G, DECISIONS A11).

Run through the planar generator, which stays the only entry point:

    python tools/physics/generate_vectors.py --3d            validate, then write tests/vectors/physics-3d.json
    python tools/physics/generate_vectors.py --3d --check    validate, then compare byte for byte; never write
    python tools/physics/generate_vectors.py --3d --validate-only
    python tools/physics/generate_vectors.py --3d --report   nodal-precession and belt studies (several minutes)
    python tools/physics/generate_vectors.py --3d --consumer-probe   read the JSON as a consumer would; simple second-order schemes

Standard library only, no randomness, written without reference to the TypeScript simulation.
The planar path and tests/vectors/physics.json are not touched by anything in this module.
See README.md for the schema, the conventions and the meaning of the tolerances.
"""

from __future__ import annotations

import json
import math
import sys

import generate_vectors as planar


ROOT = planar.ROOT
OUTPUT = ROOT / "tests" / "vectors" / "physics-3d.json"
GM, GM2, R0, SEPARATION = planar.GM, planar.GM2, planar.R0, planar.SEPARATION
TIMES = planar.TIMES  # s; the planar checkpoints
LONG_TIMES = (0.0, 20000.0, 200000.0, 1000000.0, 2000000.0)  # s; nodal-precession case
LONG_SAMPLE = 2000.0  # s; sampling of the node longitude for the least-squares rate
SPIN_TIMES = (0.0, 10.0, 50.0, 100.0, 300.0, 600.0)  # s

# Consumer tolerances (what a tested implementation is asked to meet). Every one exceeds the
# reference's own error (recorded in reference_audit) by at least three orders of magnitude.
# The orbit tolerances were also checked against a 1 s velocity-Verlet probe (--consumer-probe),
# whose worst error is given beside each; the rigid-body tolerances are an accuracy bar, not
# a statement about a 1 s step. See README.md.
POSITION_TOL, VELOCITY_TOL = planar.POSITION_TOL, planar.VELOCITY_TOL  # 0.1 m, 1e-5 m/s (probe: 0.009 m, 2.4e-6 m/s)
CROSSING_POSITION_TOL, CROSSING_VELOCITY_TOL = 1.0, 2.0e-4  # m, m/s; passes 387 km from the primary (probe: 0.32 m, 4.8e-5 m/s)
CROSSING_JACOBI_TOL = 2.0e-2  # m^2 s^-2 (probe: 1.0e-3)
LONG_POSITION_TOL, LONG_VELOCITY_TOL = 5.0, 5.0e-4  # m, m/s; 2e6 s horizon (probe: 1.2 m, 1.4e-4 m/s)
LONG_NORMAL_TOL, LONG_ANGLE_TOL = 1.0e-7, 1.0e-7  # 1, rad (probe: 2.2e-9, 3.4e-9)
NORMAL_TOL = 1.0e-10  # 1; fixed-source orbit normal (probe: 1e-14)
NODAL_FORMULA_FRACTION = 0.10  # the first-order formula is asked to hold to 10 % at a/D = 1/4
ATTITUDE_TOL, RATE_TOL = 1.0e-5, 1.0e-7  # quaternion component (1), rad/s
SPIN_ENERGY_TOL, SPIN_MOMENTUM_TOL = 1.0e-4, 1.0e-2  # J, kg m^2 s^-1

# Limits the reference must meet against its own audits before anything is emitted.
REFERENCE_POSITION_TOL, REFERENCE_VELOCITY_TOL = planar.REFERENCE_POSITION_TOL, planar.REFERENCE_VELOCITY_TOL
LONG_REFERENCE_POSITION_TOL, LONG_REFERENCE_VELOCITY_TOL = 1.0e-3, 1.0e-7  # m, m/s at 2e6 s
SPIN_REFERENCE_ATTITUDE_TOL, SPIN_REFERENCE_RATE_TOL = 1.0e-10, 1.0e-12  # 1, rad/s

ORBIT_CONTROLS = {
    # name: (rtol, position atol m, velocity atol m/s, max step s)
    "baseline": (2.0e-12, 1.0e-7, 1.0e-11, 100.0),  # emitted, 20000 s cases (1B's settings)
    "refined": (2.0e-14, 1.0e-9, 1.0e-13, 50.0),  # audit of the 20000 s cases; emitted, 2e6 s case
    "long_audit": (2.0e-14, 1.0e-9, 1.0e-13, 25.0),  # audit of the 2e6 s case
    "study": (1.0e-10, 1.0e-4, 1.0e-8, 400.0),  # --report studies only (three-digit ratios)
}
SPIN_CONTROLS = {
    # name: (rtol, quaternion atol, rate atol rad/s, max step s)
    "baseline": (1.0e-13, 1.0e-14, 1.0e-17, 1.0),
    "refined": (1.0e-14, 1.0e-15, 1.0e-18, 0.5),
}
RK4_STEP, LONG_RK4_STEP, SPIN_RK4_STEP = 5.0, 10.0, 0.05  # s

# Rotations applied to planar starts: R = Rz(node) Rx(inclination) Rz(argument), angles in rad.
SINGLE_ROTATION = (math.radians(35.0), math.radians(50.0), math.radians(25.0))
BINARY_ROTATION = (math.radians(110.0), math.radians(40.0), math.radians(-35.0))
AUDIT_ROTATION = (math.radians(-75.0), math.radians(115.0), math.radians(160.0))  # never emitted
CROSSING_SHIP = ([-300000.0, 450000.0, 160000.0], [-70.0, 50.0, -90.0])  # m, m/s; barycentric
NODAL_RADIUS = R0  # m; ship's circular start about the primary
NODAL_ELEMENTS = (math.radians(40.0), math.radians(30.0), math.radians(25.0))  # node, inclination, argument

# Rigid body: moments about body x (roll), y (pitch), z (yaw), kg m^2; ship's order of magnitude.
AXISYMMETRIC_MOMENTS = (6.0e4, 5.0e5, 5.0e5)
TRIAXIAL_MOMENTS = (7.0e4, 5.5e5, 4.5e5)
SPIN_START_ATTITUDE = ((0.36, -0.48, 0.8), 1.1)  # unit axis, angle rad
AXISYMMETRIC_RATES = (0.04, 0.012, -0.009)  # rad/s, body frame
TRIAXIAL_SEED_RATES = (0.03, 0.02, 0.0)  # rad/s at t = -TRIAXIAL_SEED_TIME; zero about the intermediate axis
TRIAXIAL_SEED_TIME = 40.0  # s
TILTED_AXES = ((2.0/3.0, -1.0/3.0, 2.0/3.0), 0.35)  # principal -> body: unit axis, angle rad
TORQUE_BODY = (0.0, 40.0, 0.0)  # N m, about the pitch principal axis


# ---------------------------------------------------------------------------
# Small vector, matrix and quaternion helpers
# ---------------------------------------------------------------------------

def dot(a, b):
    return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]


def cross(a, b):
    return [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]]


def norm(a):
    return math.sqrt(dot(a, a))


def unit(a):
    length = norm(a)
    return [a[0]/length, a[1]/length, a[2]/length]


def mat_vec(m, v):
    return [m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
            m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
            m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2]]


def mat_mul(a, b):
    return [[sum(a[i][k]*b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def transpose(m):
    return [[m[j][i] for j in range(3)] for i in range(3)]


def rotation_zxz(node, inclination, argument):
    """R = Rz(node) Rx(inclination) Rz(argument): an orbit in the x-y plane becomes one of that
    inclination and node longitude, turned in its own plane by `argument` first."""
    cn, sn = math.cos(node), math.sin(node)
    ci, si = math.cos(inclination), math.sin(inclination)
    ca, sa = math.cos(argument), math.sin(argument)
    rz_node = [[cn, -sn, 0.0], [sn, cn, 0.0], [0.0, 0.0, 1.0]]
    rx = [[1.0, 0.0, 0.0], [0.0, ci, -si], [0.0, si, ci]]
    rz_argument = [[ca, -sa, 0.0], [sa, ca, 0.0], [0.0, 0.0, 1.0]]
    return mat_mul(rz_node, mat_mul(rx, rz_argument))


def rotate_state(matrix, state):
    """Rotate a flat [r(3), v(3)] * n state."""
    out = []
    for index in range(0, len(state), 3):
        out.extend(mat_vec(matrix, state[index:index+3]))
    return out


def lift(state2):
    """Planar [x, y, vx, vy] * n to [x, y, 0, vx, vy, 0] * n."""
    out = []
    for index in range(0, len(state2), 4):
        x, y, vx, vy = state2[index:index+4]
        out.extend([x, y, 0.0, vx, vy, 0.0])
    return out


def q_mul(a, b):
    """Hamilton product a * b (apply b, then a); scalar first."""
    return [a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
            a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
            a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
            a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0]]


def q_conj(q):
    return [q[0], -q[1], -q[2], -q[3]]


def q_unit(q):
    length = math.sqrt(sum(c*c for c in q))
    return [c/length for c in q]


def q_axis_angle(axis, angle):
    half = 0.5*angle
    s = math.sin(half)
    return [math.cos(half), axis[0]*s, axis[1]*s, axis[2]*s]


def q_matrix(q):
    """Rotation matrix of q: v_inertial = M v_body for an attitude quaternion."""
    w, x, y, z = q
    return [[1.0 - 2.0*(y*y + z*z), 2.0*(x*y - w*z), 2.0*(x*z + w*y)],
            [2.0*(x*y + w*z), 1.0 - 2.0*(x*x + z*z), 2.0*(y*z - w*x)],
            [2.0*(x*z - w*y), 2.0*(y*z + w*x), 1.0 - 2.0*(x*x + y*y)]]


def q_rotate(q, v):
    return mat_vec(q_matrix(q), v)


def matrix_q(m):
    """Unit quaternion of a (nearly) orthogonal matrix; largest-pivot branch."""
    trace = m[0][0] + m[1][1] + m[2][2]
    pivots = [trace, m[0][0], m[1][1], m[2][2]]
    best = pivots.index(max(pivots))
    if best == 0:
        w = math.sqrt(1.0 + trace)/2.0
        q = [w, (m[2][1] - m[1][2])/(4.0*w), (m[0][2] - m[2][0])/(4.0*w), (m[1][0] - m[0][1])/(4.0*w)]
    elif best == 1:
        x = math.sqrt(1.0 + m[0][0] - m[1][1] - m[2][2])/2.0
        q = [(m[2][1] - m[1][2])/(4.0*x), x, (m[0][1] + m[1][0])/(4.0*x), (m[0][2] + m[2][0])/(4.0*x)]
    elif best == 2:
        y = math.sqrt(1.0 - m[0][0] + m[1][1] - m[2][2])/2.0
        q = [(m[0][2] - m[2][0])/(4.0*y), (m[0][1] + m[1][0])/(4.0*y), y, (m[1][2] + m[2][1])/(4.0*y)]
    else:
        z = math.sqrt(1.0 - m[0][0] - m[1][1] + m[2][2])/2.0
        q = [(m[1][0] - m[0][1])/(4.0*z), (m[0][2] + m[2][0])/(4.0*z), (m[1][2] + m[2][1])/(4.0*z), z]
    return q_unit(q)


def q_same_sign(q, reference):
    """q or -q, whichever is nearer the reference (they are the same attitude)."""
    return q if sum(a*b for a, b in zip(q, reference)) >= 0.0 else [-c for c in q]


# ---------------------------------------------------------------------------
# Gravity: reference right-hand sides (unrolled) and the adaptive driver
# ---------------------------------------------------------------------------

def single_rhs(p):
    """Massless ship about a fixed source at the origin; state [r(3), v(3)]."""
    strength, half = planar.parameter(GM, p), (p + 1.0)/2.0

    def rhs(_t, s):
        x, y, z = s[0], s[1], s[2]
        d2 = x*x + y*y + z*z
        if d2 == 0.0:
            raise ValueError("Unsoftened point-source singularity: r = 0")
        pull = -strength/d2**half
        return [s[3], s[4], s[5], pull*x, pull*y, pull*z]
    return rhs


def binary_rhs(p, gm1=GM, gm2=GM2):
    """Primary, secondary, massless ship; state [r1, v1, r2, v2, r, v], 18 numbers."""
    k1, k2, half = planar.parameter(gm1, p), planar.parameter(gm2, p), (p + 1.0)/2.0

    def rhs(_t, s):
        x1, y1, z1, x2, y2, z2, x, y, z = s[0], s[1], s[2], s[6], s[7], s[8], s[12], s[13], s[14]
        dx, dy, dz = x2 - x1, y2 - y1, z2 - z1
        pair = 1.0/(dx*dx + dy*dy + dz*dz)**half
        ux, uy, uz = x - x1, y - y1, z - z1
        to1 = -k1/(ux*ux + uy*uy + uz*uz)**half
        wx, wy, wz = x - x2, y - y2, z - z2
        to2 = -k2/(wx*wx + wy*wy + wz*wz)**half
        return [s[3], s[4], s[5], k2*pair*dx, k2*pair*dy, k2*pair*dz,
                s[9], s[10], s[11], -k1*pair*dx, -k1*pair*dy, -k1*pair*dz,
                s[15], s[16], s[17],
                to1*ux + to2*wx, to1*uy + to2*wy, to1*uz + to2*wz]
    return rhs


def integrate(rhs, initial, times, atol, rtol, maximum):
    """Adaptive Dormand-Prince 5(4) (1B's stepper); lands exactly on each requested time.

    The right-hand sides here are autonomous, so `times` are measured from `initial`.
    """
    step, t, state, result, attempts = 1.0, 0.0, list(initial), [], 0
    for target in times:
        if target < t:
            raise ValueError("Checkpoint times must be nondecreasing and >= 0")
        while t < target:
            attempts += 1
            if attempts > 20000000:
                raise RuntimeError("Integration did not converge")
            trial = min(step, maximum, target - t)
            if trial <= 0.0 or t + trial == t:
                raise RuntimeError("Integration step underflow")
            new_state, error = planar.dp_step(rhs, t, state, trial)
            scaled = max(abs(err)/(at + rtol*max(abs(old), abs(new)))
                         for err, at, old, new in zip(error, atol, state, new_state))
            if not math.isfinite(scaled):
                raise RuntimeError("Non-finite integration error")
            if scaled <= 1.0:
                state = new_state
                t = target if trial == target - t else t + trial
            factor = 5.0 if scaled == 0.0 else min(5.0, max(0.1, 0.9*scaled**(-0.2)))
            step = min(maximum, trial*factor)
        result.append(list(state))
    return result


def integrate_orbit(rhs, initial, times, controls):
    rtol, position_atol, velocity_atol, maximum = ORBIT_CONTROLS[controls]
    atol = [position_atol if index % 6 < 3 else velocity_atol for index in range(len(initial))]
    return integrate(rhs, initial, times, atol, rtol, maximum)


# ---------------------------------------------------------------------------
# Gravity: independently coded audit (generic pair loop, classical RK4)
# ---------------------------------------------------------------------------

def audit_derivative(p, strengths, moving):
    """Written separately from the reference right-hand sides: a generic loop over sources,
    |d|^(p+1) from the distance itself (not from the squared distance), acceleration summed
    source by source. `strengths` are GM values (0 for the massless ship); `moving` is False
    for a fixed source."""
    count = len(strengths)
    coefficient = [gm*R0**(p - 2.0) for gm in strengths]

    def derivative(state):
        out = [0.0]*(6*count)
        for i in range(count):
            if not moving[i]:
                continue
            base = 6*i
            ax = ay = az = 0.0
            for j in range(count):
                if j == i or coefficient[j] == 0.0:
                    continue
                dx, dy, dz = state[6*j] - state[base], state[6*j+1] - state[base+1], state[6*j+2] - state[base+2]
                distance = math.sqrt(dx*dx + dy*dy + dz*dz)
                pull = coefficient[j]/distance**(p + 1.0)
                ax, ay, az = ax + pull*dx, ay + pull*dy, az + pull*dz
            out[base], out[base+1], out[base+2] = state[base+3], state[base+4], state[base+5]
            out[base+3], out[base+4], out[base+5] = ax, ay, az
        return out
    return derivative


def audit_rk4(derivative, initial, times, size):
    """Fixed-step classical RK4; never used to emit values."""
    state, t, result = list(initial), 0.0, []
    for target in times:
        while t < target:
            step = min(size, target - t)
            k1 = derivative(state)
            k2 = derivative([y + step*k/2.0 for y, k in zip(state, k1)])
            k3 = derivative([y + step*k/2.0 for y, k in zip(state, k2)])
            k4 = derivative([y + step*k for y, k in zip(state, k3)])
            state = [y + step*(a + 2.0*b + 2.0*c + d)/6.0 for y, a, b, c, d in zip(state, k1, k2, k3, k4)]
            t = target if step == target - t else t + step
        result.append(list(state))
    return result


def audit_orbit(record, size):
    p = record["p"]
    if record["dynamics"] == "fixed":
        derivative = audit_derivative(p, [GM, 0.0], [False, True])
        states = audit_rk4(derivative, [0.0]*6 + record["initial"], record["times"], size)
        return [state[6:] for state in states]
    derivative = audit_derivative(p, [GM, GM2, 0.0], [True, True, True])
    return audit_rk4(derivative, record["initial"], record["times"], size)


# ---------------------------------------------------------------------------
# Orbit quantities
# ---------------------------------------------------------------------------

def circular_binary(p, separation=SEPARATION, gm1=GM, gm2=GM2):
    """The planar cases' binary lifted to z = 0: [r1, v1, r2, v2] and its angular rate."""
    fraction = gm2/(gm1 + gm2)
    omega = math.sqrt(planar.parameter(gm1 + gm2, p)/separation**(p + 1.0))
    x1, x2 = -fraction*separation, (1.0 - fraction)*separation
    return [x1, 0.0, 0.0, 0.0, omega*x1, 0.0, x2, 0.0, 0.0, 0.0, omega*x2, 0.0], omega


def binary_invariants(state, p, spin):
    """Invariants of the two massive bodies (per unit total mass) and the ship's Jacobi constant.
    `spin` is the binary's angular velocity vector, rad/s."""
    r1, v1, r2, v2, r, v = (state[index:index+3] for index in range(0, 18, 3))
    w1, w2 = GM/(GM + GM2), GM2/(GM + GM2)
    distance = math.dist(r1, r2)
    energy = (w1*dot(v1, v1) + w2*dot(v2, v2))/2.0 + w1*planar.potential(distance, GM2, p)
    h1, h2 = cross(r1, v1), cross(r2, v2)
    ship_potential = planar.potential(math.dist(r, r1), GM, p) + planar.potential(math.dist(r, r2), GM2, p)
    jacobi = -2.0*ship_potential - dot(v, v) + 2.0*dot(spin, cross(r, v))
    return {
        "binary_specific_energy": energy,
        "binary_specific_angular_momentum": [w1*a + w2*b for a, b in zip(h1, h2)],
        "binary_barycenter": [w1*a + w2*b for a, b in zip(r1, r2)],
        "binary_barycentric_velocity": [w1*a + w2*b for a, b in zip(v1, v2)],
        "ship_jacobi_constant": jacobi,
    }


def about_primary(state):
    """Osculating orbit normal, node longitude and inclination of the ship about the primary."""
    rho = [state[12+k] - state[k] for k in range(3)]
    u = [state[15+k] - state[3+k] for k in range(3)]
    normal = unit(cross(rho, u))
    return normal, math.atan2(normal[0], -normal[1]), math.acos(max(-1.0, min(1.0, normal[2]))), norm(rho)


def about_body(state, body):
    """As about_primary, about either body (0 primary, 1 secondary)."""
    rho = [state[12+k] - state[6*body+k] for k in range(3)]
    u = [state[15+k] - state[6*body+3+k] for k in range(3)]
    normal = unit(cross(rho, u))
    return math.atan2(normal[0], -normal[1]), math.acos(max(-1.0, min(1.0, normal[2]))), norm(rho)


def wrap(angle):
    """Into (-pi, pi]."""
    while angle > math.pi:
        angle -= 2.0*math.pi
    while angle <= -math.pi:
        angle += 2.0*math.pi
    return angle


def nodal_rate_first_order(p, gm_center, gm_perturber, radius, separation, inclination):
    """Secular node rate of a circular orbit, rad/s; negative is regression. Derivation section 11.4."""
    orbit_rate = math.sqrt(planar.parameter(gm_center, p)/radius**(p + 1.0))
    return -(p + 1.0)*planar.parameter(gm_perturber, p)*math.cos(inclination)/(4.0*orbit_rate*separation**(p + 1.0))


def nodal_rate_second_order_factor(p, radius, separation, inclination):
    """1 + next term of the multipole series in (radius/separation)^2. Derivation section 11.4."""
    c2 = math.cos(inclination)**2
    return 1.0 + (p + 3.0)*((p + 5.0)*(1.0 + 3.0*c2) - 16.0)*(radius/separation)**2/32.0


def least_squares_slope(times, values):
    count = len(times)
    mean_t, mean_v = sum(times)/count, sum(values)/count
    return sum((t - mean_t)*(v - mean_v) for t, v in zip(times, values))/sum((t - mean_t)**2 for t in times)


def unwrapped(angles):
    out = [angles[0]]
    for angle in angles[1:]:
        out.append(out[-1] + wrap(angle - out[-1]))
    return out


def plane_crossings(rhs, initial, horizon, controls="baseline", sample=100.0):
    """Times at which the ship's z changes sign, by bisection on restarted integrations."""
    times = [sample*index for index in range(int(horizon/sample) + 1)]
    states = integrate_orbit(rhs, initial, times, controls)
    found = []
    for (t_a, s_a), s_b in zip(zip(times, states), states[1:]):
        if s_a[14] == 0.0 or s_a[14]*s_b[14] > 0.0:
            continue
        low, high = 0.0, sample
        for _ in range(60):
            middle = (low + high)/2.0
            z = integrate_orbit(rhs, s_a, [middle], controls)[0][14]
            if z*s_a[14] > 0.0:
                low = middle
            else:
                high = middle
        found.append({"t": t_a + (low + high)/2.0, "direction": "descending" if s_a[14] > 0.0 else "ascending"})
    return found


# ---------------------------------------------------------------------------
# Rigid body: reference, closed forms and the independently formulated audit
# ---------------------------------------------------------------------------

def spin_rhs(moments, torque):
    """Euler's equations in the principal frame (= body frame here) with the quaternion
    kinematics qdot = q (0, omega)/2. State [w, x, y, z, omega_x, omega_y, omega_z]."""
    i1, i2, i3 = moments
    t1, t2, t3 = torque

    def rhs(_t, s):
        w, x, y, z, a, b, c = s
        return [0.5*(-x*a - y*b - z*c),
                0.5*(w*a + y*c - z*b),
                0.5*(w*b + z*a - x*c),
                0.5*(w*c + x*b - y*a),
                ((i2 - i3)*b*c + t1)/i1,
                ((i3 - i1)*c*a + t2)/i2,
                ((i1 - i2)*a*b + t3)/i3]
    return rhs


def integrate_spin(moments, torque, attitude, rates, times, controls):
    rtol, attitude_atol, rate_atol, maximum = SPIN_CONTROLS[controls]
    atol = [attitude_atol]*4 + [rate_atol]*3
    states = integrate(spin_rhs(moments, torque), list(attitude) + list(rates), times, atol, rtol, maximum)
    return [(q_unit(state[:4]), state[4:]) for state in states]


def symmetric_inverse(j):
    a, b, c, d, e, f = j[0][0], j[0][1], j[0][2], j[1][1], j[1][2], j[2][2]
    determinant = a*(d*f - e*e) - b*(b*f - e*c) + c*(b*e - d*c)
    return [[(d*f - e*e)/determinant, (c*e - b*f)/determinant, (b*e - c*d)/determinant],
            [(c*e - b*f)/determinant, (a*f - c*c)/determinant, (b*c - a*e)/determinant],
            [(b*e - c*d)/determinant, (b*c - a*e)/determinant, (a*d - b*b)/determinant]]


def audit_spin(tensor, torque, attitude, rates, times, size=SPIN_RK4_STEP):
    """Independent formulation: the state is the rotation matrix R (body to inertial) and the
    inertial angular momentum L. Rdot = R [omega]x with omega = J^-1 R^T L; Ldot = R torque.
    No quaternion and no Euler equation is integrated; J may be any symmetric tensor in body
    axes. Fixed-step classical RK4. Returns (quaternion, body rates) at each time."""
    inverse = symmetric_inverse(tensor)
    rotation = q_matrix(attitude)
    momentum = mat_vec(rotation, mat_vec(tensor, list(rates)))
    state = [rotation[i][j] for i in range(3) for j in range(3)] + momentum

    def body_rates(s):
        r = [s[0:3], s[3:6], s[6:9]]
        return mat_vec(inverse, mat_vec(transpose(r), s[9:12]))

    def derivative(s):
        r = [s[0:3], s[3:6], s[6:9]]
        wx, wy, wz = mat_vec(inverse, mat_vec(transpose(r), s[9:12]))
        out = []
        for row in r:
            out.extend([row[1]*wz - row[2]*wy, row[2]*wx - row[0]*wz, row[0]*wy - row[1]*wx])
        out.extend(mat_vec(r, list(torque)))
        return out

    result = []
    for s in audit_rk4(derivative, state, times, size):
        result.append((matrix_q([s[0:3], s[3:6], s[6:9]]), body_rates(s)))
    return result


def axisymmetric_closed_form(moments, attitude, rates, t):
    """Torque-free body symmetric about body x. Derivation section 11.6: the attitude is a steady
    precession about the fixed angular momentum composed with a steady spin about the body axis,
    q(t) = q(L_hat, |L| t / I_t) * q(0) * q(x_hat, (I_t - I_a) omega_x t / I_t)."""
    axial, transverse = moments[0], moments[1]
    if moments[1] != moments[2]:
        raise ValueError("Closed form needs equal moments about body y and z")
    momentum = q_rotate(attitude, [axial*rates[0], transverse*rates[1], transverse*rates[2]])
    precession = norm(momentum)/transverse
    relative = (transverse - axial)*rates[0]/transverse
    q = q_mul(q_mul(q_axis_angle(unit(momentum), precession*t), list(attitude)),
              q_axis_angle([1.0, 0.0, 0.0], relative*t))
    c, s = math.cos(relative*t), math.sin(relative*t)
    return q, [rates[0], rates[1]*c + rates[2]*s, rates[2]*c - rates[1]*s]


def jacobi_elliptic(u, m):
    """sn, cn, dn of argument u and parameter m = k^2 (0 <= m < 1) by the arithmetic-geometric
    mean (descending Landen) recurrence."""
    if not 0.0 <= m < 1.0:
        raise ValueError("Parameter m must lie in [0, 1)")
    a, b, c = [1.0], math.sqrt(1.0 - m), [math.sqrt(m)]
    while abs(c[-1]) > 4.0e-16*a[-1]:  # quadratic convergence; a few rounds reach rounding
        if len(a) > 40:
            raise RuntimeError("Arithmetic-geometric mean did not converge")
        a_next, c_next, b = (a[-1] + b)/2.0, (a[-1] - b)/2.0, math.sqrt(a[-1]*b)
        a.append(a_next)
        c.append(c_next)
    phi = 2.0**(len(a) - 1)*a[-1]*u
    for index in range(len(a) - 1, 0, -1):
        phi = (phi + math.asin(c[index]*math.sin(phi)/a[index]))/2.0
    sn = math.sin(phi)
    return sn, math.cos(phi), math.sqrt(1.0 - m*sn*sn)


def triaxial_rates(moments, start, t):
    """Torque-free body rates in the principal frame for a start with no rate about the
    intermediate axis: Jacobi elliptic functions. Derivation section 11.6."""
    low, middle, high = sorted(range(3), key=lambda index: moments[index])
    i1, i2, i3 = moments[low], moments[middle], moments[high]
    if start[middle] != 0.0:
        raise ValueError("Closed form is written for zero initial rate about the intermediate axis")
    twice_energy = sum(i*w*w for i, w in zip(moments, start))
    momentum2 = sum((i*w)**2 for i, w in zip(moments, start))
    if momentum2 > twice_energy*i2:  # circulates about the axis of greatest moment
        steady, swing = high, low
        rate = math.sqrt((i3 - i2)*(momentum2 - twice_energy*i1)/(i1*i2*i3))
        m = (i2 - i1)*(twice_energy*i3 - momentum2)/((i3 - i2)*(momentum2 - twice_energy*i1))
        amplitude = math.sqrt((twice_energy*i3 - momentum2)/(i2*(i3 - i2)))
    else:  # circulates about the axis of least moment
        steady, swing = low, high
        rate = math.sqrt((i2 - i1)*(twice_energy*i3 - momentum2)/(i1*i2*i3))
        m = (i3 - i2)*(momentum2 - twice_energy*i1)/((i2 - i1)*(twice_energy*i3 - momentum2))
        amplitude = math.sqrt((momentum2 - twice_energy*i1)/(i2*(i2 - i1)))
    sn, cn, dn = jacobi_elliptic(rate*t, m)
    j, k = (middle + 1) % 3, (middle + 2) % 3
    slope = (moments[j] - moments[k])*start[j]*start[k]/moments[middle]  # Euler's equation at t = 0
    out = [0.0, 0.0, 0.0]
    out[steady], out[swing], out[middle] = start[steady]*dn, start[swing]*cn, math.copysign(amplitude, slope)*sn
    return out, {"modulus_squared": m, "rate": rate}


def spin_invariants(tensor, attitude, rates):
    momentum_body = mat_vec(tensor, list(rates))
    return 0.5*dot(list(rates), momentum_body), q_rotate(attitude, momentum_body)


def diagonal(moments):
    return [[moments[0], 0.0, 0.0], [0.0, moments[1], 0.0], [0.0, 0.0, moments[2]]]


# ---------------------------------------------------------------------------
# Cases
# ---------------------------------------------------------------------------

def expectation(quantity, time, value, tolerance, unit_name, **extra):
    return planar.expectation(quantity, time, value, tolerance, unit_name, **extra)


def rotation_json(angles, applied_to):
    node, inclination, argument = angles
    return {"sequence": "R = Rz(node) * Rx(inclination) * Rz(argument); active; every position and velocity of the planar start (z = 0) is multiplied by R",
            "node_rad": node, "inclination_rad": inclination, "argument_rad": argument,
            "matrix": rotation_zxz(*angles), "planar_case": applied_to}


def bodies_json(state):
    return [{"id": "primary", "GM": GM, "r": state[0:3], "v": state[3:6]},
            {"id": "secondary", "GM": GM2, "r": state[6:9], "v": state[9:12]}]


def binary_expectations(t, state, invariants, position_tol, velocity_tol, jacobi_tol):
    check = [expectation("position", t, state[12:15], position_tol, "m"),
             expectation("velocity", t, state[15:18], velocity_tol, "m s^-1")]
    for index, body in enumerate(("primary", "secondary")):
        check.extend([
            expectation("body_position", t, state[6*index:6*index+3], POSITION_TOL, "m", body=body),
            expectation("body_velocity", t, state[6*index+3:6*index+6], VELOCITY_TOL, "m s^-1", body=body),
        ])
    for quantity, value in invariants.items():
        if "barycenter" in quantity:
            tolerance, unit_name = 1e-5, "m"
        elif "barycentric_velocity" in quantity:
            tolerance, unit_name = 1e-10, "m s^-1"
        elif "angular_momentum" in quantity:
            tolerance, unit_name = 1e-3, "m^2 s^-1"
        elif "jacobi" in quantity:
            tolerance, unit_name = jacobi_tol, "m^2 s^-2"
        else:
            tolerance, unit_name = 2e-3, "m^2 s^-2"
        check.append(expectation(quantity, t, value, tolerance, unit_name))
    return check


def single_inclined_case(p):
    matrix = rotation_zxz(*SINGLE_ROTATION)
    planar_start = [R0, 0.0, 0.0, 90.0]
    initial = rotate_state(matrix, lift(planar_start))
    states = integrate_orbit(single_rhs(p), initial, TIMES, "baseline")
    energy = planar.energy_single(planar_start, p)
    momentum = mat_vec(matrix, [0.0, 0.0, planar.h_single(planar_start)])
    normal = mat_vec(matrix, [0.0, 0.0, 1.0])
    check = []
    for t, state in zip(TIMES, states):
        check.extend([
            expectation("position", t, state[0:3], POSITION_TOL, "m"),
            expectation("velocity", t, state[3:6], VELOCITY_TOL, "m s^-1"),
            expectation("specific_energy", t, energy, 2e-3, "m^2 s^-2"),
            expectation("specific_angular_momentum", t, momentum, 1e-3, "m^2 s^-1"),
            expectation("orbit_normal", t, normal, NORMAL_TOL, "1"),
        ])
    case = {"id": f"inclined-single-{planar.slug(p)}",
            "description": "The planar single-source eccentric start rotated to 50 deg inclination with node 35 deg and in-plane turn 25 deg, so no component is zero; fixed point source at the origin. The orbit stays in its plane.",
            "kind": "trajectory", "claim_status": "offline numerical reference; not a game demonstration",
            "law": planar.law(p), "initial": {"r": initial[0:3], "v": initial[3:6]},
            "source_dynamics": "fixed_origin",
            "rotation": rotation_json(SINGLE_ROTATION, f"single-{planar.slug(p)}"),
            "expect": check}
    record = {"id": case["id"], "group": "short", "p": p, "dynamics": "fixed", "initial": initial,
              "times": TIMES, "states": states, "matrix": matrix}
    return case, record


def binary_crossing_case(p):
    bodies, omega = circular_binary(p)
    initial = bodies + CROSSING_SHIP[0] + CROSSING_SHIP[1]
    spin = [0.0, 0.0, omega]
    states = integrate_orbit(binary_rhs(p), initial, TIMES, "baseline")
    crossings = plane_crossings(binary_rhs(p), initial, TIMES[-1])
    invariants = binary_invariants(initial, p, spin)
    check = []
    for t, state in zip(TIMES, states):
        check.extend(binary_expectations(t, state, invariants, CROSSING_POSITION_TOL, CROSSING_VELOCITY_TOL, CROSSING_JACOBI_TOL))
    case = {"id": f"binary-crossing-{planar.slug(p)}",
            "description": "The planar cases' mutually orbiting binary in the x-y plane (barycentric) with a massless ship that starts 160 km above the plane moving down and crosses the plane at least twice in the run.",
            "kind": "trajectory", "claim_status": "offline numerical reference; not a game demonstration",
            "law": planar.law(p),
            "initial": {"bodies": bodies_json(initial), "r": initial[12:15], "v": initial[15:18]},
            "source_dynamics": "mutual_binary_massless_ship",
            "binary_angular_frequency": omega, "binary_angular_velocity": spin,
            "plane_crossings": crossings,
            "expect": check}
    record = {"id": case["id"], "group": "short", "p": p, "dynamics": "binary", "initial": initial,
              "times": TIMES, "states": states, "spin": spin, "omega": omega, "crossings": crossings,
              "matrix": None}
    return case, record


def binary_inclined_case(p):
    matrix = rotation_zxz(*BINARY_ROTATION)
    planar_initial, omega = planar.binary_initial(p)
    initial = rotate_state(matrix, lift(planar_initial))
    spin = mat_vec(matrix, [0.0, 0.0, omega])
    states = integrate_orbit(binary_rhs(p), initial, TIMES, "baseline")
    invariants = binary_invariants(initial, p, spin)
    check = []
    for t, state in zip(TIMES, states):
        check.extend(binary_expectations(t, state, invariants, POSITION_TOL, VELOCITY_TOL, 2e-3))
    case = {"id": f"binary-inclined-{planar.slug(p)}",
            "description": "The planar binary case (both bodies and the ship) rotated as one, so the binary's orbit plane is inclined 40 deg to the x-y plane with node 110 deg and every body moves in z. The ship stays in the binary's plane.",
            "kind": "trajectory", "claim_status": "offline numerical reference; not a game demonstration",
            "law": planar.law(p),
            "initial": {"bodies": bodies_json(initial), "r": initial[12:15], "v": initial[15:18]},
            "source_dynamics": "mutual_binary_massless_ship",
            "binary_angular_frequency": omega, "binary_angular_velocity": spin,
            "rotation": rotation_json(BINARY_ROTATION, f"binary-{planar.slug(p)}"),
            "expect": check}
    record = {"id": case["id"], "group": "short", "p": p, "dynamics": "binary", "initial": initial,
              "times": TIMES, "states": states, "spin": spin, "omega": omega, "matrix": matrix}
    return case, record


def nodal_start(p, radius, elements, separation=SEPARATION, about=0, gm1=GM, gm2=GM2):
    """Binary in the x-y plane plus a ship on the unperturbed circular orbit of `radius` about
    one body, with the given node longitude, inclination and in-plane angle from the node."""
    bodies, omega = circular_binary(p, separation, gm1, gm2)
    center_gm = gm1 if about == 0 else gm2
    speed = math.sqrt(planar.parameter(center_gm, p)*radius**(1.0 - p))
    relative = rotate_state(rotation_zxz(*elements), [radius, 0.0, 0.0, 0.0, speed, 0.0])
    center = bodies[6*about:6*about+6]
    return bodies + [c + d for c, d in zip(center, relative)], omega


def nodal_case(p):
    initial, omega = nodal_start(p, NODAL_RADIUS, NODAL_ELEMENTS)
    spin = [0.0, 0.0, omega]
    sample_times = [LONG_SAMPLE*index for index in range(int(LONG_TIMES[-1]/LONG_SAMPLE) + 1)]
    samples = integrate_orbit(binary_rhs(p), initial, sample_times, "refined")
    states = [samples[int(t/LONG_SAMPLE)] for t in LONG_TIMES]
    invariants = binary_invariants(initial, p, spin)
    node_samples = unwrapped([about_primary(state)[1] for state in samples])
    inclinations = [about_primary(state)[2] for state in samples]
    radii = [about_primary(state)[3] for state in samples]
    duration = LONG_TIMES[-1]
    end_to_end = wrap(node_samples[-1] - node_samples[0])/duration
    fitted = least_squares_slope(sample_times, node_samples)
    first_order = nodal_rate_first_order(p, GM, GM2, NODAL_RADIUS, SEPARATION, NODAL_ELEMENTS[1])
    second_order = first_order*nodal_rate_second_order_factor(p, NODAL_RADIUS, SEPARATION, NODAL_ELEMENTS[1])
    check = []
    for t, state in zip(LONG_TIMES, states):
        check.extend(binary_expectations(t, state, invariants, LONG_POSITION_TOL, LONG_VELOCITY_TOL, 2e-3))
        normal, node, inclination, _ = about_primary(state)
        check.extend([
            expectation("ship_orbit_normal_about_primary", t, normal, LONG_NORMAL_TOL, "1"),
            expectation("ship_node_longitude_about_primary", t, node, LONG_ANGLE_TOL, "rad"),
            expectation("ship_inclination_about_primary", t, inclination, LONG_ANGLE_TOL, "rad"),
        ])
    check.append(expectation("ship_mean_nodal_rate_about_primary", duration, first_order,
                             NODAL_FORMULA_FRACTION*abs(first_order), "rad s^-1",
                             basis="first-order secular formula -(p+1)*K2*cos(i)/(4*Omega*D^(p+1)); the tolerance is 10 % of it, see nodal_precession"))
    case = {"id": f"nodal-precession-{planar.slug(p)}",
            "description": "The binary in the x-y plane with a massless ship started on the unperturbed circular orbit of radius r0 about the primary, inclined 30 deg to the binary plane, node 40 deg. Long enough (2e6 s, about 32 ship orbits) for the secondary to turn the orbit's node by a measurable angle.",
            "kind": "trajectory", "claim_status": "offline numerical reference; not a game demonstration",
            "law": planar.law(p),
            "initial": {"bodies": bodies_json(initial), "r": initial[12:15], "v": initial[15:18]},
            "source_dynamics": "mutual_binary_massless_ship",
            "binary_angular_frequency": omega, "binary_angular_velocity": spin,
            "orbit_about_primary": {"radius": NODAL_RADIUS, "node_rad": NODAL_ELEMENTS[0],
                                    "inclination_rad": NODAL_ELEMENTS[1], "argument_rad": NODAL_ELEMENTS[2],
                                    "relative_speed": math.sqrt(planar.parameter(GM, p)*NODAL_RADIUS**(1.0 - p))},
            "nodal_precession": {
                "first_order_rate": first_order,
                "second_order_rate": second_order,
                "reference_end_to_end_rate": end_to_end,
                "reference_least_squares_rate": fitted,
                "end_to_end_over_first_order": round(end_to_end/first_order, 4),
                "least_squares_over_first_order": round(fitted/first_order, 4),
                "least_squares_over_second_order": round(fitted/second_order, 4),
                "least_squares_sampling_s": LONG_SAMPLE,
                "inclination_range_rad": [min(inclinations), max(inclinations)],
                "distance_range_m": [min(radii), max(radii)],
                "unit": "rad s^-1; negative is regression (the node moves against the orbit)",
                "note": "The osculating node also oscillates at twice the binary's rate relative to the node, so the end-to-end value depends on where the run stops; the least-squares slope over the samples is the steadier measure. The expectation compares the end-to-end value because a consumer can form it from two states.",
            },
            "expect": check}
    record = {"id": case["id"], "group": "long", "p": p, "dynamics": "binary", "initial": initial,
              "times": LONG_TIMES, "states": states, "spin": spin, "omega": omega, "matrix": None,
              "first_order": first_order, "end_to_end": end_to_end, "fitted": fitted,
              "inclinations": inclinations}
    return case, record


def spin_expectations(times, solution, energy_at, momentum_at):
    check = []
    for t, (attitude, rates) in zip(times, solution):
        check.extend([
            expectation("attitude", t, attitude, ATTITUDE_TOL, "1"),
            expectation("angular_velocity", t, rates, RATE_TOL, "rad s^-1"),
            expectation("rotational_energy", t, energy_at(t), SPIN_ENERGY_TOL, "J"),
            expectation("angular_momentum_inertial", t, momentum_at(t), SPIN_MOMENTUM_TOL, "kg m^2 s^-1"),
        ])
    return check


def spin_case_json(case_id, description, moments, axes, tensor, attitude, rates, torque, check, extra=None):
    case = {"id": case_id, "description": description, "kind": "rigid_body",
            "claim_status": "offline reference for torque and attitude kinematics; not a game demonstration",
            "law": None,
            "inertia": {"moments": list(moments), "axes": list(axes)},
            "inertia_tensor_body": tensor,
            "torque_body": list(torque),
            "initial": {"attitude": list(attitude), "angular_velocity": list(rates)},
            "expect": check}
    if extra:
        case.update(extra)
    return case


def spin_start_attitude():
    return q_axis_angle(*SPIN_START_ATTITUDE)


def axisymmetric_case():
    moments, attitude, rates = AXISYMMETRIC_MOMENTS, spin_start_attitude(), AXISYMMETRIC_RATES
    solution = [axisymmetric_closed_form(moments, attitude, rates, t) for t in SPIN_TIMES]
    energy, momentum = spin_invariants(diagonal(moments), attitude, rates)
    check = spin_expectations(SPIN_TIMES, solution, lambda _t: energy, lambda _t: momentum)
    axial, transverse = moments[0], moments[1]
    extra = {"closed_form": {
        "attitude": "q(t) = q(L_hat, precession_rate*t) * q(0) * q(body x, relative_spin_rate*t), with q(axis, angle) = [cos(angle/2), sin(angle/2)*axis]",
        "precession_rate": norm(momentum)/transverse,
        "relative_spin_rate": (transverse - axial)*rates[0]/transverse,
        "angular_momentum_direction_inertial": unit(momentum),
        "unit": "rad s^-1"}}
    case = spin_case_json("spin-axisymmetric",
                          "Torque-free body symmetric about body x (roll 6e4, pitch = yaw 5e5 kg m^2): steady precession. Values are the closed form.",
                          moments, [1.0, 0.0, 0.0, 0.0], diagonal(moments), attitude, rates, (0.0, 0.0, 0.0), check, extra)
    record = {"id": case["id"], "kind": "axisymmetric", "moments": moments, "tensor": diagonal(moments),
              "torque": (0.0, 0.0, 0.0), "attitude": attitude, "rates": rates, "solution": solution,
              "energy": lambda _t: energy, "momentum": lambda _t: momentum, "numeric": False}
    return case, record


def triaxial_start():
    rates, parameters = triaxial_rates(TRIAXIAL_MOMENTS, TRIAXIAL_SEED_RATES, TRIAXIAL_SEED_TIME)
    return rates, parameters


def triaxial_case():
    moments, attitude = TRIAXIAL_MOMENTS, spin_start_attitude()
    rates, parameters = triaxial_start()
    solution = integrate_spin(moments, (0.0, 0.0, 0.0), attitude, rates, SPIN_TIMES, "baseline")
    energy, momentum = spin_invariants(diagonal(moments), attitude, rates)
    check = spin_expectations(SPIN_TIMES, solution, lambda _t: energy, lambda _t: momentum)
    extra = {"body_rate_closed_form": {
        "note": "The initial rates are the Jacobi-elliptic solution at seed_time after a start with zero rate about the intermediate (yaw) axis, so the body rates at t are that solution at t + seed_time. The attitude has no elementary closed form and is numerical.",
        "seed_angular_velocity": list(TRIAXIAL_SEED_RATES), "seed_time": TRIAXIAL_SEED_TIME,
        "modulus_squared": parameters["modulus_squared"], "argument_rate": parameters["rate"]}}
    case = spin_case_json("spin-triaxial",
                          "Torque-free triaxial body (roll 7e4, pitch 5.5e5, yaw 4.5e5 kg m^2) tumbling near the unstable intermediate (yaw) axis; body axes are principal. High-accuracy numerical reference.",
                          moments, [1.0, 0.0, 0.0, 0.0], diagonal(moments), attitude, rates, (0.0, 0.0, 0.0), check, extra)
    record = {"id": case["id"], "kind": "triaxial", "moments": moments, "tensor": diagonal(moments),
              "torque": (0.0, 0.0, 0.0), "attitude": attitude, "rates": rates, "solution": solution,
              "energy": lambda _t: energy, "momentum": lambda _t: momentum, "numeric": True}
    return case, record


def tilted_case(triaxial_record):
    """The same motion as spin-triaxial, described in a body frame that is not principal."""
    axes = q_axis_angle(*TILTED_AXES)  # principal -> body
    turn = q_matrix(axes)
    product = mat_mul(turn, mat_mul(diagonal(TRIAXIAL_MOMENTS), transpose(turn)))
    tensor = [[(product[i][j] + product[j][i])/2.0 for j in range(3)] for i in range(3)]  # symmetric to the last bit
    solution = [(q_mul(attitude, q_conj(axes)), mat_vec(turn, rates))
                for attitude, rates in triaxial_record["solution"]]
    attitude, rates = solution[0]
    energy, momentum = spin_invariants(tensor, attitude, rates)
    check = spin_expectations(SPIN_TIMES, solution, lambda _t: energy, lambda _t: momentum)
    case = spin_case_json("spin-triaxial-tilted-axes",
                          "The motion of spin-triaxial for a body whose principal frame is turned 0.35 rad from the body frame about (2/3, -1/3, 2/3): the inertia tensor in body axes is not diagonal. Values are spin-triaxial re-expressed: attitude = q_principal * conj(axes), rates = R(axes) rates_principal.",
                          TRIAXIAL_MOMENTS, axes, tensor, attitude, rates, (0.0, 0.0, 0.0), check)
    record = {"id": case["id"], "kind": "tilted", "moments": TRIAXIAL_MOMENTS, "tensor": tensor,
              "torque": (0.0, 0.0, 0.0), "attitude": attitude, "rates": rates, "solution": solution,
              "energy": lambda _t: energy, "momentum": lambda _t: momentum, "numeric": True}
    return case, record


def torque_case():
    moments, attitude, torque = TRIAXIAL_MOMENTS, spin_start_attitude(), TORQUE_BODY
    axis = [1.0 if value != 0.0 else 0.0 for value in torque]
    if sum(axis) != 1.0:
        raise ValueError("Closed form needs a torque about one principal axis")
    index = axis.index(1.0)
    acceleration = torque[index]/moments[index]
    solution = []
    for t in SPIN_TIMES:
        rates = [0.0, 0.0, 0.0]
        rates[index] = acceleration*t
        solution.append((q_mul(attitude, q_axis_angle(axis, 0.5*acceleration*t*t)), rates))
    fixed_axis = q_rotate(attitude, axis)

    def energy_at(t):
        return 0.5*moments[index]*(acceleration*t)**2

    def momentum_at(t):
        return [moments[index]*acceleration*t*component for component in fixed_axis]

    check = spin_expectations(SPIN_TIMES, solution, energy_at, momentum_at)
    extra = {"closed_form": {
        "attitude": "q(t) = q(0) * q(body y, angular_acceleration*t^2/2); angular_velocity = angular_acceleration*t about body y",
        "angular_acceleration": acceleration, "unit": "rad s^-2",
        "note": "Energy and angular momentum are not invariants here: the torque does work. Their expected values are the closed forms I*(alpha*t)^2/2 and I*alpha*t along the inertial direction of the torque axis, which stays fixed."}}
    case = spin_case_json("spin-constant-torque",
                          "From rest, a constant 40 N m body-frame torque about the pitch principal axis (5.5e5 kg m^2) of the triaxial body. Values are the closed form.",
                          moments, [1.0, 0.0, 0.0, 0.0], diagonal(moments), attitude, (0.0, 0.0, 0.0), torque, check, extra)
    record = {"id": case["id"], "kind": "torque", "moments": moments, "tensor": diagonal(moments),
              "torque": torque, "attitude": attitude, "rates": (0.0, 0.0, 0.0), "solution": solution,
              "energy": energy_at, "momentum": momentum_at, "numeric": False}
    return case, record


def build_vectors():
    cases, orbit_records, spin_records = [], [], []
    for builder in (single_inclined_case, binary_crossing_case, binary_inclined_case, nodal_case):
        for p in (2.0, 2.5):
            case, record = builder(p)
            cases.append(case)
            orbit_records.append(record)
    for case, record in (axisymmetric_case(), triaxial_case()):
        cases.append(case)
        spin_records.append(record)
    case, record = tilted_case(spin_records[1])
    cases.append(case)
    spin_records.append(record)
    case, record = torque_case()
    cases.append(case)
    spin_records.append(record)
    vectors = {
        "version": 1, "units": "SI",
        "status": "Offline reference values for three-dimensional flight (DECISIONS A11); requires independent implementation checks. The planar file physics.json is unchanged and remains the planar regression.",
        "generator": "python tools/physics/generate_vectors.py --3d",
        "reference_method": {
            "name": "adaptive Dormand-Prince embedded 5(4), the planar file's stepper",
            "trajectories_20000_s": {"rtol": 2e-12, "position_atol_m": 1e-7, "velocity_atol_m_per_s": 1e-11, "max_step_s": 100.0,
                                     "refinement": "rtol 2e-14, atol / 100, max step 50 s",
                                     "independent_audit": "separately coded pair-loop force and classical RK4, fixed 5 s step",
                                     "limit_m": REFERENCE_POSITION_TOL, "limit_m_per_s": REFERENCE_VELOCITY_TOL},
            "trajectories_2000000_s": {"rtol": 2e-14, "position_atol_m": 1e-9, "velocity_atol_m_per_s": 1e-13, "max_step_s": 50.0,
                                       "refinement": "same tolerances, max step 25 s",
                                       "independent_audit": "separately coded pair-loop force and classical RK4, fixed 10 s step",
                                       "limit_m": LONG_REFERENCE_POSITION_TOL, "limit_m_per_s": LONG_REFERENCE_VELOCITY_TOL},
            "rigid_body": {"state": "attitude quaternion and body rates; Euler's equations with qdot = q (0, omega)/2; quaternion normalised on output only",
                           "rtol": 1e-13, "attitude_atol": 1e-14, "rate_atol_rad_per_s": 1e-17, "max_step_s": 1.0,
                           "refinement": "rtol 1e-14, atol / 10, max step 0.5 s",
                           "independent_audit": "rotation matrix and inertial angular momentum (no quaternion, no Euler equation), classical RK4, fixed 0.05 s step",
                           "limit_attitude": SPIN_REFERENCE_ATTITUDE_TOL, "limit_rad_per_s": SPIN_REFERENCE_RATE_TOL},
        },
        "conventions": {
            "coordinates": "right-handed Cartesian inertial x, y, z; one frame per case; vectors are [x, y, z]",
            "reference_length": "One universal r0 for every interacting pair; not reset at a new encounter or for a new body.",
            "force": "a_i = -sum_j GM_j*r0^(p-2)*(r_i-r_j)/|r_i-r_j|^(p+1), with |.| the three-dimensional distance",
            "potential_zero": "infinity; p>1",
            "test_particle": "ship has zero gravitational source mass; no thrust, drag, collisions or softening in these vectors",
            "tolerance": "absolute SI error; arrays compared component by component; scalar tolerance applies to every component; attitude compared after the sign alignment below",
            "rotation": "a case's rotation object gives the angles (rad) and matrix rows of R = Rz(node)*Rx(inclination)*Rz(argument) that turned the named planar case into this one",
            "specific_angular_momentum": "the vector r x v about the fixed source, m^2 s^-1",
            "orbit_normal": "unit vector along r x v about the fixed source",
            "binary_specific_invariants": "binary energy and angular momentum (a vector) divided by total binary mass; mass weights GM_i/sum(GM_i); no ship contribution",
            "binary_angular_velocity": "the circular binary's constant angular velocity vector, rad s^-1; binary_angular_frequency is its magnitude",
            "ship_jacobi_constant": "C = -2*Phi - |v|^2 + 2*omega_vec . (r x v) with r, v inertial barycentric and omega_vec the binary_angular_velocity; equal to 2*W - |v_rotating|^2 with W including z; valid only for a circular binary",
            "about_primary": "rho = r_ship - r_primary, u = v_ship - v_primary, n = (rho x u)/|rho x u|; ship_orbit_normal_about_primary = n; ship_node_longitude_about_primary = atan2(n_x, -n_y) in (-pi, pi]; ship_inclination_about_primary = acos(n_z); all osculating, measured against the inertial x-y plane, which is the binary's plane in those cases",
            "ship_mean_nodal_rate_about_primary": "(node_longitude(at_t) - node_longitude(0))/at_t with the difference wrapped into (-pi, pi]",
            "plane_crossings": "information only: reference times at which the ship's z changes sign",
            "body_frame": "right-handed; +x forward (roll axis), +y left (pitch axis), +z up (yaw axis)",
            "attitude": "unit quaternion [w, x, y, z], scalar first, Hamilton product, body to inertial: v_inertial = q * v_body * conj(q); (a * b) applies b first. q and -q are the same attitude: compare the rotation, not the sign (flip your q when its four-component dot product with the reference is negative, then compare components)",
            "angular_velocity": "body frame, rad s^-1; kinematics qdot = q * (0, omega_body) / 2",
            "inertia": "moments are the principal moments about principal x', y', z' through the centre of mass, kg m^2; axes is the unit quaternion turning principal-frame vectors into the body frame (identity: body axes are principal); inertia_tensor_body is the same tensor in body axes, rows",
            "torque_body": "constant torque about the centre of mass in body axes, N m",
            "rotational_energy": "omega . (J omega) / 2 with J the inertia tensor in body axes, J",
            "angular_momentum_inertial": "R(q) (J omega): the angular momentum about the centre of mass in inertial axes, kg m^2 s^-1",
            "invariant_expectations": "the analytic initial invariant repeated at each checkpoint, not the reference integrator's slightly drifted value",
            "law_null": "rigid_body cases have law: null; no gravity or gravity-gradient torque acts",
        },
        "cases": cases,
    }
    return vectors, orbit_records, spin_records


# ---------------------------------------------------------------------------
# Validation: audits that must pass before anything is written or compared
# ---------------------------------------------------------------------------

def assert_close(label, actual, expected, tolerance):
    planar.assert_close(label, actual, expected, tolerance)


class Worst:
    """Largest position and velocity (or attitude and rate) differences seen in one audit."""

    def __init__(self):
        self.first, self.second = 0.0, 0.0

    def orbit(self, label, states, others, position_limit, velocity_limit):
        for index, (state, other) in enumerate(zip(states, others)):
            for component, (a, b) in enumerate(zip(state, other)):
                is_position = component % 6 < 3
                assert_close(f"{label} checkpoint {index} component {component}", a, b,
                             position_limit if is_position else velocity_limit)
                if is_position:
                    self.first = max(self.first, abs(a - b))
                else:
                    self.second = max(self.second, abs(a - b))

    def spin(self, label, solution, other, attitude_limit, rate_limit):
        for index, ((q_a, w_a), (q_b, w_b)) in enumerate(zip(solution, other)):
            q_b = q_same_sign(q_b, q_a)
            for component, (a, b) in enumerate(zip(q_a, q_b)):
                assert_close(f"{label} attitude checkpoint {index} component {component}", a, b, attitude_limit)
                self.first = max(self.first, abs(a - b))
            for component, (a, b) in enumerate(zip(w_a, w_b)):
                assert_close(f"{label} rate checkpoint {index} component {component}", a, b, rate_limit)
                self.second = max(self.second, abs(a - b))


def rounded(value):
    return float(f"{value:.3g}")


def validate_orbits(records):
    audit = {}
    refinement = {"short": Worst(), "long": Worst()}
    independent = {"short": Worst(), "long": Worst()}
    rotation, kepler, body_rotation = Worst(), Worst(), Worst()
    invariant_worst = {}
    for record in records:
        p, label, long_case = record["p"], record["id"], record["group"] == "long"
        rhs = single_rhs(p) if record["dynamics"] == "fixed" else binary_rhs(p)
        position_limit = LONG_REFERENCE_POSITION_TOL if long_case else REFERENCE_POSITION_TOL
        velocity_limit = LONG_REFERENCE_VELOCITY_TOL if long_case else REFERENCE_VELOCITY_TOL
        tighter = integrate_orbit(rhs, record["initial"], record["times"], "long_audit" if long_case else "refined")
        refinement[record["group"]].orbit(f"refinement {label}", record["states"], tighter, position_limit, velocity_limit)
        other = audit_orbit(record, LONG_RK4_STEP if long_case else RK4_STEP)
        independent[record["group"]].orbit(f"independent RK4 {label}", record["states"], other, position_limit, velocity_limit)
        if record["dynamics"] == "fixed":
            # Exact rotation invariance against the planar reference, and Kepler for p = 2.
            _, _, planar_states = planar.trajectory_case(p, False)
            turned = [rotate_state(record["matrix"], lift(state)) for state in planar_states]
            rotation.orbit(f"rotated planar reference {label}", record["states"], turned, REFERENCE_POSITION_TOL, REFERENCE_VELOCITY_TOL)
            if p == 2.0:
                analytic = [rotate_state(record["matrix"], lift(planar.analytic_newtonian_ellipse(t))) for t in record["times"]]
                kepler.orbit(f"rotated Kepler ellipse {label}", record["states"], analytic, REFERENCE_POSITION_TOL, REFERENCE_VELOCITY_TOL)
            start = record["initial"]
            energy = dot(start[3:6], start[3:6])/2.0 + planar.potential(norm(start[0:3]), GM, p)
            momentum = cross(start[0:3], start[3:6])
            for t, state in zip(record["times"], record["states"]):
                assert_close(f"{label} energy t={t}", dot(state[3:6], state[3:6])/2.0 + planar.potential(norm(state[0:3]), GM, p), energy, 1e-7)
                for a, b in zip(cross(state[0:3], state[3:6]), momentum):
                    assert_close(f"{label} angular momentum t={t}", a, b, 1e-3)
                # The orbit stays in its plane: no displacement or velocity along the normal.
                normal = unit(momentum)
                assert_close(f"{label} out-of-plane position t={t}", dot(state[0:3], normal), 0.0, 1e-6)
                assert_close(f"{label} out-of-plane velocity t={t}", dot(state[3:6], normal), 0.0, 1e-10)
            continue
        spin, omega = record["spin"], record["omega"]
        start_invariants = binary_invariants(record["initial"], p, spin)
        axis = unit(spin)
        for t, state in zip(record["times"], record["states"]):
            actual = binary_invariants(state, p, spin)
            for name, expected in start_invariants.items():
                values = actual[name] if isinstance(actual[name], list) else [actual[name]]
                targets = expected if isinstance(expected, list) else [expected]
                scale = 100.0 if long_case else 1.0
                limit = scale*(1e-5 if "barycenter" in name else 1e-9 if "barycentric" in name else 1e-3 if "angular" in name else 1e-7)
                for a, b in zip(values, targets):
                    assert_close(f"{label} invariant {name} t={t}", a, b, limit)
                    key = name + (" (2e6 s)" if long_case else "")
                    invariant_worst[key] = max(invariant_worst.get(key, 0.0), abs(a - b))
            # Each body moves on its exact circle: Rodrigues rotation of its start about the spin axis.
            angle = omega*t
            c, s = math.cos(angle), math.sin(angle)
            exact = []
            for index in range(0, 12, 3):
                v = record["initial"][index:index+3]
                k_cross_v, k_dot_v = cross(axis, v), dot(axis, v)
                exact.extend([v[n]*c + k_cross_v[n]*s + axis[n]*k_dot_v*(1.0 - c) for n in range(3)])
            body_rotation.orbit(f"analytic binary rotation {label} t={t}", [state[:12]], [exact], position_limit, velocity_limit)
        if "crossings" in record:
            if len(record["crossings"]) < 2:
                raise AssertionError(f"{label}: the ship must cross the binary plane at least twice")
            # Rotation invariance of a genuinely three-dimensional case (never emitted).
            matrix = rotation_zxz(*AUDIT_ROTATION)
            direct = integrate_orbit(rhs, rotate_state(matrix, record["initial"]), record["times"], "baseline")
            turned = [rotate_state(matrix, state) for state in record["states"]]
            rotation.orbit(f"rotated crossing case {label}", direct, turned, REFERENCE_POSITION_TOL, REFERENCE_VELOCITY_TOL)
        if record["matrix"] is not None:
            _, _, planar_states = planar.trajectory_case(p, True)
            turned = [rotate_state(record["matrix"], lift(state)) for state in planar_states]
            rotation.orbit(f"rotated planar reference {label}", record["states"], turned, REFERENCE_POSITION_TOL, REFERENCE_VELOCITY_TOL)
        if long_case:
            ratio = record["end_to_end"]/record["first_order"]
            if abs(ratio - 1.0) > NODAL_FORMULA_FRACTION:
                raise AssertionError(f"{label}: end-to-end nodal rate is {ratio:.4f} of the first-order formula")
            spread = max(record["inclinations"]) - min(record["inclinations"])
            if spread > math.radians(1.5):
                raise AssertionError(f"{label}: inclination wandered {math.degrees(spread):.2f} deg")
            print(f"PASS nodal precession p={p:g}: first-order formula {record['first_order']:.6e} rad/s; reference end-to-end {record['end_to_end']:.6e} ({ratio:.4f} of it), least squares {record['fitted']:.6e} ({record['fitted']/record['first_order']:.4f})")
    for group, name in (("short", "20000 s cases"), ("long", "2e6 s case")):
        print(f"PASS 3D reference refinement, {name}: max position difference {refinement[group].first:.3g} m, max velocity difference {refinement[group].second:.3g} m/s")
        print(f"PASS 3D independent pair-loop RK4 audit, {name}: max position difference {independent[group].first:.3g} m, max velocity difference {independent[group].second:.3g} m/s")
        audit[f"refinement_{group}"] = {"position_m": rounded(refinement[group].first), "velocity_m_per_s": rounded(refinement[group].second)}
        audit[f"independent_rk4_{group}"] = {"position_m": rounded(independent[group].first), "velocity_m_per_s": rounded(independent[group].second)}
    print(f"PASS rotation invariance (rotated planar single and binary references; rotated crossing case): max position difference {rotation.first:.3g} m, max velocity difference {rotation.second:.3g} m/s")
    print(f"PASS rotated Kepler ellipse, p=2: max position difference {kepler.first:.3g} m, max velocity difference {kepler.second:.3g} m/s")
    print(f"PASS binary bodies on exact inclined circles: max position difference {body_rotation.first:.3g} m, max velocity difference {body_rotation.second:.3g} m/s")
    print("PASS fixed-source energy, angular-momentum vector and plane; binary energy, angular-momentum vector, barycentre; ship Jacobi constant with z; two or more plane crossings")
    audit["rotation_invariance"] = {"position_m": rounded(rotation.first), "velocity_m_per_s": rounded(rotation.second)}
    audit["rotated_kepler_p2"] = {"position_m": rounded(kepler.first), "velocity_m_per_s": rounded(kepler.second)}
    audit["binary_exact_circles"] = {"position_m": rounded(body_rotation.first), "velocity_m_per_s": rounded(body_rotation.second)}
    audit["ship_jacobi_drift_m2_per_s2"] = {"20000_s": rounded(invariant_worst["ship_jacobi_constant"]),
                                            "2000000_s": rounded(invariant_worst["ship_jacobi_constant (2e6 s)"])}
    return audit


def validate_spins(records):
    audit = {}
    closed, refinement, independent, elliptic = Worst(), Worst(), Worst(), Worst()
    energy_worst = momentum_worst = 0.0
    for record in records:
        label, moments, torque = record["id"], record["moments"], record["torque"]
        attitude, rates, solution = record["attitude"], record["rates"], record["solution"]
        if record["kind"] == "tilted":
            # Direct integration with the non-diagonal body-frame tensor.
            other = audit_spin(record["tensor"], torque, attitude, rates, SPIN_TIMES)
            independent.spin(f"independent matrix RK4 {label}", solution, other, SPIN_REFERENCE_ATTITUDE_TOL, SPIN_REFERENCE_RATE_TOL)
        else:
            numeric = integrate_spin(moments, torque, attitude, rates, SPIN_TIMES, "baseline")
            tighter = integrate_spin(moments, torque, attitude, rates, SPIN_TIMES, "refined")
            other = audit_spin(record["tensor"], torque, attitude, rates, SPIN_TIMES)
            refinement.spin(f"refinement {label}", numeric, tighter, SPIN_REFERENCE_ATTITUDE_TOL, SPIN_REFERENCE_RATE_TOL)
            independent.spin(f"independent matrix RK4 {label}", numeric, other, SPIN_REFERENCE_ATTITUDE_TOL, SPIN_REFERENCE_RATE_TOL)
            if not record["numeric"]:
                closed.spin(f"closed form {label}", solution, numeric, SPIN_REFERENCE_ATTITUDE_TOL, SPIN_REFERENCE_RATE_TOL)
        if record["kind"] == "triaxial":
            analytic = [(q, triaxial_rates(moments, TRIAXIAL_SEED_RATES, t + TRIAXIAL_SEED_TIME)[0]) for t, (q, _) in zip(SPIN_TIMES, solution)]
            elliptic.spin(f"Jacobi elliptic rates {label}", solution, analytic, SPIN_REFERENCE_ATTITUDE_TOL, SPIN_REFERENCE_RATE_TOL)
        for t, (q, w) in zip(SPIN_TIMES, solution):
            assert_close(f"{label} quaternion norm t={t}", math.sqrt(sum(c*c for c in q)), 1.0, 1e-14)
            energy, momentum = spin_invariants(record["tensor"], q, w)
            assert_close(f"{label} rotational energy t={t}", energy, record["energy"](t), 1e-9)
            energy_worst = max(energy_worst, abs(energy - record["energy"](t)))
            for a, b in zip(momentum, record["momentum"](t)):
                assert_close(f"{label} inertial angular momentum t={t}", a, b, 1e-7)
                momentum_worst = max(momentum_worst, abs(a - b))
    print(f"PASS rigid-body closed forms (axisymmetric precession, constant torque) against the numerical reference: max attitude difference {closed.first:.3g}, max rate difference {closed.second:.3g} rad/s")
    print(f"PASS rigid-body reference refinement: max attitude difference {refinement.first:.3g}, max rate difference {refinement.second:.3g} rad/s")
    print(f"PASS rigid-body independent matrix-and-momentum RK4 audit (includes the tilted-axes tensor): max attitude difference {independent.first:.3g}, max rate difference {independent.second:.3g} rad/s")
    print(f"PASS triaxial body rates against Jacobi elliptic functions: max rate difference {elliptic.second:.3g} rad/s")
    print(f"PASS rigid-body invariants at the emitted values: rotational energy within {energy_worst:.3g} J, inertial angular momentum within {momentum_worst:.3g} kg m^2/s")
    audit["rigid_body_closed_forms"] = {"attitude": rounded(closed.first), "rate_rad_per_s": rounded(closed.second)}
    audit["rigid_body_refinement"] = {"attitude": rounded(refinement.first), "rate_rad_per_s": rounded(refinement.second)}
    audit["rigid_body_independent_rk4"] = {"attitude": rounded(independent.first), "rate_rad_per_s": rounded(independent.second)}
    audit["triaxial_jacobi_elliptic_rate_rad_per_s"] = rounded(elliptic.second)
    audit["principal_axis_stability"] = validate_axis_stability()
    return audit


def validate_axis_stability():
    """Spin about each principal axis with a 1e-7 rad/s disturbance about the next axis: the
    disturbance must follow cos (stable) or cosh (unstable) at the linear rate."""
    moments, spin, seed, horizon = TRIAXIAL_MOMENTS, 0.04, 1.0e-7, 100.0
    names, result = ("roll", "pitch", "yaw"), {}
    for i in range(3):
        j, k = (i + 1) % 3, (i + 2) % 3
        square = spin*spin*(moments[i] - moments[k])*(moments[i] - moments[j])/(moments[j]*moments[k])
        rates = [0.0, 0.0, 0.0]
        rates[i], rates[j] = spin, seed
        _, end = integrate_spin(moments, (0.0, 0.0, 0.0), [1.0, 0.0, 0.0, 0.0], rates, [horizon], "refined")[0]
        if square > 0.0:
            rate, expected, kind = math.sqrt(square), math.cos(math.sqrt(square)*horizon), "stable"
        else:
            rate, expected, kind = math.sqrt(-square), math.cosh(math.sqrt(-square)*horizon), "unstable"
        assert_close(f"principal-axis stability about {names[i]}", end[j]/seed, expected, 1e-4*max(1.0, abs(expected)))
        result[names[i]] = {"kind": kind, "rate_rad_per_s": rounded(rate)}
        print(f"PASS spin about the {names[i]} axis ({moments[i]:g} kg m^2) at {spin} rad/s is {kind}: linear rate {rate:.6f} rad/s, disturbance ratio after {horizon:g} s {end[j]/seed:.6f} against {expected:.6f}")
    return result


def validate(orbit_records, spin_records):
    audit = validate_orbits(orbit_records)
    audit.update(validate_spins(spin_records))
    return audit


# ---------------------------------------------------------------------------
# Consumer probe: read the JSON alone and fly it with simple second-order schemes
# ---------------------------------------------------------------------------

def consumer_probe(step=1.0):
    """Not part of the reference. Reads physics-3d.json as a consumer would, integrates every
    trajectory case with fixed-step kick-drift-kick velocity Verlet (translation only) and
    prints the worst error against each tolerance. It shows that the file alone is enough to
    run the cases and what a second-order integrator at the game's step achieves."""
    data = json.loads(OUTPUT.read_text(encoding="utf-8"))
    print(f"Velocity Verlet, fixed step {step:g} s, against {OUTPUT.relative_to(ROOT)}")
    for case in data["cases"]:
        if case["kind"] != "trajectory":
            continue
        p, r0 = case["law"]["exponent"], case["law"]["r0"]
        half = (p + 1.0)/2.0
        if case["source_dynamics"] == "fixed_origin":
            strengths, state = [case["law"]["GM"]*r0**(p - 2.0)], [0.0]*6 + case["initial"]["r"] + case["initial"]["v"]
            movable = [False, True]
        else:
            strengths = [body["GM"]*r0**(p - 2.0) for body in case["initial"]["bodies"]]
            state = []
            for body in case["initial"]["bodies"]:
                state.extend(body["r"] + body["v"])
            state.extend(case["initial"]["r"] + case["initial"]["v"])
            movable = [True, True, True]
        count = len(movable)
        sources = len(strengths)

        def accelerations(s):
            out = [0.0]*(3*count)
            for i in range(count):
                if not movable[i]:
                    continue
                ax = ay = az = 0.0
                for j in range(sources):
                    if j == i:
                        continue
                    dx, dy, dz = s[6*i] - s[6*j], s[6*i+1] - s[6*j+1], s[6*i+2] - s[6*j+2]
                    pull = -strengths[j]/(dx*dx + dy*dy + dz*dz)**half
                    ax, ay, az = ax + pull*dx, ay + pull*dy, az + pull*dz
                out[3*i], out[3*i+1], out[3*i+2] = ax, ay, az
            return out

        def quantities(s):
            ship = s[6*(count - 1):]
            values = {"position": ship[0:3], "velocity": ship[3:6]}
            if case["source_dynamics"] == "fixed_origin":
                k = strengths[0]
                h = cross(ship[0:3], ship[3:6])
                values["specific_energy"] = dot(ship[3:6], ship[3:6])/2.0 - k/((p - 1.0)*norm(ship[0:3])**(p - 1.0))
                values["specific_angular_momentum"] = h
                values["orbit_normal"] = unit(h)
                return values
            r1, v1, r2, v2 = s[0:3], s[3:6], s[6:9], s[9:12]
            total = strengths[0] + strengths[1]
            w1, w2 = strengths[0]/total, strengths[1]/total
            values["body_position"] = {"primary": r1, "secondary": r2}
            values["body_velocity"] = {"primary": v1, "secondary": v2}
            values["binary_specific_energy"] = (w1*dot(v1, v1) + w2*dot(v2, v2))/2.0 - w1*strengths[1]/((p - 1.0)*math.dist(r1, r2)**(p - 1.0))
            values["binary_specific_angular_momentum"] = [w1*a + w2*b for a, b in zip(cross(r1, v1), cross(r2, v2))]
            values["binary_barycenter"] = [w1*a + w2*b for a, b in zip(r1, r2)]
            values["binary_barycentric_velocity"] = [w1*a + w2*b for a, b in zip(v1, v2)]
            phi = -strengths[0]/((p - 1.0)*math.dist(ship[0:3], r1)**(p - 1.0)) - strengths[1]/((p - 1.0)*math.dist(ship[0:3], r2)**(p - 1.0))
            values["ship_jacobi_constant"] = -2.0*phi - dot(ship[3:6], ship[3:6]) + 2.0*dot(case["binary_angular_velocity"], cross(ship[0:3], ship[3:6]))
            n = unit(cross([a - b for a, b in zip(ship[0:3], r1)], [a - b for a, b in zip(ship[3:6], v1)]))
            values["ship_orbit_normal_about_primary"] = n
            values["ship_node_longitude_about_primary"] = math.atan2(n[0], -n[1])
            values["ship_inclination_about_primary"] = math.acos(n[2])
            return values

        checkpoints = sorted({entry["at_t"] for entry in case["expect"]})
        worst, node_start, t, acc = {}, None, 0.0, accelerations(state)
        steps_done = 0
        for target in checkpoints:
            steps = round((target - t)/step)
            for _ in range(steps):
                for i in range(count):
                    if movable[i]:
                        for n in range(3):
                            state[6*i+3+n] += 0.5*step*acc[3*i+n]
                            state[6*i+n] += step*state[6*i+3+n]
                acc = accelerations(state)
                for i in range(count):
                    if movable[i]:
                        for n in range(3):
                            state[6*i+3+n] += 0.5*step*acc[3*i+n]
            steps_done += steps
            t = target
            values = quantities(state)
            if node_start is None and "ship_node_longitude_about_primary" in values:
                node_start = values["ship_node_longitude_about_primary"]
            for entry in case["expect"]:
                if entry["at_t"] != target:
                    continue
                name = entry["quantity"]
                if name == "ship_mean_nodal_rate_about_primary":
                    actual = wrap(values["ship_node_longitude_about_primary"] - node_start)/target
                else:
                    actual = values[name][entry["body"]] if "body" in entry else values[name]
                expected = entry["value"]
                pairs = zip(actual, expected) if isinstance(expected, list) else [(actual, expected)]
                error = max(abs(a - b) for a, b in pairs)
                previous = worst.get(name, (0.0, entry["tolerance"]))
                worst[name] = (max(previous[0], error), entry["tolerance"])
        verdict = "within every tolerance" if all(error <= tolerance for error, tolerance in worst.values()) else "OUTSIDE a tolerance"
        print(f"{case['id']}: {steps_done} steps, {verdict}")
        for name, (error, tolerance) in worst.items():
            print(f"    {name}: worst error {error:.3g}, tolerance {tolerance:.3g}, ratio {error/tolerance:.3g}")
    print()
    print("Rigid body: explicit midpoint on J omega' = torque - omega x J omega, attitude advanced by the exponential of the")
    print("mid-step rate (second order; a probe, NOT the game's scheme). Worst error over the checkpoints / tolerance:")
    for case in data["cases"]:
        if case["kind"] != "rigid_body":
            continue
        # Build the body-frame tensor from the contract's form (moments + axes) and check the convenience copy.
        turn = q_matrix(case["inertia"]["axes"])
        tensor = mat_mul(turn, mat_mul(diagonal(case["inertia"]["moments"]), transpose(turn)))
        for row, given in zip(tensor, case["inertia_tensor_body"]):
            for a, b in zip(row, given):
                assert_close(f"{case['id']} inertia tensor from moments and axes", a, b, 1e-6)
        inverse, torque = symmetric_inverse(tensor), case["torque_body"]

        def rate_derivative(w):
            return mat_vec(inverse, [t - c for t, c in zip(torque, cross(w, mat_vec(tensor, w)))])

        checkpoints = sorted({entry["at_t"] for entry in case["expect"]})
        for size in (1.0, 0.125, 0.015625):
            q, w, t, worst = list(case["initial"]["attitude"]), list(case["initial"]["angular_velocity"]), 0.0, {}
            angle_worst = 0.0
            for target in checkpoints:
                for _ in range(round((target - t)/size)):
                    middle = [a + 0.5*size*b for a, b in zip(w, rate_derivative(w))]
                    w = [a + size*b for a, b in zip(w, rate_derivative(middle))]
                    turn_rate = norm(middle)
                    if turn_rate > 0.0:
                        q = q_mul(q, q_axis_angle([c/turn_rate for c in middle], turn_rate*size))
                t = target
                energy, momentum = spin_invariants(tensor, q, w)
                values = {"attitude": q, "angular_velocity": w, "rotational_energy": energy, "angular_momentum_inertial": momentum}
                for entry in case["expect"]:
                    if entry["at_t"] != target:
                        continue
                    actual, expected = values[entry["quantity"]], entry["value"]
                    if entry["quantity"] == "attitude":
                        actual = q_same_sign(actual, expected)
                        relative = q_mul(q_conj(expected), actual)
                        angle_worst = max(angle_worst, 2.0*math.atan2(norm(relative[1:]), abs(relative[0])))
                    pairs = zip(actual, expected) if isinstance(expected, list) else [(actual, expected)]
                    error = max(abs(a - b) for a, b in pairs)
                    worst[entry["quantity"]] = (max(worst.get(entry["quantity"], (0.0, 0.0))[0], error), entry["tolerance"])
            summary = ", ".join(f"{name} {error:.2g}/{tolerance:.2g}" for name, (error, tolerance) in worst.items())
            print(f"  {case['id']} step {size:g} s: {summary}; attitude angle error {angle_worst:.2g} rad")


# ---------------------------------------------------------------------------
# Report: the numerical studies quoted in docs/physics/derivation.md section 11
# ---------------------------------------------------------------------------

def measure_node(p, separation, radius, inclination, periods, about=0, sample=2000.0):
    """Start a circular orbit about one body of the circular binary, integrate for a whole
    number of binary periods and return the secular node rate against the formulas."""
    initial, omega = nodal_start(p, radius, (NODAL_ELEMENTS[0], inclination, NODAL_ELEMENTS[2]), separation, about)
    duration = sample*round(periods*2.0*math.pi/omega/sample)
    times = [sample*index for index in range(int(duration/sample) + 1)]
    states = integrate_orbit(binary_rhs(p), initial, times, "study")
    elements = [about_body(state, about) for state in states]
    nodes = unwrapped([element[0] for element in elements])
    radii = [element[2] for element in elements]
    center, perturber = (GM, GM2) if about == 0 else (GM2, GM)
    first = nodal_rate_first_order(p, center, perturber, radius, separation, inclination)
    second = first*nodal_rate_second_order_factor(p, radius, separation, inclination)
    orbit_rate = math.sqrt(planar.parameter(center, p)/radius**(p + 1.0))
    return {"first": first, "second": second, "fit": least_squares_slope(times, nodes),
            "inclination": (min(e[1] for e in elements), max(e[1] for e in elements)),
            "distance": (min(radii)/radius, max(radii)/radius),
            "excursion": (max(radii) - min(radii))/(max(radii) + min(radii)),
            "rate_ratio": omega/orbit_rate, "duration": duration}


def report_row(prefix, result):
    lost = result["distance"][1] > 2.0
    if lost:
        print(f"{prefix} first-order {result['first']:.4e}  NOT BOUND: distance reached {result['distance'][1]:.2f} of the start radius")
        return
    print(f"{prefix} first-order {result['first']:.4e}  measured/first {result['fit']/result['first']:.4f}  measured/second {result['fit']/result['second']:.4f}"
          f"  n_b/Omega {result['rate_ratio']:.4f}  inclination {math.degrees(result['inclination'][0]):.2f}..{math.degrees(result['inclination'][1]):.2f} deg"
          f"  radial excursion e_r {result['excursion']:.4f}")


def report():
    print("Three-dimensional studies for docs/physics/derivation.md (reference integrator, 'study' controls: rtol 1e-10, max step 400 s)")
    print("Rates in rad/s; negative = regression. 'measured' is the least-squares slope of the osculating node longitude,")
    print("sampled every 2000 s over a whole number of binary periods. 'second' includes the (a/D)^2 term.")
    print()
    print("Gravity range scale, first-order formula, ship on a circle of radius r0 about the primary (Alpha):")
    for p in (2.0, 2.5):
        orbit_rate = math.sqrt(planar.parameter(GM, p)/R0**(p + 1.0))
        rate = nodal_rate_first_order(p, GM, GM2, R0, SEPARATION, 0.0)
        print(f"  p={p:g}: Omega {orbit_rate:.6e} rad/s; node rate {rate:.6e} * cos(i) rad/s = {math.degrees(rate*2.0*math.pi/orbit_rate):.4f} deg per orbit * cos(i);"
              f" node period {2.0*math.pi/abs(rate):.4e} s / cos(i); second-order factor at i=0: {nodal_rate_second_order_factor(p, R0, SEPARATION, 0.0):.4f}, at 30 deg: {nodal_rate_second_order_factor(p, R0, SEPARATION, math.radians(30.0)):.4f}")
    print("Asteroid on a circle about the secondary (Beta), the primary perturbing, first-order formula:")
    for p in (2.0, 2.5):
        for radius in (3.0e5, 6.0e5, 9.0e5):
            orbit_rate = math.sqrt(planar.parameter(GM2, p)/radius**(p + 1.0))
            rate = nodal_rate_first_order(p, GM2, GM, radius, SEPARATION, 0.0)
            _, omega = circular_binary(p)
            print(f"  p={p:g} a={radius:g} m: Omega {orbit_rate:.6e} rad/s (period {2.0*math.pi/orbit_rate:.0f} s); node rate {rate:.6e} * cos(i) rad/s;"
                  f" node period {2.0*math.pi/abs(rate):.4e} s / cos(i); a/D {radius/SEPARATION:.3f}; n_b/Omega {omega/orbit_rate:.4f}")
    print()
    print("A. Coefficient check: a = r0 about the primary, i = 30 deg, separation increased (the formula is the D -> infinity limit)")
    for p in (2.0, 2.5):
        for separation, periods in ((4.0e6, 8), (8.0e6, 6), (1.6e7, 4)):
            report_row(f"  p={p:g} D={separation:g} m ({periods} binary periods):", measure_node(p, separation, R0, math.radians(30.0), periods))
    print()
    print("B. Inclination at the Gravity range scale: a = r0 about the primary, D = 4e6 m, 6 binary periods")
    for p in (2.0, 2.5):
        for degrees in (1.0, 15.0, 30.0, 45.0, 60.0, 75.0):
            report_row(f"  p={p:g} i={degrees:g} deg:", measure_node(p, SEPARATION, R0, math.radians(degrees), 6))
    print()
    print("C. Radius scan about the primary at i = 60 deg, D = 4e6 m, 6 binary periods (apsidal rate (1-sqrt(3-p))*Omega against the binary rate n_b)")
    for p in (2.5, 2.0):
        _, omega = circular_binary(p)
        for radius in (0.8e6, 0.9e6, 0.95e6, 1.0e6, 1.05e6, 1.1e6, 1.2e6):
            orbit_rate = math.sqrt(planar.parameter(GM, p)/radius**(p + 1.0))
            apsidal = (1.0 - math.sqrt(3.0 - p))*orbit_rate/omega
            report_row(f"  p={p:g} a={radius:g} m apsidal/n_b {apsidal:.3f}:", measure_node(p, SEPARATION, radius, math.radians(60.0), 6))
    print()
    print("D. Belt about the secondary (Beta), the primary perturbing, D = 4e6 m, 6 binary periods")
    for p in (2.0, 2.5):
        for degrees in (5.0, 30.0):
            for radius in (3.0e5, 4.5e5, 6.0e5, 7.0e5, 7.5e5, 8.0e5, 8.5e5, 9.0e5):
                report_row(f"  p={p:g} i={degrees:g} deg a={radius:g} m:", measure_node(p, SEPARATION, radius, math.radians(degrees), 6, about=1, sample=1000.0))
            sys.stdout.flush()
    print()
    print("E. Jacobi constant with z at the Gravity range scale, m^2/s^2: 2W at the five equilibria, and the crossing case")
    for p in (2.0, 2.5):
        bodies, omega = circular_binary(p)
        x1, x2 = bodies[0], bodies[6]
        k1, k2 = planar.parameter(GM, p), planar.parameter(GM2, p)

        def two_w(x, y, z):
            r1, r2 = math.sqrt((x - x1)**2 + y*y + z*z), math.sqrt((x - x2)**2 + y*y + z*z)
            return omega*omega*(x*x + y*y) + 2.0*k1/((p - 1.0)*r1**(p - 1.0)) + 2.0*k2/((p - 1.0)*r2**(p - 1.0))

        def slope(x):  # dW/dx on the line of centres
            return omega*omega*x - k1*(x - x1)/abs(x - x1)**(p + 1.0) - k2*(x - x2)/abs(x - x2)**(p + 1.0)

        def root(function, low, high):
            for _ in range(200):
                middle = (low + high)/2.0
                if function(low)*function(middle) <= 0.0:
                    high = middle
                else:
                    low = middle
            return (low + high)/2.0

        small = 1.0e-6*SEPARATION
        collinear = {"L1": root(slope, x1 + small, x2 - small), "L2": root(slope, x2 + small, x2 + 3.0*SEPARATION),
                     "L3": root(slope, x1 - 3.0*SEPARATION, x1 - small)}
        triangular = two_w((x1 + x2)/2.0, math.sqrt(3.0)/2.0*SEPARATION, 0.0)
        print(f"  p={p:g}: " + ", ".join(f"C_{name} {two_w(x, 0.0, 0.0):.3f} (x = {x:.0f} m)" for name, x in collinear.items())
              + f", C_L4 = C_L5 {triangular:.3f}; cylinder radius sqrt(C)/n at C_L4: {math.sqrt(triangular)/omega:.4e} m")
        initial = bodies + CROSSING_SHIP[0] + CROSSING_SHIP[1]
        jacobi = binary_invariants(initial, p, [0.0, 0.0, omega])["ship_jacobi_constant"]
        ceiling = root(lambda z: two_w(x1, 0.0, z) - jacobi, 1.0, 1.0e9)
        times = [50.0*index for index in range(int(TIMES[-1]/50.0) + 1)]
        reached = max(abs(state[14]) for state in integrate_orbit(binary_rhs(p), initial, times, "baseline"))
        print(f"       crossing case: C {jacobi:.3f} ({'above' if jacobi > two_w(collinear['L1'], 0.0, 0.0) else 'below'} C_L1); zero-velocity height over the primary {ceiling:.0f} m;"
              f" largest |z| the ship reaches in 20000 s {reached:.0f} m")


# ---------------------------------------------------------------------------
# Entry point (called by generate_vectors.py --3d)
# ---------------------------------------------------------------------------

def run(mode):
    """mode: 'write', 'check', 'validate-only', 'report' or 'consumer-probe'."""
    if mode == "report":
        report()
        return
    if mode == "consumer-probe":
        consumer_probe()
        return
    vectors, orbit_records, spin_records = build_vectors()
    audit = validate(orbit_records, spin_records)
    # Recorded for the reader; rounded to three significant figures so the file stays reproducible.
    vectors["reference_audit"] = audit
    ordered = {key: vectors[key] for key in ("version", "units", "status", "generator", "reference_method", "reference_audit", "conventions", "cases")}
    rendered = json.dumps(ordered, indent=2, allow_nan=False) + "\n"
    if mode == "validate-only":
        return
    if mode == "check":
        if not OUTPUT.exists() or OUTPUT.read_bytes() != rendered.encode("utf-8"):
            print(f"FAIL generated content differs from {OUTPUT.relative_to(ROOT)}", file=sys.stderr)
            raise SystemExit(1)
        print(f"PASS reproducible JSON: {len(ordered['cases'])} cases in {OUTPUT.relative_to(ROOT)}")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_bytes(rendered.encode("utf-8"))
        print(f"WROTE {len(ordered['cases'])} cases to {OUTPUT.relative_to(ROOT)}")
