# S23 — The opening

Show Earth at the far end of a Mars return, hold the console view for 2.8 s, then let the player feel the ship go out from under them. Give the window one brief, localized distortion as the ship fails. Cut to black at 7.15 s, bring in **RECURSION** at 8.00 s, and hand over the room in C01 at 14.00 s. Use the same Earth view when the player walks back to the console in H02. The timing, staging and presentation parameters below are [ASSUMED] recommendations for OP and AU under [A8, A9, A17, A21 and A22](../../DECISIONS.md).

## The shot

Use first-person walk mode with the top of the physical console in the lower foreground and Earth visible above and slightly right. The eye is at scene `(0, 1.68, +1.40)` m, yaw 0, pitch −0.105 rad, roll 0, vertical FOV 62°. Room axes are x right, y up and −z out the window. The camera looks through the space above the main screen and the shot keeps the console visible. Keep the cursor, instrument overlays and holograms off. Put **MARS RETURN** on the console's own screen in theme ink if the shot needs a readable route cue. Let the warm compartment frame the blue-white daylight side of Earth.

Earth's true bearing is +4.7° azimuth and +2.0° elevation in the room frame (rightward azimuth positive here). The central mullion is at 0° and the next one is near +9.3° from the proposed eye position, so Earth fits in the intervening pane. Validate the actual screen, console lip and mullions together at the smallest supported viewport. If contrast needs help, lower the competing lamps and stars, or move the eye and Earth bearing within that pane while retaining the 62° FOV and 2.92° disc. Keep the terminator visible and the Sun off camera to the upper left.

## Beat sheet

Clock starts when the first complete frame of the room is ready and visible. Rows are elapsed real seconds. The camera perturbations apply to the base shot in camera-local axes. Amplitudes are peak one-sided values and the times mark keyframes. The palette is [Night Watch](../../design/visual-direction.md) and the current `roomLights`, `roomSurface`, `colour` and `type` tokens in `src/theme/`.

| Time (s) | Camera | Room lights and screen | Window and overlay |
|---|---|---|---|
| 0.00–2.80 | Hold the console shot. Zero shake. | Nominal: warm ceiling `roomLights.warm` (#ffb070), sill and under-console `strip` (#ff9a40), dark fitted metal. Quiet main-screen ink. | Earth and fixed stars. Keep the full frame clean so the player can register Earth before the disturbance. |
| 2.80–4.10 | A slight vertical tremor. Raise peak y from 0 to 12 mm and peak roll from 0 to 0.20° by 3.80 s, at 3.2 Hz. | Add a steady ▲ `caution` (#ffd23f) on the console. Pulse the local amber lamps at 2.90 s. Keep the room level near nominal. | Earth and stars move in frame only with the eye's movement. |
| 4.10–5.65 | Rise from 12 to 38 mm vertical and 0.20° to 0.55° roll. Sweep the vertical frequency from 3.2 to 4.5 Hz. A shove to the right and a corrective step left read as two weighted movements. | Two amber accents, at 4.10 and 4.77 s. Bring warm room fill down from 100% to 65% across the beat. Escalate to steady ■ `warning` (#ff3344) at 5.02 s. | Maintain Earth in its pane. A few stars in the pane left of centre begin bending only at the end of the beat. |
| 5.65–7.15 | Familiar A8 failure cadence, 1.50 s. At 5.65 s peak shake reaches 75 mm vertical and 0.022 rad (1.26°) roll. Decay both smoothly to zero by 7.15 s. Use 6.5 Hz vertical and 4.6 Hz roll. | Amber accents at 5.65 and 6.32 s. Ramp the warm fill from 65% to 10%. The main screen and warning go out once at 6.75 s, 1.10 s into failure. One cut to `roomSurface.void` (#000000) at 7.15 s. | Local star deflection peaks at 6.35 s and holds through the cut. Earth retains its scale and phase until the cut. |
| 7.15–8.00 | No camera motion visible. | Silence and full black. | Empty black frame. |
| 8.00–10.80 | Camera stays hidden. | Black remains. | Entire **RECURSION** wordmark enters with opacity 0→1 from 8.00 to 8.65 s and holds. |
| 10.80–12.20 | Set the room eye at the C01 door while fully masked, after the title has cleared. | Title fades to zero between 10.80 and 11.35 s. Settle the room back to nominal beneath black. | Install the actual C01 arrival snapshot and sky under black at 11.55 s. Keep black through 12.20 s. |
| 12.20–14.00 | At `DOOR` (x 0, z +3.75 m, yaw 0), lift pitch from −0.12 to −0.05 rad by 13.75 s. Zero shake. From 14.00 s the player's look and walking take over at that exact pose. | Fade the black overlay down from 1 to 0 by 13.75 s. Usual subtle cursor and room controls appear with handoff. | C01's distant limb below and fragments above/aside in 3D. Hold the view long enough to see Earth's absence without a label or automatic pan. |

**Stumble keys.** Add these to the tremor using smoothstep between keys. Position offsets in metres are x right, y up, z back. Rotation offsets in degrees use positive yaw right, pitch up, roll clockwise as seen by the player. Start and end at zero.

| t (s) | (x, y, z) m | (yaw, pitch, roll) ° |
|---|---|---|
| 4.10 | (0, 0, 0) | (0, 0, 0) |
| 4.35 | (+0.10, −0.07, +0.06) | (+1.5, −2.5, +2.8) |
| 4.78 | (+0.025, −0.015, +0.015) | (+0.3, −0.5, +0.5) |
| 5.02 | (0, 0, 0) | (0, 0, 0) |
| 5.22 | (−0.08, −0.05, +0.045) | (−1.2, −1.7, −2.2) |
| 5.65 | (0, 0, 0) | (0, 0, 0) |

Sample the oscillation from elapsed time on each frame and compose from the unperturbed pose. Keep oscillator phase continuous across frequency keys. Blend from the second beat's peak amplitudes to the failure peaks over the first 0.12 s of the failure segment, then decay. Roll can run at the vertical frequency up to 5.65 s and settles into 4.6 Hz thereafter. Ease frequency changes over that same 0.12 s. Scope the moving room view to the opening and the shared failure presentation. It has zero effect on flight attitude, instruments or eye height once control returns.

**Title.** Use the theme's `type.family` (Cascadia Mono and its existing system fallbacks), `type.weight.strong` (600), `type.tracking.label` (0.08 em) and `colour.ink` (#efe3cc). Request a responsive theme size of `clamp(28px, 7vw, 64px)` and the timeline's opacity timings. Centre the uppercase word on the viewport. A single smooth opacity entrance gives it weight; keep it stationary while it holds and fades. Use text in the app overlay so layout and accessibility work without a raster asset. On a first launch, replace the composition root's existing visible `RECURSION` loading text with a quiet loading treatment so the word first appears in black.

## Earth and the anomaly

[ESTABLISHED: NASA NSSDC and JPL SSD] Mean Earth radius is 6,371 km. Earth and Mars orbital semimajor axes are 149.598 and 227.956 million km. Use Sun GM 132,712,440,041.279419 km³/s² and Earth GM 398,600.435507 km³/s². [NASA Mars Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html?level=1) · [JPL Astrodynamic Parameters](https://ssd.jpl.nasa.gov/astro_par.html)

[ASSUMED] A circular, coplanar minimum-energy Mars-to-Earth transfer arrives near Earth's orbit at its heliocentric perihelion, moving faster prograde than Earth. Patch that velocity excess to a Newtonian Earth-centred inbound hyperbola with 10,000 km centre-distance perigee, choosing the sunward side of the incoming asymptote. This is an illustrative approach geometry with no dated ephemeris or assumed insertion burn. The relative approach is valid as the last leg of a return begun at Mars. [NASA Basics of Space Flight, Trajectories](https://science.nasa.gov/learn/basics-of-space-flight/chapter4-1/)

The angular diameter at centre-distance $d$ is $2\arcsin(R/d)$. Heliocentric vis-viva gives excess speed $v_\infty = 2.945$ km/s. For perigee $q$, use $e=1+qv_\infty^2/GM_\oplus$ and $p=q(1+e)$. The magnitude of inbound true anomaly is $\nu_r=\arccos((p/d-1)/e)$ and its asymptotic value is $\nu_\infty=\arccos(-1/e)$. The Sun–Earth–observer phase angle on this branch is $90^\circ-(\nu_\infty-\nu_r)$, with all angles in common units. The reference integrates daylight over the perspective-projected globe with parallel sunlight.

[DEMONSTRATED: `tools/studies/s23/reference.py`] Projected diameters are vertical pixel spans at the base pose, before the window frame.

| Centre distance (km) | Angular diameter | Phase angle | Visible disc in daylight | Diameter at 720 px / 1080 px viewport height |
|---:|---:|---:|---:|---:|
| 100,000 | 7.31° | 74.52° | 64.4% | 78.3 / 117.4 px |
| **250,000** | **2.92°** | **83.24°** | **56.1%** | **31.3 / 46.9 px** |
| 500,000 | 1.46° | 86.49° | 53.1% | 15.6 / 23.4 px |
| 750,000 | 0.97° | 87.63° | 52.1% | 10.4 / 15.6 px |

At 250,000 km the inbound radial speed is 3.424 km/s. Over the 7.15 s visible Earth shot the nominal approach closes about 24.5 km and grows the disc by about 0.003 px at 720 px height. Hold the size, rotation and phase for the shot. Use a textured or procedurally coloured sphere with a directional Sun and a dark night side. If placing the sphere at compressed scene distance $D$, give it radius $D\sin(2.920567^\circ/2)$. Apply lighting direction explicitly for this sky. Centre the land/cloud composition on a recognizable ocean/continent boundary and check it after downsampling. Keep a tight limb with restrained bloom. Stars retain their inertial directions and brightness through the normal shot. The camera's rotation changes their screen positions. The room frame and console move relative to those directions when the player stumbles. Treat stars as effectively at infinity and avoid visible parallax from eye translations.

[ESTABLISHED: NASA] An isolated black hole can deflect background starlight. An accretion disc requires luminous material and is a separate feature. [NASA black hole anatomy](https://science.nasa.gov/universe/black-holes/anatomy/) · [NASA isolated black hole visualization](https://svs.gsfc.nasa.gov/14620)

[FICTIONAL] A black hole intercepts this Mars return and transports the ship into C01. The shake, loss of services and transfer are authored effects of the encounter. The room motion represents a disturbance of the ship and the player's attempt to stay upright. The optical cue below suggests lensing and carries no implied mass or approach distance.

| Treatment | What the player sees | Assessment |
|---|---|---|
| Brief local lensing, recommended | Two or three background points bend in one pane as the ship starts to fail. | Gives the window its own evidence, helps distinguish the opening from an ordinary fault, preserves Earth's role and keeps the cause ambiguous. |
| Effects only | Lamps, instrument failure and body motion precede black. The sky follows the base shot. | Smaller version. Preserves the pacing and mirror; gives up the clue that the disturbance is external. |
| Black hole wholly off camera | Sky remains normal; use the recurring failure rhythm with minimal extra treatment. | Closest match to ordinary loss and least authorship. The crossing can feel like a routine fault followed by an unexplained location change. |

For the recommended glimpse, set a lens centre at approximately −13.2° azimuth, +1.5° elevation, within one pane. Taper to zero at a 3° radius. Seed two or three subdued guide stars around 1–2° off centre so the cue survives 720 px. Move their apparent bearings radially outward with a smooth envelope from 5.35 to 6.35 s, cap displacement at 0.45°, and hold until black. Apply from the same initial directions every frame. The entire patch can use a small star-direction remap, with occurrence and brightness fixed. Keep Earth and the rest of the field clear. An oversized shadow, emissive disc or full-window whirl would compete with the console and promise a specific object or destination. Leave those out. Reduced motion uses a fixed sky and carries the disturbance through the lamps, dead screen and black.

### Earth imagery and provenance

Primary choice is an original procedural blue-ocean sphere with authored land masks and soft clouds. Use the reference phase and scale and give the project-made asset A14's original-material terms. No external bitmap is required. If this version fails recognition at 720 px, prefer the NASA surface texture to increasing scale.

A concrete licensed-use candidate is **February, Blue Marble Next Generation**, the NASA Visible Earth 5400 × 2700 flat global image, credited to **Reto Stöckli, NASA Earth Observatory**. The product asks reusers to credit NASA Earth Observatory. NASA's media terms cover factual use of NASA-origin textures for graphical simulations subject to attribution, no implied endorsement and any asset-specific rights. Use the global image as diffuse surface colour for the physically shaded sphere, downsized to about 512 × 256, with project-made clouds if needed. If selected, record the exact source asset URL and hash, credit, linked terms and modifications in the release asset register, playable credits and notices under S10/S13. Keep NASA marks out of the material and retain NASA's terms for the upstream image. [Source image and credit](https://visibleearth.nasa.gov/images/73967/february-blue-marble-next-generation/73970l) · [Blue Marble attribution](https://earthobservatory.nasa.gov/features/BlueMarble/BlueMarble.php) · [NASA Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)

## First wake, recurrence and the ending

| Moment | Reveal and control | What the game records |
|---|---|---|
| **First wake, C01** | RECURSION fades, then a quiet look up from the door, with the new sky already present as the room appears. At 14.00 s the player can walk, look and use the console. Start the normal C01 arrival/preparation policy at that handoff, including the standard operating clock for scripted-free travel. | The expedition begins its first actual attempt in C01 at its valid seeded arrival. Opening actions and failures are presentation. There is no fabricated loss, Earth observation or physics record. |
| **Later loss/Recall, C01** | Normal A8/A9 room return at the door with the new attempt's seeded view. The fatal sequence is about 6 s, including black, the existing Black Box pip and fade. Recall keeps its quieter cut with shake omitted. Earth, the lens, the title and the opening-only eye lift belong to the prologue. | The run restarts under A9/P8, and the archive and model retain their evidence. Use the normal reset and debrief path. |
| **Successful whole-ship crossing, H02** | A17 and H02 call for the same fatal-loss presentation through black, including sound and the pip when present. Under black load the Earth room, at the door with the ordinary recurrence room lighting and fade. Hand back walk/look. The player's walk to the centreline approach brings the same console-and-Earth frame into view. Give them the last look, with no title, success message, or landing. | Record a return with the actual crossing time and surviving state. The wear, resources, chart and Black Box reflect the run that actually got home. The loss presentation does not invoke restart. A loss before the full crossing takes the ordinary A9 path. |

Use one Earth sky descriptor for the prologue and H02: same Earth bearing in the reference room frame, distance, phase, lighting side, surface orientation and inertial star arrangement. Preserve the same room coordinates, FOV and framing landmark at the approach pose. In H02 the reference pose is a place the player can walk to and aim from, with full look control and no magnetic snap. Keep the window world-aligned after the reveal; accept the H01/H02 arrival view through the game layer and author the far-side presentation to make this framing available. Any valid earlier Earth view through H01 remains possible. H02 can show the genuine depleted or damaged instrument state while the view outside and the walk back to the console make the match.

## Playback and accessibility

- **Once per new expedition save.** Resolve opening eligibility on save load before any live attempt or HUD is visible. When the room is ready and the page visible, claim the opening atomically in save metadata before revealing the frame. A reload, duplicate tab or remount then follows the normal C01 entry path. Existing saves with attempt history count as past first launch. The usual erase/new-save flow clears the corresponding marker. If persistent storage fails, guard against repeat playback within the current session and keep the game playable. Recurrence, Recall and encounter selection use ordinary paths.
- **Skip after first viewing.** The initial auto-play runs hands-free. From a save entry or settings screen outside active flight, offer **Replay opening** after the opening has run once, with keyboard and pointer **Skip** enabled from the first replay frame. Skip uses the same overlay cleanup and release path as completion. Replay returns to the scene or menu that launched it. A normal returning player goes directly to their save.
- **Clock and input.** Use elapsed visible real time. Hold on backgrounding as in A12. Keep the trigger and audio event cursor aligned to the same clock, so dropped frames/visibility changes cannot replay a cluster of cues. Block world movement, pointer lock, instrument actions and flight shortcuts until the handoff, and clear held input before release. A user gesture can enable sound or change motion preference without operating the ship. Apply ordinary simulation time and controls at handoff, with no cinematic pause in an operating encounter.
- **Flashes.** Use one local amber cue envelope synced across the lamps that flash: rise 60 ms, hold 80 ms, fall 100 ms. The five starts in the beat sheet yield at most two pulses even when counting partial overlap with a sliding 1 s interval [DEMONSTRATED: `reference.py`]. Keep red a steady square until power-off. Keep phase cut, title opacity and reveal monotone in their respective intervals, with no full-screen alternating light. Count the final composited picture including reflections, bloom, screen power-off, title and all concurrent light changes; require ≤3 flashes in any 1 s window. The timing calculation checks only the programmed pulses. [W3C Three Flashes, SC 2.3.2](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes.html)
- **Reduced motion.** Honour the system preference on frame one and provide a persistent in-game override. Use the fixed console pose, zero shake, fixed stars and the settled door pose from first reveal. Replace the lamp pulses with steady amber through failure, then power off once. Use the same quiet and title timing. The sequence remains legible with sound muted.

[Sound cues](audio.md) · [OP integration and acceptance](build.md) · [Generated reference vectors](../../../tools/studies/s23/vectors.json)
