# 1F — Expedition and encounter design

**Thread:** GPT/Codex · **Branch:** `p1/1f-expedition` · **Phase:** 1 (parallel)

## Context
Recursion is a browser-based spacecraft engineering roguelike for NASA Space Apps 2026: one authored expedition (no procedural generation for this event), recurrence after loss or voluntary recall, knowledge and evidence carried across attempts by Black Box and the ship's predictive model. Read first, fully:
- `docs/CREATIVE_BRIEF.md`. All of it; §2, §5–§9 and §13 are central.
- `docs/DECISIONS.md`, especially P5 (model learns numbers, player supplies rules), P6, P8 (recurrence contract), P9 (saved procedures).
- `docs/build-plan/README.md` § Conventions.

## Goal
A proposed structure for the whole expedition that the owner can approve, adjust or reject, and that the build can implement with a small number of reusable simulation systems.

## You own
`docs/design/expedition.md`, `docs/design/encounter-template.md`.

## Constraints from the brief
- Roughly twenty meaningful encounters is an ambition, not twenty separate systems or twenty compulsory rooms. Aim for **six or fewer distinct simulation systems** in total, reused in different combinations.
- Every encounter involves meaningful engineering or experimentation, including flight-focused ones.
- Two complementary learning branches, playable in either order: **power/thermal operating knowledge** and **sensing/navigation knowledge**. Both must matter later.
- Optional offshoots stay useful only while the player has an unanswered question (Petal Gallery is the example).
- Progress depends on demonstrated capability and a workable procedure, never visited-region flags.
- First contact with the possible homeward passage after roughly 12–15 meaningful encounters, as a pacing intention. It may come before the player can survive it and should expose specific shortcomings.
- The homeward passage is a finite moving opening that combines knowledge, configuration, measurement, maneuver execution and resource management. Surviving ship state carries through; no repair or refill.
- No required deaths. Successful experiments teach too. No password-style answers.
- Must include the owner's encounters: two-mass inverse-2.5 gravity field (§5), Chain Link Fence (§6), Inverse Wells (§7), Petal Gallery (§8).

## Deliverables
1. `docs/design/expedition.md`:
   - The expedition graph (nodes, connections, how travel between them works, where the glimmer leads point).
   - One compact entry per encounter (a table row or short block, no prose dumps): id, name, kind (flight and operation / observation and interpretation / controlled experiment / combined), branch, the question it poses, what success teaches, what failure teaches, evidence it gives the predictive model, the capability or procedure needed to move on, whether it's optional and when it stops being useful, systems involved, build cost (light reuse / medium / heavy new system).
   - Which simulation systems exist and which encounters reuse each.
   - Run-length targets: a first exploratory run vs an expert run to the homeward passage.
   - How recurrence (P8) and saved procedures (P9) change the experience of each repeated passage.
   - The homeward passage and the Earth arrival payoff.
   - A short list of the open creative questions the owner needs to decide.
2. `docs/design/encounter-template.md`: the fields a content author fills in to define an encounter.

## Done when
The owner can read the expedition in under ten minutes and see the whole arc, the two branches and what each encounter costs to build.

## Out of scope
Physics values (section 1B) and equipment ratings (section 1C) are being written in parallel; mark any dependence as an assumption. No code.

## Handoff
Write `docs/handoffs/1F.md` from `docs/handoffs/TEMPLATE.md`.
