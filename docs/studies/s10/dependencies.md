# S10 — Offline npm dependency inventory

[DEMONSTRATED: `python tools/studies/s10/dependency_inventory.py --check`] The lockfile defines **218 package locations**, including nested duplicate versions: **186 installed**, **32 absent optional packages**, **0 installed version/license declaration mismatches**. There are **4 runtime dependencies (3 direct, 1 transitive)** and **214 build/test dependencies (14 direct, 200 transitive)**. **3 installed packages lack full local legal text**.

This is an offline evidence inventory, not a blanket redistribution clearance. `node_modules` is a shared junction; the generator checks each installed version and hashes manifests and legal files. It reads no git identity data. Run from the S10 worktree: `python tools/studies/s10/dependency_inventory.py`; use `--check` to verify committed artifacts against the same installed files without rewriting them. JSON is next to the script. No downloads or installations are performed.

[ESTABLISHED: package.json; package-lock.json; installed legal files below] Browser runtime is React 19.3.1, React DOM 19.3.1, scheduler 0.28.0 and Three.js 0.187.0, all MIT. Build/test tooling includes **MPL-2.0 Lightning CSS**, **CC-BY-4.0 caniuse-lite**, Apache-2.0, BSD, ISC, BlueOak and 0BSD material. Bundled Vite material also includes CC0. Executing a tool does not by itself establish that the tool is redistributed in the game. Verify the final build's included code/data and retained license comments before publishing; distributing a tooling archive or vendored dependencies carries their own conditions.

[ESTABLISHED: `node_modules/caniuse-lite/package.json`; `node_modules/caniuse-lite/README.md`] For CC-BY-4.0 attribution, caniuse-lite's supplied author name is **Ben Briggs**, with source repository `browserslist/caniuse-lite`; its README identifies it as a smaller caniuse-db. Preserve these credits alongside the CC-BY-4.0 text/link, and describe any team changes if distributing the data. A generic CC license text alone does not supply this creator/source attribution. Lightning CSS package metadata identifies `https://github.com/parcel-bundler/lightningcss.git`; the release owner still needs a corresponding-source location for the exact distributed version if shipping its MPL-covered binary.

[ASSUMED: release recommendation] Preserve complete upstream notices with any redistributed dependency. The accompanying [third-party-notices.txt](third-party-notices.txt) is review material copied from installed legal sources, including bundled notices. It is **not complete for absent packages or missing legal text**, and its location in a study does not automatically put notices in the deployed site. Give a release owner the runtime notices for deployment and the full inventory for a source/tooling release.

## Gaps requiring release follow-through

- The **32 absent packages** below have only lockfile declarations; their package.json and license text were unavailable offline. Audit the actual CI/release install, especially Linux bindings, before asserting those artifacts have been reviewed.
- `@humanfs/types`, `@rolldown/binding-win32-x64-msvc` and `natural-compare` lack a complete local legal text. The first and third have README declarations/attribution; these are preserved but are not full licenses. Obtain exact-version original notices if these packages will be redistributed.
- `prototypes/visual/index.html` and `prototypes/room/index.html` load Three.js **0.170.0** and examples from jsDelivr outside the lock. Installed **0.187.0** is not exact-version offline license evidence for that CDN code. See the asset audit for file references; audit the pinned CDN artifact if prototypes are distributed.
- Bundled upstream notices identify **390 component entries** (not necessarily unique packages). **139** do not specify exact versions. A manifest's build version range is reported only as a range, never promoted to the exact bundled version. Original notices supply the actual attribution; an upstream SBOM would be needed to close missing bundled versions and any unenumerated native-library components.
- **16 bundled component blocks** declare a license without reproducing its full legal text. Their identities are listed below. Preserve supplied attribution and obtain the original terms before redistributing the affected tooling; an SPDX label alone does not preserve required notices.
- No runtime output bundle was audited by this generator. Source imports, build outputs and tooling archives have different contents; the final release owner must reconcile the actual distributed files with these notices.

## Attribution key

[ESTABLISHED: original license text in the evidence paths and notice archive] Each inventory row uses the following obligation key. Full original legal text controls; these summaries do not replace it.

| License | Required handling when covered material is distributed |
| --- | --- |
| MIT | Retain the copyright and permission notice in copies or substantial portions; retain the disclaimer with the license text. |
| ISC | Retain the copyright and permission notice in all copies; preserve the disclaimer. |
| BSD-2-Clause | Source: retain copyright, conditions and disclaimer. Binary: reproduce them in accompanying documentation/materials. |
| BSD-3-Clause | BSD-2-Clause requirements, plus no endorsement using the copyright holder/contributor names without permission. |
| Apache-2.0 | Supply the license; mark changed files; retain relevant copyright, patent, trademark and attribution notices; reproduce applicable NOTICE attribution if supplied. Patent terms apply; no trademark grant. |
| BlueOak-1.0.0 | Give every recipient the license text or its https://blueoakcouncil.org/license/1.0.0 link; retain this audit's original notices. |
| CC-BY-4.0 | When sharing covered material, retain supplied creator/attribution, copyright, license and disclaimer notices, link to the material where practicable, identify changes, and give the license text or link. Do not impose additional restrictions. |
| MPL-2.0 | When distributing covered source, keep it under MPL and preserve notices. For covered executable distribution, make corresponding covered source available by reasonable means and tell recipients where; modifications to covered files remain MPL. Separate larger-work files may use another license. |
| 0BSD | No copyright-retention condition in this license; retain its permission/disclaimer text as a conservative provenance practice. |
| CC0-1.0 | No attribution condition in the dedication/fallback license; retain its text and source as provenance. No trademark or patent grant. |

## Every locked package location

Paths in the first column start at the repository root. `R` = browser runtime; `B` = build/test. `direct` means named in root package.json; `optional` is the lockfile flag. Package metadata evidence is `<location>/package.json` for installed rows. Every license file column is an exact repository-relative path; the JSON supplies original-byte SHA-256 hashes. `LOCK ONLY` means neither installed manifest nor legal text was read.

| Package location | Version | Use | License / obligation key | Local legal evidence |
| --- | --- | --- | --- | --- |
| `node_modules/@babel/code-frame` | 7.29.7 | B | MIT | `node_modules/@babel/code-frame/LICENSE` |
| `node_modules/@babel/compat-data` | 7.29.7 | B | MIT | `node_modules/@babel/compat-data/LICENSE` |
| `node_modules/@babel/core` | 7.29.13 | B | MIT | `node_modules/@babel/core/LICENSE` |
| `node_modules/@babel/generator` | 7.29.14 | B | MIT | `node_modules/@babel/generator/LICENSE` |
| `node_modules/@babel/helper-compilation-targets` | 7.29.13 | B | MIT | `node_modules/@babel/helper-compilation-targets/LICENSE` |
| `node_modules/@babel/helper-globals` | 7.29.7 | B | MIT | `node_modules/@babel/helper-globals/LICENSE` |
| `node_modules/@babel/helper-module-imports` | 7.29.7 | B | MIT | `node_modules/@babel/helper-module-imports/LICENSE` |
| `node_modules/@babel/helper-module-transforms` | 7.29.14 | B | MIT | `node_modules/@babel/helper-module-transforms/LICENSE` |
| `node_modules/@babel/helper-string-parser` | 7.29.14 | B | MIT | `node_modules/@babel/helper-string-parser/LICENSE` |
| `node_modules/@babel/helper-validator-identifier` | 7.29.7 | B | MIT | `node_modules/@babel/helper-validator-identifier/LICENSE` |
| `node_modules/@babel/helper-validator-option` | 7.29.7 | B | MIT | `node_modules/@babel/helper-validator-option/LICENSE` |
| `node_modules/@babel/helpers` | 7.29.14 | B | MIT | `node_modules/@babel/helpers/LICENSE` |
| `node_modules/@babel/parser` | 7.29.14 | B | MIT | `node_modules/@babel/parser/LICENSE` |
| `node_modules/@babel/template` | 7.29.7 | B | MIT | `node_modules/@babel/template/LICENSE` |
| `node_modules/@babel/traverse` | 7.29.14 | B | MIT | `node_modules/@babel/traverse/LICENSE` |
| `node_modules/@babel/types` | 7.29.14 | B | MIT | `node_modules/@babel/types/LICENSE` |
| `node_modules/@cacheable/memory` | 2.2.0 | B | MIT | `node_modules/@cacheable/memory/LICENSE` |
| `node_modules/@cacheable/utils` | 2.5.0 | B | MIT | `node_modules/@cacheable/utils/LICENSE` |
| `node_modules/@dimforge/rapier3d-compat` | 0.12.0 | B | Apache-2.0 | `node_modules/@dimforge/rapier3d-compat/LICENSE` |
| `node_modules/@emnapi/core` | 2.0.0-beta.2 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@emnapi/runtime` | 2.0.0-beta.2 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@emnapi/wasi-threads` | 2.2.0 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@eslint-community/eslint-utils` | 4.10.1 | B | MIT | `node_modules/@eslint-community/eslint-utils/LICENSE` |
| `node_modules/@eslint-community/eslint-utils/node_modules/eslint-visitor-keys` | 3.4.3 | B | Apache-2.0 | `node_modules/@eslint-community/eslint-utils/node_modules/eslint-visitor-keys/LICENSE` |
| `node_modules/@eslint-community/regexpp` | 4.12.3 | B | MIT | `node_modules/@eslint-community/regexpp/LICENSE` |
| `node_modules/@eslint/config-array` | 0.23.6 | B | Apache-2.0 | `node_modules/@eslint/config-array/LICENSE` |
| `node_modules/@eslint/config-array/node_modules/minimatch` | 11.0.8 | B | BlueOak-1.0.0 | `node_modules/@eslint/config-array/node_modules/minimatch/LICENSE.md` |
| `node_modules/@eslint/config-helpers` | 0.7.0 | B | Apache-2.0 | `node_modules/@eslint/config-helpers/LICENSE` |
| `node_modules/@eslint/core` | 1.2.1 | B | Apache-2.0 | `node_modules/@eslint/core/LICENSE` |
| `node_modules/@eslint/js` | 10.0.1 | B, direct | MIT | `node_modules/@eslint/js/LICENSE` |
| `node_modules/@eslint/object-schema` | 3.0.5 | B | Apache-2.0 | `node_modules/@eslint/object-schema/LICENSE` |
| `node_modules/@eslint/plugin-kit` | 0.7.3 | B | Apache-2.0 | `node_modules/@eslint/plugin-kit/LICENSE` |
| `node_modules/@humanfs/core` | 0.19.2 | B | Apache-2.0 | `node_modules/@humanfs/core/LICENSE` |
| `node_modules/@humanfs/node` | 0.16.8 | B | Apache-2.0 | `node_modules/@humanfs/node/LICENSE` |
| `node_modules/@humanfs/types` | 0.15.0 | B | Apache-2.0 | `node_modules/@humanfs/types/README.md`; **full legal text missing** |
| `node_modules/@humanwhocodes/module-importer` | 1.0.1 | B | Apache-2.0 | `node_modules/@humanwhocodes/module-importer/LICENSE` |
| `node_modules/@humanwhocodes/retry` | 0.4.3 | B | Apache-2.0 | `node_modules/@humanwhocodes/retry/LICENSE` |
| `node_modules/@isaacs/nonrecursive-glob-match` | 1.1.0 | B | BlueOak-1.0.0 | `node_modules/@isaacs/nonrecursive-glob-match/LICENSE.md` |
| `node_modules/@jridgewell/gen-mapping` | 0.3.13 | B | MIT | `node_modules/@jridgewell/gen-mapping/LICENSE` |
| `node_modules/@jridgewell/remapping` | 2.3.5 | B | MIT | `node_modules/@jridgewell/remapping/LICENSE` |
| `node_modules/@jridgewell/resolve-uri` | 3.1.3 | B | MIT | `node_modules/@jridgewell/resolve-uri/LICENSE` |
| `node_modules/@jridgewell/sourcemap-codec` | 1.6.0 | B | MIT | `node_modules/@jridgewell/sourcemap-codec/LICENSE` |
| `node_modules/@jridgewell/trace-mapping` | 0.3.31 | B | MIT | `node_modules/@jridgewell/trace-mapping/LICENSE` |
| `node_modules/@keyv/bigmap` | 1.3.1 | B | MIT | `node_modules/@keyv/bigmap/LICENSE` |
| `node_modules/@keyv/serialize` | 1.1.1 | B | MIT | `node_modules/@keyv/serialize/LICENSE` |
| `node_modules/@napi-rs/wasm-runtime` | 1.2.6 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@oxc-project/types` | 0.156.0 | B | MIT | `node_modules/@oxc-project/types/LICENSE` |
| `node_modules/@rolldown/binding-android-arm-eabi` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-android-arm64` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-darwin-arm64` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-darwin-x64` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-freebsd-x64` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-linux-arm-gnueabihf` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-linux-arm64-gnu` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-linux-arm64-musl` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-linux-ppc64-gnu` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-linux-s390x-gnu` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-linux-x64-gnu` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-linux-x64-musl` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-openharmony-arm64` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-wasm32-wasi` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-win32-arm64-msvc` | 1.2.19 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@rolldown/binding-win32-x64-msvc` | 1.2.19 | B, optional | MIT | **full legal text missing** |
| `node_modules/@rolldown/pluginutils` | 1.1.1 | B | MIT | `node_modules/@rolldown/pluginutils/LICENSE` |
| `node_modules/@tweenjs/tween.js` | 23.1.3 | B | MIT | `node_modules/@tweenjs/tween.js/LICENSE` |
| `node_modules/@tybys/wasm-util` | 0.10.4 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/@types/chai` | 5.2.3 | B | MIT | `node_modules/@types/chai/LICENSE` |
| `node_modules/@types/deep-eql` | 4.0.2 | B | MIT | `node_modules/@types/deep-eql/LICENSE` |
| `node_modules/@types/esrecurse` | 4.3.1 | B | MIT | `node_modules/@types/esrecurse/LICENSE` |
| `node_modules/@types/estree` | 1.0.10 | B | MIT | `node_modules/@types/estree/LICENSE` |
| `node_modules/@types/json-schema` | 7.0.15 | B | MIT | `node_modules/@types/json-schema/LICENSE` |
| `node_modules/@types/node` | 24.19.2 | B, direct | MIT | `node_modules/@types/node/LICENSE` |
| `node_modules/@types/react` | 19.3.0 | B, direct | MIT | `node_modules/@types/react/LICENSE` |
| `node_modules/@types/react-dom` | 19.3.0 | B, direct | MIT | `node_modules/@types/react-dom/LICENSE` |
| `node_modules/@types/stats.js` | 0.17.4 | B | MIT | `node_modules/@types/stats.js/LICENSE` |
| `node_modules/@types/three` | 0.187.0 | B, direct | MIT | `node_modules/@types/three/LICENSE` |
| `node_modules/@types/webxr` | 0.5.24 | B | MIT | `node_modules/@types/webxr/LICENSE` |
| `node_modules/@typescript-eslint/eslint-plugin` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/eslint-plugin/LICENSE` |
| `node_modules/@typescript-eslint/eslint-plugin/node_modules/ignore` | 7.0.14 | B | MIT | `node_modules/@typescript-eslint/eslint-plugin/node_modules/ignore/LICENSE-MIT` |
| `node_modules/@typescript-eslint/parser` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/parser/LICENSE` |
| `node_modules/@typescript-eslint/project-service` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/project-service/LICENSE` |
| `node_modules/@typescript-eslint/scope-manager` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/scope-manager/LICENSE` |
| `node_modules/@typescript-eslint/tsconfig-utils` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/tsconfig-utils/LICENSE` |
| `node_modules/@typescript-eslint/type-utils` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/type-utils/LICENSE` |
| `node_modules/@typescript-eslint/types` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/types/LICENSE` |
| `node_modules/@typescript-eslint/typescript-estree` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/typescript-estree/LICENSE` |
| `node_modules/@typescript-eslint/typescript-estree/node_modules/semver` | 7.8.6 | B | ISC | `node_modules/@typescript-eslint/typescript-estree/node_modules/semver/LICENSE` |
| `node_modules/@typescript-eslint/utils` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/utils/LICENSE` |
| `node_modules/@typescript-eslint/visitor-keys` | 8.72.1 | B | MIT | `node_modules/@typescript-eslint/visitor-keys/LICENSE` |
| `node_modules/@vitejs/plugin-react` | 6.1.2 | B, direct | MIT | `node_modules/@vitejs/plugin-react/LICENSE` |
| `node_modules/@vitest/mocker` | 5.0.5 | B | MIT | `node_modules/@vitest/mocker/LICENSE` |
| `node_modules/@vitest/spy` | 5.0.5 | B | MIT | `node_modules/@vitest/spy/LICENSE` |
| `node_modules/acorn` | 8.19.0 | B | MIT | `node_modules/acorn/LICENSE` |
| `node_modules/acorn-jsx` | 5.3.2 | B | MIT | `node_modules/acorn-jsx/LICENSE` |
| `node_modules/ajv` | 6.15.0 | B | MIT | `node_modules/ajv/LICENSE` |
| `node_modules/assertion-error` | 2.0.1 | B | MIT | `node_modules/assertion-error/LICENSE` |
| `node_modules/balanced-match` | 4.0.4 | B | MIT | `node_modules/balanced-match/LICENSE.md` |
| `node_modules/baseline-browser-mapping` | 2.11.37 | B | Apache-2.0 | `node_modules/baseline-browser-mapping/LICENSE.txt` |
| `node_modules/brace-expansion` | 5.0.13 | B | MIT | `node_modules/brace-expansion/LICENSE` |
| `node_modules/browserslist` | 4.29.5 | B | MIT | `node_modules/browserslist/LICENSE` |
| `node_modules/cacheable` | 2.5.0 | B | MIT | `node_modules/cacheable/LICENSE` |
| `node_modules/caniuse-lite` | 1.0.30001826 | B | CC-BY-4.0 | `node_modules/caniuse-lite/LICENSE` |
| `node_modules/chai` | 6.3.0 | B | MIT | `node_modules/chai/LICENSE` |
| `node_modules/convert-source-map` | 2.0.0 | B | MIT | `node_modules/convert-source-map/LICENSE` |
| `node_modules/cross-spawn` | 7.0.6 | B | MIT | `node_modules/cross-spawn/LICENSE` |
| `node_modules/csstype` | 3.2.3 | B | MIT | `node_modules/csstype/LICENSE` |
| `node_modules/debug` | 4.4.3 | B | MIT | `node_modules/debug/LICENSE` |
| `node_modules/deep-is` | 0.1.4 | B | MIT | `node_modules/deep-is/LICENSE` |
| `node_modules/detect-libc` | 2.1.2 | B | Apache-2.0 | `node_modules/detect-libc/LICENSE` |
| `node_modules/electron-to-chromium` | 1.5.485 | B | ISC | `node_modules/electron-to-chromium/LICENSE` |
| `node_modules/es-module-lexer` | 2.3.2 | B | MIT | `node_modules/es-module-lexer/LICENSE` |
| `node_modules/escalade` | 3.2.0 | B | MIT | `node_modules/escalade/license` |
| `node_modules/escape-string-regexp` | 4.0.0 | B | MIT | `node_modules/escape-string-regexp/license` |
| `node_modules/eslint` | 10.14.0 | B, direct | MIT | `node_modules/eslint/LICENSE` |
| `node_modules/eslint-plugin-react-hooks` | 7.1.1 | B, direct | MIT | `node_modules/eslint-plugin-react-hooks/LICENSE` |
| `node_modules/eslint-scope` | 9.1.2 | B | BSD-2-Clause | `node_modules/eslint-scope/LICENSE` |
| `node_modules/eslint-visitor-keys` | 5.0.1 | B | Apache-2.0 | `node_modules/eslint-visitor-keys/LICENSE` |
| `node_modules/espree` | 11.2.0 | B | BSD-2-Clause | `node_modules/espree/LICENSE` |
| `node_modules/esquery` | 1.7.0 | B | BSD-3-Clause | `node_modules/esquery/license.txt` |
| `node_modules/esrecurse` | 4.3.0 | B | BSD-2-Clause | `node_modules/esrecurse/esrecurse.js` |
| `node_modules/estraverse` | 5.3.0 | B | BSD-2-Clause | `node_modules/estraverse/LICENSE.BSD` |
| `node_modules/estree-walker` | 3.0.3 | B | MIT | `node_modules/estree-walker/LICENSE` |
| `node_modules/esutils` | 2.0.3 | B | BSD-2-Clause | `node_modules/esutils/LICENSE.BSD` |
| `node_modules/expect-type` | 1.4.0 | B | Apache-2.0 | `node_modules/expect-type/LICENSE` |
| `node_modules/fast-deep-equal` | 3.1.3 | B | MIT | `node_modules/fast-deep-equal/LICENSE` |
| `node_modules/fast-json-stable-stringify` | 2.1.0 | B | MIT | `node_modules/fast-json-stable-stringify/LICENSE` |
| `node_modules/fast-levenshtein` | 2.0.6 | B | MIT | `node_modules/fast-levenshtein/LICENSE.md` |
| `node_modules/fdir` | 6.5.0 | B | MIT | `node_modules/fdir/LICENSE` |
| `node_modules/fflate` | 0.8.3 | B | MIT | `node_modules/fflate/LICENSE` |
| `node_modules/file-entry-cache` | 11.1.5 | B | MIT | `node_modules/file-entry-cache/LICENSE` |
| `node_modules/find-up` | 5.0.0 | B | MIT | `node_modules/find-up/license` |
| `node_modules/flat-cache` | 6.1.23 | B | MIT | `node_modules/flat-cache/LICENSE` |
| `node_modules/flatted` | 3.4.4 | B | ISC | `node_modules/flatted/LICENSE` |
| `node_modules/fsevents` | 2.3.3 | B, optional | MIT | **LOCK ONLY — absent** |
| `node_modules/gensync` | 1.0.0-beta.2 | B | MIT | `node_modules/gensync/LICENSE` |
| `node_modules/glob-parent` | 6.0.2 | B | ISC | `node_modules/glob-parent/LICENSE` |
| `node_modules/globals` | 17.13.0 | B, direct | MIT | `node_modules/globals/license` |
| `node_modules/hashery` | 1.5.1 | B | MIT | `node_modules/hashery/LICENSE` |
| `node_modules/hermes-estree` | 0.25.1 | B | MIT | `node_modules/hermes-estree/LICENSE` |
| `node_modules/hermes-parser` | 0.25.1 | B | MIT | `node_modules/hermes-parser/LICENSE` |
| `node_modules/hookified` | 1.15.1 | B | MIT | `node_modules/hookified/LICENSE` |
| `node_modules/ignore` | 5.3.2 | B | MIT | `node_modules/ignore/LICENSE-MIT` |
| `node_modules/imurmurhash` | 0.1.4 | B | MIT | `node_modules/imurmurhash/README.md` |
| `node_modules/is-extglob` | 2.1.1 | B | MIT | `node_modules/is-extglob/LICENSE` |
| `node_modules/is-glob` | 4.0.3 | B | MIT | `node_modules/is-glob/LICENSE` |
| `node_modules/isexe` | 2.0.0 | B | ISC | `node_modules/isexe/LICENSE` |
| `node_modules/js-tokens` | 4.0.0 | B | MIT | `node_modules/js-tokens/LICENSE` |
| `node_modules/jsesc` | 3.1.0 | B | MIT | `node_modules/jsesc/LICENSE-MIT.txt` |
| `node_modules/json-schema-traverse` | 0.4.1 | B | MIT | `node_modules/json-schema-traverse/LICENSE` |
| `node_modules/json-stable-stringify-without-jsonify` | 1.0.1 | B | MIT | `node_modules/json-stable-stringify-without-jsonify/LICENSE` |
| `node_modules/json5` | 2.2.3 | B | MIT | `node_modules/json5/LICENSE.md` |
| `node_modules/keyv` | 5.6.0 | B | MIT | `node_modules/keyv/LICENSE` |
| `node_modules/levn` | 0.4.1 | B | MIT | `node_modules/levn/LICENSE` |
| `node_modules/lightningcss` | 1.33.0 | B | MPL-2.0 | `node_modules/lightningcss/LICENSE` |
| `node_modules/lightningcss-android-arm64` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-darwin-arm64` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-darwin-x64` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-freebsd-x64` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-linux-arm-gnueabihf` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-linux-arm64-gnu` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-linux-arm64-musl` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-linux-x64-gnu` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-linux-x64-musl` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-win32-arm64-msvc` | 1.33.0 | B, optional | MPL-2.0 | **LOCK ONLY — absent** |
| `node_modules/lightningcss-win32-x64-msvc` | 1.33.0 | B, optional | MPL-2.0 | `node_modules/lightningcss-win32-x64-msvc/LICENSE` |
| `node_modules/locate-path` | 6.0.0 | B | MIT | `node_modules/locate-path/license` |
| `node_modules/lru-cache` | 5.1.1 | B | ISC | `node_modules/lru-cache/LICENSE` |
| `node_modules/magic-string` | 1.4.5 | B | MIT | `node_modules/magic-string/LICENSE` |
| `node_modules/meshoptimizer` | 1.1.1 | B | MIT | `node_modules/meshoptimizer/LICENSE.md` |
| `node_modules/minimatch` | 10.2.6 | B | BlueOak-1.0.0 | `node_modules/minimatch/LICENSE.md` |
| `node_modules/ms` | 2.1.3 | B | MIT | `node_modules/ms/license.md` |
| `node_modules/nanoid` | 3.3.20 | B | MIT | `node_modules/nanoid/LICENSE` |
| `node_modules/natural-compare` | 1.4.0 | B | MIT | `node_modules/natural-compare/README.md`; **full legal text missing** |
| `node_modules/node-releases` | 2.0.64 | B | MIT | `node_modules/node-releases/LICENSE` |
| `node_modules/obug` | 3.0.0 | B | MIT | `node_modules/obug/LICENSE` |
| `node_modules/optionator` | 0.9.4 | B | MIT | `node_modules/optionator/LICENSE` |
| `node_modules/p-limit` | 3.1.0 | B | MIT | `node_modules/p-limit/license` |
| `node_modules/p-locate` | 5.0.0 | B | MIT | `node_modules/p-locate/license` |
| `node_modules/path-exists` | 4.0.0 | B | MIT | `node_modules/path-exists/license` |
| `node_modules/path-key` | 3.1.1 | B | MIT | `node_modules/path-key/license` |
| `node_modules/picocolors` | 1.1.1 | B | ISC | `node_modules/picocolors/LICENSE` |
| `node_modules/picomatch` | 4.0.7 | B | MIT | `node_modules/picomatch/LICENSE` |
| `node_modules/postcss` | 8.5.33 | B | MIT | `node_modules/postcss/LICENSE` |
| `node_modules/prelude-ls` | 1.2.1 | B | MIT | `node_modules/prelude-ls/LICENSE` |
| `node_modules/prettier` | 3.9.10 | B, direct | MIT | `node_modules/prettier/LICENSE`; `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| `node_modules/punycode` | 2.3.1 | B | MIT | `node_modules/punycode/LICENSE-MIT.txt` |
| `node_modules/qified` | 0.10.1 | B | MIT | `node_modules/qified/LICENSE` |
| `node_modules/qified/node_modules/hookified` | 2.2.0 | B | MIT | `node_modules/qified/node_modules/hookified/LICENSE` |
| `node_modules/react` | 19.3.1 | R, direct | MIT | `node_modules/react/LICENSE` |
| `node_modules/react-dom` | 19.3.1 | R, direct | MIT | `node_modules/react-dom/LICENSE` |
| `node_modules/rolldown` | 1.2.19 | B | MIT | `node_modules/rolldown/LICENSE`; `node_modules/rolldown/THIRD-PARTY-LICENSE` |
| `node_modules/scheduler` | 0.28.0 | R | MIT | `node_modules/scheduler/LICENSE` |
| `node_modules/semver` | 6.3.2 | B | ISC | `node_modules/semver/LICENSE` |
| `node_modules/shebang-command` | 2.0.0 | B | MIT | `node_modules/shebang-command/license` |
| `node_modules/shebang-regex` | 3.0.0 | B | MIT | `node_modules/shebang-regex/license` |
| `node_modules/source-map-js` | 1.2.2 | B | BSD-3-Clause | `node_modules/source-map-js/LICENSE` |
| `node_modules/std-env` | 4.3.0 | B | MIT | `node_modules/std-env/LICENCE` |
| `node_modules/three` | 0.187.0 | R, direct | MIT | `node_modules/three/LICENSE`; `node_modules/three/examples/jsm/misc/SculptGL.LICENSE.txt` |
| `node_modules/tinybench` | 6.2.3 | B | MIT | `node_modules/tinybench/LICENSE` |
| `node_modules/tinyexec` | 1.3.1 | B | MIT | `node_modules/tinyexec/LICENSE` |
| `node_modules/tinyglobby` | 0.2.17 | B | MIT | `node_modules/tinyglobby/LICENSE` |
| `node_modules/ts-api-utils` | 2.5.0 | B | MIT | `node_modules/ts-api-utils/LICENSE.md` |
| `node_modules/tslib` | 2.9.1 | B, optional | 0BSD | **LOCK ONLY — absent** |
| `node_modules/type-check` | 0.4.0 | B | MIT | `node_modules/type-check/LICENSE` |
| `node_modules/typescript` | 6.0.3 | B, direct | Apache-2.0 | `node_modules/typescript/LICENSE.txt`; `node_modules/typescript/ThirdPartyNoticeText.txt` |
| `node_modules/typescript-eslint` | 8.72.1 | B, direct | MIT | `node_modules/typescript-eslint/LICENSE` |
| `node_modules/undici-types` | 7.24.6 | B | MIT | `node_modules/undici-types/LICENSE` |
| `node_modules/update-browserslist-db` | 1.3.4 | B | MIT | `node_modules/update-browserslist-db/LICENSE` |
| `node_modules/uri-js` | 4.4.1 | B | BSD-2-Clause | `node_modules/uri-js/LICENSE` |
| `node_modules/vite` | 8.3.5 | B, direct | MIT | `node_modules/vite/LICENSE.md` |
| `node_modules/vitest` | 5.0.5 | B, direct | MIT | `node_modules/vitest/LICENSE.md` |
| `node_modules/which` | 2.0.2 | B | ISC | `node_modules/which/LICENSE` |
| `node_modules/why-is-node-running` | 3.2.1 | B | MIT | `node_modules/why-is-node-running/LICENSE` |
| `node_modules/word-wrap` | 1.2.5 | B | MIT | `node_modules/word-wrap/LICENSE` |
| `node_modules/yallist` | 3.1.1 | B | ISC | `node_modules/yallist/LICENSE` |
| `node_modules/yocto-queue` | 0.1.0 | B | MIT | `node_modules/yocto-queue/license` |
| `node_modules/zod` | 4.6.7 | B | MIT | `node_modules/zod/LICENSE` |
| `node_modules/zod-validation-error` | 4.0.2 | B | MIT | `node_modules/zod-validation-error/LICENSE` |

## Bundled blocks with declarations but no full legal text

[DEMONSTRATED: generator identifies blocks without recognized legal-text phrases] These gaps are in upstream tooling distributions. The archived notice files preserve exactly what was supplied, including author/repository information where present.

| Container | Component | Declared license |
| --- | --- | --- |
| prettier | @braindb/mdast-util-wiki-link | MIT |
| prettier | @braindb/micromark-extension-wiki-link | MIT |
| prettier | @handlebars/parser | ISC |
| prettier | flow-estree | MIT |
| prettier | flow-parser | MIT |
| prettier | postcss-media-query-parser | MIT |
| prettier | remark-math | MIT |
| prettier | remark-parse | MIT |
| prettier | trim | MIT |
| vite | @polka/compression | MIT |
| vite | @polka/url | MIT |
| vite | is-reference | MIT |
| vite | sirv | MIT |
| vite | string-hash | CC0-1.0 |
| vitest | @bomb.sh/tab | MIT |
| vitest | natural-compare | MIT |

## Components named inside upstream bundle notices

[ESTABLISHED: installed upstream notices] These are additional attribution entries embedded in package artifacts; some overlap the lock graph at different versions. `Unstated` is an evidence gap, not permission to assume the lock's version. Preserve the complete named component's block in the notice archive. Three's SculptGL example is recorded because it ships in that package; its presence here does not assert that the app imports it. The TypeScript notice also reproduces Unicode, W3C DOM, WHATWG DOM (CC-BY-4.0), W3C Background Synchronization and Khronos WebGL terms, preserved verbatim in the archive. The W3C specification notice calls for specification name/version attribution; the installed notice does not identify a version, so that remains a distribution-evidence gap.

| Container | Component | Exact version in notice | License | Manifest build specifier, if any | Notice path |
| --- | --- | --- | --- | --- | --- |
| prettier | @angular/compiler | 22.0.6 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @babel/code-frame | 8.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @babel/helper-validator-identifier | 8.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @babel/parser | 8.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @braindb/mdast-util-wiki-link | 0.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @braindb/micromark-extension-wiki-link | 0.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @cacheable/memory | 2.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @cacheable/utils | 2.5.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @glimmer/syntax | 0.95.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @glimmer/util | 0.94.8 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @glimmer/wire-format | 0.94.8 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @handlebars/parser | 2.2.2 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @keyv/serialize | 1.1.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @nodelib/fs.scandir | 2.1.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @nodelib/fs.stat | 2.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @nodelib/fs.walk | 1.2.8 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @prettier/cli | 0.12.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @prettier/html-event-attributes | 0.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @prettier/parse-srcset | 3.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @typescript-eslint/types | 8.70.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | @typescript-eslint/typescript-estree | 8.70.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | acorn | 8.17.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | acorn-jsx | 5.3.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | angular-estree-parser | 15.5.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | angular-html-parser | 10.12.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ansi-purge | 1.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ansi-regex | 6.2.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ansi-truncate | 1.4.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | atomically | 2.1.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | bail | 1.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | balanced-match | 4.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | base64-js | 1.5.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | binary-extensions | 3.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | brace-expansion | 5.0.6 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | braces | 3.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | buffer | 6.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | cacheable | 2.5.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | camelcase | 9.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ccount | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | character-entities | 2.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | character-entities-legacy | 1.1.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | character-reference-invalid | 1.1.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ci-info | 4.4.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | collapse-white-space | 1.0.6 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | common-path-prefix | 3.0.0 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | dashify | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | decode-named-character-reference | 1.3.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | deno-path-from-file-url | 0.0.7 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | dettle | 1.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | devlop | 1.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | diff | 9.0.0 | BSD-3-Clause | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | editorconfig-without-wasm | 0.0.7 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | emoji-regex | 10.6.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | escape-string-regexp | 5.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | eslint-visitor-keys | 5.0.1 | Apache-2.0 | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | espree | 11.2.0 | BSD-2-Clause | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | extend | 3.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | fast-glob | 3.3.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | fast-ignore | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | fast-json-stable-stringify | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | fast-string-truncated-width | 3.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | fast-string-width | 3.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | fastq | 1.20.1 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | file-entry-cache | 11.1.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | fill-range | 7.1.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | find-cache-directory | 6.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | find-in-directory | 5.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | find-up-json | 2.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | find-up-path | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | find-up-simple | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | flat-cache | 6.1.23 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | flatted | 3.4.2 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | flatten | 1.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | flow-estree | 0.322.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | flow-parser | 0.322.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | function-once | 3.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | get-current-package | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | get-east-asian-width | 1.6.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | get-stdin | 9.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | glob-parent | 5.1.2 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | grammex | 3.1.12 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | graphmatch | 1.1.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | graphql | 17.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | hashery | 1.5.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | hookified | 1.15.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ieee754 | 1.2.1 | BSD-3-Clause | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ignore | 7.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | import-meta-resolve | 4.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | imurmurhash-esm | 0.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | index-to-position | 1.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | indexes-of | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | inherits | 2.0.4 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ini-simple-parser | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ionstore | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-alphabetical | 1.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-alphanumerical | 1.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-binary-path | 3.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-buffer | 2.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-decimal | 1.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-es5-identifier-name | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-extglob | 2.1.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-glob | 4.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-hexadecimal | 1.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-number | 7.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-plain-obj | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-whitespace-character | 1.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | is-word-character | 1.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | isoconcurrency | 1.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | isotimer | 1.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | iterate-directory-up | 1.5.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | jest-docblock | 30.4.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | js-tokens | 10.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | js-yaml | 5.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | json-sorted-stringify | 1.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | json5 | 2.2.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | kasi | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | katex | 0.16.47 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | keyv | 5.6.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | leven | 4.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | lomemo | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | longest-streak | 3.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | markdown-escapes | 1.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | markdown-table | 3.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-find-and-replace | 3.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-from-markdown | 2.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-gfm | 3.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-gfm-autolink-literal | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-gfm-footnote | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-gfm-strikethrough | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-gfm-table | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-gfm-task-list-item | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-math | 3.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-phrasing | 4.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-to-markdown | 2.1.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | mdast-util-to-string | 4.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | merge2 | 1.4.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | meriyah | 7.1.1 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark | 4.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-core-commonmark | 2.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-gfm | 3.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-gfm-autolink-literal | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-gfm-footnote | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-gfm-strikethrough | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-gfm-table | 2.1.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-gfm-tagfilter | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-gfm-task-list-item | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-extension-math | 3.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-factory-destination | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-factory-label | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-factory-space | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-factory-title | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-factory-whitespace | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-character | 2.1.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-chunked | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-classify-character | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-combine-extensions | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-decode-numeric-character-reference | 2.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-decode-string | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-encode | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-html-tag-name | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-normalize-identifier | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-resolve-all | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-sanitize-uri | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-subtokenize | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromark-util-symbol | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | micromatch | 4.0.8 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | minimatch | 10.2.5 | BlueOak-1.0.0 | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | minimist | 1.2.8 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | n-readlines | 3.4.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | nanoid | 3.3.15 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | narrow-emojis | 0.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | parse-entities | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | parse-json | 8.3.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | picocolors | 1.1.1 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | picomatch | 2.3.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | pioppo | 1.2.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | pkg-dir | 8.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | please-upgrade-node | 3.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | postcss | 8.5.16 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | postcss-less | 6.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | postcss-media-query-parser | 0.2.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | postcss-scss | 4.0.9 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | postcss-selector-parser | 2.2.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | postcss-values-parser | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | promise-make-counter | 1.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | promise-make-naked | 3.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | promise-resolve-timeout | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | qified | 0.10.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | queue-microtask | 1.2.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | remark-footnotes | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | remark-math | 3.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | remark-parse | 8.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | repeat-string | 1.6.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | reusify | 1.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | run-parallel | 1.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | search-closest | 3.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | semver-compare | 1.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | simple-html-tokenizer | 0.5.11 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | smol-toml | 1.7.0 | BSD-3-Clause | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | specialist | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | state-toggle | 1.0.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | stdin-blocker | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | string-escape-regex | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | strip-ansi | 7.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | stubborn-fs | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | stubborn-utils | 1.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-bin | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-colors | 2.2.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-cursor | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-editorconfig | 1.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-levenshtein | 1.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-parse-argv | 2.8.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-readdir | 2.7.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-readdir-glob | 1.23.2 | See notice | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-spinner | 2.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-truncate | 1.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | tiny-updater | 3.7.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | to-fast-properties | 4.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | to-regex-range | 5.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | trim | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | trim-newlines | 5.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | trim-trailing-lines | 1.1.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | trough | 1.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | ts-api-utils | 2.5.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | typescript | 6.0.3 | Apache-2.0 | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | unherit | 1.1.3 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | unified | 9.2.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | uniq | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | unist-util-is | 6.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | unist-util-remove-position | 2.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | unist-util-stringify-position | 4.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | unist-util-visit | 5.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | unist-util-visit-parents | 6.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | url-or-path | 2.7.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | vfile | 4.2.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | vfile-location | 3.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | vfile-message | 2.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | vnopts | 2.0.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | wcwidth.js | 2.0.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | webworker-shim | 1.1.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | when-exit | 2.1.5 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | worktank | 3.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | xtend | 4.0.2 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | yaml | 2.9.0 | ISC | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | yaml-unist-parser | 3.2.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | zeptomatch | 2.1.0 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | zeptomatch-escape | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | zeptomatch-explode | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | zeptomatch-is-static | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | zeptomatch-unescape | 1.0.1 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| prettier | zwitch | 2.0.4 | MIT | — | `node_modules/prettier/THIRD-PARTY-NOTICES.md` |
| vite | @jridgewell/gen-mapping | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | @jridgewell/remapping | Unstated | MIT | ^2.3.5 | `node_modules/vite/LICENSE.md` |
| vite | @jridgewell/sourcemap-codec | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | @jridgewell/trace-mapping | Unstated | MIT | ^0.3.31 | `node_modules/vite/LICENSE.md` |
| vite | @jridgewell/resolve-uri | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | @polka/compression | Unstated | MIT | ^1.0.0-next.25 | `node_modules/vite/LICENSE.md` |
| vite | @polka/url | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | @rollup/plugin-alias | Unstated | MIT | ^6.0.0 | `node_modules/vite/LICENSE.md` |
| vite | @rollup/plugin-dynamic-import-vars | Unstated | MIT | 2.1.4 | `node_modules/vite/LICENSE.md` |
| vite | @rollup/pluginutils | Unstated | MIT | ^5.4.0 | `node_modules/vite/LICENSE.md` |
| vite | @vitest/utils | Unstated | MIT | ^4.1.12 | `node_modules/vite/LICENSE.md` |
| vite | @voidzero-dev/vite-task-client | Unstated | MIT | ^0.2.0 | `node_modules/vite/LICENSE.md` |
| vite | anymatch | Unstated | ISC | — | `node_modules/vite/LICENSE.md` |
| vite | artichokie | Unstated | MIT | ^0.4.5 | `node_modules/vite/LICENSE.md` |
| vite | binary-extensions | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | braces | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | fill-range | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | is-number | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | bundle-name | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | default-browser | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | default-browser-id | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | define-lazy-prop | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | is-docker | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | is-inside-container | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | is-wsl | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | open | Unstated | MIT | ^10.2.0 | `node_modules/vite/LICENSE.md` |
| vite | run-applescript | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | wsl-utils | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | cac | Unstated | MIT | ^7.1.0 | `node_modules/vite/LICENSE.md` |
| vite | chokidar | Unstated | MIT | ^3.6.0 | `node_modules/vite/LICENSE.md` |
| vite | connect | Unstated | MIT | ^3.7.0 | `node_modules/vite/LICENSE.md` |
| vite | convert-source-map | Unstated | MIT | ^2.0.0 | `node_modules/vite/LICENSE.md` |
| vite | cors | Unstated | MIT | ^2.8.6 | `node_modules/vite/LICENSE.md` |
| vite | cssesc | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | dotenv-expand | Unstated | BSD-2-Clause | ^13.0.0 | `node_modules/vite/LICENSE.md` |
| vite | ee-first | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | encodeurl | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | entities | Unstated | BSD-2-Clause | — | `node_modules/vite/LICENSE.md` |
| vite | es-module-lexer | Unstated | MIT | ^2.3.2 | `node_modules/vite/LICENSE.md` |
| vite | escape-html | Unstated | MIT | ^1.0.3 | `node_modules/vite/LICENSE.md` |
| vite | estree-walker | Unstated | MIT | ^3.0.3 | `node_modules/vite/LICENSE.md` |
| vite | etag | Unstated | MIT | ^1.8.1 | `node_modules/vite/LICENSE.md` |
| vite | finalhandler | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | follow-redirects | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | fresh-import | Unstated | MIT | ^0.2.1 | `node_modules/vite/LICENSE.md` |
| vite | generic-names | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | glob-parent | Unstated | ISC | — | `node_modules/vite/LICENSE.md` |
| vite | host-validation-middleware | Unstated | MIT | ^0.1.4 | `node_modules/vite/LICENSE.md` |
| vite | http-proxy-3 | Unstated | MIT | ^1.23.3 | `node_modules/vite/LICENSE.md` |
| vite | icss-utils | Unstated | ISC | — | `node_modules/vite/LICENSE.md` |
| vite | is-binary-path | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | is-extglob | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | is-glob | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | is-reference | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | js-tokens | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | launch-editor | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | launch-editor-middleware | Unstated | MIT | ^2.14.2 | `node_modules/vite/LICENSE.md` |
| vite | lilconfig | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | loader-utils | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | lodash.camelcase | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | magic-string | Unstated | MIT | ^1.4.3 | `node_modules/vite/LICENSE.md` |
| vite | mlly | Unstated | MIT | ^1.8.2 | `node_modules/vite/LICENSE.md` |
| vite | ufo | Unstated | MIT | ^1.6.4 | `node_modules/vite/LICENSE.md` |
| vite | mrmime | Unstated | MIT | ^2.0.1 | `node_modules/vite/LICENSE.md` |
| vite | normalize-path | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | object-assign | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | obug | Unstated | MIT | ^1.0.2 | `node_modules/vite/LICENSE.md` |
| vite | on-finished | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | parse5 | Unstated | MIT | ^8.0.1 | `node_modules/vite/LICENSE.md` |
| vite | parseurl | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | periscopic | Unstated | MIT | ^4.0.3 | `node_modules/vite/LICENSE.md` |
| vite | picocolors | Unstated | ISC | ^1.1.1 | `node_modules/vite/LICENSE.md` |
| vite | postcss-import | Unstated | MIT | ^16.2.0 | `node_modules/vite/LICENSE.md` |
| vite | postcss-load-config | Unstated | MIT | ^6.0.1 | `node_modules/vite/LICENSE.md` |
| vite | postcss-modules | Unstated | MIT | ^9.0.1 | `node_modules/vite/LICENSE.md` |
| vite | postcss-modules-extract-imports | Unstated | ISC | — | `node_modules/vite/LICENSE.md` |
| vite | postcss-modules-local-by-default | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | postcss-modules-scope | Unstated | ISC | — | `node_modules/vite/LICENSE.md` |
| vite | postcss-modules-values | Unstated | ISC | — | `node_modules/vite/LICENSE.md` |
| vite | postcss-selector-parser | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | postcss-value-parser | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | readdirp | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | resolve.exports | Unstated | MIT | ^2.0.4 | `node_modules/vite/LICENSE.md` |
| vite | totalist | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | shell-quote | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | sirv | Unstated | MIT | ^3.0.2 | `node_modules/vite/LICENSE.md` |
| vite | statuses | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | std-env | Unstated | MIT | ^4.3.0 | `node_modules/vite/LICENSE.md` |
| vite | string-hash | Unstated | CC0-1.0 | — | `node_modules/vite/LICENSE.md` |
| vite | strip-literal | Unstated | MIT | ^4.0.0 | `node_modules/vite/LICENSE.md` |
| vite | tinyexec | Unstated | MIT | ^1.3.1 | `node_modules/vite/LICENSE.md` |
| vite | to-regex-range | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | unpipe | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | util-deprecate | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | utils-merge | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | vary | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vite | ws | Unstated | MIT | ^8.22.0 | `node_modules/vite/LICENSE.md` |
| vite | zimmerframe | Unstated | MIT | — | `node_modules/vite/LICENSE.md` |
| vitest | @antfu/install-pkg | Unstated | MIT | ^2.1.0 | `node_modules/vitest/LICENSE.md` |
| vitest | @bomb.sh/tab | Unstated | MIT | ^0.0.22 | `node_modules/vitest/LICENSE.md` |
| vitest | @jridgewell/resolve-uri | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | @jridgewell/sourcemap-codec | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | @jridgewell/trace-mapping | Unstated | MIT | 0.3.31 | `node_modules/vitest/LICENSE.md` |
| vitest | @sinonjs/commons | Unstated | BSD-3-Clause | — | `node_modules/vitest/LICENSE.md` |
| vitest | @sinonjs/fake-timers | Unstated | BSD-3-Clause | 15.4.0 | `node_modules/vitest/LICENSE.md` |
| vitest | acorn | Unstated | MIT | 8.11.3 | `node_modules/vitest/LICENSE.md` |
| vitest | acorn-walk | Unstated | MIT | ^8.3.5 | `node_modules/vitest/LICENSE.md` |
| vitest | birpc | Unstated | MIT | ^4.2.0 | `node_modules/vitest/LICENSE.md` |
| vitest | cac | Unstated | MIT | ^6.7.14 | `node_modules/vitest/LICENSE.md` |
| vitest | convert-source-map | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | diff-sequences | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | flatted | Unstated | ISC | ^3.4.4 | `node_modules/vitest/LICENSE.md` |
| vitest | js-tokens | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | kleur | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | local-pkg | Unstated | MIT | ^1.2.1 | `node_modules/vitest/LICENSE.md` |
| vitest | mime | Unstated | MIT | ^4.1.0 | `node_modules/vitest/LICENSE.md` |
| vitest | mlly | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | natural-compare | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | package-manager-detector | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | pathe | Unstated | MIT | ^2.0.3 | `node_modules/vitest/LICENSE.md` |
| vitest | prompts | Unstated | MIT | ^2.4.2 | `node_modules/vitest/LICENSE.md` |
| vitest | quansync | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | react-is | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | sisteransi | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | strip-literal | Unstated | MIT | ^4.0.0 | `node_modules/vitest/LICENSE.md` |
| vitest | tinyhighlight | Unstated | MIT | ^0.3.2 | `node_modules/vitest/LICENSE.md` |
| vitest | tinyrainbow | Unstated | MIT | ^3.2.0 | `node_modules/vitest/LICENSE.md` |
| vitest | type-detect | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | ufo | Unstated | MIT | — | `node_modules/vitest/LICENSE.md` |
| vitest | ws | Unstated | MIT | ^8.22.0 | `node_modules/vitest/LICENSE.md` |
| rolldown | Rollup contributors | Unstated | MIT | — | `node_modules/rolldown/THIRD-PARTY-LICENSE` |
| rolldown | Evan Wallace material (project unnamed in notice) | Unstated | MIT | — | `node_modules/rolldown/THIRD-PARTY-LICENSE` |
| typescript | DefinitelyTyped | Unstated | MIT | — | `node_modules/typescript/ThirdPartyNoticeText.txt` |
| typescript | Unicode data files and software | Unstated | Unicode notice; see exact text | — | `node_modules/typescript/ThirdPartyNoticeText.txt` |
| typescript | Document Object Model (W3C) | Unstated | W3C License; preserve full notice and mark changes | — | `node_modules/typescript/ThirdPartyNoticeText.txt` |
| typescript | Document Object Model (WHATWG) | Unstated | CC-BY-4.0 | — | `node_modules/typescript/ThirdPartyNoticeText.txt` |
| typescript | Web Background Synchronization Specification | Unstated | W3C Community Final Specification Agreement; attribution includes specification name and version | — | `node_modules/typescript/ThirdPartyNoticeText.txt` |
| typescript | WebGL (Khronos Group) | Unstated | MIT-style Materials license; preserve exact text | — | `node_modules/typescript/ThirdPartyNoticeText.txt` |
| three | SculptGL | Unstated | MIT | — | `node_modules/three/examples/jsm/misc/SculptGL.LICENSE.txt` |
