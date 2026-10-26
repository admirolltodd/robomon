# ROBOMON: Neon Circuit

A creature-collecting RPG for your phone. It plays like the classic monster-battling games, but it's set in a neon cyberpunk megacity, and the creatures are self-evolving robots.

> **NEO-KAIRO, 2189.** Twenty years ago the city's AI grid fractured, and machines everywhere woke up. They started to think, to bond and to evolve. People call them **Robomon**, and the ones who bond with them deepest are called **Linkers**. You're a new Linker from Low Town. The **Null Syndicate** is building **Protocol Zero**, a firmware push that would wipe every Robomon's free will.

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

## What's in the game

**Chapter 1: Neon Circuit**
- **Creatures:** 43 Robomon across 20 evolution lines, with **9 types**: Volt, Plasma, Hydro, Nano, Steel, Aero, Virus, Psi and Void. Each type has its own strengths, weaknesses and immunities.
- **Starters:** Cindrix (Plasma), Dripbot (Hydro) and Mossbit (Nano). Your rival Jax always picks the one that beats yours.
- **Battles:** status faults, stat stages, captures, XP, move learning and evolution scenes.
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
- Installed chrome **shows on the bot**: you can see the blades, fists, armor plates, missile pods, eye colors and core glow.
- Modules drop from loot caches (rolled by area tier), from wild bots (6%) and trainers (20%), and are guaranteed from Node Admins, rivals and bosses. Doc Rivka also sells them.

**Map and options:** a minimap in the bottom-right corner marks Recharge Stations, NanoMarts, Grid Nodes, ripperdocs, bars, the Spire, exits, elevators, loot caches, items, Linkers you haven't beaten and bosses, each with its own symbol. MENU › Map opens the full map with a legend. MENU › Options covers music, sound effect and environment-sound volume, game speed (1x, 1.5x, 2x and 3x), text speed and size, the minimap and its size, rain and screen effects, and auto-save.

**Sound:** the score is an original synthwave soundtrack generated live in WebAudio, so there are no audio files and nothing to license. It has separate themes for towns, routes, the Gutter, the Spire, the Kernel, battles and Node Admins. Each area also gets an ambience bed: rain, city hum and far-off sirens, dripping pipes, server fans, or the Kernel drone.

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
| `js/maps.js` | Tile maps, warps, NPCs, trainers, items, signs, encounter tables |
| `js/sprites.js` | Procedural renderer: Robomon are built from blueprint parts (`SPECIES[*].bp`) |
| `js/mon.js` | Robomon instances: stats, XP curve, moves, evolution checks |
| `js/battle.js` | Turn engine, damage formula, AI, capture, XP, evolution scene |
| `js/world.js` | Overworld rendering, movement, trainer sight lines, warps, encounters |
| `js/story.js` | Scripted events (intro, starter pick, gyms, chapter ending) |
| `js/menus.js` | Party, summary, bag, LinkDex, shop, Cloud Box, settings |
| `js/ui.js` / `js/audio.js` / `js/game.js` | Input and dialog, synth audio, state, saving and the main loop |

**Adding content** is mostly data work. To add a species, put a `SPECIES` entry and a `LEARN` line in `data.js`. To add an area, write a new map in `maps.js` and add warps to it from a neighboring map.

## Checks

```sh
node tools/validate.js   # data integrity: map sizes, warps, NPC placement, move/species references
node tools/smoke.js      # browser playthrough of the opening (needs Playwright + Chromium)
```

Run both after any content change. `validate.js` catches broken warps and typos in IDs. `smoke.js` catches runtime errors and broken story flags.

## Design notes

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
