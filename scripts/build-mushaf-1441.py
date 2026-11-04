#!/usr/bin/env python3
"""The 1441 print of the Madani mushaf (src/lib/mushafEdition), drawn from the King Fahd Complex's
own vector files: the page images for Storage and the verse boxes for pressing and holding.

Source: dm.qurancomplex.gov.sa → 1441-AI-hafs.zip, one Illustrator file per page (PDF inside). Its
rights page (dm.qurancomplex.gov.sa/rights/) lets anyone use it free of charge, including in
"websites and computer programs", inside and outside Saudi Arabia.

Each file has four layers, named a little differently from page to page: the Qur'an text (with the
surah names and the basmala), "Aya No." (the numerals inside the verse-end markers), "Ornament(s)"
(the page frame, the surah-header boxes, the green marker discs) and "Header & Marks & Page No."
(running heads and the page number; pages 1 and 2 have none).

What it writes:
- <out>/w1080/NNN.png and <out>/w1440/NNN.png: the page inside the frame (the same 254.4 × 410.4 pt
  window on every page: the frame, the running heads and the page number are outside it), drawn
  without the running-heads layer at 2880 px and shrunk with Lanczos. Like the 1405 pages they are
  ink on a transparent ground, alpha only (the ink's own grey), so the dark theme's tint works the
  same: the text is opaque, the green ornaments a light 17%. Stored as 32-entry palette PNGs.
- src/data/ayahBounds1441.json: one rectangle per verse per line, [sura, ayah, x0, y0, x1, y1, ...]
  per page, in a 1024-wide space over the same window (ayahBounds.json's format). Found from the
  page itself: the 15 line rows (26.93 pt apart), the green marker discs (a verse's last box ends
  at the left of its disc, which it includes), the surah-header boxes (with the basmala line after
  them, except for At-Tawbah and Al-Fatihah) and the ink of each line. The verses come in order
  from scripts/mushaf1441-page-starts.json (the first verse on each page, the layout of the King
  Fahd Complex's 1421/1441 prints as Quran.com's QCF V2 data records it). The build fails on any
  page whose discs don't match its verses one for one, so a page can't be labelled wrongly.
- src/data/mushaf1441.json: the window's size (the app's page aspect).
- With --thumbs <1405 page 582 png>: assets/mushaf/thumb-madani1405.png and thumb-madani1441.png,
  the top of page 582 (An-Naba') in each print, for Settings → Mushaf.

Usage (PyMuPDF, NumPy, Pillow, SciPy; in a virtualenv: pip install pymupdf numpy pillow scipy):
    curl -o /tmp/k/1441-AI-hafs.zip https://dm.qurancomplex.gov.sa/Download/1441-AI-hafs.zip
    # unzip, naming the files 001.ai … 604.ai (the archive's folder name is Arabic)
    python3 scripts/build-mushaf-1441.py /tmp/k/x /tmp/mushaf-1441 [--pages 1-604] [--thumbs 582.png]
    # then: functions/scripts/upload-mushaf-variants.js /tmp/mushaf-1441 --prefix 1441
    #       node scripts/mushaf-sizes.js

Objects in Storage are immutable (cached for a year). If the images ever change, write them under a
new folder (mushaf/1441b/…) and point MUSHAF_EDITIONS.madani1441.folder at it.
"""

import importlib.util
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import fitz  # PyMuPDF
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# The palette fitting of the 1405 copies (scripts/build-mushaf-variants.py).
_spec = importlib.util.spec_from_file_location('variants', os.path.join(HERE, 'build-mushaf-variants.py'))
variants = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(variants)

PAGES = 604
AYAH_COUNTS = [
    7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78,
    118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38,
    29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
    56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
    11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]
assert len(AYAH_COUNTS) == 114 and sum(AYAH_COUNTS) == 6236

# The window inside the frame, in points. The frame's inner edge is x 86.76–342.48 on even pages and
# 40.20–295.92 on odd ones, y 67.80–479.28 on all (measured at 600 dpi); the window sits in its
# middle, 0.6 pt clear of it. Pages 1 and 2 have no frame: their panel is centred on the sheet.
WIN_W, WIN_H = 254.4, 410.4
WIN_Y0 = 67.80 + (411.48 - WIN_H) / 2
WIN_X0 = {0: 86.76 + (255.72 - WIN_W) / 2, 1: 40.20 + (255.72 - WIN_W) / 2}
# The 15 line rows: centres of the marker discs, measured over every page (pt, sheet coordinates).
ROW0, PITCH, ROWS = 88.30, 26.93, 15
# The decorated opening pages: 7 rows in a circle, under the surah's title (outside the rows). Page
# 2's first row is the basmala.
OPENING = {
    1: {'grid': (210.9, 21.37, 7), 'skip': set()},
    2: {'grid': (210.9, 21.37, 7), 'skip': {0}},
}

RENDER_W = 2880  # drawn at twice the widest copy, then shrunk
WIDTHS = (1080, 1440)
# Grey levels in each copy's palette: 32 keeps every pixel within 6.5/255 of the shrunk page (the
# 1405 copies allow 16) at ~185 KB a page at 1080 px; 256 levels would be ~325 KB.
PALETTE = 32
MEASURE_ZOOM = 4.0  # px per pt for finding discs, headers and ink
BOUNDS_W = 1024

# What the text's ink is: alpha 1 at its own darkness.
INK = (0.13669, 0.12195, 0.12529)
INK_GREY = round(255 * (0.2126 * INK[0] + 0.7152 * INK[1] + 0.0722 * INK[2]))


def layer_kind(name):
    n = name.strip().lower()
    if 'ornament' in n:
        return 'ornament'
    if n.startswith('aya'):
        return 'aya'
    if n.startswith('header'):
        return 'header'
    return 'text'  # "Quran Text", "QuranText", and "Layer 1" on four pages


def window(page_no, doc):
    """The crop window (fitz.Rect, points) for a page."""
    if page_no <= 2:
        # The decorated opening: centre the window on the panel.
        orn = render(doc, {'ornament'}, doc[0].rect, 1.0)
        ys, xs = np.where(orn < 245)
        cx, cy = (xs.min() + xs.max() + 1) / 2, (ys.min() + ys.max() + 1) / 2
        return fitz.Rect(cx - WIN_W / 2, cy - WIN_H / 2, cx + WIN_W / 2, cy + WIN_H / 2)
    x0 = WIN_X0[page_no % 2]
    return fitz.Rect(x0, WIN_Y0, x0 + WIN_W, WIN_Y0 + WIN_H)


def render(doc, kinds, clip, zoom, rgb=False):
    """The layers of `kinds` inside `clip` at `zoom` px/pt: grey (H×W) or RGB (H×W×3) uint8."""
    for cfg in doc.layer_ui_configs():
        doc.set_layer_ui_config(cfg['number'], 0 if layer_kind(cfg['text']) in kinds else 2)
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, colorspace=fitz.csRGB if rgb else fitz.csGRAY)
    a = np.frombuffer(pix.samples, dtype=np.uint8)
    return a.reshape(pix.height, pix.width, 3) if rgb else a.reshape(pix.height, pix.width)


def verses_from(start, n):
    s, a = start
    out = []
    for _ in range(n):
        out.append((s, a))
        a += 1
        if a > AYAH_COUNTS[s - 1]:
            s, a = s + 1, 1
    return out


def count_between(first, nxt):
    """Verses from `first` up to (not including) `nxt` (None: the end of the Qur'an)."""
    n, v = 0, first
    while v != nxt and v is not None:
        n += 1
        s, a = v
        a += 1
        if a > AYAH_COUNTS[s - 1]:
            s, a = s + 1, 1
        v = (s, a) if s <= 114 else None
    return n


def row_band(grid, k, frac=0.5):
    row0, pitch, _ = grid
    c = row0 + pitch * k
    return c - pitch * frac, c + pitch * frac


def measure(page_no, doc, win, verses):
    """The verse boxes of a page (window points), or raise with what didn't match."""
    z = MEASURE_ZOOM
    orn = render(doc, {'ornament'}, win, z) < 235
    ink = render(doc, {'text', 'aya'}, win, z) < 160
    lab, n = ndimage.label(orn)
    discs, headers = [], []
    for i, sl in enumerate(ndimage.find_objects(lab)):
        if sl is None:
            continue
        y0, y1, x0, x1 = sl[0].start / z, sl[0].stop / z, sl[1].start / z, sl[1].stop / z
        w, h = x1 - x0, y1 - y0
        if 10 <= w <= 16 and 13 <= h <= 21:
            discs.append((x0, y0, x1, y1))
        elif w > 0.6 * WIN_W and 18 <= h <= 36:
            headers.append((x0, y0, x1, y1))
    expected = len(verses)
    if len(discs) != expected:
        raise ValueError(f'page {page_no}: {len(discs)} marker discs, {expected} verses')
    opening = OPENING.get(page_no)
    grid = opening['grid'] if opening else (ROW0, PITCH, ROWS)
    row0, pitch, rows = grid

    def row_of(y0, y1):
        cy = (y0 + y1) / 2 + win.y0
        k = round((cy - row0) / pitch)
        if not 0 <= k < rows or abs(cy - (row0 + pitch * k)) > pitch * 0.3:
            raise ValueError(f'page {page_no}: an ornament at y {cy:.1f} is between rows')
        return k

    disc_rows = {}
    for d in discs:
        disc_rows.setdefault(row_of(d[1], d[3]), []).append(d)

    if opening:
        header_at, skip = {}, set(opening['skip'])
        header_count = 1
    else:
        header_rows = sorted(row_of(h[1], h[3]) for h in headers)
        header_count = len(header_rows)
        # The surahs that start here, in order: one header each.
        starting = [s for s, a in verses if a == 1]
        if len(starting) != len(header_rows):
            raise ValueError(f'page {page_no}: {len(header_rows)} surah headers, {len(starting)} surahs start')
        # Rows that hold no verse text: each header, and the basmala under it (At-Tawbah has none;
        # Al-Fatihah's is its first verse, with a marker).
        header_at = dict(zip(header_rows, starting))
        skip = set(header_rows)
        for k, s in header_at.items():
            if s not in (1, 9):
                skip.add(k + 1)
    for k in skip:
        if k in disc_rows:
            raise ValueError(f'page {page_no}: row {k} (a header or basmala) has a marker')

    boxes = []
    vi = 0
    for k in range(rows):
        if k in header_at and (vi >= len(verses) or verses[vi] != (header_at[k], 1)):
            raise ValueError(f'page {page_no}: the header of surah {header_at[k]} is on row {k}, out of order')
        if k in skip:
            continue
        top, bottom = row_band(grid, k, 0.36)
        band = ink[max(0, int((top - win.y0) * z)) : int((bottom - win.y0) * z)]
        cols = np.where(band.sum(0) > 0)[0]
        line_discs = sorted(disc_rows.get(k, []), key=lambda d: -d[0])  # right to left
        if len(cols) == 0 and not line_discs:
            continue  # an empty row (the opening pages)
        x0 = min(([cols.min() / z] if len(cols) else []) + [d[0] for d in line_discs])
        x1 = max(([(cols.max() + 1) / z] if len(cols) else []) + [d[2] for d in line_discs])
        y0, y1 = (y - win.y0 for y in row_band(grid, k, 0.42))
        # Each verse that ends here runs from where the last one ended to the left of its
        # disc; what is left of the line begins the next verse.
        right = x1
        for d in line_discs:
            if vi >= len(verses):
                raise ValueError(f'page {page_no}: more markers than verses')
            boxes.append((verses[vi], d[0], right, y0, y1))
            right = d[0]
            vi += 1
        if right - x0 > 2:
            if vi >= len(verses):
                raise ValueError(f'page {page_no}: text after the last verse on row {k}')
            boxes.append((verses[vi], x0, right, y0, y1))
    if vi != len(verses):
        raise ValueError(f'page {page_no}: {vi} verses ended, {len(verses)} expected')
    seen = {b[0] for b in boxes}
    if seen != set(verses):
        raise ValueError(f'page {page_no}: verses without a box: {sorted(set(verses) - seen)}')
    return boxes, header_count


def to_image(rgb):
    """Ink alpha (0..255 float) from an RGB drawing on white: the ink's darkness is opaque."""
    f = rgb.astype(np.float64) / 255
    lum = 0.2126 * f[..., 0] + 0.7152 * f[..., 1] + 0.0722 * f[..., 2]
    return np.clip((1 - lum) / (1 - INK_GREY / 255), 0, 1) * 255


def write_copy(alpha_full, width, path):
    h = round(alpha_full.shape[0] * width / alpha_full.shape[1])
    a = np.asarray(Image.fromarray(alpha_full.astype(np.float32)).resize((width, h), Image.LANCZOS), dtype=np.float64)
    a = np.clip(a, 0, 255)
    p = a * INK_GREY / 255  # premultiplied: one grey
    pi, ai = variants.representable(p, a)
    centers = variants.fit_palette(pi, ai, PALETTE)
    idx = variants.quantize(pi, ai, centers)
    entries = variants.palette_rgba(centers)
    err = variants.drawn_error(pi, ai, idx, entries)
    im = Image.frombytes('P', (idx.shape[1], idx.shape[0]), idx.astype(np.uint8).tobytes())
    im.putpalette([v for g, _ in entries for v in (g, g, g)], rawmode='RGB')
    tmp = path + '.part'
    im.save(tmp, 'PNG', optimize=True, transparency=bytes(al for _, al in entries))
    os.replace(tmp, path)
    return err, (width, h), os.path.getsize(path)


def build(job):
    src, out, page_no, verses, images = job
    doc = fitz.open(src)
    win = window(page_no, doc)
    boxes, headers = measure(page_no, doc, win, verses)
    sizes = {}
    if images:
        zoom = RENDER_W / WIN_W
        rgb = render(doc, {'text', 'aya', 'ornament'}, win, zoom, rgb=True)
        alpha = to_image(rgb)
        for w in WIDTHS:
            sizes[w] = write_copy(alpha, w, os.path.join(out, f'w{w}', f'{page_no:03d}.png'))
    s = BOUNDS_W / WIN_W
    flat = []
    for (sura, ayah), x0, x1, y0, y1 in boxes:
        flat += [sura, ayah, round(x0 * s), round(y0 * s), round(x1 * s), round(y1 * s)]
    return page_no, flat, headers, sizes


def thumbs(page_1405_png, out_1441_dir):
    """The top of page 582 in each print (the surah header and the first lines): 3:4, the middle half
    of the width, at 132×176 px."""
    os.makedirs(os.path.join(ROOT, 'assets', 'mushaf'), exist_ok=True)
    for name, path in (('madani1405', page_1405_png), ('madani1441', os.path.join(out_1441_dir, 'w1440', '582.png'))):
        im = Image.open(path).convert('RGBA')
        w, h = im.size
        cw = w // 2
        box = ((w - cw) // 2, 0, (w - cw) // 2 + cw, cw * 4 // 3)
        im.crop(box).resize((132, 176), Image.LANCZOS).save(os.path.join(ROOT, 'assets', 'mushaf', f'thumb-{name}.png'), optimize=True)


def main(argv):
    args = argv[1:]
    if len(args) < 2:
        print(__doc__)
        return 2
    src_dir, out_dir = args[0], args[1]
    pages = range(1, PAGES + 1)
    thumb_src = None
    images = '--no-images' not in args
    if '--pages' in args:
        a, b = args[args.index('--pages') + 1].split('-')
        pages = range(int(a), int(b) + 1)
    if '--thumbs' in args:
        thumb_src = args[args.index('--thumbs') + 1]
    starts = json.load(open(os.path.join(HERE, 'mushaf1441-page-starts.json')))
    starts = [tuple(int(x) for x in v.split(':')) for v in starts]
    assert len(starts) == PAGES
    for w in WIDTHS:
        os.makedirs(os.path.join(out_dir, f'w{w}'), exist_ok=True)
    jobs = []
    for p in pages:
        nxt = starts[p] if p < PAGES else None
        n = count_between(starts[p - 1], nxt)
        jobs.append((os.path.join(src_dir, f'{p:03d}.ai'), out_dir, p, verses_from(starts[p - 1], n), images))
    bounds, failed = {}, []
    total = {w: 0 for w in WIDTHS}
    worst = {w: 0.0 for w in WIDTHS}
    dims = set()
    with ProcessPoolExecutor() as pool:
        futures = [pool.submit(build, j) for j in jobs]
        for f, j in zip(futures, jobs):
            try:
                page_no, flat, _, sizes = f.result()
            except ValueError as e:
                failed.append(str(e))
                continue
            bounds[str(page_no)] = flat
            for w, (err, size, nbytes) in sizes.items():
                total[w] += nbytes
                worst[w] = max(worst[w], err)
                dims.add((w, size))
    if images:
        for w in WIDTHS:
            print(f'w{w}: {total[w] / 1e6:.1f} MB, worst error {worst[w]:.1f}/255, sizes {sorted(s for x, s in dims if x == w)}')
            if worst[w] > variants.MAX_ERROR:
                failed.append(f'w{w}: error {worst[w]:.1f} > {variants.MAX_ERROR}')
    for msg in failed:
        print(msg, file=sys.stderr)
    if failed:
        return 1
    if len(bounds) == PAGES:
        with open(os.path.join(ROOT, 'src', 'data', 'ayahBounds1441.json'), 'w') as f:
            json.dump(bounds, f, separators=(',', ':'))
            f.write('\n')
        with open(os.path.join(ROOT, 'src', 'data', 'mushaf1441.json'), 'w') as f:
            json.dump({'page': {'width': WIN_W, 'height': WIN_H}}, f)
            f.write('\n')
        print('wrote src/data/ayahBounds1441.json and src/data/mushaf1441.json')
    if thumb_src:
        thumbs(thumb_src, out_dir)
        print('wrote assets/mushaf/thumb-*.png')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
