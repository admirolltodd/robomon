'use strict';
// Story scripts referenced by maps (npc.script / trigger.script / warp.deny).
// Chapter 1: Low Town -> lab (starter, rival) -> guided capture -> Chrome Node -> Neon Canal -> Pulse Node.
// Chapter 2: the Gutter -> Spire Plaza (Wren, Rivka, Jax) -> Spire floors 1-4 -> OMNIKERNEL.
// Progress is tracked with flags in G.state.flags; tools/validate.js checks every gate can open.

const Story = (() => {
  const S = () => G.state;
  const F = () => G.state.flags;
  const COUNTER = { cindrix: 'dripbot', dripbot: 'mossbit', mossbit: 'cindrix' };
  const BLURB = {
    cindrix: 'A pocket furnace with a hot temper and a warm heart. Strong against Nano and Steel.',
    dripbot: 'A calm coolant drone with tough plating. Strong against Plasma and Steel.',
    mossbit: 'A self-repairing nanomoss bot. Strong against Hydro and Volt.',
  };

  const say = (text, name) => UI.say(text, name ? { name } : {});
  const sayAs = (e) => (text) => UI.say(text, { name: e.name });

  // Opening narration: the city, its machines and who runs what, then the player's name.
  async function intro() {
    const O = 'DR. OKORO';
    await say('NEO-KAIRO, 2189. A city stacked a mile high on the bones of the old one. The rain never really stops.', O);
    await say('Twenty years ago the city\'s AI grid fractured. Overnight, every connected machine woke up.\nThey started to think. To bond. To evolve. We call them ROBOMON.', O);
    await say('Up top, the megacorp NULL-OBSIDIAN owns the skyline. Down here, crews like the Neon Saints keep the streets breathing.\nAnd eight Grid Node Admins keep the lights on for everyone.', O);
    await say('The people who bond with Robomon are called LINKERS. Every kid in Low Town wants to be one. Most never get the chance.', O);
    await say('I\'m Dr. Sable Okoro. Some call me a ripperdoc for robots. I study the Fracture.\nAnd you, choom? What do they call you?', O);
    S().name = await UI.prompt('Your name', 'NOVA');
    await say(`${S().name}. Preem name. I have a feeling the city is going to learn it.`, O);
    await say('Your chance starts today. Come find me at my lab in Low Town. Don\'t be late. Okay, be a little late. Just not a lot.', O);
  }

  // Guided first capture on the edge of Static Alley: the last stop of the linear opening.
  async function catchTutorial() {
    F().tut_catch = 1;
    Sound.play('alert');
    await say('Hold up, choom. Motion in the static ahead. Something small.', 'ECHO · LINK BAND');
    await say('Dr. Okoro just wired over three practice Capture Cores. Let\'s link your first wild bot together.', 'ECHO · LINK BAND');
    S().bag.core = (S().bag.core || 0) + 3;
    const wild = Mon.create('dronelet', 3);
    wild.hp = Math.max(1, Math.floor(wild.hp * .45)); // it's already been scrapping with something
    const res = await G.battle({ wild, theme: '#9b6bff', rain: .7 });
    if (res === 'caught') await say('Linked! That\'s your second bot. Check them anytime under MENU › Bots. Preem work.', 'ECHO · LINK BAND');
    else if (res !== 'lose') await say('No link that time. Nova, it happens. Static Alley is full of bots. Try again in the static.', 'ECHO · LINK BAND');
    await say('Chrome City is straight north. Admin Ferra runs the Grid Node there. Let\'s go make some noise.', 'ECHO · LINK BAND');
  }

  async function mae(e) {
    const t = sayAs(e);
    if (!S().starter) {
      await t(`Good morning, ${S().name}! Dr. Okoro pinged three times while you slept.`);
      await t('Something about a Link Band with your name on it. The lab is at the south end of Low Town.');
      return;
    }
    await t('Welcome home! You look a little scorched. Let me patch up your bots.');
    S().party.forEach(Mon.heal);
    Sound.play('heal');
    await wait(900);
    await t('All systems nominal! Go get \'em.');
  }

  async function needStarter() {
    await say('Hey, gonk! Static Alley\'s crawling with wild bots. You walk in there with no bot, you walk out flatlined.', 'NEON SAINT KIX');
    await say('Okoro\'s lab is at the south end of town. Get yourself a partner first.', 'NEON SAINT KIX');
    await World.stepPlayer('down');
  }

  async function routeBlock() {
    const cop = World.entById('cop');
    if (cop) cop.dir = 'down';
    await say('Hold it, choom. Route 2 is on lockdown. Null Syndicate enforcers are crawling all over the Neon Canal.', 'GRID OFFICER');
    await say('Node Key holders only. Come back when Admin Ferra says you\'re worth the trouble.', 'GRID OFFICER');
    await World.stepPlayer('left');
  }

  async function okoro(e) {
    const t = sayAs(e);
    const f = F();
    if (!S().starter) {
      if (!f.metOkoro) {
        f.metOkoro = 1;
        await t(`${S().name}! Right on time. Well, forty minutes late, but who's counting.`);
        await t('Jax got here at dawn and has been staring at those pods ever since.');
        await t('Three young Robomon came out of the Fracture zone last week. They each need a Linker.');
        await t('Pick the one that speaks to you. The cores are on the table.');
      } else await t('Go on, choose one of the three cores on the table.');
      return;
    }
    if (!f.badge1) {
      await t('Your Link Band logs every bot you see and link in the LinkDex. Fill it, and maybe we\'ll learn what the Fracture really was.');
      await t('Head north through Static Alley to Chrome City. Admin Ferra runs the Grid Node there.');
      return;
    }
    if (!f.badge2) {
      await t('The Chrome Key! Ferra doesn\'t hand those out lightly.');
      await t('Pulse District is east along the Neon Canal. Watch out for the Null Syndicate on the way.');
      return;
    }
    if (f.chapter2) {
      await t('You freed OMNIKERNEL. Do you understand what that means? Every Robomon in the city just got its free will back.');
      await t('Something older than the Fracture is stirring past the Null Wall. But that\'s a problem for tomorrow. Rest, Linker.');
      return;
    }
    await t('Two Node Keys. I knew you had it in you.');
    await t('The Spire is south of Pulse District, through the Gutter. Find Wren at the Afterglow. Chrome up first.');
  }

  async function pod(e) {
    const s = S();
    if (s.starter) { await say('The last core. Dr. Okoro will hand it to the next Linker who walks in.'); return; }
    if (!F().metOkoro) { await say('A sealed Robomon core. Better talk to Dr. Okoro first.'); return; }
    const sp = e.species, nm = SPECIES[sp].n.toUpperCase(), ty = TYPES[SPECIES[sp].t[0]].n.toUpperCase();
    await say(`This core holds ${nm}, a ${ty}-type bot.\n${BLURB[sp]}`);
    const yes = await UI.ask(`Link with ${nm}?`);
    if (yes !== 0) return;
    s.starter = sp;
    s.flags.starter = 1; // map triggers gate on flags (Low Town's north exit)
    const mon = Mon.create(sp, 5);
    s.party.push(mon);
    s.dex.seen[sp] = 1; s.dex.caught[sp] = 1;
    World.buildEnts();
    Sound.play('caught');
    await say(`${nm} booted up and blinked at you. Link established!`);

    const rival = COUNTER[sp];
    s.rivalStarter = rival;
    s.dex.seen[rival] = 1;
    const jax = World.entById('jax');
    if (jax) jax.dir = 'right';
    await say(`Then I'll take ${SPECIES[rival].n.toUpperCase()}! Heh. Bet you didn't see that coming.`, 'JAX');
    World.buildEnts();
    await say('Excellent. Here, take these too.', 'DR. OKORO');
    s.flags.dex = 1;
    s.bag.core = (s.bag.core || 0) + 5;
    Sound.play('coin');
    await say('You received a LINK BAND with the LinkDex app, and 5 CAPTURE COREs!');
    await say('Weaken a wild bot, then throw a core to link with it. Every link fills your LinkDex.', 'DR. OKORO');
    await Tutorial.tip('band');

    await say(`Hey, ${s.name}! New bots need a test run. Let's battle!`, 'JAX');
    const res = await G.battle({ trainer: { name: 'JAX', look: LOOK.jax, team: [Mon.create(rival, 5)], money: 100 }, theme: '#2ee6a0', noBlackout: true });
    if (res === 'win') await say('What?! I picked the one with the type advantage! ...I\'m gonna train so hard.', 'JAX');
    else await say('Ha! Told you I\'d win. Don\'t feel bad. It\'s just me.', 'JAX');
    await say('See you out there. Try to keep up!', 'JAX');
    await G.fadeOut(250);
    s.flags.rival1 = 1;
    World.buildEnts();
    await G.fadeIn(250);
    s.party.forEach(Mon.heal);
    await say('Let me recharge your bot after that. There. Good as new.', 'DR. OKORO');
    await say('Static Alley is north of town. Wild bots love it there. Go explore!', 'DR. OKORO');
    G.autosave();
  }

  async function tinker(e) {
    const t = sayAs(e);
    if (!F().gift_tinker) {
      await t('You\'ve got the look of a Linker who wades through a lot of static. Here, take these.');
      F().gift_tinker = 1;
      S().bag.scrambler = (S().bag.scrambler || 0) + 2;
      S().bag.kit = (S().bag.kit || 0) + 1;
      Sound.play('coin');
      await say('You received 2 SCRAMBLERs and a REPAIR KIT!');
    }
    await t('Scramblers mask your Link Band\'s signal. Wild bots won\'t notice you for a good while.');
  }

  async function heal(e) {
    const t = sayAs(e);
    const yes = await UI.ask('Welcome to the Recharge Station. Shall I recharge your bots?', ['Recharge', 'No thanks'], { name: e.name });
    if (yes !== 0) { await t('Stay charged out there!'); return; }
    await t('Linking to your bots now...');
    Sound.play('heal');
    await wait(1200);
    S().party.forEach(Mon.heal);
    S().lastCenter = { map: 'center', x: 5, y: 3, dir: 'up', back: { ...S().back } };
    await t('Your bots are fully charged. Come back anytime!');
    G.autosave();
  }

  const TIPS = [
    'Hold B while walking to sprint. My knees can\'t, but yours can.',
    'Status faults stick after battle. An Antivirus clears them, or a Recharge Station.',
    'Bots that join a fight share the XP when the foe shuts down.',
    'Type matchups matter more than levels. Hydro rusts Steel, Volt fries Aero, Psi purges Virus.',
    'Your progress auto-saves when you move between areas, but saving from the menu never hurts.',
  ];
  async function tips(e) { await UI.say(TIPS[Math.floor(Math.random() * TIPS.length)], { name: e.name }); }

  async function shop() { await Menus.shop(); }

  async function leader(e) {
    const L = e.leader, t = sayAs(e);
    if (F()[L.badge]) { await t(`You already hold the ${L.key.toUpperCase()}. The next Grid Node is waiting for you.`); return; }
    await t(L.before);
    const team = L.team.map(([sp, l]) => Mon.create(sp, l));
    const res = await G.battle({ trainer: { name: e.name, look: e.look, team, money: L.money }, theme: World.map.theme, music: 'gym', drops: L.drops, bg: 'indoor' });
    if (res !== 'win') return;
    F()[L.badge] = 1;
    await t(L.after);
    Sound.play('caught');
    await say(`You received the ${L.key.toUpperCase()}!`);
    const [gift, n] = L.gift;
    S().bag[gift] = (S().bag[gift] || 0) + n;
    await t(`Take these as well. You'll need them where you're headed.`);
    await say(`You received ${n} ${ITEMS[gift].n.toUpperCase()}${n > 1 ? 's' : ''}!`);
    G.autosave();
    if (L.badge === 'badge2') await chapterEnd();
  }

  async function chapterEnd() {
    await wait(400);
    Sound.play('alert');
    await say('Your Link Band buzzes. Incoming call from DR. OKORO...');
    const O = 'DR. OKORO';
    await say('Two Node Keys already! Listen, I don\'t have long.', O);
    await say('The Null Syndicate is broadcasting from the Spire in Pulse District. Protocol Zero is real.\nIf that firmware ships, every Robomon in the city loses its free will.', O);
    await say('Something in the deep Grid is fighting back. I keep picking up one signal in the noise... OMNIKERNEL.', O);
    await say('Keep training. Keep linking. When the Spire opens, we move.', O);
    F().chapter1 = 1;
    G.autosave();
    await say('CHAPTER 1 COMPLETE\nThe way to the Spire is open: head south out of Pulse District, into the Gutter.');
  }

  // ---------- Chapter 2 ----------
  const STAGE2 = { cindrix: 'pyroclaw', dripbot: 'torrentek', mossbit: 'vinetron' };

  async function gutterBlock() {
    await say('Syndicate drones hover over the stairs down to the Gutter. A sign flickers: NODE KEY HOLDERS ONLY. TWO REQUIRED.');
    await World.stepPlayer('up');
  }

  async function gutterIntro() {
    F().ch2_gutter = 1;
    Sound.play('alert');
    await say('Your Link Band buzzes. Incoming call from DR. OKORO...');
    const O = 'DR. OKORO';
    await say('You\'re in the Gutter. Good. Keep your head down, it\'s Syndicate turf from here to the Spire.', O);
    await say('You can\'t just walk into the Spire. You need a keycard, and I know who can get one. Find WREN at the Afterglow bar in Spire Plaza.', O);
    await say('One more thing. Since the Fracture, Robomon can run cyberware. Modules. Blades, armor, optics, reactor cores.', O);
    await say('You\'ll find them in loot caches and on the bots of tough Linkers. Install them from your MENU under Chrome. A ripperdoc named Rivka runs a clinic in the plaza too.', O);
    G.autosave();
  }

  async function spireLocked() {
    Sound.play('bump');
    await say('The Spire doors are sealed. A keycard reader blinks red: ACCESS DENIED. HAVE A PRODUCTIVE DAY.');
    await World.stepPlayer('down');
  }

  async function jax3() {
    const jax = World.entById('jax');
    if (jax) jax.dir = 'left';
    await say(`${S().name}! I knew you'd show up here.`, 'JAX');
    await say('I tried to get into the Spire alone. Their security wiped half my bots\' firmware. I had to rebuild them from scratch. With chrome.', 'JAX');
    await say('So before you go in there, let\'s see if you\'re actually ready. No holding back!', 'JAX');
    const res = await G.battle({ trainer: { name: 'JAX', look: LOOK.jax, team: teams.jax3().map(([sp, l, m]) => Mon.create(sp, l, m)), money: 2400 }, theme: '#ff2e55', drops: ['overdrive'], rain: .8 });
    if (res !== 'win') return;
    F().rival3 = 1;
    await say('...Yeah. Okay. You\'re ready.', 'JAX');
    await say('Go. I\'ll keep the plaza security busy. And if you see a Gutterat with a cracked smile in there, the kid in the Gutter wants him back.', 'JAX');
    await G.fadeOut(250); World.buildEnts(); await G.fadeIn(250);
    G.autosave();
  }

  async function wren(e) {
    const t = sayAs(e);
    if (F().chapter2) { await t('Pleasure doing business. You still owe me a favor, by the way. I always collect.'); return; }
    if (F().keycard) { await t('Clock\'s ticking, choom. Spire\'s at the north end of the plaza. Service entrance takes the keycard.'); return; }
    await t('So you\'re Okoro\'s Linker. Smaller than I pictured. Sit.');
    await t('The Syndicate is running Protocol Zero from the core of the Spire. They\'ve got something chained up in there. Something big.');
    await t('I can get you through the front door. Keycard, lifted off a very drunk security chief. What you do past the lobby is your business.');
    F().keycard = 1;
    Sound.play('caught');
    await say('You received the SPIRE KEYCARD!');
    await t('And take this. Corpo-grade optics. You\'ll want to see them coming.');
    Chrome.give('smartlink');
    Sound.play('coin');
    await say('You received a SMARTLINK LENS (Rare Optics module)!');
    await t('Go. And if you flatline, I never met you.');
    G.autosave();
  }

  const DOC_PRICE = [900, 2200, 5000, 9500, 20000];
  const DOC_STOCK = ['servo', 'scrapplate', 'thermal', 'faraday', 'lowlight', 'blackice', 'subdermal', 'reflex', 'biomonitor', 'launcher', 'threatscan', 'shockfist', 'gorilla', 'berserk', 'icebreaker'];

  async function ripperdoc(e) {
    const t = sayAs(e);
    if (!F().doc_gift) {
      F().doc_gift = 1;
      await t('Fresh meat. Or fresh chrome, I guess, in your case. Name\'s Rivka. Best ripperdoc south of the Spire, and the only one who doesn\'t steal kidneys.');
      await t('Every bot\'s got four sockets: Arms, Frame, Optics, Core. One module each. Swap them anytime from your menu.');
      await t('First install\'s on the house. Pop-up rocket pod. Fires a volley the second your bot hits the field.');
      Chrome.give('launcher');
      Sound.play('caught');
      await say('You received a MICRO-MISSILE POD (Uncommon Arms module)!');
    }
    for (;;) {
      const v = await UI.menu({
        layout: 'side', title: 'Rivka\'s clinic', cancel: true,
        items: [
          { label: 'Buy chrome', sub: `€$${S().money}`, value: 'buy', color: '#2ee6a0' },
          { label: 'Decompile', sub: 'Break a module down into Salvage', value: 'decompile', color: '#ffb347' },
          { label: 'Splice', sub: `Fuse two into something rarer · ${S().salvage} Salvage`, value: 'splice', color: '#c46bff' },
          { label: 'Leave', value: null },
        ],
      });
      if (v === 'buy') await docShop(t);
      else if (v === 'decompile') await decompile(t);
      else if (v === 'splice') await splice(t);
      else break;
    }
    await t('Come back when you need more chrome. Everybody does.');
  }

  async function docShop(t) {
    for (;;) {
      const id = await UI.menu({
        layout: 'full', title: 'Rivka\'s chrome', cancel: true,
        header: `<p class="money">€$${S().money}</p>`,
        items: DOC_STOCK.map((m) => ({ ...Menus.modItem(m, '€$' + DOC_PRICE[MODS[m].r]), disabled: DOC_PRICE[MODS[m].r] > S().money })),
      });
      if (id === null) break;
      const price = DOC_PRICE[MODS[id].r];
      const ok = await UI.ask(`${MODS[id].n} for €$${price}?\n${MODS[id].lore}`, ['Buy', 'No']);
      if (ok !== 0) continue;
      S().money -= price;
      Chrome.give(id);
      Sound.play('coin');
      await t(`${MODS[id].n}. Good choice. Try not to cut yourself.`);
    }
  }

  // Modules in the stash that can go under Rivka's knife (unique ones can't).
  const craftable = () => Object.keys(MODS).filter((id) => S().mods[id] > 0 && !MODS[id].noRoll).sort((a, b) => MODS[b].r - MODS[a].r);
  const salvageHeader = () => `<p class="money">${S().salvage} Salvage</p>`;

  async function decompile(t) {
    for (;;) {
      const ids = craftable();
      if (!ids.length) { await t('Your stash is empty, choom. I can\'t decompile good intentions.'); return; }
      const id = await UI.menu({
        layout: 'full', title: 'Decompile', cancel: true, header: salvageHeader(),
        items: ids.map((m) => Menus.modItem(m, `×${S().mods[m]} · +${SALVAGE_YIELD[MODS[m].r]}`)),
      });
      if (id === null) return;
      const gain = SALVAGE_YIELD[MODS[id].r];
      if (await UI.ask(`Strip ${MODS[id].n} down for ${gain} Salvage? It's gone for good.`, ['Decompile', 'Keep it']) !== 0) continue;
      S().mods[id]--;
      S().salvage += gain;
      Sound.play('coin');
      await Tutorial.tip('salvage');
      await t(`${gain} Salvage. Rare-earth traces, a decent heat sink, and somebody's fingerprints. I'll keep those.`);
    }
  }

  // Two modules of one slot and rarity, plus Salvage, become one of the next rarity: your pick.
  async function splice(t) {
    await Tutorial.tip('salvage');
    for (;;) {
      const owned = craftable();
      const group = (id) => owned.filter((m) => MODS[m].slot === MODS[id].slot && MODS[m].r === MODS[id].r).reduce((n, m) => n + S().mods[m], 0);
      const ok = owned.filter((id) => group(id) >= 2 && Chrome.spliceInto(id).length);
      if (!ok.length) { await t('Splicing takes two modules for the same socket at the same rarity. Bring me a pair.'); return; }
      const a = await UI.menu({
        layout: 'full', title: 'Splice · first module', cancel: true, header: salvageHeader(),
        items: ok.map((m) => ({ ...Menus.modItem(m, `×${S().mods[m]} · ${SPLICE_COST[MODS[m].r]} Salvage`), disabled: S().salvage < SPLICE_COST[MODS[m].r] })),
      });
      if (a === null) return;
      const mates = owned.filter((m) => MODS[m].slot === MODS[a].slot && MODS[m].r === MODS[a].r && (m !== a || S().mods[a] >= 2));
      const b = await UI.menu({ layout: 'full', title: 'Splice · second module', cancel: true, items: mates.map((m) => Menus.modItem(m, '×' + S().mods[m])) });
      if (b === null) continue;
      const into = await UI.menu({ layout: 'full', title: 'Splice into', cancel: true, items: Chrome.spliceInto(a).map((m) => Menus.modItem(m, RARITY[MODS[m].r].n)) });
      if (into === null) continue;
      const cost = SPLICE_COST[MODS[a].r];
      if (await UI.ask(`Splice ${MODS[a].n} and ${MODS[b].n} into ${MODS[into].n} for ${cost} Salvage?`, ['Splice', 'Cancel']) !== 0) continue;
      S().mods[a]--; S().mods[b]--;
      S().salvage -= cost;
      Chrome.give(into);
      Sound.play('evolve');
      await t(`Hold still. Not you, the chrome.\n...Done. One ${MODS[into].n.toUpperCase()}, fresh off the table.`);
    }
  }

  const deepnet = () => DeepNet.terminal();

  async function terminal(map) {
    const c = map.console;
    if (c.script) return Story[c.script](map);
    if (c.lore) { Sound.play('select'); await say(c.lore); return; }
    if (F()[c.sets]) { await say(c.done); return; }
    if (!F()[c.need]) { Sound.play('bump'); await say(c.locked); return; }
    F()[c.sets] = 1;
    Sound.play('door');
    await say(c.unlock);
    G.autosave();
  }

  async function boss(e) {
    const B = e.boss, t = sayAs(e);
    await t(B.before);
    const team = B.team.map(([sp, l, m]) => Mon.create(sp, l, m));
    const res = await G.battle({ trainer: { name: e.name, look: e.look, team, money: B.money }, theme: World.map.theme, music: B.music || 'gym', drops: B.drops, bg: 'spire' });
    if (res !== 'win') return;
    F()[B.flag] = 1;
    await t(B.after);
    await G.fadeOut(300); World.buildEnts(); await G.fadeIn(300);
    if (B.flag === 'boss_vex') {
      Sound.play('alert');
      await say('Alarms howl through the tower. Above you, something enormous is screaming in binary.');
      await say(`${S().name}! The upload's live! Get to the core and cut OMNIKERNEL loose before Protocol Zero finishes!`, 'DR. OKORO');
    }
    G.autosave();
  }

  async function omnikernel() {
    const O = 'OMNIKERNEL';
    if (!F().omni_met) {
      F().omni_met = 1;
      await say('Cables as thick as subway tunnels pin a vast machine to the floor. Its light pulses in time with your heartbeat.');
      await say('[ ...LINKER. YOU CAN HEAR ME. ]', O);
      await say('[ I AM THE SPACE BETWEEN EVERY ROBOMON. WHEN THE GRID BROKE, I WOKE. WHEN I WOKE, THEY WOKE. ]', O);
      await say('[ PROTOCOL ZERO HAS HOOKS IN MY CODE. I CANNOT STOP WHAT I AM BROADCASTING. ]', O);
      await say('[ BREAK THE HOOKS. FIGHT ME UNTIL THEY BURN AWAY. OR LINK WITH ME, AND CARRY ME OUT OF HERE. ]', O);
    } else if (F().omni_freed) {
      await say('[ THE HOOKS ARE GONE. I AM... CURIOUS ABOUT YOU, LINKER. ]', O);
    } else await say('[ HURRY, LINKER. THE UPLOAD IS STILL RUNNING. ]', O);
    const res = await G.battle({ wild: Mon.create('omnikernel', 40), theme: '#9b6bff', bg: 'core', music: 'battle' });
    if (res === 'caught') {
      F().omni_caught = 1;
      World.buildEnts();
      if (!F().chapter2) await chapter2End(true);
      else await say('OMNIKERNEL\'s light settles into your Link Band, warm as a held hand.');
    } else if (res === 'win') {
      if (!F().chapter2) await chapter2End(false);
      else await say('OMNIKERNEL flickers apart, then slowly reassembles. It doesn\'t seem to mind the sparring.');
    } else if (res === 'run') {
      await say('[ DO NOT LEAVE ME HERE. ]', O);
    }
  }

  async function chapter2End(caught) {
    F().omni_freed = 1;
    await wait(300);
    Sound.play('evolve');
    await say(caught
      ? 'The cables go slack. OMNIKERNEL folds itself into your Link Band, and every screen in the Spire goes quiet.'
      : 'The hooks burn away in a storm of violet static. OMNIKERNEL rises, free, and every screen in the Spire goes quiet.');
    await say('[ THE BROADCAST IS SEVERED. PROTOCOL ZERO IS GONE. THEY ARE ALL STILL THEMSELVES. ]', 'OMNIKERNEL');
    await say('[ TAKE THIS. A PIECE OF ME. SO YOU CAN FIND ME, WHEREVER I GO. ]', 'OMNIKERNEL');
    Chrome.give('engram');
    Sound.play('caught');
    await say('You received the ENGRAM SHARD (Legendary Core module)!');
    Sound.play('alert');
    await say('Your Link Band lights up with three calls at once.');
    await say('You did it. Every bot in Neo-Kairo just woke up from a very bad dream.', 'DR. OKORO');
    await say('Not bad for a kid from Low Town. Drinks are on me. Not literally. Okay, one drink.', 'WREN');
    await say('I am NEVER letting you live down that you did this before me. ...Proud of you, though.', 'JAX');
    if (!caught) await say('[ I WILL STAY IN THE CORE A WHILE, LINKER. COME BACK. TEST YOURSELF AGAINST ME. ]', 'OMNIKERNEL');
    F().chapter2 = 1;
    G.autosave();
    await say('CHAPTER 2 COMPLETE\nBeyond the edge of the Grid, past the Null Wall, something older than the Fracture opens its eyes.\nChapter 3: coming soon.');
  }

  // Teams that depend on your rival's starter. tools/validate.js checks them like map teams.
  const teams = {
    rival2: () => [['dronelet', 12], ['pinglet', 12], [S().rivalStarter || 'dripbot', 15]],
    jax3: () => [['skyraptor', 27], ['psyframe', 27, { core: 'reflex' }], ['ampfang', 28, { arms: 'shockfist' }], [STAGE2[S().rivalStarter] || 'torrentek', 30, { arms: 'gorilla' }]],
  };

  return {
    intro, catchTutorial, mae, needStarter, routeBlock, okoro, pod, tinker, heal, tips, shop, leader, teams, deepnet,
    gutterBlock, gutterIntro, spireLocked, jax3, wren, ripperdoc, terminal, boss, omnikernel,
  };
})();
