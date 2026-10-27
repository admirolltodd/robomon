#!/usr/bin/env python3
"""Shrinks the uploaded 1000px concrete photos into 16px street decals (one cell, a tile in game) (stains, cracks, blood),
as a strip of one-cell decals the pavement renderer lays over random tiles at low opacity.

    python3 tools/grit.py      # assets/concrete-*.png -> assets/src/user/grit.png
Only the dark marks are kept: light concrete becomes transparent, so the game's own pavement shows.
"""
import os
import numpy as np
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = ['concrete-n-crack.png', 'concrete-n-crack2.png', 'concrete-n-stain.png', 'concrete-n-stain2.png',
       'concrete-n-blood.png', 'concrete-n-blood2.png', 'concrete-n-stain3.png', 'concrete-2-dirt.png']
tiles = []
for f in SRC:
    im = Image.open(os.path.join(ROOT, 'assets', f)).convert('RGB').crop((250, 250, 750, 750)).resize((16, 16), Image.LANCZOS)
    a = np.asarray(im).astype(float)
    L = a.mean(axis=2)
    mark = np.clip((L.mean() - L) / 40, 0, 1)            # darker than the slab's average = a mark
    rgba = np.dstack([a * .55, (mark * 200).astype(float)]).astype(np.uint8)
    tiles.append(rgba)
Image.fromarray(np.hstack(tiles)).save(os.path.join(ROOT, 'assets', 'src', 'user', 'grit.png'))
print(f'✓ {len(tiles)} grit decals -> assets/src/user/grit.png')
