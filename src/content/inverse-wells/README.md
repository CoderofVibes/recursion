# P03 — Well Garden

`createInverseWells(seed, options)` returns the existing `EncounterSetup` shape plus
`fields` (2F's shared seam), `fieldRegistry` (the direct-test alias), `exits`,
`contentVersion` and `contentStatus`. The registry uses the existing contract.
**A19 supersedes the spherical prototype.** The default currently remains S16's
seeded three-well reference fixture so its independent vectors stay reproducible;
it does not implement the corrected encounter. The owner requires visible, oriented
funnels, a coast pull, reversed propulsion and a crushing throat. S22 supplies the
law, field and precursor policy before content is replaced or tuned.
`MECHANICS_PREVIEW` remains an explicit isolated legacy control fixture.

The field module already supplies shape-independent reflection/edge helpers,
mouth-to-throat coordinates, conservative oriented bounds and a deterministic
spatial index. The acquired funnel and angular-only window renderers are ready in
`src/view3d/fields/wells/`. These foundations do not select a pull or crush law.

## Loading agreement

The integrator approved the provider/registry shape through the owner in the 3B chat
(2026-11-14). 2F is to select `?encounter=inverse-wells`, isolate its save slot by
encounter/seed/content version, and pass `setup.fields` to `createSimulation`.
`INVERSE_WELLS_ENTRY` supplies the ready entry for 2F's encounter loader: one stable
save namespace and a new deterministic geometry/noise seed for each run. 2F owns
adding it to `ENCOUNTERS`; 3B does not edit that outside its assigned paths.
2G's speed pass released `src/game/truth-step.ts` in main `83704bc`; 2F's loading
interface is consumed from main `7b01be8`, but registry injection is still pending.
The tests instantiate the registry directly, as the owner requested. Do not bypass the
game's recorder/model or build a second app loop.

`exits` describes finite physical regions leading to P04 and N03. The S16 forward
exit is an **outward disc**: `outwardNormal` is present. A spherical objective is not
an equivalent crossing test. 2F still needs the agreed truth rule. `objectiveRules`
is empty until that rule lands, so this checkpoint
does **not** claim that the app can complete the encounter.

## Inputs and continuity

- `options.layout`: an explicit legacy static layout, keeping the historical 40/50 km
  smooth spherical profile and 1 km solid cores. Separated influence volumes are
  validated for the entire flight. Cores are zero-GM solid obstacles, not new gravity.
- `options.entrance`: `power` or `cross-transfer`. S16 certifies only the power start;
  cross-transfer requires the actual surviving arrival. The old mechanics fixture
  retains both standalone test entrances.
- `options.arrival`: the actual surviving ship, its definition and the acquired arrival
  briefing, already transformed
  into the layout's inertial frame by the expedition owner. The object, its epoch,
  fuel, heat, wear, faults, pending burns and RNG are preserved, with no arrival commands.
  Continuous game-session epoch/frame integration remains 2F/3D work.
  In particular, the current session numbers its commands/records from zero; only
  direct truth-step/registry use is valid for a nonzero-epoch arrival at this checkpoint.

The default chooses from S16's 25 admitted mechanics candidates using an independent
named RNG stream. Centres, velocity and attitude rotate together; the external sun
does not rotate. `s16Layout()` selects the nominal reference; `s16Layout(16002)`
selects a specific admitted candidate. Seed 16000 is rejected by the content catalogue,
not by the force law. All 128 arrival certificates are port-tested. The field adds
no gravity source. One actual zero-GM core is the initial optical reference, with an
assumed uncertain `mu=0±1e4` prior; its mass is fitted from evidence. Other cores stay
uncharted until supported observations exist.

Source data are copied from committed S16 `b2f90bdfa56b207d5f390e93cc6ee06583f27bb6`
by `node src/content/inverse-wells/import-s16.mjs <commit>`. The compact runtime
catalogue is separate from the independent test vectors. Tests do not run or reuse
the Python solver. Preserve its empty gravity sum and finite exterior bypass.
The standalone arrival briefing contains a noisy optical survey of the reference object, never a
well's invisible influence, response coefficients or an adopted rule. A new briefing
survey is an explicit standalone-fixture assumption; an expedition transfer requires
the arrival evidence actually acquired in transit. Its briefing must match the encounter
ID and actual arrival epoch and is preserved unchanged.
Additional static massless cores remain uncharted optical objects: the current navigator
would incorrectly propagate a second known body as an orbiting secondary. General
fixed-landmark support is requested from 2C/2F.

## Reproducible checks

```
npm exec -- vitest run src/sim/fields/wells.test.ts src/content/inverse-wells src/view3d/fields/wells src/console/encounters/inverse-wells
npm run check
npm run build
```

`experiments.ts` supplies six truth-side controlled starts for 2C/3E: radial,
two independent tangents, outside, coast and the smooth-edge midpoint. The real
ship warms sensors for 60 s, fires a 10 s pulse and records through 85 s at 1 Hz.
These fixtures are not in-flight teleports or fabricated experiments. The test uses
production ship/environment/simulation APIs directly until 2F's registry seam lands.
All fuel, thermal and attitude comparisons pass through delivered actuator output.
The accelerometer currently reads the preceding simulation interval; do not fit
the first/last sample against a same-time command without 2C's interval treatment.

[DEMONSTRATED: `inverse-wells.test.ts`, historical spherical fixture] The comparisons record the radial,
tangent, outside/coast and near-zero responses. The field supplies no propellant,
power or heat credit, and worn engines deliver reduced authority. Both standalone
entrance fixtures preserve a supplied damaged ship unchanged. These are numerical
checks, not human playtests or complete branch-route flights.

## Remaining acceptance

2F loading and exact disc exit;
integrator collision/boundary/work chronology; 2C region-response fitting, acquired
geometry and independent experiment lifecycle; 2D/3F panel mounting; and 3E's
informed/stale/abort/cross-transfer flights remain separate dependencies. S16's
controls are constant delivered-force numerical probes, not real finite-turn/sensor
flight certificates. The upstream exterior bypass remains physically allowed. S22's
many-funnel/time-varying content must wait for its force, crush and onset/precursor
specification; physical orientation is settled by A19. See the
exact requests in `docs/handoffs/3B.md`. No adopted-rule flag blocks a physical route.
