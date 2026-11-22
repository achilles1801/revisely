#!/usr/bin/env python3
"""Check (or refit) every word's box on the 1405 pages, against the page images.

A word's box (x0, x1 in src/data/quranWords.dat, 1024-wide bounds space; its line's
band gives y) is what Recite draws on a page: the hidden view leaves the words
recited open and covers the rest (lib/recite/hiddenPage), and the box that follows
the reciter, the mistakes' highlights and taps on a word all use it
(lib/reciteLive/geometry). The boxes came from glyph data, not from the images the
app shows (the GovarJabbar mirror), and sat 2 to 12 units off the words' ink: where
a box ended inside its word, the next word's cover hid the end of it (Majd, Nov 21
2026: "some are fine but others get partially cut off"; the verse markers had the
same fault until check-page-markers.py, Nov 15).

This finds every word's ink in the images: each piece of ink (a letter group, a dot,
a haraka, a small waqf sign) is given to the line whose cover rows hold its middle,
then to a word. Bodies go by where they sit among the boxes; dots and harakat go to
the body they sit over or under (the nearest), so a box a few units off still gets
its own marks. A verse marker's opening (pageLines.json, fitted by
check-page-markers.py) is always open, so what is in it is no word's.

Then, as the app lays out a hidden page (hiddenPage.ts, word by word), over the rows
a cover takes:

  1. cut: with a word shown and every other word hidden, none of its ink is under a
     cover;
  2. shows: with a word hidden and every other word shown, none of its ink is in
     another word's opening.

Two words whose ink shares columns (a tail sweeping under the next word) can't both
be whole with straight-edged covers: their boxes meet at the column that leaves the
least ink on the wrong side, and what is left there is counted, never failed.

--write sets each box to its word's ink with half the gap to the next ink on each
side (at most PAD), rounded outwards to a tenth; two words that share columns meet
at that best column. Only from the originals.

  python3 -m venv /tmp/wb && /tmp/wb/bin/pip install pillow numpy scipy
  mkdir -p /tmp/mushaf && cd /tmp/mushaf && seq -f "%03g" 1 604 | xargs -P 12 -I{} \\
    curl -s -o {}.png https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/{}.png
  (Android's sets: the same with mushaf/w1080/{}.png and mushaf/w1440/{}.png, each in its own folder)
  /tmp/wb/bin/python scripts/check-word-boxes.py /tmp/mushaf            # check
  /tmp/wb/bin/python scripts/check-word-boxes.py /tmp/mushaf --write    # refit the boxes
  (--try checks the boxes --write would write, --pages 2,50-52 checks some pages, --workers N (default 4) caps the processes, --dump FILE writes what was
  measured per word as JSON)

Run it after scripts/build-quran-words.py (which writes the glyph data's boxes again) or any change to the images.

The Android sets (w1080, w1440: the originals scaled down) pass the same check counting solid ink only (scaling
down spreads a faint pixel across every edge), with a pixel allowed on a side where the next ink is within two
pixels (no edge can part them at that size). Only the 1405 print has Recite (MushafEdition.reciteData).
"""
import json
import math
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
WORDS_FILE = ROOT / "src" / "data" / "quranWords.dat"
LINES_FILE = ROOT / "src" / "data" / "pageLines.json"
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
# A body: a piece of ink at least this tall, or this wide, as a share of its line's band (dots, harakat and waqf
# signs are less).
BODY = 0.22
WIDE = 0.35
# What a word with no body of its own costs the reading-order fit (it is reported).
EMPTY = 500
# The 15 sajdah ayahs' pages: each has an overline over its word.
SAJDAH_PAGES = [176, 251, 272, 293, 309, 334, 341, 365, 379, 416, 454, 480, 528, 589, 597]


def lines_of(flat):
    i, out = 0, []
    while i + 8 <= len(flat):
        n = int(flat[i + 7])
        out.append(dict(line=int(flat[i]), y0=flat[i + 1], y1=flat[i + 2], top=flat[i + 3], bot=flat[i + 4],
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


def measure(job):
    images, page, page_words, flat_lines = job
    a = np.asarray(Image.open(images / f"{page:03d}.png").convert("RGBA"))[:, :, 3]
    H, W = a.shape
    s = W / 1024
    original = W >= ORIGINAL_WIDTH
    ink = a > INK
    seen = ink if original else a > SOLID
    lines = lines_of(flat_lines)
    # Verse markers are always open (their openings are fitted by check-page-markers.py): their ink, and any word's
    # beside or over them there, needs no word's box. Taken out first, so a word touching a marker (577:12) is a piece
    # of its own.
    for l in lines:
        r0, r1 = max(0, int(math.floor(l["top"] * s))), min(H, int(math.ceil(l["bot"] * s)))
        for m0, m1 in l["markers"]:
            ink[r0:r1, max(0, int(math.floor(m0 * s))):min(W, int(math.ceil(m1 * s)))] = False
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    objs = ndimage.find_objects(lab)
    idx = np.arange(1, n + 1)
    mass = ndimage.center_of_mass(ink, lab, idx)
    out, overlines = [], []
    for l in lines:
        r0, r1 = max(0, int(math.floor(l["top"] * s))), min(H, int(math.ceil(l["bot"] * s)))
        band = (l["y1"] - l["y0"]) * s
        ws = [w for w in page_words if w["line"] == l["line"]]
        if not ws:
            continue
        # The pieces of ink whose middle is in this line's cover rows.
        pieces = []
        for k in range(n):
            ys, xs = objs[k]
            cy, cx = mass[k]
            if not (r0 <= cy < r1) or (ys.stop - ys.start) > 2.5 * band:
                continue
            sub = lab[r0:r1, xs] == k + 1
            colmass = sub.sum(axis=0)
            if not colmass.any():
                continue
            c = np.where(colmass > 0)[0] + xs.start
            h, wd = ys.stop - ys.start, xs.stop - xs.start
            # A sajdah's overline: long and thin, over its words (no word's own: a cover may take part of it).
            if wd >= 25 * s and h <= 0.12 * band and wd >= 6 * h:
                overlines.append((page, l["line"], round(xs.start / s, 1), round(xs.stop / s, 1)))
                continue
            pieces.append(dict(k=k, cx=cx / s, x0=c[0] / s, x1=(c[-1] + 1) / s,
                               body=h >= BODY * band or wd >= WIDE * band, cols=colmass, c0=xs.start))
        boxes = [(w["x0"], w["x1"]) for w in ws]
        outside = lambda x, j: max(0.0, boxes[j][0] - x, x - boxes[j][1])
        # Bodies in reading order (right to left), each word taking the next run of them: the runs that sit best in
        # the words' boxes (a box nested in its neighbour's, as on 450:14 and 350:14, still gets its own).
        bodies = sorted((p for p in pieces if p["body"]), key=lambda p: -p["cx"])
        K, N = len(bodies), len(ws)
        cost = [[outside(b["cx"], j) + 0.01 * abs(b["cx"] - (boxes[j][0] + boxes[j][1]) / 2) for b in bodies] for j in range(N)]
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
        owner = {}
        body = [None] * N
        e = K
        for j in range(N, 0, -1):
            b0 = back[j][e]
            for b in bodies[b0:e]:
                owner[b["k"]] = j - 1
                x = body[j - 1]
                body[j - 1] = (b["x0"], b["x1"]) if x is None else (min(x[0], b["x0"]), max(x[1], b["x1"]))
            e = b0
        # Marks by the body they sit over or under; one in a gap between bodies (a silah's small waw or yeh, a haraka
        # past its letter), or over two, by the boxes of those words, else the nearest body.
        spans = [b if b is not None else boxes[j] for j, b in enumerate(body)]
        near = lambda x, j: max(0.0, spans[j][0] - x, x - spans[j][1])
        for p in pieces:
            if p["body"]:
                continue
            over = [j for j in range(N) if near(p["cx"], j) == 0]
            if len(over) == 1:
                owner[p["k"]] = over[0]
                continue
            if not over:
                # The bodies either side of the gap.
                left = [j for j in range(N) if spans[j][1] < p["cx"]]
                right = [j for j in range(N) if spans[j][0] > p["cx"]]
                over = ([max(left, key=lambda j: spans[j][1])] if left else []) + ([min(right, key=lambda j: spans[j][0])] if right else [])
            inbox = [j for j in over if outside(p["cx"], j) == 0]
            owner[p["k"]] = inbox[0] if len(inbox) == 1 else min(over, key=lambda j: near(p["cx"], j))
        # Each word's ink, per column, over the cover rows.
        hist = [np.zeros(W, np.int32) for _ in ws]
        for p in pieces:
            j = owner[p["k"]]
            hist[j][p["c0"]:p["c0"] + p["cols"].size] += p["cols"]
        seen_rows = seen[r0:r1]
        for j, w in enumerate(ws):
            cols = np.where(hist[j] > 0)[0]
            # What shows of it: its ink pixels that count as seen in this set.
            if cols.size:
                c0, c1 = cols[0], cols[-1] + 1
                mine = np.zeros((r1 - r0, c1 - c0), bool)
                for p in pieces:
                    if owner[p["k"]] == j:
                        xs = objs[p["k"]][1]
                        mine[:, xs.start - c0:xs.stop - c0] |= lab[r0:r1, xs] == p["k"] + 1
                vis = np.where((mine & seen_rows[:, c0:c1]).any(axis=0))[0] + c0
            else:
                vis = cols
            w["cols"] = cols
            w["vis"] = vis
            w["hist"] = hist[j]
            w["ink"] = (cols[0] / s, (cols[-1] + 1) / s) if cols.size else None
            w["nobody"] = body[j] is None
        out.append(dict(line=l, words=ws))
    return page, W, s, out, overlines


def fit_line(l, ws, s):
    """Each word's fitted box: its ink with room beside it; two words sharing columns meet at the best column."""
    items = [dict(kind="word", w=w, x0=w["ink"][0], x1=w["ink"][1]) for w in ws if w["ink"]]
    items += [dict(kind="marker", x0=m0, x1=m1) for m0, m1 in l["markers"]]
    items.sort(key=lambda it: (it["x0"] + it["x1"]) / 2)
    for w in ws:
        if w["ink"]:
            w["fit"] = [w["ink"][0] - PAD, w["ink"][1] + PAD]
            w["shared"] = [False, False]  # an edge met by the next word's (not rounded)
            w["inherent"] = [0.0, 0.0]  # cut, shows that no straight edge avoids
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
            # left of c (by pixels: a thin tail weighs less than a letter). What is left there is that word's, cut when
            # it is shown and the other hidden, shown in the other's opening the other way round (in columns).
            lm, rm = lw["hist"], rw["hist"]
            best, cost = lo, None
            for c in range(lo, hi + 1):
                cc = int(lm[c:hi + 1].sum()) + int(rm[lo:c].sum())
                if cost is None or cc < cost:
                    best, cost = c, cc
            edge = round(best / s, 1)
            lw["fit"][1], lw["shared"][1] = edge, True
            rw["fit"][0], rw["shared"][0] = edge, True
            for w, wrong in ((lw, (lm[best:hi + 1] > 0).sum() / s), (rw, (rm[lo:best] > 0).sum() / s)):
                w["inherent"][0] += wrong
                w["inherent"][1] += wrong
        # A word over a marker: the marker's opening is fixed (check-page-markers.py); nothing to fit.
    for w in ws:
        if w.get("fit"):
            x0, x1 = w["fit"]
            w["fit"] = [x0 if w["shared"][0] else math.floor((x0 - 1e-6) * 10) / 10,
                        x1 if w["shared"][1] else math.ceil((x1 + 1e-6) * 10) / 10]


def check_line(l, ws, s, boxes_of):
    """cut and shows for each word, laid out as hiddenPage.ts does, with the boxes given."""
    span = (l["x0"], l["x1"])
    for w in ws:
        box = boxes_of(w)
        others = [boxes_of(o) for o in ws if o is not w]
        # Shown, the rest hidden: what of its ink a cover takes (markers are always open).
        opened = spans_minus(box, [(o[0] - EDGE, o[1] + EDGE) for o in others])
        covered = spans_minus(span, list(l["markers"]) + opened)
        w["cut"] = cols_in(w["vis"], covered, s)
        # Hidden, the rest shown: what of its ink is in another's opening.
        hole = (box[0] - EDGE, box[1] + EDGE)
        shown = [sp for o in others for sp in spans_minus(o, [hole])]
        w["shows"] = cols_in(w["vis"], shown, s)


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
    data = json.loads(WORDS_FILE.read_text())
    lines = json.loads(LINES_FILE.read_text())
    refs = word_refs(data)
    boxes = data["boxes"]
    by_page = {}
    for i in range(len(boxes) // 4):
        p, line, x0, x1 = boxes[4 * i:4 * i + 4]
        by_page.setdefault(p, []).append(dict(i=i, page=p, line=line, x0=x0, x1=x1, ref=refs[i]))
    jobs = [(images, p, by_page.get(p, []), lines[str(p)]) for p in pages]
    with ProcessPoolExecutor(max_workers=workers) as ex:
        results = list(ex.map(measure, jobs))
    width = results[0][1]
    if write and width < ORIGINAL_WIDTH:
        print("--write fits from the originals only")
        sys.exit(1)
    words, gaps = [], []
    overlines = [o for r in results for o in r[4]]
    for page, W, s, page_lines, _ in results:
        for pl in page_lines:
            l, ws = pl["line"], pl["words"]
            fit_line(l, ws, s)
            # --try checks the boxes --write would write, without writing them.
            check_line(l, ws, s, (lambda w: tuple(w["fit"]) if w.get("fit") else (w["x0"], w["x1"])) if "--try" in sys.argv
                       else (lambda w: (w["x0"], w["x1"])))
            # A smaller set: a pixel allowed where the next ink is within two pixels.
            if W < ORIGINAL_WIDTH:
                for w in ws:
                    w["cut"] = max(0.0, w["cut"] - 2 / s)
                    w["shows"] = max(0.0, w["shows"] - 2 / s)
            words += ws
    missing = [w for w in words if not w["ink"] or w["nobody"]]
    found = sorted({o[0] for o in overlines})
    expected = [p for p in SAJDAH_PAGES if p in pages]
    if found != expected:
        print("sajdah overlines found on pages", found, "not", expected, overlines)
        sys.exit(1)
    if write:
        if missing:
            print("no ink found for:", ", ".join(f"{w['page']}:{w['line']} {w['ref']}" for w in missing[:30]))
            sys.exit(1)
        for w in words:
            x0, x1 = (int(v) if v == int(v) else v for v in w["fit"])
            boxes[4 * w["i"] + 2], boxes[4 * w["i"] + 3] = x0, x1
        WORDS_FILE.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
        moved = sum(1 for w in words if (w["x0"], w["x1"]) != tuple(w["fit"]))
        print(f"refitted {moved} of {len(words)} word boxes in {WORDS_FILE.name}")
        return
    if "--dump" in sys.argv:
        Path(arg("--dump", "")).write_text(json.dumps(
            [dict(page=w["page"], line=w["line"], ref=w["ref"], box=[w["x0"], w["x1"]], ink=w["ink"], fit=w.get("fit"),
                  cut=round(w["cut"], 2), shows=round(w["shows"], 2), inherent=[round(v, 2) for v in w.get("inherent", [0, 0])])
             for w in words], default=float))
    inherent = [w for w in words if w.get("inherent") and sum(w["inherent"]) > 0]
    bad_cut = [w for w in words if w["cut"] - w.get("inherent", [0, 0])[0] > TOL]
    bad_shows = [w for w in words if w["shows"] - w.get("inherent", [0, 0])[1] > TOL]
    label = lambda w: f"{w['page']}:{w['line']} {w['ref'][0]}:{w['ref'][1]}#{w['ref'][2]}"
    print(f"{len(words)} words on {len(pages)} page(s), images {width} wide; {len(overlines)} sajdah overline(s); "
          f"{len(inherent)} share columns with the next word (straight edges leave up to "
          f"{max([max(w['inherent']) for w in inherent] or [0]):.1f} units on the wrong side, counted, not failed)")
    for name, bad, key, i in (("cut by a cover", bad_cut, "cut", 0), ("shown in another word's opening", bad_shows, "shows", 1)):
        if bad:
            amounts = sorted(w[key] - w.get("inherent", [0, 0])[i] for w in bad)
            worst = sorted(bad, key=lambda w: -(w[key] - w.get("inherent", [0, 0])[i]))
            print(f"{len(bad)} word(s) {name}, by up to {amounts[-1]:.1f} units (median {amounts[len(amounts) // 2]:.1f}):",
                  ", ".join(f"{label(w)} ({w[key]:.1f})" for w in worst[:20]), "…" if len(bad) > 20 else "")
    if missing:
        print(f"{len(missing)} word(s) with no ink of their own found:", ", ".join(label(w) for w in missing[:20]))
    if bad_cut or bad_shows or missing:
        sys.exit(1)
    print("no word is cut by a cover, and no word shows in another's opening")


if __name__ == "__main__":
    main()
