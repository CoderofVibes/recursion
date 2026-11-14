"""Vectors 2-5: distance law, exponent coverage, missing body, confounding."""
from __future__ import annotations

import math

import numpy as np

from .common import (
    AS, DT, MU_A, MU_B, PR, R0, TS,
    Checks, attempt_json, binary_rel_state, chi2_band, circ_speed, guess_body, guess_ship,
    make_measurements, p_body_state, p_cam, p_engine, p_kA, p_muA, p_muB, p_n, p_ship,
    peri_speed, schedule, state_at, structure_json, truth_checkpoints, truth_convergence,
    truth_structure, truth_values, vec,
)
from .core import Attempt, Command, ship_states, simulate
from .diag import emp_table, empirical_fit, tier_l
from .fit import confounding
from .scenarios import SEEDS, base_vector, clean_copy, do_fit, fit_entry, model_binary, model_single

# ---------------------------------------------------------------------------
# 2. Inverse-2.5 truth, Newtonian model, data at two distances
# ---------------------------------------------------------------------------


def v_inv25_two_distances():
    rng = np.random.default_rng(SEEDS["inv25-newton-two-distances"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    r1, r2 = 0.6e6, 1.5e6
    a1 = Attempt("att1", 28800.0, [], [], "Circular coasting arc at r = 0.6 r0 (8 h), fixes every 180 s.")
    a2 = Attempt("att2", 43200.0, [], [], "Circular coasting arc at r = 1.5 r0 (12 h), fixes every 180 s.")
    s1 = state_at(r1, circ_speed(MU_A, n_t, r1), 0.0)
    s2 = state_at(r2, circ_speed(MU_A, n_t, r2), 2.0)
    tst = truth_structure()
    tv = truth_values(n_t, {"att1": s1, "att2": s2})
    a1.meas, c1 = make_measurements(tst, a1, tv, rng, schedule(0, a1.duration, 180.0))
    a2.meas, c2 = make_measurements(tst, a2, tv, rng, schedule(0, a2.duration, 180.0))
    ca1, ca2 = clean_copy(a1, c1), clean_copy(a2, c2)
    st = model_single(2.0)

    fits = []
    mus = {}
    for att, catt, r in ((a1, ca1, r1), (a2, ca2, r2)):
        params = p_ship(att.id, guess_ship(att)) + [p_muA(), p_cam()]
        f, _ = do_fit(st, [att], params)
        e, _ = fit_entry(f"local-{att.id}", f"Newtonian fit to {att.id} only (the GM a Newtonian model infers at r = {r / R0:g} r0).", st, [att], params, f, [catt])
        theory = MU_A * math.sqrt(R0 / r)
        e["theory"] = {"muLocal": theory, "formula": "mu0 (r0/r)^0.5"}
        mu, smu = f.get("mu.A")
        mus[att.id] = (mu, smu)
        ck.add(f"local-gm-{att.id}", f"Newtonian GM fitted at {r / R0:g} r0 within 3 sigma + 0.1% of mu0 (r0/r)^0.5", (mu - theory) / theory, abs(mu - theory) <= 3 * smu + 1e-3 * theory)
        lo, hi = chi2_band(f.nu)
        ck.add(f"local-white-{att.id}", "A circular arc is fitted exactly by a Newtonian GM: chi2/nu consistent with 1", f.chi2_nu, lo <= f.chi2_nu <= hi)
        fits.append(e)
    m1, s1_ = mus["att1"]
    m2, s2_ = mus["att2"]
    ratio = m1 / m2
    sratio = ratio * math.hypot(s1_ / m1, s2_ / m2)
    expect = math.sqrt(r2 / r1)
    ck.add("gm-ratio", "GM(0.6 r0) / GM(1.5 r0) = sqrt(1.5/0.6) = 1.5811 within 3 sigma + 0.2%", ratio, abs(ratio - expect) <= 3 * sratio + 2e-3 * expect)

    params = p_ship("att1", guess_ship(a1)) + p_ship("att2", guess_ship(a2)) + [p_muA(), p_cam()]
    fj, _ = do_fit(st, [a1, a2], params)
    ej, _ = fit_entry("joint", "One Newtonian GM for both arcs: the structure cannot fit both distances.", st, [a1, a2], params, fj, [ca1, ca2])
    ck.add("joint-misfit", "Joint Newtonian fit chi2/nu > 10 (wrong structure is visible)", fj.chi2_nu, fj.chi2_nu > 10)
    fits.append(ej)

    case = {
        "id": "two-circular-arcs",
        "attempts": [attempt_json(a1), attempt_json(a2)],
        "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {a.id: truth_checkpoints(tst, a, tv, [0, a.duration]) for a in (a1, a2)}, "integrationCheck_m": max(truth_convergence(tst, a, tv, [a.duration]) for a in (a1, a2))},
        "fits": fits,
        "derived": {"gmRatio": ratio, "gmRatioSigma": sratio, "gmRatioExpected": expect},
    }
    return base_vector(
        "inv25-newton-two-distances", "Inverse-2.5 truth, Newtonian model, two distances",
        "Two circular arcs at 0.6 r0 and 1.5 r0 under the inverse-2.5 law. Each is fitted perfectly by a Newtonian GM, but the GMs differ by sqrt(r2/r1); one GM cannot fit both.",
        [case], ck,
    )


# ---------------------------------------------------------------------------
# 3. Inverse-2.5 truth with the exponent extension: coverage narrows sigma(n)
# ---------------------------------------------------------------------------


def v_inv25_exponent_coverage():
    rng = np.random.default_rng(SEEDS["inv25-exponent-coverage"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    tst = truth_structure()
    defs = {
        "att1": (0.9e6, 1.1e6, 50400.0, 180.0, 0.0, "Eccentric coasting arc r 0.9-1.1 r0 (14 h)."),
        "att2": (0.5e6, 1.0e6, 43200.0, 180.0, 1.0, "Eccentric coasting arc r 0.5-1.0 r0 (12 h)."),
        "att3": (1.0e6, 2.0e6, 64800.0, 240.0, 2.5, "Eccentric coasting arc r 1.0-2.0 r0 (18 h)."),
    }
    atts, catts, states = {}, {}, {}
    for aid, (rp, ra, T, every, ang, note) in defs.items():
        states[aid] = state_at(rp, peri_speed(MU_A, n_t, rp, ra), ang)
    tv = truth_values(n_t, states)
    for aid, (rp, ra, T, every, ang, note) in defs.items():
        a = Attempt(aid, T, [], [], note)
        a.meas, c = make_measurements(tst, a, tv, rng, schedule(0, T, every))
        atts[aid], catts[aid] = a, clean_copy(a, c)

    st = model_single("law.n")
    cases = []
    sig = {}
    for cid, ids, desc in (("narrow", ["att1"], "One arc covering r 0.9-1.1 r0."), ("wide", ["att1", "att2", "att3"], "Three arcs covering r 0.5-2.0 r0.")):
        A_ = [atts[i] for i in ids]
        C_ = [catts[i] for i in ids]
        params = sum((p_ship(i, guess_ship(atts[i])) for i in ids), []) + [p_muA(), p_n(), p_cam()]
        f, _ = do_fit(st, A_, params)
        e, _ = fit_entry("exponent", "Power-law model with the distance-law exponent free (extension).", st, A_, params, f, C_)
        n, sn = f.get("law.n")
        sig[cid] = sn
        ck.add(f"exponent-{cid}", f"{cid}: fitted exponent within 3 sigma of 2.5", (n - n_t) / sn, abs(n - n_t) <= 3 * sn)
        lo, hi = chi2_band(f.nu)
        ck.add(f"chi2-{cid}", f"{cid}: chi2/nu consistent with 1 once the exponent is free", f.chi2_nu, lo <= f.chi2_nu <= hi)
        case = {
            "id": cid,
            "description": desc,
            "attempts": [attempt_json(a) for a in A_],
            "truth": {"structure": structure_json(tst), "values": {k: v for k, v in tv.items() if not k.startswith("att") or k.split(".")[0] in ids}, "checkpoints": {i: truth_checkpoints(tst, atts[i], tv, [0, atts[i].duration]) for i in ids}, "integrationCheck_m": max(truth_convergence(tst, atts[i], tv, [atts[i].duration]) for i in ids)},
            "fits": [e],
        }
        if cid == "wide":
            # Tier L under the Newtonian reference law (arrival calibration): GM against distance.
            ref = {"r0": R0, "mu": PR["muA"]["mean"], "n": 2.0, "cam": 0.0}
            tl = tier_l(ref, A_)
            rows = tl["windows"]
            for r in rows:
                r["gmLocal"] = ref["mu"] * r["g"]
                r["gmSigma"] = ref["mu"] * r["sigma"]
                r["theoryAtGeoMean"] = MU_A * math.sqrt(R0 / r["rGeoMean"])
            case["tierL"] = tl
            worst = max(abs(r["gmLocal"] - r["theoryAtGeoMean"]) / (3 * r["gmSigma"] + 0.01 * r["theoryAtGeoMean"]) for r in rows)
            ck.add("gm-vs-distance-trend", "Every window's local Newtonian GM matches mu0 (r0/r)^0.5 at its geometric-mean range within 3 sigma + 1%", worst, worst <= 1.0)
            lr = np.log([r["rGeoMean"] for r in rows])
            lg = np.log([r["gmLocal"] for r in rows])
            w = np.array([(r["gmLocal"] / r["gmSigma"]) ** 2 for r in rows])
            slope = float(np.polyfit(lr, lg, 1, w=np.sqrt(w))[0])
            tl["slope"] = {"dlnGM_dlnr": slope, "impliedExponent": 2.0 - slope, "note": "weighted fit of ln(local GM) against ln(r); n = n_model - slope"}
            ck.add("gm-slope", "Slope of ln(local GM) against ln(r) is -0.5 +/- 0.02: the data, not the model, say the exponent is 2.5", slope, abs(slope + 0.5) < 0.02)
            ck.add("all-windows-converge", "Every short-arc local fit converges although the Newtonian structure is wrong", sum(1 for r in rows if not r["converged"]), all(r["converged"] for r in rows))
            # Empirical accelerations on the calibrated law: nothing non-central is left.
            fe, ste, pe, bounds = empirical_fit(ref, tl["profile"], A_, do_fit)
            ee, _ = fit_entry("empirical-on-calibrated-law", "Diagnostic: Newtonian reference law times the calibration profile, plus radial/tangential empirical acceleration per window (frame body A).", ste, A_, pe, fe, C_)
            tab = emp_table(fe, bounds)
            ee["table"] = tab
            g_typ = MU_A / R0**2
            zT = max(abs(r["aT"] / r["sigmaT"]) for r in tab)
            fT = max(abs(r["aT"]) for r in tab) / g_typ
            ee["signature"] = {"maxAbsTangentialZ": zT, "maxAbsTangentialOverG0": fT}
            ck.add("wrong-law-leaves-no-tangential", "Wrong distance law: after distance calibration no tangential empirical term reaches 4 sigma (a central error leaves nothing non-central)", zT, zT < 4)
            ck.add("calibrated-law-fits", "Newtonian reference law times the calibration profile fits all three arcs: chi2/nu < 1.5", fe.chi2_nu, fe.chi2_nu < 1.5)
            ck.add("profile-distance-explains", "Wrong distance law: profile inflation < 3 (distance alone explains the local scales)", tl["profile"]["inflation"], tl["profile"]["inflation"] < 3)
            case["fits"].append(ee)
        cases.append(case)
    ck.add("coverage-narrows", "sigma(n) with wide coverage < 1/2 of sigma(n) with narrow coverage", sig["wide"] / sig["narrow"], sig["wide"] < 0.5 * sig["narrow"])
    return base_vector(
        "inv25-exponent-coverage", "Inverse-2.5 truth with the exponent extension",
        "The exponent extension recovers 2.5; its uncertainty shrinks as distance coverage widens. The wide case also carries Tier L under the Newtonian reference law: local GM per window against distance (slope -0.5), the calibration profile, and an empirical-acceleration fit showing that nothing non-central remains.",
        cases, ck,
    )


# ---------------------------------------------------------------------------
# 4. Missing second body: direction-dependent signature
# ---------------------------------------------------------------------------


def gen_binary_attempts(n_t, defs, rng):
    """defs: (id, phase of B, rp, ra, ship angle, duration, note)."""
    tst = truth_structure(binary=True)
    ships, bs = {}, {}
    atts = []
    for aid, phase, rp, ra, ang, T, note in defs:
        bs[aid], _ = binary_rel_state(n_t, phase)
        ships[aid] = state_at(rp, peri_speed(MU_A, n_t, rp, ra), ang)
        atts.append(Attempt(aid, T, [], [], note))
    tv = truth_values(n_t, ships, bs)
    clean = {}
    for a in atts:
        sch = schedule(0, a.duration, 180.0, "A") + schedule(0, a.duration, 600.0, "B")
        sch.sort(key=lambda s: (s[0], s[1]))
        a.meas, c = make_measurements(tst, a, tv, rng, sch)
        clean[a.id] = clean_copy(a, c)
    return tst, tv, atts, clean


def tidal_truth(tst, tv, att, times):
    """True tidal acceleration of B on the ship relative to A, in A's radial/tangential
    frame, and B's direction as seen from A."""
    names, X, idx = vec(tv)
    steps = [int(round(t / DT)) for t in times]
    outP, _, _ = simulate(tst, att, X, idx, DT, steps)
    out = []
    for k in steps:
        P = outP[k][0]
        A, Bp, S = P[0], P[1], P[2]

        def g(d, mu):
            r = np.linalg.norm(d)
            return d * (mu / R0**2 * (R0 / r) ** tv["truth.n"]) / r

        tid = g(Bp - S, MU_B) - g(Bp - A, MU_B)
        d = S - A
        rh = d / np.linalg.norm(d)
        th = np.array([-rh[1], rh[0]])
        out.append((float(tid @ rh), float(tid @ th), float(math.atan2(Bp[1] - A[1], Bp[0] - A[0]))))
    return out


def v_missing_body():
    rng = np.random.default_rng(SEEDS["missing-body-signature"])
    ck = Checks()
    n_t = 2.0
    defs = [("att1", 0.7, 0.8e6, 1.2e6, 0.0, 57600.0, "Newtonian binary (B at 4 r0). Ship coasts around A, r 0.8-1.2 r0 (16 h). Fixes on A every 180 s, on B every 600 s.")]
    tst, tv, atts, clean = gen_binary_attempts(n_t, defs, rng)
    a1 = atts[0]
    ca1 = clean["att1"]

    st = model_single(2.0)
    params = p_ship("att1", guess_ship(a1)) + [p_muA(), p_cam()]
    f0, _ = do_fit(st, [a1], params)
    e0, _ = fit_entry("A-only", "Newtonian model with A only; B's gravity is not modelled and B fixes are ignored.", st, [a1], params, f0, [ca1])
    ck.add("A-only-misfit", "A-only fit chi2/nu > 5 (missing body is visible)", f0.chi2_nu, f0.chi2_nu > 5)

    # Tier L and the empirical fit, on the A-only main fit as reference law.
    ref = {"r0": R0, "mu": float(f0.get("mu.A")[0]), "n": 2.0, "cam": float(f0.get("camera.bias")[0])}
    tl = tier_l(ref, [a1])
    fe, ste, pe, bounds = empirical_fit(ref, tl["profile"], [a1], do_fit)
    ee, _ = fit_entry("empirical-on-calibrated-law", "Diagnostic: A-only reference law (main-fit values) times the calibration profile, plus radial/tangential empirical acceleration per window (frame body A).", ste, [a1], pe, fe, [ca1])
    tab = emp_table(fe, bounds)
    mids = [round(0.5 * (r["t0"] + r["t1"]) / DT) * DT for r in tab]
    tid = tidal_truth(tst, tv, a1, mids)
    for r, tm, td in zip(tab, mids, tid):
        r["tMid"] = float(tm)
        r["tidalAtMidR"], r["tidalAtMidT"], r["azimuthOfB"] = td
    ee["table"] = tab
    g_typ = MU_A / R0**2
    zt = max(abs(r["aT"] / r["sigmaT"]) for r in tab)
    fT = max(abs(r["aT"]) for r in tab) / g_typ
    ee["signature"] = {"maxAbsTangentialZ": zt, "maxAbsTangentialOverG0": fT}
    ck.add("missing-body-tangential", "Missing body: a tangential empirical term exceeds 5 sigma and 0.3% of g(r0) (no central law can produce it)", [zt, fT], zt > 5 and fT > 3e-3)
    ck.add("profile-distance-fails", "Missing body: profile inflation > 5 (same distance, different pull: distance alone does not explain the local scales)", tl["profile"]["inflation"], tl["profile"]["inflation"] > 5)
    sig = [r for r in tab if abs(r["aT"]) > 3 * r["sigmaT"]]
    same = [r for r in sig if np.sign(r["aT"]) == np.sign(r["tidalAtMidT"])]
    ck.add("tangential-tracks-tidal", "Every tangential term significant at 3 sigma has the sign of B's true tidal tangential acceleration at the window midpoint; at least 4 are significant", [len(same), len(sig)], len(sig) >= 4 and len(same) == len(sig))

    stb = model_binary(2.0)
    pb = p_ship("att1", guess_ship(a1)) + p_body_state("att1", "B", guess_body(a1, "B")) + [p_muA(), p_muB(), p_cam()]
    fb, _ = do_fit(stb, [a1], pb)
    eb, _ = fit_entry("add-body-B", "Unmodelled-body extension, seen mode: B's state from its fixes, mu.B fitted (prior mean 0, sigma 1e11).", stb, [a1], pb, fb, [ca1])
    mb, smb = fb.get("mu.B")
    ck.add("body-gm-recovered", "Extension recovers mu.B within 3 sigma of 2.5e9", (mb - MU_B) / smb, abs(mb - MU_B) <= 3 * smb)
    lo, hi = chi2_band(fb.nu)
    ck.add("body-chi2", "With B modelled, chi2/nu consistent with 1", fb.chi2_nu, lo <= fb.chi2_nu <= hi)

    case = {
        "id": "binary-A-only-model",
        "attempts": [attempt_json(a1)],
        "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {"att1": truth_checkpoints(tst, a1, tv, [0, 28800, a1.duration])}, "integrationCheck_m": truth_convergence(tst, a1, tv, [a1.duration])},
        "fits": [e0, ee, eb],
        "tierL": tl,
    }
    return base_vector(
        "missing-body-signature", "Missing second body: direction-dependent residual signature",
        "Newtonian binary; the model knows only A. After distance calibration the misfit remains as tangential (non-central) empirical acceleration that follows B's tidal field. Adding B (seen mode) restores chi2/nu = 1 and recovers mu.B.",
        [case], ck,
    )


# ---------------------------------------------------------------------------
# 5. Burn-only data: engine and gravity parameters confounded
# ---------------------------------------------------------------------------


def radial_burn_commands(tst, tv, att_id, t0, t1, u, seg=60.0):
    """Outward (anti-gravity) low-thrust burn; attitude re-pointed every `seg` s
    to the radial direction. The executed attitude is what is recorded."""
    cmds = []
    t = t0
    names, X, idx = vec(tv)
    while t < t1 - 1e-9:
        att = Attempt(att_id, t, list(cmds), [])
        _, rel = ship_states(tst, att, X, idx, DT, [t])
        p = rel[0, 0]
        cmds.append(Command(float(t), float(t + seg), u, math.atan2(p[1], p[0])))
        t += seg
    return cmds


def v_burn_only():
    rng = np.random.default_rng(SEEDS["burn-only-confounded"])
    ck = Checks()
    n_t = 2.0
    r = 1.0e6
    tb0, tb1, tend, u = 0.0, 7200.0, 14400.0, 0.005
    # Thrust-supported ("hover") circle: outward thrust u carries part of gravity, so
    # the ship circles r0 slowly with v^2 = (g - kE u) r. r stays ~constant.
    g0 = MU_A / r**2
    v = math.sqrt((g0 - TS["kE"] * u * math.cos(TS["dE"])) * r)
    s0 = state_at(r, v, 0.0)
    tst = truth_structure()
    tv = truth_values(n_t, {"att1": s0})
    cmds = radial_burn_commands(tst, tv, "att1", tb0, tb1, u)
    att = Attempt("att1", tend, cmds, [], "Hover circle at r0: 2 h outward RCS thrust at 0.005 m/s^2 (attitude re-pointed radially every 60 s) supporting a slow circle, then 2 h of coasting. Fixes every 60 s.")
    burn_sched = schedule(tb0, tb1 - 60.0, 60.0)
    coast_sched = schedule(tb1, tend, 60.0)
    acc_t = list(np.arange(tb0, tb1 - 1e-9, AS["accelerometer"]["sampleInterval"]))
    allm, allc = make_measurements(tst, att, tv, rng, burn_sched + coast_sched, acc_t)
    nb, nc = len(burn_sched), len(coast_sched)
    sets = {
        "burn-only": (allm[:nb], allc[:nb], False, "Tracking only while thrusting; accelerometer not recorded."),
        "burn-plus-coast": (allm[: nb + nc], allc[: nb + nc], False, "Adds 2 h of coasting fixes after the burn; accelerometer not recorded."),
        "burn-plus-accel": (allm[:nb] + allm[nb + nc :], allc[:nb] + allc[nb + nc :], True, "Burn-only tracking plus accelerometer samples every 60 s during the burn."),
    }
    cases = []
    rho, ratios, ratios_mu = {}, {}, {}
    for cid, (mm, cc, use_acc, desc) in sets.items():
        a = Attempt("att1", max(m.t for m in mm) + 60.0, cmds, mm, desc)
        ca = Attempt("att1", a.duration, cmds, cc, desc)
        st = model_single(2.0, engine=True, kA=use_acc)
        g = guess_ship(Attempt("g", 0, [], [m for m in mm if m.kind == "opnav"]))
        params = p_ship("att1", g) + [p_muA()] + p_engine() + ([p_kA()] if use_acc else []) + [p_cam()]
        f, _ = do_fit(st, [a], params)
        e, _ = fit_entry("gravity-and-engine", "Newtonian model; mu.A, engine scale kE and misalignment dE free" + ("; accelerometer scale kA free" if use_acc else "") + ".", st, [a], params, f, [ca])
        e["confounding"] = confounding(f, ["mu.A"], ["engine.kE", "engine.dE"], {"engine.kE": PR["kE"]["sigma"], "engine.dE": PR["dE"]["sigma"]})
        rho[cid] = f.corr("mu.A", "engine.kE")
        ratios[cid] = f.get("engine.kE")[1] / PR["kE"]["sigma"]
        ratios_mu[cid] = f.get("mu.A")[1] / PR["muA"]["sigma"]
        cases.append({"id": cid, "description": desc, "attempts": [attempt_json(a)], "truth": {"structure": structure_json(tst), "values": tv, "checkpoints": {"att1": truth_checkpoints(tst, att, tv, [0, tb1, tend])}, "integrationCheck_m": truth_convergence(tst, att, tv, [tend])}, "fits": [e]})
        mu, smu = f.get("mu.A")
        kE, skE = f.get("engine.kE")
        ck.add(f"recovered-{cid}", f"{cid}: mu.A and kE within 3 sigma of truth", [(mu - MU_A) / smu, (kE - TS["kE"]) / skE], abs(mu - MU_A) <= 3 * smu and abs(kE - TS["kE"]) <= 3 * skE)
    thr = AS["validation"]["confoundedRho"]
    ck.add("burn-only-confounded", f"Burn-only: |rho(mu.A, kE)| > {thr}", rho["burn-only"], abs(rho["burn-only"]) > thr)
    for cid in ("burn-plus-coast", "burn-plus-accel"):
        ck.add(f"{cid}-breaks-confound", f"{cid}: |rho(mu.A, kE)| <= {thr} and kE posterior/prior sigma < 0.1", [rho[cid], ratios[cid]], abs(rho[cid]) <= thr and ratios[cid] < 0.1)
    ck.add("burn-only-not-learned", "Burn-only: mu.A posterior/prior sigma > 0.5 (gravity not learned; kE is 'learned' only through the mu.A prior)", ratios_mu["burn-only"], ratios_mu["burn-only"] > 0.5)
    return base_vector(
        "burn-only-confounded", "Burn-only data: engine and gravity confounded",
        "A thrust-supported hover circle tracked without coasting data or accelerometer records cannot separate gravity from engine scale: only g - kE u is observable. Coasting data or accelerometer records break the confound.",
        cases, ck,
        notes=["The three cases are subsets of one simulated attempt and share its noise realisation."],
    )
