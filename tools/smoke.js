#!/usr/bin/env node
'use strict';
// Browser smoke test: boots the game at phone size, plays the opening (intro, walk to the lab,
// pick a starter, rival battle) and fails on any page error or if the story flags don't land.
// Needs Playwright with Chromium:  npm i -D playwright && npx playwright install chromium
//   node tools/smoke.js
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
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
  await p.goto(`http://localhost:${server.address().port}/index.html`);
  await p.evaluate(() => localStorage.clear());
  await p.reload();
  await p.waitForTimeout(800);

  const K = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  const idle = () => p.waitForFunction(() => !World.player.moving && !G.locked, null, { timeout: 8000 });
  async function walk(dir, n) {
    for (let i = 0; i < n; i++) {
      await p.keyboard.down(K[dir]);
      await p.waitForFunction(() => World.player.moving, null, { timeout: 1500 }).catch(() => {});
      await p.keyboard.up(K[dir]);
      await idle();
    }
  }
  // Press A until the world is free again (answers every menu with its first option).
  async function mash(max = 400) {
    for (let i = 0; i < max; i++) {
      if (await p.evaluate(() => G.mode === 'world' && !UI.busy && !G.locked)) return;
      await p.keyboard.press('z');
      await p.waitForTimeout(120);
    }
    throw new Error('stuck in a dialog or battle');
  }

  await p.keyboard.press('z');                          // New game
  for (let i = 0; i < 80 && !(await p.$('#name-input')); i++) { await p.keyboard.press('z'); await p.waitForTimeout(120); }
  await p.fill('#name-input', 'SMOKE');
  await p.keyboard.press('Enter');
  await mash();
  await walk('down', 3); await walk('right', 1); await walk('down', 1);              // leave home
  await walk('right', 3); await walk('down', 3); await walk('right', 5); await walk('down', 5);
  await walk('left', 5); await walk('up', 1);                                        // into the lab
  await walk('up', 3); await walk('right', 4); await walk('up', 2); await walk('left', 3); await walk('up', 1);
  await p.keyboard.press('z'); await mash();                                         // talk to Dr. Okoro
  await walk('left', 2); await walk('down', 1);
  await p.keyboard.press('z'); await mash();                                         // pick a starter, rival battle

  const s = await p.evaluate(() => ({ map: World.mapId, starter: G.state.starter, party: G.state.party.length, flags: G.state.flags }));
  await browser.close();
  server.close();
  const problems = [...errors];
  if (s.map !== 'lab') problems.push(`expected to be in the lab, got ${s.map}`);
  if (!s.starter || s.party !== 1) problems.push('starter was not linked');
  if (!s.flags.rival1 || !s.flags.dex) problems.push('rival battle / LinkDex flags missing');
  if (problems.length) { console.error(problems.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log(`✓ opening playable: linked ${s.starter}, rival battle done, no page errors`);
})().catch((e) => { console.error(e); process.exit(1); });
