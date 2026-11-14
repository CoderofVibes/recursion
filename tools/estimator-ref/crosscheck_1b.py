"""Cross-check the estimator reference propagator against 1B's physics vectors.

    python tools/estimator-ref/crosscheck_1b.py tests/vectors/physics.json [--dt 10]

Runs the trajectory cases (single body and mutual binary, exponent 2 and 2.5)
through estref.core.simulate and compares positions and velocities with 1B's
checkpoints, using 1B's own absolute tolerances. Independent evidence that the
dynamics inside the estimator vectors are the same physics 2A will implement.
"""
from __future__ import annotations

import json
import sys

import numpy as np

from estref.core import Attempt, BodyDef, Structure, simulate


def run(path, dt):
    data = json.load(open(path, encoding="utf-8"))
    worst = {}
    ok = True
    for case in data["cases"]:
        if case.get("kind") != "trajectory":
            continue
        law, init = case["law"], case["initial"]
        values = {}
        bodies = []
        if "bodies" in init:
            for b in init["bodies"]:
                bid = b["id"]
                for k, v in zip(("x", "y", "vx", "vy"), (*b["r"], *b["v"])):
                    values[f"{bid}.{k}"] = v
                bodies.append(BodyDef(bid, float(b["GM"]), tuple(f"{bid}.{k}" for k in ("x", "y", "vx", "vy"))))
        else:
            bodies.append(BodyDef("source", float(law["GM"])))  # fixed at the origin
        for k, v in zip(("x", "y", "vx", "vy"), (*init["r"], *init["v"])):
            values[f"ship.{k}"] = v
        names = list(values)
        X = np.array([[values[k] for k in names]])
        idx = {k: i for i, k in enumerate(names)}
        st = Structure(float(law["r0"]), float(law["exponent"]), bodies, ship=tuple(f"ship.{k}" for k in ("x", "y", "vx", "vy")))
        times = sorted({e["at_t"] for e in case["expect"] if e["quantity"] in ("position", "velocity", "body_position", "body_velocity")})
        steps = [int(round(t / dt)) for t in times]
        if any(abs(k * dt - t) > 1e-9 for k, t in zip(steps, times)):
            raise SystemExit(f"{case['id']}: checkpoint times are not multiples of dt = {dt}")
        outP, outV, _ = simulate(st, Attempt("x", max(times), [], []), X, idx, dt, steps)
        nb = len(bodies)
        w_pos = w_vel = 0.0
        for e in case["expect"]:
            q = e["quantity"]
            if q not in ("position", "velocity", "body_position", "body_velocity"):
                continue
            k = int(round(e["at_t"] / dt))
            i = nb if q in ("position", "velocity") else [b.id for b in bodies].index(e["body"])
            got = (outP if q.endswith("position") else outV)[k][0, i]
            err = float(np.max(np.abs(got - np.array(e["value"]))))
            if q.endswith("position"):
                w_pos = max(w_pos, err)
            else:
                w_vel = max(w_vel, err)
            if err > e["tolerance"]:
                ok = False
                print(f"FAIL {case['id']} {q} t={e['at_t']}: error {err:.3e} > tolerance {e['tolerance']:.1e}")
        worst[case["id"]] = (w_pos, w_vel, max(times))
        print(f"{case['id']:14s} span {max(times):9.0f} s  max position error {w_pos:.3e} m  max velocity error {w_vel:.3e} m/s")
    print("PASS: reference propagator matches 1B within 1B's tolerances" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    dt = float(sys.argv[sys.argv.index("--dt") + 1]) if "--dt" in sys.argv else 10.0
    if not args:
        raise SystemExit(__doc__)
    sys.exit(run(args[0], dt))
