# S10 — Submission groundwork: assets, licences, NASA data, AI use

**Thread:** GPT/Codex · **Branch:** `st/s10-submission-audit` · **Read:** [the study rules](README.md), then `docs/submission/` (requirements, challenge fit, NASA resources), `package.json`, `package-lock.json`, `References/BIBLIOGRAPHY.md`, `docs/physics/`, `tools/gmat/` and `docs/handoffs/`.

## Question
The owner and the integrator write the submission together. Gather every fact they will need, checked against the repository, so writing it is quick and nothing in it is wrong. This is groundwork, not the submission text.

## Deliver
In `docs/studies/s10/`:
1. **Third-party inventory:**
   - every runtime and build dependency, direct and transitive, with version, licence and the attribution it requires. Read the licences from `node_modules/*/package.json` and the licence files, offline;
   - every font, image, texture, model, sound and shader taken from elsewhere;
   - anything that conflicts with a public repository or with the Space Apps rules in `docs/submission/requirements.md`.
2. **Licence options** for this repository (there is no `LICENSE` file yet): two or three that fit the dependencies and the rules, each with what it allows and requires, and a recommendation. The owner decides.
3. **NASA data and tools actually used:** each GMAT run and every NASA source the game or its documents rely on. For each:
   - the exact file paths;
   - what it shows;
   - where the game uses it.

   Separate what is demonstrated from what is only cited.
4. **AI use, as facts:**
   - which tools and models built which parts, taken from commit trailers, branch names and handoffs;
   - which parts were written or decided by the owner.

   Give it as a table the disclosure can draw from. Copy no email addresses or personal details from the git log.
5. **Gaps:** anything the requirements ask for that the repository can't yet back up.

Edit nothing outside your own folders, including `docs/submission/`.
