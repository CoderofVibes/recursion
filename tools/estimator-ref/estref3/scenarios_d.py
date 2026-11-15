"""3D vectors 6-7: the forecast envelope as an ellipsoid, and a carried rule
applied to a dive in a plane where nothing was ever sampled."""
from __future__ import annotations

import math

import numpy as np

from estref.aging import aged_sigma

from . import quat as Q
from .common import (
    AS, DT, MU_A, PR, PR3, R0, SEEDS,
    Checks, angle, attempt_json, command_json, cov6, make_measurements, orbit_normal, orbit_state,
    peri_speed, plane, schedule, structure_json, truth_checkpoints, truth_convergence, truth_structure, truth_values, unit, vec,
)
from .core import Attempt, Command, ship_states
from .diag import tier_l, win_kw
from .local import anchor_state, forecast, mahalanobis, major_axis, major_sigma, make_windows
from .scenarios import CHI_3, base_vector, plane_json

AG = AS["aging"]["classes"]
SRC = ("state", "profile", "hedgeEarned", "hedgeDefault", "engine")
CAM_SIGMA = (PR3["camBiasXY"]["sigma"], PR3["camBiasXY"]["sigma"], PR["camBias"]["sigma"])


def tq(q):
    return tuple(float(c) for c in q)


def plane_split(cov, n_hat):
    """One-sigma size out of a plane with unit normal n_hat, and the largest
    one-sigma size inside it."""
    n_hat = unit(n_hat)
    out = math.sqrt(max(float(n_hat @ cov @ n_hat), 0.0))
    a = unit(np.cross(n_hat, [1.0, 0.0, 0.0]) if abs(n_hat[0]) < 0.9 else np.cross(n_hat, [0.0, 1.0, 0.0]))
    b = np.cross(n_hat, a)
    Bm = np.stack([a, b], axis=1)
    return out, major_sigma(Bm.T @ cov @ Bm)


def forecast_points(mean, covs, truth_rel, times, prof, fh, n_hat, bare=None, validated=None):
    pts = []
    within = True
    for i, t in enumerate(times):
        dev = truth_rel[i] - mean[i]
        c = covs[i]
        r_pred = float(np.linalg.norm(mean[i]))
        sig_tot = major_sigma(c["total"])
        within = within and sig_tot <= fh * r_pred
        s_out, s_in = plane_split(c["total"], n_hat)
        ax = major_axis(c["total"])
        p = {
            "t": t, "mean": [float(v) for v in mean[i]], "rangePredicted": r_pred,
            "insideCoverage": bool(prof["rMin"] <= r_pred <= prof["rMax"]),
            "sigmaMajor": {k: major_sigma(c[k]) for k in SRC + ("hedge", "total")},
            "covTotal": cov6(c["total"]),
            "majorAxis": [float(v) for v in ax],
            "sigmaOutOfPlane": s_out, "sigmaInPlaneMajor": s_in,
            "majorAxisToNormalDeg": math.degrees(min(angle(ax, n_hat), math.pi - angle(ax, n_hat))),
            "withinHorizon": bool(within),
            "truth": [float(v) for v in truth_rel[i]],
            "deviation": float(np.linalg.norm(dev)),
            "mahalanobis": mahalanobis(dev, c["total"]),
            "mahalanobisNoHedge": mahalanobis(dev, c["total"] - c["hedge"]),
        }
        if validated is not None:
            p["insideValidated"] = bool(any(lo <= r_pred <= hi for lo, hi in validated))
        if bare is not None:
            p["uncalibratedDeviation"] = float(np.linalg.norm(truth_rel[i] - bare[i]))
        pts.append(p)
    return pts


# ---------------------------------------------------------------------------
# 6. Forecast envelope in 3D
# ---------------------------------------------------------------------------


def v_forecast_envelope_3d(burn_u=0.15):
    rng = np.random.default_rng(SEEDS["forecast-envelope-3d"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    tst = truth_structure()
    pls = {"att1": (15.0, 0.0), "att2": (80.0, 120.0), "att3": (40.0, 250.0)}
    Rs = {k: plane(*v) for k, v in pls.items()}
    rp3, ra3 = 0.8e6, 1.2e6
    va = peri_speed(MU_A, n_t, rp3, ra3) * rp3 / ra3
    states = {
        "att1": orbit_state(0.75e6, peri_speed(MU_A, n_t, 0.75e6, 1.0e6), 0.0, Rs["att1"]),
        "att2": orbit_state(1.0e6, peri_speed(MU_A, n_t, 1.0e6, 1.3e6), 2.0, Rs["att2"]),
        "att3": orbit_state(ra3, va, 0.5, Rs["att3"]),
    }
    tv = truth_values(n_t, states)
    t_now = 14400.0
    a1 = Attempt("att1", 43200.0, [], [], "Earlier attempt: coasting arc r 0.75-1.0 r0 (12 h), plane inclined 15 deg.")
    a2 = Attempt("att2", 57600.0, [], [], "Earlier attempt: coasting arc r 1.0-1.3 r0 (16 h), plane inclined 80 deg (node 120 deg).")
    a3 = Attempt("att3", t_now, [], [], "Current attempt: coasting inward from apocentre at 1.2 r0 in a plane inclined 40 deg (node 250 deg), holding one attitude (the `q` on its fixes); data up to now (4 h).")
    q_before = Q.from_axis_angle([0.2, -0.4, 0.9], 2.2)  # the attitude the ship holds through the current arc
    a1.meas, _ = make_measurements(tst, a1, tv, rng, schedule(0, a1.duration, 180.0))
    a2.meas, _ = make_measurements(tst, a2, tv, rng, schedule(0, a2.duration, 240.0))
    a3.meas, _ = make_measurements(tst, a3, tv, rng, schedule(0, t_now, 180.0), attitude=lambda t: q_before)

    names, X, idx = vec(tv)
    S_now, _ = ship_states(tst, a3, X, idx, DT, [t_now])
    v_now = S_now[0, 0, 3:]
    n_now = orbit_normal(S_now[0, 0])
    q_retro = Q.point_along(q_before, -v_now)
    q_norm = Q.point_along(q_before, n_now)
    hours = (1, 2, 3, 4, 5, 6, 7, 8)
    times = [t_now + 3600.0 * h for h in hours]
    fresh = (0.003, 0.001, 0.001)
    hist = {"shipDays": 12.0, "commandedDv": 250.0, "conditionDrops": [0.15]}
    aged = (
        aged_sigma(0.002, AG["engine.kE"], hist["shipDays"] * 86400.0, hist["commandedDv"], hist["conditionDrops"]),
        aged_sigma(0.001, AG["engine.dE"], hist["shipDays"] * 86400.0, hist["commandedDv"], hist["conditionDrops"]),
        aged_sigma(0.001, AG["engine.dE"], hist["shipDays"] * 86400.0, hist["commandedDv"], hist["conditionDrops"]),
    )
    plans = {
        "coast": ([], fresh, None, "Keep coasting; the path stays inside the sampled distances."),
        "dive": ([Command(t_now, t_now + 120.0, burn_u, tq(q_retro))], fresh, {"reference": "retrograde", "qBefore": tq(q_before), "direction": [float(c) for c in unit(-v_now)], "q": tq(q_retro)},
                 f"Retrograde burn of 120 s at {burn_u} m/s^2 now, then coast: the path drops below every sampled distance."),
        "plane-change": ([Command(t_now, t_now + 120.0, burn_u, tq(q_norm))], aged, {"reference": "direction (orbit normal)", "qBefore": tq(q_before), "direction": [float(c) for c in n_now], "q": tq(q_norm)},
                         f"Burn of 120 s at {burn_u} m/s^2 along the orbit normal now, with an engine calibration aged by 12 ship days, 250 m/s and one damage event (spec 3.7), then coast."),
    }

    ref = {"r0": R0, "mu": PR["muA"]["mean"], "n": 2.0, "cam": 0.0, "kE": 0.97, "dE": 0.004, "dP": 0.003}
    tl = tier_l(ref, [a1, a2, a3])
    prof = tl["profile"]
    s2 = tl["noiseScale"]
    wins = [w for w in make_windows(a3, **win_kw()) if not w.powered][-AS["windows"]["anchorWindows"]:]
    t_last, x_now, P_now, anc = anchor_state(ref, prof, a3, wins, DT, g_prior=(1.0, AS["windows"]["localScalePriorSigma"]), slope_sigma=AS["windows"]["anchorSlopePriorSigma"], cam_sigma=CAM_SIGMA)
    n_est = orbit_normal(x_now)
    sigma_h = AS["hedge"]["sigmaH"]
    fh = AS["hedge"]["horizonFraction"]

    fcs = {}
    for pid, (cmds, eng_sigma, _, _) in plans.items():
        plan_att = Attempt("att3", max(times) + DT, cmds, [])
        _, truth_rel = ship_states(tst, plan_att, X, idx, DT, times)
        mean, covs = forecast(ref, prof, plan_att, t_last, x_now, P_now, times, DT, s2, sigma_h, eng_sigma)
        bare, _ = forecast(ref, None, plan_att, t_last, x_now, P_now, times, DT, s2, 0.0, eng_sigma)
        fcs[pid] = forecast_points(mean, covs, truth_rel[0], times, prof, fh, n_est, bare=bare)

    cc, dc, pc = fcs["coast"], fcs["dive"], fcs["plane-change"]
    for pid, pts in fcs.items():
        inh = [p for p in pts if p["withinHorizon"]]
        worst = max(p["mahalanobis"] for p in inh)
        ck.add(f"honest-{pid}", f"{pid}: truth inside the 3 sigma ellipsoid (Mahalanobis distance below 3.76 for three numbers) at every checkpoint inside the forecast horizon", [worst, len(inh)], worst < CHI_3 and len(inh) >= 3)
    ck.add("coast-full-horizon", "Coast plan: all 8 hourly checkpoints stay inside the forecast horizon", sum(1 for p in cc if p["withinHorizon"]), all(p["withinHorizon"] for p in cc))
    ck.add("calibration-pays", "Coast plan, +6 h: the calibrated forecast is at least 10x closer to truth than the bare reference law from the same present state", [cc[5]["deviation"], cc[5]["uncalibratedDeviation"]], cc[5]["uncalibratedDeviation"] > 10 * cc[5]["deviation"])
    ck.add("no-hedge-inside-coverage", "Coast plan: the hedge contributes nothing while the path stays inside the sampled distances", max(p["sigmaMajor"]["hedge"] for p in cc), all(p["sigmaMajor"]["hedge"] < 1e-6 for p in cc))
    r3 = [m.z[2] for m in a3.meas]
    own = [p for p in cc if p["rangePredicted"] < min(r3)]
    ck.add("profile-from-other-planes", "Coast plan: checkpoints below every distance the current arc has sampled are forecast with a profile measured only in two other orbit planes, with no hedge and truth still inside 3 sigma (the profile is indexed by distance alone)",
           [len(own), min(r3), min(p["rangePredicted"] for p in cc)], len(own) >= 3 and all(p["sigmaMajor"]["hedge"] < 1e-6 and p["mahalanobis"] < CHI_3 for p in own))
    out = [p for p in dc if not p["insideCoverage"] and p["withinHorizon"]]
    ck.add("dive-leaves-coverage", "Dive plan: at least one checkpoint inside the horizon lies below the sampled distances", len(out), len(out) >= 1)
    deep = out[-1]
    ck.add("hedge-widens-outside", "Dive plan: at the deepest checkpoint inside the horizon the hedge is the largest contribution to the envelope", deep["sigmaMajor"], deep["sigmaMajor"]["hedge"] == max(deep["sigmaMajor"][k] for k in ("state", "profile", "hedge", "engine")))
    ck.add("hedge-needed", "Dive plan: without the hedge the envelope would be overconfident there (Mahalanobis distance > 3.76)", max(p["mahalanobisNoHedge"] for p in out), max(p["mahalanobisNoHedge"] for p in out) > CHI_3)
    ck.add("horizon-ends-dive", "Dive plan: the forecast horizon ends before the last checkpoint (the model stops forecasting instead of guessing)", sum(1 for p in dc if p["withinHorizon"]), not dc[-1]["withinHorizon"])
    ck.add("dive-uncertainty-in-plane", "Dive plan: at that deepest checkpoint the ellipsoid's long axis lies in the orbit plane (more than 60 deg from the orbit normal)", deep["majorAxisToNormalDeg"], deep["majorAxisToNormalDeg"] > 60.0)
    p1 = pc[0]
    ck.add("out-of-plane-largest", "Plane-change plan with an aged engine, +1 h: the ellipsoid's long axis is within 25 deg of the orbit normal, the out-of-plane 1 sigma exceeds the largest in-plane 1 sigma, and the engine is the largest source",
           [p1["majorAxisToNormalDeg"], p1["sigmaOutOfPlane"], p1["sigmaInPlaneMajor"], p1["sigmaMajor"]],
           p1["majorAxisToNormalDeg"] < 25.0 and p1["sigmaOutOfPlane"] > p1["sigmaInPlaneMajor"] and p1["sigmaMajor"]["engine"] == max(p1["sigmaMajor"][k] for k in ("state", "profile", "hedge", "engine")))
    c1 = cc[0]
    ck.add("coasting-envelope-is-flat", "Coast plan, +1 h: with no burn planned the same ellipsoid is long in the orbit plane and thin across it (out-of-plane 1 sigma below half the in-plane one)", [c1["sigmaOutOfPlane"], c1["sigmaInPlaneMajor"]], c1["sigmaOutOfPlane"] < 0.5 * c1["sigmaInPlaneMajor"])
    floor = CAM_SIGMA[0] * c1["rangePredicted"]
    ck.add("picture-orientation-in-envelope", "Coast plan, +1 h: the out-of-plane 1 sigma is no smaller than 0.7 x (camera misalignment sigma x distance): the unknown orientation of the picture is part of the envelope", [c1["sigmaOutOfPlane"], floor], c1["sigmaOutOfPlane"] > 0.7 * floor)

    case = {
        "id": "sampled-and-unsampled-3d",
        "attempts": [attempt_json(a) for a in (a1, a2, a3)],
        "now": t_now,
        "plans": {pid: {"description": d, "commands": [command_json(c) for c in cm], "checkpoints": times,
                        "engineSigma": {"kE": es[0], "dE": es[1], "dP": es[2]}, **({"attitudeResolution": ar} if ar else {})}
                  for pid, (cm, es, ar, d) in plans.items()},
        "agedEngine": {"carriedSigma": {"kE": 0.002, "dE": 0.001, "dP": 0.001}, "history": hist, "note": "dP ages with the rates of engine.dE"},
        "truth": {"structure": structure_json(tst), "values": tv, "planes": {k: plane_json(Rs[k], *pls[k]) for k in pls},
                  "checkpoints": {a.id: truth_checkpoints(tst, a, tv, [0, a.duration]) for a in (a1, a2, a3)},
                  "integrationCheck_m": max(truth_convergence(tst, Attempt("att3", t_now + 6 * 3600.0, plans[p][0], []), tv, [t_now + 6 * 3600.0]) for p in ("dive", "plane-change"))},
        "forecastInputs": {"reference": ref, "cameraSigma": list(CAM_SIGMA), "sigmaH": sigma_h, "horizonFraction": fh, "noiseScale": s2, "anchorWindows": AS["windows"]["anchorWindows"],
                           "orbitNormalNow": [float(c) for c in n_est]},
        "tierL": tl,
        "anchor": {**anc, "tNow": t_last, "state": [float(v) for v in x_now], "covariance": [[float(v) for v in row] for row in P_now]},
        "forecasts": [{"plan": pid, "points": pts} for pid, pts in fcs.items()],
    }
    return base_vector(
        "forecast-envelope-3d", "Forecast envelope in 3D: an ellipsoid, confident where sampled, honest elsewhere",
        "Inverse-2.5 truth, Newtonian reference law (no extension adopted). Tier L calibrates gravity against distance from two earlier attempts in two other planes and the current one. Forecasts are issued from the present state for a coasting plan, a dive below the sampled distances and a plane change with an aged engine. Each sample carries a 3x3 position covariance.",
        [case], ck,
        notes=["Expected values: tierL windows and profile, anchor state and covariance, and every forecast point inside the horizon. Tolerance for forecast points: |mean_impl - mean_ref| <= 0.05 sigmaMajor.total; sigmaMajor components within 5% (or 1 m absolute); covTotal entries within 5% of sigmaMajor.total^2. `truth`, `deviation`, `mahalanobis*` and `uncalibratedDeviation` are checks, not estimator outputs.",
               "`sigmaOutOfPlane`, `sigmaInPlaneMajor` and `majorAxisToNormalDeg` are measured against `forecastInputs.orbitNormalNow`, the orbit normal of the present state.",
               "Planned burns are given as resolved attitudes `q`; `attitudeResolution` records how the roll-held rule produced them."],
    )


# ---------------------------------------------------------------------------
# 7. A carried rule applied to a dive in another plane
# ---------------------------------------------------------------------------

MU_NEW = 6.0e9
MU_NEW_PRIOR = (6.1e9, 2.0e8)
CARRIED = {
    "rule": "distance-law",
    "n": 2.5,
    "sigmaN": 1.2e-4,
    "earnedSigmaH": 0.0185,
    "validated": [{"recordedOn": "body A of the earlier encounter", "rMin": 0.6e6, "rMax": 1.4e6}],
    "source": "values as produced by the planar extension-validation / distance-law, rounded; a validated span is distances only",
}


def rotate_about(axis, ang, v):
    a = unit(axis)
    return v * math.cos(ang) + np.cross(a, v) * math.sin(ang) + a * float(a @ v) * (1 - math.cos(ang))


def v_carried_rule_other_plane(dv_retro=13.8, tilt_deg=25.0, orbit=(1.05e6, 1.15e6), hours=10.0, t_now=86400.0):
    rng = np.random.default_rng(SEEDS["carried-rule-other-plane"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    tst = truth_structure()
    pl = (30.0, 45.0)
    Rpl = plane(*pl)
    rp, ra = orbit
    s0 = orbit_state(ra, peri_speed(MU_NEW, n_t, rp, ra) * rp / ra, 0.4, Rpl)
    tv = truth_values(n_t, {"att1": s0}, muA=MU_NEW)
    q_before = Q.from_axis_angle([0.7, 0.1, -0.4], 1.3)  # the attitude the ship holds through the arc
    a1 = Attempt("att1", t_now, [], [], "First arc in a later encounter around a new body (mu = 6e9): coasting between 1.05 and 1.15 r0 in a plane inclined 30 deg, holding one attitude (the `q` on its fixes); data up to now (24 h), fixes every 180 s.")
    a1.meas, _ = make_measurements(tst, a1, tv, rng, schedule(0, t_now, 180.0), attitude=lambda t: q_before)

    names, X, idx = vec(tv)
    S_now, _ = ship_states(tst, a1, X, idx, DT, [t_now])
    r_now, v_now = S_now[0, 0, :3], S_now[0, 0, 3:]
    # Retrograde burn combined with a plane change: the velocity after the burn is the
    # retrograde-burn velocity turned about the radial direction by `tilt_deg`.
    v_after = rotate_about(r_now, math.radians(tilt_deg), v_now - dv_retro * unit(v_now))
    dv = v_after - v_now
    burn_u = float(np.linalg.norm(dv)) / 120.0
    q_burn = Q.point_along(q_before, dv)
    burn = [Command(t_now, t_now + 120.0, burn_u, tq(q_burn))]
    times = [t_now + 1800.0 * h for h in range(1, int(2 * hours) + 1)]
    plan_att = Attempt("att1", max(times) + DT, burn, [])
    St, truth_rel = ship_states(tst, plan_att, X, idx, DT, times)
    plane_turn = angle(orbit_normal(St[0, 0]), orbit_normal(S_now[0, 0]))
    ck.add("dive-in-another-plane", "The dive leaves the plane of every fix ever taken around this body: its orbit plane is more than 20 deg from the tracked one", math.degrees(plane_turn), math.degrees(plane_turn) > 20.0)

    eng = {"kE": 0.97, "dE": 0.004, "dP": 0.003}
    eng_sigma = (0.003, 0.001, 0.001)
    sigma_h = AS["hedge"]["sigmaH"]
    fh = AS["hedge"]["horizonFraction"]
    spans = [(v["rMin"], v["rMax"]) for v in CARRIED["validated"]]
    everywhere = [(1.0, 1.0e12)]
    models = {
        "carried-rule": ({"r0": R0, "mu": MU_NEW_PRIOR[0], "n": CARRIED["n"], "cam": 0.0, **eng}, spans, CARRIED["earnedSigmaH"],
                         "Spec: carried exponent rule; earned hedge inside its validated range, default hedge beyond."),
        "earned-everywhere": ({"r0": R0, "mu": MU_NEW_PRIOR[0], "n": CARRIED["n"], "cam": 0.0, **eng}, everywhere, CARRIED["earnedSigmaH"],
                              "Contrast only (the superseded rule): the earned hedge applied at every distance."),
        "no-rule": ({"r0": R0, "mu": MU_NEW_PRIOR[0], "n": 2.0, "cam": 0.0, **eng}, None, None,
                    "Contrast only: nothing carried; Newtonian law with the default hedge."),
    }
    wins = [w for w in make_windows(a1, **win_kw()) if not w.powered][-AS["windows"]["anchorWindows"]:]
    out = {}
    tls = {}
    for mid, (ref, val, sig_e, desc) in models.items():
        key = ref["n"]
        if key not in tls:
            tl = tier_l(ref, [a1])
            anc = anchor_state(ref, tl["profile"], a1, wins, DT, g_prior=(1.0, AS["windows"]["localScalePriorSigma"]), slope_sigma=AS["windows"]["anchorSlopePriorSigma"], cam_sigma=CAM_SIGMA)
            tls[key] = (tl, anc)
        tl, (t_last, x_now, P_now, anc_info) = tls[key]
        prof = tl["profile"]
        mean, covs = forecast(ref, prof, plan_att, t_last, x_now, P_now, times, DT, tl["noiseScale"], sigma_h, eng_sigma, validated=val, sigma_e=sig_e)
        pts = forecast_points(mean, covs, truth_rel[0], times, prof, fh, orbit_normal(x_now), validated=val or [])
        out[mid] = {"description": desc, "reference": ref, "validated": [list(v) for v in val] if val else [], "sigmaEarned": sig_e, "sigmaDefault": sigma_h,
                    "anchor": {**anc_info, "tNow": t_last, "state": [float(v) for v in x_now], "covariance": [[float(v) for v in row] for row in P_now]},
                    "points": pts}

    R, E, N = out["carried-rule"]["points"], out["earned-everywhere"]["points"], out["no-rule"]["points"]
    inh = [p for p in R if p["withinHorizon"]]
    worst = max(p["mahalanobis"] for p in inh)
    ck.add("honest", "Carried rule: truth inside the 3 sigma ellipsoid at every checkpoint inside the horizon", [worst, len(inh)], worst < CHI_3 and len(inh) >= 4)
    earned_zone = [i for i, p in enumerate(R) if p["withinHorizon"] and not p["insideCoverage"] and p["insideValidated"]]
    ck.add("earned-zone-exists", "Checkpoints inside the horizon lie outside the sampled distances but inside the rule's validated range, in a plane that was never sampled", len(earned_zone), len(earned_zone) >= 3)
    ez = earned_zone[-1]
    ck.add("earned-inside-validated", "At the last of them the default hedge contributes nothing and the envelope equals the earned-everywhere one: the span applies by distance, whatever the plane", [R[ez]["sigmaMajor"]["hedgeDefault"], R[ez]["sigmaMajor"]["total"], E[ez]["sigmaMajor"]["total"]],
           R[ez]["sigmaMajor"]["hedgeDefault"] < 1.0 and abs(R[ez]["sigmaMajor"]["total"] / E[ez]["sigmaMajor"]["total"] - 1) < 1e-6)
    ck.add("carried-rule-helps", "There the hedge is at least 5x smaller than with no rule, and the forecast at least 5x closer to truth", [R[ez]["sigmaMajor"]["hedgeEarned"], N[ez]["sigmaMajor"]["hedgeDefault"], R[ez]["deviation"], N[ez]["deviation"]],
           N[ez]["sigmaMajor"]["hedgeDefault"] > 5 * R[ez]["sigmaMajor"]["hedgeEarned"] and N[ez]["deviation"] > 5 * R[ez]["deviation"])
    nR, nE, nN = (sum(1 for p in pts if p["withinHorizon"]) for pts in (R, E, N))
    ck.add("horizon-order", "Forecast horizon in checkpoints: no rule < carried rule <= earned everywhere", [nN, nR, nE], nN < nR <= nE)
    ck.add("no-rule-ends-early", "With nothing carried the forecast ends before reaching the bottom of the validated range (0.6 r0)", N[nN - 1]["rangePredicted"], N[nN - 1]["rangePredicted"] > 0.6e6)
    ck.add("carried-rule-reaches-below", "With the carried rule the forecast runs through the validated range and ends below it", R[nR - 1]["rangePredicted"], nR < len(R) and R[nR - 1]["rangePredicted"] < 0.6e6)
    first_out = R[nR] if nR < len(R) else R[-1]
    sm = first_out["sigmaMajor"]
    ck.add("default-hedge-ends-it", "At the first checkpoint past its horizon the default hedge is the largest contribution and at least 2x the earned one: untested distance, not the rule, ends the forecast", sm, sm["hedgeDefault"] == max(sm[k] for k in SRC) and sm["hedgeDefault"] > 2 * sm["hedgeEarned"])
    e_same = E[min(nR, len(E) - 1)]["sigmaMajor"]["total"]
    ck.add("not-easy", "At that checkpoint the envelope is at least 1.5x wider than if the earned hedge applied everywhere", [sm["total"], e_same], sm["total"] > 1.5 * e_same)

    case = {
        "id": "later-encounter-dive-other-plane",
        "attempts": [attempt_json(a1)],
        "now": t_now,
        "carried": CARRIED,
        "plan": {"description": f"Burn of 120 s at {burn_u:.4f} m/s^2 now: {dv_retro} m/s retrograde combined with a {tilt_deg:g} deg plane change, then coast. The path leaves the sampled distances and the sampled plane, crosses the validated range and drops below it.",
                 "commands": [command_json(c_) for c_ in burn], "checkpoints": times,
                 "attitudeResolution": {"reference": "direction", "qBefore": tq(q_before), "direction": [float(c) for c in unit(dv)], "q": tq(q_burn)}},
        "truth": {"structure": structure_json(tst), "values": tv, "plane": plane_json(Rpl, *pl), "planeTurnedByBurn": plane_turn,
                  "checkpoints": {"att1": truth_checkpoints(tst, a1, tv, [0, t_now])}, "integrationCheck_m": truth_convergence(tst, Attempt("att1", times[-1], burn, []), tv, [times[-1]])},
        "forecastInputs": {"engineSigma": {"kE": eng_sigma[0], "dE": eng_sigma[1], "dP": eng_sigma[2]}, "cameraSigma": list(CAM_SIGMA), "horizonFraction": fh, "anchorWindows": AS["windows"]["anchorWindows"], "transfer": AS["validatedRange"]["transfer"]},
        "tierL": {("power-law-2.5" if k == 2.5 else "newtonian"): v[0] for k, v in tls.items()},
        "forecasts": [{"model": mid, **o} for mid, o in out.items()],
    }
    return base_vector(
        "carried-rule-other-plane", "A carried rule's validated span applies to a dive in a plane never sampled",
        "A later encounter around a new body in the inverse-2.5 world. The exponent rule was validated earlier over 0.6-1.4 r0. One 24 h arc has been tracked (1.05-1.15 r0) in one orbit plane. The plan dives below 0.6 r0 and changes plane by 25 deg. Validated spans and the calibration profile are distances only, so they apply in the new plane; three forecasts from the same data show the earned hedge inside the span and the default beyond it.",
        [case], ck,
        notes=["Expected values: the `carried-rule` forecast (and its Tier L and anchor). The other two forecasts are contrasts that the checks use. Tolerance as in forecast-envelope-3d.",
               "The new body's local gravity scale is measured by Tier L inside the sampled distances, so its mass prior does not enter the forecast."],
    )
