'use strict';
// The Deep Net: an endless roguelite arcade behind the terminal in the Afterglow.
// You jack in with two drafted data-ghost bots and fight ICE daemons floor after floor, with a
// Sysop boss every fifth floor, whose defeat fully patches the crew. Damage carries over, with a
// partial patch between fights. Every
// third win you draft one of three offers: a new ghost, a chrome install, an overclock or a full
// patch. The run ends when your ghosts flatline or you jack out; you keep the Salvage and the score.
//
// Everything that decides a run (floors, drafts, offers, rest) is a pure function of the run seed,
// with no UI, so tools/sim.js can play hundreds of runs headless. The UI half is `terminal()`.
// Your real party, bag and dex are never touched: the crew stands in for the party during a run.

const DeepNet = (() => {
  const START_LVL = 20, CREW_MAX = 3, DRAFT_EVERY = 3, BOSS_EVERY = 5, REST = .35;
  const ENVS = [null, null, 'servers', 'rain', 'kernel'];
  // Species ranked by total base stats. Early floors draw daemons from the weaker end and widen as
  // you climb; starting ghosts come from the middle of the pack.
  let ranked = null;
  const byPower = () => ranked || (ranked = Object.keys(SPECIES).filter((id) => !SPECIES[id].legend).sort((a, b) => SPECIES[a].b.reduce((x, y) => x + y) - SPECIES[b].b.reduce((x, y) => x + y) || (a < b ? -1 : 1)));
  const pool = (from = 0, to = 1) => { const all = byPower(); return all.slice(Math.floor(all.length * from), Math.ceil(all.length * to)); };
  const daemonPool = (f) => pool(0, Math.min(1, .35 + f * .05));
  const chromePool = (slot) => Object.keys(MODS).filter((id) => !MODS[id].noRoll && (!slot || MODS[id].slot === slot));

  // An independent, reproducible random stream for each (seed, purpose, index).
  const rngFor = (seed, a, b = 0) => Engine.rng((seed ^ Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)) | 0);
  const pick = (r, list) => list[Math.floor(r() * list.length)];

  // A bot with seeded stat rolls, so the same seed always builds the same bot.
  function ghost([sp, lvl, mods], r) {
    return Mon.create(sp, lvl, mods, { hp: Math.floor(r() * 16), atk: Math.floor(r() * 16), def: Math.floor(r() * 16), spd: Math.floor(r() * 16) });
  }

  // Random chrome inside the plain RAM budget: daemons never redline either.
  function chromeFor(lvl, r, chance) {
    const mods = {};
    for (const slot of Object.keys(SLOTS)) {
      if (r() >= chance) continue;
      const id = pick(r, chromePool(slot));
      if (Chrome.ramOf(mods) + Chrome.ram(id) <= Chrome.maxRam(lvl)) mods[slot] = id;
    }
    return mods;
  }

  // Loot-tier rarity roll on the run's own stream (Chrome.roll uses Math.random).
  function rollMod(r, tier) {
    const w = LOOT_TIERS[Math.max(0, Math.min(3, tier))];
    let x = r() * w.reduce((a, b) => a + b, 0), rarity = 0;
    while ((x -= w[rarity]) >= 0) rarity++;
    for (; rarity >= 0; rarity--) {
      const ids = chromePool().filter((id) => MODS[id].r === rarity);
      if (ids.length) return pick(r, ids);
    }
    return 'servo';
  }

  // Floor f (1-based): who you fight, how strong, and in which arena.
  function floor(seed, f) {
    const r = rngFor(seed, 1, f), boss = f % BOSS_EVERY === 0;
    const lvl = Math.min(70, 16 + f) + (boss ? 1 : 0);
    const n = boss ? (f < 10 ? 2 : 3) : 1 + (f >= 6) + (f >= 16);
    const chance = Math.min(.95, .15 + f * .06 + (boss ? .2 : 0));
    const team = Array.from({ length: n }, () => {
      const l = lvl + Math.floor(r() * 3) - 1;
      return [pick(r, daemonPool(f)), l, chromeFor(l, r, chance)];
    });
    return { f, boss, team, env: pick(r, ENVS), name: boss ? 'BLACK ICE SYSOP' : `ICE DAEMON v${f}.${Math.floor(r() * 10)}` };
  }
  const daemons = (seed, fl) => { const r = rngFor(seed, 2, fl.f); return fl.team.map((d) => ghost(d, r)); };

  // Three ghosts to choose from when jacking in (round 0 and 1), never repeating the crew.
  function starters(seed, round, crew) {
    const r = rngFor(seed, 3, round), taken = new Set(crew.map((m) => m.sp)), out = [];
    while (out.length < 3) {
      const sp = pick(r, pool(.3, .8));
      if (!taken.has(sp)) { taken.add(sp); out.push([sp, START_LVL, {}]); }
    }
    return out;
  }
  const recruit = (seed, round, def) => ghost(def, rngFor(seed, 4, round));

  const avgLvl = (crew) => Math.round(crew.reduce((a, m) => a + m.lvl, 0) / crew.length);

  // The draft after every third win: three distinct offers.
  function offers(seed, wins, crew) {
    const r = rngFor(seed, 5, wins), all = [];
    if (crew.length < CREW_MAX) {
      const taken = new Set(crew.map((m) => m.sp));
      let sp = pick(r, pool(.3, .9));
      for (let i = 0; i < 8 && taken.has(sp); i++) sp = pick(r, pool(.3, .9));
      all.push({ kind: 'recruit', def: [sp, avgLvl(crew), {}] });
    }
    for (let i = 0; i < 10; i++) { // chrome that one of the crew can run without redlining
      const id = rollMod(r, Math.floor(wins / 6)), target = Math.floor(r() * crew.length), m = crew[target];
      if (m.mods[MODS[id].slot] !== id && Mon.ramWith(m, id) <= Mon.maxRam(m)) { all.push({ kind: 'chrome', id, target }); break; }
    }
    all.push({ kind: 'overclock', levels: 4 }, { kind: 'patch' });
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    return all.slice(0, 3);
  }

  function levelUp(m, n) {
    const before = Mon.maxHp(m);
    m.lvl = Math.min(100, m.lvl + n);
    m.xp = Mon.xpFor(m.lvl);
    if (m.hp > 0) m.hp += Mon.maxHp(m) - before;
    m.moves = Mon.movesAt(m.sp, m.lvl);
  }

  function apply(seed, wins, crew, o) {
    if (o.kind === 'recruit') crew.push(recruit(seed, 10 + wins, o.def));
    else if (o.kind === 'chrome') {
      const m = crew[o.target], before = Mon.maxHp(m);
      m.mods[MODS[o.id].slot] = o.id;
      if (m.hp > 0) m.hp = Math.max(1, Math.min(Mon.maxHp(m), m.hp + Mon.maxHp(m) - before));
    } else if (o.kind === 'overclock') crew.forEach((m) => levelUp(m, o.levels));
    else if (o.kind === 'patch') crew.forEach(Mon.heal);
  }

  // Between fights: a 35% patch for every ghost still standing (a full one after a Sysop), full
  // energy, faults cleared.
  function rest(crew, boss) {
    for (const m of crew) {
      if (m.hp > 0) m.hp = Math.min(Mon.maxHp(m), m.hp + Math.ceil(Mon.maxHp(m) * (boss ? 1 : REST)));
      m.status = null; m.slp = 0;
      m.moves.forEach((mv) => { mv.pp = MOVES[mv.id].pp; });
    }
  }

  const reward = (wins, bosses) => wins * 2 + Math.floor(wins / DRAFT_EVERY) * 3 + bosses * 10;

  // ---------- The terminal (UI) ----------

  const describe = (o, crew) => {
    if (o.kind === 'recruit') { const s = SPECIES[o.def[0]]; return { label: `Recruit ${s.n}`, sub: `${s.t.map((t) => TYPES[t].n).join('/')} · Lv ${o.def[1]} · joins the crew`, color: TYPES[s.t[0]].c }; }
    if (o.kind === 'chrome') return { label: `${MODS[o.id].n} → ${Mon.name(crew[o.target])}`, sub: `${RARITY[MODS[o.id].r].n} ${SLOTS[MODS[o.id].slot].n} · ${Chrome.describe(o.id)}`, color: Chrome.color(o.id) };
    if (o.kind === 'overclock') return { label: `Overclock: +${o.levels} levels`, sub: 'Every ghost in the crew levels up', color: '#ffe14d' };
    return { label: 'Full patch', sub: 'Restore every ghost, shut-down ones included', color: '#3dfc8f' };
  };
  const ghostItem = ([sp, lvl], i) => ({ label: SPECIES[sp].n, sub: `${SPECIES[sp].t.map((t) => TYPES[t].n).join('/')} · Lv ${lvl}`, value: i, color: TYPES[SPECIES[sp].t[0]].c });

  async function jackIn() {
    const s = G.state, seed = Math.floor(Math.random() * 2 ** 31), crew = [];
    await Tutorial.tip('deepnet');
    for (let round = 0; round < 2; round++) {
      const defs = starters(seed, round, crew);
      const i = await UI.menu({ layout: 'full', title: `Draft a data ghost (${round + 1}/2)`, header: '<p class="money">Your crew for this run. They exist only in the Deep Net.</p>', items: defs.map(ghostItem) });
      crew.push(recruit(seed, round, defs[i]));
    }
    let wins = 0, bosses = 0, end = 'lose';
    G.borrowParty(crew);
    try {
      for (;;) {
        const fl = floor(seed, wins + 1);
        Sound.play('alert');
        await UI.say(`FLOOR ${fl.f}${fl.boss ? ' · SYSOP NODE' : ''}\n${fl.name} is compiling...`, { name: 'DEEP NET' });
        const res = await G.battle({
          trainer: { name: fl.name, look: LOOK.daemon, team: daemons(seed, fl), money: 0 },
          deepnet: true, noBlackout: true, env: fl.env, bg: 'core', theme: fl.boss ? '#ff2e55' : '#18f0ff', music: fl.boss ? 'gym' : 'battle',
        });
        if (res !== 'win') { end = res; break; }
        wins++;
        if (fl.boss) bosses++;
        if (!crew.some((m) => m.hp > 0)) break; // won on a double KO, with nobody left standing
        rest(crew, fl.boss);
        if (fl.boss) await UI.say('SYSOP DOWN. The node\'s cache floods your crew with repair code.', { name: 'DEEP NET' });
        if (wins % DRAFT_EVERY === 0) {
          const list = offers(seed, wins, crew);
          const k = await UI.menu({ layout: 'full', title: `Draft · ${wins} floors cleared`, header: '<p class="money">Pick one upgrade for the crew.</p>', items: list.map((o, i) => ({ ...describe(o, crew), value: i })) });
          apply(seed, wins, crew, list[k]);
          Sound.play('buff');
        }
      }
    } finally {
      G.returnParty();
    }
    const salvage = reward(wins, bosses), dn = s.deepnet;
    s.salvage += salvage;
    dn.runs++;
    const best = wins > dn.best;
    dn.best = Math.max(dn.best, wins);
    dn.top = [...dn.top, { wins, crew: crew.map((m) => m.sp), at: Date.now() }].sort((a, b) => b.wins - a.wins || a.at - b.at).slice(0, 5);
    Sound.play(best ? 'victory' : 'door');
    await UI.say(`${end === 'jackout' ? 'You jacked out.' : 'Your ghosts flatlined. Connection lost.'}\nFloors cleared: ${wins}${best ? ' · NEW BEST' : ''}\nSalvage recovered: ${salvage}`, { name: 'DEEP NET' });
    if (salvage) Tutorial.later('salvage');
    await G.save();
  }

  async function scores() {
    const dn = G.state.deepnet;
    const rows = dn.top.length ? dn.top.map((t, i) => `<li><strong>${i + 1}. ${t.wins} floors</strong> <small>${t.crew.map((sp) => esc(SPECIES[sp].n)).join(' · ')}</small></li>`).join('') : '<li><small>No runs yet. Jack in.</small></li>';
    await UI.menu({ layout: 'full', title: 'Deep Net · high scores', cancel: true, header: `<p class="money">${dn.runs} runs · best ${dn.best} floors</p><ul class="chrome">${rows}</ul>`, items: [{ label: 'Back', value: null }] });
  }

  async function terminal() {
    Sound.play('select');
    for (;;) {
      const v = await UI.menu({
        layout: 'side', title: 'DEEP NET TERMINAL', cancel: true,
        items: [{ label: 'Jack in', sub: `Best: ${G.state.deepnet.best} floors`, value: 'run', color: '#18f0ff' }, { label: 'High scores', value: 'scores' }, { label: 'Log off', value: null }],
      });
      if (v === 'run') return jackIn();
      if (v === 'scores') await scores();
      else return;
    }
  }

  return { floor, daemons, starters, recruit, offers, apply, rest, reward, ghost, terminal, DRAFT_EVERY, BOSS_EVERY };
})();
