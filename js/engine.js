'use strict';
// Deterministic battle rules. No DOM, UI, Sound, G or Menus: this file decides what happens and
// js/battle.js decides how it looks. Same seed + same actions = same battle, byte for byte, which
// is what tools/sim.js checks and what lockstep link battles will rely on.
//
//   const st = Engine.create({ seed, me: { team }, foe: { team, trainer: name } });  // no trainer = wild
//   Engine.start(st)                        -> { events }       opening send-outs
//   Engine.step(st, { me: act, foe: act })  -> { events, need, result }
//   Engine.replace(st, side, index)         -> { events }       after a shut-down, when `need` asks
//   Engine.ai(st, side)                     -> act              the CPU's choice
//
// Actions: { type: 'move', moveIndex } (null = Desperation) | { type: 'switch', index }
//   | { type: 'item', id, target } | { type: 'link', id } | { type: 'run' }
// Events (plain JSON, in play order):
//   msg { text, auto }          auto: ms before it moves on; 0 = wait for a press. Optional sfx.
//   anim { kind, side, move? }  kind: hit | status | heal | buff | debuff | salvo | dodge
//   hp { side, hp }             animate to this HP. Optional sfx, shake, blink.
//   status { side, status }     status tag changed (null = cleared)
//   faint { side, participants? }  for the foe: my team indices that earned XP
//   recall { side } · send { side, index, text, hp, status } · capture { shakes } · end { result }
// `need` lists sides that must pick a replacement (Engine.replace) before the next step.
// The engine mutates the mons it is given (HP, PP, status persist after battle, as in the
// handheld games). The host may change mons between steps (XP, new moves); link battles must not.
// Chrome abilities are always checked through `active()` so later systems can switch them off.

const Engine = (() => {
  const STAT_N = { atk: 'ATTACK', def: 'DEFENSE', spd: 'SPEED' };
  const other = (side) => (side === 'me' ? 'foe' : 'me');

  // Mulberry32: tiny, fast, good enough for dice. State lives on `st.r` so a battle can be cloned.
  function rand(st) {
    let t = (st.r = (st.r + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rng(seed) { const st = { r: seed | 0 }; return () => rand(st); }

  const newSide = (team, active) => ({ team, active, stg: { atk: 0, def: 0, spd: 0 }, fresh: true, endured: false });

  function create({ seed, me, foe }) {
    return {
      seed: seed | 0, r: seed | 0, trainer: foe.trainer || null, turn: 0, runs: 0, result: null, part: [],
      sides: { me: newSide(me.team, -1), foe: newSide(foe.team, -1) },
    };
  }

  const mon = (st, side) => { const s = st.sides[side]; return s.team[s.active]; };
  const active = (st, side, ab) => Mon.has(mon(st, side), ab);
  const label = (st, side) => (side === 'foe' ? (st.trainer ? 'Foe ' : 'Wild ') : '') + Mon.name(mon(st, side));
  const firstAlive = (st, side) => st.sides[side].team.findIndex((m) => m.hp > 0);
  const stageMult = (s) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));
  function eff(st, side, k) {
    const s = st.sides[side];
    let v = Mon.stat(mon(st, side), k) * stageMult(s.stg[k]);
    if (k === 'spd' && mon(st, side).status === 'par') v *= .5;
    return v;
  }

  // ---------- Building blocks. Each pushes events onto `ev`. ----------
  function send(st, ev, side, index, text) {
    const s = st.sides[side];
    Object.assign(s, newSide(s.team, index));
    const m = s.team[index];
    ev.push({ type: 'send', side, index, text, hp: m.hp, status: m.status });
    if (side === 'me' && !st.part.includes(index)) st.part.push(index);
    const foe = st.sides[other(side)].active >= 0 ? mon(st, other(side)) : null;
    if (active(st, side, 'salvo') && foe && foe.hp > 1) {
      ev.push({ type: 'msg', text: `${label(st, side)}'s micro-missiles opened fire!`, auto: 700 });
      ev.push({ type: 'anim', kind: 'salvo', side });
      foe.hp = Math.max(1, foe.hp - Math.max(1, Math.floor(Mon.maxHp(foe) / 8)));
      ev.push({ type: 'hp', side: other(side), hp: foe.hp, sfx: 'hit', shake: 6, blink: true });
    }
  }
  const sendText = (st, side, index) => {
    const m = st.sides[side].team[index];
    return side === 'me' ? `Go, ${Mon.name(m)}!` : `${st.trainer} sent out ${Mon.name(m)}!`;
  };

  function applyStatus(st, ev, side, status, quiet) {
    const m = mon(st, side), types = SPECIES[m.sp].t;
    const fail = (text) => { if (!quiet) ev.push({ type: 'msg', text, auto: 1000 }); };
    if (m.status || m.hp <= 0) return fail('But it failed!');
    if ((status === 'brn' && (types.includes('PLASMA') || active(st, side, 'noBrn')))
      || (status === 'psn' && (types.includes('VIRUS') || types.includes('STEEL') || active(st, side, 'noPsn')))
      || (status === 'par' && (types.includes('VOLT') || active(st, side, 'noPar')))) return fail(`It doesn't affect ${label(st, side)}...`);
    m.status = status;
    if (status === 'slp') m.slp = 1 + Math.floor(rand(st) * 3);
    ev.push({ type: 'status', side, status });
    const L = label(st, side);
    ev.push({ type: 'msg', sfx: 'status', auto: 1000, text: { brn: `${L} overheated!`, par: `${L} short-circuited! It may be unable to move!`, psn: `${L} got infected!`, slp: `${L} went into standby mode!` }[status] });
  }

  function changeStats(st, ev, side, changes) {
    for (const [k, n] of Object.entries(changes)) {
      const s = st.sides[side], before = s.stg[k];
      s.stg[k] = Math.max(-6, Math.min(6, before + n));
      if (s.stg[k] === before) { ev.push({ type: 'msg', text: `${label(st, side)}'s ${STAT_N[k]} won't go any ${n > 0 ? 'higher' : 'lower'}!`, auto: 1000 }); continue; }
      ev.push({ type: 'anim', kind: n > 0 ? 'buff' : 'debuff', side });
      ev.push({ type: 'msg', text: `${label(st, side)}'s ${STAT_N[k]} ${Math.abs(n) > 1 ? 'sharply ' : ''}${n > 0 ? 'rose' : 'fell'}!`, auto: 1000 });
    }
  }

  function useMove(st, ev, side, slot) {
    const def = st.sides[other(side)];
    const m = mon(st, side), dm = mon(st, other(side));
    const say = (text, auto = 1000, sfx) => ev.push(sfx ? { type: 'msg', text, auto, sfx } : { type: 'msg', text, auto });
    const L = () => label(st, side), DL = () => label(st, other(side));
    if (m.hp <= 0) return;
    if (m.status === 'slp') {
      m.slp--;
      if (m.slp > 0) return say(`${L()} is on standby.`, 1000, 'status');
      m.status = null;
      ev.push({ type: 'status', side, status: null });
      say(`${L()} rebooted!`);
    }
    if (m.status === 'par' && rand(st) < .25) return say(`${L()} is shorted out! It can't move!`, 1000, 'status');

    let id = 'struggle';
    if (slot !== null && slot !== undefined && m.moves[slot] && m.moves[slot].pp > 0) { id = m.moves[slot].id; m.moves[slot].pp--; }
    const mv = MOVES[id];
    say(`${L()} used ${mv.n.toUpperCase()}!`, 700);

    const sure = active(st, side, 'trueshot') || (mv.p === 0 && active(st, side, 'netrun'));
    if (!sure && rand(st) * 100 >= mv.a) return say('But it missed!');

    if (mv.p > 0) {
      const mult = typeMult(mv.t, SPECIES[dm.sp].t);
      if (mult === 0) return say(`It doesn't affect ${DL()}...`);
      if (active(st, other(side), 'dodge') && rand(st) < .15) {
        ev.push({ type: 'anim', kind: 'dodge', side: other(side) });
        return say(`${DL()} shimmered out of the way!`);
      }
      ev.push({ type: 'anim', kind: 'hit', side, move: id });
      const critP = (mv.crit ? .25 : 1 / 16) * (active(st, side, 'keen') ? 2 : 1) + (active(st, side, 'critUp') ? .1 : 0);
      const crit = rand(st) < critP;
      const berserk = active(st, side, 'berserk') && m.hp < Mon.maxHp(m) / 3 ? 1.5 : 1;
      const A = eff(st, side, 'atk') * (m.status === 'brn' ? .5 : 1) * berserk;
      const D = eff(st, other(side), 'def') * (active(st, side, 'pierce') ? .7 : 1);
      const stab = SPECIES[m.sp].t.includes(mv.t) ? 1.5 : 1;
      const chrome = (mult > 1 && active(st, side, 'exploit') ? 1.25 : 1) * ((mv.t === 'VIRUS' || mv.t === 'PSI') && active(st, side, 'netrun') ? 1.25 : 1);
      let dmg = Math.floor(Math.floor(Math.floor(2 * m.lvl / 5 + 2) * mv.p * A / D) / 50) + 2;
      dmg = Math.max(1, Math.floor(dmg * stab * mult * chrome * (crit ? 1.5 : 1) * (.85 + rand(st) * .15)));
      dmg = Math.min(dmg, dm.hp);
      let endured = false;
      if (dmg >= dm.hp && dm.hp > 1 && !def.endured && active(st, other(side), 'endure')) { dmg = dm.hp - 1; def.endured = endured = true; }
      dm.hp -= dmg;
      ev.push({ type: 'hp', side: other(side), hp: dm.hp, sfx: crit || mult > 1 ? 'crit' : mult < 1 ? 'weak' : 'hit', shake: crit || mult > 1 ? 9 : 4, blink: true });
      if (crit) say('A critical hit!');
      if (mult > 1) say('It\'s super effective!');
      else if (mult < 1) say('It\'s not very effective...');
      if (berserk > 1) say(`${L()}'s Berserk Protocol is redlining!`, 700);
      if (endured) say(`${DL()}'s Second Heart kicked in! It's hanging on with 1 HP!`, 1000, 'alert');
      if (dm.hp > 0 && active(st, side, 'shock') && rand(st) < .15) applyStatus(st, ev, other(side), 'par', true);
      if (mv.drain && m.hp > 0) {
        m.hp = Math.min(Mon.maxHp(m), m.hp + Math.max(1, Math.floor(dmg * mv.drain)));
        ev.push({ type: 'hp', side, hp: m.hp });
        say(`${L()} siphoned energy!`);
      }
      if (mv.recoil) {
        m.hp = Math.max(0, m.hp - Math.max(1, Math.floor(dmg * mv.recoil)));
        ev.push({ type: 'hp', side, hp: m.hp });
        say(`${L()} took recoil damage!`);
      }
      if (mv.fx && dm.hp > 0 && rand(st) < (mv.fx.ch ?? 1)) {
        if (mv.fx.st) applyStatus(st, ev, other(side), mv.fx.st, true);
        if (mv.fx.foe) changeStats(st, ev, other(side), mv.fx.foe);
      }
      if (mv.fx && mv.fx.self && m.hp > 0 && rand(st) < (mv.fx.ch ?? 1)) changeStats(st, ev, side, mv.fx.self);
    } else {
      if (mv.heal) {
        if (m.hp >= Mon.maxHp(m)) return say(`${L()}'s HP is already full!`);
        ev.push({ type: 'anim', kind: 'heal', side });
        m.hp = Math.min(Mon.maxHp(m), m.hp + Math.floor(Mon.maxHp(m) * mv.heal));
        ev.push({ type: 'hp', side, hp: m.hp });
        return say(`${L()} restored its HP!`);
      }
      if (mv.fx.st) {
        ev.push({ type: 'anim', kind: 'status', side, move: id });
        applyStatus(st, ev, other(side), mv.fx.st, false);
      }
      if (mv.fx.foe) changeStats(st, ev, other(side), mv.fx.foe);
      if (mv.fx.self) changeStats(st, ev, side, mv.fx.self);
    }
  }

  // Item effects outside battle use this too (Menus.applyItem), so the rules live in one place.
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

  // The classic shake check: four rolls, each likelier the weaker and more faulted the target.
  function capture(st, ev, id) {
    const it = ITEMS[id], m = mon(st, 'foe'), max = Mon.maxHp(m);
    ev.push({ type: 'msg', text: `You threw a ${it.n.toUpperCase()}!`, auto: 600 });
    const statusB = m.status === 'slp' ? 2 : m.status ? 1.5 : 1;
    const a = ((3 * max - 2 * m.hp) * SPECIES[m.sp].cr * it.rate) / (3 * max) * statusB;
    let shakes = 0;
    if (a >= 255) shakes = 4;
    else {
      const b = 1048560 / Math.sqrt(Math.sqrt(16711680 / a));
      while (shakes < 4 && rand(st) * 65536 < b) shakes++;
    }
    ev.push({ type: 'capture', shakes });
    return shakes === 4;
  }

  // Non-move actions. Returns a result string if the action ends the battle.
  function act(st, ev, side, a) {
    const s = st.sides[side];
    if (a.type === 'run') {
      st.runs++;
      const me = eff(st, side, 'spd'), foe = eff(st, other(side), 'spd');
      if (me >= foe || rand(st) < .4 + (me / foe) * .3 + st.runs * .12) {
        ev.push({ type: 'msg', text: 'You slipped away safely!', auto: 0, sfx: 'door' });
        return 'run';
      }
      ev.push({ type: 'msg', text: 'Couldn\'t get away!', auto: 1000 });
    } else if (a.type === 'switch') {
      if (mon(st, side).hp > 0) {
        ev.push({ type: 'msg', text: `${Mon.name(mon(st, side))}, come back!`, auto: 600 });
        ev.push({ type: 'recall', side });
      }
      send(st, ev, side, a.index, sendText(st, side, a.index));
    } else if (a.type === 'link') {
      if (capture(st, ev, a.id)) return 'caught';
    } else if (a.type === 'item') {
      const it = ITEMS[a.id];
      if (it.kind === 'boost') {
        ev.push({ type: 'msg', text: `You used an ${it.n.toUpperCase()}!`, auto: 700 });
        changeStats(st, ev, side, { [it.stat]: 2 });
      } else {
        const m = s.team[a.target];
        ev.push({ type: 'msg', text: `You used a ${it.n.toUpperCase()} on ${Mon.name(m)}.`, auto: 700 });
        const text = applyItem(a.id, m);
        if (a.target === s.active) {
          ev.push({ type: 'anim', kind: 'heal', side });
          ev.push({ type: 'hp', side, hp: m.hp });
          ev.push({ type: 'status', side, status: m.status });
        }
        ev.push({ type: 'msg', text, auto: 1000 });
      }
    } else throw new Error(`Unknown action ${a.type}`);
    return null;
  }

  // ---------- Public API ----------
  // Opening send-outs: a Linker's lead first, then yours. A wild bot is already standing there.
  function start(st) {
    const ev = [];
    if (st.trainer) send(st, ev, 'foe', 0, sendText(st, 'foe', 0));
    else st.sides.foe.active = 0;
    const first = firstAlive(st, 'me');
    send(st, ev, 'me', first, sendText(st, 'me', first));
    return { events: ev };
  }

  function step(st, actions) {
    if (st.result) throw new Error('Battle is over');
    const ev = [];
    st.turn++;
    const finish = (result) => { st.result = result; ev.push({ type: 'end', result }); return { events: ev, need: [], result }; };
    // Switches, items, links and escapes happen before anyone attacks.
    for (const side of ['me', 'foe']) {
      if (actions[side].type === 'move') continue;
      const r = act(st, ev, side, actions[side]);
      if (r) return finish(r);
    }
    const movers = ['me', 'foe'].filter((s) => actions[s].type === 'move');
    if (movers.length === 2) {
      const mvOf = (side) => { const i = actions[side].moveIndex, mm = mon(st, side).moves[i]; return MOVES[mm && mm.pp > 0 ? mm.id : 'struggle']; };
      const quick = (side) => (st.sides[side].fresh && active(st, side, 'quick') ? 3 : 0);
      const pm = (mvOf('me').pri || 0) + quick('me'), pf = (mvOf('foe').pri || 0) + quick('foe');
      const sm = eff(st, 'me', 'spd'), sf = eff(st, 'foe', 'spd');
      const meFirst = pm !== pf ? pm > pf : sm === sf ? rand(st) < .5 : sm > sf;
      if (!meFirst) movers.reverse();
    }
    const down = () => mon(st, 'me').hp <= 0 || mon(st, 'foe').hp <= 0;
    for (const side of movers) {
      if (down()) break;
      useMove(st, ev, side, actions[side].moveIndex);
    }
    st.sides.me.fresh = st.sides.foe.fresh = false;
    // End of turn: heat and viruses bite, nanites patch.
    for (const side of ['me', 'foe']) {
      if (down()) break;
      const m = mon(st, side), max = Mon.maxHp(m);
      if (m.status === 'brn' || m.status === 'psn') {
        m.hp = Math.max(0, m.hp - Math.max(1, Math.floor(max / (m.status === 'brn' ? 16 : 8))));
        ev.push({ type: 'hp', side, hp: m.hp, sfx: 'weak', blink: true });
        ev.push({ type: 'msg', text: m.status === 'brn' ? `${label(st, side)} is overheating!` : `${label(st, side)}'s code is corrupting!`, auto: 1000 });
      }
      if (m.hp > 0 && m.hp < max && active(st, side, 'regen')) {
        m.hp = Math.min(max, m.hp + Math.max(1, Math.floor(max / 16)));
        ev.push({ type: 'hp', side, hp: m.hp });
        ev.push({ type: 'msg', text: `${label(st, side)}'s nanites patched it up.`, auto: 700 });
      }
    }
    // Shut-downs. The foe's goes first; if that was its last bot you win even on a double KO.
    const need = [];
    if (mon(st, 'foe').hp <= 0) {
      const meM = mon(st, 'me');
      ev.push({ type: 'faint', side: 'foe', participants: st.part.filter((i) => st.sides.me.team[i].hp > 0) });
      st.part = meM.hp > 0 ? [st.sides.me.active] : [];
      if (firstAlive(st, 'foe') < 0) return finish('win');
      need.push('foe');
    }
    if (mon(st, 'me').hp <= 0) {
      ev.push({ type: 'faint', side: 'me' });
      if (firstAlive(st, 'me') < 0) return finish('lose');
      need.push('me');
    }
    return { events: ev, need, result: null };
  }

  function replace(st, side, index) {
    const ev = [];
    send(st, ev, side, index, sendText(st, side, index));
    return { events: ev };
  }

  // The CPU. Wild bots flail half the time; Linkers mostly pick the best-scoring move.
  function ai(st, side) {
    const me = mon(st, side), foe = mon(st, other(side)), fs = st.sides[other(side)];
    const usable = me.moves.map((mv, i) => ({ mv: MOVES[mv.id], i, pp: mv.pp })).filter((x) => x.pp > 0);
    if (!usable.length) return { type: 'move', moveIndex: null };
    const pick = () => ({ type: 'move', moveIndex: usable[Math.floor(rand(st) * usable.length)].i });
    if (side === 'foe' && !st.trainer && rand(st) < .5) return pick();
    const score = ({ mv }) => {
      if (mv.p > 0) return mv.p * typeMult(mv.t, SPECIES[foe.sp].t) * (SPECIES[me.sp].t.includes(mv.t) ? 1.5 : 1) * mv.a / 100;
      if (mv.heal) return me.hp < Mon.maxHp(me) * .45 ? 90 : 0;
      if (mv.fx.st) return foe.status ? 0 : 45;
      const stats = mv.fx.self || mv.fx.foe;
      const k = Object.keys(stats)[0];
      const stage = mv.fx.self ? st.sides[side].stg[k] : -fs.stg[k];
      return stage >= 2 ? 0 : 35;
    };
    if (rand(st) < .2) return pick();
    usable.sort((a, b) => score(b) - score(a) || a.i - b.i);
    return { type: 'move', moveIndex: usable[0].i };
  }

  return { rng, create, start, step, replace, ai, applyItem, firstAlive, mon, eff, label };
})();
