'use strict';
// Game state, transitions, title screen and the main loop.

const W = 352, H = 384;

const G = {
  state: null, mode: 'title', locked: 0, perf: { ms: new Float32Array(240), i: 0, sync: false }, fade: 0, wipe: null, k: 1, textSpeed: 55, saved: null,

  newState() {
    return {
      v: SAVE_VERSION, name: 'NOVA', map: 'home', x: 3, y: 3, dir: 'down', money: 3000,
      party: [], box: [], bag: { patch: 3 }, mods: {}, salvage: 0, deepnet: { best: 0, runs: 0, top: [] }, link: { wins: 0, losses: 0 }, flags: {}, dex: { seen: {}, caught: {} },
      starter: null, rivalStarter: null, repel: 0, time: 0,
      back: { map: 'lowtown', x: 5, y: 6, dir: 'down' },
      lastCenter: { map: 'home', x: 3, y: 3, dir: 'down', back: { map: 'lowtown', x: 5, y: 6, dir: 'down' } },
      opts: { ...Save.OPTS },
    };
  },

  applyOpts() {
    const o = G.state.opts;
    Sound.setOpt('sfx', o.sfx);
    Sound.setOpt('music', o.music);
    G.textSpeed = o.fast ? 120 : 55;
    G.speed = o.speed || 1;
    Sound.setVolume(o.music === false ? 0 : o.musicVol ?? .7, o.sfx === false ? 0 : o.sfxVol ?? 1);
    Sound.setOpt('ambience', o.ambience !== false);
    $('#screen').style.setProperty('--ts', { small: .88, normal: 1, large: 1.15, huge: 1.3 }[o.textSize || 'normal']);
    $('#screen').classList.toggle('fx', o.fx !== false);
    if (G.fxBaked !== undefined && G.fxBaked !== (o.fx !== false)) World.invalidate(); // bloom is baked into map lighting
    G.fxBaked = o.fx !== false;
  },

  // Deep Net runs and link battles lend the player a stand-in team. While one is out, saves and
  // snapshots still hold the real party, so a crash or reload can never keep the stand-ins.
  realParty: null,
  borrowParty(team) { G.realParty = G.state.party; G.state.party = team; },
  returnParty() { if (G.realParty) G.state.party = G.realParty; G.realParty = null; },
  saveable() { return G.realParty ? { ...G.state, party: G.realParty } : G.state; },

  async save(force = true) {
    if (!G.state || G.mode === 'title') return;
    G.state.savedAt = Date.now();
    await Store.save(G.saveable(), force);
  },
  autosave() { if (G.state && G.state.opts.autosave !== false) G.save(false); },

  async run(fn) {
    G.locked++;
    // Tips queued during a scene (a chrome drop mid-battle, say) play once it ends.
    try { await fn(); await Tutorial.flush(); } catch (e) { console.error(e); } finally { G.locked--; }
  },

  fadeTo(to, ms) { return tween(G, 'fade', to, ms, (k) => k); },
  fadeOut(ms = 200) { return G.fadeTo(1, ms); },
  fadeIn(ms = 200) { return G.fadeTo(0, ms); },

  async glitchWipe() {
    G.wipe = { t0: performance.now(), dur: 750 };
    Post.kick('both', 1.2, 520);
    await wait(750);
    G.wipe = null;
    G.fade = 1;
  },

  async battle(opts) {
    Input.clear();
    Sound.music(null);
    Sound.duck(true);
    Sound.play('encounter');
    await G.glitchWipe();
    G.mode = 'battle';
    const pending = Battle.run(opts).catch((e) => { console.error(e); return 'run'; }); // never strand the player mid-battle
    await G.fadeIn(250);
    const res = await pending;
    await G.fadeOut(250);
    UI.hideDialog();
    // A double KO is a win that leaves you with no bots standing: collect, then black out.
    const wiped = !opts.link && !G.state.party.some((m) => m.hp > 0);
    if ((res === 'lose' || (res === 'win' && wiped)) && !opts.noBlackout) { await G.blackout(); return res; }
    const standIn = opts.deepnet || opts.link; // borrowed teams: no healing, evolving or autosaving
    if (res === 'lose' && !standIn) G.state.party.forEach(Mon.heal);
    for (const m of standIn ? [] : G.state.party) {
      const to = res !== 'lose' && Mon.canEvolve(m);
      if (!to) continue;
      const evo = Battle.evolve(m, to);
      await G.fadeIn(250);
      await evo;
      await G.fadeOut(250);
    }
    G.mode = 'world';
    Sound.music(World.map.music);
    Sound.duck(false);
    if (!standIn) G.autosave();
    await G.fadeIn(250);
    return res;
  },

  async blackout() {
    const s = G.state;
    const c = s.lastCenter;
    s.back = { ...c.back };
    s.party.forEach(Mon.heal);
    G.mode = 'world';
    Sound.duck(false);
    World.load(c.map, c.x, c.y, c.dir);
    await G.fadeIn(400);
    await UI.say('You scrambled back to safety and your bots were recharged.');
    G.autosave();
  },

  async enterWorld() {
    const s = G.state;
    G.applyOpts();
    G.mode = 'world';
    World.load(s.map, s.x, s.y, s.dir);
    await G.fadeIn(400);
  },
};

// ---------- Title screen ----------
function renderTitle(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#05030f'); g.addColorStop(.55, '#1c0a33'); g.addColorStop(1, '#05030f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const art = Atlas.image('title_city'); // AI-generated key art (assets/src/ai), chunky pixels on purpose
  if (art) {
    ctx.imageSmoothingEnabled = false;
    const h = W * art.height / art.width;
    ctx.drawImage(art, 0, Math.min(0, H - h), W, h);
    ctx.fillStyle = 'rgba(5,3,11,.35)'; ctx.fillRect(0, 0, W, H);
  } else {
    let seed = 3;
    for (let x = -10; x < W;) {
      seed = (seed * 9301 + 49297) % 233280;
      const w = 18 + (seed % 26), h = 60 + (seed % 120);
      ctx.fillStyle = '#0d0720'; ctx.fillRect(x, 250 - h, w, h);
      for (let wy = 256 - h; wy < 244; wy += 8) for (let wx = x + 3; wx < x + w - 3; wx += 6) {
        if (((wx * 13 + wy * 7 + seed) % 6) === 0) { ctx.fillStyle = (wx + wy) % 3 ? 'rgba(255,46,136,.55)' : 'rgba(24,240,255,.55)'; ctx.fillRect(wx, wy, 2.5, 3); }
      }
      x += w + 3;
    }
    ctx.fillStyle = '#05030b'; ctx.fillRect(0, 250, W, H - 250);
    const haze = ctx.createLinearGradient(0, 200, 0, 260);
    haze.addColorStop(0, 'rgba(255,46,85,0)'); haze.addColorStop(1, 'rgba(255,46,85,.14)');
    ctx.fillStyle = haze; ctx.fillRect(0, 200, W, 60);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,46,136,.45)'; ctx.lineWidth = 1;
    for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 6, 250); ctx.lineTo(W / 2 + i * 60, H); ctx.stroke(); }
    for (let i = 0; i < 9; i++) {
      const k = (i + (t * .6) % 1) / 9, y = 250 + (H - 250) * k * k;
      ctx.globalAlpha = .2 + k * .7; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }
  const px = Math.hypot(ctx.getTransform().a, ctx.getTransform().b);
  // hero bots
  Sprites.drawBot(ctx, 'infernyx', 70, 300, 92, { t, phase: 0 });
  Sprites.drawBot(ctx, 'arborgeist', 282, 300, 92, { t, phase: 2, flip: true });
  Sprites.drawBot(ctx, 'leviatron', 176, 330, 108, { t, phase: 1 });
  // logo
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '800 54px Tektur, "Chakra Petch", system-ui, sans-serif';
  const gl = Math.sin(t * 9) > .93 ? (Math.random() - .5) * 8 : 0;
  ctx.fillStyle = 'rgba(24,240,255,.85)'; ctx.fillText('ROBOMON', W / 2 - 2 + gl, 92);
  ctx.fillStyle = 'rgba(255,46,136,.85)'; ctx.fillText('ROBOMON', W / 2 + 2 - gl, 96);
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 14 * px;
  ctx.fillStyle = '#fbf7ff'; ctx.fillText('ROBOMON', W / 2, 94);
  ctx.shadowBlur = 0;
  ctx.font = '600 13px "Chakra Petch", system-ui, sans-serif';
  ctx.fillStyle = '#ffe14d';
  ctx.fillText('N E O N   C I R C U I T', W / 2, 132);
  ctx.restore();
  Scene.rain(ctx, W, H, t, .8);
}

function renderOverlays(ctx) {
  if (G.wipe) {
    const p = Math.min(1, (performance.now() - G.wipe.t0) / G.wipe.dur);
    const n = 12, bh = H / n;
    for (let i = 0; i < n; i++) {
      const d = Math.max(0, Math.min(1, p * 1.6 - (i % 3) * .15));
      const w = W * d;
      ctx.fillStyle = '#05030f';
      if (i % 2) ctx.fillRect(W - w, i * bh, w, bh + 1); else ctx.fillRect(0, i * bh, w, bh + 1);
      ctx.fillStyle = i % 2 ? '#ff2e88' : '#18f0ff';
      ctx.fillRect(i % 2 ? W - w - 3 : w, i * bh, 3, bh);
    }
  }
  if (G.fade > 0) { ctx.fillStyle = `rgba(5,3,15,${G.fade})`; ctx.fillRect(0, 0, W, H); }
}

// ---------- Layout ----------
const PAD_H = 230; // room kept for the controller in portrait
function layout() {
  const app = $('#app'), scr = $('#screen');
  const land = window.innerWidth > window.innerHeight && window.innerHeight < 560;
  app.classList.toggle('land', land);
  const cs = getComputedStyle(app);
  const innerW = app.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const innerH = app.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const availW = land ? innerW - 2 * Math.min(200, innerW * .26) : innerW;
  const availH = land ? innerH : innerH - PAD_H;
  const w = Math.floor(Math.max(200, Math.min(availW, availH * W / H)));
  scr.style.width = w + 'px';
  scr.style.height = Math.floor(w * H / W) + 'px';
  scr.style.setProperty('--u', (w / W).toFixed(4) + 'px');
  const cv = $('#cv');
  const d = Math.min(3, window.devicePixelRatio || 1);
  cv.width = Math.round(w * d);
  cv.height = Math.round(w * H / W * d);
  G.k = cv.width / W;
  World.invalidate();
}

// ---------- Boot ----------
async function title() {
  G.mode = 'title';
  G.fade = 0;
  Sound.ambience({ rain: .7, city: .6 });
  const saved = await Store.load();
  for (;;) {
    const items = [];
    if (saved && saved.party && saved.party.length) items.push({ label: 'Continue', sub: `${saved.name} · ${Object.keys(saved.dex.caught).length} linked · ${Math.floor(saved.time / 60)} min`, value: 'cont' });
    items.push({ label: 'New game', value: 'new' });
    const v = await UI.menu({ layout: 'boot', items });
    Sound.unlock();
    if (v === 'cont') {
      G.state = Object.assign(G.newState(), saved); // Store.load already migrated it
      await G.fadeOut(300);
      return G.enterWorld();
    }
    if (saved && saved.party && saved.party.length) {
      const ok = await UI.ask('Start over? Your current save will be overwritten.', ['Start over', 'Cancel']);
      if (ok !== 0) continue;
    }
    G.state = G.newState();
    G.applyOpts();
    Sound.music('center');
    await Story.intro();
    await G.fadeOut(500);
    // One locked hand-off from the intro to Mae's first tip, so no input slips in between.
    await G.run(async () => { await G.enterWorld(); await Tutorial.tip('move'); });
    await G.save();
    return;
  }
}

// A tiny noise tile for the film-grain overlay, generated once.
function grain() {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d'), img = x.createImageData(96, 96);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = Math.random() * 16;
  }
  x.putImageData(img, 0, 0);
  $('#post').style.setProperty('--grain', `url(${c.toDataURL()})`);
}

function start(data) {
  layout();
  grain();
  $('#screen').classList.add('fx');
  window.addEventListener('resize', layout);
  Input.bindPad();
  Input.onPress((btn) => {
    if (G.mode !== 'world' || G.locked || World.player.moving) return;
    if (btn === 'a') G.run(World.interact);
    else if (btn === 'start') G.run(Menus.start);
  });
  const hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(() => ({ state: G.mode !== 'title' ? G.saveable() : null }));

  const cv = $('#cv'), ctx = cv.getContext('2d');
  let last = performance.now();
  const frame = (now) => {
    const t0 = performance.now();
    const dt = Math.min(50, now - last);
    last = now;
    const t = now / 1000;
    if (G.mode !== 'title' && G.state) G.state.time += dt / 1000;
    if (G.mode === 'world') World.update(dt, now);
    ctx.setTransform(G.k, 0, 0, G.k, 0, 0);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (!Atlas.loaded) {
      ctx.fillStyle = '#05030f'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#18f0ff'; ctx.font = '700 12px "Chakra Petch", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('LOADING' + '.'.repeat(Math.floor(t * 3) % 4), W / 2, H / 2);
      ctx.textAlign = 'left';
    } else if (G.mode === 'title') renderTitle(ctx, t);
    else if (G.mode === 'world') { World.render(ctx, W, H, t, G.k); Minimap.render(ctx, W, H, now); }
    else Battle.render(ctx, W, H, t);
    Post.apply(ctx, cv, t0);
    renderOverlays(ctx);
    // Frame cost, for tools/perf.js. `sync` forces the canvas to finish drawing so the number
    // includes rasterizing, not just issuing draw calls (only the perf tool turns it on).
    if (G.perf.sync) ctx.getImageData(0, 0, 1, 1);
    G.perf.ms[G.perf.i++ % G.perf.ms.length] = performance.now() - t0;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // Pixel art loads first (a few hundred KB, local); the loop above shows LOADING until it has.
  Atlas.load().then(() => {
    if (data && data.state) { G.state = Object.assign(G.newState(), Save.migrate(data.state)); G.fade = 1; G.enterWorld(); }
    else title();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  const hot = window.claude && window.claude.hot;
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
});
