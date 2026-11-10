#!/usr/bin/env python3
"""Mode 3, first cut: tajweed rules judged on any ayah from the sound model's output.

For an ayah, quran_transcript's phonetizer writes the sounds of a correct recitation and tags each madd (normal,
muttasil, munfasil, aared, lazim, with its length in counts) and each qalqalah; ikhfa (ں, ۾ held) and the ghunnah
of a doubled ن or م (held four symbols) show in the sounds themselves. Each such place is a slot. The recording
is lined up with the correct sounds (CTC Viterbi), and each slot is judged on a window around it: every version
of the window (a madd of 1 to 8 counts; ikhfa or a plain ن; a ghunnah held or not; a qalqalah or none) is scored
by the model (CTC forward), and the madd's held time is measured against the reciter's own count (half the
median length of the 2-count madds in the same recording).

  slots = Slots(ear).ayah(sura, ayah, stop=True)        # where each rule is, and its versions
  judged = judge(lp, slots, frames=(f0, f1))            # per slot: scores, the likeliest version, held time
"""
import json
import math
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import checker  # noqa: E402

LONG = 'اۥۦ'


def ctc_ll(lp, labels):
    """log P(labels | frames), CTC forward with blank 0."""
    L = len(labels)
    if L == 0:
        return float(lp[:, 0].sum())
    S = 2 * L + 1
    ext = np.zeros(S, np.int64); ext[1::2] = labels
    skip = np.zeros(S, bool)
    if L > 1:
        skip[3::2] = np.array(labels[1:]) != np.array(labels[:-1])
    NEG = -1e30
    a = np.full(S, NEG); a[0] = lp[0, 0]; a[1] = lp[0, ext[1]]
    for t in range(1, lp.shape[0]):
        b = a.copy()
        b[1:] = np.logaddexp(b[1:], a[:-1])
        s2 = np.full(S, NEG); s2[2:] = a[:-2]; s2[~skip] = NEG
        a = np.logaddexp(b, s2) + lp[t, ext]
    return float(np.logaddexp(a[-1], a[-2])) if S > 1 else float(a[-1])


def ctc_align(lp, labels):
    """Best CTC path. Returns for each label its (first frame, end frame), blanks after a label counted with it."""
    L = len(labels); S = 2 * L + 1
    ext = np.zeros(S, np.int64); ext[1::2] = labels
    skip = np.zeros(S, bool)
    if L > 1:
        skip[3::2] = np.array(labels[1:]) != np.array(labels[:-1])
    T = lp.shape[0]; NEG = -1e30
    a = np.full(S, NEG); a[0] = lp[0, 0]; a[1] = lp[0, ext[1]]
    bp = np.zeros((T, S), np.int8)
    idx = np.arange(S)
    for t in range(1, T):
        c1 = np.full(S, NEG); c1[1:] = a[:-1]
        c2 = np.full(S, NEG); c2[2:] = a[:-2]; c2[~skip] = NEG
        st = np.stack([a, c1, c2]); k = st.argmax(0)
        a = st[k, idx] + lp[t, ext]; bp[t] = k
    s = S - 1 if a[S - 1] >= a[S - 2] else S - 2
    spans, emit = {}, {}
    for t in range(T - 1, -1, -1):
        li = s // 2 if s % 2 == 1 else (s - 1) // 2
        if li >= 0:
            f, e = spans.get(li, (t, t + 1))
            spans[li] = (t, e)
            if s % 2 == 1:  # on the label itself, not a blank
                f, e = emit.get(li, (t, t + 1))
                emit[li] = (t, e)
        s -= int(bp[t, s])
    ctc_align.emit = emit
    return spans


class Slots:
    """Where each rule is in an ayah's sounds, and the versions of it to listen for."""

    def __init__(self, ear, moshaf=None):
        from quran_transcript import MoshafAttributes
        self.ear = ear
        self.moshaf = moshaf or MoshafAttributes(rewaya='hafs', madd_monfasel_len=4, madd_mottasel_len=4,
                                                 madd_mottasel_waqf=4, madd_aared_len=4)

    def phonetize(self, text):
        from quran_transcript import quran_phonetizer
        return quran_phonetizer(text, self.moshaf, remove_spaces=True)

    def ayah(self, sura, ayah, words=None):
        """Slots for the ayah (or its words [a, b) of the uthmani text), read through to its end and stopped on."""
        from quran_transcript import Aya
        ws = Aya(sura, ayah).get().uthmani.split(' ')
        if words:
            ws = ws[words[0]:words[1]]
        return self.text(' '.join(ws))

    def text(self, text):
        o = self.phonetize(text)
        ph = o.phonemes
        slots = []
        taken = set()
        for mp in o.mappings:
            for r in mp.tajweed_rules or []:
                a, b = mp.pos
                kind = r.name.en
                if r.correctness_type == 'count':
                    i = a
                    while i < b and ph[i] not in LONG:
                        i += 1
                    j = i
                    while j < b and ph[j] == ph[i]:
                        j += 1
                    if j > i:
                        slots.append({'kind': kind, 'start': i, 'end': j, 'symbol': ph[i], 'golden': int(r.golden_len)})
                        taken.update(range(i, j))
                elif kind == 'Qalqalah':
                    k = ph.find('ڇ', a, b)
                    if k >= 0:
                        slots.append({'kind': 'Qalqalah', 'start': k, 'end': k + 1, 'symbol': 'ڇ', 'golden': 1})
                        taken.add(k)
        # held nasals: ikhfa (ں, ۾) and a doubled ن or م held for its ghunnah
        i = 0
        while i < len(ph):
            c = ph[i]
            j = i
            while j < len(ph) and ph[j] == c:
                j += 1
            if c in 'ں۾' and not taken & set(range(i, j)):
                slots.append({'kind': 'Ikhfa' if c == 'ں' else 'Ikhfa meem', 'start': i, 'end': j, 'symbol': c, 'golden': j - i})
            elif c in 'نم' and j - i >= 3:
                slots.append({'kind': 'Ghunnah', 'start': i, 'end': j, 'symbol': c, 'golden': j - i})
            i = j
        slots.sort(key=lambda s: s['start'])
        for s in slots:
            s['versions'] = versions(s)
        return {'phonemes': ph, 'slots': slots}


def versions(s):
    """[(replacement sounds, is_correct)] for a slot."""
    c, n = s['symbol'], s['end'] - s['start']
    if s['kind'] == 'Qalqalah':
        return [('ڇ', True), ('', False)]
    if s['kind'] == 'Ikhfa':  # a hidden ن; the slip is a clear ن
        return [(c * k, True) for k in (2, 3, 4)] + [('ن' * k, False) for k in (1, 2, 3)]
    if s['kind'] == 'Ikhfa meem':  # a م held before ب (ikhfa shafawi, or iqlab of a ن); the slips: a ن, or no hold
        return [(c * k, True) for k in (2, 3, 4)] + [('م' * k, True) for k in (2, 3)] + [('ن', False), ('نن', False), ('م', False)]
    if s['kind'] == 'Ghunnah':
        return [(c * k, k >= 3) for k in (2, 3, 4, 5)]
    return [(c * k, k == n) for k in range(0, 9)]  # madd: 0 to 8 counts


def judge(lp, ear, slots_out, pad=6):
    """Judge each slot of an ayah on frames lp (the ayah's audio, a little silence either side)."""
    ph = slots_out['phonemes']
    index = ear.index
    keep = [i for i, ch in enumerate(ph) if ch in index]
    pos_of = {i: k for k, i in enumerate(keep)}
    labels = [index[ph[i]] for i in keep]
    spans = ctc_align(lp, labels)
    out = []
    for s in slots_out['slots']:
        a, b = s['start'], s['end']
        lo = max(0, a - pad); hi = min(len(ph), b + pad)
        ka = [pos_of[i] for i in range(lo, a) if i in pos_of]
        kb = [pos_of[i] for i in range(b, hi) if i in pos_of]
        inner = [pos_of[i] for i in range(a, b) if i in pos_of]
        f0 = spans[ka[0]][0] if ka and ka[0] in spans else (spans[inner[0]][0] if inner and inner[0] in spans else 0)
        f1 = spans[kb[-1]][1] if kb and kb[-1] in spans else (spans[inner[-1]][1] if inner and inner[-1] in spans else lp.shape[0])
        f0 = max(0, f0 - 2); f1 = min(lp.shape[0], f1 + 2)
        held = 0
        emit = ctc_align.emit
        first = ([pos_of[a - 1]] if (a - 1) in pos_of and ph[a - 1] in 'َُِ' else []) + inner  # the haraka the madd grows from
        if inner and first[0] in emit and inner[-1] in emit:
            held = emit[inner[-1]][1] - emit[first[0]][0]
        win = lp[f0:f1]
        before = [index[ph[i]] for i in range(lo, a) if ph[i] in index]
        after = [index[ph[i]] for i in range(b, hi) if ph[i] in index]
        scores = []
        for rep, ok in s['versions']:
            lab = before + [index[ch] for ch in rep if ch in index] + after
            scores.append(ctc_ll(win, lab))
        best = int(np.argmax(scores))
        good = max(sc for sc, (_, ok) in zip(scores, s['versions']) if ok)
        bad = max((sc for sc, (_, ok) in zip(scores, s['versions']) if not ok), default=-1e30)
        out.append(dict(s, scores=scores, best=s['versions'][best][0], margin=bad - good, held=held,
                        count=len(s['versions'][best][0]) if s['kind'] not in ('Qalqalah',) else None))
    # the reciter's count: half the median held time of the 2-count madds
    twos = [j['held'] for j in out if j['kind'] == 'Normal Madd' and j['held'] > 0]
    unit = (float(np.median(twos)) / 2) if len(twos) >= 2 else None
    for j in out:
        j['timing'] = (j['held'] / unit) if (unit and j['held'] and j['symbol'] in LONG) else None
    return out
