#!/usr/bin/env python3
"""Check (or refit) every word's box on the 1405 pages, against the page images.

A word's box (x0, x1 in src/data/quranWords.dat, 1024-wide bounds space; its line's band gives y) is what Recite draws
on a page: the hidden view leaves the words recited open and covers the rest (lib/recite/hiddenPage), and the box that
follows the reciter and the mistakes' highlights use it (lib/reciteLive/geometry). The boxes came from glyph data, not
from the images the app shows (the GovarJabbar mirror), and sat 2 to 12 units off the words' ink, some far more: where a
box ended inside its word, the next word's cover hid the end of it (Majd, Nov 21 2026: "some are fine but others get
partially cut off"; the verse markers had the same fault until check-page-markers.py, Nov 15).

Which ink is whose. Each piece of ink (a letter group, a dot, a haraka, a small waqf sign) goes to the line whose cover
rows hold its middle, then to a word:
  - Bodies (letter groups) in reading order, each word taking the next run of them: the runs that sit best in the
    words' boxes. A box nested in its neighbour's (450:14, 350:14) still gets its own.
  - Marks (dots, harakat, waqf signs) go to the body they sit over or under; one in a gap between bodies (a silah's small
    waw or yeh) by the boxes.
  - Two words whose ink touches (a waw's tail on the next word's ba: 217:9 كذبوا به, 21:6 ءامنتم به) are one piece. A
    piece that crosses the boundary between two glyph boxes by REACH or more on both sides is split at its thinnest
    column near there, if that column is a junction (at most THIN of the band in ink).
  - A verse marker's opening (pageLines.json, fitted by check-page-markers.py) is always open, so what is in it is no
    word's. A sajdah's overline (all 15) is no word's either, nor a quarter's sign ۞: each of the 199 is found by its
    shape before the ayah quranWaqf.json says it starts, and taken out like a marker. A sign not found fails the run.
  The boxes that steer this start as the glyph data's (from git, GLYPH_REF), then are the fitted ones, until nothing
  moves: the same every run, whatever the file holds.

Then, as the app lays out a hidden page (hiddenPage.ts, word by word), over the rows a cover takes:
  1. cut: with a word shown and every other word hidden, none of its ink is under a cover;
  2. shows: with a word hidden and every other word shown, none of its ink is in another word's opening, or past its
     line's ends (pageLines.json's x0, x1: a cover runs only between them).
Two words whose ink shares columns (a kaf's top stroke over the word before) can't both be whole with straight-edged
covers. Their boxes meet at the column that leaves the least ink on the wrong side, and the ink beyond that shared edge
is counted, never failed.

--write sets each box to its word's ink with half the gap to the next ink on each side (at most PAD), rounded outwards
to a tenth (two words that share columns meet at that best column), and widens a line's ends in pageLines.json to its
words' boxes. Only from the originals.

  python3 -m venv /tmp/wb && /tmp/wb/bin/pip install pillow numpy scipy
  mkdir -p /tmp/mushaf && cd /tmp/mushaf && seq -f "%03g" 1 604 | xargs -P 12 -I{} \\
    curl -s -o {}.png https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/{}.png
  (Android's sets: the same with mushaf/w1080/{}.png and mushaf/w1440/{}.png, each in its own folder)
  /tmp/wb/bin/python scripts/check-word-boxes.py /tmp/mushaf                      # check
  /tmp/wb/bin/python scripts/check-word-boxes.py /tmp/mushaf --write              # refit the boxes
  /tmp/wb/bin/python scripts/check-word-boxes.py /tmp/w1080 --like /tmp/mushaf    # check an Android set
  (--pages 2,50-52 some pages, --workers N processes (default 4; each about 500 MB), --dump FILE what was measured
  per word, as JSON)

The Android sets (w1080, w1440: the originals scaled down) pass the same check counting solid ink only (scaling down
spreads a faint pixel across every edge), with a pixel allowed each side. Which word a pixel is comes from the originals
(--like): scaled down, touching words merge further and can't be told apart (123:8 and 447:11 did). Only the 1405 print
has Recite (MushafEdition.reciteData).

Run it after the word data (scripts/build-quran-words.py on feature/mistake-detection), the page lines or the images
change. A rebuilt word data file holds new glyph boxes: point GLYPH_REF at that commit.

Nov 22 2026, the glyph data's boxes: 65,027 of 77,429 words cut by a cover (by up to 129 units, median 2), 8,182 shown
in another's opening.
"""
import json
import math
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage, signal

ROOT = Path(__file__).resolve().parent.parent
WORDS_FILE = ROOT / "src" / "data" / "quranWords.dat"
LINES_FILE = ROOT / "src" / "data" / "pageLines.json"
# The last commit whose word data holds the glyph data's boxes (the fit starts from them).
GLYPH_REF = "07fbe5df"
# Ink: any pixel that shows (antialiased edges included), light or dark theme.
INK = 24
# Solid ink (the smaller sets).
SOLID = 96
ORIGINAL_WIDTH = 2600
# Room left beside a word's ink, if the next ink allows it (units of the 1024 width).
PAD = 1.5
# What hiddenPage.ts grows a hidden word's box by, word by word (WORD_EDGE there).
EDGE = 0
# Ink allowed on the wrong side of a box (units): under a tenth of a unit is rounding.
TOL = 0.1
# A body: a piece of ink at least this tall or wide (a share of its line's band's height), or with this much ink (a
# share of the band's height squared): dots, harakat and waqf signs are less. A low word (بِهِ, 55 px of a 256 px band)
# is a body by its ink.
BODY = 0.16
WIDE = 0.25
AREA = 0.012
# What a word with no body of its own costs the reading-order fit (it is reported).
EMPTY = 500
# Touching words: a piece crossing a glyph boundary by REACH units on both sides is split at its thinnest column within
# WINDOW of the boundary, if that column's ink is at most THIN of the band (a junction, not a letter's stroke). Glyph
# boxes further apart than ABUT give no boundary (the data is broken there).
REACH = 12
WINDOW = 14
THIN = 0.07
ABUT = 8
# The most passes for which ink is whose to settle.
ROUNDS = 5
# The quarter signs (۞, rub' al-hizb): before the first words quranWaqf.json lists (from Tanzil's text). Each is found
# by its shape (a clean one, before 12:7 on page 236, is the template) right of that word, or at the end of the line
# before, and taken out like a marker.
WAQF_FILE = ROOT / "src" / "data" / "quranWaqf.json"
STAR_AT = (236, 5, 485, 545)
STAR_SCORE = 0.85
# The 15 sajdah ayahs' pages: each has an overline over its word.
SAJDAH_PAGES = [176, 251, 272, 293, 309, 334, 341, 365, 379, 416, 454, 480, 528, 589, 597]


def lines_of(flat):
    i, out = 0, []
    while i + 8 <= len(flat):
        n = int(flat[i + 7])
        out.append(dict(at=i, line=int(flat[i]), y0=flat[i + 1], y1=flat[i + 2], top=flat[i + 3], bot=flat[i + 4],
                        x0=flat[i + 5], x1=flat[i + 6], markers=[(flat[i + 8 + 2 * m], flat[i + 9 + 2 * m]) for m in range(n)]))
        i += 8 + 2 * n
    return out


def word_refs(data):
    """Each word's (sura, ayah, position), in mushaf order."""
    ayahs = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77,
             227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62,
             55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29,
             19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6]
    refs, v = [], 0
    for sura, n in enumerate(ayahs, start=1):
        for ayah in range(1, n + 1):
            refs += [(sura, ayah, p) for p in range(1, data["counts"][v] + 1)]
            v += 1
    return refs


def spans_minus(span, holes):
    """[a, b] less the holes, as a list of spans."""
    out, at = [], span[0]
    for h0, h1 in sorted(holes):
        if h1 <= at:
            continue
        if h0 >= span[1]:
            break
        if h0 > at:
            out.append((at, h0))
        at = max(at, h1)
    if at < span[1]:
        out.append((at, span[1]))
    return out


def cols_in(cols, spans, s):
    """How many of the ink columns (pixel indices) have their centre in the spans, in units."""
    if not spans or cols.size == 0:
        return 0.0
    centre = (cols + 0.5) / s
    inside = np.zeros(cols.size, bool)
    for a, b in spans:
        inside |= (centre > a) & (centre < b)
    return float(inside.sum()) / s


def alpha(images, page):
    return np.asarray(Image.open(images / f"{page:03d}.png").convert("RGBA"))[:, :, 3]


def cover_rows(l, s, H):
    return max(0, int(math.floor(l["top"] * s))), min(H, int(math.ceil(l["bot"] * s)))


def piece(lab, k, r0, r1, lo, hi, s, band):
    """A piece of ink (label k, its columns [lo, hi) in the cover rows): where it is and whether it is a body; None if
    it has no pixels there."""
    sub = lab[r0:r1, lo:hi] == k + 1
    yy, xx = np.nonzero(sub)
    if yy.size == 0:
        return None
    h, wd = yy.max() - yy.min() + 1, xx.max() - xx.min() + 1
    return dict(k=k, lo=lo, hi=hi, cx=(xx.mean() + lo + 0.5) / s, x0=(xx.min() + lo) / s, x1=(xx.max() + lo + 1) / s,
                h=h, wd=wd, body=h >= BODY * band or wd >= WIDE * band or yy.size >= AREA * band * band, cols=sub.sum(axis=0))


def star_template(images):
    """The quarter sign's ink (its ring, points and centre), from a clean one."""
    page, line, x0, x1 = STAR_AT
    a = alpha(images, page)
    s = a.shape[1] / 1024
    l = next(x for x in lines_of(json.loads(LINES_FILE.read_text())[str(page)]) if x["line"] == line)
    r0, r1 = cover_rows(l, s, a.shape[0])
    ink = a[r0:r1, int(x0 * s):int(x1 * s)] > INK
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    biggest = 1 + int(np.argmax(ndimage.sum(ink, lab, np.arange(1, n + 1))))
    ys, xs = ndimage.find_objects(lab)[biggest - 1]
    return ink[ys, xs]


def find_star(ink, tpl, r0, r1, c0, c1):
    """The quarter sign's best place in ink[r0:r1, c0:c1]: (score, top, left, template at its size)."""
    win = ink[r0:r1, c0:c1].astype(np.float32)
    best = (-1.0, 0, 0, tpl)
    for k in [1.0] + [round(x, 2) for x in np.arange(0.8, 1.21, 0.05) if abs(x - 1) > 1e-9]:
        tk = tpl if k == 1.0 else np.asarray(Image.fromarray(tpl.astype(np.uint8) * 255).resize(
            (max(1, round(tpl.shape[1] * k)), max(1, round(tpl.shape[0] * k))), Image.BILINEAR)) > 127
        if win.shape[0] < tk.shape[0] or win.shape[1] < tk.shape[1]:
            continue
        corr = signal.fftconvolve(win, tk[::-1, ::-1].astype(np.float32), mode="valid")
        iy, ix = np.unravel_index(np.argmax(corr), corr.shape)
        score = float(corr[iy, ix] / tk.sum())
        if score > best[0]:
            best = (score, r0 + iy, c0 + ix, tk)
        if best[0] >= 0.95:
            break
    return best


def pieces_of(a, page, lines, glyph_by_line, stars=(), tpl=None):
    """Per line: its cover rows and its pieces (touching words split at glyph boundaries); the overlines; the labels."""
    H, W = a.shape
    s = W / 1024
    ink = a > INK
    # Verse markers are always open (their openings are fitted by check-page-markers.py): their ink, and any word's
    # beside or over them there, needs no word's box. Taken out first, so a word touching a marker (577:12) is a piece
    # of its own.
    for l in lines:
        r0, r1 = cover_rows(l, s, H)
        for m0, m1 in l["markers"]:
            ink[r0:r1, max(0, int(math.floor(m0 * s))):min(W, int(math.ceil(m1 * s)))] = False
    # The quarter signs, taken out like markers (one touching its word, 384:5, leaves the word a piece of its own).
    quarters, missed = [], []
    by_number = {l["line"]: l for l in lines}
    for line, gx0, gx1 in stars:
        found = None
        for l, c0, c1 in ((by_number.get(line), gx1 - 60, gx1 + 90), (by_number.get(line - 1), None, None)):
            if l is None:
                continue
            if c0 is None:  # the end of the line before
                c0, c1 = l["x0"] - 10, l["x0"] + 90
            r0, r1 = cover_rows(l, s, H)
            r0, r1 = max(0, r0 - int(15 * s)), min(H, r1 + int(15 * s))
            score, py, px, tk = find_star(ink, tpl, r0, r1, max(0, int(c0 * s)), min(W, int(c1 * s)))
            if score >= STAR_SCORE:
                found = (l["line"], py, px, tk, score)
                break
        if found is None:
            missed.append((page, line))
            continue
        line_, py, px, tk, score = found
        mask = ndimage.binary_dilation(np.pad(tk, 3), iterations=3)
        y0, x0 = py - 3, px - 3
        sub = ink[max(0, y0):y0 + mask.shape[0], max(0, x0):x0 + mask.shape[1]]
        sub &= ~mask[max(0, -y0):max(0, -y0) + sub.shape[0], max(0, -x0):max(0, -x0) + sub.shape[1]]
        quarters.append((page, line_, round(px / s, 1), round((px + tk.shape[1]) / s, 1), round(score, 3)))
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    mass = ndimage.center_of_mass(ink, lab, np.arange(1, n + 1))
    out, overlines, splits = [], [], []
    for l in lines:
        r0, r1 = cover_rows(l, s, H)
        band = (l["y1"] - l["y0"]) * s
        glyph = glyph_by_line.get(l["line"], [])
        if not glyph:
            continue
        # Glyph boundaries between words in reading order (each word's box abutting the next's, on its left).
        bounds = [(g1[0] + g2[1]) / 2 for g1, g2 in zip(glyph, glyph[1:]) if abs(g1[0] - g2[1]) <= ABUT]
        pieces = []
        for k in range(n):
            ys, xs = objs[k]
            cy = mass[k][0]
            if not (r0 <= cy < r1) or (ys.stop - ys.start) > 2.5 * band:
                continue
            p = piece(lab, k, r0, r1, xs.start, xs.stop, s, band)
            if p is None:
                continue
            # A sajdah's overline: long and thin, over its words (no word's own: a cover may take part of it).
            if p["wd"] >= 25 * s and p["h"] <= 0.12 * band and p["wd"] >= 6 * p["h"]:
                overlines.append((page, l["line"], round(p["x0"], 1), round(p["x1"], 1)))
                continue
            # Touching words: split at a junction near each glyph boundary it crosses well.
            todo, done, used = [p], [], set()
            while todo:
                q = todo.pop()
                cut = None
                if q["body"]:
                    for b in bounds:
                        if b not in used and q["x0"] + REACH <= b <= q["x1"] - REACH:
                            c0 = max(q["lo"] + 1, int((b - WINDOW) * s))
                            c1 = min(q["hi"] - 1, int((b + WINDOW) * s))
                            if c1 <= c0:
                                continue
                            seg = q["cols"][c0 - q["lo"]:c1 - q["lo"]]
                            c = c0 + int(np.argmin(seg))
                            if seg.min() <= THIN * band:
                                cut = c
                                used.add(b)
                                break
                if cut is None:
                    done.append(q)
                    continue
                left = piece(lab, q["k"], r0, r1, q["lo"], cut, s, band)
                right = piece(lab, q["k"], r0, r1, cut, q["hi"], s, band)
                splits.append((page, l["line"], round(cut / s, 1)))
                todo += [x for x in (left, right) if x is not None]
            pieces += done
        # What is left of a quarter's sign (an edge the template missed) is the sign's too.
        here = [(q[2] - 2, q[3] + 2) for q in quarters if q[1] == l["line"]]
        pieces = [p for p in pieces if not any(q0 <= p["x0"] and p["x1"] <= q1 for q0, q1 in here)]
        out.append(dict(line=l, rows=(r0, r1), pieces=pieces))
    return out, overlines + [("quarter",) + q for q in quarters] + [("missed",) + m for m in missed], splits, lab


def assign(pieces, guide):
    """Which word each piece is (by index into `guide`, the words' boxes in reading order), and which words have no body."""
    N = len(guide)
    outside = lambda x, j: max(0.0, guide[j][0] - x, x - guide[j][1])
    # Bodies in reading order (right to left), each word taking the next run of them: the runs that sit best in the
    # words' boxes.
    bodies = sorted((i for i, p in enumerate(pieces) if p["body"]), key=lambda i: -pieces[i]["cx"])
    K = len(bodies)
    cost = [[outside(pieces[b]["cx"], j) + 0.01 * abs(pieces[b]["cx"] - (guide[j][0] + guide[j][1]) / 2) for b in bodies]
            for j in range(N)]
    INF = float("inf")
    dp = [[INF] * (K + 1) for _ in range(N + 1)]
    back = [[0] * (K + 1) for _ in range(N + 1)]
    dp[0][0] = 0.0
    for j in range(1, N + 1):
        cum = [0.0]
        for b in range(K):
            cum.append(cum[-1] + cost[j - 1][b])
        run, arg = INF, 0
        for e in range(K + 1):
            # A word with no body of its own: allowed (and reported) at a high cost.
            dp[j][e], back[j][e] = dp[j - 1][e] + EMPTY, e
            if e > 0 and dp[j - 1][e - 1] - cum[e - 1] < run:
                run, arg = dp[j - 1][e - 1] - cum[e - 1], e - 1
            if run + cum[e] < dp[j][e]:
                dp[j][e], back[j][e] = run + cum[e], arg
    owner = [None] * len(pieces)
    body = [None] * N
    e = K
    for j in range(N, 0, -1):
        b0 = back[j][e]
        for b in bodies[b0:e]:
            owner[b] = j - 1
            p, x = pieces[b], body[j - 1]
            body[j - 1] = (p["x0"], p["x1"]) if x is None else (min(x[0], p["x0"]), max(x[1], p["x1"]))
        e = b0
    # Marks by the body they sit over or under; one in a gap between bodies (a silah's small waw or yeh, a haraka past
    # its letter), or over two, by the boxes of those words, else the nearest body.
    spans = [b if b is not None else guide[j] for j, b in enumerate(body)]
    near = lambda x, j: max(0.0, spans[j][0] - x, x - spans[j][1])
    for i, p in enumerate(pieces):
        if p["body"]:
            continue
        over = [j for j in range(N) if near(p["cx"], j) == 0]
        if len(over) == 1:
            owner[i] = over[0]
            continue
        if not over:
            # The nearest bodies either side of the gap (every word whose body ends there, if several do).
            left = [j for j in range(N) if spans[j][1] < p["cx"]]
            right = [j for j in range(N) if spans[j][0] > p["cx"]]
            lx = max((spans[j][1] for j in left), default=None)
            rx = min((spans[j][0] for j in right), default=None)
            over = [j for j in left if spans[j][1] == lx] + [j for j in right if spans[j][0] == rx]
        inbox = [j for j in over if outside(p["cx"], j) == 0]
        owner[i] = inbox[0] if len(inbox) == 1 else min(over, key=lambda j: (near(p["cx"], j), outside(p["cx"], j)))
    return owner, [b is None for b in body]


def pixels(lab, r0, r1, pieces, owner, j):
    """Word j's pixels (rows, columns) in the cover rows."""
    ys, xs = [], []
    for i, p in enumerate(pieces):
        if owner[i] == j:
            yy, xx = np.nonzero(lab[r0:r1, p["lo"]:p["hi"]] == p["k"] + 1)
            ys.append(yy + r0)
            xs.append(xx + p["lo"])
    return (np.concatenate(ys), np.concatenate(xs)) if ys else (None, None)


def keep_ink(w, ys, xs, seen, s):
    """A word's ink from its pixels: per column (sparse: from its first column), the columns that show, its extent."""
    if ys is None or ys.size == 0:
        w.update(c0=0, hist=np.zeros(0, np.int32), vis=np.zeros(0, int), ink=None)
        return
    c0, c1 = int(xs.min()), int(xs.max()) + 1
    w["c0"], w["hist"] = c0, np.bincount(xs - c0, minlength=c1 - c0).astype(np.int32)
    w["vis"] = np.unique(xs[seen[ys, xs]])
    w["ink"] = (c0 / s, c1 / s)


def window(w, lo, hi):
    """A word's ink per column over columns [lo, hi)."""
    out = np.zeros(hi - lo, np.int32)
    a, b = max(lo, w["c0"]), min(hi, w["c0"] + w["hist"].size)
    if b > a:
        out[a - lo:b - lo] = w["hist"][a - w["c0"]:b - w["c0"]]
    return out


def fit_line(l, ws, s):
    """Each word's fitted box: its ink with room beside it; two words sharing columns meet at the best column."""
    items = [dict(kind="word", w=w, x0=w["ink"][0], x1=w["ink"][1]) for w in ws if w["ink"]]
    items += [dict(kind="marker", x0=m0, x1=m1) for m0, m1 in l["markers"]]
    items.sort(key=lambda it: (it["x0"] + it["x1"]) / 2)
    for w in ws:
        w["fit"] = None
        if w["ink"]:
            w["fit"] = [w["ink"][0] - PAD, w["ink"][1] + PAD]
            w["shared"] = [False, False]  # an edge met by the next word's (not rounded)
    for L, R in zip(items, items[1:]):
        gap = R["x0"] - L["x1"]
        if gap >= 0:
            if L["kind"] == "word":
                L["w"]["fit"][1] = L["x1"] + min(PAD, gap / 2)
            if R["kind"] == "word":
                R["w"]["fit"][0] = R["x0"] - min(PAD, gap / 2)
        elif L["kind"] == "word" and R["kind"] == "word":
            lw, rw = L["w"], R["w"]
            lo, hi = int(math.floor(R["x0"] * s)), int(math.ceil(L["x1"] * s))
            # The edge c that leaves the least ink on the wrong side: the left word's at or right of c, the right word's
            # left of c (by pixels: a thin tail weighs less than a letter).
            lm, rm = window(lw, lo, hi + 1), window(rw, lo, hi + 1)
            best, cost = lo, None
            for c in range(lo, hi + 1):
                cc = int(lm[c - lo:].sum()) + int(rm[:c - lo].sum())
                if cost is None or cc < cost:
                    best, cost = c, cc
            edge = round(best / s, 1)
            lw["fit"][1], lw["shared"][1] = edge, True
            rw["fit"][0], rw["shared"][0] = edge, True
        # A word over a marker: the marker's opening is fixed (check-page-markers.py); nothing to fit.
    for w in ws:
        if w["fit"]:
            x0, x1 = w["fit"]
            w["fit"] = (x0 if w["shared"][0] else math.floor((x0 - 1e-6) * 10) / 10,
                        x1 if w["shared"][1] else math.ceil((x1 + 1e-6) * 10) / 10)


def measure(job):
    """One page: each word's ink and fitted box at the originals' size, then (a smaller set) its ink there."""
    images, like, page, page_words, flat_lines, stars, tpl = job
    lines = lines_of(flat_lines)
    orig = alpha(like or images, page)
    s = orig.shape[1] / 1024
    by_line = {}
    for w in page_words:
        by_line.setdefault(w["line"], []).append(w)
    out, overlines, splits, lab = pieces_of(orig, page, lines, {k: [w["glyph"] for w in ws] for k, ws in by_line.items()},
                                            stars, tpl)
    seen = orig > INK
    for pl in out:
        l, (r0, r1), pieces = pl["line"], pl["rows"], pl["pieces"]
        ws = [dict(w) for w in by_line[l["line"]]]
        guide = [w["glyph"] for w in ws]
        for _ in range(ROUNDS):
            owner, nobody = assign(pieces, guide)
            for j, w in enumerate(ws):
                keep_ink(w, *pixels(lab, r0, r1, pieces, owner, j), seen, s)
                w["nobody"] = nobody[j]
            fit_line(l, ws, s)
            settled = [w["fit"] or w["glyph"] for w in ws]
            if settled == guide:
                break
            guide = settled
        pl["owner"], pl["words"] = owner, ws
    if like is None:
        for pl in out:
            del pl["pieces"], pl["owner"]
        return page, orig.shape[1], s, out, overlines, splits
    # A smaller set: which word a pixel is comes from the originals. A pixel goes to the word with most ink in the
    # original pixels it was made from; a solid pixel with none (the scaling's spread) to the nearest word's within a
    # pixel.
    a = alpha(images, page)
    H, W = a.shape
    r = W / orig.shape[1]
    s_small = W / 1024
    seen = a > SOLID
    for pl in out:
        l, (o0, o1), pieces, owner = pl["line"], pl["rows"], pl["pieces"], pl["owner"]
        r0, r1 = cover_rows(l, s_small, H)
        rows = r1 - r0
        best = np.zeros((rows, W), np.int32)
        who = np.full((rows, W), -1, np.int32)
        for j, w in enumerate(pl["words"]):
            ys, xs = pixels(lab, o0, o1, pieces, owner, j)
            if ys is None:
                continue
            yy = np.floor(ys * r).astype(int) - r0
            xx = np.floor(xs * r).astype(int)
            ok = (yy >= 0) & (yy < rows) & (xx < W)
            counts = np.bincount(yy[ok] * W + xx[ok], minlength=rows * W).reshape(rows, W)
            take = counts > best
            best[take], who[take] = counts[take], j
        if (who < 0).all():
            continue
        dist, (iy, ix) = ndimage.distance_transform_edt(who < 0, return_indices=True)
        near = np.where((who < 0) & (dist <= 1.5), who[iy, ix], who)
        solid = seen[r0:r1]
        for j, w in enumerate(pl["words"]):
            yy, xx = np.nonzero(solid & (near == j))
            keep_ink(w, yy + r0, xx, seen, s_small)
    for pl in out:
        del pl["pieces"], pl["owner"]
    return page, W, s_small, out, overlines, splits


def check_line(l, ws, s, boxes_of, span):
    """cut, shows and what of each is ink beyond an edge two words share (counted, not failed), laid out as
    hiddenPage.ts does, with the boxes given."""
    for w in ws:
        box = boxes_of(w)
        others = [boxes_of(o) for o in ws if o is not w]
        # Shown, the rest hidden: what of its ink a cover takes (markers are always open).
        opened = spans_minus(box, [(o[0] - EDGE, o[1] + EDGE) for o in others])
        covered = spans_minus(span, list(l["markers"]) + opened)
        w["cut"] = cols_in(w["vis"], covered, s)
        # Hidden, the rest shown: what of its ink is in another's opening, or past the line's ends.
        hole = (box[0] - EDGE, box[1] + EDGE)
        shown = [sp for o in others for sp in spans_minus(o, [hole])] + [(-1e9, span[0]), (span[1], 1e9)]
        w["shows"] = cols_in(w["vis"], shown, s)
        # Beyond an edge it shares with a neighbour's box (two words whose ink shares columns): in that neighbour's box.
        beyond = [(o[0], box[0]) for o in others if abs(o[1] - box[0]) < 1e-6] + \
                 [(box[1], o[1]) for o in others if abs(o[0] - box[1]) < 1e-6]
        w["shared_ink"] = cols_in(w["vis"], beyond, s)


def main():
    images = Path(sys.argv[1])
    write = "--write" in sys.argv
    arg = lambda name, default: sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default
    pages = list(range(1, 605))
    if "--pages" in sys.argv:
        pages = []
        for part in arg("--pages", "").split(","):
            a, _, b = part.partition("-")
            pages += list(range(int(a), int(b or a) + 1))
    workers = int(arg("--workers", 4))
    like = Path(arg("--like", "")) if "--like" in sys.argv else None
    if alpha(images, pages[0]).shape[1] < ORIGINAL_WIDTH:
        if like is None:
            print("a smaller set is checked with --like <the originals>: which word a pixel is comes from them")
            sys.exit(1)
        if write:
            print("--write fits from the originals only")
            sys.exit(1)
    data = json.loads(WORDS_FILE.read_text())
    glyph = json.loads(subprocess.run(["git", "show", f"{GLYPH_REF}:src/data/quranWords.dat"], cwd=ROOT,
                                      capture_output=True, check=True).stdout)["boxes"]
    lines = json.loads(LINES_FILE.read_text())
    refs = word_refs(data)
    boxes = data["boxes"]
    by_page = {}
    for i in range(len(boxes) // 4):
        p, line, x0, x1 = boxes[4 * i:4 * i + 4]
        by_page.setdefault(p, []).append(dict(i=i, page=p, line=line, file=(x0, x1), glyph=(glyph[4 * i + 2], glyph[4 * i + 3]),
                                              ref=refs[i]))
    waqf = json.loads(WAQF_FILE.read_text())
    stars = {}
    for w in waqf["quarters"]:
        stars.setdefault(glyph[4 * w], []).append((glyph[4 * w + 1], glyph[4 * w + 2], glyph[4 * w + 3]))
    tpl = star_template(like or images)
    jobs = [(images, like, p, by_page.get(p, []), lines[str(p)], stars.get(p, []), tpl) for p in pages]
    with ProcessPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(measure, jobs))
    width = results[0][1]
    words, fitted_lines = [], []
    for page, W, s, page_lines, _, _ in results:
        for pl in page_lines:
            l, ws = pl["line"], pl["words"]
            # The line's ends: as far as its words' fitted boxes reach (a cover runs only between them).
            fitted = [w["fit"] for w in ws if w["fit"]]
            l["fit_x"] = (min([l["x0"]] + [f[0] for f in fitted]), max([l["x1"]] + [f[1] for f in fitted]))
            if write:
                check_line(l, ws, s, lambda w: w["fit"] or w["file"], l["fit_x"])
            else:
                check_line(l, ws, s, lambda w: w["file"], (l["x0"], l["x1"]))
            # A smaller set: a pixel each side (its faint edge, spread by the scaling).
            if W < ORIGINAL_WIDTH:
                for w in ws:
                    w["cut"] = max(0.0, w["cut"] - 2 / s)
                    w["shows"] = max(0.0, w["shows"] - 2 / s)
            for w in ws:
                w.pop("hist", None)
            fitted_lines.append((page, l))
            words += ws
    found_marks = [o for r in results for o in r[4]]
    overlines = [o for o in found_marks if o[0] not in ("quarter", "missed")]
    quarters = [o[1:] for o in found_marks if o[0] == "quarter"]
    missed = [o[1:] for o in found_marks if o[0] == "missed"]
    splits = [x for r in results for x in r[5]]
    missing = [w for w in words if not w["ink"] or w["nobody"] or w["fit"][0] >= w["fit"][1]]
    found = sorted({o[0] for o in overlines})
    expected = [p for p in SAJDAH_PAGES if p in pages]
    label = lambda w: f"{w['page']}:{w['line']} {w['ref'][0]}:{w['ref'][1]}#{w['ref'][2]}"
    if found != expected:
        print("sajdah overlines found on pages", found, "not", expected, overlines)
        sys.exit(1)
    if missed:
        print(f"quarter signs (۞) not found before the first word of an ayah on (page, line): {missed}")
        sys.exit(1)
    print(f"{len(words)} words on {len(pages)} page(s), images {width} wide; {len(overlines)} sajdah overline(s), "
          f"{len(quarters)} quarter sign(s) (۞); "
          f"{len(splits)} touching piece(s) split:", ", ".join(f"{p}:{l}@{x}" for p, l, x in splits[:12]),
          "…" if len(splits) > 12 else "")
    if missing:
        print(f"{len(missing)} word(s) with no ink of their own found:", ", ".join(label(w) for w in missing[:20]))
        sys.exit(1)
    if "--dump" in sys.argv:
        Path(arg("--dump", "")).write_text(json.dumps(
            [dict(page=w["page"], line=w["line"], ref=w["ref"], box=list(w["file"]), glyph=list(w["glyph"]), ink=w["ink"],
                  fit=w["fit"], cut=round(w["cut"], 2), shows=round(w["shows"], 2), shared=round(w["shared_ink"], 2))
             for w in words], default=float))
    if write:
        for w in words:
            x0, x1 = (int(v) if v == int(v) else v for v in w["fit"])
            boxes[4 * w["i"] + 2], boxes[4 * w["i"] + 3] = x0, x1
        WORDS_FILE.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        moved = sum(1 for w in words if tuple(w["file"]) != tuple(w["fit"]))
        # A line's ends widened to its words (pageLines.json: x0, x1 at a line's 5th and 6th values).
        widened = 0
        for page, l in fitted_lines:
            flat = lines[str(page)]
            if (l["fit_x"][0], l["fit_x"][1]) != (flat[l["at"] + 5], flat[l["at"] + 6]):
                widened += 1
                flat[l["at"] + 5], flat[l["at"] + 6] = [int(v) if v == int(v) else v for v in l["fit_x"]]
        LINES_FILE.write_text(json.dumps(lines, separators=(",", ":")))
        print(f"refitted {moved} of {len(words)} word boxes in {WORDS_FILE.name}; widened {widened} line(s) in {LINES_FILE.name}")
    shared = [w for w in words if w["shared_ink"] > 0]
    bad_cut = [w for w in words if w["cut"] - w["shared_ink"] > TOL]
    bad_shows = [w for w in words if w["shows"] - w["shared_ink"] > TOL]
    print(f"{len(shared)} word(s) share columns with the next (straight edges leave up to "
          f"{max([w['shared_ink'] for w in shared] or [0]):.1f} units beyond their shared edge, counted, not failed)")
    for name, bad, key in (("cut by a cover", bad_cut, "cut"), ("shown in another word's opening", bad_shows, "shows")):
        if bad:
            worst = sorted(bad, key=lambda w: -(w[key] - w["shared_ink"]))
            amounts = [w[key] - w["shared_ink"] for w in worst]
            print(f"{len(bad)} word(s) {name}, by up to {amounts[0]:.1f} units (median {amounts[len(amounts) // 2]:.1f}):",
                  ", ".join(f"{label(w)} ({w[key] - w['shared_ink']:.1f})" for w in worst[:20]), "…" if len(bad) > 20 else "")
    if bad_cut or bad_shows:
        sys.exit(1)
    print("no word is cut by a cover, and no word shows in another's opening")


if __name__ == "__main__":
    main()
