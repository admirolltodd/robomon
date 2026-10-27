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

**Not done yet.** Interiors (walls, floors, furniture) still use the procedural tiles. Named characters share stock sprites (Nova is the capped adventurer). Monsters are untouched.
