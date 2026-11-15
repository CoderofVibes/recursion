# S11 — The owner's decision queue from S1–S6

**Thread:** GPT/Codex · **Branch:** `st/s11-decision-queue` · **Read:** [the study rules](README.md), then `docs/DECISIONS.md`, all of it; then `docs/handoffs/s1.md`, `s2.md`, `s3.md`, `S4.md`, `s5.md` and `s6.md`, and each study's README under `docs/studies/`.

## Question
The six studies ask the owner about thirty questions, with heavy overlap. For example, S1, S2 and S3 each ask whether to build Borrowed Spin. Turn them into one queue the owner can answer one at a time.

## Deliver
`docs/studies/s11/queue.md`:
1. **One entry per real decision**, with duplicates merged. Each entry has:
   - the question in one plain sentence;
   - the studies that raised it, with links;
   - the recommendation, and where the studies disagree, both sides;
   - what each answer changes, and which build thread it unblocks;
   - anything `docs/DECISIONS.md` already settles. Mark those "already decided" with the decision ID, and don't re-ask them.
2. **Order:** decisions that block the next build work come first: 2G's steps 3–5, Phase 3, and the content of the route that is already decided (A13). Then decisions about optional systems (Borrowed Spin, gas, tidal effects). Then the endgame (paired openings, Earth).
3. **Groups** where one answer settles several entries; say so on each.
4. **Conflicts:** any place where two studies, or a study and `docs/DECISIONS.md`, contradict each other, with the fact that settles it, or the question that would.

Recommend; decide nothing.
