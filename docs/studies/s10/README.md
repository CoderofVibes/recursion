# S10 — Submission groundwork

Audited **2026-11-14 Pacific**, in `.worktrees/s10` on `st/s10-submission-audit`, starting from **`55d91c30fc715a92af116dcd35c085fcbf6667ca`**. This package supplies facts for the owner and integrator. It is not submission text, a selected licence, an eligibility ruling or a claim that the final release is ready. Only S10-owned folders and its handoff are changed.

**Recommendation [ASSUMED]:** Publish an explicit original-content licence (Apache-2.0 recommended), distribute the actual runtime notices, and base NASA credit on the four demonstrated GMAT regression cases. Refresh the older submission documents against a frozen release commit, then capture a real plan → fly → review comparison. Keep study proposals, scripted browser demonstrations and human playtests distinct.

## Evidence package

| File | What the owner / integrator can draw from it |
|---|---|
| [dependencies.md](dependencies.md) | Every locked npm package location/version, runtime/build role, licence and exact local legal evidence; bundled components and unresolved evidence. |
| [third-party-notices.txt](third-party-notices.txt) | Complete available upstream legal files and marked embedded legal sections. Review archive; not automatically part of the deployed game. |
| [external-toolchain.md](external-toolchain.md) | Observed Node/npm, Python/NumPy, GMAT and CI toolchain scope and notices. |
| [assets.md](assets.md) | Fonts, images, geometry, textures, shaders, audio, prototype CDN code, excluded reference pictures and research copies. |
| [licence-options.md](licence-options.md) | Apache-2.0, MIT and BSD-3-Clause: permissions, duties and a recommendation for the owner's decision. |
| [nasa-evidence.md](nasa-evidence.md) | Each accepted GMAT case/run set and NASA source, exact paths, consumers, numerical checks and boundaries. |
| [ai-provenance.md](ai-provenance.md) | Tool/model/task table from sanitized trailers and handoffs, separate owner contributions, and disclosure gaps. |
| [gaps.md](gaps.md) | Requirement-by-requirement evidence, stale claims, exact requests outside S10 ownership, implementation estimates and owner questions. |
| [dependency_inventory.py](../../../tools/studies/s10/dependency_inventory.py) / [dependency-inventory.json](../../../tools/studies/s10/dependency-inventory.json) | Deterministic offline audit and machine-readable results, including package and legal-file hashes. |

## Findings that change the submission work

- [DEMONSTRATED: dependency generator] **218** npm package locations: **186** installed at the locked versions, **32** absent optional packages. The **four browser-runtime packages are MIT**. Three installed packages lack full local licence text; bundled components have additional version/text gaps. No incompatible mandatory runtime licence was identified, but this does not close the missing evidence or audit the final bundle.
- [ESTABLISHED: asset/source inventory] **46 screenshots plus one SVG favicon** are tracked. Visuals are procedural/interface captures; no external font files, audio library or NASA model/texture import was identified. Both prototypes use a separate **Three.js 0.170.0 CDN** dependency, while the application uses **0.187.0**. Four owner reference pictures and the standalone OpenAI-viewer diagram export remain excluded.
- [DEMONSTRATED: GMAT reference verification and external hash audit] Four cases contain **13,616 samples**. All **12** accepted baseline/repeat/tighter raw reports match external manifests; repeat outputs match. The game comparison passes at **6.25–25 ms** test steps. These are NASA-tool-generated Newtonian verification data, not real mission telemetry or validation of fictional gravity or the live forecaster.
- [ESTABLISHED: provenance table] Some assigned lanes differ from actual contributors: **1G was delivered by Claude**, and **1D preparation by GPT/Codex preceded Claude-operated GMAT runs**. Exact Codex model versions are unrecorded; do not invent them. The owner's creative direction and approvals have explicit repository evidence.
- [ESTABLISHED: source and older submission notes] Mission planning/debrief and model integration exist here, despite stale “planned” wording. Full-return playability, human learning outcomes, final no-login links, release notices/AI metadata and submitted portal state are not established.

## Reproduce the bounded checks

From `.worktrees/s10`, using existing installations (no downloads):

```powershell
python -B tools/studies/s10/dependency_inventory.py --check
python -B tools/gmat/reference.py scripts --check
python -B -m unittest discover -s tools/gmat -p 'test_*.py' -v
python -B tools/gmat/reference.py verify
& '.\node_modules\.bin\vitest.cmd' run --configLoader runner --no-cache src/sim/gmat.test.ts src/console/console.test.ts
git diff --check
```

[DEMONSTRATED: S10 checks] The dependency artifacts reproduce; **19 Python integrity tests** and **24 existing Vitest tests** (six GMAT, eighteen console) pass. The runner/no-cache options avoid writing a Vite config cache into the shared dependency junction. The source/asset and provenance checks are recorded in their reports. No new GMAT execution, app build, full game suite, deployed-browser test or human playtest was performed for this documentation/tooling study.

[ASSUMED] Regenerate the inventory with `python -B tools/studies/s10/dependency_inventory.py` when the lockfile or installed package evidence changes, then review its gaps. A different platform may have different optional packages installed. Reconcile all facts after later 2G/content/UI branches merge; the four-case snapshot must not silently absorb unmerged seven-case claims. [Handoff](../../handoffs/s10.md) is the integration entry point.
