#!/usr/bin/env python3
"""Cuts the whole building sprites out of future_city_27 (gritty) and lines them up, bottom-aligned,
in 16px-wide slots of a strip, so the street renderer can treat each one as a cell-aligned block.

    python3 tools/facades.py      # assets/future_city_27_gritty.png -> assets/src/user/facades.png
Prints each facade as [first column, width in cells, height in cells]; js/scene.js FACADES lists them.
"""
import os, sys
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'future_city_27_gritty.png')
OUT = os.path.join(ROOT, 'assets', 'src', 'user', 'facades.png')
# The building sprites, as source rectangles (x, y, w, h) in pixels; the rest of the sheet is
# street tiles and props. Found from the sheet's connected regions, split where buildings touch, trimmed to opaque pixels below.
BOXES = [(16, 117, 44, 72), (66, 125, 28, 63), (94, 125, 36, 63), (131, 129, 46, 59), (181, 128, 39, 62), (220, 128, 36, 62),
         (66, 196, 24, 60), (90, 191, 36, 66), (129, 191, 31, 64), (160, 191, 35, 64), (195, 195, 37, 75), (232, 195, 22, 75)]
im = np.array(Image.open(SRC).convert('RGBA'))
slots, x, out = [], 0, []
for (bx, by, bw, bh) in BOXES:
    c = im[by:by + bh, bx:bx + bw]
    ys, xs = np.nonzero(c[:, :, 3] > 0)
    if not len(ys): print('empty', bx, by, file=sys.stderr); sys.exit(1)
    c = c[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    wc, hc = -(-c.shape[1] // 16), -(-c.shape[0] // 16)
    slots.append((x, wc, hc, c)); x += wc
H = max(s[2] for s in slots) * 16
strip = np.zeros((H, x * 16, 4), np.uint8)
for (col, wc, hc, c) in slots:
    ox = col * 16 + (wc * 16 - c.shape[1]) // 2
    strip[H - c.shape[0]:, ox:ox + c.shape[1]] = c
Image.fromarray(strip).save(OUT)
print('FACADES =', [[col, wc, hc] for (col, wc, hc, _) in slots], 'strip', strip.shape)
