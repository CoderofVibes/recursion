// Opening-load trials only. Detect a draw to the opening canvas's default framebuffer,
// then wait for the next rAF paint opportunity. A DOM canvas alone can still be blank.
// Restore these wrappers immediately after that first output draw.
(() => {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = original.apply(this, args);
    if (this.classList.contains('rx-opening-canvas') && args[0] === 'webgl2' && gl) {
      HTMLCanvasElement.prototype.getContext = original;
      const arrays = gl.drawArrays, elements = gl.drawElements;
      const seen = () => {
        if (gl.getParameter(gl.FRAMEBUFFER_BINDING) !== null) return;
        gl.drawArrays = arrays; gl.drawElements = elements;
        requestAnimationFrame(() => { window.__s15.openingReady = performance.now(); });
      };
      gl.drawArrays = function (...a) { arrays.apply(this, a); seen(); };
      gl.drawElements = function (...a) { elements.apply(this, a); seen(); };
    }
    return gl;
  };
  window.__s15.waitOpening = () => new Promise((resolve, reject) => {
    const end = performance.now() + 90_000;
    const tick = () => {
      if (window.__s15.openingReady != null) resolve(window.__s15.openingReady);
      else if (performance.now() > end) reject(new Error('Opening never drew a first frame'));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
})();
