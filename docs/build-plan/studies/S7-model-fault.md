# S7 — The model fault and the slow tests

**Thread:** GPT/Codex · **Branch:** `st/s7-model-fault` · **Read:** [the study rules](README.md), then `docs/handoffs/2D.md` (request 2 and Update 3), `src/model/README.md`, `docs/model/estimator-spec.md`, and `src/model/` (start with `service.ts`, `engine.ts`, `solve.ts`, `linalg.ts`).

## Question
Every attempt in the live game hits a stretch early on where the model's in-flight refresh throws `luDecompose: singular matrix`. With one plan (a 6.5 s retrograde burn at 300 s, attitude freed 0.5 s after it) the fault never clears and the model stays at version 0 for the whole attempt. 2D traced the path to `inverse(H)` at `solve.ts:314`, right after a damped step succeeded: one of the arc's own parameters has no information yet and no prior. Find the exact cause and the right fix, one that keeps the model honest under P11 (an uninformed parameter shows wide uncertainty; nothing is fudged to look confident).

## Deliver
In `docs/studies/s7/`:
1. **Cause:**
   - which parameter has no information and why, in each failing case (the early stretch, and the plan that never clears);
   - why releasing the attitude 0.5 s after the burn differs from 1 s;
   - whether anything else in `src/model/` can reach the same throw.
2. **Options and a recommendation:** for example, a regularised inverse, leaving an uninformed parameter out of the covariance until it has information, a weak prior, or a different staging. For each one, what the HUD, the forecast envelope and the held-out test would show, and what it costs.
3. **The fix as a patch:** `docs/studies/s7/fix.patch` against `main`, applying cleanly with `git apply`, including regression tests built from 2D's reproduction (both cases).
   - You may apply it in your worktree to run `npm run check`, but commit only the patch file. Never commit changes under `src/`.
4. **The slow tests:** under parallel load these time out at 5 s:
   - `src/model/service.test.ts` (distance law: passes held-out…);
   - `src/model/runs.test.ts` (fits attempts at different binary phases…);
   - `src/blackbox/` storage and rebuild.

   Profile them and say why they're slow. Then propose speedups that keep what each test proves, as a second patch `docs/studies/s7/tests.patch`. Prefer real speedups; raise a timeout only where a test is slow for a good reason, and say so.
5. **The 3D branch:** thread 2G is rewriting the model in 3D on `p2/2g-3d-flight`. Read its committed code (read only) and say whether the same path and fault survive there, and whether your patch would carry over.

Labels as in the study rules: `[DEMONSTRATED: test]` for anything you ran.
