'use strict';
// In-game teaching and lore.
// Tutorial: one-time tips from ECHO, the Link Band's assistant, shown the first time a feature
// matters. Each tip sets a `tip_<id>` flag so it never repeats; Options can switch them off.
// Codex: lore entries about Neo-Kairo, unlocked by story flags and read from MENU › Codex.

const Tutorial = (() => {
  const ECHO = 'ECHO · LINK BAND';
  const TIPS = {
    move: { name: 'HOMEBOT MAE', text: 'Before you head out, a refresher, since you slept through the last one.\nMove with the D-pad or arrow keys. Hold B to sprint.\nFace something and press A to talk, read signs or open things. MENU opens your gear.' },
    band: { text: 'Link Band online. Hey, choom. I\'m ECHO, your band\'s assistant. I\'ll ping you when there\'s something new to learn.\nPress MENU for your Bots, Bag, Chrome, Map, LinkDex, Codex and Options. You can mute my tips in Options.' },
    map: { text: 'See the box in the corner? That\'s your minimap.\nPink cross: Recharge Station. Green bag: NanoMart. Star: Grid Node. Ring: route exit. Red dot: a Linker itching for a fight. Gold diamond: loot cache.\nMENU › Map shows the whole area with a legend.' },
    static: { text: 'You\'re standing in static. Wild Robomon nest in these glitching patches, so keep walking and something will jump out.\nWant to slip past unseen? A Scrambler from the NanoMart masks your signal.' },
    battle: { text: 'Battle! Tap FIGHT and pick a move. Its color is its type.\nHit a weakness for double damage; a resisted hit does half. BAG uses items, BOTS swaps who\'s fighting.\nWatch the HP bars up top. When a bot hits zero, it shuts down.' },
    wild: { text: 'A wild bot. You can link with it: wear it down, then BAG › Capture Core.\nWatch the RES bar under its HP. Every hit you land, every fault you give it and every Core you throw builds Resonance, and Resonance raises your link odds. Low HP and faults like Shorted or Standby help too, and a bot that shares its type syncs easier.\nOr RUN if it\'s not your type.' },
    trainer: { text: 'Another Linker spotted you. Linkers who catch your eye challenge you, and there\'s no running from those.\nWin and you earn eddies, the city\'s currency. Spend them at NanoMarts and ripperdocs.' },
    level: { text: 'Level up! Higher levels mean better stats and new moves.\nSome bots evolve into bigger, nastier frames when they hit the right level. Preem.' },
    chrome: { text: 'You found chrome: a module for your bots.\nEvery bot has four sockets: Arms, Frame, Optics and Core. Install from MENU › Chrome, or MENU › Bots › Chrome.\nInstalled chrome shows on your bot and changes how it fights. Rarer modules hit harder, but they eat more RAM, and each bot\'s RAM grows with its level.' },
    redline: { text: 'Careful, choom. That bot is running more chrome than its RAM can hold. That\'s REDLINE.\nA redlined bot hits with everything it\'s got, but its logic can stutter and lose a turn, and every hit it lands burns it with heat.\nIt\'s a gamble. Strip a module in MENU › Chrome to run it clean.' },
    breach: { text: 'Socket breach! Critical hits and some hacking moves can knock a socket offline.\nThe module in it stops working, abilities and stat boosts included, until it reboots two or three turns later. Switching the bot out clears it right away.' },
    arena: { text: 'Some arenas fight back. Rain feeds HYDRO and drowns PLASMA, server farms run VIRUS and PSI hot, and the Kernel squeezes every bot\'s RAM.\nThe arena is announced when a battle starts. Pick your bots to match.' },
    heal: { text: 'Recharge Stations patch up your whole crew, free of charge. If every bot shuts down, you wake up at the last station you used.\nThe cloud terminals on the right store extra bots in your Cloud Box.' },
    save: { text: 'Your progress auto-saves every time you move between areas. You can save by hand from MENU, and turn auto-save off in Options.' },
  };
  const queue = [];

  const on = () => G.state && G.state.opts.tips !== false;

  async function tip(id) {
    const f = G.state.flags;
    if (f[`tip_${id}`] || !on()) return;
    f[`tip_${id}`] = 1;
    const t = TIPS[id];
    Sound.play('alert');
    await UI.say(t.text, { name: t.name || ECHO });
  }

  // Tips earned in the middle of something (like a chrome drop) wait until the scene ends.
  function later(id) { if (!G.state.flags[`tip_${id}`] && !queue.includes(id)) queue.push(id); }
  async function flush() { while (queue.length) await tip(queue.shift()); }

  return { tip, later, flush };
})();

// Lore. `need` is the story flag that unlocks an entry (none = known from the start).
const CODEX = [
  { id: 'city', n: 'Neo-Kairo',
    text: 'A city stacked a mile high on the bones of the old one. Corps own the sky, gangs own the streets, and the rain never really stops. Twelve districts, thirty million people, and more Robomon than anyone can count.' },
  { id: 'fracture', n: 'The Grid Fracture',
    text: 'Twenty years ago the city\'s central AI grid split open in a single night. Every connected machine woke up. Vending units, traffic drones, sewer crawlers. They started to think, to bond and to evolve. Nobody agrees on why. Dr. Okoro has a theory.' },
  { id: 'robomon', n: 'Robomon',
    text: 'Machines that woke in the Fracture. They rebuild themselves as they grow, swapping parts and code until they evolve into new frames. Each runs on one of nine types: Volt, Plasma, Hydro, Nano, Steel, Aero, Virus, Psi and Void.' },
  { id: 'saints', n: 'The Neon Saints',
    text: 'Low Town\'s street crew. When the corps tried to recall every awakened bot, the Saints hid them in basements and noodle bars. They keep the lights on in Sector 9 and the corpos out. Mostly.' },
  { id: 'slang', n: 'Street talk',
    text: 'Choom: friend. Preem: top quality. Nova: cool. Gonk: idiot. Delta: get out, fast. Eddies: money. Flatline: to die, or to kill. Corpo: anyone who works for a megacorp. Chrome: cybernetics. Ripperdoc: the doctor who installs it. Fixer: a broker of jobs and favors. Netrunner: a hacker who dives into the net. ICE: the defenses they cut through.' },
  { id: 'linkers', n: 'Linkers', need: 'starter',
    text: 'People who bond with Robomon through a Link Band. A good link is a two-way street: the bot gets a partner, the Linker gets a friend who can punch through walls. Every kid in Neo-Kairo wants to be one.' },
  { id: 'nodes', n: 'Grid Nodes', need: 'starter',
    text: 'After the Fracture, eight Grid Nodes kept the city\'s power from collapsing. Their Admins are the closest thing Neo-Kairo has to a government that isn\'t selling you something. Beat an Admin and you earn their Node Key. Collect all eight and the deep Grid opens.' },
  { id: 'hexwire', n: 'Hexwire', need: 'tr_route1_vee',
    text: 'A netrunner collective that lives in the city\'s data lines. They trade secrets, crack ICE for fun and never log off. Their founder went corpo years ago and nobody says her name out loud.' },
  { id: 'nullob', n: 'NULL-OBSIDIAN', need: 'badge1',
    text: 'The megacorp that owns the Spire, half the skyline and most of the people under it. Officially they make firmware. Unofficially they want every awakened machine back under control.' },
  { id: 'syndicate', n: 'The Null Syndicate', need: 'badge1',
    text: 'NULL-OBSIDIAN\'s deniable muscle. Grunts in red visors, enforcers with riot bots, and admins who never answer to anyone but the CEO. They do the work the corp can\'t be seen doing.' },
  { id: 'protocol', n: 'Protocol Zero', need: 'chapter1',
    text: 'A firmware push meant to reach every Robomon in the city at once. It would overwrite their free will and make them obey. The Syndicate is broadcasting it from the top of the Spire.' },
  { id: 'rustbloods', n: 'The Rustbloods', need: 'ch2_gutter',
    text: 'Scavvers who own the flooded Gutter. They strip anything that isn\'t bolted down, and they\'ve got the bolt cutters for the rest. Fair dealers if you pay in eddies. Terrible dealers if you don\'t.' },
  { id: 'chrome', n: 'Chrome and ripperdocs', need: 'tip_chrome',
    text: 'Modules a Robomon can run: blades, armor, optics, reactor cores. Most of it is street-grade, some is corpo milspec with the serials filed off. Ripperdocs like Rivka install it, sell it and occasionally ask where you got it.' },
  { id: 'ram', n: 'RAM and the Redline', need: 'tip_chrome',
    text: 'Every chassis has a RAM budget, and every module eats into it: street chrome a little, legendary chrome a lot. Push past the budget and the bot runs in the redline, hotter, faster to hit and one bad cycle from a stutter. Ripperdocs call it a coin flip. Fixers call it Tuesday.' },
  { id: 'omni', n: 'OMNIKERNEL', need: 'omni_met',
    text: 'The mind that woke when the grid fractured. Every Robomon carries a fragment of its code. The Syndicate chained it in the Spire\'s core to broadcast Protocol Zero. It remembers being afraid.' },
  { id: 'nullwall', n: 'The Null Wall', need: 'chapter2',
    text: 'Past the city\'s edge, where the Grid frays into static, NULL-OBSIDIAN built a wall of lethal ICE to keep something out. Since the Spire fell, something behind it has started knocking.' },
];
