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
        P = WORDS_P
        kws = self.key.passage(lo, hi, int(P['alts']), P['alt_rule'])
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
            'secs': round(len(x) / 16000, 1),
            'words': words,
            'extras': [{'after': e['after'], 't': round(e['t'], 2), 'trail': bool(e.get('trail'))} for e in extras],
            'tajweed': [{k: r[k] for k in r if not k.startswith('_')} for r in tj],
            'letters': [{k: r[k] for k in r if not k.startswith('_')} for r in letters] if st['letters'] else None,
            'settings': {k: st[k] for k in ('mon', 'mot', 'aar', 'letters')},
            'ms': {'model': int(t_model * 1000), 'words': int(t_words * 1000), 'tajweed': int(t_tajweed * 1000)},
        }
        if v == 2:
            # what was heard for a word: the sounds from the end of the word before to the start of the word after
            # (the path often gives a word said wrong only a sliver of its own time), at most HEARD_REACH frames
            # either side of the word
            order = sorted(spans)
            heard = {}
            for k_, w in enumerate(order):
                w0, w1 = spans[w]
                a_ = spans[order[k_ - 1]][1] if k_ > 0 else w0
                b_ = spans[order[k_ + 1]][0] if k_ + 1 < len(order) else w1
                a_ = min(w0, max(a_, w0 - HEARD_REACH))
                b_ = max(w1, min(b_, w1 + HEARD_REACH))
                heard[w] = ''.join(self.ear.vocab[k - 1] for k, pk, _ in toks if a_ <= pk < b_)
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
        for j in judged:
            kind, i = j['kind'], j.get('word')
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
                        letters.append({'w': first + i, 'slip': top[1],
                                        '_heard': top[3] if len(top) > 3 else None,
                                        '_sure': 'clear' if top[0] > S.get('letters', float('inf')) else 'likely'})
        return out, letters


# ---------------------------------------------------------------- live (recite-contract.md, /live)

LIVE_MAX_SECS = 15 * 60  # a live session is at most this long (the server closes it before)
SR = 16000


def _grow(arr, rows):
    """arr with at least `rows` rows (doubling), the old rows kept."""
    if arr.shape[0] >= rows:
        return arr
    new = np.zeros((max(rows, 2 * arr.shape[0]),) + arr.shape[1:], arr.dtype)
    new[:arr.shape[0]] = arr
    return new


class _Segment:
    """One stretch of a live take read against one passage: the start, or after the reader turned the page (seek)."""

    def __init__(self, e, s, a, s2, a2, f0, sample0):
        self.s, self.a, self.s2, self.a2 = s, a, s2, a2
        self.lo, self.hi = e.passage(s, a, s2, a2)
        P = WORDS_P
        self.kws = e.key.passage(self.lo, self.hi, int(P['alts']), P['alt_rule'])
        self.g = checker.Graph(self.kws)
        self.app = [k['word'] for k in self.kws]
        self.dec = checker.Decoder(self.g, LIVE_P, 3000)
        self.f0, self.sample0 = f0, sample0  # where it starts in the take: frames, samples
        self.decided, self.status = {}, {}  # app word -> when decided; its latest status once decided
        self.bad_run, self.flagged = {}, {}  # app word -> steps in a row it looked wrong; mark id once flagged
        self.judged = set()  # ayat whose tajweed and letters have been judged
        self.up_to = None  # every word of the passage up to this one is decided

    def room(self, frames):
        d = self.dec
        for name in ('bp', 'ent_src', 'gap_src', 'ex_state'):
            setattr(d, name, _grow(getattr(d, name), frames))


LIVE_P = dict(WORDS_P)  # checker.DEFAULTS' live settings: win 4 s, hop 0.5 s, look 1 s, commit 0.5 s, context 30 s


class LiveSession:
    """A live check: 16 kHz PCM in as it arrives, events out (recite-contract.md, the server's frames without the
    transport). The lab's live checker (checker.run_item_live) step by step: every hop the model runs on the last
    `win` seconds, frames `look` seconds old are final and go to the decoder, and a word is decided once it is
    `commit` seconds behind the newest final frame. The cursor also uses the newest window's provisional frames (the
    lab's follow_live: 0.45 s after a word starts). An ayah said in full gets its tajweed (and letters) when its last
    word is decided. end() checks the whole take once more; its answer replaces the live marks."""

    def __init__(self, engine, s, a, s2=None, a2=None, raw_settings=None):
        self.e = engine
        self.raw = dict(raw_settings or {})
        self.st = settings_of(self.raw)
        self.x = np.zeros(SR * 60, np.float32)  # the take so far
        self.n = 0
        self.lp = np.zeros((3000, len(engine.ear.vocab) + 1), np.float32)  # final frames, the take's own numbering
        self.done = 0  # frames final so far
        self.tail = None  # the newest window's frames after `done` (provisional)
        self.k = 1  # the next hop
        self.segs = [_Segment(engine, s, a, s2, a2, 0, 0)]
        self.at = None
        self.marks = {}  # id -> mark, as shown now
        self.dismissed = set()
        self.ended = False

    # ------------------------------------------------------------ in

    def feed(self, pcm):
        """pcm: int16 samples (any length). Returns the events this audio brings."""
        if self.ended:
            return []
        pcm = np.asarray(pcm, np.int16)
        if self.n + len(pcm) > LIVE_MAX_SECS * SR:
            raise BadRequest('too long')
        self.x = _grow(self.x, self.n + len(pcm))
        self.x[self.n:self.n + len(pcm)] = pcm.astype(np.float32) / 32768.0
        self.n += len(pcm)
        events = []
        hop = LIVE_P['hop']
        while int(round(self.k * hop * SR)) <= self.n:
            events += self._hop(int(round(self.k * hop * SR)), last=False)
            self.k += 1
        return events

    def seek(self, w):
        """The reader turned to another page or went back an ayah: read on against the passage from w's ayah."""
        s, a, _ = self.e.key.where(int(w))
        old = self.segs[-1]
        s2, a2 = (old.s2, old.a2) if old.s2 is not None and (s, a) <= (old.s2, old.a2) else (None, None)
        self.segs.append(_Segment(self.e, s, a, s2, a2, self.done, self.n))
        return []

    def dismiss(self, mark_id):
        """Not a mistake: the mark leaves the score (the server keeps the label with the take)."""
        self.dismissed.add(mark_id)
        return [self._score_event()]

    def end(self):
        """The take is over: the last frames, then the whole take checked once more. Returns the `done` result."""
        if not self.ended and self.n >= SR // 2:
            self._hop(self.n, last=True)  # its events are superseded by the final answer
        self.ended = True
        return self._final()

    # ------------------------------------------------------------ the model, every hop

    def _hop(self, t_end, last):
        P, ear = LIVE_P, self.e.ear
        T = (1 + self.n // 160) // 2 if last else (1 + t_end // 160) // 2
        s0 = max(0, t_end - int(P['win'] * SR))
        s0 -= s0 % 320
        hi = T if last else min(T, int((t_end / SR - P['look']) * FPS))
        lp = ear._run(self.x[s0:t_end])
        f0 = s0 // 320
        if hi > self.done:
            self.lp = _grow(self.lp, hi)
            a, b = self.done, min(hi, f0 + lp.shape[0])
            if b > a:
                self.lp[a:b] = lp[a - f0:b - f0]
            if b < hi:
                self.lp[b:hi] = lp[-1]
            self.done = hi
        self.tail = None if last else lp[max(0, self.done - f0):]
        return self._decide(now=t_end / SR, last=last)

    # ------------------------------------------------------------ the checker, every hop

    def _decide(self, now, last):
        e, P = self.e, LIVE_P
        seg = self.segs[-1]
        dec, g, kws, app = seg.dec, seg.g, seg.kws, seg.app
        avail = self.done - seg.f0
        if avail > dec.t:
            seg.room(avail + 400)
            dec.feed(self.lp[seg.f0 + dec.t:seg.f0 + avail])
        events = []
        if dec.t < 5:
            return events
        lpl = self.lp[seg.f0:seg.f0 + dec.t]  # this segment's frames
        # the cursor: the best state now, with the newest window's provisional frames
        cur = self._cursor(seg)
        if cur is not None and cur != self.at:
            self.at = cur
            events.append({'type': 'at', 'w': int(cur), 't': round(now, 2)})

        path, _ = dec.traceback(final=False)
        cf, ctx = int(P['commit'] * FPS), int(P['context'] * FPS)
        lo_t = max(0, dec.t - ctx)
        pw = [p for p in path if p[0] >= lo_t]
        a_tok = max(0, lo_t - 2 * FPS)
        toks = [(k, pk + a_tok, pr) for k, pk, pr in checker.heard_tokens(lpl[a_tok:])]
        st, fl, _, _, _, visits, _ = checker.decide(kws, g, lpl, pw, P, e.ear.vocab, toks)
        seen = [w for w in range(g.W) if visits[w]]
        order = [w for _, w in sorted((v['start'], w) for w in seen for v in visits[w])]
        jumped = set()
        for wa, wb in zip(order, order[1:]):
            if wb > wa + 1:
                jumped.update(range(wa + 1, wb))
        if seen:
            w_first = min(seen)
            if lo_t > 0 and visits[w_first][0]['start'] <= lo_t + 1:
                w_first += 1
            for w in range(g.W):
                aw = app[w]
                if w < w_first or st.get(aw, 'pending') == 'pending':
                    continue
                if not visits[w] and w not in jumped:
                    continue
                if visits[w]:
                    end_f = visits[w][-1]['end']
                else:
                    later = [v for ww in range(w + 1, g.W) for v in visits[ww]]
                    if not later:
                        continue
                    end_f = min(later, key=lambda v: v['start'])[P['skip_wait']]
                if end_f > dec.t - cf and not last:
                    continue
                seg.decided.setdefault(aw, now)
                prev = seg.status.get(aw)
                seg.status[aw] = st[aw]
                kind = fl.get(aw, {}).get('kind')
                bad = st[aw] in ('wrong', 'missed') and (P['live_order'] or kind != 'order')
                seg.bad_run[aw] = seg.bad_run.get(aw, 0) + 1 if bad else 0
                if bad and seg.bad_run[aw] >= P['stable'] and aw not in seg.flagged:
                    m = self._word_mark(seg, aw, st[aw], fl.get(aw) or {}, visits[w], toks)
                    seg.flagged[aw] = m['id']
                    self.marks[m['id']] = m
                    events.append({'type': 'mark', 'mark': m})
                elif aw in seg.flagged and st[aw] == 'corrected' and prev != 'corrected':
                    mid = seg.flagged.pop(aw)
                    if self.marks.pop(mid, None):
                        events.append({'type': 'unmark', 'id': mid, 'why': 'corrected'})
        events += self._said(seg)
        events += self._ayat(seg, path, lpl)
        if any(ev['type'] in ('mark', 'unmark', 'said') for ev in events):
            events.append(self._score_event())
        return events

    def _cursor(self, seg):
        dec, g = seg.dec, seg.g
        if self.tail is not None and len(self.tail):
            saved = (dec.d.copy(), dec.gap.copy(), dec.t)
            seg.room(dec.t + len(self.tail) + 1)
            dec.feed(self.tail)
            cur = self._best_word(seg)
            dec.d, dec.gap, dec.t = saved
            return cur
        return self._best_word(seg)

    @staticmethod
    def _best_word(seg):
        d, gap, g = seg.dec.d, seg.dec.gap, seg.g
        s, gi = int(np.argmax(d)), int(np.argmax(gap))
        if d[s] >= gap[gi]:
            return seg.app[int(g.word_of[s])]
        return seg.app[gi - 1] if gi > 0 else None

    def _word_mark(self, seg, aw, status, f, vs, toks):
        """A word mark as check v2 makes it, from this step's decision."""
        row = {'w': aw, 'status': status}
        if vs:
            a, b = min(v['start'] for v in vs), max(v['end'] for v in vs)
            row['t'] = [round((seg.f0 + a) / FPS, 2), round((seg.f0 + b) / FPS, 2)]
            if f.get('heard'):
                row['heard'] = f['heard']
            heard = {aw: ''.join(self.e.ear.vocab[k - 1] for k, pk, _ in toks
                                 if a - HEARD_REACH <= pk < b + HEARD_REACH)}
        else:
            heard = {}
        return self.e.marks([row], {aw: f}, heard, [], [], [])[0]

    def _said(self, seg):
        """`said`: every word of the passage up to upTo is decided."""
        w = seg.lo if seg.up_to is None else seg.up_to + 1
        first_said = min(seg.decided) if seg.decided else None
        if first_said is None:
            return []
        w = max(w, first_said)
        while w < seg.hi and w in seg.decided:
            w += 1
        if w - 1 >= first_said and (seg.up_to is None or w - 1 > seg.up_to):
            seg.up_to = w - 1
            return [{'type': 'said', 'upTo': int(seg.up_to)}]
        return []

    def _ayat(self, seg, path, lpl):
        """Each ayah whose words are all decided: its tajweed (and letters) marks, then `ayah`."""
        if seg.up_to is None:
            return []
        events, spans = [], None
        e = self.e
        w = min(seg.decided)
        while w <= seg.up_to:
            s, a, _ = e.key.where(w)
            first = e.words.first[e.words.vindex[(s, a)]]
            n = e.words.counts[e.words.vindex[(s, a)]]
            last_w = first + n - 1
            if last_w > seg.up_to:
                break
            if (s, a) not in seg.judged and first >= seg.lo:
                seg.judged.add((s, a))
                if spans is None:
                    spans = self._spans(seg, path)
                tj, letters = e.ayah_notes(lpl, s, a, seg.status, spans, self.st)
                for m in e.marks([], {}, {}, [], tj, letters if self.st['letters'] else []):
                    if m['id'] not in self.marks:
                        self.marks[m['id']] = m
                        events.append({'type': 'mark', 'mark': m})
                events.append({'type': 'ayah', 's': int(s), 'a': int(a)})
            w = last_w + 1
        return events

    @staticmethod
    def _spans(seg, path):
        """app word -> (first frame, last frame + 1) on the path so far (this segment's frames)."""
        out = {}
        word_of = seg.g.word_of
        for t, s, _ in path:
            if s >= 0:
                aw = seg.app[int(word_of[s])]
                a, b = out.get(aw, (t, t + 1))
                out[aw] = (min(a, t), max(b, t + 1))
        return out

    def _score_event(self):
        reached = sum((seg.up_to - min(seg.decided) + 1) for seg in self.segs if seg.up_to is not None)
        live = [m for m in self.marks.values() if m['id'] not in self.dismissed]
        mistakes = sum(1 for m in live if m['kind'] in MISTAKE_KINDS)
        return {'type': 'score', 'reached': int(reached), 'mistakes': mistakes,
                'tajweed': sum(1 for m in live if m['kind'] == 'tajweed'),
                'accuracy': round(max(0.0, 1 - mistakes / reached), 4) if reached else 1.0}

    # ------------------------------------------------------------ the end

    def _final(self):
        """Each segment of the take checked whole, as POST /check v=2, put together."""
        e = self.e
        out = None
        statuses = {}
        for i, seg in enumerate(self.segs):
            b = self.segs[i + 1].sample0 if i + 1 < len(self.segs) else self.n
            x = self.x[seg.sample0:b]
            if len(x) < SR:
                continue
            r = e.check(x, seg.s, seg.a, seg.s2, seg.a2, self.raw, v=2)
            off = seg.sample0 / SR
            for w in r['words']:
                if 't' in w:
                    w['t'] = [round(w['t'][0] + off, 2), round(w['t'][1] + off, 2)]
                statuses[w['w']] = w['status']
            for m in r['marks']:
                if 't' in m:
                    m['t'] = [round(m['t'][0] + off, 2), round(m['t'][1] + off, 2)]
            for x_ in r['extras']:
                x_['t'] = round(x_['t'] + off, 2)
            if out is None:
                out = r
            else:
                for k in ('words', 'extras', 'tajweed', 'marks'):
                    out[k] += r[k]
                if r['letters'] is not None:
                    out['letters'] = (out['letters'] or []) + r['letters']
                out['to'] = r['to']
        if out is None:
            raise BadRequest('too short')
        out['secs'] = round(self.n / SR, 1)
        out['score'] = score(statuses, out['marks'], self.dismissed)
        return out
