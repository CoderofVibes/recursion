"""Tier G in 3D (spec section 4). The Levenberg-Marquardt solver, priors,
covariance and outputs are the planar reference's (`estref.fit.Problem.solve`);
only the residuals and their finite-difference Jacobian are 3D."""
from __future__ import annotations

import math

import numpy as np

from estref.fit import FitResult, FullPrior, Param, Problem, confounding  # noqa: F401  (re-exported)

from .core import Attempt, MeasPlan, Structure, residuals, simulate, usable


class Problem3(Problem):
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
            plan = MeasPlan(st, meas, dt)
            rel = [i for i, p in enumerate(params) if p.group in ("global", att.id)]
            info = []
            for (mi, c) in plan.meta:
                m = meas[mi]
                powered = any(cm.t0 <= m.t < cm.t1 and cm.powered for cm in att.commands)
                info.append((att.id, m.t, m.kind, m.target, c, powered))
            self.blocks.append(dict(att=att, meas=meas, plan=plan, rel=rel, info=info))
        self.m = sum(b["plan"].m for b in self.blocks)

    def residual(self, x):
        return np.concatenate([residuals(self.st, b["att"], x[None, :], self.idx, b["plan"], self.dt)[0] for b in self.blocks])

    def residual_and_jacobian(self, x):
        """Central differences of the whitened residuals. J = -dr/dx, so that
        H = J^T J and g = J^T r as in the planar solver."""
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
            r = residuals(self.st, blk["att"], X, self.idx, blk["plan"], self.dt)
            rs.append(r[0])
            diff = r[2::2] - r[1::2]
            J = np.zeros((blk["plan"].m, p))
            for i, k in enumerate(rel):
                J[:, k] = diff[i] / (2 * self.h * self.scale[k])
            Js.append(J)
        return np.concatenate(rs), np.concatenate(Js, axis=0)


def staged_fit(st, attempts, params, dt, fracs=(0.25, 0.5, 1.0), full_priors=(), x0=None, h=1e-3):
    """Arc growing (spec 4.5): fit the first 25%, 50%, then all of each arc."""
    x = np.array([p.init for p in params]) if x0 is None else np.array(x0, dtype=float)
    res = None
    prob = None
    for f in fracs:
        tmax = None
        if f < 1.0:
            tmax = {}
            for a in attempts:
                ts = [m.t for m in a.meas if usable(st, m)]
                if ts:
                    tmax[a.id] = min(ts) + f * (max(ts) - min(ts))
        prob = Problem3(st, attempts, params, dt, h=h, full_priors=full_priors, tmax=tmax)
        res = prob.solve(x)
        x = res.x
    return res, prob


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------


def residual_summary(prob: Problem3, fit: FitResult):
    """Spec 9.1 in 3D: whitened residual RMS split by coasting / powered and by
    direction. A bearing residual is a 2-vector in the tangent plane; it is
    resolved along the apparent motion of the line of sight (`along`: in the
    orbit plane) and across it (`normal`: out of the orbit plane). `range` is
    the third direction, along the line of sight. When a fix has no elevation
    row (planar reduction) its single bearing row is `along`."""
    rows = {}
    pos = 0
    x = fit.x[None, :]
    for blk in prob.blocks:
        plan, att = blk["plan"], blk["att"]
        m = plan.m
        r = fit.resid[pos:pos + m]
        info = blk["info"]
        outP, outV, _ = simulate(prob.st, att, x, prob.idx, prob.dt, plan.steps)
        ship = len(prob.st.bodies)
        by_meas = {}
        for j, (mi, c) in enumerate(plan.meta):
            by_meas.setdefault(mi, {})[c] = j
        pos_op = {i: j for j, i in enumerate(plan.op)}
        for mi, comps in by_meas.items():
            meas = plan.meas[mi]
            seg = "powered" if info[next(iter(comps.values()))][5] else "coast"
            if meas.kind == "accel":
                for c, j in comps.items():
                    rows.setdefault(f"{seg}.accel", []).append(r[j])
                continue
            if 2 in comps:
                rows.setdefault(f"{seg}.range", []).append(r[comps[2]])
            if 0 in comps and 1 in comps:
                j = pos_op[mi]
                k, bi = plan.op_step[j], plan.op_body[j]
                d = outP[k][0, bi] - outP[k][0, ship]
                dv = outV[k][0, bi] - outV[k][0, ship]
                p = d / math.sqrt(float(d @ d))
                a = dv - float(dv @ p) * p
                na = math.sqrt(float(a @ a))
                if na > 0:
                    a = a / na
                    nn = np.cross(p, a)
                    e, nth = plan.eE[j], plan.eN[j]
                    sE, sN = plan.sigE[j], plan.sigN[j]
                    # unwhitened tangent residual, then whitened along each direction
                    tv = r[comps[0]] * sE * e + r[comps[1]] * sN * nth
                    for lab, u in (("along", a), ("normal", nn)):
                        su = math.sqrt((sE * float(u @ e)) ** 2 + (sN * float(u @ nth)) ** 2)
                        rows.setdefault(f"{seg}.{lab}", []).append(float(tv @ u) / su)
                else:
                    rows.setdefault(f"{seg}.along", []).append(r[comps[0]])
                    rows.setdefault(f"{seg}.normal", []).append(r[comps[1]])
            elif 0 in comps:
                rows.setdefault(f"{seg}.along", []).append(r[comps[0]])
            elif 1 in comps:
                rows.setdefault(f"{seg}.normal", []).append(r[comps[1]])
        pos += m
    out = {}
    for seg in ("coast", "powered"):
        for lab in ("along", "normal", "range", "accel"):
            v = rows.get(f"{seg}.{lab}")
            if v:
                rr = np.array(v)
                out[f"{seg}.{lab}"] = {"n": len(v), "rms": float(np.sqrt(np.mean(rr**2))), "mean": float(np.mean(rr))}
    return out


def heldout_consistency(st, train_fit: FitResult, train_params, heldout: Attempt, local_params, dt, k=3.0):
    """Spec 7.2, unchanged in form: the held-out arc's local parameters are
    fitted with the training posterior of the globals as a block prior."""
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
