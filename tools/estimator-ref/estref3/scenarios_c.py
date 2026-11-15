"""3D vector 5: powered flight. Thrust with two misalignment angles and the
recorded attitude quaternion, the three-axis accelerometer, the confounding
cases in 3D, an out-of-plane burn, and hands-on flying (throttle steps and RCS
translation)."""
from __future__ import annotations

import math

import numpy as np

from . import quat as Q
from .common import (
    AS, CAM_REFS, DT, MU_A, PR, PR3, R0, SEEDS, TS, TS3,
    Checks, angle, attempt_json, chi2_band, circ_speed, guess_ship,
    make_measurements, orbit_normal, orbit_state, p_cam, p_engine, p_kA, p_kR, p_muA, p_ship,
    plane, schedule, structure_json, truth_checkpoints, truth_convergence,
    truth_structure, truth_values, unit, vec,
)
from .core import Attempt, Command, ship_states
from .diag import win_kw
from .fit import confounding
from .local import make_windows
from .scenarios import base_vector, do_fit, fit_entry, model_single, plane_json

ENG = ("engine.kE", "engine.dE", "engine.dP")
ENG_TRUTH = {"engine.kE": TS["kE"], "engine.dE": TS["dE"], "engine.dP": TS3["dP"]}
ENG_PRIOR = {"engine.kE": PR["kE"]["sigma"], "engine.dE": PR["dE"]["sigma"], "engine.dP": PR3["dP"]["sigma"]}


def attitude_track(cmds, q0=Q.IDENTITY):
    """Recorded attitude at time t: that of the last segment that started at or
    before t (the ship holds attitude between segments)."""
    def f(t):
        q = q0
        for c in cmds:
            if c.t0 <= t + 1e-9:
                q = c.q
        return q
    return f


def tilted_hover_commands(tst, tv, att_id, t0, t1, u, alpha, seg=60.0, q0=Q.IDENTITY):
    """Low-thrust burn pointed outward from the body and tilted by `alpha`
    toward the orbit normal, re-pointed every `seg` s with roll held (smallest
    rotation from the attitude before). The executed attitude is what is recorded."""
    cmds = []
    t = t0
    q = np.asarray(q0, dtype=float)
    names, X, idx = vec(tv)
    while t < t1 - 1e-9:
        att = Attempt(att_id, t, list(cmds), [])
        S, _ = ship_states(tst, att, X, idx, DT, [t])
        s = S[0, 0]
        d = math.cos(alpha) * unit(s[:3]) + math.sin(alpha) * orbit_normal(s)
        q = Q.point_along(q, d)
        cmds.append(Command(float(t), float(t + seg), u, tuple(float(c) for c in q)))
        t += seg
    return cmds


def engine_checks(f):
    return {nm: (f.get(nm)[0] - ENG_TRUTH[nm]) / f.get(nm)[1] for nm in ENG}


def multiple_corr(f, name, others):
    """Multiple correlation of one parameter with a set of others: how much of
    its uncertainty the others explain together (independent of roll, which
    only mixes the two misalignment angles)."""
    k = f.names.index(name)
    ii = [f.names.index(n) for n in others]
    c = f.P[k, ii]
    return float(math.sqrt(c @ np.linalg.solve(f.P[np.ix_(ii, ii)], c) / f.P[k, k]))


def cam_eigen(f):
    """Principal sigmas of the camera-misalignment block (ascending) over the
    prior sigma, and the least-determined direction (body frame)."""
    ii = [f.names.index(n) for n in CAM_REFS]
    w, v = np.linalg.eigh(f.P[np.ix_(ii, ii)])
    return [float(math.sqrt(x)) / PR["camBias"]["sigma"] for x in w], [float(c) for c in v[:, -1]]


def v_thrust_3d(alpha_deg=20.0):
    rng = np.random.default_rng(SEEDS["thrust-3d-confounded"])
    ck = Checks()
    n_t = 2.0
    cases = []
    tst = truth_structure()
    acc_dt = AS["accelerometer"]["sampleInterval"]
    thr = AS["validation"]["confoundedRho"]

    # ---- Case group 1: tilted hover. Burn only / plus coast / plus accelerometer ----
    pl = (40.0, 60.0)
    Rpl = plane(*pl)
    r = 1.0e6
    alpha = math.radians(alpha_deg)
    tb0, tb1, tend, u = 0.0, 7200.0, 14400.0, 0.005
    g0 = MU_A / r**2
    v = math.sqrt((g0 - TS["kE"] * u * math.cos(alpha)) * r)
    s0 = orbit_state(r, v, 0.0, Rpl)
    tv = truth_values(n_t, {"att1": s0})
    cmds = tilted_hover_commands(tst, tv, "att1", tb0, tb1, u, alpha)
    att = Attempt("att1", tend, cmds, [], f"Tilted hover at r0 in a plane inclined {pl[0]:g} deg: 2 h of thrust at 0.005 m/s^2 pointed outward and tilted {alpha_deg:g} deg toward the orbit normal (re-pointed every 60 s, roll held), then 2 h of coasting. Fixes every 60 s.")
    track = attitude_track(cmds)
    burn_sched = schedule(tb0, tb1 - 60.0, 60.0)
    coast_sched = schedule(tb1, tend, 60.0)
    acc_t = list(np.arange(tb0, tb1 - 1e-9, acc_dt))
    allm, allc = make_measurements(tst, att, tv, rng, burn_sched + coast_sched, acc_t, attitude=track)
    nb, nc = len(burn_sched), len(coast_sched)
    sets = {
        "burn-only": (allm[:nb], allc[:nb], False, "Tracking only while thrusting; accelerometer not recorded."),
        "burn-plus-coast": (allm[: nb + nc], allc[: nb + nc], False, "Adds 2 h of coasting fixes after the burn; accelerometer not recorded."),
        "burn-plus-accel": (allm[:nb] + allm[nb + nc:], allc[:nb] + allc[nb + nc:], True, "Burn-only tracking plus three-axis accelerometer samples every 60 s during the burn."),
    }
    S_end, _ = ship_states(tst, att, *vec(tv)[1:], DT, [tb1])
    turn = angle(orbit_normal(S_end[0, 0]), orbit_normal(s0))
    rho, rho_p, ratios, ratios_mu, fits = {}, {}, {}, {}, {}
    for cid, (mm, cc, use_acc, desc) in sets.items():
        a = Attempt("att1", max(m.t for m in mm) + 60.0, cmds, mm, desc)
        ca = Attempt("att1", a.duration, cmds, cc, desc)
        st = model_single(2.0, engine=True, kA=use_acc)
        g = guess_ship(Attempt("g", 0, [], [m for m in mm if m.kind == "opnav"]))
        params = p_ship("att1", g) + [p_muA()] + p_engine() + ([p_kA()] if use_acc else []) + p_cam()
        fitted = do_fit(st, [a], params)
        f = fitted[0]
        e, _ = fit_entry("gravity-and-engine", "Newtonian model; mu.A, engine scale kE and both misalignment angles dE, dP free" + ("; accelerometer scale kA free" if use_acc else "") + "; camera misalignment free.", st, [a], params, fitted, [ca])
        e["confounding"] = confounding(f, ["mu.A"], list(ENG), ENG_PRIOR)
        e["engineZ"] = engine_checks(f)
        rho[cid] = f.corr("mu.A", "engine.kE")
        rho_p[cid] = multiple_corr(f, "engine.kE", ["engine.dE", "engine.dP"])
        e["confounding"]["kEvsMisalignment"] = rho_p[cid]
        ratios[cid] = {nm: f.get(nm)[1] / ENG_PRIOR[nm] for nm in ENG}
        ratios_mu[cid] = f.get("mu.A")[1] / PR["muA"]["sigma"]
        fits[cid] = f
        cases.append({"id": cid, "description": desc, "attempts": [attempt_json(a)],
                      "truth": {"structure": structure_json(tst), "values": tv, "plane": plane_json(Rpl, *pl), "tiltDeg": alpha_deg, "planeTurnedDuringBurn": turn,
                                "checkpoints": {"att1": truth_checkpoints(tst, att, tv, [0, tb1, tend])}, "integrationCheck_m": truth_convergence(tst, att, tv, [tend])},
                      "fits": [e]})
        mu, smu = f.get("mu.A")
        z = [(mu - MU_A) / smu] + list(e["engineZ"].values())
        ck.add(f"recovered-{cid}", f"{cid}: mu.A, kE, dE and dP within 3 sigma of truth", z, all(abs(v_) <= 3 for v_ in z))
    ck.add("thrust-leaves-the-plane", "The tilted thrust turns the orbit plane by more than 2 deg during the burn (out-of-plane powered flight)", math.degrees(turn), math.degrees(turn) > 2.0)
    ck.add("burn-only-confounded", f"Burn-only in 3D: |rho(mu.A, kE)| > {thr}", rho["burn-only"], abs(rho["burn-only"]) > thr)
    ck.add("burn-only-three-way", f"Burn-only in 3D: the out-of-plane push measures kE only as well as the misalignment across the thrust is known, so the engine scale is confounded with the two misalignment angles as well: multiple correlation of kE with (dE, dP) > {thr}", rho_p["burn-only"], rho_p["burn-only"] > thr)
    for cid in ("burn-plus-coast", "burn-plus-accel"):
        ck.add(f"{cid}-breaks-confound", f"{cid}: |rho(mu.A, kE)| <= {thr} and kE posterior/prior sigma < 0.5 of the burn-only value", [rho[cid], ratios[cid]["engine.kE"], ratios["burn-only"]["engine.kE"]],
               abs(rho[cid]) <= thr and ratios[cid]["engine.kE"] < 0.5 * ratios["burn-only"]["engine.kE"])
    ra = ratios["burn-plus-accel"]
    ck.add("accelerometer-pins-both-angles", "Three-axis accelerometer records pin the engine in the body frame: kE, dE and dP posterior/prior sigma all below 0.1", ra, all(v_ < 0.1 for v_ in ra.values()))
    ck.add("burn-only-not-learned", "Burn-only: mu.A posterior/prior sigma > 0.3 (gravity is not separated from the engine)", ratios_mu["burn-only"], ratios_mu["burn-only"] > 0.3)

    # ---- Case 4: an out-of-plane burn (plane change), coast - burn - coast ----
    pl2 = (30.0, -45.0)
    R2 = plane(*pl2)
    s2 = orbit_state(R0, circ_speed(MU_A, n_t, R0), 0.0, R2)
    tv2 = truth_values(n_t, {"att1": s2})
    names2, X2, idx2 = vec(tv2)
    t0b, t1b, tend2, u2 = 7200.0, 8400.0, 15600.0, 0.02
    S, _ = ship_states(tst, Attempt("att1", t0b, [], []), X2, idx2, DT, [t0b])
    n_hat = orbit_normal(S[0, 0])
    q_before = Q.from_axis_angle([0.3, 0.5, 0.8], 0.6)  # the attitude the ship happened to hold while coasting
    q_burn = Q.point_along(q_before, n_hat)
    cmds2 = [Command(t0b, t1b, u2, tuple(float(c) for c in q_burn))]
    att2 = Attempt("att1", tend2, cmds2, [], "Circular orbit at r0 in a plane inclined 30 deg: 2 h coast, 20 min burn at 0.02 m/s^2 along the orbit normal (a plane change of about 13 deg), 2 h coast. Fixes every 60 s; three-axis accelerometer every 60 s during the burn.")
    track2 = attitude_track(cmds2, q0=tuple(float(c) for c in q_before))
    acc2 = list(np.arange(t0b, t1b - 1e-9, acc_dt))
    m2, c2 = make_measurements(tst, att2, tv2, rng, schedule(0, tend2, 60.0), acc2, attitude=track2)
    att2.meas = m2
    catt2 = Attempt("att1", tend2, cmds2, c2, att2.note)
    S2, _ = ship_states(tst, att2, X2, idx2, DT, [tend2])
    turn2 = angle(orbit_normal(S2[0, 0]), orbit_normal(s2))
    track_only = [m for m in m2 if m.kind == "opnav"]
    ctrack_only = [m for m in c2 if m.kind == "opnav"]
    a_tr = Attempt("att1", tend2, cmds2, track_only, "Tracking only.")
    ca_tr = Attempt("att1", tend2, cmds2, ctrack_only, "Tracking only.")
    fits2 = []
    res2 = {}
    for fid, a_, c_, use_acc, two, desc in (
        ("tracking-only", a_tr, ca_tr, False, True, "Spec: kE and both misalignment angles free; tracking fixes only."),
        ("with-accelerometer", att2, catt2, True, True, "Spec: the same with three-axis accelerometer samples and kA free."),
        ("one-angle-engine", a_tr, ca_tr, False, False, "Wrong on purpose: the planar engine model (kE and dE only; dP held at zero)."),
    ):
        st = model_single(2.0, engine=True, kA=use_acc)
        eng = p_engine()
        if not two:
            st.dP = 0.0
            eng = eng[:2]
        params = p_ship("att1", guess_ship(a_)) + [p_muA()] + eng + ([p_kA()] if use_acc else []) + p_cam()
        fitted = do_fit(st, [a_], params)
        f = fitted[0]
        e, _ = fit_entry(fid, desc, st, [a_], params, fitted, [c_])
        if two:
            e["engineZ"] = engine_checks(f)
            e["cameraPrincipalSigmaOverPrior"], e["cameraLeastDeterminedAxis"] = cam_eigen(f)
        fits2.append(e)
        res2[fid] = f
    ft, fa, f1 = res2["tracking-only"], res2["with-accelerometer"], res2["one-angle-engine"]
    ck.add("plane-change", "The out-of-plane burn turns the orbit plane by more than 10 deg", math.degrees(turn2), math.degrees(turn2) > 10.0)
    zt = list(engine_checks(ft).values())
    lo, hi = chi2_band(ft.nu)
    ck.add("out-of-plane-burn-recovered", "Tracking through the plane change recovers kE, dE and dP within 3 sigma, with chi2/nu consistent with 1", zt + [ft.chi2_nu], all(abs(v_) <= 3 for v_ in zt) and lo <= ft.chi2_nu <= hi)
    rt = {nm: ft.get(nm)[1] / ENG_PRIOR[nm] for nm in ENG}
    rho_ep = ft.corr("engine.dE", "engine.dP")
    ck.add("tracking-alone-weak-on-angles", "Two hours of coasting on each side of the burn leave one misalignment direction poorly known: dE and dP posterior/prior sigma above 0.1 and |rho(dE, dP)| > 0.9", [rt["engine.dE"], rt["engine.dP"], rho_ep], rt["engine.dE"] > 0.1 and rt["engine.dP"] > 0.1 and abs(rho_ep) > 0.9)
    rac = {nm: fa.get(nm)[1] / ENG_PRIOR[nm] for nm in ENG}
    gain = [fa.get(nm)[1] / ft.get(nm)[1] for nm in ("engine.dE", "engine.dP")]
    ck.add("accelerometer-pins-plane-change", "Three-axis accelerometer records measure both angles in the body frame: posterior/prior sigma below 0.05 for dE and dP, at most 0.35 of the tracking-only sigmas", [rac["engine.dE"], rac["engine.dP"]] + gain, rac["engine.dE"] < 0.05 and rac["engine.dP"] < 0.05 and max(gain) < 0.35)
    z1 = (f1.get("engine.dE")[0] - ENG_TRUTH["engine.dE"]) / f1.get("engine.dE")[1]
    lo1, hi1 = chi2_band(f1.nu)
    ck.add("one-angle-engine-biased", "The planar engine model (dP held at zero) is confident and wrong: its dE lies more than 3 sigma from truth while chi2/nu still looks consistent with 1", [z1, f1.chi2_nu], abs(z1) > 3.0 and lo1 <= f1.chi2_nu <= hi1)
    za = list(engine_checks(fa).values())
    ck.add("accelerometer-agrees", "With the accelerometer the three engine numbers stay within 3 sigma of truth", za, all(abs(v_) <= 3 for v_ in za))
    ce, axis = cam_eigen(ft)
    turn_axis = Q.to_rotvec(Q.mul(Q.conj(q_before), q_burn))
    ax_angle = min(angle(axis, turn_axis), math.pi - angle(axis, turn_axis))
    ck.add("camera-observable-after-turn", "Re-pointing the ship makes the camera misalignment partly observable: two principal sigmas fall below half the prior, the third stays above 0.9 of it, and that undetermined direction is the turn axis in the body frame (within 5 deg)",
           ce + [math.degrees(ax_angle)], ce[0] < 0.5 and ce[1] < 0.5 and ce[2] > 0.9 and math.degrees(ax_angle) < 5.0)
    cases.append({"id": "out-of-plane-burn", "description": att2.note,
                  "attempts": [attempt_json(att2)],
                  "attitudeResolution": {"rule": "roll held: smallest rotation from the attitude before the burn that puts body +x on the target direction (spec 3.3)",
                                         "qBefore": [float(c) for c in q_before], "direction": [float(c) for c in n_hat], "q": [float(c) for c in q_burn]},
                  "truth": {"structure": structure_json(tst), "values": tv2, "plane": plane_json(R2, *pl2), "planeTurned": turn2,
                            "checkpoints": {"att1": truth_checkpoints(tst, att2, tv2, [0, t0b, tend2])}, "integrationCheck_m": truth_convergence(tst, att2, tv2, [tend2])},
                  "fits": fits2})
    fits2[0]["dataSubset"] = fits2[2]["dataSubset"] = "opnav measurements only"
    fits2[1]["dataSubset"] = "all measurements"

    # ---- Case 5: hands-on flying: throttle steps and RCS translation ----
    pl3 = (55.0, 10.0)
    R3 = plane(*pl3)
    s3 = orbit_state(R0, circ_speed(MU_A, n_t, R0), 1.0, R3)
    tv3 = truth_values(n_t, {"att1": s3})
    qa = Q.from_axis_angle([0.0, 0.0, 1.0], 0.9)
    qb = Q.mul(qa, Q.from_axis_angle([0.0, -1.0, 0.0], 0.35))   # pitched up by hand
    qc = Q.mul(qb, Q.from_axis_angle([0.0, 0.0, 1.0], -0.5))    # yawed right
    tq = lambda q: tuple(float(c) for c in q)
    cmds3 = [
        Command(3600.0, 3720.0, 0.05, tq(qa)),                           # throttle step 1
        Command(3720.0, 3900.0, 0.02, tq(qb)),                           # throttle step 2, new attitude
        Command(5400.0, 5520.0, 0.0, tq(qc), (0.0, 0.006, 0.0)),         # RCS translate left
        Command(5520.0, 5580.0, 0.0, tq(qc), (0.004, 0.0, -0.006)),      # RCS forward and down
        Command(5580.0, 5700.0, 0.03, tq(qc), (0.0, 0.0, 0.004)),        # throttle with RCS up
    ]
    tend3 = 12900.0
    att3 = Attempt("att1", tend3, cmds3, [], "Hands-on flying on a circular orbit at r0 (plane inclined 55 deg): two throttle steps at different attitudes, then RCS translation on three axes, then throttle with RCS; coasting before, between and after. Fixes every 60 s; three-axis accelerometer every 60 s while anything fires.")
    track3 = attitude_track(cmds3, q0=tq(qa))
    acc3 = [t for c in cmds3 for t in np.arange(c.t0, c.t1 - 1e-9, acc_dt)]
    m3, c3 = make_measurements(tst, att3, tv3, rng, schedule(0, tend3, 60.0), acc3, attitude=track3)
    att3.meas = m3
    catt3 = Attempt("att1", tend3, cmds3, c3, att3.note)
    dv_rcs = sum(math.sqrt(sum(x * x for x in c.rcs)) * (c.t1 - c.t0) for c in cmds3)
    stm = model_single(2.0, engine=True, kA=True, kR=True)
    pm = p_ship("att1", guess_ship(att3)) + [p_muA()] + p_engine() + [p_kR(), p_kA()] + p_cam()
    fitted = do_fit(stm, [att3], pm)
    fm = fitted[0]
    em, _ = fit_entry("segments-modelled", "Spec: main-engine throttle steps and RCS translation are thrust segments (nominal ratings x demand), with scales kE and kR.", stm, [att3], pm, fitted, [catt3])
    em["engineZ"] = engine_checks(fm)
    kR, skR = fm.get("rcs.kR")
    # The same tracking with the RCS segments left out of the model.
    cm_no = [Command(c.t0, c.t1, c.u, c.q) for c in cmds3 if c.u != 0.0]
    a_no = Attempt("att1", tend3, cm_no, [m for m in m3 if m.kind == "opnav"], "RCS segments left out of the model; tracking only.")
    ca_no = Attempt("att1", tend3, cm_no, [m for m in c3 if m.kind == "opnav"], a_no.note)
    stn = model_single(2.0, engine=True)
    pn = p_ship("att1", guess_ship(a_no)) + [p_muA()] + p_engine() + p_cam()
    fitted_n = do_fit(stn, [a_no], pn)
    fn_ = fitted_n[0]
    en, _ = fit_entry("rcs-left-to-residuals", "Wrong on purpose: RCS translation not modelled.", stn, [a_no], pn, fitted_n, [ca_no])
    en["commandsUsed"] = [{"t0": c.t0, "t1": c.t1, "u": c.u, "q": list(c.q)} for c in cm_no]
    lo, hi = chi2_band(fm.nu)
    zm = list(engine_checks(fm).values()) + [(kR - TS3["kR"]) / skR]
    ck.add("hands-on-fits", "Hands-on flying modelled as thrust segments: chi2/nu consistent with 1 and kE, dE, dP, kR within 3 sigma of truth", zm + [fm.chi2_nu], all(abs(v_) <= 3 for v_ in zm) and lo <= fm.chi2_nu <= hi)
    ck.add("rcs-scale-learned", "The RCS scale is learned from its own pulses: posterior/prior sigma below 0.2", skR / PR3["kR"]["sigma"], skR < 0.2 * PR3["kR"]["sigma"])
    zn = [(fn_.get("mu.A")[0] - MU_A) / fn_.get("mu.A")[1]] + list(engine_checks(fn_).values())
    en["biasZ"] = {"mu.A": zn[0], "engine.kE": zn[1], "engine.dE": zn[2], "engine.dP": zn[3]}
    lo_n, hi_n = chi2_band(fn_.nu)
    ck.add("rcs-cannot-be-left-out", f"Leaving {dv_rcs:.2f} m/s of RCS translation out of the model misfits (chi2/nu above its 3 sigma band) and drags gravity and both misalignment angles more than 5 sigma from truth: the jets must be modelled",
           [fn_.chi2_nu, hi_n] + zn, fn_.chi2_nu > hi_n and abs(zn[0]) > 5 and abs(zn[2]) > 5 and abs(zn[3]) > 5)
    wins = make_windows(att3, **win_kw())
    mixed = [w.id for w in wins if any(c.t0 <= m.t < c.t1 and c.powered for m in w.fixes for c in cmds3) != w.powered]
    span = [w.id for w in wins if not w.powered and any(w.t0 < c.t1 and c.t0 < w.t1 for c in cmds3)]
    ck.add("windows-split-at-any-thrust", "Tier L windows close when the main engine or the RCS turns on or off: no coasting window spans a firing", [len(wins), len(mixed), len(span)], not mixed and not span and len(wins) >= 4)
    cases.append({"id": "hands-on", "description": att3.note,
                  "attempts": [attempt_json(att3)],
                  "rcsDeltaV": dv_rcs,
                  "windows": [{"window": w.id, "t0": w.t0, "t1": w.t1, "nFixes": len(w.fixes), "powered": w.powered} for w in wins],
                  "truth": {"structure": structure_json(tst), "values": tv3, "plane": plane_json(R3, *pl3),
                            "checkpoints": {"att1": truth_checkpoints(tst, att3, tv3, [0, 5700.0, tend3])}, "integrationCheck_m": truth_convergence(tst, att3, tv3, [tend3])},
                  "fits": [em, en]})
    en["dataSubset"] = "opnav measurements only; commands as in `commandsUsed`"
    return base_vector(
        "thrust-3d-confounded", "Powered flight in 3D: two misalignment angles, three-axis accelerometer, confounding",
        "Thrust is the body +x axis turned by the recorded attitude quaternion, with a misalignment about body +z (dE) and one about body -y (dP). A tilted hover tracked only while thrusting cannot separate gravity from the engine; coasting data or three-axis accelerometer records break the confound. An out-of-plane burn calibrates both angles. Hands-on throttle steps and RCS translation are thrust segments like any burn.",
        cases, ck,
        notes=["The three hover cases are subsets of one simulated attempt and share its noise realisation.",
               "Every fix carries `q`, the recorded attitude at the fix; the camera misalignment is a rotation fixed in the body frame."],
    )
