"""3D vector 8: rotation invariance, the bridge between the planar regression
and the 3D code.

Two planar scenarios are taken from the planar vector files as they stand on
disk (their measurements, not regenerated ones): `newton-recovers-gm` (a Tier G
fit) and `forecast-envelope` (Tier L, the present state and the forecast).

    flat     the planar scenario lifted into 3D: z = 0, plus a new out-of-plane
             pointing error on every fix (the planar data have none), fitted
             with all six state components and both bearing components;
    rotated  the flat scenario turned bodily by a fixed, stated rotation: bodies,
             ship, ship attitude and every measured direction;
    pole     the same with the rotation that puts one fix exactly on the +z pole.

Claims: rotated = flat turned by the rotation; flat (in-plane part) = the planar
vector's expected values.
"""
from __future__ import annotations

import json
import math
import os

import numpy as np

from . import quat as Q
from .common import (
    AS, AS3, DT, HERE, SEEDS, STATE,
    Checks, attempt_json, azel_from_unit, command_json, cov6, fit_json, guess_ship, p_cam, p_muA, p_ship, params_json, structure_json,
)
from .core import Attempt, Command, Meas
from .diag import tier_l, win_kw
from .local import anchor_state, forecast, major_sigma, make_windows
from .scenarios import base_vector, do_fit, model_single

ROOT = os.path.dirname(os.path.dirname(HERE))
PLANAR = os.path.join(ROOT, "tests", "vectors", "estimator")
RI = AS3["rotationInvariance"]
TOL_R = RI["tolerance"]["rotatedVsFlat"]
TOL_P = RI["tolerance"]["flatVsPlanar"]


def load_planar(vid):
    with open(os.path.join(PLANAR, vid + ".json"), encoding="utf-8") as f:
        return json.load(f)


def flat_attempt(a, rng):
    """Planar attempt lifted to 3D. Each fix keeps its planar bearing as the
    azimuth and gets an out-of-plane pointing error of the same sigma."""
    meas = []
    for m in a["measurements"]:
        b, rho = m["z"]
        sb, sr = m["sigma"]
        eps = float(rng.normal(0.0, sb))
        meas.append(Meas(m["t"], "opnav", m["target"], [b, eps, rho], [sb / math.cos(eps), sb, sr]))
    return Attempt(a["id"], a["duration"], [], meas, a.get("note", ""), a.get("epoch", 0.0))


def rotated_attempt(a: Attempt, Rm, q_rot):
    """Turn every measured direction by Rm; the ship's attitude turns with it."""
    meas = []
    for m in a.meas:
        az, el, rho = m.z
        sb = m.sigma[1]
        d = Rm @ np.array([math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)])
        az2, el2 = (float(v) for v in azel_from_unit(d))
        meas.append(Meas(m.t, "opnav", m.target, [az2, el2, rho], [sb / math.cos(el2), sb, m.sigma[2]], tuple(float(c) for c in q_rot)))
    return Attempt(a.id, a.duration, [], meas, a.note, a.epoch)


def block(Rm, n=2):
    T = np.zeros((3 * n, 3 * n))
    for i in range(n):
        T[3 * i:3 * i + 3, 3 * i:3 * i + 3] = Rm
    return T


def state_of(fit, aid):
    ii = [fit.names.index(f"{aid}.ship.{k}") for k in STATE]
    return fit.x[ii], fit.P[np.ix_(ii, ii)]


def compare_rotated(fR, fL, Rm, aid, others):
    """Worst differences between a fit of rotated data and the flat fit turned
    by the rotation. The comparison is made in the flat frame."""
    T = block(Rm)
    xL, PL = state_of(fL, aid)
    xR, PR_ = state_of(fR, aid)
    back = T.T @ xR
    Pb = T.T @ PR_ @ T
    sL = np.sqrt(np.diag(PL))
    dx = float(np.max(np.abs(back - xL) / sL))
    ds = float(np.max(np.abs(np.sqrt(np.diag(Pb)) / sL - 1.0)))
    dc = float(np.max(np.abs(Pb / np.outer(np.sqrt(np.diag(Pb)), np.sqrt(np.diag(Pb))) - PL / np.outer(sL, sL))))
    for nm in others:
        dx = max(dx, abs(fR.get(nm)[0] - fL.get(nm)[0]) / fL.get(nm)[1])
        ds = max(ds, abs(fR.get(nm)[1] / fL.get(nm)[1] - 1.0))
    return {"estimateOverSigma": dx, "sigmaRelative": ds, "stateCorrelationAbs": dc, "chi2Relative": abs(fR.chi2 / fL.chi2 - 1.0), "mEqual": fR.m == fL.m}


def within(d, tol):
    return d["estimateOverSigma"] <= tol["estimateOverSigma"] and d["sigmaRelative"] <= tol["sigmaRelative"] and d["chi2Relative"] <= tol["chi2Relative"] and d.get("mEqual", True)


def plain_entry(fid, desc, st, atts, params, fitted, extra=None):
    f, prob = fitted
    e = {"id": fid, "description": desc, "compare": "numeric", "attempts": [a.id for a in atts], "model": structure_json(st),
         "parameters": params_json(params), "expected": fit_json(f, prob, params)}
    if extra:
        e.update(extra)
    return e


def rot_json(Rm, q_rot, note):
    return {"quaternion": [float(c) for c in q_rot], "matrix": [[float(v) for v in row] for row in Rm], "note": note}


def v_rotation_invariance():
    rng = np.random.default_rng(SEEDS["rotation-invariance"])
    ck = Checks()
    q_rot = Q.from_axis_angle(RI["axis"], RI["angle"])
    Rm = Q.rotmat(q_rot)
    cases = []

    # ------------------------------------------------------------------ Tier G
    pv = load_planar("newton-recovers-gm")
    pcase = pv["cases"][0]
    pfit = pcase["fits"][0]
    pexp = pfit["expected"]
    aL = flat_attempt(pcase["attempts"][0], rng)
    k_pole = RI["poleFix"]
    b_pole = pcase["attempts"][0]["measurements"][k_pole]["z"][0]
    q_pole = Q.shortest_arc([math.cos(b_pole), math.sin(b_pole), 0.0], [0.0, 0.0, 1.0])
    R_pole = Q.rotmat(q_pole)
    modes = {
        "flat": (aL, np.eye(3), Q.IDENTITY, "none: the planar scenario at z = 0"),
        "rotated": (rotated_attempt(aL, Rm, q_rot), Rm, q_rot, f"rotation by {RI['angle']} rad about the axis {RI['axis']} (normalised)"),
        "pole": (rotated_attempt(aL, R_pole, q_pole), R_pole, q_pole, f"the smallest rotation that puts the planar bearing of fix {k_pole} on the +z pole"),
    }
    st = model_single(2.0)
    fits = {}
    for mode, (att, Rmode, qmode, note) in modes.items():
        params = p_ship("att1", guess_ship(att)) + [p_muA()] + p_cam()
        fitted = do_fit(st, [att], params)
        fits[mode] = fitted[0]
        e = plain_entry("newtonian", "Newtonian model: 6-state, mu.A, camera misalignment (three components, body frame).", st, [att], params, fitted)
        cases.append({"id": "tier-g-" + mode, "description": "Planar vector newton-recovers-gm / single-arc, " + ("lifted to 3D." if mode == "flat" else "lifted to 3D and turned bodily."),
                      "rotation": rot_json(Rmode, qmode, note), "attempts": [attempt_json(att)],
                      "truth": {"integrationCheck_m": pcase["truth"]["integrationCheck_m"], "note": "truth is the planar vector's, turned by `rotation`"},
                      "fits": [e]})
    fL = fits["flat"]
    el_max = {mode: max(abs(m.z[1]) for m in modes[mode][0].meas) for mode in modes}
    ck.add("rotation-is-out-of-plane", "The rotated scenario is fully three-dimensional (elevations beyond 45 deg) and the pole scenario has a fix within 1 mrad of the +z pole, where azimuth is undefined",
           [math.degrees(el_max["rotated"]), math.pi / 2 - el_max["pole"]], el_max["rotated"] > math.radians(45.0) and math.pi / 2 - el_max["pole"] < 1e-3)
    others = ["mu.A", "camera.bias.x", "camera.bias.y", "camera.bias.z"]
    for mode in ("rotated", "pole"):
        d = compare_rotated(fits[mode], fL, modes[mode][1], "att1", others)
        cases[["flat", "rotated", "pole"].index(mode)]["againstFlat"] = d
        ck.add(f"tier-g-{mode}-equals-flat", f"Tier G on the {mode} data gives the flat result turned by the rotation: state and its covariance turned, mu.A and the body-frame camera misalignment unchanged, chi2 unchanged (estimates within {TOL_R['estimateOverSigma']:g} sigma, sigmas within {TOL_R['sigmaRelative']:g}, chi2 within {TOL_R['chi2Relative']:g})", d, within(d, TOL_R))
    # flat against the planar vector's expected values
    pairs = [("att1.ship.x", "att1.ship.x"), ("att1.ship.y", "att1.ship.y"), ("att1.ship.vx", "att1.ship.vx"), ("att1.ship.vy", "att1.ship.vy"), ("mu.A", "mu.A"), ("camera.bias.z", "camera.bias")]
    dxp = max(abs(fL.get(a)[0] - pexp["estimate"][b]) / pexp["sigma"][b] for a, b in pairs)
    dsp = max(abs(fL.get(a)[1] / pexp["sigma"][b] - 1.0) for a, b in pairs)
    inplane = sum(float(r) ** 2 for r, meta in zip(fL.resid, fL.resid_meta) if meta[4] in (0, 2))
    dcp = abs(inplane / pexp["chi2"] - 1.0)
    zz = [fL.get("att1.ship.z")[0] / fL.get("att1.ship.z")[1], fL.get("att1.ship.vz")[0] / fL.get("att1.ship.vz")[1]]
    planar_ref = {"file": "tests/vectors/estimator/newton-recovers-gm.json", "case": pcase["id"], "fit": pfit["id"],
                  "estimate": {b: pexp["estimate"][b] for _, b in pairs}, "sigma": {b: pexp["sigma"][b] for _, b in pairs}, "chi2": pexp["chi2"], "m": pexp["m"]}
    cases[0]["planarReference"] = planar_ref
    cases[0]["againstPlanar"] = {"estimateOverSigma": dxp, "sigmaRelative": dsp, "chi2InPlaneRelative": dcp, "inPlaneChi2": inplane, "outOfPlaneZ": zz}
    ck.add("tier-g-flat-equals-planar", f"The flat 3D fit reproduces the planar vector in the plane: x, y, vx, vy, mu.A and the camera misalignment about z within {TOL_P['estimateOverSigma']:g} sigma, their sigmas within {TOL_P['sigmaRelative']:g}, and the chi2 of the azimuth and range rows within {TOL_P['chi2InPlaneRelative']:g} of the planar chi2",
           [dxp, dsp, dcp], dxp <= TOL_P["estimateOverSigma"] and dsp <= TOL_P["sigmaRelative"] and dcp <= TOL_P["chi2InPlaneRelative"])
    ck.add("tier-g-flat-out-of-plane-zero", "The flat fit's z and vz are consistent with zero (within 3 sigma) and the elevation rows add one residual per fix", zz + [fL.m, pexp["m"]], all(abs(v) <= 3 for v in zz) and fL.m == pexp["m"] + len(aL.meas))

    # ---------------------------------------------------------------- forecast
    fv = load_planar("forecast-envelope")
    fcase = fv["cases"][0]
    fin = fcase["forecastInputs"]
    refp = fin["reference"]
    ref = {"r0": refp["r0"], "mu": refp["mu"], "n": refp["n"], "cam": refp["cam"], "kE": refp["kE"], "dE": refp["dE"], "dP": 0.0}
    eng_sigma = (fin["engineSigma"]["kE"], fin["engineSigma"]["dE"], 0.0)
    sigma_h, fh = fin["sigmaH"], fin["horizonFraction"]
    flatA = [flat_attempt(a, rng) for a in fcase["attempts"]]
    sets = {"flat": (flatA, np.eye(3), Q.IDENTITY), "rotated": ([rotated_attempt(a, Rm, q_rot) for a in flatA], Rm, q_rot)}
    res = {}
    for mode, (atts, Rmode, qmode) in sets.items():
        cur = atts[-1]
        tl = tier_l(ref, atts)
        prof, s2 = tl["profile"], tl["noiseScale"]
        wins = [w for w in make_windows(cur, **win_kw()) if not w.powered][-AS["windows"]["anchorWindows"]:]
        t_last, x_now, P_now, anc = anchor_state(ref, prof, cur, wins, DT, g_prior=(1.0, AS["windows"]["localScalePriorSigma"]), slope_sigma=AS["windows"]["anchorSlopePriorSigma"])
        fcs, raw, plans_json = [], {}, {}
        for pid, pj in fcase["plans"].items():
            cmds = [Command(c["t0"], c["t1"], c["u"], tuple(float(v) for v in Q.mul(qmode, Q.from_yaw(c["theta"])))) for c in pj["commands"]]
            times = pj["checkpoints"]
            plan_att = Attempt(cur.id, max(times) + DT, cmds, [])
            mean, covs = forecast(ref, prof, plan_att, t_last, x_now, P_now, times, DT, s2, sigma_h, eng_sigma)
            pts = []
            ok = True
            for i, t in enumerate(times):
                c = covs[i]
                r_pred = float(np.linalg.norm(mean[i]))
                ok = ok and major_sigma(c["total"]) <= fh * r_pred
                pts.append({"t": t, "mean": [float(v) for v in mean[i]], "rangePredicted": r_pred, "insideCoverage": bool(prof["rMin"] <= r_pred <= prof["rMax"]),
                            "sigmaMajor": {k: major_sigma(c[k]) for k in ("state", "profile", "hedge", "engine", "total")}, "covTotal": cov6(c["total"]), "withinHorizon": bool(ok)})
            fcs.append({"plan": pid, "points": pts})
            raw[pid] = (mean, covs)
            plans_json[pid] = {"description": pj["description"], "commands": [command_json(c) for c in cmds], "checkpoints": times}
        res[mode] = dict(tl=tl, anchor=(t_last, x_now, P_now), fcs=fcs, raw=raw)
        cases.append({"id": "forecast-" + mode, "description": "Planar vector forecast-envelope / sampled-and-unsampled, " + ("lifted to 3D." if mode == "flat" else "lifted to 3D and turned bodily."),
                      "rotation": rot_json(Rmode, qmode, "none" if mode == "flat" else f"rotation by {RI['angle']} rad about the axis {RI['axis']} (normalised)"),
                      "attempts": [attempt_json(a) for a in atts], "now": fcase["now"], "plans": plans_json,
                      "truth": {"integrationCheck_m": fcase["truth"]["integrationCheck_m"], "note": "truth is the planar vector's, turned by `rotation`"},
                      "forecastInputs": {"reference": ref, "engineSigma": {"kE": eng_sigma[0], "dE": eng_sigma[1], "dP": eng_sigma[2]}, "cameraSigma": None, "sigmaH": sigma_h, "horizonFraction": fh, "noiseScale": s2, "anchorWindows": fin["anchorWindows"]},
                      "tierL": tl,
                      "anchor": {**anc, "tNow": t_last, "state": [float(v) for v in x_now], "covariance": [[float(v) for v in row] for row in P_now]},
                      "forecasts": fcs, "fits": []})
    L, R = res["flat"], res["rotated"]
    wl, wr, wp = L["tl"]["windows"], R["tl"]["windows"], fcase["tierL"]["windows"]
    same_rl = len(wl) == len(wr) and all((a["t0"], a["t1"], a["nFixes"]) == (b["t0"], b["t1"], b["nFixes"]) for a, b in zip(wl, wr))
    same_lp = len(wl) == len(wp) and all((a["t0"], a["t1"], a["nFixes"]) == (b["t0"], b["t1"], b["nFixes"]) for a, b in zip(wl, wp))
    dg_rl = max(abs(a["g"] - b["g"]) / a["sigma"] for a, b in zip(wl, wr))
    dg_lp = max(abs(a["g"] - b["g"]) / b["sigma"] for a, b in zip(wl, wp))
    ds_lp = max(abs(a["sigma"] / b["sigma"] - 1.0) for a, b in zip(wl, wp))
    ck.add("windows-rotated-equal-flat", f"Tier L on the rotated data: the same windows (the vector sweep does not depend on the frame) and local scales within {TOL_R['estimateOverSigma']:g} sigma of the flat ones", [len(wr), dg_rl], same_rl and dg_rl <= TOL_R["estimateOverSigma"])
    ck.add("windows-flat-equal-planar", f"Tier L on the flat data: the planar vector's windows (t0, t1, fix count), local scales within {TOL_P['estimateOverSigma']:g} sigma and their sigmas within {TOL_P['sigmaRelative']:g}", [len(wl), dg_lp, ds_lp], same_lp and dg_lp <= TOL_P["estimateOverSigma"] and ds_lp <= TOL_P["sigmaRelative"])
    pl_, pr_, pp_ = L["tl"]["profile"], R["tl"]["profile"], fcase["tierL"]["profile"]
    dn_rl = max(abs(a - b) / s for a, b, s in zip(pl_["g"], pr_["g"], pl_["sigma"]))
    dn_lp = max(abs(a - b) / s for a, b, s in zip(pl_["g"], pp_["g"], pp_["sigma"]))
    ck.add("profile-invariant", "The calibration profile (nodes against distance) is the same for flat, rotated and planar data within 0.01 node sigma: it holds no direction", [dn_rl, dn_lp, pl_["inflation"], pp_["inflation"]], pl_["uNodes"] == pr_["uNodes"] == pp_["uNodes"] and dn_rl <= 0.01 and dn_lp <= 0.01)
    # present state
    T = block(Rm)
    (_, xL, PL), (_, xR, PR_) = L["anchor"], R["anchor"]
    sL = np.sqrt(np.diag(PL))
    Pb = T.T @ PR_ @ T
    da = {"estimateOverSigma": float(np.max(np.abs(T.T @ xR - xL) / sL)), "sigmaRelative": float(np.max(np.abs(np.sqrt(np.diag(Pb)) / sL - 1.0))), "chi2Relative": 0.0}
    ck.add("present-state-rotated-equals-flat", "The present state and its 6x6 covariance from the rotated data are the flat ones turned by the rotation", da, within(da, TOL_R))
    xp = np.array(fcase["anchor"]["state"])
    Pp = np.array(fcase["anchor"]["covariance"])
    ii = [0, 1, 3, 4]
    dap = float(np.max(np.abs(xL[ii] - xp) / np.sqrt(np.diag(Pp))))
    dsp_a = float(np.max(np.abs(sL[ii] / np.sqrt(np.diag(Pp)) - 1.0)))
    ck.add("present-state-flat-equals-planar", f"The flat present state (x, y, vx, vy) is the planar vector's within {TOL_P['estimateOverSigma']:g} sigma, with the same sigmas within {TOL_P['sigmaRelative']:g}", [dap, dsp_a], dap <= TOL_P["estimateOverSigma"] and dsp_a <= TOL_P["sigmaRelative"])
    # forecasts
    s2L, s2P = L["tl"]["noiseScale"], fin["noiseScale"]
    worst_mean_rl = worst_cov_rl = worst_mean_lp = worst_src_lp = 0.0
    horizon_same = True
    for fl, fr, fp in zip(L["fcs"], R["fcs"], fcase["forecasts"]):
        ml, cl = L["raw"][fl["plan"]]
        mr, cr = R["raw"][fr["plan"]]
        for i, (a, b, p) in enumerate(zip(fl["points"], fr["points"], fp["points"])):
            horizon_same = horizon_same and a["withinHorizon"] == b["withinHorizon"] == p["withinHorizon"]
            if not p["withinHorizon"]:
                continue
            st_ = a["sigmaMajor"]["total"]
            worst_mean_rl = max(worst_mean_rl, float(np.linalg.norm(Rm.T @ mr[i] - ml[i])) / st_)
            worst_cov_rl = max(worst_cov_rl, float(np.max(np.abs(Rm.T @ cr[i]["total"] @ Rm - cl[i]["total"]))) / st_**2)
            worst_mean_lp = max(worst_mean_lp, float(np.linalg.norm(ml[i][:2] - np.array(p["mean"]))) / p["sigmaMajor"]["total"])
            for k in ("profile", "hedge", "engine"):
                if p["sigmaMajor"][k] > 1.0:
                    worst_src_lp = max(worst_src_lp, abs(major_sigma(cl[i][k][:2, :2]) / p["sigmaMajor"][k] - 1.0))
            worst_src_lp = max(worst_src_lp, abs(major_sigma(cl[i]["state"][:2, :2] / s2L) / (p["sigmaMajor"]["state"] / math.sqrt(s2P)) - 1.0))
    ck.add("forecast-rotated-equals-flat", f"Forecast from the rotated data: means and 3x3 covariances are the flat ones turned by the rotation (means within {TOL_R['estimateOverSigma']:g} of the major sigma, covariance entries within {TOL_R['sigmaRelative']:g} of its square) and the horizon ends at the same checkpoints",
           [worst_mean_rl, worst_cov_rl], horizon_same and worst_mean_rl <= TOL_R["estimateOverSigma"] and worst_cov_rl <= TOL_R["sigmaRelative"])
    ck.add("forecast-flat-equals-planar", f"Forecast from the flat data: in-plane means within {TOL_P['estimateOverSigma']:g} of the planar major sigma; the profile, hedge and engine terms and the state term (each divided by its own noise scale) within {TOL_P['sigmaRelative']:g} of the planar ones; the horizon ends at the planar checkpoints",
           [worst_mean_lp, worst_src_lp, s2L, s2P], horizon_same and worst_mean_lp <= TOL_P["estimateOverSigma"] and worst_src_lp <= TOL_P["sigmaRelative"])
    cases[3]["planarReference"] = {"file": "tests/vectors/estimator/forecast-envelope.json", "case": fcase["id"], "noiseScale": s2P}
    return base_vector(
        "rotation-invariance", "Rotation invariance: a planar scenario turned bodily gives the planar results turned",
        "Two planar scenarios (newton-recovers-gm and forecast-envelope, read from the planar vector files) are lifted to 3D, given an out-of-plane pointing error, and fitted in full 3D: flat, turned by a fixed rotation, and turned so that one fix sits on the +z pole. The rotated results are the flat results turned by the rotation; the flat results reproduce the planar vectors in the plane.",
        cases, ck,
        notes=["Expected values: every fit, the Tier L windows and profile, the present state and the forecast points of each case, with the usual tolerances. In addition an implementation should show the two equalities itself: its rotated results against its own flat results turned by `rotation` (tolerance in assumptions-3d.json, rotationInvariance.tolerance.rotatedVsFlat), and its flat results against the planar vector.",
               "The noise scale differs between the planar and the flat run because the flat run has elevation rows; the state term of the forecast is compared after dividing by each run's own noise scale.",
               "`cameraSigma` is null in the forecast cases: the camera misalignment is held fixed in the present-state fit, as in the planar vector. The pole case shows why the bearing residual is formed in the tangent plane at the measured direction (spec 2.1): the azimuth of the fix at the pole is arbitrary and its sigma_az is very large."],
    )
