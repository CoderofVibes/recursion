"""Diagnostics shared by the 3D vectors: Tier L tables (spec 9.2) and the
empirical radial / tangential / orbit-normal acceleration fit on the calibrated
law (spec 9.4)."""
from __future__ import annotations

from .common import AS, DT, R0, guess_ship, p_emp, p_ship
from .core import EmpDef
from .local import build_profile, local_fits, make_windows, noise_scale, profile_def, ref_structure

WIN = AS["windows"]


def win_kw():
    return dict(dtheta=WIN["sweep"], dlnr=WIN["lnRange"], nmin=WIN["minFixes"], nkeep=WIN["keepFixes"])


def tier_l(ref, attempts, planar=False):
    """Local fits, noise scale and calibration profile for a single-body
    reference law. Each window row carries the ship's mean direction from the
    body and the axis its line of sight turned about, for the plots against
    direction; the profile itself is indexed by distance only."""
    rows = local_fits(ref, attempts, DT, g_sigma=WIN["localScalePriorSigma"], planar=planar, **win_kw())
    prof = build_profile(rows, R0, delta=WIN["profileStep"], curv=WIN["profileCurvature"], ridge=WIN["profileRidge"])
    return {
        "reference": {k: (float(v) if isinstance(v, (int, float)) else [float(c) for c in v]) for k, v in ref.items()},
        "windowRule": dict(WIN),
        "windows": rows,
        "noiseScale": noise_scale(rows),
        "profile": prof,
    }


def emp_bounds(att):
    wins = make_windows(att, **win_kw())
    return [float(att.epoch)] + [float(w.t0) for w in wins[1:]] + [float(att.duration)]


def empirical_fit(ref, prof, attempts, do_fit):
    """Arc states + radial / tangential / normal empirical acceleration per
    window, on the reference law times the calibration profile.
    Returns (fit, problem, structure, params, bounds)."""
    bounds = {a.id: emp_bounds(a) for a in attempts}
    st = ref_structure(ref, profile=None if prof is None else profile_def(prof))
    st.emp = EmpDef("A", bounds)
    params = sum((p_ship(a.id, guess_ship(a)) + p_emp(a.id, len(bounds[a.id]) - 1) for a in attempts), [])
    fit, prob = do_fit(st, attempts, params)
    return fit, prob, st, params, bounds


def emp_table(fit, bounds):
    rows = []
    for aid, b in bounds.items():
        for k in range(len(b) - 1):
            row = {"window": f"{aid}.emp{k}", "t0": b[k], "t1": b[k + 1]}
            for c in ("R", "T", "N"):
                a, s = fit.get(f"{aid}.emp{k}.{c}")
                row["a" + c], row["sigma" + c] = float(a), float(s)
            rows.append(row)
    return rows
