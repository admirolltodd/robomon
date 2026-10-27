'use strict';
// Link battles: two phones, one battle, no server.
//
// Connecting. WebRTC needs the two browsers to swap a description of themselves once. With no
// server to carry it, the players carry it: the host's game prints a Link Code, the friend pastes
// it and gets a reply code back, the host pastes that, and a direct data channel opens. Codes are
// shrunk to what the connection needs (ICE credentials, the DTLS fingerprint, candidates) and
// rebuilt into a full SDP on the other side, so they are a few hundred characters long.
// Same Wi-Fi works with nothing else. Over the internet, each phone first asks a public STUN
// server for its outside address; that is opt-in, since it's the game's only outside service.
//
// Fighting. Lockstep on the deterministic engine. Both games hold the same canonical battle (host
// = side 'me', guest = side 'foe'), seeded by the host. Each turn both players pick, swap only
// their picks, and step the engine locally, so both screens play the same battle from the same
// dice. Each message carries a hash of the sender's state; any mismatch stops the battle as a
// desync instead of letting the two games quietly disagree. Link rules: copies of each party at
// Lv 50, no items, no XP. Your real bots are never touched.

const Link = (() => {
  const PROTO = 1, LEVEL = 50, MAX_TEAM = 6;
  const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
  const PREFIX = 'RBM1.';

  const supported = () => typeof RTCPeerConnection === 'function';

  // ---------- Rules fingerprint ----------
  // Both games must agree on every number a battle uses. Hash the data tables, plus the event log
  // of a fixed "golden" battle, which also catches changed rules inside the engine's code.
  const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
  let rulesCache = null;
  function rules() {
    if (rulesCache) return rulesCache;
    const types = Object.keys(TYPES), chart = types.map((a) => types.map((b) => typeMult(a, [b])));
    const sp = Object.fromEntries(Object.entries(SPECIES).map(([id, s]) => [id, [s.t, s.b, s.line]]));
    const mods = Object.fromEntries(Object.entries(MODS).map(([id, m]) => [id, [m.slot, m.r, m.st, m.ab, Chrome.ram(id)]]));
    const iv = { hp: 7, atk: 9, def: 4, spd: 12 };
    const st = Engine.create({ seed: 1234, me: { team: [Mon.create('pyroclaw', 30, { arms: 'mantis', core: 'secondheart' }, iv), Mon.create('ampfang', 30, { optics: 'icebreaker' }, iv)] },
      foe: { team: [Mon.create('corruptor', 30, { arms: 'monowire' }, iv), Mon.create('juggernaut', 30, { frame: 'milspec' }, iv)], trainer: 'G' }, env: 'servers', names: { me: 'A', foe: 'B' } });
    let log = JSON.stringify(Engine.start(st).events);
    for (let t = 0; t < 40 && !st.result; t++) {
      const out = Engine.step(st, { me: Engine.ai(st, 'me'), foe: Engine.ai(st, 'foe') });
      log += JSON.stringify(out.events);
      for (const side of out.need) log += JSON.stringify(Engine.replace(st, side, Engine.firstAlive(st, side)).events);
    }
    rulesCache = fnv(JSON.stringify([PROTO, chart, sp, LEARN, MOVES, mods, Engine.ENV, Chrome.maxRam(LEVEL), REDLINE]) + fnv(log));
    return rulesCache;
  }

  // ---------- Teams ----------
  const pack = (party) => party.slice(0, MAX_TEAM).map((m) => ({ sp: m.sp, iv: { ...m.iv }, moves: m.moves.map((x) => x.id), mods: { ...(m.mods || {}) } }));
  function unpack(list) {
    return list.map((d) => {
      const m = Mon.create(d.sp, LEVEL, d.mods, { ...d.iv });
      m.moves = d.moves.map((id) => ({ id, pp: MOVES[id].pp }));
      return m;
    });
  }
  // A received team must be one the game itself could have produced (garbage in, refused).
  function check(list) {
    if (!Array.isArray(list) || !list.length || list.length > MAX_TEAM) return 'team size';
    for (const d of list) {
      const s = d && SPECIES[d.sp];
      if (!s) return 'unknown species';
      if (!d.iv || ['hp', 'atk', 'def', 'spd'].some((k) => !Number.isInteger(d.iv[k]) || d.iv[k] < 0 || d.iv[k] > 15)) return `${s.n}: bad stats`;
      const learnable = new Set(LEARN[s.line].map(([, id]) => id));
      if (!Array.isArray(d.moves) || !d.moves.length || d.moves.length > 4 || new Set(d.moves).size !== d.moves.length || d.moves.some((id) => !learnable.has(id))) return `${s.n}: illegal moves`;
      if (!d.mods || typeof d.mods !== 'object') return `${s.n}: bad chrome`;
      for (const [slot, id] of Object.entries(d.mods)) if (!SLOTS[slot] || !MODS[id] || MODS[id].slot !== slot) return `${s.n}: bad chrome`;
      const probe = { sp: d.sp, lvl: LEVEL };
      if (Chrome.ramOf(d.mods) > Mon.maxRam(probe) + Mon.headroom(probe)) return `${s.n}: chrome past the redline`;
    }
    return null;
  }

  // ---------- Lockstep helpers ----------
  // Everything that could drift between two games, folded into one short string.
  const hash = (st) => fnv(JSON.stringify([st.r, st.turn, ['me', 'foe'].map((s) => {
    const x = st.sides[s];
    return [x.active, x.stg, Object.keys(x.breach), x.team.map((m) => [m.hp, m.status, m.slp, m.moves.map((v) => v.pp)])];
  })]));
  // Is this a move the other player could really have made?
  function legal(st, side, a) {
    if (!a || typeof a !== 'object') return false;
    const s = st.sides[side], m = s.team[s.active];
    if (a.type === 'move') return a.moveIndex === null || (Number.isInteger(a.moveIndex) && a.moveIndex >= 0 && a.moveIndex < m.moves.length);
    if (a.type === 'switch') return Number.isInteger(a.index) && a.index !== s.active && s.team[a.index] && s.team[a.index].hp > 0;
    return false;
  }
  const legalReplace = (st, side, i) => Number.isInteger(i) && st.sides[side].team[i] && st.sides[side].team[i].hp > 0;

  // ---------- Link Codes ----------
  const b64 = { enc: (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''), dec: (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/')) };
  // [type, stun, ufrag, pwd, fingerprint, setup, candidates: [udp/tcp, ip, port, typ, priority]]
  function encode(desc, stun) {
    const sdp = desc.sdp, get = (k) => { const m = sdp.match(new RegExp(`a=${k}:(.*)`)); return m ? m[1].trim() : ''; };
    const fp = get('fingerprint').split(' ')[1].split(':').map((h) => String.fromCharCode(parseInt(h, 16))).join('');
    const cands = [...sdp.matchAll(/a=candidate:\S+ 1 (\S+) (\d+) (\S+) (\d+) typ (\S+)/g)]
      .filter((c) => c[1].toLowerCase() === 'udp').map((c) => [c[3], +c[4], c[5], +c[2]]);
    return PREFIX + b64.enc(JSON.stringify([desc.type === 'offer' ? 'o' : 'a', stun ? 1 : 0, get('ice-ufrag'), get('ice-pwd'), b64.enc(fp), get('setup'), cands]));
  }
  function decode(code) {
    const raw = String(code || '').replace(/\s+/g, '');
    if (!raw.startsWith(PREFIX)) throw new Error('That isn\'t a Link Code.');
    let d;
    try { d = JSON.parse(b64.dec(raw.slice(PREFIX.length))); } catch { throw new Error('That Link Code is damaged. Copy the whole thing.'); }
    const [type, stun, ufrag, pwd, fp, setup, cands] = d;
    const hex = [...b64.dec(fp)].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(':');
    const lines = ['v=0', `o=- ${Date.now()} 2 IN IP4 127.0.0.1`, 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
      ...cands.map(([ip, port, typ, prio], i) => `a=candidate:${i + 1} 1 udp ${prio} ${ip} ${port} typ ${typ}${typ === 'host' ? '' : ' raddr 0.0.0.0 rport 0'}`),
      'a=end-of-candidates', `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, `a=fingerprint:sha-256 ${hex}`, `a=setup:${setup}`, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144'];
    return { desc: { type: type === 'o' ? 'offer' : 'answer', sdp: lines.join('\r\n') + '\r\n' }, stun: !!stun };
  }

  const gathered = (pc, ms = 5000) => new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const t = setTimeout(res, ms); // a STUN server that never answers shouldn't hang the screen
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });

  // A reliable, ordered JSON pipe with "wait for the next message like this" and a clean failure
  // (every waiter rejects) the moment the link drops.
  function pipe(pc, dc) {
    const inbox = [], waiters = [];
    let dead = null;
    const fail = (why) => { if (dead) return; dead = why; while (waiters.length) waiters.shift().no(new Error(why)); };
    dc.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      const i = waiters.findIndex((w) => w.want(m));
      if (i >= 0) waiters.splice(i, 1)[0].ok(m); else inbox.push(m);
    };
    dc.onclose = () => fail('The link dropped.');
    pc.addEventListener('connectionstatechange', () => { if (['failed', 'closed'].includes(pc.connectionState)) fail('The link dropped.'); });
    return {
      send(m) { if (!dead && dc.readyState === 'open') dc.send(JSON.stringify(m)); },
      next(want, ms = 0) {
        const i = inbox.findIndex(want);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        if (dead) return Promise.reject(new Error(dead));
        return new Promise((ok, no) => {
          const w = { want, ok, no };
          waiters.push(w);
          if (ms) setTimeout(() => { const j = waiters.indexOf(w); if (j >= 0) { waiters.splice(j, 1); no(new Error('No answer from the other phone.')); } }, ms);
        });
      },
      close() { fail('Closed.'); try { dc.close(); pc.close(); } catch { /* already gone */ } },
      get dead() { return dead; },
    };
  }
  const opened = (dc, ms) => new Promise((ok, no) => {
    if (dc.readyState === 'open') return ok();
    const t = setTimeout(() => no(new Error('Couldn\'t reach the other phone. Same Wi-Fi? Codes pasted in full?')), ms);
    dc.addEventListener('open', () => { clearTimeout(t); ok(); });
  });

  // Host: returns { code, accept(replyCode) -> pipe }.
  async function host(stun) {
    const pc = new RTCPeerConnection({ iceServers: stun ? STUN : [] });
    const dc = pc.createDataChannel('robomon', { ordered: true });
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    return {
      code: encode(pc.localDescription, stun),
      async accept(reply) {
        const { desc } = decode(reply);
        if (desc.type !== 'answer') throw new Error('That\'s a host code. Paste the reply code your friend got.');
        await pc.setRemoteDescription(desc);
        await opened(dc, 20000);
        return pipe(pc, dc);
      },
      cancel() { pc.close(); },
    };
  }
  // Guest: returns { code (the reply), ready -> pipe }.
  async function join(hostCode) {
    const { desc, stun } = decode(hostCode);
    if (desc.type !== 'offer') throw new Error('That\'s a reply code. Paste the code the host sent you.');
    const pc = new RTCPeerConnection({ iceServers: stun ? STUN : [] });
    const chan = new Promise((ok) => { pc.ondatachannel = (e) => ok(e.channel); });
    await pc.setRemoteDescription(desc);
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    return {
      code: encode(pc.localDescription, stun),
      ready: chan.then(async (dc) => { await opened(dc, 120000); return pipe(pc, dc); }),
      cancel() { pc.close(); },
    };
  }

  // ---------- Handshake and battle ----------
  // After the pipe opens: swap names, teams and rules fingerprints; the host picks the seed.
  async function handshake(conn, isHost) {
    const mine = pack(G.state.party);
    conn.send({ t: 'hello', v: PROTO, rules: rules(), name: G.state.name, team: mine });
    const hi = await conn.next((m) => m.t === 'hello', 30000);
    if (hi.v !== PROTO || hi.rules !== rules()) throw new Error('Your games are different versions. Both of you need the same build of ROBOMON.');
    const bad = check(hi.team);
    if (bad) throw new Error(`The other team was refused (${bad}).`);
    const name = String(hi.name || 'LINKER').toUpperCase().replace(/[^A-Z0-9 \-]/g, '').slice(0, 10) || 'LINKER';
    let seed;
    if (isHost) { seed = Math.floor(Math.random() * 2 ** 31); conn.send({ t: 'start', seed }); }
    else seed = (await conn.next((m) => m.t === 'start', 30000)).seed | 0;
    return { name, mine, theirs: hi.team, seed };
  }

  async function fight(conn, isHost) {
    const h = await handshake(conn, isHost);
    const local = isHost ? 'me' : 'foe', remote = isHost ? 'foe' : 'me';
    const teams = { [local]: unpack(h.mine), [remote]: unpack(h.theirs) };
    const names = { [local]: G.state.name, [remote]: h.name };
    G.borrowParty(teams[local]);
    let res;
    try {
      res = await G.battle({
        link: { conn, local, seed: h.seed, teams, names }, noBlackout: true, env: null,
        trainer: { name: h.name, look: LOOK.linker, team: teams[remote], money: 0 }, bg: 'city', theme: '#18f0ff', music: 'gym',
      });
    } finally {
      G.returnParty();
      conn.close();
    }
    const rec = G.state.link;
    if (res === 'win') rec.wins++;
    if (res === 'lose') rec.losses++;
    await G.save();
    return res;
  }

  // ---------- Screens ----------
  const codeBox = (code) => `<textarea class="link-code" readonly rows="4" aria-label="Your Link Code">${esc(code)}</textarea>`;
  function copy(el, code, say) {
    const done = () => say('Copied. Send it to your friend any way you like.');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => legacy());
    else legacy();
    function legacy() { const t = el.querySelector('.link-code'); t.select(); try { document.execCommand('copy'); done(); } catch { say('Select the code and copy it by hand.'); } }
  }
  // One screen: optionally show our code (with Copy/Share), optionally take theirs, plus a status
  // line. `go(pasted, status)` runs on Connect and returns a value to close with.
  function screen({ title, steps, mine, ask, go }) {
    const share = mine && navigator.share ? '<button type="button" class="mi" data-a="share">Share</button>' : '';
    return UI.panel(`<div class="menu-title"><span>${esc(title)}</span></div>
      ${mine ? `<p class="link-step">${esc(steps[0])}</p>${codeBox(mine)}<div class="link-row"><button type="button" class="mi" data-a="copy">Copy</button>${share}</div>` : ''}
      ${ask ? `<p class="link-step">${esc(steps[mine ? 1 : 0])}</p><textarea class="link-code" rows="4" placeholder="${PREFIX}…" aria-label="Paste a Link Code"></textarea>` : ''}
      <div class="link-row">${ask ? '<button type="button" class="mi sel" data-a="go">Connect</button>' : ''}<button type="button" class="mi" data-a="cancel">Cancel</button></div>
      <p class="link-status" role="status" aria-live="polite"></p>`, (el, done) => {
      const status = (t) => { el.querySelector('.link-status').textContent = t; };
      el.querySelector('[data-a=cancel]').onclick = () => done(null);
      if (mine) {
        el.querySelector('[data-a=copy]').onclick = () => copy(el, mine, status);
        if (share) el.querySelector('[data-a=share]').onclick = () => navigator.share({ text: mine }).catch(() => {});
      }
      const goBtn = el.querySelector('[data-a=go]');
      const run = async () => {
        const pasted = ask ? el.querySelector('textarea:not([readonly])').value : null;
        if (goBtn) goBtn.disabled = true;
        try { done(await go(pasted, status)); } catch (e) { status(e.message); if (goBtn) goBtn.disabled = false; }
      };
      if (goBtn) goBtn.onclick = run;
      else run(); // nothing to paste: just wait (the guest waiting for the host to connect)
    });
  }

  async function open() {
    if (!supported()) {
      await UI.say('This browser can\'t open peer-to-peer links. (The claude.ai viewer blocks them.)\nOpen the standalone robomon.html file, or the game on a normal web host, on both phones.', { name: 'ECHO · LINK BAND' });
      return;
    }
    const bad = check(pack(G.state.party));
    if (bad) { await UI.say(`Your team can't link yet: ${bad}.`); return; }
    await Tutorial.tip('link');
    const v = await UI.menu({ layout: 'side', title: 'Link battle', cancel: true, items: [
      { label: 'Host a battle', sub: 'Make a code for your friend', value: 'host', color: '#18f0ff' },
      { label: 'Join a battle', sub: 'Paste your friend\'s code', value: 'join', color: '#ff2e88' },
      { label: `Record: ${G.state.link.wins}W ${G.state.link.losses}L`, value: null, disabled: true },
      { label: 'Back', value: null },
    ] });
    if (!v) return;
    let conn = null;
    try {
      if (v === 'host') {
        const net = await UI.menu({ layout: 'side', title: 'Where is your friend?', cancel: true, items: [
          { label: 'Same Wi-Fi', sub: 'Direct, nothing else involved', value: 'lan' },
          { label: 'Different networks', sub: 'Asks a public STUN server (Google) for your address', value: 'net' },
        ] });
        if (!net) return;
        UI.say('Generating your Link Code...', { auto: 1 });
        const h = await host(net === 'net');
        conn = await screen({ title: 'Host a link battle', steps: ['1. Send this code to your friend.', '2. Paste the reply code they send back.'], mine: h.code, ask: true,
          go: async (reply, status) => { status('Connecting...'); return h.accept(reply); } });
        if (!conn) h.cancel();
      } else {
        let g = null;
        const reply = await screen({ title: 'Join a link battle', steps: ['Paste the code your friend sent.'], ask: true,
          go: async (code, status) => { status('Reading code...'); g = await join(code); return g.code; } });
        if (!reply) { if (g) g.cancel(); return; }
        conn = await screen({ title: 'Join a link battle', steps: ['Send this reply code back to your friend. The battle starts when they paste it.'], mine: reply,
          go: async (_, status) => { status('Waiting for your friend...'); return g.ready; } });
        if (!conn) g.cancel();
      }
      if (conn) await fight(conn, v === 'host');
    } catch (e) {
      if (conn) conn.close();
      await UI.say(e.message || 'The link failed.', { name: 'ECHO · LINK BAND' });
    }
  }

  return { open, host, join, fight, encode, decode, pack, unpack, check, hash, legal, legalReplace, rules, supported, LEVEL };
})();
