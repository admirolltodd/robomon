'use strict';
// Robomon instances: creation, stats, experience and moves.

const Mon = (() => {
  const rnd = (n) => Math.floor(Math.random() * n);
  const xpFor = (lvl) => (lvl <= 1 ? 0 : lvl * lvl * lvl);

  function movesAt(sp, lvl) {
    const list = LEARN[SPECIES[sp].line].filter(([l]) => l <= lvl).map(([, m]) => m);
    return [...new Set(list)].slice(-4).map((id) => ({ id, pp: MOVES[id].pp }));
  }

  function create(sp, lvl, mods) {
    const m = {
      sp, lvl, xp: xpFor(lvl),
      iv: { hp: rnd(16), atk: rnd(16), def: rnd(16), spd: rnd(16) },
      moves: movesAt(sp, lvl), status: null, slp: 0, hp: 0, mods: { ...(mods || {}) },
    };
    m.hp = maxHp(m);
    return m;
  }

  const KEYS = ['hp', 'atk', 'def', 'spd'];
  function base(m, k) { return SPECIES[m.sp].b[KEYS.indexOf(k)]; }
  // Sum of installed module bonuses for one stat, as a fraction.
  function bonus(m, k) {
    let b = 0;
    for (const id of Object.values(m.mods || {})) if (id && MODS[id].st && MODS[id].st[k]) b += MODS[id].st[k];
    return b;
  }
  function has(m, ab) { return Object.values(m.mods || {}).some((id) => id && MODS[id].ab === ab); }
  function maxHp(m) { return Math.floor((Math.floor((2 * base(m, 'hp') + m.iv.hp) * m.lvl / 100) + m.lvl + 10) * (1 + bonus(m, 'hp'))); }
  function stat(m, k) { return Math.floor((Math.floor((2 * base(m, k) + m.iv[k]) * m.lvl / 100) + 5) * (1 + bonus(m, k))); }

  // Installs a module from the stash, returning whatever was in that slot to the stash.
  function install(m, id) {
    const slot = MODS[id].slot, stash = G.state.mods;
    const before = maxHp(m);
    m.mods = m.mods || {};
    if (m.mods[slot]) stash[m.mods[slot]] = (stash[m.mods[slot]] || 0) + 1;
    stash[id]--;
    m.mods[slot] = id;
    m.hp = Math.max(m.hp > 0 ? 1 : 0, Math.min(maxHp(m), m.hp + maxHp(m) - before));
  }
  function uninstall(m, slot) {
    const id = m.mods && m.mods[slot];
    if (!id) return;
    const before = maxHp(m);
    G.state.mods[id] = (G.state.mods[id] || 0) + 1;
    delete m.mods[slot];
    m.hp = Math.max(m.hp > 0 ? 1 : 0, Math.min(maxHp(m), m.hp + maxHp(m) - before));
  }

  function name(m) { return SPECIES[m.sp].n.toUpperCase(); }

  function heal(m) {
    m.hp = maxHp(m);
    m.status = null; m.slp = 0;
    m.moves.forEach((mv) => { mv.pp = MOVES[mv.id].pp; });
  }

  // Adds XP and returns the list of levels reached (may be empty).
  function addXp(m, amount) {
    const levels = [];
    m.xp += amount;
    while (m.lvl < 100 && m.xp >= xpFor(m.lvl + 1)) {
      const before = maxHp(m);
      m.lvl++;
      if (m.hp > 0) m.hp += maxHp(m) - before;
      levels.push(m.lvl);
    }
    return levels;
  }

  function newMoves(m, lvl) {
    return LEARN[SPECIES[m.sp].line].filter(([l]) => l === lvl).map(([, id]) => id);
  }

  function canEvolve(m) {
    const e = SPECIES[m.sp].evo;
    return e && m.lvl >= e.lvl && m.hp > 0 ? e.to : null;
  }

  function xpProgress(m) {
    if (m.lvl >= 100) return 1;
    const a = xpFor(m.lvl), b = xpFor(m.lvl + 1);
    return Math.max(0, Math.min(1, (m.xp - a) / (b - a)));
  }

  return { create, maxHp, stat, bonus, has, install, uninstall, name, heal, addXp, newMoves, canEvolve, xpFor, xpProgress, movesAt };
})();
