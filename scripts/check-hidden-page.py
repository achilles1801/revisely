#!/usr/bin/env python3
"""Check (or write) what a hidden page needs so it shows no ink but its markers and its words shown, on every page.

A hidden page (RECITE-20) is the page's image with covers in the page's colour (components/reciteLive/HiddenInkLayer's
hiddenInkPlan): over each hidden word's box (its x0..x1 in src/data/quranWords.dat, across its line's cover rows in
src/data/pageLines.json), each shown word's box left open, the verse markers open in their own rows. Majd, Nov 26 2026:
"theres still instances where the white still shows up when the page is hidden like that symbol usually that i circled on
the right like part of it and other letters and symbols show -- we should do a full run through of every page and ensure
that never happens again".

What it does, page by page, for each image set the app shows of the 1405 print (the 1441 print has no hidden view,
MushafEdition.reciteData): the originals (iOS, 2600 wide), w1080 and w1440 (Android):
  1. Whose is each ink pixel. On the originals: the verse markers' (check-page-markers.py's template, a sajdah sign with
     its marker), a quarter sign's ۞ (found by its shape where src/data/quranWaqf.json starts a quarter: it goes with the
     quarter's first word), a surah header's or the basmala's (in a line slot with no verse line: not verse text, never
     covered), or a word's: each piece of ink to the line whose cover rows hold its middle, then whole to the word whose
     box holds most of it (a dot or a haraka by its middle), unless it reaches REACH units into each of two words' boxes
     (two words touching: split at their boxes' edge, as check-word-boxes.py splits them); a crumb of a few pixels goes
     with the stroke it broke from. So a stroke's edge past its own box is still its word's (the wasla over ٱلأعلى on page
     316 reaches half a unit into أنت's box). On a smaller set each visible pixel takes the owner most common among the
     originals' ink under it (a faint fringe past the ink, the nearest ink's); one holding two owners' ink (their edges
     meet in that pixel) is a shared edge, counted, never failed: no cover can split it at that size.
  2. Lays the plan's covers (a copy of hiddenInkPlan, below; --js-plans checks it against the app's own) over the page in
     every reading state: nothing shown; from the page's start to each word; from each word to its end; each word alone;
     every word but one. A hidden word's ink that shows is a leak; a shown word's ink under a cover is a cut. A pixel shows
     when its centre is under no cover and its ink is visible, over INK (about 8% opacity), in every set: the light and
     dark themes tint the same alpha, and the smaller sets' faint fringe counts too.
     A surah header's or the basmala's ink under any cover fails too: they stay visible, only the ayahs' words are
     hidden (Majd, Nov 27 2026: "Keep them visible").
  3. --write: from the leaks and cuts the boxes alone leave (a straight edge can't part two words' ink there), writes
     src/data/hiddenInk.dat: each word's patches (covers over its leaking ink, drawn while it is hidden) and notches
     (holes over its covered ink, cut from the covers while it is shown), each holding that word's ink and no other's (any
     owner's, any set), then checks again.

  python3 -m venv /tmp/hp && /tmp/hp/bin/pip install pillow numpy scipy
  mkdir -p /tmp/mushaf && cd /tmp/mushaf && for s in full w1080 w1440; do mkdir -p $s; p=; [ $s != full ] && p=$s/; \\
    seq -f "%03g" 1 604 | xargs -P 16 -I{} curl -sf -o $s/{}.png \\
    https://storage.googleapis.com/revision-buddy-3a398.firebasestorage.app/mushaf/$p{}.png; done; cd -
  ~/revisely-mistake-lab/.venv/bin/python ~/revisely-mistake-lab/tools/memguard.py --limit-gb 2 -- \
    /tmp/hp/bin/python scripts/check-hidden-page.py /tmp/mushaf             # check (page by page, 2 workers)
  /tmp/hp/bin/python scripts/check-hidden-page.py /tmp/mushaf --write     # rewrite src/data/hiddenInk.dat, then check
  HIDDEN_PLAN_OUT=/tmp/plans.json npx jest src/lib/recite/__tests__/hiddenInk.test.ts -t export
  /tmp/hp/bin/python scripts/check-hidden-page.py /tmp/mushaf --js-plans /tmp/plans.json   # the copy is the app's
  (--before: the plan as it was before Nov 26 2026, a unit open past a shown word's box and no patches or notches;
  --pages 2,316 some pages; --dump FILE the leaks and cuts as JSON; the owners are kept in <images>/.owners/;
  --write-headers rewrites src/lib/recite/__fixtures__/headerInk.json, where the headers' and basmala's ink is, which
  hiddenInk.test keeps every cover clear of)

Run it after the word boxes, the page lines, the marker rows, the plan or the images change; src/lib/recite/__tests__/
hiddenInk.test.ts holds the plan's side on all 604 pages in CI. Memory: it goes page by page, a worker holding one
page (about 400 MB at the originals' size); keep --workers at 2 (the default) under the guard's 2 GB, with nothing
else heavy beside it (the Mac ran short of memory on Nov 26 2026).

Nov 26 2026, every reading state on all 604 pages:
  before (a unit past a shown word's box, no patches or notches): originals 24,906 bits of hidden words' ink showing
  (1,041,459 pixels), on every page, and 5,046 bits of shown words' ink covered; w1080 22,018 and 4,695; w1440 23,763
  and 4,910.
  after (33,068 patches and notches on 603 pages): none of either, in all three sets.
"""
import importlib.util
import json
import math
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("check_page_markers", ROOT / "scripts" / "check-page-markers.py")
cpm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cpm)

LINES_FILE = ROOT / "src" / "data" / "pageLines.json"
ROWS_FILE = ROOT / "src" / "data" / "markerRows.json"
WORDS_FILE = ROOT / "src" / "data" / "quranWords.dat"
WAQF_FILE = ROOT / "src" / "data" / "quranWaqf.json"
INK_FILE = ROOT / "src" / "data" / "hiddenInk.dat"
HEADERS_FILE = ROOT / "src" / "lib" / "recite" / "__fixtures__" / "headerInk.json"
SETS = ["full", "w1080", "w1440"]
# Ink that shows: over about 8% opacity (Majd, Nov 26 2026: "ensure that never happens again"; the orchestrator: no
# hidden word's pixel at any opacity a person could see), on every set. Until Nov 27 the smaller sets counted only solid
# ink (over 96), as check-page-markers.py and check-word-boxes.py do, which left their faint fringe uncounted.
INK = 20
VISIBLE = INK
# A piece this far (units) from every line's cover rows, beside no missing line slot, is still a line's (a long tail).
FAR = 30
# Ink further than this (units) inside its word's box and its line's cover rows is covered whatever is beside it.
MARGIN = 3.0
# A piece of ink reaching this far (units) into each of two words' boxes is two words touching (check-word-boxes.py).
REACH = 12
# A piece of ink this small (pixels, on the originals) within this reach (units) of a bigger one is a crumb of it.
CRUMB_PX = 20
CRUMB_REACH = 2.0
# Owners: a word's index, or one of these.
NONE, MARKER, NOT_TEXT, SHARED = -1, -2, -3, -5

# ---------------------------------------------------------------------------------------------------- the repo's data


def load():
    lines = json.loads(LINES_FILE.read_text())
    rows = json.loads(ROWS_FILE.read_text())
    d = json.loads(WORDS_FILE.read_text())
    b = d["boxes"]
    per = {}
    # As 32-bit floats, as QuranWords holds them (a cover exactly 0.5 wide is kept or dropped as the app does).
    f32 = lambda v: float(np.float32(v))
    for i in range(len(b) // 4):
        per.setdefault(int(b[4 * i]), []).append((i, int(b[4 * i + 1]), f32(b[4 * i + 2]), f32(b[4 * i + 3])))
    quarters = set(json.loads(WAQF_FILE.read_text())["quarters"])
    return lines, rows, per, quarters


def lines_of(flat, rows):
    """A page's lines from pageLines.json, each marker with its rows (markerRows.json; the cover's rows where none)."""
    i, out, k = 0, [], 0
    while i + 8 <= len(flat):
        n = int(flat[i + 7])
        ms = []
        for m in range(n):
            top = rows[2 * k] if 2 * k + 1 < len(rows) else None
            bot = rows[2 * k + 1] if 2 * k + 1 < len(rows) else None
            mr = (max(top, flat[i + 3]), min(bot, flat[i + 4])) if top is not None else (flat[i + 3], flat[i + 4])
            ms.append((flat[i + 8 + 2 * m], flat[i + 9 + 2 * m], mr[0], mr[1]))
            k += 1
        out.append(dict(line=int(flat[i]), y0=flat[i + 1], y1=flat[i + 2], top=flat[i + 3], bot=flat[i + 4],
                        x0=flat[i + 5], x1=flat[i + 6], markers=ms))
        i += 8 + 2 * n
    return out


def read_ink(path=INK_FILE, per=None):
    """src/data/hiddenInk.dat as (word, kind, x0, y0, x1, y1) per page; a rect that is both a patch and a notch (kind 2
    in the file) is given as each."""
    if not path.exists():
        return {}
    raw = json.loads(path.read_text()).get("pages", {})
    out = {}
    for p, flat in raw.items():
        first = per[int(p)][0][0]
        rs = []
        for i in range(0, len(flat) - 5, 6):
            k = int(flat[i + 1])
            for kind in (("patch",) if k == 0 else ("notch",) if k == 1 else ("patch", "notch")):
                rs.append((first + int(flat[i]), kind, *flat[i + 2:i + 6]))
        out[p] = rs
    return out


# ---------------------------------------------------------------------------------------------------------- ownership

STAR = None


def star_template(images):
    """The quarter sign's ink, from a clean one (page 236, line 5, as check-word-boxes.py's STAR_AT)."""
    a = np.asarray(Image.open(images / "236.png").convert("RGBA"))[:, :, 3]
    s = a.shape[1] / 1024
    ink = a[int(470 * s):int(560 * s), int(485 * s):int(545 * s)] > INK
    lab, n = ndimage.label(ink, structure=np.ones((3, 3)))
    biggest = 1 + int(np.argmax(ndimage.sum(ink, lab, np.arange(1, n + 1))))
    ys, xs = ndimage.find_objects(lab)[biggest - 1]
    return lab[ys, xs] == biggest


def owners_full(job):
    """The originals: each ink pixel's owner, and which are a quarter sign's."""
    global STAR
    images, page, flat, rows, words, quarters, t, out = job
    if STAR is None:
        STAR = star_template(images)
    a = np.asarray(Image.open(images / f"{page:03d}.png").convert("RGBA"))[:, :, 3]
    H, W = a.shape
    s = W / 1024
    ink = a > INK
    inkhi = (a > cpm.MATCH).astype(np.float32)
    lines = lines_of(flat, rows)
    # The markers: their template's area grown about a unit, a sajdah's opening whole.
    mine = np.zeros(a.shape, bool)
    weak = []
    for l in lines:
        for m0, m1, top, bot in l["markers"]:
            win = (max(0, int((top - 16) * s)), min(H, int((bot + 16) * s)), max(0, int((m0 - 20) * s)), min(W, int((m1 + 20) * s)))
            score, py, px, tt = cpm.locate(inkhi, t, win)
            if score < 0.8:
                weak.append((page, l["line"], round(score, 3)))
            g = math.ceil(1.2 * s)
            area = ndimage.binary_dilation(np.pad(tt["area"], g), iterations=g)
            y0, x0 = py - g, px - g
            ya, xa, yb, xb = max(0, y0), max(0, x0), min(H, y0 + area.shape[0]), min(W, x0 + area.shape[1])
            mine[ya:yb, xa:xb] |= area[ya - y0:yb - y0, xa - x0:xb - x0]
            if (m1 - m0) > 1.3 * (bot - top):
                mine[max(0, int(top * s)):int(math.ceil(bot * s)), max(0, int(m0 * s)):int(math.ceil(m1 * s))] = True
    word_ink = ink & ~mine
    lab, n = ndimage.label(word_ink, structure=np.ones((3, 3)))
    com = ndimage.center_of_mass(word_ink, lab, np.arange(1, n + 1))
    objs = ndimage.find_objects(lab)
    # Each piece's line: the line whose cover rows hold its middle (two: the one whose band does, else the nearer); none:
    # a missing line slot nearer than any line is a surah header or the basmala (not verse text), else the nearest line.
    nums = np.array([l["line"] for l in lines], float)
    mids = np.array([(l["y0"] + l["y1"]) / 2 for l in lines])
    slope, icpt = np.polyfit(nums, mids, 1) if len(lines) > 1 else (106.4, mids[0] - 106.4 * nums[0])
    present = {l["line"] for l in lines}
    missing = [icpt + slope * k for k in range(1, 16) if k not in present]
    line_of = np.full(n + 1, NONE, np.int32)
    for k in range(n):
        cy = com[k][0] / s
        cands = [l for l in lines if l["top"] <= cy <= l["bot"]]
        if not cands and missing:
            dl = min(abs(cy - (l["y0"] + l["y1"]) / 2) for l in lines)
            if min(abs(cy - m) for m in missing) < dl:
                line_of[k + 1] = NOT_TEXT
                continue
        if len(cands) > 1:
            inband = [l for l in cands if l["y0"] <= cy <= l["y1"]]
            cands = inband[:1] if inband else [min(cands, key=lambda l: abs(cy - (l["y0"] + l["y1"]) / 2))]
        if not cands:
            near = min(lines, key=lambda l: max(l["top"] - cy, cy - l["bot"]))
            if max(near["top"] - cy, cy - near["bot"]) > FAR:
                line_of[k + 1] = NOT_TEXT
                continue
            cands = [near]
        line_of[k + 1] = cands[0]["line"]
    # Quarter signs: one before each quarter's first word that quranWaqf.json lists on the page (on its right, or at the
    # end of the line before; some boxes were fitted around it): the piece there most like the template's shape (stars
    # score 0.55 to 0.62, letters at most 0.46), in no other word's box.
    sym = np.zeros(n + 1, bool)
    sym_word = np.full(n + 1, -1, np.int64)
    found = []
    by_line_words = {}
    for w in words:
        by_line_words.setdefault(w[1], []).append(w)
    for q in [w for w in words if w[0] in quarters]:
        _, qline, qx0, qx1 = q
        prev = [l for l in lines if l["line"] < qline]
        best = None
        for k, (ys, xs) in enumerate(objs):
            lk = line_of[k + 1]
            h, wd = (ys.stop - ys.start) / s, (xs.stop - xs.start) / s
            if not (12 <= h <= 70 and 12 <= wd <= 70 and 0.6 <= h / wd <= 1.6):
                continue
            cx = (xs.start + xs.stop) / 2 / s
            # On the quarter's line, in or just right of its first word's box; or at the line before's end, left of its words.
            here = lk == qline and qx0 - 5 <= cx <= qx1 + 130
            line_end = bool(prev) and lk == prev[-1]["line"] and cx <= min([w[2] for w in by_line_words.get(lk, [])] or [1e9])
            if not (here or line_end):
                continue
            if any(w[2] + 1 < cx < w[3] - 1 for w in by_line_words.get(lk, []) if w[0] != q[0]):
                continue
            sub = lab[ys, xs] == k + 1
            tk = np.asarray(Image.fromarray(STAR.astype(np.uint8) * 255).resize((sub.shape[1], sub.shape[0]), Image.BILINEAR)) > 127
            iou = (tk & sub).sum() / max(1, (tk | sub).sum())
            if iou >= 0.5 and (best is None or iou > best[0]):
                best = (iou, k)
        if best is not None:
            sym[best[1] + 1], sym_word[best[1] + 1] = True, q[0]
            found.append(int(q[0]))
    for k in [int(v) for v in np.nonzero(sym)[0]]:
        ys, xs = objs[k - 1]
        for j, (yj, xj) in enumerate(objs):  # its middle dot
            if j + 1 != k and not sym[j + 1] and yj.start >= ys.start and yj.stop <= ys.stop and xj.start >= xs.start and xj.stop <= xs.stop:
                sym[j + 1], sym_word[j + 1] = True, sym_word[k]
    owner = np.full(a.shape, NONE, np.int32)
    owner[mine & ink] = MARKER
    yy, xx = np.nonzero(word_ink)
    L = line_of[lab[yy, xx]]
    owner[yy[L == NOT_TEXT], xx[L == NOT_TEXT]] = NOT_TEXT
    small = np.zeros(n + 1, bool)
    for k, (ys, xs) in enumerate(objs):
        small[k + 1] = (ys.stop - ys.start) / s < 14 and (xs.stop - xs.start) / s < 14
    by_line = {}
    for w, line, x0, x1 in words:
        by_line.setdefault(line, []).append((x0, x1, w))
    for line, boxes in by_line.items():
        sel = L == line
        if not sel.any():
            continue
        py, px = yy[sel], xx[sel]
        lk = lab[py, px]
        ks = np.unique(lk)
        mx = np.zeros(n + 1)
        mx[ks] = (np.asarray(ndimage.mean(px.astype(float), labels=lk, index=ks)) + 0.5) / s
        x = np.where(small[lk], mx[lk], (px + 0.5) / s)
        b0 = np.array([b[0] for b in boxes])
        b1 = np.array([b[1] for b in boxes])
        ids = np.array([b[2] for b in boxes])
        d = np.maximum(0, np.maximum(b0[None, :] - x[:, None], x[:, None] - b1[None, :]))
        own = ids[np.argmin(d, axis=1)]
        # A piece is one word's, the one holding most of it, unless it reaches REACH units into each of two words' boxes
        # (two words whose ink touches, split at their boxes' edge as check-word-boxes.py splits them): a stroke's edge
        # a unit past its box (the wasla over ٱلأعلى, page 316) stays its word's.
        order = np.argsort(lk, kind="stable")
        bounds = np.flatnonzero(np.diff(lk[order])) + 1
        for grp in np.split(order, bounds):
            ws_ = own[grp]
            if ws_.size == 0 or (ws_ == ws_[0]).all():
                continue
            u, cnt = np.unique(ws_, return_counts=True)
            wide = [w for w in u if np.ptp(px[grp][ws_ == w]) / s >= REACH]
            if len(wide) < 2:
                own[grp] = u[np.argmax(cnt)]
        owner[py, px] = own
    symmask = np.zeros(a.shape, bool)
    for k in [int(v) for v in np.nonzero(sym)[0]]:
        ys, xs = objs[k - 1]
        m = lab[ys, xs] == k
        owner[ys, xs][m] = sym_word[k]
        symmask[ys, xs] |= m
    # A crumb (a few faint pixels broken off a stroke's tip at INK: page 316's wasla over ٱلأعلى left one inside أنت's
    # box) is the stroke's it broke from, the nearest ink within CRUMB_REACH, not the box's it sits in. A dot or a haraka
    # is far bigger (about 100 pixels).
    sizes = np.bincount(lab.ravel(), minlength=n + 1)
    crumb = (sizes <= CRUMB_PX) & (np.arange(n + 1) > 0)
    reach = int(math.ceil(CRUMB_REACH * s)) + 1
    for k in np.nonzero(crumb)[0]:
        ys, xs = objs[k - 1]
        wy = slice(max(0, ys.start - reach), min(H, ys.stop + reach))
        wx = slice(max(0, xs.start - reach), min(W, xs.stop + reach))
        lw = lab[wy, wx]
        big = ink[wy, wx] & ~crumb[lw]
        if not big.any():
            continue
        dist, (iy, ix) = ndimage.distance_transform_edt(~big, return_indices=True)
        cy, cx = np.nonzero((lw == k) & (dist <= CRUMB_REACH * s))
        ow, sm = owner[wy, wx], symmask[wy, wx]
        ow[cy, cx] = ow[iy[cy, cx], ix[cy, cx]]
        sm[cy, cx] = sm[iy[cy, cx], ix[cy, cx]]
    np.savez_compressed(out / f"{page:03d}.npz", owner=owner, sym=symmask)
    return page, found, weak


def owners_like(job):
    """A smaller set: each visible pixel's owner from the originals' ink under it (each original pixel counted in the
    pixel its centre is in), the most of it; one holding two owners' ink is shared. A pixel with none under it (a fringe
    the scaling spread past the ink) takes the nearest original ink's owner."""
    images, orig, out, page = job
    a = np.asarray(Image.open(images / f"{page:03d}.png").convert("RGBA"))[:, :, 3]
    z = np.load(orig / f"{page:03d}.npz")
    o, sym = z["owner"], z["sym"]
    H, W = a.shape
    OH, OW = o.shape
    k = OW / W
    oy, ox = np.nonzero(o != NONE)
    pid = np.minimum(H - 1, ((oy + 0.5) / k).astype(np.int64)) * W + np.minimum(W - 1, ((ox + 0.5) / k).astype(np.int64))
    ow = o[oy, ox].astype(np.int64) + 10
    keys, cnt = np.unique(pid * 100000 + ow, return_counts=True)
    kp, kw = keys // 100000, keys % 100000 - 10
    order = np.lexsort((-cnt, kp))
    first = np.unique(kp[order], return_index=True)[1]
    major_pid, major_w = kp[order][first], kw[order][first]
    n_owners = np.unique(kp, return_counts=True)[1]
    sym_keys = np.unique(pid[sym[oy, ox]] * 100000 + ow[sym[oy, ox]])
    del oy, ox, pid, ow
    owner = np.full(H * W, NONE, np.int32)
    shared = np.zeros(H * W, bool)
    symm = np.zeros(H * W, bool)
    owner[major_pid] = major_w
    shared[major_pid] = n_owners > 1
    symm[major_pid] = np.isin(major_pid * 100000 + major_w + 10, sym_keys)
    owner, shared, symm = owner.reshape(H, W), shared.reshape(H, W), symm.reshape(H, W)
    visible = a > VISIBLE
    owner[~visible], shared[~visible], symm[~visible] = NONE, False, False
    # The fringe: the nearest original ink's owner, spread a few original pixels out from the ink.
    fy, fx = np.nonzero(visible & (owner == NONE))
    if fy.size:
        filled, fsym = o.copy(), sym.copy()
        for _ in range(int(math.ceil(2 * k)) + 2):
            empty = filled == NONE
            if not empty.any():
                break
            for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
                src = np.full_like(filled, NONE)
                ssym = np.zeros_like(fsym)
                ys_, yd = (slice(0, OH - dy), slice(dy, OH)) if dy >= 0 else (slice(-dy, OH), slice(0, OH + dy))
                xs_, xd = (slice(0, OW - dx), slice(dx, OW)) if dx >= 0 else (slice(-dx, OW), slice(0, OW + dx))
                src[yd, xd], ssym[yd, xd] = filled[ys_, xs_], fsym[ys_, xs_]
                m = empty & (src != NONE) & (filled == NONE)
                filled[m], fsym[m] = src[m], ssym[m]
        cy = np.minimum(OH - 1, ((fy + 0.5) * k).astype(np.int64))
        cx = np.minimum(OW - 1, ((fx + 0.5) * k).astype(np.int64))
        owner[fy, fx], symm[fy, fx] = filled[cy, cx], fsym[cy, cx]
    np.savez_compressed(out / f"{page:03d}.npz", owner=owner, sym=symm, shared=shared)
    return page


# ------------------------------------------------------------------- the plan (a copy of HiddenInkLayer.hiddenInkPlan)

MARKER_OUTLINE = [
    [0.289, 0.545], [0.262, 0.701], [0.219, 0.786], [0.112, 0.845], [0.112, 0.888], [0.128, 0.92],
    [0.134, 0.947], [0.123, 0.968], [0.016, 0.984], [0.0, 0.989], [0.0, 0.995], [0.005, 1.0],
    [0.005, 1.0], [0.0, 0.995], [0.0, 0.989], [0.016, 0.984], [0.123, 0.968], [0.134, 0.947],
    [0.128, 0.925], [0.112, 0.888], [0.112, 0.845], [0.219, 0.786], [0.262, 0.701], [0.289, 0.545],
]


def marker_corners(x0, y0, x1, y1):
    """lib/recite/markerOutline.markerCorners: ((x0, y0, x1, y1), side) per step."""
    width, height = x1 - x0, y1 - y0
    if width <= 0 or height <= 0 or width > 1.3 * height:
        return []
    n = len(MARKER_OUTLINE)
    a, b, mid = x0 + 2, x1 - 2, (x0 + x1) / 2
    out = []
    for i, (top, bottom) in enumerate(MARKER_OUTLINE):
        c0 = x0 if i == 0 else a + (b - a) * i / n
        c1 = x1 if i == n - 1 else a + (b - a) * (i + 1) / n
        side = "left" if (c0 + c1) / 2 < mid else "right"
        over, under = y0 + top * height - 1, y0 + bottom * height + 1
        if over > y0:
            out.append(((c0, y0, c1, over), side))
        if under < y1:
            out.append(((c0, under, c1, y1), side))
    return out


def subtract_spans(x0, x1, holes):
    out, at = [], x0
    for a, b in sorted(holes):
        if b <= at:
            continue
        if a >= x1:
            break
        if a > at:
            out.append((at, a))
        at = max(at, b)
    if at < x1:
        out.append((at, x1))
    return out


def rect_minus(c, n):
    x0, y0, x1, y1 = c
    a0, b0, a1, b1 = n
    if a1 <= x0 or a0 >= x1 or b1 <= y0 or b0 >= y1:
        return [c]
    out = []
    if b0 > y0:
        out.append((x0, y0, x1, b0))
    if b1 < y1:
        out.append((x0, b1, x1, y1))
    m0, m1 = max(y0, b0), min(y1, b1)
    if a0 > x0:
        out.append((x0, m0, a0, m1))
    if a1 < x1:
        out.append((a1, m0, x1, m1))
    return out


def plan(lines, words, shown, ink=(), word_edge=0.0, marker_edge=1.0, cover_edge=4.0, seam=0.5):
    """The covers (x0, y0, x1, y1) for a state, as hiddenInkPlan draws them. words: [(w, line, x0, x1)] in order."""
    runs, on_line, run = {}, {}, None
    for w, line, x0, x1 in words:
        on_line.setdefault(line, []).append((x0, x1, shown(w)))
        if not shown(w):
            if run:
                runs.setdefault(run[0], []).append(run[1:])
            run = None
            continue
        if run and run[0] == line:
            run = (line, min(run[1], x0), max(run[2], x1))
        else:
            if run:
                runs.setdefault(run[0], []).append(run[1:])
            run = (line, x0, x1)
    if run:
        runs.setdefault(run[0], []).append(run[1:])
    covers = []
    for l in lines:
        shown_holes = [(a - word_edge, b + word_edge) for a, b in runs.get(l["line"], [])]
        markers = [(m[0], m[1]) for m in l["markers"]]
        for a, b in subtract_spans(l["x0"] - cover_edge, l["x1"] + cover_edge, markers + shown_holes):
            if b - a > 0.5:
                covers.append((a, l["top"], b, l["bot"]))
        lw = on_line.get(l["line"], [])
        for a, b, top, bottom in l["markers"]:
            mid = (a + b) / 2
            before = after = None
            for wx0, wx1, sh in lw:
                if wx0 >= mid and (before is None or wx0 < before[0]):
                    before = (wx0, sh)
                if wx1 <= mid and (after is None or wx1 > after[0]):
                    after = (wx1, sh)
            left_open, right_open = (after[1] if after else False), (before[1] if before else False)
            if left_open and right_open:
                continue
            for rect, side in marker_corners(a - marker_edge, top, b + marker_edge, bottom):
                if left_open if side == "left" else right_open:
                    continue
                for p, q in subtract_spans(rect[0], rect[2], shown_holes):
                    if q - p > 0.5:
                        covers.append((p, rect[1], q, rect[3]))
            if top <= l["top"] and bottom >= l["bot"]:
                continue
            x0 = mid if left_open else a - marker_edge - seam
            x1 = mid if right_open else b + marker_edge + seam
            for p, q in subtract_spans(x0, x1, shown_holes):
                if q - p <= 0.5:
                    continue
                if top > l["top"]:
                    covers.append((p, l["top"], q, top))
                if bottom < l["bot"]:
                    covers.append((p, bottom, q, l["bot"]))
    for r in ink:
        if r[1] == "notch" and shown(r[0]):
            covers = [piece for c in covers for piece in rect_minus(c, r[2:])]
    covers += [tuple(r[2:]) for r in ink if r[1] == "patch" and not shown(r[0])]
    return covers


# -------------------------------------------------------------------------------------------------------------- sweep


def covered(py, px, covers):
    """Which points (sorted by y) are under a cover (edges included)."""
    out = np.zeros(py.size, bool)
    for x0, y0, x1, y1 in covers:
        a, b = np.searchsorted(py, y0, "left"), np.searchsorted(py, y1, "right")
        if b > a:
            out[a:b] |= (px[a:b] >= x0) & (px[a:b] <= x1)
    return out


def sweep(job):
    """One page of one set: the leaks and cuts in every reading state, as pixels and as bits (touching pixels)."""
    own, page, flat, rows, words, ink, opts = job
    lines = lines_of(flat, rows)
    z = np.load(own / f"{page:03d}.npz")
    o = z["owner"]
    if "shared" in z:
        o = np.where(z["shared"] & (o >= 0), SHARED, o)
    sym = z["sym"]
    s = o.shape[1] / 1024
    first, n = words[0][0], len(words)
    yy, xx = np.nonzero(o >= 0)
    pw = o[yy, xx] - first
    issym = sym[yy, xx]
    x, y = (xx + 0.5) / s, (yy + 0.5) / s
    box0 = np.array([w[2] for w in words])[pw]
    box1 = np.array([w[3] for w in words])[pw]
    ln = np.array([w[1] for w in words])[pw]
    by_line = {l["line"]: l for l in lines}
    top = np.array([by_line[v]["top"] if v in by_line else -1e9 for v in ln])
    bot = np.array([by_line[v]["bot"] if v in by_line else 1e9 for v in ln])
    # Only ink near a box's edge, its line's cover rows' edges, a marker or another line's rows can show or be cut in a
    # state but the first (nothing shown, which takes every pixel).
    risky = (x < box0 + MARGIN) | (x > box1 - MARGIN) | (y < top + MARGIN) | (y > bot - MARGIN) | issym
    for l in lines:
        for m0, m1, _, _ in l["markers"]:
            risky |= (x >= m0 - MARGIN) & (x <= m1 + MARGIN) & (y >= l["top"] - 20) & (y <= l["bot"] + 20)
        for k in lines:
            lo, hi = max(l["top"], k["top"]), min(l["bot"], k["bot"])
            if k is not l and hi > lo:
                risky |= (ln == l["line"]) & (y >= lo - MARGIN) & (y <= hi + MARGIN)
    order = np.argsort(y, kind="stable")
    ys, xs, ws = y[order], x[order], pw[order]
    rk = risky[order]
    ry, rx, rw, rsym = ys[rk], xs[rk], ws[rk], issym[order][rk]
    ridx = np.nonzero(rk)[0]
    leak, cut = np.zeros(ys.size, bool), np.zeros(ys.size, bool)
    ids = np.array([w[0] for w in words])
    kw = dict(word_edge=opts["word_edge"], ink=ink)
    nothing = plan(lines, words, lambda w: False, **kw)
    leak |= ~covered(ys, xs, nothing)
    # Surah headers and the basmala stay visible (Majd, Nov 27 2026: "Keep them visible"): none of their ink under a cover
    # nothing shown draws (every state's covers are those or parts of them), nor, near a line's rows, any state's.
    hy, hx = np.nonzero(o == NOT_TEXT)
    hyu, hxu = (hy + 0.5) / s, (hx + 0.5) / s
    ho = np.argsort(hyu, kind="stable")
    hys, hxs = hyu[ho], hxu[ho]
    hcut = covered(hys, hxs, nothing)
    hnear = np.zeros(hys.size, bool)
    for l in lines:
        hnear |= (hys >= l["top"] - 20) & (hys <= l["bot"] + 20)
    hidx = np.nonzero(hnear)[0]
    states = [np.arange(n) < k for k in range(1, n + 1)] + [np.arange(n) >= k for k in range(n)]
    for k in range(n):
        one = np.zeros(n, bool)
        one[k] = True
        states += [one, ~one]
    for st in states:
        on = set(ids[st].tolist())
        cv = plan(lines, words, lambda w: w in on, **kw)
        c = covered(ry, rx, cv)
        if hidx.size:
            hcut[hidx[covered(hys[hidx], hxs[hidx], cv)]] = True
        sh = st[rw]
        leak[ridx[~sh & ~c]] = True
        cut[ridx[sh & c & ~rsym]] = True  # a quarter sign covered beside its word is no cut: not a word
    shared_px = int((o == SHARED).sum())

    def bits(mask):
        m = np.zeros(o.shape, bool)
        sel = order[mask]
        m[yy[sel], xx[sel]] = True
        lab, _ = ndimage.label(m, structure=np.ones((3, 3)))
        out = []
        for j, (sy, sx) in enumerate(ndimage.find_objects(lab)):
            here = lab[sy, sx] == j + 1
            wv = o[sy, sx][here]
            out.append(dict(px=int(here.sum()), word=int(np.bincount(wv - first).argmax()) + first,
                            box=[round(sx.start / s, 2), round(sy.start / s, 2), round(sx.stop / s, 2), round(sy.stop / s, 2)]))
        return out

    res = dict(page=page, leaks=bits(leak), cuts=bits(cut), shared=shared_px, s=s,
               not_text=int((o == NOT_TEXT).sum()), header_cut=int(hcut.sum()),
               header_at=[round(float(hxs[hcut].min()), 2), round(float(hys[hcut].min()), 2)] if hcut.any() else None)
    if opts.get("pixels"):
        res["leak_px"] = [(int(o[yy[i], xx[i]]), float(x[i]), float(y[i])) for i in order[leak]]
        res["cut_px"] = [(int(o[yy[i], xx[i]]), float(x[i]), float(y[i])) for i in order[cut]]
    return res


# -------------------------------------------------------------------------------------------- patches and notches

def page_rects(job):
    """One page, for --write: its leaking and cut pixels in each set (no patches or notches yet), then its rects."""
    sweeps, owns, page, words = job
    results = [sweep(j) for j in sweeps]
    r, u = rects_for(page, results, owns, None)
    return page, r, u


def rects_for(page, results, owns, per):
    """A page's patches and notches from its leaking and cut pixels in every set, each rect holding no other owner's ink
    centre (any set): the pixels' box with room, else row by row, else pixel by pixel."""
    pts = {}
    others = []
    for r, own in zip(results, owns):
        if r is None:
            continue
        h = 0.5 / r["s"]  # half a pixel of this set
        for w, x, y in r.get("leak_px", []):
            pts.setdefault((w, "patch"), []).append((x, y, h))
        for w, x, y in r.get("cut_px", []):
            pts.setdefault((w, "notch"), []).append((x, y, h))
        o = np.load(own / f"{page:03d}.npz")["owner"]
        s = o.shape[1] / 1024
        oy, ox = np.nonzero(o != NONE)
        others.append(((ox + 0.5) / s, (oy + 0.5) / s, o[oy, ox]))
    if not pts:
        return [], []
    ox = np.concatenate([a for a, _, _ in others])
    oy = np.concatenate([b for _, b, _ in others])
    ow = np.concatenate([c for _, _, c in others])
    E = 0.003

    def clash(w, x0, y0, x1, y1):
        sel = (ox >= x0 - E) & (ox <= x1 + E) & (oy >= y0 - E) & (oy <= y1 + E)
        return bool((ow[sel] != w).any())

    rects, unresolved = [], []
    for (w, kind), p in pts.items():
        q3 = np.array(sorted(set(p)))
        q, half = q3[:, :2], q3[:, 2]
        # Clusters: points within 1.2 units of each other.
        lab = -np.ones(len(q), int)
        c = 0
        for i in range(len(q)):
            if lab[i] >= 0:
                continue
            lab[i], stack = c, [i]
            while stack:
                j = stack.pop()
                for k in np.nonzero((np.abs(q - q[j]).max(axis=1) <= 1.2) & (lab < 0))[0]:
                    lab[k] = c
                    stack.append(k)
            c += 1
        for ci in range(c):
            cq = q[lab == ci]
            # Whole pixels first (a smaller set's pixel is about a unit wide: a cover over its centre alone may round
            # to nothing on a phone), then less room.
            for m in (float(half[lab == ci].max()), 0.15, 0.05, 0.0):
                r = (cq[:, 0].min() - m, cq[:, 1].min() - m, cq[:, 0].max() + m, cq[:, 1].max() + m)
                if not clash(w, *r):
                    rects.append((w, kind) + r)
                    break
            else:
                for yv in np.unique(cq[:, 1]):
                    row = np.sort(cq[cq[:, 1] == yv, 0])
                    runs, start = [], row[0]
                    for a, b in zip(row, row[1:]):
                        if b - a > 0.6:
                            runs.append((start, a))
                            start = b
                    runs.append((start, row[-1]))
                    for a, b in runs:
                        for m in (0.1, 0.03, 0.0):
                            if not clash(w, a - m, yv - m, b + m, yv + m):
                                rects.append((w, kind, a - m, yv - m, b + m, yv + m))
                                break
                        else:
                            for xv in row[(row >= a) & (row <= b)]:
                                if clash(w, xv - 0.01, yv - 0.01, xv + 0.01, yv + 0.01):
                                    unresolved.append((page, w, kind, round(float(xv), 2), round(float(yv), 2)))
                                else:
                                    rects.append((w, kind, xv - 0.01, yv - 0.01, xv + 0.01, yv + 0.01))
    # Outwards to a thousandth, and checked again.
    fl = lambda v: math.floor((v - 1e-4) * 1000) / 1000
    ce = lambda v: math.ceil((v + 1e-4) * 1000) / 1000
    out = []
    for w, kind, a, b, c_, d in rects:
        r = (fl(a), fl(b), ce(c_), ce(d))
        if clash(w, *r):
            unresolved.append((page, w, kind, "rounding", r))
        out.append((w, kind) + r)
    return out, unresolved


def write_ink(all_rects, per):
    """Per page a flat list: per rect, the word's index on the page, the kind (0 patch, 1 notch, 2 both), x0, y0, x1, y1."""
    pages = {}
    for page in sorted(all_rects):
        first = per[page][0][0]
        kinds = {}
        for w, kind, a, b, c, d in all_rects[page]:
            kinds.setdefault((w, a, b, c, d), set()).add(kind)
        flat = []
        for (w, a, b, c, d), ks in sorted(kinds.items(), key=lambda kv: (kv[0][0], kv[0][2], kv[0][1])):
            flat += [w - first, 2 if len(ks) == 2 else 1 if "notch" in ks else 0] + [int(v) if v == int(v) else v for v in (a, b, c, d)]
        if flat:
            pages[str(page)] = flat
    INK_FILE.write_text(json.dumps({"v": 1, "pages": pages}, separators=(",", ":")) + "\n")


def header_rects(owns, page):
    """Where a page's surah headers' and basmala's ink is, for hiddenInk.test (--write-headers): per run of rows holding it
    (3 units apart parts two), its pixels' centres' bounds, the three sets together, outwards to a hundredth; flat."""
    spans = []
    for own in owns:
        o = np.load(own / f"{page:03d}.npz")["owner"]
        s = o.shape[1] / 1024
        yy, xx = np.nonzero(o == NOT_TEXT)
        if not yy.size:
            continue
        rows = np.zeros(o.shape[0], bool)
        rows[yy] = True
        lab, _ = ndimage.label(ndimage.binary_closing(rows, iterations=max(1, int(3 * s))))
        for (sl,) in ndimage.find_objects(lab):
            sel = (yy >= sl.start) & (yy < sl.stop)
            if sel.any():
                spans.append([(xx[sel].min() + 0.5) / s, (yy[sel].min() + 0.5) / s, (xx[sel].max() + 0.5) / s, (yy[sel].max() + 0.5) / s])
    merged = []
    for r in sorted(spans, key=lambda r: r[1]):
        if merged and r[1] <= merged[-1][3] + 1:
            m = merged[-1]
            merged[-1] = [min(m[0], r[0]), min(m[1], r[1]), max(m[2], r[2]), max(m[3], r[3])]
        else:
            merged.append(r)
    fl = lambda v: math.floor(v * 100 + 1e-6) / 100
    ce = lambda v: math.ceil(v * 100 - 1e-6) / 100
    return [v for m in merged for v in (fl(m[0]), fl(m[1]), ce(m[2]), ce(m[3]))]


# --------------------------------------------------------------------------------------------------------------- main

def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    root = Path(sys.argv[1])
    workers = int(arg("--workers", 2))
    pages = [int(v) for v in arg("--pages").split(",")] if arg("--pages") else list(range(1, 605))
    lines, rows, per, quarters = load()
    cache = root / ".owners"
    owns = {s: cache / s for s in SETS}
    # Owners (kept: they depend on the images, the boxes, the lines and the markers' rows, not on the plan).
    if "--fresh" in sys.argv or any(not (owns[s] / f"{p:03d}.npz").exists() for s in SETS for p in pages):
        for d in owns.values():
            d.mkdir(parents=True, exist_ok=True)
        full = root / "full"
        t = cpm.make_template(full, lines)
        found, weak = [], []
        with ProcessPoolExecutor(max_workers=workers) as ex:
            for _, f, wk in ex.map(owners_full, [(full, p, lines[str(p)], rows.get(str(p), []), per[p], quarters, t, owns["full"]) for p in pages]):
                found += f
                weak += wk
            for s in SETS[1:]:
                list(ex.map(owners_like, [(root / s, owns["full"], owns[s], p) for p in pages]))
        if weak:
            print("markers not found well (check by eye):", weak[:20])
            sys.exit(1)
        on_pages = {x[0] for p in pages for x in per[p]}
        expected = {w for w in quarters if w in on_pages}
        missed = expected - set(found)
        if missed:
            print(f"quarter signs not found before words {sorted(missed)[:20]} ({len(missed)} of {len(expected)})")
            sys.exit(1)
    if "--write-headers" in sys.argv:
        heads = json.loads(HEADERS_FILE.read_text()) if HEADERS_FILE.exists() else {}
        for p in pages:
            r = header_rects([owns[s] for s in SETS], p)
            if r:
                heads[str(p)] = r
            else:
                heads.pop(str(p), None)
        heads = dict(sorted(heads.items(), key=lambda kv: int(kv[0])))
        HEADERS_FILE.write_text(json.dumps(heads, separators=(",", ":")) + "\n")
        print(f"wrote {HEADERS_FILE.relative_to(ROOT)}: {sum(len(v) // 4 for v in heads.values())} runs of a surah header's "
              f"or the basmala's ink on {len(heads)} pages")
    before = "--before" in sys.argv
    ink = {} if before or "--write" in sys.argv else read_ink(INK_FILE, per)
    opts = dict(word_edge=1.0 if before else 0.0, pixels="--write" in sys.argv)
    if arg("--js-plans"):
        js = json.loads(Path(arg("--js-plans")).read_text())
        bad = 0
        for p in pages:
            ws = per[p]
            frm, to = ws[0][0], ws[-1][0] + 1
            half = frm + (to - frm) // 2
            ls = lines_of(lines[str(p)], rows.get(str(p), []))
            pink = read_ink(INK_FILE, per).get(str(p), [])
            for k, f in {"hidden": lambda w: False, "fwd": lambda w: w < half, "bwd": lambda w: w >= half, "alt": lambda w: w % 3 == 0}.items():
                a = sorted(tuple(round(v, 3) for v in c) for c in plan(ls, ws, f, ink=pink))
                b = sorted(tuple(round(v, 3) for v in c) for c in js[str(p)][k])
                if len(a) != len(b) or any(max(abs(u - v) for u, v in zip(x, y)) > 2e-3 for x, y in zip(a, b)):
                    bad += 1
                    if bad <= 3:
                        print(f"the copy of the plan differs from the app's on page {p}, {k}")
        if bad:
            print(f"{bad} page states differ: update plan() here to match HiddenInkLayer.hiddenInkPlan")
            sys.exit(1)
        print(f"the copy of the plan matches the app's ({len(pages)} pages, 4 states each)")
    results = {}
    if "--write" in sys.argv:
        # Page by page in the workers (the pixels of every page at once ran past 2 GB): each page's three sweeps and
        # its rects, only the rects kept.
        all_rects, unresolved = {}, []
        with ProcessPoolExecutor(max_workers=workers) as ex:
            jobs = [([(owns[s], p, lines[str(p)], rows.get(str(p), []), per[p], [], opts) for s in SETS], [owns[s] for s in SETS], p, per[p]) for p in pages]
            for p, r, u in ex.map(page_rects, jobs):
                if r:
                    all_rects[p] = r
                unresolved += u
        if unresolved:
            print(f"{len(unresolved)} points no rect can hold alone:", unresolved[:10])
            sys.exit(1)
        write_ink(all_rects, per)
        n = sum(len(v) for v in all_rects.values())
        print(f"wrote {INK_FILE.relative_to(ROOT)}: {n} rects on {len(all_rects)} pages "
              f"({sum(1 for v in all_rects.values() for r in v if r[1] == 'patch')} patches, "
              f"{sum(1 for v in all_rects.values() for r in v if r[1] == 'notch')} notches); checking again")
        del all_rects
        ink = read_ink(INK_FILE, per)
        opts["pixels"] = False
    with ProcessPoolExecutor(max_workers=workers) as ex:
        for s in SETS:
            results[s] = list(ex.map(sweep, [(owns[s], p, lines[str(p)], rows.get(str(p), []), per[p], ink.get(str(p), []), opts) for p in pages]))
    failed = False
    for s in SETS:
        res = results[s]
        leaks = [(r["page"], b) for r in res for b in r["leaks"]]
        cuts = [(r["page"], b) for r in res for b in r["cuts"]]
        print(f"{s}: {len(leaks)} bits of hidden words' ink show ({sum(b['px'] for _, b in leaks)} pixels, on "
              f"{len({p for p, _ in leaks})} pages); {len(cuts)} bits of shown words' ink covered ({sum(b['px'] for _, b in cuts)} "
              f"pixels, on {len({p for p, _ in cuts})} pages); {sum(r['shared'] for r in res)} pixels shared by two "
              f"owners' edges; {sum(r['not_text'] for r in res)} pixels of surah headers and the basmala, "
              f"{sum(r['header_cut'] for r in res)} of them covered")
        for p, b in sorted(leaks, key=lambda t: -t[1]["px"])[:8]:
            print(f"  shows: page {p}, word {b['word']}, {b['px']} px at {b['box']}")
        for p, b in sorted(cuts, key=lambda t: -t[1]["px"])[:8]:
            print(f"  covered: page {p}, word {b['word']}, {b['px']} px at {b['box']}")
        for r in [r for r in res if r["header_cut"]][:8]:
            print(f"  covered: page {r['page']}, {r['header_cut']} px of a surah header or the basmala from {r['header_at']}")
        failed |= bool(leaks or cuts) or any(r["header_cut"] for r in res)
    if arg("--dump"):
        Path(arg("--dump")).write_text(json.dumps({s: [{k: v for k, v in r.items() if not k.endswith("_px")} for r in results[s]] for s in SETS}))
    if failed:
        sys.exit(1)
    print("no hidden word's ink shows, no shown word's ink is covered and no surah header or basmala is covered, in any "
          "reading state, on any page, in any set")


if __name__ == "__main__":
    main()
