"""S6 research reference; SI, Python 3.14 + numpy. Run --check to verify vectors.

An explicit fictional seam, not a general-relativistic wormhole calculation.
Geometry is finite convex prisms. The dynamic reference is a uniform rigid bar;
the general six-DOF force check uses discrete material masses, not hull vertices
as a claim about the production ship's mass distribution.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path

import numpy as np

OUT = Path(__file__).with_name("vectors.json")
I3 = np.eye(3)
S = np.diag([-1.0, 1.0, -1.0])
C_LIGHT = 299792458.0
CHECKS: dict[str, float | bool] = {}


def check(name, actual, expected, atol=1e-10):
    error = float(np.max(np.abs(np.asarray(actual) - np.asarray(expected))))
    if not error <= atol:
        raise AssertionError(f"{name}: error {error} > {atol}")
    CHECKS[name] = error


def require(name, condition):
    if not condition:
        raise AssertionError(name)
    CHECKS[name] = True


def skew(v):
    x, y, z = v
    return np.array([[0., -z, y], [z, 0., -x], [-y, x, 0.]])


def rot(vector):
    angle = np.linalg.norm(vector)
    if angle < 1e-15:
        return I3.copy()
    k = skew(np.asarray(vector) / angle)
    return I3 + math.sin(angle) * k + (1 - math.cos(angle)) * k @ k


def quaternion(matrix):
    """Body-to-chart, scalar first, canonical sign; no Euler-angle convention."""
    m = matrix
    if np.trace(m) > 0:
        s = 2 * math.sqrt(1 + np.trace(m))
        q = np.array([s / 4, (m[2, 1]-m[1, 2])/s,
                      (m[0, 2]-m[2, 0])/s, (m[1, 0]-m[0, 1])/s])
    else:
        i = int(np.argmax(np.diag(m)))
        j, k = (i+1) % 3, (i+2) % 3
        s = 2 * math.sqrt(1 + m[i, i] - m[j, j] - m[k, k])
        q = np.zeros(4)
        q[0], q[i+1] = (m[k, j]-m[j, k])/s, s/4
        q[j+1], q[k+1] = (m[j, i]+m[i, j])/s, (m[k, i]+m[i, k])/s
    q /= np.linalg.norm(q)
    if next(v for v in q if abs(v) > 1e-14) < 0:
        q = -q
    return q


@dataclass
class Mouth:
    c: np.ndarray
    q: np.ndarray
    u: np.ndarray
    omega: np.ndarray
    acc: np.ndarray
    alpha: np.ndarray


def mouth(t, c=(0, 0, 0), u=(0, 0, 0), omega=(0, 0, 0), q=I3,
          acc=(0, 0, 0)):
    c, u, w, a = map(lambda v: np.array(v, dtype=float), (c, u, omega, acc))
    return Mouth(c+u*t+a*t*t/2, rot(w*t) @ q, u+a*t, w, a, np.zeros(3))


QA = rot(np.array([0., -math.pi/2, 0.]))  # outward normal -world x


def pair(t, moving=False):
    if not moving:
        return mouth(t, q=QA), mouth(t, c=(1000, 200, -300))
    return (mouth(t, c=(2, -3, 4), u=(.12, -.07, .03),
                  omega=(.007, -.011, .005), q=QA, acc=(.001, 0, -.002)),
            mouth(t, c=(1200, -400, 800), u=(-.04, .08, .13),
                  omega=(-.013, .009, .017), q=rot(np.array([.4, -.2, .3])),
                  acc=(0, -.001, .001)))


def transform(a, b):
    r = b.q @ S @ a.q.T
    wa, wb = skew(a.omega), skew(b.omega)
    rd = wb @ r - r @ wa
    rdd = ((skew(b.alpha)+wb@wb) @ r - 2*wb@r@wa
           + r @ (wa@wa-skew(a.alpha)))
    return r, rd, rdd


def mapped(a, b, x, v, attitude=I3, spin=np.zeros(3)):
    r, rd, _ = transform(a, b)
    xp = b.c + r @ (x-a.c)
    vp = b.u + r @ (v-a.u) + rd @ (x-a.c)
    qp = r @ attitude
    wp = b.omega + r @ (spin-a.omega)  # inertial/chart spin
    return xp, vp, qp, wp


def k_transport(a, b, x, v):
    r, rd, rdd = transform(a, b)
    return b.acc-r@a.acc + 2*rd@(v-a.u) + rdd@(x-a.c)


def prism(outline, zmin, zmax):
    n = len(outline)
    vertices = np.array([[x, y, z] for z in (zmin, zmax) for x, y in outline])
    edges = [(i, (i+1) % n) for i in range(n)]
    edges += [(i+n, (i+1) % n+n) for i in range(n)]
    edges += [(i, i+n) for i in range(n)]
    return vertices, edges


HULL = prism([(-8, -2.5), (8, -2.5), (8, 2.5), (-8, 2.5)], -2.5, 2.5)
WING = prism([(-6, 2.5), (-2, 2.5), (-2, 10), (-6, 10)], -.5, .5)


def slab_vertices(vertices, edges, half_depth):
    """Exact vertices of a convex prism clipped by two parallel z planes."""
    points = [p for p in vertices if abs(p[2]) <= half_depth+1e-12]
    for i, j in edges:
        p, q = vertices[i], vertices[j]
        if abs(q[2]-p[2]) < 1e-15:
            continue
        for z in (-half_depth, half_depth):
            f = (z-p[2])/(q[2]-p[2])
            if 0 <= f <= 1:
                points.append(p+f*(q-p))
    return np.array(points).reshape((-1, 3))


def convex_hull2(points):
    pts = sorted(set(map(tuple, points)))
    if len(pts) <= 1:
        return pts
    def cross(o, a, b):
        return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1]+hi[:-1]


def radial_interval(points):
    hull = np.array(convex_hull2(points[:, :2]))
    maxr = float(np.max(np.linalg.norm(hull, axis=1)))
    if len(hull) == 1:
        return maxr, maxr
    crosses, distances = [], []
    for p, q in zip(hull, np.roll(hull, -1, axis=0)):
        d = q-p
        crosses.append(float(d[0]*(-p[1])-d[1]*(-p[0])))
        f = np.clip(-np.dot(p, d)/np.dot(d, d), 0, 1)
        distances.append(np.linalg.norm(p+f*d))
    inside = len(hull) >= 3 and min(crosses) >= -1e-12
    return (0. if inside else float(min(distances))), maxr


def rim_query(parts, position, attitude, opening, inner=12., width=1., half_depth=.5):
    result = []
    for label, (vertices, edges) in parts:
        local = (opening.q.T @ ((attitude @ vertices.T).T + position-opening.c).T).T
        points = slab_vertices(local, edges, half_depth)
        if len(points) == 0:
            continue
        low, high = radial_interval(points)
        result.append({"part": label, "radial_min": low, "radial_max": high,
                       "hole_clearance": inner-high,
                       "contact": low <= inner+width and high >= inner})
    return result


def bisect_first(predicate, lo, hi):
    """Given an isolated false->true bracket; not a general-purpose CCD search."""
    if predicate(lo) or not predicate(hi):
        raise ValueError("invalid first-event bracket")
    for _ in range(60):
        mid = (lo+hi)/2
        if predicate(mid):
            hi = mid
        else:
            lo = mid
    return hi


def crossing_geometry():
    a, b = pair(0)
    samples = []
    for t in (0., 3.5, 4., 8., 12., 16., 20., 20.5, 24.):
        x = np.array([-12+t, 0., 0.])
        xp, vp, qp, wp = mapped(a, b, x, np.array([1., 0, 0]))
        contact = rim_query([("stowed", HULL)], x, I3, a)
        require(f"clean_no_contact_{t}", not any(r["contact"] for r in contact))
        samples.append({"t": t, "unfolded_com": x, "far_com_image": xp,
                        "fraction_far_uniform_bar": np.clip((x[0]+8)/16, 0, 1),
                        "rim": contact})
    clean = {"pair_at_epoch": [a.__dict__, b.__dict__], "radius": 12.,
             "rim_width": 1., "rim_half_depth": .5,
             "hull_vertices": HULL[0], "initial_position": [-12, 0, 0],
             "velocity": [1, 0, 0], "first_material_crossing": 4.,
             "last_material_crossing": 20., "last_rim_slab_exit": 20.5,
             "minimum_hole_clearance": 12-math.sqrt(12.5),
             "exit_attitude_wxyz": quaternion(qp), "exit_velocity": vp,
             "samples": samples}
    parts = [("hull", HULL), ("trailing-radiator", WING)]
    def collides(t):
        return any(r["contact"] for r in rim_query(parts, np.array([-12+t, 2.1, 0]), I3, a))
    hit = bisect_first(collides, 13., 14.)
    check("trailing_radiator_first_contact", hit, 13.5, 2e-11)
    x = np.array([-12+hit, 2.1, 0])
    clip = {"initial_position": [-12, 2.1, 0], "velocity": [1, 0, 0],
            "radiator_vertices": WING[0], "first_contact_time": hit,
            "first_nose_crossing": 4., "tail_crossing_if_no_impact": 20.,
            "uniform_hull_mass_fraction_far_at_contact": (x[0]+8)/16,
            "contact_queries": rim_query(parts, x, I3, a),
            "policy": "first contact terminates rigid crossing as ship loss; no bounce/scoring"}
    outside = rim_query([("hull", HULL)], np.array([0., 30., 0]), I3, a)
    require("outside_finite_ring_is_bypass", all(not r["contact"] for r in outside))
    require("outside_bypass_never_enters_disk", min(r["radial_min"] for r in outside) > 13)
    # Relative translation sweeps contact between two clear endpoint poses.
    # Analytic upper/lower crossing brackets for this one-cycle fixture.
    def sweep_contact(t):
        p = np.array([0., 10*math.sin(math.pi*t)**2, 0.])
        return any(r["contact"] for r in rim_query([("hull", HULL)], p, I3, a))
    require("swept_endpoints_clear", not sweep_contact(0) and not sweep_contact(1))
    require("swept_midpoint_collides", sweep_contact(.5))
    swept_hit = bisect_first(sweep_contact, 0, .5)
    expected = math.asin(math.sqrt((math.sqrt(12**2-2.5**2)-2.5)/10))/math.pi
    check("swept_analytic_contact", swept_hit, expected, 1e-10)
    return clean, clip, {"outside_query": outside, "between_tick_contact": swept_hit,
                         "scope": "isolated analytic brackets; general rotating CCD remains implementation work"}


def kinematic_vectors():
    t = 7.3
    a, b = pair(t, True)
    x = a.c+np.array([4., -2., 1.])
    v = np.array([2., .3, -.4])
    q = rot(np.array([.2, -.1, .4]))
    w = np.array([.03, -.02, .04])
    y, z, qb, wb = mapped(a, b, x, v, q, w)
    xr, vr, qr, wr = mapped(b, a, y, z, qb, wb)
    for name, value, target in [("position", xr, x), ("velocity", vr, v),
                                 ("attitude", qr, q), ("spin", wr, w)]:
        check("roundtrip_"+name, value, target, 1e-11)
    r, rd, rdd = transform(a, b)
    check("proper_rotation", np.linalg.det(r), 1.)
    h = .001
    ym = mapped(*pair(t-h, True), x-v*h, v)[0]
    yp = mapped(*pair(t+h, True), x+v*h, v)[0]
    check("velocity_is_position_derivative", (yp-ym)/(2*h), z, 1e-8)
    check("acceleration_transport_derivative", (yp-2*y+ym)/h**2,
          k_transport(a, b, x, v), 4e-7)
    check("spin_body_convention", qb.T@wb,
          q.T@(w-a.omega+r.T@b.omega), 1e-12)
    mass = 30400.
    delta_ke = .5*mass*(z@z-v@v)
    require("moving_pair_exchanges_energy", abs(delta_ke) > 100.)
    a0, b0 = pair(0)
    check("stationary_speed", np.linalg.norm(mapped(a0, b0, x, v)[1]), np.linalg.norm(v))
    return {"t": t, "mouths": [a.__dict__, b.__dict__], "input":
            {"x": x, "v": v, "q_wxyz": quaternion(q), "spin_inertial": w},
            "output": {"x": y, "v": z, "q_wxyz": quaternion(qb),
                       "spin_inertial": wb, "spin_body": qb.T@wb},
            "R": r, "Rdot": rd, "Rddot": rdd,
            "transport_acceleration": k_transport(a, b, x, v),
            "translational_energy_change_30400kg": delta_ke,
            "energy_scope": "point/COM translational ledger only, not whole-ship total"}


def force_balance(a, b, com, velocity, q, omega, offsets, masses, forces, far):
    """Newton-Euler sum in unfolded A, including transport acceleration.

    Each forces[i] is in that element's *physical* side's chart.
    """
    r, _, _ = transform(a, b)
    offsets = (q@offsets.T).T
    total, torque = np.zeros(3), np.zeros(3)
    inertia = np.zeros((3, 3))
    for d, m, force, is_far in zip(offsets, masses, forces, far):
        x, v = com+d, velocity+np.cross(omega, d)
        f = r.T@(force-m*k_transport(a, b, x, v)) if is_far else force
        total += f
        torque += np.cross(d, f)
        inertia += m*((d@d)*I3-np.outer(d, d))
    acceleration = total/sum(masses)
    alpha = np.linalg.solve(inertia, torque-np.cross(omega, inertia@omega))
    return acceleration, alpha, total, torque


def force_vectors():
    a, b = pair(7.3, True)
    mouth_inputs = [a.__dict__.copy(), b.__dict__.copy()]
    offsets = np.array([[x, y, z] for x in (-4., 4.) for y in (-2., 2.) for z in (-1., 1.)])
    masses = np.full(8, 30400/8)
    com, v = a.c.copy(), np.array([1., .2, -.1])
    q, w = I3.copy(), np.array([.02, -.01, .03])
    r, rd, _ = transform(a, b)
    xb, vb, qb, wb = mapped(a, b, com, v, q, w)
    g_b = np.array([.003, -.004, .002])
    forces = masses[:, None]*g_b
    aa, alpha, total, torque = force_balance(a, b, com, v, q, w, offsets,
                                            masses, forces, [True]*8)
    acceleration_b = r@aa+k_transport(a, b, com, v)
    check("all_far_rebase_acceleration", acceleration_b, g_b, 1e-12)
    inertia_body = sum(m*((d@d)*I3-np.outer(d, d)) for d, m in zip(offsets, masses))
    inertia_b = qb@inertia_body@qb.T
    expected_alpha_b = np.linalg.solve(inertia_b, -np.cross(wb, inertia_b@wb))
    alpha_b = b.alpha+r@(alpha-a.alpha)+rd@(w-a.omega)
    check("all_far_rebase_angular_acceleration", alpha_b, expected_alpha_b, 1e-12)
    # A stationary pair: rear engine remains near, forward engine is far.
    a0, b0 = pair(0)
    r0, _, _ = transform(a0, b0)
    local_thrust = np.array([24000., 0, 0])
    check("far_engine_virtual_work", r0.T@(r0@local_thrust), local_thrust)
    f = np.array([a0.q[:, 2]@d < 0 for d in offsets])
    ga, gb_unfolded = np.array([.01, 0, 0]), np.array([-.02, 0, 0])
    mixed = np.array([m*(r0@gb_unfolded if side else ga) for m, side in zip(masses, f)])
    partial = force_balance(a0, b0, np.zeros(3), v, I3, np.zeros(3),
                            offsets, masses, mixed, f)
    check("half_ship_local_gravity", partial[0], [-.005, 0, 0])
    check("half_ship_no_symmetric_torque", partial[1], [0, 0, 0])
    # One off-center nozzle is across the seam. Its full force and moment must
    # appear exactly once; using a COM-only blend would fail this check.
    nozzle_force_a = np.array([24000., 1000., -500.])
    mixed[7] += r0@nozzle_force_a
    powered = force_balance(a0, b0, np.zeros(3), v, I3, np.zeros(3),
                            offsets, masses, mixed, f)
    check("partial_far_nozzle_force_once", powered[0],
          np.array([-.005, 0, 0])+nozzle_force_a/sum(masses), 1e-12)
    check("partial_far_nozzle_torque", powered[1],
          np.linalg.solve(inertia_body, np.cross(offsets[7], nozzle_force_a)), 1e-12)
    # Nonidentity body attitude, asymmetric applied load and accelerating mouths.
    a.alpha = np.array([.001, -.002, .003])
    b.alpha = np.array([-.004, .002, .001])
    q2 = rot(np.array([.2, -.4, .3]))
    forces2 = np.zeros((8, 3))
    forces2[3] = [300., -500., 700.]
    aa2, al2, _, _ = force_balance(a, b, com, v, q2, w, offsets, masses, forces2, [True]*8)
    _, _, qb2, wb2 = mapped(a, b, com, v, q2, w)
    ib2 = qb2@inertia_body@qb2.T
    direct_torque_b = np.cross(qb2@offsets[3], forces2[3])
    check("asymmetric_all_far_translation", r@aa2+k_transport(a, b, com, v),
          forces2.sum(axis=0)/sum(masses), 1e-12)
    check("asymmetric_all_far_rotation", b.alpha+r@(al2-a.alpha)+rd@(w-a.omega),
          np.linalg.solve(ib2, direct_torque_b-np.cross(wb2, ib2@wb2)), 1e-12)
    return {"t": 7.3, "moving_mouths": mouth_inputs,
            "stationary_mouths": [a0.__dict__, b0.__dict__],
            "mass_points_body": offsets, "point_masses": masses,
            "moving_all_far": {"com": com, "velocity": v, "omega": w,
                               "q_wxyz": quaternion(q),
                               "local_g_B": g_b, "acceleration_A": aa,
                               "angular_acceleration_A": alpha,
                               "acceleration_B": acceleration_b},
            "stationary_half_far": {"g_A": ga, "g_B_pulled_back": gb_unfolded,
                                    "far_point_mask": f, "com": [0, 0, 0],
                                    "velocity": v, "omega": [0, 0, 0], "q_wxyz": [1, 0, 0, 0],
                                    "acceleration": partial[0]},
            "partial_far_nozzle": {"force_unfolded": nozzle_force_a,
                                   "lever_body": offsets[7], "acceleration": powered[0],
                                   "angular_acceleration": powered[1]},
            "asymmetric_all_far": {"q_wxyz": quaternion(q2), "force_B": forces2[3],
                                   "force_point_body": offsets[3], "alpha_mouth_A": a.alpha,
                                   "alpha_mouth_B": b.alpha, "acceleration_A": aa2,
                                   "angular_acceleration_A": al2},
            "thrust_24000N_acceleration_30400kg": 24000/30400}


def sightline():
    t = 9.
    a, b = pair(t, True)
    local_hit = np.array([2., -1., 0.])
    hit = a.c+a.q@local_hit
    eye = a.c+a.q@np.array([3., -2., 80.])
    ray = (hit-eye)/np.linalg.norm(hit-eye)  # backward camera ray into A
    r, _, _ = transform(a, b)
    out = b.c+b.q@S@local_hit
    direction = r@ray
    target = out+300*direction
    check("ray_crosses_outward_B", np.sign(direction@b.q[:, 2]), 1.)
    check("ray_norm", np.linalg.norm(direction), 1.)
    target_virtual = a.c+r.T@(target-b.c)
    check("ray_inverse_projection", np.cross(target_virtual-eye, ray), [0, 0, 0], 1e-10)
    require("ray_inside_disk", np.linalg.norm(local_hit[:2]) < 12.)
    # Ray at next time against the *same* fixed remote point: an independent
    # construction via inverse mapping, not recycling the original ray.
    a2, b2 = pair(t+1, True)
    r2, _, _ = transform(a2, b2)
    virtual2 = a2.c+r2.T@(target-b2.c)
    ray2 = (virtual2-eye)/np.linalg.norm(virtual2-eye)
    n = a2.q[:, 2]
    distance = np.dot(a2.c-eye, n)/np.dot(ray2, n)
    hit2 = eye+distance*ray2
    local2 = a2.q.T@(hit2-a2.c)
    require("next_sightline_positive", distance > 0)
    require("next_sightline_inside", np.linalg.norm(local2[:2]) < 12.)
    local_length = np.linalg.norm(hit-eye)+300
    return {"optics_mode": "instantaneous geometric; no aberration or Doppler",
            "t": t, "mouths": [a.__dict__, b.__dict__], "eye_A": eye,
            "direction_A": ray, "hit_A": hit, "exit_B": out,
            "direction_B": direction, "target_B": target,
            "next_epoch": t+1, "next_direction_A": ray2,
            "next_mouths": [a2.__dict__, b2.__dict__],
            "next_rim_hit_local_A": local2,
            "one_way_local_path_length": local_length,
            "omitted_light_time": local_length/C_LIGHT,
            "max_motion_error_at_200m_per_s": 200*local_length/C_LIGHT}


def rim_fit():
    # Three labelled, non-collinear metric points recover pose; velocity design
    # matrix [I, -[r]x] recovers translation and angular velocity.
    t = 5.
    a, _ = pair(t, True)
    points = np.array([[12*math.cos(s), 12*math.sin(s), 0.] for s in (0., 1.1, 3.7, 5.2)])
    observed = (a.q@points.T).T+a.c
    velocities = np.array([a.u+np.cross(a.omega, p-a.c) for p in observed])
    x, y = points-points.mean(axis=0), observed-observed.mean(axis=0)
    u, sv, vt = np.linalg.svd(x.T@y)
    fitted_q = vt.T@np.diag([1, 1, np.linalg.det(vt.T@u.T)])@u.T
    fitted_c = observed.mean(axis=0)-fitted_q@points.mean(axis=0)
    design = np.vstack([np.hstack([I3, -skew(p-fitted_c)]) for p in observed])
    fit, _, rank, singular = np.linalg.lstsq(design, velocities.reshape(-1), rcond=None)
    check("rim_pose_fit", fitted_q, a.q, 1e-12)
    check("rim_center_fit", fitted_c, a.c, 1e-12)
    check("rim_twist_fit", fit, np.r_[a.u, a.omega], 1e-12)
    require("labelled_metric_rim_rank6", rank == 6)
    return {"assumption": "metric 3D points already reconstructed; noiseless algebra check only",
            "local_features": points, "observed_points": observed,
            "observed_velocities": velocities, "fitted_center": fitted_c,
            "fitted_q_wxyz": quaternion(fitted_q), "fitted_u_omega": fit,
            "twist_singular_values": singular,
            "unobservable_case": "featureless circle: roll about normal and roll rate absent"}


def bar_acc(x, ga=.01, gb=-.02):
    f = np.clip((x+8)/16, 0, 1)
    return ga*(1-f)+gb*f


def integrate_bar(dt, x0=-12., v0=1., ga=.01, gb=-.02, duration=30.):
    x, v = x0, v0
    steps = round(duration/dt)
    for _ in range(steps):
        a1 = bar_acc(x, ga, gb)
        k2x, k2v = v+.5*dt*a1, bar_acc(x+.5*dt*v, ga, gb)
        k3x, k3v = v+.5*dt*k2v, bar_acc(x+.5*dt*k2x, ga, gb)
        k4x, k4v = v+dt*k3v, bar_acc(x+dt*k3x, ga, gb)
        x += dt*(v+2*k2x+2*k3x+k4x)/6
        v += dt*(a1+2*k2v+2*k3v+k4v)/6
    return np.array([x, v])


def exact_bar(t):
    """First forward passage only, through this fixture's t=30 s horizon."""
    if not 0 <= t <= 30:
        raise ValueError("exact bar fixture is limited to 0..30 seconds")
    entry = (-1+math.sqrt(1.08))/.01
    ve = 1+.01*entry
    freq, equilibrium = math.sqrt(.03/16), -8/3
    def partial(tau):
        x = equilibrium+(-8-equilibrium)*math.cos(freq*tau)+ve/freq*math.sin(freq*tau)
        v = -(-8-equilibrium)*freq*math.sin(freq*tau)+ve*math.cos(freq*tau)
        return x, v
    tail = entry+bisect_first(lambda tau: partial(tau)[0] >= 8, 0., 30.)
    if t < entry:
        state = (-12+t+.005*t*t, 1+.01*t)
    elif t < tail:
        state = partial(t-entry)
    else:
        _, vt = partial(tail-entry)
        tau = t-tail
        state = (8+vt*tau-.01*tau*tau, vt-.02*tau)
    return np.array(state), entry, tail


def forecast():
    # Independent closed-form solution vs RK4, including partial mass crossing.
    truth, entry, tail = exact_bar(30.)
    sizes = [1/8, 1/16, 1/32, 1/64]
    errors = []
    for dt in sizes:
        result = integrate_bar(dt)
        errors.append(float(np.max(np.abs(result-truth))))
    require("bar_refinement_improves", errors[-1] < errors[0]/4)
    check("bar_forecast_exact_solution", integrate_bar(1/64), truth, 2e-6)
    # Belief-only input example: independent parameter uncertainties; no hidden
    # truth read. Nominal 3-sigma tube is only a local linear approximation.
    base = np.array([-12., 1., .01, -.02])
    sigma = np.array([.05, .01, .0005, .0005])
    columns = []
    for i in range(4):
        delta = np.zeros(4)
        delta[i] = 1e-5 if i < 2 else 1e-7
        plus, minus = base+delta, base-delta
        columns.append((integrate_bar(1/64, *plus)-integrate_bar(1/64, *minus))/(2*delta[i]))
    jac = np.array(columns).T
    cov = jac@np.diag(sigma*sigma)@jac.T
    a, b = pair(0)
    samples = []
    for t in (0., entry, 8., 12., tail, 24., 30.):
        (x, v), _, _ = exact_bar(t)
        xp, vp, _, _ = mapped(a, b, np.array([x, 0, 0]), np.array([v, 0, 0]))
        samples.append({"t": t, "unfolded_x_v": [x, v],
                        "mass_fraction_far": np.clip((x+8)/16, 0, 1),
                        "far_com_image": xp, "far_velocity_image": vp})
    # Default model omits topology: it ends at first hull entry, rather than
    # drawing a Euclidean line between the distant endpoints.
    return {"model_inputs": {"extension": "material-pair", "x_v_gA_gB": base,
                              "independent_sigmas": sigma, "length": 16.,
                              "mass": 30400., "gravity_profile": "constant per chart test field"},
            "stationary_mouths": [a.__dict__, b.__dict__],
            "first_material_crossing": entry, "last_material_crossing": tail,
            "without_extension_horizon": entry, "samples": samples,
            "rk4_steps": sizes, "rk4_max_state_errors": errors,
            "end_state_exact": truth, "end_state_jacobian": jac,
            "end_covariance_x_v": cov, "end_3sigma_x": 3*math.sqrt(cov[0, 0]),
            "scope": "uniform axial bar, constant local gravity; not full production ship or estimator"}


def cyclic_windows():
    # Proper C-infinity poses, both with a common period. No size change.
    period = 240.
    rate = 2*math.pi/period
    def state(t):
        phase = rate*t
        a = mouth(0, c=(4*math.sin(phase), 3*math.cos(phase), 2*math.sin(2*phase)),
                  u=(4*rate*math.cos(phase), -3*rate*math.sin(phase), 4*rate*math.cos(2*phase)),
                  omega=(0, rate, 0), q=rot(np.array([0., phase, 0.]))@QA)
        a.acc = np.array([-4*rate**2*math.sin(phase), -3*rate**2*math.cos(phase),
                          -8*rate**2*math.sin(2*phase)])
        b = mouth(0, c=(1000+2*math.cos(phase), 200, -300+math.sin(phase)),
                  u=(-2*rate*math.sin(phase), 0, rate*math.cos(phase)),
                  omega=(0, 0, -rate), q=rot(np.array([0., 0, -phase])))
        b.acc = np.array([-2*rate**2*math.cos(phase), 0, -rate**2*math.sin(phase)])
        return a, b
    for i, (a, b) in enumerate(zip(state(17.), state(257.))):
        for key in ("c", "q", "u", "omega", "acc"):
            check(f"cycle_{i}_{key}", getattr(a, key), getattr(b, key), 1e-12)
    return {"period": period, "radius": 12., "max_rim_rotation_speed": rate*12,
            "face_on_window_half_angle_degrees": 30.,
            "face_on_window_duration": period/6,
            "note": "40 s geometric face-on interval per chosen front-side orientation, not collision-certified",
            "samples": [{"t": t, "mouths": [m.__dict__ for m in state(t)]}
                        for t in (0., 40., 120., 240.)]}


def aperture_tuning():
    """Full swept silhouette for translation normal to a fixed plane."""
    def required(theta):
        return math.hypot(8*math.sin(theta)+2.5*math.cos(theta), 2.5)
    limit = bisect_first(lambda theta: required(theta) >= 6, 0., math.pi/4)
    check("candidate_normal_transit_tilt_limit", required(limit), 6., 1e-12)
    require("spacious_pair_fits_every_centered_orientation", math.sqrt(8**2+2.5**2+2.5**2) < 12)
    a, _ = pair(0)
    for t in (3.5, 4., 12., 20., 20.5):
        rows = rim_query([("stowed", HULL)], np.array([-12+t, 0., 0.]), I3, a, inner=6.)
        require(f"candidate_clean_radius6_{t}", all(not row["contact"] for row in rows))
    return {"spacious_fixture_radius": 12., "recommended_tuning_radius": 6.,
            "box_circumradius": math.sqrt(8**2+2.5**2+2.5**2),
            "straight_margin_radius6": 6-math.sqrt(12.5),
            "normal_transit_fixed_yaw_limit_radians": limit,
            "normal_transit_fixed_yaw_limit_degrees": math.degrees(limit),
            "scope": "center travels normal to static disk, fixed yaw, no offset or deployment; not a moving-pair flight window"}


def convert(obj):
    if isinstance(obj, np.ndarray):
        return [convert(v) for v in obj.tolist()]
    if isinstance(obj, np.generic):
        return convert(obj.item())
    if isinstance(obj, dict):
        return {k: convert(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [convert(v) for v in obj]
    if isinstance(obj, float):
        if not math.isfinite(obj):
            raise ValueError("non-finite vector")
        return 0.0 if abs(obj) < 5e-14 else float(f"{obj:.13g}")
    return obj


def generate():
    CHECKS.clear()
    clean, clipped, finite = crossing_geometry()
    data = {"schema": "recursion-s6-v1", "units": "SI; angles rad; quaternion w,x,y,z",
            "classification": "FICTIONAL seam; ASSUMED fixtures; DEMONSTRATED numerical checks only",
            "clean_crossing": clean, "partial_rim_clip": clipped,
            "finite_geometry_controls": finite, "moving_kinematics": kinematic_vectors(),
            "distributed_force_controls": force_vectors(), "moving_sightline": sightline(),
            "rim_measurement_fit": rim_fit(), "forecast_across_boundary": forecast(),
            "periodic_motion": cyclic_windows(), "aperture_tuning": aperture_tuning(),
            "checks": CHECKS}
    return (json.dumps(convert(data), indent=2, sort_keys=True, allow_nan=False)+"\n").encode()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="compare committed vectors without writing")
    parser.add_argument("--report", action="store_true", help="print summary without writing")
    args = parser.parse_args()
    payload = generate()
    if args.check:
        if not OUT.exists() or OUT.read_bytes() != payload:
            raise SystemExit("vectors differ; rerun reference.py and inspect the change")
    elif not args.report:
        OUT.write_bytes(payload)
    parsed = json.loads(payload)
    print(f"S6: {len(CHECKS)} checks passed; sha256 {hashlib.sha256(payload).hexdigest()}")
    print(json.dumps({"clean_clearance_m": parsed["clean_crossing"]["minimum_hole_clearance"],
                      "clip_time_s": parsed["partial_rim_clip"]["first_contact_time"],
                      "forecast": {k: parsed["forecast_across_boundary"][k] for k in
                                   ("first_material_crossing", "last_material_crossing", "rk4_max_state_errors", "end_3sigma_x")}}, indent=2))


if __name__ == "__main__":
    main()
