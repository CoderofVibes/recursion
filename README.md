# Recursion

A spacecraft engineering roguelike for NASA Space Apps 2026. A crewed ship returning from Mars is caught in recurrence in an unfamiliar universe; the player learns its rules, engineers solutions and finds a way home. The ship never gets stronger, only better understood.

Status: Phase 1 (foundation, research and design). See [docs/build-plan/README.md](docs/build-plan/README.md).

## Run

Requires Node 22.12 or later.

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests (Vitest)
npm run build      # typecheck and production build into dist/
npm run lint       # ESLint, including the truth/belief boundary
npm run check      # typecheck + lint + tests
```

## Where things are

| Path | What |
|---|---|
| [docs/CREATIVE_BRIEF.md](docs/CREATIVE_BRIEF.md) | The owner's creative direction (authoritative) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Approved, proposed and demonstrated implementation decisions |
| [docs/build-plan/](docs/build-plan/README.md) | Phases, section prompts, file ownership, conventions |
| [src/contracts/](src/contracts/README.md) | Shared types between every part of the game, and mock fixtures |
| [src/lib/](src/lib/README.md) | Vectors, seeded RNG, fixed-step clock, state hashing |
| `src/*/README.md` | Each folder names the section that owns it |
| [References/](References/README.md) | Public research references and bibliography |
| [WORKING_PREFERENCES.md](WORKING_PREFERENCES.md) | How the team works |
