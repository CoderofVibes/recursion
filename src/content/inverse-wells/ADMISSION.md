# S22 production-harness admission probes

## Live-field continuation

Request 9 now uses the merged production lifecycle and throat-hazard integration.
The updated runner writes a separate `admission-reports/live-field-v2/` directory,
preserving every static-field report below. It repeats full results and the
content-owned observations of production hooks with:

```
node src/content/inverse-wells/admission-runner.mjs all --repeat
node src/content/inverse-wells/admission-summary.mjs
node src/content/inverse-wells/admission-probes.mjs
```

The 24-case matrix retains the original 22 controls and adds positive-y
recorder/model and cutoff-abort cases. Read-only hook observers collect actual
birth/veto epochs, phase counts, throat contacts and sweep coverage. They return
the production results unchanged. No lifecycle, loss policy, solver, recorder,
field geometry or player model is replaced. This is author admission evidence;
it does not certify camera precursor detection or acquired-rule playability.

**Results: execution completed; admission remains incomplete.** See the
[24-case table and source manifests](admission-reports/live-field-v2/SUMMARY.md).
Every complete result and hook-observation object repeated exactly. The nominal
catalogue reaches the forward exit in **11 of 14** flights; seed 22020 negative-y
and both directions for seed 22029 remain in progress at 36,000 s. Each nominal
flight consumes **122.365946 kg main** and **0.556209–0.584019 kg RCS**, below the
1,000 kg / 30 kg targets, with no reported resource failure. All 650 scheduled
births occur in each nominal flight, leaving all 2,601 sites active; none is vetoed
in those nominal starts. The production throat hook runs on every flight tick.

Seed 22000 negative-y now completes at 25,468 s. Worn positive-y completes at
22,866 s (previously 23,102 s). Several integrations changed since the static-field
baseline, so neither change is attributed to births alone. Both eight-second
cutoffs survive their 3,600 s windows with 61.182973 kg main. The delayed negative-y
control still misses the ten-hour window; delayed positive-y completes at 22,946 s.
The two real-model flights complete with no reported model error, but issue **zero
forecasts** and record **no field-signal products**. The dispatcher is integrated;
the current game environment still supplies no funnel camera scene. These runs
therefore establish neither acquired geometry nor learned pull/reversal.

The two ordinary negative controls still lose to the entrance reference-body
collision before the throat sweep's reported contact. Two separate, explicitly
authored initial-state probes exercise the R30 safety paths without that masking:

- [Off-reference throat](admission-reports/safety-probes-v1/off-reference-throat.json):
  start 5 km upstream of `funnel-1`'s throat, at 10 m/s along its axis. The production
  game loses the ship to **structural** damage at **203.241987 s**, exactly the
  throat hook's reported first contact, without a generic-body collision.
- [Unsafe birth](admission-reports/safety-probes-v1/unsafe-birth-veto.json): start
  stationary in dormant `funnel-4`'s reserved centre. The real birth guard vetoes
  that site at **1,200 s**; the ship survives to 1,300 s with no throat contact.

Both probes use the unchanged full field, real ship/recorder and 3E runner, consume
zero main/RCS propellant and repeat exactly. They are independent author fixtures,
not supported encounter arrivals, live teleports or a continuous expedition.

The combined published baseline is merge `6344b17` (main `0ee3d1c` plus 3C's
`8a1713b`, consumed unchanged) and the content-owned runner changes. Matrix source
SHA-256: `47643105ec09674ac13077bed6a5df907cf7f88e11a8cdb4548c2065d88cedf0`.
All 434 recorded inputs still match. The two later probes add only their runner
to that manifest (435 files), with SHA-256
`44418ee9855f12f4c38a9ba75a96423e2adaa7a97980825bf5a7ebcec6ee5159`.
No layout or physics tuning occurred. The hook-observer regression compares every
production tick, measurement, event and RNG state through a precursor and birth.
`npm run check` passes 1,329 tests, one existing skip, plus the isolated performance
test. `npm run build` passes with the existing large-bundle and lattice import
advisories. All recorded matrix/probe source inputs and matrix report hashes were
verified, with no mismatches. `src/ship/sensors/` matches 3C's `8a1713b` unchanged.

Remaining admission gaps: real precursor visibility/detection and warning margin;
funnel response inference and issued forecasts; continuous rotating/deploying
hull clearance; field work accounting; whole-session restoration; and real
late/branch/cross-transfer arrivals. The production `seen` flag currently marks
all precursors, without an optical visibility test. It is not detection evidence.
The existing generic hull-clearance number covers bodies, not all funnels.

## Historical static-field baseline — checkpoint `0eccbc4`

**Execution completed; encounter admission remains incomplete.** These runs use
3E's existing `runFlight(flight, setup)` with the real game, ship, recorder and
resource metrics. They do not replace dynamics or install missing game events.
All findings below are scripted measurements, not a human playtest.

## Reproduce

```
npm run harness -- --help
node src/content/inverse-wells/admission-runner.mjs list
node src/content/inverse-wells/admission-runner.mjs all
node src/content/inverse-wells/admission-runner.mjs s22-22000-negative-y
```

The published `npm run harness` CLI selects C02 suites only; it has no encounter or
custom-provider argument. This content-owned adapter calls its exported runner
without modifying `tools/harness/`. Reports are under `admission-reports/`, one JSON
per case, with exact controls, executed commands, source/content SHA-256 manifest,
resource and acquisition metrics, state/record hashes, and explicit missing coverage.
The base revision is integrator `1f0dfef`; the manifest includes this uncommitted-at-run
adapter and synchronous view registration. Outputs and Markdown are excluded from
the source fingerprint. A report is refused if source changes during its flight.
The adapter and reports were committed in `0eccbc4`. They remain historical evidence
for that source manifest: the later R36 camera implementation and fresh-arrival
stream initialization change the source/state fingerprint. Live camera acquisition
was not wired into these runs; rerun after 3C's dispatcher and the light producer land.

[DEMONSTRATED: `admission-reports/replay.json`] All 22 flights were run twice.
The complete result objects match exactly, including metrics, executed controls,
physical-state hashes and acquired-record hashes. The only source change between
passes was making the runner's Node `URL` import explicit for ESLint; physics,
controls, content and harness inputs were unchanged. The final report source hash is
`7c354c371ebeac1a8fded26ed796535478f0531ce5454fc41b5410903c5b4402`.
This is deterministic full-flight repetition, not midflight session restoration.

Verification: `npm run check` passed 1,136 tests, one existing skip, and the isolated
performance test; `npm run build` passed. Normal field-plugin registration also
passed the 15 focused view tests. The build retains large-bundle and lattice-plugin
dynamic-import advisories; the wells plugin no longer uses a deferred import.

## Protocol

[ASSUMED] Every case is an independent entry, never a live teleport or branch
transfer. All seven S22 catalogue seeds retain their authored geometry and arrival.
The noise seed is `s22-admission/<catalogue-seed>`, shared by paired controls.

[ESTABLISHED: S22 controls] The nominal commands deliver a sixteen-second full main
burn toward local ±y at 600 s. [ASSUMED: 2G/2F turn helper] The turn starts at 120 s,
providing the existing 480 s allowance. The game resolves the
inertial direction with roll held; the actual RCS must perform the turn. Five
seconds after the scheduled burn end, a production rate command nulls angular motion. No attitude
or velocity is overwritten. The runs stop on an outcome or at 36,000 s (ten hours),
at the provider's actual one-second gameplay tick.

The script knows the geometry and direction. It is an author feasibility probe,
not evidence that a player inferred a well rule. S22's ideal delivered-force
trajectory is not substituted for the actual ship flight.

## Nominal catalogue results

[DEMONSTRATED: the fourteen `s22-<seed>-negative-y/positive-y.json` reports]
Ten flights reached the forward destination. Four remained in progress at ten
hours; a missed window does not prove they can never reach it.

| Catalogue seed | −y outcome / stop (s) | +y outcome / stop (s) |
| --- | --- | --- |
| 22000 | In progress / 36,000 | Forward / 25,881 |
| 22005 | Forward / 16,921 | Forward / 15,410 |
| 22011 | Forward / 15,672 | Forward / 16,087 |
| 22015 | Forward / 18,538 | Forward / 19,011 |
| 22017 | Forward / 21,807 | Forward / 21,629 |
| 22020 | In progress / 36,000 | Forward / 21,861 |
| 22029 | In progress / 36,000 | In progress / 36,000 |

Each nominal flight consumed **122.365946 kg main**, and **0.556209–0.584019 kg RCS**.
All stayed below the 1,000 kg / 30 kg targets, with no reported resource/thermal
failure. This is measured use, not admission: routes with incomplete outcomes or
unmeasured field contact do not pass because their propellant totals are small.
Power, reactants, storage, heat, condition and unserved impulse remain in each JSON.

## Controls and sensitivities on seed 22000

[DEMONSTRATED: the named JSON reports]

| Case | Outcome | Main (kg) | RCS (kg) |
| --- | --- | ---: | ---: |
| `coast` | Entrance-body collision at 1,764.297 s | 0 | 0 |
| `axial-away` | Entrance-body collision at 1,621.817 s | 122.365946 | 0.676721 |
| `cutoff-abort` | Survives the 3,600 s window | 61.182973 | 0.556209 |
| `worn-negative-y` | Forward at 24,967 s | 85.656162 | 0.574286 |
| `worn-positive-y` | Forward at 23,102 s | 85.656162 | 0.577530 |
| `delayed-negative-y` | In progress at 36,000 s | 122.365946 | 0.556209 |
| `delayed-positive-y` | Forward at 22,946 s | 122.365946 | 0.574749 |
| `model-negative-y` | In progress at 36,000 s; no model error | 122.365946 | 0.556209 |

[ASSUMED] Worn means main/RCS condition 0.7; the pulse is not lengthened. Delayed
means both turn and burn occur 300 s later, not a late expedition arrival. The
abort cuts the nominal negative-y burn off after eight seconds. Its 2,937 bearing
and 2,937 range packets demonstrate continued entrance-reference acquisition in
that one-hour window, not acquisition of a precursor or unlimited safe transit.

The ordinary-model case enables the real recorder/model instead of the navigator
stand-in. It records 72,000 accelerometer packets and 35,264 each of bearing/range
packets, with no reported model error. **It issues zero forecasts**: `runFlight`
does not schedule forecast requests for these manual commands. It establishes
neither forecast recovery nor held-out rule adoption or a carried-only comparison.
No case records a funnel-contour observation.

Wear changed the route, including reaching the exit where the nominal −y control
did not. These are sensitivities of fixed author controls; they do not establish
that wear is beneficial or that a supported arrival envelope is robust.

## Limits that prevent admission

- **R30 / 2F:** this baseline holds 1,951 initial funnels active and 650 scheduled
  sites pending. It does not apply births, precursor warp policy, saved lifecycle,
  all-throat structural loss or field work ledgers. Do not attribute route misses
  solely to finite turns or use these runs to retune the approved S22 field.
- **Clearance:** 3E's `wholeFlightSweptMinimumMeters` measures bodies/asteroids.
  Here that is the single entrance-reference body. It is **not** clearance against
  all funnels. The two negative controls die through ordinary high-speed body
  collision; they do not validate structural loss at every active throat.
- **R31/R32:** visible/acquired funnels, precursor detection and a fitted response
  model are absent. Camera packet counts refer to the entrance body, not the field.
- **3D:** actual continuous late arrivals, both branch orders and the exterior
  N03 connector need frame/state transfer. No region transition or refill was faked.
- **3E:** the runner needs per-tick authored field evaluators and final kinematics,
  plus forecast/procedure schedules and acquired evidence export for these cases.
  Expose the content-owned cases through the CLI; retain the same game/recorder/model.

Rerun this matrix after the shared integrations land. A runtime `completed`
objective under this partial field is not a complete A19 survival certificate.
