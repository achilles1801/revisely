#!/usr/bin/env python3
"""Build src/data/quranWords.dat (JSON): every word of the Qur'an, its text and where it
sits on the mushaf page images. Used by mistake detection (recitation checking).

Sources:
  - Word text from the quran.com API (v4): the Uthmani text shown in the app, and
    the standard (imlaei) spelling that speech recognition writes.
  - Word positions from the same ayahinfo database as build-ayah-bounds.py (the
    glyph bounds quran.com-images records while drawing the page images):

  curl -LO https://files.quran.app/hafs/madani/databases/ayahinfo/ayahinfo_1024.zip
  unzip ayahinfo_1024.zip
  python3 scripts/build-quran-words.py ayahinfo_1024.db [cache-dir]

The quran.com responses are cached in cache-dir (default ./.quran-words-cache), so a
rebuild does not fetch them again.

In the glyph data each word is one glyph, and so is each pause mark (ۚ ۖ ۗ ...), the
rub el hizb sign (۞), the sajdah sign (۩) and the verse-end marker. quran.com
attaches those marks to the word they follow (or precede), separated by a space.
A few words are written with a space inside ("بَعْدَ مَا"); the glyph set draws
some of them as one glyph and some as two, so each verse's glyph count decides.

Output (coordinates in the database's 1024-wide space, as in ayahBounds.json):
  {
    "v": 1,
    "counts": [words in each verse, in Qur'an order (6236)],
    "uthmani": [each verse's words, Uthmani, separated by spaces],
    "imlaei": [each verse's words, standard spelling without diacritics],
    "boxes": [page, line, x0, x1 for each word, flattened],
    "lines": {"<page>": [line, y0, y1, ...]}
  }
A word's own spaces are written as U+00A0, so splitting a verse on " " gives its words.
"""
import json
import sqlite3
import sys
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "quranWords.dat"

# Signs drawn as glyphs of their own when they stand alone in quran.com's text.
# U+06DC (small high seen) is also written inside words (وَيَبْصُۜطُ), where it is
# part of the word's glyph; only a token made of signs counts as separate glyphs.
SIGNS = {chr(c) for c in range(0x06D6, 0x06DD)} | {"۞", "۩"}
INVISIBLE = {"‏", "‎", "‍", "‌"}
HARAKAT = {chr(c) for c in range(0x064B, 0x0660)} | {chr(c) for c in range(0x0610, 0x061B)} | {
    chr(c) for c in range(0x06D6, 0x06EE)
} | {"ٰ", "ـ"} | INVISIBLE

FIELDS = "text_uthmani,text_imlaei,line_number,page_number"

# The app's first two pages are laid out higher than in the glyph data's own
# rendering (x matches; every line sits 58 units higher, measured from the ink of
# mushaf/001.png and 002.png). Shared with build-ayah-bounds.py.
PAGE_Y_SHIFT = {1: -58, 2: -58}


def fetch_chapter(cache: Path, ch: int):
    f = cache / f"{ch}.json"
    if f.exists():
        return json.loads(f.read_text())
    verses, page = [], 1
    while True:
        url = (
            f"https://api.quran.com/api/v4/verses/by_chapter/{ch}?words=true&word_fields={FIELDS}"
            f"&per_page=50&page={page}&mushaf=2"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "revisely-data-build", "Accept": "application/json"})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    d = json.load(r)
                break
            except Exception as e:  # noqa: BLE001
                print(f"retry {ch}/{page}: {e}", file=sys.stderr)
                time.sleep(2 + attempt * 2)
        else:
            raise SystemExit(f"could not fetch chapter {ch}")
        verses += d["verses"]
        if not d["pagination"]["next_page"]:
            break
        page = d["pagination"]["next_page"]
    f.write_text(json.dumps(verses, ensure_ascii=False))
    return verses


def is_sign(token: str) -> bool:
    chars = [c for c in token if c not in INVISIBLE]
    return bool(chars) and all(c in SIGNS for c in chars)


def strip_harakat(text: str) -> str:
    return "".join(c for c in text if c not in HARAKAT)


def split_word(text: str):
    """(signs before, body parts, signs after) of one quran.com word."""
    tokens = [t for t in text.split(" ") if t and not all(c in INVISIBLE for c in t)]
    before, body, after = [], [], []
    for t in tokens:
        if is_sign(t):
            (after if body else before).append(t)
        else:
            body.append(t)
    # A saktah sign at the very end of a word (عِوَجَاۜ, 18:1) is drawn after it as
    # a glyph of its own; inside a word (وَيَبْصُۜطُ) it belongs to the word.
    if body and body[-1].rstrip("".join(INVISIBLE)).endswith("ۜ"):
        after.insert(0, "ۜ")
    return before, body, after


def assign(words, n_glyphs):
    """How many glyphs each word's body takes, so the verse adds up to n_glyphs.
    A body of k parts takes 1..k glyphs; signs take one each. Returns a list or None."""
    fixed = sum(len(b) + len(a) for b, _, a in words)
    choices = [list(range(1, len(body) + 1)) for _, body, _ in words]
    target = n_glyphs - fixed
    # Most words have one part; only the few split words vary.
    base = [1] * len(words)
    flexible = [i for i, c in enumerate(choices) if len(c) > 1]
    extra = target - len(words)
    if extra < 0 or extra > sum(len(choices[i]) - 1 for i in flexible):
        return None
    # Give the extra glyphs to split words in order (in practice at most one per verse).
    for i in flexible:
        take = min(extra, len(choices[i]) - 1)
        base[i] += take
        extra -= take
    return base if extra == 0 else None


def main():
    db_path = sys.argv[1]
    cache = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / ".quran-words-cache"
    cache.mkdir(parents=True, exist_ok=True)

    db = sqlite3.connect(db_path)
    glyphs = defaultdict(list)
    line_band = {}
    for page, line, s, a, pos, x0, x1, y0, y1 in db.execute(
        "select page_number, line_number, sura_number, ayah_number, position, min_x, max_x, min_y, max_y"
        " from glyphs order by sura_number, ayah_number, position"
    ):
        x0, x1 = sorted((x0, x1))
        y0, y1 = (v + PAGE_Y_SHIFT.get(page, 0) for v in sorted((y0, y1)))
        glyphs[(s, a)].append((page, line, x0, x1))
        b = line_band.get((page, line))
        line_band[(page, line)] = (min(b[0], y0), max(b[1], y1)) if b else (y0, y1)

    counts, uthmani, imlaei, boxes = [], [], [], []
    split_words = 0
    multi_line = 0
    for ch in range(1, 115):
        for v in fetch_chapter(cache, ch):
            s, a = map(int, v["verse_key"].split(":"))
            words = [w for w in v["words"] if w["char_type_name"] == "word"]
            parsed = [split_word(w["text_uthmani"]) for w in words]
            g = glyphs[(s, a)]
            # The last glyph is the verse-end marker.
            takes = assign(parsed, len(g) - 1)
            if takes is None:
                raise SystemExit(f"{s}:{a}: {len(words)} words do not fit {len(g)} glyphs")
            gi = 0
            u_words, i_words = [], []
            for w, (before, body, after), take in zip(words, parsed, takes):
                gi += len(before)
                mine = g[gi : gi + take]
                gi += take + len(after)
                if len(body) > 1:
                    split_words += 1
                # A word drawn as two glyphs can wrap onto the next line; its box
                # is the part on the first line (the start of the word).
                first = [x for x in mine if (x[0], x[1]) == (mine[0][0], mine[0][1])]
                if len(first) < len(mine):
                    multi_line += 1
                page, line = first[0][0], first[0][1]
                boxes += [page, line, min(x[2] for x in first), max(x[3] for x in first)]
                u_words.append(" ".join(body))
                imlaei_body = [t for t in w["text_imlaei"].split(" ") if t and not is_sign(t)]
                i_words.append(" ".join(strip_harakat(t) for t in imlaei_body))
            if gi != len(g) - 1:
                raise SystemExit(f"{s}:{a}: used {gi} of {len(g) - 1} glyphs")
            counts.append(len(words))
            uthmani.append(" ".join(u_words))
            imlaei.append(" ".join(i_words))

    assert len(counts) == 6236, len(counts)
    lines = defaultdict(list)
    for (page, line), (y0, y1) in sorted(line_band.items()):
        lines[str(page)] += [line, y0, y1]

    OUT.write_text(
        json.dumps(
            {"v": 1, "counts": counts, "uthmani": uthmani, "imlaei": imlaei, "boxes": boxes, "lines": lines},
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    print(
        f"wrote {OUT} ({OUT.stat().st_size // 1024} KB): {sum(counts)} words, "
        f"{split_words} written with a space, {multi_line} across two lines"
    )


if __name__ == "__main__":
    main()
