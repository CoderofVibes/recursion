# S14 — Phases 3–5, refreshed

**Thread:** GPT/Codex · **Branch:** `st/s14-phases-refresh` · **Worktree:** `.worktrees/s14` · **Read:**
- [the study rules](README.md);
- `docs/build-plan/README.md` (its conventions and ownership), then `phase-3.md`, `phase-4.md` and `phase-5.md`;
- `docs/CREATIVE_BRIEF.md`;
- `docs/DECISIONS.md` in full, especially A8–A14;
- `docs/design/expedition.md` and `docs/design/regions/`;
- the study handoffs `docs/handoffs/s1.md` to `s12.md`, and S11's queue `docs/studies/s11/queue.md`;
- the phase 2 handoffs in `docs/handoffs/`.

From 2G's branch, read only, with `git show p2/2g-3d-flight:docs/handoffs/2G.md`: the 3D game.

## Question
The prompts for phases 3–5 predate:
- 3D flight (A11);
- A12's time rules;
- A13's expedition;
- twelve studies.

S11 found they still carry the old flat-flight wording and the old branch-and-return wording. What should each section prompt say now, so the next builders start from the current design rather than the old one?

## Deliver
In `docs/studies/s14/`:
1. **A revised copy of each of `phase-3.md`, `phase-4.md` and `phase-5.md`.** Each is a full file, ready to replace the current one, and follows the build plan's conventions. Keep the existing sections and ownership unless a change is needed, and say why wherever you change them.
2. **A change log for each section:** what changed, why, and the decision or study it follows.
3. **Conflicts and gaps:** where decisions or studies disagree, or where a section depends on an open owner question (cite S11's Q number). Don't settle any of them. Write the prompt so it works either way, or mark it blocked on that question.
4. **A lane check:**
   - every file a prompt assigns has exactly one owner;
   - no prompt assigns work phase 2 has already done or is doing (2C, 2D, 2F and 2G).

Rules:
- No clock targets or deadlines in any prompt; that's the owner's rule. Prompts say what to build and how to check it, not how fast.
- Don't edit `docs/build-plan/`; the integrator applies your files.

Commit on `st/s14-phases-refresh`, and write your handoff to `docs/handoffs/s14.md` using the template.
