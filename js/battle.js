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
  function platform(ctx, x, y, rx, color) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * .24, 0, 0, TAU);
    ctx.fillStyle = 'rgba(8,6,20,.85)'; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.shadowColor = color; ctx.shadowBlur = 10 * pxScale(ctx); ctx.stroke();
    ctx.restore();
  }

  const pxScale = (ctx) => Math.hypot(ctx.getTransform().a, ctx.getTransform().b);

  // `v` is the side's view state: the HP, XP and status shown, which trail the rules while animating.
  function panel(ctx, x, y, w, h, mon, v, mine) {
    const hpShown = v.hp, xp = v.xp;
    const col = mine ? '#18f0ff' : '#ff2e88';
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + 8, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - 8); ctx.lineTo(x + w - 8, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + 8); ctx.closePath();
    ctx.fillStyle = 'rgba(9,7,22,.9)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.shadowColor = col; ctx.shadowBlur = 8 * pxScale(ctx); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f2ecff'; ctx.font = '700 13px Tektur, "Chakra Petch", system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(Mon.name(mon), x + 9, y + 6);
    ctx.textAlign = 'right'; ctx.font = '600 11px "Chakra Petch", system-ui, sans-serif';
    ctx.fillStyle = '#b9b0d8'; ctx.fillText('Lv' + mon.lvl, x + w - 8, y + 7);
    ctx.textAlign = 'left';
    let cx = x + 9;
    for (const ty of SPECIES[mon.sp].t) {
      ctx.font = '700 8px "Chakra Petch", system-ui, sans-serif';
      const tw = ctx.measureText(TYPES[ty].n.toUpperCase()).width + 8;
      ctx.fillStyle = hexA(TYPES[ty].c, .2); ctx.fillRect(cx, y + 22, tw, 10);
      ctx.fillStyle = TYPES[ty].c; ctx.fillText(TYPES[ty].n.toUpperCase(), cx + 4, y + 23.5);
      cx += tw + 3;
    }
    if (v.status) {
      const st = STATUS[v.status];
      ctx.fillStyle = st.c; ctx.fillRect(cx + 2, y + 22, 26, 10);
      ctx.fillStyle = '#0a0816'; ctx.fillText(st.tag, cx + 6, y + 23.5);
      cx += 30;
    }
    if (Mon.ram(mon) > Mon.maxRam(mon) + B.ramMod) { // running past its RAM budget
      ctx.globalAlpha = .7 + .3 * Math.sin(performance.now() / 160); // pulses, but stays readable
      ctx.fillStyle = '#ff3d5a'; ctx.fillRect(cx + 2, y + 22, 44, 10);
      ctx.fillStyle = '#0a0816'; ctx.fillText('REDLINE', cx + 5, y + 23.5);
      ctx.globalAlpha = 1;
    }
    const max = Mon.maxHp(mon), r = Math.max(0, hpShown / max);
    const bx = x + 26, by = y + 36, bw = w - 36;
    ctx.fillStyle = '#ffffff'; ctx.font = '700 8px "Chakra Petch", system-ui, sans-serif';
    ctx.fillText('HP', x + 9, by - 1);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(bx, by, bw, 5);
    ctx.fillStyle = HP_C(r); ctx.shadowColor = HP_C(r); ctx.shadowBlur = 6 * pxScale(ctx);
    ctx.fillRect(bx, by, bw * r, 5);
    ctx.shadowBlur = 0;
    if (!mine && !B.trainer) { // Resonance with a wild bot: how well a link would take
      ctx.fillStyle = '#c9a8ff'; ctx.fillText('RES', x + 9, by + 9);
      ctx.fillStyle = 'rgba(155,107,255,.18)'; ctx.fillRect(bx, by + 11, bw, 3);
      ctx.fillStyle = '#9b6bff'; ctx.fillRect(bx, by + 11, bw * B.v.res, 3);
    }
    if (mine) {
      ctx.textAlign = 'right'; ctx.fillStyle = '#e9e2ff'; ctx.font = '600 10px "Chakra Petch", system-ui, sans-serif';
      ctx.fillText(`${Math.ceil(hpShown)} / ${max}`, x + w - 8, by + 8);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(24,240,255,.12)'; ctx.fillRect(x + 9, y + h - 6, w - 20, 2.5);
      ctx.fillStyle = '#18f0ff'; ctx.fillRect(x + 9, y + h - 6, (w - 20) * xp, 2.5);
    }
    ctx.restore();
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

  function drawSide(ctx, s, base, flip, t) {
    if (!s.mon || !s.v.show) return;
    if (s.v.blink && Math.floor(performance.now() / 70) % 2) return;
    const o = { t, flip, alpha: s.v.alpha, scale: s.v.scale, sil: s.v.sil, phase: flip ? 1.3 : 0, mods: s.mon.mods };
    // mirror image on the wet floor
    ctx.save();
    ctx.translate(base.x + s.v.dx, base.y + 2);
    ctx.scale(1, -.38);
    Sprites.drawBot(ctx, s.mon.sp, 0, -s.v.dy, base.size, { ...o, alpha: s.v.alpha * .16 });
    ctx.restore();
    Sprites.drawBot(ctx, s.mon.sp, base.x + s.v.dx, base.y + s.v.dy, base.size, o);
  }

  function render(ctx, W, H, t) {
    if (scene === 'evolve') return renderEvolve(ctx, W, H, t);
    if (!B) return;
    const v = B.v;
    ctx.save();
    if (v.shake > .2) { ctx.translate((rand() - .5) * v.shake, (rand() - .5) * v.shake); v.shake *= .86; }
    Scene.battle(ctx, W, H, t, B.theme, B.bg);
    platform(ctx, FOE.x + v.slideF, FOE.y, 62, '#ff2e88');
    platform(ctx, ME.x + v.slideM, ME.y, 72, '#18f0ff');
    if (v.trainerA > 0 && B.trainer) {
      ctx.save(); ctx.globalAlpha = v.trainerA;
      ctx.translate(FOE.x + v.trainerX - 48, FOE.y - 96); ctx.scale(3, 3);
      Sprites.drawPerson(ctx, 0, 0, 'down', B.trainer.look, 0, t);
      ctx.restore();
    }
    if (v.heroA > 0) {
      ctx.save(); ctx.globalAlpha = v.heroA;
      ctx.translate(ME.x + v.heroX - 60, ME.y - 112); ctx.scale(3.6, 3.6);
      Sprites.drawPerson(ctx, 0, 0, 'up', LOOK.hero, 0, t);
      ctx.restore();
    }
    drawSide(ctx, B.foe, { ...FOE, x: FOE.x + v.slideF }, false, t);
    drawSide(ctx, B.me, { ...ME, x: ME.x + v.slideM }, true, t);
    if (v.core) Sprites.drawCore(ctx, v.core.x, v.core.y, 7, v.core.color || '#18f0ff');
    if (B.rain) Scene.rain(ctx, W, H, t, B.rain * .8);
    const now = performance.now();
    v.fx = v.fx.filter((f) => { const done = drawFx(ctx, f, now); if (done) f.res(); return !done; });
    if (v.panels) {
      if (B.foe.mon) panel(ctx, 10, 12, 176, B.trainer ? 46 : 56, B.foe.mon, B.foe.v, false);
      if (B.me.mon) panel(ctx, 168, 198, 176, 60, B.me.mon, B.me.v, true);
      if (B.trainer) {
        const left = B.team.filter((m) => m.hp > 0).length;
        for (let i = 0; i < B.team.length; i++) {
          ctx.fillStyle = i < left ? '#ff2e88' : 'rgba(255,46,136,.25)';
          ctx.beginPath(); ctx.arc(20 + i * 11, 66, 3.5, 0, TAU); ctx.fill();
        }
      }
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
    return { mon, v: { show: false, dx: 0, dy: 0, alpha: 1, scale: 1, sil: null, blink: false, hp: mon ? mon.hp : 0, status: mon ? mon.status : null, xp: mon ? Mon.xpProgress(mon) : 0 } };
  }

  async function blink(side) {
    B[side].v.blink = true;
    await wait(380);
    B[side].v.blink = false;
  }

  // `e` is the engine's send event: HP and status as they were at that moment, since later events
  // in the same turn may already have changed the bot.
  async function sendOut(e) {
    const { side, text: line } = e, mon = B.st.sides[side].team[e.index];
    if (side === 'me' && B.v.heroA > 0) { await tween(B.v, 'heroX', -160, 350); B.v.heroA = 0; }
    B[side] = newSide(mon);
    const s = B[side];
    s.v.hp = e.hp; s.v.status = e.status;
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
    await Promise.all([tween(s.v, 'dy', 40, 420), tween(s.v, 'alpha', 0, 420)]);
    s.v.show = false;
    await sayWait(`${label(side)} shut down!`);
  }

  function seen(sp) { G.state.dex.seen[sp] = 1; }

  const FX_KIND = { VOLT: 'bolt', PLASMA: 'orb', HYDRO: 'drops', NANO: 'swarm', STEEL: 'impact', AERO: 'slash', VIRUS: 'glitch', PSI: 'rings', VOID: 'slash', NONE: 'impact' };

  async function anim(e) {
    const side = e.side, s = B[side];
    if (e.kind === 'hit') {
      const t = MOVES[e.move].t, dir = side === 'me' ? 1 : -1;
      await tween(s.v, 'dx', 16 * dir, 110);
      tween(s.v, 'dx', 0, 160);
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
      case 'hp':
        if (e.sfx) Sound.play(e.sfx);
        if (e.shake) B.v.shake = e.shake;
        await Promise.all([e.blink && blink(e.side), tween(s.v, 'hp', e.hp, 450 + Math.abs(s.v.hp - e.hp) * 8)]);
        return;
      case 'status': s.v.status = e.status; return;
      case 'res': return tween(B.v, 'res', e.value, 300);
      case 'breach': if (e.turns) Tutorial.later('breach'); return;
      case 'faint':
        await shutDown(e.side);
        if (e.side === 'foe') await awardXp(s.mon, e.participants);
        return;
      case 'recall': return tween(s.v, 'alpha', 0, 220);
      case 'send': return sendOut(e);
      case 'capture': return captureAnim(e.shakes);
      default: return; // 'end': finish() takes it from here
    }
  }
  async function play(events) { for (const e of events) await show(e); }

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
    const trainer = opts.trainer || null, team = trainer ? trainer.team : [opts.wild];
    const env = opts.env !== undefined ? opts.env : arenaOf(World.map);
    const st = Engine.create({ seed: Math.floor(Math.random() * 2 ** 31), me: { team: G.state.party }, foe: { team, trainer: trainer && trainer.name }, env });
    if (G.state.party.some((m) => Mon.ram(m) > Mon.maxRam(m) + ((env && Engine.ENV[env].ram) || 0))) Tutorial.later('redline');
    B = {
      st, trainer, team, ramMod: (env && Engine.ENV[env].ram) || 0, theme: opts.theme || '#ff2e88', tier: opts.tier || 0, drops: opts.drops || null, bg: opts.bg || 'city', rain: opts.rain || 0,
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
      if (trainer.name !== 'JAX') await Tutorial.tip('trainer');
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

    let out = { result: null, need: [] };
    while (!out.result) {
      const act = await chooseAction();
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

  async function finish(result) {
    const v = B.v;
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
    if (result === 'win') {
      const drops = B.drops ? [...B.drops] : rand() < (B.trainer ? .2 : .06) ? [Chrome.roll(B.tier)] : [];
      for (const id of drops) {
        Chrome.give(id);
        Sound.play('caught');
        await sayWait(`${B.trainer ? 'Salvaged from the wreckage' : 'The wild bot dropped some chrome'}: ${MODS[id].n.toUpperCase()} (${RARITY[MODS[id].r].n})!`);
      }
    } else if (result === 'lose') {
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

  return { run, render, evolve, learnMove, get active() { return scene !== null; }, get log() { return log; } };
})();
