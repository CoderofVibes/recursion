# src/theme — how Recursion looks

Owner: 1E, the owner's UI lane. Other threads read from here and never edit it (Convention 11).
Direction and rules: [docs/design/visual-direction.md](../../docs/design/visual-direction.md).
Belief side (P11): nothing here may import truth or the simulation.

## Three entry points

| Import from | What you get | Pulls in |
|---|---|---|
| `src/theme/index.ts` | Tokens as plain data: `colour`, `opacity`, `type`, `space`, `surface`, `instrument`, `line`, `dash`, `hatch`, `motion`, `render`, the 3D style table, `cssVariables`, `applyTheme()`, `hex()`, `rgba()` | nothing |
| `src/theme/components/index.ts` | Instrument primitives: `Panel`, `LevelBar`, `Trend`, `Readout`, `ReadoutGrid`, `Schematic`, `SchematicBox`, `ComponentRow`, `ComponentList` | React, the stylesheet |
| `src/theme/three/index.ts` | Material builders: `LineKit`, `lineMaterial`, `wireMaterial`, `envelopeGeometry`, `envelopeMaterial`, `planeMaterial`, `setPlaneCoverage`, `planeVeilMaterial`, `bodyMaterial`, `rockMaterial`, `setSun`, `latticeMaterial`, `wellLineMaterial`, `wellColour` | three |

## Using it

```tsx
import { applyTheme } from '../theme/index.ts';
import { LevelBar, Panel, Trend } from '../theme/components/index.ts';

applyTheme(document.documentElement); // once, at the root: defines the --rx-* tokens

<Panel title="Power" statusLine="Fuel cells following">
  <LevelBar label="Main bus" value={4211} max={7500} text="4,211 / 7,500 W"
            marks={[{ at: 6000, kind: 'caution' }]} />
  <Trend title="Range" unit="km" value="145.0" data={measured} forecast={predicted} forecastBand={twoSigma} />
</Panel>
```

- Primitives take plain numbers and strings. The console decides what to show; the theme decides
  how it looks.
- `status` is what a reading means (`nominal`, `caution`, `warning`, `off`, `stale`). An alert
  always carries its shape (▲ ■) as well as its colour. Stale and off readings are hatched.
- `tone` is what kind of information it is: `measured` (warm ink), `forecast` (teal) or
  `blackbox` (orange).
- In CSS of your own, use the `--rx-*` custom properties, never a literal colour or size.
- For 3D, build materials with the builders, keep a `LineKit` per view, call `setResolution` on
  resize and `setPixelsPerUnit` every frame so dashes keep their rhythm on screen.

## The UI lab

`npm run dev`, then open `/src/theme/lab/index.html`. It shows every primitive on the contract
fixtures, every status and tone, the 3D materials on the fixture snapshot, and the tokens.
Dev only; it is not part of the production build.

## Missing something?

Build it in your own folder on the tokens and list it under Requests in your handoff. The UI lane
adopts what fits.
