"""Integrity tests with synthetic in-memory data, NOT GMAT trajectory validation."""

import copy
import csv
import io
import json
import math
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import reference as ref


def synthetic_raw(case):
    stream = io.StringIO()
    writer = csv.writer(stream)
    for time in range(0, ref.CASES[case]["duration_s"] + 1, ref.DT):
        x, y, vx, vy = ref.analytic_state(case, time)
        writer.writerow([time, x / 1000, y / 1000, 0, vx / 1000, vy / 1000,
                         0, 1000, ref.MU / 1e9])
    return stream.getvalue()


def synthetic_burn_rows():
    """Independent RK4 fixture, never saved or represented as a GMAT result."""
    state = [ref.R0, 0.0, 0.0, ref.V0, 1000.0]
    rows = [[0, *state]]
    for time in range(6120):
        active = time < 120

        def rhs(values):
            x, y, vx, vy, mass = values
            gravity = ref.MU / math.hypot(x, y) ** 3
            thrust = 1000 / mass / math.hypot(vx, vy) if active else 0
            return [vx, vy, -gravity * x + thrust * vx,
                    -gravity * y + thrust * vy, -1000 / (320 * ref.G0) if active else 0]

        k1 = rhs(state)
        k2 = rhs([y + k / 2 for y, k in zip(state, k1)])
        k3 = rhs([y + k / 2 for y, k in zip(state, k2)])
        k4 = rhs([y + k for y, k in zip(state, k3)])
        state = [y + (a + 2 * b + 2 * c + d) / 6
                 for y, a, b, c, d in zip(state, k1, k2, k3, k4)]
        if (time + 1) % 10 == 0:
            rows.append([time + 1, *state])
    return rows


class ReferenceIntegrityTests(unittest.TestCase):
    def test_kepler_cases_and_units(self):
        for case in ("C1", "C2", "C3"):
            with self.subTest(case=case):
                rows, checks = ref.parse_raw(case, synthetic_raw(case))
                self.assertEqual(checks["rows"], ref.CASES[case]["duration_s"] // 10 + 1)
                for actual, expected in zip(rows[0][1:5], ref.CASES[case]["initial"]):
                    self.assertAlmostEqual(actual, expected, places=6)

    def test_rejects_truncated_or_nonuniform_times(self):
        rows, _ = ref.parse_raw("C1", synthetic_raw("C1"))
        with self.assertRaisesRegex(ValueError, "expected 1801 rows"):
            ref.validate_rows("C1", rows[:-1])
        rows[2][0] = 30  # catches cumulative duration used as a stop argument
        with self.assertRaisesRegex(ValueError, "off the 10 s grid"):
            ref.validate_rows("C1", rows)

    def test_rejects_wrong_mu_out_of_plane_and_nonfinite(self):
        raw = list(csv.reader(io.StringIO(synthetic_raw("C1"))))
        for column, replacement, message in [(8, "398600", "wrong Earth GM"),
                                              (3, "0.1", "equatorial plane"),
                                              (6, "0.1", "equatorial plane"),
                                              (1, "nan", "nonfinite")]:
            with self.subTest(column=column):
                changed = copy.deepcopy(raw)
                changed[1][column] = replacement
                stream = io.StringIO()
                csv.writer(stream).writerows(changed)
                with self.assertRaisesRegex(ValueError, message):
                    ref.parse_raw("C1", stream.getvalue())

    def test_rejects_wrong_state_units_and_mass(self):
        rows, _ = ref.parse_raw("C1", synthetic_raw("C1"))
        changed = copy.deepcopy(rows)
        changed[0][1] /= 1000
        with self.assertRaisesRegex(ValueError, "state disagrees"):
            ref.validate_rows("C1", changed)
        rows[3][5] = 999
        with self.assertRaisesRegex(ValueError, "incorrect mass"):
            ref.validate_rows("C1", rows)

    def test_finite_burn_mass_and_cutoff(self):
        self.assertEqual(ref.expected_mass("C4", 0), 1000)
        self.assertAlmostEqual(ref.expected_mass("C4", 120), 961.7606420133277)
        self.assertEqual(ref.expected_mass("C4", 120), ref.expected_mass("C4", 6120))
        script = ref.script_text("C4")
        self.assertIn("GMAT Engine.DecrementMass = true;", script)
        self.assertLess(script.index("While sample < 12\n"), script.index("EndFiniteBurn"))
        self.assertLess(script.index("EndFiniteBurn"), script.index("While sample < 612\n"))

    def test_finite_burn_rejects_coasting_with_mass_loss(self):
        rows = []
        for time in range(0, 6121, 10):
            rows.append([time, *ref.analytic_state("C1", time), ref.expected_mass("C4", time)])
        with self.assertRaisesRegex(ValueError, "did not increase orbital energy"):
            ref.validate_rows("C4", rows)

    def test_finite_burn_accepts_bounded_cutoff_time_roundoff(self):
        rows = synthetic_burn_rows()
        ref.validate_rows("C4", rows)
        rows[12][0] -= 0.9 * ref.TIME_TOL
        ref.validate_rows("C4", rows)
        rows[12][5] -= 1e-4
        with self.assertRaisesRegex(ValueError, "incorrect mass"):
            ref.validate_rows("C4", rows)

    def test_conversion_roundtrip_and_provenance(self):
        # Synthetic artifacts exist only in an automatically removed temp directory.
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            (temp / "c1-circular.raw.csv").write_text(synthetic_raw("C1"), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp), patch("sys.stdout", new_callable=io.StringIO):
                ref.convert("C1", temp, "SYNTHETIC-TEST-ONLY")
                ref.verify("C1")
            lines = (temp / "c1-circular.csv").read_text(encoding="utf-8").splitlines()
            meta = json.loads(lines[0][2:])
            self.assertEqual(meta["gmat_version"], "SYNTHETIC-TEST-ONLY")
            self.assertEqual(meta["mu_m3_s2"], ref.MU)
            self.assertEqual(meta["initial_state_columns"], ["x_m", "y_m", "vx_mps", "vy_mps", "mass_kg"])
            self.assertEqual(len(meta["raw_sha256"]), 64)
            self.assertEqual(lines[1], ",".join(ref.COLUMNS))
            self.assertEqual(len(lines), 1803)
            meta["script_sha256"] = "0" * 64
            lines[0] = "# " + json.dumps(meta)
            (temp / "c1-circular.csv").write_text("\n".join(lines), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp):
                with self.assertRaisesRegex(ValueError, "script changed"):
                    ref.verify("C1")

    def test_invalid_report_does_not_create_vector(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            (temp / "c1-circular.raw.csv").write_text("0,1,2\n", encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp):
                with self.assertRaisesRegex(ValueError, "expected 9 columns"):
                    ref.convert("C1", temp, "SYNTHETIC-TEST-ONLY")
            self.assertFalse((temp / "c1-circular.csv").exists())

    def test_missing_gmat_vectors_fail_verification(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(ref, "VECTOR_DIR", Path(directory)):
                with self.assertRaises(FileNotFoundError):
                    ref.verify("C1")


if __name__ == "__main__":
    unittest.main()
