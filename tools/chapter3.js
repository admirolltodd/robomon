#!/usr/bin/env node
'use strict';
// Chapter 3 playthrough: starts from a finished Chapter 2 save and plays the whole chapter in a
// headless phone browser: the plaza gate, Wren's favor, Jax on the Fringe, the Wallside intro,
// Admin Briar, the Null Wall's ICE, Kestrel, Vex, and RHIZARCH. Movement, triggers, warps and
// battles are real; dialogs are answered with their first option. Fails on any page error, on a
// story flag that doesn't land, or if a gate lets the player through too early.
// Needs Playwright with Chromium (see tools/smoke.js).   node tools/chapter3.js
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

  // A finished Chapter 2 save with a team strong enough that "press A" wins every fight. It goes in
  // through the real path: written to storage, then loaded with Continue on the title screen.
  await p.evaluate(() => {
    const s = G.newState();
    s.name = 'TESTER'; s.starter = 'dripbot'; s.rivalStarter = 'mossbit'; s.opts.tips = false;
    for (const f of ['starter', 'dex', 'rival1', 'tut_catch', 'badge1', 'badge2', 'chapter1', 'ch2_gutter', 'keycard', 'rival3', 'boss_voss', 'boss_hex', 'boss_vex', 'omni_met', 'omni_freed', 'chapter2']) s.flags[f] = 1;
    const mk = (sp, moves) => { const m = Mon.create(sp, 80); m.moves = moves.map((id) => ({ id, pp: 99 })); return m; };
    s.party = [mk('leviatron', ['tidalcrush']), mk('infernyx', ['infernocore']), mk('stratohawk', ['skydive'])];
    s.dex.caught = { dripbot: 1, leviatron: 1, infernyx: 1, stratohawk: 1 };
    s.bag.core = 20; s.map = 'plaza'; s.x = 12; s.y = 10; s.dir = 'down';
    Store.save(s);
  });
  await p.reload();
  await p.waitForFunction(() => Atlas.loaded, null, { timeout: 15000 });
  await p.waitForTimeout(600);
  await p.keyboard.press('z'); // Continue
  await p.waitForFunction(() => G.mode === 'world' && G.state && G.state.name === 'TESTER', null, { timeout: 10000 });
  await mash();
  await p.evaluate(() => { G.speed = 40; G.textSpeed = 2000; });

  // 1. Spire Plaza's east road is shut until Wren calls in her favor.
  if (process.env.VERBOSE) console.log('· step 1', await where());
  await place('plaza', 21, 9, 'right');
  await walk('right', 1);
  want(await where() === 'plaza:21,9', `the east road let the player through before Wren's favor (${await where()})`);
  await place('bar', 9, 6, 'up');
  await talk('wren');
  want(await flag('ch3_wren'), 'Wren never opened the east road');

  // 2. Through the gate, onto the Fringe, into Jax.
  if (process.env.VERBOSE) console.log('· step 2', await where());
  await place('plaza', 21, 9, 'right');
  await walk('right', 2);
  want(await where() === 'fringe:1,7', `plaza east exit should land on the Fringe, got ${await where()}`);
  await walk('right', 20);
  want(await flag('rival4'), `Jax's fourth battle never happened (at ${await where()})`);
  await walk('right', 2);
  want(await where() === 'wallside:1,7', `Fringe east exit should land in Wallside, got ${await where()}`);
  await walk('right', 1);
  want(await flag('ch3_wallside'), 'Okoro\'s Wallside call never played');

  // 3. Admin Briar and the Root Key.
  if (process.env.VERBOSE) console.log('· step 3', await where());
  await recharge(); // Wallside's Recharge Station
  await place('wallside', 11, 13, 'up');
  await walk('up', 1);
  want((await where()).startsWith('gym_root'), `the Root Grid Node door doesn't lead inside (${await where()})`);
  await place('gym_root', 5, 3, 'up');
  await talk('briar');
  want(await flag('badge3'), 'beating Admin Briar should give the Root Key');

  // 4. The Null Wall: ICE blocks the way until the Root Key is used on the console.
  if (process.env.VERBOSE) console.log('· step 4', await where());
  await recharge(); // back to Wallside after Briar
  await p.evaluate(() => { G.state.flags.wall_open = 0; });
  await place('nullwall', 7, 5, 'up');
  await walk('up', 1);
  want(await where() === 'nullwall:7,5', `the Null Wall's ICE let the player through while active (${await where()})`);
  await p.evaluate(() => { G.run(() => Story.terminal(World.map)); }); // start it; mash() answers its dialog
  await p.waitForTimeout(150); await mash();
  want(await flag('wall_open'), 'the Root Key should open the Null Wall');
  await walk('up', 5);
  want(await where() === 'overgrowth:9,17', `crossing the Wall should reach the Overgrowth, got ${await where()}`);

  // 5. Kestrel blocks the path north until he's freed.
  if (process.env.VERBOSE) console.log('· step 5', await where());
  await walk('up', 7);
  want(await flag('kestrel'), `Kestrel's battle never fired (at ${await where()})`);
  await walk('right', 1);
  await walk('up', 10);
  want((await where()).startsWith('mycel'), `the Overgrowth's north exit should reach the Mycel Core, got ${await where()}`);

  // 6. Vex, then RHIZARCH.
  if (process.env.VERBOSE) console.log('· step 6', await where());
  await recharge(); // a careful player walks back to Wallside before the core
  await place('mycel', 5, 5, 'up');
  await talk('vex2');
  want(await flag('boss_vex2'), 'beating Vex should set boss_vex2');
  await walk('up', 1);
  await talk('rhiz');
  want(await flag('chapter3') && await flag('rhiz_freed'), 'RHIZARCH should end Chapter 3');
  want(await p.evaluate(() => (G.state.mods.mycelgraft || 0) > 0 || G.state.party.some((m) => m.mods && m.mods.core === 'mycelgraft')), 'Chapter 3 should give the Mycel Graft');
  want(await p.evaluate(() => Tutorial && G.state.flags.rhiz_met), 'the RHIZARCH codex entry flag should be set');

  await browser.close();
  server.close();
  if (errors.length) fail.push(`page errors: ${errors.join(' | ')}`);
  if (fail.length) { console.error(fail.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log('✓ Chapter 3 playable: plaza gate, Wren, Jax on the Fringe, Wallside, Admin Briar, the Null Wall ICE, Kestrel, Vex and RHIZARCH, no page errors');
})().catch((e) => { console.error(e); process.exit(1); });
