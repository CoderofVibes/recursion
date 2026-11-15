# P03 — Well Garden

`createInverseWells(seed, options)` returns the existing `EncounterSetup` shape plus
`fieldRegistry`, `exits`, `contentVersion` and `contentStatus`. The registry uses the
existing `src/contracts/truth/fields.ts` contract. **The default is a labeled mechanics
preview, not S16's final placement or a claim that wells are unavoidable.**

## Loading agreement

The integrator approved the provider/registry shape through the owner in the 3B chat
(2026-11-14). 2F is to select `?encounter=inverse-wells`, isolate its save slot by
encounter/seed/content version, and pass `setup.fieldRegistry` to `createSimulation`.
2F must wait for 2G's speed pass to release `src/game/truth-step.ts`. Until then the
tests instantiate the registry directly, as the owner requested. Do not bypass the
game's recorder/model or build a second app loop.

`exits` describes finite physical regions leading to P04 and N03. Their briefing
objectives use the existing `reach-region` kind; 2F still needs a matching truth
objective rule. `objectiveRules` is empty until that rule lands, so this checkpoint
does **not** claim that the app can complete the encounter.

## Inputs and continuity

- `options.layout`: S16's authored static layout, keeping the approved 40/50 km
  smooth spherical profile and 1 km solid cores. Separated influence volumes are
  validated for the entire flight. Cores are zero-GM solid obstacles, not new gravity.
- `options.entrance`: `power` or `cross-transfer`, for standalone admission fixtures.
- `options.arrival`: the actual surviving ship, its definition and the acquired arrival
  briefing, already transformed
  into the layout's inertial frame by the expedition owner. The object, its epoch,
  fuel, heat, wear, faults, pending burns and RNG are preserved, with no arrival commands.
  Continuous game-session epoch/frame integration remains 2F/3D work.
  In particular, the current session numbers its commands/records from zero; only
  direct truth-step/registry use is valid for a nonzero-epoch arrival at this checkpoint.

The preview's geometry is fixed across seeds; only its survey and sensor noise vary.
S16 must supply the admitted A10 geometry variants and independent traversal vectors.
The standalone arrival briefing contains a noisy optical survey of the ordinary reference body, never a
well's invisible influence, response coefficients or an adopted rule. A new briefing
survey is an explicit standalone-fixture assumption; an expedition transfer requires
the arrival evidence actually acquired in transit. Its briefing must match the encounter
ID and actual arrival epoch and is preserved unchanged.
Static massless cores remain uncharted optical objects: the current navigator would
incorrectly propagate a second known body as an orbiting secondary. Fixed-landmark
support is requested from 2C/2F; no gravity or well geometry is fabricated to avoid it.

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

[DEMONSTRATED: `inverse-wells.test.ts`] The comparisons record the selected radial,
tangent, outside/coast and near-zero responses. The field supplies no propellant,
power or heat credit, and worn engines deliver reduced authority. Both standalone
entrance fixtures preserve a supplied damaged ship unchanged. These are numerical
checks, not human playtests or complete branch-route flights.

## Remaining acceptance

S16's layout, independent routes/seeds/bypass results; 2F loading and physical exits;
integrator collision/boundary/work chronology; 2C region-response fitting, acquired
geometry and independent experiment lifecycle; 2D/3F panel mounting; and 3E's
informed/stale/abort/cross-transfer flights remain separate dependencies. See the
exact requests in `docs/handoffs/3B.md`. No adopted-rule flag blocks a physical route.
