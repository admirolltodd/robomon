#!/usr/bin/env node
'use strict';
// Frame-cost regression check at phone size (390x844, 3x pixels) for the heaviest scenes, with
// screen effects on and off.
//   node tools/perf.js            measure and compare with tools/perf-baseline.json
//   node tools/perf.js --save     measure and write a new baseline
// Each frame is forced to finish rasterizing, so the number is the whole cost of a frame: issuing
// draw calls plus drawing the pixels. Headless Chromium rasterizes in software, so absolute times
// are several times slower than a phone's GPU, and full-screen blends (fog, glows) look far more
// expensive here than they are there. What this does catch reliably is growth: a scene whose
// median frame costs more than SLACK times its baseline median fails. (p95 is printed too, but in
// a shared container it swings ±30% between identical runs, so it doesn't gate.)
// Needs Playwright with Chromium (see tools/smoke.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SLACK = 1.25;
const BASELINE = path.join(__dirname, 'perf-baseline.json');
const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// Each scene sets up state in the page and returns once it is on screen.
const SCENES = {
  'world: Gutter (rain, dark)': (fx) => {
    const s = G.newState();
    s.party = [Mon.create('pyroclaw', 26, { arms: 'mantis' })]; s.flags = { starter: 1 }; s.opts.fx = fx; s.opts.tips = false;
    G.state = s; G.applyOpts(); G.mode = 'world'; World.load('gutter', 8, 3, 'down');
  },
  'world: Spire Plaza (signs, rain)': (fx) => {
    G.state.opts.fx = fx; G.applyOpts(); World.load('plaza', 8, 8, 'down');
  },
  'battle: Vex (4 chromed bots)': (fx) => {
    G.state.opts.fx = fx; G.applyOpts();
    UI.menu = () => new Promise(() => {}); // park on the command menu
    UI.say = async () => {};
    G.state.party = [Mon.create('infernyx', 36, { arms: 'mantis', frame: 'camo', optics: 'smartlink', core: 'biomonitor' })];
    G.battle({ trainer: { name: 'VEX', look: LOOK.punk, team: [Mon.create('shadowlynx', 32, { arms: 'mantis', optics: 'smartlink' })], money: 0 }, bg: 'spire', theme: '#f4f7ff', rain: 0 });
  },
  'battle: Kernel (wild, code rain)': (fx) => {
    G.state.opts.fx = fx; G.applyOpts();
    World.load('core', 5, 5, 'up'); G.mode = 'world';
    G.battle({ wild: Mon.create('omnikernel', 40), bg: 'core', theme: '#9b6bff' });
  },
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(`http://localhost:${server.address().port}/index.html`);
  await p.waitForTimeout(600);
  const sample = async () => {
    await p.evaluate(() => { G.perf.sync = true; G.perf.i = 0; G.perf.ms.fill(0); });
    await p.waitForTimeout(5000);
    const ms = await p.evaluate(() => { G.perf.sync = false; return [...G.perf.ms.slice(0, Math.min(G.perf.i, G.perf.ms.length))]; });
    ms.sort((a, b) => a - b);
    return { med: +ms[ms.length >> 1].toFixed(1), p95: +ms[Math.floor(ms.length * .95)].toFixed(1), n: ms.length };
  };
  const rows = [];
  for (const fx of [true, false]) {
    for (const [name, setup] of Object.entries(SCENES)) {
      await p.evaluate(`(${setup.toString()})(${fx})`);
      await p.waitForTimeout(3500); // let intros and transitions finish
      rows.push({ scene: name + (fx ? '' : ' [fx off]'), ...(await sample()) });
    }
  }
  await browser.close();
  server.close();
  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const fail = [...errors];
  console.log(`  ${'scene'.padEnd(40)} median   p95      median vs baseline`);
  for (const r of rows) {
    const b = base[r.scene];
    const vs = b ? `${b.med} → ${r.med} ms (${r.med > b.med ? '+' : ''}${Math.round((r.med / b.med - 1) * 100)}%)` : 'no baseline';
    console.log(`  ${r.scene.padEnd(40)} ${String(r.med).padStart(5)}  ${String(r.p95).padStart(6)}   ${vs}`);
    if (b && !process.argv.includes('--save') && r.med > b.med * SLACK) fail.push(`${r.scene}: median ${r.med} ms is over ${SLACK}x the baseline ${b.med} ms`);
  }
  if (process.argv.includes('--save')) {
    fs.writeFileSync(BASELINE, JSON.stringify(Object.fromEntries(rows.map((r) => [r.scene, { med: r.med, p95: r.p95 }])), null, 2) + '\n');
    console.log(`wrote ${path.relative(root, BASELINE)}`);
  }
  if (fail.length) { console.error(fail.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log(`✓ every scene's median frame cost within ${SLACK}x of its baseline`);
})().catch((e) => { console.error(e); process.exit(1); });
