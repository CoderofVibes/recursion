"""Three-dimensional dynamics and measurement residuals for the estimator
reference (spec revision 3).

Everything is batched over a leading axis B so that finite-difference Jacobians
(2q+1 perturbed parameter rows) cost one vectorised propagation.

Frame and gauge (spec 3.4): right-handed inertial frame in which the gauge body
(the first body, normally "A") is at the origin and at rest at the arc epoch.
Body frame: +x forward (main-engine push), +y left, +z up. Attitude is a unit
quaternion, body to inertial, scalar first.

Planar data (z = 0, rotations about +z, elevation 0) give the planar reference's
numbers to rounding: every formula here reduces to `estref.core`.
"""
from __future__ import annotations

from dataclasses import dataclass
import math

import numpy as np

from . import quat as Q

# ---------------------------------------------------------------------------
# Gravity law (P4): unchanged in form, r is the 3D distance.
# ---------------------------------------------------------------------------


def law_accel(d, mu, n, r0):
    """a = (mu / r0^2) (r0 / r)^n along d / r.  d: (..., 3)."""
    r = np.sqrt(np.einsum("...i,...i->...", d, d))
    mag = mu / (r0 * r0) * (r0 / r) ** n
    return d * (mag / r)[..., None]


# ---------------------------------------------------------------------------
# Structure definitions. A "ref" is a float constant, a parameter name (a str,
# which may contain "{att}") or a tuple of refs (their sum, spec 3.7).
# ---------------------------------------------------------------------------

SHIP_REFS = tuple("{att}.ship." + k for k in ("x", "y", "z", "vx", "vy", "vz"))


@dataclass
class BodyDef:
    id: str
    mu: object
    state: object = "gauge"  # "gauge" or (x, y, z, vx, vy, vz) refs
    gs: object = 1.0  # local scale on this body's pull on the ship (Tier L, spec 5.2)
    gs1: object = 0.0  # local slope: scale = gs + gs1 * (ln r - gs_u0) (present state, spec 8.1)
    gs_u0: float = 0.0


@dataclass
class EmpDef:
    """Empirical acceleration (spec 6.4): piecewise-constant radial, tangential
    and orbit-normal components relative to body `ref`. `bounds[att]` lists
    window start times plus the final end time. Parameter names
    "{att}.emp{k}.R", ".T", ".N"; `normal = False` holds N at zero (the planar
    reduction)."""

    ref: str
    bounds: dict
    normal: bool = True


@dataclass
class ProfileDef:
    """Calibration profile for one body's pull on the ship (spec 5.4, 8.2).
    Indexed by the scalar distance only, exactly as in the planar reference:
    g(u) * exp(-eta_e * L_e(r) - eta * L_d(r)), u = ln r."""

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
    ship: tuple = SHIP_REFS
    dynamic_bodies: bool = True
    kE: object = 1.0  # main-engine scale
    dE: object = 0.0  # misalignment about body +z (tilts thrust toward +y): the planar angle
    dP: object = 0.0  # misalignment about body -y (tilts thrust toward +z)
    kA: object = 1.0  # accelerometer scale
    kR: object = 1.0  # RCS translation scale
    cam_bias: tuple = (0.0, 0.0, 0.0)  # camera-to-star-tracker rotation vector, body frame; planar camera.bias is z
    emp: EmpDef | None = None
    profile: ProfileDef | None = None

    def body_index(self, bid):
        for i, b in enumerate(self.bodies):
            if b.id == bid:
                return i
        return None


@dataclass
class Command:
    """Thrust segment [t0, t1). `u`: commanded main-engine acceleration along
    body +x (m/s^2). `q`: recorded attitude over the segment (body to inertial).
    `rcs`: commanded RCS translation acceleration, body frame (m/s^2)."""

    t0: float
    t1: float
    u: float
    q: tuple = Q.IDENTITY
    rcs: tuple = (0.0, 0.0, 0.0)

    @property
    def powered(self):
        return self.u != 0.0 or any(c != 0.0 for c in self.rcs)


@dataclass
class Meas:
    """kind "opnav": z = [azimuth, elevation] or [azimuth, elevation, range];
    kind "accel": z = [fx, fy, fz] body frame. A component whose sigma is None
    is not used (the planar reduction drops elevation and f_z). `q` is the
    recorded attitude at the fix (None = identity); it is needed only by the
    camera misalignment."""

    t: float
    kind: str
    target: str | None
    z: list
    sigma: list
    q: tuple | None = None


@dataclass
class Attempt:
    id: str
    duration: float
    commands: list
    meas: list
    note: str = ""
    epoch: float = 0.0


def resolve(ref, X, idx, att):
    if isinstance(ref, (int, float)):
        return np.full(X.shape[0], float(ref))
    if isinstance(ref, tuple):
        return sum(resolve(r, X, idx, att) for r in ref)
    return X[:, idx[ref.format(att=att)]]


def is_zero(ref):
    return isinstance(ref, (int, float)) and ref == 0.0


def thrust_schedule(commands, dt, K):
    u = np.zeros(K + 1)
    C = np.tile(np.eye(3), (K + 1, 1, 1))
    rcs = np.zeros((K + 1, 3))
    for c in commands:
        k0 = int(round(c.t0 / dt))
        k1 = int(round(c.t1 / dt))
        u[k0:k1] = c.u
        C[k0:k1] = Q.rotmat(c.q)
        rcs[k0:k1] = c.rcs
    return u, C, rcs


def thrust_dir_body(dE, dP):
    """Unit thrust direction in the body frame: +x turned by dE about +z and by
    dP about -y, i.e. azimuth dE and elevation dP in the body frame."""
    cp = np.cos(dP)
    return np.stack([cp * np.cos(dE), cp * np.sin(dE), np.sin(dP)], axis=1)


def rotate_small(w, v):
    """Rotate v by the rotation vector w (Rodrigues). w, v: (..., 3)."""
    a2 = np.einsum("...i,...i->...", w, w)
    a = np.sqrt(a2)
    small = a < 1e-12
    safe = np.where(small, 1.0, a)
    s = np.where(small, 1.0, np.sin(safe) / safe)
    c = np.where(small, 0.5, (1.0 - np.cos(safe)) / (safe * safe))
    wv = np.cross(w, v)
    return v + s[..., None] * wv + c[..., None] * np.cross(w, wv)


def simulate(st: Structure, att: Attempt, X, idx, dt, rec_steps):
    """Propagate bodies and ship with fixed-step RK4. Returns ({step: positions
    (B, N, 3)}, {step: velocities}, resolved scalars). Particle order: bodies..., ship."""
    B = X.shape[0]
    a_id = att.id
    res = lambda ref: resolve(ref, X, idx, a_id)
    nb = len(st.bodies)
    N = nb + 1
    ship = nb
    K = max(rec_steps) if rec_steps else 0
    k0 = int(round(att.epoch / dt))
    u_k, C_k, rcs_k = thrust_schedule(att.commands, dt, K)
    has_rcs = bool(np.any(rcs_k != 0.0))

    mus = [res(b.mu) for b in st.bodies]
    gss = []
    for b in st.bodies:
        plain = isinstance(b.gs, (int, float)) and b.gs == 1.0 and isinstance(b.gs1, (int, float)) and b.gs1 == 0.0
        gss.append(None if plain else (res(b.gs), res(b.gs1), b.gs_u0))
    n = res(st.n)
    r0 = st.r0
    kE = res(st.kE)
    kR = res(st.kR)
    tb = thrust_dir_body(res(st.dE), res(st.dP))  # (B, 3)

    P = np.zeros((B, N, 3))
    V = np.zeros((B, N, 3))
    for i, b in enumerate(st.bodies):
        if b.state != "gauge":
            vals = [res(s) for s in b.state]
            for c in range(3):
                P[:, i, c] = vals[c]
                V[:, i, c] = vals[3 + c]
    vals = [res(s) for s in st.ship]
    for c in range(3):
        P[:, ship, c] = vals[c]
        V[:, ship, c] = vals[3 + c]

    dyn_bodies = st.dynamic_bodies and nb > 1

    emp = None
    if st.emp is not None:
        bnd = st.emp.bounds[a_id]
        nseg = len(bnd) - 1
        aR = np.stack([res(f"{{att}}.emp{k}.R") for k in range(nseg)], axis=1)
        aT = np.stack([res(f"{{att}}.emp{k}.T") for k in range(nseg)], axis=1)
        aN = np.stack([res(f"{{att}}.emp{k}.N") for k in range(nseg)], axis=1) if st.emp.normal else np.zeros_like(aR)
        emp = (st.body_index(st.emp.ref), aR, aT, aN, np.asarray(bnd[1:-1], dtype=float))

    prof = None
    if st.profile is not None:
        pf = st.profile
        G = np.tile(np.asarray(pf.g_nodes, float), (B, 1))
        if pf.dnodes is not None:
            G = G + np.stack([res(d) for d in pf.dnodes], axis=1)
        spans = [(math.log(lo), math.log(hi)) for lo, hi in (pf.validated or [])]
        prof = (st.body_index(pf.body), np.asarray(pf.u_nodes, float), G, math.log(pf.rmin), math.log(pf.rmax), res(pf.eta), res(pf.eta_e), spans)
        rows_b = np.arange(B)

    # Thrust is constant within a step (segments are step-aligned).
    def accel(P, V, k):
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
            A[:, ship] += (kE * u_k[k])[:, None] * (tb @ C_k[k].T)
        if has_rcs and np.any(rcs_k[k] != 0.0):
            A[:, ship] += kR[:, None] * (C_k[k] @ rcs_k[k])[None, :]
        if emp is not None:
            ref, aR, aT, aN, inner = emp
            s = int(np.searchsorted(inner, k * dt, side="right"))
            d = P[:, ship] - P[:, ref]
            rhat = d / np.sqrt(np.einsum("bi,bi->b", d, d))[:, None]
            h = np.cross(d, V[:, ship] - V[:, ref])
            nhat = h / np.sqrt(np.einsum("bi,bi->b", h, h))[:, None]
            that = np.cross(nhat, rhat)
            A[:, ship] += aR[:, s, None] * rhat + aT[:, s, None] * that + aN[:, s, None] * nhat
        return A

    recs = set(rec_steps)
    outP, outV = {}, {}
    if k0 in recs:
        outP[k0], outV[k0] = P.copy(), V.copy()
    h = dt
    for k in range(k0, K):
        a1 = accel(P, V, k)
        P2 = P + 0.5 * h * V
        V2 = V + 0.5 * h * a1
        a2 = accel(P2, V2, k)
        P3 = P + 0.5 * h * V2
        V3 = V + 0.5 * h * a2
        a3 = accel(P3, V3, k)
        P4 = P + h * V3
        V4 = V + h * a3
        a4 = accel(P4, V4, k)
        P = P + (h / 6.0) * (V + 2 * V2 + 2 * V3 + V4)
        V = V + (h / 6.0) * (a1 + 2 * a2 + 2 * a3 + a4)
        if k + 1 in recs:
            outP[k + 1], outV[k + 1] = P.copy(), V.copy()
    cam = None if all(is_zero(c) for c in st.cam_bias) else np.stack([res(c) for c in st.cam_bias], axis=1)
    scal = {"kE": kE, "kR": kR, "kA": res(st.kA), "tb": tb, "cam": cam, "u": u_k, "C": C_k, "rcs": rcs_k}
    return outP, outV, scal


def usable(st: Structure, m: Meas):
    if m.kind == "accel":
        return True
    return st.body_index(m.target) is not None


# ---------------------------------------------------------------------------
# Measurements (spec 2). An optical fix is two angles plus range; the estimator
# works in the tangent plane at the measured direction, so nothing special
# happens at the poles and the result does not depend on the frame.
# ---------------------------------------------------------------------------


def unit_from_azel(az, el):
    ce = np.cos(el)
    return np.stack([ce * np.cos(az), ce * np.sin(az), np.sin(el)], axis=-1)


def east_north(az, el):
    """Orthonormal tangent basis at direction (az, el): east = d/d(az) / cos(el),
    north = d/d(el). Defined for any pair of angles, the poles included."""
    se = np.sin(el)
    east = np.stack([-np.sin(az), np.cos(az), np.zeros_like(az)], axis=-1)
    north = np.stack([-se * np.cos(az), -se * np.sin(az), np.cos(el)], axis=-1)
    return east, north


def azel_from_unit(v):
    return np.arctan2(v[..., 1], v[..., 0]), np.arcsin(np.clip(v[..., 2], -1.0, 1.0))


def _sig(v):
    return math.nan if v is None else float(v)


class MeasPlan:
    """Pre-computed arrays for the residuals of one arc's measurements.

    Scalar rows, in measurement order: for a fix, east (azimuth), north
    (elevation), range; for an accelerometer sample, f_x, f_y, f_z. Rows whose
    sigma is None are left out."""

    def __init__(self, st: Structure, meas, dt):
        self.meas = meas
        self.steps = [int(round(m.t / dt)) for m in meas]
        op = [i for i, m in enumerate(meas) if m.kind == "opnav"]
        ac = [i for i, m in enumerate(meas) if m.kind == "accel"]
        if len(op) + len(ac) != len(meas):
            raise ValueError("unknown measurement kind")
        self.op, self.ac = op, ac
        n = len(op)
        self.n_op, self.n_acc = n, len(ac)
        self.op_step = [self.steps[i] for i in op]
        self.op_body = [st.body_index(meas[i].target) for i in op]
        az = np.array([meas[i].z[0] for i in op], dtype=float)
        el = np.array([meas[i].z[1] for i in op], dtype=float)
        self.mhat = unit_from_azel(az, el) if n else np.zeros((0, 3))
        self.eE, self.eN = east_north(az, el) if n else (np.zeros((0, 3)), np.zeros((0, 3)))
        # sigma of the east component in radians of arc: sigma_az * cos(el).
        self.sigE = np.array([_sig(meas[i].sigma[0]) for i in op]) * np.cos(el)
        self.sigN = np.array([_sig(meas[i].sigma[1]) for i in op])
        self.rho = np.array([meas[i].z[2] if len(meas[i].z) > 2 else math.nan for i in op], dtype=float)
        self.sigR = np.array([_sig(meas[i].sigma[2]) if len(meas[i].z) > 2 else math.nan for i in op])
        self.has_q = any(meas[i].q is not None for i in op)
        self.Cfix = np.stack([Q.rotmat(meas[i].q) if meas[i].q is not None else np.eye(3) for i in op]) if n else np.zeros((0, 3, 3))
        self.acc_step = [self.steps[i] for i in ac]
        self.f = np.array([meas[i].z for i in ac], dtype=float).reshape(len(ac), 3)
        self.sigF = np.array([[_sig(s) for s in meas[i].sigma] for i in ac], dtype=float).reshape(len(ac), 3)
        pos_op = {i: j for j, i in enumerate(op)}
        pos_ac = {i: j for j, i in enumerate(ac)}
        order, meta = [], []
        for i, m in enumerate(meas):
            for c in range(len(m.z)):
                if m.sigma[c] is None:
                    continue
                if m.kind == "opnav":
                    order.append(c * n + pos_op[i])
                else:
                    order.append(3 * n + 3 * pos_ac[i] + c)
                meta.append((i, c))
        self.order = np.array(order, dtype=int)
        self.meta = meta
        self.m = len(order)


def geometry(st: Structure, att: Attempt, X, idx, plan: MeasPlan, dt):
    """Predicted line of sight (after the camera misalignment), range and
    specific force for every measurement in the plan."""
    outP, outV, sc = simulate(st, att, X, idx, dt, plan.steps)
    B = X.shape[0]
    ship = len(st.bodies)
    out = {"sc": sc, "outP": outP, "outV": outV}
    if plan.n_op:
        d = np.stack([outP[k][:, bi] - outP[k][:, ship] for k, bi in zip(plan.op_step, plan.op_body)], axis=1)
        rho = np.sqrt(np.einsum("bni,bni->bn", d, d))
        p = d / rho[..., None]
        if sc["cam"] is not None:
            w = np.einsum("nij,bj->bni", plan.Cfix, sc["cam"])
            p = rotate_small(w, p)
        out["p"], out["rho"] = p, rho
    if plan.n_acc:
        u = sc["u"][plan.acc_step]
        rcs = sc["rcs"][plan.acc_step]
        f = sc["kE"][:, None, None] * u[None, :, None] * sc["tb"][:, None, :] + sc["kR"][:, None, None] * rcs[None, :, :]
        out["f"] = sc["kA"][:, None, None] * f
    return out


def residuals(st: Structure, att: Attempt, X, idx, plan: MeasPlan, dt):
    """Whitened residuals (B, m), measured minus predicted.

    Bearing: the predicted direction p is mapped into the tangent plane at the
    measured direction (the log map of the unit sphere): with s = (east . p,
    north . p), c = measured . p and theta = atan2(|s|, c), the residual is
    -(theta / |s|) s, divided by (sigma_az cos(el), sigma_el). For planar data
    this is exactly wrap(az_measured - az_predicted) / sigma."""
    g = geometry(st, att, X, idx, plan, dt)
    B = X.shape[0]
    parts = []
    if plan.n_op:
        p, rho = g["p"], g["rho"]
        sE = np.einsum("bni,ni->bn", p, plan.eE)
        sN = np.einsum("bni,ni->bn", p, plan.eN)
        c = np.einsum("bni,ni->bn", p, plan.mhat)
        sn = np.sqrt(sE * sE + sN * sN)
        f = np.where(sn > 1e-300, np.arctan2(sn, c) / np.maximum(sn, 1e-300), 1.0)
        parts += [-f * sE / plan.sigE, -f * sN / plan.sigN, (plan.rho - rho) / plan.sigR]
    else:
        parts.append(np.zeros((B, 0)))
    if plan.n_acc:
        parts.append(((plan.f[None] - g["f"]) / plan.sigF[None]).reshape(B, -1))
    return np.concatenate(parts, axis=1)[:, plan.order]


def exact_measurements(st: Structure, att: Attempt, X, idx, meas, dt):
    """Noise-free values for a list of measurement templates (truth generation):
    per measurement a (3,) line-of-sight unit vector and range, or a (3,) force."""
    plan = MeasPlan(st, meas, dt)
    g = geometry(st, att, X, idx, plan, dt)
    out = [None] * len(meas)
    for j, i in enumerate(plan.op):
        out[i] = (g["p"][0, j], float(g["rho"][0, j]))
    for j, i in enumerate(plan.ac):
        out[i] = g["f"][0, j]
    return out


def ship_states(st: Structure, att: Attempt, X, idx, dt, times):
    """Ship state (B, T, 6) at the given times and the ship's position relative
    to the gauge body (B, T, 3)."""
    steps = [int(round(t / dt)) for t in times]
    outP, outV, _ = simulate(st, att, X, idx, dt, steps)
    ship = len(st.bodies)
    S = np.stack([np.concatenate([outP[k][:, ship], outV[k][:, ship]], axis=1) for k in steps], axis=1)
    rel = np.stack([outP[k][:, ship] - outP[k][:, 0] for k in steps], axis=1)
    return S, rel
