# S9 — independent requests for 2D

All items are [ASSUMED] recommendations, not owner decisions or source changes. Source evidence and ranking are in [the review](README.md), with complete traversal details in [keyboard/focus](keyboard-focus.md). Estimates are approximate production lines, excluding tests, with overlap between shared components. Integrate against the current 2G contracts before implementation; do not port stale Alpha geometry into the new encounter.

## First insight

### R1. Reveal the existing routes to the station views

Show 1 MAP / 2 SHIP / 3 CONSOLE / 4 FLIGHT beside the pads or in a restrained arrival hint. Include Escape from CONSOLE. Keep the white dot, walkable room and unobstructed window; no welcome modal. Use an accessible DOM route as well as painted pad labels.

Touches: `ControlRoom.tsx`, room labels and theme; 25–50 lines. Model/contracts/data: none. **Prove:** a fresh player can open CONSOLE without guessing mouse capture; keyboard activation and mouse pad selection reach the same view; returning after loss preserves the room sequence.

### R2. Distinguish setup, a plan and encounter entry

After RECORD DESIGN AND SET UP, show “Design recorded · no maneuver scheduled” when true, with an OPEN PLAN action. In preparation, show “Prepare first; ENTER starts time.” Keep CALIBRATE/WIDE as intent labels; do not have them secretly generate a plan. If the player enters with no plan, allow it: coasting and hands-on investigation are legitimate choices.

Touches: `MissionPage.tsx`, `Desk`, `TimeControls`; 30–60 lines. Existing plan/status information only. **Prove:** design setup changes equipment and records intent without creating burn commands; PLAN link changes views without starting time; ENTER remains an explicit action; active-encounter editing never adds a UI pause.

### R3. Make coast time and manual warp intelligible

Near the time controls show ship time, selected warp and a wall-time estimate to the **next scheduled action or an already issued forecast's relevant marker**, when available. Clearly mark estimates as nominal; `saturated` means actual throughput is lower. Before ENTER, use the documented 1× entry rate rather than a remembered rate. Do not invent a safe endpoint beyond the forecast horizon.

Touches: `controls.tsx`, `PlanPage.tsx`, `FlightHud.tsx`, theme; 50–100 lines. Derive from existing schedule/forecast data; request a believed-side next-command summary if that timestamp is not exposed. **Prove:** 400 ship seconds reads 6:40 at 1× and 0.2 s nominal at 2000×; unset events are absent, not guessed. New alerts and hands-on input still select 1×. No automatically chosen warp.

### R3b. Keep the warp-drop reason beside FLIGHT's controls

Display the existing “warp to 1× · off the forecast” reason in FLIGHT until superseded or acknowledged. Current code stores it in `desk.note`, whose console footer is invisible there. Keep a persistent reason without repeatedly announcing the changing miss. Resuming warp remains the player's explicit choice.

Touches: `FlightHud.tsx`, `Desk` if a typed last-warp-reason is preferable; 20–40 lines. **Prove:** warning, caution and hands-on reduction explain themselves in the active view; advisories do not lower warp; clearing/reappearing cautions follow A12. No automatic resume after an alert clears.

### R4. Preserve the player's burn/pointing draft across navigation

Move editor rows from page-local React state into Desk, with clear draft-versus-scheduled identity and an explicit clear action. Invalidate a preview if its input changes. A new attempt can offer the previous draft as an unscheduled draft, clearly tied to its original conditions; never replay it automatically. Choose a simple initial policy: clear on recurrence with a visible reason, retain on ordinary page/view changes.

Touches: `desk.ts`, `PlanPage.tsx`; 60–120 lines. Model/contracts: none. **Prove:** edit→PREVIEW→FLIGHT→MODEL→PLAN retains exact inputs; COMMIT corresponds to displayed inputs; editing invalidates draft forecast; recurrence does not silently schedule old commands; a blank coast commit cannot masquerade as the previous burn preview.

### R5. Bound “forecast held” by what was actually forecast and observed

In the debrief show the issued forecast's end and the latest recorded comparison inside that interval. Say “within envelope through T…” and separately “no forecast after T…” when appropriate. Loss beyond a horizon must remain a loss **outside forecast coverage**, not a falsely disproved prediction and not an unqualified success. If samples cannot establish an interval, say not recorded.

Touches: `mission.ts`, `BlackBoxPage.tsx`; 40–80 lines. Use existing issued forecasts and measurements. **Prove:** the S9 first-loss case reports horizon 3:36 and loss 4:04 separately; a true >3σ discrepancy retains its original timestamp; missing data stays missing; old forecast samples/hash never change after adoption. Pair the status with the measured clearance already available.

### R6. Connect retained evidence to the next independent observation

At the door, a short orange “Black Box retained · 1 attempt” cue can accompany the existing pip. On the debrief show measured distance coverage with uncertainty and a link to MODEL. In MODEL/Black Box expose the count of **finished** independent attempts and the existing reason TEST is unavailable. Do not award knowledge for dying or imply two records guarantee a passing test. A successful experiment and voluntary Recall are equally valid evidence paths.

Touches: `ControlRoom.tsx`, `BlackBoxPage.tsx`, `ModelPage.tsx`, theme; 60–110 lines. No estimator change. **Prove:** zero/one/two-finished and one-finished-plus-live states; loss and Recall both retain records; two empty or redundant observations do not automatically yield scientific acceptance. The cue states measured facts and does not announce the new law.

### R7. Make the independent test readable before its statistics

Keep the strength plot and diagnostics. Beside the test controls show “Fit: attempt(s)… / Check: attempt…”, then the actual result: insufficient evidence, fails, passes/not adopted, or adopted. Retain the numerical threshold and evidence-penalty details. Provide an expandable table or short data summary for measured/model strength versus distance, with source and uncertainty. Do not preselect the correct exponent or turn an error into a green readiness state.

Touches: `ModelPage.tsx`, `StrengthPlot.tsx`, shared status primitive; 70–130 lines. Existing report/test results only. **Prove:** training never includes the held-out attempt; TEST never adopts; failed/insufficient cases have accurate reasons; keyboard/screen-reader users can obtain the data behind the plot; confidence bounds and validation spans remain visible.

### R8. Connect adoption to a fresh forecast and an observed comparison

After adoption, show “Rule adopted · next forecast uses model vN” plus OPEN PLAN. Do not commit a plan or overwrite an issued forecast. In flight/debrief, place model version, issuance time, observed interval and miss together; a thin comparison of the retained issued path and measured trail should make improvement readable without opening several unrelated panels. Old geometry must be labelled with its attempt and briefing when overlaid (A10).

Touches: `ModelPage.tsx`, `FlightHud.tsx`, `BlackBoxPage.tsx`, existing view overlays; 60–120 lines. No new physics. **Prove:** adopted and unadopted forecasts keep distinct version/issuance identities; an unflown prediction says predicted, not validated by flight; inside/outside validated spans retain different uncertainty; changing the plan is always the player's action.

## Keyboard and focus, each buildable separately

### R9. Remove hidden focus and restore a visible destination

Make inactive console/HUD controls inert or unmount their interaction subtree; focus the new view after camera arrival and restore the trigger on exit. After loss, focus a labelled room surface. Preserve draft state independently of component mounting.

Touches: `ControlRoom.tsx`, `ConsoleScreen.tsx`, `loop.ts`, `RoomView.ts`; 85–180 lines. **Prove:** Tab/Shift+Tab never reaches invisible ENTER, warp or tabs in any view/transition/loss. Instrument refresh never steals focus. See keyboard K1/K2.

### R10. Route scene keys only from scene focus

Native buttons retain Space/Enter. Numeric/select editing and popup dismissal must not fly the ship or change views. Give a visible way back to scene focus and preserve key release/blur clearing.

Touches: `RoomView.ts`, control wrapper; 35–70 lines. **Prove:** FLIGHT ENTER/warp/heading buttons work with Space; arrows on a control do not pitch; focused flight surface still flies all axes; Escape first dismisses a native popup. No focus action pauses an operating encounter. See K3.

### R11. Implement shared mode-chip keyboard behavior and discrete status

Use native radio inputs or roving Tab focus with arrow selection. Expose selected page/warp/system state and announce discrete completed actions through one polite status region, never the ticking clock.

Touches: theme `ModeChips`, `ConsoleScreen`, time/system buttons; 55–115 lines. **Prove:** one Tab stop per radio group, arrow selection, read-only values not inert stops, TEST/COMMIT completion announced once, styles retain theme focus outlines. See K4/K6.

### R12. Keep edit and equipment traversal stable

After + BURN/+ POINTING, focus the new row's first field. Include row identity in repeated labels; after removal focus the nearest surviving row/add button. Keep SYSTEMS equipment in a stable order during interaction; offer a direct path between selected equipment and its detail controls.

Touches: `PlanPage.tsx`, `SystemsPage.tsx`, `ShipPanels.tsx`; 60–100 lines. **Prove:** two rows can be added, changed and removed without losing focus; turning equipment on/off does not unexpectedly change the next Tab target; first/last equipment details are equally reachable.

### R13. Add keyboard equivalents for 3D inspection

Provide modest range−/+ and reset framing controls; add orbit/tilt keys or controls with visible labels. Offer a keyboard list of **sensed** FLIGHT objects and **charted** MAP objects. SHIP already provides useful system/component buttons; preserve them. Camera selection/framing must not alter sensors, issue thrust or expose truth.

Touches: `FlightHud`, `MapPlate`, `ShipPanels`, `RoomView`; 80–160 lines. Existing believed/chart data only. **Prove:** choose and inspect each available object, change framing and return to neutral without a pointer; unknown objects remain absent; selected target identity matches the visual pick.

### R14. Make long evidence readable and comparison controls direct

Give necessary scrolling regions a labelled keyboard target. Separate “view debrief” from A/B comparison selection, or explicitly describe the dual action. Put reset/storage management after evidence controls; label the current overlay action “Set flight overlay” unless it really navigates to FLIGHT.

Touches: `BlackBoxPage`, panel primitives/styles; 40–90 lines. **Prove:** long debrief/diagnostics can be fully read at 1024×640; selecting/clearing A/B is understandable; cancelling the existing erase confirmation preserves records; overlay sets and clears exactly the selected pair.

## Integration follow-up

### R15. Retest screen promises against the integrated 3D game

Check displayed control availability, thrust/velocity feedback, rock tracking claims and the encounter objective after 2G lands. Remove or qualify only a promise unsupported by the current belief data. The study's transitional Alpha orbit, old known model fault and stand-in timing probe are not reasons to redesign the final Beta slingshot.

Touches: small labels/capability checks in PLAN/FLIGHT; 15–40 lines if required. **Prove:** real main/RCS inputs produce the sensed response and thrust marks; pointing at a rock only claims law-probing when recorded fixes support it; UI objective matches the current briefing. Route defects to 2G/2F rather than inventing responses in 2D.

Separate integrator request: resolve `session.advance()` holding during COMMIT against A12 while preserving forecast/command epoch integrity. This needs game/model ownership. No R item authorizes a new pause or changes a contract independently.
