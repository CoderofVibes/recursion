# GMAT vectors: pending execution

No GMAT-generated reference CSVs are available yet. GMAT was not found on the
owner's machine during thread 1D on 2026-11-14. No software was installed.
Do not treat this directory as a passing or complete GMAT regression suite.

After installing GMAT, run the four scripts and conversion/verification commands
in [the verification guide](../../../docs/verification/gmat.md). The expected files are:

| File | Data rows, including t=0 | Last time (s) |
|---|---:|---:|
| `c1-circular.csv` | 1801 | 18000 |
| `c2-eccentric.csv` | 7201 | 72000 |
| `c3-hyperbolic.csv` | 4001 | 40000 |
| `c4-finite_burn.csv` | 613 | 6120 |

Each file starts with one `# ` JSON provenance comment, then
`t_s,x_m,y_m,vx_mps,vy_mps,mass_kg`, then samples at 10-second intervals in SI.
Consumers must skip comment lines. Missing vectors must fail the reference
check explicitly, rather than silently pass or substitute analytic trajectories.
Update this status after actual GMAT execution and record the installed version.
