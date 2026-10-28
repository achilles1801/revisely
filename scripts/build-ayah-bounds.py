#!/usr/bin/env python3
"""Build src/data/ayahBounds.json from the quran.com ayahinfo database.

The mushaf images (mushaf/001.png ... 604.png, 2600x4206) come from
github.com/quran/quran.com-images, the same generator that records the bounds of
every glyph it draws. Quran Android publishes those bounds as ayahinfo_<width>.db:

  curl -LO https://files.quran.app/hafs/madani/databases/ayahinfo/ayahinfo_1024.zip
  unzip ayahinfo_1024.zip
  python3 scripts/build-ayah-bounds.py ayahinfo_1024.db

Coordinates stay in the database's 1024-wide space; the app scales them to the
rendered page. Each verse becomes one rectangle per line it occupies, spanning
the full height of that line so a highlight reads as a continuous band.

Output: { "<page>": [sura, ayah, x0, y0, x1, y1, sura, ayah, ...], ... }
"""
import json
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path

db = sqlite3.connect(sys.argv[1])
rows = db.execute(
    "select page_number, line_number, sura_number, ayah_number, min_x, max_x, min_y, max_y from glyphs"
).fetchall()

line_band = {}  # (page, line) -> (y0, y1)
ayah_line = defaultdict(lambda: [10**9, -1])  # (page, line, sura, ayah) -> [x0, x1]
for page, line, sura, ayah, x0, x1, y0, y1 in rows:
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    b = line_band.get((page, line))
    line_band[(page, line)] = (min(b[0], y0), max(b[1], y1)) if b else (y0, y1)
    r = ayah_line[(page, line, sura, ayah)]
    r[0], r[1] = min(r[0], x0), max(r[1], x1)

# Pages whose image (mushaf/*.png) doesn't draw the text where quran.com-images
# does, as x' = ax * x + bx, y' = ay * y + by in the database's 1024-wide units,
# measured line by line on the images (scripts/check-ayah-bounds.py):
#   1, 2  the decorated opening pages sit higher (without it, holding Al-Hamd
#         picked the Basmala);
#   3     a different rendering (4.3 MB against ~0.3 MB for the others), its
#         text block 7% wider and 3% taller: every highlight sat high, the words'
#         lower halves below it, and the line ends outside it (Oct 27 2026; the
#         same fit as feature/mistake-detection's PAGE_FIX, found there Oct 20).
# Every other page matches to within a few units (the check measures all 604).
PAGE_FIT = {
    1: (1, 0, 1, -61),
    2: (1, 0, 1, -57),
    3: (1.070, -41, 1.032, -9),
}

pages = defaultdict(list)
for (page, line, sura, ayah), (x0, x1) in sorted(ayah_line.items()):
    y0, y1 = line_band[(page, line)]
    ax, bx, ay, by = PAGE_FIT.get(page, (1, 0, 1, 0))
    fit = lambda v, a, b: round(v * a + b, 1) if (a, b) != (1, 0) else v
    pages[page].extend([sura, ayah, fit(x0, ax, bx), fit(y0, ay, by), fit(x1, ax, bx), fit(y1, ay, by)])

assert len(pages) == 604, len(pages)
out = Path(__file__).resolve().parent.parent / "src" / "data" / "ayahBounds.json"
out.write_text(json.dumps({str(p): pages[p] for p in sorted(pages)}, separators=(",", ":")))
print(f"wrote {out} ({out.stat().st_size // 1024} KB, {sum(len(v) for v in pages.values()) // 6} rects)")
