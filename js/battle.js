'use strict';
// Turn-based battles, capture, experience and evolution scenes.

const Battle = (() => {
  const FOE = { x: 262, y: 128, size: 96, cx: 262, cy: 80 };
  const ME = { x: 94, y: 248, size: 118, cx: 94, cy: 190 };
  const STAT_N = { atk: 'ATTACK', def: 'DEFENSE', spd: 'SPEED' };
  const HP_C = (r) => (r > .5 ? '#3dfc8f' : r > .2 ? '#ffc94d' : '#ff3d5a');
  const rand = Math.random;

  let B = null;      // active battle
  let scene = null;  // 'battle' | 'evolve'
  let E = null;      // evolution scene state

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

  function panel(ctx, x, y, w, h, mon, hpShown, mine, xp) {
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
    if (mon.status) {
      const st = STATUS[mon.status];
      ctx.fillStyle = st.c; ctx.fillRect(cx + 2, y + 22, 26, 10);
      ctx.fillStyle = '#0a0816'; ctx.fillText(st.tag, cx + 6, y + 23.5);
    }
    const max = Mon.maxHp(mon), r = Math.max(0, hpShown / max);
    const bx = x + 26, by = y + 36, bw = w - 36;
    ctx.fillStyle = '#ffffff'; ctx.font = '700 8px "Chakra Petch", system-ui, sans-serif';
    ctx.fillText('HP', x + 9, by - 1);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(bx, by, bw, 5);
    ctx.fillStyle = HP_C(r); ctx.shadowColor = HP_C(r); ctx.shadowBlur = 6 * pxScale(ctx);
    ctx.fillRect(bx, by, bw * r, 5);
    ctx.shadowBlur = 0;
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
      if (B.foe.mon) panel(ctx, 10, 12, 176, 46, B.foe.mon, B.foe.v.hp, false, 0);
      if (B.me.mon) panel(ctx, 168, 198, 176, 60, B.me.mon, B.me.v.hp, true, B.me.v.xp);
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

  // ---------- Battle helpers ----------
  const other = (side) => (side === 'me' ? 'foe' : 'me');
  const label = (side) => (side === 'foe' ? (B.trainer ? 'Foe ' : 'Wild ') : '') + Mon.name(B[side].mon);
  const center = (side) => (side === 'me' ? { x: ME.cx + B.v.slideM, y: ME.cy } : { x: FOE.cx + B.v.slideF, y: FOE.cy });

  function newSide(mon) {
    return { mon, st: { atk: 0, def: 0, spd: 0 }, fresh: true, endured: false, v: { show: false, dx: 0, dy: 0, alpha: 1, scale: 1, sil: null, blink: false, hp: mon ? mon.hp : 0, xp: mon ? Mon.xpProgress(mon) : 0 } };
  }

  const stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
  function eff(side, k) {
    const s = B[side];
    let v = Mon.stat(s.mon, k) * stageMult(s.st[k]);
    if (k === 'spd' && s.mon.status === 'par') v *= .5;
    return v;
  }

  async function animateHp(side) {
    const s = B[side];
    await tween(s.v, 'hp', s.mon.hp, 450 + Math.abs(s.v.hp - s.mon.hp) * 8);
  }

  async function blink(side) {
    B[side].v.blink = true;
    await wait(380);
    B[side].v.blink = false;
  }

  async function sendOut(side, mon, line) {
    B[side] = newSide(mon);
    const s = B[side];
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
    if (side === 'me') B.participants.add(mon);
    const foe = B[other(side)].mon;
    if (Mon.has(mon, 'salvo') && foe && foe.hp > 1) {
      await say(`${label(side)}'s micro-missiles opened fire!`, 700);
      await fx('orb', '#ffb52e', center(side), center(other(side)), 360);
      Sound.play('hit');
      B.v.shake = 6;
      foe.hp = Math.max(1, foe.hp - Math.max(1, Math.floor(Mon.maxHp(foe) / 8)));
      await Promise.all([blink(other(side)), animateHp(other(side))]);
    }
  }

  async function shutDown(side) {
    const s = B[side];
    Sound.play('faint');
    await Promise.all([tween(s.v, 'dy', 40, 420), tween(s.v, 'alpha', 0, 420)]);
    s.v.show = false;
    await sayWait(`${label(side)} shut down!`);
  }

  function seen(sp) { G.state.dex.seen[sp] = 1; }

  // ---------- Moves ----------
  const FX_KIND = { VOLT: 'bolt', PLASMA: 'orb', HYDRO: 'drops', NANO: 'swarm', STEEL: 'impact', AERO: 'slash', VIRUS: 'glitch', PSI: 'rings', VOID: 'slash', NONE: 'impact' };

  function applyStatus(side, st, quiet) {
    const m = B[side].mon, types = SPECIES[m.sp].t;
    if (m.status || m.hp <= 0) return quiet ? null : 'But it failed!';
    if ((st === 'brn' && (types.includes('PLASMA') || Mon.has(m, 'noBrn'))) || (st === 'psn' && (types.includes('VIRUS') || types.includes('STEEL') || Mon.has(m, 'noPsn'))) || (st === 'par' && (types.includes('VOLT') || Mon.has(m, 'noPar')))) {
      return quiet ? null : `It doesn't affect ${label(side)}...`;
    }
    m.status = st;
    if (st === 'slp') m.slp = 1 + Math.floor(rand() * 3);
    return { brn: `${label(side)} overheated!`, par: `${label(side)} short-circuited! It may be unable to move!`, psn: `${label(side)} got infected!`, slp: `${label(side)} went into standby mode!` }[st];
  }

  async function changeStats(side, changes) {
    for (const [k, n] of Object.entries(changes)) {
      const s = B[side];
      const before = s.st[k];
      s.st[k] = Math.max(-6, Math.min(6, before + n));
      if (s.st[k] === before) { await say(`${label(side)}'s ${STAT_N[k]} won't go any ${n > 0 ? 'higher' : 'lower'}!`); continue; }
      Sound.play(n > 0 ? 'buff' : 'debuff');
      await fx(n > 0 ? 'buff' : 'debuff', n > 0 ? '#18f0ff' : '#ff3d5a', center(side), center(side), 520);
      await say(`${label(side)}'s ${STAT_N[k]} ${Math.abs(n) > 1 ? 'sharply ' : ''}${n > 0 ? 'rose' : 'fell'}!`);
    }
  }

  async function useMove(side, slot) {
    const atk = B[side], def = B[other(side)];
    const m = atk.mon;
    if (m.hp <= 0) return;
    if (m.status === 'slp') {
      m.slp--;
      if (m.slp > 0) { Sound.play('status'); await say(`${label(side)} is on standby.`); return; }
      m.status = null;
      await say(`${label(side)} rebooted!`);
    }
    if (m.status === 'par' && rand() < .25) { Sound.play('status'); await say(`${label(side)} is shorted out! It can't move!`); return; }

    let id = 'struggle';
    if (slot !== null && m.moves[slot] && m.moves[slot].pp > 0) { id = m.moves[slot].id; m.moves[slot].pp--; }
    const mv = MOVES[id];
    await say(`${label(side)} used ${mv.n.toUpperCase()}!`, 700);

    const sure = Mon.has(m, 'trueshot') || (mv.p === 0 && Mon.has(m, 'netrun'));
    if (!sure && rand() * 100 >= mv.a) { await say('But it missed!'); return; }

    if (mv.p > 0) {
      const mult = typeMult(mv.t, SPECIES[def.mon.sp].t);
      if (mult === 0) { await say(`It doesn't affect ${label(other(side))}...`); return; }
      if (Mon.has(def.mon, 'dodge') && rand() < .15) {
        def.v.alpha = .25;
        await say(`${label(other(side))} shimmered out of the way!`);
        def.v.alpha = 1;
        return;
      }
      // attack animation
      const dir = side === 'me' ? 1 : -1;
      await tween(atk.v, 'dx', 16 * dir, 110);
      tween(atk.v, 'dx', 0, 160);
      const col = TYPES[mv.t].c;
      await fx(FX_KIND[mv.t], col, center(side), center(other(side)), mv.t === 'STEEL' || mv.t === 'NONE' ? 220 : 380);
      const critP = (mv.crit ? .25 : 1 / 16) * (Mon.has(m, 'keen') ? 2 : 1) + (Mon.has(m, 'critUp') ? .1 : 0);
      const crit = rand() < critP;
      const berserk = Mon.has(m, 'berserk') && m.hp < Mon.maxHp(m) / 3 ? 1.5 : 1;
      const A = eff(side, 'atk') * (m.status === 'brn' ? .5 : 1) * berserk;
      const D = eff(other(side), 'def') * (Mon.has(m, 'pierce') ? .7 : 1);
      const stab = SPECIES[m.sp].t.includes(mv.t) ? 1.5 : 1;
      const chrome = (mult > 1 && Mon.has(m, 'exploit') ? 1.25 : 1) * ((mv.t === 'VIRUS' || mv.t === 'PSI') && Mon.has(m, 'netrun') ? 1.25 : 1);
      let dmg = Math.floor(Math.floor(Math.floor(2 * m.lvl / 5 + 2) * mv.p * A / D) / 50) + 2;
      dmg = Math.max(1, Math.floor(dmg * stab * mult * chrome * (crit ? 1.5 : 1) * (.85 + rand() * .15)));
      dmg = Math.min(dmg, def.mon.hp);
      let endured = false;
      if (dmg >= def.mon.hp && def.mon.hp > 1 && !def.endured && Mon.has(def.mon, 'endure')) { dmg = def.mon.hp - 1; def.endured = endured = true; }
      def.mon.hp -= dmg;
      Sound.play(crit ? 'crit' : mult > 1 ? 'crit' : mult < 1 ? 'weak' : 'hit');
      B.v.shake = crit || mult > 1 ? 9 : 4;
      await Promise.all([blink(other(side)), animateHp(other(side))]);
      if (crit) await say('A critical hit!');
      if (mult > 1) await say('It\'s super effective!');
      else if (mult < 1) await say('It\'s not very effective...');
      if (berserk > 1) await say(`${label(side)}'s Berserk Protocol is redlining!`, 700);
      if (endured) { Sound.play('alert'); await say(`${label(other(side))}'s Second Heart kicked in! It's hanging on with 1 HP!`); }
      if (def.mon.hp > 0 && Mon.has(m, 'shock') && rand() < .15) {
        const msg = applyStatus(other(side), 'par', true);
        if (msg) { Sound.play('status'); await say(msg); }
      }
      if (mv.drain && m.hp > 0) {
        const h = Math.max(1, Math.floor(dmg * mv.drain));
        m.hp = Math.min(Mon.maxHp(m), m.hp + h);
        await animateHp(side);
        await say(`${label(side)} siphoned energy!`);
      }
      if (mv.recoil) {
        m.hp = Math.max(0, m.hp - Math.max(1, Math.floor(dmg * mv.recoil)));
        await animateHp(side);
        await say(`${label(side)} took recoil damage!`);
      }
      if (mv.fx && def.mon.hp > 0 && rand() < (mv.fx.ch ?? 1)) {
        if (mv.fx.st) { const msg = applyStatus(other(side), mv.fx.st, true); if (msg) { Sound.play('status'); await say(msg); } }
        if (mv.fx.foe) await changeStats(other(side), mv.fx.foe);
      }
      if (mv.fx && mv.fx.self && m.hp > 0 && rand() < (mv.fx.ch ?? 1)) await changeStats(side, mv.fx.self);
    } else {
      if (mv.heal) {
        if (m.hp >= Mon.maxHp(m)) { await say(`${label(side)}'s HP is already full!`); return; }
        Sound.play('heal');
        await fx('heal', '#3dfc8f', center(side), center(side), 600);
        m.hp = Math.min(Mon.maxHp(m), m.hp + Math.floor(Mon.maxHp(m) * mv.heal));
        await animateHp(side);
        await say(`${label(side)} restored its HP!`);
        return;
      }
      if (mv.fx.st) {
        await fx(FX_KIND[mv.t], TYPES[mv.t].c, center(side), center(other(side)), 380);
        const msg = applyStatus(other(side), mv.fx.st, false);
        if (msg) { Sound.play('status'); await say(msg); }
      }
      if (mv.fx.foe) await changeStats(other(side), mv.fx.foe);
      if (mv.fx.self) await changeStats(side, mv.fx.self);
    }
  }

  function aiSlot(side) {
    const me = B[side].mon, foe = B[other(side)];
    const usable = me.moves.map((mv, i) => ({ mv: MOVES[mv.id], i, pp: mv.pp })).filter((x) => x.pp > 0);
    if (!usable.length) return null;
    if (!B.trainer && rand() < .5) return usable[Math.floor(rand() * usable.length)].i;
    const score = ({ mv }) => {
      if (mv.p > 0) return mv.p * typeMult(mv.t, SPECIES[foe.mon.sp].t) * (SPECIES[me.sp].t.includes(mv.t) ? 1.5 : 1) * mv.a / 100;
      if (mv.heal) return me.hp < Mon.maxHp(me) * .45 ? 90 : 0;
      if (mv.fx.st) return foe.mon.status ? 0 : 45;
      const stats = mv.fx.self || mv.fx.foe;
      const k = Object.keys(stats)[0];
      const stage = mv.fx.self ? B[side].st[k] : -foe.st[k];
      return stage >= 2 ? 0 : 35;
    };
    if (rand() < .2) return usable[Math.floor(rand() * usable.length)].i;
    usable.sort((a, b) => score(b) - score(a));
    return usable[0].i;
  }

  // ---------- Player decisions ----------
  async function chooseAction() {
    const mon = B.me.mon;
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
        if (!mon.moves.some((m) => m.pp > 0)) { await say(`${Mon.name(mon)} has no energy left for moves!`); return { type: 'move', slot: null }; }
        const s = await UI.menu({
          where: 'dock', layout: 'grid', cancel: true, title: 'Choose a move',
          items: mon.moves.map((m, i) => {
            const mv = MOVES[m.id];
            return { label: mv.n, sub: `${TYPES[mv.t].n.toUpperCase()} · ${m.pp}/${mv.pp}`, value: i, color: TYPES[mv.t].c, disabled: m.pp <= 0 };
          }),
        });
        if (s !== null) return { type: 'move', slot: s };
      } else if (c === 'bag') {
        const r = await Menus.bag({ battle: true });
        if (r && ITEMS[r.id].kind === 'ball' && B.trainer) { await sayWait('You can\'t link with another Linker\'s bot!'); continue; }
        if (r) return { type: 'item', ...r };
      } else if (c === 'bots') {
        const i = await Menus.party({ battle: true, active: G.state.party.indexOf(mon) });
        if (i !== null) return { type: 'switch', idx: i };
      } else if (c === 'run') {
        if (B.trainer) { await sayWait('No running from a Linker battle!'); continue; }
        return { type: 'run' };
      }
    }
  }

  async function doSwitch(idx) {
    const s = B.me;
    if (s.mon && s.mon.hp > 0) {
      await say(`${Mon.name(s.mon)}, come back!`, 600);
      await tween(s.v, 'alpha', 0, 220);
    }
    await sendOut('me', G.state.party[idx], `Go, ${Mon.name(G.state.party[idx])}!`);
  }

  async function useItem(act) {
    const it = ITEMS[act.id];
    G.state.bag[act.id]--;
    if (it.kind === 'ball') return capture(it);
    if (it.kind === 'boost') {
      await say(`You used an ${it.n.toUpperCase()}!`, 700);
      await changeStats('me', { [it.stat]: 2 });
      return;
    }
    const m = G.state.party[act.target];
    await say(`You used a ${it.n.toUpperCase()} on ${Mon.name(m)}.`, 700);
    const msg = Menus.applyItem(act.id, m);
    if (m === B.me.mon) { Sound.play('heal'); await fx('heal', '#3dfc8f', center('me'), center('me'), 600); await animateHp('me'); }
    await say(msg);
  }

  async function capture(it) {
    await say(`You threw a ${it.n.toUpperCase()}!`, 600);
    const v = B.v, f = B.foe;
    Sound.play('throw');
    v.core = { x: 40, y: 300, color: '#18f0ff' };
    const c = center('foe');
    await Promise.all([tween(v.core, 'x', c.x, 500, (k) => k), tween(v.core, 'y', c.y - 10, 500)]);
    f.v.sil = '#18f0ff';
    await tween(f.v, 'scale', 0, 260);
    f.v.show = false;
    await tween(v.core, 'y', FOE.y - 6, 300, (k) => k * k);
    const m = f.mon, max = Mon.maxHp(m);
    const statusB = m.status === 'slp' ? 2 : m.status ? 1.5 : 1;
    const a = ((3 * max - 2 * m.hp) * SPECIES[m.sp].cr * it.rate) / (3 * max) * statusB;
    let shakes = 0;
    if (a >= 255) shakes = 4;
    else {
      const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));
      while (shakes < 4 && rand() * 65536 < b) shakes++;
    }
    for (let i = 0; i < Math.min(3, shakes); i++) {
      await wait(380);
      Sound.play('shake');
      await tween(v.core, 'x', c.x - 5, 80); await tween(v.core, 'x', c.x + 5, 120); await tween(v.core, 'x', c.x, 80);
    }
    await wait(420);
    if (shakes === 4) {
      Sound.play('caught');
      v.core.color = '#ffe14d';
      await sayWait(`Linked! ${Mon.name(m)} is now part of your crew!`);
      G.state.dex.caught[m.sp] = 1;
      m.status = m.status === 'slp' ? null : m.status;
      if (G.state.party.length < 6) G.state.party.push(m);
      else { G.state.box.push(m); await sayWait(`Your party is full. ${Mon.name(m)} was uploaded to the Cloud Box.`); }
      v.core = null;
      return 'caught';
    }
    v.core = null;
    f.v.show = true; f.v.sil = '#ffffff';
    await tween(f.v, 'scale', 1, 200);
    f.v.sil = null;
    await sayWait(['Oh no! It broke the link instantly!', 'Argh! It almost synced!', 'So close! The link nearly held!', 'Gah! One more second!'][shakes]);
    return null;
  }

  function tryRun() {
    B.runs++;
    const me = eff('me', 'spd'), foe = eff('foe', 'spd');
    return me >= foe || rand() < .4 + (me / foe) * .3 + B.runs * .12;
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

  async function awardXp(foeMon) {
    const alive = [...B.participants].filter((m) => m.hp > 0 && G.state.party.includes(m));
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
      }
    }
  }

  // ---------- Main flow ----------
  // opts: { wild: mon } | { trainer: { name, look, team, money } }, theme
  async function run(opts) {
    const party = G.state.party;
    B = {
      trainer: opts.trainer || null,
      team: opts.trainer ? opts.trainer.team : [opts.wild],
      foeIdx: 0, runs: 0, participants: new Set(), theme: opts.theme || '#ff2e88', tier: opts.tier || 0, drops: opts.drops || null, bg: opts.bg || 'city', rain: opts.rain || 0,
      v: { fx: [], shake: 0, flash: 0, core: null, panels: false, slideF: 220, slideM: -220, trainerA: 0, trainerX: 0, heroA: 1, heroX: 0 },
      me: newSide(null), foe: newSide(null),
    };
    scene = 'battle';
    Sound.music(opts.music || (opts.trainer ? 'gym' : 'battle'));
    const v = B.v;
    if (B.trainer) {
      v.trainerA = 1;
      await Promise.all([tween(v, 'slideF', 0, 600), tween(v, 'slideM', 0, 600)]);
      await sayWait(`${B.trainer.name} wants to battle!`);
      await tween(v, 'trainerX', 140, 350);
      v.trainerA = 0;
      await sendOut('foe', B.team[0], `${B.trainer.name} sent out ${Mon.name(B.team[0])}!`);
    } else {
      B.foe = newSide(B.team[0]);
      B.foe.v.show = true;
      seen(B.team[0].sp);
      await Promise.all([tween(v, 'slideF', 0, 600), tween(v, 'slideM', 0, 600)]);
      await sayWait(`A wild ${Mon.name(B.team[0])} glitched into view!`);
    }
    await tween(v, 'heroX', -160, 350);
    v.heroA = 0;
    const first = party.findIndex((m) => m.hp > 0);
    await sendOut('me', party[first], `Go, ${Mon.name(party[first])}!`);
    v.panels = true;

    let result = null;
    while (!result) {
      const act = await chooseAction();
      let skipMe = false;
      if (act.type === 'run') {
        if (tryRun()) { Sound.play('door'); await sayWait('You slipped away safely!'); result = 'run'; break; }
        await say('Couldn\'t get away!'); skipMe = true;
      } else if (act.type === 'switch') { await doSwitch(act.idx); skipMe = true; }
      else if (act.type === 'item') {
        if (await useItem(act) === 'caught') { result = 'caught'; break; }
        skipMe = true;
      }
      const foeSlot = aiSlot('foe');
      const order = [];
      if (skipMe) order.push('foe');
      else {
        const myMv = MOVES[act.slot === null ? 'struggle' : B.me.mon.moves[act.slot].id];
        const foeMv = MOVES[foeSlot === null ? 'struggle' : B.foe.mon.moves[foeSlot].id];
        const quick = (side) => (B[side].fresh && Mon.has(B[side].mon, 'quick') ? 3 : 0);
        const pm = (myMv.pri || 0) + quick('me'), pf = (foeMv.pri || 0) + quick('foe');
        const meFirst = pm !== pf ? pm > pf : eff('me', 'spd') === eff('foe', 'spd') ? rand() < .5 : eff('me', 'spd') > eff('foe', 'spd');
        order.push(...(meFirst ? ['me', 'foe'] : ['foe', 'me']));
      }
      for (const side of order) {
        if (B.me.mon.hp <= 0 || B.foe.mon.hp <= 0) break;
        await useMove(side, side === 'me' ? act.slot : foeSlot);
      }
      B.me.fresh = B.foe.fresh = false;
      // end-of-turn status damage
      for (const side of ['me', 'foe']) {
        const m = B[side].mon;
        if (B.me.mon.hp <= 0 || B.foe.mon.hp <= 0) break;
        if (m.status === 'brn' || m.status === 'psn') {
          const d = Math.max(1, Math.floor(Mon.maxHp(m) / (m.status === 'brn' ? 16 : 8)));
          m.hp = Math.max(0, m.hp - d);
          Sound.play('weak');
          await blink(side);
          await animateHp(side);
          await say(m.status === 'brn' ? `${label(side)} is overheating!` : `${label(side)}'s code is corrupting!`);
        }
        if (m.hp > 0 && m.hp < Mon.maxHp(m) && Mon.has(m, 'regen')) {
          m.hp = Math.min(Mon.maxHp(m), m.hp + Math.max(1, Math.floor(Mon.maxHp(m) / 16)));
          await animateHp(side);
          await say(`${label(side)}'s nanites patched it up.`, 700);
        }
      }
      result = await resolveFaints();
    }
    return finish(result);
  }

  // Handles shut-downs after a turn. Returns a result string when the battle ends.
  async function resolveFaints() {
    if (B.foe.mon.hp <= 0) {
      await shutDown('foe');
      await awardXp(B.foe.mon);
      B.participants = new Set([B.me.mon].filter((m) => m.hp > 0));
      const next = B.team.findIndex((m) => m.hp > 0);
      if (next < 0) return 'win';
      B.foeIdx = next;
      await sendOut('foe', B.team[next], `${B.trainer.name} sent out ${Mon.name(B.team[next])}!`);
    }
    if (B.me.mon.hp <= 0) {
      await shutDown('me');
      if (!G.state.party.some((m) => m.hp > 0)) return 'lose';
      await sayWait('Choose your next bot.');
      const i = await Menus.party({ battle: true, forced: true, active: G.state.party.indexOf(B.me.mon) });
      await sendOut('me', G.state.party[i], `Go, ${Mon.name(G.state.party[i])}!`);
    }
    return null;
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
        await sayWait(`You earned ${B.trainer.money} CR for winning.`);
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
        await sayWait(`You paid out ${lost} CR...`);
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

  return { run, render, evolve, learnMove, get active() { return scene !== null; } };
})();
