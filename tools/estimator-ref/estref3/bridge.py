"""Planar reduction (spec revision 3, Appendix A.3): run a planar vector's fits
through the 3D reference.

A planar value lifts with z = 0, a rotation about +z and elevation 0. The
out-of-plane unknowns (z, vz, the pitch misalignment, the two in-plane camera
components, the orbit-normal empirical term) are held at zero and the
out-of-plane measurement rows (elevation, f_z) are left out. Every 3D formula
then reduces to the planar one, so the planar expected values apply unchanged.
"""
from __future__ import annotations

import numpy as np

from . import quat as Q
from .core import Attempt, BodyDef, Command, EmpDef, Meas, ProfileDef, Structure
from .fit import Param


def ref_from_json(j):
    if isinstance(j, (int, float)):
        return float(j)
    if "sum" in j:
        return tuple(ref_from_json(r) for r in j["sum"])
    return j["param"]


def lift_state(refs):
    x, y, vx, vy = (ref_from_json(r) for r in refs)
    return (x, y, 0.0, vx, vy, 0.0)


def lift_structure(mj) -> Structure:
    bodies = []
    for b in mj["bodies"]:
        state = "gauge" if b["state"] == "gauge" else lift_state(b["state"])
        bodies.append(BodyDef(b["id"], ref_from_json(b["mu"]), state, gs=ref_from_json(b["localScale"])))
    st = Structure(
        mj["law"]["r0"], ref_from_json(mj["law"]["exponent"]), bodies, ship=lift_state(mj["ship"]),
        kE=ref_from_json(mj["engine"]["kE"]), dE=ref_from_json(mj["engine"]["dE"]), dP=0.0,
        kA=ref_from_json(mj["accelScale"]), cam_bias=(0.0, 0.0, ref_from_json(mj["cameraBias"])),
    )
    if "empirical" in mj:
        st.emp = EmpDef(mj["empirical"]["frameBody"], {k: list(v) for k, v in mj["empirical"]["bounds"].items()}, normal=False)
    if "profile" in mj:
        pf = mj["profile"]
        st.profile = ProfileDef(pf["body"], list(pf["lnRNodes"]), list(pf["g"]), pf["rMin"], pf["rMax"])
    return st


def lift_measurement(m) -> Meas:
    z, s = m["z"], m["sigma"]
    if m["kind"] == "opnav":
        if len(z) == 2:
            return Meas(m["t"], "opnav", m["target"], [z[0], 0.0, z[1]], [s[0], None, s[1]])
        return Meas(m["t"], "opnav", m["target"], [z[0], 0.0], [s[0], None])
    return Meas(m["t"], "accel", None, [z[0], z[1], 0.0], [s[0], s[1], None])


def lift_attempt(a) -> Attempt:
    cmds = [Command(c["t0"], c["t1"], c["u"], tuple(Q.from_yaw(c["theta"]))) for c in a["commands"]]
    return Attempt(a["id"], a["duration"], cmds, [lift_measurement(m) for m in a["measurements"]], a.get("note", ""), a.get("epoch", 0.0))


def param_scale(name, mu_scale):
    leaf = name.split(".")[-1]
    parts = name.split(".")
    if name.startswith("mu."):
        return mu_scale[parts[1]]
    if name == "law.n":
        return 1e-3
    if name in ("engine.kE", "engine.dE") or leaf in ("dkE", "ddE"):
        return 1e-3
    if name == "accel.kA" or leaf == "dkA":
        return 1e-4
    if name == "camera.bias" or leaf == "dbias":
        return 1e-5
    if leaf in ("R", "T") and "emp" in parts[-2]:
        return 1e-6
    if leaf == "g":
        return 1e-3
    if leaf in ("x", "y"):
        return 1e3
    if leaf in ("vx", "vy"):
        return 1.0 if parts[-2] == "ship" else 0.1
    raise ValueError(f"no scale rule for parameter {name}")


def lift_params(pj, mu_scale):
    out = []
    for p in pj:
        pr = p["prior"]
        out.append(Param(p["name"], p["init"], param_scale(p["name"], mu_scale), None if pr is None else pr["mean"], None if pr is None else pr["sigma"], group=p["group"]))
    return out


def compare_fit(fit, expected):
    """Worst differences between a 3D fit in planar reduction and the planar
    vector's expected values."""
    dx = max(abs(fit.get(n)[0] - v) / expected["sigma"][n] for n, v in expected["estimate"].items())
    ds = max(abs(fit.get(n)[1] / s - 1.0) for n, s in expected["sigma"].items())
    names = expected["correlation"]["names"]
    C = fit.corr_matrix()
    ii = [fit.names.index(n) for n in names]
    dc = float(np.max(np.abs(C[np.ix_(ii, ii)] - np.array(expected["correlation"]["matrix"])))) if names else 0.0
    return {
        "estimateOverSigma": float(dx),
        "sigmaRelative": float(ds),
        "correlationAbs": dc,
        "chi2Relative": abs(fit.chi2 / expected["chi2"] - 1.0) if expected["chi2"] > 0 else abs(fit.chi2),
        "mEqual": fit.m == expected["m"],
        "pEffAbs": abs(fit.p_eff - expected["pEff"]),
    }
