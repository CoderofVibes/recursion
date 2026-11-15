# src/theme — how Recursion looks

Owner: the control-room thread (2D), which took over the UI lane from 1E. Other threads read
from here and never edit it (Convention 11).
Direction and rules: [docs/design/visual-direction.md](../../docs/design/visual-direction.md).
Belief side (P11): nothing here may import truth or the simulation.

## Three entry points

| Import from | What you get | Pulls in |
|---|---|---|
| `src/theme/index.ts` | Tokens as plain data: `colour`, `opacity`, `type`, `space`, `surface`, `instrument`, `line`, `dash`, `hatch`, `motion`, `render`, the 3D style tables, the room (`roomSurface`, `roomFinish`, `roomLights`, `roomBloom`, `roomDressing`, `outsideStyle`, `lossSequence`, `roomMotion`), the holograms (`holoLines`, `holoWire`, `holoSize`, `shipWire`, `mapLines`, `mapWire`), the overlays (`hud`, `hudSurface`, `hudMotion`, `hudOpacity`), `cssVariables`, `applyTheme()`, `hex()`, `rgba()` | nothing |
| `src/theme/components/index.ts` | Instrument primitives: `Panel`, `LevelBar`, `Gauge`, `Trend`, `Readout`, `ReadoutGrid`, `Schematic`, `SchematicBox`, `ComponentRow`, `ComponentList`, `ModeChips`, `Toggle`, `Alert`, `AlertStack`, `BlackBoxMark` | React, the stylesheet |
| `src/theme/three/index.ts` | Material builders: `LineKit`, `lineMaterial`, `wireMaterial`, `envelopeGeometry`, `envelopeMaterial`, `planeMaterial`, `setPlaneCoverage`, `planeVeilMaterial`, `holoPlaneMaterial`, `setHoloPlane`, `bodyMaterial`, `rockMaterial`, `setSun`, `latticeMaterial`, `wellLineMaterial`, `wellColour` | three |

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
- The stylesheet upper-cases names (labels, component names, alert text, chips). Keep units and
  Greek letters in values and details, or "km" becomes "KM" and σ becomes Σ.
- In CSS of your own, use the `--rx-*` custom properties, never a literal colour or size.
- For 3D, build materials with the builders, keep a `LineKit` per view, call `setResolution` on
  resize and `setPixelsPerUnit` every frame so dashes keep their rhythm on screen.

## The control room

The room, its holograms and the overlays laid over them take their look from here too
(DECISIONS A8). Layout (where things are, camera poses) is in `src/view3d/room/layout.ts`.

| File | Decides |
|---|---|
| `room.ts` | Surfaces, finishes and lights of the compartment, the loss sequence's timings, walking speeds |
| `dressing.ts` | The set dressing: wall screens, plates, lamps, seats |
| `three/holo.ts` | Hologram line styles, wire opacities and sizes (the volume's radius, how far back the ship sits) |
| `three/holo-plane.ts` | The hologram's reference plane: grid, coverage, hatch where nothing is sensed |
| `three/ship-holo.ts`, `three/map-holo.ts` | The ship drawing's and the map's own styles |
| `hud.ts` | Overlays: margins, column widths, key caps, the cursor, plate surfaces, glows, timings |
| `motion.ts` | `maxDisplayTurn` (time warp never spins a display), `coastForecastDelay` |

The overlay stylesheets (`src/app/control-room.css`, `src/console/console.css`) hold no literal
colour, pixel size or timing; `src/console/console.test.ts` fails if one appears.

## The UI lab

`npm run dev`, then open `/src/theme/lab/index.html`. It shows every primitive on the contract
fixtures, every status and tone, the 3D materials on the fixture snapshot, and the tokens.
Dev only; it is not part of the production build.

## Missing something?

Build it in your own folder on the tokens and list it under Requests in your handoff. The UI lane
adopts what fits.
