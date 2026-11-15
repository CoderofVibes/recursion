# Live-field admission rerun

Execution: **completed**; 24 cases. Encounter admission: **incomplete**.

Source revision: `6344b17d7490f854ae355169fe08b5e1cf98aafb`. Source fingerprint: `47643105ec09674ac13077bed6a5df907cf7f88e11a8cdb4548c2065d88cedf0`.

Exact full-result and field-observation repetition: **passed for every case**.

These use the existing 3E runner and the production lifecycle/throat hooks. Field observers return each hook result unchanged. Fixed author controls and the approved field are not tuned by this run.

| Case | Historical result | Current result / stop (s) | Main (kg) | RCS (kg) | Birth / veto |
| --- | --- | --- | ---: | ---: | ---: |
| [s22-22000-axial-away](s22-22000-axial-away.json) | lost (collision) | lost (collision) / 1622 | 122.365946 | 0.676721 | 216 / 0 |
| [s22-22000-coast](s22-22000-coast.json) | lost (collision) | lost (collision) / 1765 | 0.000000 | 0.000000 | 216 / 0 |
| [s22-22000-cutoff-abort-positive-y](s22-22000-cutoff-abort-positive-y.json) | unavailable | in-progress / 3600 | 61.182973 | 0.574749 | 650 / 0 |
| [s22-22000-cutoff-abort](s22-22000-cutoff-abort.json) | in-progress | in-progress / 3600 | 61.182973 | 0.556209 | 650 / 0 |
| [s22-22000-delayed-negative-y](s22-22000-delayed-negative-y.json) | in-progress | in-progress / 36000 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22000-delayed-positive-y](s22-22000-delayed-positive-y.json) | completed (forward) | completed (forward) / 22946 | 122.365946 | 0.574749 | 650 / 0 |
| [s22-22000-model-negative-y](s22-22000-model-negative-y.json) | in-progress | completed (forward) / 25468 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22000-model-positive-y](s22-22000-model-positive-y.json) | unavailable | completed (forward) / 25881 | 122.365946 | 0.574749 | 650 / 0 |
| [s22-22000-negative-y](s22-22000-negative-y.json) | in-progress | completed (forward) / 25468 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22000-positive-y](s22-22000-positive-y.json) | completed (forward) | completed (forward) / 25881 | 122.365946 | 0.574749 | 650 / 0 |
| [s22-22000-worn-negative-y](s22-22000-worn-negative-y.json) | completed (forward) | completed (forward) / 24967 | 85.656162 | 0.574286 | 650 / 0 |
| [s22-22000-worn-positive-y](s22-22000-worn-positive-y.json) | completed (forward) | completed (forward) / 22866 | 85.656162 | 0.577530 | 650 / 0 |
| [s22-22005-negative-y](s22-22005-negative-y.json) | completed (forward) | completed (forward) / 16921 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22005-positive-y](s22-22005-positive-y.json) | completed (forward) | completed (forward) / 15410 | 122.365946 | 0.584019 | 650 / 0 |
| [s22-22011-negative-y](s22-22011-negative-y.json) | completed (forward) | completed (forward) / 15672 | 122.365946 | 0.565479 | 650 / 0 |
| [s22-22011-positive-y](s22-22011-positive-y.json) | completed (forward) | completed (forward) / 16087 | 122.365946 | 0.574749 | 650 / 0 |
| [s22-22015-negative-y](s22-22015-negative-y.json) | completed (forward) | completed (forward) / 18538 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22015-positive-y](s22-22015-positive-y.json) | completed (forward) | completed (forward) / 19011 | 122.365946 | 0.574749 | 650 / 0 |
| [s22-22017-negative-y](s22-22017-negative-y.json) | completed (forward) | completed (forward) / 21807 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22017-positive-y](s22-22017-positive-y.json) | completed (forward) | completed (forward) / 21629 | 122.365946 | 0.574749 | 650 / 0 |
| [s22-22020-negative-y](s22-22020-negative-y.json) | in-progress | in-progress / 36000 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22020-positive-y](s22-22020-positive-y.json) | completed (forward) | completed (forward) / 21861 | 122.365946 | 0.574749 | 650 / 0 |
| [s22-22029-negative-y](s22-22029-negative-y.json) | in-progress | in-progress / 36000 | 122.365946 | 0.556209 | 650 / 0 |
| [s22-22029-positive-y](s22-22029-positive-y.json) | in-progress | in-progress / 36000 | 122.365946 | 0.584019 | 650 / 0 |

Historical results used the static-field baseline in checkpoint `0eccbc4`. Several production integrations changed since that baseline, so changed outcomes are not a one-variable causal experiment.

The 1,000 kg main / 30 kg RCS targets apply to consumption, not to whether an incomplete flight passed admission. Generic harness clearance excludes funnels. The production throat sweep uses fixed starting attitude and straight COM segments; it does not certify continuously rotating/deploying hull clearance.

A precursor marked `seen` by the game is not independently verified camera detection, window readability or a 900 s observed warning margin. This matrix does not establish acquired geometry, pull/reversal adoption, forecast accuracy, field work, whole-session restoration or continuous branch/cross-transfer arrivals. No report is a human playtest.

[Machine summary and exact report hashes](summary.json).
