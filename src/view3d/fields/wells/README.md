# Well observations in the flight hologram

`index.ts` registers `inverse-well` through the existing eager field-plugin loader. Nothing
is drawn until a detected `BelievedField.visual` passes `readWellVisual`.

The local `WellVisual` v1 payload is a proposed transport contract for 2C/game. It contains
only fitted geometry, measurement lineage, experiment ownership and model support. It does
not accept a field's truth `params` or supply default 40/50 km radii. The producer must derive
every value from recorded observations and mark old-run coordinates `current: false`.
The producer also owns the geometry freshness deadline. A stale estimate keeps dashed,
dimmed bounds; unresolved or archived coordinates have no current-flight surface.

[ASSUMED] Bounds use the theme's two-sigma convention and add the common centre-error bound
to local radius error. These are uncertainty guides, not a whole-ship clearance certificate.
[FICTIONAL] The narrow funnel is an instrument glyph, aligned to chart-up: its mouth width
is the estimated transition width and its depth the estimated outer radius. The physical
influence is represented separately by spherical bounds. The glyph is not an optical object
or a route. Materials, line styles, opacity, tessellation and render order come from theme.

## Owner requests

- **Integrator / 2C:** promote an agreed typed observation/support schema into contracts;
  generate this payload from the model's retained measurements, including both tangent
  directions and distinct completed experiments. Preserve the ordinary/candidate/adopted
  distinction. This plugin does not implement fitting or manufacture evidence.
- **2D / 3F:** mount `WellEvidencePanel` from
  `src/console/encounters/inverse-wells/index.tsx` for a selected detected field. It displays
  existing evidence only and never changes the game clock or adopts a rule.
- **2D / integrator:** the eager glob in `fieldViews.ts` creates an initialization cycle
  when the first plugin registers synchronously. This plugin registers in a module-init
  deferred import after registry initialization, and exports async `registerWellView`
  for explicit mounting. The flight view retries absent factories each frame.
  Prefer having the shared loader register exported factories to remove that cycle.
- **Theme owner:** may adopt the local funnel geometry primitive; existing well materials
  and tokens already supply its style.

[DEMONSTRATED: wells.test.ts and panel.test.tsx] Headless checks cover registration, malformed
or missing evidence, stale/unresolved/archive suppression, provenance conflicts, scene-frame
conversion and evidence readouts. These checks are not a browser or human playtest.
