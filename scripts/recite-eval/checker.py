#!/usr/bin/env python3
"""Checker v0: a sound-level model and the expected text, decided together.

Instead of writing down words (Whisper) and comparing text, this listens for sounds and lines them up
with the sounds the passage should have, so it can say which word was said, skipped, repeated or said
wrong, letter by letter.

  1. The ear: a CTC phoneme model gives, every 20 ms, a log-probability for each of 42 Qur'anic sounds
     (HisnLabs tajweed-v2, int8 ONNX, 23 MB; run in 20 s windows).
  2. The answer key: quran_transcript's phonetizer writes each ayah as the sounds a correct Hafs
     recitation has (madd lengths folded to one long vowel, which may be repeated).
  3. The checker: one Viterbi pass over a graph of the passage's words. Inside a word it is ordinary CTC
     alignment. Between words a path may go on to the next word, skip words (a deletion), go back to an
     earlier word (a repeat, not a mistake), or pass through a filler that hears anything (an extra word
     before a word, or a word replaced by something else). Recitation before the first word and after
     the last is free (an isti'adha, a basmala, a cough).
  4. Decisions from the best path: a word reached and left normally is correct unless one of its sounds
     fits much worse than the sound the model heard best there (a letter or haraka said wrong); a word
     jumped over is missed; a word replaced by the filler is wrong; a filler before a word is an extra.

Writes results in replay.ts's format (score.py reads them), plus the decoded path for inspection.
Offline: decisions are made on the whole recording, so the times are estimates (word end + delay).

  python checker.py --bench DIR --run DIR --name NAME [--only SUBSTR] [--jobs N] [--params JSON]
"""
import argparse
import json
import os
import pathlib
import sys
import time

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
LAB = pathlib.Path(os.environ.get('LAB', pathlib.Path.home() / 'revisely-mistake-lab'))
sys.path.insert(0, str(HERE))
import bench  # noqa: E402  (the app's word numbering)

FOLD = set('اۥۦںۜ۾')  # long vowels and held nasals: a run is one sound held for some counts
FPS = 50  # model frames per second

DEFAULTS = {
    'skip': -12.0,      # per word jumped over (a deletion)
    'skip_max': 12,     # longest jump (an ayah skip)
    'back': -8.0,       # going back to an earlier word (a repeat)
    'back_max': 30,
    'fill': -0.5,       # per frame in the filler between words (an extra or replaced word)
    'fill_in': -6.0,    # entering the filler
    'fill_sub': -4.0,   # leaving it for the word after next (the word was replaced)
    'edge': -0.5,       # per frame of free recitation before the first word or after the last
    'stop': -30.0,      # ending before the last word
    'gop': -4.0,        # (score 'gop') a sound that fits this much worse (nats/frame) than the best is wrong
    'sound_rule': 'subst',  # 'subst': a sound clearly heard as another one; 'gop': the first rule; 'off': words only
    'sub_p': 0.9,       # how sure the model must be of the other sound
    'sub_q': 0.1,       # ...and how unlikely the expected sound must be within 3 frames of it (1.0: no check)
    'del_frac': 0.5,    # a word whose sounds were mostly not heard at all is wrong too
    'edge_free': 99,    # sounds heard at each edge of a word's span that may belong to its neighbours...
    'edge_frames': 99,  # ...if they peak within this many frames of the span's edge
    'mean_gop': -6.0,   # a word whose sounds fit this badly on average is wrong (None: off)
    'extra_min': 0.35,  # a filler shorter than this (seconds) is not reported as an extra word
    'delay': 1.0,       # seconds after a word ends that a streaming checker would decide it
}


# ---------------------------------------------------------------- the ear

def _mel_filters(sr=16000, n_fft=400, n_mels=80):
    def hz_to_mel(f):
        f = np.asarray(f, float)
        return np.where(f >= 1000, 15 + np.log(np.maximum(f, 1e-10) / 1000) / (np.log(6.4) / 27), f / (200.0 / 3))

    def mel_to_hz(m):
        m = np.asarray(m, float)
        return np.where(m >= 15, 1000 * np.exp((np.log(6.4) / 27) * (m - 15)), m * (200.0 / 3))

    fft = np.linspace(0, sr / 2, n_fft // 2 + 1)
    pts = mel_to_hz(np.linspace(hz_to_mel(0), hz_to_mel(sr / 2), n_mels + 2))
    fb = np.zeros((n_mels, len(fft)))
    for i in range(n_mels):
        lo, c, hi = pts[i], pts[i + 1], pts[i + 2]
        fb[i] = np.maximum(0, np.minimum((fft - lo) / (c - lo), (hi - fft) / (hi - c))) * 2.0 / (hi - lo)
    return fb


_FB = _mel_filters()
_WIN = np.hanning(401)[:-1]


def log_mel(x):
    """Whisper's log-mel: 400-point FFT, hop 160, 80 mel bands, log10, floor at max - 8, (x + 4) / 4."""
    x = np.pad(x, 200, mode='reflect')
    n = 1 + (len(x) - 400) // 160
    frames = np.lib.stride_tricks.as_strided(x, (n, 400), (x.strides[0] * 160, x.strides[0]))
    spec = np.abs(np.fft.rfft(frames * _WIN, axis=1)) ** 2
    m = np.log10(np.maximum(_FB @ spec.T, 1e-10))
    m = np.maximum(m, m.max() - 8.0)
    return ((m + 4.0) / 4.0).astype(np.float32)


class Hisn:
    """HisnLabs tajweed-v2 (int8 ONNX): phoneme log-probabilities, 50 frames a second."""

    name = 'hisn'

    def __init__(self, threads=2, riwaya=0):
        import onnxruntime as ort
        m = LAB / 'models/hisnlabs-tajweed-v2'
        self.vocab = json.loads((m / 'config.json').read_text())['phonemes']
        self.index = {p: i + 1 for i, p in enumerate(self.vocab)}  # 0 is the blank
        o = ort.SessionOptions()
        o.intra_op_num_threads = threads
        o.inter_op_num_threads = 1
        self.sess = ort.InferenceSession(str(m / 'onnx/model-int8.onnx'), o, providers=['CPUExecutionProvider'])
        self.riwaya = riwaya

    def _run(self, x):
        mel = log_mel(x)
        mel = mel[:, : mel.shape[1] // 2 * 2]
        out = self.sess.run(None, {'mel': mel[None], 'riwaya': np.array([self.riwaya], np.int64)})[0][0]
        return out.astype(np.float32)

    def logprobs(self, x, win=20.0, hop=16.0):
        """Overlapping windows (the encoder takes at most 30 s); each keeps the middle of its overlap."""
        sr = 16000
        W, H = int(win * sr), int(hop * sr)
        if len(x) <= W:
            return self._run(x)
        half = int(round((win - hop) / 2 * FPS))
        parts, start = [], 0
        while True:
            lp = self._run(x[start:start + W])
            last = start + W >= len(x)
            a = 0 if start == 0 else half
            b = lp.shape[0] if last else int(round(win * FPS)) - half
            parts.append(lp[a:b])
            if last:
                break
            start += H
        return np.concatenate(parts)


# ---------------------------------------------------------------- the answer key

class Key:
    """Expected sounds for each word of a passage, from the phonetizer."""

    def __init__(self, ear, moshaf=None):
        from quran_transcript import MoshafAttributes
        self.ear = ear
        self.words = bench.Words()
        self.moshaf = moshaf or MoshafAttributes(rewaya='hafs', madd_monfasel_len=4, madd_mottasel_len=4,
                                                 madd_mottasel_waqf=4, madd_aared_len=4)
        self._aya = {}
        self._phc = {}

    def where(self, w):
        """(sura, ayah, position in the ayah) of app word w."""
        lo, hi = 0, len(self.words.first) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            if self.words.first[mid] <= w:
                lo = mid
            else:
                hi = mid - 1
        return self.ayah_of_index[lo] + (w - self.words.first[lo],)

    @property
    def ayah_of_index(self):
        if not hasattr(self, '_aoi'):
            self._aoi = {v: k for k, v in self.words.vindex.items()}
        return self._aoi

    def uthmani(self, s, a):
        if (s, a) not in self._aya:
            from quran_transcript import Aya
            self._aya[(s, a)] = Aya(s, a).get().uthmani.split(' ')
        return self._aya[(s, a)]

    def phonetize(self, words_text):
        """Sounds of each word: the phonetizer's output cut at each word's first sound."""
        from quran_transcript import quran_phonetizer
        o = quran_phonetizer(' '.join(words_text), self.moshaf, remove_spaces=True)
        ph, mp = o.phonemes, o.mappings
        cuts, pos = [], 0
        for w in words_text:
            starts = [m.pos[0] for m in mp[pos:pos + len(w)] if m.pos[1] > m.pos[0]]
            cuts.append(min(starts) if starts else None)
            pos += len(w) + 1
        cuts[0] = 0
        for i in range(1, len(cuts)):  # a word with no sound of its own starts where the next one does
            if cuts[i] is None or cuts[i] < cuts[i - 1]:
                cuts[i] = cuts[i - 1]
        cuts.append(len(ph))
        return [ph[cuts[i]:cuts[i + 1]] for i in range(len(words_text))]

    def _ph(self, words_text):
        key = tuple(words_text)
        if key not in self._phc:
            self._phc[key] = self.phonetize(list(words_text))
        return self._phc[key]

    def _labels(self, snd):
        labels, fold, counts = [], [], []
        for ch in snd:
            if labels and ch in FOLD and self.ear.vocab[labels[-1] - 1] == ch:
                counts[-1] += 1
                continue
            if ch not in self.ear.index:
                continue
            labels.append(self.ear.index[ch])
            fold.append(ch in FOLD)
            counts.append(1)
        return {'labels': labels, 'fold': fold, 'counts': counts, 'sounds': snd}

    def forms(self, ayah, p):
        """The ways word p of an ayah can sound: joined to both neighbours, started after a pause (ibtida),
        stopped on (waqf), or both. Identical forms are kept once."""
        out, seen = [], set()
        cands = [('joined', lambda: self._ph(ayah)[p]),
                 ('start', lambda: self._ph(ayah[p:])[0]),
                 ('stop', lambda: self._ph(ayah[:p + 1])[-1]),
                 ('alone', lambda: self._ph(ayah[p:p + 1])[0])]
        for name, get in cands:
            try:
                snd = get()
            except Exception:
                continue
            if snd in seen:
                continue
            seen.add(snd)
            out.append(dict(self._labels(snd), form=name))
        return out

    def passage(self, lo, hi):
        """For app words lo..hi-1: [{'word', 'text', 'forms': [{labels, fold, counts, sounds, form}]}]."""
        out = []
        for w in range(lo, hi):
            s, a, p = self.where(w)
            ayah = self.uthmani(s, a)
            n_app = self.words.counts[self.words.vindex[(s, a)]]
            if len(ayah) != n_app:
                raise ValueError(f'{s}:{a} has {len(ayah)} words in quran_transcript, {n_app} in the app')
            fs = self.forms(ayah, p)
            if not fs:
                raise ValueError(f'no sounds for {s}:{a} word {p}')
            out.append({'word': w, 'text': ayah[p], 'forms': fs, 'sounds': fs[0]['sounds']})
        return out


# ---------------------------------------------------------------- the checker

class Graph:
    """States: each form of each word is a CTC chain B0 L1 B1 … Ln Bn; then one filler before each word and
    one after the last (gap g sits before word g; g = 0 is the lead, g = W the trail)."""

    def __init__(self, key_words):
        self.W = W = len(key_words)
        lab, word_of, chain_of, kind, madd_back = [], [], [], [], []
        entries = [[] for _ in range(W)]
        exits = [[] for _ in range(W)]
        chain = 0
        for wi, kw in enumerate(key_words):
            for f in kw['forms']:
                b0 = len(lab)
                lab.append(0); word_of.append(wi); chain_of.append(chain); kind.append(0)
                for li, l in enumerate(f['labels']):
                    lab.append(l); word_of.append(wi); chain_of.append(chain); kind.append(1)
                    if f['fold'][li]:
                        madd_back.append(len(lab) - 1)
                    lab.append(0); word_of.append(wi); chain_of.append(chain); kind.append(2)
                entries[wi] += [b0] + ([b0 + 1] if f['labels'] else [])
                exits[wi] += ([len(lab) - 2] if f['labels'] else []) + [len(lab) - 1]
                chain += 1
        self.S = S = len(lab)
        self.lab = np.array(lab + [0], np.int64)  # one spare state (index S) pads the tables below
        self.word_of = np.array(word_of + [-1], np.int64)
        self.kind = np.array(kind + [-1], np.int8)
        ch = np.array(chain_of + [-1], np.int64)
        k = self.kind
        self.prev1 = np.zeros(S + 1, bool)
        self.prev1[1:S] = ch[1:S] == ch[:S - 1]
        self.prev2 = np.zeros(S + 1, bool)
        self.prev2[2:S] = (k[2:S] == 1) & (k[:S - 2] == 1) & (ch[2:S] == ch[:S - 2]) & (self.lab[2:S] != self.lab[:S - 2])
        self.madd = np.zeros(S + 1, bool)
        self.madd[np.array(madd_back, np.int64)] = True
        ne = max(len(e) for e in entries)
        nx = max(len(e) for e in exits)
        self.entries = np.full((W, ne), S, np.int64)
        self.exits = np.full((W, nx), S, np.int64)
        for wi in range(W):
            self.entries[wi, :len(entries[wi])] = entries[wi]
            self.exits[wi, :len(exits[wi])] = exits[wi]
        self.is_exit = np.zeros(S + 1, bool)
        self.is_exit[self.exits.ravel()] = True
        self.is_exit[S] = False
        self.start = np.array(entries[0], np.int64)


def viterbi(lp, g, P):
    """Best path through the passage graph. Returns ([(frame, state, entered)], score): state >= 0 is a word
    state, state < 0 is the filler -(gap+1); entered is True on the first frame of a visit to a word."""
    T, S, W = lp.shape[0], g.S, g.W
    NEG = -1e30
    best_any = lp.max(axis=1)
    d = np.full(S + 1, NEG)
    gap = np.full(W + 1, NEG)
    gap[0] = best_any[0] + P['edge']
    for s in g.start:
        d[s] = lp[0, g.lab[s]]
    bp = np.zeros((T, S + 1), np.uint8)      # 0 self, 1 s-1, 2 s-2, 3 s+1 (madd), 4 entry
    ent_src = np.zeros((T, W), np.int32)     # entry source: code * 1_000_000 + index
    gap_src = np.zeros((T, W + 1), np.uint8)  # 0 self, 1 from the word before
    ex_state = np.zeros((T, W), np.int32)    # which exit state gave each word's exit score
    widx = np.arange(W)
    skips = [k for k in range(1, int(P['skip_max']) + 1) if k < W]
    backs = min(int(P['back_max']), W - 1)
    rows = np.arange(W)
    pen = np.full(W + 1, P['fill']); pen[0] = pen[W] = P['edge']
    for t in range(1, T):
        e = lp[t]
        vals = d[g.exits]
        am = vals.argmax(axis=1)
        ex = vals[rows, am]
        ex_state[t] = g.exits[rows, am]
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
        for k in skips:
            c = np.full(W, NEG); c[k + 1:] = ex[:W - k - 1] + P['skip'] * k
            offer(c, 2, widx - 1 - k)
        if backs > 0:
            win = np.full(W, NEG); warg = np.zeros(W, np.int64)
            for o in range(backs + 1):
                c2 = np.full(W, NEG); c2[:W - o] = ex[o:]
                b = c2 > win; win[b] = c2[b]; warg[b] = o
            offer(win + P['back'], 4, widx + warg)
        c = gap[:W].copy(); c[0] = NEG
        offer(c, 5, widx)
        c = np.full(W, NEG); c[1:] = gap[1:W] + P['fill_sub']
        offer(c, 6, widx - 1)
        ent_src[t] = src

        nd = d.copy()
        code = np.zeros(S + 1, np.uint8)
        c = np.full(S + 1, NEG); c[1:] = d[:-1]; c[~g.prev1] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 1
        c = np.full(S + 1, NEG); c[2:] = d[:-2]; c[~g.prev2] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 2
        c = np.full(S + 1, NEG); c[:-1] = d[1:]; c[~g.madd] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 3
        ce = np.broadcast_to(cand[:, None], g.entries.shape)
        cur = nd[g.entries]
        b = ce > cur
        nd[g.entries[b]] = ce[b]
        code[g.entries[b]] = 4
        nd += e[g.lab]
        nd[S] = NEG
        bp[t] = code

        ng = gap.copy()
        gs = np.zeros(W + 1, np.uint8)
        c = np.full(W + 1, NEG); c[1:W] = ex[:W - 1] + P['fill_in']; c[W] = ex[W - 1]
        b = c > ng; ng[b] = c[b]; gs[b] = 1
        ng += best_any[t] + pen
        gap_src[t] = gs
        d, gap = nd, ng

    vals = d[g.exits]
    am = vals.argmax(axis=1)
    ex = vals[rows, am]
    ends = ex + P['stop']
    ends[W - 1] = ex[W - 1]
    if gap[W] >= ends.max():
        cur, score = ('gap', W), float(gap[W])
    else:
        w = int(np.argmax(ends))
        cur, score = ('state', int(g.exits[w, am[w]])), float(ends.max())
    path = []
    t = T - 1
    while t >= 0:
        if cur[0] == 'gap':
            gi = cur[1]
            path.append((t, -(gi + 1), False))
            if t == 0:
                break
            if gap_src[t, gi] == 1:
                cur = ('state', int(ex_state[t, gi - 1]))
            t -= 1
            continue
        s = cur[1]
        c = bp[t, s] if t > 0 else 4
        path.append((t, s, c == 4))
        if t == 0:
            break
        if c == 4:
            w = int(g.word_of[s])
            kind, idx = divmod(int(ent_src[t, w]), 1_000_000)
            cur = ('state', int(ex_state[t, idx])) if kind in (1, 2, 4) else ('gap', idx)
        else:
            cur = ('state', s + {0: 0, 1: -1, 2: -2, 3: 1}[int(c)])
        t -= 1
    path.reverse()
    return path, score


# Sounds that only tajweed tells apart (mode 3), and how mode 2 (letters and harakat) sees them
BASE = {'ں': 'ن', '۾': 'م'}
SKIP = set('ڇۜـٲؙ۪')
LONG = set('اۥۦ')


def heard_tokens(lp):
    """Greedy CTC: each sound the model emitted, with the frame it peaked on and how sure it was."""
    am = lp.argmax(axis=1)
    out, t = [], 0
    T = len(am)
    while t < T:
        k = int(am[t])
        u = t
        while u + 1 < T and int(am[u + 1]) == k:
            u += 1
        if k != 0:
            seg = lp[t:u + 1, k]
            peak = t + int(np.argmax(seg))
            out.append((k, peak, float(np.exp(seg.max()))))
        t = u + 1
    return out


def substitutions(expected, heard, vocab, edge_free=2, span=None, edge_frames=99):
    """Edit-align the expected sounds of a word with the sounds heard in its span. A sound the model left
    out costs little (it often drops one); a different sound in its place costs a full edit; a few sounds
    at each edge of the span may belong to the neighbours. Returns (confident substitutions
    [(expected, heard, p)], sounds not heard, sounds that count)."""
    def norm(ch):
        ch = BASE.get(ch, ch)
        return None if ch in SKIP else ch
    exp = [c for c in (norm(vocab[l - 1]) for l in expected) if c is not None]
    hrd = [(c, p, pk) for c, p, pk in ((norm(vocab[k - 1]), p, pk) for k, pk, p in heard) if c is not None]
    n, m = len(exp), len(hrd)

    def dcost(c):
        return 0.2 if c in LONG else 0.6

    def icost(c):
        return 0.2 if c in LONG else 0.8

    def near_start(j):
        return span is None or hrd[j][2] < span[0] + edge_frames

    def near_end(j):
        return span is None or hrd[j][2] >= span[1] - edge_frames

    D = np.full((n + 1, m + 1), 1e9)
    D[0, 0] = 0.0
    for j in range(1, m + 1):
        free = j <= edge_free and near_start(j - 1) and D[0, j - 1] == 0.0
        D[0, j] = 0.0 if free else D[0, j - 1] + icost(hrd[j - 1][0])
    for i in range(1, n + 1):
        D[i, 0] = D[i - 1, 0] + dcost(exp[i - 1])
        for j in range(1, m + 1):
            same = exp[i - 1] == hrd[j - 1][0]
            D[i, j] = min(D[i - 1, j - 1] + (0.0 if same else 1.0), D[i - 1, j] + dcost(exp[i - 1]),
                          D[i, j - 1] + icost(hrd[j - 1][0]))
    ends = [m] + [jj for jj in range(max(0, m - edge_free), m) if all(near_end(x) for x in range(jj, m))]
    j = min(ends, key=lambda jj: D[n, jj])
    i, subs, dels = n, [], 0
    while i > 0:
        if j > 0:
            same = exp[i - 1] == hrd[j - 1][0]
            if D[i, j] == D[i - 1, j - 1] + (0.0 if same else 1.0):
                if not same:
                    subs.append((exp[i - 1], hrd[j - 1][0], hrd[j - 1][1], hrd[j - 1][2]))
                i -= 1; j -= 1
                continue
            if D[i, j] == D[i, j - 1] + icost(hrd[j - 1][0]):
                j -= 1
                continue
        dels += exp[i - 1] not in LONG
        i -= 1
    return subs, dels, sum(1 for c in exp if c not in LONG)


def decide(key_words, g, lp, path, P, vocab=None):
    """Statuses, flags and extras from the best path."""
    W = g.W
    nonblank_best = lp[:, 1:].max(axis=1)
    visits = [[] for _ in range(W)]  # per word: each visit's frames, whether it left normally, sound scores
    fillers = []  # (gap, start, end)

    def close(w, frames, end, left_normally):
        per = {}
        for t, s in frames:
            if g.kind[s] == 1:
                per.setdefault(s, []).append(lp[t, g.lab[s]] - nonblank_best[t])
        states = sorted({s for _, s in frames if g.kind[s] == 1})
        visits[w].append({'start': frames[0][0], 'end': end, 'ok_exit': left_normally,
                          'scores': [float(np.mean(v)) for _, v in sorted(per.items())],
                          'labels': [int(g.lab[s]) for s in states]})

    cur_w, frames, cur_gap, gstart, prev = None, [], None, None, None
    for t, s, entered in path:
        if s >= 0:
            w = int(g.word_of[s])
            if cur_gap is not None:
                fillers.append((cur_gap, gstart, t)); cur_gap = None
            if cur_w is not None and (entered or w != cur_w):
                close(cur_w, frames, t, bool(g.is_exit[prev])); cur_w = None
            if cur_w is None:
                cur_w, frames = w, []
            frames.append((t, s))
        else:
            gi = -s - 1
            if cur_w is not None:
                close(cur_w, frames, t, bool(g.is_exit[prev])); cur_w = None
            if cur_gap != gi:
                if cur_gap is not None:
                    fillers.append((cur_gap, gstart, t))
                cur_gap, gstart = gi, t
        prev = s
    end = path[-1][0] + 1
    if cur_w is not None:
        close(cur_w, frames, end, True)
    if cur_gap is not None:
        fillers.append((cur_gap, gstart, end))
    if P['sound_rule'] == 'subst':
        index = {c: i + 1 for i, c in enumerate(vocab)}
        toks = heard_tokens(lp)
        peaks = np.array([pk for _, pk, _ in toks]) if toks else np.zeros(0, int)
        for vs in visits:
            for v in vs:
                a, b = np.searchsorted(peaks, v['start']), np.searchsorted(peaks, v['end'])
                subs, dels, n = substitutions(v['labels'], toks[a:b], vocab, int(P['edge_free']),
                                              (v['start'], v['end']), int(P['edge_frames']))
                keep = []
                for e_ch, h_ch, pr, pk in subs:
                    if pr < P['sub_p']:
                        continue
                    if P['sub_q'] < 1.0:
                        ids = [i for c, i in index.items() if BASE.get(c, c) == e_ch]
                        lo_, hi_ = max(0, pk - 3), min(len(lp), pk + 4)
                        if ids and float(np.exp(lp[lo_:hi_][:, ids].max())) >= P['sub_q']:
                            continue
                    keep.append((e_ch, h_ch, round(pr, 2)))
                v['subs'] = keep
                v['dels'] = dels
                unheard = n > 0 and dels >= 2 and dels >= P['del_frac'] * n
                poor = P['mean_gop'] is not None and v['scores'] and float(np.mean(v['scores'])) < P['mean_gop']
                v['why'] = [k for k, on in (('subst', bool(v['subs'])), ('unheard', unheard), ('poor', bool(poor))) if on]
                v['bad'] = bool(v['why'])
    else:  # 'gop': the first rule; 'off': words only (said, skipped, extra, out of order), no sound judgement
        for vs in visits:
            for v in vs:
                v['subs'] = []
                v['bad'] = P['sound_rule'] == 'gop' and bool(v['scores']) and min(v['scores']) < P['gop']

    furthest = max((w for w in range(W) if visits[w]), default=-1)
    statuses, flagged, shown, decided = {}, {}, {}, {}
    replaced = set()
    extras = []
    for gi, a, b in fillers:
        if gi == 0 or gi == W:
            continue
        dur = (b - a) / FPS
        nxt = None
        # what came after this filler: the word it sits before (an extra) or the one after (a replacement)
        for w in (gi, gi + 1):
            if w < W and any(abs(v['start'] - b) <= 1 for v in visits[w]):
                nxt = w
                break
        if nxt == gi + 1:
            replaced.add(gi)
        elif dur >= P['extra_min']:
            extras.append({'after': key_words[gi - 1]['word'], 't': b / FPS + P['delay']})
    # out of order: a word first heard only after a later word had been heard (a swap)
    first = {w: visits[w][0]['start'] for w in range(W) if visits[w]}
    late = set()
    for w, t0 in first.items():
        if any(u > w and tu < t0 for u, tu in first.items()):
            late.add(w)
    for w in range(W):
        app_w = key_words[w]['word']
        vs = visits[w]
        if vs and w in late:
            v = vs[-1]
            end_s = v['end'] / FPS
            shown[app_w] = v['start'] / FPS + 0.3
            decided[app_w] = end_s + P['delay']
            statuses[app_w] = 'wrong'
            flagged[app_w] = {'t': end_s + P['delay'], 'kind': 'order'}
        elif vs:
            v = vs[-1]
            worst = min(v['scores']) if v['scores'] else 0.0
            end_s = v['end'] / FPS
            shown[app_w] = v['start'] / FPS + 0.3
            decided[app_w] = end_s + P['delay']
            bad = v['bad'] or w in replaced
            statuses[app_w] = 'wrong' if bad else 'correct'
            if bad:
                flagged[app_w] = {'t': end_s + P['delay'], 'kind': 'replaced' if w in replaced else 'sound',
                                  'worst': worst, 'subs': v['subs'], 'why': v.get('why', [])}
            elif any(x['bad'] for x in vs[:-1]):
                statuses[app_w] = 'corrected'
        elif w in replaced:
            statuses[app_w] = 'wrong'
            nxt = [x for ww in range(w + 1, W) for x in visits[ww]]
            t_f = (min(x['start'] for x in nxt) / FPS if nxt else len(lp) / FPS) + P['delay']
            flagged[app_w] = {'t': t_f, 'kind': 'replaced'}
            decided[app_w] = t_f
        elif w < furthest:
            statuses[app_w] = 'missed'
            nxt = [x for ww in range(w + 1, W) for x in visits[ww]]
            t_f = min(x['start'] for x in nxt) / FPS + P['delay']
            flagged[app_w] = {'t': t_f, 'kind': 'skipped'}
            decided[app_w] = t_f
        else:
            statuses[app_w] = 'pending'
    return statuses, flagged, shown, decided, extras, visits, fillers


# ---------------------------------------------------------------- running a bench

def run_item(item_path, run, name, P, ear_name='hisn'):
    truth = json.loads(pathlib.Path(item_path).read_text())
    lo, hi = truth['range']
    if isinstance(lo, str):
        lo, hi = json.loads(truth['range'])
    start_at = truth.get('start_at', lo)
    stop_at = truth.get('stop_at', hi)
    cache = run / 'logprobs' / ear_name / f"{truth.get('sha1') or truth['id']}.npy"
    ear = EAR if 'EAR' in globals() else None
    if cache.exists():
        lp = np.load(cache).astype(np.float32)
    else:
        import soundfile as sf
        x, sr = sf.read(pathlib.Path(item_path).with_suffix('.wav'), dtype='float32')
        assert sr == 16000
        if x.ndim > 1:
            x = x.mean(axis=1)
        lp = ear.logprobs(x)
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.save(cache, lp.astype(np.float16))
    kws = KEY.passage(start_at, stop_at)
    g = Graph(kws)
    t0 = time.perf_counter()
    path, score = viterbi(lp, g, P)
    statuses, flagged, shown, decided, extras, visits, fillers = decide(kws, g, lp, path, P, EAR.vocab)
    for w in range(lo, hi):
        statuses.setdefault(w, 'pending')
    res = {
        'id': truth['id'], 'engine': name, 'statuses': statuses, 'shown': shown, 'decided': decided,
        'flagged': flagged, 'flaggedOutside': 0, 'extras': extras,
        'stats': {'frames': int(lp.shape[0]), 'decode_s': round(time.perf_counter() - t0, 2), 'score': score},
        'words': [{'word': k['word'], 'text': k['text'], 'sounds': k['sounds'],
                   'visits': [{'start': v['start'] / FPS, 'end': v['end'] / FPS,
                               'worst': min(v['scores']) if v['scores'] else None} for v in visits[i]]}
                  for i, k in enumerate(kws)],
        'fillers': [{'gap': gi, 'start': a / FPS, 'end': b / FPS} for gi, a, b in fillers],
    }
    out = run / 'results' / name / f"{truth['id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, ensure_ascii=False))
    return truth['id'], res['stats']['decode_s']


def _init(threads):
    global EAR, KEY
    EAR = Hisn(threads=threads)
    KEY = Key(EAR)


def _work(args):
    try:
        return run_item(*args)
    except Exception as e:  # report and go on
        return pathlib.Path(args[0]).stem, f'error: {type(e).__name__}: {e}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', required=True)
    ap.add_argument('--run', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--only', default='')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--threads', type=int, default=2)
    ap.add_argument('--params', default='{}', help='JSON overrides of DEFAULTS')
    args = ap.parse_args()
    P = dict(DEFAULTS, **json.loads(args.params))
    run = pathlib.Path(args.run)
    items = sorted(pathlib.Path(args.bench, 'items').glob('*.json'))
    items = [f for f in items if args.only in f.name]
    if args.limit:
        items = items[: args.limit]
    (run / 'results' / args.name).mkdir(parents=True, exist_ok=True)
    (run / 'results' / args.name / 'params.txt').write_text(json.dumps(P, indent=1))
    work = [(str(f), run, args.name, P) for f in items]
    t0 = time.time()
    errors = 0
    if args.jobs <= 1:
        _init(args.threads)
        results = map(_work, work)
    else:
        import multiprocessing as mp
        pool = mp.get_context('spawn').Pool(args.jobs, initializer=_init, initargs=(args.threads,))
        results = pool.imap_unordered(_work, work)
    for k, (iid, info) in enumerate(results, 1):
        if isinstance(info, str):
            errors += 1
            print(iid, info, file=sys.stderr, flush=True)
        if k % 20 == 0 or k == len(work):
            print(f'{k}/{len(work)} items, {time.time() - t0:.0f} s', file=sys.stderr, flush=True)
    print(f'done: {len(work)} items, {errors} errors, {time.time() - t0:.0f} s', file=sys.stderr)


if __name__ == '__main__':
    main()
