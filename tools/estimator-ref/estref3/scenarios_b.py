"""3D vectors 2-4: the distance law at two distances in two planes, the exponent
extension from arcs in different planes (with a held-out arc in a plane it
never trained in), and a missing body that lies off the ship's orbit plane."""
from __future__ import annotations

import math

import numpy as np

from .common import (
    AS, DT, FD, MU_A, MU_B, PR, R0, SEEDS, STATE,
    Checks, angle, attempt_json, binary_rel_state, chi2_band, circ_speed, fit_json, guess_body, guess_ship,
    make_measurements, orbit_normal, orbit_state, p_body_state, p_cam, p_muA, p_muB, p_n, p_ship,
    params_json, peri_speed, plane, schedule, state_block, structure_json, truth_checkpoints, truth_convergence,
    truth_structure, truth_values, unit, vec,
)
from .core import Attempt, simulate
from .diag import emp_table, empirical_fit, tier_l, win_kw
from .fit import heldout_consistency, staged_fit
from .local import earned_hedge, local_fits
from .scenarios import CHI_3, base_vector, clean_copy, do_fit, fit_entry, model_binary, model_single, normal_check, plane_json

K_HO = AS["validation"]["heldOutSigmaK"]

# ---------------------------------------------------------------------------
# 2. Inverse-2.5 truth, Newtonian model, two distances, two orbit planes
# ---------------------------------------------------------------------------


def v_inv25_two_planes():
    rng = np.random.default_rng(SEEDS["inv25-two-planes"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    r1, r2 = 0.6e6, 1.5e6
    pl1, pl2 = (35.0, 20.0), (75.0, 110.0)
    R1, R2 = plane(*pl1), plane(*pl2)
    a1 = Attempt("att1", 28800.0, [], [], "Circular coasting arc at r = 0.6 r0 (8 h) in a plane inclined 35 deg (node 20 deg); fixes every 180 s.")
    a2 = Attempt("att2", 43200.0, [], [], "Circular coasting arc at r = 1.5 r0 (12 h) in a plane inclined 75 deg (node 110 deg); fixes every 180 s.")
    s1 = orbit_state(r1, circ_speed(MU_A, n_t, r1), 0.0, R1)
    s2 = orbit_state(r2, circ_speed(MU_A, n_t, r2), 2.0, R2)
    tst = truth_structure()
    tv = truth_values(n_t, {"att1": s1, "att2": s2})
    a1.meas, c1 = make_measurements(tst, a1, tv, rng, schedule(0, a1.duration, 180.0))
    a2.meas, c2 = make_measurements(tst, a2, tv, rng, schedule(0, a2.duration, 180.0))
    ca1, ca2 = clean_copy(a1, c1), clean_copy(a2, c2)
    st = model_single(2.0)

    fits = []
    mus = {}
    normals = {}
    for att, catt, r, s0 in ((a1, ca1, r1, s1), (a2, ca2, r2, s2)):
        params = p_ship(att.id, guess_ship(att)) + [p_muA()] + p_cam()
        fitted = do_fit(st, [att], params)
        f = fitted[0]
        e, _ = fit_entry(f"local-{att.id}", f"Newtonian fit to {att.id} only (the GM a Newtonian model infers at r = {r / R0:g} r0).", st, [att], params, fitted, [catt])
        theory = MU_A * math.sqrt(R0 / r)
        e["theory"] = {"muLocal": theory, "formula": "mu0 (r0/r)^0.5"}
        mu, smu = f.get("mu.A")
        mus[att.id] = (mu, smu)
        ck.add(f"local-gm-{att.id}", f"Newtonian GM fitted at {r / R0:g} r0 within 3 sigma + 0.1% of mu0 (r0/r)^0.5", (mu - theory) / theory, abs(mu - theory) <= 3 * smu + 1e-3 * theory)
        lo, hi = chi2_band(f.nu)
        ck.add(f"local-white-{att.id}", "A circular arc in any plane is fitted exactly by a Newtonian GM: chi2/nu consistent with 1", f.chi2_nu, lo <= f.chi2_nu <= hi)
        nc = normal_check(f, att.id, s0)
        e["orbitNormal"] = nc
        normals[att.id] = nc
        fits.append(e)
    m1, s1_ = mus["att1"]
    m2, s2_ = mus["att2"]
    ratio = m1 / m2
    sratio = ratio * math.hypot(s1_ / m1, s2_ / m2)
    expect = math.sqrt(r2 / r1)
    ck.add("gm-ratio", "GM(0.6 r0) / GM(1.5 r0) = sqrt(1.5/0.6) = 1.5811 within 3 sigma + 0.2%, from arcs in two different planes", ratio, abs(ratio - expect) <= 3 * sratio + 2e-3 * expect)
    sep_true = angle(R1[:, 2], R2[:, 2])
    sep_fit = angle(normals["att1"]["normalFitted"], normals["att2"]["normalFitted"])
    ck.add("planes-differ", "The two arcs lie in planes more than 60 deg apart, and the fitted orbit normals reproduce that angle within 1 mrad", [sep_true, sep_fit], sep_true > math.radians(60.0) and abs(sep_fit - sep_true) < 1e-3)

    params = p_ship("att1", guess_ship(a1)) + p_ship("att2", guess_ship(a2)) + [p_muA()] + p_cam()
    fitted = do_fit(st, [a1, a2], params)
    fj = fitted[0]
    ej, _ = fit_entry("joint", "One Newtonian GM for both arcs: the structure cannot fit both distances.", st, [a1, a2], params, fitted, [ca1, ca2])
    ck.add("joint-misfit", "Joint Newtonian fit chi2/nu > 10 (wrong structure is visible)", fj.chi2_nu, fj.chi2_nu > 10)
    fits.append(ej)

    case = {
        "id": "two-circular-arcs-two-planes",
        "attempts": [attempt_json(a1), attempt_json(a2)],
        "truth": {"structure": structure_json(tst), "values": tv, "planes": {"att1": plane_json(R1, *pl1), "att2": plane_json(R2, *pl2)},
                  "checkpoints": {a.id: truth_checkpoints(tst, a, tv, [0, a.duration]) for a in (a1, a2)},
                  "integrationCheck_m": max(truth_convergence(tst, a, tv, [a.duration]) for a in (a1, a2))},
        "fits": fits,
        "derived": {"gmRatio": ratio, "gmRatioSigma": sratio, "gmRatioExpected": expect, "planeSeparation": sep_true},
    }
    return base_vector(
        "inv25-two-planes", "Inverse-2.5 truth, Newtonian model, two distances in two planes",
        "Two circular arcs at 0.6 r0 and 1.5 r0 under the inverse-2.5 law, in planes 60 deg or more apart. Each is fitted perfectly by a Newtonian GM, but the GMs differ by sqrt(r2/r1): the strength-against-distance signature does not depend on the orbit plane. One GM cannot fit both.",
        [case], ck,
    )


# ---------------------------------------------------------------------------
# 3. Exponent extension from arcs in different planes; held-out arc in another plane
# ---------------------------------------------------------------------------


def v_inv25_exponent_planes():
    rng = np.random.default_rng(SEEDS["inv25-exponent-planes"])
    ck = Checks()
    n_t = AS["gravity"]["nTrue"]
    tst = truth_structure()
    defs = {
        "att1": (0.9e6, 1.1e6, 50400.0, 180.0, 0.0, (20.0, 0.0), "Eccentric coasting arc r 0.9-1.1 r0 (14 h), plane inclined 20 deg."),
        "att2": (0.5e6, 1.0e6, 43200.0, 180.0, 1.0, (65.0, 80.0), "Eccentric coasting arc r 0.5-1.0 r0 (12 h), plane inclined 65 deg (node 80 deg)."),
        "att3": (1.0e6, 2.0e6, 64800.0, 240.0, 2.5, (110.0, 200.0), "Eccentric coasting arc r 1.0-2.0 r0 (18 h), plane inclined 110 deg (retrograde; node 200 deg)."),
    }
    planes = {aid: plane(*d[5]) for aid, d in defs.items()}
    states = {aid: orbit_state(d[0], peri_speed(MU_A, n_t, d[0], d[1]), d[4], planes[aid]) for aid, d in defs.items()}
    tv = truth_values(n_t, states)
    atts, catts = {}, {}
    for aid, (rp, ra, T, every, ang, pl, note) in defs.items():
        a = Attempt(aid, T, [], [], note)
        a.meas, c = make_measurements(tst, a, tv, rng, schedule(0, T, every))
        atts[aid], catts[aid] = a, clean_copy(a, c)
    sep = [math.degrees(angle(planes[a][:, 2], planes[b][:, 2])) for a, b in (("att1", "att2"), ("att1", "att3"), ("att2", "att3"))]
    ck.add("three-planes", "The three arcs lie in three different planes, each pair more than 45 deg apart", sep, min(sep) > 45.0)

    st = model_single("law.n")
    cases = []
    sig = {}
    for cid, ids, desc in (("narrow", ["att1"], "One arc covering r 0.9-1.1 r0."), ("wide", ["att1", "att2", "att3"], "Three arcs in three planes covering r 0.5-2.0 r0.")):
        A_ = [atts[i] for i in ids]
        C_ = [catts[i] for i in ids]
        params = sum((p_ship(i, guess_ship(atts[i])) for i in ids), []) + [p_muA(), p_n()] + p_cam()
        fitted = do_fit(st, A_, params)
        f = fitted[0]
        e, _ = fit_entry("exponent", "Power-law model with the distance-law exponent free (extension).", st, A_, params, fitted, C_)
        n, sn = f.get("law.n")
        sig[cid] = sn
        ck.add(f"exponent-{cid}", f"{cid}: fitted exponent within 3 sigma of 2.5", (n - n_t) / sn, abs(n - n_t) <= 3 * sn)
        lo, hi = chi2_band(f.nu)
        ck.add(f"chi2-{cid}", f"{cid}: chi2/nu consistent with 1 once the exponent is free", f.chi2_nu, lo <= f.chi2_nu <= hi)
        case = {
            "id": cid,
            "description": desc,
            "attempts": [attempt_json(a) for a in A_],
            "truth": {"structure": structure_json(tst), "values": {k: v for k, v in tv.items() if not k.startswith("att") or k.split(".")[0] in ids},
                      "planes": {i: plane_json(planes[i], *defs[i][5]) for i in ids},
                      "checkpoints": {i: truth_checkpoints(tst, atts[i], tv, [0, atts[i].duration]) for i in ids},
                      "integrationCheck_m": max(truth_convergence(tst, atts[i], tv, [atts[i].duration]) for i in ids)},
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
            ck.add("gm-vs-distance-trend", "Every window's local Newtonian GM matches mu0 (r0/r)^0.5 at its geometric-mean range within 3 sigma + 1%, whatever its plane", worst, worst <= 1.0)
            lr = np.log([r["rGeoMean"] for r in rows])
            lg = np.log([r["gmLocal"] for r in rows])
            w = np.array([(r["gmLocal"] / r["gmSigma"]) ** 2 for r in rows])
            slope = float(np.polyfit(lr, lg, 1, w=np.sqrt(w))[0])
            tl["slope"] = {"dlnGM_dlnr": slope, "impliedExponent": 2.0 - slope, "note": "weighted fit of ln(local GM) against ln(r); n = n_model - slope"}
            ck.add("gm-slope", "Slope of ln(local GM) against ln(r) is -0.5 +/- 0.02: the data, not the model, say the exponent is 2.5", slope, abs(slope + 0.5) < 0.02)
            ck.add("all-windows-converge", "Every short-arc local fit (6-state + scale) converges although the Newtonian structure is wrong", sum(1 for r in rows if not r["converged"]), all(r["converged"] for r in rows))
            # The window's turning axis is the orbit normal of its arc.
            wn = max(angle(r["planeNormal"], planes[r["attempt"]][:, 2]) for r in rows)
            ck.add("window-normals", "Each window's sweep axis is its arc's orbit normal within 1 mrad (the sweep is a vector)", wn, wn < 1e-3)
            # Empirical accelerations on the calibrated law: nothing non-central is left.
            fitted_e, prob_e, ste, pe, bounds = empirical_fit(ref, tl["profile"], A_, do_fit)
            fe = fitted_e
            ee, _ = fit_entry("empirical-on-calibrated-law", "Diagnostic: Newtonian reference law times the calibration profile, plus radial / tangential / orbit-normal empirical acceleration per window (frame body A).", ste, A_, pe, (fe, prob_e), C_)
            tab = emp_table(fe, bounds)
            ee["table"] = tab
            g_typ = MU_A / R0**2
            zT = max(abs(r["aT"] / r["sigmaT"]) for r in tab)
            zN = max(abs(r["aN"] / r["sigmaN"]) for r in tab)
            ee["signature"] = {"maxAbsTangentialZ": zT, "maxAbsNormalZ": zN, "maxAbsTangentialOverG0": max(abs(r["aT"]) for r in tab) / g_typ, "maxAbsNormalOverG0": max(abs(r["aN"]) for r in tab) / g_typ}
            ck.add("wrong-law-leaves-nothing-non-central", "Wrong distance law: after distance calibration no tangential or orbit-normal empirical term reaches 4 sigma", [zT, zN], zT < 4 and zN < 4)
            ck.add("calibrated-law-fits", "Newtonian reference law times the calibration profile fits all three arcs: chi2/nu < 1.5", fe.chi2_nu, fe.chi2_nu < 1.5)
            ck.add("profile-distance-explains", "Wrong distance law: profile inflation < 3. One curve against distance explains windows taken in three planes and from every direction", tl["profile"]["inflation"], tl["profile"]["inflation"] < 3)
            case["fits"].append(ee)
        cases.append(case)
    ck.add("coverage-narrows", "sigma(n) with wide coverage < 1/2 of sigma(n) with narrow coverage", sig["wide"] / sig["narrow"], sig["wide"] < 0.5 * sig["narrow"])

    # ---- Held-out test across planes (spec 7): train on att1 + att3, hold out att2 ----
    train, ctrain, held = [atts["att1"], atts["att3"]], [catts["att1"], catts["att3"]], atts["att2"]
    ships = lambda A_: sum((p_ship(a.id, guess_ship(a)) for a in A_), [])
    out = {}
    for mid, stm, extra, desc in (("newtonian", model_single(2.0), [], "Base structure: Newtonian, mu.A free."), ("exponent", model_single("law.n"), [p_n()], "Extension: distance-law exponent free.")):
        params = ships(train) + [p_muA()] + extra + p_cam()
        fitted = do_fit(stm, train, params)
        e, _ = fit_entry(mid, desc, stm, train, params, fitted, ctrain)
        ho = heldout_consistency(stm, fitted[0], params, held, p_ship(held.id, guess_ship(held)), DT, k=K_HO)
        e["heldOut"] = {"attempt": held.id, **ho}
        e["cost"] = fitted[0].chi2 + fitted[0].prior_cost
        out[mid] = (fitted[0], e)
    fN, eN = out["newtonian"]
    fX, eX = out["exponent"]
    pen = math.log(fN.m)
    dcost = eN["cost"] - eX["cost"]
    eX["adoption"] = {"deltaCost": dcost, "penalty": pen, "evidence": bool(dcost >= pen), "heldOutPass": eX["heldOut"]["pass"], "adopt": bool(dcost >= pen and eX["heldOut"]["pass"])}
    ck.add("newtonian-fails-heldout", "Newtonian structure fails the held-out attempt (T/nu above threshold)", eN["heldOut"]["TperNu"], not eN["heldOut"]["pass"])
    ck.add("exponent-passes-heldout-other-plane", "Exponent extension passes a held-out attempt at distances and in a plane it never trained in, and is adoptable", [eX["heldOut"]["TperNu"], eX["heldOut"]["threshold"]], eX["adoption"]["adopt"])
    n, sn = fX.get("law.n")
    refx = {"r0": R0, "mu": float(fX.get("mu.A")[0]), "n": float(n), "cam": [float(fX.get(c)[0]) for c in ("camera.bias.x", "camera.bias.y", "camera.bias.z")]}
    rows = local_fits(refx, [held], DT, g_sigma=AS["windows"]["localScalePriorSigma"], **win_kw())
    rr = [m.z[2] for a in train for m in a.meas if m.kind == "opnav" and len(m.z) == 3]
    rmin, rmax = float(min(rr)), float(max(rr))
    eh = earned_hedge(rows, rmin, rmax, float(sn), AS["hedge"]["sigmaH"], AS["hedge"]["sigmaHFloor"])
    eX["earnedHedge"] = {"reference": refx, "trainingCoverage": [rmin, rmax], "heldOutWindows": rows, "body": "A", **eh}
    vr = eh["validatedRange"]
    ck.add("validated-range-radial", "The validated range is a span of distances only: about 0.5-1.9 r0 on body A, the union of what three planes covered; no direction is recorded", vr, vr is not None and 0.48e6 < vr[0] < 0.52e6 and 1.85e6 < vr[1] < 2.0e6)
    ck.add("hedge-earned", "The validated exponent earns a hedge below 1/5 of the default sigma_h", eh["sigmaH"], eh["sigmaH"] < 0.2 * AS["hedge"]["sigmaH"])
    cases.append({
        "id": "held-out-other-plane",
        "description": "Train on att1 and att3 (r 0.9-1.9 r0, planes at 20 and 110 deg), hold out att2 (r 0.5-1.0 r0, plane at 65 deg).",
        "training": ["att1", "att3"], "heldOut": "att2",
        "attempts": [], "attemptsFrom": "wide",
        "truth": {"from": "wide", "integrationCheck_m": cases[-1]["truth"]["integrationCheck_m"]},
        "fits": [eN, eX],
    })
    return base_vector(
        "inv25-exponent-planes", "Inverse-2.5 truth with the exponent extension, arcs in different planes",
        "The exponent extension recovers 2.5 from arcs in three different orbit planes; its uncertainty shrinks as distance coverage widens. Tier L under the Newtonian reference law: local GM per window against distance (slope -0.5), one calibration profile for all planes, and an empirical-acceleration fit showing that nothing non-central remains. The rule then passes a held-out arc in a plane it never trained in, and its validated range is radial.",
        cases, ck,
        notes=["Case `held-out-other-plane` reuses the attempts of case `wide`. heldOut.T, nu, TperNu, threshold and pass are part of the expected values."],
    )


# ---------------------------------------------------------------------------
# 4. Missing second body off the ship's orbit plane
# ---------------------------------------------------------------------------


def gen_binary_attempts(n_t, defs, rng, Rbin):
    """defs: (id, phase of B, rp, ra, ship angle, duration, ship plane, note)."""
    tst = truth_structure(binary=True)
    ships, bs = {}, {}
    atts = []
    for aid, phase, rp, ra, ang, T, Rsh, note in defs:
        bs[aid], _ = binary_rel_state(n_t, phase, Rbin)
        ships[aid] = orbit_state(rp, peri_speed(MU_A, n_t, rp, ra), ang, Rsh)
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
    """True tidal acceleration of B on the ship relative to A in the ship's
    radial / tangential / orbit-normal frame about A, and B's direction from A."""
    names, X, idx = vec(tv)
    steps = [int(round(t / DT)) for t in times]
    outP, outV, _ = simulate(tst, att, X, idx, DT, steps)
    out = []
    for k in steps:
        P, V = outP[k][0], outV[k][0]
        A, Bp, S = P[0], P[1], P[2]

        def g(d, mu):
            r = np.linalg.norm(d)
            return d * (mu / R0**2 * (R0 / r) ** tv["truth.n"]) / r

        tid = g(Bp - S, MU_B) - g(Bp - A, MU_B)
        d = S - A
        rh = unit(d)
        nh = unit(np.cross(d, V[2] - V[0]))
        th = np.cross(nh, rh)
        bdir = unit(Bp - A)
        out.append({"R": float(tid @ rh), "T": float(tid @ th), "N": float(tid @ nh), "directionOfB": [float(c) for c in bdir],
                    "elevationOfBAbovePlane": float(math.asin(float(bdir @ nh)))})
    return out


def v_offplane_body():
    rng = np.random.default_rng(SEEDS["offplane-body-signature"])
    ck = Checks()
    n_t = 2.0
    bin_pl, ship_pl = (25.0, -30.0), (70.0, 40.0)
    Rbin, Rsh = plane(*bin_pl), plane(*ship_pl)
    defs = [("att1", 0.7, 0.8e6, 1.2e6, 0.0, 57600.0, Rsh, "Newtonian binary (B at 4 r0, binary plane inclined 25 deg). Ship coasts around A, r 0.8-1.2 r0 (16 h), in a plane inclined 70 deg. Fixes on A every 180 s, on B every 600 s.")]
    tst, tv, atts, clean = gen_binary_attempts(n_t, defs, rng, Rbin)
    a1 = atts[0]
    ca1 = clean["att1"]
    b0 = np.array([tv[f"att1.B.{k}"] for k in STATE])
    s0 = np.array([tv[f"att1.ship.{k}"] for k in STATE])
    elev = math.asin(float(unit(b0[:3]) @ orbit_normal(s0)))
    ck.add("body-off-plane", "The missing body lies well off the ship's orbit plane: more than 30 deg above or below it at the epoch", math.degrees(elev), abs(math.degrees(elev)) > 30.0)

    st = model_single(2.0)
    params = p_ship("att1", guess_ship(a1)) + [p_muA()] + p_cam()
    fitted0 = do_fit(st, [a1], params)
    f0 = fitted0[0]
    e0, _ = fit_entry("A-only", "Newtonian model with A only; B's gravity is not modelled and B fixes are ignored.", st, [a1], params, fitted0, [ca1])
    ck.add("A-only-misfit", "A-only fit chi2/nu > 5 (missing body is visible)", f0.chi2_nu, f0.chi2_nu > 5)
    rs = e0["expected"]["residualSummary"]
    ck.add("out-of-plane-residuals", "The A-only fit leaves out-of-plane bearing residuals, not only in-plane ones: coasting `normal` RMS above 3", [rs["coast.along"]["rms"], rs["coast.normal"]["rms"]], rs["coast.normal"]["rms"] > 3.0)

    # Tier L and the empirical fit, on the A-only main fit as reference law.
    ref = {"r0": R0, "mu": float(f0.get("mu.A")[0]), "n": 2.0, "cam": [float(f0.get(c)[0]) for c in ("camera.bias.x", "camera.bias.y", "camera.bias.z")]}
    tl = tier_l(ref, [a1])
    fe, prob_e, ste, pe, bounds = empirical_fit(ref, tl["profile"], [a1], do_fit)
    ee, _ = fit_entry("empirical-on-calibrated-law", "Diagnostic: A-only reference law (main-fit values) times the calibration profile, plus radial / tangential / orbit-normal empirical acceleration per window (frame body A).", ste, [a1], pe, (fe, prob_e), [ca1])
    tab = emp_table(fe, bounds)
    mids = [round(0.5 * (r["t0"] + r["t1"]) / DT) * DT for r in tab]
    tid = tidal_truth(tst, tv, a1, mids)
    for r, tm, td in zip(tab, mids, tid):
        r["tMid"] = float(tm)
        r["tidalAtMidR"], r["tidalAtMidT"], r["tidalAtMidN"] = td["R"], td["T"], td["N"]
        r["directionOfB"], r["elevationOfBAbovePlane"] = td["directionOfB"], td["elevationOfBAbovePlane"]
    ee["table"] = tab
    g_typ = MU_A / R0**2
    zt = max(abs(r["aT"] / r["sigmaT"]) for r in tab)
    zn = max(abs(r["aN"] / r["sigmaN"]) for r in tab)
    fT = max(abs(r["aT"]) for r in tab) / g_typ
    fN = max(abs(r["aN"]) for r in tab) / g_typ
    ee["signature"] = {"maxAbsTangentialZ": zt, "maxAbsNormalZ": zn, "maxAbsTangentialOverG0": fT, "maxAbsNormalOverG0": fN}
    ck.add("missing-body-tangential", "Missing body: a tangential empirical term exceeds 5 sigma and 0.3% of g(r0) (no central law can produce it)", [zt, fT], zt > 5 and fT > 3e-3)
    ck.add("missing-body-normal", "Missing body off the plane: an orbit-normal empirical term exceeds 5 sigma and 0.1% of g(r0) (something pulls the ship out of its plane)", [zn, fN], zn > 5 and fN > 1e-3)
    ck.add("profile-distance-fails", "Missing body: profile inflation > 3, against 1.0-1.3 under a wrong distance law (same distance, different pull from different directions; weaker than the planar 12 because a body 35 deg off the plane varies the radial pull less along the orbit)", tl["profile"]["inflation"], tl["profile"]["inflation"] > 3)
    for comp, lab in (("T", "tangential"), ("N", "normal")):
        sig = [r for r in tab if abs(r["a" + comp]) > 3 * r["sigma" + comp]]
        same = [r for r in sig if np.sign(r["a" + comp]) == np.sign(r["tidalAtMid" + comp])]
        ck.add(f"{lab}-tracks-tidal", f"Every {lab} term significant at 3 sigma has the sign of B's true tidal {lab} acceleration at the window midpoint; at least 4 are significant", [len(same), len(sig)], len(sig) >= 4 and len(same) == len(sig))

    stb = model_binary(2.0)
    pb = p_ship("att1", guess_ship(a1)) + p_body_state("att1", "B", guess_body(a1, "B")) + [p_muA(), p_muB()] + p_cam()
    fittedb = do_fit(stb, [a1], pb)
    fb = fittedb[0]
    eb, _ = fit_entry("add-body-B", "Unmodelled-body extension, seen mode: B's 6-state from its fixes, mu.B fitted (prior mean 0, sigma 1e11).", stb, [a1], pb, fittedb, [ca1])
    mb, smb = fb.get("mu.B")
    ck.add("body-gm-recovered", "Extension recovers mu.B within 3 sigma of 2.5e9", (mb - MU_B) / smb, abs(mb - MU_B) <= 3 * smb)
    lo, hi = chi2_band(fb.nu)
    ck.add("body-chi2", "With B modelled in 3D, chi2/nu consistent with 1", fb.chi2_nu, lo <= fb.chi2_nu <= hi)
    xb, Pb = state_block(fb, "att1", "B")
    dev = xb[:3] - b0[:3]
    w, v = np.linalg.eigh(Pb[:3, :3])
    md = float(math.sqrt(np.sum((v.T @ dev) ** 2 / w)))
    zb, szb = fb.get("att1.B.z")
    eb["bodyPosition"] = {"fitted": [float(c) for c in xb[:3]], "truth": [float(c) for c in b0[:3]], "mahalanobis3": md, "sigmaZ": float(szb)}
    ck.add("body-position-recovered", "B's position at the epoch, z included, within 3 sigma of truth (three numbers: 3.76); its z (about 1,000 km) is known to better than 5 km", [md, float(zb), float(b0[2]), float(szb)], md < CHI_3 and szb < 5e3 and abs(b0[2]) > 5e5)

    # ---- Unseen mode: no fix on B is used. Where is its position identifiable? ----
    onlyA = Attempt("att1", a1.duration, [], [m for m in a1.meas if m.target == "A"], "Fixes on A only.")
    conlyA = Attempt("att1", a1.duration, [], [m for m in ca1.meas if m.target == "A"], "Fixes on A only.")
    start = np.concatenate([1.05 * b0[:3], b0[3:]])
    pu = p_ship("att1", guess_ship(onlyA)) + p_body_state("att1", "B", list(start)) + [p_muA(), p_muB(2.0e9)] + p_cam()
    fu, probu = staged_fit(stb, [onlyA], pu, DT, fracs=(1.0,), h=FD)
    nfu, _ = staged_fit(stb, [conlyA], pu, DT, fracs=(1.0,), x0=fu.x, h=FD)
    eu = {
        "id": "add-body-B-unseen",
        "description": "Unmodelled-body extension, unseen mode: B's six state numbers and mu.B from the ship's motion alone (no fix on B). Local identifiability only: started 5% too far along the true direction with mu.B 20% low, and solved on the whole arc at once.",
        "compare": "numeric" if (fu.converged and fu.chi2_nu <= 25.0) else "qualitative",
        "attempts": ["att1"], "dataSubset": "fixes on A only",
        "solver": {"arcGrowing": False, "note": "No arc growing (spec 4.5): on a quarter of the arc the unseen body is not determined and runs away."},
        "model": structure_json(stb), "parameters": params_json(pu), "expected": fit_json(fu, probu, pu),
        "noiseFree": {"estimate": {n: float(v) for n, v in zip(nfu.names, nfu.x)}, "chi2": nfu.chi2, "chi2PerDof": nfu.chi2_nu},
    }
    xu, Pu = state_block(fu, "att1", "B")
    devu = xu[:3] - b0[:3]
    wu, vu = np.linalg.eigh(Pu[:3, :3])
    mdu = float(math.sqrt(np.sum((vu.T @ devu) ** 2 / wu)))
    mu_u, smu_u = fu.get("mu.B")
    uh = unit(xu[:3])
    iu = [fu.names.index(f"att1.B.{k}") for k in ("x", "y", "z")]
    im = fu.names.index("mu.B")
    s_line = float(math.sqrt(uh @ Pu[:3, :3] @ uh))
    rho_md = float(uh @ fu.P[iu, im]) / (s_line * smu_u)
    s_across = float(math.sqrt(max((np.trace(Pu[:3, :3]) - s_line**2) / 2.0, 0.0)))
    szu = float(fu.get("att1.B.z")[1])
    eu["bodyPosition"] = {"fitted": [float(c) for c in xu[:3]], "truth": [float(c) for c in b0[:3]], "mahalanobis3": mdu, "sigmaAlongLine": s_line, "sigmaAcrossLineRms": s_across, "sigmaZ": szu,
                          "rhoMuDistance": rho_md, "distanceFitted": float(np.linalg.norm(xu[:3])), "distanceTrue": float(np.linalg.norm(b0[:3]))}
    lo, hi = chi2_band(fu.nu)
    ck.add("unseen-locally-identifiable", "Unseen mode, from a nearby start: the fit converges with chi2/nu consistent with 1, and B's position (z included) and mu.B are within 3 sigma of truth; its z, 1,089 km, is known to better than 50 km from the ship's motion alone",
           [mdu, (mu_u - MU_B) / smu_u, fu.chi2_nu, szu], fu.converged and lo <= fu.chi2_nu <= hi and mdu < CHI_3 and abs(mu_u - MU_B) <= 3 * smu_u and szu < 5e4)
    ck.add("unseen-mass-distance-degenerate", "Unseen mode: what the ship feels is close to mu / d^3 along a direction, so mass and distance are nearly one number: |rho(mu.B, distance)| > 0.95, and the position is at least 3x less certain along the line to B than across it",
           [rho_md, s_line, s_across], abs(rho_md) > 0.95 and s_line > 3 * s_across)
    # Honest contrast, recorded but not a claim: a start that is not nearby.
    ax = unit(np.cross(b0[:3], [0.0, 0.0, 1.0]))
    turn = lambda v: v * math.cos(0.2) + np.cross(ax, v) * math.sin(0.2) + ax * float(ax @ v) * (1 - math.cos(0.2))
    far = np.concatenate([1.2 * turn(b0[:3]), turn(b0[3:])])
    pf_ = p_ship("att1", guess_ship(onlyA)) + p_body_state("att1", "B", list(far)) + [p_muA(), p_muB(1.5e9)] + p_cam()
    ff, _ = staged_fit(stb, [onlyA], pf_, DT, fracs=(1.0,), h=FD)
    eu["farStart"] = {"note": "Not a claim and not an expected value. The same fit started 20% too far and 0.2 rad off in direction with mu.B = 1.5e9: the plain solver creeps along the mu / d^3 valley. The search of spec 6.3 (and a better parameterization) is still to be built and tested.",
                      "converged": bool(ff.converged), "iterations": int(ff.iters), "chi2PerDof": float(ff.chi2_nu), "muB": float(ff.get("mu.B")[0]),
                      "distance": float(np.linalg.norm([ff.get(f"att1.B.{k}")[0] for k in ("x", "y", "z")]))}

    case = {
        "id": "binary-A-only-model",
        "attempts": [attempt_json(a1)],
        "truth": {"structure": structure_json(tst), "values": tv, "planes": {"binary": plane_json(Rbin, *bin_pl), "ship": plane_json(Rsh, *ship_pl)},
                  "elevationOfBAboveShipPlane": elev,
                  "checkpoints": {"att1": truth_checkpoints(tst, a1, tv, [0, 28800, a1.duration])}, "integrationCheck_m": truth_convergence(tst, a1, tv, [a1.duration])},
        "fits": [e0, ee, eb, eu],
        "tierL": tl,
    }
    return base_vector(
        "offplane-body-signature", "Missing second body off the ship's orbit plane: direction-dependent signature in 3D",
        "Newtonian binary whose plane is tilted against the ship's orbit plane; the model knows only A. After distance calibration the misfit remains as tangential and orbit-normal (non-central) empirical acceleration that follows B's tidal field. Adding B (seen mode, six state parameters) restores chi2/nu = 1 and recovers mu.B and B's position, z included. Without any fix on B (unseen mode) its position is identifiable only locally, with mass and distance nearly degenerate.",
        [case], ck,
        notes=["Fit `add-body-B-unseen` uses the fixes on A only (`dataSubset`) and is solved without arc growing (`solver`). Its `farStart` block is a development record, not an expected value."],
    )
