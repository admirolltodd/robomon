# Art overhaul log

Step-by-step record of the pixel-art overhaul: what came in, from where, what broke, what was decided.

## Step 1 · pipeline, outdoor tiles, characters (2026-10-27)

**Sourcing.** Every asset storefront (opengameart.org, itch.io, kenney.nl, archive.org) is blocked from the build environment; only raw files on GitHub are reachable. The Tuxemon project (GitHub, open-source Pokémon-like) supplied everything in this step. Licences are per file in `assets/src/tuxemon/ATTRIBUTIONS.md`; the summary lives in `assets/manifest.json` and the in-game credits in `js/atlas.js`.

**Imported.** 7 tile sheets (outdoor, buildings, water, set pieces, office interiors, indoor walls, indoor floors) and 26 overworld character walk sheets. Total source 936 KB, baked night versions 657 KB.

**Pipeline.** `tools/night.py` bakes `assets/src` into `assets/night` (darker, colder, hue pulled toward blue; characters graded more gently) and splits bright window/lamp pixels into `<sheet>.emit.png` so they glow on the emissive layer. `js/atlas.js` loads the sheets and draws 16px cells at 2x (one world tile), and 16x32 character frames as 32x64. The build copies `assets/night` next to `dist/robomon.html`; the game no longer fits in one file.

**In the world now.** Storefronts and office blocks (five styles, bottom-aligned on the door row, flat roofs above, 60% of windows lit at random), water, round street lamps, pixel trees (narrow, pine, palm, and paired 2x2 canopies with bioluminescent flecks), and pixel characters for the player and every human NPC. The procedural asphalt and pavement are now drawn at half resolution and upscaled so their detail sits on the same 2px grid.

**Problems hit.**
- Tuxemon's overworld walk sheets are not under `gfx/sprites/player` (those are the battle back-sprites); they live at `mods/tuxemon/sprites/<name>.png`. Found by reading `tuxemon/entity/appearance.py`.
- First tree and lamp cell coordinates were one column off (the zoom inspector labelled a crop that did not start on a cell boundary). Fixed by re-reading the sheet at a cell-aligned crop.
- A canvas that has drawn a `file://` image is tainted (no pixel readback). Nothing in the game reads pixels back, so the dist works from a file, but the night grade had to move to build time (Python) instead of runtime.
- The first night grade (value x0.5) made foliage too dark to read; raised to x0.58.

**Not done yet (at the end of step 1).** Interiors (walls, floors, furniture) still used the procedural tiles. Named characters shared stock sprites. Monsters were untouched. Steps 2 to 6 below cover all three.


## Step 2 · your uploads, merged and surveyed (2026-10-27)

You pushed 171 files into `assets/` in four commits. They were merged with step 1 as a merge commit, so nothing was rebased.

`assets/file.exe` holds a single newline byte. Nothing was executed. It is left in place because it is yours, but nothing uses it, so delete it whenever you like.

Each image was rated by function and by how well it fits Neo-Kairo:

| Upload | Verdict | Used for |
| --- | --- | --- |
| OpenmonSprites1, Openmon-Set-6 | Excellent. CC0 fakemon (Screen Smith), 64px battle sprites | 35 of the 43 Robomon |
| future_city_27_gritty | Excellent. CC0 cyberpunk city (knekko) | About half the storefronts |
| Pal1-3 (GBACOP pack) | Very good. GBA 16x32 walkers (helygp9), credit optional | 10 townsfolk |
| void-tiles | Good. Monochrome posters, graffiti and fences; source unknown | Flyposters on building walls |
| cars.png | Good. Tiny top-down cars; source unknown | Dead cars in the Gutter and Plaza |
| concrete-n-* photos | Good as decals; too big and photographic as tiles | Crack, stain and blood decals on pavement |
| future_city_27, future_city_27_slum | Duplicates of the gritty set | Not used; gritty fits the night palette best |
| scifi_sheet | Good sci-fi floors, but a 24px grid | Not used; Tuxemon floors already cover the interiors on the 16px grid |
| OpenmonItemIcons | Very good item icons | Not used yet. Bag icons are the next obvious job |
| Beatle, Wolf, Snake (+ attacks) | Good animated 16px critters (Electric Lemon licence: use in games, no redistribution) | Not used yet. Visible wild critters on the overworld would suit them |
| neon_ui_basic | Nice teal UI kit | Not used; the HUD and menus already have their own neon frames |
| punyworld, tilemap, alley-tiles, characters, Pallete, Pal0, GBACOP cover | Rural or bright fantasy palettes, palette swatches, or a cover image | Not used |
| weave-*, pattern-*, etched crystal, dirt, rock, road, zion | 1000px photographic or abstract textures | Not used. Candidates for Deep Net or battle backdrops later |
| License - No Attribution Required.txt | Electric Lemon Games licence (covers the critters) | Kept with them |

## Step 3 · cyberpunk Robomon and the three chassis (2026-10-27)

`tools/cyberize.py` rebuilds each source creature for its class:
- **Robots** get a steel ramp, panel seams kept off the face, and rivets.
- **Cyborgs** get a plated rear half, a lit stepped seam and surgical staples.
- **Wetware** keeps its flesh, darkened, with neon traces under the skin and steel implant ports.

All three classes also get a type-coloured rim light, accents turned into lights, and a separate glow layer that breathes in battle. Openmon art is front-only, so its back view is the mirrored front. Tuxemon sheets carry real back views.

| Source | Robomon |
| --- | --- |
| Tuxemon agnite, agnigon, agnidon | The Cindrix line |
| Tuxemon av8r | Dronelet |
| Tuxemon botbot, arthrobolt | Sentrybit, Wardencore |
| Tuxemon cateye, criniotherme | Nullcat, Shadowlynx |
| Openmon | Everything else |

The full mapping is in `assets/manifest.json`.

**Rules and balance.** `tools/sim.js` checks each rule and reports win rate by chassis. A/B test over 3000 battles, chassis rules off versus on:

| Chassis | Rules off | Rules on |
| --- | --- | --- |
| Robot | 55.5% | 54.4% |
| Cyborg | 49.9% | 50.4% |
| Wetware | 44.8% | 45.1% |

The rules are close to neutral. The remaining gap is the roster: the NANO line is all wetware and NANO wins 35%. That predates this work.

**Problems hit.**
- **Stalemates.** Uncapped wetware regrowth made NANO-on-NANO mirrors run to 190 turns, and 1/12 regrowth hit the 300-turn cap. Fix: regrowth is limited to half the bot's HP per battle. The longest battle is now 86 turns, against 87 before chassis existed.
- **Tests on stale assumptions.** The sim and scenario tests assumed Pyroclaw has 6 RAM; as a cyborg it now has 8. They now use a robot.
- **A test bug of my own.** The new sim check built a bot after `Math.random` was locked. Fixed.
- **Seams through faces.** The first robot seams were full-width crosses that ran through faces, and the wetware veins were too faint to read. Seams now stop below the head and veins have a dark halo.

## Step 4 · characters (2026-10-27)

- **Bug fixed from step 1.** Tuxemon walk sheets are front/left/right/back, and the atlas had left and right swapped, so sideways walkers faced backwards.
- **GBACOP townsfolk.** The GBACOP sheets lay their directions out as columns. `tools/night.py` rearranges them into the Tuxemon layout. They and the six unused Tuxemon walkers give 15 repeat NPCs their own faces.
- **Battle intro.** It now shows the Tuxemon adventurer's over-the-shoulder back sprite for you. Deep Net daemons show the Tuxemon alien and link rivals show the adventurer's front view.

## Step 5 · interiors (2026-10-27)

Every room has a `decor` style. Floors come from the Tuxemon floors sheet and the top wall from its walls sheet. Furniture comes from Tuxemon's compiled set pieces (`core_set_pieces`, which contains the electronics, factory, city-tile, plants and George furniture sheets):
- heal machine
- glass counters
- PC desks
- terminals
- bottle shelves
- palms
- kitchenette

The Recharge Station has the neon Capture Core floor emblem and RECHARGE and NANOMART wall signs. The walls sheet is RPG-Maker-style autotile rooms, so only one plain panel cell is used. Side walls stay procedural.

## Step 6 · streets, AI art, philosophy (2026-10-27)

**Streets.**
- `tools/facades.py` cuts the 12 Future City 27 buildings into an aligned strip. They are placed off the 16px grid on the sheet, so the boxes come from its connected regions, split where buildings touch.
- Tuxemon glass sliding doors sit in their doorways.
- Spire elevators are Tuxemon neon portal rings.
- Road barriers use the Tuxemon city barricade.
- George's slim tree joins the tree mix.
- The Tuxemon black car parks in junk lots, drawn 1:1 because it is two tiles wide at 2x. That is the one place the pixel density differs.

**AI art.** The title backdrop was generated with Canva's AI image generator. The tool returned a 112x199 preview, so it is quantised to 32 colours and shown as chunky pixels on purpose.

**Philosophy.** The canvas-design method produced `assets/BESTIARY.md` ("Grafted Light"), the rules `tools/cyberize.py` follows. `cyberize.py --plate` sets the specimen plate in Geist Mono and Jura (OFL, `assets/src/fonts`).

**Tuxemon files from the first search, and where each went:**

| Tuxemon file | Use |
| --- | --- |
| core_outdoor, core_buildings, water | Ground, buildings, water |
| Set_Pieces | Lamps |
| Office_interiors | Loaded, but its cells are covered by core_set_pieces |
| core_indoor_walls, core_indoor_floors | Interiors |
| 26 walkers | NPCs |
| core_set_pieces | Furniture |
| doors | Glass doors, portal elevators |
| Vegetation (George) | Trees |
| Car (Isaiah658) | Parked car |
| adventurer.png | Hero back sprite, link rivals |
| alien.png | Deep Net daemons |
| arthrobolt, av8r | Sentrybit line, Dronelet |

KelvinShadewing_Buildings, Outdoor_Tiles (City and Country), core_city_and_country, core_outdoor_nature, Furniture_and_Fittings, electronics, factory, city_tiles and signs are kept in `assets/src/tuxemon/extra` as provenance. Their art reaches the game through the compiled sheets above, except signs, core_city_and_country and core_outdoor_nature, which are not drawn anywhere yet.


## Step 7 · move expansion (2026-10-27)

There are 15 new moves, 70 in all. The data lives in `js/data.js`; the rules live in `js/engine.js`, so link battles stay in lockstep without changes. The new move fields are:
- `vs`: damage by the target's chassis.
- `boost`: double power into a breached target, or while the user redlines.
- `hits`: multi-hit, with crit and damage rolled per hit.
- `charge`: the user charges one turn, then the engine forces the shot. The battle UI skips the menu on the firing turn.

The CPU scores all four fields.

**Checks.** `tools/sim.js` verifies each mechanic directly:
- EMP Burst out-hits Thunder Coil on a robot.
- Bioweapon can't touch robots.
- Socket Exploit and Redline Rush roughly double.
- Flechette Swarm lands 2, 3, 4 and 5 hits.
- Railgun charges, fires for one energy point, and drops its charge on a switch.

The sim also reports win rate by new move. A browser run through the real battle UI confirms Railgun skips the menu on firing turns: 3 charges and 3 shots took 4 menus.

**Balance, 3000 battles:**

| Measure | Before | After |
| --- | --- | --- |
| NANO win rate | 35% | 42% |
| Longest battle | 87 turns | 74 turns |

Chassis rates barely moved: robot 54%, cyborg 51%, wetware 45%.

The tuning went like this:
- Short-Circuit Soak's paralysis chance went from 30% to 20%.
- Ransomware's accuracy went from 85 to 90.
- Capacitor Dump's recoil went from 33% to 25%.

The win-rate-by-move table barely moved after that, which shows it mostly measures who learns a move, not the move itself. Overgrowth sits last because only the weak NANO line learns it, and because the CPU plays setup moves poorly. A fair per-move test would be an A/B run per move.

**Problems hit.**
- The new learnsets changed which four moves the test bots knew at their levels, which broke the sim's redline check and the Kernel scenario. Both now pin their test bot's moves.
- My first Railgun check asserted on the foe's HP, which something unrelated changed. It now asserts that the charge turn doesn't fire.
