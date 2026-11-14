"""Shared helpers: assumptions, truth construction, measurement generation,
initial guesses, parameter builders and JSON summaries."""
from __future__ import annotations

import json
import math
import os

import numpy as np

from .core import Attempt, BodyDef, Meas, Structure, predict, ship_states
from .fit import Param, residual_summary

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_assumptions():
    with open(os.path.join(HERE, "assumptions.json"), encoding="utf-8") as f:
        return json.load(f)


AS = load_assumptions()
R0 = AS["gravity"]["r0"]
MU_A = AS["bodies"]["A"]["mu"]
R_A = AS["bodies"]["A"]["radius"]
MU_B = AS["bodies"]["B"]["mu"]
R_B = AS["bodies"]["B"]["radius"]
SEP = AS["bodies"]["B"]["separation"]
DT = AS["integrator"]["dt"]
FD = AS["integrator"]["fdStep"]
CAM = AS["camera"]
ST_SIG = AS["starTracker"]["sigma"]
ACC = AS["accelerometer"]
TS = AS["truthShip"]
PR = AS["priors"]
RADIUS = {"A": R_A, "B": R_B}

# ---------------------------------------------------------------------------
# Orbits under the P4 law
# ---------------------------------------------------------------------------


def accel_mag(mu, n, r):
    return mu / R0**2 * (R0 / r) ** n


def potential(mu, n, r):
    """Phi with a = -dPhi/dr toward the source; K = mu r0^(n-2)."""
    K = mu * R0 ** (n - 2.0)
    return -K / ((n - 1.0) * r ** (n - 1.0))


def circ_speed(mu, n, r):
    return math.sqrt(accel_mag(mu, n, r) * r)


def peri_speed(mu, n, rp, ra):
    return math.sqrt(2.0 * (potential(mu, n, ra) - potential(mu, n, rp)) / (1.0 - (rp / ra) ** 2))


def state_at(r, v, ang):
    """Prograde (counter-clockwise) state at polar angle ang, velocity perpendicular."""
    return (r * math.cos(ang), r * math.sin(ang), -v * math.sin(ang), v * math.cos(ang))


def binary_rel_state(n, phase):
    """Secondary B relative to primary A for a circular binary (A-gauge)."""
    mu_tot = MU_A + MU_B
    w = math.sqrt(accel_mag(mu_tot, n, SEP) / SEP)
    return state_at(SEP, w * SEP, phase), w


# ---------------------------------------------------------------------------
# Truth structures and values
# ---------------------------------------------------------------------------


def truth_structure(binary=False):
    bodies = [BodyDef("A", "truth.muA")]
    if binary:
        bodies.append(BodyDef("B", "truth.muB", ("{att}.B.x", "{att}.B.y", "{att}.B.vx", "{att}.B.vy")))
    return Structure(R0, "truth.n", bodies, kE="truth.kE", dE="truth.dE", kA="truth.kA", cam_bias="truth.cam")


def truth_values(n, ship_states_by_att, b_states_by_att=None, kE=None):
    v = {
        "truth.n": n,
        "truth.muA": MU_A,
        "truth.muB": MU_B,
        "truth.kE": TS["kE"] if kE is None else kE,
        "truth.dE": TS["dE"],
        "truth.kA": TS["kA"],
        "truth.cam": TS["camBias"],
    }
    for a, s in ship_states_by_att.items():
        for k, val in zip(("x", "y", "vx", "vy"), s):
            v[f"{a}.ship.{k}"] = val
    for a, s in (b_states_by_att or {}).items():
        for k, val in zip(("x", "y", "vx", "vy"), s):
            v[f"{a}.B.{k}"] = val
    return v


def vec(values):
    names = list(values)
    return names, np.array([[values[k] for k in names]]), {k: i for i, k in enumerate(names)}


# ---------------------------------------------------------------------------
# Sensor models (spec section 2)
# ---------------------------------------------------------------------------


def opnav_sigma(rho, radius, power=1.0, cond=1.0):
    """Bearing and range sigma for one optical fix. Returns (sigma_b, sigma_rho or None)."""
    ifov = CAM["ifov"]
    sc = CAM["centroidPxFine"] / math.sqrt(power) if power >= CAM["pMinFine"] else CAM["centroidPxCoarse"]
    mcond = 1.0 + CAM["kDamage"] * (1.0 - cond)
    sb = math.hypot(sc * ifov * mcond, ST_SIG)
    alpha = 2.0 * math.asin(min(1.0, radius / rho))
    if alpha < CAM["minResolvedPx"] * ifov:
        return sb, None
    nlimb = max(1.0, CAM["limbFraction"] * math.pi * min(alpha, CAM["fov"]) / ifov)
    s_alpha = sc * ifov * mcond / math.sqrt(nlimb)
    srel = math.hypot(CAM["rangeFloor"], s_alpha / alpha)
    return sb, rho * srel


def accel_sigma():
    return ACC["vrw"] / math.sqrt(ACC["sampleInterval"])


def make_measurements(st, att: Attempt, values, rng, schedule, accel_times=()):
    """schedule: list of (t, target, with_range). Noise drawn in schedule order,
    then accelerometer samples. Returns (noisy meas, noise-free meas)."""
    names, X, idx = vec(values)
    tmpl = []
    for t, tgt, wr in schedule:
        tmpl.append(Meas(float(t), "opnav", tgt, [0.0, 0.0] if wr else [0.0], [1.0, 1.0] if wr else [1.0]))
    for t in accel_times:
        tmpl.append(Meas(float(t), "accel", None, [0.0, 0.0], [1.0, 1.0]))
    exact = predict(st, att, X, idx, tmpl, DT)[0]
    noisy, clean = [], []
    c = 0
    for m in tmpl:
        if m.kind == "opnav":
            b = exact[c]
            if len(m.z) == 2:
                rho = exact[c + 1]
                sb, sr = opnav_sigma(rho, RADIUS[m.target])
                bn = b + rng.normal(0.0, sb)
                rn = rho + rng.normal(0.0, sr)
                sb_rep, sr_rep = opnav_sigma(rn, RADIUS[m.target])
                noisy.append(Meas(m.t, "opnav", m.target, [wrap1(bn), rn], [sb_rep, sr_rep]))
                clean.append(Meas(m.t, "opnav", m.target, [wrap1(b), rho], [sb_rep, sr_rep]))
                c += 2
            else:
                sb, _ = opnav_sigma(1e99, RADIUS[m.target])
                bn = b + rng.normal(0.0, sb)
                noisy.append(Meas(m.t, "opnav", m.target, [wrap1(bn)], [sb]))
                clean.append(Meas(m.t, "opnav", m.target, [wrap1(b)], [sb]))
                c += 1
        else:
            s = accel_sigma()
            f = exact[c : c + 2]
            noisy.append(Meas(m.t, "accel", None, [f[0] + rng.normal(0, s), f[1] + rng.normal(0, s)], [s, s]))
            clean.append(Meas(m.t, "accel", None, [f[0], f[1]], [s, s]))
            c += 2
    return noisy, clean


def wrap1(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def schedule(t0, t1, every, target="A", with_range=True):
    return [(t, target, with_range) for t in np.arange(t0, t1 + 1e-9, every)]


def truth_checkpoints(st, att, values, times):
    names, X, idx = vec(values)
    S, rel = ship_states(st, att, X, idx, DT, times)
    return [{"t": float(t), "shipRelA": [float(rel[0, i, 0]), float(rel[0, i, 1])], "shipState": [float(v) for v in S[0, i]]} for i, t in enumerate(times)]


def truth_convergence(st, att, values, times):
    """Max position difference between dt and truthCheckDt propagations (m)."""
    names, X, idx = vec(values)
    _, rel1 = ship_states(st, att, X, idx, DT, times)
    fine = AS["integrator"]["truthCheckDt"]
    _, rel2 = ship_states(st, att, X, idx, fine, times)
    return float(np.max(np.abs(rel1 - rel2)))


# ---------------------------------------------------------------------------
# Initial guesses from the first fixes (spec 4.5)
# ---------------------------------------------------------------------------


def quad_fit(ts, ps, t_eval=0.0):
    ts = np.asarray(ts) - t_eval
    M = np.stack([np.ones_like(ts), ts, 0.5 * ts**2], axis=1)
    coef, *_ = np.linalg.lstsq(M, np.asarray(ps), rcond=None)
    return coef[0], coef[1]


def guess_ship(att: Attempt, nfix=10, t_epoch=0.0):
    fx = [m for m in att.meas if m.kind == "opnav" and m.target == "A" and len(m.z) == 2][:nfix]
    ts = [m.t for m in fx]
    ps = np.array([[-m.z[1] * math.cos(m.z[0]), -m.z[1] * math.sin(m.z[0])] for m in fx])
    p0, v0 = quad_fit(ts, ps, t_epoch)
    return [p0[0], p0[1], v0[0], v0[1]]


def guess_body(att: Attempt, target, nfix=8):
    """Seen body: ship (from the quadratic ship guess) plus measured offset."""
    fxA = [m for m in att.meas if m.kind == "opnav" and m.target == "A" and len(m.z) == 2][:10]
    tsA = np.array([m.t for m in fxA])
    psA = np.array([[-m.z[1] * math.cos(m.z[0]), -m.z[1] * math.sin(m.z[0])] for m in fxA])
    M = np.stack([np.ones_like(tsA), tsA, 0.5 * tsA**2], axis=1)
    coef, *_ = np.linalg.lstsq(M, psA, rcond=None)
    fx = [m for m in att.meas if m.kind == "opnav" and m.target == target and len(m.z) == 2][:nfix]
    ts = np.array([m.t for m in fx])
    ship = np.stack([np.ones_like(ts), ts, 0.5 * ts**2], axis=1) @ coef
    ps = ship + np.array([[m.z[1] * math.cos(m.z[0]), m.z[1] * math.sin(m.z[0])] for m in fx])
    M2 = np.stack([np.ones_like(ts), ts], axis=1)
    c2, *_ = np.linalg.lstsq(M2, ps, rcond=None)
    return [c2[0, 0], c2[0, 1], c2[1, 0], c2[1, 1]]


# ---------------------------------------------------------------------------
# Parameter builders (names are the contract with the vectors; spec 3.6)
# ---------------------------------------------------------------------------


def p_ship(att_id, guess):
    sc = (1e3, 1e3, 1.0, 1.0)
    return [Param(f"{att_id}.ship.{k}", float(g), s, group=att_id) for k, g, s in zip(("x", "y", "vx", "vy"), guess, sc)]


def p_body_state(att_id, body, guess):
    sc = (1e3, 1e3, 0.1, 0.1)
    return [Param(f"{att_id}.{body}.{k}", float(g), s, group=att_id) for k, g, s in zip(("x", "y", "vx", "vy"), guess, sc)]


def p_muA():
    return Param("mu.A", PR["muA"]["mean"], 1e-3 * MU_A, PR["muA"]["mean"], PR["muA"]["sigma"])


def p_muB(init=1.0e9):
    return Param("mu.B", init, 1e-3 * MU_B, PR["muExtraBody"]["mean"], PR["muExtraBody"]["sigma"])


def p_n():
    return Param("law.n", PR["nFree"]["mean"], 1e-3, PR["nFree"]["mean"], PR["nFree"]["sigma"])


def p_cam():
    return Param("camera.bias", 0.0, 1e-5, PR["camBias"]["mean"], PR["camBias"]["sigma"])


def p_engine():
    return [
        Param("engine.kE", PR["kE"]["mean"], 1e-3, PR["kE"]["mean"], PR["kE"]["sigma"]),
        Param("engine.dE", PR["dE"]["mean"], 1e-3, PR["dE"]["mean"], PR["dE"]["sigma"]),
    ]


def p_kA():
    return Param("accel.kA", PR["kA"]["mean"], 1e-4, PR["kA"]["mean"], PR["kA"]["sigma"])


def p_emp(att_id, nseg):
    """nseg = len(bounds) - 1 windows."""
    out = []
    for k in range(nseg):
        for c in ("R", "T"):
            out.append(Param(f"{att_id}.emp{k}.{c}", 0.0, 1e-6, PR["emp"]["mean"], PR["emp"]["sigma"], group=att_id))
    return out


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------


def ref_json(ref):
    if isinstance(ref, (int, float)):
        return float(ref)
    return {"param": ref}


def structure_json(st: Structure):
    out = {
        "law": {"form": "P4", "r0": st.r0, "exponent": ref_json(st.n)},
        "bodies": [
            {"id": b.id, "mu": ref_json(b.mu), "state": "gauge" if b.state == "gauge" else [ref_json(s) for s in b.state], "localScale": ref_json(b.gs)}
            for b in st.bodies
        ],
        "dynamicBodies": bool(st.dynamic_bodies and len(st.bodies) > 1),
        "ship": [ref_json(s) for s in st.ship],
        "engine": {"kE": ref_json(st.kE), "dE": ref_json(st.dE)},
        "accelScale": ref_json(st.kA),
        "cameraBias": ref_json(st.cam_bias),
    }
    if st.emp is not None:
        out["empirical"] = {"frameBody": st.emp.ref, "bounds": {k: [float(v) for v in b] for k, b in st.emp.bounds.items()}, "params": "{att}.emp{k}.R / .T"}
    if st.profile is not None:
        pf = st.profile
        out["profile"] = {"body": pf.body, "lnRNodes": [float(v) for v in pf.u_nodes], "g": [float(v) for v in pf.g_nodes], "rMin": pf.rmin, "rMax": pf.rmax}
    return out


def meas_json(m: Meas):
    d = {"t": m.t, "kind": m.kind}
    if m.target is not None:
        d["target"] = m.target
    d["z"] = [float(v) for v in m.z]
    d["sigma"] = [float(v) for v in m.sigma]
    return d


def attempt_json(a: Attempt):
    return {
        "id": a.id,
        "note": a.note,
        "duration": a.duration,
        "epoch": a.epoch,
        "commands": [{"t0": c.t0, "t1": c.t1, "u": c.u, "theta": c.theta} for c in a.commands],
        "measurements": [meas_json(m) for m in a.meas],
    }


def params_json(params):
    return [
        {
            "name": p.name,
            "group": p.group,
            "init": p.init,
            "prior": None if p.prior_sigma is None else {"mean": p.prior_mean, "sigma": p.prior_sigma},
        }
        for p in params
    ]


def fit_json(fit, params, corr_names=None):
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
        "residualSummary": residual_summary(fit),
    }


def chi2_band(nu, k=3.0):
    return 1.0 - k * math.sqrt(2.0 / nu), 1.0 + k * math.sqrt(2.0 / nu)


class Checks:
    def __init__(self):
        self.items = []

    def add(self, cid, claim, value, ok, label="DEMONSTRATED: reference generator"):
        self.items.append({"id": cid, "claim": claim, "value": value, "pass": bool(ok), "label": f"[{label}]"})
        return ok

    def failed(self):
        return [c for c in self.items if not c["pass"]]
