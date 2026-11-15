# S12 — The submission package, drafted

**Thread:** GPT/Codex · **Branch:** `st/s12-submission-drafts` · **Worktree:** `.worktrees/s12` · **Read:** [the study rules](README.md), then:
- `docs/CREATIVE_BRIEF.md` and `docs/DECISIONS.md`;
- everything in `docs/submission/` (the requirements, challenge fit and NASA resources);
- everything in `docs/studies/s10/`, especially `gaps.md`, `nasa-evidence.md`, `ai-provenance.md` and `licence-options.md`;
- `docs/studies/s9/README.md` and its screenshots;
- `docs/verification/gmat.md`.

From 2G's branch, read only, with `git show p2/2g-3d-flight:<path>`:
- `docs/handoffs/2G.md`, for the 3D game and the inclined GMAT cases C5–C7;
- `docs/verification/gmat.md`.

## Question
The submission needs:
- a project summary and a full description;
- the NASA resources used;
- an AI disclosure and credits;
- a short demo: a video of at most 30 s, or at most 7 slides.

The owner writes the final words. What is the strongest honest draft of each? Build every draft only from what the project has demonstrated, so the owner edits a draft instead of starting from a blank page. The game is the owner's creative work, so draft in the brief's voice and language, not in marketing language.

## Deliver
In `docs/studies/s12/`:
1. **Drafts**, each within the field limits that `docs/submission/requirements.md` records (say where a limit is unknown):
   - the summary;
   - the description: what the player does, what they learn, and why it fits the challenge;
   - the NASA resources write-up. GMAT C1–C4 are on main. Mark C5–C7 as landing with 2G's merge.
   - the AI-use disclosure, from S10's provenance. Use no names or email addresses, and say "the owner" where a person is meant.
   - credits and a third-party notice summary.
2. **Three openings for the summary**, each one sentence and each a different angle, so the owner can choose the voice.
3. **The demo:**
   - a 30-second storyboard: each shot's action, caption and length;
   - a 7-slide outline as the alternative;
   - a recommendation between them.

   Mark each beat as either "shows in the live build now" or "needs 2G's 3D merge", and list the captures the owner has to record.
4. **A claim ledger:** every factual sentence in the drafts, mapped to its evidence (file, test or commit) and labelled as in the study rules. Flag every sentence that isn't demonstrated yet, with the evidence it needs.
5. **What's left before each draft is final:** the licence choice, 2G's merge, the demo capture, the live links, and anything else you find.

Don't edit `docs/submission/` or any other thread's files. The integrator merges your drafts and the owner finalises them. Commit on `st/s12-submission-drafts`, and write your handoff to `docs/handoffs/s12.md` using the template.
