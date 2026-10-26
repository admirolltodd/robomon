#!/usr/bin/env node
'use strict';
// Headless battle simulator: `node tools/sim.js [battles=500] [--quiet]`.
// Runs seeded CPU-vs-CPU battles through js/engine.js and fails if any battle throws, runs past
// MAX_TURNS, or plays out differently when replayed from the same seed (the engine must be
// deterministic for lockstep link battles). Then prints win rates by type, by module and by how
// much chrome a team runs, which is the balance report to read before tuning numbers.
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
for (const f of ['js/data.js', 'js/chrome.js', 'js/mon.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const { Engine, Mon, SPECIES, MODS, SLOTS } = vm.runInContext('({ Engine, Mon, SPECIES, MODS, SLOTS })', ctx);

const species = Object.keys(SPECIES).filter((id) => id !== 'omnikernel');
const bySlot = {};
for (const [id, m] of Object.entries(MODS)) (bySlot[m.slot] = bySlot[m.slot] || []).push(id);

function team(r, lvl) {
  const n = 1 + Math.floor(r() * 3);
  return Array.from({ length: n }, () => {
    const sp = species[Math.floor(r() * species.length)];
    const mods = {};
    for (const slot of Object.keys(SLOTS)) if (r() < .45) mods[slot] = bySlot[slot][Math.floor(r() * bySlot[slot].length)];
    return Mon.create(sp, Math.max(2, lvl + Math.floor(r() * 5) - 2), mods);
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
  const me = team(r, lvl), foe = team(r, lvl);
  const meta = { me: me.map((m) => ({ sp: m.sp, mods: Object.values(m.mods) })), foe: foe.map((m) => ({ sp: m.sp, mods: Object.values(m.mods) })) };
  // From here on the engine must use only its own seeded RNG.
  seeded.random = () => { throw new Error('engine called Math.random'); };
  const st = Engine.create({ seed, me: { team: me }, foe: { team: foe, trainer: 'SIM' } });
  const log = [...Engine.start(st).events];
  let out = { result: null, need: [] };
  while (!out.result) {
    if (st.turn >= MAX_TURNS) throw new Error(`seed ${seed}: no result after ${MAX_TURNS} turns`);
    out = Engine.step(st, { me: Engine.ai(st, 'me'), foe: Engine.ai(st, 'foe') });
    log.push(...out.events);
    for (const side of out.need) log.push(...Engine.replace(st, side, Engine.firstAlive(st, side)).events);
  }
  return { result: out.result, turns: st.turn, hash: hash(JSON.stringify(log)), events: log.length, meta };
}

// Each side counts once per battle, split across its bots, so bigger teams don't inflate every row.
const tally = (map, key, won, wt = 1) => { const t = (map[key] = map[key] || { w: 0, n: 0, k: 0 }); t.n += wt; t.k++; if (won) t.w += wt; };
const byType = {}, byMod = {}, byLoad = {};
const failures = [];
let turns = 0, events = 0, maxTurns = 0;
for (let seed = 1; seed <= N; seed++) {
  let a, b;
  try { a = battle(seed); b = battle(seed); } catch (e) { failures.push(`seed ${seed}: ${e.stack.split('\n').slice(0, 3).join(' | ')}`); continue; }
  if (a.hash !== b.hash) failures.push(`seed ${seed}: replay diverged (${a.hash} vs ${b.hash})`);
  turns += a.turns; events += a.events; maxTurns = Math.max(maxTurns, a.turns);
  for (const side of ['me', 'foe']) {
    const won = (a.result === 'win') === (side === 'me');
    const t = a.meta[side];
    for (const m of t) {
      SPECIES[m.sp].t.forEach((ty) => tally(byType, ty, won, 1 / t.length));
      m.mods.forEach((id) => tally(byMod, id, won, 1 / t.length));
    }
    const load = t.reduce((s, m) => s + m.mods.length, 0) / t.length;
    tally(byLoad, load < 1 ? '0-1 modules/bot' : load < 2 ? '1-2 modules/bot' : load < 3 ? '2-3 modules/bot' : '3-4 modules/bot', won);
  }
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
  table('Win rate by chrome load', byLoad);
}
if (failures.length) { console.error('\n' + failures.map((f) => '✗ ' + f).join('\n')); process.exit(1); }
console.log(`\n✓ ${N} battles, each replayed identically · avg ${(turns / N).toFixed(1)} turns (max ${maxTurns}) · ${events} events`);
