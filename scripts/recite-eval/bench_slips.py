#!/usr/bin/env python3
"""What memorizers do that isn't a mistake (the teacher review, Nov 14 2026; Majd approved Nov 15): bench-v0's passages
with hesitations, long pauses and corrections planted, and the correct recitation sped up (hadr). From audio bench.py
has already cached (nothing is fetched). None of these should be marked:
  hes    the next word's start (0.12-0.3 s of it), a pause of 0.8-2 s, then the word from its start
  pause  3-8 s of silence mid-ayah, then carry on
  corr   a word said as another word of the reciter, a short pause, back 2-4 words, said right
  hadr   the correct passage at 1.3x and 1.6x with the pitch kept (ffmpeg atempo), and at 1.0x through the same
         processing (0.8x then 1.25x) as the control, so the processing's own cost is told from the speed's
Items: <reciter>.<passage>.slips.clean (events hes / pause / corr, `mistake: false`) and <reciter>.<passage>.hadr{10,13,16}.clean.

  python bench_slips.py [--out DIR]
"""
import argparse
import hashlib
import json
import pathlib
import random
import subprocess
import sys

import numpy as np
import soundfile as sf

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import bench  # noqa: E402
from bench import SR, Audio, Chunk, Words, ayah_chunks, floor_noise, join, normalize, silence  # noqa: E402
from bench_endings import no_fetch  # noqa: E402

PLAN = ['hes', 'hes', 'pause', 'corr', 'corr']
LEAD = 4


def build(words, audio, passage, rng):
    s, a0, a1 = passage
    ayat = []
    for a in range(a0, a1 + 1):
        ch = ayah_chunks(words, audio, s, a)
        if ch is None:
            return None
        ayat.append((a, ch))
    lo = words.first_word(s, a0)
    hi = words.first_word(s, a1) + words.counts[words.vindex[(s, a1)]]
    flat = [(k, i) for k, (_, ch) in enumerate(ayat) for i in range(len(ch))]
    pool = [c for _, ch in ayat for c in ch]
    plan, taken, events = {}, set(), []
    for kind in PLAN:
        for _ in range(60):
            j = rng.randrange(LEAD, len(flat) - 2)
            k, i = flat[j]
            if any(abs(j - t) < 6 for t in taken) or i == 0 and kind != 'pause':
                continue
            c = ayat[k][1][i]
            if any(getattr(x, 'approx', False) for x in ayat[k][1][max(0, i - 4):i + 2]):
                continue
            ev = {'id': len(events), 'type': kind, 'at': c.word, 'words': [], 'mistake': False}
            if kind == 'corr':
                back = rng.randint(2, 4)
                if i - back + 1 < 0:
                    continue
                near = {normalize(x.text) for x in pool if abs(x.word - c.word) <= 2}
                opts = [x for x in pool if normalize(x.text) not in near and len(normalize(x.text)) >= 3
                        and not getattr(x, 'approx', False) and 0.6 < len(x.x) / max(1, len(c.x)) < 1.6]
                if not opts:
                    continue
                o = rng.choice(opts)
                ev.update(heard=o.text, back=back)
                ev['_chunk'] = o
            taken.add(j)
            plan[(k, i)] = ev
            events.append(ev)
            break
    chunks = [Chunk(silence(rng.uniform(0.6, 1.0)), None, 'pad')]
    for k, (a, ch) in enumerate(ayat):
        out = []
        for i, c in enumerate(ch):
            ev = plan.get((k, i))
            if ev is None:
                out.append(c)
            elif ev['type'] == 'hes':
                n = int(min(max(0.12, 0.35 * len(c.x) / SR), 0.3) * SR)
                out.append(Chunk(c.x[:n], None, 'extra', None, None))
                out.append(Chunk(silence(rng.uniform(0.8, 2.0)), None, 'pad'))
                out.append(c)
            elif ev['type'] == 'pause':
                out.append(Chunk(silence(rng.uniform(3.0, 8.0)), None, 'pad'))
                out.append(c)
            elif ev['type'] == 'corr':
                o = ev.pop('_chunk')
                out.append(Chunk(o.x, o.src, 'extra', None, o.text))
                out.append(Chunk(silence(rng.uniform(0.3, 0.6)), None, 'pad'))
                out.extend(ch[i - ev['back'] + 1:i + 1])
        chunks.extend(out)
        chunks.append(Chunk(silence(rng.uniform(0.6, 1.3)), None, 'pad'))
    parts = join(chunks)
    t, timeline = 0.0, []
    for c, x in zip(chunks, parts):
        d = len(x) / SR
        if c.role in ('word', 'extra'):
            timeline.append({'word': c.word, 'text': c.text, 'start': round(t, 3), 'end': round(t + d, 3),
                             'extra': c.role == 'extra'})
        t += d
    labels = {str(w): {'label': 'ok'} for w in range(lo, hi)}
    clean = np.concatenate(join([Chunk(silence(0.8), None, 'pad')] + [c for _, ch in ayat for c in ch + [
        Chunk(silence(0.9), None, 'pad')]])).astype(np.float32)
    return (np.concatenate(parts).astype(np.float32),
            {'range': [lo, hi], 'sura': s, 'ayat': [a0, a1], 'events': events, 'timeline': timeline, 'labels': labels},
            clean, {'range': [lo, hi], 'sura': s, 'ayat': [a0, a1], 'events': [], 'labels': labels})


def stretch(x, filters):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-filter:a',
                          filters, '-f', 'f32le', '-'], input=x.astype(np.float32).tobytes(), capture_output=True,
                         check=True).stdout
    return np.frombuffer(raw, np.float32).copy()


def write(out, item, y, meta, rng):
    y = floor_noise(y, rng)
    pcm = np.clip(y * 32767, -32768, 32767).astype(np.int16)
    sf.write(out / 'items' / f'{item}.wav', pcm, SR, subtype='PCM_16')
    meta = dict(meta, id=item, condition='clean', duration=round(len(y) / SR, 2),
                sha1=hashlib.sha1(pcm.tobytes()).hexdigest())
    (out / 'items' / f'{item}.json').write_text(json.dumps(meta, ensure_ascii=False))
    return {k: meta[k] for k in ('id', 'reciter', 'passage', 'variant', 'condition', 'duration')}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/bench-slips'))
    ap.add_argument('--cache', default=str(pathlib.Path.home() / 'revisely-mistake-lab/data/cache/qurancom'))
    ap.add_argument('--reciters', default='2,1,3,6,7,9,10,5')
    ap.add_argument('--seed', type=int, default=13)
    args = ap.parse_args()
    bench.fetch = no_fetch
    words = Words()
    out = pathlib.Path(args.out)
    (out / 'items').mkdir(parents=True, exist_ok=True)
    index = []
    for r in [int(x) for x in args.reciters.split(',')]:
        audio = Audio(args.cache, r)
        for p, passage in bench.PASSAGES.items():
            rng = random.Random(f'{args.seed}-{r}-{p}')
            try:
                got = build(words, audio, passage, rng)
            except FileNotFoundError as e:
                bench.log(f'skip {bench.RECITERS[r]} {p}: {e}')
                continue
            if got is None:
                bench.log(f'skip {bench.RECITERS[r]} {p}: timings missing')
                continue
            x, truth, clean, ctruth = got
            base = {'reciter': bench.RECITERS[r], 'recitation': r, 'passage': p}
            index.append(write(out, f'{bench.RECITERS[r]}.{p}.slips.clean', x, dict(base, variant='slips', **truth), rng))
            for tag, filt in (('hadr10', 'atempo=0.8,atempo=1.25'), ('hadr13', 'atempo=1.3'), ('hadr16', 'atempo=1.6')):
                index.append(write(out, f'{bench.RECITERS[r]}.{p}.{tag}.clean', stretch(clean, filt),
                                   dict(base, variant=tag, **ctruth), rng))
            bench.log(f'built {bench.RECITERS[r]} {p}: {len(truth["events"])} slips + 3 hadr')
    (out / 'index.json').write_text(json.dumps(index, indent=1, ensure_ascii=False))
    bench.log(f'{len(index)} items, {sum(i["duration"] for i in index) / 60:.1f} min')


if __name__ == '__main__':
    main()
