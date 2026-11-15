# S9 — The first five minutes: a cold player in the Gravity range

**Thread:** GPT/Codex · **Branch:** `st/s9-first-five-minutes` · **Read:** [the study rules](README.md), then `docs/CREATIVE_BRIEF.md`, DECISIONS A8, A9, A12, P5, P6, `docs/handoffs/2D.md` (all of it), `src/app/`, `src/console/`, `src/view3d/` and `src/theme/`. The live build is at https://coderofvibes.github.io/recursion/. If you can run a browser, use it; if you can't, `npm run dev` in your worktree, or read the code, and say which you did.

## Question
A Space Apps judge opens the link cold, on a desktop browser, with a few minutes to spare. What happens to them, moment by moment, from page load to the moment the game's idea lands: the model was wrong, my failed run taught it, and now its forecast is right? Where do they stall, and what's the least that fixes each stall without breaking the game's rules (no pause inside an encounter, the model forecasts and the player flies, nonverbal where the brief asks for it)?

## Deliver
In `docs/studies/s9/`:
1. **The walkthrough:** page load → room → ENTER → first plan → first loss → back at the door → the second attempt → testing and adopting the law → a forecast that holds. For each step:
   - what is on screen;
   - what the player must know to go on;
   - where they learn it;
   - how long it takes at the default warp.
2. **Stalls, ranked** by how likely each is to lose a judge. For each:
   - the evidence (file and line, or a screenshot if you ran it);
   - a proposed fix inside 2D's lane;
   - what the fix costs.
3. **The shortest path to the idea:** the fewest actions from load to the insight. Can a judge get there in about five minutes, and if not, what would make it possible without a tutorial wall of text?
4. **Keyboard and focus:** a static audit of focus order and keyboard reach on every console page (2D couldn't script it). List what can't be reached or is reached in a confusing order.
5. **Requests for 2D**, numbered, each small enough to build alone.

This is a design review; don't edit `src/`.
