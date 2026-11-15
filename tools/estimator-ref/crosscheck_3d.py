"""Cross-check the 3D estimator reference propagator against independent physics vectors.

    python tools/estimator-ref/crosscheck_3d.py [--dt 10] [--short]

Three checks, all with the physics vectors' own absolute tolerances:

  1. planar   tests/vectors/physics.json (1B, planar) run through
              estref3.core.simulate with z = 0: the planar regression.
  2. rotated  the same planar cases turned into an inclined plane by a fixed
              rotation (below); the result must be 1B's values turned by the
              same rotation. The reference values stay independent: only the
              start state and the expected values are rotated.
  3. 3d       tests/vectors/physics-3d.json (2G physics, an independent
              Dormand-Prince reference), if the file exists: inclined orbits, a
              ship crossing the binary plane, an inclined binary, and nodal
              precession over 2e6 s. --short skips cases longer than 100 000 s.

Rigid-body (spin) cases are not the estimator's business and are skipped.
"""
from __future__ import annotations

import json
import math
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

from estref3.core import Attempt, BodyDef, Structure, simulate  # noqa: E402

STATE = ("x", "y", "z", "vx", "vy", "vz")
VEC_Q = ("position", "velocity", "body_position", "body_velocity")
# Inclination 55 deg, node 20 deg, in-plane turn 0.3 rad: R = Rz(node) Rx(inc) Rz(arg).
INC, NODE, ARG = math.radians(55.0), math.radians(20.0), 0.3


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1.0, 0.0, 0.0], [0.0, c, -s], [0.0, s, c]])


ROT = rz(NODE) @ rx(INC) @ rz(ARG)


def lift(v):
    v = list(v)
    return np.array(v + [0.0] if len(v) == 2 else v, dtype=float)


def run_case(case, dt, R=None):
    """Returns (max position error, max velocity error, span, ok)."""
    law, init = case["law"], case["initial"]
    turn = (lambda v: R @ lift(v)) if R is not None else lift
    values = {}
    bodies = []
    if "bodies" in init:
        for b in init["bodies"]:
            bid = b["id"]
            for k, v in zip(STATE, (*turn(b["r"]), *turn(b["v"]))):
                values[f"{bid}.{k}"] = float(v)
            bodies.append(BodyDef(bid, float(b["GM"]), tuple(f"{bid}.{k}" for k in STATE)))
    else:
        bodies.append(BodyDef("source", float(law["GM"])))  # fixed at the origin
    for k, v in zip(STATE, (*turn(init["r"]), *turn(init["v"]))):
        values[f"ship.{k}"] = float(v)
    names = list(values)
    X = np.array([[values[k] for k in names]])
    idx = {k: i for i, k in enumerate(names)}
    st = Structure(float(law["r0"]), float(law["exponent"]), bodies, ship=tuple(f"ship.{k}" for k in STATE))
    exp = [e for e in case["expect"] if e["quantity"] in VEC_Q]
    times = sorted({e["at_t"] for e in exp})
    steps = [int(round(t / dt)) for t in times]
    if any(abs(k * dt - t) > 1e-9 for k, t in zip(steps, times)):
        raise SystemExit(f"{case['id']}: checkpoint times are not multiples of dt = {dt}")
    outP, outV, _ = simulate(st, Attempt("x", max(times), [], []), X, idx, dt, steps)
    nb = len(bodies)
    w_pos = w_vel = 0.0
    ok = True
    for e in exp:
        q = e["quantity"]
        k = int(round(e["at_t"] / dt))
        i = nb if q in ("position", "velocity") else [b.id for b in bodies].index(e["body"])
        got = (outP if q.endswith("position") else outV)[k][0, i]
        err = float(np.max(np.abs(got - turn(e["value"]))))
        if q.endswith("position"):
            w_pos = max(w_pos, err)
        else:
            w_vel = max(w_vel, err)
        if err > e["tolerance"]:
            ok = False
            print(f"  FAIL {case['id']} {q} t={e['at_t']}: error {err:.3e} > tolerance {e['tolerance']:.1e}")
    return w_pos, w_vel, max(times), ok


def run_file(path, dt, label, R=None, short=False):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    ok = True
    worst = [0.0, 0.0]
    n = 0
    for case in data["cases"]:
        if case.get("kind") != "trajectory":
            continue
        span = max(e["at_t"] for e in case["expect"])
        if short and span > 1.0e5:
            print(f"  {label:8s} {case['id']:24s} skipped (--short)")
            continue
        t0 = time.time()
        w_pos, w_vel, span, good = run_case(case, dt, R)
        ok = ok and good
        n += 1
        worst = [max(worst[0], w_pos), max(worst[1], w_vel)]
        print(f"  {label:8s} {case['id']:24s} span {span:9.0f} s  max position error {w_pos:.3e} m  max velocity error {w_vel:.3e} m/s  ({time.time() - t0:.1f} s)")
    return ok, worst, n


def main(argv):
    dt = float(argv[argv.index("--dt") + 1]) if "--dt" in argv else 10.0
    short = "--short" in argv
    planar = os.path.join(ROOT, "tests", "vectors", "physics.json")
    three = os.path.join(ROOT, "tests", "vectors", "physics-3d.json")
    print(f"dt = {dt:g} s")
    ok1, w1, n1 = run_file(planar, dt, "planar")
    print(f"planar:  {n1} cases, worst {w1[0]:.2e} m, {w1[1]:.2e} m/s")
    print(f"rotation: inclination {math.degrees(INC):g} deg, node {math.degrees(NODE):g} deg, in-plane turn {ARG:g} rad")
    ok2, w2, n2 = run_file(planar, dt, "rotated", ROT)
    print(f"rotated: {n2} cases, worst {w2[0]:.2e} m, {w2[1]:.2e} m/s")
    ok3 = True
    if os.path.exists(three):
        ok3, w3, n3 = run_file(three, dt, "3d", short=short)
        print(f"3d:      {n3} cases, worst {w3[0]:.2e} m, {w3[1]:.2e} m/s")
    else:
        print("3d:      tests/vectors/physics-3d.json not present; skipped")
    ok = ok1 and ok2 and ok3
    print("PASS: the 3D reference propagator matches the physics vectors within their tolerances" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
