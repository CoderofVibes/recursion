# line-buffers — generated measurement tables

[DEMONSTRATED: tools/studies/s15/line-buffers.json and line-buffers-frames.json.gz]

Nearest-rank quantiles pooled across the recorded trials. Frame times are rAF intervals; all durations are milliseconds. CPU profiles are separate instrumented trials.

No load trials in this focused run.

| Profile | View | Requested warp | Frames | Median | p95 | Worst | Ship s / wall s | Saturated % | Warning drops |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| modest | room | 1× | 1051 | 12.3 | 24.2 | 30.3 | 1.0 | 0.0 | 0 |
| modest | flight | 1× | 1030 | 12.4 | 24.2 | 36.3 | 1.0 | 0.0 | 0 |
| modest | room | 2000× | 443 | 36.2 | 54.5 | 78.9 | 242.2 | 100.0 | 1 |
| modest | flight | 2000× | 503 | 30.3 | 48.4 | 66.7 | 272.3 | 100.0 | 0 |

## Intervals reporting saturation

| Profile | View | Warp | Saturated samples | Median | p95 | Worst | Ship s / wall s within these intervals |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| modest | room | 2000× | 443 | 36.2 | 54.5 | 78.9 | 241.9 |
| modest | flight | 2000× | 503 | 30.3 | 48.4 | 66.7 | 271.8 |
