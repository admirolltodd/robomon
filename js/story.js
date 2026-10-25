'use strict';
// Story scripts referenced by maps (npc.script / trigger.script).

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

  async function intro() {
    const O = 'DR. OKORO';
    await say('Welcome to NEO-KAIRO. The year is 2189.', O);
    await say('Twenty years ago the city\'s AI grid fractured. When the network split, machines everywhere woke up.\nThey started to think. To bond. To evolve.', O);
    await say('We call them ROBOMON.', O);
    await say('Some people battle with them. Some build with them. Some just like the company.\nThe ones who bond the deepest are called LINKERS.', O);
    await say('I\'m Dr. Sable Okoro, and I study the Fracture. But enough about me.\nWhat should I call you?', O);
    S().name = await UI.prompt('Your name', 'NOVA');
    await say(`${S().name}! Great name. Big things are coming your way.`, O);
    await say('Your own Robomon story starts today. Come find me at my lab in Low Town!', O);
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
    await say('Static crackles across the alley ahead. Wild bots are swarming in there.');
    await say('You need a bot of your own before heading out. Dr. Okoro\'s lab is at the south end of town.');
    await World.stepPlayer('down');
  }

  async function routeBlock() {
    const cop = World.entById('cop');
    if (cop) cop.dir = 'down';
    await say('Hold it! Route 2 is on lockdown. Syndicate activity on the Neon Canal.', 'GRID OFFICER');
    await say('Come back when you\'ve earned a Node Key from Admin Ferra.', 'GRID OFFICER');
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
    await t('Two Node Keys. I knew you had it in you.');
    await t('Keep filling that LinkDex. When the Syndicate makes its move, we\'ll need every Linker we have.');
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
    const res = await G.battle({ trainer: { name: e.name, look: e.look, team, money: L.money }, theme: World.map.theme, music: 'gym' });
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
    await say('CHAPTER 1 COMPLETE · Thanks for playing ROBOMON: Neon Circuit!\nKeep training, fill your LinkDex, and stay tuned for Chapter 2.');
  }

  const teams = {
    rival2: () => [['dronelet', 12], ['pinglet', 12], [S().rivalStarter || 'dripbot', 15]],
  };

  return { intro, mae, needStarter, routeBlock, okoro, pod, tinker, heal, tips, shop, leader, teams };
})();
