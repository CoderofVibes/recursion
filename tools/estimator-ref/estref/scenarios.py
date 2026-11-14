"""Vector 1 and the helpers shared by all vectors (1G deliverable 2). Each
vector function builds truth, generates measurements with a fixed seed, runs
the reference fits, evaluates its claims and returns the vector as a dict."""
from __future__ import annotations

import math

import numpy as np

from .common import (
    AS, DT, FD, MU_A, PR, R0,
    Checks, attempt_json, chi2_band, fit_json, guess_ship,
    make_measurements, p_cam, p_muA, p_n, p_ship,
    params_json, peri_speed, schedule, state_at, structure_json, truth_checkpoints, truth_convergence,
    truth_structure, truth_values,
)
from .core import Attempt, BodyDef, Structure
from .fit import staged_fit

SEEDS = AS["seeds"]


def model_single(n=2.0, emp=None, engine=False, kA=False, profile=None, mu="mu.A", cam="camera.bias"):
    return Structure(
        R0, n, [BodyDef("A", mu)],
        kE="engine.kE" if engine else 1.0, dE="engine.dE" if engine else 0.0,
        kA="accel.kA" if kA else 1.0, cam_bias=cam, emp=emp, profile=profile,
    )


def model_binary(n=2.0):
    return Structure(
        R0, n, [BodyDef("A", "mu.A"), BodyDef("B", "mu.B", ("{att}.B.x", "{att}.B.y", "{att}.B.vx", "{att}.B.vy"))],
        cam_bias="camera.bias",
    )


def clean_copy(att, clean):
    return Attempt(att.id, att.duration, att.commands, clean, att.note, att.epoch)


def do_fit(st, atts, params, x0=None, full_priors=()):
    return staged_fit(st, atts, params, DT, full_priors=full_priors, x0=x0, h=FD)


def fit_entry(fid, desc, st, atts, params, noisy_fit, clean_atts, corr=None, extra=None):
    nf, _ = do_fit(st, clean_atts, params, x0=noisy_fit.x)
    numeric = bool(noisy_fit.converged and noisy_fit.chi2_nu <= 25.0)
    e = {
        "id": fid,
        "description": desc,
        "compare": "numeric" if numeric else "qualitative",
        "attempts": [a.id for a in atts],
        "model": structure_json(st),
        "parameters": params_json(params),
        "expected": fit_json(noisy_fit, params, corr),
        "noiseFree": {"estimate": {n: float(v) for n, v in zip(nf.names, nf.x)}, "chi2": nf.chi2, "chi2PerDof": nf.chi2_nu},
    }
    if extra:
        e.update(extra)
    return e, nf


def base_vector(vid, title, description, cases, checks, notes=()):
    return {
        "schema": "recursion.estimator-vector/1",
        "id": vid,
        "title": title,
        "description": description,
        "generator": "tools/estimator-ref/generate.py",
        "assumptions": "tools/estimator-ref/assumptions.json (version %d)" % AS["version"],
        "units": "SI: m, s, m/s, m/s^2, rad. Bearings are inertial angles from +x, wrapped to [-pi, pi).",
        "frame": "Planar inertial. Gauge: body A at the origin and at rest at t = 0 of every attempt (spec 3.4).",
        "propagation": {"integrator": AS["integrator"]["method"], "dt": DT, "note": "Reference setting; all times are multiples of dt. Any propagator whose position error over the arc is below ~1 m reproduces the expected values."},
        "tolerance": {
            "numeric": "Fits with compare = numeric: |x_impl - x_ref| <= 0.05 sigma_ref per parameter; |sigma_impl / sigma_ref - 1| <= 0.05; |chi2_impl / chi2_ref - 1| <= 0.02; |rho_impl - rho_ref| <= 0.02. Tier L windows: same boundaries (t0, t1, nFixes) and |g_impl - g_ref| <= 0.05 sigma_ref. Profile nodes: |g_impl - g_ref| <= 0.1 sigma_ref.",
            "qualitative": "Fits with compare = qualitative are grossly misfitted (chi2/nu > 25) or unconverged; only the inequalities in `checks` and any heldOut.pass value are required.",
            "physicalClaims": "Per check, stated in `checks`. The generator refuses to write a vector whose claims fail.",
        },
        "notes": list(notes) + ["`truth` blocks are for checking only and must never reach the estimator (P11). Measurements whose target is not a modelled body are ignored by that fit."],
        "cases": cases,
        "checks": checks.items,
    }


# ---------------------------------------------------------------------------
# 1. Newtonian truth, Newtonian model: recovers GM
# ---------------------------------------------------------------------------


def v_newton_recovers_gm():
    rng = np.random.default_rng(SEEDS["newton-recovers-gm"])
    ck = Checks()
    n_t = 2.0
    rp, ra = 0.8e6, 1.25e6
    s0 = state_at(rp, peri_speed(MU_A, n_t, rp, ra), 0.3)
    att = Attempt("att1", 43200.0, [], [], "Coasting arc around A, r 0.8-1.25 r0, fixes every 180 s.")
    tst = truth_structure()
    tv = truth_values(n_t, {"att1": s0})
    att.meas, clean = make_measurements(tst, att, tv, rng, schedule(0, att.duration, 180.0))
    catt = clean_copy(att, clean)

    st = model_single(2.0)
    params = p_ship("att1", guess_ship(att)) + [p_muA(), p_cam()]
    f1, _ = do_fit(st, [att], params)
    e1, _ = fit_entry("newtonian", "Newtonian model, mu.A free with arrival-calibration prior.", st, [att], params, f1, [catt])
    mu, smu = f1.get("mu.A")
    ck.add("gm-recovered", "Fitted mu.A within 3 sigma of truth 1e10", (mu - MU_A) / smu, abs(mu - MU_A) <= 3 * smu)
    ck.add("gm-data-dominated", "Posterior sigma of mu.A below 1/10 of prior sigma (data, not prior)", smu / PR["muA"]["sigma"], smu < 0.1 * PR["muA"]["sigma"])
    lo, hi = chi2_band(f1.nu)
    ck.add("chi2-consistent", "chi2/nu inside 1 +/- 3 sqrt(2/nu)", f1.chi2_nu, lo <= f1.chi2_nu <= hi)

    st2 = model_single("law.n")
    params2 = p_ship("att1", guess_ship(att)) + [p_muA(), p_n(), p_cam()]
    f2, _ = do_fit(st2, [att], params2)
    e2, _ = fit_entry("superfluous-exponent", "Exponent extension enabled although truth is Newtonian.", st2, [att], params2, f2, [catt])
    n, sn = f2.get("law.n")
    dchi = f1.chi2 + f1.prior_cost - (f2.chi2 + f2.prior_cost)
    pen = math.log(f1.m)
    ck.add("exponent-consistent-with-2", "Free exponent within 3 sigma of 2", (n - 2.0) / sn, abs(n - 2.0) <= 3 * sn)
    ck.add("superfluous-not-adoptable", "Cost drop from the extra parameter below the adoption penalty ln(m)", dchi, dchi < pen)
    e2["adoption"] = {"deltaCost": dchi, "penalty": pen, "adopt": bool(dchi >= pen)}

    case = {
        "id": "single-arc",
        "attempts": [attempt_json(att)],
        "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {"att1": truth_checkpoints(tst, att, tv, [0, 21600, 43200])}, "integrationCheck_m": truth_convergence(tst, att, tv, [43200])},
        "fits": [e1, e2],
    }
    return base_vector(
        "newton-recovers-gm", "Newtonian truth, Newtonian model: recovers GM",
        "One 12 h coasting arc around A in a Newtonian world. The Newtonian fit recovers mu.A from an arrival prior 2% off; enabling the exponent extension is harmless but not adoptable.",
        [case], ck,
    )
