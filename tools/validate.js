#!/usr/bin/env node
'use strict';
// Sanity checks for game data: run `node tools/validate.js`. Exits non-zero on any problem.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Math });
for (const f of ['js/data.js', 'js/chrome.js', 'js/maps.js', 'js/story.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const { MOVES, SPECIES, LEARN, ITEMS, MAPS, SOLID, TYPES, SHOP_STOCK, MODS, SLOTS, ABILITY, Story } = vm.runInContext(
  '({ MOVES, SPECIES, LEARN, ITEMS, MAPS, SOLID, TYPES, SHOP_STOCK, MODS, SLOTS, ABILITY, Story })', ctx);

const errors = [];
const err = (m) => errors.push(m);

for (const [id, m] of Object.entries(MOVES)) if (!TYPES[m.t]) err(`move ${id}: bad type ${m.t}`);
for (const [id, s] of Object.entries(SPECIES)) {
  s.t.forEach((t) => TYPES[t] || err(`species ${id}: bad type ${t}`));
  if (!LEARN[s.line]) err(`species ${id}: no learnset ${s.line}`);
  if (s.evo && !SPECIES[s.evo.to]) err(`species ${id}: evolves into unknown ${s.evo.to}`);
  if (s.b.length !== 4) err(`species ${id}: needs 4 base stats`);
}
for (const [line, list] of Object.entries(LEARN)) for (const [, mv] of list) if (!MOVES[mv]) err(`learnset ${line}: unknown move ${mv}`);
SHOP_STOCK.flat().forEach((i) => ITEMS[i] || err(`shop: unknown item ${i}`));
for (const [id, m] of Object.entries(MODS)) {
  if (!SLOTS[m.slot]) err(`module ${id}: bad slot ${m.slot}`);
  if (m.ab && !ABILITY[m.ab]) err(`module ${id}: unknown ability ${m.ab}`);
  if (!m.lore) err(`module ${id}: missing lore`);
}
const checkMods = (where, mods) => Object.entries(mods || {}).forEach(([slot, id]) => {
  if (!MODS[id]) err(`${where}: unknown module ${id}`);
  else if (MODS[id].slot !== slot) err(`${where}: ${id} is not a ${slot} module`);
});
const checkScript = (where, name) => { if (name && typeof Story[name] !== 'function') err(`${where}: missing story script ${name}`); };

function tileAt(map, x, y) { return (map.rows[y] || '')[x]; }
function walkable(map, x, y) { const t = tileAt(map, x, y); return t !== undefined && !SOLID.has(t); }

for (const [id, map] of Object.entries(MAPS)) {
  const w = map.rows[0].length;
  map.rows.forEach((r, y) => r.length !== w && err(`${id}: row ${y} is ${r.length} wide, expected ${w}`));
  const occupied = new Set();
  for (const wp of map.warps || []) {
    if (!walkable(map, wp.x, wp.y)) err(`${id}: warp at ${wp.x},${wp.y} is on a solid tile`);
    checkScript(`${id} warp`, wp.deny);
    if (wp.to === '$back') continue;
    const dest = MAPS[wp.to];
    if (!dest) { err(`${id}: warp to unknown map ${wp.to}`); continue; }
    if (!walkable(dest, wp.tx, wp.ty)) err(`${id}: warp lands on solid ${wp.to} ${wp.tx},${wp.ty}`);
    if ((dest.warps || []).some((d) => d.x === wp.tx && d.y === wp.ty)) err(`${id}: warp lands on another warp in ${wp.to}`);
  }
  for (const n of map.npcs || []) {
    const key = `${n.x},${n.y}`;
    if (occupied.has(key)) err(`${id}: two entities on ${key}`);
    occupied.add(key);
    if (n.kind !== 'pod' && !walkable(map, n.x, n.y)) err(`${id}: npc ${n.id} stands on solid tile`);
    const teams = [];
    if (n.trainer && Array.isArray(n.trainer.team)) teams.push(n.trainer.team);
    if (n.trainer && typeof n.trainer.team === 'string' && !Story.teams[n.trainer.team]) err(`${id}: npc ${n.id} has unknown team ${n.trainer.team}`);
    if (n.leader) teams.push(n.leader.team);
    if (n.boss) teams.push(n.boss.team);
    teams.flat().forEach(([sp, , mods]) => { if (!SPECIES[sp]) err(`${id}: npc ${n.id} has unknown species ${sp}`); checkMods(`${id}: npc ${n.id}`, mods); });
    for (const d of [n.trainer, n.leader, n.boss]) for (const m of (d && d.drops) || []) if (!MODS[m]) err(`${id}: npc ${n.id} drops unknown module ${m}`);
    if (n.species && !SPECIES[n.species]) err(`${id}: npc ${n.id} unknown species`);
    checkScript(`${id}: npc ${n.id}`, n.script);
    if (n.leader && n.leader.gift && !ITEMS[n.leader.gift[0]]) err(`${id}: leader gift unknown`);
  }
  for (const it of map.items || []) {
    if (!ITEMS[it.item]) err(`${id}: unknown item ${it.item}`);
    if (!walkable(map, it.x, it.y)) err(`${id}: item ${it.id} on solid tile`);
  }
  for (const c of map.caches || []) {
    const key = `${c.x},${c.y}`;
    if (occupied.has(key)) err(`${id}: cache ${c.id} overlaps an entity`);
    if (!walkable(map, c.x, c.y)) err(`${id}: cache ${c.id} on solid tile`);
    if (c.mod && !MODS[c.mod]) err(`${id}: cache ${c.id} unknown module`);
  }
  for (const tr of map.triggers || []) checkScript(`${id} trigger`, tr.script);
  if (map.rows.some((r) => r.includes('k')) && !map.console) err(`${id}: has a console tile but no console data`);
  for (const k of Object.keys(map.signs || {})) {
    const [x, y] = k.split(',').map(Number);
    if (tileAt(map, x, y) !== '^') err(`${id}: sign ${k} is not on a ^ tile`);
  }
  for (const [sp] of map.encounters || []) if (!SPECIES[sp]) err(`${id}: encounter unknown species ${sp}`);
  if (map.encounters && !map.rows.some((r) => r.includes(';'))) err(`${id}: has encounters but no static tiles`);
}

if (errors.length) {
  console.error(errors.map((e) => '✗ ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ ${Object.keys(SPECIES).length} species, ${Object.keys(MOVES).length} moves, ${Object.keys(MODS).length} modules, ${Object.keys(MAPS).length} maps OK`);
