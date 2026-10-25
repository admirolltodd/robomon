'use strict';
// Overworld: map loading, tile rendering, movement, NPCs, warps and encounters.

const World = (() => {
  const T = 32;
  const WALK_MS = 170, RUN_MS = 100;
  const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  let map = null, mapId = null, ents = [];
  const P = { x: 0, y: 0, dir: 'down', px: 0, py: 0, moving: false, p: 0, fx: 0, fy: 0, tx: 0, ty: 0, steps: 0, ms: WALK_MS };
  let layer = null, layerK = 0, turnT = 0, bumpT = 0;
  const bubbles = [];

  const S = () => G.state;
  const tile = (x, y) => (map.rows[y] || '')[x];
  const hash = (a, b, c = 0) => { let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };

  function visible(def) {
    const f = S().flags;
    if (def.hide && f[def.hide]) return false;
    if (def.show && !f[def.show]) return false;
    if (def.kind === 'pod') return S().starter !== def.species && S().rivalStarter !== def.species;
    if (def.item) return !f[`item_${mapId}_${def.id}`];
    return true;
  }

  function buildEnts() {
    const list = [...(map.npcs || []), ...(map.items || []).map((i) => ({ ...i, kind: 'item' }))];
    ents = list.filter(visible).map((d) => ({ ...d, def: d, kind: d.kind || 'npc', px: d.x * T, py: d.y * T, dir: d.dir || 'down', idleT: 2 + Math.random() * 4 }));
  }

  function load(id, x, y, dir) {
    mapId = id; map = MAPS[id];
    Object.assign(P, { x, y, px: x * T, py: y * T, moving: false, dir: dir || P.dir });
    S().map = id; S().x = x; S().y = y; S().dir = P.dir;
    buildEnts();
    layer = null;
    Sound.music(map.music);
    if (map.outdoor || id.startsWith('gym')) UI.banner(map.name, map.sub);
  }

  // ---------- Static tile layer ----------
  function prerender(k) {
    const w = map.rows[0].length, h = map.rows.length;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * T * k); c.height = Math.ceil(h * T * k);
    const ctx = c.getContext('2d');
    ctx.scale(k, k);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) drawTile(ctx, x, y, k);
    layer = c; layerK = k;
  }

  function edgeGlow(ctx, x, y, same, color, k, inset = 1) {
    const X = x * T, Y = y * T;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.shadowColor = color; ctx.shadowBlur = 8 * k;
    ctx.beginPath();
    if (!same(x, y - 1)) { ctx.moveTo(X, Y + inset); ctx.lineTo(X + T, Y + inset); }
    if (!same(x, y + 1)) { ctx.moveTo(X, Y + T - inset); ctx.lineTo(X + T, Y + T - inset); }
    if (!same(x - 1, y)) { ctx.moveTo(X + inset, Y); ctx.lineTo(X + inset, Y + T); }
    if (!same(x + 1, y)) { ctx.moveTo(X + T - inset, Y); ctx.lineTo(X + T - inset, Y + T); }
    ctx.stroke();
    ctx.restore();
  }

  function ground(ctx, X, Y, theme) {
    ctx.fillStyle = '#0c0a1a'; ctx.fillRect(X, Y, T, T);
    ctx.strokeStyle = hexA(theme, .07); ctx.lineWidth = 1;
    ctx.strokeRect(X + .5, Y + .5, T - 1, T - 1);
  }

  function drawTile(ctx, x, y, k) {
    const t = tile(x, y), X = x * T, Y = y * T, th = map.theme;
    const r = hash(x, y);
    switch (t) {
      case '.': ground(ctx, X, Y, th);
        if (r > .8) { ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fillRect(X + r * 20, Y + (1 - r) * 24, 3, 2); }
        break;
      case ',': ctx.fillStyle = '#16122c'; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = 'rgba(255,255,255,.035)'; ctx.fillRect(X, Y + 15, T, 1); ctx.fillRect(X + 15, Y, 1, T);
        break;
      case ';': ctx.fillStyle = '#1c0b33'; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = 'rgba(255,46,136,.07)'; ctx.fillRect(X + 1, Y + 1, T - 2, T - 2);
        break;
      case '~': ctx.fillStyle = '#04112a'; ctx.fillRect(X, Y, T, T);
        edgeGlow(ctx, x, y, (a, b) => tile(a, b) === '~' || tile(a, b) === undefined, '#3d8bff', k);
        break;
      case 'T': ground(ctx, X, Y, th);
        ctx.fillStyle = '#1a1430'; ctx.fillRect(X + 14, Y + 16, 4, 14);
        ctx.save(); ctx.shadowColor = '#2ee6a0'; ctx.shadowBlur = 10 * k;
        ctx.beginPath(); ctx.moveTo(X + 16, Y + 2); ctx.lineTo(X + 27, Y + 18); ctx.lineTo(X + 5, Y + 18); ctx.closePath();
        ctx.fillStyle = 'rgba(46,230,160,.18)'; ctx.fill(); ctx.strokeStyle = '#2ee6a0'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X + 10, Y + 12); ctx.lineTo(X + 22, Y + 12); ctx.stroke();
        ctx.restore();
        break;
      case '=': ground(ctx, X, Y, th);
        ctx.fillStyle = '#1b1608'; ctx.fillRect(X, Y + 10, T, 12);
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#0c0a1a' : 'rgba(255,225,77,.7)'; ctx.fillRect(X + i * 8, Y + 12, 8, 8); }
        ctx.save(); ctx.strokeStyle = '#ffe14d'; ctx.shadowColor = '#ffe14d'; ctx.shadowBlur = 6 * k; ctx.lineWidth = 1.2;
        ctx.strokeRect(X + .5, Y + 10.5, T - 1, 11); ctx.restore();
        break;
      case '#': case 'D': {
        ctx.fillStyle = '#100b24'; ctx.fillRect(X, Y, T, T);
        if (t === '#') {
          const lit = ['#ffb347', '#18f0ff', '#ff4fd8', '#ffe14d'];
          for (let i = 0; i < 4; i++) {
            const rr = hash(x, y, i + 1);
            ctx.fillStyle = rr > .55 ? hexA(lit[Math.floor(rr * 40) % 4], .55) : 'rgba(255,255,255,.04)';
            ctx.fillRect(X + 6 + (i % 2) * 13, Y + 6 + Math.floor(i / 2) * 13, 7, 8);
          }
        }
        edgeGlow(ctx, x, y, (a, b) => tile(a, b) === '#' || tile(a, b) === 'D', th, k);
        if (t === 'D') {
          ctx.save();
          const g = ctx.createLinearGradient(0, Y + 8, 0, Y + T);
          g.addColorStop(0, hexA(th, .15)); g.addColorStop(1, hexA(th, .7));
          ctx.fillStyle = g; ctx.fillRect(X + 8, Y + 8, 16, 24);
          ctx.strokeStyle = th; ctx.lineWidth = 1.5; ctx.shadowColor = th; ctx.shadowBlur = 10 * k;
          ctx.strokeRect(X + 8, Y + 8, 16, 24);
          ctx.restore();
        }
        break;
      }
      case '^': ground(ctx, X, Y, th);
        ctx.fillStyle = '#1a1430'; ctx.fillRect(X + 14, Y + 18, 4, 12);
        ctx.save(); ctx.fillStyle = 'rgba(10,8,24,.9)'; ctx.fillRect(X + 4, Y + 4, 24, 15);
        ctx.strokeStyle = th; ctx.shadowColor = th; ctx.shadowBlur = 8 * k; ctx.lineWidth = 1.4; ctx.strokeRect(X + 4, Y + 4, 24, 15);
        ctx.fillStyle = hexA(th, .8); ctx.fillRect(X + 8, Y + 9, 16, 2); ctx.fillRect(X + 8, Y + 13, 10, 2);
        ctx.restore();
        break;
      case ':': case 'E':
        ctx.fillStyle = '#110d22'; ctx.fillRect(X, Y, T, T);
        ctx.strokeStyle = hexA(th, .09); ctx.lineWidth = 1; ctx.strokeRect(X + .5, Y + .5, T - 1, T - 1);
        if (t === 'E') {
          ctx.save(); ctx.strokeStyle = th; ctx.shadowColor = th; ctx.shadowBlur = 8 * k; ctx.lineWidth = 2;
          for (const oy of [8, 16]) { ctx.beginPath(); ctx.moveTo(X + 9, Y + oy); ctx.lineTo(X + 16, Y + oy + 6); ctx.lineTo(X + 23, Y + oy); ctx.stroke(); }
          ctx.restore();
        }
        break;
      case 'X':
        ctx.fillStyle = '#08060f'; ctx.fillRect(X, Y, T, T);
        ctx.fillStyle = '#120e24'; ctx.fillRect(X, Y + T - 10, T, 10);
        if (tile(x, y + 1) && tile(x, y + 1) !== 'X') edgeGlow(ctx, x, y, (a, b) => b !== y + 1 || tile(a, b) === 'X' || tile(a, b) === undefined, th, k);
        break;
      case 'C': case 'B': case 'P': case 'h':
        ctx.fillStyle = '#110d22'; ctx.fillRect(X, Y, T, T);
        ctx.save();
        if (t === 'C') {
          ctx.fillStyle = '#1d1838'; ctx.fillRect(X, Y + 6, T, 22);
          ctx.strokeStyle = th; ctx.shadowColor = th; ctx.shadowBlur = 8 * k; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(X, Y + 27.5); ctx.lineTo(X + T, Y + 27.5); ctx.stroke();
        } else if (t === 'h') {
          rrect(ctx, X + 6, Y + 3, 20, 26, 9); ctx.fillStyle = 'rgba(255,79,216,.15)'; ctx.fill();
          ctx.strokeStyle = '#ff4fd8'; ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 10 * k; ctx.lineWidth = 1.5; ctx.stroke();
        } else {
          const scr = t === 'P' ? '#18f0ff' : th;
          ctx.fillStyle = '#17122e'; ctx.fillRect(X + 3, Y + 2, 26, 28);
          ctx.strokeStyle = hexA(scr, .6); ctx.lineWidth = 1; ctx.strokeRect(X + 3.5, Y + 2.5, 25, 27);
          ctx.fillStyle = hexA(scr, t === 'P' ? .7 : .35); ctx.shadowColor = scr; ctx.shadowBlur = 8 * k;
          ctx.fillRect(X + 7, Y + 6, 18, 10);
          for (let i = 0; i < 3; i++) { ctx.fillStyle = hash(x, y, i) > .5 ? '#2ee6a0' : '#ff2e88'; ctx.fillRect(X + 8 + i * 6, Y + 21, 3, 3); }
        }
        ctx.restore();
        break;
      default: ctx.fillStyle = '#05040c'; ctx.fillRect(X, Y, T, T);
    }
  }

  // ---------- Movement ----------
  const entAt = (x, y) => ents.find((e) => (e.moving ? (e.tx === x && e.ty === y) || (e.x === x && e.y === y) : e.x === x && e.y === y));

  function blocked(x, y) {
    const t = tile(x, y);
    if (t === undefined || SOLID.has(t)) return true;
    return !!entAt(x, y);
  }

  function update(dt, now) {
    if (!map) return;
    for (const e of ents) {
      if (e.kind !== 'npc' || e.trainer || e.script === 'leader' || e.moving) continue;
      e.idleT -= dt / 1000;
      if (e.idleT <= 0 && !G.locked) { e.idleT = 3 + Math.random() * 5; e.dir = ['up', 'down', 'left', 'right'][Math.floor(Math.random() * 4)]; }
    }
    if (P.moving) {
      P.p += dt / P.ms;
      if (P.p >= 1) {
        P.moving = false;
        P.x = P.tx; P.y = P.ty; P.px = P.x * T; P.py = P.y * T;
        S().x = P.x; S().y = P.y;
        P.steps++;
        if (P.scripted) { const done = P.scripted; P.scripted = null; done(); } else G.run(onStep);
      } else {
        P.px = (P.fx + (P.tx - P.fx) * P.p) * T;
        P.py = (P.fy + (P.ty - P.fy) * P.p) * T;
      }
      return;
    }
    if (G.locked || UI.busy) return;
    const d = Input.dir;
    if (!d) { turnT = 0; return; }
    if (d !== P.dir && !turnT) { P.dir = d; S().dir = d; turnT = now; return; }
    if (turnT && now - turnT < 70) return;
    const [dx, dy] = DV[d];
    P.dir = d; S().dir = d;
    if (blocked(P.x + dx, P.y + dy)) {
      if (now - bumpT > 300) { Sound.play('bump'); bumpT = now; }
      return;
    }
    P.moving = true; P.p = 0;
    P.fx = P.x; P.fy = P.y; P.tx = P.x + dx; P.ty = P.y + dy;
    P.ms = Input.isDown('b') ? RUN_MS : WALK_MS;
  }

  async function walkEnt(e, dir) {
    const [dx, dy] = DV[dir];
    e.dir = dir; e.moving = true; e.tx = e.x + dx; e.ty = e.y + dy;
    const o = { k: 0 };
    const fx = e.x, fy = e.y;
    await new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        o.k = Math.min(1, (now - t0) / WALK_MS);
        e.px = (fx + dx * o.k) * T; e.py = (fy + dy * o.k) * T;
        if (o.k < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
    e.x = e.tx; e.y = e.ty; e.moving = false; e.step = (e.step || 0) + 1;
  }

  // Moves the player one tile without triggering warps or encounters.
  function stepPlayer(dir) {
    const [dx, dy] = DV[dir];
    return new Promise((res) => Object.assign(P, { dir, moving: true, p: 0, fx: P.x, fy: P.y, tx: P.x + dx, ty: P.y + dy, ms: WALK_MS, scripted: res }));
  }

  async function onStep() {
    const s = S();
    const wp = (map.warps || []).find((w) => w.x === P.x && w.y === P.y);
    if (wp) return warp(wp);
    const tr = (map.triggers || []).find((t) => t.x === P.x && t.y === P.y && !s.flags[t.unless]);
    if (tr) return Story[tr.script](tr);
    for (const e of ents) if (await checkSight(e)) return;
    if (s.repel > 0) {
      s.repel--;
      if (!s.repel) { await UI.say('Your Scrambler wore off.'); return; }
    }
    if (tile(P.x, P.y) === ';' && map.encounters && s.repel <= 0 && Math.random() < .1) {
      const list = map.encounters, total = list.reduce((a, e) => a + e[3], 0);
      let r = Math.random() * total;
      const [sp, lo, hi] = list.find((e) => (r -= e[3]) < 0) || list[0];
      const wild = Mon.create(sp, lo + Math.floor(Math.random() * (hi - lo + 1)));
      await G.battle({ wild, theme: map.theme });
    }
  }

  async function warp(wp) {
    let dest;
    if (wp.to === '$back') dest = { ...S().back };
    else {
      dest = { map: wp.to, x: wp.tx, y: wp.ty, dir: P.dir };
      if (wp.inside) { S().back = { map: mapId, x: wp.x, y: wp.y + 1, dir: 'down' }; dest.dir = 'up'; }
    }
    const isDoor = wp.inside || wp.to === '$back';
    if (isDoor) Sound.play('door');
    await G.fadeOut(isDoor ? 180 : 120);
    load(dest.map, dest.x, dest.y, dest.dir);
    G.autosave();
    await G.fadeIn(isDoor ? 180 : 120);
  }

  async function checkSight(e) {
    const tr = e.trainer;
    if (!tr || !tr.sight || S().flags[defeatKey(e)]) return false;
    const [dx, dy] = DV[e.dir];
    let x = e.x, y = e.y;
    for (let i = 1; i <= tr.sight; i++) {
      x += dx; y += dy;
      if (x === P.x && y === P.y) {
        Sound.play('alert');
        bubbles.push({ e, until: performance.now() + 700 });
        await wait(700);
        while (Math.abs(e.x - P.x) + Math.abs(e.y - P.y) > 1) await walkEnt(e, e.dir);
        P.dir = OPP[e.dir];
        await trainerBattle(e);
        return true;
      }
      const t = tile(x, y);
      if (t === undefined || SOLID.has(t) || entAt(x, y)) return false;
    }
    return false;
  }

  const defeatKey = (e) => `tr_${mapId}_${e.id}`;

  async function trainerBattle(e) {
    const tr = e.trainer;
    await UI.say(tr.before, { name: e.name });
    const roster = typeof tr.team === 'string' ? Story.teams[tr.team]() : tr.team;
    const team = roster.map(([sp, l]) => Mon.create(sp, l));
    const res = await G.battle({ trainer: { name: e.name, look: e.look, team, money: tr.money }, theme: map.theme });
    if (res !== 'win') return res;
    S().flags[defeatKey(e)] = 1;
    if (tr.flag) S().flags[tr.flag] = 1;
    await UI.say(tr.after, { name: e.name });
    if (e.def.hide && S().flags[e.def.hide]) { await G.fadeOut(200); buildEnts(); await G.fadeIn(200); }
    G.autosave();
    return res;
  }

  async function interact() {
    const [dx, dy] = DV[P.dir];
    let x = P.x + dx, y = P.y + dy;
    let e = entAt(x, y);
    if (!e && tile(x, y) === 'C') { x += dx; y += dy; e = entAt(x, y); }
    if (e) return talkTo(e);
    const t = tile(P.x + dx, P.y + dy);
    const sign = (map.signs || {})[`${P.x + dx},${P.y + dy}`];
    if (sign) return UI.say(sign);
    if (t === 'P') return Menus.pc();
    if (t === 'h') return UI.say('A recharge pod. It hums a soft, sleepy chord.');
    if (t === 'B') return UI.say(['Server racks blink in a slow, hypnotic rhythm.', 'A diagnostics rig. The readout says ALL SYSTEMS NOMINAL in six languages.', 'A vending unit. It\'s out of everything except Neon Cola.'][(P.x + P.y) % 3]);
    if (t === '~') return UI.say('The canal glows with chemical runoff. Swimming is not recommended.');
  }

  async function talkTo(e) {
    if (e.kind === 'item') {
      S().flags[`item_${mapId}_${e.id}`] = 1;
      S().bag[e.item] = (S().bag[e.item] || 0) + e.qty;
      ents = ents.filter((x) => x !== e);
      Sound.play('coin');
      return UI.say(`Found ${e.qty > 1 ? e.qty + '× ' : 'a '}${ITEMS[e.item].n.toUpperCase()}!`);
    }
    if (e.kind === 'npc') e.dir = OPP[P.dir];
    if (e.script) return Story[e.script](e);
    if (e.trainer) {
      if (!S().flags[defeatKey(e)]) return trainerBattle(e);
      return UI.say(e.trainer.after, { name: e.name });
    }
    if (e.talk) for (const line of e.talk) await UI.say(line, { name: e.name });
  }

  // ---------- Rendering ----------
  function render(ctx, W, H, t, k) {
    if (!map) return;
    const kk = Math.min(k, 3);
    if (!layer || layerK !== kk) prerender(kk);
    const MW = map.rows[0].length * T, MH = map.rows.length * T;
    let cx = P.px + T / 2 - W / 2, cy = P.py + T / 2 - H / 2;
    cx = MW <= W ? (MW - W) / 2 : Math.max(0, Math.min(MW - W, cx));
    cy = MH <= H ? (MH - H) / 2 : Math.max(0, Math.min(MH - H, cy));
    cx = Math.round(cx * k) / k; cy = Math.round(cy * k) / k;
    ctx.fillStyle = '#05040c'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-cx, -cy);
    ctx.drawImage(layer, 0, 0, MW, MH);

    // animated tiles in view
    const x0 = Math.max(0, Math.floor(cx / T)), x1 = Math.min(map.rows[0].length - 1, Math.ceil((cx + W) / T));
    const y0 = Math.max(0, Math.floor(cy / T)), y1 = Math.min(map.rows.length - 1, Math.ceil((cy + H) / T));
    const frame = Math.floor(t * 8);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const c = tile(x, y);
      if (c === ';') {
        for (let i = 0; i < 4; i++) {
          const r = hash(x, y, frame * 4 + i);
          ctx.fillStyle = i % 2 ? `rgba(255,46,136,${.25 + r * .5})` : `rgba(155,107,255,${.25 + r * .5})`;
          ctx.fillRect(x * T + r * 24, y * T + hash(y, x, frame + i) * 28, 4 + r * 8, 2);
        }
        if (hash(x, y, frame) > .93) { ctx.fillStyle = 'rgba(24,240,255,.5)'; ctx.fillRect(x * T, y * T + hash(x, frame) * T, T, 1); }
      } else if (c === '~') {
        ctx.fillStyle = 'rgba(61,139,255,.35)';
        for (let i = 0; i < 2; i++) {
          const o = (t * 14 + i * 16 + x * 7) % T;
          ctx.fillRect(x * T + o, y * T + 8 + i * 14, 8, 1.4);
        }
      }
    }

    const sprites = ents.map((e) => ({ y: e.py, e }));
    sprites.push({ y: P.py, e: null });
    sprites.sort((a, b) => a.y - b.y);
    for (const s of sprites) {
      if (!s.e) {
        const step = P.moving ? (P.p < .5 ? (P.steps % 2) + 1 : 0) : 0;
        Sprites.drawPerson(ctx, P.px, P.py, P.dir, LOOK.hero, step, t);
        continue;
      }
      const e = s.e;
      if (e.kind === 'item') Sprites.drawOrb(ctx, e.px + 16, e.py + 18, t, '#18f0ff');
      else if (e.kind === 'pod') {
        ctx.save();
        rrect(ctx, e.px + 5, e.py + 2, 22, 24, 8);
        ctx.fillStyle = 'rgba(24,240,255,.08)'; ctx.fill();
        ctx.strokeStyle = TYPES[SPECIES[e.species].t[0]].c; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.restore();
        Sprites.drawBot(ctx, e.species, e.px + 16, e.py + 24, 22, { t });
      } else Sprites.drawPerson(ctx, e.px, e.py, e.dir, e.look, e.moving ? (e.step % 2) + 1 : 0, t);
    }
    const now = performance.now();
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i];
      if (now > b.until) { bubbles.splice(i, 1); continue; }
      rrect(ctx, b.e.px + 9, b.e.py - 18, 14, 16, 3);
      ctx.fillStyle = '#0d0b1e'; ctx.fill();
      ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = '#ffe14d'; ctx.font = '700 12px Tektur, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', b.e.px + 16, b.e.py - 9.5);
    }
    ctx.restore();
  }

  return {
    load, update, render, interact, talkTo, walkEnt, stepPlayer, buildEnts, trainerBattle,
    get map() { return map; }, get mapId() { return mapId; }, get player() { return P; }, get ents() { return ents; },
    entById: (id) => ents.find((e) => e.id === id),
    invalidate() { layer = null; },
    DV, OPP,
  };
})();
