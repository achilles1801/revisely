#!/usr/bin/env python3
"""Mode 2, letters and harakat, with named slips: each word's correct sounds against versions with one likely
slip (a letter said as one it is often confused with, another haraka, a shadda or a madd dropped, a short vowel
lengthened). Each version is scored by the sound model (CTC forward) on the word's frames with a little context
either side; a slip is flagged only when it is likelier than the correct word by a margin.

This differs from checker.py's sound rule (a different sound heard with confidence somewhere in the word): the
question asked is "is it this slip?" rather than "is anything off?", so accents that blur a sound without
turning it into another letter cost less, and the flag can say which slip it heard.

  judge_word(lp, ear, before, snd, after, f0, f1) -> [(margin, slip, new sounds, i, j)] best first (edit at snd[i:j])
"""
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from tajweed import ctc_ll  # noqa: E402

HARAKAT = 'َُِ'
LONG = {'َ': 'ا', 'ُ': 'ۥ', 'ِ': 'ۦ'}
CONFUSE = {
    'ص': 'س', 'س': 'صش', 'ض': 'دظ', 'د': 'ض', 'ط': 'ت', 'ت': 'ط', 'ظ': 'زذض', 'ذ': 'زد', 'ز': 'ذ', 'ث': 'ست',
    'ح': 'هخ', 'ه': 'ح', 'خ': 'ح', 'ع': 'ء', 'ء': 'ع', 'ق': 'كغ', 'ك': 'ق', 'غ': 'خ', 'ش': 'س',
}


def slips(snd, lengths=True):
    """[(new sounds, description)] one slip each. lengths=False leaves out a vowel lengthened or a madd dropped
    (vowel length is judged with the madd, in mode 3)."""
    out, seen = [], {snd}
    n = len(snd)

    def add(s, why):
        if s not in seen:
            seen.add(s)
            out.append((s, why, i, j))  # the edit is at snd[i:j]

    i = 0
    while i < n:
        c = snd[i]
        j = i
        while j < n and snd[j] == c:
            j += 1
        run = j - i
        if c in CONFUSE:
            for d in CONFUSE[c]:
                add(snd[:i] + d * run + snd[j:], f'{c}→{d}')
            if run >= 2:
                add(snd[:i] + c + snd[j:], f'no shadda on {c}')
        if c in HARAKAT:
            for d in HARAKAT:
                if d != c:
                    add(snd[:i] + d + snd[j:], f'{c}→{d}')
            if lengths and (j >= n or snd[j] not in 'اۥۦ'):
                add(snd[:i] + c + LONG[c] * 2 + snd[j:], f'{c} lengthened')
        if lengths and c in 'اۥۦ' and run <= 2 and i > 0 and snd[i - 1] in HARAKAT:
            add(snd[:i] + snd[j:], 'madd dropped')
        if c not in CONFUSE and c not in HARAKAT and c not in 'اۥۦڇںۜ۾ـٲؙ۪' and run >= 2:
            add(snd[:i] + c + snd[j:], f'no shadda on {c}')
        i = j
    return out


def judge_word(lp, ear, before, snd, after, f0, f1, lengths=True):
    """Margins (slip minus correct, nats) for each slip of one word, best first."""
    win = lp[f0:f1]
    if win.shape[0] < 3:
        return []
    lab = lambda s: [ear.index[ch] for ch in s if ch in ear.index]
    base = ctc_ll(win, lab(before + snd + after))
    res = []
    for alt, why, i, j in slips(snd, lengths):
        res.append((ctc_ll(win, lab(before + alt + after)) - base, why, alt, i, j))
    res.sort(key=lambda x: -x[0])
    return res
