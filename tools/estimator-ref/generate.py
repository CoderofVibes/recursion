"""Generate the estimator test vectors (1G).

    python tools/estimator-ref/generate.py            regenerate every vector
    python tools/estimator-ref/generate.py --only ID  regenerate one vector
    python tools/estimator-ref/generate.py --check    regenerate in memory and compare with the files on disk
    python tools/estimator-ref/generate.py --list     list vector ids

Inputs: tools/estimator-ref/assumptions.json (gravity normalisation and scale,
sensor noise, priors, window rule, seeds). Outputs: tests/vectors/estimator/.
A vector is written only if all of its claims hold. Needs Python >= 3.10 and numpy.
"""
from __future__ import annotations

import concurrent.futures as cf
import hashlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "tests", "vectors", "estimator")
sys.path.insert(0, HERE)

VECTORS = [
    ("newton-recovers-gm", "scenarios", "v_newton_recovers_gm"),
    ("inv25-newton-two-distances", "scenarios_b", "v_inv25_two_distances"),
    ("inv25-exponent-coverage", "scenarios_b", "v_inv25_exponent_coverage"),
    ("missing-body-signature", "scenarios_b", "v_missing_body"),
    ("burn-only-confounded", "scenarios_b", "v_burn_only"),
    ("extension-validation", "scenarios_c", "v_extension_validation"),
    ("forecast-envelope", "scenarios_c", "v_forecast_envelope"),
    ("carried-rule-forecast", "scenarios_d", "v_carried_rule_forecast"),
    ("parameter-aging", "scenarios_d", "v_parameter_aging"),
]


def build(entry):
    import importlib

    from estref.jsonfmt import clean

    vid, mod, fn = entry
    t0 = time.time()
    v = clean(getattr(importlib.import_module("estref." + mod), fn)())
    return vid, v, time.time() - t0


def assumptions_hash():
    with open(os.path.join(HERE, "assumptions.json"), "rb") as f:
        return hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()[:16]


def main(argv):
    from estref.jsonfmt import diff, dumps

    if "--list" in argv:
        for vid, _, _ in VECTORS:
            print(vid)
        return 0
    todo = VECTORS
    if "--only" in argv:
        want = argv[argv.index("--only") + 1]
        todo = [e for e in VECTORS if e[0] == want]
        if not todo:
            raise SystemExit(f"unknown vector id: {want}")
    check = "--check" in argv
    os.makedirs(OUT, exist_ok=True)
    ahash = assumptions_hash()
    rc = 0
    index = []
    with cf.ProcessPoolExecutor(max_workers=min(len(todo), os.cpu_count() or 2)) as ex:
        for vid, v, secs in ex.map(build, todo):
            v["assumptionsHash"] = ahash
            failed = [c for c in v["checks"] if not c["pass"]]
            path = os.path.join(OUT, vid + ".json")
            status = "ok"
            if failed:
                rc = 1
                status = "CLAIMS FAILED: " + ", ".join(c["id"] for c in failed)
            elif check:
                if not os.path.exists(path):
                    rc, status = 1, "missing on disk"
                else:
                    with open(path, encoding="utf-8") as f:
                        d = diff(json.load(f), v)
                    if d:
                        rc, status = 1, "DIFFERS: " + "; ".join(d[:5])
                    else:
                        status = "reproduced"
            else:
                with open(path, "w", encoding="utf-8", newline="\n") as f:
                    f.write(dumps(v) + "\n")
                status = "written"
            print(f"{vid:30s} {len(v['checks']) - len(failed):2d}/{len(v['checks']):2d} claims  {secs:6.1f} s  {status}")
            index.append({"id": vid, "file": vid + ".json", "title": v["title"], "claims": len(v["checks"]), "cases": [c["id"] for c in v["cases"]]})
    if not check and rc == 0 and len(todo) == len(VECTORS):
        idx = {
            "schema": "recursion.estimator-vector-index/1",
            "generator": "python tools/estimator-ref/generate.py",
            "assumptions": "tools/estimator-ref/assumptions.json",
            "assumptionsHash": ahash,
            "spec": "docs/model/estimator-spec.md",
            "vectors": index,
        }
        with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8", newline="\n") as f:
            f.write(dumps(idx) + "\n")
    print("OK" if rc == 0 else "FAILED")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
