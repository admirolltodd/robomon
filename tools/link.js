#!/usr/bin/env node
'use strict';
// Link battle test: two separate browser profiles connect over a real WebRTC data channel using
// Link Codes, exactly as two phones would, and fight with scripted thumbs. Checks that
// - both games played the identical canonical battle and agree on who won,
// - forfeits, dropped links and desyncs end the battle cleanly with the right outcome,
// - nobody's real party is touched, and records are kept.
// Needs Playwright with Chromium (see tools/smoke.js).   node tools/link.js
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

// Runs in each page: a save, and a thumb that picks moves and switches at random.
function setup([name, party, forfeitOnTurn]) {
  const s = G.newState();
  s.name = name; s.flags = { starter: 1 }; s.opts.tips = false;
  s.party = party.map(([sp, lvl, mods]) => Mon.create(sp, lvl, mods));
  G.state = s; G.applyOpts(); G.speed = 40; G.mode = 'world'; World.load('lowtown', 5, 6, 'down');
  window.realBefore = JSON.stringify(s.party);
  let turns = 0;
  window.said = [];
  UI.say = async (t) => { window.said.push(String(t)); };
  UI.ask = async (q, opts) => (opts[0] === 'Forfeit' && forfeitOnTurn && turns >= forfeitOnTurn ? 0 : 1);
  UI.menu = async (o) => {
    if (/What will/.test(o.title || '')) { turns++; return forfeitOnTurn && turns >= forfeitOnTurn ? 'run' : Math.random() < .15 ? 'bots' : 'fight'; }
    if (o.title === 'Choose a move') return Math.floor(Math.random() * o.items.length);
    return 0;
  };
  Menus.party = async (o) => {
    const p = G.state.party, ok = p.map((m, i) => i).filter((i) => p[i].hp > 0 && i !== o.active);
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : (o.forced ? p.findIndex((m) => m.hp > 0) : null);
  };
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const fail = [];
  const want = (ok, msg) => { if (!ok) fail.push(msg); };

  async function match(label, { forfeitOnTurn = 0, dropAfterTurns = 0, desync = false } = {}) {
    const ctxA = await browser.newContext(), ctxB = await browser.newContext(); // separate storage, like two phones
    const A = await ctxA.newPage(), B = await ctxB.newPage();
    const errors = [];
    for (const [p, who] of [[A, 'host'], [B, 'guest']]) p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
    await Promise.all([A.goto(url), B.goto(url)]);
    await A.waitForTimeout(400);
    await A.evaluate(setup, ['HOSTY', [['pyroclaw', 30, { arms: 'mantis' }], ['ampfang', 12], ['corruptor', 45, { optics: 'icebreaker' }]], 0]);
    await B.evaluate(setup, ['GUESTY', [['torrentek', 28, { frame: 'subdermal' }], ['juggernaut', 60, { arms: 'gorilla' }]], forfeitOnTurn]);
    if (desync) await B.evaluate(() => { const h = Link.hash; let n = 0; Link.hash = (st) => (++n > 2 ? 'tampered' : h(st)); });
    // The code exchange, as two people would do it by copy-paste.
    const code = await A.evaluate(async () => { window.h = await Link.host(false); return h.code; });
    const reply = await B.evaluate(async (c) => { window.g = await Link.join(c); return g.code; }, code);
    want(code.startsWith('RBM1.') && code.length < 600 && reply.length < 600, `${label}: codes look wrong (${code.length}/${reply.length} chars)`);
    const runA = A.evaluate(async (r) => { const conn = await h.accept(r); return Link.fight(conn, true); }, reply);
    const runB = B.evaluate(async () => Link.fight(await g.ready, false));
    runB.catch(() => {}); // when the guest's phone is killed below, its pending call rejects; that's the point
    if (dropAfterTurns) { // the guest's phone dies mid-battle
      await B.waitForFunction((n) => Battle.log.filter((e) => e.type === 'msg' && / used /.test(e.text)).length >= n, dropAfterTurns * 2, { timeout: 60000 });
      await ctxB.close();
    }
    const [ra, rb] = await Promise.all([runA, dropAfterTurns ? Promise.resolve('closed') : runB]);
    const read = (p) => p.evaluate(() => ({ log: JSON.stringify(Battle.log), rec: G.state.link, same: JSON.stringify(G.state.party) === window.realBefore, said: window.said.join('\n') }));
    const sa = await read(A), sb = dropAfterTurns ? null : await read(B);
    await ctxA.close(); if (!dropAfterTurns) await ctxB.close();
    want(!errors.length, `${label}: page errors ${errors.join(' | ')}`);
    want(sa.same && (!sb || sb.same), `${label}: a real party changed`);
    return { ra, rb, sa, sb };
  }

  const played = [];
  for (let i = 0; i < 3; i++) {
    const { ra, rb, sa, sb } = await match(`battle ${i + 1}`);
    played.push(`${ra}/${rb}`);
    want(['win', 'lose'].includes(ra) && ['win', 'lose'].includes(rb) && ra !== rb, `battle ${i + 1}: results should mirror, got host ${ra} guest ${rb}`);
    want(sa.log === sb.log && sa.log.length > 200, `battle ${i + 1}: host and guest saw different battles`);
    want(sa.rec.wins + sa.rec.losses === 1 && sb.rec.wins + sb.rec.losses === 1, `battle ${i + 1}: records ${JSON.stringify([sa.rec, sb.rec])}`);
  }
  const ff = await match('forfeit', { forfeitOnTurn: 2 });
  want(ff.ra === 'win' && ff.rb === 'lose' && ff.sb.rec.losses === 1, `forfeit: host ${ff.ra}, guest ${ff.rb}`);
  const drop = await match('dropped link', { dropAfterTurns: 2 });
  want(drop.ra === 'void' && drop.sa.rec.wins + drop.sa.rec.losses === 0, `dropped link: host got ${drop.ra}, record ${JSON.stringify(drop.sa.rec)}`);
  const ds = await match('desync', { desync: true });
  want(ds.ra === 'void' && ds.rb === 'void', `desync: host ${ds.ra}, guest ${ds.rb} (both should void)`);
  want(/desync/.test(ds.sa.said) && /desync/.test(ds.sb.said), 'desync: each game must catch the mismatch itself, not just see the link drop');
  want(/dropped/.test(drop.sa.said), 'dropped link: the host should say the link dropped');

  // The real screens, driven like a person would: menus by key, codes by paste, Connect by tap.
  {
    const ctxA = await browser.newContext({ viewport: { width: 390, height: 844 } }), ctxB = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const A = await ctxA.newPage(), B = await ctxB.newPage();
    const errors = [];
    for (const p of [A, B]) p.on('pageerror', (e) => errors.push(e.message));
    await Promise.all([A.goto(url), B.goto(url)]);
    await A.waitForTimeout(400);
    for (const [p, n] of [[A, 'ALPHA'], [B, 'BRAVO']]) {
      await p.evaluate((n) => {
        const s = G.newState(); s.name = n; s.flags = { starter: 1, tip_link: 1 }; s.party = [Mon.create('pyroclaw', 20)];
        G.state = s; G.applyOpts(); G.mode = 'world'; World.load('lowtown', 5, 6, 'down');
        G.run(Link.open);
      }, n);
    }
    await A.waitForTimeout(300);
    await A.keyboard.press('z'); await A.waitForTimeout(250);          // Host a battle
    await A.keyboard.press('z');                                         // Same Wi-Fi
    await A.waitForSelector('.link-code[readonly]', { timeout: 10000 });
    const code = await A.inputValue('.link-code[readonly]');
    await B.keyboard.press('ArrowDown'); await B.waitForTimeout(150); await B.keyboard.press('z'); // Join a battle
    await B.waitForSelector('.link-code:not([readonly])');
    await B.fill('.link-code:not([readonly])', 'hello there');
    await B.click('[data-a=go]');
    await B.waitForTimeout(200);
    const garbage = await B.textContent('.link-status');
    await B.fill('.link-code:not([readonly])', code);
    await B.click('[data-a=go]');
    await B.waitForSelector('.link-code[readonly]', { timeout: 10000 });
    const reply = await B.inputValue('.link-code[readonly]');
    await A.fill('.link-code:not([readonly])', reply);
    await A.click('[data-a=go]');
    await Promise.all([A.waitForFunction(() => Battle.active, null, { timeout: 30000 }), B.waitForFunction(() => Battle.active, null, { timeout: 30000 })]);
    want(/isn't a Link Code/.test(garbage), `pasting garbage should explain itself, got "${garbage}"`);
    want(code.startsWith('RBM1.') && reply.startsWith('RBM1.'), 'screens should show Link Codes');
    want(!errors.length, `screens: page errors ${errors.join(' | ')}`);
    await ctxA.close(); await ctxB.close();
    // A browser without WebRTC (like the claude.ai viewer) gets told why, not a crash.
    const ctxC = await browser.newContext(), C = await ctxC.newPage();
    await C.addInitScript(() => { delete window.RTCPeerConnection; });
    await C.goto(url); await C.waitForTimeout(300);
    const said = await C.evaluate(async () => {
      const s = G.newState(); s.party = [Mon.create('pyroclaw', 20)]; G.state = s; G.mode = 'world';
      let t = ''; UI.say = async (x) => { t = x; };
      await Link.open();
      return t;
    });
    want(/can't open peer-to-peer links/.test(said), `no-WebRTC message missing: "${said}"`);
    await ctxC.close();
  }

  await browser.close();
  server.close();
  if (fail.length) { console.error(fail.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
  console.log(`✓ link battles over real WebRTC: ${played.join(', ')} (identical battles on both sides), forfeit, dropped link and desync all handled, real parties untouched; the real screens connect two games by paste`);
})().catch((e) => { console.error(e); process.exit(1); });
