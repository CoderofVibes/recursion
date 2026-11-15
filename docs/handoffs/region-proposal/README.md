# Recursion region and expedition proposal

From Codex to the main Claude project thread. Prepared November 14, 2026, Pacific time, for owner review.

Recursion's existing engineering encounters become recognizable places in a vast, fully three-dimensional universe. This proposal covers all twenty catalogue entries and three additions, with a branching route that supports learning in either order and carries pressure into familiar passages. The owner requested this package after reviewing the concepts and interactive flow.

## Delivered

- [regions.md](regions.md): all 23 environments, preserving catalogue IDs, with arrival views, memorable moments, engineering questions, retained failure evidence, repeat-run variation and physics scope.
- [flow.html](flow.html): standalone interactive diagram. Open in a browser; hover, focus or tap an environment for its description, learning opportunity, pressure and systems. Selecting a node emphasizes its connections.
- [flow.fragment.html](flow.fragment.html): editable source for the diagram, including its node descriptions and 32 connections. The standalone export includes its styles and supporting runtime; the fragment alone expects a visualization host.
- [CLAUDE_PROMPT.txt](CLAUDE_PROMPT.txt): short prompt to paste into the main project thread.

The package adds proposal files only. It does not change the creative brief, decisions log, existing expedition catalogue, application code or another thread's UI work.

## Owner direction to preserve

These are user instructions and clarifications from the originating conversation, not new approvals inferred from the proposal:

1. The player wakes in a walkable control room and flies the actual ship by hand in full 3D.
2. The unfamiliar gravity law must be learned from acquired observations. Predictions begin with familiar physics and improve from evidence.
3. Losing the ship restarts the whole expedition. Black Box records and model learning persist.
4. Layout varies **between expeditions**. Returning to the same region multiple times within one expedition is not required. The owner explicitly confirmed this distinction as important. Ordinary motion and evolving geometry continue during a run.
5. Learning makes passages easier, but they must retain pressure and skill. The owner's clarification was: "Make it easier but not a cake walk. there should still be pressure and skill involved."
6. The map depicts charted space as a 3D volume and zooms into regions in 3D. A separate thread owns development of the 3D UI environment. This diagram is a planning view, not a prescription for its layout or controls.
7. Borrowed Spin received specific enthusiasm: "This sounds very cool." Give it serious consideration, while treating its hardware, physics and implementation commitment as unresolved.
8. The owner's initial example ideas were explicitly offered for consideration, without automatic precedence over the project folder.

The owner's positive response to the diagram authorizes packaging this proposal. It does not settle every proposed name, route, system addition or build priority.

## Proposed world structure

[ASSUMED] Use substantial places containing observation pockets, experiments and difficult transits. Twenty-three entries do not imply twenty-three compulsory rooms or twenty-three separate simulators. Listening Shelf and Shadow Observatory can share a large formation; Red Wall belongs near Sunward; Hinge belongs near the Well Garden; Missing Room belongs beside the Cathedral; Crooked Ship is a maneuver pocket near Stillwater.

Keep the physical laws stable across recurrences. Vary local geometry, orientations, initial motion, illumination and route opportunities within authored constraints. Exact generation rules remain an implementation decision. Old telemetry retains its original layout and conditions; it must not silently become a current obstacle map.

Optional investigation trades travel, operating risk and reserves for evidence or a better subsequent maneuver. Successful experiments teach too. No mandatory deaths, visited-region tokens, upgrade grind or automatically retimed autopilot procedures are proposed.

The broad route is:

```text
Unfamiliar Sky → Twin Deeps → Lantern Field

Power / thermal:
Lantern Field → Listening Shelf → Sunward → Well Garden
             → Back of the World → Stillwater

Sensing / navigation:
Lantern Field → Shadow Observatory → Far Aperture
             → Unseen Cathedral → Stillwater

Optional cross-transfer: Well Garden ↔ Unseen Cathedral

Stillwater → Braided Crossing → Turning Rim → Passage → Familiar Sky
```

Each branch above is one continuous chain; wrapped lines continue the previous line. The arrows indicate suggested progression, not one-way physical walls or distances. The universe remains spatially expansive. The Passage is the terminal homeward commitment.

The cross-transfer permits both signature hazards in either order without revisiting a region:

- Power first: Listening Shelf → Sunward → Well Garden → Unseen Cathedral → Stillwater.
- Sensing first: Shadow Observatory → Far Aperture → Unseen Cathedral → Well Garden → Back of the World → Stillwater.

This is not a requirement to complete both arms. Broad observation and local experiments must support capable alternate routes; assess those opportunities in actual encounter design. Early reconnaissance of the exit can reveal missing capabilities without imposing a return loop. Waiting for a new window or voluntarily revisiting remains possible where ship state and geometry permit.

| Optional environment | Enter from | Rejoin farther ahead at |
| --- | --- | --- |
| Tidal Orchard | Twin Deeps | Lantern Field |
| Red Wall | Sunward | Well Garden |
| Hinge | Well Garden | Back of the World |
| Petal Gallery | Far Aperture | Unseen Cathedral |
| Missing Room | Far Aperture | Unseen Cathedral |
| Countercurrent | Back of the World | Stillwater |
| Borrowed Spin | Unseen Cathedral | Stillwater |
| Crooked Ship | Stillwater | Braided Crossing |

## Pressure after learning

[ASSUMED] Retained knowledge reduces uncertainty and permits more efficient maneuvers. Execution still depends on fresh geometry, incoming momentum, component condition, deployment time, thermal history, remaining energy and control authority. Optional quiet experiments may expire; their surrounding transfers still consume real resources. Do not erase learned rules, invent surprise failures or impose a universal countdown to recreate difficulty.

For example, a player who understands the lattice still has to turn and move the entire spacecraft through differently oriented openings while powering useful observations. A player who understands a well still has to carry the right momentum and time burns across its measured boundary. A successful tether capture can still lead to a poor release trajectory.

## Systems and scientific boundaries

Reuse labels refer to the existing **design vocabulary**, not a claim that every feature is implemented or validated. Full 3D requires real attitude/control authority and whole-ship swept volumes; it is not a cosmetic extrusion of the planar catalogue.

| System | Preserved boundary |
| --- | --- |
| Gravity and motion | [FICTIONAL] The brief's normalized inverse-2.5 attraction applies consistently to relevant bodies. Infer gravity from tracking, not a gravity reading on a freely coasting accelerometer. |
| Ship operation | Electrical protection, thermal transport, propulsion, mass distribution, configuration and condition share one surviving ship state. No region-boundary refill or repair. |
| Measurement | Models use acquired observations. Preserve issued forecasts, gaps, uncertainty and original conditions. Reconstructed fields are not omniscient optical truth. |
| Inverse wells | [FICTIONAL] Reverse the radial effect of propulsion locally. Coasting velocity, ordinary gravity and tangential propulsion do not reverse. Funnel imagery is an instrument convention. The Hinge's near-zero radial control band depends on adopting the proposed smooth transition. |
| Lattice | [FICTIONAL] Spatial strands cause steep, cumulative component exposure. Whole-ship clearance and finite field extents matter; processing uses existing sensor hardware. |
| Paired openings | [FICTIONAL] Mapped views and pose/motion transfer through finite moving boundaries. Partial crossing and full-ship clearance require substantial work within this system. |

The new additions need explicitly additional physics work:

- **Countercurrent:** gas density/flow, relative velocity, drag, distributed torque and heating. Ordinary physical mechanisms, newly modeled in this game.
- **Tidal Orchard:** distributed attraction and gravity-gradient torque on an extended spacecraft, using the same gravity law. Demonstrate perceptible effects at playable scales before committing.
- **Borrowed Spin:** capture hardware, tether tension/dynamics, structural limits, coupled momentum exchange and release. This is a substantial new system, not a free slingshot or scripted path.

## Changes proposed to the earlier catalogue

- Replace planar geometry and flight-plane assumptions with volumetric region design.
- Replace the fixed-layout assumption with the owner's between-expedition variation direction; keep authored identities and learnable laws.
- Replace mandatory branch-return loops with forward-rejoining alternatives and one optional cross-transfer.
- Give experiment labels place identities while retaining IDs for integration.
- Use tiny observation-only Petal openings initially, giving the later ship-sized passage greater significance.
- Prefer existing deployment and consumable imbalance for Crooked Ship. Installing or moving modules would need an additional reconfiguration system.
- Make Sunward's first light opening an ordinary geometric gap, keeping the power branch independent of paired-opening implementation.
- Preserve earlier physically valid Earth sightings. The emotional payoff is the surviving return and the room not resetting.

## Review requested from Claude

Start by assessing this topology and its pressure against the current build. Present the owner with the first consequential decision: whether to adopt the two forward branches, optional cross-transfer and forward-rejoining detours as the organizing structure.

Then identify which environments are distinct authored volumes and which are pockets within them. Reconcile six-axis ship capability, sensing, configuration and retained evidence with the latest implementation rather than treating earlier planar documents as authoritative over the owner's direction. Treat new physics choices separately, with Borrowed Spin given a concrete feasibility assessment because of the owner's interest.

Suggested principal landmarks are Twin Deeps, Sunward, the Well Garden, the Unseen Cathedral, Petal Gallery and the Turning Rim. Countercurrent was Codex's recommended first addition; that ranking is a proposal, not an owner decision. Keep the high-level review ahead of detailed implementation assignments.

## How to verify

Open `flow.html` in a browser. Check all 23 environment labels, descriptions on hover/focus/tap, selected connection highlighting, branch cross-transfer and forward rejoins. The source is `flow.fragment.html`; its node list and connection list are also readable without running it.

[DEMONSTRATED: source checks] The packaged data has 23 unique environments and 32 valid connections; both example branch orders use distinct regions; every optional detour has an incoming and outgoing optional link. Embedded diagram JavaScript parses. The original routing check found no collisions using estimated node dimensions at widths 736, 560, 559 and 320 pixels. Estimated dimensions are not a browser layout verification.

The standalone export was generated successfully. Browser visual and hover verification remains outstanding: the local preview environment was unavailable during preparation. No transfer cost, timing, generative layout, hazard clearance or full expedition playability has been demonstrated by this proposal.

## Source context and ownership

- [Creative brief](../../CREATIVE_BRIEF.md): governing creative direction, with the owner's later conversation clarifications above.
- [Original expedition catalogue](../../design/expedition.md): twenty encounters and six reusable systems.
- [Visual direction](../../design/visual-direction.md): existing presentation context; its older planar assumptions are superseded by owner direction.
- [Physics derivation](../../physics/derivation.md) and [ship couplings](../../engineering/gameplay-couplings.md): system boundaries used in the concepts.

The owner remains the creative decision-maker. Main-thread integration owns changes to the expedition, decisions and build plan after review. The separate 3D UI thread owns presentation implementation. This package is a bounded design handoff, not an instruction to launch all proposed systems or reassign existing work.
