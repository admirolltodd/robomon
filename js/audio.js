'use strict';
// WebAudio engine: sound effects, an original synthwave score (procedural, so it is free to use
// and ships no audio files), and per-area ambience beds.

const Sound = (() => {
  let ac = null, master, sfxBus, musicBus, ambBus, fxIn, verb, delay;
  const opts = { sfx: true, music: true, ambience: true };
  const vol = { music: .7, sfx: 1 };
  let song = null, step = 0, nextTime = 0, timer = null, current = null;
  let noiseBuf = null;

  function makeImpulse(seconds, decay) {
    const len = ac.sampleRate * seconds, b = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = .55;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.connect(master);
    ambBus = ac.createGain(); ambBus.gain.value = 0; ambBus.connect(master);
    // shared space: a short convolution reverb plus a dark tape-style echo
    verb = ac.createConvolver(); verb.buffer = makeImpulse(2.6, 3);
    const verbOut = ac.createGain(); verbOut.gain.value = .32; verb.connect(verbOut); verbOut.connect(musicBus);
    delay = ac.createDelay(1); delay.delayTime.value = .375;
    const fb = ac.createGain(); fb.gain.value = .34;
    const dlp = ac.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 2400;
    delay.connect(dlp); dlp.connect(fb); fb.connect(delay); dlp.connect(musicBus);
    fxIn = { verb, delay };
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; // pinkish noise
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526;
      d[i] = (b0 + b1 + b2 + w * .1848) * .18;
    }
    applyVolumes();
    return true;
  }

  function applyVolumes() {
    if (!ac) return;
    musicBus.gain.setTargetAtTime(opts.music ? .42 * vol.music : 0, ac.currentTime, .1);
    sfxBus.gain.setTargetAtTime(opts.sfx ? .75 * vol.sfx : 0, ac.currentTime, .05);
  }

  // Mobile browsers only start audio inside a user gesture, and iOS can drop a running context to
  // 'suspended' or 'interrupted' at any time (calls, Siri, lock screen, app switch). So: unlock on
  // every gesture, resume whenever the page is visible again, and never trust the context's state.
  function unlock() {
    const fresh = !ac;
    if (!init()) return;
    if (fresh) { // older iOS WebKit stays silent until a buffer is started inside the gesture
      const b = ac.createBufferSource(); b.buffer = ac.createBuffer(1, 1, 22050); b.connect(ac.destination); b.start(0);
      ac.onstatechange = () => { if (!parked && ac.state !== 'running') resume(); };
    }
    resume();
    if (current && !song) { const c = current; current = null; music(c); }
    if (pendingAmb) { const a = pendingAmb; pendingAmb = null; ambience(a); }
  }

  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const at = (a) => (a > 1 ? a : ac.currentTime + a);

  // ---------- Voices ----------
  function tone(f, dur, type = 'square', v = .12, a = 0, slide = 0, bus = sfxBus) {
    if (!ac) return;
    const t = at(a);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + .02);
  }

  function noise(dur, v = .2, a = 0, cutoff = 4000, bus = sfxBus, type = 'lowpass', q = 0) {
    if (!ac) return;
    const t = at(a);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.frequency.value = cutoff; if (q) f.Q.value = q;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random()); s.stop(t + dur + .02);
  }

  // Filtered saw/pulse voice with ADSR-ish envelope and optional sends.
  function synth(m, t, dur, o) {
    const g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.cut0 || o.cut || 2000, t);
    if (o.cut0) f.frequency.exponentialRampToValueAtTime(Math.max(80, o.cut), t + Math.min(dur, o.sweep || .2));
    const voices = o.detune ? [-o.detune, o.detune] : [0];
    for (const dt of voices) {
      const osc = ac.createOscillator();
      osc.type = o.wave || 'sawtooth'; osc.frequency.value = freq(m); osc.detune.value = dt;
      if (o.vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.5; lg.gain.value = o.vib; l.connect(lg); lg.connect(osc.detune); l.start(t); l.stop(t + dur + (o.rel || .1)); }
      osc.connect(f); osc.start(t); osc.stop(t + dur + (o.rel || .1) + .05);
    }
    const peak = o.v / voices.length;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + (o.att || .005));
    g.gain.setValueAtTime(peak, t + Math.max(o.att || .005, dur - .02));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur + (o.rel || .1));
    f.connect(g); g.connect(o.bus || musicBus);
    if (o.verb) { const s = ac.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(fxIn.verb); }
    if (o.echo) { const s = ac.createGain(); s.gain.value = o.echo; g.connect(s); s.connect(fxIn.delay); }
    return g;
  }

  function kick(t, v = .9) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .12);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + .32);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + .34);
  }
  function snare(t, v = .35) {
    noise(.18, v, t, 1800, musicBus, 'bandpass', .8);
    tone(190, .09, 'triangle', v * .5, t, 120, musicBus);
    const s = ac.createGain(); s.gain.value = .5; // a little room on the snare
    const n = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    n.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 2200;
    g.gain.setValueAtTime(v * .5, t); g.gain.exponentialRampToValueAtTime(.0001, t + .12);
    n.connect(f); f.connect(g); g.connect(s); s.connect(fxIn.verb); n.start(t, Math.random()); n.stop(t + .14);
  }
  const hat = (t, v = .06, open) => noise(open ? .18 : .035, v, t, 7500, musicBus, 'highpass');

  // ---------- Sound effects ----------
  const seq = (notes, gap, type = 'square', v = .1, len = .1) =>
    notes.forEach((m, i) => m && tone(freq(m), len, type, v, i * gap));

  const SFX = {
    blip:      () => tone(1320, .035, 'square', .04),
    select:    () => { tone(880, .05, 'square', .06); tone(1320, .07, 'square', .06, .05); },
    cancel:    () => { tone(660, .05, 'square', .05); tone(440, .07, 'square', .05, .05); },
    bump:      () => tone(90, .08, 'square', .09),
    door:      () => { noise(.35, .14, 0, 900); tone(140, .3, 'sawtooth', .06, 0, 70); },
    alert:     () => { tone(1400, .07, 'square', .09); tone(1900, .14, 'square', .09, .08); },
    encounter: () => { seq([52, 55, 59, 64, 67, 71, 76], .045, 'sawtooth', .06, .09); noise(.6, .14, 0, 6000, sfxBus, 'highpass'); tone(55, .6, 'sawtooth', .12, 0, 30); },
    hit:       () => { noise(.16, .32, 0, 2600); tone(180, .16, 'sawtooth', .14, 0, 45); },
    weak:      () => { noise(.1, .15, 0, 900); tone(160, .1, 'triangle', .09, 0, 80); },
    crit:      () => { noise(.28, .38, 0, 6500); tone(900, .22, 'sawtooth', .11, 0, 90); tone(60, .3, 'sine', .3, 0, 30); },
    status:    () => seq([72, 70, 72, 70], .06, 'square', .05, .06),
    buff:      () => seq([60, 64, 67, 72], .05, 'triangle', .1, .08),
    debuff:    () => seq([72, 67, 64, 60], .05, 'triangle', .1, .08),
    heal:      () => seq([72, 76, 79, 84, 79, 84, 88], .09, 'triangle', .1, .16),
    faint:     () => { tone(660, .8, 'sawtooth', .07, 0, 50); noise(.6, .1, .1, 500); },
    throw:     () => tone(300, .35, 'triangle', .1, 0, 1200),
    shake:     () => { tone(180, .06, 'square', .07); noise(.06, .1, 0, 1500); },
    caught:    () => seq([67, 72, 76, 79, 0, 76, 79, 84], .09, 'square', .08, .12),
    levelup:   () => seq([72, 76, 79, 84], .08, 'square', .08, .1),
    evolve:    () => seq([60, 64, 67, 72, 76, 79, 84, 88, 91, 96], .07, 'triangle', .1, .12),
    victory:   () => seq([67, 0, 67, 72, 0, 76, 79, 0, 84], .1, 'square', .08, .14),
    coin:      () => { tone(1568, .06, 'square', .06); tone(2093, .12, 'square', .06, .06); },
  };

  function play(name) {
    if (!opts.sfx || !ac || !SFX[name]) return;
    SFX[name]();
  }

  // ---------- Score ----------
  // Pattern strings: one char per 16th note. Digits index into the chord (0 root .. 5 tenth).
  const S = (s) => s.split('').map((c) => (c === '.' ? null : +c));
  const SONGS = {
    center: { bpm: 84, prog: [[48, ''], [57, 'm'], [53, ''], [55, '']], pad: { cut: 1400, v: .05 },
      bass: S('1.......1...1...'), arp: S('0.2.4.2.3.2.4.2.'), arpV: .025, arpWave: 'triangle',
      lead: S('4.......3.......'), lead2: S('2.......1.......'), hat: S('..1...1...1...1.') },
    town: { bpm: 96, prog: [[57, 'm'], [53, ''], [48, ''], [55, '']], pad: { cut: 1800, v: .05 },
      bass: S('1..1..1.1..1..2.'), arp: S('0123012301230123'), arpWave: 'square', arpV: .022,
      lead: S('4.......3...2...'), lead2: S('2...3...4...5...'), hat: S('..1...1...1...1.'), kick: S('1.......1.......'), snare: S('....1.......1...') },
    route: { bpm: 116, prog: [[52, 'm'], [48, ''], [55, ''], [50, '']], pad: { cut: 1200, v: .04 },
      bass: S('1.21.21.1.21.212'), arp: S('0120120120120121'), arpWave: 'sawtooth', arpV: .02,
      lead: S('3..4..3.2...0...'), lead2: S('2..3..4.5...4...'), hat: S('1.1.1.1.1.1.1.1.'), kick: S('1...1...1...1...'), snare: S('....1.......1...') },
    gutter: { bpm: 74, prog: [[48, 'm'], [44, ''], [41, 'm'], [43, '']], pad: { cut: 700, v: .06 },
      bass: S('1.....1.1.......'), arp: S('0...2...1...3...'), arpWave: 'triangle', arpV: .03,
      lead: S('4...........3...'), lead2: S('2.......0.......'), hat: S('..1.......1.....'), kick: S('1.......1..1....'), snare: S('........1.......') },
    spire: { bpm: 130, prog: [[50, 'm'], [50, 'm'], [46, ''], [45, '']], pad: { cut: 900, v: .04 },
      bass: S('1111111111111121'), arp: S('0123012301230123'), arpWave: 'sawtooth', arpV: .018,
      lead: S('4.....3.....2...'), lead2: S('5.....4.....3.2.'), hat: S('1.1.1.1.1.1.1.1.'), kick: S('1...1...1...1...'), snare: S('....1.......1..1') },
    core: { bpm: 62, prog: [[45, 'm'], [46, ''], [45, 'm'], [41, '']], pad: { cut: 1100, v: .07 },
      bass: S('1...............'), arp: S('0.2.4.2.0.2.5.2.'), arpWave: 'sine', arpV: .04,
      lead: S('5...............'), lead2: S('4.......3.......') },
    battle: { bpm: 152, prog: [[57, 'm'], [57, 'm'], [53, ''], [55, '']], pad: { cut: 1600, v: .035 },
      bass: S('1212121212121212'), arp: S('0123012301230123'), arpWave: 'sawtooth', arpV: .02,
      lead: S('4.4.3.4...5.4.3.'), lead2: S('2.2.3.2...0.2.3.'), hat: S('1111111111111111'), kick: S('1...1...1...1...'), snare: S('....1.......1...') },
    gym: { bpm: 140, prog: [[50, 'm'], [46, ''], [48, ''], [57, '']], pad: { cut: 1500, v: .04 },
      bass: S('1.1.2.1.1.1.2.12'), arp: S('0121312101213121'), arpWave: 'sawtooth', arpV: .02,
      lead: S('4...5...4.3.2...'), lead2: S('5...4...3.2.0...'), hat: S('.1.1.1.1.1.1.1.1'), kick: S('1..1..1.1..1..1.'), snare: S('....1.......1...') },
  };

  const chord = (root, q) => [root, root + (q === 'm' ? 3 : 4), root + 7, root + 12, root + (q === 'm' ? 15 : 16), root + 19];

  function schedule() {
    if (!song || !ac) return;
    const spb = 60 / song.bpm / 4;
    // After a stall (background tab, suspended context) pick up from now instead of firing a
    // burst of every note that was missed.
    if (nextTime < ac.currentTime) nextTime = ac.currentTime + .05;
    while (nextTime < ac.currentTime + .15) {
      const barN = Math.floor(step / 16), i = step % 16;
      const [root, q] = song.prog[barN % song.prog.length];
      const c = chord(root, q), t = nextTime;
      if (i === 0 && song.pad) { // detuned pad holds the whole bar, ducked by the kick below
        for (const n of [c[0] + 12, c[1] + 12, c[2] + 12]) synth(n, t, spb * 15.5, { wave: 'sawtooth', detune: 9, cut: song.pad.cut, v: song.pad.v, att: .35, rel: .6, verb: .5 });
      }
      const b = song.bass[i];
      if (b) synth(root - 24 + (b === 2 ? 12 : 0), t, spb * 1.4, { wave: 'sawtooth', cut0: 1600, cut: 260, sweep: .12, q: 6, v: .16, rel: .05 });
      const a = song.arp && song.arp[i];
      if (a !== null && a !== undefined) synth(c[a] + 12, t, spb * .8, { wave: song.arpWave, cut: 3000, v: song.arpV || .02, rel: .05, echo: .4 });
      const lp = barN % 2 ? song.lead2 : song.lead;
      const l = lp && lp[i];
      if (l !== null && l !== undefined) synth(c[l] + 12, t, spb * 3.2, { wave: 'square', cut: 2600, v: .035, att: .02, rel: .2, vib: 8, echo: .55, verb: .3 });
      if (song.kick && song.kick[i]) kick(t);
      if (song.snare && song.snare[i]) snare(t);
      if (song.hat && song.hat[i]) hat(t, .045, i % 8 === 6);
      nextTime += spb;
      step++;
    }
  }

  function music(name) {
    if (name === current) return;
    current = name;
    song = null;
    clearInterval(timer);
    if (!name || !opts.music || !ac) return;
    song = SONGS[name] || SONGS.town;
    step = 0; nextTime = ac.currentTime + .08;
    timer = setInterval(schedule, 30);
  }

  // ---------- Ambience ----------
  // spec: { rain, city, hum, servers, drone, drips } each 0..1
  const layers = {};
  let pendingAmb = null, ambSpec = {}, ambTimer = null;

  function layer(name, build) {
    if (!layers[name]) layers[name] = build();
    return layers[name];
  }
  function noiseLayer(type, f, q) {
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true; fl.type = type; fl.frequency.value = f; if (q) fl.Q.value = q;
    g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(ambBus); s.start();
    return { g, fl };
  }
  function droneLayer(freqs, type = 'sine') {
    const g = ac.createGain(); g.gain.value = 0; g.connect(ambBus);
    freqs.forEach((f) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(g); o.start(); });
    return { g };
  }

  function ambience(spec) {
    if (!ac) { pendingAmb = spec; return; }
    ambSpec = spec || {};
    const t = ac.currentTime;
    ambBus.gain.setTargetAtTime(opts.ambience ? .5 : 0, t, .3);
    const L = {
      rain: layer('rain', () => noiseLayer('bandpass', 2600, .6)),
      rainLow: layer('rainLow', () => noiseLayer('lowpass', 500)),
      city: layer('city', () => noiseLayer('lowpass', 220)),
      hum: layer('hum', () => droneLayer([60, 120.4], 'sawtooth')),
      servers: layer('servers', () => noiseLayer('bandpass', 900, 1.5)),
      drone: layer('drone', () => droneLayer([55, 55.6, 82.4, 110.3], 'sine')),
    };
    const set = (k, v) => L[k].g.gain.setTargetAtTime(v, t, .8);
    set('rain', (ambSpec.rain || 0) * .55);
    set('rainLow', (ambSpec.rain || 0) * .45);
    set('city', (ambSpec.city || 0) * .5);
    set('hum', (ambSpec.hum || 0) * .012);
    set('servers', (ambSpec.servers || 0) * .22);
    set('drone', (ambSpec.drone || 0) * .09);
    clearInterval(ambTimer);
    ambTimer = setInterval(ambientEvents, 700);
  }

  // Sparse one-shots that make places feel alive: drips, sirens, server chirps, far traffic.
  function ambientEvents() {
    if (!ac || !opts.ambience || document.hidden) return;
    const s = ambSpec, r = Math.random();
    if (s.drips && r < .5 * s.drips) tone(1800 + Math.random() * 1600, .09, 'sine', .05, Math.random() * .5, 900, ambBus);
    if (s.city && r > .985) { const t0 = ac.currentTime; tone(700, 2.4, 'sine', .018, t0, 950, ambBus); tone(950, 2.4, 'sine', .014, t0 + 1.2, 700, ambBus); }
    if (s.city && r > .9 && r < .93) noise(2.5, .08 * s.city, 0, 400, ambBus);
    if (s.servers && r < .15) tone(2400 + Math.floor(Math.random() * 4) * 300, .05, 'square', .012, Math.random() * .4, 0, ambBus);
    if (s.drone && r < .12) tone(freq(81 + [0, 3, 7, 10, 12][Math.floor(Math.random() * 5)]), 2.5, 'sine', .015, 0, 0, ambBus);
  }

  // Duck the ambience during battles so the fight music leads.
  function duck(on) {
    if (!ac) return;
    ambBus.gain.setTargetAtTime(opts.ambience ? (on ? .18 : .5) : 0, ac.currentTime, .4);
  }

  function setOpt(key, val) {
    opts[key] = val;
    if (key === 'music') { const c = current; current = null; music(val ? c : null); current = c; applyVolumes(); }
    if (key === 'sfx') applyVolumes();
    if (key === 'ambience' && ac) ambBus.gain.setTargetAtTime(val ? .5 : 0, ac.currentTime, .3);
  }

  function setVolume(m, s) {
    vol.music = m; vol.sfx = s;
    opts.music = m > 0; opts.sfx = s > 0;
    if (!opts.music && song) { song = null; clearInterval(timer); }
    else if (opts.music && !song && current && ac) { const c = current; current = null; music(c); }
    applyVolumes();
  }

  let parked = false; // we suspended on purpose (page hidden); don't fight it
  function resume() {
    if (!ac || document.hidden || ac.state === 'running' || ac.state === 'closed') return;
    parked = false;
    ac.resume().catch(() => { /* not inside a gesture yet; the next tap retries */ });
  }
  function suspend() { if (ac && ac.state === 'running') { parked = true; ac.suspend().catch(() => {}); } }

  // Capture phase, so taps on menus and dialogs count too, not just the controller.
  for (const ev of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : resume()));
  window.addEventListener('pagehide', suspend);
  window.addEventListener('pageshow', resume); // also fires when iOS restores the page from bfcache

  return { unlock, play, music, ambience, duck, setOpt, setVolume, opts, get track() { return current; }, get state() { return ac ? ac.state : 'locked'; } };
})();
