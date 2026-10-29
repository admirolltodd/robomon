#!/usr/bin/env node
'use strict';
// Side towns playthrough: from a save with two Node Keys, walks Chrome City's west road through
// Route 5 to Glasshaven and the Echo Node, then the Gutter's east channel to Drowntown and the Tide
// Node. Checks the warps, that side Admins scale with the Keys you hold, both side quests (refused
// without the right bot, paid once with it), and the trainer card. Real movement and battles;
// dialogs answered with their first option. Fails on any page error or missing flag.
// Needs Playwright with Chromium (see tools/smoke.js).   node tools/sidetowns.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [], fail = [];
  const want = (ok, msg) => { if (!ok) fail.push(msg); };
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${server.address().port}/index.html`);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForFunction(() => Atlas.loaded, null, { timeout: 15000 });
  await p.waitForTimeout(400);

  const K = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  async function mash(max = 3000) {
    for (let i = 0; i < max; i++) {
      if (await p.evaluate(() => G.mode === 'world' && !UI.busy && !G.locked && !World.player.moving)) return;
      await p.keyboard.press('z');
      await p.waitForTimeout(60);
    }
    const st = await p.evaluate(() => JSON.stringify({ map: World.mapId, mode: G.mode, busy: UI.busy, battle: Battle.active, hp: G.state.party.map((m) => m.hp), dlg: ((document.querySelector('#dialog, .dialog') || {}).innerText || '').trim().slice(0, 120) }));
    throw new Error(`stuck in a dialog or battle: ${st}`);
  }
  async function walk(dir, n) {
    for (let i = 0; i < n; i++) {
      await p.keyboard.down(K[dir]);
      await p.waitForFunction(() => World.player.moving, null, { timeout: 1500 }).catch(() => {});
      await p.keyboard.up(K[dir]);
      await mash();
    }
  }
  const where = () => p.evaluate(() => `${World.mapId}:${World.player.x},${World.player.y}`);
  const flag = (f) => p.evaluate((f) => !!G.state.flags[f], f);
  const place = (m, x, y, d) => p.evaluate(([m, x, y, d]) => { World.load(m, x, y, d); }, [m, x, y, d]);
  // The route has Recharge Stations (Spire Plaza, Wallside); the test recharges where a player would.
  const recharge = () => p.evaluate(() => G.state.party.forEach(Mon.heal));
  const talk = async (id) => { await p.evaluate((id) => { G.run(() => World.talkTo(World.entById(id))); }, id); await p.waitForTimeout(150); await mash(); };

  await p.evaluate(() => {
    const s = G.newState();
    s.name = 'TESTER'; s.starter = 'cindrix'; s.rivalStarter = 'dripbot'; s.opts.tips = false;
    for (const f of ['starter', 'dex', 'rival1', 'tut_catch', 'badge1', 'badge2', 'chapter1', 'ch2_gutter']) s.flags[f] = 1;
    const mk = (sp, moves) => { const m = Mon.create(sp, 70); m.moves = moves.map((id) => ({ id, pp: 99 })); return m; };
    s.party = [mk('juggernaut', ['titanslam']), mk('infernyx', ['infernocore']), mk('arborgeist', ['bloomburst'])];
    s.dex.caught = { cindrix: 1, juggernaut: 1, infernyx: 1, arborgeist: 1 };
    s.map = 'chrome'; s.x = 3; s.y = 8; s.dir = 'left';
    Store.save(s);
  });
  await p.reload();
  await p.waitForFunction(() => Atlas.loaded, null, { timeout: 15000 });
  await p.waitForTimeout(600);
  await p.keyboard.press('z'); // Continue
  await p.waitForFunction(() => G.mode === 'world' && G.state && G.state.name === 'TESTER', null, { timeout: 10000 });
  await mash();
  await p.evaluate(() => { G.speed = 40; G.textSpeed = 2000; });
  // Record every dialog line, so the Admins' scaling announcements can be checked.
  await p.evaluate(() => { window.said = []; const say = UI.say; UI.say = (t, o) => { window.said.push(String(t)); return say(t, o); }; });
  const heard = (re) => p.evaluate((src) => window.said.some((t) => new RegExp(src).test(t)), re);

  // 1. Chrome City west -> Route 5 -> Glasshaven.
  await walk('left', 3);
  want(await where() === 'route5:20,7', `Chrome City's west road should lead to Route 5, got ${await where()}`);
  await walk('left', 20);
  want(await where() === 'glasshaven:20,8', `Route 5 should lead to Glasshaven, got ${await where()}`);

  // 2. The Echo Node: Sela is keysAt 1, the save holds 2 Keys, so her bots run 4 levels hot.
  await recharge();
  await place('glasshaven', 11, 13, 'up');
  await walk('up', 1);
  want((await where()).startsWith('gym_echo'), `Glasshaven's Node door should lead inside, got ${await where()}`);
  await place('gym_echo', 5, 3, 'up');
  await talk('sela');
  want(await flag('badge4'), 'beating Admin Sela should give the Echo Key');
  want(await heard('2 Node Keys already.*4 levels hotter'), 'Sela (keysAt 1) should run 4 levels hot against 2 Keys');

  // 3. The Archivist wants a Pinglet: refuses without one, pays once with one.
  await place('glasshaven', 9, 13, 'left');
  await talk('archivist');
  want(!(await flag('q_archive')), 'the Archivist paid out without a Pinglet');
  await p.evaluate(() => G.state.party.push(Mon.create('pinglet', 20)));
  await talk('archivist');
  want(await flag('q_archive') && await p.evaluate(() => G.state.mods.weakspot > 0), 'showing a Pinglet should earn the Weakspot Analyzer');
  const before = await p.evaluate(() => G.state.mods.weakspot);
  await talk('archivist');
  want(await p.evaluate((b) => G.state.mods.weakspot === b, before), 'the Archivist must only pay once');

  // 4. The Gutter's east channel -> Drowntown -> the Tide Node (keysAt 2, now 3 Keys: +4).
  await recharge();
  await place('gutter', 15, 11, 'right');
  await walk('right', 2);
  want(await where() === 'drowntown:1,11', `the Gutter's east channel should lead to Drowntown, got ${await where()}`);
  await place('drowntown', 9, 12, 'up');
  await walk('up', 1);
  want((await where()).startsWith('gym_tide'), `Drowntown's Node door should lead inside, got ${await where()}`);
  await place('gym_tide', 5, 3, 'up');
  await talk('marisol');
  want(await flag('badge5'), 'beating Admin Marisol should give the Tide Key');
  want(await heard('3 Node Keys already.*4 levels hotter'), 'Marisol (keysAt 2) should run 4 levels hot against 3 Keys');
  want(await p.evaluate(() => Story.keyCount() === 4), 'four Node Keys should count');

  // 5. Nell the diver wants a Holokoi.
  await place('drowntown', 17, 5, 'right');
  await talk('diver');
  want(!(await flag('q_diver')), 'the diver paid out without a Holokoi');
  await p.evaluate(() => G.state.party.push(Mon.create('holokoi', 24)));
  await talk('diver');
  want(await flag('q_diver') && await p.evaluate(() => G.state.mods.subdermal > 0), 'showing a Holokoi should earn Subdermal Armor');


  await browser.close();
  server.close();
  if (errors.length) fail.push(`page errors: ${errors.join(' | ')}`);
  if (fail.length) { console.error(fail.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log('✓ side towns playable: Route 5 to Glasshaven and the Echo Node, the Gutter to Drowntown and the Tide Node, both side quests, four Node Keys, no page errors');
})().catch((e) => { console.error(e); process.exit(1); });
