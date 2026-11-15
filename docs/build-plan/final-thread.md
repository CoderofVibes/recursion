# FINAL — Get the owner ready to submit: the public demo, the video, the sounds, the submission

**Thread:** Claude · **Folder:** the main checkout, `C:\Dev\Recursion NASA Hackathon`, on `main` · **Role:** you take over as the integrator. The earlier integrator session has ended; you're the only thread working in this folder.

**The goal:** when the owner sits down, everything that can be done without them is done, and each thing that needs them is a short, clear step. They do four things only you can't: generate sounds in ElevenLabs, review and record the video, upload it, and submit in the portal. The owner's time is short, so **give them their tasks first, in small pieces, so they work in parallel with you.**

## Read first

1. `docs/build-plan/coordination.md`, the **"Final assembly"** section at the top: merges still to come, the owner's items, the submission list. Then `git log --oneline -15`.
2. `docs/submission/requirements.md`: the organizer's rules, the owner's notes from the instruction video, the submission time and the local event.
3. `docs/submission/video.md` (the owner's beat sheet) and, on the trailer branch, `docs/trailer/next-thread.md` (`git show p3/tr-trailer:docs/trailer/next-thread.md`): where the trailer stands and how to finish it.
4. `docs/studies/s12/drafts.md` and `claim-ledger.md` (S12's submission drafts, written before today's game), `docs/submission/nasa-resources.md`, `challenge-fit.md`.
5. The latest handoffs: `docs/handoffs/3F.md`, `2C.md` (update 9), `pf.md`, `night.md`.

## Rules for the final stretch

- **Finish, don't extend.** Small, safe fixes anywhere are yours; no new features.
- **Before any push:** `npm run check`, `npm run build`, and the production smoke test: `npx vite preview --port 4312 --strictPort`, then NIGHT's driver (`docs/handoffs/night/judge-run/do.mjs`) with a fresh browser through the opening and each region by `?encounter=gravity-range|inverse-wells|chain-link`, with no page errors. Never loosen a test. `clouds.test.ts` and `admission-observer.test.ts` can time out under load: rerun them alone, never raise their limits.
- **Ask the owner first** before pushing `main` (it redeploys the public site) and before anything that publishes. **Never** submit, post or upload for the owner.
- Scan any evidence you commit for local file paths, including inside `.gz` files. Keep the ledger current.

## Step 0 — at the start, ask the owner these in one message, each with your recommendation

1. **Is TR's continued thread running** (in `.worktrees/tr`)? If yes, leave the trailer to it and merge its branch when it asks. If no, you do the trailer (step 3). Never both.
2. **VX's per-region skies (R54):** its proposal is uncommitted in VX's worktree (`.worktrees/vx/docs/handoffs/vx-regions-proposal.md`, with before-and-proposed screenshots). Approve it (VX commits, you merge) or skip it. Recommend skipping unless the owner likes it at a glance.
3. **R32, the Well Garden's pull rule:** recommend leaving it as a stated limit (the Garden's coasting forecast is overconfident); it's a few hours of model work.
4. **3F's two calls:** the stage names (EXPLORATION · SYSTEMS · PLAN · FLIGHT · BLACK BOX · MODEL) and the stars behind MAP and SHIP. Keep them unless the owner says otherwise.
5. **Where the video goes:** a host whose link opens with no sign-in (for example YouTube, unlisted or public).

## Step 1 — the sounds: give the owner their list at once

Write `docs/submission/sounds-to-make.md` and show it to the owner: **12 files**, most important first, each with its exact file name, its ElevenLabs setting (duration, loop or not) and a ready-to-paste prompt, taken from `docs/audio/cues.md` (the game's) and `docs/trailer/audio.md` on `p3/tr-trailer` (the video's).

- The game's six, into `public/audio/`: `warning`, `main-engine`, `well-hum`, `lattice-radiation`, `title-out`, `home-reveal`.
- The video's six, into `src/trailer/audio/` on the trailer branch: `lattice-strike`, `braid-rush`, `well-groan`, `ship-creak`, `montage-bed`, `final-hit`.
- Put the sounds that both the game and the video use first (`warning` is the video's alarm).

The owner leaves files in Downloads. Copy each into place under its name, check it decodes, play it where it belongs, and tell the owner it's in. **R65:** the game's `opening-alarm` take is 3 s, where the game wants about 0.45 s. Don't wait on a new take: make the game play only its first double pip (a duration cap for that cue in `src/audio/`, with a test), so the long take stays usable in the video.

## Step 2 — the public demo site, early (its link goes on the video's final card and in the portal)

The site is `https://coderofvibes.github.io/recursion/`, deployed by `.github/workflows/deploy.yml` on every push to `main`. The repo `https://github.com/CoderofVibes/recursion` is public. **`main` is about 100 commits ahead of GitHub, so the public site is this morning's build.**

1. **The README for judges** (root `README.md`; it still says MISSION). A short opening paragraph on what Recursion is and how it answers the challenge, then how to play:
   - the opening plays once per browser (`?opening=replay` shows it again, with Skip);
   - the region picker, and the six stages;
   - one short recipe per region: **Twin Deeps** (record the design, plan a retrograde burn of about 10 m/s, commit, enter, coast at 2000× for a few hours of ship time, RECALL; again with about 5 m/s; then MODEL › TEST and ADOPT; the next forecast uses the law); **the Well Garden** (STEER toward CROSS-TRANSFER, about 12.5 m/s at 600 s, to cross; coasting falls into a throat at T+0:29); **the Unseen Cathedral** (the Black Box channel at THREAD; supported strands appear on FLIGHT after a minute or two; the lattice kills a coasting ship at about T+4:30);
   - check each recipe against the build with NIGHT's driver (`learning-loop.sh` follows 3F's labels);
   - what's verified and how (GMAT, the tests), the honest limits (Final assembly, §3), credits, and the `?quality=full` and `?perf` switches for anyone measuring.
2. **Credits:** add ElevenLabs (audio, AI-generated; A22) to the in-game CREDITS page (`src/console/pages/CreditsPage.tsx`) and the README, beside Claude and OpenAI Codex (development assistance) and NASA GMAT (verification data).
3. **Merge what's ready** (VX if approved; the trailer when its thread asks), each with the checks above.
4. **Push `main`, with the owner's OK.** Watch the deploy in GitHub Actions. Then, from a fresh browser with no sign-in (NIGHT's driver against the live URL works), check the opening, the picker and each region with no page errors, and that the repo page opens. Report the link to the owner. If the deploy fails, fix it and ask again before the next push.

## Step 3 — the video (only if TR's continued thread isn't running)

Do `docs/trailer/next-thread.md` yourself, in `.worktrees/tr` on `p3/tr-trailer`: merge TV's shots (`p3/tr-visuals`; keep PF's code and TV's one method in `RoomView.ts`), the owner's quick shot review, the sounds as they arrive, the montage from 3F's real screens (now on `main`), `?quality=full`, a rehearsal, then the owner records. The owner's panel is 1920 × 1080 at 125% scaling (1536 × 864 CSS); Game Bar at 60 fps with app audio on; Chrome on High performance graphics (the owner's Windows setting).

Either way, the video carries the organizer's labels (`requirements.md`): a small corner label throughout ("Gameplay, edited · built with AI assistance · audio: ElevenLabs, AI-generated") and the final card's full labels with the site link. The owner uploads it and gives you the link; check it opens from a private window. Merge `p3/tr-trailer` when it's done: the page is dev-only, and the merge brings the owner's game sounds to `main` (push again, with OK).

## Step 4 — the submission text, ready to paste

Write `docs/submission/portal.md`: one section per portal field, in the form's order, each ready to paste, built from S12's drafts and **updated to today's game**. Every claim must be true of the shipped build; keep the honest limits.

- **Project title.**
- **High-level summary:** what we developed, how it addresses the challenge, why it's important (the owner's notes).
- **Demo link:** the video. **Final project link:** the site, plus the repo.
- **Project details:** what it does and how it works; its benefits; the intended impact; the tools used; how it was creative; the factors considered: energy and power (the power and thermal budget, the recorder's draw), accessibility (reduced motion, at most three flashes a second, keyboard reach), cost (propellant, power, storage as the trade-offs a player makes).
- **NASA data:** GMAT reference trajectories and how they test the simulator (`nasa-resources.md`), for global-award eligibility.
- **References and resources:** every outside dataset, library, tool and asset actually used.
- **AI use, said clearly:** Claude and OpenAI Codex (code, tests, studies, under the owner's creative direction), ElevenLabs (all audio, AI-generated), MidJourney (reference images only; none ships, A23), and where the video is labelled.
- Character limits aren't known: keep each field tight, with a short version where it helps.
- Also: the certificate's paper size is **Letter**; the challenge, event and team details per `requirements.md`.

## Step 5 — the last check, then the owner submits

From a private window: the site, the video and the repo all open with no sign-in; the final card's link and every link in `portal.md` work. Then hand over to the owner with one list: what's done, what isn't, and the exact order to paste into the portal. The owner submits.
