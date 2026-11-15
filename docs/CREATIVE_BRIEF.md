# Recursion — creative brief

Creative direction from the owner, recorded verbatim from the planning conversation on 2026-11-14. This file holds direction only. Proposed implementation choices and demonstrated build results are kept separately and must not be merged into this file.

---

## Preamble

One thing to note: This is a roguelike game.

## 1. What Recursion is

A crewed spacecraft returning from Mars encounters an unidentified phenomenon and enters an unfamiliar universe. The ship becomes caught in recurrence. The player must understand this environment, engineer solutions, discover a way home and successfully navigate it.

The player fantasy is resourceful spacecraft engineering under uncertainty: adapting, experimenting and improvising with the equipment available.

The universe should feel vast and perplexing. The exit is not obvious or labeled. Several "glimmer" leads suggest places worth investigating without revealing which one leads home.

The player operates primarily from an onboard mission-control station. This is a game about understanding and operating a spacecraft, with consequential flying—not a sequence of debris-dodging courses.

## 2. The central gameplay loop

Configure → predict → operate → observe → investigate → revise → explore.

The player changes equipment configurations, power allocations, operating sequences or maneuvers, then sees the consequences.

A signature experience is comparing two attempts:
- What did I change?
- What actually happened?
- Where did the result differ from the prediction?
- What does the evidence support?
- Does that explanation work somewhere else?

Failure can teach, but successful experiments must teach too. Do not require a certain number of deaths to progress.

## 3. Recurrence and Black Box

After recurrence, the spacecraft returns to a starting condition while useful records and knowledge persist through Black Box. The precise reset conditions, voluntary recall rules and persistence details still need a coherent implementation decision.

Black Box began as an ordinary flight recorder. It now has an unusual role in preserving evidence across attempts.

It helps the player inspect observations, compare forecasts and outcomes, and develop better explanations. It should feel like part of the ship, not an omniscient narrator that announces solutions.

Predictions must use information available to the player. They cannot secretly know undiscovered physics. Preserve the forecast originally issued, and show missing or uncertain data honestly.

As understanding improves, familiar passages become easier. Do not secretly change their rules or erase knowledge to keep them difficult.

## 4. Engineering belongs everywhere

Every encounter should involve meaningful engineering or experimentation, including encounters focused on flying.

Relevant systems include:
- Electrical supply, storage, distribution and protection.
- Heat generation, transport and rejection.
- Propulsion, propellant and maneuver scheduling.
- Mass distribution, thrust alignment and attitude control.
- Sensors, pointing, processing and data quality.
- Equipment condition, redundancy and configuration.

These systems should interact through shared ship state. A power decision can affect sensing; a configuration change can affect clearance, cooling and maneuverability.

Use established spacecraft engineering as the foundation. Exact hardware ratings and component inventories are not settled by this brief.

## 5. Discovering unfamiliar gravity in a two-mass asteroid field

Another encounter I envision is navigating an asteroid field influenced by two large planets or other massive bodies.

The player initially relies on familiar Newtonian gravity. However, attraction in this universe falls with distance according to an inverse-2.5-power relationship rather than the familiar inverse-square relationship:

F ∝ Mm / r^2.5

This states the intended distance dependence. Establish a dimensionally consistent normalization during the physics work; do not simply change the exponent while assuming the ordinary gravitational constant retains the same units.

The ship's observed motion should gradually expose the mismatch between its predictions and the environment. The two masses and surrounding asteroids create a practical reason to investigate: an inaccurate model affects maneuver timing, clearance and the predicted movement of nearby objects.

The player should be able to gather observations at different distances, compare coasting with powered motion, and test whether revised predictions explain a separate observation. Distinguish an incorrect distance law from an incorrect mass estimate or an overlooked contribution from the second body.

Apply the declared attraction consistently to the ship, asteroids and other relevant bodies. Their motion should belong to the same physical environment.

The experience should combine navigation, equipment operation and scientific investigation. Simply dodging asteroids is not the whole challenge.

A broad, cautious approach can provide useful evidence. Better understanding should enable more confident and efficient maneuvers later. The player should not have to type "2.5" as a password, and death should not be required to discover the relationship.

## 6. My Chain Link Fence encounter

The player enters a region that initially appears to present an ordinary navigation challenge: debris, asteroids or a maneuver around a body.

An unseen, overlapping lattice-like radiation environment creates the real danger. The strongest exposure lies along the "chain links." Damage increases steeply as the ship approaches those strands. Clear centers of the openings allow damage-free passage.

Several glancing exposures may be survivable while accumulating electrical damage. Severe contact can disable critical electrical capability. Do not reduce this to a random survival roll or a universal two-hit counter.

There are enough overlapping layers that blindly traversing the entire region is extraordinarily unlikely.

Black Box has quietly introduced a new processing mode using EXISTING sensor hardware. It does not give the player new physical equipment.

Initially, this may appear as an unexplained channel or processing function with an adjustable power allocation. Recorded behavior provides a clue to its purpose.

When appropriately powered, it produces a fictional three-dimensional reconstruction of the lattice on the navigation display. Strands appear intense, fading toward the clear centers.

Power allocation affects the usefulness of the reconstruction and competes with other equipment. Navigation must account for the whole spacecraft, not merely its center point.

An attentive player could investigate before dying; recurrence is not a required unlock. Even after discovery, flying and operating through the lattice should require skill.

## 7. My Inverse Wells encounter

A field of strange wells appears on the console as long, narrow funnel-like visualizations.

Inside a well's influence, the radial effect of actual propulsion reverses:
- Thrust directed away from the well can accelerate the ship toward it.
- Thrust directed toward the well can accelerate it away.
- Tangential propulsion remains ordinary.

Existing sideways motion, timing and control authority matter. An inward-directed burn can help the ship curve around the well instead of falling into it.

Ordinary propulsion response returns across the boundary, making entry and exit important.

The initial predictive model and the player's instincts may recommend the wrong action. Observations and controlled comparisons should reveal the relationship.

This is an explicitly fictional local rule. Its exact profile, dimensions and difficulty remain implementation choices. Discovering the rule should help substantially without guaranteeing success.

> **Owner's clarification (2026-11-14, recorded by the integrator; DECISIONS A19):** the funnels are real, not only a drawing. Wells are long, narrow funnels at random orientations through 3D. They pull the ship in, and the narrow end crushes it. There's a big field of them, and new ones appear.

## 8. Expedition structure and variety

For this event, build one authored expedition. Defer fresh-game procedural world generation.

Roughly twenty meaningful encounters is an ambition, not a demand for twenty separate simulation systems or twenty compulsory rooms.

Include a mixture of:
- Challenging flight and equipment operation.
- Observation and interpretation.
- Controlled configuration experiments.
- Later situations combining earlier lessons.

Some investigations should be optional offshoots that remain useful only while the player has an unanswered question.

Petal Gallery is an example: investigate an apparently repeated object or view, distinguish possible explanations and learn something about spatial connections. Once the question is answered, there should be no artificial requirement to revisit it every attempt.

I want two complementary learning branches that can be explored in either order: one develops power/thermal operating knowledge; the other develops sensing/navigation knowledge. Both should contribute materially to later success. Retained evidence should prevent unnecessary repetition.

Progress should depend on demonstrated capability and a workable procedure, not arbitrary visited-region flags.

## 9. Finding home

First contact with the possible homeward passage should generally happen after roughly twelve to fifteen meaningful encounters, depending on exploration. That is a pacing intention, not a numerical gate.

The player may reach it before understanding how to survive it. Encountering it should reveal specific shortcomings and give further exploration a purpose.

The final passage combines accumulated knowledge, configuration, measurements, maneuver execution and resource management. It is a finite moving opening, not simply a destination marker.

The actual surviving ship state carries through. No automatic repair or refill.

Reaching Earth is the emotional payoff. However, do not suppress a physically valid earlier observation just to preserve a surprise.

## 10. Presentation and controls

I envision a physical command table in a dim spacecraft compartment, with an integrated display and spatial representations of the ship and its surroundings.

While flying, the player can see the spacecraft in a live 3D sensor view. Objects and phenomena appear according to actual sensing capability and coverage.

Selecting equipment should expose useful controls, component relationships, readings and history.

A dotted reference guide may help convey orientation or motion. Decide what it represents clearly; center of mass, body axis, thrust direction and velocity are different quantities.

Black Box should have a recognizable presence integrated into operation and investigation.

Use clear instruments, motion and restrained feedback. Avoid filling the interface with explanatory prose.

Safe preparation should allow deliberate thought without a universal countdown. Local commitments, changing geometry and real resource limits create pressure.

### Addendum: screen composition (owner, 2026-11-14, given to 1E)

> My vision is a real 3D room with a large center command station console in the middle. When the player "revives" they enter the room and have basic wsad controls to walk. There is a large panoramic (maybe 90-180 degree) viewing window of the expanse before the player and the control console. The console can do many things. Click on map and a large holographic 3D map projects. It is interactive - get the full view of the whole universe the player is within, or select sections, actual encounter environments - I'd like information pertinent to the environments to be available in this map.
>
> Note - when the map is selected, the player view goes to the map. The whole room is no longer in view so the player can focus on the visuals and interaction with the map. I'd like to know what other features of this map you'd think we should add, given the context you have regarding the game.
>
> There should also be a ship view that lets the player inspect the ship, select different systems, everything you can think of there - in 3D holographic view. Please let me know if you have questions from other threads for details needed for any of this. Again, when the player selects this, the view is on this 3D ship selection and the whole room is no longer visible so the player can focus.
>
> The main console can be accesses which is where all of the other functions and screens can be accessed. Anything from data assessment, predictive model viewing, system conditions and summary, Black Box (whatever we decide on that meaning) basically everything else. While the map and ship view are 3D and projected above the main console, this screen is in the console so the player is looking down into it. The screen on the console takes over the screen the player sees.
>
> There is also a flight screen the player will enter during encounters. I'd like for it to be a 3D projection above the console like the other 3D projections, but in this you can see the back ground which is the view of the environment ahead. The player should have the holographic ship in front of them, with perhaps things like a center of mass dotted line, the ship's movement and tilt/rotation on an access, controls for thrust forward/back, and lateral movement. Objects and other scans (think the lattice when the player makes the engineering decision to allocate resources to the black box scanning function) will pop up on this 3D display and the window in the back drop should also show if an object is approaching (like a big asteroid - it should be seen through the window and on the 3D projection).
>
> When the ship is destroyed and the player fails the screen should go black (maybe some camera shaking up and down to simulate the space craft's failure) and the game restarts at the beginning (roguelikes are cruel) with the player walking into the control room and seeing the initial environment. Player hands and such are not part of this game - just a 1st person view and a small white dot on the screen to show what the player is interacting with (something subtle like that).

### Addendum: answers and further direction (owner, 2026-11-14, given to 1E)

Answering 1E's questions on the composition:

> 1. Time does pass while you're in the room and walking around. You're just in open space most of the time traveling between encounters. I'd love for, at some point, us to build a cool universe environment the player sees as they walk the room and prepare. Also, the visuals of things like the gravity wells should be great too. But that is for later.
> 2. Agreed - map should only view what has been charted. It should be 3D not just on a plane - the universe expands in all directions and the player isn't taking a linear path through it. A 3D holographic map would be best. And when selecting an environment, the player's view should then zoom to that environment, it is 3D as well and see the environment in detail. So each environment will have to be built out.
> 3. I would like the flight to be in 3D space - I believe it is doable. Not just flying on a flat plane.
> 4. 8m wide is fine.

And further direction:

> I'd like for the control room to actually look like a control room, not an empty room with a console and two screens. Please use the images as references to fill out the room environment.
>
> The player in the flight view should fly hands on. Predictive modeling should help in some way that is yet to be determined.
>
> The ship is a good first pass but it looks like a plain cylinder with square/rectangle boxes in it. I attached a blue print. What I'd like is for the the ship to have that detail, but in 3D. Each system, when selected, should isolate the system and project and image of the system and its components, looking like the reference image but in 3D. There should be readouts included in each system screen, graphs, data, bars presenting levels, things like that. [...] I want the ship and its systems in this view to look cool, present well, and have data/info displayed in a clean way with the system image when selected.
>
> For the flight screen, the ship should be farther back on the flight screen so the player can see objects and scanned things ahead of it.

The reference images stay out of the repository at the owner's request.

## 11. Physics derivation during the build

At some point during the hackathon build window, I plan to give Codex a focused assignment to re-derive the relevant physics from our chosen fictional assumptions, including the inverse-2.5 gravity law.

That work should establish consistent equations, units, normalization, assumptions and limits, then explain the consequences for trajectories, orbital behavior, energy, maneuver planning and control. It should also identify resulting demands on propulsion, equipment scheduling, electrical power and cooling.

Ordinary spacecraft engineering remains the foundation unless we explicitly choose another fictional departure. Changing the gravity law does not automatically change every other law.

Keep this as a bounded work package with a written handoff to Claude. Coordinate only when a real blocker or shared-interface decision requires it.

Treat the results as proposed mathematics until independently checked and tested in the implementation. Keep uncertainty and unresolved questions visible.

## 12. How we should work

I am the creative decision-maker. Keep discussion concise and address one consequential decision at a time.

Use bounded builder assignments and clear file ownership. Keep Claude–Codex communication limited to batched handoffs, real blockers and shared-interface changes. Avoid continuous agent conversations and repeated full-project reviews.

Separate:
- Creative direction established in this brief.
- Proposed implementation choices.
- Results actually demonstrated by the build.

Do not treat a paper calculation as proof that a route is playable.

## 13. Predictive model (added during planning, 2026-11-14)

I forgot we need some sort of predictive modeling built into the game. At first, it runs off of physics and the universe as we know it. Any decision the player makes will have an effect on the predictive model - As the player navigates the new universe, the predictive model improves from data inputs. But the player needs to actually acquire data, interact with the universe/environments, and, most importantly, try and fail along the way. The predictive model will not be the end all be all. There is still thought and skill that needs to be put into the game. The player will have to make informed engineering decisions, fly the ship, all of that.

## 14. NASA GMAT cross-check (approved during planning, 2026-11-14)

Summary, not verbatim: the owner approved checking the game's starting (Newtonian) forecaster against NASA's General Mission Analysis Tool (GMAT), which is on the challenge's NASA resource list.
