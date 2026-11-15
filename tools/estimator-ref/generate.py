"""Generate the estimator test vectors (1G planar set; 2G three-dimensional set).

    python tools/estimator-ref/generate.py            regenerate every planar vector
    python tools/estimator-ref/generate.py --only ID  regenerate one vector
    python tools/estimator-ref/generate.py --check    regenerate in memory and compare with the files on disk
    python tools/estimator-ref/generate.py --list     list vector ids

Add --3d to any of these to work on the three-dimensional set instead
(spec revision 3): `--3d`, `--3d --check`, `--3d --only ID`, `--3d --list`.

Planar set. Inputs: tools/estimator-ref/assumptions.json (gravity normalisation
and scale, sensor noise, priors, window rule, seeds). Outputs:
tests/vectors/estimator/. Package: estref.

3D set. Inputs: assumptions.json and assumptions-3d.json. Outputs:
tests/vectors/estimator-3d/. Package: estref3. The rotation-invariance vector
also reads two planar vector files. Nothing in the planar set is touched.

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

OUT3 = os.path.join(ROOT, "tests", "vectors", "estimator-3d")

VECTORS3 = [
    ("inclined-newton-recovers-gm", "estref3.scenarios", "v_inclined_newton"),
    ("inv25-two-planes", "estref3.scenarios_b", "v_inv25_two_planes"),
    ("inv25-exponent-planes", "estref3.scenarios_b", "v_inv25_exponent_planes"),
    ("offplane-body-signature", "estref3.scenarios_b", "v_offplane_body"),
    ("thrust-3d-confounded", "estref3.scenarios_c", "v_thrust_3d"),
    ("forecast-envelope-3d", "estref3.scenarios_d", "v_forecast_envelope_3d"),
    ("carried-rule-other-plane", "estref3.scenarios_d", "v_carried_rule_other_plane"),
    ("rotation-invariance", "estref3.scenarios_e", "v_rotation_invariance"),
]

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
    v = clean(getattr(importlib.import_module(mod if "." in mod else "estref." + mod), fn)())
    return vid, v, time.time() - t0


def assumptions_hash(name="assumptions.json"):
    with open(os.path.join(HERE, name), "rb") as f:
        return hashlib.sha256(f.read().replace(b"\r\n", b"\n")).hexdigest()[:16]


def main(argv):
    from estref.jsonfmt import diff, dumps

    three = "--3d" in argv
    vectors, out_dir = (VECTORS3, OUT3) if three else (VECTORS, OUT)
    if "--list" in argv:
        for vid, _, _ in vectors:
            print(vid)
        return 0
    todo = vectors
    if "--only" in argv:
        want = argv[argv.index("--only") + 1]
        todo = [e for e in vectors if e[0] == want]
        if not todo:
            raise SystemExit(f"unknown vector id: {want}")
    check = "--check" in argv
    os.makedirs(out_dir, exist_ok=True)
    ahash = assumptions_hash()
    ahash3 = assumptions_hash("assumptions-3d.json") if three else None
    rc = 0
    index = []
    with cf.ProcessPoolExecutor(max_workers=min(len(todo), os.cpu_count() or 2)) as ex:
        for vid, v, secs in ex.map(build, todo):
            v["assumptionsHash"] = ahash
            if three:
                v["assumptions3dHash"] = ahash3
            failed = [c for c in v["checks"] if not c["pass"]]
            path = os.path.join(out_dir, vid + ".json")
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
    if not check and rc == 0 and len(todo) == len(vectors):
        idx = {
            "schema": "recursion.estimator-vector-index/1",
            "generator": "python tools/estimator-ref/generate.py",
            "assumptions": "tools/estimator-ref/assumptions.json",
            "assumptionsHash": ahash,
            "spec": "docs/model/estimator-spec.md",
            "vectors": index,
        }
        if three:
            idx = {
                "schema": "recursion.estimator-vector-3d-index/1",
                "generator": "python tools/estimator-ref/generate.py --3d",
                "assumptions": "tools/estimator-ref/assumptions.json and tools/estimator-ref/assumptions-3d.json",
                "assumptionsHash": ahash,
                "assumptions3dHash": ahash3,
                "spec": "docs/model/estimator-spec.md (revision 3)",
                "planarSet": "tests/vectors/estimator/ (unchanged; the planar regression). rotation-invariance reads newton-recovers-gm.json and forecast-envelope.json from it.",
                "claims": sum(e["claims"] for e in index),
                "vectors": index,
            }
        with open(os.path.join(out_dir, "index.json"), "w", encoding="utf-8", newline="\n") as f:
            f.write(dumps(idx) + "\n")
    print("OK" if rc == 0 else "FAILED")
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
