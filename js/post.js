'use strict';
// Full-frame glitch bursts, drawn after the scene: chromatic aberration (an RGB shear) and CRT
// tear (bands of the picture slipping sideways) on hard hits, encounters, breaches and in the
// Kernel. Skipped entirely when Options › screen effects is off.
// Bloom lives elsewhere, baked into the map lightmaps and battle backdrops (see Scene): copying
// the live frame into small buffers every frame stalls phone GPUs, so this file only touches the
// frame during a burst, a few hundred milliseconds at a time.

const Post = (() => {
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  let copy = null, red = null, cyan = null; // full-size buffers, made on first use
  let burst = null; // { kind, t0, ms, power }

  const on = () => !G.state || G.state.opts.fx !== false;

  // Starts (or strengthens) a glitch burst. kind: 'split' (RGB shear) | 'tear' (shifted bands) | 'both'.
  function kick(kind = 'both', power = 1, ms = 260) {
    if (!on()) return;
    const now = performance.now();
    if (burst && now - burst.t0 < burst.ms && burst.power > power) return;
    burst = { kind, t0: now, ms, power };
  }

  function ensure(cv) {
    if (copy && copy.width === cv.width && copy.height === cv.height) return;
    copy = mk(cv.width, cv.height); red = mk(cv.width, cv.height); cyan = mk(cv.width, cv.height);
  }

  // Splits the frame into a red copy and a cyan copy and shears them apart.
  function split(ctx, cv, d) {
    ensure(cv);
    const w = cv.width, h = cv.height, cc = copy.getContext('2d');
    cc.globalCompositeOperation = 'copy'; cc.drawImage(cv, 0, 0);
    for (const [buf, col] of [[red, '#ff0000'], [cyan, '#00ffff']]) {
      const b = buf.getContext('2d');
      b.globalCompositeOperation = 'copy'; b.drawImage(copy, 0, 0);
      b.globalCompositeOperation = 'multiply'; b.fillStyle = col; b.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy'; ctx.drawImage(red, -d, 0);
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(cyan, d, 0);
    ctx.restore();
  }

  // Slides a few horizontal bands sideways, like a CRT losing sync.
  function tear(ctx, cv, power, now) {
    ensure(cv);
    const w = cv.width, h = cv.height, cc = copy.getContext('2d');
    cc.globalCompositeOperation = 'copy'; cc.drawImage(cv, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const n = 3 + Math.floor(power * 3), seed = Math.floor(now / 40);
    for (let i = 0; i < n; i++) {
      const y = Scene.hash(seed, i) * h, bh = (4 + Scene.hash(i, seed) * 26) * G.k;
      const dx = (Scene.hash(seed, i, 7) - .5) * 40 * power * G.k;
      ctx.drawImage(copy, 0, y, w, bh, dx, y, w, bh);
    }
    ctx.restore();
  }

  // Called once per frame after the scene and HUD are drawn. Free unless a burst is running.
  function apply(ctx, cv, now) {
    if (!burst || !on()) return;
    const p = (now - burst.t0) / burst.ms;
    if (p >= 1) { burst = null; return; }
    const power = burst.power * (1 - p);
    if (burst.kind !== 'tear') split(ctx, cv, Math.max(1, Math.round(4 * power * G.k)));
    if (burst.kind !== 'split') tear(ctx, cv, power, now);
  }

  return { kick, apply, get active() { return !!burst; } };
})();
