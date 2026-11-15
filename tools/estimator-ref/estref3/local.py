"""Tier L in 3D (spec section 5) and the forecast (spec section 8).

Windows of equal swept angle, short-arc local fits with a 6-state, the present
state and the forecast with a 3x3 position covariance per sample. The
calibration profile, the noise scale, the earned hedge and the validated spans
are the planar reference's: they are functions of the scalar distance only."""
from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

from estref.local import build_profile, earned_hedge, merge_spans, noise_scale  # noqa: F401  (radial: reused unchanged)

from .common import STATE, has_range, los, quad_fit
from .core import Attempt, BodyDef, ProfileDef, Structure, ship_states
from .fit import Param, Problem3


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
    normal: list  # unit sweep vector: the axis the line of sight turned about
    direction: list  # mean direction of the ship as seen from the body


def powered_at(att: Attempt, t):
    return any(c.t0 <= t < c.t1 and c.powered for c in att.commands)


def sweep_step(a, b):
    """Rotation vector of the line of sight between two fixes: the angle between
    the two unit vectors, along a x b. Planar data give wrap(delta bearing) z."""
    c = np.cross(a, b)
    s = math.sqrt(float(c @ c))
    if s == 0.0:
        return np.zeros(3)
    return (math.atan2(s, float(a @ b)) / s) * c


def make_windows(att: Attempt, body="A", dtheta=0.7, dlnr=0.15, nmin=12, nkeep=6):
    """Spec 5.1 in 3D. The sweep is a vector: the sum of the line of sight's
    rotation vectors between consecutive fixes. A window closes once it holds
    >= nmin fixes and either |sweep| >= dtheta or ln(range) has spanned >= dlnr;
    it always closes when thrust turns on or off."""
    fx = sorted((m for m in att.meas if has_range(m) and m.target == body), key=lambda m: m.t)
    groups = []
    cur, sweep = [], np.zeros(3)
    for m in fx:
        if cur and powered_at(att, m.t) != powered_at(att, cur[0].t):
            groups.append((cur, sweep, True))
            cur, sweep = [], np.zeros(3)
        if cur:
            sweep = sweep + sweep_step(los(cur[-1]), los(m))
        cur.append(m)
        lr = [math.log(q.z[2]) for q in cur]
        if len(cur) >= nmin and (math.sqrt(float(sweep @ sweep)) >= dtheta or max(lr) - min(lr) >= dlnr):
            groups.append((cur, sweep, False))
            cur, sweep = [], np.zeros(3)
    if cur:
        if len(cur) < nmin and groups and not groups[-1][2] and powered_at(att, groups[-1][0][0].t) == powered_at(att, cur[0].t):
            prev, psw, _ = groups.pop()
            # the step between the two groups was never added to either
            groups.append((prev + cur, psw + sweep, False))
        elif len(cur) >= nkeep:
            groups.append((cur, sweep, False))
    out = []
    for k, (g, sw, _) in enumerate(groups):
        rr = [q.z[2] for q in g]
        mag = math.sqrt(float(sw @ sw))
        nrm = sw / mag if mag > 0 else np.zeros(3)
        dsum = -np.sum([los(q) for q in g], axis=0)
        dn = math.sqrt(float(dsum @ dsum))
        out.append(Window(f"{att.id}.w{k}", att.id, k, g[0].t, g[-1].t, g, powered_at(att, g[0].t),
                          float(np.exp(np.mean(np.log(rr)))), float(min(rr)), float(max(rr)), mag,
                          [float(v) for v in nrm], [float(v) for v in (dsum / dn if dn > 0 else dsum)]))
    return out


def quad_guess(fixes, t_epoch, nfix=10):
    fx = fixes[:nfix]
    coef = quad_fit([m.t for m in fx], np.array([-m.z[2] * los(m) for m in fx]), t_epoch)
    return [float(c) for c in (*coef[0], *coef[1])]


def ship_params(aid, guess, planar=False):
    """Six state parameters; `planar` holds z and vz at zero (planar reduction)."""
    sc = (1e3, 1e3, 1e3, 1.0, 1.0, 1.0)
    keep = (0, 1, 3, 4) if planar else range(6)
    return [Param(f"{aid}.ship.{STATE[i]}", float(guess[i]), sc[i], group=aid) for i in keep]


def ship_refs(planar=False):
    if planar:
        return ("{att}.ship.x", "{att}.ship.y", 0.0, "{att}.ship.vx", "{att}.ship.vy", 0.0)
    return tuple("{att}.ship." + k for k in STATE)


def cam_of(ref):
    c = ref.get("cam", 0.0)
    return (0.0, 0.0, float(c)) if isinstance(c, (int, float)) else tuple(float(v) for v in c)


def ref_structure(ref, gs=1.0, profile=None, planar=False):
    """Single-body reference law with frozen globals: ref = {r0, mu, n, cam, kE, dE, dP}.
    `cam` is a number (the z component) or [x, y, z]."""
    return Structure(ref["r0"], ref["n"], [BodyDef("A", ref["mu"], gs=gs)], ship=ship_refs(planar),
                     kE=ref.get("kE", 1.0), dE=ref.get("dE", 0.0), dP=ref.get("dP", 0.0), cam_bias=cam_of(ref), profile=profile)


def local_fit(ref, att: Attempt, w: Window, dt, g_prior=(1.0, 0.5), planar=False):
    """Spec 5.2: window state (6) + local gravity scale g on the reference law."""
    sub = Attempt(w.id, w.t1 + dt, att.commands, w.fixes, epoch=w.t0)
    st = ref_structure(ref, gs="{att}.g", planar=planar)
    params = ship_params(w.id, quad_guess(w.fixes, w.t0), planar) + [Param(f"{w.id}.g", g_prior[0], 1e-3, g_prior[0], g_prior[1], group=w.id)]
    res = Problem3(st, [sub], params, dt).solve(np.array([p.init for p in params]))
    g, sg = res.get(f"{w.id}.g")
    return {"window": w.id, "attempt": w.att, "t0": w.t0, "t1": w.t1, "nFixes": len(w.fixes), "sweep": w.sweep,
            "rGeoMean": w.r_geo, "rMin": w.r_min, "rMax": w.r_max, "direction": w.direction, "planeNormal": w.normal,
            "g": float(g), "sigma": float(sg), "chi2PerDof": float(res.chi2_nu), "converged": bool(res.converged)}


def local_fits(ref, attempts, dt, g_sigma=0.5, planar=False, **kw):
    rows = []
    for a in attempts:
        for w in make_windows(a, **kw):
            if not w.powered:
                rows.append(local_fit(ref, a, w, dt, g_prior=(1.0, g_sigma), planar=planar))
    return rows


def profile_def(prof, dnodes=None, eta=0.0, eta_e=0.0, validated=None, body="A"):
    un = [math.log(prof["r0"]) + v for v in prof["uNodes"]]
    return ProfileDef(body, un, list(prof["g"]), prof["rMin"], prof["rMax"], dnodes=dnodes, eta=eta, eta_e=eta_e,
                      validated=merge_spans(validated) if validated else None)


def anchor_state(ref, prof, att: Attempt, wins, dt, h=1e-3, g_prior=(1.0, 0.5), slope_sigma=0.2, planar=False, cam_sigma=None):
    """Spec 8.1: the present state. Fit of the most recent window(s) on the
    calibrated law with a free local scale and slope in ln r, propagated to the
    last fix. `cam_sigma` (three numbers) carries the camera misalignment as
    three more parameters held by a prior at the reference value: the unknown
    orientation of the picture then is part of the state covariance. Returns
    (t_last, state (6), covariance (6x6), fit summary)."""
    fixes = [m for w in wins for m in w.fixes]
    aid = att.id + ".anchor"
    t_first, t_last = fixes[0].t, fixes[-1].t
    u0 = float(np.mean([math.log(m.z[2]) for m in fixes]))
    sub = Attempt(aid, t_last + dt, att.commands, fixes, epoch=t_first)
    st = ref_structure(ref, gs="{att}.g", profile=None if prof is None else profile_def(prof), planar=planar)
    st.bodies[0].gs1 = "{att}.g1"
    st.bodies[0].gs_u0 = u0
    params = ship_params(aid, quad_guess(fixes, t_first), planar) + [
        Param(f"{aid}.g", g_prior[0], 1e-3, g_prior[0], g_prior[1], group=aid),
        Param(f"{aid}.g1", 0.0, 1e-2, 0.0, slope_sigma, group=aid),
    ]
    if cam_sigma is not None:
        c0 = cam_of(ref)
        st.cam_bias = tuple("{att}.cam." + k for k in ("x", "y", "z"))
        params += [Param(f"{aid}.cam.{k}", c0[i], 1e-5, c0[i], cam_sigma[i], group=aid) for i, k in enumerate(("x", "y", "z"))]
    prob = Problem3(st, [sub], params, dt)
    res = prob.solve(np.array([p.init for p in params]))
    q = len(res.x)
    scale = np.array([p.scale for p in params])
    X = np.tile(res.x, (2 * q + 1, 1))
    for i in range(q):
        X[1 + 2 * i, i] += h * scale[i]
        X[2 + 2 * i, i] -= h * scale[i]
    S, _ = ship_states(st, sub, X, prob.idx, dt, [t_last])
    x_now = S[0, 0]
    J = ((S[1::2, 0] - S[2::2, 0]) / (2 * h * scale)[:, None]).T  # (6, q)
    P_now = J @ res.P @ J.T
    info = {"windows": [w.id for w in wins], "tFirst": t_first, "tLast": t_last, "nFixes": len(fixes), "pivotLnR": u0,
            "g": float(res.get(f"{aid}.g")[0]), "gSigma": float(res.get(f"{aid}.g")[1]),
            "g1": float(res.get(f"{aid}.g1")[0]), "g1Sigma": float(res.get(f"{aid}.g1")[1]),
            "chi2PerDof": float(res.chi2_nu), "converged": bool(res.converged)}
    return t_last, x_now, P_now, info


SOURCES = ("state", "profile", "hedgeEarned", "hedgeDefault", "engine", "mu")


def forecast(ref, prof, att: Attempt, t_last, x_now, P_now, times, dt, s2, sigma_h, engine_sigma, h=1e-3,
             validated=None, sigma_e=None, mu_sigma=0.0):
    """Spec 8: linearised forecast from the present state under the calibrated
    law. Returns the mean position relative to the gauge body (T, 3) and, per
    sample, the 3x3 position covariance split by source. `engine_sigma` is
    (sigma kE, sigma dE, sigma dP)."""
    aid = att.id + ".fc"
    nb = 0 if prof is None else len(prof["uNodes"])
    names = [f"{aid}.ship.{k}" for k in STATE] + ["f.eta", "f.etaE", "f.kE", "f.dE", "f.dP", "f.mu"] + [f"f.c{b}" for b in range(nb)]
    idx = {nm: i for i, nm in enumerate(names)}
    x = np.concatenate([x_now, [0.0, 0.0, ref.get("kE", 1.0), ref.get("dE", 0.0), ref.get("dP", 0.0), ref["mu"]], np.zeros(nb)])
    scale = np.concatenate([[1e3, 1e3, 1e3, 1.0, 1.0, 1.0, 1e-2, 1e-2, 1e-3, 1e-3, 1e-3, 1e-3 * ref["mu"]], np.full(nb, 1e-2)])
    pd = None if prof is None else profile_def(prof, dnodes=[f"f.c{b}" for b in range(nb)], eta="f.eta", eta_e="f.etaE", validated=validated)
    st = Structure(ref["r0"], ref["n"], [BodyDef("A", "f.mu")], kE="f.kE", dE="f.dE", dP="f.dP", cam_bias=cam_of(ref), profile=pd)
    fsub = Attempt(aid, max(times) + dt, att.commands, [], epoch=t_last)
    q = len(x)
    X = np.tile(x, (2 * q + 1, 1))
    for i in range(q):
        X[1 + 2 * i, i] += h * scale[i]
        X[2 + 2 * i, i] -= h * scale[i]
    _, rel = ship_states(st, fsub, X, idx, dt, times)
    mean = rel[0]
    S = (rel[1::2] - rel[2::2]) / (2 * h * scale)[:, None, None]  # (q, T, 3)
    C = None if prof is None else np.array(prof["covariance"])
    se = sigma_h if sigma_e is None else sigma_e
    out = []
    for t in range(len(times)):
        St = S[:, t, :].T  # (3, q)
        c = {
            "state": s2 * St[:, :6] @ P_now @ St[:, :6].T,
            "hedgeDefault": sigma_h**2 * np.outer(St[:, 6], St[:, 6]),
            "hedgeEarned": se**2 * np.outer(St[:, 7], St[:, 7]),
            "engine": sum(engine_sigma[i] ** 2 * np.outer(St[:, 8 + i], St[:, 8 + i]) for i in range(3)),
            "mu": mu_sigma**2 * np.outer(St[:, 11], St[:, 11]),
            "profile": np.zeros((3, 3)) if prof is None else St[:, 12:] @ C @ St[:, 12:].T,
        }
        c["hedge"] = c["hedgeDefault"] + c["hedgeEarned"]
        c["total"] = c["state"] + c["profile"] + c["hedge"] + c["engine"] + c["mu"]
        out.append(c)
    return mean, out


def major_sigma(cov):
    """Square root of the largest eigenvalue: the longest semi-axis of the
    1-sigma ellipsoid. For a planar covariance this is the planar ellipse's."""
    return float(math.sqrt(max(np.linalg.eigvalsh(cov)[-1], 0.0)))


def major_axis(cov):
    w, v = np.linalg.eigh(cov)
    a = v[:, -1]
    return a if a[np.argmax(np.abs(a))] > 0 else -a


def mahalanobis(dev, cov):
    """Distance of dev from zero in sigmas. Directions in which the covariance
    is exactly zero (a planar covariance lifted to 3D) are left out."""
    w, v = np.linalg.eigh(cov)
    keep = w > 1e-12 * max(w[-1], 1e-300)
    y = v[:, keep].T @ dev
    return float(math.sqrt(np.sum(y * y / w[keep])))
