// Keep S15 measurements portable: no host paths, browser command lines or source maps.
import { readFileSync, writeFileSync } from 'node:fs';
const runs = process.argv.slice(2);
const summaries = runs.map((run) => {
  if (!/^[\w-]+$/.test(run)) throw new Error('Invalid run');
  const r = JSON.parse(
    readFileSync(new URL(`../../../tools/studies/s15/${run}.json`, import.meta.url)),
  );
  const frames = r.frames.map((f) => ({
    view: f.view,
    repeat: f.repeat,
    profile: f.profile,
    warp: f.requestedWarp,
    n: f.n,
    medianMs: f.median,
    p95Ms: f.p95,
    worstMs: f.worst,
    over33ms: f.over33ms,
    shipSecondsPerWallSecond: f.achievedShipSecondsPerWallSecond,
    saturated: f.saturationFraction,
    modelError: f.modelError,
    gpu: f.inventory?.renderer,
  }));
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
    frames,
    profiles: r.profiles.map((p) => ({
      label: p.label,
      view: p.case.view,
      p95Ms: p.instrumentedFrames.p95,
      functions: p.functions
        .slice(0, 18)
        .map((f) => ({
          name: f.name,
          ms: f.ms,
          source: f.source?.source
            ?.replace(/^.*?\/src\//, 'src/')
            .replace(/^.*?\/node_modules\//, 'node_modules/'),
          line: f.source?.line,
        })),
    })),
    bundle: r.bundle,
    errorCount: r.errors.length,
  };
});
const json = JSON.stringify(summaries, null, 2) + '\n';
if (/[A-Z]:[\\/]|[/\\]Users[/\\]/.test(json)) throw new Error('Nonportable path in evidence');
writeFileSync(new URL('performance.json', import.meta.url), json);
console.log(
  JSON.stringify(
    summaries.map((r) => ({
      run: r.run,
      loads: r.loads,
      frames: r.frames.map((f) => ({
        view: f.view,
        repeat: f.repeat,
        p95: f.p95Ms,
        worst: f.worstMs,
      })),
      errors: r.errorCount,
    })),
    null,
    2,
  ),
);
