"""Planar reduction check: run the planar vectors' numeric fits through the 3D
reference and compare with the planar expected values.

    python tools/estimator-ref/bridge_planar.py                 every numeric fit of the nine planar vectors, then the forecast
    python tools/estimator-ref/bridge_planar.py --only ID       one vector's fits
    python tools/estimator-ref/bridge_planar.py --quick         the four fastest vectors
    python tools/estimator-ref/bridge_planar.py --forecast      Tier L, present state and forecast of forecast-envelope only

The planar files are only read. Each fit is lifted (z = 0, attitude about +z,
elevation 0; out-of-plane unknowns held at zero and out-of-plane rows left out,
spec Appendix A.3) and solved by `estref3` from the stored initial values. The
forecast part runs the planar vector forecast-envelope through the 3D Tier L,
present-state fit and forecast in the same reduction and compares windows,
profile, present state and every forecast point inside the horizon. The 3D
reference shares no dynamics or measurement code with the planar one, so
agreement shows that every 3D formula reduces to the planar one.
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PLANAR = os.path.join(ROOT, "tests", "vectors", "estimator")
sys.path.insert(0, HERE)

QUICK = ["newton-recovers-gm", "burn-only-confounded", "parameter-aging", "missing-body-signature"]
TOL = {"estimateOverSigma": 1e-4, "sigmaRelative": 1e-5, "correlationAbs": 1e-5, "chi2Relative": 1e-6, "pEffAbs": 1e-5}


def run_vector(vid):
    from estref.common import DT, FD, MU_A, MU_B
    from estref3.bridge import compare_fit, lift_attempt, lift_params, lift_structure
    from estref3.fit import staged_fit

    t0 = time.time()
    with open(os.path.join(PLANAR, vid + ".json"), encoding="utf-8") as f:
        v = json.load(f)
    mu_scale = {"A": 1e-3 * MU_A, "B": 1e-3 * MU_B}
    rows = []
    for case in v["cases"]:
        for fj in case.get("fits", []):
            if fj["compare"] != "numeric":
                continue
            subset = fj.get("dataSubset", "")
            pool = case["attempts"]
            if subset.startswith("quick-look"):
                pool = [a for a in pool if a.get("subset") == "quick-look"]
            elif subset.startswith("full arc"):
                pool = [a for a in pool if a.get("subset") != "quick-look"]
            by_id = {a["id"]: a for a in pool}
            atts = [lift_attempt(by_id[i]) for i in fj["attempts"]]
            st = lift_structure(fj["model"])
            params = lift_params(fj["parameters"], mu_scale)
            fit, _ = staged_fit(st, atts, params, DT, h=FD)
            rows.append({"vector": vid, "case": case["id"], "fit": fj["id"], **compare_fit(fit, fj["expected"])})
    return vid, rows, time.time() - t0


FTOL = {"windowG": 1e-4, "windowSigma": 1e-5, "profileNode": 1e-4, "noiseScale": 1e-8, "anchorState": 1e-4, "anchorSigma": 1e-5, "forecastMean": 1e-4, "forecastSigma": 1e-5}


def run_forecast():
    """Tier L, present state and forecast of the planar vector forecast-envelope
    through the 3D reference in planar reduction. Returns worst differences."""
    import numpy as np

    from estref.common import AS, DT
    from estref3 import quat as Q
    from estref3.bridge import lift_attempt
    from estref3.core import Attempt, Command
    from estref3.diag import tier_l, win_kw
    from estref3.local import anchor_state, forecast, major_sigma, make_windows

    with open(os.path.join(PLANAR, "forecast-envelope.json"), encoding="utf-8") as f:
        case = json.load(f)["cases"][0]
    fin = case["forecastInputs"]
    ref = dict(fin["reference"], dP=0.0)
    atts = [lift_attempt(a) for a in case["attempts"]]
    tl = tier_l(ref, atts, planar=True)
    exp_w, got_w = case["tierL"]["windows"], tl["windows"]
    same = len(exp_w) == len(got_w) and all((a["t0"], a["t1"], a["nFixes"]) == (b["t0"], b["t1"], b["nFixes"]) for a, b in zip(got_w, exp_w))
    d = {
        "windowsSame": same,
        "windowG": max(abs(a["g"] - b["g"]) / b["sigma"] for a, b in zip(got_w, exp_w)),
        "windowSigma": max(abs(a["sigma"] / b["sigma"] - 1) for a, b in zip(got_w, exp_w)),
        "profileNode": max(abs(a - b) / sg for a, b, sg in zip(tl["profile"]["g"], case["tierL"]["profile"]["g"], case["tierL"]["profile"]["sigma"])),
        "noiseScale": abs(tl["noiseScale"] / case["tierL"]["noiseScale"] - 1),
    }
    cur = atts[-1]
    wins = [w for w in make_windows(cur, **win_kw()) if not w.powered][-AS["windows"]["anchorWindows"]:]
    t_last, x_now, P_now, _ = anchor_state(ref, tl["profile"], cur, wins, DT, g_prior=(1.0, AS["windows"]["localScalePriorSigma"]),
                                           slope_sigma=AS["windows"]["anchorSlopePriorSigma"], planar=True)
    ii = [0, 1, 3, 4]
    xp, Pp = np.array(case["anchor"]["state"]), np.array(case["anchor"]["covariance"])
    sp = np.sqrt(np.diag(Pp))
    d["anchorState"] = float(np.max(np.abs(x_now[ii] - xp) / sp))
    d["anchorSigma"] = float(np.max(np.abs(np.sqrt(np.diag(P_now)[ii]) / sp - 1)))
    d["anchorOutOfPlane"] = float(max(abs(x_now[2]), abs(x_now[5]), np.max(np.abs(P_now[2])), np.max(np.abs(P_now[5]))))
    eng = (fin["engineSigma"]["kE"], fin["engineSigma"]["dE"], 0.0)
    d["forecastMean"] = d["forecastSigma"] = d["forecastOutOfPlane"] = 0.0
    d["horizonSame"] = True
    for fc in case["forecasts"]:
        pj = case["plans"][fc["plan"]]
        cmds = [Command(c["t0"], c["t1"], c["u"], tuple(Q.from_yaw(c["theta"]))) for c in pj["commands"]]
        times = pj["checkpoints"]
        mean, covs = forecast(ref, tl["profile"], Attempt(cur.id, max(times) + DT, cmds, []), t_last, x_now, P_now, times, DT, tl["noiseScale"], fin["sigmaH"], eng)
        ok = True
        for i, pt in enumerate(fc["points"]):
            c = covs[i]
            ok = ok and major_sigma(c["total"]) <= fin["horizonFraction"] * float(np.linalg.norm(mean[i]))
            d["horizonSame"] = d["horizonSame"] and ok == pt["withinHorizon"]
            if not pt["withinHorizon"]:
                continue
            st = pt["sigmaMajor"]["total"]
            d["forecastMean"] = max(d["forecastMean"], float(np.linalg.norm(mean[i][:2] - np.array(pt["mean"]))) / st)
            d["forecastSigma"] = max(d["forecastSigma"], float(np.max(np.abs(c["total"][:2, :2] - np.array(pt["covTotal"])))) / st**2)
            for k in ("state", "profile", "hedge", "engine"):
                if pt["sigmaMajor"][k] > 1.0:
                    d["forecastSigma"] = max(d["forecastSigma"], abs(major_sigma(c[k]) / pt["sigmaMajor"][k] - 1))
            d["forecastOutOfPlane"] = max(d["forecastOutOfPlane"], abs(float(mean[i][2])), float(np.max(np.abs(c["total"][2]))))
    return d


def report_forecast():
    t0 = time.time()
    d = run_forecast()
    bad = [k for k in FTOL if d[k] > FTOL[k]] + [k for k in ("windowsSame", "horizonSame") if not d[k]] + [k for k in ("anchorOutOfPlane", "forecastOutOfPlane") if d[k] != 0.0]
    print(f"forecast-envelope in planar reduction ({time.time() - t0:.1f} s): " + ", ".join(f"{k} {v:.1e}" if isinstance(v, float) else f"{k} {v}" for k, v in d.items()))
    print("PASS: Tier L, the present state and the forecast reduce to the planar ones (the out-of-plane parts are exactly zero)" if not bad else "FAIL " + ",".join(bad))
    return not bad


def main(argv):
    if "--forecast" in argv:
        return 0 if report_forecast() else 1
    with open(os.path.join(PLANAR, "index.json"), encoding="utf-8") as f:
        ids = [e["id"] for e in json.load(f)["vectors"]]
    full = True
    if "--only" in argv:
        ids = [argv[argv.index("--only") + 1]]
        full = False
    elif "--quick" in argv:
        ids = QUICK
        full = False
    worst = {k: 0.0 for k in TOL}
    ok = True
    n = 0
    with cf.ProcessPoolExecutor(max_workers=min(len(ids), os.cpu_count() or 2)) as ex:
        for vid, rows, secs in ex.map(run_vector, ids):
            for r in rows:
                n += 1
                bad = [k for k in TOL if r[k] > TOL[k]] + ([] if r["mEqual"] else ["m"])
                ok = ok and not bad
                for k in TOL:
                    worst[k] = max(worst[k], r[k])
                print(f"{r['vector']:28s} {r['case']:22s} {r['fit']:30s} dx/sigma {r['estimateOverSigma']:.1e}  dsigma {r['sigmaRelative']:.1e}  drho {r['correlationAbs']:.1e}  dchi2 {r['chi2Relative']:.1e}" + ("  FAIL " + ",".join(bad) if bad else ""))
            print(f"  {vid}: {len(rows)} numeric fits, {secs:.1f} s")
    print(f"{n} fits; worst: " + ", ".join(f"{k} {v:.1e}" for k, v in worst.items()))
    print("PASS: the 3D reference in planar reduction reproduces the planar fits" if ok else "FAIL")
    if full:
        ok = report_forecast() and ok
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
