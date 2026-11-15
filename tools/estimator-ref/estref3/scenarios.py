"""3D vector 1 and the helpers shared by all 3D vectors. Each vector function
builds truth, generates measurements with a fixed seed, runs the reference
fits, evaluates its claims and returns the vector as a dict."""
from __future__ import annotations

import math

import numpy as np

from .common import (
    AS, AS3, CAM_REFS, DT, FD, MU_A, PR, R0, SEEDS, STATE,
    Checks, angle, attempt_json, chi2_band, fit_json, guess_ship, mahalanobis,
    make_measurements, orbit_normal, orbit_state, p_cam, p_muA, p_n, p_ship,
    params_json, peri_speed, plane, schedule, state_block, structure_json, truth_checkpoints, truth_convergence,
    truth_structure, truth_values,
)
from .core import Attempt, BodyDef, Structure
from .fit import staged_fit

CHI_6 = 4.479  # sqrt of the 99.73% point of chi-square with 6 degrees of freedom ("3 sigma" for a 6-state)
CHI_3 = 3.763  # ... 3 degrees of freedom
CHI_2 = 3.439  # ... 2 degrees of freedom


def model_single(n=2.0, emp=None, engine=False, kA=False, kR=False, profile=None, mu="mu.A", cam=CAM_REFS):
    return Structure(
        R0, n, [BodyDef("A", mu)],
        kE="engine.kE" if engine else 1.0, dE="engine.dE" if engine else 0.0, dP="engine.dP" if engine else 0.0,
        kA="accel.kA" if kA else 1.0, kR="rcs.kR" if kR else 1.0, cam_bias=cam, emp=emp, profile=profile,
    )


def model_binary(n=2.0):
    return Structure(R0, n, [BodyDef("A", "mu.A"), BodyDef("B", "mu.B", tuple("{att}.B." + k for k in STATE))], cam_bias=CAM_REFS)


def clean_copy(att, clean):
    return Attempt(att.id, att.duration, att.commands, clean, att.note, att.epoch)


def do_fit(st, atts, params, x0=None, full_priors=()):
    """Returns (fit, problem)."""
    return staged_fit(st, atts, params, DT, full_priors=full_priors, x0=x0, h=FD)


def fit_entry(fid, desc, st, atts, params, fitted, clean_atts, corr=None, extra=None):
    noisy_fit, prob = fitted
    nf, _ = do_fit(st, clean_atts, params, x0=noisy_fit.x)
    numeric = bool(noisy_fit.converged and noisy_fit.chi2_nu <= 25.0)
    e = {
        "id": fid,
        "description": desc,
        "compare": "numeric" if numeric else "qualitative",
        "attempts": [a.id for a in atts],
        "model": structure_json(st),
        "parameters": params_json(params),
        "expected": fit_json(noisy_fit, prob, params, corr),
        "noiseFree": {"estimate": {n: float(v) for n, v in zip(nf.names, nf.x)}, "chi2": nf.chi2, "chi2PerDof": nf.chi2_nu},
    }
    if extra:
        e.update(extra)
    return e, nf


def base_vector(vid, title, description, cases, checks, notes=()):
    return {
        "schema": "recursion.estimator-vector-3d/1",
        "id": vid,
        "title": title,
        "description": description,
        "generator": "tools/estimator-ref/generate.py --3d",
        "assumptions": "tools/estimator-ref/assumptions.json (version %d) and assumptions-3d.json (version %d)" % (AS["version"], AS3["version"]),
        "units": "SI: m, s, m/s, m/s^2, rad. A fix is [azimuth, elevation(, range)] of the inertial direction ship -> target: azimuth = atan2(d_y, d_x) in (-pi, pi], elevation = asin(d_z / |d|). sigma is per component; sigma_az carries the 1 / cos(elevation) of an isotropic pointing error. Attitudes are unit quaternions [w, x, y, z], body to inertial. Accelerometer samples are [f_x, f_y, f_z] in the body frame.",
        "frame": "Right-handed inertial. Gauge: body A at the origin and at rest at t = 0 of every attempt (spec 3.4). Body frame: +x forward, +y left, +z up.",
        "propagation": {"integrator": AS["integrator"]["method"], "dt": DT, "note": "Reference setting; all times are multiples of dt. Any propagator whose position error over the arc is below ~1 m reproduces the expected values."},
        "tolerance": {
            "numeric": "Fits with compare = numeric: |x_impl - x_ref| <= 0.05 sigma_ref per parameter; |sigma_impl / sigma_ref - 1| <= 0.05; |chi2_impl / chi2_ref - 1| <= 0.02; |rho_impl - rho_ref| <= 0.02. Tier L windows: same boundaries (t0, t1, nFixes) and |g_impl - g_ref| <= 0.05 sigma_ref. Profile nodes: |g_impl - g_ref| <= 0.1 sigma_ref.",
            "qualitative": "Fits with compare = qualitative are grossly misfitted (chi2/nu > 25) or unconverged; only the inequalities in `checks` and any heldOut.pass value are required.",
            "physicalClaims": "Per check, stated in `checks`. The generator refuses to write a vector whose claims fail.",
        },
        "notes": list(notes) + ["`truth` blocks are for checking only and must never reach the estimator (P11). Measurements whose target is not a modelled body are ignored by that fit.",
                                "Covariances of positions are [xx, xy, xz, yy, yz, zz]."],
        "cases": cases,
        "checks": checks.items,
    }


def normal_check(fit, att_id, truth_state):
    """Angle between the fitted and true orbit normals, with its one-sigma size
    and the two-degree-of-freedom Mahalanobis distance."""
    x, P = state_block(fit, att_id)
    n_fit = orbit_normal(x)
    n_true = orbit_normal(truth_state)
    J = np.zeros((3, 6))
    for i in range(6):
        h = 1e-3 * (1e3 if i < 3 else 1.0)
        xp, xm = x.copy(), x.copy()
        xp[i] += h
        xm[i] -= h
        J[:, i] = (orbit_normal(xp) - orbit_normal(xm)) / (2 * h)
    C = J @ P @ J.T
    w, v = np.linalg.eigh(C)
    keep = w > 1e-9 * w[-1]
    y = v[:, keep].T @ (n_fit - n_true)
    return {"angle": angle(n_fit, n_true), "sigma": float(math.sqrt(w[-1])), "mahalanobis": float(math.sqrt(np.sum(y * y / w[keep]))),
            "normalFitted": [float(c) for c in n_fit], "normalTrue": [float(c) for c in n_true]}


def plane_json(Rpl, inc_deg, node_deg):
    return {"inclinationDeg": inc_deg, "nodeDeg": node_deg, "normal": [float(c) for c in Rpl[:, 2]]}


# ---------------------------------------------------------------------------
# 1. Newtonian truth, Newtonian model, inclined orbit: recovers GM and the 6-state
# ---------------------------------------------------------------------------


def v_inclined_newton():
    rng = np.random.default_rng(SEEDS["inclined-newton-recovers-gm"])
    ck = Checks()
    n_t = 2.0
    inc, node = 50.0, 30.0
    Rpl = plane(inc, node)
    rp, ra = 0.8e6, 1.25e6
    s0 = orbit_state(rp, peri_speed(MU_A, n_t, rp, ra), 0.3, Rpl)
    att = Attempt("att1", 43200.0, [], [], "Coasting arc around A, r 0.8-1.25 r0, orbit inclined 50 deg to the x-y plane (node at 30 deg); fixes every 180 s.")
    tst = truth_structure()
    tv = truth_values(n_t, {"att1": s0})
    att.meas, clean = make_measurements(tst, att, tv, rng, schedule(0, att.duration, 180.0))
    catt = clean_copy(att, clean)

    st = model_single(2.0)
    params = p_ship("att1", guess_ship(att)) + [p_muA()] + p_cam()
    fitted = do_fit(st, [att], params)
    f1 = fitted[0]
    e1, _ = fit_entry("newtonian", "Newtonian model: 6-state, mu.A with its arrival prior, camera misalignment (three components, prior only).", st, [att], params, fitted, [catt])
    mu, smu = f1.get("mu.A")
    ck.add("gm-recovered", "Fitted mu.A within 3 sigma of truth 1e10", (mu - MU_A) / smu, abs(mu - MU_A) <= 3 * smu)
    ck.add("gm-data-dominated", "Posterior sigma of mu.A below 1/10 of prior sigma (data, not prior)", smu / PR["muA"]["sigma"], smu < 0.1 * PR["muA"]["sigma"])
    lo, hi = chi2_band(f1.nu)
    ck.add("chi2-consistent", "chi2/nu inside 1 +/- 3 sqrt(2/nu), with azimuth, elevation and range rows", f1.chi2_nu, lo <= f1.chi2_nu <= hi)
    x, P = state_block(f1, "att1")
    md = mahalanobis(x - np.array(s0), P)
    e1["stateCheck"] = {"mahalanobis6": md, "threshold": CHI_6}
    ck.add("state-recovered", "The full 6-state at the epoch is within its covariance of truth: Mahalanobis distance below 4.48 (3 sigma for 6 numbers)", md, md < CHI_6)
    nc = normal_check(f1, "att1", s0)
    e1["orbitNormal"] = nc
    ck.add("plane-recovered", "Fitted orbit normal within 3 sigma (two numbers: 3.44) of the true one, which is 50 deg from +z", [nc["angle"], nc["sigma"], nc["mahalanobis"]], nc["mahalanobis"] < CHI_2 and abs(math.degrees(angle(nc["normalFitted"], [0, 0, 1])) - inc) < 0.1)
    zs = float(math.sqrt(P[2, 2]))
    ck.add("out-of-plane-observed", "The z position at the epoch is determined by the data: sigma below 1 km with no prior on it", zs, zs < 1000.0)
    ratios = [f1.get(nm)[1] / (PR["camBias"]["sigma"]) for nm in CAM_REFS]
    ck.add("camera-held-by-prior", "Constant attitude, one body, no burns: all three camera misalignment components stay at their prior (posterior / prior sigma above 0.95)", ratios, all(r > 0.95 for r in ratios))

    st2 = model_single("law.n")
    params2 = p_ship("att1", guess_ship(att)) + [p_muA(), p_n()] + p_cam()
    fitted2 = do_fit(st2, [att], params2)
    f2 = fitted2[0]
    e2, _ = fit_entry("superfluous-exponent", "Exponent extension enabled although truth is Newtonian.", st2, [att], params2, fitted2, [catt])
    n, sn = f2.get("law.n")
    dchi = f1.chi2 + f1.prior_cost - (f2.chi2 + f2.prior_cost)
    pen = math.log(f1.m)
    ck.add("exponent-consistent-with-2", "Free exponent within 3 sigma of 2", (n - 2.0) / sn, abs(n - 2.0) <= 3 * sn)
    ck.add("superfluous-not-adoptable", "Cost drop from the extra parameter below the adoption penalty ln(m)", dchi, dchi < pen)
    e2["adoption"] = {"deltaCost": dchi, "penalty": pen, "adopt": bool(dchi >= pen)}

    case = {
        "id": "single-inclined-arc",
        "attempts": [attempt_json(att)],
        "truth": {"structure": structure_json(tst), "values": tv, "plane": plane_json(Rpl, inc, node),
                  "checkpoints": {"att1": truth_checkpoints(tst, att, tv, [0, 21600, 43200])}, "integrationCheck_m": truth_convergence(tst, att, tv, [43200])},
        "fits": [e1, e2],
    }
    return base_vector(
        "inclined-newton-recovers-gm", "Newtonian truth and model on an inclined orbit: recovers GM and the 6-state",
        "One 12 h coasting arc around A in a Newtonian world, on an orbit inclined 50 deg. The fit recovers mu.A from an arrival prior 2% off and all six state components; the unneeded exponent extension is harmless and not adoptable.",
        [case], ck,
    )
