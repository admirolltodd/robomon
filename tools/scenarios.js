#!/usr/bin/env node
'use strict';
// Scripted in-browser battle scenarios: real battles through the real presenter, with menus
// answered by a script instead of a thumb. Covers what random input rarely reaches: every battle
// action, forced switches, the Chrome install screen's RAM rules, arenas, Redline, Resonance, and
// the visor HUD tracking breaches, ghost HP and low-HP sparks.
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

    // 4. RAM rules on the install screen. Pyroclaw Lv20 has 6 RAM; Mantis (3) is in.
    fresh([Mon.create('pyroclaw', 20, { arms: 'mantis' })], { mods: { secondheart: 1, chrono: 1, engram: 1, servo: 1 } });
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

    // 5. Kernel arena with a redlined bot against a wild bot: arena notice, heat burn, Resonance.
    fresh([Mon.create('pyroclaw', 20, { arms: 'mantis', core: 'secondheart' })], { bag: { core: 10 } });
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
  if (fail.length) { console.error(fail.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log(`✓ battle scenarios: every action, escape, trainer (${r.trainer}), RAM install rules, Kernel arena (${r.kernel}, odds ${r.odds.join(' → ')}), HUD breaches ${r.hudBreaches.join('/')} with fx off, no page errors`);
})().catch((e) => { console.error(e); process.exit(1); });
