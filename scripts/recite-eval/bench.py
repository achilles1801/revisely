#!/usr/bin/env python3
"""Build the recitation benchmark: recordings with known words, known mistakes and known non-mistakes.

Real recitations (quran.com's per-ayah audio, with its per-word timings) are cut at word boundaries and
put back together with edits whose ground truth is exact:

  mistakes      del (a word left out), sub (a word said as another word of the same reciter),
                ins (an extra word), swap (two words in the wrong order), askip (an ayah left out),
                mut (the ayah starts right, then carries on as a similar ayah elsewhere: mutashabihat)
  not mistakes  back (going back a few words to say them again), again (repeating the whole ayah)

Each item is a 16 kHz mono WAV and a JSON of what is in it, word by word, with times. Conditions add
noise: `babble<SNR>` (other recitations and pink noise, like a room with people or a TV).

The audio is for evaluation only and is never committed: everything is written under --out (default
~/revisely-mistake-lab/data/bench-v0). The recordings are in the Tarteel model's training data
(EveryAyah), so they flatter it; held-out sets (learners, phones) are built separately.

  python bench.py [--out DIR] [--reciters 2,1,3,6,7,9,10,5] [--passages p1,p2,...] [--conditions clean,babble10]
"""
import argparse
import hashlib
import json
import pathlib
import random
import subprocess
import sys
import time
import urllib.error
import urllib.request

import numpy as np
import soundfile as sf

SR = 16000
REPO = pathlib.Path(__file__).resolve().parents[2]
API = 'https://api.quran.com/api/v4'

# quran.com recitation id -> short name. All have per-word timings.
RECITERS = {
    2: 'abdulbaset-murattal',
    1: 'abdulbaset-mujawwad',
    3: 'sudais',
    6: 'husary',
    7: 'alafasy',
    9: 'minshawi-murattal',
    10: 'shuraym',
    5: 'rifai',
    4: 'shatri',
    12: 'husary-muallim',
}

# Passages: (sura, first ayah, last ayah). Chosen for variety: long and short ayat, the opening
# letters, a refrain (Ar-Rahman), madd lazim (Al-Fatiha's الضالين), the old fixture (2:6-16).
PASSAGES = {
    'p1': (2, 6, 16),
    'p2': (1, 1, 7),
    'p3': (18, 1, 8),
    'p4': (36, 1, 18),
    'p5': (55, 1, 28),
    'p6': (67, 1, 13),
    'p7': (78, 1, 30),
    'p8': (2, 255, 257),
}

MISTAKES = ['del', 'sub', 'ins', 'swap', 'askip', 'mut']
NOT_MISTAKES = ['back', 'again']


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, path, tries=4):
    path = pathlib.Path(path)
    if path.exists() and path.stat().st_size > 0:
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'revisely-recite-eval'})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            tmp = path.with_suffix(path.suffix + '.part')
            tmp.write_bytes(data)
            tmp.rename(path)
            return path
        except Exception as e:  # network hiccup: retry
            if k == tries - 1:
                raise
            log(f'retry {url}: {e}')
            time.sleep(2 * (k + 1))


class Words:
    """The app's word list (src/data/quranWords.dat): word numbers, verse texts."""

    def __init__(self):
        d = json.loads((REPO / 'src/data/quranWords.dat').read_text(encoding='utf8'))
        self.counts = d['counts']
        self.imlaei = d['imlaei']
        self.uthmani = d['uthmani']
        # verse index (0..6235) of each (sura, ayah), and first word of each verse
        self.vindex = {}
        self.first = []
        sura_lengths = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98,
                        135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
                        54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11,
                        11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25,
                        22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6,
                        3, 5, 4, 5, 6]
        v = 0
        w = 0
        for s, n in enumerate(sura_lengths, 1):
            for a in range(1, n + 1):
                self.vindex[(s, a)] = v
                self.first.append(w)
                w += self.counts[v]
                v += 1
        assert v == len(self.counts) == 6236, v
        self.total = w

    def verse_words(self, s, a):
        v = self.vindex[(s, a)]
        return self.imlaei[v].split(' ')

    def first_word(self, s, a):
        return self.first[self.vindex[(s, a)]]

    def norm(self, s, a):
        return [normalize(x) for x in self.verse_words(s, a)]


def normalize(word):
    # Letters only, hamza seats and alef forms folded (close to the app's normalizeWord).
    out = []
    for ch in word:
        o = ord(ch)
        if 0x064B <= o <= 0x065F or o in (0x0670, 0x06E1, 0x0640) or 0x06D6 <= o <= 0x06ED:
            continue
        ch = {'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ى': 'ي', 'ة': 'ه', 'ؤ': 'ء', 'ئ': 'ء'}.get(ch, ch)
        if ch.strip():
            out.append(ch)
    return ''.join(out)


class Audio:
    """Per-ayah recordings and word timings for one reciter, cached under the data directory."""

    def __init__(self, cache, recitation):
        self.cache = pathlib.Path(cache) / str(recitation)
        self.recitation = recitation
        self._meta = {}

    def meta(self, s):
        if s in self._meta:
            return self._meta[s]
        path = self.cache / f'{s:03d}.json'
        if not path.exists():
            files = []
            page = 1
            while True:
                url = f'{API}/recitations/{self.recitation}/by_chapter/{s}?fields=segments&per_page=50&page={page}'
                tmp = self.cache / f'{s:03d}.p{page}.json'
                fetch(url, tmp)
                d = json.loads(tmp.read_text())
                tmp.unlink()
                files += d['audio_files']
                if not d['pagination'].get('next_page'):
                    break
                page += 1
            path.write_text(json.dumps(files))
        files = json.loads(path.read_text())
        self._meta[s] = {f['verse_key']: f for f in files}
        return self._meta[s]

    def ayah(self, s, a, verse_words=None):
        """(samples float32 16 kHz, [(start_s, end_s)] per word) or None when timings are missing."""
        m = self.meta(s).get(f'{s}:{a}')
        if not m or not m.get('segments'):
            return None
        url = m['url']
        if url.startswith('//'):
            url = 'https:' + url
        elif not url.startswith('http'):
            url = 'https://verses.quran.com/' + url
        try:
            mp3 = fetch(url, self.cache / f'{s:03d}{a:03d}.mp3')
        except urllib.error.HTTPError as e:
            log(f'no audio for {self.recitation} {s}:{a} ({e.code}): {url}')
            return None
        wav = mp3.with_suffix('.f32')
        if not wav.exists():
            raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(mp3), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                                 check=True, capture_output=True).stdout
            wav.write_bytes(raw)
        x = np.frombuffer(wav.read_bytes(), dtype=np.float32).copy()
        segs = {}
        for seg in m['segments']:
            # [word index from, word index to (exclusive), start ms, end ms]; 0-based; some are strings.
            # A span over several words is shared out by letters, and those words are marked approximate.
            if len(seg) < 4:
                continue
            w0, w1 = int(seg[0]), int(seg[1])
            b, e = float(seg[2]) / 1000, float(seg[3]) / 1000
            if w1 <= w0 + 1:
                segs[w0] = (b, e, False)
                continue
            names = verse_words[w0:w1] if verse_words else []
            sizes = [max(1, len(normalize(t))) for t in names] or [1] * (w1 - w0)
            total = sum(sizes)
            t = b
            for k, size in enumerate(sizes):
                d = (e - b) * size / total
                segs[w0 + k] = (t, t + d, True)
                t += d
        return x, segs


class Chunk:
    """A piece of a recording: one word (or the silence around an ayah) with what it stands for."""

    def __init__(self, x, src, role, word=None, text=None):
        self.x = x
        self.src = src  # (recitation, sura, ayah, index) for joins
        self.role = role  # 'word', 'pad'
        self.word = word  # global word number (mushaf word it is)
        self.text = text


def ayah_chunks(words, audio, s, a):
    vw = words.verse_words(s, a)
    got = audio.ayah(s, a, vw)
    if got is None:
        return None
    x, segs = got
    n = words.counts[words.vindex[(s, a)]]
    if sorted(segs) != list(range(n)):
        return None
    approx = [segs[i][2] for i in range(n)]
    times = [segs[i][:2] for i in range(n)]
    if any(e <= b for b, e in times):
        return None
    start = max(0.0, times[0][0] - 0.25)
    end = min(len(x) / SR, times[-1][1] + 0.35)
    bounds = [start] + [(times[i - 1][1] + times[i][0]) / 2 for i in range(1, n)] + [end]
    first = words.first_word(s, a)
    out = []
    for i in range(n):
        b, e = int(bounds[i] * SR), int(bounds[i + 1] * SR)
        c = Chunk(x[b:e], (audio.recitation, s, a, i), 'word', first + i, vw[i])
        c.approx = approx[i]
        out.append(c)
    return out


def silence(seconds):
    return np.zeros(int(seconds * SR), dtype=np.float32)


def join(chunks):
    """Concatenate, with 6 ms fades where a join isn't the recording's own continuity."""
    fade = int(0.006 * SR)
    ramp = np.linspace(0, 1, fade, dtype=np.float32)
    parts = []
    prev = None
    for c in chunks:
        x = c.x.copy()
        cont = prev is not None and prev.src and c.src and prev.src[:3] == c.src[:3] and prev.src[3] + 1 == c.src[3]
        if prev is not None and not cont and c.role == 'word' and len(x) > 2 * fade:
            x[:fade] *= ramp
            if parts and len(parts[-1]) > 2 * fade and prev.role == 'word':
                parts[-1] = parts[-1].copy()
                parts[-1][-fade:] *= ramp[::-1]
        parts.append(x)
        prev = c
    return parts


def similar_ayat(words, s, a, min_prefix=2):
    """Ayat elsewhere that start with the same words as (s, a) and then differ."""
    target = words.norm(s, a)
    out = []
    for (s2, a2), v in words.vindex.items():
        if (s2, a2) == (s, a):
            continue
        other = [normalize(x) for x in words.imlaei[v].split(' ')]
        k = 0
        while k < min(len(target), len(other)) and target[k] == other[k]:
            k += 1
        if k >= min_prefix and k < len(target) and k < len(other) - 1:
            out.append((k, s2, a2))
    out.sort(key=lambda t: (-t[0], t[1], t[2]))
    return out


def build_item(words, audio, passage, rng, mistakes, lead=4):
    s, a0, a1 = passage
    ayat = []
    for a in range(a0, a1 + 1):
        ch = ayah_chunks(words, audio, s, a)
        if ch is None:
            return None
        ayat.append((a, ch))
    lo = words.first_word(s, a0)
    hi = words.first_word(s, a1) + words.counts[words.vindex[(s, a1)]]
    pool = [c for _, ch in ayat for c in ch]
    events = []
    plan = {}  # (ayah index, word index) -> event, or ('ayah', k)
    if mistakes:
        n_words = hi - lo
        n_events = max(2, round(n_words / 22))
        kinds = (['del'] * 3 + ['sub'] * 3 + ['ins'] * 2 + ['swap'] * 2 + ['askip'] * 2 + ['mut'] * 2
                 + ['back'] * 3 + ['again'])
        taken = set()
        flat = [(k, i) for k, (_, ch) in enumerate(ayat) for i in range(len(ch))]
        tries = 0
        while len(events) < n_events and tries < 200:
            tries += 1
            kind = rng.choice(kinds)
            if kind in ('askip', 'again'):
                if len(ayat) < 4:
                    continue
                k = rng.randrange(1, len(ayat) - 1)
                span = set(range(flat.index((k, 0)) - 3, flat.index((k, len(ayat[k][1]) - 1)) + 4))
                if span & taken:
                    continue
                taken |= span
                ev = {'id': len(events), 'type': kind, 'ayah': ayat[k][0], 'mistake': kind == 'askip',
                      'words': [c.word for c in ayat[k][1]] if kind == 'askip' else []}
                plan[('ayah', k)] = ev
                events.append(ev)
                continue
            if kind == 'mut':
                cands = []
                for k in range(0, len(ayat) - 1):
                    for pre, s2, a2 in similar_ayat(words, s, ayat[k][0])[:6]:
                        if pre >= 2 and pre <= len(ayat[k][1]) - 2:
                            cands.append((k, pre, s2, a2))
                rng.shuffle(cands)
                done = False
                for k, pre, s2, a2 in cands:
                    span = set(range(flat.index((k, 0)) - 3, flat.index((k, len(ayat[k][1]) - 1)) + 4))
                    if span & taken:
                        continue
                    other = ayah_chunks(words, audio, s2, a2)
                    if other is None:
                        continue
                    taken |= span
                    ev = {'id': len(events), 'type': 'mut', 'ayah': ayat[k][0], 'from': pre, 'into': f'{s2}:{a2}',
                          'mistake': True, 'words': [c.word for c in ayat[k][1][pre:]],
                          'heard': ' '.join(c.text for c in other[pre:])}
                    plan[('ayah', k)] = (ev, pre, other)
                    events.append(ev)
                    done = True
                    break
                if not done:
                    continue
                continue
            # word-level: not in the first `lead` words (the reciter is found first) nor the last 2
            if len(flat) - 2 <= lead:
                continue
            j = rng.randrange(lead, len(flat) - 2)
            k, i = flat[j]
            width = 2 if kind == 'swap' else 1
            if kind == 'swap' and (j + 1 >= len(flat) or flat[j + 1][0] != k):
                continue
            span = set(range(j - min(4, lead + 2), j + width + 4))
            if span & taken or any(isinstance(key, tuple) and key[0] == 'ayah' and key[1] == k for key in plan):
                continue
            c = ayat[k][1][i]
            near_words = ayat[k][1][max(0, i - 1):i + 3]
            if any(getattr(x, 'approx', False) for x in near_words):
                continue  # word times shared out, not measured: keep edits off them
            ev = {'id': len(events), 'type': kind, 'mistake': kind in MISTAKES}
            if kind == 'del':
                ev['words'] = [c.word]
            elif kind == 'sub' or kind == 'ins':
                # another word of the same reciter, not this word or its neighbours, of a similar length
                near = {normalize(x.text) for x in pool if abs(x.word - c.word) <= 2}
                opts = [x for x in pool if normalize(x.text) not in near and len(normalize(x.text)) >= 3
                        and not getattr(x, 'approx', False)
                        and 0.6 < len(x.x) / max(1, len(c.x)) < 1.6]
                if not opts:
                    continue
                o = rng.choice(opts)
                ev['words'] = [c.word] if kind == 'sub' else []
                ev['after'] = c.word if kind == 'ins' else None
                ev['heard'] = o.text
                ev['_chunk'] = o
            elif kind == 'swap':
                ev['words'] = [c.word, c.word + 1]
            elif kind == 'back':
                back = rng.randint(2, 4)
                if i - back + 1 < 0:
                    continue
                ev['words'] = []
                ev['from'] = c.word - back + 1
                ev['to'] = c.word
            taken |= span
            plan[(k, i)] = ev
            events.append(ev)

    # Assemble.
    chunks = [Chunk(silence(rng.uniform(0.6, 1.0)), None, 'pad')]
    for k, (a, ch) in enumerate(ayat):
        p = plan.get(('ayah', k))
        if isinstance(p, dict) and p['type'] == 'askip':
            continue
        seq = list(ch)
        if isinstance(p, tuple):
            ev, pre, other = p
            seq = list(ch[:pre]) + [Chunk(o.x, o.src, 'extra', None, o.text) for o in other[pre:]]
        out = []
        i = 0
        while i < len(seq):
            c = seq[i]
            ev = plan.get((k, i)) if not isinstance(p, tuple) else None
            if ev is None:
                out.append(c)
            elif ev['type'] == 'del':
                pass
            elif ev['type'] == 'sub':
                o = ev['_chunk']
                out.append(Chunk(o.x, o.src, 'extra', None, o.text))
            elif ev['type'] == 'ins':
                o = ev['_chunk']
                out.append(c)
                out.append(Chunk(o.x, o.src, 'extra', None, o.text))
            elif ev['type'] == 'swap':
                out.append(seq[i + 1])
                out.append(c)
                i += 1
            elif ev['type'] == 'back':
                out.append(c)
                out.append(Chunk(silence(rng.uniform(0.25, 0.6)), None, 'pad'))
                start = i - (ev['to'] - ev['from'])
                out.extend(seq[start:i + 1])
            i += 1
        chunks.extend(out)
        if isinstance(p, dict) and p['type'] == 'again':
            chunks.append(Chunk(silence(rng.uniform(0.6, 1.2)), None, 'pad'))
            chunks.extend(seq)
        chunks.append(Chunk(silence(rng.uniform(0.6, 1.3)), None, 'pad'))

    parts = join(chunks)
    t = 0.0
    timeline = []
    for c, x in zip(chunks, parts):
        d = len(x) / SR
        if c.role in ('word', 'extra'):
            timeline.append({'word': c.word, 'text': c.text, 'start': round(t, 3), 'end': round(t + d, 3),
                             'extra': c.role == 'extra'})
        t += d
    x = np.concatenate(parts).astype(np.float32)

    # Ground truth per mushaf word of the passage.
    labels = {}
    for w in range(lo, hi):
        labels[w] = {'label': 'ok'}
    for ev in events:
        for w in ev.get('words', []):
            labels[w] = {'label': ev['type'], 'event': ev['id']}
        ev.pop('_chunk', None)
    seen = {}
    for seg in timeline:
        if seg['word'] is not None and seg['word'] not in seen:
            seen[seg['word']] = seg
    # A word left out "happens" where it would have been said: at the end of the word before it.
    prev_end = 0.0
    for w in range(lo, hi):
        if w in seen:
            labels[w]['start'] = seen[w]['start']
            labels[w]['end'] = seen[w]['end']
            prev_end = seen[w]['end']
        else:
            labels[w]['start'] = labels[w]['end'] = prev_end
    return x, {'range': [lo, hi], 'sura': s, 'ayat': [a0, a1], 'events': events, 'timeline': timeline,
               'labels': {str(w): v for w, v in labels.items()}}


def pink(n, rng):
    # Voss-McCartney-ish pink noise via filtering white noise in the frequency domain.
    white = rng.standard_normal(n)
    f = np.fft.rfft(white)
    scale = 1 / np.sqrt(np.maximum(1, np.arange(len(f))))
    y = np.fft.irfft(f * scale, n)
    return (y / (np.std(y) + 1e-9)).astype(np.float32)


def active_rms(x):
    frame = int(0.03 * SR)
    n = len(x) // frame
    if n == 0:
        return float(np.sqrt(np.mean(x ** 2)) + 1e-9)
    e = np.sqrt(np.mean(x[: n * frame].reshape(n, frame) ** 2, axis=1))
    loud = e[e > np.max(e) * 0.1]
    return float(np.sqrt(np.mean(loud ** 2)) + 1e-9)


def add_noise(x, snr_db, babble_sources, rng):
    n = len(x)
    noise = np.zeros(n, dtype=np.float32)
    for src in babble_sources:
        if len(src) == 0:
            continue
        off = rng.randrange(0, max(1, len(src)))
        rep = np.resize(np.roll(src, -off), n)
        noise += rep / (active_rms(rep) + 1e-9)
    if babble_sources:
        noise /= np.sqrt(len(babble_sources))
    noise = 0.7 * noise / (np.std(noise) + 1e-9) + 0.5 * pink(n, np.random.default_rng(rng.randrange(1 << 30)))
    target = active_rms(x) / (10 ** (snr_db / 20))
    y = x + noise * (target / (np.std(noise) + 1e-9))
    peak = np.max(np.abs(y))
    return (y / peak * 0.9 if peak > 0.99 else y).astype(np.float32)


def floor_noise(x, rng):
    # A quiet room: pink noise at about -62 dBFS, so the segmenter sees a real noise floor.
    return (x + pink(len(x), np.random.default_rng(rng.randrange(1 << 30))) * 10 ** (-62 / 20)).astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/bench-v0'))
    ap.add_argument('--cache', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/cache/qurancom'))
    ap.add_argument('--reciters', default='2,1,3,6,7,9,10,5')
    ap.add_argument('--passages', default=','.join(PASSAGES))
    ap.add_argument('--conditions', default='clean,babble10')
    ap.add_argument('--seed', type=int, default=7)
    ap.add_argument('--short', type=int, default=0,
                    help='instead of whole passages: this many short ranges (1-3 ayat, starting mid-passage) '
                         'per reciter and passage, as someone who memorized only those ayat would recite them')
    args = ap.parse_args()

    words = Words()
    out = pathlib.Path(args.out)
    (out / 'items').mkdir(parents=True, exist_ok=True)
    reciters = [int(r) for r in args.reciters.split(',')]
    passages = args.passages.split(',')
    conditions = args.conditions.split(',')
    index = []
    babble_pool = []
    built = []
    def ranges(p):
        """(name, (sura, first, last)) for the whole passage, or --short ranges of it."""
        s_, a0, a1 = PASSAGES[p]
        if not args.short:
            return [(p, PASSAGES[p])]
        out_ = []
        pick = random.Random(f'{args.seed}-{p}-short')
        for _ in range(args.short * 4):
            if len(out_) == args.short:
                break
            first = pick.randint(min(a0 + 1, a1), a1)
            last = first
            # 1-3 ayat, but at least 6 words (an ayah like يس is one word)
            while last < a1 and (last - first < pick.choice([0, 1, 2]) or
                                 sum(words.counts[words.vindex[(s_, a)]] for a in range(first, last + 1)) < 6):
                last += 1
            if sum(words.counts[words.vindex[(s_, a)]] for a in range(first, last + 1)) < 6:
                continue
            name = f'{p}s{first}-{last}'
            if name not in [n for n, _ in out_]:
                out_.append((name, (s_, first, last)))
        return out_

    for r in reciters:
        audio = Audio(args.cache, r)
        for p0 in passages:
            for p, rng_passage in ranges(p0):
              for variant in ('clean', 'm1'):
                rng = random.Random(f'{args.seed}-{r}-{p}-{variant}')
                got = build_item(words, audio, rng_passage, rng, mistakes=variant != 'clean',
                                 lead=1 if args.short else 4)
                if got is None:
                    log(f'skip {RECITERS[r]} {p}: timings missing or not word for word')
                    break
                x, truth = got
                if args.short:
                    # memorized only these ayat: the app stops at the last one (ayah-level memorization)
                    # and, knowing where they start, listens from the first memorized word
                    truth['stop_at'] = truth['range'][1]
                    truth['start_at'] = truth['range'][0]
                    truth['span'] = 'short'
                base = f'{RECITERS[r]}.{p}.{variant}'
                built.append((base, r, p, variant, x, truth))
                if variant == 'clean':
                    babble_pool.append((r, x))
                log(f'built {base}: {len(x) / SR:.1f} s, {len(truth["events"])} events')

    for base, r, p, variant, x, truth in built:
        for cond in conditions:
            rng = random.Random(f'{args.seed}-{base}-{cond}')
            if cond == 'clean':
                y = floor_noise(x, rng)
            elif cond.startswith('babble'):
                snr = float(cond[len('babble'):])
                others = [bx for br, bx in babble_pool if br != r]
                rng.shuffle(others)
                y = add_noise(x, snr, others[:5], rng)
            else:
                raise SystemExit(f'unknown condition {cond}')
            item = f'{base}.{cond}'
            pcm = np.clip(y * 32767, -32768, 32767).astype(np.int16)
            sf.write(out / 'items' / f'{item}.wav', pcm, SR, subtype='PCM_16')
            meta = {'id': item, 'reciter': RECITERS[r], 'recitation': r, 'passage': p, 'variant': variant,
                    'condition': cond, 'duration': round(len(y) / SR, 2),
                    'sha1': hashlib.sha1(pcm.tobytes()).hexdigest(), **truth}
            (out / 'items' / f'{item}.json').write_text(json.dumps(meta, ensure_ascii=False))
            index.append({k: meta[k] for k in ('id', 'reciter', 'passage', 'variant', 'condition', 'duration')})
    # keep the entries of conditions not rebuilt this time
    old_index = json.loads((out / 'index.json').read_text()) if (out / 'index.json').exists() else []
    ids = {i['id'] for i in index}
    index = [i for i in old_index if i['id'] not in ids] + index
    (out / 'index.json').write_text(json.dumps(index, indent=1, ensure_ascii=False))
    total = sum(i['duration'] for i in index)
    log(f'{len(index)} items, {total / 3600:.2f} h, in {out}')


if __name__ == '__main__':
    main()
