'use strict';
// Environment rendering: gritty tiles, holo signage, lightmaps, rain and battle backdrops.
// Everything static is baked once per map; per-frame work is limited to what animates.

const Scene = (() => {
  const T = 32;
  const LS = .25; // lightmap resolution: lightmap pixels per world unit
  // Integer hash for placement: same inputs, same detail, every load. Math.imul keeps the products in
  // 32 bits; plain * overflowed float precision and skewed every value below ~0.6, so nothing gated
  // on `> .7` (lit windows, puddles, cracks...) ever appeared.
  const hash = (a, b, c = 0) => {
    let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const SIGN_WORDS = ['RAMEN', 'BAR', 'HOTEL', '24/7', '麺', '電脳', 'PAWN', 'CHROME', 'NOODLE', 'DATA', '酒', 'CLINIC', 'ARCADE', 'BRAINDANCE', 'SUSHI', 'VOID', 'KARAOKE', 'GUNS', 'LUCKY', '夜'];
  const SIGN_COLORS = ['#ff2e88', '#18f0ff', '#ffe14d', '#ff6a3d', '#9b6bff', '#2ee6a0'];
  const WALK = (c) => c === '.' || c === ',' || c === ';' || c === 'v' || c === 'g';

  // ---------- Map bake ----------
  function build(map, k) {
    const w = map.rows[0].length, h = map.rows.length;
    const tiles = document.createElement('canvas');
    tiles.width = Math.ceil(w * T * k); tiles.height = Math.ceil(h * T * k);
    const ctx = tiles.getContext('2d');
    ctx.scale(k, k);
    // Emissive parts (neon trim, signs, screens) bake to their own layer, drawn above the darkness.
    const emit = document.createElement('canvas');
    emit.width = tiles.width; emit.height = tiles.height;
    const ex = emit.getContext('2d');
    ex.scale(k, k);
    const L = { tiles, emit, ex, k, lights: [], signs: [], vents: [], puddles: [], trees: [], w, h };
    const tile = (x, y) => (map.rows[y] || '')[x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      ex.save(); drawTile(ctx, map, tile, x, y, k, L); ex.restore();
    }
    for (let i = 0; i < L.trees.length; i++) { // pair up horizontal neighbours now and then for broad canopies
      const a = L.trees[i], b = L.trees[i + 1];
      if (b && b.y === a.y && b.x === a.x + 1 && !a.skip && hash(a.x, a.y, 172) > .5) { a.pair = true; b.skip = true; i++; }
    }
    for (const t of L.trees) tree(ctx, ex, t, k, L, map); // row order: lower trees overlap higher ones
    for (const hs of map.holo || []) bigSign(ex, hs, k, L);
    if (map.emblem) emblem(ctx, ex, map, L);
    for (const l of map.lights || []) L.lights.push({ x: l.x * T, y: l.y * T, r: l.r, c: l.c, a: l.a ?? .9 });
    bakeLights(map, L);
    return L;
  }

  function grime(ctx, X, Y, x, y, amount) {
    for (let i = 0; i < 5 * amount; i++) {
      const r = hash(x, y, 40 + i);
      ctx.fillStyle = r > .5 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.35)';
      ctx.fillRect(X + hash(x, y, 60 + i) * 30, Y + hash(x, y, 80 + i) * 30, 1 + r * 2, 1);
    }
    if (hash(x, y, 7) > .82) { // cracks
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(X + 4 + hash(x, y, 8) * 10, Y + 4);
      ctx.lineTo(X + 14 + hash(x, y, 9) * 6, Y + 16); ctx.lineTo(X + 8 + hash(x, y, 10) * 18, Y + 28); ctx.stroke();
    }
    if (hash(x, y, 11) > .9) { // oil stain
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.beginPath(); ctx.ellipse(X + 16, Y + 18, 9, 5, hash(x, y) * 3, 0, TAU); ctx.fill();
    }
  }

  // ---------- Ground ----------
  // Asphalt ('.') and pavement slabs (','), drawn once into the map bake, so detail costs nothing
  // per frame. `nb(dx, dy)` reads the neighboring tile for curbs and contact shadows.
  const WALLS = new Set(['#', 'D', 'X', 'C']);

  // Soft shadow where the ground meets a wall above it, and along a curb onto the road.
  function contactShadow(ctx, X, Y, nb) {
    if (WALLS.has(nb(0, -1))) {
      const g = ctx.createLinearGradient(0, Y, 0, Y + 12);
      g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(X, Y, T, 12);
    }
    for (const dx of [-1, 1]) if (WALLS.has(nb(dx, 0))) {
      const x0 = dx < 0 ? X : X + T - 6, g = ctx.createLinearGradient(dx < 0 ? X : X + T, 0, dx < 0 ? X + 6 : X + T - 6, 0);
      g.addColorStop(0, 'rgba(0,0,0,.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x0, Y, 6, T);
    }
  }

  function asphalt(ctx, X, Y, x, y, map, L, nb) {
    ctx.fillStyle = '#0b0a11'; ctx.fillRect(X, Y, T, T);
    // big soft tonal blotches so the road doesn't read as a grid of identical squares
    const bx = X + hash(x, y, 91) * T, by = Y + hash(x, y, 92) * T, br = 14 + hash(x, y, 93) * 16;
    const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, hash(x, y, 90) > .5 ? 'rgba(120,110,150,.06)' : 'rgba(0,0,0,.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(X, Y, T, T);
    for (let i = 0; i < 22; i++) { // aggregate
      const r = hash(x, y, 100 + i);
      ctx.fillStyle = r > .62 ? `rgba(190,190,225,${.04 + r * .05})` : 'rgba(0,0,0,.4)';
      ctx.fillRect(X + hash(x, y, 130 + i) * (T - 1), Y + hash(x, y, 160 + i) * (T - 1), r > .9 ? 2 : 1, 1);
    }
    if (hash(x, y, 101) > .72) { // tar seam
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.3;
      const a = hash(x, y, 102) > .5;
      ctx.beginPath();
      if (a) { ctx.moveTo(X, Y + 6 + hash(x, y, 103) * 20); ctx.bezierCurveTo(X + 10, Y + hash(x, y, 104) * T, X + 22, Y + hash(x, y, 105) * T, X + T, Y + 6 + hash(x, y, 106) * 20); }
      else { ctx.moveTo(X + 6 + hash(x, y, 103) * 20, Y); ctx.bezierCurveTo(X + hash(x, y, 104) * T, Y + 10, X + hash(x, y, 105) * T, Y + 22, X + 6 + hash(x, y, 106) * 20, Y + T); }
      ctx.stroke();
    }
    if (hash(x, y, 107) > .88) { // patched repair
      const w = 10 + hash(x, y, 108) * 12, h = 8 + hash(x, y, 109) * 10, px = X + hash(x, y, 110) * (T - w), py = Y + hash(x, y, 111) * (T - h);
      ctx.fillStyle = '#100f17'; ctx.fillRect(px, py, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1; ctx.strokeRect(px + .5, py + .5, w - 1, h - 1);
    }
    const busy = map.outdoor && hash(x, y, 3) > (map.wet ? .72 : .88); // a puddle sits here
    const feature = hash(x, y, 140);
    if (map.outdoor && !busy && feature > .965) { // manhole cover
      const cx = X + 16, cy = Y + 16;
      ctx.fillStyle = '#16141e'; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2c2838'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1;
      for (let i = -10; i <= 10; i += 3) { ctx.beginPath(); ctx.moveTo(cx + i - 8, cy - 8); ctx.lineTo(cx + i + 8, cy + 8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx + i + 8, cy - 8); ctx.lineTo(cx + i - 8, cy + 8); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.beginPath(); ctx.arc(cx - 2, cy - 3, 5, 0, TAU); ctx.fill();
    } else if (map.outdoor && !busy && feature > .935) { // storm drain
      ctx.fillStyle = '#05040a'; ctx.fillRect(X + 7, Y + 20, 18, 8);
      ctx.strokeStyle = '#2a2633'; ctx.lineWidth = 1; ctx.strokeRect(X + 6.5, Y + 19.5, 19, 9);
      ctx.fillStyle = '#211d2b'; for (let i = 0; i < 5; i++) ctx.fillRect(X + 8 + i * 3.6, Y + 21, 1.4, 6);
    } else if (feature > .9) { // worn paint: half a lane dash or a stencilled arrow
      ctx.fillStyle = 'rgba(230,225,200,.07)';
      if (hash(x, y, 141) > .5) ctx.fillRect(X + 4, Y + 14, 20, 3);
      else { ctx.beginPath(); ctx.moveTo(X + 16, Y + 6); ctx.lineTo(X + 22, Y + 14); ctx.lineTo(X + 18, Y + 14); ctx.lineTo(X + 18, Y + 26); ctx.lineTo(X + 14, Y + 26); ctx.lineTo(X + 14, Y + 14); ctx.lineTo(X + 10, Y + 14); ctx.closePath(); ctx.fill(); }
    } else if (feature > .86) { // oil stain with a faint chemical sheen
      const o = ctx.createRadialGradient(X + 16, Y + 17, 1, X + 16, Y + 17, 9);
      o.addColorStop(0, 'rgba(0,0,0,.55)'); o.addColorStop(.6, 'rgba(90,40,120,.12)'); o.addColorStop(.8, 'rgba(30,110,120,.1)'); o.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = o; ctx.beginPath(); ctx.ellipse(X + 16, Y + 17, 10, 6, hash(x, y) * 3, 0, TAU); ctx.fill();
    }
    if (busy) {
      // puddle: dark glossy pool that will catch neon in the glow pass
      const rx = 7 + hash(x, y, 4) * 6, ry = 3 + hash(x, y, 5) * 3;
      ctx.fillStyle = 'rgba(14,20,40,.9)';
      ctx.beginPath(); ctx.ellipse(X + 16, Y + 18, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(160,190,255,.08)';
      ctx.beginPath(); ctx.ellipse(X + 14, Y + 17, rx * .6, ry * .4, 0, 0, TAU); ctx.fill();
      L.puddles.push({ x: X + 16, y: Y + 18, rx, ry });
    }
    if (nb(0, -1) === ',') { // the curb above casts a lip of shadow onto the road
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(X, Y, T, 3);
    }
    contactShadow(ctx, X, Y, nb);
  }

  // Concrete slabs, four to a tile, each bevelled and a slightly different shade.
  function pavement(ctx, X, Y, x, y, map, nb) {
    ctx.fillStyle = '#06050b'; ctx.fillRect(X, Y, T, T); // the seams
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const sx = X + i * 16, sy = Y + j * 16, r = hash(x * 2 + i, y * 2 + j, 150);
      const shade = 17 + Math.floor(r * 7);
      ctx.fillStyle = `rgb(${shade},${shade - 2},${shade + 9})`; ctx.fillRect(sx + .5, sy + .5, 15, 15);
      ctx.fillStyle = 'rgba(255,255,255,.045)'; ctx.fillRect(sx + .5, sy + .5, 15, 1); ctx.fillRect(sx + .5, sy + .5, 1, 15);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(sx + .5, sy + 14.5, 15, 1); ctx.fillRect(sx + 14.5, sy + .5, 1, 15);
      for (let k = 0; k < 4; k++) { // aggregate
        ctx.fillStyle = hash(x * 2 + i, y * 2 + j, 160 + k) > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.25)';
        ctx.fillRect(sx + 2 + hash(x * 2 + i, y * 2 + j, 170 + k) * 12, sy + 2 + hash(x * 2 + i, y * 2 + j, 180 + k) * 12, 1, 1);
      }
      if (r > .9) { // cracked slab
        ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = .8;
        ctx.beginPath(); ctx.moveTo(sx + 2, sy + 3 + r * 8); ctx.lineTo(sx + 7, sy + 8); ctx.lineTo(sx + 14, sy + 5 + r * 6); ctx.moveTo(sx + 7, sy + 8); ctx.lineTo(sx + 9, sy + 14); ctx.stroke();
      }
    }
    if (map.outdoor && hash(x, y, 155) > .55) { // moss creeping along the seams
      ctx.fillStyle = 'rgba(70,170,110,.28)';
      for (let k = 0; k < 7; k++) {
        const along = hash(x, y, 190 + k) * T, horiz = hash(x, y, 200 + k) > .5;
        ctx.fillRect(horiz ? X + along : X + 15 + hash(x, y, 210 + k) * 2, horiz ? Y + 15 + hash(x, y, 210 + k) * 2 : Y + along, 1.5, 1.5);
      }
    }
    // curbs where the pavement drops to the road
    const curb = (cx, cy, w, h) => { ctx.fillStyle = '#2b2735'; ctx.fillRect(cx, cy, w, h); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fillRect(cx, cy, w, 1); };
    if (nb(0, 1) === '.') curb(X, Y + T - 3, T, 3);
    if (nb(0, -1) === '.') curb(X, Y, T, 2);
    if (nb(-1, 0) === '.') curb(X, Y, 2, T);
    if (nb(1, 0) === '.') curb(X + T - 2, Y, 2, T);
    contactShadow(ctx, X, Y, nb);
  }

  // The old street() entry point: asphalt or pavement, for tiles that sit on top of the ground.
  // Ground is drawn at half resolution and scaled up with no smoothing, so its detail lands on the
  // same 2px grid as the imported pixel art instead of looking painted next to it.
  const pix = document.createElement('canvas');
  pix.width = pix.height = 16;
  const pc = pix.getContext('2d');
  function street(ctx, X, Y, x, y, map, L, alt, nb = () => null) {
    pc.setTransform(.5, 0, 0, .5, -X * .5, -Y * .5);
    pc.clearRect(X, Y, T, T);
    if (alt) pavement(pc, X, Y, x, y, map, nb); else asphalt(pc, X, Y, x, y, map, L, nb);
    grime(pc, X, Y, x, y, .5);
    if (map.outdoor && hash(x, y, 170) > .8 && Atlas.has('grit')) { // a crack, stain or worse, from the concrete photos
      pc.globalAlpha = .55; Atlas.draw(pc, 'grit', Math.floor(hash(x, y, 171) * 8), 0, X, Y); pc.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pix, X, Y, T, T);
  }

  // ---------- Trees ----------
  // Three kinds, chosen per tree: cyber palms, bioluminescent canopy trees and dead trees wrapped
  // in fairy lights. Drawn after all the ground, in row order, so canopies overlap their
  // neighbors and the tiles above. Glowing bits go on the emissive layer so they stay lit at night.
  const BLOOM = ['#ff4fd8', '#18f0ff', '#c6ff2e', '#ffb347'];
  // A raised concrete planter: rim, dark soil, a little moss, and an iron grate round the trunk.
  function treePit(ctx, X, Y, x, y) {
    ctx.fillStyle = '#26222f'; ctx.fillRect(X + 2, Y + 4, 28, 26);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(X + 2, Y + 4, 28, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(X + 2, Y + 28.5, 28, 1.5); ctx.fillRect(X + 2, Y + 30, 28, 2); // its shadow
    ctx.fillStyle = '#0d0a0b'; ctx.fillRect(X + 5, Y + 7, 22, 20);
    ctx.fillStyle = 'rgba(60,150,95,.35)';
    for (let i = 0; i < 9; i++) ctx.fillRect(X + 6 + hash(x, y, 400 + i) * 19, Y + 8 + hash(x, y, 410 + i) * 17, 1.5, 1.5);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.ellipse(X + 16, Y + 25, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#0f0b0c'; ctx.beginPath(); ctx.ellipse(X + 16, Y + 24, 10, 4.5, 0, 0, TAU); ctx.fill(); // soil
    ctx.strokeStyle = 'rgba(60,54,72,.55)'; ctx.lineWidth = .8; // iron grate ring with radial slots
    ctx.beginPath(); ctx.ellipse(X + 16, Y + 24, 10, 4.5, 0, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ctx.beginPath(); ctx.moveTo(X + 16 + Math.cos(a) * 4, Y + 24 + Math.sin(a) * 1.8); ctx.lineTo(X + 16 + Math.cos(a) * 9, Y + 24 + Math.sin(a) * 4); ctx.stroke(); }
  }

  function palm(ctx, ex, X, Y, x, y, k, L, th) {
    const bx = X + 16, by = Y + 24, lean = (hash(x, y, 220) - .5) * 12, h = 30 + hash(x, y, 221) * 8;
    const tx = bx + lean, ty = by - h;
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) { // segmented trunk, thinner toward the top
      const a = i / 9, b = (i + 1) / 9;
      const x0 = bx + lean * a * a, y0 = by - h * a, x1 = bx + lean * b * b, y1 = by - h * b;
      ctx.strokeStyle = i % 2 ? '#2b2232' : '#241c2a'; ctx.lineWidth = 4.2 - a * 1.6;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (i % 3 === 1) { ctx.strokeStyle = 'rgba(160,170,200,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1 - 2.4, y1); ctx.lineTo(x1 + 2.4, y1); ctx.stroke(); } // metal band
    }
    const n = 7, fr = [];
    for (let i = 0; i < n; i++) { // fronds fan out and droop under their own weight
      const ang = -Math.PI + (i + .5) / n * Math.PI + (hash(x, y, 230 + i) - .5) * .4, len = 15 + hash(x, y, 240 + i) * 7;
      const ex2 = tx + Math.cos(ang) * len, ey = ty + Math.sin(ang) * len * .55 + 7;
      const cx = tx + Math.cos(ang) * len * .55, cy = ty + Math.sin(ang) * len * .55 - 5;
      fr.push([ex2, ey, cx, cy]);
    }
    for (const [ex2, ey, cx, cy] of fr) {
      const g = ctx.createLinearGradient(tx, ty, ex2, ey);
      g.addColorStop(0, '#1f4d40'); g.addColorStop(1, '#14322c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(tx, ty - 1.5); ctx.quadraticCurveTo(cx, cy - 2.5, ex2, ey); ctx.quadraticCurveTo(cx, cy + 2.5, tx, ty + 1.5); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(150,240,200,.3)'; ctx.lineWidth = .7;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(cx, cy, ex2, ey); ctx.stroke();
    }
    // a couple of frond tips catch neon, and LED pods glow under the crown
    ex.save();
    ex.lineCap = 'round';
    ex.strokeStyle = hexA(th, .55); ex.lineWidth = .9; ex.shadowColor = th; ex.shadowBlur = 5 * k;
    for (const i of [1, 5]) { const [ex2, ey, cx, cy] = fr[i]; ex.beginPath(); ex.moveTo((cx + ex2) / 2, (cy + ey) / 2); ex.quadraticCurveTo(ex2 - (ex2 - cx) * .2, ey - 2, ex2, ey); ex.stroke(); }
    ex.fillStyle = '#18f0ff'; ex.shadowColor = '#18f0ff'; ex.shadowBlur = 6 * k;
    for (let i = 0; i < 3; i++) { ex.beginPath(); ex.arc(tx - 3 + i * 3, ty + 3 + (i % 2), 1.2, 0, TAU); ex.fill(); }
    ex.restore();
    L.lights.push({ x: tx, y: ty + 6, r: 26, c: th, a: .3 });
  }

  function canopy(ctx, ex, X, Y, x, y, k, L) {
    const bx = X + 16, by = Y + 24, top = by - 24;
    ctx.strokeStyle = '#231a20'; ctx.lineCap = 'round';
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, top + 6); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, top + 12); ctx.lineTo(bx - 7, top + 4); ctx.moveTo(bx, top + 10); ctx.lineTo(bx + 8, top + 3); ctx.stroke();
    const blobs = [];
    for (let i = 0; i < 7; i++) {
      const a = hash(x, y, 250 + i) * TAU, d = 4 + hash(x, y, 260 + i) * 9;
      blobs.push([bx + Math.cos(a) * d * 1.3, top + Math.sin(a) * d * .8, 7 + hash(x, y, 270 + i) * 5]);
    }
    blobs.sort((p, q) => p[1] - q[1]);
    for (const [cx, cy, r] of blobs) { // dark mass, then lit tops, then leaf flecks
      ctx.fillStyle = '#122824'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    }
    for (const [cx, cy, r] of blobs) {
      const g = ctx.createRadialGradient(cx - r * .35, cy - r * .45, 1, cx, cy, r);
      g.addColorStop(0, '#3a6e58'); g.addColorStop(.6, '#1d3d33'); g.addColorStop(1, 'rgba(18,40,36,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * .9, 0, TAU); ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const [cx, cy, r] = blobs[i % blobs.length];
      ctx.fillStyle = hash(x, y, 280 + i) > .5 ? 'rgba(150,240,190,.22)' : 'rgba(0,0,0,.3)';
      ctx.fillRect(cx + (hash(x, y, 290 + i) - .5) * r * 1.4, cy + (hash(x, y, 300 + i) - .5) * r * 1.2, 1.5, 1.5);
    }
    // bioluminescent blossoms
    const c = BLOOM[Math.floor(hash(x, y, 310) * BLOOM.length)];
    ex.save();
    ex.fillStyle = c; ex.shadowColor = c; ex.shadowBlur = 5 * k;
    for (let i = 0; i < 9; i++) {
      const [cx, cy, r] = blobs[Math.floor(hash(x, y, 320 + i) * blobs.length)];
      ex.beginPath(); ex.arc(cx + (hash(x, y, 330 + i) - .5) * r * 1.3, cy + (hash(x, y, 340 + i) - .5) * r, .9 + hash(x, y, 350 + i) * .8, 0, TAU); ex.fill();
    }
    ex.restore();
    L.lights.push({ x: bx, y: top + 4, r: 30, c, a: .35 });
  }

  function deadTree(ctx, ex, X, Y, x, y, k, L) {
    const bx = X + 16, by = Y + 24, tips = [];
    ctx.strokeStyle = '#3a2f38'; ctx.lineCap = 'round';
    const branch = (x0, y0, ang, len, w, depth, seed) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (depth === 0) { tips.push([x1, y1]); return; }
      branch(x1, y1, ang - .45 - hash(x, y, seed) * .3, len * .7, w * .62, depth - 1, seed * 2 + 1);
      branch(x1, y1, ang + .4 + hash(x, y, seed + 7) * .3, len * .68, w * .62, depth - 1, seed * 2 + 2);
    };
    branch(bx, by, -Math.PI / 2 + (hash(x, y, 360) - .5) * .3, 13, 3.6, 3, 1);
    tips.sort((p, q) => p[0] - q[0]);
    // a string of fairy lights draped from tip to tip
    const warm = hash(x, y, 370) > .5 ? '#ffd38a' : '#ff4fd8';
    ctx.strokeStyle = 'rgba(10,8,14,.9)'; ctx.lineWidth = .6;
    ex.save(); ex.fillStyle = warm; ex.shadowColor = warm; ex.shadowBlur = 5 * k;
    for (let i = 0; i < tips.length - 1; i++) {
      const [x0, y0] = tips[i], [x1, y1] = tips[i + 1], mx = (x0 + x1) / 2, my = Math.max(y0, y1) + 4;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
      for (const q of [.25, .5, .75]) {
        const px = (1 - q) * (1 - q) * x0 + 2 * (1 - q) * q * mx + q * q * x1, py = (1 - q) * (1 - q) * y0 + 2 * (1 - q) * q * my + q * q * y1;
        ex.beginPath(); ex.arc(px, py, .9, 0, TAU); ex.fill();
      }
    }
    ex.restore();
    L.lights.push({ x: bx, y: by - 20, r: 30, c: warm, a: .35 });
  }

  // Pixel trees from the outdoor sheet: (col, row) of a 1x2 sprite that stands on its tile and
  // reaches over the one above. Bioluminescent flecks go on the emissive layer so the canopy glows.
  const TREES = [[27, 35], [24, 28], [26, 37], [27, 35], [24, 28]];
  function tree(ctx, ex, t, k, L, map) {
    const { X, Y, x, y } = t, r = hash(x, y, 170), s = 1.35 + hash(x, y, 171) * .2;
    if (Atlas.has('outdoor')) {
      if (t.skip) return;
      // Pairs along a run of trees become one broad 2x2 canopy; singles get a narrow tree.
      if (t.pair) Atlas.draw(ctx, 'outdoor', 24, 35, X, Y - T, 2, 2);
      else if (Atlas.has('veg') && r < .18) Atlas.draw(ctx, 'veg', 5, 0, X, Y - T, 1, 2); // George's slim street tree
      else { const [c, rw] = TREES[Math.floor(r * TREES.length)]; Atlas.draw(ctx, 'outdoor', c, rw, X, Y - T, 1, 2); }
      const col = BLOOM[Math.floor(hash(x, y, 310) * BLOOM.length)];
      ex.fillStyle = col; ex.shadowColor = col; ex.shadowBlur = 4 * k;
      for (let i = 0; i < 4; i++) { ex.beginPath(); ex.arc(X + 7 + hash(x, y, 320 + i) * 18, Y - 24 + hash(x, y, 330 + i) * 30, 1, 0, TAU); ex.fill(); }
      ex.shadowBlur = 0;
      L.lights.push({ x: X + 16, y: Y - 8, r: 26, c: col, a: .22 });
      return;
    }
    ctx.save(); ex.save();
    for (const c of [ctx, ex]) { c.translate(X + 16, Y + 24); c.scale(s, s); c.translate(-(X + 16), -(Y + 24)); } // grow about the roots
    if (r < .4) palm(ctx, ex, X, Y, x, y, k, L, map.theme || '#18f0ff');
    else if (r < .82) canopy(ctx, ex, X, Y, x, y, k, L);
    else deadTree(ctx, ex, X, Y, x, y, k, L);
    ctx.restore(); ex.restore();
  }

  function neonLine(ctx, color, k, w = 1.6, blur = 8) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.shadowColor = color; ctx.shadowBlur = blur * k;
  }

  // ---------- Pixel interiors ----------
  // Rooms with a `decor` style get floors from the Tuxemon floors sheet and furniture from its set
  // pieces (night-graded, screens lit on the emissive layer). Two-tile props are drawn from their
  // right-hand tile so the next tile in the row can't paint over them.
  const DECOR = { // floor cells (col, row) on the floors sheet, picked per tile by hash
    home: [[1, 7], [2, 7], [3, 7]], lab: [[22, 5], [23, 5]], center: [[20, 4], [21, 4]], mart: [[11, 0]],
    gym: [[24, 4], [25, 4]], bar: [[22, 13], [23, 13], [22, 14]], clinic: [[16, 6], [17, 6]],
    spire: [[22, 4], [23, 4]], server: [[20, 5], [21, 5]], exec: [[18, 4], [19, 4]],
  };
  const TERMINALS = [[5, 6], [6, 6], [7, 6], [9, 6], [10, 6], [11, 6]];
  const FLOORISH = new Set([':', 'E', 'C', 'P', 'k', 'B', 'h']);
  function prop(ctx, L, col, row, X, Y, w = 1, h = 1) {
    Atlas.draw(ctx, 'props', col, row, X, Y, w, h);
    Atlas.draw(L.ex, 'props.emit', col, row, X, Y, w, h);
  }
  function interior(ctx, map, t, x, y, X, Y, L, th, below, nb) {
    const fl = DECOR[map.decor];
    const floor = () => { const [c, r] = fl[Math.floor(hash(x, y, 61) * fl.length)]; Atlas.draw(ctx, 'floors', c, r, X, Y); }; // the tiles carry their own texture: no extra grime
    const pairEnd = nb(-1, 0) === t && nb(1, 0) !== t; // right tile of a pair
    switch (t) {
      case ':': case 'E': floor(); return t === ':'; // the exit mat keeps its neon chevrons (procedural case below)
      case 'X':
        if (!FLOORISH.has(below)) return false;
        Atlas.draw(ctx, 'walls', 18, 8, X, Y);
        ctx.fillStyle = 'rgba(5,4,10,.35)'; ctx.fillRect(X, Y, T, 6); // ceiling shadow
        neonLine(L.ex, th, L.k, 1.4, 8); L.ex.beginPath(); L.ex.moveTo(X, Y + T - 1); L.ex.lineTo(X + T, Y + T - 1); L.ex.stroke();
        if (x % 3 === 0) L.lights.push({ x: X + 16, y: Y + T + 8, r: 40, c: th, a: .45 });
        return true;
      case 'C': // shop counters: a till at the left end, glass cases along the run
        floor();
        prop(ctx, L, nb(-1, 0) === 'C' ? 15 + (x % 3) : 14, 6, X, Y);
        L.lights.push({ x: X + 16, y: Y + 20, r: 26, c: th, a: .35 });
        return true;
      case 'h': // the heal machine is 2x2: drawn once, from the right tile, up into the wall
        floor();
        if (pairEnd || nb(1, 0) !== 'h') prop(ctx, L, 7, 7, X - (pairEnd ? T : 0), Y - T, pairEnd ? 2 : 1, 2);
        L.lights.push({ x: X, y: Y + 6, r: 46, c: '#ff4fd8', a: .55 });
        return true;
      case 'P': // PC desk with a tower, 2x2
        floor();
        if (pairEnd) prop(ctx, L, 10, 0, X - T, Y - T, 2, 2);
        else if (nb(1, 0) !== 'P' && nb(-1, 0) !== 'P') { const [c, r] = TERMINALS[Math.floor(hash(x, y, 7) * TERMINALS.length)]; prop(ctx, L, c, r, X, Y); }
        L.lights.push({ x: X + 16, y: Y + 14, r: 30, c: '#18f0ff', a: .5 });
        return true;
      case 'k': {
        floor();
        const [c, r] = TERMINALS[Math.floor(hash(x, y, 7) * TERMINALS.length)]; prop(ctx, L, c, r, X, Y);
        L.lights.push({ x: X + 16, y: Y + 14, r: 30, c: '#18f0ff', a: .5 });
        return true;
      }
      case 'B':
        floor();
        if (map.decor === 'center') prop(ctx, L, 9, 4, X, Y);                         // potted palms by the doors
        else if (map.decor === 'mart' || map.decor === 'bar') prop(ctx, L, 1 + (x % 2), 8, X, Y); // lit shelves of bottles
        else if (map.decor === 'home' && y <= 1) prop(ctx, L, x % 2 ? 2 : 0, 4, X, Y);  // kitchenette
        else { const [c, r] = TERMINALS[Math.floor(hash(x, y, 9) * TERMINALS.length)]; prop(ctx, L, c, r, X, Y); }
        L.lights.push({ x: X + 16, y: Y + 16, r: 24, c: th, a: .35 });
        return true;
    }
    return false;
  }

  // The Recharge Station's floor seal: a Capture Core in neon, set into the tiles like the
  // handhelds' healing-center emblem. Ring, split band, button, and a ring of HUD ticks.
  function emblem(ctx, ex, map, L) {
    const [ex0, ey0] = map.emblem, cx = ex0 * T, cy = ey0 * T, r = T * 1.45, c = map.theme;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fillStyle = 'rgba(8,4,14,.55)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, TAU); ctx.fillStyle = hexA(c, .1); ctx.fill();
    ctx.restore();
    ex.save();
    neonLine(ex, c, L.k, 2.4, 14);
    ex.beginPath(); ex.arc(cx, cy, r, 0, TAU); ex.stroke();
    neonLine(ex, c, L.k, 1.2, 6);
    ex.beginPath(); ex.arc(cx, cy, r - 5, 0, TAU); ex.stroke();
    const b = r * .3;
    for (const s of [-1, 1]) { // the band, broken by the button
      ex.beginPath(); ex.moveTo(cx + s * (r - 5), cy - 3); ex.lineTo(cx + s * b, cy - 3); ex.moveTo(cx + s * (r - 5), cy + 3); ex.lineTo(cx + s * b, cy + 3); ex.stroke();
    }
    neonLine(ex, '#ffffff', L.k, 1.6, 12);
    ex.beginPath(); ex.arc(cx, cy, b, 0, TAU); ex.stroke();
    ex.fillStyle = hexA(c, .9); ex.beginPath(); ex.arc(cx, cy, b * .42, 0, TAU); ex.fill();
    ex.shadowBlur = 0; ex.fillStyle = hexA(c, .55);
    for (let i = 0; i < 32; i++) { // HUD ticks, longer every eighth
      const a = i / 32 * TAU, l = i % 8 ? 3 : 7;
      ex.save(); ex.translate(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6)); ex.rotate(a); ex.fillRect(0, -.6, l, 1.2); ex.restore();
    }
    ex.restore();
    L.lights.push({ x: cx, y: cy, r: r * 2.4, c, a: .7 });
  }

  function drawTile(ctx, map, tile, x, y, k, L) {
    const t = tile(x, y), X = x * T, Y = y * T, th = map.theme;
    const below = tile(x, y + 1), nb = (dx, dy) => tile(x + dx, y + dy);
    ctx.save();
    if (map.decor && Atlas.has('floors') && Atlas.has('props') && interior(ctx, map, t, x, y, X, Y, L, th, below, nb)) { ctx.restore(); return; }
    switch (t) {
      case '.': street(ctx, X, Y, x, y, map, L, false, nb); break;
      case ',': street(ctx, X, Y, x, y, map, L, true, nb); break;
      case 'g': // industrial grate floor
        ctx.fillStyle = '#0d0c14'; ctx.fillRect(X, Y, T, T);
        ctx.strokeStyle = 'rgba(160,170,200,.08)'; ctx.lineWidth = 1;
        for (let i = 4; i < T; i += 6) { ctx.beginPath(); ctx.moveTo(X + i, Y); ctx.lineTo(X + i, Y + T); ctx.stroke(); }
        grime(ctx, X, Y, x, y, .5);
        break;
      case ';': ctx.fillStyle = '#150a24'; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = 'rgba(255,46,136,.06)'; ctx.fillRect(X + 1, Y + 1, T - 2, T - 2);
        grime(ctx, X, Y, x, y, .6);
        break;
      case 'v': street(ctx, X, Y, x, y, { outdoor: false }, L, false);
        ctx.fillStyle = '#16141f'; ctx.beginPath(); ctx.arc(X + 16, Y + 16, 10, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#2c2838'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = '#05040a';
        for (let i = -6; i <= 6; i += 3) { ctx.beginPath(); ctx.moveTo(X + 16 + i, Y + 8); ctx.lineTo(X + 16 + i, Y + 24); ctx.stroke(); }
        L.vents.push({ x: X + 16, y: Y + 14, s: hash(x, y) * 10 });
        break;
      case '~': {
        ctx.fillStyle = '#030a18'; ctx.fillRect(X, Y, T, T);
        if (Atlas.draw(ctx, 'water', Math.floor(hash(x, y, 60) * 6), 1 + Math.floor(hash(x, y, 61) * 3), X, Y)) {
          ctx.fillStyle = 'rgba(2,4,14,.45)'; ctx.fillRect(X, Y, T, T); // canal water: darker and dirtier than the sea it came from
        }
        ctx.fillStyle = 'rgba(80,255,170,.05)'; ctx.fillRect(X, Y + hash(x, y) * 20, T, 6);
        const same = (a, b) => tile(a, b) === '~' || tile(a, b) === undefined;
        neonLine(ctx, 'rgba(61,139,255,.6)', k, 1.2, 6);
        ctx.beginPath();
        if (!same(x, y - 1)) { ctx.moveTo(X, Y + 1); ctx.lineTo(X + T, Y + 1); }
        if (!same(x, y + 1)) { ctx.moveTo(X, Y + T - 1); ctx.lineTo(X + T, Y + T - 1); }
        ctx.stroke();
        break;
      }
      case 'T': // ground and a tree grate now; the tree itself is drawn after all the ground (see build)
        street(ctx, X, Y, x, y, map, L, true, nb);
        if (!Atlas.has('outdoor')) treePit(ctx, X, Y, x, y);
        L.trees.push({ X, Y, x, y });
        break;
      case 'l': street(ctx, X, Y, x, y, map, L, true, nb);
        if (Atlas.has('setpieces')) { // round street lamp, 1x2, bulb on the emissive layer
          Atlas.draw(ctx, 'setpieces', 30, 25, X, Y - T, 1, 2);
          L.ex.shadowColor = '#ffd38a'; L.ex.shadowBlur = 12 * k;
          Atlas.draw(L.ex, 'setpieces.emit', 30, 25, X, Y - T, 1, 1);
          L.ex.shadowBlur = 0;
          L.lights.push({ x: X + 16, y: Y + 8, r: 70, c: '#ffd38a', a: .9, cone: 1 });
          break;
        }
        ctx.fillStyle = '#1b1824'; ctx.fillRect(X + 14, Y + 4, 3, 26);
        ctx.fillRect(X + 14, Y + 4, 10, 3);
        L.ex.fillStyle = '#ffd38a'; L.ex.shadowColor = '#ffb347'; L.ex.shadowBlur = 12 * k;
        L.ex.fillRect(X + 20, Y + 6, 6, 3);
        L.lights.push({ x: X + 23, y: Y + 22, r: 70, c: '#ffb347', a: .9, cone: 1 });
        break;
      case '=': street(ctx, X, Y, x, y, map, L, false);
        if (Atlas.has('props')) { Atlas.draw(ctx, 'props', 27, 14, X, Y); break; } // Tuxemon road barricade
        ctx.fillStyle = '#17130a'; ctx.fillRect(X, Y + 10, T, 12);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#09080f' : 'rgba(255,200,60,.5)'; ctx.fillRect(X + i * 8, Y + 12, 8, 8); }
        ctx.strokeStyle = 'rgba(255,200,60,.5)'; ctx.lineWidth = 1; ctx.strokeRect(X + .5, Y + 10.5, T - 1, 11);
        break;
      case 'K': // junk crates, or a dead car nobody came back for
        street(ctx, X, Y, x, y, { outdoor: false }, L, false);
        if (Atlas.has('blackcar') && hash(x, y, 90) > .8) { // Tuxemon's black car, nose down, drawn 1:1 so it fits the lot
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(X + 2, Y - 10, 28, 42);
          ctx.imageSmoothingEnabled = false; ctx.drawImage(Atlas.image('blackcar'), 0, 0, 32, 48, X, Y - 16, 32, 48);
          break;
        }
        if (Atlas.has('cars') && hash(x, y, 90) > .45) {
          const [sx, sw] = CARS[Math.floor(hash(x, y, 91) * CARS.length)];
          ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(X + 16 - sw - 1, Y + 4, sw * 2 + 4, 28);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(Atlas.image('cars'), sx, 0, sw, 14, X + 16 - sw, Y + 2, sw * 2, 28);
          break;
        }
        for (const [cx, cy, s] of [[3, 12, 15], [16, 9, 13], [9, 2, 12]]) {
          ctx.fillStyle = '#1d1a24'; ctx.fillRect(X + cx, Y + cy, s, s);
          ctx.strokeStyle = '#3a3546'; ctx.lineWidth = 1; ctx.strokeRect(X + cx + .5, Y + cy + .5, s - 1, s - 1);
          ctx.beginPath(); ctx.moveTo(X + cx, Y + cy); ctx.lineTo(X + cx + s, Y + cy + s); ctx.stroke();
        }
        if (hash(x, y) > .6) { ctx.fillStyle = 'rgba(255,181,46,.6)'; ctx.fillRect(X + 18, Y + 11, 6, 2); }
        break;
      case '#': case 'D': {
        const solid = (a, b) => tile(a, b) === '#' || tile(a, b) === 'D';
        if (Atlas.has('buildings')) facade(ctx, tile, x, y, X, Y, L);
        else {
        ctx.fillStyle = '#0b0915'; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = 'rgba(255,255,255,.018)'; ctx.fillRect(X + 10, Y, 1, T); ctx.fillRect(X + 21, Y, 1, T);
        if (t === '#') {
          const lit = ['#ffb347', '#18f0ff', '#ff4fd8', '#d7c9a6'];
          for (let i = 0; i < 4; i++) {
            const rr = hash(x, y, i + 1);
            ctx.fillStyle = rr > .78 ? hexA(lit[Math.floor(rr * 40) % 4], .4) : 'rgba(255,255,255,.025)';
            ctx.fillRect(X + 6 + (i % 2) * 13, Y + 6 + Math.floor(i / 2) * 13, 7, 8);
          }
          if (hash(x, y, 20) > .85) { ctx.fillStyle = '#16131f'; ctx.fillRect(X + 3, Y + 20, 11, 8); ctx.fillStyle = '#25202f'; ctx.fillRect(X + 4, Y + 21, 9, 2); } // AC unit
          if (hash(x, y, 21) > .8) { ctx.fillStyle = '#1a1622'; ctx.fillRect(X + 27, Y, 3, T); } // pipe
          // grime streaks
          const g = ctx.createLinearGradient(0, Y, 0, Y + T);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
          ctx.fillStyle = g; ctx.fillRect(X, Y, T, T);
        }
        // dim concrete edges, neon only on the street-facing side
        ctx.strokeStyle = '#211b33'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (!solid(x, y - 1)) { ctx.moveTo(X, Y + .5); ctx.lineTo(X + T, Y + .5); }
        if (!solid(x - 1, y)) { ctx.moveTo(X + .5, Y); ctx.lineTo(X + .5, Y + T); }
        if (!solid(x + 1, y)) { ctx.moveTo(X + T - .5, Y); ctx.lineTo(X + T - .5, Y + T); }
        ctx.stroke();
        }
        if (!solid(x, y + 1)) {
          neonLine(L.ex, th, k, 1.8, 9);
          L.ex.beginPath(); L.ex.moveTo(X, Y + T - 1); L.ex.lineTo(X + T, Y + T - 1); L.ex.stroke();
          L.ex.shadowBlur = 0;
          L.lights.push({ x: X + 16, y: Y + T + 4, r: 34, c: th, a: .55 });
          if (t === '#' && hash(x, y, 30) > .5 && WALK(below) && !(map.holo || []).some((hs) => y >= hs.y && y <= hs.y + 1 && x >= hs.x && x < hs.x + hs.w)) sign(L.ex, X, Y, x, y, k, L);
        }
        if (t === 'D') {
          const g = L.ex.createLinearGradient(0, Y + 8, 0, Y + T);
          g.addColorStop(0, hexA(th, .1)); g.addColorStop(1, hexA(th, .6));
          L.ex.fillStyle = g; L.ex.fillRect(X + 8, Y + 8, 16, 24);
          if (!Atlas.has('buildings')) { neonLine(L.ex, th, k, 1.5, 10); L.ex.strokeRect(X + 8, Y + 8, 16, 24); }
          L.lights.push({ x: X + 16, y: Y + T + 10, r: 48, c: th, a: .8, refl: 1 });
        }
        break;
      }
      case '^': street(ctx, X, Y, x, y, map, L, false);
        ctx.fillStyle = '#1a1622'; ctx.fillRect(X + 14, Y + 18, 4, 12);
        L.ex.fillStyle = 'rgba(8,6,16,.92)'; L.ex.fillRect(X + 4, Y + 4, 24, 15);
        neonLine(L.ex, th, k, 1.4, 8); L.ex.strokeRect(X + 4, Y + 4, 24, 15);
        L.ex.shadowBlur = 0; L.ex.fillStyle = hexA(th, .8); L.ex.fillRect(X + 8, Y + 9, 16, 2); L.ex.fillRect(X + 8, Y + 13, 10, 2);
        L.lights.push({ x: X + 16, y: Y + 16, r: 34, c: th, a: .6 });
        break;
      case 'L': // laser gate emitter floor
        ctx.fillStyle = '#0d0c14'; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = '#2a2433'; ctx.fillRect(X, Y + 13, 4, 6); ctx.fillRect(X + T - 4, Y + 13, 4, 6);
        break;
      case ':': case 'E':
        if (!(map.decor && Atlas.has('floors'))) { ctx.fillStyle = '#0d0b18'; ctx.fillRect(X, Y, T, T); } // pixel rooms already laid the floor
        ctx.strokeStyle = hexA(th, .07); ctx.lineWidth = 1; ctx.strokeRect(X + .5, Y + .5, T - 1, T - 1);
        grime(ctx, X, Y, x, y, .4);
        if (t === 'E') {
          neonLine(L.ex, th, k, 2, 8);
          for (const oy of [8, 16]) { L.ex.beginPath(); L.ex.moveTo(X + 9, Y + oy); L.ex.lineTo(X + 16, Y + oy + 6); L.ex.lineTo(X + 23, Y + oy); L.ex.stroke(); }
          L.lights.push({ x: X + 16, y: Y + 14, r: 30, c: th, a: .6 });
        }
        break;
      case 'u': // elevator up: a Tuxemon neon portal ring where the art is loaded
        ctx.fillStyle = '#0d0b18'; ctx.fillRect(X, Y, T, T);
        if (Atlas.has('doors')) { Atlas.draw(ctx, 'doors', 10, 1, X, Y); Atlas.draw(L.ex, 'doors.emit', 10, 1, X, Y); L.lights.push({ x: X + 16, y: Y + 22, r: 40, c: th, a: .7 }); break; }
        ctx.fillStyle = '#16122a'; ctx.fillRect(X + 3, Y + 2, 26, 28);
        neonLine(L.ex, th, k, 1.6, 10); L.ex.strokeRect(X + 3, Y + 2, 26, 28);
        L.ex.beginPath(); L.ex.moveTo(X + 16, Y + 2); L.ex.lineTo(X + 16, Y + 30); L.ex.stroke();
        for (const oy of [20, 13]) { L.ex.beginPath(); L.ex.moveTo(X + 10, Y + oy); L.ex.lineTo(X + 16, Y + oy - 5); L.ex.lineTo(X + 22, Y + oy); L.ex.stroke(); }
        L.lights.push({ x: X + 16, y: Y + 22, r: 40, c: th, a: .7 });
        break;
      case 'X':
        ctx.fillStyle = '#07060c'; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = '#100d1d'; ctx.fillRect(X, Y + T - 10, T, 10);
        if (below && below !== 'X') {
          neonLine(L.ex, th, k, 1.4, 8);
          L.ex.beginPath(); L.ex.moveTo(X, Y + T - 1); L.ex.lineTo(X + T, Y + T - 1); L.ex.stroke();
          if (x % 3 === 0) L.lights.push({ x: X + 16, y: Y + T + 8, r: 40, c: th, a: .45 });
        }
        break;
      case 'C': case 'B': case 'P': case 'h': case 'k':
        ctx.fillStyle = '#0d0b18'; ctx.fillRect(X, Y, T, T);
        if (t === 'C') {
          ctx.fillStyle = '#19152c'; ctx.fillRect(X, Y + 6, T, 22);
          neonLine(L.ex, th, k, 1.4, 8);
          L.ex.beginPath(); L.ex.moveTo(X, Y + 27.5); L.ex.lineTo(X + T, Y + 27.5); L.ex.stroke();
        } else if (t === 'h') {
          rrect(L.ex, X + 6, Y + 3, 20, 26, 9); L.ex.fillStyle = 'rgba(255,79,216,.12)'; L.ex.fill();
          neonLine(L.ex, '#ff4fd8', k, 1.5, 10); L.ex.stroke();
          L.lights.push({ x: X + 16, y: Y + 18, r: 30, c: '#ff4fd8', a: .55 });
        } else {
          const scr = t === 'P' || t === 'k' ? '#18f0ff' : th;
          ctx.fillStyle = '#141024'; ctx.fillRect(X + 3, Y + 2, 26, 28);
          ctx.strokeStyle = hexA(scr, .5); ctx.lineWidth = 1; ctx.strokeRect(X + 3.5, Y + 2.5, 25, 27);
          L.ex.fillStyle = hexA(scr, t === 'B' ? .3 : .65); L.ex.shadowColor = scr; L.ex.shadowBlur = 8 * k;
          L.ex.fillRect(X + 7, Y + 6, 18, 10);
          L.ex.shadowBlur = 0;
          for (let i = 0; i < 3; i++) { L.ex.fillStyle = hash(x, y, i) > .5 ? '#2ee6a0' : '#ff2e88'; L.ex.fillRect(X + 8 + i * 6, Y + 21, 3, 3); }
          L.lights.push({ x: X + 16, y: Y + 22, r: t === 'B' ? 22 : 30, c: scr, a: .5 });
        }
        break;
      default: ctx.fillStyle = '#040309'; ctx.fillRect(X, Y, T, T);
    }
    ctx.restore();
  }

  // ---------- Buildings ----------
  // A building is any rectangle of '#' with 'D' doors on its bottom row. It gets one storefront
  // style from the buildings sheet, bottom-aligned: the sheet's ground floor sits on the door row,
  // its upper rows stack above, and anything taller than the style gets a flat roof. Lit windows
  // come from the sheet's emissive twin; the rest stay dark, so no two blocks light up the same.
  const STYLES = [ // sheet columns: L left edge, M middle run, R right edge, door; rows top to bottom; doorTop: first row that shows the door
    { L: 10, M: [11, 13, 11], R: 14, door: 12, rows: [5, 6, 7, 8], doorTop: 8 },  // blue awning storefront
    { L: 5, M: [6, 8, 6], R: 9, door: 7, rows: [5, 6, 7, 8], doorTop: 8 },        // charcoal storefront
    { L: 0, M: [1, 2, 1], R: 4, door: 3, rows: [5, 6, 7, 8], doorTop: 8 },        // pale storefront
    { L: 0, M: [1, 5, 2, 6], R: 6, door: 3, rows: [1, 2, 3, 4], doorTop: 3 },     // blue-grey office block
    { L: 7, M: [8, 12, 9, 13], R: 13, door: 10, rows: [1, 2, 3, 4], doorTop: 3 }, // green-grey office block
  ];
  // Future City 27 storefronts (tools/facades.py): [first strip column, width, height] in cells,
  // bottom-aligned in a 5-cell-tall strip. About half the blocks in town are built from these.
  const FACADES = [[0, 3, 5], [3, 2, 4], [5, 3, 4], [8, 3, 4], [11, 3, 4], [14, 3, 4], [17, 2, 4], [19, 3, 4], [22, 2, 4], [24, 3, 4], [27, 3, 5], [30, 2, 5]];
  const packs = new Map();
  const CARS = [[0, 9], [11, 9], [22, 7], [31, 7], [40, 7], [49, 7], [58, 7], [67, 7]]; // cars.png: x, width
  const POSTERS = [[0, 18], [2, 18], [4, 18], [0, 20], [2, 20], [0, 22], [2, 22], [4, 22], [14, 18], [14, 20]]; // void-tiles, 2x2 each
  function pack(x0, y0, bw) { // left to right, which facade and which of its columns covers each tile; null = too narrow
    const key = `${x0},${y0},${bw}`;
    if (packs.has(key)) return packs.get(key);
    const cols = [];
    for (let i = 0; cols.length < bw; i++) {
      const left = bw - cols.length;
      const fits = FACADES.filter(([, w]) => w <= left && left - w !== 1); // never strand a single column
      if (!fits.length) { cols.length = 0; break; }
      const f = fits[Math.floor(hash(x0 + i, y0, 502) * fits.length)];
      for (let c = 0; c < f[1]; c++) cols.push(f[0] + c);
    }
    const out = cols.length ? cols : null;
    packs.set(key, out);
    return out;
  }

  function facade(ctx, tile, x, y, X, Y, L) {
    const solid = (a, b) => tile(a, b) === '#' || tile(a, b) === 'D';
    let x0 = x, x1 = x, y0 = y, y1 = y;
    while (solid(x0 - 1, y)) x0--;
    while (solid(x1 + 1, y)) x1++;
    while (solid(x, y0 - 1)) y0--;
    while (solid(x, y1 + 1)) y1++;
    const cyber = Atlas.has('facades') && y1 > y0 && hash(x0, y0, 501) > .45 && pack(x0, y0, x1 - x0 + 1);
    if (cyber) {
      const fromBottom = y1 - y;
      ctx.fillStyle = '#0c0a15'; ctx.fillRect(X, Y, T, T); // night sky-dark roofline behind shorter fronts
      if (fromBottom < 5) {
        Atlas.draw(ctx, 'facades', cyber[x - x0], 4 - fromBottom, X, Y);
        Atlas.draw(L.ex, 'facades.emit', cyber[x - x0], 4 - fromBottom, X, Y);
      }
      if (tile(x, y) === 'D' && Atlas.has('doors')) { Atlas.draw(ctx, 'doors', 9, 3, X, Y); Atlas.draw(L.ex, 'doors.emit', 9, 3, X, Y); } // glass sliding door
      return;
    }
    const st = STYLES[Math.floor(hash(x0, y0, 500) * STYLES.length)];
    const lx = x - x0, bw = x1 - x0 + 1, fromBottom = y1 - y;
    if (fromBottom >= st.rows.length) { // flat roof above what the style covers
      ctx.fillStyle = '#0c0a15'; ctx.fillRect(X, Y, T, T);
      ctx.fillStyle = '#1c1828'; ctx.fillRect(X, Y + T - 5, T, 5);
      ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fillRect(X, Y + T - 5, T, 1);
      if (fromBottom === st.rows.length && hash(x, y, 20) > .7) { ctx.fillStyle = '#18141f'; ctx.fillRect(X + 6, Y + 8, 14, 10); ctx.fillStyle = '#262033'; ctx.fillRect(X + 7, Y + 9, 12, 3); } // rooftop AC unit
      return;
    }
    const row = st.rows[st.rows.length - 1 - fromBottom];
    const poster = Atlas.has('void') && bw >= 4 && y1 - y0 >= 2 && hash(x0, y0, 503) > .35; // one flyposted 2x2 per wall
    const doorHere = tile(x, y) === 'D' || (row >= st.doorTop && tile(x, y1) === 'D' && y1 - y < st.rows[st.rows.length - 1] - st.doorTop + 1);
    const col = doorHere ? st.door : lx === 0 ? st.L : lx === bw - 1 ? st.R : st.M[(lx - 1) % st.M.length];
    Atlas.draw(ctx, 'buildings', col, row, X, Y);
    if (!doorHere && hash(x, y, 50) > .4) { // a lit window
      L.ex.globalAlpha = .85;
      Atlas.draw(L.ex, 'buildings.emit', col, row, X, Y);
      L.ex.globalAlpha = 1;
    }
    if (poster && (fromBottom === 1 || fromBottom === 2)) {
      const px = x0 + 1 + Math.floor(hash(x0, y0, 504) * (bw - 3)), dx = x - px;
      if (dx === 0 || dx === 1) {
        const [pc, pr] = POSTERS[Math.floor(hash(x0, y0, 505) * POSTERS.length)];
        Atlas.draw(ctx, 'void', pc + dx, pr + 2 - fromBottom, X, Y);
        Atlas.draw(L.ex, 'void.emit', pc + dx, pr + 2 - fromBottom, X, Y);
      }
    }
    const g = ctx.createLinearGradient(0, Y, 0, Y + T); // grime creeping up from the street
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${fromBottom === 0 ? .3 : .12})`);
    ctx.fillStyle = g; ctx.fillRect(X, Y, T, T);
  }

  // A holo sign hung on a building's street side.
  function sign(ctx, X, Y, x, y, k, L) {
    const word = SIGN_WORDS[Math.floor(hash(x, y, 31) * SIGN_WORDS.length)];
    const c = SIGN_COLORS[Math.floor(hash(x, y, 32) * SIGN_COLORS.length)];
    const vertical = hash(x, y, 33) > .6 && word.length <= 4;
    ctx.save();
    ctx.font = `800 ${vertical ? 7 : 7.5}px Tektur, "Chakra Petch", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let bx, by, bw, bh;
    if (vertical) { bw = 11; bh = 29; bx = X + 18; by = Y + 1; }
    else { bw = Math.min(30, ctx.measureText(word).width + 6); bh = 11; bx = X + (T - bw) / 2; by = Y + 13; }
    ctx.fillStyle = 'rgba(6,4,12,.92)'; ctx.fillRect(bx, by, bw, bh);
    neonLine(ctx, c, k, 1, 8); ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1);
    ctx.fillStyle = c; ctx.shadowBlur = 10 * k;
    if (vertical) [...word].forEach((ch, i) => ctx.fillText(ch, bx + bw / 2, by + 5 + i * 6.5));
    else ctx.fillText(word, bx + bw / 2, by + bh / 2 + .5, bw - 3);
    ctx.restore();
    L.signs.push({ x: bx, y: by, w: bw, h: bh, c, seed: hash(x, y, 34) });
    L.lights.push({ x: bx + bw / 2, y: by + bh / 2, r: 30, c, a: .6 });
    L.lights.push({ x: bx + bw / 2, y: by + bh + 14, r: 44, c, a: .7, refl: 1 });
  }

  // A named storefront sign spanning several tiles of a building face. hs: { x, y, w (tiles), text, c }
  function bigSign(ctx, hs, k, L) {
    const X = hs.x * T + 3, Y = hs.y * T + 8, w = hs.w * T - 6, h = 16;
    ctx.save();
    ctx.fillStyle = 'rgba(5,3,10,.94)'; ctx.fillRect(X, Y, w, h);
    neonLine(ctx, hs.c, k, 1.4, 10); ctx.strokeRect(X + .5, Y + .5, w - 1, h - 1);
    ctx.font = '800 10px Tektur, "Chakra Petch", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = hs.c; ctx.shadowBlur = 12 * k;
    ctx.fillText(hs.text, X + w / 2, Y + h / 2 + .5, w - 8);
    ctx.restore();
    L.signs.push({ x: X, y: Y, w, h, c: hs.c, seed: (hs.x * 7 + hs.y) % 10 / 10, big: 1 });
    L.lights.push({ x: X + w / 2, y: Y + h + 20, r: Math.max(50, w * .7), c: hs.c, a: .8, refl: 1 });
  }

  // Bakes a darkness layer with light holes, plus an additive color layer, both at low resolution.
  function bakeLights(map, L) {
    const W = L.w * T * LS, H = L.h * T * LS;
    const dark = document.createElement('canvas'), glow = document.createElement('canvas');
    dark.width = glow.width = Math.ceil(W); dark.height = glow.height = Math.ceil(H);
    const d = dark.getContext('2d'), g = glow.getContext('2d');
    d.fillStyle = `rgba(2,1,8,${map.dark ?? (map.outdoor ? .42 : .22)})`;
    d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    g.globalCompositeOperation = 'lighter';
    for (const l of L.lights) {
      const x = l.x * LS, y = l.y * LS, r = l.r * LS;
      let gr = d.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${l.a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = gr; d.fillRect(x - r, y - r, r * 2, r * 2);
      gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, hexA(l.c, .3 * l.a)); gr.addColorStop(.5, hexA(l.c, .1 * l.a)); gr.addColorStop(1, hexA(l.c, 0));
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      if (l.refl && map.outdoor) { // long wet-street reflection below the source
        g.save(); g.translate(x, y + r * .4); g.scale(.35, 1.4);
        gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
        gr.addColorStop(0, hexA(l.c, .22)); gr.addColorStop(1, hexA(l.c, 0));
        g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2);
        g.restore();
      }
    }
    // Bloom, baked: the emissive layer shrunk to lightmap size and added to the glow. The lightmap is
    // drawn stretched and smoothed, so the shrink becomes a soft halo around every sign and tube
    // at no per-frame cost. Skipped when screen effects are off.
    if (!G.state || G.state.opts.fx !== false) {
      g.save(); g.globalAlpha = .55; g.drawImage(L.emit, 0, 0, W, H); g.restore();
    }
    for (const p of L.puddles) { // puddles catch nearby light
      const x = p.x * LS, y = p.y * LS;
      g.fillStyle = 'rgba(120,150,255,.05)';
      g.beginPath(); g.ellipse(x, y, p.rx * LS * 1.4, p.ry * LS * 1.4, 0, 0, TAU); g.fill();
    }
    L.dark = dark; L.glow = glow;
    L.view = document.createElement('canvas');
  }

  // ---------- Per-frame world effects ----------
  // Animated tiles that sit under sprites.
  function underlay(ctx, map, L, view, t) {
    const tile = (x, y) => (map.rows[y] || '')[x];
    const frame = Math.floor(t * 8);
    for (let y = view.y0; y <= view.y1; y++) for (let x = view.x0; x <= view.x1; x++) {
      const c = tile(x, y);
      if (c === ';') {
        for (let i = 0; i < 4; i++) {
          const r = hash(x, y, frame * 4 + i);
          ctx.fillStyle = i % 2 ? `rgba(255,46,136,${.2 + r * .45})` : `rgba(155,107,255,${.2 + r * .45})`;
          ctx.fillRect(x * T + r * 24, y * T + hash(y, x, frame + i) * 28, 4 + r * 8, 2);
        }
        if (hash(x, y, frame) > .93) { ctx.fillStyle = 'rgba(24,240,255,.45)'; ctx.fillRect(x * T, y * T + hash(x, frame) * T, T, 1); }
      } else if (c === '~') {
        ctx.fillStyle = 'rgba(61,139,255,.28)';
        for (let i = 0; i < 2; i++) ctx.fillRect(x * T + (t * 14 + i * 16 + x * 7) % T, y * T + 8 + i * 14, 8, 1.2);
      } else if (c === 'L' && map.lasers && !G.state.flags[map.lasers]) {
        const a = .55 + .35 * Math.sin(t * 20 + x);
        ctx.save();
        ctx.strokeStyle = `rgba(255,40,70,${a})`; ctx.shadowColor = '#ff2846'; ctx.shadowBlur = 8 * G.k; ctx.lineWidth = 1.4;
        for (const oy of [10, 16, 22]) { ctx.beginPath(); ctx.moveTo(x * T + 2, y * T + oy); ctx.lineTo(x * T + T - 2, y * T + oy); ctx.stroke(); }
        ctx.restore();
      }
    }
    if (map.rain && G.state.opts.fx !== false) for (const p of L.puddles) {
      const ph = (t * .9 + p.x * .013) % 1;
      if (p.x < view.x0 * T - T || p.x > (view.x1 + 1) * T || p.y < view.y0 * T - T || p.y > (view.y1 + 1) * T) continue;
      ctx.strokeStyle = `rgba(170,200,255,${.35 * (1 - ph)})`; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.ellipse(p.x + (hash(p.x, Math.floor(t * .9 + p.x * .013)) - .5) * p.rx, p.y, ph * p.rx * .7, ph * p.ry * .7, 0, 0, TAU); ctx.stroke();
    }
  }

  // Things that sit over sprites: steam, sign flicker, lighting, rain.
  function overlay(ctx, map, L, cam, W, H, t, player) {
    for (const v of L.vents) {
      for (let i = 0; i < 4; i++) {
        const ph = (t * .45 + i / 4 + v.s) % 1;
        ctx.fillStyle = `rgba(200,205,225,${.13 * (1 - ph)})`;
        ctx.beginPath(); ctx.arc(v.x + Math.sin(ph * 6 + v.s) * 4, v.y - ph * 28, 4 + ph * 9, 0, TAU); ctx.fill();
      }
    }
    // darkness with the player's own light carved out
    const vw = Math.ceil(W * LS) + 2, vh = Math.ceil(H * LS) + 2;
    const v = L.view;
    if (v.width !== vw || v.height !== vh) { v.width = vw; v.height = vh; }
    const vc = v.getContext('2d');
    vc.globalCompositeOperation = 'source-over';
    vc.clearRect(0, 0, vw, vh);
    vc.drawImage(L.dark, -cam.x * LS, -cam.y * LS);
    vc.globalCompositeOperation = 'destination-out';
    const px = (player.x - cam.x) * LS, py = (player.y - cam.y) * LS, pr = 90 * LS;
    const gr = vc.createRadialGradient(px, py, 0, px, py, pr);
    gr.addColorStop(0, 'rgba(0,0,0,.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    vc.fillStyle = gr; vc.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    fog(vc, map, cam, vw, t); // fog rides along in the same low-res layer: no extra full-screen pass
    ctx.save();
    ctx.translate(cam.x, cam.y);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(v, 0, 0, vw / LS, vh / LS);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(L.glow, -cam.x, -cam.y, L.glow.width / LS, L.glow.height / LS);
    ctx.restore();
    ctx.drawImage(L.emit, 0, 0, L.w * T, L.h * T);
    for (const s of L.signs) { // occasional dying-tube flicker
      const dying = s.big ? Math.sin(t * 1.7 + s.seed * 40) > .995 : Math.sin(t * (3 + s.seed * 5) + s.seed * 40) > .97 || (s.seed > .85 && Math.sin(t * 23) > .6);
      if (dying) {
        ctx.fillStyle = 'rgba(4,3,10,.8)'; ctx.fillRect(s.x, s.y, s.w, s.h);
      }
    }
  }

  // ---------- Rain (screen space) ----------
  const drops = [], splashes = [];
  let lastT = 0;
  function rain(ctx, W, H, t, amount) {
    if (G.state && G.state.opts.fx === false) return;
    const dt = Math.min(.05, Math.max(0, t - lastT));
    lastT = t;
    const want = Math.round(90 * amount);
    while (drops.length < want) drops.push({ x: Math.random() * (W + 60), y: Math.random() * H, l: 8 + Math.random() * 12, v: 380 + Math.random() * 220, z: Math.random() });
    drops.length = Math.min(drops.length, want);
    ctx.save();
    ctx.lineWidth = 1;
    for (const d of drops) {
      d.y += d.v * dt; d.x -= d.v * dt * .22;
      if (d.y > H * (.55 + d.z * .5)) {
        if (Math.random() < .5) splashes.push({ x: d.x, y: d.y, t: 0 });
        d.y = -d.l - Math.random() * 40; d.x = Math.random() * (W + 60);
      }
      ctx.strokeStyle = `rgba(170,195,255,${.12 + d.z * .22})`;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * .22, d.y - d.l); ctx.stroke();
    }
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.t += dt * 4;
      if (s.t >= 1) { splashes.splice(i, 1); continue; }
      ctx.strokeStyle = `rgba(170,195,255,${.4 * (1 - s.t)})`;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 1 + s.t * 5, .5 + s.t * 1.6, 0, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- Atmosphere: parallax fog and overhead cables ----------
  // Fog is one small, soft, tileable texture baked once per color and stretched huge; two layers
  // drift at different speeds against the camera (one behind the street, one in front of it).
  const fogs = new Map();
  function fogTex(color) {
    let f = fogs.get(color);
    if (f) return f;
    const S = 128, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 1, 9) * S, y = hash(i, 2, 9) * S, r = 14 + hash(i, 3, 9) * 34, a = .25 + hash(i, 4, 9) * .35;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { // drawn wrapped, so tiles meet seamlessly
        const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0));
        c.fillStyle = g; c.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
    f = { cv, S };
    fogs.set(color, f);
    return f;
  }
  // How foggy each place is: the Gutter is soup, the Kernel hums with violet haze, rooms are clear.
  function fogOf(map) {
    if (map.fog !== undefined) return map.fog;
    if (map.env === 'kernel') return { c: '#9b6bff', a: .3 };
    if (!map.outdoor) return null;
    return { c: mix(map.theme || '#8090b0', '#8a96b8', .7), a: (map.rain || 0) >= .9 ? .32 : (map.rain || 0) >= .6 ? .24 : .15 };
  }
  const wrap = (v, n) => ((v % n) + n) % n;
  // Drawn into the darkness layer (lightmap scale LS) after the player's light is carved out, so the
  // haze hangs over lit and unlit ground alike.
  function fog(vc, map, cam, vw, t) {
    const cfg = fogOf(map);
    if (!cfg || (G.state && G.state.opts.fx === false)) return;
    const { cv, S } = fogTex(cfg.c), vh = vc.canvas.height;
    vc.globalCompositeOperation = 'source-over';
    for (const [par, drift, scale, a] of [[.55, 5, 4, 1], [1.3, 13, 3, .6]]) {
      const size = S * scale * LS, ox = -wrap((cam.x * par + t * drift) * LS, size), oy = -wrap(cam.y * par * LS, size);
      vc.globalAlpha = cfg.a * a;
      for (let x = ox; x < vw; x += size) for (let y = oy; y < vh; y += size) vc.drawImage(cv, x, y, size, size);
    }
    vc.globalAlpha = 1;
  }

  // Power cables strung across the street overhead, close to the camera so they slide past faster
  // than the ground. A few thin strokes a frame; only the lamps' glow is baked.
  const lamps = new Map();
  function lamp(col, k) {
    let l = lamps.get(col + k);
    if (!l) {
      const cv = document.createElement('canvas'), S = 26;
      cv.width = cv.height = Math.ceil(S * k);
      const c = cv.getContext('2d');
      c.scale(k, k);
      c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 10 * k;
      c.fillRect(S / 2 - 3, S / 2 - 1.5, 6, 3);
      l = { cv, S };
      lamps.set(col + k, l);
    }
    return l;
  }
  const CABLES = [[6, 22, 2.2, '#07060c'], [2, 34, 1.6, '#0b0912'], [10, 46, 1.2, '#100d18']];
  function cables(ctx, map, cam, W) {
    if (!map.outdoor) return;
    const span = 352, ox = -wrap(cam.x * 1.35, span), dy = -4 - wrap(cam.y * .08, 6), k = Math.min(3, pxs(ctx));
    ctx.save();
    ctx.lineCap = 'round';
    for (const [y0, sag, lw, col] of CABLES) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let x0 = ox; x0 < W; x0 += span) { ctx.moveTo(x0, y0 + dy); ctx.quadraticCurveTo(x0 + span / 2, y0 + dy + sag * 2, x0 + span, y0 + dy); }
      ctx.stroke();
    }
    ctx.strokeStyle = '#07060c'; ctx.lineWidth = 1;
    for (let x0 = ox; x0 < W; x0 += span) {
      for (const [fx, col] of [[120, map.theme || '#ff2e88'], [270, '#18f0ff']]) { // lamps hang from the top cable
        const x = x0 + fx, y = dy + 6 + 22 * (1 - Math.pow(fx / 176 - 1, 2)) + 2, l = lamp(col, k);
        ctx.beginPath(); ctx.moveTo(x, y - 2); ctx.lineTo(x, y + 8); ctx.stroke();
        ctx.drawImage(l.cv, x - l.S / 2, y + 9.5 - l.S / 2, l.S, l.S);
      }
    }
    ctx.restore();
  }

  // ---------- Battle backdrops ----------
  // Everything that doesn't move is baked once per (backdrop, theme, scale) into an offscreen
  // canvas; each frame draws that bake plus the few things that animate (blinking beacons, server
  // LEDs, the billboard, searchlights, the scrolling floor grid, Kernel code rain).
  const pxs = (ctx) => Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  const HZ = 150;
  const ADS = ['NULL-OBSIDIAN · UPDATE IS FREEDOM', 'PROTOCOL ZERO · COMING SOON', 'NEON COLA · TASTE THE GLITCH', 'GET CHROMED · DOC RIVKA', 'NANOMART · 24/7', 'OBEY · UPDATE · OBEY'];
  const bakes = new Map();

  function skyline(ctx, W, hz, seed0, layers, theme, beacons) {
    for (let layer = 0; layer < layers; layer++) {
      const far = layer === 0;
      ctx.fillStyle = far ? '#0d0a19' : '#07060d';
      let x = -20, seed = seed0 + layer * 13;
      while (x < W) {
        seed = (seed * 9301 + 49297) % 233280;
        const w = (far ? 18 : 26) + (seed % 30), h = (far ? 90 : 55) + (seed % (far ? 70 : 50));
        ctx.fillRect(x, hz - h, w, h);
        if (far && seed % 3 === 0) { ctx.fillRect(x + w / 2 - 1, hz - h - 14, 2, 14); beacons.push({ x: x + w / 2 - 1.5, y: hz - h - 16, s: seed }); }
        ctx.fillStyle = far ? hexA(theme, .3) : 'rgba(255,190,110,.35)';
        for (let wy = hz - h + 6; wy < hz - 6; wy += 8) for (let wx = x + 3; wx < x + w - 3; wx += 6) {
          if (((wx * 7 + wy * 13 + seed) % (far ? 9 : 13)) === 0) ctx.fillRect(wx, wy, 2, 3);
        }
        ctx.fillStyle = far ? '#0d0a19' : '#07060d';
        x += w + (far ? 3 : 8);
      }
    }
  }

  // One baked billboard per ad: the glow and scanlines are the expensive part.
  function billboardArt(text, c, k) {
    const w = 120, h = 34, pad = 10, cv = document.createElement('canvas');
    cv.width = Math.ceil((w + pad * 2) * k); cv.height = Math.ceil((h + pad * 2) * k);
    const ctx = cv.getContext('2d');
    ctx.scale(k, k); ctx.translate(pad, pad);
    ctx.fillStyle = 'rgba(4,3,10,.9)'; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, hexA(c, .35)); g.addColorStop(1, hexA('#18f0ff', .15));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 12 * k; ctx.lineWidth = 1.2; ctx.strokeRect(0, 0, w, h);
    ctx.fillStyle = '#fff'; ctx.font = '800 9px Tektur, "Chakra Petch", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + .5, w - 6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i < h; i += 3) ctx.fillRect(0, i, w, 1);
    return { cv, pad };
  }

  // Kernel code rain: eight pre-drawn trails of 0s and 1s instead of ~200 fillText calls a frame.
  function codeTrails(k) {
    const cv = document.createElement('canvas'), tw = 14, th = 8 * 11 + 4;
    cv.width = Math.ceil(tw * 8 * k); cv.height = Math.ceil(th * k);
    const ctx = cv.getContext('2d');
    ctx.scale(k, k); ctx.font = '700 9px "Chakra Petch", monospace'; ctx.textBaseline = 'top';
    for (let v = 0; v < 8; v++) for (let i = 0; i < 8; i++) {
      ctx.fillStyle = `rgba(155,107,255,${.5 - i * .06})`;
      ctx.fillText(hash(v, i, 3) > .5 ? '1' : '0', v * tw, (7 - i) * 11);
    }
    return { cv, tw, th };
  }

  function bake(W, H, theme, bg, k) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(W * k); cv.height = Math.ceil(H * k);
    const ctx = cv.getContext('2d');
    ctx.scale(k, k);
    const B = { cv, k, beacons: [], ads: null, trails: null };
    if (bg === 'core') {
      ctx.fillStyle = '#020108'; ctx.fillRect(0, 0, W, H);
      B.trails = codeTrails(k);
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, HZ);
      if (bg === 'spire' || bg === 'indoor') { sky.addColorStop(0, '#05040b'); sky.addColorStop(1, '#120a1c'); }
      else if (bg === 'gutter') { sky.addColorStop(0, '#030507'); sky.addColorStop(1, '#0f1410'); }
      else { sky.addColorStop(0, '#04030b'); sky.addColorStop(.7, '#160a24'); sky.addColorStop(1, '#2a0f2e'); }
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, HZ);
      if (bg === 'spire' || bg === 'indoor') {
        for (let i = 0; i < 8; i++) {
          const x = i * 46 + 6;
          ctx.fillStyle = '#0a0812'; ctx.fillRect(x, 10, 34, HZ - 10);
          ctx.fillStyle = 'rgba(255,255,255,.04)';
          for (let j = 0; j < 14; j++) ctx.fillRect(x + 4 + (j % 2) * 16, 16 + Math.floor(j / 2) * 18, 10, 2);
        }
      } else if (bg === 'gutter') {
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = i % 2 ? '#0b0d0c' : '#0e100f'; ctx.fillRect(i * 64 - 10, 0, 56, HZ);
          ctx.fillStyle = '#151816'; ctx.fillRect(i * 64 + 4, 20 + (i % 3) * 30, 40, 4);
        }
        for (let i = 0; i < 3; i++) {
          const x = 50 + i * 120;
          const g = ctx.createRadialGradient(x, 30, 0, x, 30, 90);
          g.addColorStop(0, 'rgba(255,170,60,.22)'); g.addColorStop(1, 'rgba(255,170,60,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 90, 0, 180, HZ);
          ctx.fillStyle = '#ffcf7a'; ctx.fillRect(x - 6, 26, 12, 3);
        }
      } else {
        skyline(ctx, W, HZ, 7, 2, theme, B.beacons);
        B.ads = ADS.map((a) => billboardArt(a, theme, k));
      }
      const haze = ctx.createLinearGradient(0, HZ - 40, 0, HZ + 10);
      haze.addColorStop(0, 'rgba(60,30,80,0)'); haze.addColorStop(1, hexA(theme, .18));
      ctx.fillStyle = haze; ctx.fillRect(0, HZ - 40, W, 50);
    }
    // wet floor with its fixed perspective rays and the sky's reflection
    const floor = ctx.createLinearGradient(0, HZ, 0, H);
    floor.addColorStop(0, bg === 'core' ? '#0a0516' : '#0b0912'); floor.addColorStop(1, '#030207');
    ctx.fillStyle = floor; ctx.fillRect(0, HZ, W, H - HZ);
    ctx.strokeStyle = hexA(theme, .16); ctx.lineWidth = 1;
    for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 8, HZ); ctx.lineTo(W / 2 + i * 70, H); ctx.stroke(); }
    const refl = ctx.createLinearGradient(0, HZ, 0, HZ + 70);
    refl.addColorStop(0, hexA(theme, .16)); refl.addColorStop(1, hexA(theme, 0));
    ctx.fillStyle = refl; ctx.fillRect(0, HZ, W, 70);
    ctx.fillStyle = hexA(theme, .7); ctx.fillRect(0, HZ, W, 1);
    if (!G.state || G.state.opts.fx !== false) { // bloom, baked once: shrink, square to keep only the bright bits, add back soft
      const sm = document.createElement('canvas'); sm.width = Math.ceil(W / 6); sm.height = Math.ceil(H / 6);
      const s = sm.getContext('2d');
      s.drawImage(cv, 0, 0, sm.width, sm.height);
      s.globalCompositeOperation = 'multiply'; s.drawImage(sm, 0, 0);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .8; ctx.drawImage(sm, 0, 0, W, H); ctx.restore();
    }
    return B;
  }

  // bg: city | gutter | spire | core | indoor
  function battle(ctx, W, H, t, theme, bg) {
    const k = Math.min(2, pxs(ctx)), key = `${bg}|${theme}|${k}|${G.state && G.state.opts.fx !== false}`;
    let B = bakes.get(key);
    if (!B) { if (bakes.size > 6) bakes.clear(); B = bake(W, H, theme, bg, k); bakes.set(key, B); }
    ctx.drawImage(B.cv, 0, 0, W, H);
    if (bg === 'core') {
      const { cv, tw, th } = B.trails, f = Math.floor(t * 4);
      for (let col = 0; col < 26; col++) {
        const speed = 20 + hash(col, 1) * 60, off = (t * speed + hash(col, 2) * 400) % (H + 120);
        const v = Math.floor(hash(col, f) * 8);
        ctx.drawImage(cv, v * tw * B.k, 0, tw * B.k, th * B.k, col * 14, off - 60 - 7 * 11 - 9, tw, th);
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = hexA(i % 2 ? '#ff4fd8' : '#9b6bff', .35);
        ctx.beginPath(); ctx.ellipse(W / 2, 120, 60 + i * 38 + Math.sin(t + i) * 4, 18 + i * 10, t * .2 * (i % 2 ? 1 : -1), 0, TAU); ctx.stroke();
      }
    } else if (bg === 'spire' || bg === 'indoor') {
      ctx.fillStyle = hexA(theme, .7);
      const f = Math.floor(t * 3);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 14; j++) if (hash(i, j, f) > .7) ctx.fillRect(i * 46 + 10 + (j % 2) * 16, 16 + Math.floor(j / 2) * 18, 10, 2);
      if (bg === 'spire') { const a = (Math.sin(t * 4) + 1) / 2; ctx.fillStyle = `rgba(255,30,60,${.08 * a})`; ctx.fillRect(0, 0, W, H); }
    } else if (B.ads) {
      for (const b of B.beacons) { ctx.fillStyle = Math.sin(t * 3 + b.s) > 0 ? '#ff2846' : '#3a0a14'; ctx.fillRect(b.x, b.y, 3, 3); }
      if (Math.sin(t * 17) <= .96) { // the billboard's tube dies for a beat now and then
        const ad = B.ads[Math.floor(t / 6) % ADS.length];
        ctx.drawImage(ad.cv, 196 - ad.pad, 26 - ad.pad, ad.cv.width / B.k, ad.cv.height / B.k);
      }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(160,180,255,.05)';
      for (let i = 0; i < 2; i++) { // sweeping searchlights
        const a = Math.sin(t * .4 + i * 2) * .5 - Math.PI / 2, sx = 80 + i * 190;
        ctx.beginPath(); ctx.moveTo(sx, HZ); ctx.lineTo(sx + Math.cos(a - .06) * 300, HZ + Math.sin(a - .06) * 300); ctx.lineTo(sx + Math.cos(a + .06) * 300, HZ + Math.sin(a + .06) * 300); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // floor grid lines rolling toward the camera
    ctx.save();
    ctx.strokeStyle = hexA(theme, .16); ctx.lineWidth = 1;
    const off = (t * .4) % 1;
    for (let i = 0; i < 10; i++) {
      const q = (i + off) / 10, y = HZ + (H - HZ) * q * q;
      ctx.globalAlpha = .1 + .4 * q;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }

  return { build, underlay, overlay, rain, battle, cables, hash, T };
})();
