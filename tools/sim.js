#!/usr/bin/env node
'use strict';
// Headless battle simulator: `node tools/sim.js [battles=500] [--quiet]`.
// Runs seeded CPU-vs-CPU battles through js/engine.js and fails if any battle throws, runs past
// MAX_TURNS, or plays out differently when replayed from the same seed (the engine must be
// deterministic for lockstep link battles). Then prints win rates by type, by module and by how
// much chrome a team runs, which is the balance report to read before tuning numbers.
// Teams fill sockets at random but never past RAM + REDLINE, as the install screen allows. Every
// fifth battle is a wild fight where the player wears the bot down and throws Capture Cores, to
// check Resonance Linking odds.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const N = +(process.argv.slice(2).find((a) => !a.startsWith('--')) || 500);
const QUIET = process.argv.includes('--quiet');
const MAX_TURNS = 300;
const root = path.join(__dirname, '..');

// Mon.create rolls IVs with Math.random; a seeded stand-in keeps team generation reproducible.
const seeded = Object.create(Math);
const ctx = vm.createContext({ console, Math: seeded });
for (const f of ['js/data.js', 'js/chrome.js', 'js/mon.js', 'js/engine.js', 'js/deepnet.js', 'js/link.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const { Engine, Mon, Chrome, DeepNet, Link, SPECIES, MODS, SLOTS, REDLINE } = vm.runInContext('({ Engine, Mon, Chrome, DeepNet, Link, SPECIES, MODS, SLOTS, REDLINE })', ctx);
const ENVS = [null, null, 'rain', 'servers', 'kernel'];

const species = Object.keys(SPECIES).filter((id) => id !== 'omnikernel');
const bySlot = {};
for (const [id, m] of Object.entries(MODS)) (bySlot[m.slot] = bySlot[m.slot] || []).push(id);

function team(r, lvl) {
  const n = 1 + Math.floor(r() * 3);
  return Array.from({ length: n }, () => {
    const sp = species[Math.floor(r() * species.length)];
    const l = Math.max(2, lvl + Math.floor(r() * 5) - 2), mods = {};
    for (const slot of Object.keys(SLOTS)) {
      if (r() >= .5) continue;
      const id = bySlot[slot][Math.floor(r() * bySlot[slot].length)];
      if (Chrome.ramOf(mods) + Chrome.ram(id) <= Chrome.maxRam(l) + REDLINE) mods[slot] = id;
    }
    return Mon.create(sp, l, mods);
  });
}

// FNV-1a over the event log: cheap and order-sensitive.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

function battle(seed) {
  const r = Engine.rng(seed * 7919 + 1);
  seeded.random = r;
  const lvl = 5 + Math.floor(r() * 41);
  const wild = seed % 5 === 0, env = ENVS[Math.floor(r() * ENVS.length)];
  const me = team(r, lvl), foe = wild ? [Mon.create(species[Math.floor(r() * species.length)], lvl)] : team(r, lvl);
  const envRam = (env && Engine.ENV[env].ram) || 0;
  const info = (m) => ({ sp: m.sp, mods: Object.values(m.mods), redline: Mon.ram(m) > Mon.maxRam(m) + envRam });
  const meta = { me: me.map(info), foe: foe.map(info), env, wild };
  // From here on the engine must use only its own seeded RNG.
  seeded.random = () => { throw new Error('engine called Math.random'); };
  const st = Engine.create({ seed, me: { team: me }, foe: { team: foe, trainer: wild ? null : 'SIM' }, env });
  const log = [...Engine.start(st).events];
  let out = { result: null, need: [] }, throws = 0;
  while (!out.result) {
    if (st.turn >= MAX_TURNS) throw new Error(`seed ${seed}: no result after ${MAX_TURNS} turns`);
    const f = Engine.mon(st, 'foe'), weak = wild && f.hp < Mon.maxHp(f) * .4;
    if (weak) throws++;
    out = Engine.step(st, { me: weak ? { type: 'link', id: 'core' } : Engine.ai(st, 'me'), foe: Engine.ai(st, 'foe') });
    log.push(...out.events);
    for (const side of out.need) log.push(...Engine.replace(st, side, Engine.firstAlive(st, side)).events);
  }
  return { result: out.result, turns: st.turn, hash: hash(JSON.stringify(log)), events: log.length, meta, throws, breaches: log.filter((e) => e.type === 'breach' && e.turns).length };
}

// Each side counts once per battle, split across its bots, so bigger teams don't inflate every row.
const tally = (map, key, won, wt = 1) => { const t = (map[key] = map[key] || { w: 0, n: 0, k: 0 }); t.n += wt; t.k++; if (won) t.w += wt; };
const byType = {}, byMod = {}, byLoad = {}, byEnv = {}, link = { tries: 0, linked: 0, throws: 0, killed: 0 };
const failures = [];
let turns = 0, events = 0, maxTurns = 0, breaches = 0;
for (let seed = 1; seed <= N; seed++) {
  let a, b;
  try { a = battle(seed); b = battle(seed); } catch (e) { failures.push(`seed ${seed}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); continue; }
  if (a.hash !== b.hash) failures.push(`seed ${seed}: replay diverged (${a.hash} vs ${b.hash})`);
  turns += a.turns; events += a.events; maxTurns = Math.max(maxTurns, a.turns); breaches += a.breaches;
  if (a.meta.wild) {
    link.tries++; link.throws += a.throws;
    if (a.result === 'caught') link.linked++;
    if (a.result === 'win') link.killed++;
    continue; // wild fights are a Resonance check, not a balance sample
  }
  for (const side of ['me', 'foe']) {
    const won = (a.result === 'win') === (side === 'me');
    const t = a.meta[side];
    for (const m of t) {
      SPECIES[m.sp].t.forEach((ty) => tally(byType, ty, won, 1 / t.length));
      m.mods.forEach((id) => tally(byMod, id, won, 1 / t.length));
    }
    for (const m of t) tally(byLoad, m.redline ? 'redlined' : m.mods.length ? 'within RAM' : 'no chrome', won, 1 / t.length);
    const env = a.meta.env && Engine.ENV[a.meta.env];
    if (env) for (const m of t) for (const ty of SPECIES[m.sp].t) if (env.mult[ty]) tally(byEnv, `${a.meta.env} ${ty} x${env.mult[ty]}`, won, 1 / t.length);
  }
}

// Rule checks on hand-built battles: the odds and penalties must move the way the tutorial says.
function linkOdds(setup) {
  seeded.random = Engine.rng(42);
  const me = [Mon.create('cindrix', 20)], foe = [Mon.create('scrapling', 20)];
  seeded.random = () => { throw new Error('engine called Math.random'); };
  const st = Engine.create({ seed: 7, me: { team: me }, foe: { team: foe } });
  Engine.start(st);
  setup(foe[0], st);
  return Engine.step(st, { me: { type: 'link', id: 'core' }, foe: { type: 'move', moveIndex: 0 } }).events.find((e) => e.type === 'capture').chance;
}
const odds = {
  full: linkOdds(() => {}),
  half: linkOdds((m) => { m.hp = Math.floor(m.hp / 2); }),
  low: linkOdds((m) => { m.hp = 1; }),
  halfFaulted: linkOdds((m) => { m.hp = Math.floor(m.hp / 2); m.status = 'par'; }),
  halfResonant: linkOdds((m, st) => { m.hp = Math.floor(m.hp / 2); st.res = .5; }),
};
if (!(odds.full < odds.half && odds.half < odds.low)) failures.push(`link odds should rise as HP falls: ${JSON.stringify(odds)}`);
if (!(odds.halfFaulted > odds.half)) failures.push('a status fault should raise link odds');
if (!(odds.halfResonant > odds.half)) failures.push('Resonance should raise link odds');
{
  // A heavily redlined bot must stutter sometimes and burn itself when it hits; breaches must expire.
  let stutters = 0, burns = 0, offline = 0, back = 0;
  for (let i = 0; i < 200; i++) {
    seeded.random = Engine.rng(1000 + i);
    const hot = Mon.create('pyroclaw', 20, { arms: 'monowire', core: 'secondheart' }); // 8 RAM on a 6 budget
    const foe = Mon.create('juggernaut', 40, { arms: 'mantis', frame: 'milspec' });
    foe.moves = [{ id: 'zeroday', pp: 5 }];
    seeded.random = () => { throw new Error('engine called Math.random'); };
    const st = Engine.create({ seed: i, me: { team: [hot] }, foe: { team: [foe], trainer: 'T' } });
    Engine.start(st);
    if (!Engine.redline(st, 'me')) { failures.push('test bot should be redlined'); break; }
    const ev = Engine.step(st, { me: { type: 'move', moveIndex: 0 }, foe: { type: 'move', moveIndex: 0 } }).events;
    if (ev.some((e) => e.type === 'msg' && /stuttered/.test(e.text))) stutters++;
    if (ev.some((e) => e.type === 'msg' && /Heat burn/.test(e.text))) burns++;
    if (ev.some((e) => e.type === 'breach' && e.turns)) offline++;
  }
  // A socket breached during turn 2 for 2 turns stays offline through turns 3 and 4, back for turn 5.
  {
    seeded.random = Engine.rng(5);
    const me = Mon.create('pyroclaw', 30, { arms: 'mantis' }), foe = Mon.create('juggernaut', 30);
    me.moves = foe.moves = [{ id: 'crack', pp: 30 }];
    seeded.random = () => { throw new Error('engine called Math.random'); };
    const st = Engine.create({ seed: 1, me: { team: [me] }, foe: { team: [foe], trainer: 'T' } });
    Engine.start(st);
    st.turn = 1; st.sides.me.breach.arms = { left: 2, at: 2 }; // as if a hit landed during the next step
    const keen = [];
    for (let t = 0; t < 4; t++) {
      keen.push(Engine.active(st, 'me', 'keen'));
      if (Engine.step(st, { me: { type: 'move', moveIndex: 0 }, foe: { type: 'move', moveIndex: 0 } }).events.some((e) => e.type === 'breach' && e.turns === 0)) back = t + 2;
    }
    if (keen.join() !== 'false,false,false,true' || back !== 4) failures.push(`breach timing: offline ${keen}, rebooted end of turn ${back}`);
  }
  if (stutters < 10 || stutters > 60) failures.push(`redline stutter rate off: ${stutters}/200`);
  if (!burns) failures.push('redlined bot never took heat burn');
  if (!offline) failures.push('zero-day hits never breached a socket');
  if (!QUIET) console.log(`\nRule checks: link odds full ${pct(odds.full)}, half ${pct(odds.half)}, 1 HP ${pct(odds.low)}, half+fault ${pct(odds.halfFaulted)}, half+50% Resonance ${pct(odds.halfResonant)} · redline stutter ${stutters}/200, burn ${burns}/200`);
}
function pct(x) { return Math.round(x * 100) + '%'; }

// Deep Net runs, CPU on both sides, drafts picked by the run's own dice. Each run is played twice
// and must match; every daemon and every chrome offer must respect RAM.
const DN_RUNS = Math.max(20, Math.round(N / 5)), MAX_FLOORS = 150;
// Draft policies: dice, or a sensible player (patch when hurt, grow the crew, then level it).
const SMART = ['patch', 'recruit', 'overclock', 'chrome'];
function deepRun(seed, smart) {
  seeded.random = () => { throw new Error('Deep Net called Math.random'); };
  const pickR = Engine.rng(seed + 99), crew = [];
  for (let round = 0; round < 2; round++) crew.push(DeepNet.recruit(seed, round, DeepNet.starters(seed, round, crew)[Math.floor(pickR() * 3)]));
  let wins = 0, bosses = 0, log = '';
  for (;;) {
    if (wins >= MAX_FLOORS) break;
    const fl = DeepNet.floor(seed, wins + 1);
    for (const [sp, l, mods] of fl.team) if (Chrome.ramOf(mods) > Chrome.maxRam(l)) failures.push(`deep net seed ${seed} floor ${fl.f}: ${sp} over RAM`);
    if (JSON.stringify(DeepNet.floor(seed, fl.f)) !== JSON.stringify(fl)) failures.push(`deep net seed ${seed}: floor ${fl.f} not reproducible`);
    const st = Engine.create({ seed: seed * 31 + fl.f, me: { team: crew }, foe: { team: DeepNet.daemons(seed, fl), trainer: fl.name }, env: fl.env });
    Engine.start(st);
    let out = { result: null, need: [] };
    while (!out.result) {
      if (st.turn >= MAX_TURNS) throw new Error(`deep net seed ${seed} floor ${fl.f}: no result`);
      out = Engine.step(st, { me: Engine.ai(st, 'me'), foe: Engine.ai(st, 'foe') });
      for (const side of out.need) Engine.replace(st, side, Engine.firstAlive(st, side));
    }
    log += out.result[0];
    if (out.result !== 'win') break;
    wins++;
    if (fl.boss) bosses++;
    if (!crew.some((m) => m.hp > 0)) break; // double KO: the run ends, the floor counts
    DeepNet.rest(crew, fl.boss);
    if (wins % DeepNet.DRAFT_EVERY === 0) {
      const offers = DeepNet.offers(seed, wins, crew);
      if (offers.length !== 3 || new Set(offers.map((o) => o.kind)).size !== 3) failures.push(`deep net seed ${seed}: bad draft ${JSON.stringify(offers.map((o) => o.kind))}`);
      for (const o of offers) if (o.kind === 'chrome' && Mon.ramWith(crew[o.target], o.id) > Mon.maxRam(crew[o.target])) failures.push(`deep net seed ${seed}: chrome offer would redline`);
      const hurt = crew.reduce((a, m) => a + m.hp / Mon.maxHp(m), 0) / crew.length < .5;
      const choice = !smart ? offers[Math.floor(pickR() * 3)]
        : [...offers].sort((a, b) => (SMART.indexOf(a.kind) - (a.kind === 'patch' && !hurt ? 9 : 0)) - (SMART.indexOf(b.kind) - (b.kind === 'patch' && !hurt ? 9 : 0)))[0];
      DeepNet.apply(seed, wins, crew, choice);
    }
  }
  return { wins, bosses, crew: crew.length, hash: log + crew.map((m) => m.sp + m.lvl + m.hp).join() };
}
const deep = [], deepSmart = [];
for (let i = 1; i <= DN_RUNS; i++) {
  try {
    const a = deepRun(i * 7717), b = deepRun(i * 7717);
    if (a.hash !== b.hash) failures.push(`deep net seed ${i * 7717}: replay diverged`);
    deep.push(a);
    deepSmart.push(deepRun(i * 7717, true));
  } catch (e) { failures.push(`deep net run ${i}: ${e.stack.split('\n').slice(0, 6).join(' | ')}`); }
}
for (const [label, runs] of [['random drafts', deep], ['sensible drafts', deepSmart]]) {
  if (!runs.length) continue;
  runs.sort((a, b) => a.wins - b.wins);
  const q = (p) => runs[Math.min(runs.length - 1, Math.floor(runs.length * p))].wins;
  if (!QUIET) console.log(`${label === 'random drafts' ? '\n' : ''}Deep Net, ${runs.length} CPU runs, ${label}: floors cleared median ${q(.5)}, p10 ${q(.1)}, p90 ${q(.9)}, best ${runs[runs.length - 1].wins}; ` +
    `${runs.filter((r) => r.bosses).length} beat a Sysop; Salvage median ${DeepNet.reward(q(.5), Math.floor(q(.5) / DeepNet.BOSS_EVERY))}`);
  if (runs.some((r) => r.wins >= MAX_FLOORS)) failures.push('a Deep Net run never ended: difficulty must keep climbing');
}

// Link battles: host and guest each build the battle from the packed teams sent over the wire
// (a JSON round trip), then step their own engine with the same exchanged picks. Their state
// hashes must agree after every turn, as the real link checks. Picks come from a separate
// stream, standing in for the two players: Engine.ai would spend engine dice, and people don't.
const LINK_BATTLES = Math.max(30, Math.round(N / 10));
let linkTurns = 0;
for (let i = 1; i <= LINK_BATTLES; i++) {
  seeded.random = Engine.rng(i * 4243);
  const pick = Engine.rng(i * 31337);
  const wire = JSON.parse(JSON.stringify({ host: Link.pack(team(pick, 50)), guest: Link.pack(team(pick, 50)) }));
  seeded.random = () => { throw new Error('link battle called Math.random'); };
  const bad = Link.check(wire.host) || Link.check(wire.guest);
  if (bad) { failures.push(`link ${i}: generated team refused (${bad})`); continue; }
  const names = { me: 'HOST', foe: 'GUEST' };
  const make = () => Engine.create({ seed: i, me: { team: Link.unpack(wire.host) }, foe: { team: Link.unpack(wire.guest), trainer: 'GUEST' }, names });
  const A = make(), B = make();
  const logs = [JSON.stringify(Engine.start(A).events), JSON.stringify(Engine.start(B).events)];
  const choose = (st, side) => {
    const s = st.sides[side], m = s.team[s.active];
    const bench = s.team.map((x, j) => j).filter((j) => j !== s.active && s.team[j].hp > 0);
    if (bench.length && pick() < .15) return { type: 'switch', index: bench[Math.floor(pick() * bench.length)] };
    return { type: 'move', moveIndex: Math.floor(pick() * m.moves.length) };
  };
  try {
    while (!A.result) {
      if (A.turn >= MAX_TURNS) throw new Error('no result');
      const acts = { me: choose(A, 'me'), foe: choose(A, 'foe') };
      if (!Link.legal(B, 'me', acts.me) || !Link.legal(B, 'foe', acts.foe)) throw new Error('a legal pick was refused');
      const oa = Engine.step(A, acts), ob = Engine.step(B, JSON.parse(JSON.stringify(acts)));
      logs[0] += JSON.stringify(oa.events); logs[1] += JSON.stringify(ob.events);
      for (const side of oa.need) {
        const k = Engine.firstAlive(A, side);
        logs[0] += JSON.stringify(Engine.replace(A, side, k).events);
        logs[1] += JSON.stringify(Engine.replace(B, side, k).events);
      }
      linkTurns++;
      if (Link.hash(A) !== Link.hash(B)) throw new Error(`desync on turn ${A.turn}`);
    }
    if (logs[0] !== logs[1] || A.result !== B.result) throw new Error('host and guest saw different battles');
    if (!/HOST's|GUEST's/.test(logs[0])) throw new Error('link battle text should name both Linkers');
  } catch (e) { failures.push(`link battle ${i}: ${e.message}`); }
}
{ // Garbage teams must be refused; Link Codes must survive the trip.
  const ok = { sp: 'pyroclaw', iv: { hp: 1, atk: 2, def: 3, spd: 4 }, moves: ['ram'], mods: {} };
  const cases = {
    'unknown species': [{ ...ok, sp: 'godzilla' }], 'illegal move': [{ ...ok, moves: ['tidalcrush'] }], 'bad stats': [{ ...ok, iv: { ...ok.iv, atk: 99 } }],
    'too many bots': Array(7).fill(ok), 'past the redline': [{ ...ok, mods: { arms: 'monowire', frame: 'camo', optics: 'weakspot', core: 'chrono' } }], 'chrome in the wrong socket': [{ ...ok, mods: { arms: 'camo' } }],
  };
  if (Link.check([ok])) failures.push('a legal link team was refused');
  for (const [name, t] of Object.entries(cases)) if (!Link.check(t)) failures.push(`link team with ${name} was accepted`);
  const sdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    'a=candidate:1 1 udp 2113937151 a1b2c3.local 54400 typ host generation 0', 'a=candidate:2 1 udp 1677729535 203.0.113.9 61000 typ srflx raddr 0.0.0.0 rport 0', 'a=candidate:3 1 tcp 1518280447 10.0.0.2 9 typ host tcptype active',
    'a=ice-ufrag:Ab3d', 'a=ice-pwd:0123456789abcdefghijklmn', 'a=fingerprint:sha-256 ' + Array.from({ length: 32 }, (_, i) => (i * 7 % 256).toString(16).padStart(2, '0').toUpperCase()).join(':'), 'a=setup:actpass', ''].join('\r\n');
  vm.runInContext('this.btoa = (s) => Buffer.from(s, "binary").toString("base64"); this.atob = (s) => Buffer.from(s, "base64").toString("binary");', Object.assign(ctx, { Buffer }));
  const code = Link.encode({ type: 'offer', sdp }, true), back = Link.decode(code);
  const keep = (x) => x.split('\r\n').filter((l) => /^a=(ice-ufrag|ice-pwd|fingerprint|setup)/.test(l)).sort().join('|');
  if (keep(back.desc.sdp) !== keep(sdp) || !back.stun || back.desc.type !== 'offer') failures.push('Link Code round trip lost connection details');
  if ((back.desc.sdp.match(/a=candidate/g) || []).length !== 2) failures.push('Link Code should carry the two UDP candidates and drop TCP');
  if (!QUIET) console.log(`\nLink: ${LINK_BATTLES} lockstep battles (${linkTurns} turns) agreed every turn · codes ${code.length} chars · rules fingerprint ${Link.rules()}`);
}

function table(title, map, minN = 1) {
  const rows = Object.entries(map).filter(([, t]) => t.k >= minN).sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n);
  console.log(`\n${title}`);
  for (const [k, t] of rows) {
    const p = t.w / t.n;
    console.log(`  ${k.padEnd(16)} ${(p * 100).toFixed(1).padStart(5)}%  ${'█'.repeat(Math.round(p * 30)).padEnd(30)} n=${t.k}`);
  }
}

if (!QUIET) {
  table('Win rate by type (bot appearances, weighted by team size)', byType);
  table('Win rate by module (installs, weighted by team size)', byMod, 10);
  table('Win rate by RAM state (bots)', byLoad);
  table('Arena-boosted types in their arena', byEnv);
  console.log(`\nResonance Linking: ${link.linked}/${link.tries} wild bots linked (${(link.throws / Math.max(1, link.tries)).toFixed(1)} cores each), ${link.killed} shut down first · ${breaches} socket breaches`);
}
if (failures.length) { console.error('\n' + failures.map((f) => '✗ ' + f).join('\n')); process.exit(1); }
console.log(`\n✓ ${N} battles, each replayed identically · avg ${(turns / N).toFixed(1)} turns (max ${maxTurns}) · ${events} events`);
