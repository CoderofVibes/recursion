"""Shared helpers for the 3D vectors: assumptions, orbit planes, truth
construction, measurement generation, initial guesses, parameter builders and
JSON summaries."""
from __future__ import annotations

import json
import math
import os

import numpy as np

from estref.common import (  # noqa: F401  (dimension-free pieces, re-exported)
    ACC, AS, CAM, DT, FD, MU_A, MU_B, PR, R0, RADIUS, R_A, R_B, SEP, TS,
    Checks, accel_mag, accel_sigma, chi2_band, circ_speed, opnav_sigma, params_json, peri_speed, potential, ref_json, vec,
)

from . import quat as Q
from .core import Attempt, BodyDef, Meas, Structure, azel_from_unit, east_north, exact_measurements, ship_states
from .fit import Param, residual_summary

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

with open(os.path.join(HERE, "assumptions-3d.json"), encoding="utf-8") as _f:
    AS3 = json.load(_f)

TS3 = AS3["truthShip"]
PR3 = AS3["priors"]
SEEDS = AS3["seeds"]
XYZ = ("x", "y", "z")
STATE = ("x", "y", "z", "vx", "vy", "vz")

# ---------------------------------------------------------------------------
# Orbit planes
# ---------------------------------------------------------------------------


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def plane(inc_deg, node_deg):
    """Rotation taking the x-y plane to an orbit plane with the given
    inclination and ascending-node longitude (degrees)."""
    return rot_z(math.radians(node_deg)) @ rot_x(math.radians(inc_deg))


def orbit_state(r, v, ang, Rpl):
    """Prograde state at polar angle `ang` in the plane Rpl, velocity perpendicular."""
    p = Rpl @ np.array([r * math.cos(ang), r * math.sin(ang), 0.0])
    w = Rpl @ np.array([-v * math.sin(ang), v * math.cos(ang), 0.0])
    return tuple(float(c) for c in (*p, *w))


def binary_rel_state(n, phase, Rpl):
    """Secondary B relative to primary A for a circular binary in the plane Rpl."""
    mu_tot = MU_A + MU_B
    w = math.sqrt(accel_mag(mu_tot, n, SEP) / SEP)
    return orbit_state(SEP, w * SEP, phase, Rpl), w


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / math.sqrt(float(v @ v))


def angle(a, b):
    a, b = unit(a), unit(b)
    return math.atan2(float(np.linalg.norm(np.cross(a, b))), float(a @ b))


def orbit_normal(state):
    s = np.asarray(state, dtype=float)
    return unit(np.cross(s[:3], s[3:]))


# ---------------------------------------------------------------------------
# Truth structures and values
# ---------------------------------------------------------------------------

B_REFS = tuple("{att}.B." + k for k in STATE)


def truth_structure(binary=False):
    bodies = [BodyDef("A", "truth.muA")]
    if binary:
        bodies.append(BodyDef("B", "truth.muB", B_REFS))
    return Structure(R0, "truth.n", bodies, kE="truth.kE", dE="truth.dE", dP="truth.dP", kA="truth.kA", kR="truth.kR",
                     cam_bias=("truth.cam.x", "truth.cam.y", "truth.cam.z"))


def truth_values(n, ship_states_by_att, b_states_by_att=None, **over):
    v = {
        "truth.n": n,
        "truth.muA": MU_A,
        "truth.muB": MU_B,
        "truth.kE": TS["kE"],
        "truth.dE": TS["dE"],
        "truth.dP": TS3["dP"],
        "truth.kA": TS["kA"],
        "truth.kR": TS3["kR"],
        "truth.cam.x": TS3["camBias"][0],
        "truth.cam.y": TS3["camBias"][1],
        "truth.cam.z": TS3["camBias"][2],
    }
    for k, val in over.items():
        v["truth." + k.replace("_", ".")] = val
    for a, s in ship_states_by_att.items():
        for k, val in zip(STATE, s):
            v[f"{a}.ship.{k}"] = float(val)
    for a, s in (b_states_by_att or {}).items():
        for k, val in zip(STATE, s):
            v[f"{a}.B.{k}"] = float(val)
    return v


# ---------------------------------------------------------------------------
# Sensor models (spec section 2)
# ---------------------------------------------------------------------------


def noisy_direction(p, e1, e2):
    """Unit vector displaced from p by tangent-plane errors e1 (east), e2 (north):
    an isotropic pointing error, exact on the sphere and defined at the poles."""
    az, el = azel_from_unit(p)
    east, north = east_north(az, el)
    v = e1 * east + e2 * north
    a = math.sqrt(float(v @ v))
    if a == 0.0:
        return p
    return math.cos(a) * p + math.sin(a) * v / a


def fix_sigma(sb, el):
    """Reported bearing sigma per component: sigma_az = sigma_b / cos(el), sigma_el = sigma_b."""
    return [sb / math.cos(el), sb]


def make_measurements(st, att: Attempt, values, rng, schedule, accel_times=(), attitude=None):
    """schedule: list of (t, target, with_range). Noise is drawn in schedule
    order (east, north, range per fix), then accelerometer samples (x, y, z).
    `attitude(t)` gives the recorded attitude attached to each fix (None =
    identity). Returns (noisy measurements, noise-free measurements)."""
    names, X, idx = vec(values)
    tmpl = []
    for t, tgt, wr in schedule:
        q = None if attitude is None else tuple(float(c) for c in attitude(float(t)))
        tmpl.append(Meas(float(t), "opnav", tgt, [0.0, 0.0, 1.0] if wr else [0.0, 0.0], [1.0, 1.0, 1.0] if wr else [1.0, 1.0], q))
    for t in accel_times:
        tmpl.append(Meas(float(t), "accel", None, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0]))
    exact = exact_measurements(st, att, X, idx, tmpl, DT)
    noisy, clean = [], []
    for m, ex in zip(tmpl, exact):
        if m.kind == "opnav":
            p, rho = ex
            az0, el0 = (float(v) for v in azel_from_unit(p))
            wr = len(m.z) == 3
            sb, sr = opnav_sigma(rho if wr else 1e99, RADIUS[m.target])
            mdir = noisy_direction(p, rng.normal(0.0, sb), rng.normal(0.0, sb))
            az, el = (float(v) for v in azel_from_unit(mdir))
            if wr:
                rn = rho + rng.normal(0.0, sr)
                sb_rep, sr_rep = opnav_sigma(rn, RADIUS[m.target])
                noisy.append(Meas(m.t, "opnav", m.target, [az, el, rn], fix_sigma(sb_rep, el) + [sr_rep], m.q))
                clean.append(Meas(m.t, "opnav", m.target, [az0, el0, rho], fix_sigma(sb_rep, el0) + [sr_rep], m.q))
            else:
                noisy.append(Meas(m.t, "opnav", m.target, [az, el], fix_sigma(sb, el), m.q))
                clean.append(Meas(m.t, "opnav", m.target, [az0, el0], fix_sigma(sb, el0), m.q))
        else:
            s = accel_sigma()
            f = [float(c) for c in ex]
            noisy.append(Meas(m.t, "accel", None, [c + rng.normal(0.0, s) for c in f], [s, s, s]))
            clean.append(Meas(m.t, "accel", None, f, [s, s, s]))
    return noisy, clean


def schedule(t0, t1, every, target="A", with_range=True):
    return [(t, target, with_range) for t in np.arange(t0, t1 + 1e-9, every)]


def truth_checkpoints(st, att, values, times):
    names, X, idx = vec(values)
    S, rel = ship_states(st, att, X, idx, DT, times)
    return [{"t": float(t), "shipRelA": [float(v) for v in rel[0, i]], "shipState": [float(v) for v in S[0, i]]} for i, t in enumerate(times)]


def truth_convergence(st, att, values, times):
    """Max position difference between dt and truthCheckDt propagations (m)."""
    names, X, idx = vec(values)
    _, rel1 = ship_states(st, att, X, idx, DT, times)
    _, rel2 = ship_states(st, att, X, idx, AS["integrator"]["truthCheckDt"], times)
    return float(np.max(np.abs(rel1 - rel2)))


# ---------------------------------------------------------------------------
# Initial guesses from the first fixes (spec 4.5)
# ---------------------------------------------------------------------------


def los(m):
    az, el = m.z[0], m.z[1]
    ce = math.cos(el)
    return np.array([ce * math.cos(az), ce * math.sin(az), math.sin(el)])


def has_range(m):
    return m.kind == "opnav" and len(m.z) == 3 and m.sigma[2] is not None


def quad_fit(ts, ps, t_eval=0.0):
    ts = np.asarray(ts) - t_eval
    M = np.stack([np.ones_like(ts), ts, 0.5 * ts**2], axis=1)
    coef, *_ = np.linalg.lstsq(M, np.asarray(ps), rcond=None)
    return coef


def guess_ship(att: Attempt, nfix=10, t_epoch=0.0, body="A"):
    fx = [m for m in att.meas if has_range(m) and m.target == body][:nfix]
    coef = quad_fit([m.t for m in fx], np.array([-m.z[2] * los(m) for m in fx]), t_epoch)
    return [float(c) for c in (*coef[0], *coef[1])]


def guess_body(att: Attempt, target, nfix=8, body="A"):
    """Seen body: ship (from the quadratic ship guess) plus the measured offset."""
    fxA = [m for m in att.meas if has_range(m) and m.target == body][:10]
    coef = quad_fit([m.t for m in fxA], np.array([-m.z[2] * los(m) for m in fxA]))
    fx = [m for m in att.meas if has_range(m) and m.target == target][:nfix]
    ts = np.array([m.t for m in fx])
    ship = np.stack([np.ones_like(ts), ts, 0.5 * ts**2], axis=1) @ coef
    ps = ship + np.array([m.z[2] * los(m) for m in fx])
    M2 = np.stack([np.ones_like(ts), ts], axis=1)
    c2, *_ = np.linalg.lstsq(M2, ps, rcond=None)
    return [float(c) for c in (*c2[0], *c2[1])]


# ---------------------------------------------------------------------------
# Parameter builders (names are the contract with the vectors; spec 3.6)
# ---------------------------------------------------------------------------


def p_ship(att_id, guess):
    sc = (1e3, 1e3, 1e3, 1.0, 1.0, 1.0)
    return [Param(f"{att_id}.ship.{k}", float(g), s, group=att_id) for k, g, s in zip(STATE, guess, sc)]


def p_body_state(att_id, body, guess):
    sc = (1e3, 1e3, 1e3, 0.1, 0.1, 0.1)
    return [Param(f"{att_id}.{body}.{k}", float(g), s, group=att_id) for k, g, s in zip(STATE, guess, sc)]


def p_muA(mean=None, sigma=None, scale=None):
    mean = PR["muA"]["mean"] if mean is None else mean
    return Param("mu.A", mean, 1e-3 * MU_A if scale is None else scale, mean, PR["muA"]["sigma"] if sigma is None else sigma)


def p_muB(init=1.0e9):
    return Param("mu.B", init, 1e-3 * MU_B, PR["muExtraBody"]["mean"], PR["muExtraBody"]["sigma"])


def p_n():
    return Param("law.n", PR["nFree"]["mean"], 1e-3, PR["nFree"]["mean"], PR["nFree"]["sigma"])


CAM_REFS = ("camera.bias.x", "camera.bias.y", "camera.bias.z")


def p_cam():
    """Camera misalignment: rotation vector in the body frame. The z component
    is the planar `camera.bias`."""
    sx = PR3["camBiasXY"]
    sz = PR["camBias"]
    return [
        Param("camera.bias.x", 0.0, 1e-5, sx["mean"], sx["sigma"]),
        Param("camera.bias.y", 0.0, 1e-5, sx["mean"], sx["sigma"]),
        Param("camera.bias.z", 0.0, 1e-5, sz["mean"], sz["sigma"]),
    ]


def p_engine():
    return [
        Param("engine.kE", PR["kE"]["mean"], 1e-3, PR["kE"]["mean"], PR["kE"]["sigma"]),
        Param("engine.dE", PR["dE"]["mean"], 1e-3, PR["dE"]["mean"], PR["dE"]["sigma"]),
        Param("engine.dP", PR3["dP"]["mean"], 1e-3, PR3["dP"]["mean"], PR3["dP"]["sigma"]),
    ]


def p_kA():
    return Param("accel.kA", PR["kA"]["mean"], 1e-4, PR["kA"]["mean"], PR["kA"]["sigma"])


def p_kR():
    return Param("rcs.kR", PR3["kR"]["mean"], 1e-3, PR3["kR"]["mean"], PR3["kR"]["sigma"])


def p_emp(att_id, nseg):
    out = []
    for k in range(nseg):
        for c in ("R", "T", "N"):
            out.append(Param(f"{att_id}.emp{k}.{c}", 0.0, 1e-6, PR["emp"]["mean"], PR["emp"]["sigma"], group=att_id))
    return out


# ---------------------------------------------------------------------------
# JSON helpers (spec Appendix A)
# ---------------------------------------------------------------------------


def structure_json(st: Structure):
    out = {
        "law": {"form": "P4", "r0": st.r0, "exponent": ref_json(st.n)},
        "bodies": [
            {"id": b.id, "mu": ref_json(b.mu), "state": "gauge" if b.state == "gauge" else [ref_json(s) for s in b.state], "localScale": ref_json(b.gs)}
            for b in st.bodies
        ],
        "dynamicBodies": bool(st.dynamic_bodies and len(st.bodies) > 1),
        "ship": [ref_json(s) for s in st.ship],
        "engine": {"kE": ref_json(st.kE), "dE": ref_json(st.dE), "dP": ref_json(st.dP)},
        "rcsScale": ref_json(st.kR),
        "accelScale": ref_json(st.kA),
        "cameraBias": [ref_json(c) for c in st.cam_bias],
    }
    if st.emp is not None:
        out["empirical"] = {"frameBody": st.emp.ref, "bounds": {k: [float(v) for v in b] for k, b in st.emp.bounds.items()}, "params": "{att}.emp{k}.R / .T / .N"}
    if st.profile is not None:
        pf = st.profile
        out["profile"] = {"body": pf.body, "lnRNodes": [float(v) for v in pf.u_nodes], "g": [float(v) for v in pf.g_nodes], "rMin": pf.rmin, "rMax": pf.rmax}
    return out


def meas_json(m: Meas):
    d = {"t": m.t, "kind": m.kind}
    if m.target is not None:
        d["target"] = m.target
    d["z"] = [float(v) for v in m.z]
    d["sigma"] = [None if v is None else float(v) for v in m.sigma]
    if m.q is not None:
        d["q"] = [float(v) for v in m.q]
    return d


def command_json(c):
    d = {"t0": c.t0, "t1": c.t1, "u": c.u, "q": [float(v) for v in c.q]}
    if any(v != 0.0 for v in c.rcs):
        d["rcs"] = [float(v) for v in c.rcs]
    return d


def attempt_json(a: Attempt):
    return {
        "id": a.id,
        "note": a.note,
        "duration": a.duration,
        "epoch": a.epoch,
        "commands": [command_json(c) for c in a.commands],
        "measurements": [meas_json(m) for m in a.meas],
    }


def fit_json(fit, prob, params, corr_names=None):
    corr_names = corr_names or [p.name for p in params if p.group == "global"]
    ci = [fit.names.index(n) for n in corr_names]
    C = fit.corr_matrix()[np.ix_(ci, ci)]
    return {
        "estimate": {n: float(v) for n, v in zip(fit.names, fit.x)},
        "sigma": {n: float(s) for n, s in zip(fit.names, fit.sigma)},
        "correlation": {"names": corr_names, "matrix": [[float(v) for v in row] for row in C]},
        "chi2": fit.chi2,
        "priorCost": fit.prior_cost,
        "m": fit.m,
        "pEff": fit.p_eff,
        "nu": fit.nu,
        "chi2PerDof": fit.chi2_nu,
        "converged": fit.converged,
        "residualSummary": residual_summary(prob, fit),
    }


def cov6(c):
    """Symmetric 3x3 as [xx, xy, xz, yy, yz, zz] (the contracts' Cov3)."""
    return [float(c[0, 0]), float(c[0, 1]), float(c[0, 2]), float(c[1, 1]), float(c[1, 2]), float(c[2, 2])]


def state_block(fit, att_id, who="ship"):
    """Estimate and covariance of one 6-state from a fit."""
    ii = [fit.names.index(f"{att_id}.{who}.{k}") for k in STATE]
    return fit.x[ii], fit.P[np.ix_(ii, ii)]


def mahalanobis(dev, cov):
    dev = np.asarray(dev, dtype=float)
    return float(math.sqrt(dev @ np.linalg.solve(cov, dev)))


def quat_of_matrix(R):
    return [float(v) for v in Q.from_matrix(R)]
