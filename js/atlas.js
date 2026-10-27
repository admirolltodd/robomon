'use strict';
// Imported pixel art. Sheets are 16px-cell tilesets and 16x32-frame character sheets from the
// Tuxemon project (see assets/manifest.json for every source and licence; CREDITS below is what
// the game shows). They are baked into the night palette by tools/night.py and loaded from
// assets/night/. One world tile (32px) is one 16px cell drawn at 2x, so characters come out
// 32x64: a tile wide and two tall, the Game Boy Advance proportion. Robomon battle art comes from
// Openmon and Tuxemon creatures rebuilt as robots, cyborgs and wetware by tools/cyberize.py.

const Atlas = (() => {
  const BASE = 'assets/night/';
  const CELL = 16, T = 32;
  const SHEETS = {
    outdoor: { emit: false }, buildings: { emit: true }, water: { emit: false }, setpieces: { emit: true },
    office: { emit: true }, walls: { emit: false }, floors: { emit: false },
    hero_back: { emit: false }, linker: { emit: false }, alien: { emit: false }, props: { emit: true },
    facades: { emit: true }, void: { emit: true }, cars: { emit: false }, grit: { emit: false },
    title_city: { emit: false }, doors: { emit: true }, veg: { emit: false }, blackcar: { emit: false },
  };
  const NPCS = ['adventurer', 'adventurerblack', 'heroine', 'heroine_black', 'bob', 'boss', 'brute', 'catgirl', 'ceo', 'cooldude', 'disciple', 'dragonrider',
    'enbyasian', 'fashionista', 'firefighter', 'fisher', 'goth', 'granny', 'homemaker', 'girl1', 'ghost', 'childactor', 'christie', 'nurse', 'professor', 'scientist',
    'gba_artwoman', 'gba_birdman', 'gba_bugcatcher', 'gba_teacher', 'gba_girl2', 'gba_oldman', 'gba_ruinsmaniac', 'gba_diver', 'gba_farmergirl', 'gba_young'];
  const CREDITS = [
    { what: 'Outdoor, water, building and interior tiles', who: 'The Tuxemon project: ArMM1998, George Bailey, Kelvin Shadewing, Mircea Kitsune, Sanglorian, Redshrike, Mike Bramson, the Superpowers team and LPC contributors', license: 'CC-BY-SA 4.0, CC-BY 3.0 and XYG Open Source v1.1, per tile' },
    { what: 'Set pieces (lamps, benches, machines, towers)', who: 'Kelvin Shadewing', license: 'XYG Open Source License v1.1' },
    { what: 'Overworld character sprites', who: 'Catch Challenger, Sanglorian and Tuxemon contributors', license: 'CC-BY-SA 4.0 and CC-BY 3.0, per sprite' },
    { what: 'GBA-style townsfolk', who: 'helygp9 (GBA Style Character Overworlds Pack)', license: 'free for games, credit optional' },
    { what: 'Robomon battle art (rebuilt as robots, cyborgs and wetware)', who: 'Screen Smith (Openmon, CC0) and Tuxemon: Leo, Sanglorian, extyrannomon, josepharaoh99, Cavalcadeur', license: 'CC0 and CC-BY-SA 4.0' },
    { what: 'Cyberpunk storefronts', who: 'knekko (Future City 27)', license: 'CC0' },
    { what: 'Furniture, doors, vegetation, the black car, battle portraits', who: 'Tuxemon: Mike Bramson, Redshrike, George_, Isaiah658, Sanglorian and contributors', license: 'CC-BY-SA 4.0, CC-BY 3.0 and CC0, per file' },
    { what: 'Posters, cars and concrete grit', who: 'packs supplied by the player who commissioned this build', license: 'as supplied' },
    { what: 'Title screen art', who: 'generated with Canva AI for ROBOMON', license: 'Canva terms' },
    { what: 'Night-palette versions of all of the above', who: 'ROBOMON (tools/night.py), under the same licences', license: 'CC-BY-SA 4.0' },
  ];

  const img = {};
  let loaded = false, failed = [];

  const one = (key, file) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { img[key] = im; res(); };
    im.onerror = () => { failed.push(file); res(); }; // a missing sheet degrades to the vector fallback, never a crash
    im.src = BASE + file;
  });
  let ready = null;
  function load() {
    if (ready) return ready;
    const jobs = [];
    for (const [id, s] of Object.entries(SHEETS)) { jobs.push(one(id, `${id}.png`)); if (s.emit) jobs.push(one(id + '.emit', `${id}.emit.png`)); }
    for (const n of NPCS) jobs.push(one('npc_' + n, `npc_${n}.png`));
    for (const sp of Object.keys(SPECIES)) jobs.push(one('mon_' + sp, `mon_${sp}.png`));
    ready = Promise.all(jobs).then(() => { loaded = true; if (failed.length) console.warn('Atlas: missing sheets', failed); });
    return ready;
  }

  // Draws `w` x `h` cells starting at (col, row) of a sheet, at world position (x, y), one cell per tile.
  function draw(ctx, id, col, row, x, y, w = 1, h = 1) {
    const im = img[id];
    if (!im) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, col * CELL, row * CELL, w * CELL, h * CELL, x, y, w * T, h * T);
    return true;
  }
  const has = (id) => !!img[id];
  const image = (id) => img[id] || null;

  // Character frame: dir down|right|left|up, step 0 (standing) | 1 | 2, drawn with its feet at the
  // bottom of the tile at (x, y) and its head over the tile above.
  const ROW = { down: 0, left: 1, right: 2, up: 3 }; // Tuxemon walk sheets: front, left, right, back
  const COL = [1, 0, 2];
  function npc(ctx, name, dir, step, x, y) {
    const im = img['npc_' + name];
    if (!im) return false;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, COL[step % 3] * CELL, ROW[dir] * 32, CELL, 32, x, y - T, T, T * 2);
    return true;
  }

  // Battle art (tools/cyberize.py): 256x64, front | back | front glow | back glow, feet on row 62.
  const mon = (sp) => img['mon_' + sp] || null;

  return { load, draw, npc, has, image, mon, SHEETS, NPCS, CREDITS, get loaded() { return loaded; }, get failed() { return failed; } };
})();
