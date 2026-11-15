# Recursion

**[Play Recursion in your browser](https://coderofvibes.github.io/recursion/)**

A ship returning from Mars gets caught in recurrence in an unfamiliar universe. In this spacecraft engineering roguelike, finding a way home starts with learning what your ship can do.

## Fly the Gravity range

Click to look, walk with **WASD**, then aim at the console and click. Set your goals and margins in **MISSION**. Preview and commit a burn in **PLAN**, then compare the forecast with the measured track. **BLACK BOX** keeps the evidence when the ship restarts.

The return expedition is still in development. After 2G merges, the release still needs to demonstrate 3D flight, model adoption and the three additional GMAT cases. [Claim ledger](docs/studies/s12/claim-ledger.md)

## What we verified

The simulator matched four planar NASA GMAT R2026a trajectories within **2.2 cm** at **6.25–25 ms** test steps for Newtonian gravity and idealized propulsion. The fictional gravity law and live forecast have separate game tests. Run `npm run check` for typechecking, lint and tests. [GMAT method](docs/verification/gmat.md) · [Regression tests](src/sim/gmat.test.ts)

## Credits and licence

The owner led creative direction. Claude and OpenAI Codex assisted with research, code, tests, procedural visuals and documentation. NASA and JPL publications informed the engineering design. [AI disclosure](docs/studies/s12/drafts.md#ai-use-disclosure) · [NASA source register](docs/studies/s10/nasa-evidence.md)

Original project material is Apache-2.0. Third-party code, data and media retain their own terms. [Licence](LICENSE) · [Notice](NOTICE) · [Browser dependency credits and licences](public/THIRD-PARTY-NOTICES.txt)

## Run locally

With Node.js 22.12 or later, run `npm ci` and `npm run dev`. Run `npm run build` to produce `dist/`.
