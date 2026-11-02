#!/usr/bin/env python3
"""Phone-sized copies of the mushaf pages, for Android (issue #153).

The pages in Storage (mushaf/NNN.png) are 2600×4206. Android's image pipeline (Fresco) never decodes
them at that size: it caps a bitmap at 2048 px and, for a PNG, gets there by keeping one pixel in
three, which breaks thin strokes. Android loads these copies instead, decoded as they are
(resizeMethod "none"), so the only shrinking is done here, once, with a proper filter:

    mushaf/w1080/NNN.png  1080×1747   phones up to 1080 px wide
    mushaf/w1440/NNN.png  1440×2329   wider phones and tablets

How each copy is made:
- Every page is grey on a transparent ground (603 pages: one transparent colour with opaque greys at
  the edges of the strokes; page 3: real alpha). Each page is resized in premultiplied grey+alpha
  (Pillow's "La") with Lanczos, so drawn over any ground it equals the original drawn there and
  then shrunk, and the dark theme's tint (which keeps only alpha) gets smooth edges.
- It is stored as an 8-bit palette PNG with transparency: 256 (grey, alpha) entries spread evenly
  over the pairs the page uses (premultiplied), no dithering. Fully transparent and solid black stay
  exact; no pixel is more than about 11/255 off. The worst error as drawn is printed per set, and
  the script fails if a page goes over MAX_ERROR, so a bad fit never reaches Storage. The copies are
  about 55% of the original's bytes at 1080 and 80% at 1440 (lossless grey+alpha: 150–210%).

Usage (Pillow and NumPy):
    # the originals (public): 604 files, ~230 MB
    mkdir -p /tmp/mushaf-src && cd /tmp/mushaf-src && for i in $(seq -f "%03g" 1 604); do
      curl -sf -o $i.png https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/$i.png; done
    python3 scripts/build-mushaf-variants.py /tmp/mushaf-src /tmp/mushaf-out
    # then upload: functions/scripts/upload-mushaf-variants.js /tmp/mushaf-out

Objects in Storage are immutable (cached for a year, on phones too). If the copies ever have to
change, write them under a new set name (w1080b, ...) and point src/lib/quranImages.ts at it.
"""

import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from PIL import Image

SRC_SIZE = (2600, 4206)
WIDTHS = (1080, 1440)
PALETTE_SIZE = 256
# Largest allowed difference, out of 255, between a copy and the resized page it stands for, drawn
# over white, over black, or as alpha (the dark theme's tint).
MAX_ERROR = 16


def target_size(width):
    return width, round(SRC_SIZE[1] * width / SRC_SIZE[0])


def resized_premultiplied(src, width):
    """The page at `width`, as premultiplied grey (P) and alpha (A), both 0..255 floats."""
    im = Image.open(src)
    if im.size != SRC_SIZE:
        raise ValueError(f'{src}: {im.size}, expected {SRC_SIZE}')
    la = im.convert('RGBA').convert('LA').convert('La')
    small = la.resize(target_size(width), Image.LANCZOS)
    arr = np.asarray(small, dtype=np.float64)
    return arr[..., 0], arr[..., 1]


def representable(p, a):
    """The resized page as integers a PNG can hold: Lanczos rings a little past the edges, and
    premultiplied grey can't exceed alpha."""
    ai = np.clip(np.rint(a), 0, 255).astype(np.int64)
    pi = np.minimum(np.clip(np.rint(p), 0, 255).astype(np.int64), ai)
    return pi, ai


def _dist2(pts, centers):
    return (pts[:, None, 0] - centers[None, :, 0]) ** 2 + (pts[:, None, 1] - centers[None, :, 1]) ** 2


def fit_palette(pi, ai, k=PALETTE_SIZE):
    """k (P, A) entries spread over the pairs the page uses: each next entry is the pair farthest
    from every entry so far (greedy k-center), so no pixel is far from its entry. Transparent and
    solid black come first and are exact. Sorted by alpha, then grey, which the PNG filters like."""
    keys = np.unique(ai * 256 + pi)
    pts = np.stack([keys % 256, keys // 256], axis=1).astype(np.float64)  # (P, A)
    centers = [np.array([0.0, 0.0]), np.array([0.0, 255.0])]
    nearest = _dist2(pts, np.array(centers)).min(1)
    while len(centers) < min(k, len(pts) + 2):
        i = int(nearest.argmax())
        if nearest[i] == 0:
            break
        centers.append(pts[i])
        nearest = np.minimum(nearest, _dist2(pts, pts[i : i + 1])[:, 0])
    c = np.array(centers)
    return c[np.lexsort((c[:, 0], c[:, 1]))]


def quantize(pi, ai, centers):
    """Palette index per pixel: the nearest entry to its (P, A) pair."""
    keys = np.unique(ai * 256 + pi)
    pts = np.stack([keys % 256, keys // 256], axis=1).astype(np.float64)
    lut = np.zeros(65536, dtype=np.uint8)
    lut[keys] = _dist2(pts, centers).argmin(1)
    return lut[ai * 256 + pi]


def palette_rgba(centers):
    """Straight (unpremultiplied) grey and alpha per entry, as the PNG stores them."""
    out = []
    for pv, av in centers:
        if av <= 0:
            out.append((255, 0))  # transparent white, like the originals
        else:
            out.append((int(min(255, round(pv * 255 / av))), int(av)))
    return out


def drawn_error(pi, ai, idx, entries):
    """Largest difference from the resized page as drawn over white, over black, and in alpha
    alone (what the dark theme's tint keeps)."""
    g = np.array([e[0] for e in entries], dtype=np.float64)
    al = np.array([e[1] for e in entries], dtype=np.float64)
    qp = g[idx] * al[idx] / 255  # premultiplied again, as the decoder does
    qa = al[idx]
    over_black = np.abs(qp - pi).max()
    over_white = np.abs((qp - qa) - (pi - ai)).max()
    alpha = np.abs(qa - ai).max()
    return max(over_black, over_white, alpha)


def build(job):
    src, out_dir, width, page = job
    pi, ai = representable(*resized_premultiplied(src, width))
    centers = fit_palette(pi, ai)
    idx = quantize(pi, ai, centers)
    entries = palette_rgba(centers)
    err = drawn_error(pi, ai, idx, entries)
    h, w = idx.shape
    im = Image.frombytes('P', (w, h), idx.astype(np.uint8).tobytes())
    im.putpalette([v for g, _ in entries for v in (g, g, g)], rawmode='RGB')
    target = os.path.join(out_dir, f'w{width}', f'{page:03d}.png')
    tmp = target + '.part'
    im.save(tmp, 'PNG', optimize=True, transparency=bytes(al for _, al in entries))
    os.replace(tmp, target)
    return page, width, err, os.path.getsize(target)


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    src_dir, out_dir = argv[1], argv[2]
    jobs = []
    for width in WIDTHS:
        os.makedirs(os.path.join(out_dir, f'w{width}'), exist_ok=True)
        for page in range(1, 605):
            src = os.path.join(src_dir, f'{page:03d}.png')
            if not os.path.isfile(src):
                print(f'missing {src}', file=sys.stderr)
                return 1
            jobs.append((src, out_dir, width, page))
    worst = {w: (0.0, 0) for w in WIDTHS}
    total = {w: 0 for w in WIDTHS}
    failed = []
    with ProcessPoolExecutor() as pool:
        for page, width, err, size in pool.map(build, jobs, chunksize=4):
            total[width] += size
            if err > worst[width][0]:
                worst[width] = (err, page)
            if err > MAX_ERROR:
                failed.append((width, page, err))
    for w in WIDTHS:
        print(f'w{w}: {total[w] / 1e6:.1f} MB, worst error {worst[w][0]:.1f}/255 (page {worst[w][1]})')
    if failed:
        for w, page, err in failed:
            print(f'w{w}/{page:03d}.png: error {err:.1f} > {MAX_ERROR}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
