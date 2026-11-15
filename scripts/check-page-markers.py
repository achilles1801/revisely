#!/usr/bin/env python3
"""Check (or refit) the verse markers left open on a hidden page.

The hidden view (hidden recite mode, and Recite's hidden view) covers every line
of a 1405 page and leaves each verse marker open: src/data/pageLines.json holds
each marker's opening (x0, x1, 1024-wide bounds space). Those came from glyph
data that sits a few units right of the page images' markers, so the cover to a
marker's left clipped its left ornament (Majd, Nov 15 2026: ۱ ۲ ۳ cut on page 2,
only ۴ whole, as it ends its line). On page 236 the opening held only part of
the ring.

This finds every marker in the images the app shows: the ornament (ring, crown
and ears; the digits differ) is matched as a template at its own scale (markers
are smaller on some pages and lines, page 3 is wider), and a sajdah sign beside
it is kept with it (all 15, or the run fails). Then, in the rows a cover takes
(coverTop to coverBottom), a column being open when its centre is in the opening:

  1. none of a marker's ink is under a cover;
  2. no word's ink shows beside a marker in its opening. (A stroke that reaches
     over or under a marker, often a kaf's top stroke, shows in any opening: it
     is counted, never failed.)

--write sets each opening to its marker's ink, with half the gap to the next
ink on each side (at most PAD), rounded outwards to a tenth.

  pip install pillow numpy scipy
  mkdir -p /tmp/mushaf && cd /tmp/mushaf && seq -f "%03g" 1 604 | xargs -P 16 -I{} \\
    curl -s -o {}.png https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/{}.png
  python3 scripts/check-page-markers.py /tmp/mushaf           # check
  python3 scripts/check-page-markers.py /tmp/mushaf --write   # refit the openings
  (--dump FILE writes what was measured, per marker, as JSON)

The Android sets (mushaf/w1080/, mushaf/w1440/: the same pages scaled down)
pass the same check, counting solid ink only (scaling down spreads a faint pixel
across every edge), with three pixels allowed where a marker is within two of the
next ink (no edge can part them at that size). Only the 1405 print has a hidden
view (MushafEdition.reciteData), so the 1441 print has nothing to check.

On Nov 15 2026, before the refit, 6,210 of 6,235 markers were clipped (7.5 units
at the median, 37.4 on page 236), and 17 openings showed a word beside their
marker (up to 16 units, beside sajdah signs). After it, none, in all three sets.
"""
import json
import math
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, signal

LINES_FILE = Path(__file__).resolve().parent.parent / "src" / "data" / "pageLines.json"
# A clean marker with room on both sides: its ornament is the template.
TEMPLATE_AT = (50, 7)
# Ink: any pixel that shows (antialiased edges included), light or dark theme.
INK = 24
# Ink for finding a marker: its solid strokes.
MATCH = 96
# The originals' width (iOS); Android's w1080 and w1440 are scaled down from them.
ORIGINAL_WIDTH = 2600
# The 15 sajdah ayahs' pages: each has a sajdah sign beside its marker.
SAJDAH_PAGES = [176, 251, 272, 293, 309, 334, 341, 365, 379, 416, 454, 480, 528, 589, 597]
# Room left beside a marker's ink, if the next ink allows it (units of the 1024 width).
PAD = 1.5


def lines_of(flat):
    i, out = 0, []
    while i + 8 <= len(flat):
        n = int(flat[i + 7])
        out.append(dict(at=i, line=flat[i], top=flat[i + 3], bot=flat[i + 4], x0=flat[i + 5], x1=flat[i + 6],
                        markers=[(flat[i + 8 + 2 * m], flat[i + 9 + 2 * m]) for m in range(n)]))
        i += 8 + 2 * n
    return out


def alpha(images, page):
    return np.asarray(Image.open(images / f"{page:03d}.png").convert("RGBA"))[:, :, 3]


def make_template(images, lines):
    page, line = TEMPLATE_AT
    a = alpha(images, page)
    s = a.shape[1] / 1024
    l = next(x for x in lines_of(lines[str(page)]) if x["line"] == line)
    m0, m1 = l["markers"][0]
    r0, c0 = int((l["top"] - 12) * s), int((m0 - 30) * s)
    ink = a[r0:int((l["bot"] + 12) * s), c0:int((m1 + 20) * s)] > INK
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    ring = max(range(n), key=lambda j: (objs[j][0].stop - objs[j][0].start) * (objs[j][1].stop - objs[j][1].start))
    ys, xs = objs[ring]
    g = 3 * s
    keep = np.zeros(n + 1, bool)
    for j, (yy, xx) in enumerate(objs):
        keep[j + 1] = xx.start >= xs.start - g and xx.stop <= xs.stop + g and yy.start >= ys.start - g and yy.stop <= ys.stop + g
    full = keep[lab]
    ringm = lab == ring + 1
    disc = ndimage.binary_fill_holes(ringm)
    outline = full & ~(disc & ~ringm) & (a[r0:r0 + ink.shape[0], c0:c0 + ink.shape[1]] > MATCH)  # the ornament, no digits
    yy, xx = np.where(full)
    box = (slice(yy.min(), yy.max() + 1), slice(xx.min(), xx.max() + 1))
    return dict(outline=outline[box], area=(disc | full)[box])


def scaled(t, kx, ky):
    if kx == 1 and ky == 1:
        return t

    def rs(m):
        h, w = m.shape
        im = Image.fromarray(m.astype(np.uint8) * 255).resize((max(1, round(w * kx)), max(1, round(h * ky))), Image.BILINEAR)
        return np.asarray(im) > 127

    return dict(outline=rs(t["outline"]), area=rs(t["area"]))


def best_at(inkhi, tpl, win):
    r0, r1, c0, c1 = win
    w = inkhi[r0:r1, c0:c1]
    if w.shape[0] < tpl.shape[0] or w.shape[1] < tpl.shape[1]:
        return -1.0, 0, 0
    corr = signal.fftconvolve(w, tpl[::-1, ::-1].astype(np.float32), mode="valid")
    iy, ix = np.unravel_index(np.argmax(corr), corr.shape)
    return float(corr[iy, ix] / tpl.sum()), r0 + iy, c0 + ix


def locate(inkhi, t, win):
    """The template's best place in the window: (score, top, left, scaled template)."""
    score, py, px = best_at(inkhi, t["outline"], win)
    if score >= 0.97:
        return score, py, px, t
    tries = [(best_at(inkhi, scaled(t, k, k)["outline"], win), k, k) for k in np.arange(0.60, 1.21, 0.025)]
    (_, _, _), k0, _ = max(tries, key=lambda c: c[0][0])
    tries = [(best_at(inkhi, scaled(t, kx, ky)["outline"], win), kx, ky)
             for kx in np.arange(k0 - 0.04, k0 + 0.041, 0.01) for ky in np.arange(k0 - 0.04, k0 + 0.041, 0.01)]
    (score, py, px), kx, ky = max(tries, key=lambda c: c[0][0])
    return score, py, px, scaled(t, kx, ky)


def measure(job):
    images, page, lines, t = job
    a = alpha(images, page)
    H, W = a.shape
    s = W / 1024
    inkhi = (a > MATCH).astype(np.float32)
    ink = a > INK
    out = []
    for l in lines_of(lines[str(page)]):
        b0, b1 = max(0, int(np.floor(l["top"] * s))), min(H, int(np.ceil(l["bot"] * s)))
        for k, (m0, m1) in enumerate(l["markers"]):
            win = (max(0, int((l["top"] - 16) * s)), min(H, int((l["bot"] + 16) * s)),
                   max(0, int((min(m0, m1) - 50) * s)), min(W, int((max(m0, m1) + 60) * s)))
            score, py, px, tt = locate(inkhi, t, win)
            # The marker's area (its ornament and digits), grown about a unit (on a canvas with room for it).
            g = math.ceil(1.2 * s)
            th, tw = tt["area"].shape
            region = np.zeros((H + 2 * g, W + 2 * g), bool)
            region[py:py + th + 2 * g, px:px + tw + 2 * g] = ndimage.binary_dilation(np.pad(tt["area"], g), iterations=g)
            region = region[g:H + g, g:W + g]
            # A sajdah sign beside the ring (the opening keeps it too): tall, as tall as the ring at most, close by.
            ry = np.where(region.any(axis=1))[0]
            rx = np.where(region.any(axis=0))[0]
            w0, w1 = max(0, rx[0] - int(100 * s)), min(W, rx[-1] + 1 + int(100 * s))
            solid = (a > MATCH)[b0:b1, w0:w1]
            lab, n = ndimage.label(solid & ~region[b0:b1, w0:w1], structure=np.ones((3, 3)))
            sajdah = False
            for j, (yy, xx) in enumerate(ndimage.find_objects(lab)):
                h, w = (yy.stop - yy.start) / s, (xx.stop - xx.start) / s
                top, bottom, left, right = b0 + yy.start, b0 + yy.stop, w0 + xx.start, w0 + xx.stop
                near = min(abs(left - (rx[-1] + 1)), abs(rx[0] - right)) / s <= 35
                if 25 <= h and 12 <= w <= 60 and near and top >= ry[0] - 5 * s and bottom <= ry[-1] + 1 + 5 * s \
                        and min(right, m1 * s) - max(left, m0 * s) > 0.5 * (right - left):
                    sign = lab == j + 1  # with its faint edge (never a touching word's solid ink)
                    edge = ndimage.binary_dilation(sign, iterations=math.ceil(0.8 * s)) & ink[b0:b1, w0:w1] & ~solid
                    region[b0:b1, w0:w1] |= sign | edge
                    sajdah = True
            mine = (ink & region)[b0:b1]
            other = (ink & ~region)[b0:b1]
            cols = np.where(mine.any(axis=0))[0]
            x0, x1 = cols[0] / s, (cols[-1] + 1) / s
            oc = np.where(other.any(axis=0))[0]
            left, right = oc[oc < cols[0]], oc[oc > cols[-1]]
            gap_l = (cols[0] - (left.max() + 1)) / s if left.size else 99.0
            gap_r = (right.min() - (cols[-1] + 1)) / s if right.size else 99.0
            # Against the opening in the file: marker ink under a cover, and other ink in the opening (beside the
            # marker, which a narrower opening would hide, and over or under it, which none can).
            # A column is open if its centre is in the opening (where a cover's edge mostly falls). The originals count
            # any ink that shows; the smaller sets only solid ink, since scaling down spreads a faint pixel of fringe
            # across every edge.
            c0, c1 = int(np.floor(m0 * s + 0.5)), int(np.floor(m1 * s + 0.5))
            seen = a[b0:b1] > (INK if W >= ORIGINAL_WIDTH else MATCH)
            mine_cols = (mine & seen).any(axis=0)
            other_cols = (other & seen).any(axis=0)
            n = mine_cols.size
            clipped = [mine_cols[:max(0, c0)].sum() / s, mine_cols[min(n, c1):].sum() / s]
            beside = [other_cols[max(0, c0):cols[0]].sum() / s, other_cols[cols[-1] + 1:max(0, c1)].sum() / s]
            over = other_cols[max(cols[0], c0):min(cols[-1] + 1, c1)].sum() / s
            # In a smaller set, a marker within two pixels of the next ink shares its blurred edge with it whatever the
            # opening (and the two can't be told apart there, by a pixel more): up to three pixels on that side pass.
            if W < ORIGINAL_WIDTH:
                for side, gap in enumerate((gap_l, gap_r)):
                    if gap * s < 2:
                        clipped[side] = max(0.0, clipped[side] - 3 / s)
                        beside[side] = max(0.0, beside[side] - 3 / s)
            out.append(dict(page=page, line=int(l["line"]), k=k, at=l["at"], hole=[m0, m1], ink=[round(x0, 2), round(x1, 2)],
                            gap=[round(gap_l, 2), round(gap_r, 2)], score=round(score, 3), sajdah=sajdah,
                            clipped=round(float(sum(clipped)), 2), beside=round(float(sum(beside)), 2), over=round(float(over), 2)))
    return out


def opening(r):
    """The marker's ink with room beside it (half the gap to the next ink, at most PAD), to a tenth, outwards."""
    x0, x1 = r["ink"]
    pad_l = min(PAD, r["gap"][0] / 2)
    pad_r = min(PAD, r["gap"][1] / 2)
    return [math.floor((x0 - pad_l - 0.01) * 10) / 10, math.ceil((x1 + pad_r + 0.01) * 10) / 10]


def main():
    images = Path(sys.argv[1])
    write = "--write" in sys.argv
    lines = json.loads(LINES_FILE.read_text())
    t = make_template(images, lines)
    with ProcessPoolExecutor() as ex:
        results = [r for rs in ex.map(measure, [(images, p, lines, t) for p in range(1, 605)]) for r in rs]
    if "--dump" in sys.argv:
        Path(sys.argv[sys.argv.index("--dump") + 1]).write_text(json.dumps(results, default=float))
    sajdah = sorted({r["page"] for r in results if r["sajdah"]})
    if sajdah != SAJDAH_PAGES:
        print("sajdah signs found on pages", sajdah, "not", SAJDAH_PAGES)
        sys.exit(1)
    weak = [r for r in results if r["score"] < 0.8]
    if weak:
        print("markers not found well (check by eye):", ", ".join(f"{r['page']}:{r['line']} ({r['score']})" for r in weak))
        sys.exit(1)
    if write:
        for r in results:
            flat = lines[str(r["page"])]
            i = r["at"] + 8 + 2 * r["k"]
            flat[i], flat[i + 1] = [int(v) if v == int(v) else v for v in opening(r)]
        LINES_FILE.write_text(json.dumps(lines, separators=(",", ":")))
        print(f"refitted {len(results)} markers in {LINES_FILE.name}")
        return
    clipped = [r for r in results if r["clipped"] > 0]
    beside = [r for r in results if r["beside"] > 0]
    over = [r for r in results if r["over"] > 0]
    touching = [r for r in results if min(r["gap"]) == 0]
    print(f"{len(results)} markers on 604 pages; {sum(r['sajdah'] for r in results)} with a sajdah sign; "
          f"{len(touching)} touch a word; {len(over)} share columns with a word's ink (shown in any opening), "
          f"up to {max([r['over'] for r in over] or [0]):.1f} units")
    if clipped:
        amounts = sorted(r["clipped"] for r in clipped)
        print(f"{len(clipped)} marker(s) clipped by a cover, by up to {amounts[-1]:.1f} units (median {amounts[len(amounts) // 2]:.1f}):",
              ", ".join(f"{r['page']}:{r['line']}" for r in clipped[:30]), "…" if len(clipped) > 30 else "")
    if beside:
        print(f"{len(beside)} opening(s) show a word's ink beside their marker:",
              ", ".join(f"{r['page']}:{r['line']} ({r['beside']:.1f})" for r in beside[:30]), "…" if len(beside) > 30 else "")
    if clipped or beside:
        sys.exit(1)
    print("no marker is clipped, and no opening shows a word's ink beside its marker")


if __name__ == "__main__":
    main()
