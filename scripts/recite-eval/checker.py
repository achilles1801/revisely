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

  python checker.py --lexicon            # once: every distinct word of the Qur'an and how it sounds alone
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
    'alts': 4,          # look-alike words listened for in place of each word (وما for ومن); 0: none
    'alt_pen': -5.0,    # the cost of hearing a look-alike instead of the word itself
    'alt_rule': 'any',  # 'skeleton': only look-alikes with other consonants (not ones that differ in harakat, madd or shadda)
    'extra_min': 0.35,  # a filler shorter than this (seconds) is not reported as an extra word
    'basmala_max': 8.0,  # a filler up to this long (seconds) before a surah's first word is its basmala
    'basmala_fill': -0.1,  # per frame in that filler (other fillers: 'fill')
    'lead_fill': -0.5,  # before a passage that opens a surah: as 'edge' (any cheaper and the lead ate the first
                        # word of professionals reciting a long isti'adha: Abdul Basit, Sudais)
    'delay': 1.0,       # (offline) seconds after a word ends that a live checker would decide it
    'look': 1.0,        # (live) seconds of audio after a frame before the model's frame is final
    'hop': 0.5,         # (live) how often the model runs and the checker decides
    'win': 4.0,         # (live) seconds of audio the model sees each time
    'commit': 0.5,      # (live) seconds a word must be behind the newest final frame before it is decided
    'context': 30.0,    # (live) seconds of the path re-judged at each step
    'stable': 1,        # (live) steps in a row a word must look wrong before it is flagged
    'skip_wait': 'start',  # (live) a jumped-over word is decided once the next word heard has 'start'ed or 'end'ed
    'live_order': False,  # (live) flag words out of order as they happen (else only at the end)
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

    def stream(self, x, win=4.0, hop=0.5, look=1.0):
        """Live: every hop seconds, run the model on the last win seconds and keep the frames that have at
        least look seconds of audio after them (the last hop keeps the rest). Returns the frames in order;
        frame f was available at the hop that kept it, about f / 50 + look seconds into the recording."""
        sr, n = 16000, len(x)
        T = (1 + n // 160) // 2
        out = np.zeros((T, len(self.vocab) + 1), np.float32)
        done = 0
        k = 1
        while done < T:
            t_end = min(int(round(k * hop * sr)), n)
            s0 = max(0, t_end - int(win * sr))
            s0 -= s0 % 320
            last = t_end >= n
            hi = T if last else min(T, int((t_end / sr - look) * FPS))
            if hi > done:
                lp = self._run(x[s0:t_end])
                f0 = s0 // 320
                a, b = done, min(hi, f0 + lp.shape[0])
                if b > a:
                    out[a:b] = lp[a - f0:b - f0]
                if b < hi:  # the model gave a frame or two fewer than expected at the very end
                    out[b:hi] = lp[-1]
                done = hi
            k += 1
        return out

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

def norm_sounds(snd):
    """Sounds as mode 2 hears them: nasal holds as plain ن/م, tajweed-only marks dropped, a held long vowel
    written once."""
    out = []
    for ch in snd:
        ch = {'ں': 'ن', '۾': 'م'}.get(ch, ch)
        if ch in 'ڇۜـٲؙ۪':
            continue
        if out and ch == out[-1] and ch in FOLD | {'ن', 'م'}:
            continue
        out.append(ch)
    return ''.join(out)


def core(norm):
    """Without a final short vowel: how a word sounds when stopped on."""
    return norm.rstrip('َُِ')


def skeleton(norm):
    """The consonants alone: no harakat, no long vowels, a doubled consonant once, no hamza of a word's start.
    Two words with the same skeleton differ only in harakat, madd or shadda (ٱلدِّينِ joined, ددِۦۦۦۦن, and دِينِ;
    مَـٰلِكِ and مَلِك): that is for the letters check, not a different word."""
    out = []
    for ch in norm:
        if ch in 'َُِ' or ch in FOLD:
            continue
        if out and out[-1] == ch:
            continue
        out.append(ch)
    if out and out[0] == 'ء':
        out = out[1:]
    return ''.join(out)


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

    def _lexicon(self):
        """Every distinct word of the Qur'an and how it sounds alone (cache/lexicon.json, made once), bucketed
        by the length of its normalized sounds."""
        if not hasattr(self, '_lex'):
            path = LAB / 'cache/lexicon.json'
            if not path.exists():
                raise FileNotFoundError(f'{path}: build it first (python checker.py --lexicon)')
            self._lex = {}
            for e in json.loads(path.read_text()):
                e['norm'] = norm_sounds(e['sounds'])
                self._lex.setdefault(len(e['norm']), []).append(e)
            self._alt_cache = {}
        return self._lex

    def lookalikes(self, text, forms, k, rule='any'):
        """Up to k other words that sound almost the same (one or two sounds apart), nearest first. A word
        that differs only by a final vowel (as when stopping on it) doesn't count."""
        import Levenshtein
        ck = (text, rule)
        if ck in getattr(self, '_alt_cache', {}):
            return self._alt_cache[ck][:k]
        lex = self._lexicon()
        norms = {norm_sounds(f['sounds']) for f in forms}
        cores = {core(n) for n in norms}
        skels = {skeleton(n) for n in norms} | {skeleton(core(n)) for n in norms}
        found = {}
        for n in norms:
            maxd = 2 if len(n) <= 10 else 3
            for ln in range(len(n) - maxd, len(n) + maxd + 1):
                for e in lex.get(ln, ()):
                    if e['text'] == text or e['norm'] in norms or core(e['norm']) in cores:
                        continue
                    if rule == 'skeleton' and (skeleton(e['norm']) in skels or skeleton(core(e['norm'])) in skels):
                        continue
                    d = Levenshtein.distance(n, e['norm'], score_cutoff=maxd)
                    if d <= maxd and (e['text'] not in found or d < found[e['text']][0]):
                        found[e['text']] = (d, -e['n'], e)
        ranked, seen = [], set()
        for _, _, e in sorted(found.values(), key=lambda x: (x[0], x[1])):
            if e['norm'] not in seen:  # spellings that sound the same are one alternative
                seen.add(e['norm'])
                ranked.append(e)
        out = [dict(self._labels(e['sounds']), form='alt', text=e['text']) for e in ranked[:8]]
        self._alt_cache[ck] = out
        return out[:k]

    def passage(self, lo, hi, alts=0, alt_rule='any'):
        """For app words lo..hi-1: [{'word', 'text', 'forms': [{labels, fold, counts, sounds, form}], 'alts'}]."""
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
            alt = self.lookalikes(ayah[p], fs, alts, alt_rule) if alts else []
            out.append({'word': w, 'text': ayah[p], 'forms': fs, 'sounds': fs[0]['sounds'], 'alts': alt})
        return out


# ---------------------------------------------------------------- the checker

class Graph:
    """States: each form of each word is a CTC chain B0 L1 B1 … Ln Bn; then one filler before each word and
    one after the last (gap g sits before word g; g = 0 is the lead, g = W the trail)."""

    def __init__(self, key_words):
        self.W = W = len(key_words)
        # gaps before a surah that starts inside the passage, where a basmala is said (Al-Falaq after Al-Ikhlas)
        self.surah_gap = [g for g in range(0, W) if _starts_surah(key_words[g]['word'])]  # 0: the passage opens a surah
        lab, word_of, chain_of, kind, madd_back, alt_of = [], [], [], [], [], []
        entries = [[] for _ in range(W)]
        entry_alt = [[] for _ in range(W)]
        exits = [[] for _ in range(W)]
        chain = 0
        for wi, kw in enumerate(key_words):
            chains = [(f, -1) for f in kw['forms']] + [(f, ai) for ai, f in enumerate(kw.get('alts') or [])]
            for f, ai in chains:
                b0 = len(lab)
                lab.append(0); word_of.append(wi); chain_of.append(chain); kind.append(0); alt_of.append(ai)
                for li, l in enumerate(f['labels']):
                    lab.append(l); word_of.append(wi); chain_of.append(chain); kind.append(1); alt_of.append(ai)
                    if f['fold'][li]:
                        madd_back.append(len(lab) - 1)
                    lab.append(0); word_of.append(wi); chain_of.append(chain); kind.append(2); alt_of.append(ai)
                new = [b0] + ([b0 + 1] if f['labels'] else [])
                entries[wi] += new
                entry_alt[wi] += [ai >= 0] * len(new)
                exits[wi] += ([len(lab) - 2] if f['labels'] else []) + [len(lab) - 1]
                chain += 1
        self.S = S = len(lab)
        self.lab = np.array(lab + [0], np.int64)  # one spare state (index S) pads the tables below
        self.word_of = np.array(word_of + [-1], np.int64)
        self.alt_of = np.array(alt_of + [-1], np.int64)
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
        self.entry_alt = np.zeros((W, ne), bool)
        self.exits = np.full((W, nx), S, np.int64)
        for wi in range(W):
            self.entries[wi, :len(entries[wi])] = entries[wi]
            self.entry_alt[wi, :len(entries[wi])] = entry_alt[wi]
            self.exits[wi, :len(exits[wi])] = exits[wi]
        self.is_exit = np.zeros(S + 1, bool)
        self.is_exit[self.exits.ravel()] = True
        self.is_exit[S] = False
        self.start = np.array(entries[0], np.int64)


class Decoder:
    """The Viterbi pass, one frame at a time, so it can run as audio arrives: feed() frames, then
    traceback() from the best state now (live) or from the passage's end (final)."""

    NEG = -1e30

    def __init__(self, g, P, T):
        self.g, self.P = g, P
        S, W = g.S, g.W
        self.bp = np.zeros((T, S + 1), np.uint8)      # 0 self, 1 s-1, 2 s-2, 3 s+1 (madd), 4 entry
        self.ent_src = np.zeros((T, W), np.int32)     # entry source: code * 1_000_000 + index
        self.gap_src = np.zeros((T, W + 1), np.uint8)  # 0 self, 1 from the word before
        self.ex_state = np.zeros((T, W), np.int32)    # which exit state gave each word's exit score
        self.widx = np.arange(W)
        self.skips = [k for k in range(1, int(P['skip_max']) + 1) if k < W]
        self.backs = min(int(P['back_max']), W - 1)
        self.pen = np.full(W + 1, P['fill']); self.pen[0] = self.pen[W] = P['edge']
        for gg in getattr(g, 'surah_gap', []):  # a basmala there is cheap, so it isn't forced into the surah's first word
            self.pen[gg] = P.get('lead_fill', -0.25) if gg == 0 else P.get('basmala_fill', -0.1)
        self.alt_pen = np.where(g.entry_alt, P['alt_pen'], 0.0)
        self.t = 0  # frames taken in

    def feed(self, lp):
        for row in lp:
            self._step(row)

    def _step(self, e):
        g, P, NEG = self.g, self.P, self.NEG
        S, W, t = g.S, g.W, self.t
        best_any = float(e.max())
        if t == 0:
            self.d = np.full(S + 1, NEG)
            self.gap = np.full(W + 1, NEG)
            self.gap[0] = best_any + P['edge']
            for s in g.start:
                self.d[s] = e[g.lab[s]]
            self.t = 1
            return
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
        for k in self.skips:
            c = np.full(W, NEG); c[k + 1:] = ex[:W - k - 1] + P['skip'] * k
            offer(c, 2, widx - 1 - k)
        if self.backs > 0:
            win = np.full(W, NEG); warg = np.zeros(W, np.int64)
            for o in range(self.backs + 1):
                c2 = np.full(W, NEG); c2[:W - o] = ex[o:]
                b = c2 > win; win[b] = c2[b]; warg[b] = o
            offer(win + P['back'], 4, widx + warg)
        c = gap[:W].copy(); c[0] = NEG
        offer(c, 5, widx)
        c = np.full(W, NEG); c[1:] = gap[1:W] + P['fill_sub']
        offer(c, 6, widx - 1)
        self.ent_src[t] = src

        nd = d.copy()
        code = np.zeros(S + 1, np.uint8)
        c = np.full(S + 1, NEG); c[1:] = d[:-1]; c[~g.prev1] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 1
        c = np.full(S + 1, NEG); c[2:] = d[:-2]; c[~g.prev2] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 2
        c = np.full(S + 1, NEG); c[:-1] = d[1:]; c[~g.madd] = NEG
        b = c > nd; nd[b] = c[b]; code[b] = 3
        ce = cand[:, None] + self.alt_pen
        cur = nd[g.entries]
        b = ce > cur
        nd[g.entries[b]] = ce[b]
        code[g.entries[b]] = 4
        nd += e[g.lab]
        nd[S] = NEG
        self.bp[t] = code

        ng = gap.copy()
        gs = np.zeros(W + 1, np.uint8)
        c = np.full(W + 1, NEG); c[1:W] = ex[:W - 1] + P['fill_in']; c[W] = ex[W - 1]
        b = c > ng; ng[b] = c[b]; gs[b] = 1
        ng += best_any + self.pen
        self.gap_src[t] = gs
        self.d, self.gap = nd, ng
        self.t = t + 1

    def traceback(self, final=True):
        """The best path so far. final: it must end where a passage can end (the trail, the last word, or an
        earlier word at a cost); live: from whatever state is best now, mid-word included."""
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
        path = []
        t = self.t - 1
        while t >= 0:
            if cur[0] == 'gap':
                gi = cur[1]
                path.append((t, -(gi + 1), False))
                if t == 0:
                    break
                if self.gap_src[t, gi] == 1:
                    cur = ('state', int(self.ex_state[t, gi - 1]))
                t -= 1
                continue
            s = cur[1]
            c = self.bp[t, s] if t > 0 else 4
            path.append((t, s, c == 4))
            if t == 0:
                break
            if c == 4:
                w = int(g.word_of[s])
                kind, idx = divmod(int(self.ent_src[t, w]), 1_000_000)
                cur = ('state', int(self.ex_state[t, idx])) if kind in (1, 2, 4) else ('gap', idx)
            else:
                cur = ('state', s + {0: 0, 1: -1, 2: -2, 3: 1}[int(c)])
            t -= 1
        path.reverse()
        return path, score


def viterbi(lp, g, P):
    """Best path through the passage graph over a whole recording. Returns ([(frame, state, entered)], score):
    state >= 0 is a word state, state < 0 is the filler -(gap+1); entered is True on the first frame of a
    visit to a word."""
    dec = Decoder(g, P, lp.shape[0])
    dec.feed(lp)
    return dec.traceback(final=True)


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


def _starts_surah(app_word):
    """True for the first word of a surah (where a basmala is said before it)."""
    try:
        s, a, p = KEY.where(app_word)
    except Exception:
        return False
    return a == 1 and p == 0


def decide(key_words, g, lp, path, P, vocab=None, toks=None):
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
        alts = [int(g.alt_of[s]) for _, s in frames]
        visits[w].append({'start': frames[0][0], 'end': end, 'ok_exit': left_normally,
                          'scores': [float(np.mean(v)) for _, v in sorted(per.items())],
                          'labels': [int(g.lab[s]) for s in states],
                          'alt': max(set(alts), key=alts.count)})

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
        toks = heard_tokens(lp) if toks is None else toks
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

    for w, vs in enumerate(visits):  # a look-alike word heard instead of this one
        for v in vs:
            if v['alt'] >= 0:
                v['bad'] = True
                v['why'] = ['lookalike']
                v['heard'] = key_words[w]['alts'][v['alt']]['text']
                v.setdefault('subs', [])

    furthest = max((w for w in range(W) if visits[w]), default=-1)
    statuses, flagged, shown, decided = {}, {}, {}, {}
    replaced = set()
    extras = []
    for gi, a, b in fillers:
        if gi == 0 or gi == W:
            continue
        dur = (b - a) / FPS
        if dur <= P.get('basmala_max', 8.0) and _starts_surah(key_words[gi]['word']):
            continue  # the basmala before a surah that starts inside the passage (Al-Falaq after Al-Ikhlas): not an extra
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
                kind = 'replaced' if w in replaced else 'lookalike' if v['alt'] >= 0 else 'sound'
                flagged[app_w] = {'t': end_s + P['delay'], 'kind': kind, 'worst': worst, 'subs': v.get('subs', []),
                                  'why': v.get('why', []), 'heard': v.get('heard')}
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
    ear_name = P.get('ear') or ear_name
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
    kws = KEY.passage(start_at, stop_at, int(P['alts']), P['alt_rule'])
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


def run_item_live(item_path, run, name, P, ear_name='hisn'):
    """As the app would: the model on a sliding window, the checker fed each hop's new frames, and a word
    decided once it is commit seconds behind the newest final frame. Flags are timed when they would show;
    a flag later cleared (the reciter went back) still counts as shown. The final statuses come from the
    whole recording."""
    ear_name = P.get('ear') or ear_name
    truth = json.loads(pathlib.Path(item_path).read_text())
    lo, hi = truth['range']
    if isinstance(lo, str):
        lo, hi = json.loads(truth['range'])
    start_at = truth.get('start_at', lo)
    stop_at = truth.get('stop_at', hi)
    tag = f"{ear_name}-live-w{P['win']:g}-h{P['hop']:g}-l{P['look']:g}"
    cache = run / 'logprobs' / tag / f"{truth.get('sha1') or truth['id']}.npy"
    if cache.exists():
        lp = np.load(cache).astype(np.float32)
    else:
        import soundfile as sf
        x, sr = sf.read(pathlib.Path(item_path).with_suffix('.wav'), dtype='float32')
        if x.ndim > 1:
            x = x.mean(axis=1)
        lp = EAR.stream(x, P['win'], P['hop'], P['look'])
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.save(cache, lp.astype(np.float16))
    kws = KEY.passage(start_at, stop_at, int(P['alts']), P['alt_rule'])
    g = Graph(kws)
    T = lp.shape[0]
    toks = heard_tokens(lp)  # a final frame never changes, so tokens behind the newest frame stand
    peaks = np.array([pk for _, pk, _ in toks]) if toks else np.zeros(0, int)
    dec = Decoder(g, P, T)
    app = [k['word'] for k in kws]
    shown, decided, flag_t, flag_kind = {}, {}, {}, {}
    bad_run = {}
    hop, look = P['hop'], P['look']
    cf, ctx = int(P['commit'] * FPS), int(P['context'] * FPS)
    t0 = time.perf_counter()
    k, now = 0, 0.0
    while True:
        k += 1
        now = k * hop
        avail = T if now >= T / FPS + look - 1e-9 else max(0, min(T, int((now - look) * FPS)))
        if avail > dec.t:
            dec.feed(lp[dec.t:avail])
        if dec.t >= 5:
            path, _ = dec.traceback(final=False)
            lo_t = max(0, dec.t - ctx)
            pw = [p for p in path if p[0] >= lo_t]
            n_tok = int(np.searchsorted(peaks, dec.t))
            st, fl, _, _, _, visits, _ = decide(kws, g, lp[:dec.t], pw, P, EAR.vocab, toks[:n_tok])
            seen = [w for w in range(g.W) if visits[w]]
            # words the path jumped over inside the window (visits in time order); only these can be judged
            # skipped now: a word whose visits fell out of the window isn't skipped, just out of view
            order = [w for _, w in sorted((v['start'], w) for w in seen for v in visits[w])]
            jumped = set()
            for wa, wb in zip(order, order[1:]):
                if wb > wa + 1:
                    jumped.update(range(wa + 1, wb))
            if seen:
                w_first = min(seen)
                if lo_t > 0 and visits[w_first][0]['start'] <= lo_t + 1:
                    w_first += 1  # its start is outside the window: judged at an earlier step
                for w in range(g.W):
                    aw = app[w]
                    if visits[w] and aw not in shown:
                        shown[aw] = now
                    if w < w_first or st.get(aw, 'pending') == 'pending':
                        continue
                    if not visits[w] and w not in jumped:
                        continue
                    if visits[w]:
                        end_f = visits[w][-1]['end']
                    else:  # a word jumped over: once the word heard after it is over, not just begun
                        later = [v for ww in range(w + 1, g.W) for v in visits[ww]]
                        if not later:
                            continue
                        end_f = min(later, key=lambda v: v['start'])[P['skip_wait']]
                    if end_f > dec.t - cf:
                        continue
                    decided.setdefault(aw, now)
                    kind = fl.get(aw, {}).get('kind')
                    bad = st[aw] in ('wrong', 'missed') and (P['live_order'] or kind != 'order')
                    bad_run[aw] = bad_run.get(aw, 0) + 1 if bad else 0
                    if bad and bad_run[aw] >= P['stable'] and aw not in flag_t:
                        flag_t[aw] = now
                        flag_kind[aw] = kind
        if dec.t >= T:
            break
    live_s = time.perf_counter() - t0
    path, score = dec.traceback(final=True)
    PF = dict(P, delay=look + P['commit'])
    statuses, fl, _, _, extras, visits, fillers = decide(kws, g, lp, path, PF, EAR.vocab, toks)
    late = 0
    for aw, x in fl.items():  # flags only the end of the recording showed
        if aw not in flag_t:
            flag_t[aw] = now
            flag_kind[aw] = x['kind']
            late += 1
    for w in range(lo, hi):
        statuses.setdefault(w, 'pending')
    cleared = sum(1 for aw in flag_t if statuses.get(aw) not in ('wrong', 'missed'))
    res = {
        'id': truth['id'], 'engine': name, 'live': True, 'statuses': statuses, 'shown': shown, 'decided': decided,
        'flagged': {aw: {'t': flag_t[aw], 'kind': flag_kind[aw]} for aw in flag_t}, 'flaggedOutside': 0,
        'extras': extras,
        'stats': {'frames': T, 'steps': k, 'decode_s': round(live_s, 2), 'score': score, 'flags_cleared': cleared,
                  'flags_at_end': late},
    }
    out = run / 'results' / name / f"{truth['id']}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(res, ensure_ascii=False))
    return truth['id'], res['stats']['decode_s']


def _init(threads, ckpt=None):
    global EAR, KEY
    if ckpt:  # a fine-tuned copy of the small model (hisn_torch.py), on the CPU
        import torch
        import hisn_torch
        torch.set_num_threads(threads)
        EAR = hisn_torch.Ear(ckpt, device='cpu')
    else:
        EAR = Hisn(threads=threads)
    KEY = Key(EAR)


def _work(args):
    try:
        return (run_item_live if args[3].get('live') else run_item)(*args)
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
    ap.add_argument('--ear', default='hisn', help='name of the model: where its outputs are cached (logprobs/<ear>)')
    ap.add_argument('--ckpt', default=None, help='a fine-tuned checkpoint (hisn_torch.py) to run when not cached')
    ap.add_argument('--params', default='{}', help='JSON overrides of DEFAULTS')
    ap.add_argument('--live', action='store_true', help='decide as the audio arrives (sliding-window model)')
    ap.add_argument('--lexicon', action='store_true', help='build cache/lexicon.json (every distinct word, alone)')
    args = ap.parse_args()
    if args.lexicon:
        from quran_transcript import Aya
        key = Key(Hisn())
        counts = {}
        for (s, a) in key.words.vindex:
            for w in Aya(s, a).get().uthmani.split(' '):
                counts[w] = counts.get(w, 0) + 1
        lex = [{'text': w, 'sounds': key.phonetize([w])[0], 'n': n} for w, n in counts.items()]
        (LAB / 'cache').mkdir(exist_ok=True)
        (LAB / 'cache/lexicon.json').write_text(json.dumps(lex, ensure_ascii=False))
        print(f'{len(lex)} words -> {LAB / "cache/lexicon.json"}')
        return
    P = dict(DEFAULTS, **json.loads(args.params))
    P['live'] = bool(args.live)
    P['ear'] = args.ear
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
        _init(args.threads, args.ckpt)
        results = map(_work, work)
    else:
        import multiprocessing as mp
        pool = mp.get_context('spawn').Pool(args.jobs, initializer=_init, initargs=(args.threads, args.ckpt))
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
