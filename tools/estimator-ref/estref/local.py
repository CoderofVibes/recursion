"""Tier L (spec section 5): windows of equal swept angle, short-arc local fits,
the gravity calibration profile, the forecast anchor and the forecast itself
(spec section 8)."""
from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

from .core import Attempt, BodyDef, ProfileDef, Structure, ship_states, wrap
from .fit import Param, Problem


@dataclass
class Window:
    id: str
    att: str
    index: int
    t0: float
    t1: float
    fixes: list
    powered: bool
    r_geo: float
    r_min: float
    r_max: float
    sweep: float


def powered_at(att: Attempt, t):
    return any(c.t0 <= t < c.t1 and c.u != 0.0 for c in att.commands)


def make_windows(att: Attempt, body="A", dtheta=0.7, dlnr=0.15, nmin=12, nkeep=6):
    """Spec 5.1. Cut the attempt's range+bearing fixes on `body` into windows.
    A window closes once it holds >= nmin fixes and either the bearing has swept
    >= dtheta rad or ln(range) has spanned >= dlnr; it always closes when thrust
    turns on or off. A short tail merges into the previous window of the same
    kind, or is dropped if it has < nkeep fixes."""
    fx = sorted((m for m in att.meas if m.kind == "opnav" and m.target == body and len(m.z) == 2), key=lambda m: m.t)
    groups = []
    cur, sweep = [], 0.0
    for m in fx:
        if cur and powered_at(att, m.t) != powered_at(att, cur[0].t):
            groups.append((cur, sweep, True))
            cur, sweep = [], 0.0
        if cur:
            sweep += float(wrap(m.z[0] - cur[-1].z[0]))
        cur.append(m)
        lr = [math.log(q.z[1]) for q in cur]
        if len(cur) >= nmin and (abs(sweep) >= dtheta or max(lr) - min(lr) >= dlnr):
            groups.append((cur, sweep, False))
            cur, sweep = [], 0.0
    if cur:
        if len(cur) < nmin and groups and not groups[-1][2] and powered_at(att, groups[-1][0][0].t) == powered_at(att, cur[0].t):
            prev, psw, _ = groups.pop()
            groups.append((prev + cur, psw + sweep, False))
        elif len(cur) >= nkeep:
            groups.append((cur, sweep, False))
    out = []
    for k, (g, sw, _) in enumerate(groups):
        rr = [q.z[1] for q in g]
        out.append(Window(f"{att.id}.w{k}", att.id, k, g[0].t, g[-1].t, g, powered_at(att, g[0].t),
                          float(np.exp(np.mean(np.log(rr)))), float(min(rr)), float(max(rr)), abs(sw)))
    return out


def quad_guess(fixes, t_epoch, nfix=10):
    fx = fixes[:nfix]
    ts = np.array([m.t for m in fx]) - t_epoch
    ps = np.array([[-m.z[1] * math.cos(m.z[0]), -m.z[1] * math.sin(m.z[0])] for m in fx])
    M = np.stack([np.ones_like(ts), ts, 0.5 * ts**2], axis=1)
    coef, *_ = np.linalg.lstsq(M, ps, rcond=None)
    return [coef[0, 0], coef[0, 1], coef[1, 0], coef[1, 1]]


def ship_params(aid, guess):
    sc = (1e3, 1e3, 1.0, 1.0)
    return [Param(f"{aid}.ship.{k}", float(g), s, group=aid) for k, g, s in zip(("x", "y", "vx", "vy"), guess, sc)]


def ref_structure(ref, gs=1.0, profile=None):
    """Single-body reference law with frozen globals: ref = {r0, mu, n, cam, kE, dE}."""
    return Structure(ref["r0"], ref["n"], [BodyDef("A", ref["mu"], gs=gs)], kE=ref.get("kE", 1.0), dE=ref.get("dE", 0.0),
                     cam_bias=ref.get("cam", 0.0), profile=profile)


def local_fit(ref, att: Attempt, w: Window, dt, g_prior=(1.0, 0.5)):
    """Spec 5.2: window state (4) + local gravity scale g on the reference law."""
    sub = Attempt(w.id, w.t1 + dt, att.commands, w.fixes, epoch=w.t0)
    st = ref_structure(ref, gs="{att}.g")
    params = ship_params(w.id, quad_guess(w.fixes, w.t0)) + [Param(f"{w.id}.g", g_prior[0], 1e-3, g_prior[0], g_prior[1], group=w.id)]
    res = Problem(st, [sub], params, dt).solve(np.array([p.init for p in params]))
    g, sg = res.get(f"{w.id}.g")
    return {"window": w.id, "attempt": w.att, "t0": w.t0, "t1": w.t1, "nFixes": len(w.fixes), "sweep": w.sweep,
            "rGeoMean": w.r_geo, "rMin": w.r_min, "rMax": w.r_max, "g": float(g), "sigma": float(sg),
            "chi2PerDof": float(res.chi2_nu), "converged": bool(res.converged)}


def local_fits(ref, attempts, dt, g_sigma=0.5, **kw):
    rows = []
    for a in attempts:
        for w in make_windows(a, **kw):
            if not w.powered:
                rows.append(local_fit(ref, a, w, dt, g_prior=(1.0, g_sigma)))
    return rows


def noise_scale(rows):
    """Spec 5.3: s^2 = max(1, median window chi2/nu). Short windows absorb structural
    error, so this measures sensor noise against the reported sigmas."""
    return max(1.0, float(np.median([r["chi2PerDof"] for r in rows])))


def build_profile(rows, r0, delta=0.1, curv=0.01, ridge=10.0):
    """Spec 5.4: piecewise-linear g(ln r) on nodes ln(r/r0) = b*delta, fitted to
    the window scales by weighted least squares with a second-difference
    (smoothness) penalty of sigma `curv` and a negligible ridge toward 1.
    Under-determined nodes inside the covered range then interpolate between
    their neighbours instead of collapsing to 1."""
    u = np.array([math.log(r["rGeoMean"] / r0) for r in rows])
    g = np.array([r["g"] for r in rows])
    sg = np.array([r["sigma"] for r in rows])
    rmin = min(r["rMin"] for r in rows)
    rmax = max(r["rMax"] for r in rows)
    b0 = math.floor(math.log(rmin / r0) / delta)
    b1 = math.ceil(math.log(rmax / r0) / delta)
    if b1 == b0:
        b1 += 1
    nodes = np.arange(b0, b1 + 1) * delta
    nn = len(nodes)
    A = np.zeros((len(u), nn))
    x = np.clip((u - nodes[0]) / delta, 0.0, nn - 1.0)
    i0 = np.minimum(np.floor(x).astype(int), nn - 2)
    wt = x - i0
    A[np.arange(len(u)), i0] = 1.0 - wt
    A[np.arange(len(u)), i0 + 1] = wt
    W = 1.0 / sg**2
    Hd = A.T @ (A * W[:, None])
    D = np.zeros((max(nn - 2, 0), nn))
    for i in range(nn - 2):
        D[i, i : i + 3] = (1.0, -2.0, 1.0)
    H = Hd + D.T @ D / curv**2 + np.eye(nn) / ridge**2
    c = np.linalg.solve(H, A.T @ (W * g) + np.ones(nn) / ridge**2)
    C = np.linalg.inv(H)
    chi2 = float(np.sum(W * (A @ c - g) ** 2))
    nu = max(1.0, len(u) - float(np.trace(Hd @ C)))
    infl = max(1.0, chi2 / nu)
    Ci = C * infl
    sig = np.sqrt(np.diag(Ci))
    return {"r0": r0, "delta": delta, "curvatureSigma": curv, "ridgeSigma": ridge, "uNodes": [float(v) for v in nodes], "g": [float(v) for v in c], "sigma": [float(v) for v in sig],
            "covariance": [[float(v) for v in row] for row in Ci],
            "rMin": rmin, "rMax": rmax, "chi2": chi2, "nu": nu, "inflation": infl, "nWindows": len(u)}


def profile_def(prof, dnodes=None, eta=0.0, body="A"):
    """ProfileDef for the calibrated law (reference law x profile). dnodes are
    per-node perturbation refs; eta is the hedge exponent outside coverage (spec 8.2)."""
    un = [math.log(prof["r0"]) + v for v in prof["uNodes"]]
    return ProfileDef(body, un, list(prof["g"]), prof["rMin"], prof["rMax"], dnodes=dnodes, eta=eta)


def anchor_state(ref, prof, att: Attempt, wins, dt, h=1e-3, g_prior=(1.0, 0.5), slope_sigma=0.2):
    """Spec 8.1: the present state. Fit of the most recent window(s) on the
    calibrated law (reference law x profile) with a free local scale and a
    free local slope in ln r, propagated to the last fix. The two local terms
    let the arc absorb profile error, so the state covariance is honest; a
    constant scale on the uncalibrated law hides a radial-velocity bias behind
    the range noise. Returns (t_last, state (4), covariance (4x4), fit summary)."""
    fixes = [m for w in wins for m in w.fixes]
    aid = att.id + ".anchor"
    t_first, t_last = fixes[0].t, fixes[-1].t
    u0 = float(np.mean([math.log(m.z[1]) for m in fixes]))
    sub = Attempt(aid, t_last + dt, att.commands, fixes, epoch=t_first)
    st = ref_structure(ref, gs="{att}.g", profile=None if prof is None else profile_def(prof))
    st.bodies[0].gs1 = "{att}.g1"
    st.bodies[0].gs_u0 = u0
    params = ship_params(aid, quad_guess(fixes, t_first)) + [
        Param(f"{aid}.g", g_prior[0], 1e-3, g_prior[0], g_prior[1], group=aid),
        Param(f"{aid}.g1", 0.0, 1e-2, 0.0, slope_sigma, group=aid),
    ]
    prob = Problem(st, [sub], params, dt)
    res = prob.solve(np.array([p.init for p in params]))
    q = len(res.x)
    scale = np.array([p.scale for p in params])
    X = np.tile(res.x, (2 * q + 1, 1))
    for i in range(q):
        X[1 + 2 * i, i] += h * scale[i]
        X[2 + 2 * i, i] -= h * scale[i]
    S, _ = ship_states(st, sub, X, prob.idx, dt, [t_last])
    x_now = S[0, 0]
    J = ((S[1::2, 0] - S[2::2, 0]) / (2 * h * scale)[:, None]).T  # (4, q)
    P_now = J @ res.P @ J.T
    info = {"windows": [w.id for w in wins], "tFirst": t_first, "tLast": t_last, "nFixes": len(fixes), "pivotLnR": u0,
            "g": float(res.get(f"{aid}.g")[0]), "gSigma": float(res.get(f"{aid}.g")[1]),
            "g1": float(res.get(f"{aid}.g1")[0]), "g1Sigma": float(res.get(f"{aid}.g1")[1]),
            "chi2PerDof": float(res.chi2_nu), "converged": bool(res.converged)}
    return t_last, x_now, P_now, info


def forecast(ref, prof, att: Attempt, t_last, x_now, P_now, times, dt, s2, sigma_h, engine_sigma, h=1e-3):
    """Spec 8: linearised forecast from the present state under the calibrated
    law (reference law x profile; prof = None gives the bare reference law).
    Returns mean positions relative to the gauge body and the position
    covariance split by source: state, profile (full node covariance), hedge, engine."""
    aid = att.id + ".fc"
    nb = 0 if prof is None else len(prof["uNodes"])
    names = [f"{aid}.ship.{k}" for k in ("x", "y", "vx", "vy")] + ["f.eta", "f.kE", "f.dE"] + [f"f.c{b}" for b in range(nb)]
    idx = {nm: i for i, nm in enumerate(names)}
    x = np.concatenate([x_now, [0.0, ref.get("kE", 1.0), ref.get("dE", 0.0)], np.zeros(nb)])
    scale = np.concatenate([[1e3, 1e3, 1.0, 1.0, 1e-2, 1e-3, 1e-3], np.full(nb, 1e-2)])
    pd = None if prof is None else profile_def(prof, dnodes=[f"f.c{b}" for b in range(nb)], eta="f.eta")
    st = Structure(ref["r0"], ref["n"], [BodyDef("A", ref["mu"])], kE="f.kE", dE="f.dE", cam_bias=ref.get("cam", 0.0), profile=pd)
    fsub = Attempt(aid, max(times) + dt, att.commands, [], epoch=t_last)
    q = len(x)
    X = np.tile(x, (2 * q + 1, 1))
    for i in range(q):
        X[1 + 2 * i, i] += h * scale[i]
        X[2 + 2 * i, i] -= h * scale[i]
    _, rel = ship_states(st, fsub, X, idx, dt, times)
    mean = rel[0]
    S = (rel[1::2] - rel[2::2]) / (2 * h * scale)[:, None, None]  # (q, T, 2)
    C = None if prof is None else np.array(prof["covariance"])
    out = []
    for t in range(len(times)):
        St = S[:, t, :].T  # (2, q)
        c_state = s2 * St[:, :4] @ P_now @ St[:, :4].T
        c_hedge = sigma_h**2 * np.outer(St[:, 4], St[:, 4])
        c_eng = engine_sigma[0] ** 2 * np.outer(St[:, 5], St[:, 5]) + engine_sigma[1] ** 2 * np.outer(St[:, 6], St[:, 6])
        c_prof = np.zeros((2, 2)) if prof is None else St[:, 7:] @ C @ St[:, 7:].T
        out.append({"state": c_state, "profile": c_prof, "hedge": c_hedge, "engine": c_eng, "total": c_state + c_prof + c_hedge + c_eng})
    return mean, out


def major_sigma(cov):
    return float(math.sqrt(max(np.linalg.eigvalsh(cov)[-1], 0.0)))


def mahalanobis(dev, cov):
    return float(math.sqrt(dev @ np.linalg.solve(cov, dev)))


def earned_hedge(rows_heldout, train_rmin, train_rmax, sigma_n, sigma_h0, floor=0.01):
    """Spec 7.4: a validated rule earns a smaller hedge. Uses held-out windows
    that lie outside the training coverage: delta = rms(g - 1), ell = mean
    |ln(r / nearest training edge)|. sigma_h = clamp(sqrt(sigma_n^2 + (delta/ell)^2), floor, sigma_h0)."""
    ext = []
    for r in rows_heldout:
        if r["rGeoMean"] < train_rmin:
            ext.append((r["g"] - 1.0, math.log(train_rmin / r["rGeoMean"])))
        elif r["rGeoMean"] > train_rmax:
            ext.append((r["g"] - 1.0, math.log(r["rGeoMean"] / train_rmax)))
    if not ext:
        return {"nWindowsOutside": 0, "sigmaH": sigma_h0, "note": "held-out attempt did not leave the training coverage: nothing earned"}
    delta = math.sqrt(sum(e[0] ** 2 for e in ext) / len(ext))
    ell = sum(e[1] for e in ext) / len(ext)
    val = math.sqrt(sigma_n**2 + (delta / ell) ** 2)
    return {"nWindowsOutside": len(ext), "delta": delta, "ell": ell, "sigmaH": min(sigma_h0, max(floor, val))}
