'use strict';
// Static game data: types, moves, species, learnsets, items.

const TYPES = {
  VOLT:   { n: 'Volt',   c: '#ffe14d' },
  PLASMA: { n: 'Plasma', c: '#ff6a3d' },
  HYDRO:  { n: 'Hydro',  c: '#3d8bff' },
  NANO:   { n: 'Nano',   c: '#2ee6a0' },
  STEEL:  { n: 'Steel',  c: '#a9b8d6' },
  AERO:   { n: 'Aero',   c: '#6ff3ff' },
  VIRUS:  { n: 'Virus',  c: '#c6ff2e' },
  PSI:    { n: 'Psi',    c: '#ff4fd8' },
  VOID:   { n: 'Void',   c: '#9b6bff' },
  NONE:   { n: 'Core',   c: '#cfd3e6' },
};

// Attacker -> defender multipliers. Anything missing is 1x.
const CHART = {
  VOLT:   { HYDRO: 2, AERO: 2, VOLT: .5, NANO: .5, VOID: .5 },
  PLASMA: { NANO: 2, STEEL: 2, PLASMA: .5, HYDRO: .5 },
  HYDRO:  { PLASMA: 2, STEEL: 2, HYDRO: .5, NANO: .5 },
  NANO:   { HYDRO: 2, VOLT: 2, PLASMA: .5, NANO: .5, AERO: .5, STEEL: .5 },
  STEEL:  { AERO: 2, STEEL: .5, PLASMA: .5, HYDRO: .5 },
  AERO:   { NANO: 2, VIRUS: 2, STEEL: .5, VOLT: .5 },
  VIRUS:  { NANO: 2, PSI: 2, VIRUS: .5, STEEL: 0 },
  PSI:    { VIRUS: 2, PSI: .5, STEEL: .5, VOID: 0 },
  VOID:   { PSI: 2, VOID: 2, STEEL: .5 },
};

function typeMult(atk, defTypes) {
  let m = 1;
  for (const d of defTypes) {
    const v = (CHART[atk] || {})[d];
    if (v !== undefined) m *= v;
  }
  return m;
}

// fx: { st: status, foe: {stat: stages}, self: {stat: stages}, ch: chance (default 1) }
// breach: chance a hit knocks one of the target's chrome sockets offline (see Engine)
const MOVES = {
  ram:         { n: 'Ram',            t: 'NONE',   p: 40, a: 100, pp: 35 },
  jam:         { n: 'Jam Signal',     t: 'PSI',    p: 0,  a: 100, pp: 30, fx: { foe: { atk: -1 } } },
  crack:       { n: 'Armor Crack',    t: 'STEEL',  p: 0,  a: 100, pp: 30, fx: { foe: { def: -1 } } },
  zap:         { n: 'Zap',            t: 'VOLT',   p: 40, a: 100, pp: 30, fx: { st: 'par', ch: .1 } },
  quickboot:   { n: 'Quick Boot',     t: 'VOLT',   p: 40, a: 100, pp: 30, pri: 1 },
  arclash:     { n: 'Arc Lash',       t: 'VOLT',   p: 65, a: 100, pp: 20, fx: { st: 'par', ch: .1 } },
  thundercoil: { n: 'Thunder Coil',   t: 'VOLT',   p: 90, a: 100, pp: 15, fx: { st: 'par', ch: .1 } },
  overcharge:  { n: 'Overcharge',     t: 'VOLT',   p: 0,  a: 100, pp: 20, fx: { self: { atk: 2 } } },
  staticfield: { n: 'Static Field',   t: 'VOLT',   p: 0,  a: 90,  pp: 20, fx: { st: 'par' } },
  flarejet:    { n: 'Flare Jet',      t: 'PLASMA', p: 40, a: 100, pp: 25, fx: { st: 'brn', ch: .1 } },
  plasmaclaw:  { n: 'Plasma Claw',    t: 'PLASMA', p: 65, a: 95,  pp: 20, crit: 1 },
  infernocore: { n: 'Inferno Core',   t: 'PLASMA', p: 95, a: 90,  pp: 10, fx: { st: 'brn', ch: .2 } },
  heatwave:    { n: 'Overheat Wave',  t: 'PLASMA', p: 0,  a: 85,  pp: 15, fx: { st: 'brn' } },
  coolant:     { n: 'Coolant Spray',  t: 'HYDRO',  p: 40, a: 100, pp: 25 },
  pressurejet: { n: 'Pressure Jet',   t: 'HYDRO',  p: 65, a: 100, pp: 20 },
  tidalcrush:  { n: 'Tidal Crush',    t: 'HYDRO',  p: 95, a: 90,  pp: 10 },
  vaporveil:   { n: 'Vapor Veil',     t: 'HYDRO',  p: 0,  a: 100, pp: 20, fx: { self: { def: 1, spd: 1 } } },
  nanoswarm:   { n: 'Nano Swarm',     t: 'NANO',   p: 40, a: 100, pp: 25 },
  siphonroot:  { n: 'Siphon Root',    t: 'NANO',   p: 50, a: 100, pp: 15, drain: .5 },
  bloomburst:  { n: 'Bloom Burst',    t: 'NANO',   p: 90, a: 100, pp: 10 },
  spores:      { n: 'Dormant Spores', t: 'NANO',   p: 0,  a: 75,  pp: 15, fx: { st: 'slp' } },
  regrow:      { n: 'Regrow',         t: 'NANO',   p: 0,  a: 100, pp: 10, heal: .5 },
  ironfist:    { n: 'Iron Fist',      t: 'STEEL',  p: 60, a: 100, pp: 25 },
  titanslam:   { n: 'Titan Slam',     t: 'STEEL',  p: 100, a: 85, pp: 10, recoil: .25 },
  plating:     { n: 'Harden Plating', t: 'STEEL',  p: 0,  a: 100, pp: 20, fx: { self: { def: 2 } } },
  rotor:       { n: 'Rotor Slice',    t: 'AERO',   p: 40, a: 100, pp: 30 },
  airstrafe:   { n: 'Air Strafe',     t: 'AERO',   p: 60, a: 100, pp: 20 },
  skydive:     { n: 'Sky Dive',       t: 'AERO',   p: 90, a: 95,  pp: 10 },
  afterburn:   { n: 'Afterburn',      t: 'AERO',   p: 0,  a: 100, pp: 20, fx: { self: { spd: 2 } } },
  glitchbite:  { n: 'Glitch Bite',    t: 'VIRUS',  p: 40, a: 100, pp: 25, fx: { st: 'psn', ch: .2 } },
  malware:     { n: 'Malware Spit',   t: 'VIRUS',  p: 60, a: 100, pp: 20, fx: { st: 'psn', ch: .3 }, breach: .15 },
  payload:     { n: 'Payload Burst',  t: 'VIRUS',  p: 90, a: 100, pp: 10, fx: { st: 'psn', ch: .3 }, breach: .3 },
  infect:      { n: 'Infect',         t: 'VIRUS',  p: 0,  a: 90,  pp: 20, fx: { st: 'psn' } },
  ping:        { n: 'Ping',           t: 'PSI',    p: 40, a: 100, pp: 30 },
  mindspike:   { n: 'Mind Spike',     t: 'PSI',    p: 65, a: 100, pp: 20 },
  neuralstorm: { n: 'Neural Storm',   t: 'PSI',    p: 95, a: 100, pp: 10, fx: { foe: { def: -1 }, ch: .2 } },
  focusloop:   { n: 'Focus Loop',     t: 'PSI',    p: 0,  a: 100, pp: 20, fx: { self: { atk: 1, spd: 1 } } },
  firewall:    { n: 'Firewall',       t: 'PSI',    p: 0,  a: 100, pp: 10, heal: .5 },
  shadeclaw:   { n: 'Shade Claw',     t: 'VOID',   p: 45, a: 100, pp: 25, crit: 1 },
  phasestrike: { n: 'Phase Strike',   t: 'VOID',   p: 40, a: 100, pp: 30, pri: 1 },
  nullpulse:   { n: 'Null Pulse',     t: 'VOID',   p: 65, a: 100, pp: 15, fx: { foe: { atk: -1 }, ch: .2 } },
  blackout:    { n: 'Blackout',       t: 'VOID',   p: 95, a: 95,  pp: 10 },
  dread:       { n: 'Dread Code',     t: 'VOID',   p: 0,  a: 100, pp: 20, fx: { foe: { spd: -2 } } },
  struggle:    { n: 'Desperation',    t: 'NONE',   p: 50, a: 100, pp: 1, recoil: .25 },
};

const STATUS = {
  brn: { n: 'Overheated',  tag: 'OVH', c: '#ff6a3d' },
  par: { n: 'Shorted',     tag: 'SHT', c: '#ffe14d' },
  psn: { n: 'Infected',    tag: 'INF', c: '#c6ff2e' },
  slp: { n: 'On standby',  tag: 'SBY', c: '#8fa3c7' },
};

// Blueprint keys drive the procedural renderer in sprites.js:
// body: orb|egg|box|slab|hex  head: none|orb|box|tri  eyes: mono|twin|visor|tri|slit
// legs: none|two|four|six|treads|hover  arms: none|stubs|claws|blades|cannons|vines
// top: none|antenna|twin|horns|ears|crest|flame|fin|spikes|leaf|rotor
// wings: none|jet|bat|insect|blade  tail: none|whip|flame|plug|fin|segment  s: scale  core: chest emblem
const SPECIES = {
  cindrix:    { n: 'Cindrix',    t: ['PLASMA'], b: [39, 52, 43, 65],   line: 'cindrix', evo: { lvl: 16, to: 'pyroclaw' }, cr: 45, xp: 62,
    bp: { body: 'egg', head: 'orb', eyes: 'twin', legs: 'two', arms: 'stubs', top: 'flame', tail: 'flame', s: .8 },
    dex: 'A pocket furnace with legs. Its tail flame flickers faster when it is happy, which is always.' },
  pyroclaw:   { n: 'Pyroclaw',   t: ['PLASMA'], b: [58, 70, 58, 80],   line: 'cindrix', evo: { lvl: 32, to: 'infernyx' }, cr: 45, xp: 142,
    bp: { body: 'box', head: 'tri', eyes: 'visor', legs: 'two', arms: 'claws', top: 'horns', tail: 'flame', s: .95 },
    dex: 'Its claws run at 3,000 degrees. Street crews hire them to cut through scrapped mech hulls.' },
  infernyx:   { n: 'Infernyx',   t: ['PLASMA'], b: [78, 95, 78, 100],  line: 'cindrix', cr: 45, xp: 240,
    bp: { body: 'slab', head: 'box', eyes: 'visor', legs: 'two', arms: 'claws', top: 'horns', wings: 'bat', tail: 'flame', core: 1, s: 1.1 },
    dex: 'When it spreads its heat-sink wings, nearby streetlights brown out. Legends say one melted a skyscraper.' },
  dripbot:    { n: 'Dripbot',    t: ['HYDRO'],  b: [44, 48, 65, 43],   line: 'dripbot', evo: { lvl: 16, to: 'torrentek' }, cr: 45, xp: 63,
    bp: { body: 'orb', head: 'none', eyes: 'mono', legs: 'hover', arms: 'stubs', top: 'fin', s: .8 },
    dex: 'A coolant drone that escaped a server farm. It hums lullabies in binary.' },
  torrentek:  { n: 'Torrentek',  t: ['HYDRO'],  b: [59, 63, 80, 58],   line: 'dripbot', evo: { lvl: 32, to: 'leviatron' }, cr: 45, xp: 142,
    bp: { body: 'egg', head: 'orb', eyes: 'twin', legs: 'four', arms: 'cannons', top: 'fin', tail: 'fin', s: .95 },
    dex: 'Its arm cannons fire pressurized coolant hard enough to dent armor plating.' },
  leviatron:  { n: 'Leviatron',  t: ['HYDRO', 'STEEL'], b: [79, 85, 100, 78], line: 'dripbot', cr: 45, xp: 240,
    bp: { body: 'slab', head: 'box', eyes: 'visor', legs: 'treads', arms: 'cannons', top: 'fin', tail: 'fin', core: 1, s: 1.1 },
    dex: 'A walking dreadnought. It patrols the deep canals and drags polluters to the surface.' },
  mossbit:    { n: 'Mossbit',    t: ['NANO'],   b: [48, 52, 52, 50],   line: 'mossbit', evo: { lvl: 16, to: 'vinetron' }, cr: 45, xp: 64,
    bp: { body: 'orb', head: 'none', eyes: 'twin', legs: 'two', top: 'leaf', s: .8 },
    dex: 'Self-repairing nanomoss grows over its frame. It loves rooftop gardens and puddles of sunlight.' },
  vinetron:   { n: 'Vinetron',   t: ['NANO'],   b: [64, 68, 68, 66],   line: 'mossbit', evo: { lvl: 32, to: 'arborgeist' }, cr: 45, xp: 142,
    bp: { body: 'egg', head: 'orb', eyes: 'twin', legs: 'two', arms: 'vines', top: 'leaf', s: .95 },
    dex: 'Its cable-vines can splice into any port. It once rerouted a whole block\'s power to save a stray.' },
  arborgeist: { n: 'Arborgeist', t: ['NANO', 'PSI'], b: [86, 90, 88, 86], line: 'mossbit', cr: 45, xp: 240,
    bp: { body: 'hex', head: 'tri', eyes: 'tri', legs: 'hover', arms: 'vines', top: 'crest', wings: 'insect', core: 1, s: 1.1 },
    dex: 'A living forest-mind. It hears every plant in the city whispering through the grid.' },
  voltmite:   { n: 'Voltmite',   t: ['VOLT'],   b: [35, 55, 30, 90],   line: 'voltmite', evo: { lvl: 18, to: 'ampfang' }, cr: 190, xp: 56,
    bp: { body: 'orb', head: 'none', eyes: 'twin', legs: 'six', top: 'twin', tail: 'plug', s: .7 },
    dex: 'Swarms of these chew through power lines at night. A single one can charge a phone. Do not let it.' },
  ampfang:    { n: 'Ampfang',    t: ['VOLT'],   b: [60, 90, 55, 110],  line: 'voltmite', cr: 75, xp: 160,
    bp: { body: 'egg', head: 'box', eyes: 'slit', legs: 'four', top: 'ears', tail: 'plug', s: 1 },
    dex: 'A lightning hound. Its bite delivers 40,000 volts and a very smug expression.' },
  dronelet:   { n: 'Dronelet',   t: ['AERO'],   b: [40, 45, 40, 56],   line: 'dronelet', evo: { lvl: 14, to: 'skyraptor' }, cr: 255, xp: 50,
    bp: { body: 'orb', head: 'none', eyes: 'mono', legs: 'none', top: 'rotor', wings: 'jet', s: .7 },
    dex: 'Abandoned delivery drones that went feral. They still try to hand you packages that aren\'t there.' },
  skyraptor:  { n: 'Skyraptor',  t: ['AERO'],   b: [63, 60, 55, 71],   line: 'dronelet', evo: { lvl: 30, to: 'stratohawk' }, cr: 120, xp: 122,
    bp: { body: 'egg', head: 'tri', eyes: 'slit', legs: 'two', wings: 'jet', tail: 'segment', s: .9 },
    dex: 'Hunts between skyscrapers at supersonic speed. Its sonic boom rattles windows for blocks.' },
  stratohawk: { n: 'Stratohawk', t: ['AERO', 'STEEL'], b: [83, 80, 75, 101], line: 'dronelet', cr: 45, xp: 216,
    bp: { body: 'slab', head: 'tri', eyes: 'visor', legs: 'two', wings: 'blade', tail: 'segment', top: 'crest', s: 1.1 },
    dex: 'Its blade wings can slice a cargo cable mid-flight. It nests on orbital tethers.' },
  scrapling:  { n: 'Scrapling',  t: ['STEEL'],  b: [50, 64, 70, 20],   line: 'scrapling', evo: { lvl: 22, to: 'junkhulk' }, cr: 190, xp: 60,
    bp: { body: 'box', head: 'box', eyes: 'twin', legs: 'treads', arms: 'claws', top: 'antenna', s: .8 },
    dex: 'Builds its body from junkyard parts. It trades bolts with other Scraplings like collectible cards.' },
  junkhulk:   { n: 'Junkhulk',   t: ['STEEL'],  b: [80, 100, 110, 30], line: 'scrapling', cr: 60, xp: 168,
    bp: { body: 'slab', head: 'box', eyes: 'visor', legs: 'treads', arms: 'cannons', top: 'spikes', core: 1, s: 1.1 },
    dex: 'A rolling scrapyard fortress. It absorbs metal it touches, so keep your keys in your pocket.' },
  glitchling: { n: 'Glitchling', t: ['VIRUS'],  b: [40, 47, 35, 60],   line: 'glitchling', evo: { lvl: 20, to: 'corruptor' }, cr: 190, xp: 58,
    bp: { body: 'hex', head: 'none', eyes: 'tri', legs: 'hover', top: 'spikes', tail: 'segment', s: .7 },
    dex: 'Born from corrupted save files. It flickers in and out of existence when nervous.' },
  corruptor:  { n: 'Corruptor',  t: ['VIRUS', 'VOID'], b: [65, 85, 60, 85], line: 'glitchling', cr: 75, xp: 165,
    bp: { body: 'hex', head: 'tri', eyes: 'slit', legs: 'hover', arms: 'blades', wings: 'bat', top: 'horns', s: 1.05 },
    dex: 'It rewrites the code of anything it touches. Syndicate hackers prize them as living malware.' },
  pinglet:    { n: 'Pinglet',    t: ['PSI'],    b: [40, 40, 40, 70],   line: 'pinglet', evo: { lvl: 22, to: 'psyframe' }, cr: 190, xp: 60,
    bp: { body: 'orb', head: 'none', eyes: 'visor', legs: 'hover', top: 'antenna', core: 1, s: .7 },
    dex: 'A tiny AI that escaped a chat server. It answers questions nobody asked, telepathically.' },
  psyframe:   { n: 'Psyframe',   t: ['PSI'],    b: [65, 75, 65, 100],  line: 'pinglet', cr: 75, xp: 168,
    bp: { body: 'egg', head: 'orb', eyes: 'visor', legs: 'hover', arms: 'stubs', top: 'crest', core: 1, s: 1 },
    dex: 'Its neural lattice runs a billion simulations a second. It already knows how this battle ends.' },
  nullcat:    { n: 'Nullcat',    t: ['VOID'],   b: [45, 60, 45, 70],   line: 'nullcat', evo: { lvl: 24, to: 'shadowlynx' }, cr: 120, xp: 66,
    bp: { body: 'egg', head: 'orb', eyes: 'slit', legs: 'four', top: 'ears', tail: 'whip', s: .75 },
    dex: 'It lives in the dead pixels of broken billboards. Seeing one at midnight means your data is about to vanish.' },
  shadowlynx: { n: 'Shadowlynx', t: ['VOID'],   b: [70, 95, 65, 105],  line: 'nullcat', cr: 60, xp: 175,
    bp: { body: 'slab', head: 'tri', eyes: 'slit', legs: 'four', arms: 'blades', top: 'ears', tail: 'whip', s: 1.05 },
    dex: 'It moves through blackouts like water. Cameras record only a pair of violet eyes.' },
  neonfly:    { n: 'Neonfly',    t: ['VOLT', 'AERO'], b: [35, 40, 35, 75], line: 'neonfly', evo: { lvl: 20, to: 'luminwing' }, cr: 190, xp: 55,
    bp: { body: 'egg', head: 'none', eyes: 'twin', legs: 'six', wings: 'insect', top: 'twin', s: .65 },
    dex: 'Swarms of Neonfly light the alleys of Low Town. Their glow syncs to nearby music.' },
  luminwing:  { n: 'Luminwing',  t: ['VOLT', 'AERO'], b: [60, 70, 60, 100], line: 'neonfly', cr: 75, xp: 160,
    bp: { body: 'egg', head: 'orb', eyes: 'visor', legs: 'two', wings: 'insect', top: 'twin', tail: 'segment', s: .95 },
    dex: 'Its wings project holograms. Advertisers have tried and failed to rent them.' },
  sludgebot:  { n: 'Sludgebot',  t: ['VIRUS', 'HYDRO'], b: [70, 60, 55, 25], line: 'sludgebot', evo: { lvl: 24, to: 'toxmaw' }, cr: 190, xp: 65,
    bp: { body: 'orb', head: 'none', eyes: 'twin', legs: 'hover', arms: 'stubs', top: 'antenna', s: .8 },
    dex: 'A sewer-cleaning unit that ate one too many batteries. It smells like burnt circuits and regret.' },
  toxmaw:     { n: 'Toxmaw',     t: ['VIRUS', 'HYDRO'], b: [105, 90, 80, 40], line: 'sludgebot', cr: 75, xp: 173,
    bp: { body: 'slab', head: 'box', eyes: 'twin', legs: 'treads', arms: 'claws', top: 'spikes', s: 1.1 },
    dex: 'Its jaw can crush a car battery and drink what leaks out. Canal workers give it a wide berth.' },
  rustroach:  { n: 'Rustroach',  t: ['STEEL', 'VIRUS'], b: [45, 55, 60, 40], line: 'rustroach', evo: { lvl: 26, to: 'ironmandible' }, cr: 190, xp: 62,
    bp: { body: 'egg', head: 'orb', eyes: 'twin', legs: 'six', top: 'twin', s: .7 },
    dex: 'It survived three city-wide EMP purges. Nothing kills a Rustroach. Nothing.' },
  ironmandible: { n: 'Ironmandible', t: ['STEEL', 'VIRUS'], b: [70, 95, 100, 55], line: 'rustroach', cr: 75, xp: 170,
    bp: { body: 'slab', head: 'box', eyes: 'slit', legs: 'six', arms: 'claws', top: 'horns', s: 1.05 },
    dex: 'Its mandibles are industrial bolt cutters. Gangs use them to break into vaults.' },
  magmole:    { n: 'Magmole',    t: ['PLASMA', 'STEEL'], b: [50, 60, 55, 35], line: 'magmole', evo: { lvl: 25, to: 'forgeback' }, cr: 190, xp: 64,
    bp: { body: 'egg', head: 'orb', eyes: 'twin', legs: 'four', arms: 'claws', top: 'spikes', s: .75 },
    dex: 'It tunnels through foundations, smelting rebar as it goes. Builders call it a menace and a genius.' },
  forgeback:  { n: 'Forgeback',  t: ['PLASMA', 'STEEL'], b: [80, 95, 90, 50], line: 'magmole', cr: 75, xp: 172,
    bp: { body: 'slab', head: 'box', eyes: 'visor', legs: 'four', arms: 'claws', top: 'flame', tail: 'segment', core: 1, s: 1.1 },
    dex: 'A living foundry. Its back is a furnace hot enough to forge new Robomon parts.' },
};

// Learnsets are shared by every stage of an evolution line.
const LEARN = {
  cindrix:    [[1, 'ram'], [1, 'jam'], [6, 'flarejet'], [10, 'shadeclaw'], [14, 'heatwave'], [17, 'plasmaclaw'], [24, 'afterburn'], [32, 'infernocore'], [38, 'titanslam']],
  dripbot:    [[1, 'ram'], [1, 'crack'], [6, 'coolant'], [10, 'vaporveil'], [14, 'ironfist'], [17, 'pressurejet'], [23, 'plating'], [32, 'tidalcrush'], [38, 'titanslam']],
  mossbit:    [[1, 'ram'], [1, 'jam'], [6, 'nanoswarm'], [10, 'spores'], [14, 'siphonroot'], [18, 'ping'], [22, 'regrow'], [28, 'mindspike'], [33, 'bloomburst'], [40, 'neuralstorm']],
  voltmite:   [[1, 'zap'], [1, 'jam'], [5, 'quickboot'], [9, 'staticfield'], [13, 'shadeclaw'], [17, 'arclash'], [24, 'overcharge'], [30, 'thundercoil']],
  dronelet:   [[1, 'rotor'], [1, 'crack'], [6, 'afterburn'], [11, 'ram'], [15, 'airstrafe'], [22, 'ironfist'], [30, 'skydive'], [36, 'titanslam']],
  scrapling:  [[1, 'ram'], [1, 'crack'], [6, 'plating'], [10, 'glitchbite'], [15, 'ironfist'], [22, 'flarejet'], [28, 'titanslam']],
  glitchling: [[1, 'glitchbite'], [1, 'jam'], [6, 'infect'], [11, 'phasestrike'], [15, 'malware'], [20, 'nullpulse'], [26, 'payload'], [32, 'blackout']],
  pinglet:    [[1, 'ping'], [1, 'jam'], [6, 'focusloop'], [11, 'zap'], [15, 'mindspike'], [21, 'firewall'], [28, 'neuralstorm']],
  nullcat:    [[1, 'shadeclaw'], [1, 'dread'], [6, 'phasestrike'], [12, 'glitchbite'], [17, 'nullpulse'], [24, 'focusloop'], [30, 'blackout']],
  neonfly:    [[1, 'zap'], [1, 'rotor'], [6, 'staticfield'], [10, 'quickboot'], [14, 'airstrafe'], [20, 'arclash'], [26, 'afterburn'], [32, 'thundercoil']],
  sludgebot:  [[1, 'coolant'], [1, 'glitchbite'], [6, 'infect'], [12, 'malware'], [18, 'vaporveil'], [24, 'payload'], [32, 'tidalcrush']],
  rustroach:  [[1, 'ram'], [1, 'glitchbite'], [7, 'plating'], [12, 'malware'], [17, 'ironfist'], [26, 'titanslam'], [32, 'payload']],
  magmole:    [[1, 'ram'], [1, 'flarejet'], [6, 'crack'], [11, 'plating'], [15, 'plasmaclaw'], [20, 'ironfist'], [25, 'heatwave'], [32, 'infernocore']],
};

// use: where it works ('field', 'battle', 'both'); kind drives the effect.
const ITEMS = {
  patch:     { n: 'Repair Patch',  price: 200,  use: 'both',   kind: 'heal', amt: 20,   desc: 'Restores 20 HP to one bot.' },
  kit:       { n: 'Repair Kit',    price: 600,  use: 'both',   kind: 'heal', amt: 60,   desc: 'Restores 60 HP to one bot.' },
  nanokit:   { n: 'Nano Kit',      price: 1500, use: 'both',   kind: 'heal', amt: 9999, desc: 'Fully restores one bot\'s HP.' },
  antivirus: { n: 'Antivirus',     price: 250,  use: 'both',   kind: 'cure',            desc: 'Clears every status fault.' },
  reboot:    { n: 'Reboot Chip',   price: 1500, use: 'both',   kind: 'revive',          desc: 'Restarts a shut-down bot at half HP.' },
  core:      { n: 'Capture Core',  price: 200,  use: 'battle', kind: 'ball', rate: 1,   desc: 'Links with a wild bot. Works better when it is weak.' },
  hypercore: { n: 'Hyper Core',    price: 600,  use: 'battle', kind: 'ball', rate: 1.5, desc: 'A boosted core with a stronger link field.' },
  overclock: { n: 'Overclock',     price: 500,  use: 'battle', kind: 'boost', stat: 'atk', desc: 'Raises Attack sharply for one battle.' },
  scrambler: { n: 'Scrambler',     price: 350,  use: 'field',  kind: 'repel', steps: 100, desc: 'Masks your signal from wild bots for 100 steps.' },
};

const SHOP_STOCK = [
  ['patch', 'core', 'antivirus'],
  ['kit', 'hypercore', 'scrambler', 'reboot'],
  ['overclock', 'nanokit'],
];

// ---------- Chapter 2: the Gutter and the Syndicate Spire ----------
Object.assign(MOVES, {
  plaguebite:  { n: 'Plague Bite',    t: 'VIRUS',  p: 80, a: 100, pp: 15, fx: { st: 'psn', ch: .3 }, breach: .2 },
  tasebolt:    { n: 'Taser Bolt',     t: 'VOLT',   p: 80, a: 100, pp: 15, fx: { st: 'par', ch: .3 }, breach: .2 },
  riotproto:   { n: 'Riot Protocol',  t: 'STEEL',  p: 0,  a: 100, pp: 20, fx: { self: { atk: 1, def: 1 } } },
  hydropress:  { n: 'Hydraulic Press', t: 'STEEL', p: 90, a: 95,  pp: 10 },
  razordive:   { n: 'Razor Dive',     t: 'AERO',   p: 75, a: 95,  pp: 15, crit: 1 },
  holotide:    { n: 'Holo Tide',      t: 'HYDRO',  p: 85, a: 100, pp: 10, fx: { foe: { atk: -1 }, ch: .2 } },
  synapse:     { n: 'Synapse Burn',   t: 'PSI',    p: 70, a: 100, pp: 15, fx: { st: 'brn', ch: .2 } },
  wirelash:    { n: 'Wire Lash',      t: 'VOID',   p: 80, a: 95,  pp: 15, crit: 1, breach: .3 },
  zeroday:     { n: 'Zero-Day Beam',  t: 'VOID',   p: 100, a: 90, pp: 5, breach: .4 },
  kernelpanic: { n: 'Kernel Panic',   t: 'PSI',    p: 110, a: 90, pp: 5,  fx: { foe: { def: -1 }, ch: .3 }, breach: .3 },
  nullwall:    { n: 'Null Wall',      t: 'VOID',   p: 0,  a: 100, pp: 10, fx: { self: { def: 2 } } },
});

Object.assign(SPECIES, {
  gutterat:   { n: 'Gutterat',   t: ['VIRUS'], b: [48, 62, 45, 72], line: 'gutterat', evo: { lvl: 26, to: 'plaguegear' }, cr: 190, xp: 66,
    bp: { body: 'egg', head: 'orb', eyes: 'twin', legs: 'four', top: 'ears', tail: 'whip', s: .7 },
    dex: 'Sewer scavenger with a cracked LED grin. Packs of them strip abandoned cars to the frame overnight.' },
  plaguegear: { n: 'Plaguegear', t: ['VIRUS', 'STEEL'], b: [75, 95, 80, 85], line: 'gutterat', cr: 75, xp: 170,
    bp: { body: 'slab', head: 'box', eyes: 'slit', legs: 'four', arms: 'claws', top: 'spikes', tail: 'plug', s: 1.05 },
    dex: 'The rat king of the Gutter, wearing a crown of stolen chrome. It spreads malware through every bite.' },
  sentrybit:  { n: 'Sentrybit',  t: ['STEEL', 'VOLT'], b: [50, 55, 75, 50], line: 'sentrybit', evo: { lvl: 30, to: 'wardencore' }, cr: 150, xp: 70,
    bp: { body: 'orb', head: 'none', eyes: 'mono', legs: 'hover', arms: 'cannons', top: 'antenna', s: .75 },
    dex: 'Syndicate security drone. Its single red eye records everything and forgives nothing.' },
  wardencore: { n: 'Wardencore', t: ['STEEL', 'VOLT'], b: [85, 90, 115, 60], line: 'sentrybit', cr: 45, xp: 185,
    bp: { body: 'hex', head: 'box', eyes: 'visor', legs: 'treads', arms: 'cannons', top: 'crest', core: 1, s: 1.1 },
    dex: 'A rolling checkpoint. It guards the Spire\'s gates and has never once accepted a bribe. It has accepted several upgrades.' },
  holokoi:    { n: 'Holokoi',    t: ['HYDRO', 'PSI'], b: [50, 50, 50, 75], line: 'holokoi', evo: { lvl: 30, to: 'neondragon' }, cr: 120, xp: 68,
    bp: { body: 'egg', head: 'none', eyes: 'twin', legs: 'hover', top: 'fin', tail: 'fin', s: .7 },
    dex: 'Once a hologram ad for a sushi chain. It slipped its projector and now swims through the rain.' },
  neondragon: { n: 'Neondragon', t: ['HYDRO', 'PSI'], b: [90, 95, 80, 105], line: 'holokoi', cr: 45, xp: 210,
    bp: { body: 'slab', head: 'tri', eyes: 'slit', legs: 'hover', wings: 'bat', top: 'horns', tail: 'segment', core: 1, s: 1.15 },
    dex: 'A storm of light coiled into a dragon. When it flies over the city every billboard shows its face.' },
  chromecrow: { n: 'Chromecrow', t: ['AERO', 'VOID'], b: [45, 65, 40, 80], line: 'chromecrow', evo: { lvl: 28, to: 'murdercrow' }, cr: 150, xp: 64,
    bp: { body: 'egg', head: 'tri', eyes: 'slit', legs: 'two', wings: 'jet', tail: 'segment', s: .7 },
    dex: 'It steals shiny chrome from sleeping Linkers. Its nest is worth more than most apartments.' },
  murdercrow: { n: 'Murdercrow', t: ['AERO', 'VOID'], b: [75, 105, 65, 110], line: 'chromecrow', cr: 60, xp: 180,
    bp: { body: 'slab', head: 'tri', eyes: 'visor', legs: 'two', wings: 'blade', top: 'crest', tail: 'segment', s: 1.05 },
    dex: 'A flock of these is called a murder. A single one is called a very bad night.' },
  daemonite:  { n: 'Daemonite',  t: ['VOID', 'PSI'], b: [45, 60, 45, 80], line: 'daemonite', evo: { lvl: 32, to: 'wraithware' }, cr: 90, xp: 72,
    bp: { body: 'hex', head: 'none', eyes: 'tri', legs: 'hover', top: 'horns', s: .7 },
    dex: 'A netrunner\'s daemon that outlived its runner. It haunts old data lines and whispers passwords.' },
  wraithware: { n: 'Wraithware', t: ['VOID', 'PSI'], b: [80, 110, 70, 115], line: 'daemonite', cr: 45, xp: 215,
    bp: { body: 'hex', head: 'tri', eyes: 'tri', legs: 'hover', arms: 'blades', wings: 'bat', top: 'crest', core: 1, s: 1.1 },
    dex: 'Rogue AI made flesh, or chrome, or something in between. Corporations pay fortunes to keep it off their networks.' },
  riotbot:    { n: 'Riotbot',    t: ['STEEL'], b: [65, 75, 80, 40], line: 'riotbot', evo: { lvl: 32, to: 'juggernaut' }, cr: 120, xp: 70,
    bp: { body: 'box', head: 'box', eyes: 'visor', legs: 'two', arms: 'stubs', top: 'antenna', s: .85 },
    dex: 'Syndicate crowd-control unit. Its riot shield reads PLEASE DISPERSE in eleven languages.' },
  juggernaut: { n: 'Juggernaut', t: ['STEEL', 'PLASMA'], b: [105, 120, 115, 45], line: 'riotbot', cr: 45, xp: 220,
    bp: { body: 'slab', head: 'box', eyes: 'visor', legs: 'treads', arms: 'cannons', top: 'spikes', core: 1, s: 1.2 },
    dex: 'A walking siege engine. Nobody has ever seen one go around an obstacle. Only through.' },
  omnikernel: { n: 'Omnikernel', t: ['PSI', 'VOID'], b: [106, 110, 100, 115], line: 'omnikernel', cr: 12, xp: 300,
    bp: { body: 'hex', head: 'orb', eyes: 'visor', legs: 'hover', arms: 'vines', wings: 'blade', top: 'crest', tail: 'segment', core: 1, s: 1.25 },
    dex: 'The mind that woke when the grid fractured. Every Robomon carries a fragment of its code. It remembers being afraid.' },
});

Object.assign(LEARN, {
  gutterat:   [[1, 'glitchbite'], [1, 'ram'], [18, 'shadeclaw'], [22, 'malware'], [26, 'plaguebite'], [32, 'payload']],
  sentrybit:  [[1, 'zap'], [1, 'plating'], [18, 'ironfist'], [22, 'arclash'], [26, 'tasebolt'], [32, 'hydropress']],
  holokoi:    [[1, 'coolant'], [1, 'ping'], [18, 'pressurejet'], [22, 'mindspike'], [28, 'holotide'], [34, 'neuralstorm']],
  chromecrow: [[1, 'rotor'], [1, 'dread'], [18, 'airstrafe'], [22, 'shadeclaw'], [28, 'razordive'], [34, 'blackout']],
  daemonite:  [[1, 'ping'], [1, 'phasestrike'], [18, 'nullpulse'], [22, 'synapse'], [28, 'wirelash'], [34, 'neuralstorm']],
  riotbot:    [[1, 'ram'], [1, 'riotproto'], [18, 'ironfist'], [24, 'hydropress'], [32, 'flarejet'], [36, 'titanslam']],
  omnikernel: [[1, 'mindspike'], [1, 'nullwall'], [30, 'synapse'], [36, 'zeroday'], [40, 'kernelpanic']],
});

// Chassis: what a Robomon is made of. Robots are all machine, cyborgs are a creature with half its
// body replaced, wetware is flesh with circuitry grown through it. Each bends one battle system
// (see Engine): robots shrug off socket breaches but code rot eats them, cyborgs carry more chrome
// but their sockets stay down longer, wetware heals itself but its brain can't be overclocked.
const CHASSIS = {
  robot:   { n: 'Robot',   c: '#a9b8d6', rule: 'Breached sockets reboot after 1 turn. Infection eats 1/6 HP a turn instead of 1/8.' },
  cyborg:  { n: 'Cyborg',  c: '#ff6a3d', rule: '+2 RAM for chrome. Breached sockets stay down 1 turn longer.' },
  wetware: { n: 'Wetware', c: '#c6ff2e', rule: 'Regrows 1/16 HP a turn, up to half its HP per battle. Can never redline: chrome past its RAM won\'t install.' },
};
for (const [cls, ids] of Object.entries({
  robot: ['dripbot', 'torrentek', 'leviatron', 'dronelet', 'skyraptor', 'stratohawk', 'scrapling', 'junkhulk', 'sentrybit', 'wardencore', 'riotbot', 'juggernaut'],
  cyborg: ['cindrix', 'pyroclaw', 'infernyx', 'voltmite', 'ampfang', 'glitchling', 'corruptor', 'nullcat', 'shadowlynx', 'sludgebot', 'toxmaw', 'rustroach',
    'ironmandible', 'magmole', 'forgeback', 'plaguegear', 'chromecrow', 'murdercrow', 'omnikernel'],
  wetware: ['mossbit', 'vinetron', 'arborgeist', 'pinglet', 'psyframe', 'neonfly', 'luminwing', 'gutterat', 'holokoi', 'neondragon', 'daemonite', 'wraithware'],
})) for (const id of ids) SPECIES[id].cls = cls;

// Move expansion. Wave 1 fills thin types (NANO, HYDRO and AERO status, VOLT and PLASMA finishers)
// with the existing effect fields. Wave 2 ties moves to the game's own systems:
//   vs: { chassis: multiplier }  damage by the target's chassis (0 = no effect)
//   boost: 'breached' | 'redline'  double power into a breached target / while the user redlines
// Wave 3 adds two mechanics: hits: [min, max] (multi-hit, crit and damage rolled per hit) and
// charge: 1 (spend a turn charging, fire next turn whatever is chosen; a switch or a lost turn drops it).
Object.assign(MOVES, {
  thornmesh:     { n: 'Thorn Mesh',      t: 'NANO',   p: 65,  a: 100, pp: 20, fx: { foe: { spd: -1 }, ch: .3 } },
  graftspike:    { n: 'Graft Spike',     t: 'NANO',   p: 80,  a: 95,  pp: 15, drain: .25 },
  overgrowth:    { n: 'Overgrowth',      t: 'NANO',   p: 0,   a: 100, pp: 15, fx: { self: { atk: 1, def: 1 } } },
  shortsoak:     { n: 'Short-Circuit Soak', t: 'HYDRO', p: 60, a: 100, pp: 20, fx: { st: 'par', ch: .2 } },
  chaff:         { n: 'Chaff Cloud',     t: 'AERO',   p: 0,   a: 100, pp: 20, fx: { foe: { atk: -1, spd: -1 } } },
  ransomware:    { n: 'Ransomware',      t: 'VIRUS',  p: 0,   a: 90,  pp: 15, fx: { st: 'psn', foe: { spd: -1 } } },
  mindleech:     { n: 'Mind Leech',      t: 'PSI',    p: 60,  a: 100, pp: 15, drain: .5 },
  thermite:      { n: 'Thermite Lance',  t: 'PLASMA', p: 80,  a: 95,  pp: 15, breach: .25 },
  capdump:       { n: 'Capacitor Dump',  t: 'VOLT',   p: 120, a: 85,  pp: 5,  recoil: .25 },
  empburst:      { n: 'EMP Burst',       t: 'VOLT',   p: 70,  a: 100, pp: 15, vs: { robot: 1.5, wetware: .75 } },
  bioweapon:     { n: 'Bioweapon',       t: 'VIRUS',  p: 70,  a: 100, pp: 15, vs: { wetware: 1.5, robot: 0 } },
  socketexploit: { n: 'Socket Exploit',  t: 'VOID',   p: 60,  a: 100, pp: 15, boost: 'breached' },
  redlinerush:   { n: 'Redline Rush',    t: 'NONE',   p: 70,  a: 90,  pp: 10, boost: 'redline' },
  flechette:     { n: 'Flechette Swarm', t: 'STEEL',  p: 20,  a: 100, pp: 20, hits: [2, 5] },
  railgun:       { n: 'Railgun',         t: 'STEEL',  p: 150, a: 90,  pp: 5,  charge: 1 },
});
for (const [line, add] of Object.entries({
  cindrix:    [[20, 'redlinerush'], [28, 'thermite']],
  dripbot:    [[20, 'shortsoak'], [42, 'railgun']],
  mossbit:    [[12, 'thornmesh'], [20, 'overgrowth'], [30, 'graftspike']],
  voltmite:   [[22, 'empburst'], [36, 'capdump']],
  dronelet:   [[9, 'chaff'], [18, 'flechette']],
  scrapling:  [[12, 'flechette'], [18, 'redlinerush'], [34, 'railgun']],
  glitchling: [[18, 'ransomware'], [24, 'bioweapon']],
  pinglet:    [[18, 'mindleech']],
  nullcat:    [[20, 'socketexploit']],
  neonfly:    [[16, 'thornmesh'], [24, 'empburst'], [36, 'capdump']],
  sludgebot:  [[16, 'shortsoak'], [20, 'bioweapon'], [28, 'graftspike']],
  rustroach:  [[20, 'thornmesh'], [22, 'bioweapon']],
  magmole:    [[18, 'redlinerush'], [22, 'thermite']],
  gutterat:   [[14, 'ransomware'], [22, 'bioweapon']],
  sentrybit:  [[14, 'flechette'], [24, 'empburst'], [42, 'railgun']],
  holokoi:    [[14, 'shortsoak']],
  chromecrow: [[12, 'chaff'], [18, 'socketexploit']],
  daemonite:  [[16, 'socketexploit'], [20, 'mindleech']],
  riotbot:    [[20, 'redlinerush'], [40, 'railgun']],
})) LEARN[line] = [...LEARN[line], ...add].sort((a, b) => a[0] - b[0]);

// ---------- Chapter 3: behind the Null Wall ----------
// The Mycelnet's children: Fringe and Overgrowth wildlife, and its avatar RHIZARCH. `legend` keeps
// legendaries out of random pools (Deep Net daemons, sim teams).
Object.assign(MOVES, {
  rootnet: { n: 'Root Network', t: 'NANO', p: 100, a: 100, pp: 5, drain: .3 },
});
Object.assign(SPECIES, {
  thornram:    { n: 'Thornram',    t: ['NANO', 'STEEL'], b: [60, 70, 75, 40], line: 'thornram', evo: { lvl: 38, to: 'rootbreaker' }, cr: 120, xp: 150,
    bp: { body: 'egg', head: 'orb', eyes: 'twin', legs: 'four', top: 'horns', s: .8 },
    dex: 'A grazing bot that drifted through a crack in the Null Wall. Thorns grow out of its plating faster than rust can eat it.' },
  rootbreaker: { n: 'Rootbreaker', t: ['NANO', 'STEEL'], b: [85, 105, 105, 55], line: 'thornram', cr: 45, xp: 225,
    bp: { body: 'slab', head: 'box', eyes: 'visor', legs: 'four', top: 'horns', tail: 'segment', core: 1, s: 1.15 },
    dex: 'Its horn is a living drill. Wall crews tell stories about one that charged the Null Wall for a week until it gave.' },
  lumeel:      { n: 'Lumeel',      t: ['HYDRO', 'NANO'], b: [75, 80, 70, 95], line: 'lumeel', cr: 60, xp: 190,
    bp: { body: 'egg', head: 'none', eyes: 'twin', legs: 'hover', tail: 'fin', top: 'fin', s: .95 },
    dex: 'It swims the flooded ruins past the Wall, lighting the water with spores. Follow one and it will lead you deeper. That is the problem.' },
  bloomjaw:    { n: 'Bloomjaw',    t: ['NANO', 'PLASMA'], b: [80, 95, 75, 90], line: 'bloomjaw', cr: 45, xp: 210,
    bp: { body: 'slab', head: 'orb', eyes: 'slit', legs: 'four', top: 'flame', tail: 'whip', s: 1.05 },
    dex: 'A flower that learned to burn. Its mane is a corona of heat-blooms that open only when it hunts.' },
  rhizarch:    { n: 'Rhizarch',    t: ['NANO', 'VOID'], b: [108, 104, 104, 100], line: 'rhizarch', cr: 12, xp: 320, legend: 1,
    bp: { body: 'hex', head: 'orb', eyes: 'tri', legs: 'four', arms: 'vines', top: 'crest', wings: 'insect', core: 1, s: 1.25 },
    dex: 'The face the Mycelnet wears when it wants to be understood. It is older than the Fracture, and it remembers the city before the city.' },
});
SPECIES.omnikernel.legend = 1;
Object.assign(LEARN, {
  thornram: [[1, 'ram'], [1, 'thornmesh'], [30, 'plating'], [33, 'ironfist'], [36, 'graftspike'], [40, 'flechette'], [44, 'titanslam']],
  lumeel:   [[1, 'coolant'], [1, 'thornmesh'], [32, 'shortsoak'], [36, 'siphonroot'], [40, 'tidalcrush'], [44, 'bloomburst']],
  bloomjaw: [[1, 'flarejet'], [1, 'overgrowth'], [33, 'plasmaclaw'], [37, 'graftspike'], [41, 'infernocore'], [45, 'bloomburst']],
  rhizarch: [[1, 'rootnet'], [1, 'spores'], [40, 'graftspike'], [45, 'blackout'], [48, 'bloomburst']],
});
Object.assign(SPECIES.thornram, { cls: 'cyborg' }); Object.assign(SPECIES.rootbreaker, { cls: 'cyborg' });
for (const id of ['lumeel', 'bloomjaw', 'rhizarch']) SPECIES[id].cls = 'wetware';
