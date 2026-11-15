# Submission evidence gaps and integration requests

Scope: `st/s10-submission-audit` at `55d91c30fc715a92af116dcd35c085fcbf6667ca`, audited 2026-11-14 (Pacific). S10 is groundwork, not submission prose or a release approval. [ESTABLISHED: `docs/submission/requirements.md`] The recorded owner answer is **San Marino, California, virtual participation, solo team, 5:00 p.m. Sunday November 15 Pacific hand-in**. Do not reopen those answered questions. The local pitch/hand-in format and live portal confirmation remain open.

## Requirements checked against repository evidence

Each finding below is [ESTABLISHED: the named repository paths], unless explicitly described as a recommendation [ASSUMED] or a rerun [DEMONSTRATED]. “Missing” means unsupported by this checkout, not proof that the owner has done no work elsewhere.

| Requirement | Evidence available | Remaining gap / acceptance evidence | Responsible next lane |
|---|---|---|---|
| Registration, challenge and roster | Owner answer in `docs/submission/requirements.md`; intended title/challenge in `package.json` and submission docs | No retained portal confirmation of registration, challenge selection, roster or exact displayed cutoff. Confirm local format, individual eligibility and submission state with the owner; do not treat Universal's minimum as applying to this Local Event. | Owner / 5C |
| Event-window work | Requirements record generic first commit and subsequent project commits | Git chronology cannot establish off-repository start time or the relevant event clock. Owner verifies original work was within the applicable window. | Owner |
| Title, summary, detailed description | `README.md`, creative brief, challenge-fit research | No final editor-ready package with verified field limits. Write only from frozen release evidence; distinguish current Gravity range from future expedition. | Owner + integrator / 5C |
| Short demo | 46 internal prototype/lab/game screenshots in `docs/design/img/`; scripted browser evidence in `docs/handoffs/2D.md` | No final separate public demo link or checked duration/slide count. Requirements specify a maximum 30-second video or 7 slides from organizer guidance; verify live guide/local format, then capture a readable first/revised attempt. | 5C / owner |
| Playable project and source links | `.github/workflows/deploy.yml` builds and deploys `dist` from `main`; README has run commands | Workflow text is not proof of successful deployment, repository visibility or no-login access. No release URL/access result is recorded in these submission docs. Test deployed build, demo and source in a fresh private session at release. | 5A / 5C |
| Freely available original content | No root `LICENSE` or package licence declaration | Owner chooses one option in [licence-options.md](licence-options.md); integrator publishes licence and scope. S10 does not make that decision. | Owner + integrator |
| Third-party credits and permissions | [Dependencies](dependencies.md), [assets](assets.md), [external tools](external-toolchain.md), [NASA trace](nasa-evidence.md) | Package gaps include absent optional-platform licence files and installed packages lacking complete local texts. Preserve runtime notices in the browser release; inspect actual output. Prototype CDN Three.js 0.170.0 is separate from locked 0.187.0. No clearance evidence for the excluded owner reference images. | 5A / 2D / 5C |
| NASA Data field / listed resource | Four GMAT datasets, scripts, headers, method and game tests; [NASA evidence](nasa-evidence.md) | Exact global challenge listing and organizer acceptance of GMAT-derived validation data remain unconfirmed. Raw runs are external, not all reproducibility evidence is public. Do not add unused candidate sources to credits. | Owner / 5C / 2G |
| AI use in text and metadata | Sanitized commit/handoff evidence in [AI provenance](ai-provenance.md) | No consolidated release disclosure or machine-readable provenance record for code/data/media. Exact Codex model is not recoverable from a thread label. Metadata coverage must follow actual files, including this S10 study. | Integrator / 5C |
| AI media labels and branding | Tracked images are interface screenshots; excluded images informed visual design | No generative-image tool is established for those screenshots. Do not claim it was used or silently declare the media rules satisfied. Review final screenshots/video and the role of AI-authored graphics; apply required visible labels to generated images/video and text/metadata to generated audio/code/data. | Owner / 2D / 4E / 5C |
| Public-material privacy and consent | Reference copies and owner reference pictures are excluded; S10 exports no git identities | S10's bounded audit is not a full secret/history or media-consent review. Check release tree, public history and captured screens before publication, without copying personal details into the disclosure. | Owner / 5A |
| Terms acceptance and final Submit | Requirements checklist only | No portal receipt or submitted state. Saving a draft, deploying Pages or making a local pitch is not evidence of portal submission. | Owner |
| Guide/form details and global nomination | Dated source log in requirements; owner checked solo local nomination | Character limits, attachments, language/subtitle rules, final award mechanics and San Marino hand-in format still need live confirmation. Eligibility is not demonstrated by tests or inferred from software use. | Owner / 5C |

[ESTABLISHED: [GO Team AI guidance](https://github.com/nasa/spaceapps/discussions/1849)] S10 reopened the organizer answer: it permits AI assistance, requires where/how disclosure, specifies visible labels for generated images/video and descriptive plus metadata acknowledgment for generated audio/code/data, and prohibits NASA branding/design elements in generated content. The exact treatment of ordinary gameplay capture should be confirmed if uncertain; never invent a generative-media tool to fill a disclosure field.

## Reconcile stale claims before writing

| Existing statement | What this checkout supports | Exact requested correction |
|---|---|---|
| `docs/submission/challenge-fit.md`: no mission-design entry, debrief planned, skeleton UI; scope explicitly an older 5C commit | `src/console/mission.ts`, `pages/MissionPage.tsx`, `pages/BlackBoxPage.tsx`, `src/app/loop.ts` record mission criteria, configure the ship, compute debriefs and compare attempts. [DEMONSTRATED: S10 rerun of `src/console/console.test.ts`] Existing console tests pass. | 5C should mark design/debrief implemented at the current release commit, with scripted-browser rather than human-playtest evidence. Do not keep the obsolete “missing” claim. |
| `docs/submission/nasa-resources.md`: 2C integration still planned | `src/model/`, `src/blackbox/`, game bridge and `docs/handoffs/2C.md`, `2D.md` contain the integration. | Refresh scope to the release commit, citing current tests/handoff evidence. |
| `docs/verification/gmat.md`: historical “no game comparison” and an RK4 recommendation; final paragraph reports completed game comparison | The game's comparison uses its own Verlet integrator at 6.25–25 ms. [DEMONSTRATED: S10 rerun of `src/sim/gmat.test.ts`] Existing GMAT tests pass. | 2G/integrator should mark old proposal sections historical and retain the final method, step sizes and Newtonian-only limits. |
| `README.md`: Phase 1 status; `docs/physics/derivation.md` §§1/2/9: older planar derivation and P1 references | A11 mandates 3D, contracts already use 3D types, but conversion is incomplete at audited HEAD; e.g. `src/game/objectives.ts` explicitly measures its orbit band in xy. | Update release status and reconcile remaining planar limitations after 2G lands. A 3D render or type is not proof of full 3D physics verification. |
| `docs/handoffs/2D.md` update 3 reports singular-matrix model faults during flight | Audited source predates later sibling-branch fixes. Existing successful scripted sequences and passing unrelated tests do not establish absence of the fault. | Integrator verifies the later fix and reruns a fresh-record flight before recording the demo; S10 does not merge code from other branches. |

## Challenge scope that remains unsupported

[ESTABLISHED: `src/content/`, `src/audio/README.md`, build-plan phases 3–5 and `docs/handoffs/2D.md`] Only the Gravity range has implemented encounter content at this snapshot. Full forward expedition, both hazard branches, homeward passage/Earth payoff, audio delivery, full-run balance and an unassisted human completion are not demonstrated. An owner-approved route and deterministic research vectors are not a playable route. The planning/debrief screens improve challenge fit but do not by themselves establish a complete return mission.

[ASSUMED] Preserve the earlier challenge-fit distinctions for unimplemented optional breadth: launch vehicle/procurement and cash budget, actual ground downlink, selectable spacecraft hardware, multiplayer, multiple independent mission scenarios, global rankings and shared plan export. Describe the fixed ship and the player's operational design accurately. No measured learning-outcome claim is supported by a cold-player study at this HEAD.

## What closing the gaps would take

Estimates are [ASSUMED], changed non-generated lines rather than commitments; the integrator assigns them.

| Work | Modules, contracts and data touched | Approximate size | Proof |
|---|---|---:|---|
| Publish licence and source/third-party credits | Root `LICENSE`, `package.json`, `README.md`; `public/` notices copied to `dist`; `docs/submission/` | 30–100 authored lines plus exact licence/notice texts | Release contains licence + notices; click credit links in deployed build; compare dependency versions with frozen lockfile. |
| Add a small credits/verification entry | `src/console/` or release landing page; shared UI tokens if needed | 30–80 TSX/CSS lines | Entry opens NASA method, tool credit, AI disclosure and notices without sign-in; no truth-state or model changes needed. |
| Capture factual AI metadata | New integrator-owned provenance JSON or per-dataset metadata, `docs/submission/`; retain vector schema | 50–150 authored metadata lines | Every distributed file group maps to known tool/evidence or an explicit unknown; generated data remains machine-readable. |
| Refresh claims and freeze release evidence | `docs/submission/`, `docs/verification/`, `README.md`; CI run/source/build/demo IDs | 100–250 documentation lines | Claims point to the exact release commit and passing tests, with test steps and limitations intact. |
| Archive public GMAT run evidence | `tools/gmat/` / `tests/vectors/gmat/` / `docs/verification/` (2G-owned); sanitize host paths | 20–60 metadata lines plus generated reports/logs if selected | Script/raw/executable hashes reconcile; clean reproducer passes; 3D claims require the later inclined cases. |
| Close playability and complete-return evidence | Existing game/content/model lanes, later expedition modules and screens | **Not estimable from an audit**; substantial existing build-plan work | Cold player executes a complete visible plan → fly → review loop; full-return claim needs an actual successful full run. |

[ASSUMED] S10 itself changes **zero game modules, zero shared contracts and zero model/screen behavior**. The best release links a frozen, reproducible evidence bundle from the playable build and accompanies it with a novice-tested attempt comparison. The smaller version is an explicitly scoped Gravity-range demonstration with accurate limitations; it loses the complete-return demonstration and requires the owner to decide whether that scope adequately answers the challenge. Do not silently cut the approved expedition or present the smaller version as complete.

## Owner decisions, one at a time

1. **Original-content licence:** recommend Apache-2.0; alternatives and consequences are in [licence-options.md](licence-options.md). Integrator records the choice.
2. **Public treatment of the prototype reference pictures:** recommend continuing to exclude the original images; obtain source/permission records before any reuse in published media. Screenshots of original geometry need accurate provenance, not an invented NASA asset credit.
3. **NASA eligibility confirmation:** recommend checking the live challenge list and obtaining clarification on GMAT-derived data if the guide leaves it ambiguous; credit the demonstrated use regardless. No organizer message was sent by S10.

Format, roster, portal state and undisclosed model names are missing facts to verify, not new creative decisions. The owner and integrator retain submission authorship and scope decisions.
