# Lattice evidence display

`index.ts` registers `lattice` with the existing FLIGHT plugin loader. Registration uses a
dynamic import because Vite eagerly imports plugins while the registry module is initializing.
`makeLatticeView` is also available directly. No field appears in the window.

The input is `BelievedField.visual`, validated by `readLatticeVisual` against
`lattice-observations-v1` in `data.ts`. The game/Black Box adapter must supply the current
attempt and relative-navigation frame, retained sample lineage, acquisition intervals,
uncertainty and validity. It must not put an unaligned previous attempt in that frame.
The view never receives the truth registry, lattice layers or complete true mesh.

Supported fragments reveal once along their recorded connected support. Refreshing an
existing fragment does not erase it or restart the reveal. Confidence rings use the S17
three-sigma joint bound; shared vertices are drawn once without shrinking their uncertainty.
Expired geometry stays dashed. The current ship and deployed envelope remain the flight
hologram's measured `ShipView`; the optional threat mark names the first exposed component.
All geometry is clipped analytically to the spherical hologram, including fragments whose
two endpoints lie outside but cross the volume.

Unobserved volume stays cross-hatched. Fitted corners alone never remove hatch. A
`clear-supported` patch needs an explicit calibrated coverage certificate, including
resolution, undetected-support bound, joint confidence and retained lineage. Missing or
expired certification is unresolved. Hatch cells disappear only when wholly contained by
a current supported patch, so partial coverage cannot create a false gap. The lattice sensor
currently supplies angular fragments and unresolved coverage; its data alone cannot provide
such a certificate or an opening-clearance claim. Reconstruction and detection qualification
remain 2C/integrator interfaces.

Theme tokens supply every visual style, colour and motion duration. The periodic
`latticeMaterial` sheet is deliberately unused: applying it to a partial observation would
invent unseen repeating cells. This local renderer's core/halo, hatch and confidence-ring
composition can be adopted by the theme owner.

## Visual verification

Run the existing development server, then open
`/src/view3d/fields/lattice/preview.html`. `?frame=18` and `?frame=108` start at the two
captured prefixes. This is an explicitly labelled, authored **display fixture**, not a flight
or a claim of successful reconstruction. It runs the real Three.js renderer and panel.
The retained fragments remain separate from calibrated empty-space coverage: the fixture
deliberately certifies no opening.

`preview-acquiring.png` and `preview-resolved.png` were captured from installed Chrome over
DevTools at 1600×1000, using the existing S15 isolated-profile helper, without installing
anything. No JavaScript runtime exceptions occurred. The captures show partial and complete
fragment display, both with unresolved volume. The latter filename refers to fragments,
not to certified safe passage. Visual review reduced excessive glow using existing tokens.

`lattice.test.ts` checks malformed/unsupported evidence, missing certificates, stale/future
coverage, conservative partial coverage, incremental fragment support, clipping and disposal.
It does not establish sensor association, navigation covariance or encounter playability.

## Owner integration

- **2C:** publish retained, fitted fragment support and qualified coverage through the DTO;
  preserve issued versions for frozen forecasts. No DTO should be manufactured from truth.
- **2D/3F:** mount the companion `ChainLinkPanel` and wire `latticeModeCommands` to commands.
  Pass actual service/recording telemetry, never requested watts as delivered watts.
- **2D/3F:** allow an encounter-specific near-field range. The existing FLIGHT minimum of
  5,000 m makes S17's 80 m openings and ship appendages too small for practical threading.
  This plugin keeps real physical scale; it does not enlarge openings to hide that limit.

A smaller version with a complete luminous sheet would lose the central discovery: a player
could see an unsensed gap. A centre-point marker would lose the reason to care about deployed
parts. Omitting volumetric hatch or stale geometry would turn missing evidence into apparent
clearance. Omitting the progressive reveal and uncertainty would lose both the first-contact
spectacle and the instrument's credibility.
