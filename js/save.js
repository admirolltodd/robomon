'use strict';
// Save data: versioned migrations and storage (local, plus a claude.ai cloud copy).
// Every save carries `v`. On load, `Save.migrate` walks it up one version at a time through
// MIGRATIONS, so an old save never meets code that expects fields it doesn't have.
// To change the save shape: bump SAVE_VERSION and add MIGRATIONS[old] that upgrades old → old + 1.
// Migrations must be idempotent and must not throw on partial data. tools/validate.js runs them
// against the fixtures in tools/fixtures/.

const SAVE_VERSION = 4;

const Save = (() => {
  const LC_BACK = { map: 'lowtown', x: 5, y: 6, dir: 'down' };
  const OPTS = { sfx: true, music: true, fast: false, fx: true, tips: true, minimap: true, mapSize: 'medium', textSize: 'normal', speed: 1, musicVol: .7, sfxVol: 1, autosave: true, ambience: true };

  const MIGRATIONS = {
    // v1 → v2: Chapter 2 added chrome (module stash and per-bot sockets), the Options menu and
    // the `starter` story flag. Saves from before then lack some or all of these.
    1(s) {
      s.mods = s.mods && typeof s.mods === 'object' ? s.mods : {};
      for (const m of [...(s.party || []), ...(s.box || [])]) m.mods = m.mods && typeof m.mods === 'object' ? m.mods : {};
      s.opts = { ...OPTS, ...(s.opts || {}) };
      s.flags = s.flags || {};
      if (s.starter) s.flags.starter = 1;
      if (s.lastCenter && !s.lastCenter.back) s.lastCenter.back = { ...LC_BACK };
      s.v = 2;
      return s;
    },
    // v2 → v3: Phase 4 added Salvage (Rivka's crafting currency) and the Deep Net arcade records.
    2(s) {
      s.salvage = Number.isFinite(s.salvage) ? s.salvage : 0;
      const dn = s.deepnet && typeof s.deepnet === 'object' ? s.deepnet : {};
      s.deepnet = { best: dn.best || 0, runs: dn.runs || 0, top: Array.isArray(dn.top) ? dn.top : [] };
      s.v = 3;
      return s;
    },
    // v3 → v4: Phase 5 added link battles between phones, with a win/loss record.
    3(s) {
      const l = s.link && typeof s.link === 'object' ? s.link : {};
      s.link = { wins: l.wins || 0, losses: l.losses || 0 };
      s.v = 4;
      return s;
    },
  };

  // Returns an upgraded copy of `raw` (or null for garbage). Unknown future versions pass through
  // untouched with a warning: better to try than to wipe someone's progress.
  function migrate(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const s = JSON.parse(JSON.stringify(raw));
    s.v = s.v || 1;
    if (s.v > SAVE_VERSION) { console.warn(`Save is v${s.v}, newer than this build (v${SAVE_VERSION}).`); return s; }
    while (s.v < SAVE_VERSION) {
      const step = MIGRATIONS[s.v];
      if (!step) throw new Error(`No save migration from v${s.v}`);
      step(s);
    }
    return s;
  }

  return { migrate, MIGRATIONS, OPTS };
})();

const Store = (() => {
  const KEY = 'robomon.save.v1'; // the key predates versioning; `v` inside the save is what counts
  let cloudP = null, lastCloud = 0;

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }
  function writeLocal(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage blocked */ }
  }
  // Signed-in claude.ai viewers also get a private cloud copy so saves follow them across devices.
  function cloud() {
    if (cloudP) return cloudP;
    cloudP = (async () => {
      try {
        if (!window.claude || !window.claude.use) return null;
        const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
        if (!db || !user) return null;
        const id = await user.id();
        return id ? db.doc(`data/users/${id}/save`) : null;
      } catch { return null; }
    })();
    return cloudP;
  }
  async function readCloud() {
    try {
      const ref = await cloud();
      if (!ref) return null;
      const snap = await ref.get();
      return snap.exists ? JSON.parse(snap.data().json) : null;
    } catch { return null; }
  }
  async function writeCloud(d, force) {
    if (!force && Date.now() - lastCloud < 20000) return;
    lastCloud = Date.now();
    try {
      const ref = await cloud();
      if (ref) await ref.set({ savedAt: d.savedAt, json: JSON.stringify(d) });
    } catch { /* offline or read-only viewer */ }
  }
  // Both copies are migrated before comparing, so the newer one wins whatever version wrote it.
  async function load() {
    const safe = (d) => { try { return Save.migrate(d); } catch (e) { console.error(e); return null; } };
    const local = safe(readLocal());
    const remote = safe(await Promise.race([readCloud(), wait(2500).then(() => null)]));
    if (remote && (!local || remote.savedAt > local.savedAt)) return remote;
    return local;
  }
  function save(d, force) { writeLocal(d); return writeCloud(d, force); }
  return { load, save, clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } } };
})();
