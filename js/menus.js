'use strict';
// Full-screen menus: start menu, party, summary, bag, LinkDex, shop, Cloud Box.

const Menus = (() => {
  const S = () => G.state;

  function hpBar(m) {
    const max = Mon.maxHp(m), r = m.hp / max;
    const c = r > .5 ? '#3dfc8f' : r > .2 ? '#ffc94d' : '#ff3d5a';
    return `<span class="hpbar" aria-hidden="true"><i style="width:${(r * 100).toFixed(1)}%;background:${c}"></i></span>`;
  }

  function typeChips(sp) {
    return SPECIES[sp].t.map((t) => `<span class="chip" style="--tc:${TYPES[t].c}">${TYPES[t].n}</span>`).join('');
  }

  function partyItem(m, i, active) {
    const st = m.hp <= 0 ? '<span class="tag tag-down">DOWN</span>' : m.status ? `<span class="tag" style="--tc:${STATUS[m.status].c}">${STATUS[m.status].tag}</span>` : '';
    const chips = Object.values(m.mods || {}).map((id) => `<i class="pip" style="--tc:${Chrome.color(id)}" title="${esc(MODS[id].n)}"></i>`).join('');
    return {
      icon: m.sp, iconSil: m.hp <= 0 ? '#3a3352' : null, iconMods: m.mods, value: i,
      html: `${esc(Mon.name(m))} ${chips}${i === active ? '<span class="tag tag-act">IN BATTLE</span>' : ''}${st}`,
      sub: `Lv ${m.lvl} · ${m.hp}/${Mon.maxHp(m)} HP ${hpBar(m)}`, subHtml: true,
    };
  }

  // opts: { battle, forced, active, pick, title }
  async function party(opts = {}) {
    for (;;) {
      const p = S().party;
      const i = await UI.menu({
        layout: 'full', title: opts.title || (opts.forced ? 'Send in which bot?' : 'Your bots'), cancel: !opts.forced,
        items: p.map((m, idx) => partyItem(m, idx, opts.active)),
      });
      if (i === null) return null;
      if (opts.pick) return i;
      const m = p[i];
      const actions = opts.battle
        ? [{ label: 'Switch in', value: 'switch', disabled: m.hp <= 0 || i === opts.active }, { label: 'Summary', value: 'sum' }, { label: 'Cancel', value: null }]
        : [{ label: 'Summary', value: 'sum' }, { label: 'Chrome', value: 'chrome' }, { label: 'Move to front', value: 'front', disabled: i === 0 }, { label: 'Cancel', value: null }];
      const a = await UI.menu({ layout: 'side', title: Mon.name(m), cancel: true, items: actions });
      if (a === 'switch') return i;
      if (a === 'sum') await summary(m);
      if (a === 'chrome') await chrome(m);
      if (a === 'front') { p.splice(i, 1); p.unshift(m); }
    }
  }

  function animatedArt(sp, size, opts = {}) {
    const c = document.createElement('canvas');
    c.className = 'art';
    const d = Math.min(3, window.devicePixelRatio || 1);
    c.width = size * d; c.height = size * d;
    c.setAttribute('aria-hidden', 'true');
    const x = c.getContext('2d');
    const draw = (now) => {
      if (!c.isConnected && now > 500) return;
      x.setTransform(d, 0, 0, d, 0, 0);
      x.clearRect(0, 0, size, size);
      Sprites.drawBot(x, sp, size / 2, size * .9, size * .78, { t: now / 1000, ...opts });
      requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
    return c;
  }

  function moveDesc(id) {
    const mv = MOVES[id], bits = [];
    if (mv.p) bits.push(`PWR ${mv.p}`);
    bits.push(`ACC ${mv.a}`);
    const fx = mv.fx;
    if (fx && fx.st) bits.push(`${fx.ch && fx.ch < 1 ? Math.round(fx.ch * 100) + '% ' : ''}${STATUS[fx.st].n.toLowerCase()}`);
    if (fx && fx.foe) bits.push(Object.entries(fx.foe).map(([k, n]) => `foe ${k.toUpperCase()} ${n}`).join(', '));
    if (fx && fx.self) bits.push(Object.entries(fx.self).map(([k, n]) => `${k.toUpperCase()} +${n}`).join(', '));
    if (mv.heal) bits.push('heals 50%');
    if (mv.drain) bits.push('drains HP');
    if (mv.recoil) bits.push('recoil');
    if (mv.pri) bits.push('strikes first');
    if (mv.crit) bits.push('high crit');
    return bits.join(' · ');
  }

  async function summary(m) {
    const sp = SPECIES[m.sp];
    const wrap = document.createElement('div');
    wrap.className = 'sum';
    const art = animatedArt(m.sp, 140, { mods: m.mods });
    const next = m.lvl >= 100 ? '—' : Mon.xpFor(m.lvl + 1) - m.xp;
    wrap.innerHTML = `<div class="sum-top"><div class="sum-art"></div><div class="sum-id">
        <h2>${esc(Mon.name(m))} <small>Lv ${m.lvl}</small></h2>
        <div class="chips">${typeChips(m.sp)}${m.status ? `<span class="tag" style="--tc:${STATUS[m.status].c}">${STATUS[m.status].n}</span>` : ''}</div>
        <dl class="stats">
          <dt>HP</dt><dd>${m.hp}/${Mon.maxHp(m)}</dd>
          <dt>ATK</dt><dd>${Mon.stat(m, 'atk')}</dd>
          <dt>DEF</dt><dd>${Mon.stat(m, 'def')}</dd>
          <dt>SPD</dt><dd>${Mon.stat(m, 'spd')}</dd>
          <dt>NEXT</dt><dd>${next} XP</dd>
        </dl></div></div>
      <p class="dex">${esc(sp.dex)}</p>
      ${chromeList(m)}
      <ul class="moves">${m.moves.map((x) => {
        const mv = MOVES[x.id];
        return `<li style="--tc:${TYPES[mv.t].c}"><strong>${esc(mv.n)}</strong><span class="chip" style="--tc:${TYPES[mv.t].c}">${TYPES[mv.t].n}</span><span class="pp">${x.pp}/${mv.pp} EN</span><small>${moveDesc(x.id)}</small></li>`;
      }).join('')}</ul>`;
    wrap.querySelector('.sum-art').appendChild(art);
    await UI.menu({ layout: 'full', title: 'Summary', cancel: true, header: wrap, items: [{ label: 'Back', value: null }] });
  }

  function chromeList(m) {
    const ids = Object.keys(SLOTS).map((k) => m.mods && m.mods[k]).filter(Boolean);
    if (!ids.length) return '';
    return `<ul class="chrome">${ids.map((id) => `<li style="--tc:${Chrome.color(id)}"><strong>${esc(MODS[id].n)}</strong><small>${esc(Chrome.describe(id))}</small></li>`).join('')}</ul>`;
  }

  function modItem(id, right) {
    const md = MODS[id];
    return { label: md.n, sub: `${SLOTS[md.slot].n} · ${RARITY[md.r].n} · ${Chrome.describe(id)}`, right, value: id, color: Chrome.color(id) };
  }

  const owned = (slot) => Object.keys(MODS).filter((id) => G.state.mods[id] > 0 && (!slot || MODS[id].slot === slot))
    .sort((a, b) => MODS[b].r - MODS[a].r);

  // Install screen for one bot: four slots, each swappable from the stash.
  async function chrome(m) {
    let start = 0;
    for (;;) {
      const wrap = document.createElement('div');
      wrap.className = 'sum';
      wrap.innerHTML = `<div class="sum-top"><div class="sum-art"></div><div class="sum-id">
          <h2>${esc(Mon.name(m))} <small>Lv ${m.lvl}</small></h2>
          <dl class="stats">${['hp', 'atk', 'def', 'spd'].map((k) => {
            const b = Mon.bonus(m, k);
            return `<dt>${k.toUpperCase()}</dt><dd>${k === 'hp' ? Mon.maxHp(m) : Mon.stat(m, k)}${b ? ` <span class="${b > 0 ? 'up' : 'down'}">${b > 0 ? '+' : ''}${Math.round(b * 100)}%</span>` : ''}</dd>`;
          }).join('')}</dl></div></div>`;
      wrap.querySelector('.sum-art').appendChild(animatedArt(m.sp, 140, { mods: m.mods }));
      const slots = Object.keys(SLOTS);
      const pick = await UI.menu({
        layout: 'full', title: 'Chrome', cancel: true, header: wrap, start,
        items: slots.map((k, i) => {
          const id = m.mods && m.mods[k];
          return { label: `${SLOTS[k].n}: ${id ? MODS[id].n : 'empty'}`, sub: id ? Chrome.describe(id) : `${SLOTS[k].hint} · ${owned(k).length ? owned(k).length + ' in stash' : 'nothing in stash'}`, value: i, color: id ? Chrome.color(id) : '#4a4170' };
        }),
      });
      if (pick === null) return;
      start = pick;
      const slot = slots[pick], cur = m.mods && m.mods[slot];
      const items = owned(slot).map((id) => modItem(id, '×' + G.state.mods[id]));
      if (cur) items.unshift({ label: `Remove ${MODS[cur].n}`, sub: 'Return it to your stash', value: '$remove', color: '#ff3d5a' });
      if (!items.length) { await UI.say(`No ${SLOTS[slot].n.toLowerCase()} chrome in your stash. Check loot caches, beat tough Linkers, or visit a ripperdoc.`); continue; }
      const id = await UI.menu({ layout: 'full', title: `${SLOTS[slot].n} slot`, cancel: true, items });
      if (id === null) continue;
      if (id === '$remove') { Mon.uninstall(m, slot); Sound.play('cancel'); continue; }
      Mon.install(m, id);
      Sound.play('buff');
      await UI.say(`${MODS[id].n.toUpperCase()} installed on ${Mon.name(m)}.`);
    }
  }

  // Everything in the stash, with lore, and a shortcut to install.
  async function stash() {
    let start = 0;
    for (;;) {
      const ids = owned();
      if (!ids.length) { await UI.say('Your chrome stash is empty. Loot caches, tough battles and ripperdocs are where modules turn up.'); return; }
      const id = await UI.menu({
        layout: 'full', title: 'Chrome stash', cancel: true, start,
        header: '<p class="money">Modules you own but haven\'t installed</p>',
        items: ids.map((i) => modItem(i, '×' + G.state.mods[i])),
      });
      if (id === null) return;
      start = ids.indexOf(id);
      const md = MODS[id];
      const v = await UI.menu({
        layout: 'full', title: md.n, cancel: true,
        header: `<div class="sum"><p class="label" style="color:${Chrome.color(id)}">${RARITY[md.r].n} ${SLOTS[md.slot].n} module</p>
          <p class="dex">${esc(md.lore)}</p><p class="dex"><strong>${esc(Chrome.describe(id))}</strong></p></div>`,
        items: [{ label: 'Install on a bot', value: 'install' }, { label: 'Back', value: null }],
      });
      if (v !== 'install') continue;
      const t = await party({ pick: true, title: `Install ${md.n} on?` });
      if (t === null) continue;
      const m = G.state.party[t], prev = m.mods && m.mods[md.slot];
      Mon.install(m, id);
      Sound.play('buff');
      await UI.say(`${md.n.toUpperCase()} installed on ${Mon.name(m)}.${prev ? ` ${MODS[prev].n} went back to your stash.` : ''}`);
    }
  }

  function canUse(id, m) {
    const it = ITEMS[id];
    if (it.kind === 'heal') return m.hp > 0 && m.hp < Mon.maxHp(m);
    if (it.kind === 'cure') return m.hp > 0 && !!m.status;
    if (it.kind === 'revive') return m.hp <= 0;
    return false;
  }

  function applyItem(id, m) {
    const it = ITEMS[id];
    if (it.kind === 'heal') {
      const n = Math.min(it.amt, Mon.maxHp(m) - m.hp);
      m.hp += n;
      return `${Mon.name(m)} recovered ${n} HP.`;
    }
    if (it.kind === 'cure') { m.status = null; m.slp = 0; return `${Mon.name(m)}'s faults were cleared.`; }
    if (it.kind === 'revive') { m.hp = Math.floor(Mon.maxHp(m) / 2); m.status = null; return `${Mon.name(m)} rebooted and is back online!`; }
    return '';
  }

  // Battle: returns { id, target } or null. Field: uses the item directly.
  async function bag(opts = {}) {
    for (;;) {
      const ids = Object.keys(ITEMS).filter((id) => S().bag[id] > 0);
      if (!ids.length) { await UI.say('Your bag is empty.'); return null; }
      const id = await UI.menu({
        layout: 'full', title: 'Bag', cancel: true,
        header: `<p class="money">${S().money} CR</p>`,
        items: ids.map((i) => ({
          label: ITEMS[i].n, sub: ITEMS[i].desc, right: '×' + S().bag[i], value: i,
          disabled: opts.battle ? ITEMS[i].use === 'field' : ITEMS[i].use === 'battle',
        })),
      });
      if (id === null) return null;
      const it = ITEMS[id];
      if (opts.battle) {
        if (it.kind === 'ball' || it.kind === 'boost') return { id };
        const t = await party({ pick: true, title: `Use ${it.n} on?` });
        if (t === null) continue;
        if (!canUse(id, S().party[t])) { await UI.say('It won\'t have any effect.'); continue; }
        return { id, target: t };
      }
      if (it.kind === 'repel') {
        S().bag[id]--;
        S().repel = it.steps;
        Sound.play('buff');
        await UI.say(`Scrambler active. Wild bots can't sense you for ${it.steps} steps.`);
        continue;
      }
      const t = await party({ pick: true, title: `Use ${it.n} on?` });
      if (t === null) continue;
      const m = S().party[t];
      if (!canUse(id, m)) { await UI.say('It won\'t have any effect.'); continue; }
      S().bag[id]--;
      Sound.play('heal');
      await UI.say(applyItem(id, m));
    }
  }

  async function dex() {
    const ids = Object.keys(SPECIES);
    const d = S().dex;
    const seen = ids.filter((i) => d.seen[i]).length, caught = ids.filter((i) => d.caught[i]).length;
    let start = 0;
    for (;;) {
      const i = await UI.menu({
        layout: 'full', title: 'LinkDex', cancel: true, start,
        header: `<p class="money">Seen ${seen} · Linked ${caught} · of ${ids.length}</p>`,
        items: ids.map((id, n) => ({
          icon: id, iconSil: d.caught[id] ? null : d.seen[id] ? '#2a2440' : '#120e22', value: n,
          label: `${String(n + 1).padStart(3, '0')}  ${d.seen[id] ? SPECIES[id].n.toUpperCase() : '???'}`,
          sub: d.caught[id] ? SPECIES[id].t.map((t) => TYPES[t].n).join(' / ') : d.seen[id] ? 'Seen' : '',
          disabled: !d.seen[id],
        })),
      });
      if (i === null) return;
      start = i;
      const id = ids[i];
      const wrap = document.createElement('div');
      wrap.className = 'sum';
      wrap.innerHTML = `<div class="sum-top"><div class="sum-art"></div><div class="sum-id">
          <h2>${SPECIES[id].n.toUpperCase()} <small>#${String(i + 1).padStart(3, '0')}</small></h2>
          <div class="chips">${d.caught[id] ? typeChips(id) : ''}</div></div></div>
        <p class="dex">${d.caught[id] ? esc(SPECIES[id].dex) : 'Not enough link data. Link with one to unlock its entry.'}</p>`;
      wrap.querySelector('.sum-art').appendChild(animatedArt(id, 140, { sil: d.caught[id] ? null : '#2a2440' }));
      await UI.menu({ layout: 'full', title: 'LinkDex', cancel: true, header: wrap, items: [{ label: 'Back', value: null }] });
    }
  }

  async function card() {
    const s = S();
    const mins = Math.floor(s.time / 60);
    const keys = [['badge1', 'Chrome Key', '#a9b8d6'], ['badge2', 'Pulse Key', '#ffe14d']];
    const html = `<div class="card">
      <p class="card-name">${esc(s.name)}</p>
      <dl class="stats">
        <dt>Credits</dt><dd>${s.money} CR</dd>
        <dt>LinkDex</dt><dd>${Object.keys(s.dex.caught).length} linked</dd>
        <dt>Play time</dt><dd>${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m</dd>
      </dl>
      <p class="label">Node Keys</p>
      <div class="keys">${keys.map(([f, n, c]) => `<span class="key ${s.flags[f] ? 'got' : ''}" style="--tc:${c}">${n}</span>`).join('')}
        ${Array.from({ length: 6 }, () => '<span class="key">?</span>').join('')}</div></div>`;
    await UI.menu({ layout: 'full', title: 'Linker card', cancel: true, header: html, items: [{ label: 'Back', value: null }] });
  }

  async function settings() {
    for (;;) {
      const o = S().opts;
      const v = await UI.menu({
        layout: 'side', title: 'Settings', cancel: true,
        items: [
          { label: `Sound effects: ${o.sfx ? 'On' : 'Off'}`, value: 'sfx' },
          { label: `Music: ${o.music ? 'On' : 'Off'}`, value: 'music' },
          { label: `Text speed: ${o.fast ? 'Fast' : 'Normal'}`, value: 'fast' },
          { label: `Rain and screen FX: ${o.fx !== false ? 'On' : 'Off'}`, value: 'fx' },
          { label: 'Done', value: null },
        ],
      });
      if (v === null) return;
      o[v] = v === 'fx' ? o.fx === false : !o[v];
      G.applyOpts();
    }
  }

  async function start() {
    const s = S();
    const items = [
      { label: 'Bots', value: 'bots', disabled: !s.party.length },
      { label: 'Bag', value: 'bag' },
      { label: 'Chrome', value: 'chrome' },
      { label: 'LinkDex', value: 'dex', disabled: !s.flags.dex },
      { label: s.name, value: 'card' },
      { label: 'Save', value: 'save' },
      { label: 'Settings', value: 'settings' },
      { label: 'Close', value: null },
    ];
    let last = 0;
    for (;;) {
      const v = await UI.menu({ layout: 'side', cancel: true, items, start: last });
      if (v === null) return;
      last = items.findIndex((i) => i.value === v);
      if (v === 'bots') await party();
      if (v === 'bag') await bag();
      if (v === 'chrome') await stash();
      if (v === 'dex') await dex();
      if (v === 'card') await card();
      if (v === 'settings') await settings();
      if (v === 'save') { await G.save(); Sound.play('coin'); await UI.say('Progress saved to your Link Band.'); }
    }
  }

  async function shop() {
    const tier = (S().flags.badge1 ? 1 : 0) + (S().flags.badge2 ? 1 : 0);
    const stock = SHOP_STOCK.slice(0, tier + 1).flat();
    await UI.say('Welcome to NanoMart! What can I print for you?', { name: 'CLERK' });
    for (;;) {
      const id = await UI.menu({
        layout: 'full', title: 'NanoMart', cancel: true,
        header: `<p class="money">${S().money} CR</p>`,
        items: stock.map((i) => ({ label: ITEMS[i].n, sub: ITEMS[i].desc, right: ITEMS[i].price + ' CR', value: i, disabled: ITEMS[i].price > S().money })),
      });
      if (id === null) break;
      const price = ITEMS[id].price;
      const qty = await UI.menu({
        layout: 'side', title: `How many ${ITEMS[id].n}?`, cancel: true,
        items: [1, 5, 10].map((n) => ({ label: `×${n}`, right: n * price + ' CR', value: n, disabled: n * price > S().money })),
      });
      if (!qty) continue;
      S().money -= qty * price;
      S().bag[id] = (S().bag[id] || 0) + qty;
      Sound.play('coin');
      await UI.say(`Printed ${qty} ${ITEMS[id].n}${qty > 1 ? 's' : ''}. Thanks!`, { name: 'CLERK' });
    }
    await UI.say('Come back soon. Stay charged!', { name: 'CLERK' });
  }

  async function pc() {
    Sound.play('select');
    await UI.say('You booted up the Cloud Box terminal.');
    for (;;) {
      const v = await UI.menu({
        layout: 'side', title: `Cloud Box · ${S().box.length} stored`, cancel: true,
        items: [{ label: 'Withdraw a bot', value: 'w' }, { label: 'Deposit a bot', value: 'd' }, { label: 'Log off', value: null }],
      });
      if (v === null) return;
      if (v === 'd') {
        const i = await party({ pick: true, title: 'Deposit which bot?' });
        if (i === null) continue;
        const p = S().party;
        if (p.filter((m, n) => n !== i && m.hp > 0).length === 0) { await UI.say('You need at least one functional bot with you!'); continue; }
        S().box.push(p.splice(i, 1)[0]);
        Sound.play('door');
        await UI.say(`${Mon.name(S().box[S().box.length - 1])} was uploaded to the Cloud Box.`);
      } else {
        if (!S().box.length) { await UI.say('The Cloud Box is empty.'); continue; }
        if (S().party.length >= 6) { await UI.say('Your party is full.'); continue; }
        const i = await UI.menu({
          layout: 'full', title: 'Withdraw which bot?', cancel: true,
          items: S().box.map((m, n) => partyItem(m, n, -1)),
        });
        if (i === null) continue;
        const m = S().box.splice(i, 1)[0];
        S().party.push(m);
        Sound.play('door');
        await UI.say(`${Mon.name(m)} downloaded to your party.`);
      }
    }
  }

  return { start, party, summary, chrome, stash, bag, dex, shop, pc, applyItem, canUse, modItem };
})();
