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


GAMMA = 0.6  # fitted on professionals: normal madds 2, lazim 6, each reciter's munfasil 2 or 4 (pros_tajweed.py)


def madd_count(timing, ecount, gamma=GAMMA, mix=0.5):
    """A madd's count. Timing (held to the next letter, in short syllables) on a curve: professionals hold a
    6-count madd about 6 times as long as a 2-count one, not 3; averaged with the model's own count, which is
    good at short madds and reads long ones short."""
    if timing is None:
        return ecount
    return mix * 2 * (timing / 2) ** gamma + (1 - mix) * ecount


def madd_dropped(j, timing_max=1.1, model_max=0.5):
    """A natural madd (2 counts) not said at all, e.g. قَالَ as قَلَ: a clear mistake (lahn jali, mode 2). Both must agree:
    held no longer than one short syllable, and the model hears no madd vowel. qdat: 6 of 9 real drops, 1.2% of
    correct learners, 0.03% of professionals' natural madds."""
    return j.get('timing_v') is not None and j['timing_v'] <= timing_max and j['ecount'] < model_max


def taswiyah(judged, gap=2.0, kinds=('Monfasel Madd', 'Mottasel Madd', 'Aared Madd')):
    """Consistency (taswiyah): within one recitation each kind of madd keeps one length. A madd whose count is
    `gap` or more from the reciter's own median for its kind (3 or more of that kind heard) is flagged, whatever
    length the reciter chose. Returns [(index in judged, own median)]."""
    by = {}
    for i, j in enumerate(judged):
        if j['kind'] in kinds and j.get('tcount') is not None:
            by.setdefault(j['kind'], []).append(i)
    out = []
    for k, idx in by.items():
        if len(idx) < 3:
            continue
        med = float(np.median([judged[i]['tcount'] for i in idx]))
        out += [(i, med) for i in idx if abs(judged[i]['tcount'] - med) >= gap]
    return out


def judge(lp, ear, slots_out, pad=6, rule=None, pace=None):
    """pace: the reciter's short syllable in frames from earlier ayat, for an ayah too short to measure it."""
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
        # held to the next letter's first sound (the madd's last sound comes early: CTC emits once and waits)
        nxt = next((pos_of[i] for i in range(b, len(ph)) if i in pos_of), None)
        held_next = 0
        if inner and first[0] in emit:
            end = emit[nxt][0] if (nxt is not None and nxt in emit) else spans[inner[-1]][1]
            held_next = end - emit[first[0]][0]
        held_nasal = 0  # a ghunnah or ikhfa: from the nasal's first sound to the next letter's
        if s['kind'] in ('Ghunnah', 'Ikhfa', 'Ikhfa meem') and inner and inner[0] in emit and nxt is not None and nxt in emit:
            held_nasal = emit[nxt][0] - emit[inner[0]][0]
        pr = np.exp(np.array(scores) - max(scores)); pr /= pr.sum()
        ecount = float(sum(len(v) * q for (v, _), q in zip(s['versions'], pr)))
        out.append(dict(s, scores=scores, best=s['versions'][best][0], margin=bad - good, held=held, held_next=held_next, held_nasal=held_nasal,
                        ecount=ecount, count=len(s['versions'][best][0]) if s['kind'] not in ('Qalqalah',) else None))
    # the reciter's count: half the median held time of the 2-count madds
    twos = [j['held'] for j in out if j['kind'] == 'Normal Madd' and j['held'] > 0]
    unit = (float(np.median(twos)) / 2) if len(twos) >= 2 else None
    for j in out:
        j['timing'] = (j['held'] / unit) if (unit and j['held'] and j['symbol'] in LONG) else None
    # the reciter's pace: the median short syllable (a letter and its short haraka, to the next letter)
    emit = ctc_align.emit
    syl = [emit[pos_of[i + 1]][0] - emit[pos_of[i - 1]][0] for i, ch in enumerate(ph)
           if ch in 'َُِ' and i + 1 < len(ph) and ph[i + 1] not in LONG and (i - 1) in pos_of and (i + 1) in pos_of
           and pos_of[i - 1] in emit and pos_of[i + 1] in emit]
    vowel = float(np.median(syl)) if len(syl) >= 3 else pace
    for j in out:
        j['pace'] = vowel
        j['nasal_v'] = (j['held_nasal'] / vowel) if (vowel and j.get('held_nasal')) else None
        j['timing_v'] = (j['held_next'] / vowel) if (vowel and j['held_next'] and j['symbol'] in LONG) else None
        if j['symbol'] in LONG:
            j['tcount'] = madd_count(j['timing_v'], j['ecount'], **(rule or {}))
    return out
