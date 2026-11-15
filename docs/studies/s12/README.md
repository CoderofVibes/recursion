# S12 — Submission package, drafted

Prepared **2026-11-14 Pacific**, in `.worktrees/s12` on `st/s12-submission-drafts`, from **`6ac2485625157d1a908c9cd5b3dcf1a38f763981`**. The owner writes the final words; this package does not change approved scope, choose a licence, publish a release or submit the project.

**Recommendation [ASSUMED]:** lead with the player's experiment: choose a requirement, operate the ship, compare the issued forecast with the measured outcome, retain evidence and test an explanation. Describe the current **Gravity range prototype** honestly. Use the seven-slide demo to make the requirement, resource cost, held-out evidence and later observation readable. The ambitious version captures the full learning sequence in the verified 3D release; the smaller evidence-only alternative explicitly loses the successful revision payoff. Neither is proof of a completed journey home.

## Deliverables

| File | Use |
|---|---|
| [drafts.md](drafts.md) | Summary; three one-sentence openings; description; NASA resource text; gated C5–C7 addition; AI disclosure; credits and notice summary. Copy rendered blockquotes only. |
| [demo.md](demo.md) | Six-shot, exactly 30-second storyboard; seven-slide alternative including title/close; eight capture requests with readiness and acceptance evidence. |
| [claim-ledger.md](claim-ledger.md) | Every public sentence/caption, exact wording, Convention 4 label, evidence and missing-proof/release conditions. |
| [claim-evidence.json](claim-evidence.json) | Editable source map for the ledger, with frozen baseline and 2G document revision. |
| [finalization.md](finalization.md) | Per-field remaining work, source discrepancies, release handoff, estimates and separate owner decisions. |
| [check_package.py](../../../tools/studies/s12/check_package.py) | Deterministic offline coverage, copy-length, local-link, readiness and timing check; generates the ledger and JSON report. |
| [validation.json](../../../tools/studies/s12/validation.json) | Counts, evidence-file hashes and package-check results; text caps remain explicitly unknown. |
| [handoff](../../handoffs/s12.md) | Integrator entry point and exact verification commands. |

## Evidence boundaries that matter

- [DEMONSTRATED: `tools/studies/s12/check_package.py --check`] **72 public sentences/captions** map to evidence, across **10 copy blocks**; the storyboard totals **30 seconds** and the outline has **seven slides**. The main summary is **66 words / 422 characters** and description **392 words / 2,670 characters**, excluding attached links and paragraph breaks. These counts do not establish portal fit while its caps are unknown.
- [DEMONSTRATED: S12 rerun of `src/sim/gmat.test.ts`, `src/console/console.test.ts`, `src/game/session.test.ts`, `src/contracts/boundary.test.ts`] **55 existing tests passed**. The four committed GMAT scripts reproduce; **19 Python integrity tests passed**, and all **13,616 stored samples** passed independent verification. No new GMAT execution, 2G test run, full application suite/build, browser session or human playtest was performed by S12.
- [ESTABLISHED: S10's [AI provenance](../s10/ai-provenance.md)] Follow actual deliveries: Claude delivered 1G; Codex prepared 1D before Claude ran GMAT. Do not guess historical Codex versions or copy personal git identities. This S12 draft/tool is itself AI-assisted work and is disclosed.
- [DEMONSTRATED: S9 [observations](../s9/browser-observations.md) and nine screenshots inspected by S12] The live interface and retained evidence are visible. Screenshot 04 is beyond the forecast horizon; screenshot 08 shows a covered discrepancy; screenshot 09 is **TESTING**, not an adoption success. S9 did not identify its deployment SHA. 2D's Update 2 supplies prior scripted adoption evidence, not a cold-player result.
- [ESTABLISHED: read-only `git show p2/2g-3d-flight:docs/handoffs/2G.md` and `:docs/verification/gmat.md`, pinned here to **`13df747b3be4e425b153c1cc9a580453a1d39a66`**] 2G's checkpoint **`034ce57`** reports the inclined simulator comparisons as passing; its method file still says the game comparisons are pending. The handoff also reports unfinished model/game integration and no full-tip verification. S12 preserves this conflict and gates the release claim. No uncommitted sibling files were read or merged.
- [ESTABLISHED: `docs/submission/requirements.md`] All text-field character caps are unverified. The generator reports words, Unicode characters and UTF-16 units for copy only, without inventing a portal maximum. The demo plan satisfies the recorded **30 s / 7 slide** limits; actual exported media still needs checking.

## Source refresh

[ESTABLISHED: S12 source check, 2026-11-14 Pacific] The [Navigator demo guidance](https://github.com/nasa/spaceapps/discussions/1947) and [GO Team AI guidance](https://github.com/nasa/spaceapps/discussions/1849) were readable. The [submission guide](https://www.spaceappschallenge.org/resources/project-submission-guide/) returned 502 and the [global challenge Resources tab](https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/?tab=resources) remained inaccessible. Therefore no field cap or final NASA-eligibility ruling was newly established.

The [local organizer's challenge page](https://hackathlone.com/challenges/space-mission-design-game) and [NASA GMAT catalogue](https://software.nasa.gov/software/GSC-19468-1) were readable; the catalogue names R2025a while repository execution evidence names **R2026a**. The catalogue identifies the resource family, not the version actually run. [Apache's licence text](https://www.apache.org/licenses/LICENSE-2.0) was also reopened for the existing S10 recommendation; no licence was selected.

## Reproduce or edit

From this worktree, with existing installations:

```powershell
python -B tools/studies/s12/check_package.py --check
python -B tools/gmat/reference.py scripts --check
python -B -m unittest discover -s tools/gmat -p 'test_*.py'
python -B tools/gmat/reference.py verify
& '.\node_modules\.bin\vitest.cmd' run --configLoader runner --no-cache src/sim/gmat.test.ts src/console/console.test.ts src/game/session.test.ts src/contracts/boundary.test.ts
git diff --check
```

Edit `drafts.md` or `demo.md`, keeping one hidden ID per public sentence/caption, and update the corresponding group in `claim-evidence.json`. Then run `python -B tools/studies/s12/check_package.py` to regenerate, followed by `--check`. Do not hand-edit the generated ledger. The checker proves complete mapping and existing source locations, **not** that an editorial interpretation is correct; review the sentence and its source together.

Only S12-owned documents/tools and `docs/handoffs/s12.md` change. No dependencies were installed; no `src/`, submission, decision, shared-contract or other study files were edited.
