"""The live check (/live): the lab's live checker (checker.run_item_live) run on audio as it arrives.

Every hop (0.5 s of audio) the model runs on the last 4 s; frames with at least 1 s of audio after them are final and
go to the checker's Viterbi decoder. The cursor (`at`) comes from the newest window's provisional frames as well
(follow_live.py), so it lags a word's start by about half a second. A word is decided once it is 0.5 s behind the
newest final frame, on the best path over the last 30 s, exactly as run_item_live decides it. A mark is sent once
its word is decided wrong; an `unmark` when the reciter goes back and says it right. Tajweed (and letters, when
asked) come per ayah, once every word of the ayah is decided. `end` is the whole take decided once more.

What this adds to run_item_live, all to serve a stream (none of it changes how a word is judged):
  - the decoder's tables grow as frames come (run_item_live knows the length in advance);
  - the passage is cut into segments of SEG_WORDS words: when the reciter nears a segment's end (or seeks, or a
    segment holds SEG_FRAMES frames), a new one starts at the first undecided word, from the frame the last decided
    word ended, with SEG_BACK words before it so a repeat is still a repeat. Memory and time per hop stay bounded
    on any passage length. Words before a segment's first word are never marked by it, only unmarked;
  - the traceback stops at the 30 s window instead of walking to the take's start (run_item_live cuts there after);
  - the greedy tokens (heard_tokens) are kept as frames come instead of recomputed on the whole take;
  - the words of the next segment (their sounds and look-alikes: about 25 ms a word, in pure Python) are worked out
    in a helper process while the reciter is still in this one, so starting it doesn't hold up a hop. A thread
    would hold the GIL and slow the hops themselves (one took 0.7 s).

Everything here is a function of the audio and of where in it each seek and dismissal arrived, so a session can be
run again from its audio (a resumed socket on another instance) and gives the same events.
"""
import concurrent.futures
import contextlib
import inspect
import json
import multiprocessing
import os
import sys
import threading
import time
import unicodedata

import numpy as np

from engine import FPS, SAID, WORDS_P, BadRequest, ayah_pieces, heard_sounds, score, settings_of  # puts the harness on the path
import checker  # noqa: E402  (the harness's)
import similar  # noqa: E402  (fit_many, for the Qur'an-wide search)

SR = 16000
LIVE = {'hop': 0.5, 'win': 4.0, 'look': 1.0, 'commit': 0.5, 'context': 30.0, 'stable': 1, 'skip_wait': 'start',
        'live_order': False}
SEG_WORDS = 96      # words in a segment's graph
SEG_FIRST = 96      # the first segment's (the word table makes building it quick)
SEG_BACK = 16       # words before a segment's first word, for repeats
SEG_MARGIN = 24     # a new segment starts when the cursor is this close to the segment's last word
SEG_FRAMES = 3 * 60 * FPS  # ...or when a segment has taken this many frames (3 minutes)
MAX_SECONDS = 15 * 60
EXTRA_STABLE = 2    # hops in a row an extra word must be there before it is shown
FIX_STABLE = 4      # hops in a row a marked word must be heard right again before it is unmarked
JUMP_BACK = 3       # the cursor moving back more than this many words, or ahead more than JUMP_AHEAD, is shown only
JUMP_AHEAD = 6      # once the next hop agrees (within a word): one hop's provisional frames once took it 13 words back
                    # and forward again (Majd's Recite take, 3:1, Nov 14 2026)
LEAD_FRAMES = 10    # a filler starting this close to a segment's first frame is the pause it started in, not a word
SETTLE = 3.0        # seconds a seam must be behind the newest final frame: the path there no longer moves
# Start anywhere on the page (Majd, Nov 14 2026; contract protocol 6, `startBy`): the start is searched for over the
# page and an ayah either side, and locked once the best path's first word has held LOCK_HOPS hops, LOCK_WORDS words
# after it are heard and final, and the words heard so far occur only once in the range searched (a phrase the page
# repeats waits until the two places part). A take that never locks fails silently (Majd: no prompt, since a reciter
# may have the page hidden; nonsense or a passage off the page shows nothing): no cursor, no marks, `done` with no
# words and start null, and `ms.search_speech` (speech heard without a lock) for the server's log.
# One word of the run may be missing (a skip right after the start: 1:5 said without نعبد never locked, recite-server
# Nov 15 2026); it doesn't count toward LOCK_WORDS. Bench takes cut one word before a planted mistake (206): never
# locked within 25 s 118 → 57.
LOCK_WORDS = 3
LOCK_HOPS = 2
# Sooner on QUICK_WORDS: the path's first QUICK_WORDS words (one fewer than the rule above), all heard as correct, none
# missing, each heard well (its sounds score QUICK_MEAN or better on average: 0 is the ear's own best guess), in the
# first LONG_SEARCH seconds. Bench end to end (Nov 15 2026, 8 reciters × 8 passages): from an ayah start a third in
# 7.7 → 6.7 s (median; p90 11.7 → 9.7 s), from mid-ayah 7.7 → 6.7 s (p90 12.2 → 8.2 s); the same places, and off the
# page the same 10 of 120. Without the sound check, Al-Kahf 18:4–5 (ما لهم به … لآبائهم) locked on Ya-Sin 36:6's page
# (ما أنذر آباؤهم): its words scored -1.5 to -2.1. Two words, whatever the sound check, locked 2–16 more takes off the
# page (traces, rules tuned on passages 2, 5, 7).
QUICK_WORDS = 3
QUICK_MEAN = -1.0
# A search that has run LONG_SEARCH seconds without a lock asks for LONG_EXTRA more words: the longer nothing on the
# page fits, the likelier the reciter is elsewhere, and a long take off the page meets phrases the page shares. Off the
# page in full (120 takes): 14 → 11 locks; every start on the page locks well before (bench: 18 s at most).
LONG_SEARCH = 30.0
LONG_EXTRA = 2
# The page's top locks sooner: a reciter who opens a page nearly always starts there, and a slow reciter's first word
# alone can last longer than Majd's 3 s bar (Abdulbaset, mujawwad: 4–10 s). So once the best path has begun at the
# page's first word (or at words reading the same, letter for letter, as the page's first words: 17:111 before Al-Kahf
# also says الحمد لله الذي) for TOP_HOPS hops, heard as correct, the take starts at the top. Bench (Nov 15 2026, 8
# reciters, held-out passages): lock 2.6 s after the first word (p90 2.9 s), against 6.5 s without the tie; no
# start further in was taken for the top. The first word must also have covered TOP_SOUNDS of its sounds (all of a
# shorter word's): unrelated speech held Al-Fatiha's 1:1 for 3 hops on blanks alone. Off the page (another passage's
# audio, 120 takes) 7 locked, all Al-Fatiha on Al-Kahf's page: both open with a basmala and الحمد لله; the strict rule
# locks 6 of those same 7, later. 2 hops, not 3 (Nov 15 2026), for room under the 3 s bar once Cloud Run and the
# network are added (one take took 3.03 s there): 2.7 → 2.2 s (median; p90 2.9 → 2.4 s), the same places, and no more
# locks off the page.
TOP_HOPS = 2
TOP_SOUNDS = 3
MAX_SEARCH = 480    # words searched at most (the server allows a page of 400, plus an ayah either side)
# Anywhere in the Qur'an (recite-anywhere step 2, contract protocol 7, `startIn: "quran"`): when the page hasn't locked
# after QURAN_AFTER seconds of speech, the sounds heard (greedy, as consonants) vote for places Qur'an-wide
# (QuranIndex), the best QURAN_TOP are fitted with the ear (similar.fit_many), and a place off the page that fits well
# (QURAN_FIT) and clearly better than the next (QURAN_MARGIN) gets its own locator over its ayah and the ones around it.
# That locator locks as the page's does, but stricter: QURAN_WORDS settled words, all heard as correct, held LOCK_HOPS
# hops, and never a run of words the Qur'an has elsewhere (2:5 and 31:5 wait until they part). A wrong jump is worse
# than none (Majd).
QURAN_AFTER = 3.0
QURAN_EVERY = 4     # hops between two votes (2 s): with QURAN_SECS, about 0.1 vCPU while unlocked on Cloud Run
QURAN_SECS = 15.0   # speech fitted, from its first sound
QURAN_STOP = 30.0   # seconds of speech after which the Qur'an-wide search gives up (the take fails silently)
QURAN_TOP = 10
QURAN_CHAIN = 20    # words of each place fitted
QURAN_FIT = 1.2     # nats a frame
QURAN_MARGIN = 0.2  # nats a frame between the best place and the next, for it to get a locator (which then locks only
                    # on QURAN_WORDS words said nowhere else)
QURAN_WORDS = 5
QURAN_DOUBT_MAX = 8.0  # (startIn) while a place off the page has its own locator and every word it has heard so far is
                       # right, the page's word rule waits, for this long at most: 78:29 «وكل شيء أحصيناه كتابا» with
                       # Ya-Sin's first page open locked on 36:12 (the same first three words). A wrong word there lets
                       # the page lock at once (78:25 «حميما وغساقا» on its own page, against 38:57 «حميم وغساق»).
NEG = checker.Decoder.NEG
_pool = None

# Each ayah's letters and tajweed (Engine.ayah_notes) are judged once all its words are decided: the released model's
# rules and letters (up to ~1 s on Cloud Run's vCPU) and, in Strict, the second model (v5, about 1 s more). Run inside
# the hop, they held up the cursor on one vCPU (Strict: p90 1.9 s, worst 4 s, Nov 14 2026). With `defer` (the
# server's setting) an ayah is judged on one background thread at the lowest priority (Linux), started only once the
# chunk that finished it has been answered, and its marks and `ayah` event come out at the first hop a set time of
# audio later (waiting for the thread only if it is late, as a fast replay is), or in `done`. The hop is left with the
# model and the decoder; the events still depend only on the audio and where each control came, so any chunk size, or
# a resume, gives the same.
# The time: AYAH_DUE, or longer for a long ayah, as its judging grows with its length. On one vCPU the thread gets
# what the hops leave: husary.p1.m1 (Strict, ayat of ~22 s, ~2.5 s of CPU each) took ~4.4 s an ayah, past a flat 3 s,
# so the hop waited for it (recite-server, Nov 14 2026).
AYAH_DUE = 3.0
AYAH_DUE_SHARE = {'strict': 0.3, 'words': 0.1}  # seconds of wait per second of the ayah, by level
_ayah_pool = None
_ayah_pool_lock = threading.Lock()


def _ayah_lowest_priority():
    if sys.platform.startswith('linux'):  # elsewhere a thread id isn't a valid target for setpriority
        try:
            os.setpriority(os.PRIO_PROCESS, threading.get_native_id(), 19)
        except OSError:
            pass


def _ayah_submit(idle, fn, *args, **kw):
    global _ayah_pool
    with _ayah_pool_lock:
        if _ayah_pool is None:
            _ayah_pool = concurrent.futures.ThreadPoolExecutor(1, 'ayah', initializer=_ayah_lowest_priority)
    return _ayah_pool.submit(_ayah_job, idle, fn, *args, **kw)


def _ayah_job(idle, fn, *args, **kw):
    idle.wait(5.0)  # the chunk that finished the ayah sends its cursor first
    t0 = time.perf_counter()
    got = fn(*args, **kw)
    return got, (time.perf_counter() - t0) * 1000


def secs(span):
    return [round(span[0] / FPS, 2), round(span[1] / FPS, 2)]


def word_rows(kws, statuses, flagged, visits, f0=0):
    """Engine.judge's word rows (every word decided), the frames each heard word spans (every reading of it) and
    its last reading's frames, plus f0 (a segment's first frame)."""
    spans, readings, words = {}, {}, []
    for i, kw in enumerate(kws):
        w = kw['word']
        stt = statuses.get(w, 'pending')
        if visits[i]:
            spans[w] = (f0 + min(v['start'] for v in visits[i]), f0 + max(v['end'] for v in visits[i]))
            readings[w] = (f0 + visits[i][-1]['start'], f0 + visits[i][-1]['end'])
        if stt == 'pending':
            continue
        row = {'w': w, 'status': stt}
        f = flagged.get(w)
        if f:
            row['kind'] = f.get('kind')
            if f.get('heard'):
                row['heard'] = f['heard']
        if w in spans:
            row['t'] = secs(spans[w])
        words.append(row)
    return words, spans, readings


def extra_rows(extras, fillers, kws, delay, f0=0):
    """decide()'s extras as v1 rows, each with the frames of its filler ('span')."""
    W = len(kws)
    out = []
    for e in extras:
        span = None
        for gi, a, b in fillers:
            if e.get('trail') and gi == W or not e.get('trail') and 0 < gi < W \
                    and kws[gi - 1]['word'] == e['after'] and abs(b / FPS + delay - e['t']) < 1e-6:
                span = [f0 + a, f0 + b]
                break
        out.append({'after': e['after'], 't': round(e['t'], 2), 'trail': bool(e.get('trail')), 'span': span})
    return out


def v1_extra(e):
    return {k: e[k] for k in ('after', 't', 'trail')}


# ------------------------------------------------------------ the helper process (the next segment's words)

class _VocabEar:
    """All checker.Key needs of the model: its sounds."""

    def __init__(self):
        cfg = checker.LAB / 'models/hisnlabs-tajweed-v2/config.json'
        self.vocab = json.loads(cfg.read_text())['phonemes']
        self.index = {p: i + 1 for i, p in enumerate(self.vocab)}


_KEY = None


def _helper_init():
    global _KEY
    _KEY = checker.Key(_VocabEar())


def _helper_words(lo, hi, alts, rule):
    return _KEY.passage(lo, hi, alts, rule)


def start_helper():
    """One helper process for this instance (call once, at start; without it, words are worked out in line)."""
    global _pool
    if _pool is None:
        _pool = concurrent.futures.ProcessPoolExecutor(1, mp_context=multiprocessing.get_context('spawn'),
                                                       initializer=_helper_init)
        _pool.submit(len, ()).result()  # started and ready
    return _pool




def _letters(text):
    """A word's letters, harakat and Quranic marks aside (two words that sound the same read the same); the dagger
    alif is said, so it stays an alif (مَٰلِكِ is not مَلِكِ)."""
    return ''.join(ch for ch in unicodedata.normalize('NFD', text.replace('\u0671', '\u0627').replace('\u0670', '\u0627'))
                   if unicodedata.category(ch) != 'Mn' and ch != '\u0640')


class QuranIndex:
    """Every word of the Qur'an as the ear's consonants (checker.skeleton of its first form), in one string, with where
    each run of N consonants is: the sounds heard vote for the word a run starts at (a diagonal, as in a dot plot).
    Built ahead into the word table (make_words.py --merge: table['quran']), keyed with it; worked out from the table's
    words when it isn't there (0.4 s on the Mac). None without a table (Key.passage is ~100 ms a word on Cloud Run)."""
    N = 4
    _made = {}

    @classmethod
    def of(cls, E):
        t = getattr(E, 'table', None)
        if t is None:
            return None
        if id(t) not in cls._made:
            d = t.get('quran')
            cls._made.clear()
            cls._made[id(t)] = cls(d if d is not None and d.get('n') == cls.N else cls.data(t))
        return cls._made[id(t)]

    @classmethod
    def data(cls, table):
        """The index of a word table, as plain arrays (what make_words.py keeps in it)."""
        import pickle
        off, blob = table['offsets'], table['blob']
        skel = []
        for w in range(table['words']):
            k = pickle.loads(blob[off[w]:off[w + 1]])
            skel.append('' if isinstance(k, tuple) else checker.skeleton(checker.norm_sounds(k['forms'][0]['sounds'])))
        q = ''.join(skel)
        word_at = np.repeat(np.arange(len(skel), dtype=np.int32), [len(x) for x in skel])
        grams = {}
        for i in range(len(q) - cls.N + 1):
            grams.setdefault(q[i:i + cls.N], []).append(i)
        return {'n': cls.N, 'word_at': word_at, 'grams': {g: np.array(v, np.int32) for g, v in grams.items()}}

    def __init__(self, data):
        self.word_at, self.grams = data['word_at'], data['grams']

    def places(self, heard, top=QURAN_TOP, use=40):
        """The words most of the first `use` consonants heard vote for as the start (a word either side of a better
        place is that place), best first."""
        h, votes = heard[:use], {}
        for i in range(len(h) - self.N + 1):
            ps = self.grams.get(h[i:i + self.N])
            if ps is None:
                continue
            for w in self.word_at[ps[ps >= i] - i].tolist():
                votes[w] = votes.get(w, 0) + 1
        out = []
        for w, _ in sorted(votes.items(), key=lambda kv: (-kv[1], kv[0])):
            if not any(abs(w - u) <= 1 for u in out):
                out.append(w)
                if len(out) >= top:
                    break
        return out


class Decoder(checker.Decoder):
    """checker.Decoder for a stream. Its tables grow as frames come; traceback() can stop at a frame (the live
    window); and it can start at a word inside its graph (`entry`; the words before are there for repeats):
      'after': as if the word before had just been said (its last blank holds the pause), so skipping the entry
               word costs what a skip costs from there;
      'lead':  as if a free lead had held everything until now (a seek: the reciter may say anything first);
      'anywhere': a free lead before every word, all at the same cost, so the path may begin at any word (the
               locator, while a take's start on its page is searched for: LiveSession(start_by=…))."""

    def __init__(self, g, P, entry=0, start='after', cap=1500):
        super().__init__(g, P, cap)
        self.entry, self.start = entry, start
        if start == 'anywhere':  # no word's lead cheaper than another's (a surah's basmala gap is, normally)
            self.pen[:g.W] = P['fill']
        # for the vectorized step: each word's skip and repeat sources as columns (see _fast_step)
        ks = np.array(self.skips, np.int64)
        self._K = int(ks.max()) if len(ks) else 0
        self._kcol = self._K - ks
        self._kpen = P['skip'] * ks
        self._ks = ks
        self._no1, self._no2, self._nomadd = ~g.prev1, ~g.prev2, ~g.madd

    def _grow(self, n):
        need = self.t + n
        if need <= self.bp.shape[0]:
            return
        cap = max(need + 500, 2 * self.bp.shape[0])
        for name in ('bp', 'ent_src', 'gap_src', 'ex_state'):
            old = getattr(self, name)
            new = np.zeros((cap,) + old.shape[1:], old.dtype)
            new[:self.t] = old[:self.t]
            setattr(self, name, new)

    def feed(self, lp):
        if len(lp):
            self._grow(len(lp))
            super().feed(lp)

    def _step(self, e):
        first = self.t == 0
        if first:
            super()._step(e)
        else:
            self._fast_step(e)
        if first and self.start == 'anywhere':
            g = self.g
            self.d = np.full(g.S + 1, NEG)
            self.gap = np.full(g.W + 1, NEG)
            self.gap[:g.W] = float(e.max()) + self.pen[:g.W]
        elif first and self.entry:
            g = self.g
            self.d = np.full(g.S + 1, NEG)
            self.gap = np.full(g.W + 1, NEG)
            if self.start == 'after':
                ex = g.exits[self.entry - 1]
                ex = ex[(ex < g.S) & (g.lab[ex] == 0) & (g.alt_of[ex] < 0)]  # the word's own last blanks
                self.d[ex] = e[0]
            else:
                self.gap[self.entry] = float(e.max()) + self.pen[self.entry]

    def _fast_step(self, e):
        """checker.Decoder._step with its two loops (12 skips, 31 repeats, a numpy op each) done as one op each over
        a window view: the same sums, the same maxima, ties to the same (first) source, so the same tables and
        scores to the bit (tests/test_live.py checks it frame by frame against the checker's own Decoder)."""
        g, P, NEG = self.g, self.P, self.NEG
        S, W, t = g.S, g.W, self.t
        best_any = float(e.max())
        d, gap, widx, rows = self.d, self.gap, self.widx, self.widx
        vals = d[g.exits]
        am = vals.argmax(axis=1)
        ex = vals[rows, am]
        self.ex_state[t] = g.exits[rows, am]
        cand = np.full(W, NEG)
        src = np.zeros(W, np.int64)

        def offer(c, code, idx):
            better = c > cand
            cand[better] = c[better]
            src[better] = code * 1_000_000 + idx[better]

        c = np.full(W, NEG); c[1:] = ex[:-1]
        offer(c, 1, widx - 1)
        c = np.full(W, NEG); c[0] = gap[0]
        offer(c, 3, np.zeros(W, np.int64))
        if self._K:  # skips: c_k[w] = ex[w - 1 - k] + skip * k, the first k with the best value
            pad = np.concatenate([np.full(self._K + 1, NEG), ex])
            view = np.lib.stride_tricks.sliding_window_view(pad, self._K + 1)[:W]
            sk = view[:, self._kcol] + self._kpen
            j = sk.argmax(axis=1)
            offer(sk[rows, j], 2, widx - 1 - self._ks[j])
        if self.backs > 0:  # repeats: the best exit of words w .. w + backs, the first o with it
            pad = np.concatenate([ex, np.full(self.backs, NEG)])
            view = np.lib.stride_tricks.sliding_window_view(pad, self.backs + 1)[:W]
            warg = view.argmax(axis=1)
            offer(view[rows, warg] + P['back'], 4, widx + warg)
            if P.get('gap_back') is not None:  # back from the filler after words w .. w + backs (gaps w + 1 ..)
                pad = np.concatenate([gap[1:], np.full(self.backs, NEG)])
                view = np.lib.stride_tricks.sliding_window_view(pad, self.backs + 1)[:W]
                warg = view.argmax(axis=1)
                offer(view[rows, warg] + P['gap_back'], 7, widx + warg + 1)
        c = gap[:W].copy(); c[0] = NEG
        offer(c, 5, widx)
        c = np.full(W, NEG); c[1:] = gap[1:W] + P['fill_sub']
        offer(c, 6, widx - 1)
        self.ent_src[t] = src

        nd = d.copy()
        code = self.bp[t]
        code[:] = 0
        c = np.empty(S + 1)
        c[0] = NEG; c[1:] = d[:-1]; c[self._no1] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 1
        c[:2] = NEG; c[2:] = d[:-2]; c[self._no2] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 2
        c[:-1] = d[1:]; c[-1] = NEG; c[self._nomadd] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 3
        ce = cand[:, None] + self.alt_pen
        cur = nd[g.entries]
        b = ce > cur
        nd[g.entries[b]] = ce[b]
        code[g.entries[b]] = 4
        nd += e[g.lab]
        nd[S] = NEG

        ng = gap.copy()
        gs = self.gap_src[t]
        gs[:] = 0
        c = np.empty(W + 1); c[0] = NEG; c[1:W] = ex[:W - 1] + P['fill_in']; c[W] = ex[W - 1]
        b = c > ng; ng[b] = c[b]; gs[b] = 1
        ng += best_any + self.pen
        self.d, self.gap = nd, ng
        self.t = t + 1

    def _score_step(self, e):
        """The scores of the next frame alone (d and gap, the same values as _fast_step's), no tables: the cursor's
        look at the provisional frames, which is put back after."""
        g, P, NEG = self.g, self.P, self.NEG
        S, W = g.S, g.W
        best_any = float(e.max())
        d, gap = self.d, self.gap
        ex = d[g.exits].max(axis=1)
        cand = np.empty(W); cand[0] = gap[0]; cand[1:] = ex[:-1]  # (no score is below NEG)
        if self._K:
            pad = np.concatenate([np.full(self._K + 1, NEG), ex])
            sk = np.lib.stride_tricks.sliding_window_view(pad, self._K + 1)[:W][:, self._kcol] + self._kpen
            np.maximum(cand, sk.max(axis=1), out=cand)
        if self.backs > 0:
            pad = np.concatenate([ex, np.full(self.backs, NEG)])
            np.maximum(cand, np.lib.stride_tricks.sliding_window_view(pad, self.backs + 1)[:W].max(axis=1)
                       + P['back'], out=cand)
            if P.get('gap_back') is not None:
                pad = np.concatenate([gap[1:], np.full(self.backs, NEG)])
                np.maximum(cand, np.lib.stride_tricks.sliding_window_view(pad, self.backs + 1)[:W].max(axis=1)
                           + P['gap_back'], out=cand)
        c = gap[:W].copy(); c[0] = NEG
        np.maximum(cand, c, out=cand)
        c = np.empty(W); c[0] = NEG; c[1:] = gap[1:W] + P['fill_sub']
        np.maximum(cand, c, out=cand)
        nd = d.copy()
        c = np.empty(S + 1)
        c[0] = NEG; c[1:] = d[:-1]; c[self._no1] = NEG
        np.maximum(nd, c, out=nd)
        c[:2] = NEG; c[2:] = d[:-2]; c[self._no2] = NEG
        np.maximum(nd, c, out=nd)
        c[:-1] = d[1:]; c[-1] = NEG; c[self._nomadd] = NEG
        np.maximum(nd, c, out=nd)
        ent = g.entries
        nd[ent] = np.maximum(nd[ent], cand[:, None] + self.alt_pen)
        nd += e[g.lab]
        nd[S] = NEG
        ng = gap.copy()
        c = np.empty(W + 1); c[0] = NEG; c[1:W] = ex[:W - 1] + P['fill_in']; c[W] = ex[W - 1]
        np.maximum(ng, c, out=ng)
        ng += best_any + self.pen
        self.d, self.gap = nd, ng
        self.t += 1

    def feed_scores(self, lp):
        """Frames for scores only (the provisional ones): no tables written. Put the decoder back after."""
        if self.t == 0:
            self.feed(lp)
            return
        for row in lp:
            self._score_step(row)

    def state(self):
        return self.d.copy(), self.gap.copy(), self.t

    def restore(self, s):
        self.d, self.gap, self.t = s

    def word_now(self):
        """The graph's word the best state is in now (for a filler, the word before it); None in a lead."""
        s, gi = int(np.argmax(self.d)), int(np.argmax(self.gap))
        if self.d[s] >= self.gap[gi]:
            return int(self.g.word_of[s])
        if gi == 0 or self.start == 'lead' and gi == self.entry:
            return None
        return gi - 1

    def traceback(self, final=True, since=0):
        """checker.Decoder.traceback, stopping at frame `since`."""
        g, P, W = self.g, self.P, self.g.W
        d, gap = self.d, self.gap
        vals = d[g.exits]
        am = vals.argmax(axis=1)
        if final:
            ex = vals[self.widx, am]
            ends = ex + P['stop']
            ends[W - 1] = ex[W - 1]
            if gap[W] >= ends.max():
                cur, score = ('gap', W), float(gap[W])
            else:
                w = int(np.argmax(ends))
                cur, score = ('state', int(g.exits[w, am[w]])), float(ends.max())
        else:
            s, gi = int(np.argmax(d)), int(np.argmax(gap))
            cur, score = (('state', s), float(d[s])) if d[s] >= gap[gi] else (('gap', gi), float(gap[gi]))
        return self._walk(cur, self.t - 1, since), score

    def traceback_from(self, t, state):
        """The best path that is in word state `state` at frame t (a seam), from frame 0."""
        return self._walk(('state', state), t, 0)

    def _walk(self, cur, t, since):
        g = self.g
        path = []
        while t >= since:
            if cur[0] == 'gap':
                gi = cur[1]
                path.append((t, -(gi + 1), False))
                if t == since:
                    break
                if self.gap_src[t, gi] == 1:
                    cur = ('state', int(self.ex_state[t, gi - 1]))
                t -= 1
                continue
            s = cur[1]
            c = self.bp[t, s] if t > 0 else 4
            path.append((t, s, c == 4))
            if t == since:
                break
            if c == 4:
                w = int(g.word_of[s])
                kind, idx = divmod(int(self.ent_src[t, w]), 1_000_000)
                cur = ('state', int(self.ex_state[t, idx])) if kind in (1, 2, 4) else ('gap', idx)
            else:
                cur = ('state', s + {0: 0, 1: -1, 2: -2, 3: 1}[int(c)])
            t -= 1
        path.reverse()
        return path


class Segment:
    """App words [a, b) in one graph, decoded from frame f0; `first` is the first word it may mark."""

    def __init__(self, E, P, a, b, first, f0, start):
        self.a, self.b, self.first, self.f0, self.start = a, b, first, f0, start
        self.kws = E.passage_words(a, b)
        self.app = [k['word'] for k in self.kws]
        self.g = checker.Graph(self.kws)
        self.dec = Decoder(self.g, P, entry=first - a, start=start)

    def own_extra(self, e):
        """An extra word this segment may report: after its first word's predecessor or later, and never filler
        the segment started in (the pause it starts at, whatever the start)."""
        if e['after'] < self.first - 1:
            return False
        return not (e['after'] == self.first - 1 and e['span'] and e['span'][0] - self.f0 <= LEAD_FRAMES)

    def frames(self):
        return self.f0 + self.dec.t


class LiveSession:
    """One live check. feed() audio (PCM16 bytes), control() messages, finish() at the end; each returns the events
    to send, in order (dicts, recite-contract.md)."""

    def __init__(self, engine, s, a, s2=None, a2=None, settings=None, follow=False, defer=False, open_end=False,
                 start_by=None, start_in=None):
        E = self.E = engine
        # follow (Recite, contract draft 5): the cursor and `said` only; words are decided (said needs them) but no
        # mark is made, letters and tajweed aren't judged, and no mark, unmark or score is sent
        self.follow = bool(follow)
        raw = dict(settings or {})
        if self.follow:
            raw.update(letters='0', tajweed='0')
        self.st = settings_of(raw)
        # the model this take runs on, with its own word settings and bars: v6 for Recite and Words & harakat, the
        # released model for Strict (Engine.level)
        self.lv = E.level(self.st)
        self.ear = self.lv.ear
        self.P = dict(self.lv.words_p, **LIVE)
        if (s2 is None) != (a2 is None):
            raise BadRequest('both or neither of s2, a2')
        self.lo, self.end = E.passage(s, a, s2, a2, max_words=10 ** 6)
        self.range_lo = self.lo          # the passage's first word (`done.from`); lo moves to the start once locked
        # start_by (sura, ayah): the take starts at some word from s:a through the end of start_by (a page); it is
        # searched for, and nothing is sent or decided until it's locked (see LOCK_WORDS)
        self.start_by = start_by
        self.search = self._search_range(s, a, start_by) if start_by is not None else None
        self._search_f0 = 0              # the frame the search began at
        self.loc = None                  # the locator: a Segment over the search range ('anywhere')
        self._loc_hist = []              # its best path's first word, hop by hop
        self._top_hist = []              # whether that start was the page's top, hop by hop (TOP_HOPS)
        self._search_top = self.lo       # the page's first word
        self._search_speech = 0.0        # seconds of speech the current search has heard (for the log)
        # start_in 'quran' (with start_by): off the page, the start is searched for Qur'an-wide too (QURAN_AFTER)
        self.start_in = start_in if start_in == 'quran' and start_by is not None else None
        self._q_reset()
        self.start_w = None              # the word the take was locked to start at
        self.locked_ev = None            # the `locked` event, for a resume's snapshot
        # open_end: the phone gave no end and the server runs the take on to the end of the Qur'an (server.LAST_AYAH);
        # `done.result.to` is then the end of the last ayah reached, not the Qur'an's
        self.open_end = open_end
        self.V = len(self.ear.vocab) + 1
        # Strict on the second model (v5, #539): ayah_notes takes the take's samples when the engine has it
        self.v5 = self.st.get('tajweed', True) and getattr(E, 'ear2', None) is not None \
            and 'audio' in inspect.signature(E.ayah_notes).parameters
        # defer: each ayah's letters and tajweed off the hop (see _ayah_submit); with nothing to judge, nothing to defer
        self.defer = bool(defer) and not self.follow and (self.st['letters'] or self.st.get('tajweed', True))
        self._pending = []               # (notes key, s, a, future, due) of ayat judged in the background, in order
        self._idle = threading.Event()   # set while the session isn't working on a chunk (see _working)
        self._idle.set()
        self._depth = 0
        self.xf = np.zeros(SR * 30 if self.v5 else 0, np.float32)
        self.pcm = np.zeros(SR * 30, np.int16)
        self.n = 0                       # samples received
        self.lp = np.zeros((1500, self.V), np.float32)
        self.T = 0                       # final frames
        self.k = 0                       # hops done
        self.toks, self.tok_cut = [], 0  # greedy tokens before tok_cut (absolute peaks), final
        self.segs = []                   # finished segments' results
        self.seg = None
        self.origin = self.lo            # where the reciter started (or last seeked to): `said` counts from here
        self.status = {}                 # app word -> its latest decision (correct, corrected, wrong, missed)
        self.decided = {}                # app word -> audio seconds when first decided
        self.bad_run = {}
        self.flagged = {}                # app word -> audio seconds when marked
        self.bad_from = {}               # app word -> frame its mistake was heard (a later good visit unmarks it)
        self.spans = {}                  # app word -> (first frame, last frame) heard, absolute
        self.readings = {}               # app word -> its last reading's (first frame, last frame): ayah notes
        self.marks = {}                  # id -> Mark, shown now
        self.extra_run = {}
        self.good_run = {}
        self.dismissed = set()
        self.ayat_done = set()
        self.ctrl = []                   # (samples received when it came, message)
        self.seams = []                  # (seconds, cursor, first word, frame, start) of each segment after the first
        self._window = (None, [])        # the segment and path of the last decision (for a seam's state)
        self.sent = {'at': None, 'said': None, 'score': None}
        self.off_w = None                # the word an `off` was sent for, until the cursor reaches it (_off_event)
        self.unmarked = set()            # ids taken back (and not marked again): for a resume's snapshot
        self.helped = set()              # words the phone showed the reciter (hints) before they were decided
        self._notes_cache = {}           # an ayah's notes by what they read (see _notes)
        self.hints = []                  # (seconds, hint) as they came
        self.ayah_sent = []              # ayah events sent: for a resume's snapshot
        self.stopped = False
        self.result = None
        self.ms = {'model': 0.0, 'words': 0.0, 'tajweed': 0.0, 'hops': 0, 'worst_hop': 0.0,
                   # defer: ayat handed to the thread, the hops' waits for it (total, worst), `done`'s wait, and the
                   # ayat `done` judged again itself
                   'ayah_jobs': 0, 'due_wait': 0.0, 'worst_due_wait': 0.0, 'done_wait': 0.0, 'done_notes': 0}
        if self.start_in:
            self.ms['search_quran'] = 0.0  # the Qur'an-wide search's time (start_in)
        self._judged_here = 0
        self._jump = None                # a big cursor move waiting for the next hop to agree (_cursor)
        self._seeked = False
        self.seg = None                  # built on the first hop: a new session answers at once

    # ------------------------------------------------------------ input

    def feed(self, data):
        """PCM 16-bit little-endian mono 16 kHz, any length (an odd byte at the end is dropped)."""
        if self.stopped:
            return []
        x = np.frombuffer(data[: len(data) // 2 * 2], '<i2')
        room = MAX_SECONDS * SR - self.n
        x = x[:max(0, room)]
        if self.n + len(x) > len(self.pcm):
            grown = np.zeros(max(self.n + len(x), 2 * len(self.pcm)), np.int16)
            grown[:self.n] = self.pcm[:self.n]
            self.pcm = grown
        self.pcm[self.n:self.n + len(x)] = x
        if self.v5:
            if self.n + len(x) > len(self.xf):
                grown = np.zeros(len(self.pcm), np.float32)
                grown[:self.n] = self.xf[:self.n]
                self.xf = grown
            self.xf[self.n:self.n + len(x)] = x.astype(np.float32) / 32768.0
        self.n += len(x)
        with self._working():
            ev = self._run()
            if self.n >= MAX_SECONDS * SR:
                ev += self.finish(why='too_long')
        return ev

    def control(self, msg):
        """seek {w}, dismiss {id}, undismiss {id}, hint or end: applied at this point of the audio."""
        self.ctrl.append((self.n, msg))
        with self._working():
            return self._run()

    def finish(self, why='end'):
        """The rest of the audio, then the whole take decided once more: [..., done]."""
        if self.stopped:
            return []
        with self._working():
            ev = self._run()
            self.stopped = True
            ev += self._hop(last=True)
            ev += self._due(self.seconds, every=True)
        self.result = self._final()
        self.result['why'] = why
        ev.append({'type': 'done', 'result': self.result})
        return ev

    @property
    def seconds(self):
        return self.n / SR

    @contextlib.contextmanager
    def _working(self):
        """A chunk, a control or the end being worked on: the second model starts an ayah only once it is over."""
        self._depth += 1
        self._idle.clear()
        try:
            yield
        finally:
            self._depth -= 1
            if not self._depth:
                self._idle.set()

    # ------------------------------------------------------------ hops

    def _run(self):
        ev = []
        hop = self.P['hop']
        while True:
            need = int(round((self.k + 1) * hop * SR))
            while self.ctrl and self.ctrl[0][0] < need:
                ev += self._apply(self.ctrl.pop(0)[1])
                if self.stopped:
                    return ev
            if need > self.n:
                return ev
            ev += self._hop()

    def _apply(self, msg):
        kind = msg.get('type')
        if kind in ('dismiss', 'undismiss'):  # Not a mistake, or that undone (Undo, the summary's Removed list)
            mid = msg.get('id')
            if isinstance(mid, str) and len(mid) < 64:
                (self.dismissed.add if kind == 'dismiss' else self.dismissed.discard)(mid)
                return self._score_event()
            return []
        if kind == 'seek':
            w = msg.get('w')
            if msg.get('startBy') is not None and isinstance(w, int) and not isinstance(w, bool):
                # a page turned by hand: search for the start again, on that page (from w's ayah to startBy)
                try:
                    s_, a_, _ = self.E.key.where(w)
                    rng = self._search_range(s_, a_, msg['startBy'])
                except (BadRequest, IndexError, KeyError, TypeError):
                    return []
                _, ev = self._close_segment() if self.seg is not None else (None, [])
                self.seg, self.search, self.loc, self._loc_hist, self._top_hist = None, rng, None, [], []
                self._search_f0, self._search_speech, self._search_top = self.T, 0.0, w
                self._q_reset()
                return ev
            if not isinstance(w, int) or isinstance(w, bool) or not min(self.lo, self.range_lo) - SEG_WORDS <= w < self.end:
                return []
            if self.search is not None:  # the reader moved by hand while searching: the take starts at w
                return self._lock(w, self.T, self.seconds, seek=True)
            _, ev = self._close_segment() if self.seg is not None else (None, [])
            self.origin = w
            self._seeked = True  # the phone moved the reader: the cursor follows at once (_cursor)
            self._start_segment(w, self.T, 'lead')
            return ev
        if kind == 'hint':
            return self._hint(msg)
        if kind in ('end', 'stop'):
            return self.finish()
        return []

    def _hint(self, msg):
        """The phone showed the reciter a word (or the rest of an ayah) in the hidden view. The model session's rule:
        helped words are w (what 'word') or w's ayah from w to its end ('ayah'), each only if not yet decided. They
        stay mistakes if said wrong; the score and `done` say how many were helped."""
        w, what = msg.get('w'), msg.get('what')
        if not isinstance(w, int) or isinstance(w, bool) or what not in ('word', 'ayah') \
                or not self.lo <= w < self.end:
            return []
        self.hints.append((round(self.seconds, 2), {'w': w, 'what': what}))
        ws = [w]
        if what == 'ayah':
            s_, a_, _ = self.E.key.where(w)
            first, n = self._ayah_bounds(s_, a_)
            ws = range(w, first + n)
        new = {x for x in ws if x not in self.decided} - self.helped
        if not new:
            return []
        self.helped |= new
        return self._score_event(force=True)

    def _hop(self, last=False):
        """One hop: the model on the newest window, new final frames to the decoder, the cursor, decisions."""
        t0 = time.perf_counter()
        P = self.P
        k = self.k + 1
        t_end = self.n if last else min(int(round(k * P['hop'] * SR)), self.n)
        self.k = k
        s0 = max(0, t_end - int(P['win'] * SR))
        s0 -= s0 % 320
        T_all = (1 + t_end // 160) // 2
        hi = T_all if last else min(T_all, int((t_end / SR - P['look']) * FPS))
        prov = None
        if t_end - s0 >= 1600:
            lp = self.ear._run(self.pcm[s0:t_end].astype(np.float32) / 32768.0)
            f0 = s0 // 320
            if hi > self.T:
                rows = lp[self.T - f0:hi - f0]
                if len(rows) < hi - self.T:  # the model gave a frame or two fewer than expected at the very end
                    rows = np.concatenate([rows, np.repeat(lp[-1:], hi - self.T - len(rows), 0)])
                self._add_frames(rows)
            prov = None if last else lp[self.T - f0:]
        t1 = time.perf_counter()
        ev = self._decide(t_end / SR, prov)
        ev += self._due(t_end / SR)
        t2 = time.perf_counter()
        self.ms['model'] += (t1 - t0) * 1000
        self.ms['words'] += (t2 - t1) * 1000
        self.ms['hops'] += 1
        self.ms['worst_hop'] = max(self.ms['worst_hop'], (t2 - t0) * 1000)
        return ev

    def _add_frames(self, rows):
        if self.T + len(rows) > len(self.lp):
            grown = np.zeros((max(self.T + len(rows), 2 * len(self.lp)), self.V), np.float32)
            grown[:self.T] = self.lp[:self.T]
            self.lp = grown
        self.lp[self.T:self.T + len(rows)] = rows
        self.T += len(rows)

    def _tokens(self, f0, f1):
        """heard_tokens over frames f0..f1 (peaks relative to f0), keeping what can no longer change."""
        if f1 > self.tok_cut:
            am = self.lp[self.tok_cut:f1].argmax(axis=1)
            new = checker.heard_tokens(self.lp[self.tok_cut:f1])
            ch = np.nonzero(am[1:] != am[:-1])[0]
            last_run = self.tok_cut + (int(ch[-1]) + 1 if len(ch) else 0)  # the newest run may still grow
            done = [(c, self.tok_cut + pk, p) for c, pk, p in new if self.tok_cut + pk < last_run]
            tail = [(c, self.tok_cut + pk, p) for c, pk, p in new if self.tok_cut + pk >= last_run]
            self.toks += done
            self.tok_cut = last_run
        else:
            tail = []
        return [(c, pk - f0, p) for c, pk, p in self.toks + tail if f0 <= pk < f1]

    # ------------------------------------------------------------ segments

    def _start_segment(self, w, f0, start):
        a = max(0, w - SEG_BACK)
        b = min(self.end, max(w + 1, a + SEG_WORDS))
        self.seg = Segment(self.E, self.P, a, b, w, f0, start)
        self.seg.dec.feed(self.lp[f0:self.T])
        self._prefetch()

    def _prefetch(self):
        """Have the helper work out the words the next segment will add (it starts a little before this one
        ends). Changes no result: only how soon the next Segment is ready."""
        b = self.seg.b
        hi = min(self.end, b - SEG_MARGIN - SEG_BACK + SEG_WORDS + 8)
        E = self.E
        if _pool is None or E.table is not None or hi <= b or all(w in E._kw for w in range(b, hi)):
            return
        fut = _pool.submit(_helper_words, b, hi, int(self.P['alts']), self.P['alt_rule'])
        fut.add_done_callback(lambda f: f.exception() is None and E.remember(f.result()))

    def _seam(self):
        """Where the next segment starts (c: its first word), or None to wait a hop. The seam is the last decided word
        that ends an ayah, heard SETTLE seconds or more before the newest final frame (so the path there no longer
        moves) and inside the 30 s window: the next segment starts in the pause between ayat and judges again every
        word after it. Without one, the last such decided word. Either way within a skip (12 words) of the furthest
        decided word: a word visited again late (a repeat, or a passage that sounds like an earlier one) must not
        pull the seam back behind the reciter."""
        seg = self.seg
        now_f, ctx = seg.frames(), int(self.P['context'] * FPS)
        mine = [w for w in self.decided if seg.first <= w < seg.b]
        if not mine:
            return None
        head = max(mine)
        ok = [w for w in mine if w >= head - int(self.P['skip_max']) and w in self.spans
              and now_f - ctx <= self.spans[w][1] <= now_f - int(SETTLE * FPS) and self._clean(w)]
        ends = [w for w in ok if self._ends_ayah(w)]
        if ends:
            return max(ends) + 1
        if ok:
            return max(ok) + 1
        return None

    def _clean(self, w, n=3):
        """Words w - n .. w were all decided right, each heard once after the one before: a stretch the path is sure
        of (not a repeat, a passage that sounds like another, or a stray visit in a mistake)."""
        prev_end = None
        for x in range(w - n, w + 1):
            if self.status.get(x) != 'correct' or x not in self.spans:
                return False
            a, b = self.spans[x]
            if prev_end is not None and not prev_end - 2 <= a <= prev_end + 3 * FPS:
                return False
            prev_end = b
        return True

    def _seam_state(self, c):
        """(frame in the segment, state) of word c - 1's last frame on the last decision's path, if it is there."""
        seg, path = self._window
        if seg is not self.seg or c - 1 not in self.spans:
            return None
        t = self.spans[c - 1][1] - 1 - seg.f0
        for f, st, _ in path:
            if f == t:
                return (t, st) if st >= 0 and seg.app[int(seg.g.word_of[st])] == c - 1 else None
        return None

    def _close_segment(self, c=None, seam=False):
        """End the segment before word c (default: after its furthest decided word, as for a seek). Its decisions for
        words [first, c), on its whole path, are kept for `end`; words in there the live window never settled are
        decided now (and marked when wrong). seam: the next segment starts at c and owns an extra word after c - 1.
        -> (c, events)"""
        seg = self.seg
        if c is None:
            mine = [w for w in self.decided if seg.first <= w < seg.b]
            c = max(mine) + 1 if mine else seg.first
        ev = []
        if seg.dec.t >= 5 and c > seg.first:
            at = self._seam_state(c) if seam else None
            # at a seam, the best path ending in word c - 1's last state there (where the next segment starts), so
            # the two segments' paths join into one; else the best path now
            path = seg.dec.traceback_from(*at) if at else seg.dec.traceback(final=False)[0]
            res = self._segment_result(seg, path, c, self.P, extras_to=c - 1 if seam else c)
            self.segs.append(res)
            now = round(self.seconds, 2)
            for row in res['words']:
                w = row['w']
                if w in self.decided:
                    continue
                self.decided[w] = now
                self.status[w] = row['status']
                if not self.follow and row['status'] in ('wrong', 'missed') \
                        and (self.P['live_order'] or row.get('kind') != 'order'):
                    m = self._word_mark(row, {'kind': row.get('kind')} if row['status'] == 'wrong' else None)
                    self.flagged[w] = now
                    self.bad_from[w] = res['spans'][w][0] if w in res['spans'] else seg.frames()
                    if m['id'] not in self.marks:
                        self._keep_mark(m)
                        ev.append({'type': 'mark', 'mark': m, 't': now})
        return c, ev

    def _segment_result(self, seg, path, upto, P, refs=None, extras_to=None):
        lp = self.lp[seg.f0:seg.frames()]
        st, fl, _, _, extras, visits, fillers = checker.decide(seg.kws, seg.g, lp, path, P, self.ear.vocab,
                                                               self._tokens(seg.f0, seg.frames()), refs=refs)
        words, spans, readings = word_rows(seg.kws, st, fl, visits, seg.f0)
        keep = range(seg.first, upto)
        # words before the segment said again (not the start's own pause): a correction if said right
        back = {seg.app[w]: st[seg.app[w]] for w in range(seg.first - seg.a)
                if visits[w] and visits[w][-1]['start'] > 0}
        return {
            'words': [r for r in words if r['w'] in keep],
            'spans': {w: s for w, s in spans.items() if w in keep},
            'readings': {w: r for w, r in readings.items() if w in keep},
            'extras': [e for e in extra_rows(extras, fillers, seg.kws, P['delay'], seg.f0)
                       if e['trail'] or seg.own_extra(e) and e['after'] < (upto if extras_to is None else extras_to)],
            'back': back,
            'words_from': seg.first, 'words_to': upto,
        }

    def _maybe_rebase(self, cur):
        seg = self.seg
        near_end = cur is not None and seg.b < self.end and cur >= seg.b - SEG_MARGIN
        if not near_end and seg.dec.t < SEG_FRAMES:
            return []
        if near_end and not any(seg.first <= w < seg.b for w in self.decided) and seg.dec.t < SEG_FRAMES:
            return []
        old_frames = seg.frames()
        c = self._seam()
        if c is None:
            about_to_leave = cur is not None and cur >= seg.b - 8
            if not about_to_leave and seg.dec.t < SEG_FRAMES:
                return []  # nothing settled yet: try again next hop
            mine = [w for w in self.decided if seg.first <= w < seg.b]
            c = max(mine) + 1 if mine else seg.first
        c, ev = self._close_segment(c, seam=True)
        # start where word c - 1 ended (its frames are final), at most the 30 s window back
        f0 = self.spans[c - 1][1] if c - 1 in self.spans and c > seg.first else seg.f0
        f0 = min(self.T, max(f0, old_frames - int(self.P['context'] * FPS)))
        start = 'after' if c - 1 in self.decided else 'lead'
        self.seams.append((round(self.seconds, 1), cur, c, f0, start))
        self._start_segment(c, f0, start)
        return ev

    # ------------------------------------------------------------ the start, searched for (start_by)

    def _search_range(self, s, a, start_by):
        """App words [lo, hi) the start is searched in: from the ayah before s:a to the ayah after start_by."""
        W = self.E.words
        try:
            v0, v1 = W.vindex[(int(s), int(a))], W.vindex[(int(start_by[0]), int(start_by[1]))]
        except (KeyError, TypeError, ValueError, IndexError):
            raise BadRequest('startBy is not an ayah')
        if v1 < v0:
            raise BadRequest('startBy is before the start')
        v0, v1 = max(0, v0 - 1), min(len(W.counts) - 1, v1 + 1)
        lo = W.first[v0]
        return lo, min(W.first[v1] + W.counts[v1], lo + MAX_SEARCH, self.end)

    def _locate(self, now):
        """One hop of the search: on the page, then (start_in) Qur'an-wide once the page has had its chance."""
        ev = self._locate_page(now)
        if ev or self.search is None or not self.start_in:
            return ev
        return self._locate_quran(now)

    def _q_reset(self):
        self.qsearch = None              # the Qur'an-wide search's range of app words (start_in), once a place wins
        self.qloc = None                 # its locator
        self._qloc_hist = []
        self._q_hops = 0
        self._q_fits = (-1, [])          # (frame, _quran_fits then): kept for QURAN_EVERY hops, the page's doubt too
        self._doubt_from = None          # the frame a page lock was first held back (QURAN_DOUBT_MAX)
        self._q_failing = False          # the Qur'an-wide locator's words so far include one heard wrong

    def _locate_quran(self, now):
        """One hop of the Qur'an-wide search (QURAN_AFTER): vote and fit places every QURAN_EVERY hops; the winning
        place's locator locks only as strictly as QURAN_WORDS says, and only on words said nowhere else."""
        t0 = time.perf_counter()
        try:
            return self._locate_quran_hop(now)
        finally:
            self.ms['search_quran'] = self.ms.get('search_quran', 0.0) + (time.perf_counter() - t0) * 1000

    def _speech_onset(self):
        """The frame of the first sound heard since the search began, or None."""
        toks = self._tokens(self._search_f0, self.T)
        return self._search_f0 + toks[0][1] if toks else None

    def _locate_quran_hop(self, now):
        idx = QuranIndex.of(self.E)
        onset = self._speech_onset()
        if idx is None or onset is None:
            return []
        speech = (self.T - onset) / FPS
        if speech < QURAN_AFTER or speech > QURAN_STOP:
            return []
        self._q_hops += 1
        rng = self._quran_range(idx, onset)  # fitted anew every QURAN_EVERY hops (_quran_fits)
        if rng is not None and rng != self.qsearch:
            self.qsearch, self.qloc, self._qloc_hist, self._q_failing = rng, None, [], False
        if self.qsearch is None:
            return []
        if self.qloc is None:
            lo, hi = self.qsearch
            self.qloc = Segment(self.E, self.P, lo, hi, lo, self._search_f0, 'anywhere')
        loc = self.qloc
        if self.T > loc.frames():
            loc.dec.feed(self.lp[loc.frames():self.T])
        dec = loc.dec
        path, _ = dec.traceback(final=False)
        st, _, _, _, _, visits, _ = checker.decide(loc.kws, loc.g, self.lp[loc.f0:loc.frames()], path, self.P,
                                                   self.ear.vocab, self._tokens(loc.f0, loc.frames()))
        heard = [w for w in range(loc.g.W) if visits[w]]
        if not heard:
            return []
        w0 = min(heard, key=lambda w: visits[w][0]['start'])
        self._qloc_hist.append(w0)
        if len(self._qloc_hist) < LOCK_HOPS or len(set(self._qloc_hist[-LOCK_HOPS:])) > 1:
            return []
        cf, W = int(self.P['commit'] * FPS), loc.g.W
        k = w0
        while k + 1 < W and visits[k + 1] and visits[k + 1][-1]['end'] <= dec.t - cf:
            k += 1
        n = k + 1 - w0
        all_right = all(st.get(loc.app[w]) == 'correct' for w in range(w0, k + 1))
        self._q_failing = n >= 2 and not all_right
        if n < QURAN_WORDS or not all_right:
            return []
        texts = [kw['text'] for kw in loc.kws]
        if any(texts[j:j + n] == texts[w0:k + 1] for j in range(W - n + 1) if j != w0) \
                or not self._said_once(loc.app[w0], n):
            return []
        f_start = loc.f0 + visits[w0][0]['start']
        self._search_speech = (self.T - f_start) / FPS
        return self._lock(loc.app[w0], f_start, now, where='quran')

    def _quran_fits(self, idx, onset):
        """The places the sounds heard from frame onset vote for, fitted: [(w, nats a frame, words heard)], best fit
        first. Worked out at most once every QURAN_EVERY hops."""
        if self._q_fits[0] >= 0 and self.T - self._q_fits[0] < QURAN_EVERY * self.P['hop'] * FPS:
            return self._q_fits[1]
        fits = self._quran_fits_now(idx, onset)
        self._q_fits = (self.T, fits)
        return fits

    def _quran_fits_now(self, idx, onset):
        W = self.E.words
        f1 = min(self.T, onset + int(QURAN_SECS * FPS))
        sounds = ''.join(self.ear.vocab[c - 1] for c, _, _ in self._tokens(onset, f1))
        voted = idx.places(checker.skeleton(checker.norm_sounds(sounds)))
        # each place from a word either side too (the vote merges neighbours): the best start of the three stands
        starts = sorted({u for w in voted for u in (w - 1, w, w + 1) if 0 <= u < min(self.end, W.total)})
        if not starts:
            return []
        chains = []
        for w in starts:
            lab, ends = [], []
            for kw in self.E.passage_words(w, min(w + QURAN_CHAIN, W.total)):
                lab += kw['forms'][0]['labels']
                ends.append(len(lab))
            chains.append((lab, ends))
        fit = dict(zip(starts, similar.fit_many(self.lp[onset:f1], chains)))
        out = []
        for w in voted:
            u = min((u for u in (w - 1, w, w + 1) if u in fit), key=lambda u: fit[u][0], default=None)
            if u is not None:
                out.append((u, fit[u][0], fit[u][1]))
        return sorted(out, key=lambda x: x[1])

    def _quran_range(self, idx, onset):
        """The range a place off the page wins (its ayah, the one before and two after), or the current one when none
        wins clearly this time; None while the best place is on the page (its own locator decides)."""
        W = self.E.words
        fits = self._quran_fits(idx, onset)
        if not fits:
            return self.qsearch
        best, fit, words = fits[0]
        nxt = fits[1][1] if len(fits) > 1 else 99.0
        lo, hi = self.search
        if lo <= best < hi:
            return None
        if fit > QURAN_FIT or words < 2 or nxt - fit < QURAN_MARGIN:
            return self.qsearch
        v = self.E.slip_index.verse[best]
        v0, v1 = max(0, v - 1), min(len(W.counts) - 1, v + 2)
        a = W.first[v0]
        return a, min(W.first[v1] + W.counts[v1], a + MAX_SEARCH, self.end)

    def _page_doubted(self):
        """(start_in) The page's locator waits (QURAN_DOUBT_MAX): a place off the page fits what was heard better, has
        its own locator, and that locator has heard every word right so far."""
        if not self.start_in:
            return False
        idx, onset = QuranIndex.of(self.E), self._speech_onset()
        if idx is None or onset is None or (self.T - onset) / FPS > QURAN_STOP:
            return False
        t0 = time.perf_counter()
        try:
            rng = self._quran_range(idx, onset)  # on the last fits (QURAN_EVERY)...
            if (rng is None or self.qsearch is None or self._q_failing) and self._q_fits[0] != self.T:
                self._q_fits = (-1, [])  # ...a lock only on everything heard so far
                rng = self._quran_range(idx, onset)
        finally:
            self.ms['search_quran'] = self.ms.get('search_quran', 0.0) + (time.perf_counter() - t0) * 1000
        if rng is None:  # the best place is on the page
            return False
        if rng != self.qsearch:
            self.qsearch, self.qloc, self._qloc_hist, self._q_failing = rng, None, [], False
        if self.qsearch is None or self._q_failing:
            return False
        if self._doubt_from is None:
            self._doubt_from = self.T
        return self.T - self._doubt_from < QURAN_DOUBT_MAX * FPS

    def _said_once(self, w0, n):
        """App words w0 .. w0 + n - 1 (n >= 2) are a run of words said nowhere else in the Qur'an (letters only)."""
        idx = self.E.slip_index
        run = idx.norm[w0:w0 + n]
        return not any(j - 2 != w0 and idx.norm[j - 2:j - 2 + n] == run for j in idx.pairs.get((run[0], run[1]), ()))

    def _locate_page(self, now):
        """One hop of the search: the locator's best path, and the lock once its start is sure (LOCK_WORDS)."""
        if self.loc is None:
            lo, hi = self.search
            self.loc = Segment(self.E, self.P, lo, hi, lo, self._search_f0, 'anywhere')
        loc, ev = self.loc, []
        if self.T > loc.frames():
            loc.dec.feed(self.lp[loc.frames():self.T])
        dec = loc.dec
        if dec.t < 5:
            return ev
        path, _ = dec.traceback(final=False)
        st, _, _, _, _, visits, _ = checker.decide(loc.kws, loc.g, self.lp[loc.f0:loc.frames()], path, self.P,
                                                   self.ear.vocab, self._tokens(loc.f0, loc.frames()))
        heard = [w for w in range(loc.g.W) if visits[w]]
        if not heard:
            return ev
        w0 = min(heard, key=lambda w: visits[w][0]['start'])  # the path's first word
        f_start = loc.f0 + visits[w0][0]['start']
        self._search_speech = (self.T - f_start) / FPS
        p = w0  # the words from w0 on heard in order so far, settled or not
        while p + 1 < loc.g.W and visits[p + 1]:
            p += 1
        top = self._search_top - loc.a
        at_top = 0 <= top < loc.g.W and loc.app[top] == self._search_top and st.get(loc.app[w0]) == 'correct' \
            and (w0 == top or self._reads_as(w0, top, p + 1 - w0)) and self._sounds_heard(visits[w0][-1], w0)
        self._top_hist.append(at_top)
        if at_top:
            if len(self._top_hist) >= TOP_HOPS and all(self._top_hist[-TOP_HOPS:]):
                return ev + self._lock(loc.app[top], f_start, now)
            return ev
        self._loc_hist.append(w0)
        if len(self._loc_hist) < LOCK_HOPS or len(set(self._loc_hist[-LOCK_HOPS:])) > 1:
            return ev
        # the words from w0 on heard in order, each over before the commit point (no longer moving); one may be missing
        cf, W = int(self.P['commit'] * FPS), loc.g.W

        def settled(w):
            return bool(visits[w]) and visits[w][-1]['end'] <= dec.t - cf

        k, missing = w0, 0
        while k + 1 < W:
            if settled(k + 1):
                k += 1
            elif not missing and k + 2 < W and not visits[k + 1] and settled(k + 2):
                k, missing = k + 2, 1
            else:
                break
        if not self._only_once(w0, k):
            return ev
        correct = [st.get(loc.app[w]) == 'correct' for w in range(w0, k + 1) if visits[w]]
        long_search = (self.T - self._search_f0) / FPS > LONG_SEARCH
        need = LOCK_WORDS + (LONG_EXTRA if long_search else 0)
        if len(correct) > need and sum(correct) >= LOCK_WORDS:
            return ev if self._page_doubted() else ev + self._lock(loc.app[w0], f_start, now)
        n = QUICK_WORDS
        if not long_search and not missing and k - w0 + 1 >= n and all(correct[:n]) \
                and all(self._heard_well(visits[w][-1]) for w in range(w0, w0 + n)):
            return ev if self._page_doubted() else ev + self._lock(loc.app[w0], f_start, now)
        return ev

    @staticmethod
    def _heard_well(v):
        """A visit whose sounds score QUICK_MEAN or better on average (QUICK_WORDS)."""
        return bool(v['scores']) and float(np.mean(v['scores'])) >= QUICK_MEAN

    def _sounds_heard(self, v, w):
        """The visit v of the locator's word w has covered TOP_SOUNDS of its sounds (all, for a shorter word)."""
        g = self.loc.g
        tot = int(np.count_nonzero((g.word_of == w) & (g.kind == 1) & (g.alt_of == v['alt'])))
        return len(v['scores']) >= min(TOP_SOUNDS, tot)

    def _reads_as(self, w0, top, n):
        """The locator's n words from w0 read, letter for letter (harakat and marks aside), as the n from top."""
        kws = self.loc.kws
        if top + n > len(kws) or w0 + n > len(kws):
            return False
        return [_letters(kws[w0 + i]['text']) for i in range(n)] == [_letters(kws[top + i]['text']) for i in range(n)]

    def _only_once(self, w0, k):
        """The locator's words w0..k occur only once, as a run, in the range searched."""
        texts = [kw['text'] for kw in self.loc.kws]
        run, n = texts[w0:k + 1], k + 1 - w0
        return not any(texts[j:j + n] == run for j in range(len(texts) - n + 1) if j != w0)

    def _lock(self, w, f_start, now, seek=False, where='page'):
        """The take starts at app word w (heard from frame f_start): the follower takes over from there, as after a
        seek. Words before w aren't part of the take: never decided, never skipped, not in `said` or the score. A
        plain seek while searching locks at its word (the phone placed the reader; `locked` all the same). where
        'quran': found off the page (start_in); the take's range starts there."""
        self.search, self.loc, self._loc_hist, self._top_hist = None, None, [], []
        self._q_reset()
        if where == 'quran' and self.start_w is None:
            self.range_lo = w
        # a search again after a page turn: the take's start stays the first lock (recite-ui), and what it covers
        # widens to the new place if that is earlier; words decided since stay as they are
        self.lo = w if self.start_w is None else min(self.lo, w)
        self.start_w = w if self.start_w is None else self.start_w
        self.origin = w
        s, a, _ = self.E.key.where(w)
        self.locked_ev = {'type': 'locked', 'w': w, 's': s, 'a': a, 't': round(now, 2)}
        if self.start_in:  # protocol 7: where it was found
            self.locked_ev['where'] = where
        if seek:
            self._seeked = True
            self._start_segment(w, f_start, 'lead')
            return [dict(self.locked_ev)]
        self._start_segment(w, max(self._search_f0, f_start - LEAD_FRAMES), 'lead')
        return [dict(self.locked_ev)] + self._decide(now, None)

    # ------------------------------------------------------------ decisions

    def _first_segment(self):
        self.seg = Segment(self.E, self.P, self.lo, min(self.end, self.lo + SEG_FIRST), self.lo, 0, 'first')
        self.seg.dec.feed(self.lp[:self.T])
        self._prefetch()

    def _decide(self, now, prov):
        if self.search is not None:
            return self._locate(now)
        if self.seg is None:
            self._first_segment()
        seg, P, E = self.seg, self.P, self.E
        dec = seg.dec
        if self.T > seg.frames():
            dec.feed(self.lp[seg.frames():self.T])
        ev = []
        # the cursor: the best state after the provisional frames too, then the decoder put back
        if dec.t >= 1:
            if prov is not None and len(prov):
                saved = dec.state()
                dec.feed_scores(prov)
                cw = dec.word_now()
                dec.restore(saved)
            else:
                cw = dec.word_now()
            if cw is not None:
                w = self._cursor(seg.app[cw])
                if w is not None:
                    self.sent['at'] = w
                    ev.append({'type': 'at', 'w': w, 't': round(now, 2)})
        else:
            cw = None
        if dec.t < 5:
            return ev

        cf, ctx = int(P['commit'] * FPS), int(P['context'] * FPS)
        lo_t = max(0, dec.t - ctx)
        path, _ = dec.traceback(final=False, since=lo_t)
        self._window = (seg, path)
        st, fl, _, _, extras, visits, fillers = checker.decide(seg.kws, seg.g, self.lp[seg.f0:seg.frames()], path, P,
                                                               self.ear.vocab, self._tokens(seg.f0, seg.frames()))
        app, W, entry = seg.app, seg.g.W, seg.first - seg.a
        for w in range(W):
            if visits[w]:
                self.spans[app[w]] = (seg.f0 + min(v['start'] for v in visits[w]),
                                      seg.f0 + max(v['end'] for v in visits[w]))
                self.readings[app[w]] = (seg.f0 + visits[w][-1]['start'], seg.f0 + visits[w][-1]['end'])
        seen = [w for w in range(W) if visits[w]]
        order = [w for _, w in sorted((v['start'], w) for w in seen for v in visits[w])]
        jumped = set()
        for wa, wb in zip(order, order[1:]):
            if wb > wa + 1:
                jumped.update(range(wa + 1, wb))
        new_marks = []
        if seen:
            w_first = min(seen)
            if lo_t > 0 and visits[w_first][0]['start'] <= lo_t + 1:
                w_first += 1  # its start is outside the window: judged at an earlier step
            for w in range(W):
                aw = app[w]
                if w < w_first or st.get(aw, 'pending') == 'pending':
                    continue
                if not visits[w] and w not in jumped:
                    continue
                if visits[w]:
                    end_f = visits[w][-1]['end']
                else:  # a word jumped over: once the word heard after it is over, not just begun
                    later = [v for ww in range(w + 1, W) for v in visits[ww]]
                    if not later:
                        continue
                    end_f = min(later, key=lambda v: v['start'])[P['skip_wait']]
                if end_f > dec.t - cf:
                    continue
                kind = fl.get(aw, {}).get('kind')
                bad = st[aw] in ('wrong', 'missed') and (P['live_order'] or kind != 'order')
                if w < entry:  # before the segment: decided by the one before; only a correction counts here
                    if visits[w] and visits[w][-1]['start'] > 0 and not bad:
                        ev += self._unmark_if_corrected(aw, seg.f0 + visits[w][-1]['start'], now)
                    continue
                self.decided.setdefault(aw, now)
                self.status[aw] = st[aw]
                self.bad_run[aw] = self.bad_run.get(aw, 0) + 1 if bad else 0
                if bad:
                    self.good_run[aw] = 0
                if self.follow:
                    continue
                if bad and self.bad_run[aw] >= P['stable'] and aw not in self.flagged:
                    self.flagged[aw] = now
                    self.bad_from[aw] = seg.f0 + (visits[w][-1]['start'] if visits[w] else end_f)
                    row = {'w': aw, 'status': st[aw], 'kind': kind, 'heard': fl.get(aw, {}).get('heard')}
                    if visits[w]:
                        row['t'] = secs(self.spans[aw])
                    new_marks.append(self._word_mark(row, fl.get(aw)))
                elif not bad and visits[w]:
                    ev += self._unmark_if_corrected(aw, seg.f0 + visits[w][-1]['start'], now)
        # extra words: once their filler is behind the commit point, in EXTRA_STABLE hops in a row
        now_extra = set()
        for e in [] if self.follow else extra_rows(extras, fillers, seg.kws, P['delay'], seg.f0):
            if e['trail'] or not e['span'] or not seg.own_extra(e) or e['span'][1] - seg.f0 > dec.t - cf:
                continue
            now_extra.add(e['after'])
            self.extra_run[e['after']] = self.extra_run.get(e['after'], 0) + 1
            if self.extra_run[e['after']] == EXTRA_STABLE:
                new_marks.append(E.marks([], {}, {}, [v1_extra(e)], [], [])[0])
        for aw in list(self.extra_run):
            if aw not in now_extra:
                self.extra_run[aw] = 0
        for m in new_marks:
            if m['id'] not in self.marks:
                self._keep_mark(m)
                ev.append({'type': 'mark', 'mark': m, 't': round(now, 2)})
        t1 = time.perf_counter()
        ev += self._ayah_marks(now)
        self.ms['tajweed'] += (time.perf_counter() - t1) * 1000
        ev += self._maybe_rebase(cw + seg.a if cw is not None else None)
        ev += self._said_event(now)
        ev += self._off_event(seg, path, now)
        ev += self._score_event(now)
        return ev

    def _off_event(self, seg, path, now):
        """`off`: the newest final frames are free speech in the next word's slot (the word the hidden view shows next):
        the reciter is saying something else there. Lab (Nov 15 2026, live, 0.5 s chunks): on bench-v0 right 86% of
        the times it is sent, for 27% of planted mistakes, 0.09 wrong per 100 words; 0 of 120 planted hesitations and 0
        of 60 long pauses; 33 of 108 planted corrections, while the wrong word is said. Sent once per word, again only
        after the cursor has reached it; the phone clears it when `at` reaches the word or the word is marked."""
        nxt = self.sent['said'][0] + 1 if self.sent['said'] is not None else self.origin
        if self.off_w is not None and (self.off_w < nxt or (self.sent['at'] or -1) >= self.off_w):
            self.off_w = None
        if not path or path[-1][1] >= 0 or self.off_w is not None:
            return []
        gi = -path[-1][1] - 1
        if gi >= seg.g.W or seg.app[gi] != nxt or nxt in self.marked_words():
            return []
        self.off_w = nxt
        return [{'type': 'off', 'w': nxt, 't': round(now, 2)}]

    def marked_words(self):
        return {m['w'] for m in self.marks.values()}

    def _cursor(self, w):
        """The `at` to send for this hop's cursor word w, or None. A move back more than JUMP_BACK words or ahead more
        than JUMP_AHEAD waits for the next hop to land within a word of it: a repeat or a skip shows one hop (0.5 s)
        later, and a single hop's slip of the provisional frames never shows. After a seek it moves at once."""
        last, held = self.sent['at'], self._jump
        self._jump = None
        if w == last:
            return None
        if last is None or self._seeked or not (w < last - JUMP_BACK or w > last + JUMP_AHEAD):
            self._seeked = False
            return w
        if held is not None and abs(held - w) <= 1:
            return w
        self._jump = w
        return None

    def _notes(self, s, a, statuses, spans, readings=None):
        """Engine.ayah_notes on the take's frames (and its samples, for the second model in Strict). It reads only the
        ayah's word statuses, its first word's start, its last word's end and final frames there, so an ayah judged
        live is not judged again in `done` when those are the same (the second model is ~1 s an ayah on Cloud Run)."""
        key = self._notes_key(s, a, statuses, spans, readings)
        if key not in self._notes_cache:
            # in `done`: an ayah not judged live (not said in full then, or the last one), or one whose words or edges
            # the final pass decided differently. Reusing the live notes when only its start had moved kept a false
            # madd mark on husary's clean take that judging it again took away (Nov 14 2026), so it is judged again.
            self._judged_here += 1
            if self.v5:
                got = self.E.ayah_notes(self.lp[:self.T], s, a, statuses, spans, self.st, audio=self.xf[:self.n],
                                        readings=readings)
            else:
                got = self.E.ayah_notes(self.lp[:self.T], s, a, statuses, spans, self.st, readings=readings)
            self._notes_cache[key] = got
        tj, letters = self._notes_cache[key]
        return [dict(r) for r in tj], [dict(r) for r in letters]

    def _notes_key(self, s, a, statuses, spans, readings=None):
        """What an ayah's notes read: its words' statuses and the frames it's judged on (ayah_pieces, unclipped:
        a take that grows doesn't change them)."""
        first, n = self._ayah_bounds(s, a)
        ws = list(range(first, first + n))
        frames = tuple(ayah_pieces(ws, spans, readings, 10 ** 9)) if ws[0] in spans and ws[-1] in spans else None
        return (s, a, tuple(statuses.get(w) for w in ws), frames)

    def _notes_later(self, s, a, now):
        """With `defer`: this ayah's notes on the background thread, unless already worked out. True when they were
        handed over (its marks and `ayah` event then come from _due, AYAH_DUE later). The frames and samples before T
        and n are never written again, so the thread reads them as they are; the statuses and spans go as copies."""
        key = self._notes_key(s, a, self.status, self.spans, self.readings)
        if key in self._notes_cache:
            return False
        kw = {'audio': self.xf[:self.n]} if self.v5 else {}
        fut = _ayah_submit(self._idle, self.E.ayah_notes, self.lp[:self.T], s, a, dict(self.status), dict(self.spans),
                           self.st, readings=dict(self.readings), **kw)
        first, n = self._ayah_bounds(s, a)
        secs = (self.spans[first + n - 1][1] - self.spans[first][0]) / FPS  # both are there: said in full
        share = AYAH_DUE_SHARE['strict' if self.v5 else 'words']
        self._pending.append((key, s, a, fut, now + max(AYAH_DUE, share * secs)))
        self.ms['ayah_jobs'] += 1
        return True

    def _due(self, now, every=False):
        """The ayat handed to the background thread whose time has come (every one, at the end), in order: their
        marks, the `ayah` event, then the score. A job not done yet is waited for, and may run meanwhile."""
        ev = []
        while self._pending and (every or self._pending[0][4] <= now):
            key, s, a, fut, _ = self._pending.pop(0)
            if not fut.done():
                self._idle.set()  # this thread waits for it anyway
                t0 = time.perf_counter()
                fut.result()
                waited = (time.perf_counter() - t0) * 1000  # a hop held up (or `done`, at the end): `ms` says how long
                self.ms['done_wait' if every else 'due_wait'] += waited
                if not every:
                    self.ms['worst_due_wait'] = max(self.ms['worst_due_wait'], waited)
                if self._depth:
                    self._idle.clear()
            got, ms = fut.result()
            self._notes_cache[key] = got
            self.ms['tajweed'] += ms
            t = round(now, 2)
            tj, letters = ([dict(r) for r in rows] for rows in got)
            for m in self.E.marks([], {}, {}, [], tj, letters if self.st['letters'] else []):
                if m['id'] not in self.marks:
                    self._keep_mark(m)
                    ev.append({'type': 'mark', 'mark': m, 't': t})
            ev.append({'type': 'ayah', 's': s, 'a': a, 't': t})
            self.ayah_sent.append(ev[-1])
        if ev:
            ev += self._score_event(now)
        return ev

    def _keep_mark(self, m):
        self.marks[m['id']] = m
        self.unmarked.discard(m['id'])

    def snapshot(self):
        """Everything a phone should be showing now, as the events it already knows (all idempotent): every mark
        shown, every mark taken back, the ayat judged, the cursor, `said` and the score. Sent after `ready` on a
        resume, for events a dropped socket may have swallowed."""
        t = round(self.seconds, 2)
        ev = [dict(self.locked_ev, t=t)] if self.locked_ev else []  # where the take starts, first
        ev += [{'type': 'mark', 'mark': m, 't': t} for m in self.marks.values()]
        ev += [{'type': 'unmark', 'id': i, 'why': 'corrected', 't': t} for i in sorted(self.unmarked)]
        ev += [dict(e, t=t) for e in self.ayah_sent]
        if self.sent['at'] is not None:
            ev.append({'type': 'at', 'w': self.sent['at'], 't': t})
        if self.sent['said'] is not None:
            ev.append({'type': 'said', 'upTo': self.sent['said'][0], 't': t})
        if self.off_w is not None:
            ev.append({'type': 'off', 'w': self.off_w, 't': t})
        if self.decided and not self.follow:
            ev.append({'type': 'score', **self._score(), 't': t})
        return ev

    def _word_mark(self, row, fl):
        """The Mark of a word decided wrong or skipped (Engine.marks), with what was heard for a sound said wrong."""
        aw = row['w']
        heard = {}
        if row['status'] == 'wrong' and (fl or {}).get('kind', 'sound') == 'sound' and aw in self.spans:
            near = {w: self.spans[w] for w in (aw - 1, aw, aw + 1) if w in self.spans}
            heard = {aw: heard_sounds(near, self._tokens(0, self.T), self.ear.vocab).get(aw, '')}
        return self.E.marks([row], {aw: fl} if fl else {}, heard, [], [], [])[0]

    def _unmark_if_corrected(self, aw, visit_start, now):
        if aw not in self.bad_from or visit_start <= self.bad_from[aw]:
            self.good_run[aw] = 0
            return []
        self.good_run[aw] = self.good_run.get(aw, 0) + 1
        if self.good_run[aw] < FIX_STABLE:
            return []
        ev = []
        for mid in [m for m, mk in self.marks.items() if mk['w'] == aw and mk['kind'] in ('word', 'skipped')]:
            del self.marks[mid]
            ev.append({'type': 'unmark', 'id': mid, 'why': 'corrected', 't': round(now, 2)})
            self.unmarked.add(mid)
        self.status[aw] = 'corrected'
        self.flagged.pop(aw, None)
        self.bad_from.pop(aw, None)
        self.bad_run[aw] = 0
        return ev

    def _ayah_marks(self, now):
        """Tajweed (and letters) for each ayah whose words are all decided, once."""
        ev = []
        todo = {tuple(self.E.ayah_of(w)) for w in self.decided} - self.ayat_done
        for s, a in sorted(todo):
            first, n = self._ayah_bounds(s, a)
            if not all(w in self.decided for w in range(first, first + n)):
                continue
            self.ayat_done.add((s, a))
            if first < self.lo or first + n > self.end or not self._said_in_full(first, n, self.status, self.spans):
                continue
            if self.follow:
                marks = []
            elif self.defer and self._notes_later(s, a, now):
                continue
            else:
                tj, letters = self._notes(s, a, self.status, self.spans, self.readings)
                marks = self.E.marks([], {}, {}, [], tj, letters if self.st['letters'] else [])
            for m in marks:
                if m['id'] not in self.marks:
                    self._keep_mark(m)
                    ev.append({'type': 'mark', 'mark': m, 't': round(now, 2)})
            ev.append({'type': 'ayah', 's': s, 'a': a, 't': round(now, 2)})
            self.ayah_sent.append(ev[-1])
        return ev

    def _reached_to(self, words):
        """The end of the last ayah reached (the passage's start when nothing was): an open take's `to`."""
        if not words:
            return self.lo
        first, n = self._ayah_bounds(*self.E.ayah_of(max(r['w'] for r in words)))
        return first + n

    def _ends_ayah(self, w):
        s, a, p = self.E.key.where(w)
        return p == self._ayah_bounds(s, a)[1] - 1

    def _ayah_bounds(self, s, a):
        v = self.E.words.vindex[(s, a)]
        return self.E.words.first[v], self.E.words.counts[v]

    @staticmethod
    def _said_in_full(first, n, statuses, spans):
        """As Engine.ayah_notes asks: every word said, and the first and last heard."""
        return all(statuses.get(w) in SAID for w in range(first, first + n)) and first in spans \
            and first + n - 1 in spans

    def _said_event(self, now):
        w = self.origin
        while w in self.decided:
            w += 1
        if w == self.origin:
            return []
        said = (w - 1, len(self.decided))
        if said == self.sent['said']:
            return []
        self.sent['said'] = said
        return [{'type': 'said', 'upTo': said[0], 't': round(now, 2)}]

    def _score(self):
        sc = score(self.status, list(self.marks.values()), self.dismissed)
        sc['helped'] = len(self.helped)
        return sc

    def _score_event(self, now=None, force=False):
        if self.follow:
            return []
        sc = self._score()
        key = (sc['reached'], sc['mistakes'], sc['tajweed'], sc['unclear'], sc['helped'])
        if key == self.sent['score'] or not sc['reached'] and not force:
            return []
        self.sent['score'] = key
        ev = {'type': 'score', **sc}
        ev['t'] = round(self.seconds if now is None else now, 2)
        return [ev]

    # ------------------------------------------------------------ the end

    def _final(self):
        """The whole take decided once more (run_item_live's final, per segment): the v2 answer."""
        seg, P = self.seg, self.P
        PF = dict(P, delay=P['look'] + P['commit'])
        results = list(self.segs)
        if seg is not None and seg.dec.t >= 5:
            at_end = seg.b == self.end
            path, _ = seg.dec.traceback(final=at_end)
            refs = checker.trail_refs(self.end) if at_end and P.get('trail_extra') else None
            results.append(self._segment_result(seg, path, seg.b, PF, refs))
        rows, spans, readings, extras = {}, {}, {}, []
        for r in results:
            for row in r['words']:
                rows[row['w']] = row
            spans.update(r['spans'])
            readings.update(r.get('readings', {}))
            extras += r['extras']
        for r in results:  # a word said again, right, in a later segment: corrected
            for w, stt in r['back'].items():
                if w in rows and rows[w]['status'] in ('wrong', 'missed') and stt in ('correct', 'corrected'):
                    rows[w] = {'w': w, 'status': 'corrected', **({'t': rows[w]['t']} if 't' in rows[w] else {})}
        words = [rows[w] for w in sorted(rows)]
        statuses = {r['w']: r['status'] for r in words}
        flagged = {r['w']: {'kind': r.get('kind')} for r in words if r['status'] == 'wrong'}
        spans = {w: s for w, s in spans.items() if s}
        t0 = time.perf_counter()
        tj, letters = [], []
        done = set()
        judged = self._judged_here
        for r in [] if self.follow else words:
            s, a = self.E.ayah_of(r['w'])
            if (s, a) in done:
                continue
            done.add((s, a))
            first, n = self._ayah_bounds(s, a)
            if first < self.lo or first + n > self.end:
                continue
            o, l_ = self._notes(s, a, statuses, spans, readings)
            tj += o
            letters += l_
        self.ms['tajweed'] += (time.perf_counter() - t0) * 1000
        self.ms['done_notes'] = self._judged_here - judged
        seen, ex = set(), []
        for e in extras:
            if e['after'] not in seen:
                seen.add(e['after'])
                ex.append(v1_extra(e))
        out = {
            'v': 1, 'from': min(self.lo, self.range_lo), 'to': self._reached_to(words) if self.open_end else self.end,
            'secs': round(self.seconds, 1), 'words': words, 'extras': ex,
            'tajweed': [{k: r[k] for k in r if not k.startswith('_')} for r in tj],
            'letters': [{k: r[k] for k in r if not k.startswith('_')} for r in letters] if self.st['letters'] else None,
            'settings': {k: self.st[k] for k in ('mon', 'mot', 'aar', 'letters', 'tajweed')},
            'ms': {k: int(v) for k, v in self.ms.items()},
        }
        for r in words:
            if r['w'] in self.helped:
                r['helped'] = True
        if self.start_by is not None:  # where the take was locked to start (null: never; then no words)
            out['start'] = self.start_w
            if self.start_w is None:
                out['ms']['search_speech'] = int(self._search_speech * 1000)
        if self.follow:  # Recite: the words and their statuses; no marks and no score (the contract's shape: [], null)
            return {k: out[k] for k in ('v', 'from', 'to', 'secs', 'words', 'settings', 'ms') + (
                ('start',) if 'start' in out else ())} | {'v': 2, 'follow': True, 'marks': [], 'score': None}
        heard = heard_sounds(spans, self._tokens(0, self.T), self.ear.vocab)
        out['marks'] = self.E.marks(words, flagged, heard, ex, tj, letters if self.st['letters'] else [])
        out['ms']['similar'] = self.E.name_slips(out['marks'], self.lp[:self.T], [r['w'] for r in words], statuses,
                                                 spans, ex, self.lv.words_p)
        out['score'] = score(statuses, out['marks'], self.dismissed)
        out['score']['helped'] = len(self.helped)
        out['v'] = 2
        return out
