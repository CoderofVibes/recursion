# S9 — Keyboard and focus audit

Static review of `st/s9-first-five-minutes` at `55d91c30fc715a92af116dcd35c085fcbf6667ca`, 2026-11-14 Pacific. All source references below name that revision. No application source was changed. This audit did not run a keyboard or screen-reader session; runtime observations, if any, are reported separately in the study.

[ESTABLISHED: source references below] The five console pages use native buttons, selects and number inputs for their principal actions. The largest defect is outside any single page: the hidden console keeps focusable tabs and time controls in the document. [ASSUMED] Fixing that and focus ownership should precede fine tuning the number of keystrokes.

## Shared focus contract

The following describes DOM order, excluding disabled controls and any browser-provided automatic focus stop on an overflowing container. `Tab` advances; `Shift+Tab` reverses. Native buttons normally activate with `Enter` or `Space`; native selects and numeric controls retain their platform keyboard behavior. The FLIGHT exception is listed below.

Every visible console page begins with **MISSION → PLAN → MODEL → BLACK BOX → SYSTEMS**, followed by its page controls, then its footer. The footer is **ENTER Gravity range** in preparation, or **1× → 10× → 60× → 300× → 1000× → 2000×** in operation. Ended-attempt warp buttons are disabled. Sources: `src/console/ConsoleScreen.tsx:16–22,30–65`, `src/console/controls.tsx:135–172`, `src/game/encounter.ts:80`.

The five navigation buttons are ordinary buttons, not ARIA tabs. That is a valid simple navigation approach, but selected state is only `data-on`; no `aria-current`/`aria-selected` is exposed. After selecting PLAN, the next Tab goes to MODEL, BLACK BOX and SYSTEMS before entering PLAN's content. Selecting MISSION leaves four intervening navigation stops. There is no skip-to-page control or programmed focus transfer. Sources: `ConsoleScreen.tsx:32–54`.

The visual layout is CSS multicolumn flow, not a row-major grid. DOM order traverses the first whole panel before the next panel, which flows down columns; it need not follow a user's left-to-right scan across the top of the screen. Panel placement can rebalance as content grows. This is not automatically a wrong order: keep visual and reading order consistent and test it at the four supported desktop sizes. Source: `src/console/console.css:72–87`.

### Shared defects and small remedies

| ID | Finding and evidence | Minimal remedy in 2D's lane | Estimated effort |
| --- | --- | --- | --- |
| K1 | **Invisible controls remain reachable.** `ConsoleScreen.tsx:30` sets `aria-hidden`, but keeps navigation (`32–47`) and footer (`56–65`) mounted. `console.css:7–18` hides with opacity and pointer events only. From the initial room there are five invisible console navigation buttons followed by invisible ENTER. Activating that button can begin the encounter while the player remains in the room. The same extra controls follow MAP/SHIP/FLIGHT controls. | Make the inactive console inert or unmount its interactive subtree. During loss also make hidden HUD controls inert. Transfer focus before hiding its owner; do not rely on `aria-hidden` to disable interaction. | [ASSUMED] 25–60 lines plus a real-browser keyboard regression. |
| K2 | **Opening, leaving and replacing a view has no focus destination.** The canvas has no focusability or accessible name (`src/app/ControlRoom.tsx:81`); view callbacks update state only (`src/app/loop.ts:59–70`); `RoomView.go/back` changes camera/mode only (`src/view3d/room/RoomView.ts:207–233`). Search found no explicit focus management in the reviewed app/console/view code. A hidden tab can retain focus; removal of a page control leaves browser-dependent fallback focus. | Give room/flight a focusable, labelled interaction surface; focus the active console page heading or selected navigation button after camera arrival. Restore the prior trigger on exit where it still exists. After loss, focus the room surface at the door. Keep focus stable during instrument refreshes. | [ASSUMED] 60–120 lines. |
| K3 | **Control events also reach scene controls.** `RoomView.ts:521–549` excludes INPUT/SELECT/TEXTAREA, but not buttons or contenteditable elements. In FLIGHT it prevents Space's default action even on a button; Up/Down on a button are recorded as pitch. Escape executes before the typing guard, so Escape in a select can also leave the view instead of merely dismissing its popup. | Scope flight/walking keys to the focused scene surface; let native controls handle their keys. Keep Escape hierarchical and avoid consuming it while a native edit/popup is being dismissed. Provide a visible way to return focus to flight. | [ASSUMED] 35–70 lines plus event-routing checks. |
| K4 | **Radio semantics without radio keyboard behavior.** Every enabled `ModeChips` option is a Tab stop; there is no roving `tabIndex` or Arrow/Home/End handler (`src/theme/components/ModeChips.tsx:37–59`). Enter/Space still choose each option, so the settings are reachable, but arrow navigation implied by `role="radio"` is absent. A read-only selected option remains an enabled, inert stop (`55–56`). | Use native radio inputs or implement one group Tab stop and arrow selection. Render read-only values as noninteractive text. | [ASSUMED] 40–80 lines in the shared primitive. |
| K5 | **No reliable keyboard target for reading overflowed noninteractive panels.** `.cs-page` and `.cs-scroll` overflow (`console.css:72–77,291–295`) but have no explicit focus target or keyboard-scroll contract. Tabbing reveals interactive elements, not necessarily every line of a long debrief or model report. Browser automatic scroll-container focus differs; this is a static gap, not a demonstrated universal failure. | Make necessary scroll regions labelled and keyboard reachable, with Page Up/Down or standard scrolling while focused. Avoid adding a stop to every readout. | [ASSUMED] 15–35 lines, then browser verification. |
| K6 | **State and completion announcements are incomplete.** Navigation selection and warp selection use `data-on` only (`ConsoleScreen.tsx:38`, `controls.tsx:155`); `desk.note` is a plain span (`ConsoleScreen.tsx:63`), so test/commit completion and warp-drop reasons have no live-region semantics. | Expose selected navigation and warp state; announce discrete operation results through one polite status region. Do not announce the changing clock or every telemetry refresh. | [ASSUMED] 15–35 lines. |

[ESTABLISHED: `src/console/console.css:158–162`; `src/theme/components/components.css:55–57,500–502`] Theme focus outlines already exist for console buttons/tabs/fields, component rows and mode chips. Keep them. Remove/forget buttons (`.cs-item__close`, `console.css:280–290`) have no explicit theme focus treatment, although the browser may supply its native outline; add them to the existing rule and inspect clipping. [ESTABLISHED: `src/theme/components/Alert.tsx:27–35`] Flight warnings already have `role="alert"`; cautions/advisories have `role="status"`. Preserve that behavior.

## Every console page

The chains below are the controls *between* the shared navigation and footer. Read-only panels do not contribute ordinary Tab stops. Disabled actions are not unreachable defects when their visible preconditions explain why they are unavailable.

### MISSION

**Order:** evidence goal CALIBRATE → PROBE → VALIDATE → FLY; approach WIDE → CLOSE; Reserve number → Clearance number; each camera-mode chip → Point at select → recorder rates 0.05 → 0.2 → 1 → 10 Hz; each configuration chip → RECORD DESIGN AND SET UP → page-local ENTER (prepare only); then footer ENTER or warp.

Sources: `src/console/pages/MissionPage.tsx:55–75,79–110,117–146,177–205`; goal/approach order in `src/console/mission.ts:29–38`.

- All mission settings and both actions are keyboard reachable. Number/select labels correctly wrap their controls (`src/console/controls.tsx:50–68,80–96`; Mission target at `125–138`).
- Both ENTER controls do the same thing. The first is behind every mission configuration choice; the footer duplicate does not offer a keyboard shortcut unless the player knows to navigate backward from the beginning. [ASSUMED] A labelled primary action near the beginning of the page, plus a focusable page heading, would make preparation easier to finish without removing deliberate setup.
- Choosing a mode changes the design draft; RECORD DESIGN AND SET UP applies it. Entering does not require that action (`MissionPage.tsx:198–204`). The visual distinction between draft and current state needs to survive keyboard-only use; selected chip state alone does not imply the ship has changed.
- Mode-chip arrow behavior is K4. All settings remain editable during an encounter; a focus fix must not pause simulation (A12).

### PLAN

**Order:** for each burn, Remove burn → In seconds → Direction → optional Body (TOWARD/AWAY) or Turn (BODY AXIS) → By → Δv/For → Throttle; + BURN; for each pointing row, In → Camera at → Remove pointing; + POINTING; up to six immediate target buttons; PREVIEW → COMMIT → CUTOFF; for each saved procedure, Forget procedure → REPLAY FROM NOW; SAVE THIS ATTEMPT SO FAR → RECALL/BEGIN AGAIN; footer.

Sources: `src/console/pages/PlanPage.tsx:189–271,274–326,372–391,394–442`.

- Empty page starts at + BURN. Adding a row inserts all of its fields **before the button that remains focused** (`120–137,190–271`); the next Tab proceeds to pointing rather than the new burn. [ASSUMED] Move focus to the new row's In field. Do the equivalent for + POINTING.
- The first stop in each existing burn is removal, while pointing rows put removal last. Saved procedures similarly put Forget before Replay. [ASSUMED] Put destructive row controls after the main edit/use action in DOM and visual order.
- Repeated accessible names are ambiguous: every row says `Remove burn`, `Remove pointing`, `In`, etc.; every saved procedure says `Forget procedure` (`197–204,277–303,407–414`). Include the row index or procedure name and group the fields with an accessible legend.
- Removing the focused row supplies no replacement focus target. Return to the next row, previous row, or Add button. Preview/commit completion also needs K6.
- **Draft loss is separate from focus but aggravates navigation:** burns/points live in page-local state (`64–65`), and pages unmount on page or view changes (`ConsoleScreen.tsx:49–54`). A player leaves to inspect flight or model and returns to an empty draft. Preserve the draft in Desk with an explicit clear action; do not silently reissue it.
- RECALL is reachable and its title explains recurrence (`435–440`), but title-only explanation is not dependable keyboard help. Put “restart attempt; records kept” in persistent adjacent text or an accessible description.

### MODEL

**Order with two completed attempts:** Hold out select → TEST → ADOPT, or REVOKE if the rule is already adopted; footer. TEST is disabled after adoption and while busy. ADOPT is disabled until an adoptable test result is available. With fewer than two finished attempts, Hold out/TEST/ADOPT are disabled, so ordinary Tab goes from navigation directly to footer.

Sources: `src/console/pages/ModelPage.tsx:54–55,95–125,198–210,256–271`.

- The first two panels (model diagnostics, then strength plot) have no interactive controls; the first ordinary content focus stop is in the third panel, Rules (`131–198`). [ASSUMED] A skip-to-Rules link or a sensible page focus target can reduce searching while retaining the evidence next to the action.
- Disabled test controls have an on-page explanation: two finished attempts, one for fit and one for check (`206–209`). This is intentional scientific gating, not a keyboard failure. Do not enable testing with an unfinished or reused training case to shorten the audit path.
- During TEST, TEST becomes disabled; no code transfers focus to completion or exposes a live status. After completion the browser's retention of focus on the disabled button needs checking; K2/K6 address this without forcing adoption.
- The strength graphic has `role="img"` and a general label, but no per-point table or numerical alternative for its pattern (`src/console/StrengthPlot.tsx:60–105`). It is a passive plot, so its points need not be Tab stops. [ASSUMED] Add a short measured-data summary or expandable table (distance, measured/model ratio, uncertainty, source attempt). This makes the evidence available beyond color and geometry without announcing a law for the player.
- Model/calibration numbers below the fold depend on K5 for keyboard-only scrolling. ComponentRows here are noninteractive `<div>` entries, correctly absent from Tab order (`ModelPage.tsx:308–328`; `src/theme/components/ComponentRow.tsx:54–65`).

### BLACK BOX

**Order:** attempt rows in ascending attempt index → RECALL/BEGIN AGAIN → ERASE RECORDS if available → OVERLAY IN FLIGHT/CLEAR OVERLAY if two finished selected attempts qualify → footer. Debrief is read-only and adds no ordinary stop.

Sources: `src/console/pages/BlackBoxPage.tsx:104–118,148–162,181–211,275–284`.

- All attempt rows are native buttons; selected state is exposed through `aria-pressed` (`src/theme/components/ComponentRow.tsx:54–63`). Choosing one both changes the debrief and updates the two-attempt comparison selection. Rechoosing it removes it from the comparison while keeping it as debrief focus (`116–118`). [ASSUMED] Give each row distinct “View debrief” and “Compare A/B” semantics, or explicitly describe the dual action.
- The chain puts Recall and Erase between picking the attempts and Overlay. [ASSUMED] Move reset/storage management behind the comparison work, or into a clearly labelled management group at the end. This is an order issue, not a missing native confirmation: ERASE already calls `window.confirm` (`194–195`).
- “OVERLAY IN FLIGHT” only calls `desk.setCompare`; it does not open flight (`280`). A keyboard player still needs Escape then 4. Label it “Set flight overlay,” or provide a separate “View in flight” action.
- Debrief can be longer than the viewport yet has no focusable content; verify K5. On recurrence the desk selects Black Box (`src/app/loop.ts:114–119,130–135`), but the player is at the room door and no console focus is transferred (K2).

### SYSTEMS

**Order:** configuration mode chips in Stores and heat; each equipment button in descending current power draw; selected component's mode chips → Allocate number (if rated power > 0) → RESET (if tripped/faulted with a reset mode); footer. Power and most Stores/heat readouts add no ordinary Tab stops.

Sources: `src/console/pages/SystemsPage.tsx:72–105,121–125,192–226`.

- Selection and controls are keyboard reachable. Selecting an early equipment row leaves every later equipment row between focus and its detail controls because all equipment precedes Detail in DOM (`203–226`). [ASSUMED] Add an “Adjust selected component” link or move focus to a labelled detail heading after activation, with a “Back to equipment” route.
- The equipment list resorts on **live** power draw (`121–125`); an operating change can move the focused component's DOM position. Even if React retains the element's focus, the next/previous tab stop can change while reading. [ASSUMED] Use a stable authored/alphabetic order, or freeze the displayed order during keyboard interaction and offer explicit sorting.
- The list intentionally excludes passive equipment of kind `other` unless it draws power (`32–33,121–123`). That is a scope/filter decision, not specifically a keyboard failure; SHIP is the fuller assembly-inspection path.
- Number allocation issues a command on every change (`86–95`). Normal arrow stepping is possible; do not let a scene shortcut capture those keys. K3 currently excludes numeric inputs, which is useful and should be preserved.
- RESET is not explicitly disabled in an ended attempt (`97–105`), unlike allocation/mode controls. [ASSUMED] Align disabled state with the game's command availability so a keyboard focus stop never promises an ineffective repair.

## Room and hologram surfaces

| Surface | What keyboard can do now | Missing or confusing reach |
| --- | --- | --- |
| Room | W/A/S/D walk; Up/Down also forward/back; Left/Right yaw. From outside console, 1 MAP, 2 SHIP, 3 CONSOLE, 4 FLIGHT, 0 room. F or Enter activates the aimed hotspot. `RoomView.ts:258–270,530–549`. | The first hint says click/WASD/aim, omitting number shortcuts and arrow yaw (`ControlRoom.tsx:95–97`). No keyboard look-pitch control; hotspot targeting depends on view direction. Canvas has no labelled focusable target (`81`). K1 adds invisible stops. Number shortcuts can bypass physically walking to the station; this is existing behavior, not a newly proposed shortcut. |
| MAP overview | ENTER REGION is a real button; with the current one charted region, it defaults to this region without requiring a canvas pick (`src/console/MapPlate.tsx:23–39`). Escape steps back. | Overview region/lead picking is mouse raycasting only (`RoomView.ts:568–570`); wheel zoom and drag orbit/tilt have no keyboard equivalent (`594–597,602–613`). When more regions arrive, a DOM list of charted objects is needed; it must use the same chart data. After the visible button comes K1's hidden console. |
| MAP region | BACK TO THE CHART; Escape returns to overview (`MapPlate.tsx:37–39`; `RoomView.ts:222–225`). | Local range is wheel only (`609–610`). “ENTER REGION” changes map scale/view, not the encounter phase; distinguish it from ENTER Gravity range. |
| SHIP vehicle/system | VEHICLE → system buttons → configuration chips → components (when isolated) → selected EquipmentDetail controls. System and component selection therefore have a real keyboard alternative to clicking the hologram (`src/console/ShipPanels.tsx:209–267`). Escape leaves isolation first, then the view (`RoomView.ts:222–225`). | Hologram rotation/tilt/zoom is mouse-only (`RoomView.ts:594–597,612–613`). Switching system removes component controls without focus restoration. System buttons show state via `data-on`, not `aria-pressed` (`ShipPanels.tsx:212–218`). K4 applies to configuration and equipment modes; K1 adds hidden console controls. |
| FLIGHT | ENTER or six warp buttons → CHART UP/HEADING UP → POINT CAMERA → CLEAR if an object is selected (`src/console/FlightHud.tsx:80–82,129–132,171–186`). U changes chart/heading orientation. Flight keys map to yaw/pitch/translation/throttle, X cuts, Shift reduces main throttle (`src/app/hands.ts:39–56`). Escape leaves view. | Initial object selection is mouse-only (`RoomView.ts:574–575`); point-camera controls are conditional on that selection. PLAN/MISSION target selects are a partial camera-pointing alternative, not a FLIGHT inspection alternative. Range and tilt are mouse-only. Space activation on all visible native buttons is blocked by K3. No on-screen X/Shift hint appears in CAPS (`FlightHud.tsx:31–47`). K1 adds invisible duplicate time controls. |
| Loss/return | Scene navigation `go()` refuses transitions during death (`RoomView.ts:208–209`); normal room keys work after return. | Hidden console navigation remains focusable. HUD is merely `data-hidden` (`ControlRoom.tsx:90`), and the loss screen has no focus/announcement contract (`123–127`). Make all obscured controls inert during the sequence, then restore room focus. This should not add a “dismiss loss” requirement or pause the next encounter. |

[ASSUMED] Small keyboard-equivalent controls for 3D manipulation should change camera framing only: range −/+, orbit/tilt controls and reset framing. Scene object lists must contain only already sensed/charted objects (P11), and selection must not improve sensing or issue a burn by itself (P6). No model or shared contract changes are needed for the focus fixes. A future chart list may need more chart data when the expedition supplies multiple regions, but the selection UI stays in 2D's lane.

## Verification for 2D

These are acceptance checks to run after implementation, not claims this static review has passed them.

1. On a fresh load, press Tab/Shift+Tab through the room. There must be no invisible stop and no way to start the encounter by activating a hidden control. Repeat in MAP, SHIP, FLIGHT, camera transitions and loss. At return, visible room focus is restored.
2. Open CONSOLE using keyboard, visit all five pages, and exercise every order listed above using Enter and Space. The selected page/state is exposed; no key intended for a control moves/fires the ship. Escape in an open native select must not also leave the view.
3. Add two burns and two pointing rows; verify focus enters the new row, repeated labels identify the right row, removing a focused row leaves a useful visible target, and a trip to MODEL/FLIGHT preserves the draft without committing it.
4. In MODEL, test the zero/one/two-finished-attempt states; disabled reasons remain readable; a completed test announces once; adoption remains an explicit player action. Reach all report text using keyboard at 1024×640, 1280×720, 1366×768 and 1920×1080.
5. In BLACK BOX, choose A/B, read the complete debrief, set/clear overlay, and return to flight. Cancel the native erase confirmation; records remain. The ordinary path to comparison should not pass through reset controls once reordered.
6. In SYSTEMS/SHIP, select the first, middle and last equipment rows; reach detail immediately and return to the list; change power while the list updates; ensure focus remains on the same equipment and order does not change unexpectedly.
7. In FLIGHT, activate each visible time/orientation button with Space and Enter, then return focus to flying. From the scene surface, verify W/Shift/S/A/D/R/F/Q/E/arrows/X and release/blur behavior. Changing focus never pauses an active encounter; hidden-page behavior remains A12.

[ASSUMED] The minimum useful package is K1–K4 plus PLAN's new-row focus and draft preservation. It fixes accidental hidden starts, dead Space presses, lost edits and excess chip traversal. The fuller package also provides keyboard 3D framing, sensed-object selection, stable equipment traversal and readable evidence summaries. Omitting those leaves the learning loop operable mainly through the console, with substantial parts of the 3D inspection still pointer dependent.
