"""Vectors 6-7: held-out validation of extensions (P5) and the forecast envelope."""
from __future__ import annotations

import math

import numpy as np

from .common import (
    AS, DT, MU_A, MU_B, PR, R0,
    Checks, attempt_json, guess_body, guess_ship, make_measurements, p_body_state, p_cam, p_muA, p_muB, p_n, p_ship,
    peri_speed, schedule, state_at, structure_json, truth_checkpoints, truth_convergence, truth_structure, truth_values, vec,
)
from .core import Attempt, Command, ship_states
from .diag import tier_l, win_kw
from .fit import heldout_consistency
from .local import anchor_state, earned_hedge, forecast, local_fits, mahalanobis, major_sigma, make_windows
from .scenarios import SEEDS, base_vector, clean_copy, do_fit, fit_entry, model_binary, model_single
from .scenarios_b import gen_binary_attempts

K_HO = AS["validation"]["heldOutSigmaK"]
BURN_U = 0.15


def coverage(attempts):
    rr = [m.z[1] for a in attempts for m in a.meas if m.kind == "opnav" and m.target == "A" and len(m.z) == 2]
    return float(min(rr)), float(max(rr))


def validate(mid, desc, st, params_fn, train, ctrain, held, held_local_fn, ck):
    """Fit `st` on the training attempts, then run the held-out consistency test."""
    params = params_fn(train)
    f, _ = do_fit(st, train, params)
    e, _ = fit_entry(mid, desc, st, train, params, f, ctrain)
    ho = heldout_consistency(st, f, params, held, held_local_fn(held), DT, k=K_HO)
    e["heldOut"] = {"attempt": held.id, **ho}
    e["cost"] = f.chi2 + f.prior_cost
    return f, e, params


def v_extension_validation():
    rng = np.random.default_rng(SEEDS["extension-validation"])
    ck = Checks()
    cases = []

    # ---- Case 1: the distance law. Truth: inverse-2.5, single body. ----------
    n_t = AS["gravity"]["nTrue"]
    tst = truth_structure()
    defs = {
        "att1": (0.9e6, 1.1e6, 50400.0, 180.0, 0.0, "Training: coasting arc r 0.9-1.1 r0 (14 h)."),
        "att2": (1.1e6, 1.4e6, 64800.0, 240.0, 2.0, "Training: coasting arc r 1.1-1.4 r0 (18 h)."),
        "att3": (0.6e6, 0.85e6, 36000.0, 180.0, 4.0, "Held out: coasting arc r 0.6-0.85 r0 (10 h), closer than any training data."),
    }
    states = {aid: state_at(d[0], peri_speed(MU_A, n_t, d[0], d[1]), d[4]) for aid, d in defs.items()}
    tv = truth_values(n_t, states)
    atts, catts = {}, {}
    for aid, (rp, ra, T, every, ang, note) in defs.items():
        a = Attempt(aid, T, [], [], note)
        a.meas, c = make_measurements(tst, a, tv, rng, schedule(0, T, every))
        atts[aid], catts[aid] = a, clean_copy(a, c)
    train, ctrain, held = [atts["att1"], atts["att2"]], [catts["att1"], catts["att2"]], atts["att3"]
    ships = lambda A_: sum((p_ship(a.id, guess_ship(a)) for a in A_), [])
    held_ship = lambda a: p_ship(a.id, guess_ship(a))

    fN, eN, _ = validate("newtonian", "Base structure: Newtonian, mu.A free.", model_single(2.0), lambda A_: ships(A_) + [p_muA(), p_cam()], train, ctrain, held, held_ship, ck)
    fX, eX, pX = validate("exponent", "Extension: distance-law exponent free.", model_single("law.n"), lambda A_: ships(A_) + [p_muA(), p_n(), p_cam()], train, ctrain, held, held_ship, ck)
    pen = math.log(fN.m)
    dcost = eN["cost"] - eX["cost"]
    eX["adoption"] = {"deltaCost": dcost, "penalty": pen, "evidence": bool(dcost >= pen), "heldOutPass": eX["heldOut"]["pass"], "adopt": bool(dcost >= pen and eX["heldOut"]["pass"])}
    ck.add("newtonian-fails-heldout", "Newtonian structure fails the held-out attempt (T/nu above threshold)", eN["heldOut"]["TperNu"], not eN["heldOut"]["pass"])
    ck.add("exponent-passes-heldout", "Exponent extension passes the held-out attempt at a distance it never trained on", eX["heldOut"]["TperNu"], eX["heldOut"]["pass"])
    ck.add("exponent-adoptable", "Exponent extension: training cost drop exceeds ln(m) and held-out passes", dcost, eX["adoption"]["adopt"])
    n, sn = fX.get("law.n")
    ck.add("exponent-from-training", "Exponent fitted on training data within 3 sigma of 2.5", (n - n_t) / sn, abs(n - n_t) <= 3 * sn)
    # Earned hedge (spec 7.4): local fits of the held-out attempt under the trained law.
    ref = {"r0": R0, "mu": float(fX.get("mu.A")[0]), "n": float(n), "cam": float(fX.get("camera.bias")[0])}
    rows = local_fits(ref, [held], DT, g_sigma=AS["windows"]["localScalePriorSigma"], **win_kw())
    rmin, rmax = coverage(train)
    eh = earned_hedge(rows, rmin, rmax, float(sn), AS["hedge"]["sigmaH"], AS["hedge"]["sigmaHFloor"])
    eX["earnedHedge"] = {"reference": ref, "trainingCoverage": [rmin, rmax], "heldOutWindows": rows, "body": "A", **eh}
    vr = eh["validatedRange"]
    ck.add("validated-range", "The earned hedge is recorded with its validated range: 0.6-1.4 r0 on body A (training plus held-out distances)", vr, vr is not None and 0.58e6 < vr[0] < 0.62e6 and 1.38e6 < vr[1] < 1.42e6)
    ck.add("hedge-earned", "Validated exponent extension earns a hedge below 1/5 of the default sigma_h", eh["sigmaH"], eh["sigmaH"] < 0.2 * AS["hedge"]["sigmaH"])
    cases.append({
        "id": "distance-law",
        "description": "Truth: inverse-2.5 law. Train on r 0.9-1.4 r0, hold out an attempt at r 0.6-0.85 r0.",
        "training": ["att1", "att2"], "heldOut": "att3",
        "attempts": [attempt_json(a) for a in atts.values()],
        "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {i: truth_checkpoints(tst, atts[i], tv, [0, atts[i].duration]) for i in atts}, "integrationCheck_m": max(truth_convergence(tst, atts[i], tv, [atts[i].duration]) for i in atts)},
        "fits": [eN, eX],
    })

    # ---- Case 2: the overlooked body. Truth: Newtonian binary. ---------------
    bdefs = [
        ("att1", 0.7, 0.8e6, 1.2e6, 0.0, 57600.0, "Training: ship coasts around A, r 0.8-1.2 r0 (16 h); B at phase 0.7 rad."),
        ("att2", 2.5, 0.9e6, 1.3e6, 1.5, 57600.0, "Training: r 0.9-1.3 r0 (16 h); B at phase 2.5 rad."),
        ("att3", 4.4, 1.0e6, 1.5e6, 3.0, 57600.0, "Held out: r 1.0-1.5 r0 (16 h); B at phase 4.4 rad."),
    ]
    tstb, tvb, battl, bclean = gen_binary_attempts(2.0, bdefs, rng)
    batt = {a.id: a for a in battl}
    btrain, bctrain, bheld = [batt["att1"], batt["att2"]], [bclean["att1"], bclean["att2"]], batt["att3"]
    fA, eA, _ = validate("A-only", "Base structure: Newtonian, A only.", model_single(2.0), lambda A_: ships(A_) + [p_muA(), p_cam()], btrain, bctrain, bheld, held_ship, ck)
    fW, eW, _ = validate("A-only-exponent", "Wrong extension: exponent free, still A only.", model_single("law.n"), lambda A_: ships(A_) + [p_muA(), p_n(), p_cam()], btrain, bctrain, bheld, held_ship, ck)
    bparams = lambda A_: sum((p_ship(a.id, guess_ship(a)) + p_body_state(a.id, "B", guess_body(a, "B")) for a in A_), []) + [p_muA(), p_muB(), p_cam()]
    bheld_local = lambda a: p_ship(a.id, guess_ship(a)) + p_body_state(a.id, "B", guess_body(a, "B"))
    fB, eB, _ = validate("add-body-B", "Right extension: body B modelled (seen mode), mu.B free.", model_binary(2.0), bparams, btrain, bctrain, bheld, bheld_local, ck)
    penb = math.log(fA.m)
    for e, nextra in ((eW, 1), (eB, 1)):
        d = eA["cost"] - e["cost"]
        e["adoption"] = {"deltaCost": d, "penalty": penb * nextra, "evidence": bool(d >= penb * nextra), "heldOutPass": e["heldOut"]["pass"], "adopt": bool(d >= penb * nextra and e["heldOut"]["pass"])}
    ck.add("A-only-fails-heldout", "A-only structure fails the held-out attempt", eA["heldOut"]["TperNu"], not eA["heldOut"]["pass"])
    ck.add("wrong-extension-fails", "Wrong extension (exponent) fails the held-out attempt and is not adopted", eW["heldOut"]["TperNu"], (not eW["heldOut"]["pass"]) and not eW["adoption"]["adopt"])
    ck.add("wrong-extension-still-misfits", "Wrong extension leaves training chi2/nu > 5", fW.chi2_nu, fW.chi2_nu > 5)
    ck.add("right-extension-passes", "Right extension (body B) passes the held-out attempt and is adopted", eB["heldOut"]["TperNu"], eB["adoption"]["adopt"])
    mb, smb = fB.get("mu.B")
    ck.add("body-gm-from-training", "mu.B fitted on training data within 3 sigma of 2.5e9", (mb - MU_B) / smb, abs(mb - MU_B) <= 3 * smb)
    cases.append({
        "id": "overlooked-body",
        "description": "Truth: Newtonian binary. The model starts with A only. Two candidate extensions are tested against the same held-out attempt.",
        "training": ["att1", "att2"], "heldOut": "att3",
        "attempts": [attempt_json(a) for a in battl],
        "truth": {"structure": structure_json(tstb), "values": tvb, "checkpoints": {a.id: truth_checkpoints(tstb, a, tvb, [0, a.duration]) for a in battl}, "integrationCheck_m": max(truth_convergence(tstb, a, tvb, [a.duration]) for a in battl)},
        "fits": [eA, eW, eB],
    })
    return base_vector(
        "extension-validation", "Extensions validated against a held-out attempt (P5)",
        "Each candidate structure is fitted on the training attempts and then tested on a held-out attempt: the held-out arc's local parameters are fitted with the training posterior of the global parameters as a prior, and T = chi2 + prior penalty is compared with its expectation. The right rule passes somewhere it never trained; the base structure and a wrong extension fail visibly.",
        cases, ck,
        notes=["heldOut.T, nu, TperNu, threshold and pass are part of the expected values. For fits marked compare = qualitative only pass/fail and the listed checks are required."],
    )


# ---------------------------------------------------------------------------
# 7. Forecast envelope: confident where sampled, honest elsewhere
# ---------------------------------------------------------------------------


def cov_json(c):
    return [[float(c[0, 0]), float(c[0, 1])], [float(c[1, 0]), float(c[1, 1])]]


def v_forecast_envelope(burn_u=BURN_U):
    rng = np.random.default_rng(SEEDS["forecast-envelope"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    tst = truth_structure()
    rp3, ra3 = 0.8e6, 1.2e6
    va = peri_speed(MU_A, n_t, rp3, ra3) * rp3 / ra3
    states = {
        "att1": state_at(0.75e6, peri_speed(MU_A, n_t, 0.75e6, 1.0e6), 0.0),
        "att2": state_at(1.0e6, peri_speed(MU_A, n_t, 1.0e6, 1.3e6), 2.0),
        "att3": state_at(ra3, va, 0.5),
    }
    tv = truth_values(n_t, states)
    t_now = 14400.0
    a1 = Attempt("att1", 43200.0, [], [], "Earlier attempt: coasting arc r 0.75-1.0 r0 (12 h).")
    a2 = Attempt("att2", 57600.0, [], [], "Earlier attempt: coasting arc r 1.0-1.3 r0 (16 h).")
    a3 = Attempt("att3", t_now, [], [], "Current attempt: coasting inward from apocentre at 1.2 r0; data up to now (4 h).")
    a1.meas, _ = make_measurements(tst, a1, tv, rng, schedule(0, a1.duration, 180.0))
    a2.meas, _ = make_measurements(tst, a2, tv, rng, schedule(0, a2.duration, 240.0))
    a3.meas, _ = make_measurements(tst, a3, tv, rng, schedule(0, t_now, 180.0))

    # Plans from "now": coast, or a retrograde burn that drops pericentre below all sampled distances.
    names, X, idx = vec(tv)
    S_now, _ = ship_states(tst, a3, X, idx, DT, [t_now])
    vx, vy = S_now[0, 0, 2], S_now[0, 0, 3]
    burn = [Command(t_now, t_now + 120.0, burn_u, float(math.atan2(-vy, -vx)))]
    hours = (1, 2, 3, 4, 5, 6, 7, 8)
    plans = {
        "coast": ([], [t_now + 3600.0 * h for h in hours], "Keep coasting; the path stays inside the sampled distances."),
        "dive": (burn, [t_now + 3600.0 * h for h in hours], f"Retrograde burn of 120 s at {burn_u} m/s^2 now, then coast: the path drops below every sampled distance."),
    }

    ref = {"r0": R0, "mu": PR["muA"]["mean"], "n": 2.0, "cam": 0.0, "kE": 0.97, "dE": 0.004}
    eng_sigma = (0.003, 0.001)
    tl = tier_l(ref, [a1, a2, a3])
    prof = tl["profile"]
    s2 = tl["noiseScale"]
    wins = [w for w in make_windows(a3, **win_kw()) if not w.powered][-AS["windows"]["anchorWindows"] :]
    t_last, x_now, P_now, anc = anchor_state(ref, prof, a3, wins, DT, g_prior=(1.0, AS["windows"]["localScalePriorSigma"]), slope_sigma=AS["windows"]["anchorSlopePriorSigma"])
    sigma_h = AS["hedge"]["sigmaH"]
    fh = AS["hedge"]["horizonFraction"]

    fcs = {}
    for pid, (cmds, times, pdesc) in plans.items():
        plan_att = Attempt("att3", max(times) + DT, cmds, [])
        _, truth_rel = ship_states(tst, plan_att, X, idx, DT, times)
        mean, covs = forecast(ref, prof, plan_att, t_last, x_now, P_now, times, DT, s2, sigma_h, eng_sigma)
        bare, _ = forecast(ref, None, plan_att, t_last, x_now, P_now, times, DT, s2, 0.0, eng_sigma)
        pts = []
        within = True
        for i, t in enumerate(times):
            dev = truth_rel[0, i] - mean[i]
            c = covs[i]
            r_pred = float(np.linalg.norm(mean[i]))
            sig_tot = major_sigma(c["total"])
            within = within and sig_tot <= fh * r_pred
            pts.append({
                "t": t, "mean": [float(mean[i, 0]), float(mean[i, 1])], "rangePredicted": r_pred,
                "insideCoverage": bool(prof["rMin"] <= r_pred <= prof["rMax"]),
                "sigmaMajor": {k: major_sigma(c[k]) for k in ("state", "profile", "hedge", "engine", "total")},
                "covTotal": cov_json(c["total"]),
                "withinHorizon": bool(within),
                "truth": [float(truth_rel[0, i, 0]), float(truth_rel[0, i, 1])],
                "deviation": float(np.linalg.norm(dev)),
                "mahalanobis": mahalanobis(dev, c["total"]),
                "mahalanobisNoHedge": mahalanobis(dev, c["total"] - c["hedge"]),
                "uncalibratedDeviation": float(np.linalg.norm(truth_rel[0, i] - bare[i])),
            })
        fcs[pid] = pts

    cc, dc = fcs["coast"], fcs["dive"]
    for pid, pts in fcs.items():
        inh = [p for p in pts if p["withinHorizon"]]
        worst = max(p["mahalanobis"] for p in inh)
        ck.add(f"honest-{pid}", f"{pid}: truth within 3 sigma of the envelope (Mahalanobis distance < 3) at every checkpoint inside the forecast horizon", [worst, len(inh)], worst < 3.0 and len(inh) >= 3)
    ck.add("coast-full-horizon", "Coast plan: all 8 hourly checkpoints stay inside the forecast horizon", sum(1 for p in cc if p["withinHorizon"]), all(p["withinHorizon"] for p in cc))
    ck.add("calibration-pays", "Coast plan, +6 h: the calibrated forecast is at least 10x closer to truth than the bare reference law from the same present state", [cc[5]["deviation"], cc[5]["uncalibratedDeviation"]], cc[5]["uncalibratedDeviation"] > 10 * cc[5]["deviation"])
    ck.add("no-hedge-inside-coverage", "Coast plan: the hedge contributes nothing while the path stays inside the sampled distances", max(p["sigmaMajor"]["hedge"] for p in cc), all(p["sigmaMajor"]["hedge"] < 1e-6 for p in cc))
    out = [p for p in dc if not p["insideCoverage"] and p["withinHorizon"]]
    ck.add("dive-leaves-coverage", "Dive plan: at least one checkpoint inside the horizon lies below the sampled distances", len(out), len(out) >= 1)
    deep = out[-1]
    ck.add("hedge-widens-outside", "Dive plan: at the deepest checkpoint inside the horizon the hedge is the largest contribution to the envelope", deep["sigmaMajor"], deep["sigmaMajor"]["hedge"] == max(deep["sigmaMajor"][k] for k in ("state", "profile", "hedge", "engine")))
    ck.add("hedge-needed", "Dive plan: without the hedge the envelope would be overconfident there (Mahalanobis distance > 3)", max(p["mahalanobisNoHedge"] for p in out), max(p["mahalanobisNoHedge"] for p in out) > 3.0)
    ck.add("horizon-ends-dive", "Dive plan: the forecast horizon ends before the last checkpoint (the model stops forecasting instead of guessing)", sum(1 for p in dc if p["withinHorizon"]), not dc[-1]["withinHorizon"])

    case = {
        "id": "sampled-and-unsampled",
        "attempts": [attempt_json(a) for a in (a1, a2, a3)],
        "now": t_now,
        "plans": {pid: {"description": d, "commands": [{"t0": c.t0, "t1": c.t1, "u": c.u, "theta": c.theta} for c in cm], "checkpoints": ts} for pid, (cm, ts, d) in plans.items()},
        "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {a.id: truth_checkpoints(tst, a, tv, [0, a.duration]) for a in (a1, a2, a3)}, "integrationCheck_m": truth_convergence(tst, Attempt("att3", t_now + 6 * 3600.0, burn, []), tv, [t_now + 6 * 3600.0])},
        "forecastInputs": {"reference": ref, "engineSigma": {"kE": eng_sigma[0], "dE": eng_sigma[1]}, "sigmaH": sigma_h, "horizonFraction": fh, "noiseScale": s2, "anchorWindows": AS["windows"]["anchorWindows"]},
        "tierL": tl,
        "anchor": {**anc, "tNow": t_last, "state": [float(v) for v in x_now], "covariance": [[float(v) for v in row] for row in P_now]},
        "forecasts": [{"plan": pid, "points": pts} for pid, pts in fcs.items()],
    }
    return base_vector(
        "forecast-envelope", "Forecast envelope: confident where sampled, honest elsewhere",
        "Inverse-2.5 truth, Newtonian reference law (no extension adopted). Tier L calibrates gravity against distance from two earlier attempts and the current one. Forecasts are issued from the present state for a coasting plan (inside sampled distances) and a dive below them.",
        [case], ck,
        notes=["Expected values: tierL windows and profile, anchor state and covariance, and every forecast point inside the horizon. Tolerance for forecast points: |mean_impl - mean_ref| <= 0.05 sigmaMajor.total; sigmaMajor components within 5% (or 1 m absolute). `truth`, `deviation`, `mahalanobis*` and `uncalibratedDeviation` are checks, not estimator outputs."],
    )
