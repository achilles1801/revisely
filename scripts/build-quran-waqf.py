#!/usr/bin/env python3
"""Build src/data/quranWaqf.json: the pause marks (waqf signs) of the mushaf, by the app's word numbers.

The app's word data (src/data/quranWords.dat) has no pause marks. Tanzil's Uthmani text, which the app already
downloads for the verse sheet's Arabic (alquran.cloud's quran-uthmani, lib/translation), writes each mark as a token
of its own after the word it follows. This lines Tanzil's words up with the app's, ayah by ayah, and keeps only which
word carries which mark: nothing of the text itself.

  python3 scripts/build-quran-waqf.py           # fetches the text from api.alquran.cloud
  python3 scripts/build-quran-waqf.py FILE      # or reads a copy of that answer

The file: {"v": 1, "source": ..., "kinds": "ۖۗۚۛۘۙۜ", "stops": [word, kind, word, kind, ...], "quarters": [word, ...]},
the kind being the mark's index in `kinds`, and `quarters` the first word of each ayah a quarter's sign (۞, rub'
al-hizb) comes before (scripts/check-word-boxes.py finds each sign on the page there). The kinds:
  ۖ  better to continue (al-wasl awla)       ۗ  better to stop (al-waqf awla)
  ۚ  either (jaiz)                           ۛ  stop at one of the two, not both (mu'anaqah)
  ۘ  must stop (lazim)                       ۙ  don't stop (mamnu')
  ۜ  a short pause without breath (sakt; Hafs has four)
lib/reciteLive/phrase reads it: every kind but ۙ ends a phrase.

It fails if any ayah's words don't line up: one to one when the counts agree, else by letters where the app writes
one word with a no-break space and Tanzil two (إِلْ يَاسِينَ).
"""
import json
import sys
import unicodedata
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS_FILE = ROOT / "src" / "data" / "quranWords.dat"
OUT = ROOT / "src" / "data" / "quranWaqf.json"
URL = "https://api.alquran.cloud/v1/quran/quran-uthmani"
KINDS = "ۖۗۚۛۘۙۜ"
# Marks that aren't words: the start of a quarter (rub' al-hizb) and a sajdah.
NOT_WORDS = "۞۩"
NBSP = " "


def letters(s):
    """The letters alone (no harakat, tatweel or spaces)."""
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c).startswith("L") and c != "ـ")


def is_mark(tok):
    return all(c in KINDS or c in NOT_WORDS for c in tok)


def main():
    if len(sys.argv) > 1:
        answer = json.loads(Path(sys.argv[1]).read_text())
    else:
        # The API may refuse urllib's own user agent (QuranEnc's does).
        req = urllib.request.Request(URL, headers={"User-Agent": "curl/8.7.1"})
        answer = json.loads(urllib.request.urlopen(req, timeout=60).read())
    surahs = answer["data"]["surahs"]
    data = json.loads(WORDS_FILE.read_text())
    stops, quarters, bad, v, w = [], [], [], 0, 0
    for s in surahs:
        for a in s["ayahs"]:
            where = f"{s['number']}:{a['numberInSurah']}"
            toks = [t for t in a["text"].lstrip("﻿").split(" ") if t]
            # alquran.cloud puts the basmala before each surah's first ayah (not Al-Fatihah's, which it is, nor At-Tawbah).
            if s["number"] not in (1, 9) and a["numberInSurah"] == 1 and letters(toks[0]) == "بسم":
                toks = toks[4:]
            # A quarter's sign (۞, rub' al-hizb) before the ayah's first word.
            if any("\u06de" in tok for tok in toks[:1]):
                quarters.append(w)
            app = data["uthmani"][v].split(" ")
            words = [j for j, tok in enumerate(toks) if not is_mark(tok)]
            # Tanzil's words for each of the app's: one each when the counts agree (the app writes some with a no-break
            # space where Tanzil has one word, بعد ما / بعدما); else a word with a no-break space takes two of Tanzil's
            # when their letters are its letters (إل ياسين).
            spans = []
            if len(app) != data["counts"][v]:
                bad.append(f"{where} (the app's text has {len(app)} words, not {data['counts'][v]})")
            elif len(words) == len(app):
                spans = [[j] for j in words]
            else:
                k = 0
                for word in app:
                    two = words[k:k + 2]
                    if NBSP in word and len(two) == 2 and letters("".join(toks[j] for j in two)) == letters(word):
                        spans.append(two)
                        k += 2
                    elif k < len(words):
                        spans.append([words[k]])
                        k += 1
                if len(spans) != len(app) or k != len(words):
                    bad.append(where)
                    spans = []
            for p, span in enumerate(spans):
                if any(is_mark(toks[j]) for j in range(span[0], span[-1] + 1)):
                    bad.append(f"{where} (a mark inside word {p + 1})")
                # The marks after it, up to the next word, are this word's.
                i = span[-1] + 1
                while i < len(toks) and is_mark(toks[i]):
                    stops += [x for c in toks[i] if c in KINDS for x in (w + p, KINDS.index(c))]
                    i += 1
            w += data["counts"][v]
            v += 1
    if v != len(data["counts"]):
        bad.append(f"{v} ayahs, not {len(data['counts'])}")
    if bad:
        print("these ayahs don't line up:", ", ".join(bad[:30]))
        sys.exit(1)
    OUT.write_text(json.dumps({
        "v": 1,
        "source": "Tanzil Quran Text (Uthmani), tanzil.net, via api.alquran.cloud: which word each pause mark follows",
        "kinds": KINDS,
        "stops": stops,
        "quarters": quarters,
    }, ensure_ascii=False, separators=(",", ":")) + "\n")
    counts = {k: stops[1::2].count(i) for i, k in enumerate(KINDS)}
    print(f"{len(stops) // 2} pause marks on {w} words:", ", ".join(f"{k} {n}" for k, n in counts.items()),
          f"and {len(quarters)} quarters (۞) -> {OUT.name}")


if __name__ == "__main__":
    main()
