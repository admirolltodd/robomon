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

## What's in Chapter 1

- **30 Robomon** across 13 evolution lines, with **9 types**: Volt, Plasma, Hydro, Nano, Steel, Aero, Virus, Psi and Void. Each type has its own strengths, weaknesses and immunities. For example, Virus can't infect Steel and Psi can't touch Void.
- **3 starters:** Cindrix (Plasma), Dripbot (Hydro) and Mossbit (Nano). Your rival Jax always picks the one that beats yours.
- **44 moves** with status faults (Overheated, Shorted, Infected, Standby), stat boosts and drops, priority, draining, recoil and critical hits.
- **Wild encounters** in the glitching "static", **capture** with Capture and Hyper Cores (a shake-check formula), XP sharing, level-ups, learning moves, and **evolution** scenes.
- **Trainers** who spot you along their line of sight, **2 Grid Nodes** (gyms) with Admin battles and Node Keys, Syndicate grunts, and 2 rival battles.
- **Items and shops:** NanoMart stock unlocks with your badges. There are Recharge Stations, a Cloud Box for storing bots, a LinkDex, a Linker card and settings.
- **Locations:** Low Town → Route 1 (Static Alley) → Chrome City → Route 2 (Neon Canal) → Pulse District.
- **Art and sound:** procedural neon vector art for every creature (no image assets), plus a WebAudio chiptune soundtrack and sound effects.

## Code map

Plain JavaScript with no dependencies or build step. The scripts load in order from `index.html`.

| File | What it owns |
| --- | --- |
| `js/data.js` | Types and the type chart, moves, species, learnsets, items, shop stock |
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

## Next up

- Chapter 2: the Syndicate Spire, Node Keys 3–8, and the legendary OMNIKERNEL
- Nicknames, held items, selling at the NanoMart, and more routes
- Link battles between two phones
