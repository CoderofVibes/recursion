# External tools and research dependencies

[ESTABLISHED: `package.json`, `.github/workflows/deploy.yml`, `tools/`, local installed metadata] These are development or research tools, separate from the npm application dependency inventory in [dependencies.md](dependencies.md). They are not shipped by the existing static-build workflow. Installed versions describe this audit environment, not an assertion that every historical author used the same version. No software was installed for S10.

| Tool / version evidence | Actual use / repository paths | Licence evidence and redistribution action |
|---|---|---|
| Node.js **24.22.1** observed with `node --version`; project allows `>=22.12.0`; CI requests major `22` | Runs Vite, TypeScript, ESLint, Vitest and npm; `package.json`, `.github/workflows/deploy.yml` | No Node distribution licence file was present beside the observed executable. **Local licence-text gap**; inspect the precise Node distribution and bundled notices if packaging it. It is not part of the browser payload. |
| npm **11.19.1**, installed `node_modules/npm/package.json` under the Node installation | Dependency installer; README uses `npm install`, CI uses `npm ci` | Installed `node_modules/npm/LICENSE`: Artistic-2.0 for npm; its own dependencies retain their terms. Preserve the complete distribution notices if distributing npm. Its internal dependency tree is external toolchain content, not the project's lockfile. |
| Python **3.14.2**, `python --version` | `tools/gmat/`, `tools/physics/`, `tools/estimator-ref/`, `tools/studies/` | Installed Python `LICENSE.txt`: PSF version 2 and historic/third-party notices. Retain the distribution's complete terms if bundling Python; no interpreter copied into the project. |
| NumPy **2.4.1**, `importlib.metadata.version('numpy')`; not pinned in a repository requirements file | `tools/estimator-ref/estref/`, `tools/estimator-ref/crosscheck_1b.py`, `tools/studies/s1/`, `s2/`, `s3/`, `s5/`, `s6/`; reference calculations, not browser execution | Installed `numpy-2.4.1.dist-info/licenses/LICENSE.txt`: BSD-3-Clause, with additional bundled notices below. Metadata has no `Requires-Dist` dependencies, but native bundled components still have terms. |
| GMAT **R2026a**, executable/build hashes in each `tests/vectors/gmat/*.csv` header | `tools/gmat/*.script`, `tools/gmat/reference.py`; generates four Newtonian comparison datasets | Installed distribution `GMAT/R2026a/License.txt` is Apache-2.0. Credit the tool and NASA catalogue; do not confuse its software licence with a licence for every bundled external dataset. See [NASA evidence](nasa-evidence.md). The executable is not distributed in this repo. |
| Google Chrome, historical capture version **unrecorded** | `prototypes/shots/capture.mjs` explicitly invokes installed Chrome through the DevTools protocol; `docs/handoffs/2D.md` records scripted browser checks | External capture/test tool, not a bundled dependency. No Chrome distribution licence audit was performed; inspect its exact distribution terms if packaging the browser. Record the capture version in future release evidence. |
| `actions/checkout@v5`, `actions/setup-node@v5`, `actions/upload-pages-artifact@v4`, `actions/deploy-pages@v4`; runner `ubuntu-latest` | `.github/workflows/deploy.yml`; checkout, Node setup, upload `dist`, deploy Pages | Tags and runner image are mutable; exact executed SHAs and action licence files are **not retained locally**. Record them from the actual release run; audit the action files if redistributing them. A workflow definition does not prove a successful or publicly accessible deployment. |

## NumPy bundled notices inspected offline

[ESTABLISHED: installed `numpy-2.4.1.dist-info/licenses/`] The following are research-tool dependencies. Their exact subcomponent versions are **not supplied by these licence files**; do not invent version numbers. Preserve the complete installed licence directory if distributing this wheel, not only the top-level BSD notice. Using NumPy to calculate the project's own vectors does not by itself copy these libraries into those vectors.

| Component | Licence-file path relative to that directory | Observed terms / notice to preserve |
|---|---|---|
| NumPy; OpenBLAS; LAPACK; GCC runtime in `numpy.libs/libscipy_openblas*.dll` | `LICENSE.txt` | NumPy/OpenBLAS BSD-3-Clause; LAPACK BSD-3-Clause-Open-MPI; GCC GPL-3.0-or-later **with GCC-exception-3.1**. Preserve the complete texts and exception when redistributing binaries; this is not evidence that the game is GPL. |
| libdivide | `numpy/_core/include/numpy/libdivide/LICENSE.txt` | zlib notice; retain origin and altered-source notices. |
| pythoncapi-compat | `numpy/_core/src/common/pythoncapi-compat/COPYING` | BSD Zero Clause text. |
| Highway | `numpy/_core/src/highway/LICENSE` | Apache-2.0 OR BSD-3-Clause, with CC0 for the identified random header; preserve chosen licence and exceptions. |
| Dragon4 | `numpy/_core/src/multiarray/dragon4_LICENSE.txt` | MIT copyright/permission/disclaimer. |
| x86-simd-sort | `numpy/_core/src/npysort/x86-simd-sort/LICENSE.md` | BSD-3-Clause. |
| SVML | `numpy/_core/src/umath/svml/LICENSE` | BSD-style copyright, conditions and disclaimer. |
| pocketfft | `numpy/fft/pocketfft/LICENSE.md` | BSD-style copyright, conditions and disclaimer. |
| LAPACK lite | `numpy/linalg/lapack_lite/LICENSE.txt` | LAPACK source terms and contributor notices. |
| Masked arrays | `numpy/ma/LICENSE` | BSD-style copyright, conditions and disclaimer. |
| NumPy random | `numpy/random/LICENSE.md` | NCSA OR BSD-3-Clause. |
| Distributions and MT19937 | `numpy/random/src/distributions/LICENSE.md`, `numpy/random/src/mt19937/LICENSE.md` | Preserve each named upstream copyright and BSD-style conditions. |
| PCG64, SFC64, Philox, SplitMix64 | `numpy/random/src/pcg64/LICENSE.md`, `numpy/random/src/sfc64/LICENSE.md`, `numpy/random/src/philox/LICENSE.md`, `numpy/random/src/splitmix64/LICENSE.md` | PCG64 and SFC64 MIT; Philox BSD-style; SplitMix64 public-domain dedication. |

[ASSUMED] Release recommendation: distribute the source, game build and generated verification vectors, with reproducible tool/version instructions. Leave the external interpreter, GMAT distribution, CI actions and NumPy wheel to their publishers unless there is a specific reason to package them. Pin research dependencies for future reproducibility; rerun this audit if the distribution boundary changes.
