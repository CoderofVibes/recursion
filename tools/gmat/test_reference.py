"""Integrity tests with synthetic in-memory data, NOT GMAT trajectory validation or GMAT execution."""

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


def synthetic_burn_rows(thrust_n=1000, fixed_direction=None):
    """Independent RK4 fixture, never saved or represented as a GMAT result.

    fixed_direction=(ux, uy) deliberately models the wrong (inertially fixed) thrust axis.
    """
    state = [ref.R0, 0.0, 0.0, ref.V0, 1000.0]
    rows = [[0, *state]]
    for time in range(6120):
        active = time < 120

        def rhs(values):
            x, y, vx, vy, mass = values
            gravity = ref.MU / math.hypot(x, y) ** 3
            ux, uy = fixed_direction or (vx / math.hypot(vx, vy), vy / math.hypot(vx, vy))
            accel = thrust_n / mass if active else 0
            return [vx, vy, -gravity * x + accel * ux,
                    -gravity * y + accel * uy, -1000 / (320 * ref.G0) if active else 0]

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

    def test_epoch_roundoff_drift_is_bounded_and_physics_uses_grid_time(self):
        # Pattern measured on GMAT R2026a: +1.437 ulp on the first two stops, then +0.437.
        rows, _ = ref.parse_raw("C2", synthetic_raw("C2"))
        drift = 0.0
        for index, row in enumerate(rows[1:], 1):
            drift += (1.437 if index <= 2 else 0.437) * ref.EPOCH_ULP_S
            row[0] += drift
        checks = ref.validate_rows("C2", rows)  # Kepler at reported time would miss by meters
        self.assertAlmostEqual(checks["max_reported_time_drift_s"], drift)
        self.assertGreater(drift, 9e-4)
        rows[-1][0] += 7200 * ref.EPOCH_ULP_S
        with self.assertRaisesRegex(ValueError, "off the 10 s grid"):
            ref.validate_rows("C2", rows)

    def test_kepler_from_state_matches_closed_form(self):
        for case in ("C1", "C2"):
            for time in (10, 1234, 6000, 17990):
                with self.subTest(case=case, time=time):
                    actual = ref.kepler_from_state(ref.CASES[case]["initial"], time)
                    expected = ref.analytic_state(case, time)
                    self.assertLess(math.hypot(actual[0] - expected[0], actual[1] - expected[1]), 1e-5)
                    self.assertLess(math.hypot(actual[2] - expected[2], actual[3] - expected[3]), 1e-8)

    def test_burn_audit_integrator_is_converged(self):
        coarse, fine = ref.burn_arc(100)[-1], ref.burn_arc(400)[-1]
        self.assertEqual(coarse[0], 120)
        self.assertLess(math.hypot(coarse[1] - fine[1], coarse[2] - fine[2]), 1e-6)
        self.assertAlmostEqual(fine[5], ref.expected_mass("C4", 120), places=9)

    def test_finite_burn_rejects_wrong_thrust_model(self):
        for label, rows in [("fixed axis", synthetic_burn_rows(fixed_direction=(0.0, 1.0))),
                            ("thrust", synthetic_burn_rows(thrust_n=1010))]:
            with self.subTest(label=label):
                with self.assertRaisesRegex(ValueError, "independent burn_rk4"):
                    ref.validate_rows("C4", rows)

    def test_finite_burn_rejects_mistimed_coast(self):
        rows = synthetic_burn_rows()
        cutoff = rows[12][1:5]
        for index in range(13, len(rows)):  # energy and momentum stay exact; phase is late
            rows[index][1:5] = ref.kepler_from_state(cutoff, (index - 12) * 10 + 0.01)
        with self.assertRaisesRegex(ValueError, "independent coast_kepler"):
            ref.validate_rows("C4", rows)

    def test_tight_variant_changes_only_audit_settings(self):
        for case in ref.CASES:
            base = ref.script_text(case).splitlines()
            tight = ref.script_text(case, "tight").splitlines()
            changed = sorted(set(tight) - set(base))
            self.assertEqual(len(base) + 1, len(tight))
            self.assertEqual(changed, sorted([
                "% AUDIT VARIANT 'tight': never convert into committed vectors.",
                f"GMAT Raw.Filename = '{ref.basename(case)}.tight.raw.csv';",
                "GMAT Reference.Accuracy = 1e-13;",
                "GMAT Reference.MaxStep = 5;"]))

    def test_log_scan_and_startup_rewrite(self):
        clean = ('*** Library "..\\plugins\\libMatlabInterface" did not open.\n'
                 "Successfully interpreted the script\nMission run completed.\n")
        self.assertEqual(ref.log_problems(clean), [])
        warning = clean + "**** WARNING **** the achieved stop is outside of the stopping tolerance\n"
        self.assertEqual(len(ref.log_problems(warning)), 1)
        self.assertEqual(ref.log_problems("Successfully interpreted the script\n"),
                         ["missing 'Mission run completed.'"])
        template = "ROOT_PATH = ../\nOUTPUT_PATH            = ../output/\nLOG_FILE = OUTPUT_PATH/GmatLog.txt\n"
        text = ref.startup_text(template, Path("C:/runs/with space"))
        self.assertIn("OUTPUT_PATH            = C:/runs/with space/\n", text)
        self.assertIn("ROOT_PATH = ../\n", text)
        with self.assertRaisesRegex(ValueError, "OUTPUT_PATH"):
            ref.startup_text("ROOT_PATH = ../\n", Path("C:/runs"))

    def test_compare_flags_tight_run_differences(self):
        with tempfile.TemporaryDirectory() as base, tempfile.TemporaryDirectory() as tight:
            raw = synthetic_raw("C1")
            (Path(base) / "c1-circular.raw.csv").write_text(raw, encoding="utf-8")
            (Path(tight) / "c1-circular.tight.raw.csv").write_text(raw, encoding="utf-8")
            # Relax the converter's own 0.05 m Kepler limit so only compare can object.
            with patch("sys.stdout", new_callable=io.StringIO), patch.object(ref, "STATE_TOL_M", 1.0):
                self.assertEqual(ref.compare(Path(base), Path(tight), "C1")["position_m"], 0)
                lines = raw.splitlines()
                fields = lines[100].split(",")
                fields[1] = repr(float(fields[1]) + 0.0002)  # +0.2 m in x (raw is km)
                lines[100] = ",".join(fields)
                (Path(tight) / "c1-circular.tight.raw.csv").write_text("\n".join(lines), encoding="utf-8")
                with self.assertRaisesRegex(ValueError, "position_m"):
                    ref.compare(Path(base), Path(tight), "C1")

    def test_convert_rejects_raw_changed_after_recorded_run(self):
        with tempfile.TemporaryDirectory() as directory:
            temp = Path(directory)
            (temp / "c1-circular.raw.csv").write_text(synthetic_raw("C1"), encoding="utf-8")
            manifest = {"variant": "baseline", "gmat_build_date": "test", "gmat_console_sha256": "0",
                        "runs": {"C1": {"raw_sha256": "0" * 64}}}
            (temp / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            with patch.object(ref, "VECTOR_DIR", temp):
                with self.assertRaisesRegex(ValueError, "changed since the recorded GMAT run"):
                    ref.convert("C1", temp, "SYNTHETIC-TEST-ONLY")
            self.assertFalse((temp / "c1-circular.csv").exists())


if __name__ == "__main__":
    unittest.main()
