'use strict';
// Tiny WebAudio synth: sound effects plus a chord-driven chiptune sequencer.

const Sound = (() => {
  let ac = null, master, sfxBus, musicBus;
  const opts = { sfx: true, music: true };
  let song = null, step = 0, nextTime = 0, timer = null;

  function init() {
    if (ac) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = .5; master.connect(ac.destination);
    sfxBus = ac.createGain(); sfxBus.gain.value = .7; sfxBus.connect(master);
    musicBus = ac.createGain(); musicBus.gain.value = .32; musicBus.connect(master);
    return true;
  }

  function unlock() {
    if (!init()) return;
    if (ac.state === 'suspended') ac.resume();
    if (current && !song) { const c = current; current = null; music(c); }
  }

  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function tone(f, dur, type = 'square', vol = .12, at = 0, slide = 0, bus = sfxBus) {
    if (!ac) return;
    const t = (at > 1 ? at : ac.currentTime + at);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + .02);
  }

  let noiseBuf = null;
  function noise(dur, vol = .2, at = 0, cutoff = 4000, bus = sfxBus) {
    if (!ac) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = (at > 1 ? at : ac.currentTime + at);
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t); s.stop(t + dur + .02);
  }

  const seq = (notes, gap, type = 'square', vol = .1, len = .1) =>
    notes.forEach((m, i) => m && tone(freq(m), len, type, vol, i * gap));

  const SFX = {
    blip:      () => tone(1320, .04, 'square', .05),
    select:    () => { tone(880, .05, 'square', .07); tone(1320, .07, 'square', .07, .05); },
    cancel:    () => { tone(660, .05, 'square', .06); tone(440, .07, 'square', .06, .05); },
    bump:      () => tone(90, .08, 'square', .1),
    door:      () => { noise(.25, .15, 0, 1200); tone(220, .2, 'triangle', .1, 0, 440); },
    alert:     () => { tone(1400, .07, 'square', .1); tone(1900, .14, 'square', .1, .08); },
    encounter: () => { seq([64, 67, 71, 76, 79, 83, 88], .05, 'sawtooth', .07, .08); noise(.5, .12, 0, 6000); },
    hit:       () => { noise(.16, .3, 0, 2500); tone(220, .14, 'sawtooth', .14, 0, 55); },
    weak:      () => { noise(.1, .15, 0, 900); tone(160, .1, 'triangle', .1, 0, 80); },
    crit:      () => { noise(.25, .35, 0, 6000); tone(880, .2, 'sawtooth', .12, 0, 110); },
    status:    () => seq([72, 70, 72, 70], .06, 'square', .06, .06),
    buff:      () => seq([60, 64, 67, 72], .05, 'triangle', .1, .08),
    debuff:    () => seq([72, 67, 64, 60], .05, 'triangle', .1, .08),
    heal:      () => seq([72, 76, 79, 84, 79, 84, 88], .09, 'triangle', .12, .14),
    faint:     () => tone(660, .7, 'square', .1, 0, 70),
    throw:     () => tone(300, .35, 'triangle', .1, 0, 1200),
    shake:     () => { tone(180, .06, 'square', .08); noise(.06, .1, 0, 1500); },
    caught:    () => seq([67, 72, 76, 79, 0, 76, 79, 84], .09, 'square', .09, .12),
    levelup:   () => seq([72, 76, 79, 84], .08, 'square', .09, .1),
    evolve:    () => seq([60, 64, 67, 72, 76, 79, 84, 88, 91, 96], .07, 'triangle', .1, .12),
    victory:   () => seq([67, 0, 67, 72, 0, 76, 79, 0, 84], .1, 'square', .09, .14),
    coin:      () => { tone(1568, .06, 'square', .07); tone(2093, .12, 'square', .07, .06); },
  };

  function play(name) {
    if (!opts.sfx || !ac || !SFX[name]) return;
    SFX[name]();
  }

  // Songs: chord progression (root MIDI + quality), 16 steps per bar.
  const S = (s) => s.split('').map((c) => (c === '.' ? null : +c));
  const SONGS = {
    town:   { bpm: 96,  prog: [[57, 'm'], [53, ''], [48, ''], [55, '']], bass: S('1..1..1.1..1..1.'), arp: S('0121012101210121'), arpWave: 'triangle',
              lead: S('4.......3...2...'), lead2: S('2...3...4...5...'), hat: S('..1...1...1...1.'), kick: S('1.......1.......') },
    route:  { bpm: 118, prog: [[52, 'm'], [48, ''], [55, ''], [50, '']], bass: S('1.21.21.1.21.212'), arp: S('0120120120120121'), arpWave: 'square',
              lead: S('3..4..3.2...0...'), lead2: S('2..3..4.5...4...'), hat: S('1.1.1.1.1.1.1.1.'), kick: S('1...1...1...1...'), snare: S('....1.......1...') },
    battle: { bpm: 152, prog: [[57, 'm'], [57, 'm'], [53, ''], [55, '']], bass: S('1212121212121212'), arp: S('0123012301230123'), arpWave: 'sawtooth',
              lead: S('4.4.3.4...5.4.3.'), lead2: S('2.2.3.2...0.2.3.'), hat: S('1111111111111111'), kick: S('1...1...1...1...'), snare: S('....1.......1...') },
    gym:    { bpm: 140, prog: [[50, 'm'], [46, ''], [48, ''], [57, '']], bass: S('1.1.2.1.1.1.2.12'), arp: S('0121312101213121'), arpWave: 'sawtooth',
              lead: S('4...5...4.3.2...'), lead2: S('5...4...3.2.0...'), hat: S('.1.1.1.1.1.1.1.1'), kick: S('1..1..1.1..1..1.'), snare: S('....1.......1...') },
    center: { bpm: 84,  prog: [[48, ''], [57, 'm'], [53, ''], [55, '']], bass: S('1.......1...1...'), arp: S('0123210101232101'), arpWave: 'triangle',
              lead: S('3.......4.......'), lead2: S('2.......1.......') },
  };

  function chord(root, q) { return [root, root + (q === 'm' ? 3 : 4), root + 7, root + 12, root + (q === 'm' ? 15 : 16), root + 19]; }

  function schedule() {
    if (!song || !ac) return;
    const spb = 60 / song.bpm / 4;
    while (nextTime < ac.currentTime + .12) {
      const bar = Math.floor(step / 16) % song.prog.length, i = step % 16;
      const [root, q] = song.prog[bar];
      const c = chord(root, q);
      const b = song.bass[i];
      if (b) tone(freq(root - 24 + (b === 2 ? 12 : 0)), spb * 1.6, 'square', .1, nextTime, 0, musicBus);
      const a = song.arp && song.arp[i];
      if (a !== null && a !== undefined) tone(freq(c[a] + 12), spb * .9, song.arpWave, .035, nextTime, 0, musicBus);
      const lp = (Math.floor(step / 16) % 2) ? song.lead2 : song.lead;
      const l = lp && lp[i];
      if (l !== null && l !== undefined) tone(freq(c[l] + 12), spb * 3, 'square', .045, nextTime, 0, musicBus);
      if (song.kick && song.kick[i]) tone(150, .12, 'sine', .35, nextTime, 40, musicBus);
      if (song.snare && song.snare[i]) noise(.12, .18, nextTime, 3000, musicBus);
      if (song.hat && song.hat[i]) noise(.03, .06, nextTime, 9000, musicBus);
      nextTime += spb;
      step++;
    }
  }

  let current = null;
  function music(name) {
    if (name === current) return;
    current = name;
    song = null;
    clearInterval(timer);
    if (!name || !opts.music || !ac) return;
    song = SONGS[name];
    step = 0; nextTime = ac.currentTime + .05;
    timer = setInterval(schedule, 30);
  }

  function setOpt(key, val) {
    opts[key] = val;
    if (key === 'music') { const c = current; current = null; music(val ? c : null); current = c; }
  }

  document.addEventListener('visibilitychange', () => {
    if (!ac) return;
    if (document.hidden) ac.suspend(); else ac.resume();
  });

  return { unlock, play, music, setOpt, opts, get track() { return current; } };
})();
