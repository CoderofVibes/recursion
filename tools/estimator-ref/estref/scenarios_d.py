"""Vectors 8-9 (DECISIONS A5): a carried rule's validated range, and aging of
ship calibration parameters."""
from __future__ import annotations

import math

import numpy as np

from .aging import accrued_variance, aged_sigma, commanded_dv
from .common import (
    AS, DT, MU_A, PR, R0, TS,
    Checks, attempt_json, chi2_band, circ_speed, guess_ship, make_measurements, p_cam, p_muA, p_ship,
    peri_speed, schedule, state_at, structure_json, truth_checkpoints, truth_convergence, truth_structure, truth_values, vec,
)
from .core import Attempt, Command, ship_states
from .diag import tier_l, win_kw
from .fit import Param
from .local import anchor_state, forecast, mahalanobis, major_sigma, make_windows
from .scenarios import SEEDS, base_vector, clean_copy, do_fit, fit_entry, model_single
from .scenarios_c import cov_json

AG = AS["aging"]["classes"]

# ---------------------------------------------------------------------------
# 8. A carried rule in a later encounter: earned hedge only inside its validated range
# ---------------------------------------------------------------------------

MU_NEW = 6.0e9  # the later encounter's body: a different mass
MU_NEW_PRIOR = (6.1e9, 2.0e8)
CARRIED = {
    "rule": "distance-law",
    "n": 2.5,
    "sigmaN": 1.2e-4,
    "earnedSigmaH": 0.0185,
    "validated": [{"recordedOn": "body A of the earlier encounter", "rMin": 0.6e6, "rMax": 1.4e6}],
    "source": "values as produced by extension-validation / distance-law, rounded",
}


def v_carried_rule_forecast(burn_u=0.115, orbit=(1.05e6, 1.15e6), hours=10.0, t_now=86400.0):
    rng = np.random.default_rng(SEEDS["carried-rule-forecast"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    tst = truth_structure()
    rp, ra = orbit
    s0 = state_at(ra, peri_speed(MU_NEW, n_t, rp, ra) * rp / ra, 0.4)
    tv = truth_values(n_t, {"att1": s0})
    tv["truth.muA"] = MU_NEW
    a1 = Attempt("att1", t_now, [], [], "First arc in a later encounter around a new body (mu = 6e9): coasting between 1.05 and 1.15 r0, data up to now (24 h), fixes every 180 s.")
    a1.meas, _ = make_measurements(tst, a1, tv, rng, schedule(0, t_now, 180.0))

    names, X, idx = vec(tv)
    S_now, _ = ship_states(tst, a1, X, idx, DT, [t_now])
    vx, vy = S_now[0, 0, 2], S_now[0, 0, 3]
    burn = [Command(t_now, t_now + 120.0, burn_u, float(math.atan2(-vy, -vx)))]
    times = [t_now + 1800.0 * h for h in range(1, int(2 * hours) + 1)]
    plan_att = Attempt("att1", max(times) + DT, burn, [])
    _, truth_rel = ship_states(tst, plan_att, X, idx, DT, times)

    eng = {"kE": 0.97, "dE": 0.004}
    eng_sigma = (0.003, 0.001)
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
    wins = [w for w in make_windows(a1, **win_kw()) if not w.powered][-AS["windows"]["anchorWindows"] :]
    out = {}
    tls = {}
    for mid, (ref, val, sig_e, desc) in models.items():
        key = ref["n"]
        if key not in tls:
            tl = tier_l(ref, [a1])
            anc = anchor_state(ref, tl["profile"], a1, wins, DT, g_prior=(1.0, AS["windows"]["localScalePriorSigma"]), slope_sigma=AS["windows"]["anchorSlopePriorSigma"])
            tls[key] = (tl, anc)
        tl, (t_last, x_now, P_now, anc_info) = tls[key]
        prof = tl["profile"]
        mean, covs = forecast(ref, prof, plan_att, t_last, x_now, P_now, times, DT, tl["noiseScale"], sigma_h, eng_sigma, validated=val, sigma_e=sig_e)
        pts = []
        within = True
        for i, t in enumerate(times):
            dev = truth_rel[0, i] - mean[i]
            c_ = covs[i]
            r_pred = float(np.linalg.norm(mean[i]))
            sig_tot = major_sigma(c_["total"])
            within = within and sig_tot <= fh * r_pred
            inside_cov = bool(prof["rMin"] <= r_pred <= prof["rMax"])
            inside_val = bool(val is not None and any(lo <= r_pred <= hi for lo, hi in val))
            pts.append({
                "t": t, "mean": [float(mean[i, 0]), float(mean[i, 1])], "rangePredicted": r_pred,
                "insideCoverage": inside_cov, "insideValidated": inside_val,
                "sigmaMajor": {k: major_sigma(c_[k]) for k in ("state", "profile", "hedgeEarned", "hedgeDefault", "engine", "total")},
                "covTotal": cov_json(c_["total"]),
                "withinHorizon": bool(within),
                "truth": [float(truth_rel[0, i, 0]), float(truth_rel[0, i, 1])],
                "deviation": float(np.linalg.norm(dev)),
                "mahalanobis": mahalanobis(dev, c_["total"]),
            })
        out[mid] = {"description": desc, "reference": ref, "validated": [list(v) for v in val] if val else [], "sigmaEarned": sig_e, "sigmaDefault": sigma_h,
                    "anchor": {**anc_info, "tNow": t_last, "state": [float(v) for v in x_now], "covariance": [[float(v) for v in row] for row in P_now]},
                    "points": pts}

    R, E, N = out["carried-rule"]["points"], out["earned-everywhere"]["points"], out["no-rule"]["points"]
    comps = ("state", "profile", "hedgeEarned", "hedgeDefault", "engine")
    inh = [p for p in R if p["withinHorizon"]]
    worst = max(p["mahalanobis"] for p in inh)
    ck.add("honest", "Carried rule: truth within 3 sigma of the envelope at every checkpoint inside the horizon", [worst, len(inh)], worst < 3.0 and len(inh) >= 4)
    earned_zone = [i for i, p in enumerate(R) if p["withinHorizon"] and not p["insideCoverage"] and p["insideValidated"]]
    ck.add("earned-zone-exists", "Checkpoints inside the horizon lie outside the sampled distances but inside the rule's validated range", len(earned_zone), len(earned_zone) >= 3)
    ez = earned_zone[-1]
    ck.add("earned-inside-validated", "At the last of them the default hedge contributes nothing and the envelope equals the earned-everywhere one", [R[ez]["sigmaMajor"]["hedgeDefault"], R[ez]["sigmaMajor"]["total"], E[ez]["sigmaMajor"]["total"]],
           R[ez]["sigmaMajor"]["hedgeDefault"] < 1.0 and abs(R[ez]["sigmaMajor"]["total"] / E[ez]["sigmaMajor"]["total"] - 1) < 1e-6)
    ck.add("carried-rule-helps", "There the hedge is at least 5x smaller than with no rule, and the forecast at least 5x closer to truth", [R[ez]["sigmaMajor"]["hedgeEarned"], N[ez]["sigmaMajor"]["hedgeDefault"], R[ez]["deviation"], N[ez]["deviation"]],
           N[ez]["sigmaMajor"]["hedgeDefault"] > 5 * R[ez]["sigmaMajor"]["hedgeEarned"] and N[ez]["deviation"] > 5 * R[ez]["deviation"])
    nR, nE, nN = (sum(1 for p in pts if p["withinHorizon"]) for pts in (R, E, N))
    ck.add("horizon-order", "Forecast horizon in checkpoints: no rule < carried rule <= earned everywhere", [nN, nR, nE], nN < nR <= nE)
    ck.add("no-rule-ends-early", "With nothing carried the forecast ends before reaching the bottom of the validated range (0.6 r0)", N[nN - 1]["rangePredicted"], N[nN - 1]["rangePredicted"] > 0.6e6)
    ck.add("carried-rule-reaches-below", "With the carried rule the forecast runs through the validated range and ends below it", R[nR - 1]["rangePredicted"], nR < len(R) and R[nR - 1]["rangePredicted"] < 0.6e6)
    first_out = R[nR] if nR < len(R) else R[-1]
    sm = first_out["sigmaMajor"]
    ck.add("default-hedge-ends-it", "At the first checkpoint past its horizon the default hedge is the largest contribution and at least 2x the earned one: untested distance, not the rule, ends the forecast", sm, sm["hedgeDefault"] == max(sm[k] for k in comps) and sm["hedgeDefault"] > 2 * sm["hedgeEarned"])
    e_same = E[min(nR, len(E) - 1)]["sigmaMajor"]["total"]
    ck.add("not-easy", "At that checkpoint the envelope is at least 1.5x wider than if the earned hedge applied everywhere", [sm["total"], e_same], sm["total"] > 1.5 * e_same)

    case = {
        "id": "later-encounter-dive",
        "attempts": [attempt_json(a1)],
        "now": t_now,
        "carried": CARRIED,
        "plan": {"description": f"Retrograde burn of 120 s at {burn_u} m/s^2 now, then coast: the path leaves the sampled distances, crosses the validated range and drops below it.", "commands": [{"t0": c_.t0, "t1": c_.t1, "u": c_.u, "theta": c_.theta} for c_ in burn], "checkpoints": times},
        "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {"att1": truth_checkpoints(tst, a1, tv, [0, t_now])}, "integrationCheck_m": truth_convergence(tst, Attempt("att1", times[-1], burn, []), tv, [times[-1]])},
        "forecastInputs": {"engineSigma": {"kE": eng_sigma[0], "dE": eng_sigma[1]}, "horizonFraction": fh, "anchorWindows": AS["windows"]["anchorWindows"], "transfer": AS["validatedRange"]["transfer"]},
        "tierL": {("power-law-2.5" if k == 2.5 else "newtonian"): v[0] for k, v in tls.items()},
        "forecasts": [{"model": mid, **o} for mid, o in out.items()],
    }
    return base_vector(
        "carried-rule-forecast", "A carried rule earns its tighter envelope only inside its validated range",
        "A later encounter around a new body in the inverse-2.5 world. The exponent rule was validated earlier over 0.6-1.4 r0. One 24 h arc has been tracked (1.05-1.15 r0). The plan dives below 0.6 r0. Three forecasts from the same data: the specified one (earned hedge inside the validated range, default beyond), and two contrasts.",
        [case], ck,
        notes=["Expected values: the `carried-rule` forecast (and its Tier L and anchor). The other two forecasts are contrasts that the checks use. Tolerance as in forecast-envelope.", "The new body's local gravity scale is measured by Tier L inside the sampled distances, so its mass prior does not enter the forecast."],
    )


# ---------------------------------------------------------------------------
# 9. Ship calibration parameters age and must be re-earned
# ---------------------------------------------------------------------------


def calibration_attempt(aid, kE_true, dE_true, rng, note, n_t=2.0):
    """Circular orbit at r0: 2 h coast, 20 min prograde burn at 0.02 m/s^2, 2 h coast. Fixes every 60 s."""
    s0 = state_at(R0, circ_speed(MU_A, n_t, R0), 0.0)
    tst = truth_structure()
    tv = truth_values(n_t, {aid: s0}, kE=kE_true)
    tv["truth.dE"] = dE_true
    names, X, idx = vec(tv)
    tb0, tb1, tend = 7200.0, 8400.0, 15600.0
    S, _ = ship_states(tst, Attempt(aid, tb0, [], []), X, idx, DT, [tb0])
    theta = float(math.atan2(S[0, 0, 3], S[0, 0, 2]))
    cmds = [Command(tb0, tb1, 0.02, theta)]
    att = Attempt(aid, tend, cmds, [], note)
    att.meas, clean = make_measurements(tst, att, tv, rng, schedule(0, tend, 60.0))
    return tst, tv, att, clean_copy(att, clean)


def sum_estimate(fit, a, b):
    i, j = fit.names.index(a), fit.names.index(b)
    return float(fit.x[i] + fit.x[j]), float(math.sqrt(fit.P[i, i] + fit.P[j, j] + 2 * fit.P[i, j]))


def v_parameter_aging():
    rng = np.random.default_rng(SEEDS["parameter-aging"])
    ck = Checks()

    # ---- Case 1: the aging arithmetic -----------------------------------------
    rows_in = [
        ("engine.kE", 0.002, 12.0, 250.0, [0.15], "carried into a later encounter: 12 days, 250 m/s of burns, one damage event"),
        ("engine.dE", 0.001, 12.0, 250.0, [0.15], "same history"),
        ("accel.kA", 2.0e-4, 12.0, 0.0, [], "12 days, no damage"),
        ("camera.bias", 2.0e-5, 12.0, 6.0, [0.10], "12 days, 6 camera power cycles, one damage event"),
        ("engine.kE", 0.002, 15600.0 / 86400.0, 24.0, [], "inside one attempt: 4 h 20 min and one 24 m/s burn"),
    ]
    rows = []
    for name, s0, days, use, drops, why in rows_in:
        cls = AG[name]
        var = accrued_variance(cls, days * 86400.0, use, drops)
        rows.append({"parameter": name, "sigmaBefore": s0, "shipDays": days, "use": use, "useUnit": cls["useUnit"], "conditionDrops": drops,
                     "addedVariance": var, "sigmaAfter": math.sqrt(s0**2 + var), "history": why})
    case1 = {"id": "aging-arithmetic", "description": "sigmaAfter^2 = sigmaBefore^2 + sigmaPerRootDay^2 * days + sigmaPerRootUse^2 * use / useRef + sum((sigmaPerCondition * drop)^2), rates from assumptions.json `aging.classes`.",
             "rates": AG, "attempts": [], "truth": {"integrationCheck_m": 0.0}, "fits": [], "table": rows}
    ck.add("aged-engine-scale", "Engine scale carried at 0.2% is known only to about 1.8% after 12 days, 250 m/s and a damage event", rows[0]["sigmaAfter"], 0.015 < rows[0]["sigmaAfter"] < 0.022)
    ck.add("aging-within-attempt", "Inside one attempt a 24 m/s burn loosens it only slightly (below 0.4%)", rows[4]["sigmaAfter"], rows[4]["sigmaAfter"] < 0.004)

    # ---- Case 2: a stale value must be re-earned --------------------------------
    carried = {"engine.kE": (0.970, 0.002), "engine.dE": (0.004, 0.001)}
    hist = {"shipDays": 12.0, "commandedDv": 250.0, "conditionDrops": [0.15]}
    aged = {k: aged_sigma(v[1], AG[k], hist["shipDays"] * 86400.0, hist["commandedDv"], hist["conditionDrops"]) for k, v in carried.items()}
    truth_now = {"engine.kE": 0.945, "engine.dE": 0.0065}
    tst, tv, att, catt = calibration_attempt("att1", truth_now["engine.kE"], truth_now["engine.dE"], rng,
                                            "Later encounter: 2 h coast, 20 min prograde burn at 0.02 m/s^2, 2 h coast; fixes every 60 s. The engine has drifted since it was calibrated.")
    tb0, tb1 = att.commands[0].t0, att.commands[0].t1
    quick = [m for m in att.meas if tb0 - 600.0 <= m.t <= tb1 + 600.0]
    cquick = [m for m in catt.meas if tb0 - 600.0 <= m.t <= tb1 + 600.0]
    q_att = Attempt("att1", tb1 + 660.0, att.commands, quick, "Quick look: fixes from 10 min before the burn to 10 min after.", epoch=quick[0].t)
    cq_att = Attempt("att1", q_att.duration, att.commands, cquick, q_att.note, epoch=quick[0].t)

    def eng_params(sig):
        return [Param(k, carried[k][0], 1e-3, carried[k][0], sig[k]) for k in ("engine.kE", "engine.dE")]

    st = model_single(2.0, engine=True)
    fits2 = []
    res = {}
    for fid, a_, c_, sig, desc in (
        ("stale-prior-quick-look", q_att, cq_att, {k: v[1] for k, v in carried.items()}, "Wrong on purpose: the carried values with their old sigmas (no aging), quick-look data."),
        ("aged-prior-quick-look", q_att, cq_att, aged, "Spec: carried values with aged sigmas, quick-look data."),
        ("aged-prior-full-calibration", att, catt, aged, "Spec: carried values with aged sigmas, the whole coast-burn-coast arc."),
    ):
        params = p_ship("att1", guess_ship(Attempt("g", 0, [], [m for m in a_.meas]), t_epoch=a_.epoch)) + [p_muA()] + eng_params(sig) + [p_cam()]
        f, _ = do_fit(st, [a_], params)
        e, _ = fit_entry(fid, desc, st, [a_], params, f, [c_])
        k, sk = f.get("engine.kE")
        e["truthNow"] = truth_now
        e["zKE"] = float((k - truth_now["engine.kE"]) / sk)
        fits2.append(e)
        res[fid] = (float(k), float(sk), f)
    ck.add("stale-is-wrong", "Un-aged prior, quick look: the estimate sits more than 3 sigma from the true engine scale (stale confidence misleads)", fits2[0]["zKE"], abs(fits2[0]["zKE"]) > 3)
    ck.add("aged-is-honest", "Aged prior, quick look: the true engine scale is within 3 sigma", fits2[1]["zKE"], abs(fits2[1]["zKE"]) <= 3)
    ck.add("re-earned", "Aged prior, full calibration: within 3 sigma of truth and sigma back below 0.3%", [fits2[2]["zKE"], res["aged-prior-full-calibration"][1]], abs(fits2[2]["zKE"]) <= 3 and res["aged-prior-full-calibration"][1] < 0.003)
    ck.add("quick-look-partly-earns", "A quick look already tightens the aged value by more than 2x", [res["aged-prior-quick-look"][1], aged["engine.kE"]], res["aged-prior-quick-look"][1] < 0.5 * aged["engine.kE"])
    case2 = {
        "id": "re-earning",
        "description": "Engine scale 0.970 +/- 0.002 was earned in an earlier encounter. Since then: 12 ship days, 250 m/s of burns and one damage event (condition drop 0.15). The true value is now 0.945.",
        "carried": {k: {"value": v[0], "sigma": v[1]} for k, v in carried.items()}, "history": hist,
        "agedSigma": aged,
        "attempts": [attempt_json(att), {**attempt_json(q_att), "id": "att1", "subset": "quick-look"}],
        "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {"att1": truth_checkpoints(tst, att, tv, [0, tb0, att.duration])}, "integrationCheck_m": truth_convergence(tst, att, tv, [att.duration])},
        "fits": fits2,
    }
    fits2[0]["dataSubset"] = fits2[1]["dataSubset"] = "quick-look (second entry of `attempts`)"
    fits2[2]["dataSubset"] = "full arc (first entry of `attempts`)"

    # ---- Case 3: per-arc deviations inside one encounter ------------------------
    k_arr, d_arr = TS["kE"], TS["dE"]
    k_dmg = 0.940
    t1, v1, b1, cb1 = calibration_attempt("att1", k_arr, d_arr, rng, "Attempt 1: healthy ship. 2 h coast, 20 min prograde burn, 2 h coast.")
    t2, v2, b2, cb2 = calibration_attempt("att2", k_dmg, d_arr, rng, "Attempt 2 (after recurrence, same arrival state): the engine is damaged at t = 3600 s (condition drop 0.25) before the same burn.")
    events = {"att1": [], "att2": [{"t": 3600.0, "kind": "damage", "equipment": AG["engine.kE"]["equipment"], "conditionDrop": 0.25}]}
    q = {}
    for a_ in (b1, b2):
        t_end = max(m.t for m in a_.meas)
        drops = [ev["conditionDrop"] for ev in events[a_.id] if ev["t"] <= t_end]
        q[a_.id] = {k: math.sqrt(accrued_variance(AG[k], t_end, commanded_dv(a_.commands, 0.0, t_end), drops)) for k in ("engine.kE", "engine.dE")}
    ships = p_ship("att1", guess_ship(b1)) + p_ship("att2", guess_ship(b2))
    eng0 = [Param("engine.kE", PR["kE"]["mean"], 1e-3, PR["kE"]["mean"], PR["kE"]["sigma"]), Param("engine.dE", PR["dE"]["mean"], 1e-3, PR["dE"]["mean"], PR["dE"]["sigma"])]
    stc = model_single(2.0, engine=True)
    pc = ships + [p_muA()] + eng0 + [p_cam()]
    fc, _ = do_fit(stc, [b1, b2], pc)
    ec, _ = fit_entry("constant", "Wrong on purpose: one engine scale and misalignment for both attempts.", stc, [b1, b2], pc, fc, [cb1, cb2])
    std = model_single(2.0, engine=True)
    std.kE = ("engine.kE", "{att}.engine.dkE")
    std.dE = ("engine.dE", "{att}.engine.ddE")
    devs = []
    for aid in ("att1", "att2"):
        devs += [Param(f"{aid}.engine.dkE", 0.0, 1e-3, 0.0, q[aid]["engine.kE"], group=aid), Param(f"{aid}.engine.ddE", 0.0, 1e-3, 0.0, q[aid]["engine.dE"], group=aid)]
    pd_ = ships + devs + [p_muA()] + eng0 + [p_cam()]
    fd, _ = do_fit(std, [b1, b2], pd_)
    ed, _ = fit_entry("per-arc-deviation", "Spec: arrival value plus a deviation per arc, each deviation with prior sigma from that arc's accrued aging.", std, [b1, b2], pd_, fd, [cb1, cb2])
    kA1, sA1 = sum_estimate(fd, "engine.kE", "att1.engine.dkE")
    kA2, sA2 = sum_estimate(fd, "engine.kE", "att2.engine.dkE")
    ed["perArc"] = {"att1": {"kE": kA1, "sigma": sA1, "truth": k_arr, "deviationPriorSigma": q["att1"]}, "att2": {"kE": kA2, "sigma": sA2, "truth": k_dmg, "deviationPriorSigma": q["att2"]}}
    ck.add("constant-misfits", "One engine scale for both attempts: chi2/nu > 3", fc.chi2_nu, fc.chi2_nu > 3)
    lo, hi = chi2_band(fd.nu)
    ck.add("deviation-fits", "With per-arc deviations chi2/nu is consistent with 1", fd.chi2_nu, lo <= fd.chi2_nu <= hi)
    ck.add("both-values-recovered", "Each attempt's engine scale within 3 sigma of its truth (0.970 healthy, 0.940 damaged)", [(kA1 - k_arr) / sA1, (kA2 - k_dmg) / sA2], abs(kA1 - k_arr) <= 3 * sA1 and abs(kA2 - k_dmg) <= 3 * sA2)
    ck.add("damaged-value-re-earned", "The damaged attempt's value is known far better than its 2.5% deviation prior (re-earned from its own burn)", [sA2, q["att2"]["engine.kE"]], sA2 < 0.2 * q["att2"]["engine.kE"])
    a1j, a2j = attempt_json(b1), attempt_json(b2)
    a1j["events"], a2j["events"] = events["att1"], events["att2"]
    case3 = {
        "id": "per-arc-deviation",
        "description": "One encounter, two attempts from the same arrival state (P8). In the second the engine is damaged before the burn. Deviation priors: accrual from arrival to each arc's last measurement (ship time, commanded delta-v, condition drops).",
        "attempts": [a1j, a2j],
        "truth": {"structure": structure_json(t1), "values": {**v1, **{k: v for k, v in v2.items() if k.startswith("att2")}, "att2.truth.kE": k_dmg}, "checkpoints": {"att1": truth_checkpoints(t1, b1, v1, [0, b1.duration]), "att2": truth_checkpoints(t2, b2, v2, [0, b2.duration])}, "integrationCheck_m": max(truth_convergence(t1, b1, v1, [b1.duration]), truth_convergence(t2, b2, v2, [b2.duration]))},
        "fits": [ec, ed],
    }
    return base_vector(
        "parameter-aging", "Ship calibration parameters age and must be re-earned",
        "Process noise per parameter class (ship time, use, damage). Case 1 is the arithmetic. Case 2: a carried engine scale with its old sigma misleads; with the aged sigma the model is honest, and a calibration arc re-earns it. Case 3: inside one encounter each arc gets a deviation from the arrival value, so a damaged attempt is fitted without spoiling the healthy one.",
        [case1, case2, case3], ck,
        notes=["Case 1 has no fits: compare `table[].sigmaAfter` to 1e-9 relative.", "A parameter written as {\"sum\": [a, b]} in a model block is the sum of the two parameters."],
    )
