# Repository licence options

Audit date: 2026-11-14 (Pacific). This is an owner decision brief, not a licence grant. [DEMONSTRATED: `git ls-files 'LICENSE*' 'COPYING*'`; `package.json`] The audited checkout has no root licence and no package `license` field. `private: true` prevents accidental npm publication; it does not state copyright permissions or GitHub visibility.

[ESTABLISHED: [Space Apps terms](https://www.spaceappschallenge.org/legal/)] Original event content must be unrestricted or use an OSI-compliant licence; the terms specify Apache 2.0 distribution by NASA when no compliant licence is supplied. S10 read the official indexed terms; direct retrieval returned HTTP 502. Publish an explicit choice rather than treating that fallback as an existing repository licence. Eligibility and a complete submission still need the separate checks in [gaps.md](gaps.md).

## Three compatible choices for original project material

The fit assessment is [ASSUMED: application of the cited licences to the inventory]. Each option can coexist with the observed dependency terms if those terms and notices are preserved. None relicenses upstream code, reference documents, trademarks or third-party pictures. The missing licence evidence in [dependencies.md](dependencies.md) remains unresolved under every option.

| Option | Allows | Requires / trade-off | Fit |
|---|---|---|---|
| **Apache-2.0 (recommended)** | Commercial use, modification and redistribution, with an explicit contributor patent grant and its patent-litigation termination condition. | Supply the licence; mark changed files; retain applicable source attribution and any upstream NOTICE content. No trademark grant. More notice administration than MIT. | OSI-approved; aligns with the event's stated default and the installed GMAT tool's licence. |
| **MIT** | Use, modify, sublicense, sell and redistribute. | Preserve the copyright and permission notice in copies or substantial portions. The text contains no express patent grant. | OSI-approved, brief and familiar; matches the four browser-runtime packages. |
| **BSD-3-Clause** | Use and redistribute source or binaries, with modifications, including commercially. | Keep copyright, conditions and disclaimer in source and in binary documentation/materials; do not use holder/contributor names for endorsement without permission. No express patent grant. | OSI-approved; useful if an explicit non-endorsement clause is preferred. |

[ESTABLISHED: [Apache 2.0 text](https://www.apache.org/licenses/LICENSE-2.0), [MIT text](https://opensource.org/license/mit), [BSD-3-Clause text](https://opensource.org/license/bsd-3-clause)] All three primary texts were opened during S10. Their permissions do not certify ownership of the material being licensed.

## Recommendation and concrete follow-through

[ASSUMED] Choose **Apache-2.0 for original code, documentation and project-created reference data**, with third-party material explicitly excluded and credited under its own terms. This keeps one understandable original-content policy and provides an express patent grant. The owner supplies the approved rights-holder wording; S10 does not infer it from git identities. AI provenance describes assistance and human decisions, not a guarantee that every generated element has copyright protection.

[ASSUMED] After the owner chooses, the integrator should add the exact licence as `LICENSE`, set `package.json`'s SPDX `license` field, and record original-content scope in `README.md`. 5A should carry the selected licence and applicable dependency notices into the deployed static files and source release. Link credits from the console or landing page. A repository-only notice does not establish that a separately distributed browser bundle includes its required notices.

[ESTABLISHED: local package licence evidence in `dependencies.md`] The runtime graph is MIT, but the development graph also contains Apache, BSD, ISC, MPL-2.0 and CC-BY-4.0 material and bundled subcomponents. Preserve their own terms. In particular, do not call the whole dependency tree MIT, remove copyright/permission notices during minification without another distributed notice copy, or assume a root licence replaces MPL source obligations when covered software is redistributed. Merely running a build tool is different from distributing that tool.

[ASSUMED] Smallest adequate release: explicit original-content licence plus complete notices for what is actually shipped and public source/run instructions. Best version: additionally archive platform-specific dependency evidence, record exact build-tool versions, and verify deployed credit links against the frozen release. The smaller version loses cross-platform redistribution assurance, not permission to omit notices for shipped code.

## Owner question

**Which original-content licence should the integrator publish?** Recommendation: Apache-2.0, with a confirmed rights-holder line and upstream exceptions. MIT is the simpler alternative; BSD-3-Clause adds explicit non-endorsement wording. This study makes no change to the repository's legal status.
