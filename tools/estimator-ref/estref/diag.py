"""Diagnostics shared by the vectors: Tier L tables (spec 9.2) and the
empirical radial/tangential acceleration fit on the calibrated law (spec 9.4)."""
from __future__ import annotations

import math

import numpy as np

from .common import AS, DT, R0, p_emp, p_ship, guess_ship
from .core import EmpDef
from .local import build_profile, local_fits, make_windows, noise_scale, profile_def, ref_structure

WIN = AS["windows"]


def win_kw():
    return dict(dtheta=WIN["sweep"], dlnr=WIN["lnRange"], nmin=WIN["minFixes"], nkeep=WIN["keepFixes"])


def azimuth(att, t0, t1):
    """Mean direction of the ship as seen from A over [t0, t1] (bearing to A + pi)."""
    b = [m.z[0] + math.pi for m in att.meas if m.kind == "opnav" and m.target == "A" and t0 <= m.t <= t1]
    return float(math.atan2(np.mean(np.sin(b)), np.mean(np.cos(b))))


def tier_l(ref, attempts):
    """Local fits, noise scale and calibration profile for a single-body reference law."""
    rows = local_fits(ref, attempts, DT, g_sigma=WIN["localScalePriorSigma"], **win_kw())
    by = {a.id: a for a in attempts}
    for r in rows:
        r["azimuth"] = azimuth(by[r["attempt"]], r["t0"], r["t1"])
    prof = build_profile(rows, R0, delta=WIN["profileStep"], curv=WIN["profileCurvature"], ridge=WIN["profileRidge"])
    return {
        "reference": {k: float(v) for k, v in ref.items()},
        "windowRule": dict(WIN),
        "windows": rows,
        "noiseScale": noise_scale(rows),
        "profile": prof,
    }


def emp_bounds(att):
    wins = make_windows(att, **win_kw())
    return [float(att.epoch)] + [float(w.t0) for w in wins[1:]] + [float(att.duration)]


def empirical_fit(ref, prof, attempts, do_fit):
    """Arc states + radial/tangential empirical acceleration per window, on the
    reference law times the calibration profile (lam = 1). Returns (fit, structure, params, bounds)."""
    bounds = {a.id: emp_bounds(a) for a in attempts}
    st = ref_structure(ref, profile=None if prof is None else profile_def(prof))
    st.emp = EmpDef("A", bounds)
    params = sum((p_ship(a.id, guess_ship(a)) + p_emp(a.id, len(bounds[a.id]) - 1) for a in attempts), [])
    fit, _ = do_fit(st, attempts, params)
    return fit, st, params, bounds


def emp_table(fit, bounds):
    rows = []
    for aid, b in bounds.items():
        for k in range(len(b) - 1):
            aR, sR = fit.get(f"{aid}.emp{k}.R")
            aT, sT = fit.get(f"{aid}.emp{k}.T")
            rows.append({"window": f"{aid}.emp{k}", "t0": b[k], "t1": b[k + 1], "aR": float(aR), "sigmaR": float(sR), "aT": float(aT), "sigmaT": float(sT)})
    return rows
