# Acquired and visible well geometry

**A19 supersedes the spherical shape.** Physical funnels use `well-funnel-observation-v2`.
The old `well-observation-v1` parser/renderer remains solely for S5/S16 fixtures and their
reference comparisons. A v2 payload never falls back to the old spherical drawing.

## A19 FLIGHT and console

The proposed `WellFunnelVisual` in `funnel.ts` carries acquired lineage, current frame,
support, freshness, visible precursor/active phase, and measured mouth position, unit axis
toward the throat, length and mouth/throat radii with uncertainties. Its ordered contour
stations must include mouth and throat. Missing profile stations or dimensions have no
defaults. Seeing a shape does not supply its pull, reversal, or crushing rule.

`orientedFunnelGeometry` produces local contour geometry; `makeFunnelView` positions it at
the measured mouth and rotates local +y toward the measured throat. It joins only supplied
stations without choosing S22's physical taper or force profile. `funnelUncertaintySegments`
draws uncertainty around those same stations, never spherical field boundaries. The normal
`makeWellView` registry entry automatically dispatches validated v2 data to this renderer.

[ASSUMED] Uncertainty guides use the theme's two-sigma multiplier and add common position,
radius and small-angle axis uncertainty. These are guides, not a certified whole-ship
clearance test. Stale data retain dim contour guides; unresolved/archived data are hidden.
The producer owns freshness. All styling uses existing theme tokens; no onset duration,
special lighting or field parameter is invented while S22 is pending.

The existing `WellEvidencePanel` now displays v2 mouth/throat/length/axis estimates and
observed phase separately from retained motion-response comparisons and model rule status.

## A19 window: angular light only

`WindowFunnelVisual` / `readWindowFunnelVisual` propose `well-optical-v1`: `observedAt`,
`visible`, observed precursor/active phase, and contour segments containing two inertial
unit rays plus a colour-depth coordinate. There is no range or physical size.

`makeOpticalFunnelView(group, displayRadius)` exposes `update(opticalPayload, t)` and
`dispose()`. The window owner supplies its presentation shell radius; it is not a measured
distance. Missing, occluded or old eye frames hide the shape. Fitted FLIGHT geometry is never
substituted for sight. Pass `t` from the same instantaneous optical frame as `observedAt`.

## A19 owner requests (handoff R4/R13)

- **Integrator / 2C / game:** agree and promote the typed v2 observation/support schema into
  contracts and produce it from camera observations and retained motion experiments. Keep
  prior-run coordinates archived and preserve ordinary/candidate/adopted versions.
- **Integrator / 2F:** extend `WindowView` with an optional typed collection of visible
  `WindowFunnelVisual` records and stable visual IDs; supply per-eye-frame angular contours,
  occlusion and observed phase through the optical adapter. Existing `WindowView.objects`
  permits only bodies/asteroids and cannot carry this geometry. Do not send truth parameters
  or known range through the optical API.
- **2D / 3F:** mount `makeOpticalFunnelView` in the existing window scene using its shell/frame
  convention, and mount `WellEvidencePanel` for selected observed funnels. The FLIGHT plugin
  dispatches v2 automatically once its acquired payload arrives.
- **2D, exact hologram clipping seam:** `FieldViewFrame.inside(point)` is only a point
  predicate. `FlightHolo` does not otherwise clip plugin materials, so the funnel currently
  can extend beyond the projection volume. Supply
  `clipSegment(a: Vector3, b: Vector3): readonly [from: number, to: number] | undefined`,
  with endpoints in the existing environment/scene frame and return values in segment
  parameter space `[0, 1]`. Implement it beside `toHolo`/the projection volume so it uses the
  owner's exact boundary. It must handle both endpoints outside while the segment crosses
  the volume, tangency, and an endpoint inside. Also supply `clipRevision: number`, changing
  whenever that projection transform or boundary changes, so clipped buffers are reused
  safely. The plugin can then interpolate local endpoints/colours at those fractions without
  copying `FlightHolo` transforms or guessing its boundary margin. Do not cull a whole funnel
  solely because its mouth is outside: its throat or side can still enter the visible volume.
- **2D, shared line-material lifetime:** `LineSet` currently keeps disposed plugin materials
  in its private set until the entire view is disposed. Add automatic removal on a material's
  `dispose` event, or a public `release(material)` method that removes and disposes it.
  Repeated field removal/reappearance must not grow retained materials or per-frame dash
  update work. The plugin already disposes its geometry/materials; shared-set cleanup needs
  the owner of `src/view3d/gfx.ts`. No shared edits are made here.
- **Theme owner:** may adopt the local contour primitive and evolve A19's visual treatment;
  `theme/three/fields.ts` comments saying wells are invisible are now superseded.

[DEMONSTRATED: funnel.test.ts and panel.test.tsx] Headless checks cover malformed axes/profile,
arbitrary orientation, physical contour rendering, data-driven precursor transitions,
stale/unknown/archive suppression, angular-only optics and no range inference. These are
not a browser playtest or evidence that S22 physics/layout are complete.

[DEMONSTRATED: funnel.test.ts] Accepted rounded axes/rays are normalized before quaternion
rotation or shell placement, including an almost antiparallel axis. Pose-only tracking updates
reuse local contour and uncertainty buffers; an uncertainty-only update rebuilds the bounds
without replacing the nominal contour. Exact projection clipping and shared material release
remain owner dependencies listed above.

## Legacy S5/S16 fixture behavior

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
