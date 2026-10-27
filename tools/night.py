#!/usr/bin/env python3
"""Bakes the imported daytime sheets into Neo-Kairo's night palette.

    python3 tools/night.py            # assets/... -> assets/night, per assets/manifest.json

Grades:
  night  scenery: darker, colder, slightly desaturated, hue nudged toward blue. Bright window
         and lamp pixels are also written to a second <id>.emit.png so the game can draw them on
         its emissive layer, where the lightmap and bloom make them glow.
  mild   characters: a little darker and cooler, so they sit in the scene but stay readable.
  none   untouched.
Problems (missing files, bad crops) are listed at the end and the exit code is non-zero.
"""
import colorsys, json, os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC, OUT = os.path.join(ROOT, 'assets'), os.path.join(ROOT, 'assets', 'night')
errors = []

def grade_pixel(r, g, b, mode):
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    if mode == 'night':
        # pull hue toward 0.64 (blue-violet) the shorter way round, more for greys than for strong colors
        pull = .35 * (1 - s * .6)
        d = ((.64 - h + .5) % 1) - .5
        h = (h + d * pull) % 1
        s = min(1, s * .85 + .08)
        v = v * .58 + .03
    else:
        pull = .15 * (1 - s)
        d = ((.64 - h + .5) % 1) - .5
        h = (h + d * pull) % 1
        v = v * .82
    r, g, b = colorsys.hsv_to_rgb(h, s, v)
    return int(r * 255), int(g * 255), int(b * 255)

def is_light(r, g, b):
    """Window glass, lamps and screens: bright and either blue-ish or warm."""
    h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return v > .62 and s > .25 and (.5 < h < .68 or h < .17 or h > .9)

def bake(src, dst, mode, crop=None, emit=None):
    im = Image.open(src).convert('RGBA')
    if crop:
        x, y, w, h = crop
        if x + w > im.width or y + h > im.height: errors.append(f'{src}: crop {crop} outside {im.size}'); return
        im = im.crop((x, y, x + w, y + h))
    px = im.load()
    em = Image.new('RGBA', im.size, (0, 0, 0, 0)) if emit else None
    ep = em.load() if em else None
    cache = {}
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            if em and is_light(r, g, b):
                ep[x, y] = (r, g, b, a)
            key = (r, g, b)
            if key not in cache: cache[key] = grade_pixel(r, g, b, mode)
            nr, ng, nb = cache[key]
            px[x, y] = (nr, ng, nb, a)
    im.save(dst, optimize=True)
    if em: em.save(emit, optimize=True)

def main():
    m = json.load(open(os.path.join(ROOT, 'assets', 'manifest.json')))
    os.makedirs(OUT, exist_ok=True)
    n = 0
    for s in m['sheets']:
        src = os.path.join(SRC, s['file'])
        if not os.path.exists(src): errors.append(f'missing {src}'); continue
        bake(src, os.path.join(OUT, s['id'] + '.png'), s.get('grade', 'night'), s.get('crop'), os.path.join(OUT, s['id'] + '.emit.png') if s.get('emit') else None)
        n += 1
    gba = m['npcs'].get('gba', {}).get('sheets', {})
    for name in m['npcs']['names']:
        if name in gba:  # GBACOP: columns are directions, rows are frames. Rearrange to the Tuxemon layout.
            src = os.path.join(SRC, gba[name])
            if not os.path.exists(src): errors.append(f'missing {src}'); continue
            g = Image.open(src).convert('RGBA')
            if g.size != (64, 96): errors.append(f'{src}: expected 64x96, got {g.size}'); continue
            out = Image.new('RGBA', (48, 128))
            for row, col in enumerate((0, 2, 3, 1)):          # down, left, right, up
                for c, frame in enumerate((1, 0, 2)):         # step, stand, step
                    out.paste(g.crop((col * 16, frame * 32, col * 16 + 16, frame * 32 + 32)), (c * 16, row * 32))
            tmp = os.path.join(OUT, f'npc_{name}.png'); out.save(tmp)
            bake(tmp, tmp, m['npcs'].get('grade', 'mild')); n += 1
            continue
        src = os.path.join(SRC, 'src', 'tuxemon', f'npc_{name}.png')
        if not os.path.exists(src): errors.append(f'missing {src}'); continue
        bake(src, os.path.join(OUT, f'npc_{name}.png'), m['npcs'].get('grade', 'mild'))
        n += 1
    if errors:
        print('\n'.join('✗ ' + e for e in errors), file=sys.stderr); sys.exit(1)
    print(f'✓ baked {n} sheets into assets/night')

if __name__ == '__main__': main()
