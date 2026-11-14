"""Planar dynamics and measurement prediction for the 1G estimator reference.

Everything is batched over a leading axis B so that finite-difference Jacobians
(2q+1 perturbed parameter rows) cost one vectorised propagation.

Frame and gauge (spec section 3.4): planar inertial frame in which the gauge
body (the first body, normally "A") is at the origin and at rest at t = 0 of
each attempt. Measurements are relative (ship to target), so this choice is
unobservable and only fixes the coordinates.
"""
from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

TWO_PI = 2.0 * math.pi


def wrap(a):
    """Wrap angles to [-pi, pi)."""
    return (np.asarray(a) + math.pi) % TWO_PI - math.pi


def law_accel(d, mu, n, r0):
    """Acceleration toward a source at offset d under the P4 law.

    a = (mu / r0^2) (r0 / r)^n along d / r.  d: (..., 2); mu, n broadcast to d[..., 0].
    """
    r = np.sqrt(np.einsum("...i,...i->...", d, d))
    mag = mu / (r0 * r0) * (r0 / r) ** n
    return d * (mag / r)[..., None]


# ---------------------------------------------------------------------------
# Structure definitions. A "ref" is either a float constant or a parameter name
# (a str, which may contain "{att}" to be formatted with the attempt id).
# ---------------------------------------------------------------------------


@dataclass
class BodyDef:
    id: str
    mu: object
    state: object = "gauge"  # "gauge" or (x, y, vx, vy) refs
    gs: object = 1.0  # local scale on this body's pull on the ship (Tier L, spec 5.2)
    gs1: object = 0.0  # local slope: scale = gs + gs1 * (ln r - gs_u0) (anchor fit, spec 8.1)
    gs_u0: float = 0.0


@dataclass
class EmpDef:
    """Empirical acceleration (spec 6.4): piecewise-constant radial/tangential
    components relative to body `ref`. `bounds[att]` lists window start times
    plus the final end time; window k covers [bounds[k], bounds[k+1]).
    Parameter names: "{att}.emp{k}.R", "{att}.emp{k}.T"."""

    ref: str
    bounds: dict


@dataclass
class ProfileDef:
    """Calibration profile for one body's pull on the ship (spec 5.4, 8.2).
    With u = ln r clipped to the covered range [ln rmin, ln rmax], the pull is
    multiplied by

        g(u) * exp(-eta * L(r))

    where g is piecewise-linear on `u_nodes` with node values g_nodes[b] +
    dnodes[b] (dnodes are refs: forecast perturbations, default 0), and
    L(r) = ln(r/rmax) above the covered range, ln(r/rmin) below it, 0 inside.

    Validated range (spec 7.4, 8.2): `validated` lists distance spans (lo, hi)
    over which an adopted rule passed its held-out test. The part of L that
    lies inside those spans, L_e, takes the earned exponent eta_e; the rest,
    L_d = L - L_e, takes the default exponent eta:

        g(u) * exp(-eta_e * L_e(r) - eta * L_d(r))"""

    body: str
    u_nodes: list
    g_nodes: list
    rmin: float
    rmax: float
    dnodes: list | None = None
    eta: object = 0.0
    eta_e: object = 0.0
    validated: list | None = None


@dataclass
class Structure:
    r0: float
    n: object
    bodies: list
    ship: tuple = ("{att}.ship.x", "{att}.ship.y", "{att}.ship.vx", "{att}.ship.vy")
    dynamic_bodies: bool = True
    kE: object = 1.0
    dE: object = 0.0
    kA: object = 1.0
    cam_bias: object = 0.0
    emp: EmpDef | None = None
    profile: ProfileDef | None = None

    def body_index(self, bid):
        for i, b in enumerate(self.bodies):
            if b.id == bid:
                return i
        return None


@dataclass
class Command:
    """Thrust segment [t0, t1): commanded thrust acceleration u (m/s^2) along the
    body +x axis, body +x axis at inertial angle theta (rad, star-tracker attitude)."""

    t0: float
    t1: float
    u: float
    theta: float


@dataclass
class Meas:
    t: float
    kind: str  # "opnav" (z = [bearing] or [bearing, range]) or "accel" (z = [fx, fy] body frame)
    target: str | None
    z: list
    sigma: list


@dataclass
class Attempt:
    id: str
    duration: float
    commands: list
    meas: list
    note: str = ""
    epoch: float = 0.0  # arc epoch: the ship (and body) state parameters are at this time


def resolve(ref, X, idx, att):
    """A ref is a number, a parameter name, or a tuple of refs (their sum: an
    arrival value plus a per-arc deviation, spec 3.7)."""
    if isinstance(ref, (int, float)):
        return np.full(X.shape[0], float(ref))
    if isinstance(ref, tuple):
        return sum(resolve(r, X, idx, att) for r in ref)
    return X[:, idx[ref.format(att=att)]]


def thrust_schedule(commands, dt, K):
    u = np.zeros(K + 1)
    th = np.zeros(K + 1)
    for c in commands:
        k0 = int(round(c.t0 / dt))
        k1 = int(round(c.t1 / dt))
        u[k0:k1] = c.u
        th[k0:k1] = c.theta
    return u, th


def simulate(st: Structure, att: Attempt, X, idx, dt, rec_steps):
    """Propagate bodies and ship with fixed-step RK4. Returns ({step: positions
    (B, N, 2)}, {step: velocities}, thrust arrays, resolved scalars).
    Particle order: bodies..., ship."""
    B = X.shape[0]
    a_id = att.id
    res = lambda ref: resolve(ref, X, idx, a_id)
    nb = len(st.bodies)
    N = nb + 1
    ship = nb
    K = max(rec_steps) if rec_steps else 0
    k0 = int(round(att.epoch / dt))
    u_k, th_k = thrust_schedule(att.commands, dt, K)

    mus = [res(b.mu) for b in st.bodies]
    gss = []
    for b in st.bodies:
        plain = isinstance(b.gs, (int, float)) and b.gs == 1.0 and isinstance(b.gs1, (int, float)) and b.gs1 == 0.0
        gss.append(None if plain else (res(b.gs), res(b.gs1), b.gs_u0))
    n = res(st.n)
    r0 = st.r0
    kE = res(st.kE)
    dE = res(st.dE)

    P = np.zeros((B, N, 2))
    V = np.zeros((B, N, 2))
    for i, b in enumerate(st.bodies):
        if b.state != "gauge":
            P[:, i, 0], P[:, i, 1], V[:, i, 0], V[:, i, 1] = (res(s) for s in b.state)
    P[:, ship, 0], P[:, ship, 1], V[:, ship, 0], V[:, ship, 1] = (res(s) for s in st.ship)

    dyn_bodies = st.dynamic_bodies and nb > 1

    emp = None
    if st.emp is not None:
        bnd = st.emp.bounds[a_id]
        nseg = len(bnd) - 1
        aR = np.stack([res(f"{{att}}.emp{k}.R") for k in range(nseg)], axis=1)
        aT = np.stack([res(f"{{att}}.emp{k}.T") for k in range(nseg)], axis=1)
        emp = (st.body_index(st.emp.ref), aR, aT, np.asarray(bnd[1:-1], dtype=float))

    prof = None
    if st.profile is not None:
        pf = st.profile
        G = np.tile(np.asarray(pf.g_nodes, float), (B, 1))
        if pf.dnodes is not None:
            G = G + np.stack([res(d) for d in pf.dnodes], axis=1)
        spans = [(math.log(lo), math.log(hi)) for lo, hi in (pf.validated or [])]
        prof = (st.body_index(pf.body), np.asarray(pf.u_nodes, float), G, math.log(pf.rmin), math.log(pf.rmax), res(pf.eta), res(pf.eta_e), spans)
        rows_b = np.arange(B)

    # Thrust direction is constant within a step (segments are step-aligned).
    def accel(P, k):
        A = np.zeros_like(P)
        if dyn_bodies:
            for i in range(nb):
                for j in range(nb):
                    if i != j:
                        A[:, i] += law_accel(P[:, j] - P[:, i], mus[j], n, r0)
        for j in range(nb):
            d = P[:, j] - P[:, ship]
            a = law_accel(d, mus[j], n, r0)
            if gss[j] is not None or (prof is not None and prof[0] == j):
                lr = 0.5 * np.log(np.einsum("bi,bi->b", d, d))
            if gss[j] is not None:
                g0, g1, u0 = gss[j]
                a = a * (g0 + g1 * (lr - u0))[:, None]
            if prof is not None and prof[0] == j:
                _, un, G, lmin, lmax, eta, eta_e, spans = prof
                uc = np.clip(lr, lmin, lmax)
                xq = np.clip((uc - un[0]) / (un[1] - un[0]), 0.0, len(un) - 1.0)
                i0 = np.minimum(np.floor(xq).astype(int), len(un) - 2)
                wq = xq - i0
                mult = (1.0 - wq) * G[rows_b, i0] + wq * G[rows_b, i0 + 1]
                L = np.where(lr > lmax, lr - lmax, np.where(lr < lmin, lr - lmin, 0.0))
                Le = np.zeros_like(L)
                for vlo, vhi in spans:
                    below = np.clip(np.minimum(vhi, lmin) - np.maximum(vlo, lr), 0.0, None) * (lr < lmin)
                    above = np.clip(np.minimum(vhi, lr) - np.maximum(vlo, lmax), 0.0, None) * (lr > lmax)
                    Le += above - below
                a = a * (mult * np.exp(-eta_e * Le - eta * (L - Le)))[:, None]
            A[:, ship] += a
        if u_k[k] != 0.0:
            ang = th_k[k] + dE
            A[:, ship, 0] += kE * u_k[k] * np.cos(ang)
            A[:, ship, 1] += kE * u_k[k] * np.sin(ang)
        if emp is not None:
            ref, aR, aT, inner = emp
            s = int(np.searchsorted(inner, k * dt, side="right"))
            d = P[:, ship] - P[:, ref]
            rhat = d / np.sqrt(np.einsum("bi,bi->b", d, d))[:, None]
            that = np.stack([-rhat[:, 1], rhat[:, 0]], axis=1)
            A[:, ship] += aR[:, s, None] * rhat + aT[:, s, None] * that
        return A

    recs = set(rec_steps)
    outP, outV = {}, {}
    if k0 in recs:
        outP[k0], outV[k0] = P.copy(), V.copy()
    h = dt
    for k in range(k0, K):
        a1 = accel(P, k)
        P2 = P + 0.5 * h * V
        V2 = V + 0.5 * h * a1
        a2 = accel(P2, k)
        P3 = P + 0.5 * h * V2
        V3 = V + 0.5 * h * a2
        a3 = accel(P3, k)
        P4 = P + h * V3
        V4 = V + h * a3
        a4 = accel(P4, k)
        P = P + (h / 6.0) * (V + 2 * V2 + 2 * V3 + V4)
        V = V + (h / 6.0) * (a1 + 2 * a2 + 2 * a3 + a4)
        if k + 1 in recs:
            outP[k + 1], outV[k + 1] = P.copy(), V.copy()
    scal = {"kE": kE, "dE": dE, "kA": res(st.kA), "cam": res(st.cam_bias), "u": u_k, "th": th_k}
    return outP, outV, scal


def usable(st: Structure, m: Meas):
    if m.kind == "accel":
        return True
    return st.body_index(m.target) is not None


def flatten(meas):
    """Scalar view of measurements: z, sigma, is_angle, (meas index, component)."""
    z, s, ang, meta = [], [], [], []
    for i, m in enumerate(meas):
        for c, (zc, sc) in enumerate(zip(m.z, m.sigma)):
            z.append(zc)
            s.append(sc)
            ang.append(m.kind == "opnav" and c == 0)
            meta.append((i, c))
    return np.array(z), np.array(s), np.array(ang), meta


def predict(st: Structure, att: Attempt, X, idx, meas, dt):
    """Predicted scalar measurements (B, m) for the given measurements."""
    steps = [int(round(m.t / dt)) for m in meas]
    outP, _, sc = simulate(st, att, X, idx, dt, steps)
    cols = []
    ship = len(st.bodies)
    for m, k in zip(meas, steps):
        if m.kind == "opnav":
            P = outP[k]
            d = P[:, st.body_index(m.target)] - P[:, ship]
            cols.append(np.arctan2(d[:, 1], d[:, 0]) + sc["cam"])
            if len(m.z) > 1:
                cols.append(np.sqrt(np.einsum("bi,bi->b", d, d)))
        elif m.kind == "accel":
            f = sc["kA"] * sc["kE"] * sc["u"][k]
            cols.append(f * np.cos(sc["dE"]))
            cols.append(f * np.sin(sc["dE"]))
        else:
            raise ValueError(m.kind)
    return np.stack(cols, axis=1)


def ship_states(st: Structure, att: Attempt, X, idx, dt, times):
    """Ship position and velocity (B, len(times), 4) at the given times, plus
    the gauge-body position, for forecasts and truth checkpoints."""
    steps = [int(round(t / dt)) for t in times]
    outP, outV, _ = simulate(st, att, X, idx, dt, steps)
    ship = len(st.bodies)
    S = np.stack([np.concatenate([outP[k][:, ship], outV[k][:, ship]], axis=1) for k in steps], axis=1)
    rel = np.stack([outP[k][:, ship] - outP[k][:, 0] for k in steps], axis=1)
    return S, rel
