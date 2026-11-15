# S21 reference

From the repository/worktree root:

```text
python tools/studies/s21/reference.py
python tools/studies/s21/reference.py --check
```

Only installed Python standard library and NumPy are used. Outputs are deterministic JSON alongside the script; `--check` recomputes and fails on any changed serialized value. Full runs take several minutes. Diagnostic `--section passes|power|grid|ring|catalogue|robustness|neighborhoods|vectors` limits recomputation; dependent sections require the earlier output files. A full check is the acceptance command.

The runner extends S8's Python `core.py` (RK4 in an analytic circular binary) and `ring.py` (explicit initial rock distribution), never TypeScript game code. It is not independent of S8 and does not claim to be a second independent gravity derivation. New S21 code supplies the cloud, field/clearance comparisons, power budget, seed adaptation, finite thrust, vectors and checks. `inputs.json` fingerprints the read source inputs and identifies the starting commit. Exported states avoid dependence on the game's RNG. Float serialization is reproducible in the same Python/NumPy runtime; use the stated physical tolerances for ports and investigate cross-platform last-bit differences.

| Output | What it proves or specifies |
| --- | --- |
| `passes.json` | Fixed 1.1 h pass family, raw exposure and failure thresholds |
| `grid.json` | 743 enumerated controls and their first outward exits/body-contact outcomes, horizon 160 h |
| `ring.json` | All 336 rock states at 12 fixed-layout phases, blind/+z/−z swept clearance and same-rock contact cues |
| `catalogue.json` | Seven adapted S8 arrival offsets, full-field nominal gaps, initial exclusion and 28 fixed-sun manual-power cases |
| `catalogue-neighborhoods.json` | Nine timing/impulse samples per catalogue offset, same full field |
| `robustness.json` | Nine controls around the main witness; nine wider manual-error cases at 150° ring phase; finite quarter-throttle main/RCS alternative |
| `power.json` | Stowed, edge-on, planned and manual histories; separated electrical/battery ledgers |
| `vectors.json` | Four requested portable fixtures, initial conditions, commands, expected states/outcomes and tolerances |
| `verification.json` | 120/60/30 s orbital/clearance/cloud and 30/15/7.5 s power convergence; finite-grid bypass checks |
| `acceptance.json` | Assertions for catalogue/control margins, fuel/energy, fully dark upper bound and declared scope |
| `inputs.json` | Source provenance hashes; no machine paths or account information |

Rocks contacting finite bodies are absorbed; previously inactive rocks cannot collide with the ship. Every active interval is swept before absorption. Closest distances subtract rock radius and a conservative 20 m enclosing ship radius. Warnings use the same rock that first contacts the ship, not some earlier unrelated approach. First warning/contact times are interval starts with ±step resolution. A collision path is a ghost after contact, useful only for diagnostics; it is not a survival claim.

Cloud raw integrals in lethal examples are COM reference values; production must sweep component geometry. Cloud-free witnesses additionally retain a distance lower bound to both crescent and cap support, vastly larger than the 20 m hull and per-step travel. The main witness is >53 km clear at samples. The wide-route dose excess is large; all 38 wide speed-qualified cases exceed 1,217 raw units versus 150 for irreversible PDU failure. These margins do not excuse skipping component sweeps or in-step event ordering in production.

The electrical fixture uses fixed warm/healthy equipment, actual baseline constant modes and explicit overhead/off-sun envelopes, isolated buses and a selectable essential feed. It is not a port of the thermal solver, detailed load-priority dispatcher or real controller. Its endpoint loss comparison uses a declared optional-service allowance. See the study's power document before comparing its times to the game.

No production or human playtest claim is made. No source edits, data tuning, package installation, network execution or browser automation are required to rerun this study.
