'use strict';
// Chrome: upgrade modules a Robomon can install, one per slot.
// st: stat bonuses as fractions (.1 = +10%). ab: battle ability key handled in battle.js.
// vis: how the module shows on the sprite (see Sprites.drawBot).

const SLOTS = {
  arms:   { n: 'Arms',   hint: 'Weapons and manipulators' },
  frame:  { n: 'Frame',  hint: 'Armor and chassis' },
  optics: { n: 'Optics', hint: 'Sensors and targeting' },
  core:   { n: 'Core',   hint: 'Reactor and operating system' },
};

const RARITY = [
  { n: 'Common',    c: '#a3abc2' },
  { n: 'Uncommon',  c: '#5ee38a' },
  { n: 'Rare',      c: '#4aa8ff' },
  { n: 'Epic',      c: '#c46bff' },
  { n: 'Legendary', c: '#ffb52e' },
];

const ABILITY = {
  keen:     'Critical hits land twice as often.',
  pierce:   'Attacks ignore 30% of the target\'s Defense.',
  salvo:    'Fires a missile volley when it enters battle (1/8 of the foe\'s max HP).',
  shock:    'Hits have a 15% chance to short-circuit the target.',
  dodge:    '15% chance to shimmer out of an attack\'s way.',
  noBrn:    'Immune to Overheated.',
  noPar:    'Immune to Shorted.',
  noPsn:    'Immune to Infected.',
  trueshot: 'Its moves never miss.',
  critUp:   'Critical hit chance +10%.',
  exploit:  'Super-effective hits deal 25% more damage.',
  netrun:   'Virus and Psi moves deal 25% more; status moves never miss.',
  endure:   'Once per battle, survives a knockout blow with 1 HP.',
  quick:    'Always moves first on its first turn in battle.',
  berserk:  'Attack x1.5 while HP is below one third.',
  regen:    'Recovers 1/16 of its max HP at the end of every turn.',
};

const MODS = {
  // ---- Arms ----
  servo:      { n: 'Servo Grip', slot: 'arms', r: 0, st: { atk: .06 }, vis: 'claws',
    lore: 'Off-the-shelf servo upgrade from a corner chop shop. Cheap, loud, works.' },
  shockfist:  { n: 'Shock Knuckles', slot: 'arms', r: 1, st: { atk: .05 }, ab: 'shock', vis: 'shock',
    lore: 'Taser coils wired into the knuckles. The arcade fight clubs banned them years ago. Nobody listened.' },
  launcher:   { n: 'Micro-Missile Pod', slot: 'arms', r: 1, st: { atk: .04 }, ab: 'salvo', vis: 'pod',
    lore: 'Pop-up shoulder rocket pod. One volley, then a long reload. Make the first shot count.' },
  mantis:     { n: 'Mantis Blades', slot: 'arms', r: 2, st: { atk: .12 }, ab: 'keen', vis: 'mantis',
    lore: 'Thermal blades that fold into the forearm and spring out at the speed of a bad decision. Street samurai chrome.' },
  gorilla:    { n: 'Gorilla Arms', slot: 'arms', r: 2, st: { atk: .25, spd: -.1 }, vis: 'gorilla',
    lore: 'Hydraulic knuckles rated to punch through a car door. Doubles as a lockpick, if the lock is a wall.' },
  monowire:   { n: 'Monowire', slot: 'arms', r: 3, st: { atk: .1 }, ab: 'pierce', vis: 'wire',
    lore: 'One-molecule-thick filament on a spool. Cuts armor like wet paper. Also fingers. Handle with care.' },
  // ---- Frame ----
  scrapplate: { n: 'Scrap Plating', slot: 'frame', r: 0, st: { hp: .08 }, vis: 'scrap',
    lore: 'Junkyard armor hammered on with rivets and hope. Ugly, but it stops bullets. Mostly.' },
  thermal:    { n: 'Thermal Damper', slot: 'frame', r: 0, st: { def: .05 }, ab: 'noBrn', vis: 'fins',
    lore: 'Heat-sink fins and a coolant jacket. Keeps a reactor from cooking itself mid-fight.' },
  faraday:    { n: 'Faraday Mesh', slot: 'frame', r: 0, st: { def: .05 }, ab: 'noPar', vis: 'mesh',
    lore: 'A copper cage woven under the paint. EMP grenades slide right off.' },
  subdermal:  { n: 'Subdermal Armor', slot: 'frame', r: 1, st: { def: .15 }, vis: 'plates',
    lore: 'Ceramic plates grafted under the outer shell. Standard-issue merc chrome since before the Fracture.' },
  milspec:    { n: 'Milspec Carapace', slot: 'frame', r: 2, st: { def: .25, hp: .1, spd: -.05 }, vis: 'plates',
    lore: 'Corpo military surplus with the serial numbers filed off. Somebody is very angry about the missing crate.' },
  camo:       { n: 'Optical Camo', slot: 'frame', r: 3, st: { spd: .05 }, ab: 'dodge', vis: 'camo',
    lore: 'Light-bending skin that makes the chassis shimmer out of sight. A corporate assassin\'s favorite toy.' },
  // ---- Optics ----
  lowlight:   { n: 'Low-Light Optics', slot: 'optics', r: 0, st: { atk: .04, spd: .04 }, eye: '#5ee38a',
    lore: 'Night-vision lenses for the Gutter\'s rolling blackouts. Everything looks green and slightly haunted.' },
  threatscan: { n: 'Threat-Scan Optics', slot: 'optics', r: 1, ab: 'trueshot', eye: '#ff3d5a',
    lore: 'Ocular implant that paints weak points in red neon. Old solos said you never miss with good eyes.' },
  smartlink:  { n: 'Smartlink Lens', slot: 'optics', r: 2, st: { atk: .08 }, ab: 'critUp', eye: '#ffb52e',
    lore: 'Targeting HUD that syncs with any weapon it touches. Gunfighter tech from the old corporate wars.' },
  icebreaker: { n: 'ICEbreaker Visor', slot: 'optics', r: 2, ab: 'netrun', eye: '#18f0ff',
    lore: 'Netrunner gear. It sees the data layer and slices straight through corporate ICE.' },
  weakspot:   { n: 'Weakspot Analyzer', slot: 'optics', r: 3, st: { atk: .05 }, ab: 'exploit', eye: '#c46bff',
    lore: 'Scans the target\'s chassis frame by frame and finds every crack in its code.' },
  // ---- Core ----
  blackice:   { n: 'Black ICE Firewall', slot: 'core', r: 0, st: { def: .04 }, ab: 'noPsn',
    lore: 'Lethal-grade firewall. Any virus that touches it gets fried on contact.' },
  reflex:     { n: 'Reflex Tuner', slot: 'core', r: 1, st: { spd: .12 },
    lore: 'Synaptic accelerator. Every reaction arrives forty milliseconds early.' },
  biomonitor: { n: 'Nanite Biomonitor', slot: 'core', r: 1, ab: 'regen',
    lore: 'Medical nanites patrol the frame and patch damage between hits. Ripperdocs swear by them.' },
  overdrive:  { n: 'Overdrive Chip', slot: 'core', r: 2, st: { atk: .1, spd: .1, def: -.1 },
    lore: 'Pirated firmware that unlocks every factory limit at once. Warranty void, obviously.' },
  berserk:    { n: 'Berserk Protocol', slot: 'core', r: 2, st: { def: .05 }, ab: 'berserk',
    lore: 'Pain inhibitors off. Power limiters off. Do not run for longer than ten seconds. Nobody listens.' },
  secondheart:{ n: 'Second Heart', slot: 'core', r: 3, st: { hp: .05 }, ab: 'endure',
    lore: 'A backup reactor that kicks in when the main one flatlines. Ripperdocs call it a coin flip with death.' },
  chrono:     { n: 'Chrono Dilator', slot: 'core', r: 4, st: { spd: .3 }, ab: 'quick',
    lore: 'Time-dilation core. To everyone else you\'re a smear of neon. The old-timers called these rigs "Sandys".' },
  engram:     { n: 'Engram Shard', slot: 'core', r: 4, st: { hp: .12, atk: .12, def: .12, spd: .12 }, noRoll: 1,
    lore: 'A fragment of OMNIKERNEL\'s mind, freed from the Spire. It hums with memories that aren\'t yours.' },
};

// Rarity weights by loot tier (0 = early game, 3 = endgame).
const LOOT_TIERS = [
  [70, 25, 5, 0, 0],
  [45, 35, 16, 4, 0],
  [25, 35, 26, 12, 2],
  [10, 25, 35, 25, 5],
];

const Chrome = {
  roll(tier) {
    const w = LOOT_TIERS[Math.max(0, Math.min(3, tier))];
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    let rarity = 0;
    while ((r -= w[rarity]) >= 0) rarity++;
    for (; rarity >= 0; rarity--) {
      const pool = Object.keys(MODS).filter((id) => MODS[id].r === rarity && !MODS[id].noRoll);
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
    return 'servo';
  },
  // One line of effects, e.g. "ATK +12% · Critical hits land twice as often."
  describe(id) {
    const m = MODS[id], bits = [];
    for (const [k, v] of Object.entries(m.st || {})) bits.push(`${k.toUpperCase()} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`);
    if (m.ab) bits.push(ABILITY[m.ab]);
    return bits.join(' · ');
  },
  color: (id) => RARITY[MODS[id].r].c,
  give(id, n = 1) { G.state.mods[id] = (G.state.mods[id] || 0) + n; Tutorial.later('chrome'); },
};
