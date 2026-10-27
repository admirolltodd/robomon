#!/usr/bin/env node
'use strict';
// Scripted in-browser battle scenarios: real battles through the real presenter, with menus
// answered by a script instead of a thumb. Covers what random input rarely reaches: every battle
// action, forced switches, the Chrome install screen's RAM rules, arenas, Redline, Resonance, and
// the visor HUD tracking breaches, ghost HP and low-HP sparks, Rivka's Salvage crafting, and a
// Deep Net run that must leave the real party alone.
// Needs Playwright with Chromium (see tools/smoke.js).   node tools/scenarios.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  await p.goto(`http://localhost:${server.address().port}/index.html`);
  await p.waitForTimeout(400);

  const r = await p.evaluate(async () => {
    // Scripted stand-ins for the player's thumb. `plan` holds the next battle commands.
    const plan = [];
    let next = null, asked = [];
    UI.say = async () => {};
    UI.ask = async (q, opts) => { asked.push(q); return opts[0] === 'Install anyway' ? 0 : 1; };
    UI.menu = async (o) => {
      if (/What will/.test(o.title || '')) { next = plan.shift() || { cmd: 'fight' }; return next.cmd; }
      if (o.title === 'Choose a move') return next.move || 0;
      if (o.layout === 'full' && o.title === 'Chrome') return next && next.slot !== undefined ? (next.slot === -1 ? null : next.slot) : null;
      if (/ slot$/.test(o.title || '')) { const i = o.items.findIndex((it) => it.value === next.pick); const v = i < 0 || o.items[i].disabled ? null : next.pick; next.slot = -1; return v; }
      return 0;
    };
    Menus.bag = async () => next.bag;
    Menus.party = async (o) => (o.forced ? G.state.party.findIndex((m) => m.hp > 0) : next.idx);

    const fresh = (party, extra = {}) => {
      const s = G.newState();
      Object.assign(s, { party, flags: { starter: 1 }, ...extra });
      s.opts.tips = false;
      G.state = s; G.applyOpts(); G.speed = 30; G.mode = 'world';
    };
    const out = {};

    // 1. Every action in one wild battle: boost, heal a benched bot, switch, heal the active bot, link.
    fresh([Mon.create('cindrix', 12, { arms: 'launcher' }), Mon.create('voltmite', 10), Mon.create('mossbit', 4)], { bag: { core: 5, kit: 3, overclock: 1 } });
    World.load('route1', 6, 9, 'up');
    G.state.party[2].hp = 3;
    const w = Mon.create('dronelet', 3); w.hp = 1;
    plan.push({ cmd: 'bag', bag: { id: 'overclock' } }, { cmd: 'bag', bag: { id: 'kit', target: 2 } }, { cmd: 'bots', idx: 1 },
      { cmd: 'bag', bag: { id: 'kit', target: 1 } }, { cmd: 'bag', bag: { id: 'core' } }, { cmd: 'bag', bag: { id: 'core' } }, { cmd: 'bag', bag: { id: 'core' } });
    out.wild = await G.battle({ wild: w });
    out.wildEvents = [...new Set(Battle.log.map((e) => e.type + (e.kind ? ':' + e.kind : '')))];
    out.linkedJoined = G.state.party.length === 4 && G.state.dex.caught.dronelet === 1;
    out.bagAfter = { ...G.state.bag };
    out.wildEnv = Battle.log.some((e) => e.env); // Route 1 must stay calm for the tutorial

    // 2. Escape.
    plan.length = 0; plan.push(...Array(6).fill({ cmd: 'run' }));
    out.run = await G.battle({ wild: Mon.create('scrapling', 3) });

    // 3. A Linker with three bots against a weak crew: forced switches through to a result.
    plan.length = 0;
    G.state.party.forEach(Mon.heal);
    out.trainer = await G.battle({ trainer: { name: 'TEST', look: LOOK.punk, team: [Mon.create('ampfang', 14, { arms: 'launcher' }), Mon.create('junkhulk', 13), Mon.create('corruptor', 14)], money: 10 }, noBlackout: true });
    out.trainerFaints = Battle.log.filter((e) => e.type === 'faint').length;

    // 4. RAM rules on the install screen. Torrentek (a robot: no cyborg RAM bonus) Lv20 has 6 RAM; Mantis (3) is in.
    fresh([Mon.create('torrentek', 20, { arms: 'mantis' })], { mods: { secondheart: 1, chrono: 1, engram: 1, servo: 1 } });
    const m = G.state.party[0];
    const tryPick = async (id, slot) => { next = { slot, pick: id }; asked = []; await Menus.chrome(m); return { mods: { ...m.mods }, asked: asked.length }; };
    out.overCap = await tryPick('engram', 3);    // 3 + 5 = 8 = 6 + REDLINE: allowed after a warning
    Mon.uninstall(m, 'core');
    out.chrono = await tryPick('chrono', 3);     // same cost, same warning
    Mon.uninstall(m, 'core');
    m.mods.optics = 'smartlink';                 // now 6/6 used
    out.pastRedline = await tryPick('engram', 3); // 11 > 8: refused outright
    delete m.mods.optics;
    out.clean = await tryPick('servo', 0);       // swap mantis (3) for servo (1): no warning
    // Wetware gets no redline headroom: the same over-budget core is refused, not warned about.
    fresh([Mon.create('vinetron', 20, { arms: 'mantis' })], { mods: { engram: 1 } });
    { const w = G.state.party[0]; next = { slot: 3, pick: 'engram' }; asked = []; await Menus.chrome(w); out.wet = { core: w.mods.core || null, asked: asked.length }; }

    // 5. Kernel arena with a redlined bot against a wild bot: arena notice, heat burn, Resonance.
    fresh([Mon.create('torrentek', 20, { arms: 'mantis', core: 'secondheart' })], { bag: { core: 10 } });
    World.load('core', 5, 5, 'up');
    plan.length = 0; plan.push({ cmd: 'fight' }, ...Array(10).fill({ cmd: 'bag', bag: { id: 'core' } }));
    G.state.party[0].hp = Mon.maxHp(G.state.party[0]) * 3; // sturdy enough to sit through the throws
    out.kernel = await G.battle({ wild: Mon.create('wardencore', 24) }); // a low catch rate, so it takes a few cores
    const log = Battle.log;
    out.kernelEnv = log.find((e) => e.env) && log.find((e) => e.env).env;
    out.heat = log.some((e) => e.type === 'msg' && /Heat burn|stuttered/.test(e.text));
    out.res = log.filter((e) => e.type === 'res').map((e) => e.value);
    out.odds = log.filter((e) => e.type === 'capture').map((e) => +e.chance.toFixed(2));

    // 6. The visor HUD follows the rules: breached sockets light up, the ghost bar trails damage,
    //    a bot under a quarter HP throws sparks. Screen effects off for this one, so that path runs too.
    fresh([Mon.create('juggernaut', 40, { arms: 'gorilla', frame: 'milspec', optics: 'smartlink', core: 'reflex' })]);
    G.state.opts.fx = false; G.applyOpts();
    World.load('lowtown', 5, 6, 'down');
    const hud = { breached: new Set(), ghostAhead: false, sparks: 0 };
    const watch = setInterval(() => {
      const v = Battle.view;
      if (!v) return;
      Object.keys(v.me.breach).forEach((k) => hud.breached.add(k));
      if (v.me.ghost > v.me.hp + 1) hud.ghostAhead = true;
      hud.sparks = Math.max(hud.sparks, v.sparks);
    }, 30);
    plan.length = 0;
    const hacker = Mon.create('wraithware', 40);
    hacker.moves = [{ id: 'zeroday', pp: 99 }];
    G.state.party[0].moves = [{ id: 'crack', pp: 99 }]; // never knocks the foe out, so the hacks keep coming
    out.hudBattle = await G.battle({ trainer: { name: 'HEX', look: LOOK.punk, team: [hacker], money: 0 }, noBlackout: true });
    clearInterval(watch);
    out.logBreaches = [...new Set(Battle.log.filter((e) => e.type === 'breach' && e.turns && e.side === 'me').map((e) => e.slot))];
    out.hudBreaches = [...hud.breached];
    out.ghostAhead = hud.ghostAhead;
    out.sparks = hud.sparks;
    G.state.opts.fx = true;

    // 7. Rivka's clinic: decompile a module for Salvage, splice two Commons into an Uncommon of
    //    your choice. The unique Engram Shard must never be offered.
    fresh([Mon.create('pyroclaw', 20)], { mods: { servo: 2, scrapplate: 1, thermal: 1, engram: 1 }, salvage: 10 });
    G.state.flags.doc_gift = 1;
    const script = { 'Rivka\'s clinic': ['decompile', 'splice', null], Decompile: ['scrapplate', null], 'Splice · first module': ['servo', null], 'Splice · second module': ['servo'], 'Splice into': ['shockfist'] };
    const seenItems = {};
    UI.menu = async (o) => { seenItems[o.title] = o.items.map((i) => i.value); const q = script[o.title]; return q && q.length ? q.shift() : null; };
    UI.ask = async () => 0;
    await Story.ripperdoc({ name: 'RIVKA', look: LOOK.medic });
    out.clinic = { salvage: G.state.salvage, mods: { ...G.state.mods }, offeredEngram: Object.values(seenItems).some((v) => v.includes('engram')), into: seenItems['Splice into'] };

    // 8. A Deep Net run: two drafted ghosts, fight until the third floor, then jack out. The real
    //    party, bag and dex must come back untouched, and the run must be scored and paid.
    const realBot = Mon.create('pyroclaw', 20);
    fresh([realBot], { bag: { core: 3 }, salvage: 0 });
    G.state.opts.tips = false;
    World.load('bar', 5, 7, 'up');
    const before = JSON.stringify({ party: G.state.party, bag: G.state.bag, dex: G.state.dex });
    let fights = 0;
    const battle = G.battle;
    G.battle = (o) => { fights++; return battle(o); };
    UI.ask = async (q, opts) => (opts[0] === 'Jack out' ? 0 : 1);
    UI.menu = async (o) => {
      if (o.title === 'DEEP NET TERMINAL') return 'run';
      if (/What will/.test(o.title || '')) return fights >= 3 ? 'run' : 'fight';
      return 0; // first ghost, first move, first draft offer
    };
    await Story.deepnet();
    G.battle = battle;
    out.deep = {
      fights, runs: G.state.deepnet.runs, best: G.state.deepnet.best, expect: DeepNet.reward(G.state.deepnet.best, Math.floor(G.state.deepnet.best / DeepNet.BOSS_EVERY)), top: G.state.deepnet.top.length, salvage: G.state.salvage,
      untouched: JSON.stringify({ party: G.state.party, bag: G.state.bag, dex: G.state.dex }) === before, same: G.state.party[0] === realBot,
      saved: (() => { try { const sv = JSON.parse(localStorage.getItem('robomon.save.v1')); return sv.party.length === 1 && sv.party[0].sp === 'pyroclaw' && sv.deepnet.runs === 1; } catch { return false; } })(),
    };
    return out;
  });

  await browser.close();
  server.close();
  const fail = [...errors];
  const want = (ok, msg) => { if (!ok) fail.push(msg); };
  want(r.wild === 'caught' && r.linkedJoined, `wild battle should end in a link that joins the party (got ${r.wild})`);
  for (const k of ['anim:buff', 'recall', 'anim:heal', 'capture', 'end']) want(r.wildEvents.includes(k), `wild battle never produced ${k}`);
  want(r.bagAfter.overclock === 0 && r.bagAfter.kit === 1 && r.bagAfter.core < 5, `items not spent: ${JSON.stringify(r.bagAfter)}`);
  want(!r.wildEnv, 'Route 1 should have no arena');
  want(r.run === 'run', `escape failed: ${r.run}`);
  want(['win', 'lose'].includes(r.trainer) && r.trainerFaints >= 1, `trainer battle: ${r.trainer}, ${r.trainerFaints} shut-downs`);
  want(r.overCap.mods.core === 'engram' && r.overCap.asked === 1, `redline install should warn then install: ${JSON.stringify(r.overCap)}`);
  want(r.chrono.mods.core === 'chrono' && r.chrono.asked === 1, `chrono install: ${JSON.stringify(r.chrono)}`);
  want(r.wet.core === null && r.wet.asked === 0, `wetware past its RAM must be refused without a redline prompt: ${JSON.stringify(r.wet)}`);
  want(!r.pastRedline.mods.core, `install past the redline must be refused: ${JSON.stringify(r.pastRedline)}`);
  want(r.clean.mods.arms === 'servo' && r.clean.asked === 0, `clean swap should not warn: ${JSON.stringify(r.clean)}`);
  want(r.kernelEnv === 'kernel', 'Kernel arena not announced');
  want(r.heat, 'redlined bot in the Kernel never stuttered or burned');
  want(r.res.length && r.res.every((v, i) => !i || v >= r.res[i - 1]), `Resonance should only build: ${r.res}`);
  want(r.odds.length && r.odds.every((v, i) => !i || v >= r.odds[i - 1] - 1e-9), `link odds should not fall between throws: ${r.odds}`);
  want(r.logBreaches.length > 0, `the hacker never breached a socket (${r.hudBattle})`);
  want(r.logBreaches.every((slot) => r.hudBreaches.includes(slot)), `HUD missed breaches: log ${r.logBreaches}, HUD ${r.hudBreaches}`);
  want(r.ghostAhead, 'ghost HP bar never trailed the real HP');
  want(r.sparks > 0, 'a bot under a quarter HP never threw sparks');
  want(r.clinic.salvage === 4, `clinic Salvage should be 10 + 2 - 8 = 4, got ${r.clinic.salvage}`);
  want(r.clinic.mods.servo === 0 && r.clinic.mods.scrapplate === 0 && r.clinic.mods.shockfist === 1 && r.clinic.mods.engram === 1, `clinic stash: ${JSON.stringify(r.clinic.mods)}`);
  want(!r.clinic.offeredEngram, 'the Engram Shard was offered for decompiling or splicing');
  want(r.clinic.into && r.clinic.into.every((id) => ['shockfist', 'launcher'].includes(id)), `splice targets should be Uncommon Arms: ${r.clinic.into}`);
  want(r.deep.fights >= 1 && r.deep.runs === 1 && r.deep.top === 1, `Deep Net run not recorded: ${JSON.stringify(r.deep)}`);
  want(r.deep.untouched && r.deep.same, 'Deep Net changed the real party, bag or dex');
  want(r.deep.saved, 'save after the run should hold the real party and the run record');
  want(r.deep.salvage === r.deep.expect, `Deep Net paid ${r.deep.salvage} Salvage, expected ${r.deep.expect}`);
  if (fail.length) { console.error(fail.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log(`✓ battle scenarios: every action, escape, trainer (${r.trainer}), RAM install rules, Kernel arena (${r.kernel}, odds ${r.odds.join(' → ')}), HUD breaches ${r.hudBreaches.join('/')} with fx off, Rivka decompile + splice, Deep Net run (${r.deep.fights} fights, best ${r.deep.best}, ${r.deep.salvage} Salvage), no page errors`);
})().catch((e) => { console.error(e); process.exit(1); });
