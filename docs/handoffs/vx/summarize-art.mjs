// Portable S15 evidence for this pass. Raw profiles include host paths and stay uncommitted.
import { readFileSync, writeFileSync } from 'node:fs';
const runs = ['vx-art-before', 'vx-art-after', 'vx-art-final'];
const results = runs.map((run) => {
  const r = JSON.parse(readFileSync(`tools/studies/s15/${run}.json`, 'utf8'));
  return {
    run,
    source: r.source,
    viewport: r.settings.viewport,
    profile: r.settings.profiles.modest,
    seconds: r.settings.seconds,
    loads: r.loads.map((l) => ({
      cache: l.cache,
      repeat: l.repeat,
      readyMs: l.ready,
      interactionPaintMs: l.interaction.paint,
    })),
    frames: r.frames.map((f) => ({
      view: f.view,
      repeat: f.repeat,
      warp: f.requestedWarp,
      n: f.n,
      medianMs: f.median,
      p95Ms: f.p95,
      worstMs: f.worst,
      longTasks: f.longTasks,
      saturated: f.saturationFraction,
      modelError: f.modelError,
      gpu: f.inventory?.renderer,
    })),
    profiles: r.profiles.map((p) => ({
      view: p.case.view,
      p95Ms: p.instrumentedFrames.p95,
      functions: p.functions
        .slice(0, 12)
        .map((f) => ({ name: f.source?.name ?? f.name, ms: f.ms })),
    })),
    bundle: r.bundle,
    errorCount: r.errors.length,
    caveats: [
      'S15 logic with the once-per-browser opening acknowledged by a CDP storage marker. Cold refers to HTTP cache, not the first-ever cinematic.',
      'Shared development host; no real modest-laptop qualification. No VX builds, tests or other browsers overlapped the timed runs.',
    ],
  };
});
const json = JSON.stringify(results, null, 2) + '\n';
if (/[A-Z]:[\\/]|[/\\]Users[/\\]/.test(json)) throw new Error('Nonportable evidence');
writeFileSync(new URL('art-performance.json', import.meta.url), json);
