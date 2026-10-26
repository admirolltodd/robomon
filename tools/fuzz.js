#!/usr/bin/env node
'use strict';
// Random-input stress test. Mashes the controller for a while from a mid-game save and fails
// if the page throws. It finds crashes no scripted test thinks to look for.
//   node tools/fuzz.js [seconds=120] [map:x:y=gutter:8:3]
// Needs Playwright with Chromium (see tools/smoke.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const secs = +(process.argv[2] || 120);
const [map, x, y] = (process.argv[3] || 'gutter:8:3').split(':');
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
  const errors = new Set();
  p.on('pageerror', (e) => errors.add(e.message + ' @ ' + (e.stack || '').split('\n')[1]));
  p.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_/.test(m.text())) errors.add(m.text()); });
  await p.goto(`http://localhost:${server.address().port}/index.html`);
  // A sturdy mid-game crew with chrome, items and story flags, dropped onto the chosen map.
  await p.evaluate(([map, x, y]) => {
    const s = G.newState();
    s.party = [Mon.create('pyroclaw', 26, { arms: 'mantis' }), Mon.create('ampfang', 25, { core: 'biomonitor' }), Mon.create('torrentek', 25, { arms: 'launcher', frame: 'camo' })];
    s.flags = { dex: 1, metOkoro: 1, rival1: 1, badge1: 1, badge2: 1, chapter1: 1, rival2: 1, tut_catch: 1, keycard: 1 };
    s.starter = 'cindrix'; s.rivalStarter = 'dripbot'; s.money = 20000; s.mods = { gorilla: 1, reflex: 1, thermal: 2 };
    s.bag = { core: 20, hypercore: 5, kit: 10, antivirus: 3, reboot: 2, scrambler: 2, overclock: 2 };
    s.map = map; s.x = x; s.y = y; s.savedAt = Date.now();
    localStorage.setItem('robomon.save.v1', JSON.stringify(s));
  }, [map, +x, +y]);
  await p.reload();
  await p.waitForTimeout(800);
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'z', 'z', 'z', 'x', 'm'];
  const end = Date.now() + secs * 1000;
  let n = 0;
  while (Date.now() < end) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    if (k.startsWith('Arrow')) { await p.keyboard.down(k); await p.waitForTimeout(80 + Math.random() * 500); await p.keyboard.up(k); }
    else { await p.keyboard.press(k); await p.waitForTimeout(40); }
    n++;
  }
  await browser.close();
  server.close();
  if (errors.size) { console.error([...errors].map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log(`✓ ${n} random inputs on ${map}, no page errors`);
})().catch((e) => { console.error(e); process.exit(1); });
