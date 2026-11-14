"""The recitation check: the lab's checker (scripts/recite-eval, pinned in deploy.sh) on one recording.

Words: which word was said, skipped, said wrong or added (the checker's word graph, the lab's recommended settings).
Tajweed, per ayah said in full: madd lengths against the reciter's settings, a lazim madd held short, a natural madd
dropped, qalqalah, ghunnah and ikhfa (with their held time), idgham and iqlab. Letters and harakat (experimental,
off unless asked). Every bar was set on professional reciters so that about 2% of correct places are flagged
(bars.json, from make_bars.py in the lab).
"""
import hashlib
import json
import os
import pathlib
import pickle
import sys
import threading
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
# v2 marks (recite-contract.md): the kinds that count against accuracy; tajweed is counted apart
MISTAKE_KINDS = ('word', 'skipped', 'added', 'harakat', 'letter')
# `sure` until each kind has a measured strict bar: on bench-v0's professional reciters a skipped word flagged is
# right 98% of the time; a look-alike, a sound said wrong or a word out of order 57–67% (planted mistakes vs correct
# words flagged), so those stay `likely`
CLEAR_WORD_KINDS = ('skipped',)
MADD_CLEAR_OFF = 2.5  # a madd this many counts from its setting is `clear` (flagged from 1.5)
LAZIM_CLEAR_UNDER = 3.5  # a lazim madd held under this is `clear` (flagged under 4.5)
HEARD_REACH = 20  # frames (0.4 s) either side of a word read for what was heard instead
# spelling the model's sounds in Arabic letters, for `heard` when what was said isn't a word
SOUND_SIGNS = set('ڇۜـؙ۪۾')  # the model's own tajweed signs: not letters
SOUND_LETTER = {'ں': 'ن', 'ٲ': 'ا'}
LONG_VOWEL = {'ا': 'ا', 'ۥ': 'و', 'ۦ': 'ي'}
HARAKAT = 'َُِ'
SHADDA = 'ّ'


def spell(sounds):
    """The model's sounds written in Arabic letters, close to how they'd be spelt: a doubled consonant once with a
    shadda, a long vowel as one letter, the model's own signs left out. Approximate (`heardExact: false`)."""
    out, i, n = [], 0, len(sounds)
    while i < n:
        c = SOUND_LETTER.get(sounds[i], sounds[i])
        if c in SOUND_SIGNS:
            i += 1
            continue
        j = i + 1
        while j < n and SOUND_LETTER.get(sounds[j], sounds[j]) == c:
            j += 1
        if c in LONG_VOWEL:
            out.append(LONG_VOWEL[c])
        elif c in HARAKAT:
            out.append(c)
        else:
            out.append(c + (SHADDA if j - i >= 2 else ''))
        i = j
    return ''.join(out)


def slip_of(why):
    """'ص→س' -> {'expected': 'ص', 'heard': 'س'}; 'no shadda on ل' -> {'expected': 'لّ', 'heard': 'ل'}."""
    if why.startswith('no shadda on '):
        c = why[len('no shadda on '):]
        return {'expected': c + SHADDA, 'heard': c}
    if '→' in why:
        a, b = why.split('→', 1)
        return {'expected': a, 'heard': b}
    return None


def score(statuses, marks, dismissed=()):
    """reached: from the first word recited to the furthest heard, skipped words included; mistakes: word, skipped,
    added, harakat and letter marks not dismissed; tajweed counted apart; accuracy = 1 - mistakes / reached."""
    said = [w for w, s in statuses.items() if s in ('correct', 'corrected', 'wrong', 'missed')]
    reached = (max(said) - min(said) + 1) if said else 0
    live = [m for m in marks if m['id'] not in dismissed]
    mistakes = sum(1 for m in live if m['kind'] in MISTAKE_KINDS)
    return {'reached': reached, 'mistakes': mistakes, 'tajweed': sum(1 for m in live if m['kind'] == 'tajweed'),
            'accuracy': round(max(0.0, 1 - mistakes / reached), 4) if reached else 1.0}


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


def heard_sounds(spans, toks, vocab):
    """What was heard for each word: the sounds from the end of the word before to the start of the word after (the
    path often gives a word said wrong only a sliver of its own time), at most HEARD_REACH frames either side of the
    word. spans: word -> (first frame, last frame); toks: checker.heard_tokens on the same frames."""
    order = sorted(spans)
    heard = {}
    for k_, w in enumerate(order):
        w0, w1 = spans[w]
        a_ = spans[order[k_ - 1]][1] if k_ > 0 else w0
        b_ = spans[order[k_ + 1]][0] if k_ + 1 < len(order) else w1
        a_ = min(w0, max(a_, w0 - HEARD_REACH))
        b_ = max(w1, min(b_, w1 + HEARD_REACH))
        heard[w] = ''.join(vocab[k - 1] for k, pk, _ in toks if a_ <= pk < b_)
    return heard


# ------------------------------------------------------------ the word table (make_words.py)

def words_key():
    """What a word's checker entry (Key.passage) depends on: the checker's and the word list's code and data, the
    lexicon, the phonetizer's version and the service's look-alike settings. A table made under another key is not
    used."""
    import importlib.metadata
    h = hashlib.sha256()
    for p in (HARNESS / 'checker.py', HARNESS / 'bench.py', HARNESS.parent.parent / 'src/data/quranWords.dat',
              pathlib.Path(os.environ['LAB']) / 'cache/lexicon.json'):
        h.update(p.read_bytes() if p.exists() else b'-')
    h.update(importlib.metadata.version('quran-transcript').encode())
    h.update(json.dumps([int(WORDS_P['alts']), WORDS_P['alt_rule']]).encode())
    return h.hexdigest()[:16]


def load_table(path):
    if not path.exists():
        return None
    t = pickle.loads(path.read_bytes())
    if t.get('key') != words_key():
        print(f"{path.name} was made for other words ({t.get('key')}, not {words_key()}): not used", file=sys.stderr)
        return None
    return t


class Engine:
    def __init__(self, threads=2):
        checker._init(threads)
        self.ear, self.key = checker.EAR, checker.KEY
        letters_v2.EAR, letters_v2.KEY = self.ear, self.key
        self.words = self.key.words
        self.bars = json.loads((pathlib.Path(os.environ['LAB']) / 'bars.json').read_text())
        self._slots = {}
        self._kw = {}  # app word -> its Key.passage entry, worked out on this instance (no table, or not in it)
        self._kw_lock = threading.Lock()
        self.table = load_table(pathlib.Path(os.environ['LAB']) / 'words.bin')

    # ------------------------------------------------------------ words

    @staticmethod
    def word_count(key):
        return key.words.first[-1] + key.words.counts[-1]

    def passage_words(self, lo, hi):
        """key.passage(lo, hi) with the service's look-alikes: from the word table when the image has one for these
        words (make_words.py: Key.passage costs ~100 ms a word on Cloud Run), else worked out and kept here. Same
        entries either way."""
        P = WORDS_P
        if self.table is not None:
            off, blob = self.table['offsets'], self.table['blob']
            out = [pickle.loads(blob[off[w]:off[w + 1]]) for w in range(lo, hi)]
            for k in out:
                if isinstance(k, tuple):  # ('refused', why): a word key.passage refuses, refused the same way
                    raise ValueError(k[1])
            return out
        missing = [w for w in range(lo, hi) if w not in self._kw]
        if missing:
            self.remember(self.key.passage(missing[0], missing[-1] + 1, int(P['alts']), P['alt_rule']))
        with self._kw_lock:
            return [self._kw[w] for w in range(lo, hi)]

    def remember(self, kws):
        """Keep words worked out elsewhere (the live session's helper process)."""
        with self._kw_lock:
            if len(self._kw) > 30000:
                self._kw.clear()
            for k in kws:
                self._kw[k['word']] = k

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

    def check(self, x, s, a, s2=None, a2=None, raw_settings=None, v=1):
        """x: 16 kHz mono float32 audio. Returns the result the app shows (see README.md); v=2 adds `marks` and
        `score` (recite-contract.md)."""
        st = settings_of(raw_settings or {})
        if len(x) < 16000:
            raise BadRequest('too short')
        t0 = time.perf_counter()
        lp = self.ear.logprobs(x)
        t_model = time.perf_counter() - t0
        # no one says more than about 4 words a second: a longer passage only slows the check
        lo, hi = self.passage(s, a, s2, a2, min(MAX_WORDS, int(4 * len(x) / 16000) + 20))
        return self.judge(lp, lo, hi, st, v, t_model)

    def judge(self, lp, lo, hi, st, v=1, t_model=0.0):
        """The check on the model's frames (50 a second) for app words [lo, hi): the words, then tajweed and letters
        per ayah said in full. check() runs the model first; a live session judges its streamed frames."""
        t0 = time.perf_counter() - t_model
        P = WORDS_P
        kws = self.passage_words(lo, hi)
        g = checker.Graph(kws)
        path, _ = checker.viterbi(lp, g, P)
        refs = checker.trail_refs(hi) if P.get('trail_extra') else None
        toks = checker.heard_tokens(lp)
        statuses, flagged, _, _, extras, visits, _ = checker.decide(kws, g, lp, path, P, self.ear.vocab, toks=toks,
                                                                    refs=refs)
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
        out = {
            'v': 1,
            'from': lo, 'to': hi,
            'secs': round(lp.shape[0] / FPS, 1),
            'words': words,
            'extras': [{'after': e['after'], 't': round(e['t'], 2), 'trail': bool(e.get('trail'))} for e in extras],
            'tajweed': [{k: r[k] for k in r if not k.startswith('_')} for r in tj],
            'letters': [{k: r[k] for k in r if not k.startswith('_')} for r in letters] if st['letters'] else None,
            'settings': {k: st[k] for k in ('mon', 'mot', 'aar', 'letters')},
            'ms': {'model': int(t_model * 1000), 'words': int(t_words * 1000), 'tajweed': int(t_tajweed * 1000)},
        }
        if v == 2:
            heard = heard_sounds(spans, toks, self.ear.vocab)
            out['marks'] = self.marks(words, flagged, heard, out['extras'], tj, letters if st['letters'] else [])
            out['score'] = score(statuses, out['marks'])
            out['v'] = 2
        return out

    # ------------------------------------------------------------ v2: marks

    def ayah_of(self, w):
        s, a, _ = self.key.where(w)
        return [int(s), int(a)]

    def marks(self, words, flagged, heard, extras, tajweed_rows, letter_rows):
        """Every mark of a check (recite-contract.md): words, extra words, tajweed, letters."""
        out, ids = [], {}

        def add(w, kind, sure, detail=None, rule=None, **more):
            mid = f"{w}:{kind}:{detail or rule or ''}"
            ids[mid] = ids.get(mid, 0) + 1
            if ids[mid] > 1:  # two extra words after one word
                mid += f'#{ids[mid]}'
            m = {'id': mid, 'w': int(w), 'ayah': self.ayah_of(w), 'kind': kind}
            if detail:
                m['detail'] = detail
            if rule:
                m['rule'] = rule
            m.update({k: v for k, v in more.items() if v is not None})
            m['sure'] = sure
            out.append(m)

        for row in words:
            w, st = row['w'], row['status']
            t = row.get('t')
            if st == 'missed':
                add(w, 'skipped', 'clear', t=t)
            elif st == 'wrong':
                detail = (flagged.get(w) or {}).get('kind') or 'sound'
                h, exact = None, None
                if detail == 'lookalike' and row.get('heard'):
                    h, exact = row['heard'], True
                elif detail == 'sound' and heard.get(w):
                    h, exact = spell(heard[w]), False
                add(w, 'word', 'clear' if detail in CLEAR_WORD_KINDS else 'likely', detail=detail, heard=h,
                    heardExact=exact, t=t)
        for e in extras:
            add(e['after'], 'added', 'likely', detail='trail' if e.get('trail') else None)
        for r in tajweed_rows:
            add(r['w'], 'tajweed', r.get('_sure', 'likely'), rule=r['rule'], got=r.get('got'),
                expected=r.get('expected'))
        for r in letter_rows:
            kind = letters_v2.kind_of(r['slip'])
            detail = 'shadda' if kind == 'shadda' else None
            add(r['w'], 'harakat' if kind in ('haraka', 'shadda') else 'letter', r.get('_sure', 'likely'),
                detail=detail, slip=slip_of(r['slip']), heard=spell(r['_heard']) if r.get('_heard') else None,
                heardExact=False if r.get('_heard') else None)
        return out

    def ayat(self, lp, lo, hi, statuses, spans, st):
        """Tajweed (and letters) for each ayah of the passage said in full, on its own frames."""
        out, letters = [], []
        w = lo
        while w < hi:
            s, a, _ = self.key.where(w)
            first = self.words.first[self.words.vindex[(s, a)]]
            n = self.words.counts[self.words.vindex[(s, a)]]
            w = first + n
            if first < lo or first + n > hi:
                continue
            o, l_ = self.ayah_notes(lp, s, a, statuses, spans, st)
            out += o
            letters += l_
        return out, letters

    def ayah_notes(self, lp, s, a, statuses, spans, st):
        """Tajweed (and letters) for ayah s:a, on its own frames; nothing unless it was said in full."""
        SL, ms = self.slots(st)
        B = self.bars
        S = B.get('strict', {})  # strict bars: past one, a mark is `clear` (bars.json from before them: all `likely`)
        first = self.words.first[self.words.vindex[(s, a)]]
        n = self.words.counts[self.words.vindex[(s, a)]]
        ws = list(range(first, first + n))
        out, letters = [], []
        sts = [statuses.get(x) for x in ws]
        if any(x not in SAID for x in sts) or ws[0] not in spans or ws[-1] not in spans:
            return out, letters  # not said in full: its sounds can't be lined up
        f0 = max(0, spans[ws[0]][0] - PAD)
        f1 = min(lp.shape[0], spans[ws[-1]][1] + PAD)
        if f1 - f0 < 10:
            return out, letters
        win = lp[f0:f1]
        bad = {i for i, x in enumerate(sts) if x == 'wrong'}
        near = bad | {i - 1 for i in bad} | {i + 1 for i in bad}

        def flag(i, rule, got=None, expected=None, clear=False):
            if i is None or i in near or not 0 <= i < n:
                return
            row = {'w': first + i, 'rule': rule}
            if got is not None:
                row['got'] = round(float(got), 1)
            if expected is not None:
                row['expected'] = int(expected)
            row['_sure'] = 'clear' if clear else 'likely'
            out.append(row)

        try:
            judged = tajweed.judge(win, self.ear, SL.ayah(s, a))
        except Exception:
            judged = []
        # tajweed and nasal places count quran_transcript's words; the app joins two pairs into one word (بَعْدَ مَا,
        # إِلْ يَاسِينَ), so map them onto the app's
        qa = self.key.app_index(s, a)
        to_app = lambda i: qa[i] if i is not None and 0 <= i < len(qa) else i  # noqa: E731
        for j in judged:
            kind, i = j['kind'], to_app(j.get('word'))
            tc = j.get('tcount')
            if kind == 'Normal Madd' and tajweed.madd_dropped(j):
                flag(i, 'madd_dropped', expected=2)
            elif kind == 'Lazem Madd' and tc is not None and tc < 4.5:
                flag(i, 'madd_lazim', tc, 6, clear=tc < LAZIM_CLEAR_UNDER)
            elif kind in MADD_RULES and tc is not None and abs(tc - j['golden']) >= 1.5 \
                    and not (kind == 'Aared Madd' and not st['aar']):
                flag(i, MADD_RULES[kind], tc, j['golden'], clear=abs(tc - j['golden']) >= MADD_CLEAR_OFF)
            elif kind == 'Qalqalah' and j['margin'] > B['margin']['Qalqalah']:
                flag(i, 'qalqalah', clear=j['margin'] > S.get('margin', {}).get('Qalqalah', float('inf')))
            elif kind in ('Ghunnah', 'Ikhfa'):
                T = B['timing'][kind]
                if j.get('nasal_v') is not None:
                    sc = (j['margin'] - T['m_mean']) / T['m_std'] + (T['t_mean'] - j['nasal_v']) / T['t_std']
                    hit = sc > T['bar']
                    clear = sc > S.get('timing', {}).get(kind, float('inf'))
                else:
                    hit = j['margin'] > B['margin'][kind]
                    clear = j['margin'] > S.get('margin', {}).get(kind, float('inf'))
                if hit:
                    flag(i, kind.lower(), clear=clear)

        text = ' '.join(self.key.uthmani(s, a))
        try:
            stops = nasal_rules.stops_after(s, a, n)
            ph, pls = nasal_rules.places(text, ms, stops)
            margins = nasal_rules.judge(win, self.ear, ph, pls) if pls else []
        except Exception:
            pls, margins = [], []
        for p, m in zip(pls, margins):
            if m > B['nasal'][p['kind']]:
                flag(to_app(text[:p['char']].count(' ')), NASAL_RULES[p['kind']])

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
                        letters.append({'w': first + i, 'slip': top[1],
                                        '_heard': top[3] if len(top) > 3 else None,
                                        '_sure': 'clear' if top[0] > S.get('letters', float('inf')) else 'likely'})
        return out, letters
