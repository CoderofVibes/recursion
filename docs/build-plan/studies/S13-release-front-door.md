# S13 — The release front door: licence, notices and a README for judges

**Thread:** GPT/Codex · **Branch:** `st/s13-release-front-door` · **Worktree:** `.worktrees/s13` · **Read:**
- [the study rules](README.md);
- DECISIONS A1 and A14;
- `docs/studies/s10/`, especially `licence-options.md`, `dependencies.md`, `third-party-notices.txt`, `assets.md` and `gaps.md`;
- `docs/studies/s12/drafts.md` and `claim-ledger.md`;
- `README.md`, `package.json` and `vite.config.ts`.

## Question
A14 publishes the project's original material under Apache 2.0. Three things need to be true:
- the licence is applied correctly;
- everything the deployed site ships carries the notices its licences require;
- a judge who opens the repository understands the game within a minute.

What do the repository and the deployed site need for that?

## Deliver
**Scope:** beyond your own study folders, you may edit exactly these: `LICENSE`, `NOTICE`, the `license` field of `package.json`, `README.md`, and new files under `public/`.

1. **`LICENSE`:** the Apache 2.0 text, copied byte for byte from a canonical copy already in `node_modules`. Download nothing. Say which file you copied and how you checked that it's unmodified.
2. **`NOTICE`:** it holds:
   - the project's name;
   - the line `Copyright 2026 <COPYRIGHT HOLDER>`, with that placeholder left exactly as written. The integrator fills in the owner's name at merge.
   - what the licence covers, and what it excludes: third-party code, data and media stay under their own terms.
3. **`package.json`:** add `"license": "Apache-2.0"` and change nothing else in the file.
4. **Shipped notices:**
   - From `npm run build`'s output, work out which third-party code actually ships in `dist/`.
   - Put the complete notices for that code into `public/`, so every deploy carries them.
   - Say whether minification strips any notice a licence requires, and how the published file covers it.
5. **`README.md` for a judge:**
   - what Recursion is;
   - how to play the live build (link it);
   - what's verified and how (GMAT, the tests);
   - the licence, the credits and a summary of the AI use.

   Take every claim from S12's ledger or from the code, and flag anything not yet demonstrated. Keep the brief's voice. Where something changes when 2G's 3D work merges, say so.
6. **Requests** for anything in another thread's lane, such as a credits link in the console (2D), and any dependency notice gap S10 left open.

Run `npm run check` and `npm run build`, and confirm the notices are in `dist/`. Don't edit `src/` or anything outside the scope above. Commit on `st/s13-release-front-door`, and write your handoff to `docs/handoffs/s13.md` using the template.
