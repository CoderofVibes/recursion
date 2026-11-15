// Injected by CDP into the unmodified production page. This does not replace game methods.
// React's production fibre is used ONLY to find the existing belief-side status reader.
(() => {
  const probe = window.__s15 = { longTasks: [], events: [], ready: null, desk: null, room: null };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) probe.longTasks.push({ start: e.startTime, duration: e.duration });
  }).observe({ type: 'longtask', buffered: true });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) probe.events.push({ name: e.name, start: e.startTime,
        duration: e.duration, processingStart: e.processingStart, processingEnd: e.processingEnd,
        interactionId: e.interactionId });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch { /* Older installed Chrome may not expose Event Timing. */ }
  probe.bind = () => {
    const el = document.querySelector('.cs-screen');
    if (!el) return false;
    let f = el[Object.keys(el).find((k) => k.startsWith('__reactFiber$'))];
    while (f) {
      if (f.memoizedProps?.desk) probe.desk = f.memoizedProps.desk;
      let hook = f.memoizedState;
      while (hook && typeof hook === 'object') {
        const v = hook.memoizedState;
        if (v && typeof v.mode === 'function' && v.renderer && v.composer) probe.room = v;
        hook = hook.next;
      }
      f = f.return;
    }
    return !!(probe.desk && probe.room);
  };
  // First useful opportunity: scene is constructed, game is attached, and a frame has run.
  probe.waitReady = () => new Promise((resolve, reject) => {
    const end = performance.now() + 90_000;
    const tick = () => {
      if (probe.bind() && document.querySelector('.cr')?.dataset.mode === 'room') {
        probe.ready = performance.now(); resolve(probe.ready);
      } else if (performance.now() > end) reject(new Error('Production room did not become ready'));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  probe.status = () => probe.desk.game.status();
  probe.sample = (duration, requestedWarp = 1) => new Promise((resolve) => {
    const rows = [], started = performance.now(), longStart = probe.longTasks.length;
    const warpReselections = [];
    // A bounded stress trial: reselect the requested warp after an automatic alert drop.
    // Keep the alert, model failure and the dropped warp in the evidence. No physics, step,
    // forecast, visibility, or saturation logic is replaced. This is not a player-pacing test.
    probe.desk.game.setWarp(requestedWarp);
    let last;
    let before;
    let observerMs = 0;
    const tick = (stamp) => {
      const begin = performance.now();
      const s = probe.status();
      if (last !== undefined) rows.push([stamp - last, s.t, Number(s.saturated), s.warp,
        s.phase, Number(s.paused), Number(document.hidden), s.attemptIndex]);
      else before = { ...s, wall: begin };
      last = stamp;
      if (s.warp !== requestedWarp && s.phase === 'operate') {
        warpReselections.push({ wall: begin, t: s.t, from: s.warp, to: requestedWarp,
          note: probe.desk.note, modelError: probe.desk.modelError() ?? null });
        probe.desk.game.setWarp(requestedWarp);
      }
      observerMs += performance.now() - begin;
      if (begin - started >= duration) resolve({
        columns: ['intervalMs', 'shipSeconds', 'saturated', 'warp', 'phase', 'paused', 'hidden', 'attempt'],
        rows, before, after: { ...s, wall: begin }, observerMs, warpReselections,
        longTasks: probe.longTasks.slice(longStart),
        mode: document.querySelector('.cr')?.dataset.mode,
        page: probe.desk.page,
        modelError: probe.desk.modelError(),
      });
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  probe.inventory = () => {
    const r = probe.room.renderer;
    const gl = r.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const geometries = new Set(), textures = new Set();
    const tex = [];
    let vertices = 0, triangles = 0, objects = 0;
    probe.room.scene.traverse((o) => {
      objects++;
      if (o.geometry && !geometries.has(o.geometry)) {
        geometries.add(o.geometry);
        vertices += o.geometry.attributes.position?.count ?? 0;
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position?.count ?? 0) / 3;
      }
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (!m) continue;
        for (const value of Object.values(m)) if (value?.isTexture && !textures.has(value)) {
          textures.add(value);
          tex.push({ name: value.name, width: value.image?.width, height: value.image?.height });
        }
      }
    });
    return { vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      viewport: [innerWidth, innerHeight, devicePixelRatio], canvas: [r.domElement.width, r.domElement.height],
      memory: { ...r.info.memory }, programs: r.info.programs?.length,
      scene: { objects, uniqueGeometries: geometries.size, vertices, indexTriples: triangles, textures: tex },
      passes: probe.room.composer.passes.map((p) => ({ type: p.constructor.name, enabled: p.enabled,
        ...(p.renderTargetsHorizontal ? { bloomMipSizes: p.renderTargetsHorizontal.map((t) => [t.width, t.height]) } : {}) })),
      appDeveloperHandle: typeof window.__recursion,
    };
  };
  // Diagnostic only, outside the benchmark: aggregate all composer passes over one frame.
  probe.draws = () => new Promise((resolve) => {
    const r = probe.room.renderer;
    const old = r.info.autoReset;
    requestAnimationFrame(() => {
      r.info.autoReset = false; r.info.reset();
      requestAnimationFrame(() => {
        const counts = { ...r.info.render };
        r.info.autoReset = old; r.info.reset(); resolve(counts);
      });
    });
  });
})();
