#!/usr/bin/env python3
"""Turns borrowed creature art into Neo-Kairo's chassis classes.

    python3 tools/cyberize.py            # per assets/manifest.json "monsters" -> assets/night/mon_<species>.png
    python3 tools/cyberize.py --plate    # also writes assets/LOG-bestiary.png, every result side by side

Each output is 256x64: front | back | front glow | back glow. Sprites are re-seated so their feet
sit on row 62 and they are centred, so the game can anchor every species the same way. The glow
cells hold only the lit pixels (neon seams, veins, eyes), which the battle scene adds on top with
a blur for bloom.

Classes (the rules live in docs/BESTIARY.md, the philosophy behind them):
  robot    the creature recast in steel: luminance mapped onto a cool steel ramp, panel seams with
           a bevel, rivets. Its own bright accents become running lights.
  cyborg   half and half: the rear of the body is plated, joined to the flesh by a lit seam and
           surgical staples. An implant eye if the art has no accent to light.
  wetware  flesh kept, darkened and fevered toward its type colour, with neon circuit veins under
           the skin and steel implant ports.
All of them get a rim light in their primary type colour on the side facing the city, and grit.
Deterministic: the same manifest always gives the same pixels (seeded by species name).
Problems are listed at the end and the exit code is non-zero.
"""
import colorsys, hashlib, json, os, subprocess, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ASSETS = os.path.join(ROOT, 'assets')
OUT = os.path.join(ASSETS, 'night')
errors = []

TYPE_C = {'VOLT': '#ffe14d', 'PLASMA': '#ff6a3d', 'HYDRO': '#3d8bff', 'NANO': '#2ee6a0', 'STEEL': '#a9b8d6',
          'AERO': '#6ff3ff', 'VIRUS': '#c6ff2e', 'PSI': '#ff4fd8', 'VOID': '#9b6bff'}
STEEL = np.array([[18, 21, 30], [38, 44, 58], [64, 74, 92], [100, 113, 136], [148, 162, 184], [206, 216, 232]], float)

def rgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float)

class Rng:  # tiny deterministic generator so results never depend on Python's hash seed
    def __init__(self, s): self.s = int(hashlib.md5(s.encode()).hexdigest()[:8], 16) or 1
    def __call__(self):
        self.s = (self.s * 1103515245 + 12345) & 0x7fffffff
        return self.s / 0x7fffffff

def seat(im):
    """Moves the sprite so its bounding box is centred and its lowest pixel is on row 62."""
    a = np.array(im)
    ys, xs = np.nonzero(a[:, :, 3] > 0)
    if not len(ys): return None
    out = np.zeros_like(a)
    dy, dx = 62 - ys.max(), 32 - (xs.min() + xs.max() + 1) // 2
    for y, x in zip(ys, xs):
        ny, nx = y + dy, x + dx
        if 0 <= ny < 64 and 0 <= nx < 64: out[ny, nx] = a[y, x]
    return out

def lum(c): return (.3 * c[..., 0] + .59 * c[..., 1] + .11 * c[..., 2]) / 255

def steel_ramp(L, tint, k=.14):
    i = np.clip((L * (len(STEEL) - 1) + .5).astype(int), 0, len(STEEL) - 1)
    return STEEL[i] * (1 - k) + tint * k

def cyberize(a, cls, c1, c2, rng, glow):
    """a: 64x64x4 uint8 (seated). Returns new array; lit pixels are also written into glow."""
    a = a.astype(float)
    m = a[:, :, 3] > 127
    a[:, :, 3] = np.where(m, 255, 0)
    col = a[:, :, :3]
    H, W = m.shape
    pad = np.pad(m, 1)
    edge = m & ~(pad[:-2, 1:-1] & pad[2:, 1:-1] & pad[1:-1, :-2] & pad[1:-1, 2:])
    inner = m & ~edge
    p2 = np.pad(inner, 1)
    deep = inner & p2[:-2, 1:-1] & p2[2:, 1:-1] & p2[1:-1, :-2] & p2[1:-1, 2:]  # 2px from the outline
    ys, xs = np.nonzero(m)
    top, bot, left, right = ys.min(), ys.max(), xs.min(), xs.max()
    cx, h = (left + right) / 2, bot - top + 1

    # Accents: saturated, bright colours that cover little of the body (eyes, gems, markings).
    hsv = np.zeros((H, W, 3))
    for y, x in zip(ys, xs): hsv[y, x] = colorsys.rgb_to_hsv(*(col[y, x] / 255))
    sat = m & (hsv[:, :, 1] > .42) & (hsv[:, :, 2] > .45)
    bins = (hsv[:, :, 0] * 12).astype(int) % 12
    accent = np.zeros_like(m)
    for b in range(12):
        sel = sat & (bins == b)
        if 0 < sel.sum() < .07 * m.sum(): accent |= sel
    accent &= ~edge

    L = lum(col)
    lo, hi = np.percentile(L[m], 5), np.percentile(L[m], 95)
    Ln = np.clip((L - lo) / max(.05, hi - lo), 0, 1)
    out = col.copy()
    lit = np.zeros_like(m)

    def plate(sel, seams=True):
        out[sel] = steel_ramp(Ln[sel], c1, .22)
        if not seams: return
        # Panel lines below the head only, broken into short runs, with a lit bevel under each.
        head = top + h * .34
        rows = [int(top + h * f) for f in (.45 + rng() * .08, .68 + rng() * .1)]
        for y in rows:
            run = 0
            for x in range(W):
                run = run + 1 if sel[y, x] and deep[y, x] else 0
                if run and (run + int(rng() * 3)) % 9 < 6:
                    out[y, x] = STEEL[0]
                    if y + 1 < H and sel[y + 1, x]: out[y + 1, x] = np.minimum(out[y + 1, x] + 30, 255)
        vcol = int(cx + (rng() - .5) * 12)
        for y in range(max(rows[0], int(head)), rows[1]):
            if sel[y, vcol] and deep[y, vcol]: out[y, vcol] = STEEL[0]
        for _ in range(6):  # rivets beside the seams
            y, x = rows[int(rng() * 2)] + (2 if rng() < .5 else -2), int(left + rng() * (right - left))
            if 0 <= y < H and sel[y, x] and deep[y, x]: out[y, x] = STEEL[5]

    def light(y, x, c):
        out[y, x] = c; lit[y, x] = True

    def grit(sel, dark=.86, desat=.8, tint=.1):
        g = out[sel]
        mean = g.mean(axis=1, keepdims=True)
        g = mean + (g - mean) * desat
        out[sel] = np.clip((g * (1 - tint) + c1 * tint) * dark, 0, 255)

    def eye_if_missing():
        if (accent & (np.arange(H)[:, None] < top + h * .5)).any(): return
        y = int(top + h * .26)
        row = np.nonzero(m[y])[0]
        if len(row) < 6: return
        x = row.min() + 3  # sprites face left: the eye goes near the front of the head
        for dx in (0, 1):
            if inner[y, x + dx]: light(y, x + dx, np.minimum(c2 * .6 + 255 * .4, 255))

    if cls == 'robot':
        plate(m & ~accent)
        for y, x in zip(*np.nonzero(accent)): light(y, x, np.minimum(c2 * .7 + 255 * .3, 255))
        eye_if_missing()
    elif cls == 'cyborg':
        tilt = (rng() - .5) * .6
        cut = np.zeros_like(m)
        for y in range(H):
            off = cx + 1 + tilt * (y - top) + (2 if (y // 3) % 2 else 0)  # stepped, surgical edge
            cut[y, :] = np.arange(W) > off
        metal = m & cut & ~accent
        grit(m & ~metal)
        plate(metal)
        mp = np.pad(metal, 1)
        seam = (m & ~metal) & (mp[1:-1, 2:] | mp[:-2, 1:-1] | mp[2:, 1:-1])
        for i, (y, x) in enumerate(zip(*np.nonzero(seam))):
            if edge[y, x]: continue
            light(y, x, c2)
            if i % 3 == 0 and x - 2 >= 0 and inner[y, x - 2]: out[y, x - 2] = STEEL[4]  # staples
        for y, x in zip(*np.nonzero(accent)): light(y, x, np.minimum(c1 * .6 + 255 * .4, 255))
        eye_if_missing()
    else:  # wetware
        grit(m, dark=.8, desat=.85, tint=.16)
        for y, x in zip(*np.nonzero(accent)): light(y, x, np.minimum(c1 * .55 + 255 * .45, 255))
        cand = list(zip(*np.nonzero(deep)))
        for v in range(4):  # circuit veins: straight runs with right-angle turns, ending in a node
            if not cand: break
            y, x = cand[int(rng() * len(cand))]
            d = [(0, 1), (1, 0), (0, -1), (-1, 0)][int(rng() * 4)]
            vc = np.minimum((c2 if v % 2 else c1) * .75 + 255 * .25, 255)
            for _ in range(6):
                for _ in range(3 + int(rng() * 5)):
                    if not deep[y, x]: break
                    for oy, ox in ((0, 1), (1, 0)):
                        if deep[y + oy, x + ox] and not lit[y + oy, x + ox]: out[y + oy, x + ox] = out[y + oy, x + ox] * .55
                    light(y, x, vc)
                    y, x = y + d[0], x + d[1]
                    if not (0 <= y < H and 0 <= x < W): y, x = y - d[0], x - d[1]; break
                d = (d[1], d[0]) if rng() < .5 else (-d[1], -d[0])
            if deep[y, x]: light(y, x, np.full(3, 250.))
        for _ in range(2):  # implant ports
            if not cand: break
            y, x = cand[int(rng() * len(cand))]
            if y + 1 < H and x + 1 < W and deep[y + 1, x + 1]:
                out[y, x] = out[y, x + 1] = out[y + 1, x] = STEEL[3]
                light(y + 1, x + 1, c2)

    # Neon rim light from the left (the street side) and a cold top light.
    for y, x in zip(*np.nonzero(edge)):
        if lit[y, x]: continue
        if x == 0 or not m[y, x - 1]: out[y, x] = np.minimum(out[y, x] * .35 + c1 * .75, 255)
        elif y == 0 or not m[y - 1, x]: out[y, x] = np.minimum(out[y, x] * .7 + np.array([120, 130, 170.]) * .3, 255)
    for y, x in zip(*np.nonzero(lit)):
        glow[y, x, :3] = out[y, x]; glow[y, x, 3] = 255
    res = np.dstack([out, a[:, :, 3]])
    return np.clip(res, 0, 255).astype(np.uint8)

def source_cells(spec, sources):
    s = sources.get(spec['src'])
    if not s: errors.append(f"unknown source {spec['src']}"); return None, None
    p = os.path.join(ASSETS, s['file'])
    if not os.path.exists(p): errors.append(f'missing {p}'); return None, None
    im = Image.open(p).convert('RGBA')
    if s.get('layout') == 'tuxemon':
        return im.crop((0, 0, 64, 64)), im.crop((64, 0, 128, 64))
    c, r = spec['cell']
    front = im.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64))
    return front, None  # front-only art: the back is made from the front

def species():
    """Types and chassis class come from js/data.js, the one place the game defines them."""
    js = "const fs=require('fs');eval(fs.readFileSync('js/data.js','utf8')+';global.S=SPECIES');" \
         "console.log(JSON.stringify(Object.fromEntries(Object.entries(S).map(([k,v])=>[k,{types:v.t,class:v.cls}]))))"
    return json.loads(subprocess.run(['node', '-e', js], cwd=ROOT, capture_output=True, text=True, check=True).stdout)

def specimen_plate(plate, data):
    """The bestiary as a specimen sheet (see assets/BESTIARY.md): every graft catalogued, front view
    at 3x on a dark field, numbered, named, with its chassis marked in the class colour."""
    from PIL import ImageDraw, ImageFont
    fonts = os.path.join(ASSETS, 'src', 'fonts')
    mono = ImageFont.truetype(os.path.join(fonts, 'GeistMono-Regular.ttf'), 13)
    small = ImageFont.truetype(os.path.join(fonts, 'GeistMono-Regular.ttf'), 11)
    head = ImageFont.truetype(os.path.join(fonts, 'Jura-Light.ttf'), 44)
    CLS = {'robot': (169, 184, 214), 'cyborg': (255, 106, 61), 'wetware': (198, 255, 46)}
    cols, cw, chh, M, top = 8, 232, 262, 56, 150
    rows = (len(plate) + cols - 1) // cols
    W, H = M * 2 + cols * cw, top + rows * chh + 70
    P = Image.new('RGBA', (W, H), (9, 8, 15, 255)); d = ImageDraw.Draw(P)
    d.text((M, 46), 'GRAFTED LIGHT', font=head, fill=(236, 232, 248))
    d.text((M, 104), f'SPECIMEN PLATE · {len(plate)} ROBOMON · ROBOT / CYBORG / WETWARE · FRONT VIEW 3:1', font=small, fill=(130, 124, 150))
    for i, (sp, g) in enumerate(plate):
        x, y = M + (i % cols) * cw, top + (i // cols) * chh
        cls = data[sp]['class']; c = CLS[cls]
        d.rectangle([x + 6, y + 6, x + cw - 6, y + chh - 6], outline=(34, 31, 48))
        d.line([x + 6, y + 6, x + 30, y + 6], fill=c, width=2)
        spr = Image.fromarray(g[:, 0:64]).resize((192, 192), Image.NEAREST)
        glow = Image.fromarray(g[:, 128:192]).resize((192, 192), Image.NEAREST)
        P.alpha_composite(spr, (x + 20, y + 14)); P.alpha_composite(glow, (x + 20, y + 14))
        d.text((x + 16, y + 214), f'{i + 1:03d}', font=small, fill=(110, 104, 130))
        d.text((x + 52, y + 212), sp.upper(), font=mono, fill=(228, 224, 240))
        d.text((x + 52, y + 232), cls.upper(), font=small, fill=c)
    d.text((M, H - 40), 'art: Openmon (Screen Smith, CC0) · Tuxemon (CC-BY-SA 4.0) · grafts: tools/cyberize.py', font=small, fill=(90, 86, 110))
    P.convert('RGB').save(os.path.join(ASSETS, 'LOG-bestiary.png'), optimize=True)

def main():
    man = json.load(open(os.path.join(ASSETS, 'manifest.json')))
    mons = man['monsters']
    data = species()
    for sp in data:
        if sp not in mons['species']: errors.append(f'{sp}: in js/data.js but has no art in the manifest')
    os.makedirs(OUT, exist_ok=True)
    plate = []
    for sp, spec in mons['species'].items():
        front, back = source_cells(spec, mons['sources'])
        if front is None: continue
        f = seat(front)
        if f is None: errors.append(f'{sp}: empty cell {spec}'); continue
        if sp not in data or data[sp]['class'] not in ('robot', 'cyborg', 'wetware'):
            errors.append(f'{sp}: not a species with a class (robot|cyborg|wetware) in js/data.js'); continue
        spec = {**spec, **data[sp]}
        types = spec['types']
        c1 = rgb(TYPE_C[types[0]]); c2 = rgb(TYPE_C[types[1]]) if len(types) > 1 else np.minimum(c1 * .55 + 255 * .45, 255)
        g = np.zeros((64, 256, 4), np.uint8)
        fr = cyberize(f, spec['class'], c1, c2, Rng(sp), g[:, 128:192])
        if back is not None and seat(back) is not None:
            bk = cyberize(seat(back), spec['class'], c1, c2, Rng(sp + '/back'), g[:, 192:256])
        else:  # mirrored front, a shade darker: we see it from behind, away from the street light
            bk = fr[:, ::-1].copy(); bk[:, :, :3] = (bk[:, :, :3] * .82).astype(np.uint8)
            g[:, 192:256] = g[:, 128:192][:, ::-1]
        g[:, 0:64], g[:, 64:128] = fr, bk
        Image.fromarray(g).save(os.path.join(OUT, f'mon_{sp}.png'), optimize=True)
        plate.append((sp, g))
    if '--plate' in sys.argv and plate:
        specimen_plate(plate, data)
    if errors:
        print('\n'.join('✗ ' + e for e in errors), file=sys.stderr); sys.exit(1)
    print(f'✓ cyberized {len(plate)} species into assets/night/mon_*.png')

if __name__ == '__main__': main()
