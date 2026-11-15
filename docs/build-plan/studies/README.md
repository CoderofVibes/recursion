# Studies (GPT/Codex)

Design and physics studies that run in parallel with the build. Each one answers a question well enough that a later code thread can build from it without re-deriving anything. Studies decide nothing: the owner decides through the integrator, who updates `docs/DECISIONS.md`.

| ID | Study | Prompt |
|---|---|---|
| S1 | Borrowed Spin: tether physics | [S1-tether-physics.md](S1-tether-physics.md) |
| S2 | Borrowed Spin: hardware, sensing and the ship | [S2-tether-hardware.md](S2-tether-hardware.md) |
| S3 | Borrowed Spin: the encounter and the model | [S3-borrowed-spin-encounter.md](S3-borrowed-spin-encounter.md) |
| S4 | The expedition in 3D: regions and route | [S4-expedition.md](S4-expedition.md) |
| S5 | Inverse wells and the lattice in 3D | [S5-wells-lattice-3d.md](S5-wells-lattice-3d.md) |
| S6 | Paired openings (system X) | [S6-paired-openings.md](S6-paired-openings.md) |
| S7 | The model fault and the slow tests | [S7-model-fault.md](S7-model-fault.md) |
| S8 | Twin Deeps in 3D: the varied geometry and the slingshot exit | [S8-twin-deeps.md](S8-twin-deeps.md) |
| S9 | The first five minutes: a cold player in the Gravity range | [S9-first-five-minutes.md](S9-first-five-minutes.md) |
| S10 | Submission groundwork: assets, licences, NASA data, AI use | [S10-submission-audit.md](S10-submission-audit.md) |
| S11 | The owner's decision queue from S1–S6 | [S11-decision-queue.md](S11-decision-queue.md) |

## Rules for every study
1. **Read first:**
   - `docs/CREATIVE_BRIEF.md`, the owner's direction (never edited);
   - `docs/DECISIONS.md`, all of it, especially A9–A13, P2, P4–P7 and P11;
   - `docs/build-plan/README.md` § Conventions;
   - `docs/handoffs/region-proposal/` (`README.md` and `regions.md`);
   - your prompt.
2. **The world is 3D** (A11). The gravity law is P4: a = (GM/r₀²)(r₀/r)^2.5 with one shared r₀ = 1,000 km. Thread 2G is converting the game to 3D now; `src/contracts/README.md` shows the 3D types. Earlier planar documents give you vocabulary, not limits.
3. **Ownership:** you write only `docs/studies/<your id>/`, `tools/studies/<your id>/` and `docs/handoffs/<your id>.md`. Everything else is a request in your handoff. Never commit changes under `src/`; 2D and 2G own it (S7 delivers its fix as a patch file).
4. **Software:**
   - Python 3.14 with the standard library and numpy (both installed). Don't install anything else without the owner's OK.
   - Reference scripts are deterministic, rerun from one command, and write their vectors as JSON next to the script.
5. **Honesty:**
   - Label claims as in Convention 4: `[ESTABLISHED: source]`, `[ASSUMED]`, `[FICTIONAL]`, `[DEMONSTRATED: script or test]`.
   - Prefer NASA and peer-reviewed sources, cited by URL or by bibliography ID from `References/BIBLIOGRAPHY.md`.
   - Say plainly when an effect is too small to matter in play.
6. **Every study delivers:**
   - **A recommendation**, with the numbers behind it.
   - **What building it would take:**
     - which modules, contracts and data it touches, and roughly how much code;
     - what the model (`src/model/`) and the screens (2D) would need;
     - the tests that would prove it.
   - **Questions for the owner,** one decision each, each with a recommendation.
7. **Be ambitious.** Give the owner the best version, then say what a smaller version would lose.
8. **Branch:** `st/<id>-<slug>` as named in your prompt. Work in `.worktrees/<id>` locally, or in the cloud from the GitHub repo. Commit on your branch; the integrator merges.
9. **Handoff:** `docs/handoffs/<id>.md`, from [the template](../../handoffs/TEMPLATE.md).
