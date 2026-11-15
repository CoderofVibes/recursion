# src/view3d — the room and its holograms

Owner: 2D (control room), then 3F. Belief side: nothing here may import truth or `src/sim/` (P11, lint-enforced). `fields/` belongs to the sections that build encounters.

Everything on screen in three dimensions: the walkable control room (DECISIONS A8), what is outside its window, and the three holograms the console projects. It draws what it is given each frame, a `ViewSnapshot` and a chart, and reports what the player did. It holds no game state.

| File | Holds |
|---|---|
| `adapter.ts` | **The one place geometry is read from the game** (A11). Accepts the planar contracts and 2G's three-dimensional ones alike: positions, covariance, attitude, turn rates, sensor cones, hull outline, the chart (`chartView`). Game (x, y, z) maps to scene (x, z, −y). The two functions that build planar commands are marked `PLANAR` |
| `gfx.ts` | Drawing helpers on theme styles: `LineSet` (fat lines with dashes in screen pixels), one-pixel wireframes, hologram tags, canvas textures |
| `fieldViews.ts` | The field-plugin interface and registry (below) |
| `room/layout.ts` | Dimensions, console and hologram positions, the camera pose and room state for each view |
| `room/RoomView.ts` | The scene, camera, walking, the white-dot cursor, the four pads, view changes, the loss sequence back to the door |
| `room/shell.ts`, `dress.ts`, `textures.ts` | Walls, window, console, Black Box, lights; the set dressing; painted textures |
| `room/outside.ts` | The window: bodies and sunlit rocks against the stars, at their true angular size |
| `flight/FlightHolo.ts` | FLIGHT: the environment as believed and sensed, in 3D |
| `ship/` | SHIP: the vehicle as a three-dimensional technical drawing, one part per assembly, systems isolate |
| `map/` | MAP: only what has been charted |

## What the views mean

- **The window is the unaided eye; the holograms are the instruments** (A8, P11). The window shows what light shows, from the game's window channel (`ViewSnapshot.window`): directions and apparent sizes, the sun where it is, a body in shadow dark. A field never appears in it. A hologram shows only what the ship believes or senses.
- **FLIGHT** follows P10: the issued forecast is dotted and frozen, the measured trail solid. The envelope is a tube around the path whose sections are the 2σ ellipse of the forecast's 3×3 covariance across the path, with a ribbon in the reference plane; it is fainter and hatched where the model extrapolates, drawn distinctly inside a validated span (`ForecastSample.validated`, A5), and ends at a ring at the horizon. Nothing is drawn beyond it. The stretch of the issued forecast the ship has already flown is drawn as past, quieter (A18: a forecast describes its plan from the moment of commitment, and time runs while it is worked out).
- **Rocks.** Tracked rocks are bright, carry the forecast's track and closest-approach marks. Rocks that are only seen are dim, sit where they are believed to be with a ring of 2σ, and are never drawn as if forecast. A rock the ship has never catalogued is not drawn.
- **The ship** in FLIGHT is a large symbol set back toward the player. Its true position is the ring at the centre of mass; its true hull is drawn there at true scale. Thrust is drawn at its points of application with its line of action.
- **Coverage.** Each sensor's field of view is a cone from the ship. The reference plane reads three ways:
  - tinted where the ship senses now;
  - plain where it sensed earlier: in this attempt (`flight/coverageHistory.ts` remembers each sector where the ship was), and near this moment of earlier attempts (`ViewSnapshot.coverageEarlier`, from Black Box); the hatch returns as the look ages;
  - hatched where it has not looked.
- **Depth.** A level reference plane passes through the ship; anything off it carries a stalk to it. Heading-up follows the ship but never turns faster than `motion.maxDisplayTurn`, so time warp cannot spin the display.

## Field view plugins

An encounter's own phenomenon (a lattice, a well) is drawn by a plugin in `fields/<kind>/index.ts`, owned by the section that builds that encounter. Every such file is loaded when the flight view starts; nothing else needs editing.

```ts
// src/view3d/fields/lattice/index.ts
import { registerFieldView } from '../../fieldViews.ts';
import { latticeMaterial } from '../../../theme/three/index.ts';

registerFieldView('lattice', ({ group, lines }) => {
  // Build once. `group` is in the environment's frame: scene axes (game x, z, −y), game metres.
  const material = latticeMaterial();
  return {
    update({ field, snapshot, scale, radius, inside, dt, time }) {
      // `field.visual` is what the game layer says the ship perceives. Draw only that.
    },
    dispose() {
      material.dispose();
    },
  };
});
```

- A plugin is created when its field (`BelievedField.kind`) is first `detected` and disposed when it stops being detected. An undetected field never reaches a plugin.
- `group` is scaled, turned and placed by the hologram. Clip to the projection volume with `inside(point)`.
- Take every colour, opacity and line style from `src/theme/` (Convention 11). `lines` makes fat lines whose dashes stay in screen pixels.
- `dt` and `time` are real seconds: time warp never speeds up interface motion.

## Tests

`adapter.test.ts` (planar and 3D shapes read to the same result), `flight/flight.test.ts` (the hologram on the contract fixtures, alerts from the issued forecast, plugins), `ship/ship.test.ts`, `map/map.test.ts`.
