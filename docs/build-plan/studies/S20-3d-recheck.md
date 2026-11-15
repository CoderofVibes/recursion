# S20 — The 3D release, rechecked

**Thread:** GPT/Codex · **Branch:** `st/s20-3d-recheck` · **Worktree:** `.worktrees/s20` · **Read:**
- [the study rules](README.md);
- all of `docs/studies/s9/` and `docs/studies/s12/`;
- `docs/handoffs/s13.md`;
- `docs/studies/s15/README.md` and `after-3d-merge.md`;
- DECISIONS A11–A17;
- `docs/handoffs/2G.md`.

## Question
3D flight has merged and is live. Three studies were made before it:
- S9's first-five-minutes walkthrough;
- S12's claims and demo shots;
- S15's speed figures.

Which of their findings still hold on the 3D build?

## Deliver
In `docs/studies/s20/`, with any scripts in `tools/studies/s20/`:
1. **S9, replayed on the 3D build** with the same cold-player method. Mark each stall and each request R1–R15 as fixed, still there, changed or new, with screenshots.
2. **S12's claim ledger, refreshed.** Mark each flagged sentence as now demonstrated, still pending, or wrong, and propose replacement wording for any that changed. Don't edit S12's files: put a revised ledger and redlined drafts in `docs/studies/s20/`.
3. **The demo shots:**
   - which of S12's storyboard shots the 3D build can show now;
   - for each, the capture steps: what to do, at what warp, and for how long, so the owner can record it.
4. **S15's post-merge checklist:** rerun S15's measurement script on the 3D build with the modest profile, and compare.
5. **New problems:** anything new that would confuse or block a judge in the first five minutes, ranked, each with its owner's lane.

2D is resuming with S9's requests now, and the integrator forwards your findings to it. Measure the local build, and don't load the live site repeatedly. Commit on `st/s20-3d-recheck`, and write your handoff to `docs/handoffs/s20.md` using the template.
