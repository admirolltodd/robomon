#!/usr/bin/env node
'use strict';
// Chapter 4 and the ending: from a finished Chapter 3 save holding the five street-level Node Keys,
// rides the Skylift, checks the Crown Gate refuses fewer than eight Keys, beats the Zenith, Forge
// and Vault Admins, opens the Gate, clears the Grid Council (Aria, Rook, Hex, Jax), meets SOVEREIGN,
// and checks the finale: Hall of Fame, credits, home, the champion flag, and the Council rematch.
// Real movement, warps, triggers and battles; dialogs answered with their first option.
// Needs Playwright with Chromium (see tools/smoke.js).   node tools/chapter4.js
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
  async function mash(max = 6000) {
    for (let i = 0; i < max; i++) {
      if (await p.evaluate(() => G.mode === 'world' && !UI.busy && !G.locked && !World.player.moving)) return;
      await p.keyboard.press('z');
      await p.waitForTimeout(60);
    }
    const st = await p.evaluate(() => JSON.stringify({ map: World.mapId, mode: G.mode, busy: UI.busy, battle: Battle.active, hp: G.state.party.map((m) => m.hp), ui: UI.debugTop(), dock: (document.querySelector('#dock') || {}).innerText, log: (Battle.log || []).slice(-24).map((e) => e.type + ':' + (e.text || e.side || '')).join(' | '), dlg: ((document.querySelector('#dialog, .dialog') || {}).innerText || '').trim().slice(0, 120) }));
    const f0 = await p.evaluate(() => G.perf.i); await p.waitForTimeout(1000); const f1 = await p.evaluate(() => G.perf.i);
    throw new Error(`stuck in a dialog or battle (${f1 - f0} frames drawn in the last second): ${st}`);
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
    s.name = 'TESTER'; s.starter = 'mossbit'; s.rivalStarter = 'cindrix'; s.opts.tips = false;
    for (const f of ['starter', 'dex', 'rival1', 'tut_catch', 'badge1', 'badge2', 'badge3', 'badge4', 'badge5', 'chapter1', 'ch2_gutter', 'keycard', 'rival3',
      'boss_voss', 'boss_hex', 'boss_vex', 'omni_met', 'omni_freed', 'chapter2', 'ch3_wren', 'rival4', 'ch3_wallside', 'wall_open', 'kestrel', 'boss_vex2', 'rhiz_met', 'rhiz_freed', 'chapter3']) s.flags[f] = 1;
    const mk = (sp, moves) => { const m = Mon.create(sp, 100); m.moves = moves.map((id) => ({ id, pp: 99 })); return m; };
    s.party = [mk('infernyx', ['infernocore', 'titanslam']), mk('juggernaut', ['titanslam', 'infernocore']), mk('neondragon', ['tidalcrush', 'neuralstorm']), mk('arborgeist', ['bloomburst', 'neuralstorm']),
      mk('wraithware', ['blackout', 'neuralstorm']), mk('stratohawk', ['skydive', 'titanslam'])];
    s.dex.caught = { mossbit: 1, arborgeist: 1, juggernaut: 1, neondragon: 1, infernyx: 1 };
    s.map = 'spire1'; s.x = 4; s.y = 10; s.dir = 'left';
    Store.save(s);
  });
  await p.reload();
  await p.waitForFunction(() => Atlas.loaded, null, { timeout: 15000 });
  await p.waitForTimeout(600);
  await p.keyboard.press('z'); // Continue
  await p.waitForFunction(() => G.mode === 'world' && G.state && G.state.name === 'TESTER', null, { timeout: 10000 });
  await mash();
  await p.evaluate(() => { G.speed = 40; G.textSpeed = 2000; window.said = []; const say = UI.say; UI.say = (t, o) => { window.said.push(String(t)); return say(t, o); }; });
  const heard = (re) => p.evaluate((src) => window.said.some((t) => new RegExp(src).test(t)), re);

  // 1. The Skylift from the Spire lobby.
  if (process.env.VERBOSE) console.log('· skylift', await where(), await p.evaluate(() => JSON.stringify({ frameMs: +(Array.from(G.perf.ms).filter((x) => x > 0).reduce((a, b) => a + b, 0) / Math.max(1, Array.from(G.perf.ms).filter((x) => x > 0).length)).toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, nodes: document.getElementsByTagName('*').length })));
  await talk('liftop');
  want(await where() === 'skyline:12,16', `the Skylift should land on the Skyline, got ${await where()}`);
  want(await flag('ch4_lift'), 'the first Skylift ride should start Chapter 4');

  // 2. The Crown Gate refuses five Keys, and names the missing ones.
  await place('skyline', 11, 2, 'up');
  await walk('up', 1);
  want(await where() === 'skyline:11,2', `the Crown Gate let a five-Key Linker through (${await where()})`);
  want(await heard('5 of 8 Node Keys') && await heard('Zenith Key'), 'the Gate should list the missing Keys');

  // 3. The three Upper City Admins, in an order of our choosing: Vault, Forge, Zenith.
  if (process.env.VERBOSE) console.log('· gyms', await where(), await p.evaluate(() => JSON.stringify({ frameMs: +(Array.from(G.perf.ms).filter((x) => x > 0).reduce((a, b) => a + b, 0) / Math.max(1, Array.from(G.perf.ms).filter((x) => x > 0).length)).toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, nodes: document.getElementsByTagName('*').length })));
  for (const [map, door, gym, admin, badge] of [['vaultrow', [15, 5], 'gym_vault', 'mercer', 'badge8'], ['foundry', [5, 5], 'gym_forge', 'cinder', 'badge7'], ['skyline', [5, 14], 'gym_zenith', 'kite', 'badge6']]) {
    await recharge();
    await place(map, door[0], door[1], 'up');
    await walk('up', 1);
    want((await where()).startsWith(gym), `${map}'s Node door should lead into ${gym}, got ${await where()}`);
    await place(gym, 5, 3, 'up');
    await talk(admin);
    want(await flag(badge), `beating ${admin} should give ${badge}`);
  }
  want(await heard('6 Node Keys already.*4 levels hotter') && await heard('7 Node Keys already.*8 levels hotter'), 'Upper City Admins should scale with the Keys you hold');

  // 4. Eight Keys open the Gate.
  await place('skyline', 11, 2, 'up');
  await walk('up', 1);
  want(await flag('crown_open'), 'eight Node Keys should open the Crown Gate');
  await walk('up', 1);
  want(await where() === 'crowngate:5,8', `through the Gate should be the Crown Gate hall, got ${await where()}`);

  // 5. The Grid Council, back to back, then SOVEREIGN.
  if (process.env.VERBOSE) console.log('· council', await where(), await p.evaluate(() => JSON.stringify({ frameMs: +(Array.from(G.perf.ms).filter((x) => x > 0).reduce((a, b) => a + b, 0) / Math.max(1, Array.from(G.perf.ms).filter((x) => x > 0).length)).toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, nodes: document.getElementsByTagName('*').length })));
  await recharge();
  await place('crowngate', 5, 1, 'up');
  await walk('up', 1);
  for (const [room, id, f, next] of [['council1', 'aria', 'council1', 'council2'], ['council2', 'rook', 'council2', 'council3'], ['council3', 'hexw', 'council3', 'council4'], ['council4', 'jaxc', 'council4', 'crown']]) {
    want((await where()).startsWith(room), `expected to be in ${room}, got ${await where()}`);
    if (process.env.VERBOSE) console.log('  · ' + room, await p.evaluate(() => JSON.stringify({ frameMs: +(Array.from(G.perf.ms).filter((x) => x > 0).reduce((a, b) => a + b, 0) / Math.max(1, Array.from(G.perf.ms).filter((x) => x > 0).length)).toFixed(1), heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1, nodes: document.getElementsByTagName('*').length })));
    await place(room, 5, 3, 'up');
    await talk(id);
    want(await flag(f), `beating ${id} should set ${f}`);
    await walk('up', 3);
    want((await where()).startsWith(next), `${room}'s north door should lead to ${next}, got ${await where()}`);
  }
  if (process.env.VERBOSE) console.log('· sovereign', await where());
  await place('crown', 5, 4, 'up');
  await talk('sov');
  want(await flag('chapter4') && await flag('champion'), 'SOVEREIGN should end the game');
  want(await p.evaluate(() => (G.state.hall || []).length === 1 && G.state.hall[0].team.length === 6), 'the Hall of Fame should record the winning team');
  want(await heard('HALL OF FAME') && await heard('THE END'), 'the finale should show the Hall of Fame and THE END');
  want((await where()).startsWith('home'), `after the credits you should wake up at home, got ${await where()}`);

  // 6. Post-game: the Council rematch from the Crown Gate steward.
  if (process.env.VERBOSE) console.log('· rematch', await where());
  await recharge();
  await place('crowngate', 2, 6, 'left');
  await talk('steward');
  want(await p.evaluate(() => G.state.flags.council_rematch === 1), 'the Council rematch should run and be counted');

  await browser.close();
  server.close();
  if (errors.length) fail.push(`page errors: ${errors.join(' | ')}`);
  if (fail.length) { console.error(fail.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log('✓ Chapter 4 and the ending playable: Skylift, the eight-Key Crown Gate, Zenith, Forge and Vault Nodes, the Grid Council, SOVEREIGN, Hall of Fame, credits and the Council rematch, no page errors');
})().catch((e) => { console.error(e); process.exit(1); });
