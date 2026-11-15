# S22 — appearing funnels and visible evidence

## A pattern that can be learned

[ASSUMED] Reserve all 2,601 site volumes when the run is created. Of these,
1,951 begin active and 650 are dormant (`id>0` and `id mod 4=0`). Dormant volumes
are included in separation checks from the outset. They exert no force, reverse
no thrust and have no crush. No site is created in response to a player's turn.

[ASSUMED] The catalogue lays out nine longitudinal ranks. A dormant site's
nominal birth is `runEpoch + 1200 + 600*(rank mod 3)` seconds. Its precursor
begins exactly **900 s earlier**. Three ranks share each of the three phases;
the field fills in a spatial wave. The same phase relationships and precursor
duration hold in every run; seeded geometry changes the locations and axes.
Use the continuous run epoch, never time since opening FLIGHT, observing the
site, loading a save, or entering a map volume. A late arrival may see an
already established field. These particular arrival-time certificates cover
the supplied epoch; late arrivals need recertification.

[FICTIONAL] The precursor is visible electromagnetic emission: faint contour
arcs and meridians condense along the future funnel, with brightness increasing
monotonically as `S((t-t_precursor)/900)`. This is a proposed source of photons,
not a new gravimeter or remote accelerometer. It has no pull. The navigation
camera sees the angular arcs through its normal exposure, FOV, smear, power,
occlusion and condition limits; the player's eyes can see sufficient light
through the window without recording it. No high-frequency flashing or random
flicker is needed. Broad brightening and successive contour completion make
the phase recognizable.

[ASSUMED] At nominal birth, evaluate this **truth-side** safety condition:

```text
B = hypot(62500,20000) = 65622.023742 m
a_max = (24000 + 40*200 + 0.236)/24000 + 0.10
guard = |shipCOM-siteCentre| - B - currentHullRadius
        - |shipVelocity|*240 - 0.5*a_max*240²
activate only if guard > 0
```

This is stronger than “not currently inside.” Every possible controlled
trajectory over the following 240 s stays outside the reserved enclosing ball,
under this source-free acceleration bound. Thus no ship part is inside the
funnel, band or throat at birth, and no immediately unavoidable new contact is
introduced. A faster arrival increases the guard distance automatically.
Added bodies or forces require a new acceleration bound. The current actual
hull must replace the study's 20 m bound.

[ASSUMED] If the condition fails, **cancel that site's birth for this run**;
its precursor fades and it stays dormant. Do not retry next tick, move it ahead
of the ship, chase a bypass or activate as soon as the player turns away.
The observation “this pattern did not complete” remains a record, not a promise
that all precursors always succeed. The interaction rule is the same on each
run: occupancy inhibits formation. The optional state dependence preserves P2:
same seed, state and commands produce the same inhibition. Persist the due
cursor and active/cancelled state in saves; don't re-evaluate past births on
reload. A cancellation does not relocate a core or create a new gap elsewhere.

[FICTIONAL] An allowed birth ramps `w` by `S((t-t_on)/120)` over **120 s**, then
stays active. The crush sphere becomes active at birth; the stronger guard
already excludes it for at least 240 s. No collision object may exist at a
dormant site. No funnel switches off beneath the ship. Force-law constants,
length and radii never change between runs.

[DEMONSTRATED: `vectors.json.popup`] A site at `(320,0,0) km`, with axis `+z`,
precursor at 300 s and birth at 1,200 s passes the guard for a ship at
`(100,0,0) km`, moving 40 m/s: **103.478 km guard margin**. A ship at the site
centre vetoes birth; so does the 1,000 m/s version of the distant approach.
The negative many-funnel crossing later encounters a previously dormant site.
All births along both nominal field routes pass the guard; the full event tape
is retained in the vectors.

## The window: the showpiece is real light

[ASSUMED] Adapt 1E's [contour rings and long throat](../../design/visual-direction.md#65-wells-brief-7-fictional),
preserving the long narrow silhouette and meridians. A19/A11 supersede the old
below-plane placement and invisible instrument-glyph interpretation. Funnels
point sideways, toward the viewer, away, above and below. The closest mouth can
span the window while distant slanted throats cross it at much smaller angular
sizes. Use real projection and occlusion to convey the field's scale.

[ASSUMED] A few strong nearby silhouettes and many dim distant forms will read
better than thousands of equally bright wireframes. The broad mouth is sparse;
rings tighten and become denser down the quadratic taper. The throat is narrow
and luminous. At birth, the faint incomplete precursor becomes a continuous
form over the same 120 s physical ramp. The temporal appearance must match the
simulated phase, including an inhibited birth, without revealing the ship's
truth-side guard computation.

[FICTIONAL] The active shape emits light without needing A3 sunlight. This does
not authorize an unmodelled thermal load, charging source, damage beam or lensing
force. Rings can be persistent luminous structure; material does not need to
orbit them. If moving dust is later used to demonstrate capture/crush, it must
be advected by the same pull, not a cosmetic animation contradicting dynamics.

[ASSUMED] The game optical adapter supplies **angular contour segments and
brightness/phase only** to the window renderer. No exact range, length, hidden
site list, response coefficient or lethal radius travels through that product.
The eyes do not require a camera power allocation. This is consistent with
`WindowView`'s existing light-only semantics, but its body/asteroid union needs
the integrator's funnel extension. P11 still forbids truth imports in view code.

## FLIGHT: what seeing it establishes

[ESTABLISHED: `data/ship-baseline.json`, `sensing.camera`] The camera's FOV is a
cone with half-angle 30 degrees. Unknown-size targets yield bearings; range
from apparent size is allowed only for an explicitly justified size prior.
Seeing a funnel on the window does not silently give the camera omnidirectional
tracking or a solved distance.

[ASSUMED] Extract mouth/throat/contour bearings with times, angular covariance,
quality, source image IDs and sensor calibration. With sufficient baseline and
attitude/navigation support, triangulate endpoints and fit an uncertain 3D axis,
length, radii and taper stations. In one image, a small nearby funnel and a large
distant funnel remain ambiguous; an almost end-on funnel also leaves axis and
length poorly constrained. Preserve those correlations. A fixed physical size
across runs is a law parameter, not permission to hand the model a true size
before observation or an explicit player prior.

[ASSUMED] A useful precursor acquisition target is adequate signal at **350 km**,
two views at least 30 s apart, and retained observations at least **600 s before
nominal birth**. These are content acceptance targets, **not demonstrated camera
sensitivity**. At 40 m/s a transverse 30 s baseline is 1.2 km; mostly axial travel
may provide much less useful parallax. A player can point, take a sideways
baseline or hold uncertain depth. Exposure/brightness must be tuned by the real
camera pipeline and a human playtest. Admit a release seed only if precursor
coverage and a reachable reaction are actually demonstrated with its illumination,
occlusion, camera schedule and incoming equipment condition.

[ASSUMED] FLIGHT uses only the fitted `WellFunnelVisual`-style data already being
prepared by 3B: measured mouth, axis, stations and their uncertainties; current
frame/run and observation lineage; precursor/active/unresolved phase; freshness.
Use violet phenomenon contours, warm measured tracks, cool frozen forecasts
and orange archived evidence through existing theme tokens. Draw uncertain
contour ribbons and incomplete forms where data are missing. Never fill all
2,601 sites into the hologram from `field.json`.

[ASSUMED] Separate appearance from inferred action. A visible axis supplies a
candidate direction; coast tracks establish pull, IMU/command/attitude records
establish reversal, boundary-bracketing burns establish the smooth band, and
retained encounters with the throat establish danger/support. Visual narrowing
is a clue the player may interpret; it is not an automatic model-rule adoption.
Both predicted and measured acceleration arrows must say which signal they
represent: the IMU does **not** show the coasting pull.

[ASSUMED] Keep the issued forecast frozen. A newly observed precursor can
invalidate its assumptions and prompt a new player-requested forecast; it cannot
silently patch the old path. Forecast unsensed time-dependent influence as
unknown, never as guaranteed empty space. The model forecasts a player's
maneuver, never chooses the opening or steers toward an escape corridor (P6).

[ASSUMED] Hinge now samples the tapered **side or mouth cap**, not a 45 km sphere.
At a half-weight boundary, axial thrust cancellation competes with a continuing
half-strength pull. Preserve transverse motion before the experiment, so a null
axial response cannot strand the ship. 4A must rewrite its local geometry and
retest the continuous approach; the old Hinge vectors are regression fixtures
for the historical spherical law only.
