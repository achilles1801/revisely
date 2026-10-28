#!/usr/bin/env python3
"""Check src/data/ayahBounds.json against the page images the app shows.

Every verse line's box should cover the ink of that line. For each page this
measures how much of the ink around each line falls inside the line's boxes,
and lists the pages where too little does (a page image laid out differently
from the glyph data: give it a PAGE_FIT in build-ayah-bounds.py).

  pip install pillow numpy
  mkdir -p /tmp/mushaf && cd /tmp/mushaf && seq -f "%03g" 1 604 | xargs -P 16 -I{} \\
    curl -s -o {}.png https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/{}.png
  python3 scripts/check-ayah-bounds.py /tmp/mushaf

On Oct 27 2026, after page 3's fit, every page covers 0.92 or more of its lines'
ink (most 0.97+). The last pages' surah headers and basmalas are outside the
boxes by design; they sit between lines, so they barely count here.
"""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

IMAGES = Path(sys.argv[1])
BOUNDS = json.loads((Path(__file__).resolve().parent.parent / "src" / "data" / "ayahBounds.json").read_text())
THRESHOLD = float(sys.argv[2]) if len(sys.argv) > 2 else 0.85


def coverage(page):
    im = np.asarray(Image.open(IMAGES / f"{page:03d}.png").convert("RGBA"))
    ink = (im[:, :, 3] > 100) & (im[:, :, :3].mean(axis=2) < 160)
    height, width = ink.shape
    s = width / 1024
    r = np.array(BOUNDS[str(page)]).reshape(-1, 6)
    boxes = np.zeros_like(ink)
    around = np.zeros_like(ink)
    for _, _, x0, y0, x1, y1 in r:
        a, b = int(y0 * s), int(y1 * s)
        boxes[max(0, a):b, max(0, int(x0 * s)):int(x1 * s) + 1] = True
        # The line and a third of its height above and below: where its ink is
        # if the box is a little off.
        h = b - a
        around[max(0, a - h // 3):min(height, b + h // 3), :] = True
    near = ink & around
    return page, float((near & boxes).sum() / max(1, near.sum()))


if __name__ == "__main__":
    with ProcessPoolExecutor() as ex:
        results = list(ex.map(coverage, range(1, 605)))
    bad = [(p, c) for p, c in results if c < THRESHOLD]
    worst = sorted(results, key=lambda pc: pc[1])[:5]
    print("lowest:", ", ".join(f"{p} {c:.3f}" for p, c in worst))
    if bad:
        print(f"{len(bad)} page(s) below {THRESHOLD}:", ", ".join(f"{p} ({c:.3f})" for p, c in bad))
        sys.exit(1)
    print(f"all 604 pages cover {THRESHOLD} or more of their lines' ink")
