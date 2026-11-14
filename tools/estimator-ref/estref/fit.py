"""Tier G (spec section 4): batch weighted least squares (Levenberg-Marquardt)
with priors and covariance, plus diagnostics and held-out consistency."""
from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

from .core import Attempt, Structure, flatten, predict, usable, wrap


@dataclass
class Param:
    name: str
    init: float
    scale: float
    prior_mean: float | None = None
    prior_sigma: float | None = None
    group: str = "global"  # "global" or an attempt id (local)


@dataclass
class FullPrior:
    names: list
    mean: np.ndarray
    info: np.ndarray  # inverse covariance


@dataclass
class FitResult:
    names: list
    x: np.ndarray
    P: np.ndarray
    chi2: float
    prior_cost: float
    m: int
    p_eff: float
    iters: int
    converged: bool
    resid: np.ndarray  # whitened residuals (z - h) / sigma
    resid_meta: list  # (attempt id, t, kind, target, component, powered)

    @property
    def sigma(self):
        return np.sqrt(np.diag(self.P))

    @property
    def nu(self):
        return self.m - self.p_eff

    @property
    def chi2_nu(self):
        return self.chi2 / self.nu

    def get(self, name):
        i = self.names.index(name)
        return self.x[i], math.sqrt(self.P[i, i])

    def corr(self, a, b):
        i, j = self.names.index(a), self.names.index(b)
        return self.P[i, j] / math.sqrt(self.P[i, i] * self.P[j, j])

    def corr_matrix(self):
        s = self.sigma
        return self.P / np.outer(s, s)


class Problem:
    def __init__(self, st: Structure, attempts, params, dt, h=1e-3, full_priors=(), tmax=None):
        self.st = st
        self.params = params
        self.names = [p.name for p in params]
        self.idx = {p.name: i for i, p in enumerate(params)}
        self.scale = np.array([p.scale for p in params])
        self.dt = dt
        self.h = h
        self.full_priors = list(full_priors)
        self.blocks = []
        for att in attempts:
            meas = [m for m in att.meas if usable(st, m) and (tmax is None or m.t <= tmax.get(att.id, 1e99))]
            if not meas:
                continue
            z, s, ang, meta = flatten(meas)
            rel = [i for i, p in enumerate(params) if p.group in ("global", att.id)]
            info = []
            for (mi, c) in meta:
                m = meas[mi]
                powered = any(cm.t0 <= m.t < cm.t1 and cm.u != 0 for cm in att.commands)
                info.append((att.id, m.t, m.kind, m.target, c, powered))
            self.blocks.append(dict(att=att, meas=meas, z=z, s=s, ang=ang, rel=rel, info=info))
        self.m = sum(len(b["z"]) for b in self.blocks)

    # -- residuals and Jacobian -------------------------------------------------
    def _resid(self, blk, pred):
        r = blk["z"] - pred
        r = np.where(blk["ang"], wrap(r), r)
        return r / blk["s"]

    def residual(self, x):
        out = []
        for blk in self.blocks:
            pred = predict(self.st, blk["att"], x[None, :], self.idx, blk["meas"], self.dt)[0]
            out.append(self._resid(blk, pred))
        return np.concatenate(out)

    def residual_and_jacobian(self, x):
        rs, Js = [], []
        p = len(x)
        for blk in self.blocks:
            rel = blk["rel"]
            q = len(rel)
            X = np.tile(x, (2 * q + 1, 1))
            for i, k in enumerate(rel):
                step = self.h * self.scale[k]
                X[1 + 2 * i, k] += step
                X[2 + 2 * i, k] -= step
            pred = predict(self.st, blk["att"], X, self.idx, blk["meas"], self.dt)
            rs.append(self._resid(blk, pred[0]))
            diff = pred[1::2] - pred[2::2]
            diff = np.where(blk["ang"][None, :], wrap(diff), diff)
            J = np.zeros((len(blk["z"]), p))
            for i, k in enumerate(rel):
                J[:, k] = diff[i] / (2 * self.h * self.scale[k]) / blk["s"]
            Js.append(J)
        return np.concatenate(rs), np.concatenate(Js, axis=0)

    # -- priors -------------------------------------------------------------------
    def prior_terms(self, x):
        p = len(x)
        H = np.zeros((p, p))
        g = np.zeros(p)
        cost = 0.0
        for i, prm in enumerate(self.params):
            if prm.prior_sigma is not None:
                w = 1.0 / prm.prior_sigma**2
                H[i, i] += w
                g[i] += w * (prm.prior_mean - x[i])
                cost += w * (x[i] - prm.prior_mean) ** 2
        for fp in self.full_priors:
            I = [self.idx[nm] for nm in fp.names]
            dx = x[I] - fp.mean
            H[np.ix_(I, I)] += fp.info
            g[I] += -fp.info @ dx
            cost += float(dx @ fp.info @ dx)
        return H, g, cost

    # -- solver -------------------------------------------------------------------
    def solve(self, x0, maxit=60, tol=1e-3, verbose=False):
        x = np.array(x0, dtype=float)
        S = self.scale
        r, J = self.residual_and_jacobian(x)
        Hp, gp, cp = self.prior_terms(x)
        cost = float(r @ r) + cp
        lam = 1e-3
        converged = False
        it = 0
        for it in range(1, maxit + 1):
            Js = J * S
            H = Js.T @ Js + S[:, None] * Hp * S[None, :]
            g = Js.T @ r + S * gp
            D = np.maximum(np.diag(H), 1e-12 * max(1.0, np.max(np.diag(H))))
            accepted = False
            for _ in range(12):
                delta = np.linalg.solve(H + lam * np.diag(D), g)
                xn = x + S * delta
                rn = self.residual(xn)
                _, _, cpn = self.prior_terms(xn)
                cn = float(rn @ rn) + cpn
                if cn <= cost:
                    accepted = True
                    break
                lam *= 10.0
            if not accepted:
                converged = True  # no descent available: at a minimum to working precision
                break
            Pinv_s = np.linalg.inv(H)
            step_sig = np.max(np.abs(delta) / np.sqrt(np.maximum(np.diag(Pinv_s), 1e-300)))
            dcost = cost - cn
            if verbose:
                print(f"  it {it} cost {cn:.6g} dcost {dcost:.3g} step/sigma {step_sig:.3g} lam {lam:.1e}")
            x, cost = xn, cn
            lam = max(lam / 10.0, 1e-12)
            r, J = self.residual_and_jacobian(x)
            Hp, gp, cp = self.prior_terms(x)
            if step_sig < tol or (dcost < 1e-9 * max(cost, 1.0) and step_sig < 0.1):
                converged = True
                break
        Js = J * S
        Hd = Js.T @ Js
        H = Hd + S[:, None] * Hp * S[None, :]
        Hi = np.linalg.inv(H)
        P = S[:, None] * Hi * S[None, :]
        p_eff = float(np.trace(Hd @ Hi))
        meta = [inf for blk in self.blocks for inf in blk["info"]]
        return FitResult(self.names, x, P, float(r @ r), cp, self.m, p_eff, it, converged, r, meta)


def staged_fit(st, attempts, params, dt, fracs=(0.25, 0.5, 1.0), full_priors=(), x0=None, h=1e-3):
    """Arc-growing initialisation (spec 4.5): fit the first 25%, 50%, then all of
    each attempt's data, each stage starting from the previous solution."""
    x = np.array([p.init for p in params]) if x0 is None else np.array(x0, dtype=float)
    res = None
    for f in fracs:
        tmax = None
        if f < 1.0:
            tmax = {}
            for a in attempts:
                ts = [m.t for m in a.meas if usable(st, m)]
                if ts:
                    tmax[a.id] = min(ts) + f * (max(ts) - min(ts))
        prob = Problem(st, attempts, params, dt, h=h, full_priors=full_priors, tmax=tmax)
        res = prob.solve(x)
        x = res.x
    return res, None


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------


def residual_summary(fit: FitResult):
    """Spec 9.1: whitened residual RMS split by coasting / powered and type."""
    out = {}
    for seg in ("coast", "powered"):
        for kind, comp, label in (("opnav", 0, "bearing"), ("opnav", 1, "range"), ("accel", None, "accel")):
            sel = [
                i
                for i, (_, _, k, _, c, pw) in enumerate(fit.resid_meta)
                if k == kind and (comp is None or c == comp) and pw == (seg == "powered")
            ]
            if sel:
                rr = fit.resid[sel]
                out[f"{seg}.{label}"] = {"n": len(sel), "rms": float(np.sqrt(np.mean(rr**2))), "mean": float(np.mean(rr))}
    return out


def confounding(fit: FitResult, gravity, propulsion, prior_sigmas):
    """Spec 9.3: max |rho| over (gravity, propulsion) pairs, plus each propulsion
    parameter's posterior/prior sigma ratio (1 = data taught nothing)."""
    pairs = []
    for g in gravity:
        for q in propulsion:
            if g in fit.names and q in fit.names:
                pairs.append((g, q, fit.corr(g, q)))
    rmax = max((abs(p[2]) for p in pairs), default=0.0)
    ratios = {q: fit.get(q)[1] / prior_sigmas[q] for q in propulsion if q in fit.names}
    return {"pairs": [{"gravity": g, "propulsion": q, "rho": r} for g, q, r in pairs], "maxAbsRho": rmax, "posteriorOverPrior": ratios}


def heldout_consistency(st, train_fit: FitResult, train_params, heldout: Attempt, local_params, dt, k=3.0):
    """Spec 7.2: fit the held-out attempt's local parameters together with the
    global parameters, using the training posterior of the globals as a full
    Gaussian prior. T = chi2_data + prior penalty; nu = m - p_local.
    Pass if T/nu <= 1 + k sqrt(2/nu)."""
    gl = [p for p in train_params if p.group == "global"]
    gl_names = [p.name for p in gl]
    gi = [train_fit.names.index(nm) for nm in gl_names]
    mean = train_fit.x[gi]
    cov = train_fit.P[np.ix_(gi, gi)]
    info = np.linalg.inv(cov)
    gparams = [Param(p.name, float(mean[i]), p.scale) for i, p in enumerate(gl)]
    params = list(local_params) + gparams
    fp = FullPrior(gl_names, mean, info)
    res, _ = staged_fit(st, [heldout], params, dt, full_priors=[fp])
    nu = res.m - len(local_params)
    T = res.chi2 + res.prior_cost
    thr = 1.0 + k * math.sqrt(2.0 / nu)
    shift = {nm: (res.get(nm)[0] - mean[i]) / math.sqrt(cov[i, i]) for i, nm in enumerate(gl_names)}
    return {"T": T, "nu": nu, "TperNu": T / nu, "threshold": thr, "pass": bool(T / nu <= thr), "chi2Data": res.chi2, "priorPenalty": res.prior_cost, "globalShiftSigma": shift}
