'use strict';
// Battle presentation: the battle screen, animation, menus, XP, capture and evolution scenes.
// The rules are in js/engine.js. Flow: run() plays the intro, then loops chooseAction ->
// Engine.step -> play(events) (-> forced switches) until the engine reports a result.

const Battle = (() => {
  const FOE = { x: 262, y: 128, size: 96, cx: 262, cy: 80 };
  const ME = { x: 94, y: 248, size: 118, cx: 94, cy: 190 };
  const HP_C = (r) => (r > .5 ? '#3dfc8f' : r > .2 ? '#ffc94d' : '#ff3d5a');
  const rand = Math.random; // visual jitter only; battle dice come from the engine's seed

  let B = null;      // active battle
  let scene = null;  // 'battle' | 'evolve'
  let E = null;      // evolution scene state
  let log = [];      // the last battle's engine events, for tests and replays

  const say = (text, auto = 1000) => UI.say(text, { auto });
  const sayWait = (text) => UI.say(text);

  // ---------- Rendering ----------
  // Glow (shadowBlur) is expensive to rasterize, so everything that glows but doesn't change shape
  // (platforms, HUD frames) is baked once per size, color and screen scale.
  const pxScale = (ctx) => Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  const arts = new Map();
  function art(key, w, h, k, draw) {
    let a = arts.get(key);
    if (!a) {
      if (arts.size > 40) arts.clear();
      const cv = document.createElement('canvas'), pad = 12;
      cv.width = Math.ceil((w + pad * 2) * k); cv.height = Math.ceil((h + pad * 2) * k);
      const c = cv.getContext('2d');
      c.scale(k, k); c.translate(pad, pad);
      draw(c, k);
      a = { cv, pad, w, h };
      arts.set(key, a);
    }
    return a;
  }
  const blit = (ctx, a, x, y) => ctx.drawImage(a.cv, x - a.pad, y - a.pad, a.w + a.pad * 2, a.h + a.pad * 2);

  function platform(ctx, x, y, rx, color) {
    const k = pxScale(ctx);
    blit(ctx, art(`plat|${rx}|${color}|${k}`, rx * 2, rx * .48, k, (c) => {
      c.beginPath(); c.ellipse(rx, rx * .24, rx, rx * .24, 0, 0, TAU);
      c.fillStyle = 'rgba(8,6,20,.85)'; c.fill();
      c.strokeStyle = color; c.lineWidth = 1.6; c.shadowColor = color; c.shadowBlur = 10 * k; c.stroke();
    }), x - rx, y - rx * .24);
  }

  // Visor frame: chamfered plate, glowing edge, scanlines, corner brackets and a tiny tag.
  function chamfer(c, w, h, n) {
    c.beginPath();
    c.moveTo(n, 0); c.lineTo(w, 0); c.lineTo(w, h - n); c.lineTo(w - n, h); c.lineTo(0, h); c.lineTo(0, n); c.closePath();
  }
  function frameArt(w, h, col, k, tag) {
    return art(`frame|${w}|${h}|${col}|${k}|${tag}`, w, h, k, (c) => {
      chamfer(c, w, h, 8);
      c.fillStyle = 'rgba(9,7,22,.9)'; c.fill();
      c.save(); c.clip();
      c.fillStyle = hexA(col, .05);
      for (let y = 0; y < h; y += 2) c.fillRect(0, y, w, 1);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hexA(col, .12)); g.addColorStop(.4, hexA(col, 0));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.restore();
      chamfer(c, w, h, 8);
      c.strokeStyle = col; c.lineWidth = 1.4; c.shadowColor = col; c.shadowBlur = 8 * k; c.stroke();
      c.shadowBlur = 0; c.lineWidth = 2;
      c.beginPath(); c.moveTo(w - 14, -3); c.lineTo(w + 3, -3); c.lineTo(w + 3, 10); c.stroke();  // corner brackets
      c.beginPath(); c.moveTo(-3, h - 10); c.lineTo(-3, h + 3); c.lineTo(10, h + 3); c.stroke();
      if (tag) {
        c.font = '700 6px "Chakra Petch", system-ui, sans-serif'; c.textBaseline = 'top';
        const tw = c.measureText(tag).width + 6;
        c.fillStyle = col; c.fillRect(w - 14 - tw, -3, tw, 7);
        c.fillStyle = '#07050f'; c.fillText(tag, w - 11 - tw, -2.5);
      }
    });
  }

  // Socket glyphs, 9x9: blade, shield, eye, chip.
  const SOCKET_ICON = {
    arms: (c) => { c.moveTo(1, 8); c.lineTo(8, 1); c.moveTo(2, 4.5); c.lineTo(4.5, 7); },
    frame: (c) => { c.moveTo(4.5, .5); c.lineTo(8.5, 2); c.lineTo(8, 6); c.lineTo(4.5, 8.5); c.lineTo(1, 6); c.lineTo(.5, 2); c.closePath(); },
    optics: (c) => { c.ellipse(4.5, 4.5, 4, 2.6, 0, 0, TAU); c.moveTo(6, 4.5); c.arc(4.5, 4.5, 1.5, 0, TAU); },
    core: (c) => { c.moveTo(4.5, .5); c.lineTo(8.5, 4.5); c.lineTo(4.5, 8.5); c.lineTo(.5, 4.5); c.closePath(); },
  };
  // The socket strip under a panel: one icon per socket, red and crossed out while breached, then
  // the RAM readout (or REDLINE) for your bot, or the foe's team pips.
  function sockets(ctx, x, y, mon, v, mine, now) {
    const hot = Mon.ram(mon) > Mon.maxRam(mon) + B.ramMod, k = pxScale(ctx);
    blit(ctx, frameArt(112, 13, hot ? '#ff3d5a' : mine ? '#18f0ff' : '#ff2e88', k, ''), x, y);
    ctx.save();
    ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    Object.keys(SLOTS).forEach((slot, i) => {
      const id = mon.mods && mon.mods[slot], ix = x + 7 + i * 13, iy = y + 2;
      const off = v.breach[slot];
      ctx.save(); ctx.translate(ix, iy);
      ctx.globalAlpha = off ? .55 + .45 * Math.sin(now / 90) : 1;
      ctx.strokeStyle = off ? '#ff3d5a' : id ? Chrome.color(id) : '#3a2f68';
      ctx.beginPath(); SOCKET_ICON[slot](ctx); ctx.stroke();
      if (off) { ctx.beginPath(); ctx.moveTo(-1, -1); ctx.lineTo(10, 10); ctx.moveTo(10, -1); ctx.lineTo(-1, 10); ctx.stroke(); }
      ctx.restore();
    });
    ctx.font = '700 8px "Chakra Petch", system-ui, sans-serif'; ctx.textBaseline = 'top';
    if (hot) {
      ctx.globalAlpha = .7 + .3 * Math.sin(now / 160);
      ctx.fillStyle = '#ff3d5a'; ctx.fillText('REDLINE', x + 60, y + 2.5);
    } else if (mine) {
      ctx.fillStyle = '#8fa3c7'; ctx.fillText(`RAM ${Mon.ram(mon)}/${Mon.maxRam(mon) + B.ramMod}`, x + 60, y + 2.5);
    } else if (B.trainer) {
      const left = B.team.filter((m) => m.hp > 0).length;
      for (let i = 0; i < B.team.length; i++) {
        ctx.fillStyle = i < left ? '#ff2e88' : 'rgba(255,46,136,.25)';
        ctx.beginPath(); ctx.arc(x + 64 + i * 9, y + 6.5, 3, 0, TAU); ctx.fill();
      }
    }
    ctx.restore();
  }

  // `v` is the side's view state: the HP, XP and status shown, which trail the rules while animating.
  function panel(ctx, x, y, w, h, mon, v, mine, now) {
    const col = mine ? '#18f0ff' : '#ff2e88';
    blit(ctx, frameArt(w, h, col, pxScale(ctx), mine ? 'LINK' : B.trainer ? 'TGT' : 'WILD'), x, y);
    ctx.save();
    ctx.fillStyle = '#f2ecff'; ctx.font = '700 13px Tektur, "Chakra Petch", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(Mon.name(mon), x + 9, y + 6);
    ctx.textAlign = 'right'; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    ctx.fillStyle = '#b9b0d8'; ctx.fillText('Lv' + mon.lvl, x + w - 8, y + 7);
    ctx.textAlign = 'left';
    let cx = x + 9;
    ctx.font = '700 8px "Chakra Petch", system-ui, sans-serif';
    for (const ty of SPECIES[mon.sp].t) {
      const tw = ctx.measureText(TYPES[ty].n.toUpperCase()).width + 8;
      ctx.fillStyle = hexA(TYPES[ty].c, .2); ctx.fillRect(cx, y + 22, tw, 10);
      ctx.fillStyle = TYPES[ty].c; ctx.fillText(TYPES[ty].n.toUpperCase(), cx + 4, y + 23.5);
      cx += tw + 3;
    }
    if (v.status) {
      const st = STATUS[v.status];
      ctx.fillStyle = st.c; ctx.fillRect(cx + 2, y + 22, 26, 10);
      ctx.fillStyle = '#0a0816'; ctx.fillText(st.tag, cx + 6, y + 23.5);
    }
    // HP with a ghost bar: the part just lost lingers pale, then drains away.
    const max = Mon.maxHp(mon), r = Math.max(0, v.hp / max), gr = Math.max(r, Math.min(1, v.ghost / max));
    const bx = x + 26, by = y + 36, bw = w - 36;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('HP', x + 9, by - 1);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(bx, by, bw, 5);
    ctx.fillStyle = 'rgba(255,236,236,.7)'; ctx.fillRect(bx + bw * r, by, bw * (gr - r), 5);
    ctx.fillStyle = HP_C(r); ctx.fillRect(bx, by, bw * r, 5);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(bx, by, bw * r, 1);
    if (!mine && !B.trainer) { // Resonance with a wild bot: how well a link would take
      ctx.fillStyle = '#c9a8ff'; ctx.fillText('RES', x + 9, by + 9);
      ctx.fillStyle = 'rgba(155,107,255,.18)'; ctx.fillRect(bx, by + 11, bw, 3);
      ctx.fillStyle = '#9b6bff'; ctx.fillRect(bx, by + 11, bw * B.v.res, 3);
    }
    if (mine) {
      ctx.textAlign = 'right'; ctx.fillStyle = '#e9e2ff'; ctx.font = '600 10px "Chakra Petch", system-ui, sans-serif';
      ctx.fillText(`${Math.ceil(v.hp)} / ${max}`, x + w - 8, by + 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(24,240,255,.12)'; ctx.fillRect(x + 9, y + h - 6, w - 20, 2.5);
      ctx.fillStyle = '#18f0ff'; ctx.fillRect(x + 9, y + h - 6, (w - 20) * v.xp, 2.5);
    }
    ctx.restore();
    sockets(ctx, x, y + h + 4, mon, v, mine, now);
  }

  function drawFx(ctx, f, now) {
    const p = Math.min(1, (now - f.t0) / f.dur);
    const { from, to, color } = f;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 12 * pxScale(ctx);
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    if (f.kind === 'bolt') {
      ctx.globalAlpha = rand() > .3 ? 1 : .4;
      ctx.beginPath(); ctx.moveTo(from.x, from.y);
      for (let i = 1; i <= 7; i++) {
        const k = i / 7;
        ctx.lineTo(from.x + (to.x - from.x) * k + (i < 7 ? (rand() - .5) * 26 : 0), from.y + (to.y - from.y) * k + (i < 7 ? (rand() - .5) * 26 : 0));
      }
      ctx.stroke();
    } else if (f.kind === 'orb') {
      for (let i = 0; i < 4; i++) {
        const q = Math.max(0, p - i * .06);
        ctx.globalAlpha = 1 - i * .22;
        ctx.beginPath(); ctx.arc(from.x + (to.x - from.x) * q, from.y + (to.y - from.y) * q - Math.sin(q * Math.PI) * 30, 9 - i * 2, 0, TAU); ctx.fill();
      }
    } else if (f.kind === 'drops' || f.kind === 'swarm') {
      const n = f.kind === 'drops' ? 7 : 16;
      for (let i = 0; i < n; i++) {
        const q = Math.max(0, Math.min(1, p * 1.6 - i / n * .6));
        if (q <= 0 || q >= 1) continue;
        const wob = f.kind === 'swarm' ? Math.sin(q * 12 + i) * 12 : 0;
        ctx.beginPath(); ctx.arc(from.x + (to.x - from.x) * q, from.y + (to.y - from.y) * q + wob, f.kind === 'drops' ? 4 : 2.2, 0, TAU); ctx.fill();
      }
    } else if (f.kind === 'slash') {
      for (let i = 0; i < 3; i++) {
        const q = Math.max(0, Math.min(1, p * 2 - i * .3));
        if (q <= 0) continue;
        ctx.globalAlpha = 1 - Math.max(0, q - .6) * 2.5;
        ctx.beginPath();
        ctx.arc(to.x - 20 + i * 14, to.y - 10 + i * 6, 26, -2.2, -2.2 + q * 2.2);
        ctx.stroke();
      }
    } else if (f.kind === 'glitch') {
      for (let i = 0; i < 9; i++) {
        ctx.globalAlpha = rand() * .9;
        ctx.fillRect(to.x + (rand() - .5) * 80, to.y + (rand() - .5) * 70, 6 + rand() * 22, 3 + rand() * 6);
      }
    } else if (f.kind === 'rings') {
      for (let i = 0; i < 3; i++) {
        const q = Math.max(0, p * 1.5 - i * .25);
        if (q <= 0 || q > 1) continue;
        ctx.globalAlpha = 1 - q;
        ctx.beginPath(); ctx.arc(to.x, to.y, 8 + q * 46, 0, TAU); ctx.stroke();
      }
    } else if (f.kind === 'impact') {
      ctx.globalAlpha = 1 - p;
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, r0 = 8 + p * 10, r1 = 20 + p * 26;
        ctx.beginPath(); ctx.moveTo(to.x + Math.cos(a) * r0, to.y + Math.sin(a) * r0); ctx.lineTo(to.x + Math.cos(a) * r1, to.y + Math.sin(a) * r1); ctx.stroke();
      }
    } else if (f.kind === 'buff' || f.kind === 'debuff') {
      const dir = f.kind === 'buff' ? -1 : 1;
      ctx.globalAlpha = 1 - p;
      for (let i = 0; i < 3; i++) {
        const y = to.y + dir * (p * 40 - 20) + i * 12 * -dir;
        ctx.beginPath(); ctx.moveTo(to.x - 14, y - dir * 6); ctx.lineTo(to.x, y + dir * 2); ctx.lineTo(to.x + 14, y - dir * 6); ctx.stroke();
      }
    } else if (f.kind === 'heal') {
      ctx.globalAlpha = 1 - p;
      for (let i = 0; i < 6; i++) {
        const x = to.x + Math.cos(i * 1.7) * 30, y = to.y + 30 - p * 60 - (i % 3) * 10;
        ctx.fillRect(x - 1.5, y - 5, 3, 10); ctx.fillRect(x - 5, y - 1.5, 10, 3);
      }
    }
    ctx.restore();
    return p >= 1;
  }

  // ---------- Bots ----------
  // Each side's bot is drawn once a frame into its own offscreen buffer. That one image is then
  // reused for the floor reflection, the rim light (a tinted silhouette peeking out behind it),
  // the low-HP pulse and the bot itself, so the expensive vector drawing happens once, not four times.
  function buffer(side, size, k) {
    let b = B.bufs[side];
    if (!b || b.size !== size || b.k !== k) {
      const w = Math.ceil(size * 2.1), h = Math.ceil(size * 1.7);
      const mk = (q) => { const c = document.createElement('canvas'); c.width = Math.ceil(w * k * q); c.height = Math.ceil(h * k * q); return c; };
      b = B.bufs[side] = { size, k, w, h, ax: w / 2, ay: size * 1.55, img: mk(1), tint: mk(.5) }; // the tint is soft anyway: half size
    }
    return b;
  }

  // Springs give hits weight: knockback (kx) and squash (sq) overshoot and settle.
  function springs(v, dt) {
    v.kvx += (-320 * v.kx - 18 * v.kvx) * dt; v.kx += v.kvx * dt;
    v.sqv += (-520 * v.sq - 20 * v.sqv) * dt; v.sq += v.sqv * dt;
    // ghost HP lingers for a moment after a hit, then drains to the real value
    if (v.ghost < v.hp || performance.now() - v.hitAt < 450) v.ghost = Math.max(v.ghost, v.hp);
    else v.ghost = Math.max(v.hp, v.ghost - Math.max(4, (v.ghost - v.hp) * 5) * dt);
  }

  function drawSide(ctx, side, base, flip, t, dt) {
    const s = B[side], v = s.v;
    springs(v, dt);
    if (!s.mon || !v.show) return;
    if (v.blink && Math.floor(performance.now() / 70) % 2) return;
    const k = Math.min(3, G.k), b = buffer(side, base.size, k);
    const ic = b.img.getContext('2d');
    ic.setTransform(1, 0, 0, 1, 0, 0); ic.clearRect(0, 0, b.img.width, b.img.height);
    ic.setTransform(k, 0, 0, k, 0, 0);
    Sprites.drawBot(ic, s.mon.sp, b.ax, b.ay, base.size, { t, flip, scale: v.scale, sil: v.sil, phase: flip ? 1.3 : 0, mods: s.mon.mods });
    // Below a quarter HP the bot is in distress: it trembles, sparks, and its rim light pulses red.
    const max = Mon.maxHp(s.mon), low = v.hp > 0 && v.hp / max < .25 && !v.sil;
    const pulse = low ? (Math.sin(t * 9) + 1) / 2 : 0;
    const rim = low ? mix(B.theme, '#ff2846', .5 + pulse * .5) : side === 'me' ? '#7ff8ff' : B.theme;
    const tc = b.tint.getContext('2d');
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.globalCompositeOperation = 'copy'; tc.drawImage(b.img, 0, 0, b.tint.width, b.tint.height);
    tc.globalCompositeOperation = 'source-in'; tc.fillStyle = rim; tc.fillRect(0, 0, b.tint.width, b.tint.height);
    const x = base.x + v.dx + v.kx + (low ? Math.sin(t * 47) * .7 : 0), y = base.y + v.dy;
    // mirror image on the wet floor
    ctx.save();
    ctx.translate(x, base.y + 2); ctx.scale(1, -.38);
    ctx.globalAlpha = v.alpha * .16;
    ctx.drawImage(b.img, -b.ax, -b.ay - v.dy, b.w, b.h);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y); ctx.scale(1 - v.sq * .5, 1 + v.sq);
    ctx.globalAlpha = v.alpha * (v.sil ? 0 : .85);
    ctx.drawImage(b.tint, -b.ax * 1.03, -b.ay * 1.03 - 1, b.w * 1.03, b.h * 1.03); // rim light: a soft halo, strongest up top
    ctx.globalAlpha = v.alpha;
    ctx.drawImage(b.img, -b.ax, -b.ay, b.w, b.h);
    if (low) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = v.alpha * .28 * pulse; ctx.drawImage(b.tint, -b.ax, -b.ay, b.w, b.h); }
    ctx.restore();
    if (low && Math.random() < dt * 7) spark(base, side);
  }

  // Sparks and smoke from a damaged bot. A small pool, drawn additively.
  function spark(base, side) {
    if (B.sparks.length > 40) return;
    const r = base.size * .35, smoke = Math.random() < .3;
    B.sparks.push({
      x: base.x + B[side].v.dx + (Math.random() - .5) * r * 1.6, y: base.y - base.size * (.35 + Math.random() * .5),
      vx: (Math.random() - .5) * 90, vy: smoke ? -18 : -60 - Math.random() * 80, life: 0, max: smoke ? 1.1 : .35 + Math.random() * .25, smoke,
    });
  }
  function drawSparks(ctx, dt) {
    ctx.save();
    for (let i = B.sparks.length - 1; i >= 0; i--) {
      const p = B.sparks[i];
      p.life += dt;
      if (p.life >= p.max) { B.sparks.splice(i, 1); continue; }
      const q = p.life / p.max;
      if (p.smoke) {
        p.x += p.vx * .2 * dt; p.y += p.vy * dt;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(40,38,52,${.4 * (1 - q)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 + q * 9, 0, TAU); ctx.fill();
      } else {
        p.vy += 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(255,${200 - q * 120},90,${1 - q})`; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .03, p.y - p.vy * .03); ctx.stroke();
      }
    }
    ctx.restore();
  }

  // Target brackets around the foe: the visor locking on.
  function reticle(ctx, t) {
    const x = FOE.x + B.v.slideF + B.foe.v.dx + B.foe.v.kx, y = FOE.y - 44, s = 44 + Math.sin(t * 2.2) * 2, n = 9;
    ctx.save();
    ctx.strokeStyle = hexA('#ff2e88', .55); ctx.lineWidth = 1.2;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * s, cy = y + sy * s;
      ctx.beginPath(); ctx.moveTo(cx - sx * n, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy - sy * n); ctx.stroke();
    }
    ctx.restore();
  }

  function render(ctx, W, H, t) {
    if (scene === 'evolve') return renderEvolve(ctx, W, H, t);
    if (!B) return;
    const v = B.v, now = performance.now(), dt = Math.min(.033, (now - (B.lastFrame || now)) / 1000);
    B.lastFrame = now;
    ctx.save();
    if (v.shake > .2) { ctx.translate((rand() - .5) * v.shake, (rand() - .5) * v.shake); v.shake *= .86; }
    Scene.battle(ctx, W, H, t, B.theme, B.bg);
    platform(ctx, FOE.x + v.slideF, FOE.y, 62, '#ff2e88');
    platform(ctx, ME.x + v.slideM, ME.y, 72, '#18f0ff');
    if (v.trainerA > 0 && B.trainer) {
      ctx.save(); ctx.globalAlpha = v.trainerA;
      if (B.trainer.look.sheet) { ctx.translate(FOE.x + v.trainerX - 24, FOE.y - 40); ctx.scale(1.5, 1.5); } // 32x64 pixel sprite
      else { ctx.translate(FOE.x + v.trainerX - 48, FOE.y - 96); ctx.scale(3, 3); }
      Sprites.drawPerson(ctx, 0, 0, 'down', B.trainer.look, 0, t);
      ctx.restore();
    }
    if (v.heroA > 0) {
      ctx.save(); ctx.globalAlpha = v.heroA;
      if (LOOK.hero.sheet) { ctx.translate(ME.x + v.heroX - 32, ME.y - 56); ctx.scale(2, 2); }
      else { ctx.translate(ME.x + v.heroX - 60, ME.y - 112); ctx.scale(3.6, 3.6); }
      Sprites.drawPerson(ctx, 0, 0, 'up', LOOK.hero, 0, t);
      ctx.restore();
    }
    drawSide(ctx, 'foe', { ...FOE, x: FOE.x + v.slideF }, false, t, dt);
    drawSide(ctx, 'me', { ...ME, x: ME.x + v.slideM }, true, t, dt);
    drawSparks(ctx, dt);
    if (v.core) Sprites.drawCore(ctx, v.core.x, v.core.y, 7, v.core.color || '#18f0ff');
    if (B.rain) Scene.rain(ctx, W, H, t, B.rain * .8);
    v.fx = v.fx.filter((f) => { const done = drawFx(ctx, f, now); if (done) f.res(); return !done; });
    if (v.panels) {
      if (B.foe.mon && B.foe.v.show) reticle(ctx, t);
      if (B.foe.mon) panel(ctx, 10, 12, 176, B.trainer ? 46 : 56, B.foe.mon, B.foe.v, false, now);
      if (B.me.mon) panel(ctx, 168, 198, 176, 60, B.me.mon, B.me.v, true, now);
    }
    if (v.wait) { // link battle: the other phone is still choosing
      ctx.globalAlpha = .75 + .25 * Math.sin(t * 4);
      ctx.fillStyle = 'rgba(9,7,22,.9)'; ctx.fillRect(W / 2 - 80, 168, 160, 18);
      ctx.fillStyle = '#18f0ff'; ctx.font = '700 9px "Chakra Petch", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`WAITING FOR ${v.wait}...`, W / 2, 177);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
    ctx.restore();
    if (v.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${v.flash})`; ctx.fillRect(0, 0, W, H); }
  }

  function fx(kind, color, from, to, dur) {
    return new Promise((res) => B.v.fx.push({ kind, color, from, to, dur, t0: performance.now(), res }));
  }

  // ---------- Presenter helpers ----------
  // Rules live in js/engine.js. This half turns the player's taps into engine actions, plays the
  // engine's event log as animation and text, and applies what a battle means outside itself:
  // XP, new moves, dex entries, linked bots, eddies and chrome drops.
  const other = (side) => (side === 'me' ? 'foe' : 'me');
  const label = (side) => (side === 'foe' ? (B.trainer ? 'Foe ' : 'Wild ') : '') + Mon.name(B[side].mon);
  const center = (side) => (side === 'me' ? { x: ME.cx + B.v.slideM, y: ME.cy } : { x: FOE.cx + B.v.slideF, y: FOE.cy });

  function newSide(mon) {
    const hp = mon ? mon.hp : 0;
    return { mon, v: { show: false, dx: 0, dy: 0, alpha: 1, scale: 1, sil: null, blink: false, hp, ghost: hp, hitAt: 0, kx: 0, kvx: 0, sq: 0, sqv: 0, breach: {}, status: mon ? mon.status : null, xp: mon ? Mon.xpProgress(mon) : 0 } };
  }

  async function blink(side) {
    B[side].v.blink = true;
    await wait(380);
    B[side].v.blink = false;
  }

  // `e` is the engine's send event: HP and status as they were at that moment, since later events
  // in the same turn may already have changed the bot.
  async function sendOut(e) {
    const { side, text: line } = e, mon = B.st.sides[e.cside || side].team[e.index];
    if (side === 'me' && B.v.heroA > 0) { await tween(B.v, 'heroX', -160, 350); B.v.heroA = 0; }
    B[side] = newSide(mon);
    const s = B[side];
    s.v.hp = s.v.ghost = e.hp; s.v.status = e.status;
    if (side === 'foe') seen(mon.sp);
    if (line) await say(line, 650);
    Sound.play('throw');
    const c = center(side);
    B.v.core = { x: c.x, y: c.y + 30, color: side === 'me' ? '#18f0ff' : '#ff2e88' };
    await wait(240);
    B.v.core = null;
    s.v.show = true; s.v.scale = .1; s.v.sil = '#ffffff';
    await tween(s.v, 'scale', 1, 260);
    s.v.sil = null;
  }

  async function shutDown(side) {
    const s = B[side];
    Sound.play('faint');
    Post.kick('tear', .7, 260);
    await Promise.all([tween(s.v, 'dy', 40, 420), tween(s.v, 'alpha', 0, 420)]);
    s.v.show = false;
    await sayWait(`${label(side)} shut down!`);
  }

  function seen(sp) { if (!B.standIn) G.state.dex.seen[sp] = 1; } // Deep Net daemons and link copies aren't dex entries

  const FX_KIND = { VOLT: 'bolt', PLASMA: 'orb', HYDRO: 'drops', NANO: 'swarm', STEEL: 'impact', AERO: 'slash', VIRUS: 'glitch', PSI: 'rings', VOID: 'slash', NONE: 'impact' };

  async function anim(e) {
    const side = e.side, s = B[side];
    if (e.kind === 'hit') {
      const t = MOVES[e.move].t, dir = side === 'me' ? 1 : -1;
      await tween(s.v, 'dx', 16 * dir, 110);
      tween(s.v, 'dx', 0, 160).then(() => { s.v.kvx -= 110 * dir; }); // settle with a little recoil
      return fx(FX_KIND[t], TYPES[t].c, center(side), center(other(side)), t === 'STEEL' || t === 'NONE' ? 220 : 380);
    }
    if (e.kind === 'status') { const t = MOVES[e.move].t; return fx(FX_KIND[t], TYPES[t].c, center(side), center(other(side)), 380); }
    if (e.kind === 'heal') { Sound.play('heal'); return fx('heal', '#3dfc8f', center(side), center(side), 600); }
    if (e.kind === 'buff' || e.kind === 'debuff') {
      Sound.play(e.kind);
      return fx(e.kind, e.kind === 'buff' ? '#18f0ff' : '#ff3d5a', center(side), center(side), 520);
    }
    if (e.kind === 'salvo') return fx('orb', '#ffb52e', center(side), center(other(side)), 360);
    if (e.kind === 'dodge') { s.v.alpha = .25; wait(900).then(() => tween(s.v, 'alpha', 1, 250)); }
  }

  // Plays one engine event. Returns when its animation and text are done.
  async function show(e) {
    const s = B[e.side];
    switch (e.type) {
      case 'msg':
        if (e.sfx) Sound.play(e.sfx);
        await (e.auto ? say(e.text, e.auto) : sayWait(e.text));
        if (e.env) await Tutorial.tip('arena');
        return;
      case 'anim': return anim(e);
      case 'hp': {
        if (e.sfx) Sound.play(e.sfx);
        if (e.shake) B.v.shake = e.shake;
        const lost = s.v.hp - e.hp;
        if (lost > 0) { // knocked back away from the other side, squashed in proportion to the hit
          const frac = lost / Mon.maxHp(s.mon);
          s.v.hitAt = performance.now();
          s.v.kvx += (e.side === 'me' ? -1 : 1) * (140 + 520 * frac);
          s.v.sqv -= 2.5 + 7 * frac;
          if (e.sfx === 'crit') Post.kick('split', .8 + frac, 240);
        }
        // Damage snaps down fast (the ghost bar shows what was lost); healing fills slowly.
        await Promise.all([e.blink && blink(e.side), tween(s.v, 'hp', e.hp, lost > 0 ? 220 : 450 + Math.abs(lost) * 8)]);
        return;
      }
      case 'status': s.v.status = e.status; return;
      case 'res': return tween(B.v, 'res', e.value, 300);
      case 'breach':
        if (e.turns) { s.v.breach[e.slot] = true; Tutorial.later('breach'); Post.kick('tear', 1, 320); B.v.shake = Math.max(B.v.shake, 5); }
        else delete s.v.breach[e.slot];
        return;
      case 'faint':
        await shutDown(e.side);
        if (e.side === 'foe' && !B.standIn) await awardXp(s.mon, e.participants);
        return;
      case 'recall': return tween(s.v, 'alpha', 0, 220);
      case 'send': return sendOut(e);
      case 'capture': return captureAnim(e.shakes);
      default: return; // 'end': finish() takes it from here
    }
  }
  // In a link battle the engine's sides are canonical (host = 'me'); the guest sees them flipped so
  // their own bots are always in front. `cside` keeps the canonical side for team lookups.
  const toView = (s) => (!B.link || B.link.local === 'me' ? s : s === 'me' ? 'foe' : 'me');
  async function play(events) { for (const e of events) await show(B.link && e.side ? { ...e, cside: e.side, side: toView(e.side) } : e); }

  // ---------- Player decisions ----------
  // Resolves to an engine action. Bag items are spent here, at the moment you commit to them.
  async function chooseAction() {
    const mon = B.me.mon;
    await Tutorial.tip('battle');
    for (;;) {
      const c = await UI.menu({
        where: 'dock', layout: 'grid', title: `What will ${Mon.name(mon)} do?`,
        items: [
          { label: 'Fight', value: 'fight', color: '#ff2e88' },
          { label: 'Bag', value: 'bag', color: '#ffe14d' },
          { label: 'Bots', value: 'bots', color: '#2ee6a0' },
          { label: 'Run', value: 'run', color: '#18f0ff' },
        ],
        start: B.lastCmd || 0,
      });
      B.lastCmd = ['fight', 'bag', 'bots', 'run'].indexOf(c);
      if (c === 'fight') {
        if (!mon.moves.some((m) => m.pp > 0)) { await say(`${Mon.name(mon)} has no energy left for moves!`); return { type: 'move', moveIndex: null }; }
        const s = await UI.menu({
          where: 'dock', layout: 'grid', cancel: true, title: 'Choose a move',
          items: mon.moves.map((m, i) => {
            const mv = MOVES[m.id];
            return { label: mv.n, sub: `${TYPES[mv.t].n.toUpperCase()} · ${m.pp}/${mv.pp}`, value: i, color: TYPES[mv.t].c, disabled: m.pp <= 0 };
          }),
        });
        if (s !== null) return { type: 'move', moveIndex: s };
      } else if (c === 'bag') {
        if (B.deepnet) { await sayWait('The Deep Net strips your items at the door. Only the crew comes in.'); continue; }
        if (B.link) { await sayWait('No items in link battles. Just you, your bots and your read on the other Linker.'); continue; }
        const r = await Menus.bag({ battle: true });
        if (!r) continue;
        const ball = ITEMS[r.id].kind === 'ball';
        if (ball && B.trainer) { await sayWait('You can\'t link with another Linker\'s bot!'); continue; }
        G.state.bag[r.id]--;
        return ball ? { type: 'link', id: r.id } : { type: 'item', id: r.id, target: r.target };
      } else if (c === 'bots') {
        const i = await Menus.party({ battle: true, active: G.state.party.indexOf(mon) });
        if (i !== null) return { type: 'switch', index: i };
      } else if (c === 'run') {
        if (B.link) {
          if (await UI.ask('Forfeit the link battle? It counts as a loss.', ['Forfeit', 'Keep fighting']) === 0) return { type: 'forfeit' };
          continue;
        }
        if (B.deepnet) {
          if (await UI.ask('Jack out of the Deep Net? The run ends here, and you keep what you\'ve earned.', ['Jack out', 'Keep fighting']) === 0) return { type: 'jackout' };
          continue;
        }
        if (B.trainer) { await sayWait('No running from a Linker battle!'); continue; }
        return { type: 'run' };
      }
    }
  }

  // The engine already rolled the shakes; this is the throw, the wobble and the verdict.
  async function captureAnim(shakes) {
    const v = B.v, f = B.foe;
    Sound.play('throw');
    v.core = { x: 40, y: 300, color: '#18f0ff' };
    const c = center('foe');
    await Promise.all([tween(v.core, 'x', c.x, 500, (k) => k), tween(v.core, 'y', c.y - 10, 500)]);
    f.v.sil = '#18f0ff';
    await tween(f.v, 'scale', 0, 260);
    f.v.show = false;
    await tween(v.core, 'y', FOE.y - 6, 300, (k) => k * k);
    for (let i = 0; i < Math.min(3, shakes); i++) {
      await wait(380);
      Sound.play('shake');
      await tween(v.core, 'x', c.x - 5, 80); await tween(v.core, 'x', c.x + 5, 120); await tween(v.core, 'x', c.x, 80);
    }
    await wait(420);
    if (shakes === 4) {
      const m = f.mon;
      Sound.play('caught');
      v.core.color = '#ffe14d';
      await sayWait(`Linked! ${Mon.name(m)} is now part of your crew!`);
      G.state.dex.caught[m.sp] = 1;
      m.status = m.status === 'slp' ? null : m.status;
      if (G.state.party.length < 6) G.state.party.push(m);
      else { G.state.box.push(m); await sayWait(`Your party is full. ${Mon.name(m)} was uploaded to the Cloud Box.`); }
      v.core = null;
      return;
    }
    v.core = null;
    f.v.show = true; f.v.sil = '#ffffff';
    await tween(f.v, 'scale', 1, 200);
    f.v.sil = null;
    await sayWait(['Oh no! It broke the link instantly!', 'Argh! It almost synced!', 'So close! The link nearly held!', 'Gah! One more second!'][shakes]);
  }

  // ---------- XP and learning ----------
  async function learnMove(m, id, inBattle) {
    if (m.moves.some((x) => x.id === id)) return;
    const mv = MOVES[id];
    if (m.moves.length < 4) {
      m.moves.push({ id, pp: mv.pp });
      Sound.play('levelup');
      await sayWait(`${Mon.name(m)} learned ${mv.n.toUpperCase()}!`);
      return;
    }
    const yes = await UI.ask(`${Mon.name(m)} wants to learn ${mv.n.toUpperCase()}, but it already knows four moves.\nForget a move to make room?`, ['Yes', 'No']);
    if (yes === 0) {
      const slot = await UI.menu({
        where: inBattle ? 'dock' : 'layer', layout: inBattle ? 'grid' : 'side', cancel: true, title: 'Forget which move?',
        items: m.moves.map((x, i) => ({ label: MOVES[x.id].n, sub: `${TYPES[MOVES[x.id].t].n.toUpperCase()} · PWR ${MOVES[x.id].p || '-'}`, value: i, color: TYPES[MOVES[x.id].t].c })),
      });
      if (slot !== null) {
        const old = MOVES[m.moves[slot].id].n.toUpperCase();
        m.moves[slot] = { id, pp: mv.pp };
        Sound.play('levelup');
        await sayWait(`Wiped! ${Mon.name(m)} forgot ${old}...\nand learned ${mv.n.toUpperCase()}!`);
        return;
      }
    }
    await sayWait(`${Mon.name(m)} did not learn ${mv.n.toUpperCase()}.`);
  }

  async function awardXp(foeMon, participants) {
    const alive = participants.map((i) => B.st.sides.me.team[i]).filter((m) => m.hp > 0 && G.state.party.includes(m));
    if (!alive.length) return;
    const total = Math.floor(SPECIES[foeMon.sp].xp * foeMon.lvl / 7 * (B.trainer ? 1.5 : 1));
    const each = Math.max(1, Math.floor(total / alive.length));
    for (const m of alive) {
      await say(`${Mon.name(m)} gained ${each} XP!`, 800);
      const levels = Mon.addXp(m, each);
      if (m === B.me.mon) {
        if (levels.length) { await tween(B.me.v, 'xp', 1, 400); B.me.v.xp = 0; }
        await tween(B.me.v, 'xp', Mon.xpProgress(m), 400);
      }
      for (const lv of levels) {
        if (m === B.me.mon) B.me.v.hp = m.hp;
        Sound.play('levelup');
        await sayWait(`${Mon.name(m)} upgraded to Lv ${lv}!`);
        for (const id of Mon.newMoves(m, lv)) await learnMove(m, id, true);
        await Tutorial.tip('level');
      }
    }
  }

  // ---------- Main flow ----------
  // opts: { wild: mon } | { trainer: { name, look, team, money } }, plus theme, tier, drops, bg,
  // rain, music, env. The seed is the only randomness the rules ever see.
  // The arena (Engine.ENV) comes from the map: its `env`, or a Downpour on heavily rained maps.
  const arenaOf = (map) => (map ? map.env || (map.rain >= .8 ? 'rain' : null) : null); // Route 1 stays calm for the tutorial
  async function run(opts) {
    const L = opts.link || null; // { conn, local, seed, teams, names } from Link.fight
    const trainer = opts.trainer || null, team = trainer ? trainer.team : [opts.wild];
    const env = L ? null : opts.env !== undefined ? opts.env : arenaOf(World.map);
    const st = L
      ? Engine.create({ seed: L.seed, me: { team: L.teams.me }, foe: { team: L.teams.foe, trainer: L.names.foe }, names: L.names })
      : Engine.create({ seed: Math.floor(Math.random() * 2 ** 31), me: { team: G.state.party }, foe: { team, trainer: trainer && trainer.name }, env });
    if (G.state.party.some((m) => Mon.ram(m) > Mon.maxRam(m) + ((env && Engine.ENV[env].ram) || 0))) Tutorial.later('redline');
    B = {
      st, trainer, team, deepnet: !!opts.deepnet, link: L, standIn: !!(opts.deepnet || L), ramMod: (env && Engine.ENV[env].ram) || 0, theme: opts.theme || '#ff2e88', tier: opts.tier || 0, drops: opts.drops || null, bg: opts.bg || 'city', rain: opts.rain || 0,
      bufs: {}, sparks: [],
      v: { fx: [], shake: 0, flash: 0, core: null, res: 0, panels: false, slideF: 220, slideM: -220, trainerA: 0, trainerX: 0, heroA: 1, heroX: 0 },
      me: newSide(null), foe: newSide(null),
    };
    log = [];
    scene = 'battle';
    Sound.music(opts.music || (trainer ? 'gym' : 'battle'));
    const v = B.v;
    if (trainer) {
      v.trainerA = 1;
      await Promise.all([tween(v, 'slideF', 0, 600), tween(v, 'slideM', 0, 600)]);
      await sayWait(`${trainer.name} wants to battle!`);
      if (trainer.name !== 'JAX' && !opts.deepnet && !L) await Tutorial.tip('trainer');
      await tween(v, 'trainerX', 140, 350);
      v.trainerA = 0;
    } else {
      B.foe = newSide(team[0]);
      B.foe.v.show = true;
      seen(team[0].sp);
      await Promise.all([tween(v, 'slideF', 0, 600), tween(v, 'slideM', 0, 600)]);
      await sayWait(`A wild ${Mon.name(team[0])} glitched into view!`);
      await Tutorial.tip('wild');
    }
    const playLogged = (out) => { log.push(...out.events); return play(out.events); };
    await playLogged(Engine.start(st));
    v.panels = true;

    if (L) return finish(await linkTurns(st, playLogged));
    let out = { result: null, need: [] };
    while (!out.result) {
      const act = await chooseAction();
      if (act.type === 'jackout') { out = { result: 'jackout', need: [] }; break; }
      out = Engine.step(st, { me: act, foe: Engine.ai(st, 'foe') });
      await playLogged(out);
      for (const side of out.need) {
        let i = Engine.firstAlive(st, side);
        if (side === 'me') {
          await sayWait('Choose your next bot.');
          i = await Menus.party({ battle: true, forced: true, active: G.state.party.indexOf(B.me.mon) });
        }
        await playLogged(Engine.replace(st, side, i));
      }
    }
    return finish(out.result);
  }

  // Lockstep turns. Both games step the same canonical battle with both players' picks; each pick
  // travels with a hash of the sender's state, and any mismatch or impossible pick ends the battle
  // as a desync. Returns the result from this player's side.
  async function linkTurns(st, playLogged) {
    const { conn, local } = B.link, remote = local === 'me' ? 'foe' : 'me';
    const wait = async (want) => { B.v.wait = B.trainer.name; try { return await conn.next(want); } finally { B.v.wait = null; } };
    try {
      for (;;) {
        const act = await chooseAction();
        if (act.type === 'forfeit') { conn.send({ t: 'forfeit' }); return 'forfeit'; }
        const turn = st.turn + 1, h = Link.hash(st);
        conn.send({ t: 'act', turn, act, h });
        const m = await wait((x) => (x.t === 'act' && x.turn === turn) || x.t === 'forfeit');
        if (m.t === 'forfeit') return 'their-forfeit';
        if (m.h !== h || !Link.legal(st, remote, m.act)) return 'desync';
        const out = Engine.step(st, { [local]: act, [remote]: m.act });
        await playLogged(out);
        if (out.result) return (out.result === 'win') === (local === 'me') ? 'win' : 'lose';
        const picks = {};
        if (out.need.includes(local)) {
          await sayWait('Choose your next bot.');
          picks[local] = await Menus.party({ battle: true, forced: true, active: G.state.party.indexOf(B.me.mon) });
          conn.send({ t: 'rep', turn, i: picks[local] });
        }
        if (out.need.includes(remote)) {
          const r = await wait((x) => (x.t === 'rep' && x.turn === turn) || x.t === 'forfeit');
          if (r.t === 'forfeit') return 'their-forfeit';
          if (!Link.legalReplace(st, remote, r.i)) return 'desync';
          picks[remote] = r.i;
        }
        for (const side of out.need) await playLogged(Engine.replace(st, side, picks[side]));
      }
    } catch (e) {
      return 'dropped';
    }
  }

  async function finish(result) {
    const v = B.v;
    if (B.link) {
      const n = B.trainer.name, won = result === 'win' || result === 'their-forfeit';
      Sound.music(null);
      Sound.play(won ? 'victory' : 'door');
      await sayWait({
        win: `You beat ${n} in a link battle!`, lose: `${n} won the link battle. GG.`,
        forfeit: 'You forfeited. It counts as a loss.', 'their-forfeit': `${n} forfeited. You win!`,
        desync: 'The two games stopped agreeing on what happened (a desync). No result recorded.',
        dropped: 'The link dropped. No result recorded.',
      }[result]);
      B = null; scene = null; UI.hideDialog();
      return won ? 'win' : result === 'lose' || result === 'forfeit' ? 'lose' : 'void';
    }
    if (result === 'win' && B.trainer) {
      Sound.music(null);
      Sound.play('victory');
      v.trainerA = 1; v.trainerX = 140;
      await tween(v, 'trainerX', 0, 400);
      await sayWait(`You defeated ${B.trainer.name}!`);
      if (B.trainer.money) {
        G.state.money += B.trainer.money;
        Sound.play('coin');
        await sayWait(`You earned ${B.trainer.money} eddies for winning.`);
      }
    }
    if (result === 'win' && B.trainer && !B.standIn) {
      // Chromed bots leave Salvage behind: one per module they were running.
      const scrap = B.team.reduce((n, m) => n + Object.values(m.mods || {}).filter(Boolean).length, 0);
      if (scrap) {
        G.state.salvage += scrap;
        Sound.play('coin');
        await sayWait(`You stripped ${scrap} Salvage from the wrecked chrome.`);
        Tutorial.later('salvage');
      }
    }
    if (result === 'win' && !B.standIn) {
      const drops = B.drops ? [...B.drops] : rand() < (B.trainer ? .2 : .06) ? [Chrome.roll(B.tier)] : [];
      for (const id of drops) {
        Chrome.give(id);
        Sound.play('caught');
        await sayWait(`${B.trainer ? 'Salvaged from the wreckage' : 'The wild bot dropped some chrome'}: ${MODS[id].n.toUpperCase()} (${RARITY[MODS[id].r].n})!`);
      }
    } else if (result === 'lose' && !B.standIn) {
      Sound.music(null);
      await sayWait('You have no functional bots left!');
      if (B.trainer && B.trainer.money) {
        const lost = Math.floor(G.state.money / 2);
        G.state.money -= lost;
        await sayWait(`You paid out ${lost} eddies to get patched up...`);
      }
    }
    // clear battle-only state
    G.state.party.forEach((m) => { if (m.status === 'slp' && m.hp <= 0) m.status = null; });
    const out = result;
    B = null;
    scene = null;
    UI.hideDialog();
    return out;
  }

  // ---------- Evolution ----------
  function renderEvolve(ctx, W, H, t) {
    Scene.battle(ctx, W, H, t * .4, '#9b6bff', 'core');
    const { from, to, p } = E;
    platform(ctx, W / 2, 238, 80, '#9b6bff');
    // alternate silhouettes faster as progress rises
    let id = from;
    if (p > 0 && p < 1) id = Math.sin(Math.pow(p * 10, 1.6) * 2) > 0 ? from : to;
    else if (p >= 1) id = to;
    Sprites.drawBot(ctx, id, W / 2, 238, 140, { t, sil: p > 0 && p < 1 ? '#ffffff' : null });
    for (let i = 0; i < 24 * Math.min(1, p * 1.5); i++) {
      const a = i * 2.39 + t, r = 40 + ((t * 60 + i * 17) % 120);
      ctx.fillStyle = hexA('#9b6bff', 1 - r / 160);
      ctx.fillRect(W / 2 + Math.cos(a) * r, 170 + Math.sin(a) * r * .6, 3, 3);
    }
    if (E.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${E.flash})`; ctx.fillRect(0, 0, W, H); }
  }

  async function evolve(m, to) {
    scene = 'evolve';
    E = { from: m.sp, to, p: 0, flash: 0 };
    Sound.music(null);
    await sayWait(`What? ${Mon.name(m)} is evolving!`);
    Sound.play('evolve');
    await tween(E, 'p', .999, 3600, (k) => k);
    E.flash = 1;
    E.p = 1;
    tween(E, 'flash', 0, 700);
    const old = Mon.name(m), before = Mon.maxHp(m);
    m.sp = to;
    m.hp += Mon.maxHp(m) - before;
    G.state.dex.seen[to] = 1; G.state.dex.caught[to] = 1;
    Sound.play('caught');
    await sayWait(`Upgrade complete! ${old} evolved into ${Mon.name(m)}!`);
    scene = null; E = null;
  }

  return { run, render, evolve, learnMove, get active() { return scene !== null; }, get log() { return log; },
    get view() { return B && { me: B.me.v, foe: B.foe.v, sparks: B.sparks.length } } }; // view state, for tests
})();
