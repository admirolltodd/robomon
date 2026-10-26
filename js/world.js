'use strict';
// Overworld: map loading, tile rendering, movement, NPCs, warps and encounters.

const World = (() => {
  const T = 32;
  const WALK_MS = 170, RUN_MS = 100;
  const DV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

  let map = null, mapId = null, ents = [];
  const P = { x: 0, y: 0, dir: 'down', px: 0, py: 0, moving: false, p: 0, fx: 0, fy: 0, tx: 0, ty: 0, steps: 0, ms: WALK_MS };
  let layers = null, turnT = 0, bumpT = 0;
  const bubbles = [];

  const S = () => G.state;
  const tile = (x, y) => (map.rows[y] || '')[x];

  function visible(def) {
    const f = S().flags;
    if (def.hide && f[def.hide]) return false;
    if (def.show && !f[def.show]) return false;
    if (def.kind === 'pod') return S().starter !== def.species && S().rivalStarter !== def.species;
    if (def.item) return !f[`item_${mapId}_${def.id}`];
    return true;
  }

  function buildEnts() {
    const list = [...(map.npcs || []), ...(map.items || []).map((i) => ({ ...i, kind: 'item' })), ...(map.caches || []).map((c) => ({ ...c, kind: 'cache' }))];
    ents = list.filter(visible).map((d) => ({ ...d, def: d, kind: d.kind || 'npc', px: d.x * T, py: d.y * T, dir: d.dir || 'down', idleT: 2 + Math.random() * 4 }));
  }

  function load(id, x, y, dir) {
    mapId = id; map = MAPS[id];
    Object.assign(P, { x, y, px: x * T, py: y * T, moving: false, dir: dir || P.dir });
    S().map = id; S().x = x; S().y = y; S().dir = P.dir;
    buildEnts();
    layers = null;
    Sound.music(map.music);
    if (map.outdoor || id.startsWith('gym')) UI.banner(map.name, map.sub);
  }

  // ---------- Movement ----------
  const entAt = (x, y) => ents.find((e) => (e.moving ? (e.tx === x && e.ty === y) || (e.x === x && e.y === y) : e.x === x && e.y === y));

  const lasersOn = () => map.lasers && !S().flags[map.lasers];
  function solidAt(x, y) {
    const t = tile(x, y);
    return t === undefined || SOLID.has(t) || (t === 'L' && lasersOn());
  }
  function blocked(x, y) { return solidAt(x, y) || !!entAt(x, y); }

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
    if (wp && wp.need && !s.flags[wp.need]) return Story[wp.deny](wp);
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
      await G.battle({ wild, theme: map.theme, tier: map.lootTier || 0, bg: map.bg || (map.outdoor ? 'city' : 'indoor'), rain: map.rain });
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
      if (solidAt(x, y) || entAt(x, y)) return false;
    }
    return false;
  }

  const defeatKey = (e) => `tr_${mapId}_${e.id}`;

  async function trainerBattle(e) {
    const tr = e.trainer;
    await UI.say(tr.before, { name: e.name });
    const roster = typeof tr.team === 'string' ? Story.teams[tr.team]() : tr.team;
    const team = roster.map(([sp, l, mods]) => Mon.create(sp, l, mods));
    const res = await G.battle({ trainer: { name: e.name, look: e.look, team, money: tr.money }, theme: map.theme, tier: map.lootTier || 0, drops: tr.drops, bg: map.bg || (map.outdoor ? 'city' : 'indoor'), rain: map.rain, music: tr.music });
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
    if (t === 'k') return Story.terminal(map);
    if (t === 'L' && lasersOn()) return UI.say('A security laser grid. It hums like an angry hornet. Find the console that controls it.');
    if (t === 'K') return UI.say(['A pile of busted crates. Something inside is still ticking. Best not.', 'Stacked shipping crates stamped NULL-OBSIDIAN LOGISTICS.', 'Junk. Wet junk. Smells like ozone and old noodles.'][(P.x * 3 + P.y) % 3]);
    if (t === 'l') return UI.say('A flickering streetlamp. Half the city\'s light comes from ads, the other half from these.');
    if (t === 'h') return UI.say('A recharge pod. It hums a soft, sleepy chord.');
    if (t === 'B') return UI.say(['Server racks blink in a slow, hypnotic rhythm.', 'A diagnostics rig. The readout says ALL SYSTEMS NOMINAL in six languages.', 'A vending unit. It\'s out of everything except Neon Cola.'][(P.x + P.y) % 3]);
    if (t === '~') return UI.say('The canal glows with chemical runoff. Swimming is not recommended.');
  }

  async function talkTo(e) {
    if (e.kind === 'cache') {
      const key = `cache_${mapId}_${e.id}`;
      if (S().flags[key]) return UI.say('An empty loot cache. Someone already cleaned it out. That someone was you.');
      S().flags[key] = 1;
      const id = e.mod || Chrome.roll(map.lootTier || 0);
      Chrome.give(id);
      Sound.play('door');
      await UI.say('You pried open a battered milspec loot cache...');
      Sound.play('caught');
      return UI.say(`Inside: ${MODS[id].n.toUpperCase()} (${RARITY[MODS[id].r].n} ${SLOTS[MODS[id].slot].n} module)!\nInstall it from MENU > Chrome.`);
    }
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
    const kk = Math.min(k, 2); // cap baked layers to keep phone memory in check
    if (!layers || layers.k !== kk) layers = Scene.build(map, kk);
    const MW = map.rows[0].length * T, MH = map.rows.length * T;
    let cx = P.px + T / 2 - W / 2, cy = P.py + T / 2 - H / 2;
    cx = MW <= W ? (MW - W) / 2 : Math.max(0, Math.min(MW - W, cx));
    cy = MH <= H ? (MH - H) / 2 : Math.max(0, Math.min(MH - H, cy));
    cx = Math.round(cx * k) / k; cy = Math.round(cy * k) / k;
    ctx.fillStyle = '#030208'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(-cx, -cy);
    ctx.drawImage(layers.tiles, 0, 0, MW, MH);
    const view = {
      x0: Math.max(0, Math.floor(cx / T)), x1: Math.min(map.rows[0].length - 1, Math.ceil((cx + W) / T)),
      y0: Math.max(0, Math.floor(cy / T)), y1: Math.min(map.rows.length - 1, Math.ceil((cy + H) / T)),
    };
    Scene.underlay(ctx, map, layers, view, t);

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
      else if (e.kind === 'cache') Sprites.drawCache(ctx, e.px, e.py, t, !!S().flags[`cache_${mapId}_${e.id}`]);
      else if (e.kind === 'pod') {
        ctx.save();
        rrect(ctx, e.px + 5, e.py + 2, 22, 24, 8);
        ctx.fillStyle = 'rgba(24,240,255,.08)'; ctx.fill();
        ctx.strokeStyle = TYPES[SPECIES[e.species].t[0]].c; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.restore();
        Sprites.drawBot(ctx, e.species, e.px + 16, e.py + 24, 22, { t });
      } else if (e.kind === 'bot') Sprites.drawBot(ctx, e.species, e.px + 16, e.py + 30, e.size || 40, { t, mods: e.mods });
      else Sprites.drawPerson(ctx, e.px, e.py, e.dir, e.look, e.moving ? (e.step % 2) + 1 : 0, t);
    }
    Scene.overlay(ctx, map, layers, { x: cx, y: cy }, W, H, t, { x: P.px + 16, y: P.py + 16 });
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
    if (map.rain) Scene.rain(ctx, W, H, t, map.rain);
  }

  return {
    load, update, render, interact, talkTo, walkEnt, stepPlayer, buildEnts, trainerBattle,
    get map() { return map; }, get mapId() { return mapId; }, get player() { return P; }, get ents() { return ents; },
    entById: (id) => ents.find((e) => e.id === id),
    invalidate() { layers = null; },
    DV, OPP,
  };
})();
