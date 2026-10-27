# ROBOMON: Neon Circuit

A creature-collecting RPG for your phone. It plays like the classic monster-battling games, but it's set in a neon cyberpunk megacity, and the creatures are self-evolving robots.

> **NEO-KAIRO, 2189.** A city stacked a mile high on the bones of the old one. Twenty years ago its AI grid fractured, and every connected machine woke up. They started to think, to bond and to evolve. People call them **Robomon**, and the people who bond with them are **Linkers**. You're a kid from Low Town with one shot at becoming one. Meanwhile, the megacorp **NULL-OBSIDIAN** is preparing **Protocol Zero**, a firmware push that would rewrite every Robomon's free will.

### The city and who runs it

| Faction | Turf | What they want |
| --- | --- | --- |
| **Neon Saints** | Low Town (Sector 9) | Keep the lights on and the corpos out. They hid awakened bots when the corps tried to recall them. |
| **Grid Node Admins** | Every district | Keep the power grid alive. They're the only law most districts respect. Beat them for Node Keys. |
| **Hexwire** | The net | Netrunners who trade secrets and crack ICE for fun. Their founder went corpo. |
| **Rustbloods** | The Gutter | Scavvers who strip anything that isn't bolted down. |
| **NULL-OBSIDIAN / the Null Syndicate** | The Spire and the skyline | Total control of every awakened machine. |

The dialogue uses Night City-style street slang: *choom, preem, nova, gonk, delta, flatline, eddies, ripperdoc, fixer, netrunner, ICE*. The in-game Codex has a glossary.

## Play

- **On a phone:** open the hosted build, or serve this folder and open it in your mobile browser. Use "Add to Home Screen" to launch it fullscreen.
- **Locally:** open `index.html` directly, or run `python3 -m http.server` and go to `http://localhost:8000`.
- **One file:** `node tools/build.js` writes a self-contained `dist/robomon.html`. You can AirDrop it or message it to a phone.

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move | D-pad (you can slide your thumb across it) | Arrows / WASD |
| Talk, confirm | A | Z, Enter, Space |
| Back, hold to sprint | B | X, Esc |
| Menu | MENU | M |

The game saves automatically when you move between areas or finish a battle, and you can also save from the menu. On the hosted claude.ai version, signed-in players also get a private cloud save, so their progress follows them between devices.

## How the game teaches itself

The opening is linear and runs about ten minutes:
1. Wake up at home. Homebot Mae covers the controls.
2. Walk to Dr. Okoro's lab and pick your starter. A Neon Saint blocks the road north until you have one.
3. Battle your rival Jax in the lab.
4. Head north. At the edge of Static Alley, **ECHO**, your Link Band's AI, walks you through your first capture with practice cores.

After that, ECHO's one-time tips appear the first time each feature matters: the minimap, static patches, battles, wild captures and Resonance, trainers, level-ups, chrome and RAM, Redline, socket breaches, arenas, Recharge Stations and saving. You can turn them off in Options.

The **Codex** (MENU › Codex) collects lore entries about the city, its factions, Protocol Zero and OMNIKERNEL as you unlock them.

## What's in the game

**Chapter 1: Neon Circuit**
- **Creatures:** 43 Robomon across 20 evolution lines, with **9 types**: Volt, Plasma, Hydro, Nano, Steel, Aero, Virus, Psi and Void. Each type has its own strengths, weaknesses and immunities.
- **Starters:** Cindrix (Plasma), Dripbot (Hydro) and Mossbit (Nano). Your rival Jax always picks the one that beats yours.
- **Battles:** status faults, stat stages, XP, move learning and evolution scenes.
- **Resonance Linking:** capturing a wild bot builds Resonance (the RES bar under its HP) every time you hit it, give it a fault or throw a Core. Link odds come from its catch rate, missing HP, faults, Resonance, and a bonus if your bot shares its type. The odds are shown before every throw.
- **Arenas:** rain-soaked maps (Route 2, the Gutter, the Plaza) are a Downpour: Hydro ×1.2, Plasma ×0.8. The Spire's Server Farm runs Virus and Psi ×1.2. The Kernel lowers every bot's RAM by 2 and boosts Void ×1.2.
- **Map:** Low Town → Route 1 → Chrome City → Route 2 → Pulse District, plus 2 Grid Nodes (gyms).

**Chapter 2: The Spire**
- **New areas:** The Gutter (a flooded, rain-soaked Route 3) leads to Spire Plaza, a night market with the Afterglow bar, Doc Rivka's ripper clinic and the Syndicate Spire.
- **The Spire:** four floors. The lobby has a laser-grid puzzle; above it are the R&D labs, the server farm and the executive suite. Bosses are Admin Voss, Hex the Glitch Queen and CEO Halcyon Vex, whose bots run full chrome.
- **New characters:** Wren the fixer, a third rival battle with Jax, and 13 new Robomon, including the legendary **OMNIKERNEL** (Psi/Void) chained in the Kernel. Free it or link with it to stop Protocol Zero.

**Chrome (upgrade modules)**
- Every bot has four sockets: **Arms, Frame, Optics, Core**. Each holds one module, and you swap them from MENU › Bots › Chrome, or from MENU › Chrome.
- There are 25 modules across 5 rarity tiers (Common → Legendary). They give stat bonuses and battle abilities, and each has street-tech lore. Some examples:
  - Mantis Blades: double crit rate
  - Gorilla Arms: +25% ATK
  - Monowire: ignores armor
  - Micro-Missile Pod: opening salvo
  - Optical Camo: dodge
  - Second Heart: survives one KO
  - Chrono Dilator: always strikes first
  - Engram Shard: a piece of OMNIKERNEL
- **RAM:** every module costs RAM by rarity (Common 1 up to Legendary 5), and a bot's budget is `2 + level/5` (max 12). The install screen shows a RAM bar.
- **Redline:** you can push a bot up to 2 RAM past its budget. A redlined bot stutters and loses its move 15% of the time, and takes 1/16 HP of heat burn every time it lands a hit. Enemy Linkers and bosses never redline: their loadouts must fit, and `validate.js` enforces it.
- **Socket breach:** critical hits (25%) and hacking moves like Payload Burst, Wire Lash and Zero-Day Beam can knock a socket offline for 2–3 turns. Its ability and stat bonus vanish until it reboots, or until the bot switches out.
- Installed chrome **shows on the bot**: you can see the blades, fists, armor plates, missile pods, eye colors and core glow.
- Modules drop from loot caches (rolled by area tier), from wild bots (6%) and trainers (20%), and are guaranteed from Node Admins, rivals and bosses. Doc Rivka also sells them.

**Salvage and Rivka's clinic**
- **Salvage** is chrome scrap. Beating a Linker strips one Salvage per module their bots ran, the Deep Net pays it out, and Rivka will **decompile** a module you don't need (2 for Common up to 30 for Legendary).
- **Splice:** bring Rivka two modules for the same socket at the same rarity, plus Salvage (8, 16, 30 or 50 by rarity), and she fuses them into one module of the next rarity in that socket. You pick which one.
- The Engram Shard is unique and never goes under the knife.

**The Deep Net** (the terminal in the Afterglow)
- An endless roguelite arcade. Your bots stay outside: you draft **2 data ghosts** out of 3, then fight ICE daemons floor after floor.
- Damage carries over, with a 35% patch between fights. Every **5th floor is a Sysop**, which fully patches your crew when it goes down.
- **Every 3 wins** you draft one of three offers: recruit a ghost (up to 3), install chrome, overclock the crew (+4 levels) or a full patch.
- Daemons get stronger, more numerous and more chromed as you climb, and fight in random arenas. No items. RUN jacks out.
- You keep the Salvage (2 per floor, a bonus per draft, 10 per Sysop), and your best runs go on a high-score table on the terminal and your Linker card.
- Your real party, bag and dex are never touched.

**Link battles** (MENU › Link battle)
- Fight a friend's phone directly, with no server and no account.
- One of you **hosts** and gets a Link Code, about 250 characters. Copy it or share it through any chat app. The friend **joins** by pasting it and sends a reply code back. Paste that and the battle starts.
- **Same Wi-Fi** needs nothing else. **Different networks** asks a public STUN server (Google's) for each phone's outside address. It's opt-in and it's the game's only outside service.
- Some mobile carriers block direct connections entirely. Those would need a relay (TURN) server, which the game doesn't use, so on mobile data a link can fail. Same Wi-Fi is the reliable path.
- **Link rules:** copies of both parties at Lv 50, no items, no XP. Run forfeits. Your real bots are never touched, and wins and losses go on your Linker card.
- **Where it works:** the claude.ai viewer blocks peer-to-peer connections. Link battles work from the standalone `dist/robomon.html` (opened from a file or any web host) on both phones, and both need the same build.

**Map and options:** a minimap in the bottom-right corner marks Recharge Stations, NanoMarts, Grid Nodes, ripperdocs, bars, the Spire, exits, elevators, loot caches, items, Linkers you haven't beaten and bosses, each with its own symbol. MENU › Map opens the full map with a legend. MENU › Options covers music, sound effect and environment-sound volume, game speed (1x, 1.5x, 2x and 3x), text speed and size, the minimap and its size, rain and screen effects, and auto-save.

**Sound:** the score is an original synthwave soundtrack generated live in WebAudio, so there are no audio files and nothing to license. It has separate themes for towns, routes, the Gutter, the Spire, the Kernel, battles and Node Admins. Each area also gets an ambience bed: rain, city hum and far-off sirens, dripping pipes, server fans, or the Kernel drone.

Sound starts on your first tap anywhere on the page, since phones only allow audio after a gesture. It pauses when you switch apps or lock the screen and resumes when you come back, including after an iOS call or Siri. On iPhone, the ring/silent switch mutes web audio entirely: if the game is silent, flip it to ring. No web page can override that.

**Robots:** armored mechs with gunmetal plating, bevel highlights, jointed and digitigrade legs with pistons, shoulder pauldrons, neon accent strips, vents and status LEDs. Idle animations include weight shifts, servo twitches, head scans and exhaust puffs.

**Look and feel:** gritty neon noir. Every map bakes a lightmap, so neon light pools sit in heavy darkness, while signs and trim draw on top so they stay crisp. There is rain with splashes, wet streets with puddle reflections, steam vents, flickering holo signage, and mirrored reflections in battles. A scanline, vignette and grain pass can be switched off in Settings. Everything is procedural, with no image assets.

**Pixel art:** the overworld is built from 16px tiles and 16x32 character sprites from the open-source Tuxemon project, baked into Neo-Kairo's night palette by `tools/night.py` and lit by the game's own lightmaps, bloom and rain. Buildings are assembled from storefront and office styles with randomly lit windows; characters stand a tile wide and two tall. Sources and licences (CC-BY-SA, CC-BY, XYG) are in `assets/manifest.json`, with the full per-file list in `assets/src/tuxemon/ATTRIBUTIONS.md` and a running log in `assets/LOG.md`. The build now produces a folder: `dist/robomon.html` plus `dist/assets/night/`.

Since then the pixel art has gone further:
- **Battle art.** Robomon battle art is Openmon (CC0) and Tuxemon creatures rebuilt by `tools/cyberize.py` into three chassis classes. Robots are recast in steel, cyborgs are half plated, and wetware is flesh with neon circuitry under the skin. `assets/BESTIARY.md` holds the design rules and `assets/LOG-bestiary.png` the specimen plate.
- **Interiors.** Rooms use Tuxemon floors and set pieces, and the Recharge Station has a neon Capture Core set into its floor.
- **Streets.** About half the city blocks are Future City 27 storefronts. The rest of the street dressing is uploaded posters, cars and concrete grit.
- **Title screen.** The backdrop is AI-generated with Canva.

Every file, its source and its licence is in `assets/manifest.json`.

**Chassis classes.** Every species is a robot, a cyborg or wetware, and each class bends one battle system:
- **Robots** reboot breached sockets after 1 turn, but Infection eats 1/6 of their HP a turn.
- **Cyborgs** get +2 RAM, but their breaches last a turn longer.
- **Wetware** regrows 1/16 HP a turn, up to half its HP per battle, and can never redline.

The class shows in the summary and LinkDex.

**Move expansion.** 15 new moves, 70 in all, arrive in three waves:
- **Wave 1 fills thin types.** NANO gets Thorn Mesh, Graft Spike and Overgrowth. HYDRO and AERO get their first status moves (Short-Circuit Soak, Chaff Cloud). VIRUS, PSI, PLASMA and VOLT get Ransomware, Mind Leech, Thermite Lance and Capacitor Dump.
- **Wave 2 plays on the game's systems.** EMP Burst hits robots hardest and Bioweapon hunts wetware but can't touch robots. Socket Exploit doubles into a breached socket, and Redline Rush doubles while the user redlines.
- **Wave 3 adds two mechanics.** Flechette Swarm hits 2-5 times. Railgun charges for a turn, then fires automatically; a switch or a lost turn drops the charge.

Move descriptions show every effect.

**Streets and trees:**
- **Asphalt:** mottled, with aggregate, tar seams, patched repairs, manholes, storm drains, worn lane paint and oil sheen.
- **Sidewalks:** individual bevelled concrete slabs with cracks, moss in the seams, and curbs that drop shadows onto the road.
- **Walls:** the ground darkens where it meets a building.
- **Trees:** grow out of raised planters in three kinds: cyber palms with banded trunks and LED pods, bioluminescent canopy trees with glowing blossoms, and dead trees strung with fairy lights.
- **Cost:** all of it is baked once per map, so none of it costs anything per frame.

**Phase 3 juice:**
- **Bloom:** neon bleeds into the dark around signs, tubes and billboards.
- **Fog:** drifts in two parallax layers. The Gutter is soup, and the Kernel glows violet.
- **Cables:** power lines with hanging lamps slide past overhead faster than the street.
- **Ripples:** footsteps ring out across wet ground.
- **Bots in battle:** each one has a rim light. Hits knock it back and squash it on springs, and attackers recoil after a lunge. Under a quarter HP a bot trembles, sparks, smokes and pulses red.
- **Visor HUD:** chamfered plates tagged TGT, WILD or LINK, and target brackets that lock onto the foe. A **ghost HP bar** shows what a hit just took before draining away. A socket strip under each plate shows every chrome socket, flashing red and crossed out while breached, plus your RAM or REDLINE.
- **Glitches:** encounters, critical hits, shut-downs and socket breaches fire a short chromatic-aberration or CRT-tear burst, and the Kernel's signal stutters on its own.

Bloom, fog, ripples, glitch bursts and rain all switch off with Options › screen effects.

## Code map

Plain JavaScript with no dependencies. The scripts load in order from `index.html`; the only build step bundles them and copies the baked pixel art.

| File | What it owns |
| --- | --- |
| `js/data.js` | Types and the type chart, moves, species, learnsets, items, shop stock |
| `js/atlas.js` | Loads the baked pixel-art sheets and Robomon battle art, draws tiles and character frames; holds the art credits |
| `js/chrome.js` | Upgrade modules (slots, rarity, abilities, lore) and the loot roller |
| `js/scene.js` | Environment rendering: gritty tiles, holo signs, lightmaps with baked bloom, fog, cables, rain, cached battle backdrops |
| `js/post.js` | Glitch bursts over the whole frame: chromatic aberration and CRT tear |
| `js/minimap.js` | Minimap overlay and full-screen map with legend |
| `js/tutorial.js` | ECHO's one-time tutorial tips and the Codex lore entries |
| `js/maps.js` | Tile maps, warps, NPCs, trainers, items, signs, encounter tables |
| `js/sprites.js` | Draws Robomon from their pixel battle art, falling back to the procedural blueprint renderer (`SPECIES[*].bp`) |
| `tools/night.py`, `tools/cyberize.py`, `tools/facades.py`, `tools/grit.py` | Art pipeline (Python + PIL/numpy): night grade and glow layers; cyberized battle art and specimen plate; Future City storefront strip; concrete grit decals |
| `js/mon.js` | Robomon instances: stats, XP curve, moves, evolution checks |
| `js/engine.js` | Deterministic battle rules: seeded RNG, damage, turn order, status, chrome abilities, items, capture, CPU choices. Pure: no DOM, UI or sound |
| `js/battle.js` | Battle presenter: menus become engine actions, engine events become animation; XP, learning, drops, evolution scene |
| `js/world.js` | Overworld rendering, movement, trainer sight lines, warps, encounters |
| `js/story.js` | Scripted events (intro, starter pick, gyms, chapter ending) |
| `js/menus.js` | Party, summary, bag, LinkDex, shop, Cloud Box, settings |
| `js/deepnet.js` | The Deep Net arcade: floors, drafts and offers as pure functions of a run seed, plus the terminal UI |
| `js/link.js` | Link battles: Link Codes (compact WebRTC signaling), the data-channel pipe, team checks, the rules fingerprint and the handshake |
| `js/save.js` | Save versioning (`SAVE_VERSION`, `MIGRATIONS`) and storage: local plus a claude.ai cloud copy |
| `js/ui.js` / `js/audio.js` / `js/game.js` | Input and dialog, synth audio and mobile audio recovery, state and the main loop |

**Adding content** is mostly data work. To add a species, put a `SPECIES` entry and a `LEARN` line in `data.js`. To add an area, write a new map in `maps.js` and add warps to it from a neighboring map.

## Checks

```sh
node tools/validate.js            # data integrity (see below)
node tools/smoke.js               # plays the whole linear opening in a headless phone browser
node tools/fuzz.js 120 gutter:8:3 # random-input stress test from a mid-game save
node tools/sim.js                 # 500 seeded CPU-vs-CPU battles plus a balance report
node tools/scenarios.js           # scripted battles: every action, RAM rules, arenas, Resonance, HUD
node tools/perf.js                # frame cost of the heaviest scenes vs tools/perf-baseline.json
node tools/link.js                # two browsers link over real WebRTC: battles, forfeit, drop, desync
```

`smoke.js`, `scenarios.js`, `link.js`, `perf.js` and `fuzz.js` need Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).

`validate.js` checks:
- map sizes, warps, NPC placement, items, caches and signs
- species, move and module references, and boss and trainer teams, including the rival teams in `Story.teams` for every starter
- that every NPC bot's chrome fits its RAM budget (no NPC ever redlines)
- that every story script a map names exists
- that every story flag a map checks is actually set somewhere
- that every save in `tools/fixtures/` migrates to the current version, idempotently and without mutating the input, keeping the player's settings; and that a save from a newer build passes through untouched

`sim.js` runs battles through the engine alone, in Node. It also plays Deep Net runs with random and with sensible drafts, checking that floors and offers replay identically from the seed, that no daemon or chrome offer breaks RAM, and that difficulty keeps climbing so every run ends. Teams fill sockets at random within RAM plus Redline, battles get random arenas, and every fifth battle is a wild capture attempt. It also checks the rules directly: link odds must rise as HP falls and with faults and Resonance, redlined bots must stutter at about 15% and take heat burn, and breached sockets must come back on the right turn. It fails if a battle throws, runs past 300 turns, plays out differently when replayed from the same seed, or if the engine ever calls `Math.random`. It checks each chassis rule directly too. It then prints win rates by type, by module, by chassis, for redlined versus clean bots and for boosted types in their arena, plus link and breach counts. Read that report before tuning any battle number.

The flag check exists because an exit trigger once checked a `starter` flag that nothing set, which locked new players inside Low Town. Scripted tests that teleported past the gate never noticed. The smoke test now walks the real route instead.

Run them all after any change. Each catches a different class of bug: bad data and broken saves, broken story flow, runtime crashes, and battle rule regressions.

## Design notes

**Rendering on a budget.** The rule is to draw anything that doesn't change exactly once:
- **Battle backdrops** (sky, skyline, floor, their bloom), billboard ads, platform and HUD glows, the Kernel's code-rain glyphs and the fog texture are each baked into an offscreen canvas.
- **Each frame** adds only what moves.
- **Each bot** is drawn once per frame into its own buffer. That image is reused for the floor reflection, a half-size rim-light tint and the low-HP pulse, which halved the vector drawing in battles.
- **Bloom** is baked into the map lightmaps and battle backdrops instead of read back from the live frame, since copying the frame into small buffers every frame stalls phone GPUs.
- **Fog** is drawn into the low-res darkness layer, which is already stretched over the screen every frame, so it costs no extra full-screen pass.

`perf.js` measures the heaviest scenes, with effects on and off, against the pre-Phase-3 baseline. Every scene is within -17% to +12% of it. Headless Chromium rasterizes in software, so its absolute times (20 to 35 ms per frame) are far slower than a phone's GPU. The tool guards against regressions; it can't prove 60 fps on a specific phone. That still needs a real device.

**Rules and presentation are split.** `Engine.step(state, { me, foe })` takes one action per side and returns a plain JSON event log (`msg`, `anim`, `hp`, `status`, `faint`, `send`, `capture`, `end`). `battle.js` animates the log. Because all dice come from a Mulberry32 generator stored on the battle state, the same seed and the same actions always produce the same battle. That makes the balance simulator possible and is the base for lockstep link battles later. Chrome abilities are always checked through one `active()` hook, so later systems can switch a socket off.

**Link battles run in lockstep.** No battle state ever crosses the wire, only picks:
- **Canonical sides:** both games hold the same canonical battle (host = side `me`, guest = side `foe`, so the engine spends its dice in the same order on both), seeded by the host. The guest's screen flips the sides so their bots are in front, and battle text names both Linkers ("KAI's PYROCLAW") so it reads right from either side.
- **Each turn:** both players pick and swap the picks, and each game steps its own engine.
- **Desync guard:** every pick carries a hash of the sender's state. A mismatch, or a pick the sender couldn't legally make, ends the battle as a desync with no result. Received teams must be ones the game could have produced: real species, learnable moves, chrome within RAM plus Redline.
- **Version check:** before anything, the games compare a *rules fingerprint*, a hash of the type chart, species, learnsets, moves, chrome and the event log of a fixed "golden" battle. Two different builds refuse to link instead of desyncing mid-fight.
- **Testing:** `sim.js` replays link battles through two engines fed a JSON round trip. `link.js` connects two real browsers.

**The Deep Net is seeded.** A run is a seed. Floors, daemons, starting ghosts and every draft come from independent streams of it (`rngFor(seed, purpose, index)`), so the same run can be replayed, simulated and tuned. Daemons draw from species ranked by base-stat total, starting with the weaker end and widening as you climb, so floor 1 can't hand you a final-stage monster. In CPU-vs-CPU simulation runs clear a median of 4 floors, and about a third beat the first Sysop. A player who switches and reads matchups should go deeper.

**Saves are versioned.** Every save carries `v`. To change the save shape, bump `SAVE_VERSION` in `save.js`, add `MIGRATIONS[old]`, and add a fixture under `tools/fixtures/`. Local, cloud and hot-reload saves all pass through `Save.migrate` before the game sees them.

These are the ideas borrowed from similar games:
- **Medabots:** robots built from swappable parts, and you take parts from defeated opponents.
- **Robopon:** parts with limited space, where installed software changes what a bot can do.
- **Cassette Beasts:** sticker-style add-ons with rarity tiers and bonus attributes.
- **Cyberpunk 2077:** body-slot cyberware, color-coded rarity, and a ripperdoc who installs it.

Module names are genre homages rather than copied brand names.

## Next up

- Chapter 3: beyond the Null Wall, and Node Keys 3–8
- Nicknames, selling chrome
