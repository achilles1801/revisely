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

# A few page images are laid out differently from the glyph data's own rendering;
# their coordinates are mapped onto the image: x -> ax*x + bx, y -> ay*y + by
# (ax, bx, ay, by), measured by fitting the data's lines and words to the ink of
# each mushaf/NNN.png (all 604 pages were checked; the rest match within a few
# units). Pages 1 and 2 sit 58 units higher; page 3's text is drawn larger, about
# 7% wider and 3% taller. Shared with build-quran-words.py.
PAGE_FIX = {1: (1, 0, 1, -58), 2: (1, 0, 1, -58), 3: (1.070, -41, 1.032, -9)}


def fix(page, x0, x1, y0, y1):
    """The glyph box on the page image (x0 <= x1, y0 <= y1)."""
    ax, bx, ay, by = PAGE_FIX.get(page, (1, 0, 1, 0))
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    return round(ax * x0 + bx), round(ax * x1 + bx), round(ay * y0 + by), round(ay * y1 + by)

line_band = {}  # (page, line) -> (y0, y1)
ayah_line = defaultdict(lambda: [10**9, -1])  # (page, line, sura, ayah) -> [x0, x1]
for page, line, sura, ayah, x0, x1, y0, y1 in rows:
    x0, x1, y0, y1 = fix(page, x0, x1, y0, y1)
    b = line_band.get((page, line))
    line_band[(page, line)] = (min(b[0], y0), max(b[1], y1)) if b else (y0, y1)
    r = ayah_line[(page, line, sura, ayah)]
    r[0], r[1] = min(r[0], x0), max(r[1], x1)

pages = defaultdict(list)
for (page, line, sura, ayah), (x0, x1) in sorted(ayah_line.items()):
    y0, y1 = line_band[(page, line)]
    pages[page].extend([sura, ayah, x0, y0, x1, y1])

assert len(pages) == 604, len(pages)
out = Path(__file__).resolve().parent.parent / "src" / "data" / "ayahBounds.json"
out.write_text(json.dumps({str(p): pages[p] for p in sorted(pages)}, separators=(",", ":")))
print(f"wrote {out} ({out.stat().st_size // 1024} KB, {sum(len(v) for v in pages.values()) // 6} rects)")
