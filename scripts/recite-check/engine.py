"""The recitation check: the lab's checker (scripts/recite-eval, pinned in deploy.sh) on one recording.

Words: which word was said, skipped, said wrong or added (the checker's word graph, the lab's recommended settings).
Tajweed, per ayah said in full: madd lengths against the reciter's settings, a lazim madd held short, a natural madd
dropped, qalqalah, ghunnah and ikhfa (with their held time), idgham and iqlab. Letters and harakat (experimental,
off unless asked). Every bar was set on professional reciters so that about 2% of correct places are flagged
(bars.json, from make_bars.py in the lab).
"""
import json
import os
import pathlib
import sys
import time

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
os.environ.setdefault('LAB', str(HERE / 'lab'))
HARNESS = pathlib.Path(os.environ.get('RECITE_HARNESS', HERE / 'harness/scripts/recite-eval'))
sys.path.insert(0, str(HARNESS))

import checker  # noqa: E402
import letters_v2  # noqa: E402
import nasal_rules  # noqa: E402
import tajweed  # noqa: E402

FPS = checker.FPS
WORDS_P = dict(checker.DEFAULTS, sub_p=1.01, alt_rule='skeleton', del_frac=0.67)
MAX_WORDS = 300  # a passage longer than this is cut at the end of an ayah
PAD = 15  # frames either side of an ayah's words when judging its tajweed
SAID = ('correct', 'corrected', 'wrong')
MADD_RULES = {'Monfasel Madd': 'madd_munfasil', 'Mottasel Madd': 'madd_muttasil', 'Aared Madd': 'madd_aared'}
NASAL_RULES = {'idgham': 'idgham', 'idgham, no ghunnah': 'idgham_no_ghunnah', 'iqlab': 'iqlab'}
CHOICES = {'mon': (2, 4, 5), 'mot': (4, 5, 6), 'aar': (0, 2, 4, 6)}  # aar 0: any length (the reciter's choice)
DEFAULT = {'mon': 4, 'mot': 4, 'aar': 0}


class BadRequest(ValueError):
    pass


def settings_of(raw):
    """Madd lengths (munfasil, muttasil, aared) from the request, each one of its allowed counts (DEFAULT if not)."""
    out = {}
    for k, allowed in CHOICES.items():
        try:
            v = int(raw.get(k, DEFAULT[k]))
        except (TypeError, ValueError):
            v = DEFAULT[k]
        out[k] = v if v in allowed else DEFAULT[k]
    out['letters'] = str(raw.get('letters', '0')) == '1'
    return out


class Engine:
    def __init__(self, threads=2):
        checker._init(threads)
        self.ear, self.key = checker.EAR, checker.KEY
        letters_v2.EAR, letters_v2.KEY = self.ear, self.key
        self.words = self.key.words
        self.bars = json.loads((pathlib.Path(os.environ['LAB']) / 'bars.json').read_text())
        self._slots = {}

    # ------------------------------------------------------------ the passage

    def passage(self, s, a, s2=None, a2=None, max_words=MAX_WORDS):
        """App word numbers [lo, hi) from ayah s:a to s2:a2 (the end of surah s if not given), cut at the end of an
        ayah once max_words is reached."""
        if (s, a) not in self.words.vindex:
            raise BadRequest(f'no ayah {s}:{a}')
        if s2 is not None and (s2, a2) not in self.words.vindex:
            raise BadRequest(f'no ayah {s2}:{a2}')
        v0 = self.words.vindex[(s, a)]
        v1 = self.words.vindex[(s2, a2)] if s2 is not None else v0
        if s2 is None:
            while v1 + 1 < len(self.words.counts) and self.key.ayah_of_index[v1 + 1][0] == s:
                v1 += 1
        if v1 < v0:
            raise BadRequest('the passage ends before it starts')
        lo = self.words.first[v0]
        hi = lo
        for v in range(v0, v1 + 1):
            n = self.words.counts[v]
            if hi + n - lo > max_words and hi > lo:
                break
            hi += n
        return lo, hi

    # ------------------------------------------------------------ settings

    def moshaf(self, st):
        from quran_transcript import MoshafAttributes
        aar = st['aar'] or 4  # any length: written as 4, and not judged
        return MoshafAttributes(rewaya='hafs', madd_monfasel_len=st['mon'], madd_mottasel_len=st['mot'],
                                madd_mottasel_waqf=st['mot'], madd_aared_len=aar, madd_alleen_len=aar)

    def slots(self, st):
        k = (st['mon'], st['mot'], st['aar'])
        if k not in self._slots:
            self._slots[k] = (tajweed.Slots(self.ear, self.moshaf(st)), self.moshaf(st))
        return self._slots[k]

    # ------------------------------------------------------------ the check

    def check(self, x, s, a, s2=None, a2=None, raw_settings=None):
        """x: 16 kHz mono float32 audio. Returns the result the app shows (see README.md)."""
        st = settings_of(raw_settings or {})
        if len(x) < 16000:
            raise BadRequest('too short')
        t0 = time.perf_counter()
        lp = self.ear.logprobs(x)
        t_model = time.perf_counter() - t0

        # no one says more than about 4 words a second: a longer passage only slows the check
        lo, hi = self.passage(s, a, s2, a2, min(MAX_WORDS, int(4 * len(x) / 16000) + 20))
        P = WORDS_P
        kws = self.key.passage(lo, hi, int(P['alts']), P['alt_rule'])
        g = checker.Graph(kws)
        path, _ = checker.viterbi(lp, g, P)
        refs = checker.trail_refs(hi) if P.get('trail_extra') else None
        statuses, flagged, _, _, extras, visits, _ = checker.decide(kws, g, lp, path, P, self.ear.vocab, refs=refs)
        t_words = time.perf_counter() - t0 - t_model

        spans = {}
        words = []
        for i, kw in enumerate(kws):
            w = kw['word']
            stt = statuses.get(w, 'pending')
            if visits[i]:
                spans[w] = (min(v['start'] for v in visits[i]), max(v['end'] for v in visits[i]))
            if stt == 'pending':
                continue
            row = {'w': w, 'status': stt}
            f = flagged.get(w)
            if f:
                row['kind'] = f.get('kind')
                if f.get('heard'):
                    row['heard'] = f['heard']
            if w in spans:
                row['t'] = [round(spans[w][0] / FPS, 2), round(spans[w][1] / FPS, 2)]
            words.append(row)

        tj, letters = self.ayat(lp, lo, hi, statuses, spans, st)
        t_tajweed = time.perf_counter() - t0 - t_model - t_words
        return {
            'v': 1,
            'from': lo, 'to': hi,
            'secs': round(len(x) / 16000, 1),
            'words': words,
            'extras': [{'after': e['after'], 't': round(e['t'], 2), 'trail': bool(e.get('trail'))} for e in extras],
            'tajweed': tj,
            'letters': letters if st['letters'] else None,
            'settings': {k: st[k] for k in ('mon', 'mot', 'aar', 'letters')},
            'ms': {'model': int(t_model * 1000), 'words': int(t_words * 1000), 'tajweed': int(t_tajweed * 1000)},
        }

    def ayat(self, lp, lo, hi, statuses, spans, st):
        """Tajweed (and letters) for each ayah of the passage said in full, on its own frames."""
        SL, ms = self.slots(st)
        B = self.bars
        out, letters = [], []
        w = lo
        while w < hi:
            s, a, _ = self.key.where(w)
            first = self.words.first[self.words.vindex[(s, a)]]
            n = self.words.counts[self.words.vindex[(s, a)]]
            ws = list(range(first, first + n))
            w = first + n
            if first < lo or first + n > hi:
                continue
            sts = [statuses.get(x) for x in ws]
            if any(x not in SAID for x in sts) or ws[0] not in spans or ws[-1] not in spans:
                continue  # not said in full: its sounds can't be lined up
            f0 = max(0, spans[ws[0]][0] - PAD)
            f1 = min(lp.shape[0], spans[ws[-1]][1] + PAD)
            if f1 - f0 < 10:
                continue
            win = lp[f0:f1]
            bad = {i for i, x in enumerate(sts) if x == 'wrong'}
            near = bad | {i - 1 for i in bad} | {i + 1 for i in bad}

            def flag(i, rule, got=None, expected=None):
                if i is None or i in near or not 0 <= i < n:
                    return
                row = {'w': first + i, 'rule': rule}
                if got is not None:
                    row['got'] = round(float(got), 1)
                if expected is not None:
                    row['expected'] = int(expected)
                out.append(row)

            try:
                judged = tajweed.judge(win, self.ear, SL.ayah(s, a))
            except Exception:
                judged = []
            for j in judged:
                kind, i = j['kind'], j.get('word')
                tc = j.get('tcount')
                if kind == 'Normal Madd' and tajweed.madd_dropped(j):
                    flag(i, 'madd_dropped', expected=2)
                elif kind == 'Lazem Madd' and tc is not None and tc < 4.5:
                    flag(i, 'madd_lazim', tc, 6)
                elif kind in MADD_RULES and tc is not None and abs(tc - j['golden']) >= 1.5 \
                        and not (kind == 'Aared Madd' and not st['aar']):
                    flag(i, MADD_RULES[kind], tc, j['golden'])
                elif kind == 'Qalqalah' and j['margin'] > B['margin']['Qalqalah']:
                    flag(i, 'qalqalah')
                elif kind in ('Ghunnah', 'Ikhfa'):
                    T = B['timing'][kind]
                    if j.get('nasal_v') is not None:
                        sc = (j['margin'] - T['m_mean']) / T['m_std'] + (T['t_mean'] - j['nasal_v']) / T['t_std']
                        hit = sc > T['bar']
                    else:
                        hit = j['margin'] > B['margin'][kind]
                    if hit:
                        flag(i, kind.lower())

            text = ' '.join(self.key.uthmani(s, a))
            try:
                stops = nasal_rules.stops_after(s, a, n)
                ph, pls = nasal_rules.places(text, ms, stops)
                margins = nasal_rules.judge(win, self.ear, ph, pls) if pls else []
            except Exception:
                pls, margins = [], []
            for p, m in zip(pls, margins):
                if m > B['nasal'][p['kind']]:
                    flag(text[:p['char']].count(' '), NASAL_RULES[p['kind']])

            if st['letters']:
                try:
                    lj = letters_v2.words_judge(win, self.key.phonetize(self.key.uthmani(s, a)))
                except Exception:
                    lj = []
                L = B['letters']
                for i, rows in enumerate(lj):
                    if rows is None or i in bad:
                        continue
                    ok = [r for r in rows if letters_v2.kind_of(r[1]) != 'length'
                          and not (r[1].startswith('no shadda') and (r[2] is None or r[2] > L['shadda_max']))]
                    if ok:
                        top = max(ok, key=lambda r: r[0])
                        if top[0] > L['bar']:
                            letters.append({'w': first + i, 'slip': top[1]})
        return out, letters
