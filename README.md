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

**Map and options:** a minimap in the bottom-right corner marks Recharge Stations, NanoMarts, Grid Nodes, ripperdocs, bars, the Spire, exits, elevators, loot caches, items, Linkers you haven't beaten and bosses, each with its own symbol. MENU › Map opens the full map with a legend. MENU › Options covers music, sound effect and environment-sound volume, game speed (1x, 1.5x, 2x and 3x), text speed and size, the minimap and its size, rain and screen effects, and auto-save.

**Sound:** the score is an original synthwave soundtrack generated live in WebAudio, so there are no audio files and nothing to license. It has separate themes for towns, routes, the Gutter, the Spire, the Kernel, battles and Node Admins. Each area also gets an ambience bed: rain, city hum and far-off sirens, dripping pipes, server fans, or the Kernel drone.

Sound starts on your first tap anywhere on the page, since phones only allow audio after a gesture. It pauses when you switch apps or lock the screen and resumes when you come back, including after an iOS call or Siri. On iPhone, the ring/silent switch mutes web audio entirely: if the game is silent, flip it to ring. No web page can override that.

**Robots:** armored mechs with gunmetal plating, bevel highlights, jointed and digitigrade legs with pistons, shoulder pauldrons, neon accent strips, vents and status LEDs. Idle animations include weight shifts, servo twitches, head scans and exhaust puffs.

**Look and feel:** gritty neon noir. Every map bakes a lightmap, so neon light pools sit in heavy darkness, while signs and trim draw on top so they stay crisp. There is rain with splashes, wet streets with puddle reflections, steam vents, flickering holo signage, and mirrored reflections in battles. A scanline, vignette and grain pass can be switched off in Settings. Everything is procedural, with no image assets.

## Code map

Plain JavaScript with no dependencies or build step. The scripts load in order from `index.html`.

| File | What it owns |
| --- | --- |
| `js/data.js` | Types and the type chart, moves, species, learnsets, items, shop stock |
| `js/chrome.js` | Upgrade modules (slots, rarity, abilities, lore) and the loot roller |
| `js/scene.js` | Environment rendering: gritty tiles, holo signs, lightmaps, rain, battle backdrops |
| `js/minimap.js` | Minimap overlay and full-screen map with legend |
| `js/tutorial.js` | ECHO's one-time tutorial tips and the Codex lore entries |
| `js/maps.js` | Tile maps, warps, NPCs, trainers, items, signs, encounter tables |
| `js/sprites.js` | Procedural renderer: Robomon are built from blueprint parts (`SPECIES[*].bp`) |
| `js/mon.js` | Robomon instances: stats, XP curve, moves, evolution checks |
| `js/engine.js` | Deterministic battle rules: seeded RNG, damage, turn order, status, chrome abilities, items, capture, CPU choices. Pure: no DOM, UI or sound |
| `js/battle.js` | Battle presenter: menus become engine actions, engine events become animation; XP, learning, drops, evolution scene |
| `js/world.js` | Overworld rendering, movement, trainer sight lines, warps, encounters |
| `js/story.js` | Scripted events (intro, starter pick, gyms, chapter ending) |
| `js/menus.js` | Party, summary, bag, LinkDex, shop, Cloud Box, settings |
| `js/save.js` | Save versioning (`SAVE_VERSION`, `MIGRATIONS`) and storage: local plus a claude.ai cloud copy |
| `js/ui.js` / `js/audio.js` / `js/game.js` | Input and dialog, synth audio and mobile audio recovery, state and the main loop |

**Adding content** is mostly data work. To add a species, put a `SPECIES` entry and a `LEARN` line in `data.js`. To add an area, write a new map in `maps.js` and add warps to it from a neighboring map.

## Checks

```sh
node tools/validate.js            # data integrity (see below)
node tools/smoke.js               # plays the whole linear opening in a headless phone browser
node tools/fuzz.js 120 gutter:8:3 # random-input stress test from a mid-game save
node tools/sim.js                 # 500 seeded CPU-vs-CPU battles plus a balance report
node tools/scenarios.js           # scripted battles: every action, RAM rules, arenas, Resonance
```

`smoke.js`, `scenarios.js` and `fuzz.js` need Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).

`validate.js` checks:
- map sizes, warps, NPC placement, items, caches and signs
- species, move and module references, and boss and trainer teams, including the rival teams in `Story.teams` for every starter
- that every NPC bot's chrome fits its RAM budget (no NPC ever redlines)
- that every story script a map names exists
- that every story flag a map checks is actually set somewhere
- that every save in `tools/fixtures/` migrates to the current version, idempotently and without mutating the input, keeping the player's settings; and that a save from a newer build passes through untouched

`sim.js` runs battles through the engine alone, in Node. Teams fill sockets at random within RAM plus Redline, battles get random arenas, and every fifth battle is a wild capture attempt. It also checks the rules directly: link odds must rise as HP falls and with faults and Resonance, redlined bots must stutter at about 15% and take heat burn, and breached sockets must come back on the right turn. It fails if a battle throws, runs past 300 turns, plays out differently when replayed from the same seed, or if the engine ever calls `Math.random`. It then prints win rates by type, by module, for redlined versus clean bots and for boosted types in their arena, plus link and breach counts. Read that report before tuning any battle number.

The flag check exists because an exit trigger once checked a `starter` flag that nothing set, which locked new players inside Low Town. Scripted tests that teleported past the gate never noticed. The smoke test now walks the real route instead.

Run them all after any change. Each catches a different class of bug: bad data and broken saves, broken story flow, runtime crashes, and battle rule regressions.

## Design notes

**Rules and presentation are split.** `Engine.step(state, { me, foe })` takes one action per side and returns a plain JSON event log (`msg`, `anim`, `hp`, `status`, `faint`, `send`, `capture`, `end`). `battle.js` animates the log. Because all dice come from a Mulberry32 generator stored on the battle state, the same seed and the same actions always produce the same battle. That makes the balance simulator possible and is the base for lockstep link battles later. Chrome abilities are always checked through one `active()` hook, so later systems can switch a socket off.

**Saves are versioned.** Every save carries `v`. To change the save shape, bump `SAVE_VERSION` in `save.js`, add `MIGRATIONS[old]`, and add a fixture under `tools/fixtures/`. Local, cloud and hot-reload saves all pass through `Save.migrate` before the game sees them.

These are the ideas borrowed from similar games:
- **Medabots:** robots built from swappable parts, and you take parts from defeated opponents.
- **Robopon:** parts with limited space, where installed software changes what a bot can do.
- **Cassette Beasts:** sticker-style add-ons with rarity tiers and bonus attributes.
- **Cyberpunk 2077:** body-slot cyberware, color-coded rarity, and a ripperdoc who installs it.

Module names are genre homages rather than copied brand names.

## Next up

- Chapter 3: beyond the Null Wall, and Node Keys 3–8
- Nicknames, selling chrome, module crafting/upgrades
- Link battles between two phones
