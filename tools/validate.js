#!/usr/bin/env node
'use strict';
// Sanity checks for game data: run `node tools/validate.js`. Exits non-zero on any problem.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = vm.createContext({ console, Math, G: { state: { rivalStarter: 'dripbot' } } });
for (const f of ['js/data.js', 'js/chrome.js', 'js/maps.js', 'js/story.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const { MOVES, SPECIES, LEARN, ITEMS, MAPS, SOLID, TYPES, SHOP_STOCK, MODS, SLOTS, ABILITY, Story, Chrome, CHASSIS } = vm.runInContext(
  '({ MOVES, SPECIES, LEARN, ITEMS, MAPS, SOLID, TYPES, SHOP_STOCK, MODS, SLOTS, ABILITY, Story, Chrome, CHASSIS })', ctx);

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
// NPC chrome must fit the bot's plain RAM budget: Redline is a risk players choose, never a free
// boost for bosses.
const checkTeam = (where, team) => team.forEach(([sp, lvl, mods]) => {
  if (!SPECIES[sp]) return err(`${where}: unknown species ${sp}`);
  checkMods(where, mods);
  if (Object.values(mods || {}).every((id) => MODS[id]) && Chrome.ramOf(mods) > Chrome.maxRam(lvl)) {
    err(`${where}: ${sp} Lv${lvl} runs ${Chrome.ramOf(mods)} RAM of chrome on a ${Chrome.maxRam(lvl)} RAM budget`);
  }
});
for (const rs of ['cindrix', 'dripbot', 'mossbit']) {
  ctx.G.state.rivalStarter = rs;
  for (const [name, fn] of Object.entries(Story.teams)) checkTeam(`story team ${name} (rival has ${rs})`, fn());
}
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
    teams.forEach((t) => checkTeam(`${id}: npc ${n.id}`, t));
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

// Every story flag the data checks must be set somewhere, or a gate can never open.
// (That bug once locked players inside Low Town.) Settable flags come from script assignments
// plus the flags data itself defines: badges, boss/trainer flags, console switches, trainer wins.
const src = fs.readdirSync(path.join(root, 'js')).map((f) => fs.readFileSync(path.join(root, 'js', f), 'utf8')).join('\n');
const settable = new Set([...src.matchAll(/(?:flags\.|F\(\)\.)(\w+) = /g)].map((m) => m[1]));
for (const [id, map] of Object.entries(MAPS)) {
  if (map.console && map.console.sets) settable.add(map.console.sets);
  for (const n of map.npcs || []) {
    if (n.trainer) { settable.add(`tr_${id}_${n.id}`); if (n.trainer.flag) settable.add(n.trainer.flag); }
    if (n.leader) settable.add(n.leader.badge);
    if (n.boss) settable.add(n.boss.flag);
  }
}
const tipIds = [...src.matchAll(/Tutorial\.(?:tip|later)\('(\w+)'\)/g)].map((m) => m[1]);
tipIds.forEach((t) => settable.add(`tip_${t}`));
const needFlag = (where, f) => { if (f && !settable.has(f)) err(`${where}: checks flag "${f}" that nothing ever sets`); };
for (const [id, map] of Object.entries(MAPS)) {
  for (const t of map.triggers || []) needFlag(`${id} trigger`, t.unless);
  for (const w of map.warps || []) needFlag(`${id} warp`, w.need);
  for (const n of map.npcs || []) { needFlag(`${id}: npc ${n.id} hide`, n.hide); needFlag(`${id}: npc ${n.id} show`, n.show); }
  needFlag(`${id} lasers`, map.lasers);
  if (map.console) needFlag(`${id} console`, map.console.need);
  if (map.console) checkScript(`${id} console`, map.console.script);
}
const { CODEX } = vm.runInContext(fs.readFileSync(path.join(root, 'js/tutorial.js'), 'utf8') + ';({ CODEX })', ctx);
for (const c of CODEX) needFlag(`codex ${c.id}`, c.need);

// Save migrations: every fixture must upgrade to the current shape, idempotently, and a save
// from a newer build must pass through untouched. Add a fixture whenever SAVE_VERSION changes.
const sctx = vm.createContext({ console: { warn() {}, error: console.error }, JSON });
vm.runInContext(fs.readFileSync(path.join(root, 'js/save.js'), 'utf8') + ';this.Save = Save; this.SAVE_VERSION = SAVE_VERSION;', sctx);
const { Save, SAVE_VERSION } = sctx;
const fixDir = path.join(__dirname, 'fixtures');
let fixtures = 0;
for (const f of fs.readdirSync(fixDir).filter((f) => f.endsWith('.json'))) {
  const raw = JSON.parse(fs.readFileSync(path.join(fixDir, f), 'utf8'));
  const where = `save fixture ${f}`;
  const before = JSON.stringify(raw);
  let s;
  try { s = Save.migrate(raw); } catch (e) { err(`${where}: migrate threw ${e.message}`); continue; }
  fixtures++;
  if (JSON.stringify(Save.migrate(s)) !== JSON.stringify(s)) err(`${where}: migrating twice changes the save`);
  if (JSON.stringify(raw) !== before) err(`${where}: migrate mutated its input`);
  if ((raw.v || 1) > SAVE_VERSION) {
    if (JSON.stringify(s) !== JSON.stringify(raw)) err(`${where}: future save was altered`);
    continue;
  }
  if (s.v !== SAVE_VERSION) err(`${where}: ended at v${s.v}, expected v${SAVE_VERSION}`);
  if (!s.mods || typeof s.mods !== 'object') err(`${where}: no module stash`);
  [...s.party, ...s.box].forEach((m, i) => { if (!m.mods || typeof m.mods !== 'object') err(`${where}: bot ${i} has no sockets`); checkMods(`${where}: bot ${i}`, m.mods); });
  for (const k of Object.keys(Save.OPTS)) if (!(k in s.opts)) err(`${where}: option ${k} missing`);
  for (const [k, v] of Object.entries(raw.opts || {})) if (s.opts[k] !== v) err(`${where}: lost the player's ${k} setting`);
  if (s.starter && !s.flags.starter) err(`${where}: starter flag not repaired`);
  if (!s.lastCenter.back) err(`${where}: lastCenter has no exit`);
  if (!Number.isFinite(s.salvage) || s.salvage < 0) err(`${where}: bad salvage ${s.salvage}`);
  if (!s.deepnet || !Number.isFinite(s.deepnet.best) || !Array.isArray(s.deepnet.top)) err(`${where}: no Deep Net record`);
  if (raw.salvage !== undefined && s.salvage !== raw.salvage) err(`${where}: lost the player's Salvage`);
  if (raw.deepnet && s.deepnet.best !== raw.deepnet.best) err(`${where}: lost the Deep Net best score`);
  if (!s.link || !Number.isFinite(s.link.wins) || !Number.isFinite(s.link.losses)) err(`${where}: no link record`);
  if (raw.link && (s.link.wins !== raw.link.wins || s.link.losses !== raw.link.losses)) err(`${where}: lost the link record`);
  if (!MAPS[s.map] || !MAPS[s.lastCenter.map]) err(`${where}: points at an unknown map`);
}
if (Save.migrate(null) !== null || Save.migrate('junk') !== null) err('save: garbage input should migrate to null');

// Imported art: every sheet in the manifest has its source file, its baked night version (and
// emissive twin), and matches what js/atlas.js loads; every LOOK sheet is a real sprite sheet.
{
  const m = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8'));
  const actx = vm.createContext({ Image: function () {}, console });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/atlas.js'), 'utf8') + ';this.Atlas = Atlas;', actx);
  const { Atlas } = actx;
  const night = (f) => fs.existsSync(path.join(root, 'assets', 'night', f));
  for (const sh of m.sheets) {
    if (!fs.existsSync(path.join(root, 'assets', sh.file))) err(`asset ${sh.id}: missing source ${sh.file}`);
    if (!night(sh.id + '.png')) err(`asset ${sh.id}: not baked (run python3 tools/night.py)`);
    if (sh.emit && !night(sh.id + '.emit.png')) err(`asset ${sh.id}: emissive twin not baked`);
    if (!sh.license || !sh.source || !sh.authors) err(`asset ${sh.id}: needs source, authors and license`);
    if (!Atlas.SHEETS[sh.id]) err(`asset ${sh.id}: in the manifest but not in js/atlas.js`);
    else if (!!Atlas.SHEETS[sh.id].emit !== !!sh.emit) err(`asset ${sh.id}: emit flag differs between manifest and atlas.js`);
  }
  for (const id of Object.keys(Atlas.SHEETS)) if (!m.sheets.some((sh) => sh.id === id)) err(`atlas sheet ${id} has no manifest entry (source and license)`);
  for (const n of m.npcs.names) {
    if (!fs.existsSync(path.join(root, 'assets', 'src', 'tuxemon', `npc_${n}.png`))) err(`npc sheet ${n}: missing source`);
    if (!night(`npc_${n}.png`)) err(`npc sheet ${n}: not baked`);
    if (!Atlas.NPCS.includes(n)) err(`npc sheet ${n}: not loaded by js/atlas.js`);
  }
  for (const n of Atlas.NPCS) if (!m.npcs.names.includes(n)) err(`atlas npc ${n} has no manifest entry`);
  const { LOOK } = vm.runInContext('({ LOOK })', ctx);
  for (const [id, l] of Object.entries(LOOK)) if (l.sheet && !m.npcs.names.includes(l.sheet)) err(`LOOK.${id}: unknown sprite sheet ${l.sheet}`);
  if (!Atlas.CREDITS.length) err('atlas: no credits');
  // Battle art: every species has a chassis class, a manifest entry with a licensed source, and baked art.
  for (const [id, s] of Object.entries(SPECIES)) {
    if (!CHASSIS[s.cls]) err(`${id}: chassis class must be robot, cyborg or wetware, got ${s.cls}`);
    const a = m.monsters.species[id], src = a && m.monsters.sources[a.src];
    if (!a) err(`${id}: no battle art in assets/manifest.json monsters`);
    else if (!src) err(`${id}: unknown art source ${a.src}`);
    else {
      if (!fs.existsSync(path.join(root, 'assets', src.file))) err(`${id}: missing art source ${src.file}`);
      if (!src.license || !src.authors) err(`art source ${a.src}: needs authors and license`);
      if (src.layout === 'grid64' && !Array.isArray(a.cell)) err(`${id}: grid source needs a cell`);
    }
    if (!night(`mon_${id}.png`)) err(`${id}: battle art not built (run python3 tools/cyberize.py)`);
  }
  for (const id of Object.keys(m.monsters.species)) if (!SPECIES[id]) err(`manifest monster ${id} is not a species`);
}

if (errors.length) {
  console.error(errors.map((e) => '✗ ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ ${Object.keys(SPECIES).length} species, ${Object.keys(MOVES).length} moves, ${Object.keys(MODS).length} modules, ${Object.keys(MAPS).length} maps, ${fixtures} save fixtures, ${JSON.parse(fs.readFileSync(path.join(root, 'assets', 'manifest.json'), 'utf8')).sheets.length} art sheets, battle art for every species OK`);
